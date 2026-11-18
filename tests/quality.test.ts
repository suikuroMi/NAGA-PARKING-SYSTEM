import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcFee, normalizeTicket, parseSlotId, ticketId } from '../store/logic'
import { match } from '../lib/router'
import { createEngine } from '../server/engine'
import { credentials } from '../server/credentials'
import { emptyState, addPayment } from './reporting-fixture'
import { validate } from '../server/validation'

test('decimal fee accepts exact cash and stores exact change', () => {
  const rate = {initial: 0.1, initialMin: 60, incrementMin: 30, additional: 0.2, lostFee: 0.1}
  assert.equal(calcFee(rate, 61).total, 0.3)
  assert.equal(calcFee(rate, 61, 0, true).total, 0.4)
  const state = emptyState(), tx = addPayment(state, 'decimal', Date.now(), 0.3)
  const session = state.sessions[tx.ticketId]
  Object.assign(session, {status: 'active', rate, entry: Date.now() - 61 * 60000, payment: undefined})
  state.transactions = []; state.exitSession = {attendantId: state.attendants[0].id, since: Date.now(), lastActive: Date.now(), locked: null}
  state.attendants[0].mustChangePin = false
  state.checkout = {ticketId: session.ticketId, exitAt: Date.now(), openedAt: Date.now(), terminal: 'Terminal 01', attendant: state.attendants[0].name}
  const exact = createEngine(structuredClone(state), 'exact').completePayment(session.ticketId, {method:'Cash',tender:0.3})
  assert.ok(exact); assert.equal(exact.change,0)
  const engine = createEngine(state, 'test')
  const payment = engine.completePayment(session.ticketId, {method: 'Cash', tender: 0.5})
  assert.ok(payment); assert.equal(payment.change, 0.2)
})

test('long ticket counters and multi-letter blocks remain intact', () => {
  const id = ticketId(10000, Date.now())
  assert.equal(normalizeTicket(id, {}), id)
  assert.equal(normalizeTicket('https://example.test/?ticket=' + id, {}), id)
  const state = emptyState(), tx = addPayment(state, 'sample')
  const session = {...state.sessions[tx.ticketId], ticketId: id}
  assert.equal(normalizeTicket('10000', {[id]: session}), id)
  assert.deepEqual(parseSlotId('AA101'), {block: 'AA', number: 101})
})

test('supervisor reopen renews confirmation window while preserving quoted fee time', () => {
  const state = emptyState(), tx = addPayment(state, 'reopen', Date.now() - 6 * 60000)
  state.admin = {...credentials('7294'), failedAttempts: 0}
  state.exitSession = {attendantId: state.attendants[0].id, since: Date.now(), lastActive: Date.now(), locked: null}
  state.attendants[0].mustChangePin = false
  const engine = createEngine(state, 'test'), began = Date.now()
  assert.equal(engine.voidAndReopen(tx.id, 'Wrong amount entered', '', '7294').ok, true)
  assert.ok(engine.getState().checkout!.openedAt >= began)
  assert.equal(engine.getState().checkout!.exitAt, tx.exit)
})

test('malformed route escapes fail safely instead of crashing the screen', () => {
  assert.equal(match('/exit/fee/:id', '/exit/fee/%'), null)
  assert.deepEqual(match('/exit/fee/:id', '/exit/fee/valid'), {id: 'valid'})
})

test('monetary input rejects fractional centavos without changing valid decimal amounts', () => {
  assert.throws(() => validate('completePayment', ['t', {method: 'Cash', tender: 1.001}]))
  assert.throws(() => validate('refundTransaction', ['t', 0.015, 'Overcharge', '', '7294']))
  assert.equal((validate('completePayment', ['t', {method: 'Cash', tender: 0.29}])[1] as {tender:number}).tender, 0.29)
})
