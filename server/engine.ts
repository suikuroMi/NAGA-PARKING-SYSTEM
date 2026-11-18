import { randomUUID } from 'node:crypto'
import type { AdminAuth, Attendant, Category, DigitalProvider, KioskClaim, Rate, Session, Settings, Slot, SlotStatus, State, Transaction } from '../store/types'
import { END_REASONS, EXIT_VOID_REASONS, REFUND_REASONS, VOID_REASONS } from '../store/types'
import { buildSeed } from '../store/seed'
import { calcFee, minutesOf, normalizeTicket, refundedOf, slotShort, ticketId, txnId } from '../store/logic'
import { fmtPHP } from '../lib/format'
import { checkPin, credentials } from './credentials'
import { isValidPin, isWeakPin } from '../lib/pin'
import { centavos } from '../lib/money'

/** One engine per database transaction; no shared process-wide mutable state. */
export function createEngine(initial: State, KIOSK_ID: string) {
  let state = initial
  const now = () => Date.now()
  const uid = () => randomUUID()
  const fresh = () => state
  const write = (next: State) => { state = next }
  const CLAIM_TTL_MS = 3 * 60000
function log(s: State, event: string, ref: string, result: string, actor?: string): State {
  return { ...s, activity: [{ id: uid(), at: now(), event, ref, result, actor }, ...s.activity] }
}

const KIOSK = 'Kiosk E1'
const ADMIN = 'Administrator'

function patchSlot(slots: Slot[], id: string, patch: Partial<Slot>) {
  return slots.map((s) => (s.id === id ? { ...s, ...patch } : s))
}

/* ---------------- Entrance kiosk ---------------- */


function isStale(c: KioskClaim) {
  return now() - c.at > CLAIM_TTL_MS
}

function releaseClaimsWhere(s: State, pred: (c: KioskClaim) => boolean): State {
  const drop = s.claims.filter(pred)
  if (!drop.length) return s
  let slots = s.slots
  for (const c of drop) {
    const slot = slots.find((x) => x.id === c.slotId)
    if (slot?.status === 'claimed') slots = patchSlot(slots, c.slotId, { status: 'available', reason: 'Eligible for assignment' })
  }
  return { ...s, claims: s.claims.filter((c) => !pred(c)), slots }
}

function sweepClaims(s: State) {
  return releaseClaimsWhere(s, isStale)
}


function availableFor(cat: Category, s: State = state) {
  return s.slots.filter((x) => x.category === cat && x.status === 'available')
}

/** Atomically claims the nearest compatible available space for this kiosk. */
function claimSlot(cat: Category) {
  let s = releaseClaimsWhere(fresh(), (c) => c.kioskId === KIOSK_ID || isStale(c))
  const slot = availableFor(cat, s).sort((a, b) => a.block.localeCompare(b.block) || a.number - b.number)[0]
  if (!slot) {
    write(s)
    return null
  }
  const t = now()
  // The ticket number is reserved at claim time so concurrent kiosks never share an ID.
  const claim: KioskClaim = { kioskId: KIOSK_ID, slotId: slot.id, ticketId: ticketId(s.nextTicket, t), category: cat, at: t }
  s = {
    ...s,
    nextTicket: s.nextTicket + 1,
    claims: [...s.claims, claim],
    slots: patchSlot(s.slots, slot.id, { status: 'claimed', reason: 'Kiosk claim · issuing ticket' }),
  }
  write(s)
  return claim
}

function releaseClaim() {
  const s = fresh()
  const next = releaseClaimsWhere(s, (c) => c.kioskId === KIOSK_ID)
  if (next !== s) write(next)
}

function issueTicket(): Session | null {
  const s0 = fresh()
  const c = s0.claims.find((x) => x.kioskId === KIOSK_ID)
  if (!c) return null
  const slot = s0.slots.find((x) => x.id === c.slotId)
  if (!slot || slot.status !== 'claimed') return null
  if (isStale(c)) { releaseClaim(); return null }
  const session: Session = {
    ticketId: c.ticketId,
    category: c.category,
    slotId: c.slotId,
    entry: now(),
    rateVersion: s0.rates.version,
    rate: s0.rates.categories[c.category],
    grace: s0.rates.grace,
    status: 'active',
  }
  let s: State = {
    ...s0,
    claims: s0.claims.filter((x) => x !== c),
    lastIssued: session.ticketId,
    sessions: { ...s0.sessions, [session.ticketId]: session },
    slots: patchSlot(s0.slots, c.slotId, { status: 'occupied', ticketId: session.ticketId, reason: 'Active-session lock' }),
  }
  s = log(s, 'Ticket issued', session.ticketId, `${session.category} · ${slotShort(slot)} occupied`, KIOSK)
  write(s)
  return session
}

/* ---------------- Sign-in & lockout ---------------- */

const TERMINAL = { name: 'Terminal 01', lane: 'Lane A' as const }

const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 60000

type AuthResult = { ok: true } | { ok: false; error: 'wrong' | 'locked' | 'disabled' | 'weak' | 'mismatch' | 'same'; attemptsLeft?: number; retryAt?: number }

type Credential = { pinHash: string; pinSalt: string; failedAttempts: number; lockedUntil?: number }

/** Checks a PIN against a credential, applying the shared 5-tries / 60-second lockout. */
function attempt<C extends Credential>(c: C, pin: string): { next: C; result: AuthResult; lockedNow: boolean } {
  const t = now()
  if (c.lockedUntil && c.lockedUntil > t) return { next: c, result: { ok: false, error: 'locked', retryAt: c.lockedUntil }, lockedNow: false }
  if (checkPin(pin, c.pinSalt, c.pinHash)) return { next: { ...c, failedAttempts: 0, lockedUntil: undefined }, result: { ok: true }, lockedNow: false }
  const failed = (c.lockedUntil && c.lockedUntil <= t ? 0 : c.failedAttempts) + 1
  if (failed >= MAX_ATTEMPTS) {
    const retryAt = t + LOCKOUT_MS
    return { next: { ...c, failedAttempts: 0, lockedUntil: retryAt }, result: { ok: false, error: 'locked', retryAt }, lockedNow: true }
  }
  return { next: { ...c, failedAttempts: failed, lockedUntil: undefined }, result: { ok: false, error: 'wrong', attemptsLeft: MAX_ATTEMPTS - failed }, lockedNow: false }
}

function patchAttendant(s: State, id: string, patch: Partial<Attendant>): State {
  return { ...s, attendants: s.attendants.map((a) => (a.id === id ? { ...a, ...patch } : a)) }
}

/** The attendant holding the terminal, or null when nobody valid is signed in. */
function exitAttendant(s: State): Attendant | null {
  if (!s.exitSession) return null
  const a = s.attendants.find((x) => x.id === s.exitSession!.attendantId)
  return a && a.status !== 'Disabled' ? a : null
}

/** True when the terminal is signed in, unlocked and past any forced PIN change. */
function canOperate(s: State) {
  const a = exitAttendant(s)
  return !!a && !!s.exitSession && !s.exitSession.locked && !a.mustChangePin
}


const pinRules = (pin: string): AuthResult | null => (!isValidPin(pin) || isWeakPin(pin) ? { ok: false, error: 'weak' } : null)

/* ---------------- Exit terminal ---------------- */

function signInExit(attendantId: string, pin: string): AuthResult {
  const s0 = fresh()
  const a = s0.attendants.find((x) => x.id === attendantId)
  if (!a) return { ok: false, error: 'wrong' }
  if (a.status === 'Disabled') return { ok: false, error: 'disabled' }
  const { next, result, lockedNow } = attempt(a, pin)
  let s = patchAttendant(s0, a.id, next)
  if (!result.ok) {
    write(lockedNow ? log(s, 'Sign-in locked', a.name, '5 wrong PINs · 60-second lock', a.name) : s)
    return result
  }
  const t = now()
  const prev = exitAttendant(s)
  if (prev && prev.id !== a.id) {
    s = patchAttendant(s, prev.id, { status: 'Offline' })
    s = log(s, 'Terminal handover', TERMINAL.name, `${prev.name} → ${a.name}`, a.name)
  }
  s = { ...s, exitSession: { attendantId: a.id, since: prev?.id === a.id ? s.exitSession!.since : t, lastActive: t, locked: null } }
  s = patchAttendant(s, a.id, a.mustChangePin ? { lastAccess: t } : { status: 'Active', lastAccess: t })
  s = log(s, 'Attendant signed in', TERMINAL.name, a.mustChangePin ? 'Temporary PIN · change required' : `Exit attendant · ${a.lane}`, a.name)
  write(s)
  return { ok: true }
}

/** First sign-in (or after a reset): replaces the temporary PIN. */
function setOwnPin(newPin: string): AuthResult {
  const s0 = fresh()
  const a = exitAttendant(s0)
  if (!a || !a.mustChangePin) return { ok: false, error: 'wrong' }
  const weak = pinRules(newPin)
  if (weak) return weak
  if (checkPin(newPin, a.pinSalt, a.pinHash)) return { ok: false, error: 'same' }
  let s = patchAttendant(s0, a.id, { ...credentials(newPin), mustChangePin: false, failedAttempts: 0, lockedUntil: undefined, status: 'Active', lastAccess: now() })
  s = log(s, 'PIN changed', a.name, 'Personal PIN set · account active', a.name)
  write(s)
  return { ok: true }
}

function lockExit(reason: 'idle' | 'manual') {
  const s0 = fresh()
  if (!s0.exitSession || s0.exitSession.locked) return
  write({ ...s0, exitSession: { ...s0.exitSession, locked: reason } })
}

function startBreak() {
  const s0 = fresh()
  const a = exitAttendant(s0)
  if (!a || !s0.exitSession) return
  let s: State = { ...s0, exitSession: { ...s0.exitSession, locked: 'break' } }
  s = patchAttendant(s, a.id, { status: 'On break' })
  write(log(s, 'Break started', TERMINAL.name, 'Terminal locked', a.name))
}

function unlockExit(pin: string): AuthResult {
  const s0 = fresh()
  const a = exitAttendant(s0)
  if (!a || !s0.exitSession) return { ok: false, error: 'wrong' }
  const { next, result, lockedNow } = attempt(a, pin)
  let s = patchAttendant(s0, a.id, next)
  if (!result.ok) {
    write(lockedNow ? log(s, 'Sign-in locked', a.name, '5 wrong PINs · 60-second lock', a.name) : s)
    return result
  }
  const wasBreak = s0.exitSession.locked === 'break'
  const t = now()
  s = { ...s, exitSession: { ...s0.exitSession, locked: null, lastActive: t } }
  s = patchAttendant(s, a.id, { status: a.mustChangePin ? a.status : 'Active', lastAccess: t })
  if (wasBreak) s = log(s, 'Break ended', TERMINAL.name, 'Terminal unlocked', a.name)
  write(s)
  return { ok: true }
}

/** Refuses while a checkout is open so the attendant completes or cancels it first. */
function signOutExit() {
  const s0 = fresh()
  const a = exitAttendant(s0)
  if (!s0.exitSession || s0.checkout) return false
  let s: State = { ...s0, exitSession: null }
  if (a) s = log(patchAttendant(s, a.id, { status: a.mustChangePin ? 'Pending' : 'Offline', lastAccess: now() }), 'Attendant signed out', TERMINAL.name, 'Terminal available', a.name)
  write(s)
  return true
}

let lastTouch = 0
/** Records terminal activity (throttled) so auto-lock follows use in any exit tab. */
function touchExit() {
  const t = now()
  if (t - lastTouch < 30000) return
  const s0 = fresh()
  if (!s0.exitSession || s0.exitSession.locked) return
  lastTouch = t
  write({ ...s0, exitSession: { ...s0.exitSession, lastActive: t } })
}

type LookupResult = { kind: 'invalid' | 'paid' | 'duplicate' | 'found' | 'ended'; id: string }

function lookupTicket(query: string): LookupResult {
  const s0 = fresh()
  const id = normalizeTicket(query, s0.sessions)
  if (!canOperate(s0)) return { kind: 'invalid', id }
  const who = exitAttendant(s0)!.name
  const session = s0.sessions[id]
  if (!session) {
    write(log(s0, 'Invalid ticket scanned', id || '—', 'No session · no charge', who))
    return { kind: 'invalid', id }
  }
  if (session.status === 'completed') return { kind: 'paid', id }
  if (session.status === 'closed') return { kind: 'ended', id }
  if (s0.checkout?.ticketId === id) return { kind: 'duplicate', id }
  const t = now()
  let s: State = {
    ...s0,
    checkout: { ticketId: id, openedAt: t, exitAt: t, terminal: TERMINAL.name, attendant: who },
  }
  s = log(s, 'Checkout under review', id, `Active · ${session.slotId} occupied`, who)
  write(s)
  return { kind: 'found', id }
}

function cancelCheckout() {
  const s = fresh()
  const c = s.checkout
  if (!c || !canOperate(s)) return
  write(log({ ...s, checkout: null }, 'Checkout cancelled', c.ticketId, 'No charge · session stays active', exitAttendant(s)!.name))
}

function quoteFor(session: Session, exitAt: number, lost = false) {
  const minutes = minutesOf(session.entry, exitAt)
  return { minutes, ...calcFee(session.rate, minutes, session.grace, lost) }
}

type PaymentInput = { method: 'Cash'; tender: number } | { method: 'Digital'; provider: DigitalProvider; reference: string }

const normalizeReference = (r: string) => r.replace(/[\s-]+/g, '').toUpperCase()
const isValidReference = (r: string) => /^[A-Z0-9]{6,20}$/.test(normalizeReference(r))
const maskReference = (r: string) => `••${r.slice(-4)}`

function completePayment(id: string, input: PaymentInput) {
  const s0 = fresh()
  const session = s0.sessions[id]
  const c = s0.checkout
  if (!session || session.status !== 'active' || !c || c.ticketId !== id || !canOperate(s0)) return null
  // Credit whoever completes the payment (the terminal may have been handed over mid-checkout).
  const who = exitAttendant(s0)!.name
  const q = quoteFor(session, c.exitAt, !!c.lostTicket)
  const lostFee = c.lostTicket ? { lostTicketFee: q.lostFee } : {}
  let tender: number
  let digital: { provider?: DigitalProvider; reference?: string } = {}
  if (input.method === 'Cash') {
    if (!(input.tender >= q.total)) return null
    tender = input.tender
  } else {
    if (!isValidReference(input.reference)) return null
    tender = q.total
    digital = { provider: input.provider, reference: normalizeReference(input.reference) }
  }
  const t = now()
  const tx: Transaction = {
    id: txnId(s0.nextTxn, t),
    paidAt: t,
    ticketId: id,
    category: session.category,
    slotId: session.slotId,
    entry: session.entry,
    exit: c.exitAt,
    minutes: q.minutes,
    amount: q.total,
    method: input.method,
    tender,
    change: (centavos(tender) - centavos(q.total)) / 100,
    ...digital,
    ...lostFee,
    attendant: who,
  }
  const done: Session = {
    ...session,
    status: 'completed',
    exit: c.exitAt,
    payment: { amount: q.total, method: input.method, tender, change: tx.change, ...digital, ...lostFee, attendant: who, paidAt: t, transactionId: tx.id },
  }
  let s: State = {
    ...s0,
    checkout: null,
    lastCompleted: id,
    nextTxn: s0.nextTxn + 1,
    transactions: [tx, ...s0.transactions],
    sessions: { ...s0.sessions, [id]: done },
    slots: patchSlot(s0.slots, session.slotId, { status: 'available', ticketId: undefined, reason: 'Eligible for assignment' }),
    attendants: s0.attendants.map((a) => (a.name === who ? { ...a, lastAccess: t } : a)),
  }
  const via = digital.provider ? ` · ${digital.provider} ref ${maskReference(digital.reference!)}` : ''
  s = log(s, c.lostTicket ? 'Lost-ticket payment confirmed' : `${input.method} payment confirmed`, id, `${fmtPHP(q.total)}${via} · ${session.slotId} released`, who)
  write(s)
  return tx
}

/* ---------------- Exceptions ---------------- */

type ActionResult = AuthResult | { ok: false; error: 'not-allowed'; message: string }
const notAllowed = (message: string): ActionResult => ({ ok: false, error: 'not-allowed', message })

/** Exit override window after a payment. */
const OVERRIDE_WINDOW_MS = 15 * 60000

/** Validates the admin PIN for a sensitive action (shared lockout, no sign-in log). */
function authorizeAdmin(s0: State, pin: string): { s: State; result: AuthResult } {
  const { next, result, lockedNow } = attempt<AdminAuth>(s0.admin, pin)
  let s: State = { ...s0, admin: next }
  if (lockedNow) s = log(s, 'Sign-in locked', 'Admin PIN', '5 wrong PINs · 60-second lock', ADMIN)
  return { s, result }
}

/** "Other" needs a note; every action needs a reason from its list. */
function reasonError(reason: string, list: readonly string[], note?: string): string | null {
  if (!list.includes(reason)) return 'Choose a reason'
  if (reason === 'Other' && (note ?? '').trim().length < 5) return "Add a note for 'Other' (at least 5 characters)"
  return null
}

const cleanNote = (note?: string) => (note && note.trim() ? note.trim() : undefined)

/** Opens (or converts) a checkout for a driver who lost their ticket. */
function openLostCheckout(ticketId: string): LookupResult | { kind: 'not-allowed'; id: string; message: string } {
  const s0 = fresh()
  if (!canOperate(s0)) return { kind: 'not-allowed', id: ticketId, message: 'Sign in to the terminal first.' }
  const session = s0.sessions[ticketId]
  if (!session || session.status !== 'active') return { kind: 'not-allowed', id: ticketId, message: 'Only active sessions can be matched.' }
  const who = exitAttendant(s0)!.name
  const t = now()
  const checkout =
    s0.checkout?.ticketId === ticketId ? { ...s0.checkout, lostTicket: true } : { ticketId, openedAt: t, exitAt: t, terminal: TERMINAL.name, attendant: who, lostTicket: true }
  const fee = session.rate.lostFee ?? 0
  write(log({ ...s0, checkout }, 'Lost-ticket checkout', ticketId, `${session.slotId} · lost-ticket fee ${fmtPHP(fee)}`, who))
  return { kind: 'found', id: ticketId }
}

/** Whether the exit supervisor override can void this transaction right now. */
function overrideBlocker(s: State, tx: Transaction): string | null {
  const session = s.sessions[tx.ticketId]
  if (tx.voided || tx.refunds?.length) return 'This payment already has a correction.'
  if (!session || session.status !== 'completed' || session.payment?.transactionId !== tx.id) return 'This payment is not the latest for its session.'
  if (now() - session.payment.paidAt > OVERRIDE_WINDOW_MS) return 'The 15-minute override window has passed. Ask an administrator to correct it.'
  const slot = s.slots.find((x) => x.id === session.slotId)
  if (slot?.status !== 'available') return `Space ${session.slotId} has been reassigned, so the session can't be reopened.`
  if (s.checkout) return 'Another checkout is open at the terminal.'
  return null
}

/** Supervisor override at the exit: voids a just-made payment and reopens its checkout. */
function voidAndReopen(txId: string, reason: string, note: string, pin: string): ActionResult {
  const s0 = fresh()
  const tx = s0.transactions.find((x) => x.id === txId)
  if (!canOperate(s0) || !tx) return notAllowed('Sign in to the terminal first.')
  const blocked = overrideBlocker(s0, tx)
  if (blocked) return notAllowed(blocked)
  const bad = reasonError(reason, EXIT_VOID_REASONS, note)
  if (bad) return notAllowed(bad)
  const auth = authorizeAdmin(s0, pin)
  if (!auth.result.ok) {
    write(auth.s)
    return auth.result
  }
  let s = auth.s
  const a = exitAttendant(s)!
  const session = s.sessions[tx.ticketId]
  const t = now()
  const voided = { at: t, reason, note: cleanNote(note), by: `${a.name} · supervisor override` }
  const { payment: _p, exit: _e, ...rest } = session
  const reopened: Session = { ...rest, status: 'active' }
  s = {
    ...s,
    transactions: s.transactions.map((x) => (x.id === tx.id ? { ...x, voided } : x)),
    sessions: { ...s.sessions, [tx.ticketId]: reopened },
    slots: patchSlot(s.slots, session.slotId, { status: 'occupied', ticketId: tx.ticketId, reason: 'Active-session lock' }),
    checkout: { ticketId: tx.ticketId, openedAt: t, exitAt: tx.exit, terminal: TERMINAL.name, attendant: a.name, ...(tx.lostTicketFee ? { lostTicket: true } : {}) },
    lastCompleted: null,
  }
  write(log(s, 'Payment voided · checkout reopened', tx.ticketId, `${reason} · ${fmtPHP(tx.amount)} reversed`, voided.by))
  return { ok: true }
}

function voidTransaction(txId: string, reason: string, note: string, pin: string): ActionResult {
  const s0 = fresh()
  const tx = s0.transactions.find((x) => x.id === txId)
  if (!tx) return notAllowed('Transaction not found.')
  if (tx.voided) return notAllowed('This payment is already voided.')
  if (tx.refunds?.length) return notAllowed('Refunded payments cannot be voided.')
  const bad = reasonError(reason, VOID_REASONS, note)
  if (bad) return notAllowed(bad)
  const auth = authorizeAdmin(s0, pin)
  if (!auth.result.ok) {
    write(auth.s)
    return auth.result
  }
  const voided = { at: now(), reason, note: cleanNote(note), by: ADMIN }
  const s = { ...auth.s, transactions: auth.s.transactions.map((x) => (x.id === txId ? { ...x, voided } : x)) }
  write(log(s, 'Payment voided', tx.ticketId, `${reason} · ${fmtPHP(tx.amount)}`, ADMIN))
  return { ok: true }
}

function refundTransaction(txId: string, amount: number, reason: string, note: string, pin: string): ActionResult {
  const s0 = fresh()
  const tx = s0.transactions.find((x) => x.id === txId)
  if (!tx) return notAllowed('Transaction not found.')
  if (tx.voided) return notAllowed('Voided payments cannot be refunded.')
  const value = Math.round(amount * 100) / 100
  const remaining = Math.round((tx.amount - refundedOf(tx)) * 100) / 100
  if (!(value > 0) || value > remaining) return notAllowed(`Enter an amount between PHP 0.01 and ${fmtPHP(remaining, true)}.`)
  const bad = reasonError(reason, REFUND_REASONS, note)
  if (bad) return notAllowed(bad)
  const auth = authorizeAdmin(s0, pin)
  if (!auth.result.ok) {
    write(auth.s)
    return auth.result
  }
  const refund = { id: `RF-${uid()}`, at: now(), amount: value, reason, note: cleanNote(note), by: ADMIN }
  const s = { ...auth.s, transactions: auth.s.transactions.map((x) => (x.id === txId ? { ...x, refunds: [...(x.refunds ?? []), refund] } : x)) }
  write(log(s, 'Refund issued', tx.ticketId, `${fmtPHP(value, true)} · ${reason}`, ADMIN))
  return { ok: true }
}

/** Ends a stuck active session without payment; the fee owed is recorded as uncollected. */
function endSession(ticketId: string, reason: string, note: string, pin: string): ActionResult {
  const s0 = fresh()
  const session = s0.sessions[ticketId]
  if (!session || session.status !== 'active') return notAllowed('Only active sessions can be ended.')
  if (s0.checkout?.ticketId === ticketId) return notAllowed(`Checkout is open at ${TERMINAL.name}. Cancel it there first.`)
  const bad = reasonError(reason, END_REASONS, note)
  if (bad) return notAllowed(bad)
  const auth = authorizeAdmin(s0, pin)
  if (!auth.result.ok) {
    write(auth.s)
    return auth.result
  }
  const t = now()
  const q = quoteFor(session, t)
  const closed: Session = { ...session, status: 'closed', exit: t, closure: { at: t, reason, note: cleanNote(note), by: ADMIN, uncollected: q.total, minutes: q.minutes } }
  let s: State = {
    ...auth.s,
    sessions: { ...auth.s.sessions, [ticketId]: closed },
    slots: patchSlot(auth.s.slots, session.slotId, { status: 'available', ticketId: undefined, reason: 'Eligible for assignment' }),
  }
  s = log(s, 'Session ended by administrator', ticketId, `${reason} · ${fmtPHP(q.total)} uncollected`, ADMIN)
  write(s)
  return { ok: true }
}

/* ---------------- Administration ---------------- */

function updateSlot(id: string, patch: { status: SlotStatus; category: Category; reason: string }) {
  const s0 = fresh()
  const slot = s0.slots.find((x) => x.id === id)
  if (!slot || slot.status === 'occupied' || slot.status === 'claimed') return false
  let s: State = { ...s0, slots: patchSlot(s0.slots, id, patch) }
  const label = { available: 'Slot made available', reserved: 'Slot reserved', unavailable: 'Slot marked unavailable' } as Record<string, string>
  s = log(s, label[patch.status] ?? 'Slot updated', `Block ${slot.block} — Slot ${String(slot.number).padStart(2, '0')}`, patch.reason || patch.category, ADMIN)
  write(s)
  return true
}

function addSlots(block: string, category: Category, count: number) {
  const s0 = fresh()
  const b = block.trim().toUpperCase()
  const existing = s0.slots.filter((x) => x.block === b)
  const start = existing.reduce((m, x) => Math.max(m, x.number), 0)
  const added: Slot[] = Array.from({ length: count }, (_, i) => {
    const n = start + i + 1
    return { id: `${b}${String(n).padStart(2, '0')}`, block: b, number: n, category, status: 'available', reason: 'Eligible for assignment' }
  })
  write(log({ ...s0, slots: [...s0.slots, ...added] }, existing.length ? 'Slots added' : 'Block added', `Block ${b}`, `${count} ${category} space${count === 1 ? '' : 's'}`, ADMIN))
  return added
}

function saveRates(categories: Record<Category, Rate>, grace: number) {
  const s0 = fresh()
  const base = s0.rates.version.split('.r')[0]
  const rev = s0.rates.history.filter((h) => h.version.startsWith(base)).length + 1
  const version = `${base}.r${rev}`
  const t = now()
  write(
    log(
      {
        ...s0,
        rates: {
          ...s0.rates,
          version,
          effective: t,
          grace,
          categories,
          history: [{ version, effective: t, by: 'City parking administrator' }, ...s0.rates.history],
        },
      },
      'Rate version saved',
      version,
      'Applies to new sessions only',
      ADMIN,
    ),
  )
  return version
}

function addAttendant(a: { name: string; email: string; lane: Attendant['lane']; tempPin: string }) {
  const s0 = fresh()
  const id = `ATT-${String(s0.attendants.length + 1).padStart(3, '0')}`
  const account: Attendant = { id, name: a.name, email: a.email, lane: a.lane, status: 'Pending', mustChangePin: true, failedAttempts: 0, ...credentials(a.tempPin) }
  write(log({ ...s0, attendants: [...s0.attendants, account] }, 'Attendant account created', a.name, `Exit attendant · ${a.lane} · temporary PIN`, ADMIN))
}

function updateAttendant(id: string, patch: Pick<Attendant, 'lane'>) {
  const s0 = fresh()
  write(patchAttendant(s0, id, { lane: patch.lane }))
}

function resetAttendantPin(id: string, tempPin: string) {
  const s0 = fresh()
  const a = s0.attendants.find((x) => x.id === id)
  if (!a || !isValidPin(tempPin)) return false
  const signedIn = exitAttendant(s0)?.id === id
  const status = a.status === 'Disabled' ? 'Disabled' : signedIn ? a.status : 'Pending'
  let s = patchAttendant(s0, id, { ...credentials(tempPin), mustChangePin: true, failedAttempts: 0, lockedUntil: undefined, status })
  s = log(s, 'PIN reset', a.name, 'Temporary PIN · change at next sign-in', ADMIN)
  write(s)
  return true
}

function setAttendantDisabled(id: string, disabled: boolean) {
  const s0 = fresh()
  const a = s0.attendants.find((x) => x.id === id)
  if (!a) return
  let s = patchAttendant(s0, id, { status: disabled ? 'Disabled' : a.mustChangePin ? 'Pending' : 'Offline' })
  // A deactivated attendant loses the terminal; any open checkout stays for the next attendant.
  if (disabled && s.exitSession?.attendantId === id) s = { ...s, exitSession: null }
  s = log(s, disabled ? 'Account deactivated' : 'Account reactivated', a.name, disabled ? 'Sign-in blocked' : 'Sign-in allowed', ADMIN)
  write(s)
}

/** Admin override: signs the attendant out even with an open checkout (the checkout stays). */
function forceSignOutExit() {
  const s0 = fresh()
  const a = exitAttendant(s0)
  if (!s0.exitSession) return
  let s: State = { ...s0, exitSession: null }
  if (a) s = log(patchAttendant(s, a.id, { status: a.mustChangePin ? 'Pending' : 'Offline' }), 'Signed out by administrator', TERMINAL.name, a.name, ADMIN)
  write(s)
}

/* ---------------- Administrator ---------------- */

function verifyAdminPin(pin: string): AuthResult {
  const s0 = fresh()
  const { next, result, lockedNow } = attempt<AdminAuth>(s0.admin, pin)
  let s: State = { ...s0, admin: next }
  if (result.ok) s = log(s, 'Administrator signed in', 'Admin console', 'Management access', ADMIN)
  else if (lockedNow) s = log(s, 'Sign-in locked', 'Admin console', '5 wrong PINs · 60-second lock', ADMIN)
  write(s)
  return result
}

function changeAdminPin(current: string, next: string): AuthResult {
  const s0 = fresh()
  const r = attempt<AdminAuth>(s0.admin, current)
  if (!r.result.ok) {
    write({ ...s0, admin: r.next })
    return r.result
  }
  const weak = pinRules(next)
  if (weak) return weak
  if (next === current) return { ok: false, error: 'same' }
  write(log({ ...s0, admin: { ...credentials(next), failedAttempts: 0 } }, 'Administrator PIN changed', 'Admin console', 'New PIN active', ADMIN))
  return { ok: true }
}

function updateSettings(patch: Partial<Settings>) {
  const s0 = fresh()
  write({ ...s0, settings: { ...s0.settings, ...patch } })
}

function resetDemo() {
  write(buildSeed())
}

return { getState: () => state, sweep: () => write(sweepClaims(state)), availableFor, claimSlot, releaseClaim, issueTicket, exitAttendant, signInExit, setOwnPin, lockExit, startBreak, unlockExit, signOutExit, touchExit, lookupTicket, cancelCheckout, quoteFor, completePayment, reasonError, openLostCheckout, overrideBlocker, voidAndReopen, voidTransaction, refundTransaction, endSession, updateSlot, addSlots, saveRates, addAttendant, updateAttendant, resetAttendantPin, setAttendantDisabled, forceSignOutExit, verifyAdminPin, changeAdminPin, updateSettings, resetDemo }
}
