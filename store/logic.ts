import type { Category, Rate, RateConfig, Session, Slot, State, Transaction } from './types'
import { pad2 } from '../lib/format'
import { centavos, sumMoney } from '../lib/money'

/** YYYYMMDD of a timestamp in Asia/Manila (UTC+8, no DST). */
export function manilaDateCode(t: number) {
  const d = new Date(t + 8 * 3600000)
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`
}
/** YYYY.MM.DD of a timestamp in Asia/Manila. */
export const manilaDot = (t: number) => manilaDateCode(t).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3')

export const ticketId = (n: number, t: number) => `NSP-${manilaDateCode(t)}-${String(n).padStart(4, '0')}`
export const txnId = (n: number, t: number) => `NSP-TXN-${manilaDateCode(t)}-${String(n).padStart(4, '0')}`

export function calcFee(rate: Rate, minutes: number, grace = 0, lost = false) {
  const extraMin = Math.max(0, minutes - rate.initialMin - grace)
  const increments = extraMin > 0 ? Math.ceil(extraMin / rate.incrementMin) : 0
  const initial = centavos(rate.initial)
  const additional = increments * centavos(rate.additional)
  const lostFee = lost ? centavos(rate.lostFee ?? 0) : 0
  return {
    initial: initial / 100,
    extraMin,
    increments,
    additional: additional / 100,
    lostFee: lostFee / 100,
    total: (initial + additional + lostFee) / 100,
  }
}

/* ---------- Corrections ---------- */

export const refundedOf = (tx: Transaction) => sumMoney((tx.refunds ?? []).map(r=>r.amount))
/** Revenue actually kept: 0 when voided, amount minus refunds otherwise. */
export const netAmount = (tx: Transaction) => (tx.voided ? 0 : (centavos(tx.amount)-centavos(refundedOf(tx)))/100)
export type TxStatus = 'Paid' | 'Partially refunded' | 'Refunded' | 'Voided'
export function txStatus(tx: Transaction): TxStatus {
  if (tx.voided) return 'Voided'
  const r = refundedOf(tx)
  if (!r) return 'Paid'
  return r >= tx.amount - 0.001 ? 'Refunded' : 'Partially refunded'
}
export const TX_TONE: Record<TxStatus, 'ok' | 'warn' | 'bad'> = { Paid: 'ok', 'Partially refunded': 'warn', Refunded: 'warn', Voided: 'bad' }

/** Active sessions parked longer than this are flagged as overdue. */
export const OVERDUE_MIN = 720
export const isOverdue = (s: Session, t: number) => s.status === 'active' && minutesOf(s.entry, t) > OVERDUE_MIN

export function feeFor(rates: RateConfig, category: Category, minutes: number) {
  return calcFee(rates.categories[category], minutes, rates.grace)
}

export const slotLabel = (s: Pick<Slot, 'block' | 'number'>) => `Block ${s.block} — Slot ${pad2(s.number)}`
export const slotShort = (s: Pick<Slot, 'block' | 'number'>) => `${s.block}${pad2(s.number)}`

export function parseSlotId(id: string) {
  const match = /^([A-Z]+)(\d+)$/.exec(id)
  return { block: match?.[1] ?? id, number: match ? Number(match[2]) : 0 }
}

export function blocks(slots: Slot[]) {
  const map = new Map<string, Slot[]>()
  for (const s of slots) {
    if (!map.has(s.block)) map.set(s.block, [])
    map.get(s.block)!.push(s)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, list]) => ({ id, slots: list.sort((a, b) => a.number - b.number) }))
}

/** "Motorcycle" or "Van 01–10 / Other 11–20" */
export function blockLabel(list: Slot[]) {
  const runs: { cat: Category; from: number; to: number }[] = []
  for (const s of list) {
    const last = runs[runs.length - 1]
    if (last && last.cat === s.category) last.to = s.number
    else runs.push({ cat: s.category, from: s.number, to: s.number })
  }
  if (runs.length === 1) return runs[0].cat
  return runs.map((r) => `${r.cat} ${pad2(r.from)}–${pad2(r.to)}`).join(' / ')
}

/** Where a category lives, e.g. "Block A · 01–20" or "Block C · 01–10". */
export function categoryLocation(slots: Slot[], cat: Category) {
  const parts: string[] = []
  for (const b of blocks(slots)) {
    const mine = b.slots.filter((s) => s.category === cat)
    if (!mine.length) continue
    if (mine.length === 1) parts.push(`Block ${b.id} · ${pad2(mine[0].number)}`)
    else parts.push(`Block ${b.id} · ${pad2(mine[0].number)}–${pad2(mine[mine.length - 1].number)}`)
  }
  return parts.join(', ') || 'Not configured'
}

export function counts(slots: Slot[]) {
  const c = { total: slots.length, available: 0, occupied: 0, reserved: 0, unavailable: 0, claimed: 0 }
  for (const s of slots) c[s.status]++
  return c
}

export function computeStats(state: State) {
  const c = counts(state.slots)
  const sessions = Object.values(state.sessions)
  const active = sessions.filter((s) => s.status === 'active').length
  const txs = state.transactions
  const revenue = sumMoney(txs.map(netAmount))
  const kept = txs.filter((t) => !t.voided)
  const cash = txs.filter((t) => t.method === 'Cash').length
  const voided = txs.filter((t) => t.voided)
  const refundList = txs.flatMap((t) => t.refunds ?? [])
  const lost = kept.filter((t) => t.lostTicketFee)
  const closed = sessions.filter((s) => s.status === 'closed')
  const t = Date.now()
  return {
    ...c,
    occupancy: c.total ? ((c.occupied + c.claimed) / c.total) * 100 : 0,
    active,
    entered: sessions.length,
    paymentRecords: txs.length,
    completedSessions: sessions.filter(s=>s.status==='completed').length,
    revenue,
    cash,
    digital: txs.length - cash,
    voids: { count: voided.length, amount: sumMoney(voided.map(x=>x.amount)) },
    refunds: { count: refundList.length, amount: sumMoney(refundList.map(r=>r.amount)) },
    lostTickets: { count: lost.length, fees: sumMoney(lost.map(x=>x.lostTicketFee??0)) },
    ended: closed.length,
    uncollected: sumMoney(closed.map(s=>s.closure?.uncollected??0)),
    overdue: sessions.filter((s) => isOverdue(s, t)).length,
    blockCount: blocks(state.slots).length,
  }
}

const GUIDE: Record<string, string> = {
  A: 'turn left into Block A',
  B: 'continue straight to Block B',
  C: 'turn right into Block C',
}
export function directions(slot: Slot) {
  const way = GUIDE[slot.block] ?? `follow signs to Block ${slot.block}`
  return { way, bay: slot.number }
}

/**
 * Resolves scanned or typed input to a ticket ID. Extracts an NSP ticket ID from
 * any text (e.g. a scanned URL); short numbers match the ticket counter suffix,
 * preferring an active session, then the newest one.
 */
export function normalizeTicket(input: string, sessions: Record<string, Session>) {
  const v = input.trim().toUpperCase()
  const found = v.match(/\bNSP-\d{8}-\d{4,}\b/)
  if (found) return found[0]
  if (/^\d{1,12}$/.test(v)) {
    const suffix = `-${v.padStart(4, '0')}`
    const hits = Object.values(sessions)
      .filter((s) => s.ticketId.endsWith(suffix))
      .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || b.entry - a.entry)
    return hits[0]?.ticketId ?? `NSP-${manilaDateCode(Date.now())}${suffix}`
  }
  return v
}

export const minutesOf = (entry: number, exit: number) => Math.max(0, Math.floor((exit - entry) / 60000))
