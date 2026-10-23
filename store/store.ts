import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Attendant, Category, Rate, Session, Settings, Slot, SlotStatus, State, Transaction } from './types'
import { buildSeed } from './seed'
import { calcFee, DEMO_START, minutesOf, normalizeTicket, slotShort, ticketId, txnId } from './logic'
import { fmtPHP } from '../lib/format'
import { api } from '../lib/api'

const KEY = 'nsp-demo-state-v1'
const CLOCK_KEY = 'nsp-demo-clock-v1'

function load(): State {
  if (typeof window === 'undefined') return buildSeed()
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as State
  } catch {
    /* ignore corrupt storage */
  }
  return buildSeed()
}

let realStart = typeof window !== 'undefined' ? Number(localStorage.getItem(CLOCK_KEY)) || Date.now() : Date.now()
if (typeof window !== 'undefined') {
  localStorage.setItem(CLOCK_KEY, String(realStart))
}

/** Demo clock: starts at 16 Oct 2026, 10:15 PM and advances in real time. */
export const now = () => DEMO_START + (Date.now() - realStart)

let state: State = load()
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* storage full or unavailable */
    }
  }
  listeners.forEach((l) => l())
}

export const getState = () => state

export function useStore<T>(select: (s: State) => T): T {
  return select(useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => state, () => load()))
}

