import { buildSeed } from '../store/seed'
import type { Session, State, Transaction } from '../store/types'

export const monday = Date.parse('2026-11-09T00:00:00+08:00')
export const tuesday = monday + 86400000
export function emptyState(): State {
  const state = buildSeed()
  state.sessions = {}; state.transactions = []; state.activity = []
  state.checkout = null; state.lastCompleted = null; state.lastIssued = null; state.claims = []; state.exitSession = null
  state.slots = state.slots.map(s => ({...s, status: 'available', ticketId: undefined}))
  return state
}
export function addPayment(state: State, id: string, paidAt = monday, amount = 10.1): Transaction {
  const slot = state.slots[0]
  const tx: Transaction = {id, ticketId: `T-${id}`, category: slot.category, slotId: slot.id,
    entry: paidAt - 3600000, exit: paidAt - 1000, paidAt, minutes: 60, amount,
    method: 'Cash', tender: amount, change: 0, attendant: 'Test Attendant'}
  const session: Session = {ticketId: tx.ticketId, category: tx.category, slotId: tx.slotId,
    entry: tx.entry, exit: tx.exit, status: 'completed', rateVersion: state.rates.version,
    rate: state.rates.categories[tx.category], grace: 0,
    payment: {amount, method: 'Cash', tender: amount, change: 0, attendant: tx.attendant, paidAt, transactionId: id}}
  state.transactions.push(tx); state.sessions[tx.ticketId] = session
  return tx
}
export function presentationFixture() {
  const state = emptyState()
  for (let i = 0; i < 120; i++) {
    const tx = addPayment(state, `REPORT-${String(i).padStart(3, '0')}`, monday + i * 60000, 10.1 + i % 3)
    tx.category = ['Motorcycle', 'Car', 'Van', 'Other'][i % 4] as Transaction['category']
    tx.attendant = i % 2 ? 'Test Attendant' : '=Formula-safe attendant'
    tx.method = i % 2 ? 'Cash' : 'Digital'
    if (i % 3 === 1) delete tx.paidAt
    if (i % 3 === 2) { delete tx.paidAt; delete state.sessions[tx.ticketId].payment }
    if (i === 3) tx.voided = {at: tuesday, reason: 'Recorded in error', by: 'Administrator'}
    if (i === 4) tx.refunds = [{id: 'REF-TEST', at: tuesday, amount: 0.3, reason: 'Overcharge', by: 'Administrator'}]
  }
  const closed = addPayment(state, 'CLOSED', monday)
  state.transactions.pop()
  Object.assign(state.sessions[closed.ticketId], {status: 'closed', payment: undefined,
    closure: {at: monday, by: 'Administrator', reason: 'Left without paying', uncollected: 20.25, minutes: 60}})
  return state
}
