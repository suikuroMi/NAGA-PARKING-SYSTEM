import type { State, Transaction, Session } from './types'
import { CATEGORIES } from './types'
import { netAmount, refundedOf, txStatus, isOverdue } from './logic'
import { sumMoney } from '../lib/money'

export const REPORT_POLICY='Payments are grouped by payment date in Asia/Manila. Later refunds and voids update the original payment period; historical net totals can change. This is not a cash-movement ledger.'
export function localDate(t=Date.now()) {return new Date(t+8*3600000).toISOString().slice(0,10)}
export function validDate(value:string) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false
  const time=Date.parse(value+'T00:00:00+08:00')
  return Number.isFinite(time)&&localDate(time)===value
}
export function dayRange(from:string,to:string) {
  if(!validDate(from)||!validDate(to)||from>to)throw new Error('Choose valid dates with the start on or before the end.')
  return {from:Date.parse(from+'T00:00:00+08:00'),to:Date.parse(to+'T00:00:00+08:00')+86400000}
}
export function inRange(value:number,range:{from:number;to:number}) {return value>=range.from&&value<range.to}
export function datePreset(preset:'today'|'week'|'month',now=Date.now()) {
  const to=localDate(now)
  return {from:preset==='today'?to:preset==='week'?localDate(Date.parse(to+'T00:00:00+08:00')-6*86400000):to.slice(0,7)+'-01',to}
}
export type PaymentTimeSource='transaction'|'session'|'estimated-checkout'
export const TIME_SOURCE_LABEL:Record<PaymentTimeSource,string>={transaction:'Recorded payment time',session:'Matching session payment time','estimated-checkout':'Estimated from checkout time'}
const timestamp=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)
export function paymentTime(tx:Transaction,state:Pick<State,'sessions'>):{at:number;source:PaymentTimeSource} {
  if(timestamp(tx.paidAt))return {at:tx.paidAt,source:'transaction'}
  const payment=state.sessions[tx.ticketId]?.payment
  if(payment?.transactionId===tx.id&&timestamp(payment.paidAt))return {at:payment.paidAt,source:'session'}
  return {at:tx.exit,source:'estimated-checkout'}
}
export function completionTime(session:Session,state:Pick<State,'transactions'|'sessions'>) {
  if(session.status!=='completed')return null
  if(timestamp(session.payment?.paidAt))return session.payment.paidAt
  const tx=state.transactions.find(t=>t.id===session.payment?.transactionId)
  return tx?paymentTime(tx,state).at:session.exit??null
}
export function transactionsInRange(state:State,from:string,to:string) {const range=dayRange(from,to);return state.transactions.filter(tx=>inRange(paymentTime(tx,state).at,range))}
export function collectionTotals(transactions:Transaction[]) {
  return {gross:sumMoney(transactions.map(t=>t.amount)),voids:sumMoney(transactions.filter(t=>t.voided).map(t=>t.amount)),
    refunds:sumMoney(transactions.map(refundedOf)),net:sumMoney(transactions.map(netAmount))}
}
export function buildReport(state:State,from:string,to:string,generatedAt=Date.now()) {
  const range=dayRange(from,to),txs=transactionsInRange(state,from,to),totals=collectionTotals(txs)
  const sessions=Object.values(state.sessions)
  const payments=txs.map(tx=>{const time=paymentTime(tx,state);return {
    id:tx.id,ticketId:tx.ticketId,category:tx.category,attendant:tx.attendant,method:tx.method,
    paidAt:time.at,timeSource:time.source,entry:tx.entry,checkoutAt:tx.exit,minutes:tx.minutes,
    amount:tx.amount,voids:tx.voided?tx.amount:0,refunds:refundedOf(tx),net:netAmount(tx),status:txStatus(tx),
  }}).sort((a,b)=>b.paidAt-a.paidAt||a.id.localeCompare(b.id))
  const closures=sessions.filter(s=>s.status==='closed'&&s.closure&&inRange(s.closure.at,range)).map(s=>({ticketId:s.ticketId,slotId:s.slotId,at:s.closure!.at,reason:s.closure!.reason,uncollected:s.closure!.uncollected})).sort((a,b)=>b.at-a.at)
  const group=(selected:Transaction[])=>({records:selected.length,net:sumMoney(selected.map(netAmount)),averageMinutes:selected.length?selected.reduce((n,t)=>n+t.minutes,0)/selected.length:0})
  return {
    from,to,timezone:'Asia/Manila' as const,generatedAt,policy:REPORT_POLICY,totals,payments,closures,
    paymentRecords:txs.length,voidRecords:txs.filter(t=>t.voided).length,refundRecords:txs.reduce((n,t)=>n+(t.refunds?.length??0),0),
    estimatedRecords:payments.filter(p=>p.timeSource==='estimated-checkout').length,
    arrivals:sessions.filter(s=>inRange(s.entry,range)).length,
    completedSessions:sessions.filter(s=>{const at=completionTime(s,state);return at!==null&&inRange(at,range)}).length,
    uncollected:sumMoney(closures.map(c=>c.uncollected)),
    lostTickets:txs.filter(t=>!t.voided&&t.lostTicketFee).length,
    lostFees:sumMoney(txs.filter(t=>!t.voided).map(t=>t.lostTicketFee??0)),
    cashRecords:txs.filter(t=>t.method==='Cash').length,digitalRecords:txs.filter(t=>t.method==='Digital').length,
    netPerRecord:txs.length?totals.net/txs.length:0,
    byCategory:CATEGORIES.map(category=>({category,...group(txs.filter(t=>t.category===category))})),
    byAttendant:[...new Set(txs.map(t=>t.attendant))].sort().map(attendant=>({attendant,...group(txs.filter(t=>t.attendant===attendant))})),
    live:{asOf:generatedAt,occupied:state.slots.filter(s=>s.status==='occupied').length,claimed:state.slots.filter(s=>s.status==='claimed').length,total:state.slots.length,overdue:sessions.filter(s=>isOverdue(s,generatedAt)).length},
  }
}
export type ReportSnapshot=ReturnType<typeof buildReport>