export function useNow(intervalMs = 10000) {
  const [t, setT] = useState(now)
  useEffect(() => {
    const id = setInterval(() => setT(now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return t
}

const uid = () => Math.random().toString(36).slice(2, 10)

function log(s: State, event: string, ref: string, result: string): State {
  return { ...s, activity: [{ id: uid(), at: now(), event, ref, result }, ...s.activity].slice(0, 60) }
}

function patchSlot(slots: Slot[], id: string, patch: Partial<Slot>) {
  return slots.map((s) => (s.id === id ? { ...s, ...patch } : s))
}

/** Synchronize live database state from PostgreSQL */
export async function syncFromBackend() {
  if (typeof window === 'undefined') return
  try {
    const data = await api.fetchRecords()
    if (data && data.success) {
      const { spots, activeSessions } = data
      let s = state
      if (spots && spots.length > 0) {
        s = {
          ...s,
          slots: spots.map((sp: any) => ({
            id: sp.id,
            block: sp.block,
            number: sp.number,
            category: sp.category,
            status: sp.status,
            reason: sp.reason || 'Eligible for assignment',
          })),
        }
      }
      if (activeSessions && activeSessions.length > 0) {
        const nextSessions = { ...s.sessions }
        for (const act of activeSessions) {
          if (!nextSessions[act.ticketId]) {
            nextSessions[act.ticketId] = {
              ticketId: act.ticketId,
              category: act.category,
              slotId: act.slotId,
              entry: act.entry,
              rateVersion: s.rates.version,
              rate: s.rates.categories[act.category as Category] || s.rates.categories['Car'],
              grace: s.rates.grace,
              status: 'active',
            }
          }
        }
        s = { ...s, sessions: nextSessions }
      }
      set(s)
    }
  } catch (err) {
    console.warn('Backend sync notice (offline mode available):', err)
  }
}

/* ---------------- Entrance kiosk ---------------- */

export function availableFor(cat: Category, s: State = state) {
  return s.slots.filter((x) => x.category === cat && x.status === 'available')
}

/** Atomically claims the nearest compatible available space for the kiosk. */
export function claimSlot(cat: Category) {
  let s = releaseClaimState(state)
  const slot = availableFor(cat, s).sort((a, b) => a.block.localeCompare(b.block) || a.number - b.number)[0]
  if (!slot) {
    set(s)
    return null
  }
  const claim = { slotId: slot.id, ticketId: ticketId(s.nextTicket), category: cat, at: now() }
  s = { ...s, claim, slots: patchSlot(s.slots, slot.id, { status: 'claimed', reason: 'Kiosk claim · issuing ticket' }) }
  set(s)
  return claim
}

function releaseClaimState(s: State): State {
  if (!s.claim) return s
  return {
    ...s,
    claim: null,
    slots: patchSlot(s.slots, s.claim.slotId, { status: 'available', reason: 'Eligible for assignment' }),
  }
}

export function releaseClaim() {
  if (state.claim) set(releaseClaimState(state))
}

export async function issueTicket(): Promise<Session | null> {
  const c = state.claim
  if (!c) return null
  const slot = state.slots.find((x) => x.id === c.slotId)!

  // Synchronize with backend PostgreSQL
  let dbTicketId = c.ticketId
  let dbSlotId = c.slotId
  try {
    const res = await api.issueTicket(c.category)
    if (res.success && res.ticket) {
      dbTicketId = res.ticket.ticket_id
      if (res.spot_number) dbSlotId = res.spot_number
    }
  } catch (e) {
    console.warn('API ticket issuance notice:', e)
  }

  const session: Session = {
    ticketId: dbTicketId,
    category: c.category,
    slotId: dbSlotId,
    entry: c.at,
    rateVersion: state.rates.version,
    rate: state.rates.categories[c.category],
    grace: state.rates.grace,
    status: 'active',
  }

  let s: State = {
    ...state,
    claim: null,
    lastIssued: session.ticketId,
    nextTicket: state.nextTicket + 1,
    sessions: { ...state.sessions, [session.ticketId]: session },
    slots: patchSlot(state.slots, dbSlotId, { status: 'occupied', ticketId: session.ticketId, reason: 'Active-session lock' }),
  }
  s = log(s, 'Ticket issued', session.ticketId, `${session.category} · ${slotShort(slot)} occupied`)
  set(s)
  return session
}

/* ---------------- Exit terminal ---------------- */

export const OPERATOR = { name: 'Maria Santos', terminal: 'Terminal 01', lane: 'Lane A' as const }

export type LookupResult = { kind: 'invalid' | 'paid' | 'duplicate' | 'found'; id: string }

export function lookupTicket(query: string): LookupResult {
  const id = normalizeTicket(query)
  let session = state.sessions[id]

  // If not in memory, query backend API asynchronously
  if (!session && typeof window !== 'undefined') {
    api.lookupTicket(id).then((res) => {
      if (res && res.session) {
        const fetched = res.session
        const newSession: Session = {
          ticketId: fetched.ticketId,
          category: fetched.category,
          slotId: fetched.slotId,
          entry: fetched.entry,
          rateVersion: fetched.rateVersion || state.rates.version,
          rate: fetched.rate || state.rates.categories[fetched.category as Category] || state.rates.categories['Car'],
          grace: fetched.grace || 0,
          status: fetched.status,
        }
        set({ ...state, sessions: { ...state.sessions, [id]: newSession } })
      }
    }).catch(() => {})
  }

  if (!session) {
    set(log(state, 'Invalid ticket scanned', id || '—', 'No session · no charge'))
    return { kind: 'invalid', id }
  }
  if (session.status === 'completed') return { kind: 'paid', id }
  if (state.checkout?.ticketId === id) return { kind: 'duplicate', id }
  const t = now()
  let s: State = {
    ...state,
    checkout: { ticketId: id, openedAt: t, exitAt: t, terminal: OPERATOR.terminal, attendant: OPERATOR.name },
  }
  s = log(s, 'Checkout under review', id, `Active · ${session.slotId} occupied`)
  set(s)
  return { kind: 'found', id }
}

export function cancelCheckout() {
  const c = state.checkout
  if (!c) return
  set(log({ ...state, checkout: null }, 'Checkout cancelled', c.ticketId, 'No charge · session stays active'))
}

export function quoteFor(session: Session, exitAt: number) {
  const minutes = minutesOf(session.entry, exitAt)
  return { minutes, ...calcFee(session.rate, minutes, session.grace) }
}

export function completePayment(id: string, tender: number, method: 'Cash' | 'Digital' = 'Cash') {
  const session = state.sessions[id]
  const c = state.checkout
  if (!session || session.status !== 'active' || !c || c.ticketId !== id) return null
  const q = quoteFor(session, c.exitAt)
  if (tender < q.total) return null

  // Complete checkout via PostgreSQL backend
  if (typeof window !== 'undefined') {
    api.completeCheckout({
      ticketId: id,
      amountPaid: tender,
      paymentMethod: method,
      attendantName: c.attendant,
    }).catch((err) => console.warn('Payment backend sync:', err))
  }

  const tx: Transaction = {
    id: txnId(state.nextTxn),
    ticketId: id,
    category: session.category,
    slotId: session.slotId,
    entry: session.entry,
    exit: c.exitAt,
    minutes: q.minutes,
    amount: q.total,
    method,
    tender,
    change: tender - q.total,
    attendant: c.attendant,
  }
  const done: Session = {
    ...session,
    status: 'completed',
    exit: c.exitAt,
    payment: { amount: q.total, method, tender, change: tx.change, attendant: c.attendant, paidAt: now(), transactionId: tx.id },
  }
  let s: State = {
    ...state,
    checkout: null,
    lastCompleted: id,
    nextTxn: state.nextTxn + 1,
    transactions: [tx, ...state.transactions],
    sessions: { ...state.sessions, [id]: done },
    slots: patchSlot(state.slots, session.slotId, { status: 'available', ticketId: undefined, reason: 'Eligible for assignment' }),
    attendants: state.attendants.map((a) => (a.name === c.attendant ? { ...a, lastAccess: now() } : a)),
  }
  s = log(s, `${method} payment confirmed`, id, `${fmtPHP(q.total)} · ${session.slotId} released`)
  set(s)
  return tx
}

/* ---------------- Administration ---------------- */

export function updateSlot(id: string, patch: { status: SlotStatus; category: Category; reason: string }) {
  const slot = state.slots.find((x) => x.id === id)
  if (!slot || slot.status === 'occupied' || slot.status === 'claimed') return false
  let s: State = { ...state, slots: patchSlot(state.slots, id, patch) }
  const label = { available: 'Slot made available', reserved: 'Slot reserved', unavailable: 'Slot marked unavailable' } as Record<string, string>
  s = log(s, label[patch.status] ?? 'Slot updated', `Block ${slot.block} — Slot ${String(slot.number).padStart(2, '0')}`, patch.reason || patch.category)
  set(s)

  // Sync to database
  if (typeof window !== 'undefined') {
    api.updateSlot(id, patch).catch((err) => console.warn('Slot update backend sync:', err))
  }
  return true
}

export function addSlots(block: string, category: Category, count: number) {
  const b = block.trim().toUpperCase()
  const existing = state.slots.filter((x) => x.block === b)
  const start = existing.reduce((m, x) => Math.max(m, x.number), 0)
  const added: Slot[] = Array.from({ length: count }, (_, i) => {
    const n = start + i + 1
    return { id: `${b}${String(n).padStart(2, '0')}`, block: b, number: n, category, status: 'available', reason: 'Eligible for assignment' }
  })
  set(log({ ...state, slots: [...state.slots, ...added] }, existing.length ? 'Slots added' : 'Block added', `Block ${b}`, `${count} ${category} space${count === 1 ? '' : 's'}`))
  return added
}

export function saveRates(categories: Record<Category, Rate>, grace: number) {
  const base = state.rates.version.split('.r')[0]
  const rev = state.rates.history.filter((h) => h.version.startsWith(base)).length + 1
  const version = `${base}.r${rev}`
  const t = now()
  set(
    log(
      {
        ...state,
        rates: {
          ...state.rates,
          version,
          effective: t,
          grace,
          categories,
          history: [{ version, effective: t, by: 'City parking administrator' }, ...state.rates.history],
        },
      },
      'Rate version saved',
      version,
      'Applies to new sessions only',
    ),
  )

  // Sync to database
  if (typeof window !== 'undefined') {
    api.saveRates(categories, grace).catch((err) => console.warn('Rates update backend sync:', err))
  }
  return version
}

export function addAttendant(a: Omit<Attendant, 'id' | 'status'>) {
  const id = `ATT-${String(state.attendants.length + 1).padStart(3, '0')}`
  set(log({ ...state, attendants: [...state.attendants, { ...a, id, status: 'Pending' }] }, 'Attendant account created', a.name, `Exit attendant · ${a.lane}`))
}

export function updateAttendant(id: string, patch: Partial<Attendant>) {
  set({ ...state, attendants: state.attendants.map((a) => (a.id === id ? { ...a, ...patch } : a)) })
}

export function updateSettings(patch: Partial<Settings>) {
  set({ ...state, settings: { ...state.settings, ...patch } })
}

export function resetDemo() {
  realStart = Date.now()
  if (typeof window !== 'undefined') {
    localStorage.setItem(CLOCK_KEY, String(realStart))
  }
  set(buildSeed())
}
