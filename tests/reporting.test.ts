import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcFee } from '../store/logic'
import { collectionTotals, dayRange, inRange, localDate } from '../store/reporting'
import type { Transaction } from '../store/types'
import { buildReport, paymentTime, datePreset } from '../store/reporting'
import { reportRows, reportSections } from '../lib/report-export'
import { csvText } from '../lib/csv'
import { sumMoney } from '../lib/money'
import { emptyState, addPayment, monday, tuesday, presentationFixture } from './reporting-fixture'

test('payment after Manila midnight belongs to payment day, with exact boundaries for closures',()=>{
  const s=emptyState(); const tx=addPayment(s,'midnight',tuesday)
  assert.equal(buildReport(s,'2026-11-09','2026-11-09').paymentRecords,0)
  assert.equal(buildReport(s,'2026-11-10','2026-11-10').paymentRecords,1)
  assert.ok(tx.exit<tuesday)
  const session=s.sessions[tx.ticketId];session.status='closed';session.closure={at:tuesday,by:'Admin',reason:'Other',uncollected:20.1,minutes:60}
  assert.equal(buildReport(s,'2026-11-09','2026-11-09').closures.length,0)
  assert.equal(buildReport(s,'2026-11-10','2026-11-10').uncollected,20.1)
  session.closure.at=tuesday-1
  assert.equal(buildReport(s,'2026-11-09','2026-11-09').closures.length,1)
  tx.paidAt=monday-1
  assert.equal(buildReport(s,'2026-11-09','2026-11-09').paymentRecords,0)
  tx.paidAt=tuesday-1
  assert.equal(buildReport(s,'2026-11-09','2026-11-09').paymentRecords,1)
})

test('all legacy timestamp paths resolve without mutation and never borrow a replacement payment',()=>{
  const s=emptyState(),tx=addPayment(s,'legacy',tuesday)
  assert.deepEqual(paymentTime(tx,s),{at:tuesday,source:'transaction'})
  delete tx.paidAt
  assert.deepEqual(paymentTime(tx,s),{at:tuesday,source:'session'})
  s.sessions[tx.ticketId].payment!.transactionId='replacement'
  const before=structuredClone(s)
  assert.deepEqual(paymentTime(tx,s),{at:tx.exit,source:'estimated-checkout'})
  const r=buildReport(s,'2026-11-09','2026-11-09')
  assert.equal(r.estimatedRecords,1);assert.deepEqual(s,before)
})

test('Tuesday partial and full refunds update Monday with centavo-exact totals',()=>{
  const s=emptyState(),tx=addPayment(s,'refund',monday,0.3)
  tx.refunds=[{id:'r1',at:tuesday,amount:0.1,reason:'Overcharge',by:'Admin'}]
  assert.deepEqual(buildReport(s,'2026-11-09','2026-11-09').totals,{gross:0.3,voids:0,refunds:0.1,net:0.2})
  assert.equal(buildReport(s,'2026-11-10','2026-11-10').totals.refunds,0)
  tx.refunds.push({id:'r2',at:tuesday,amount:0.2,reason:'Overcharge',by:'Admin'})
  assert.equal(buildReport(s,'2026-11-09','2026-11-09').totals.net,0)
})

test('void, reopen and repayment count payment records separately from distinct completed sessions',()=>{
  const s=emptyState(),tx=addPayment(s,'first',monday)
  tx.voided={at:tuesday,reason:'Recorded in error',by:'Admin'}
  const report=()=>buildReport(s,'2026-11-09','2026-11-10')
  assert.equal(report().completedSessions,1)
  const session=s.sessions[tx.ticketId];session.status='active';delete session.payment
  assert.equal(report().completedSessions,0)
  s.transactions.push({...tx,id:'second',paidAt:tuesday,voided:undefined})
  session.status='completed';session.payment={...tx,transactionId:'second',paidAt:tuesday}
  assert.equal(report().completedSessions,1);assert.equal(report().paymentRecords,2);assert.equal(report().voidRecords,1)
  assert.equal(buildReport(s,'2026-11-09','2026-11-09').completedSessions,0)
})

test('invalid ranges, empty periods and presets have explicit results',()=>{
  for(const [a,b] of [['','2026-11-09'],['2026-02-30','2026-03-01'],['2026-11-10','2026-11-09']])assert.throws(()=>dayRange(a,b))
  const r=buildReport(emptyState(),'2026-11-09','2026-11-09')
  assert.equal(r.netPerRecord,0);assert.equal(r.paymentRecords,0);assert.equal(r.completedSessions,0)
  assert.deepEqual(datePreset('week',tuesday),{from:'2026-11-04',to:'2026-11-10'})
  assert.deepEqual(datePreset('month',tuesday),{from:'2026-11-01',to:'2026-11-10'})
})

test('category, attendant, CSV and print sections reconcile and remain a fixed snapshot',()=>{
  const s=presentationFixture(),r=buildReport(s,'2026-11-09','2026-11-09',tuesday)
  assert.equal(sumMoney(r.byCategory.map(x=>x.net)),r.totals.net)
  assert.equal(sumMoney(r.byAttendant.map(x=>x.net)),r.totals.net)
  assert.equal(r.byCategory.reduce((n,x)=>n+x.records,0),r.paymentRecords)
  const sections=reportSections(r),rows=reportRows(r),csv=csvText(rows)
  for(const section of sections)for(const row of section.rows)assert.ok(rows.some(exported=>JSON.stringify(exported)===JSON.stringify(row)))
  assert.ok(csv.includes('"Net (PHP)","'+r.totals.net+'"'))
  assert.ok(csv.includes('Estimated from checkout time'))
  assert.ok(csv.includes("'=Formula-safe attendant"))
  const before=structuredClone(r);s.transactions[0].amount=999;s.sessions={}
  assert.deepEqual(r,before)
  assert.equal(csvText([['=1+1','+x','-x','@x','a"b','two\nlines']]),'"\'=1+1","\'+x","\'-x","\'@x","a""b","two\nlines"')
})

test('fee increments begin after initial duration and grace; lost fee applies once',()=>{
  const rate={initial:20,initialMin:60,incrementMin:30,additional:10,lostFee:100}
  for(const [minutes,total] of [[0,20],[60,20],[65,20],[66,30],[95,30],[96,40]])
    assert.equal(calcFee(rate,minutes,5).total,total)
  assert.equal(calcFee(rate,96,5,true).total,140)
})

test('Manila report day includes midnight and excludes following midnight',()=>{
  const range=dayRange('2026-11-09','2026-11-09')
  assert.equal(localDate(range.from),'2026-11-09')
  assert.equal(inRange(range.from,range),true)
  assert.equal(inRange(range.to-1,range),true)
  assert.equal(inRange(range.to,range),false)
  assert.equal(inRange(range.from-1,range),false)
})

test('report gross minus voids and refunds equals net',()=>{
  const base={ticketId:'t',category:'Car',slotId:'A01',entry:0,exit:1,minutes:1,method:'Cash',tender:100,change:0,attendant:'Test'} as const
  const txs:Transaction[]=[
    {...base,id:'a',amount:100},
    {...base,id:'b',amount:80,voided:{at:2,reason:'Recorded in error',by:'Administrator'}},
    {...base,id:'c',amount:60,refunds:[{id:'r',at:2,amount:15,reason:'Overcharge',by:'Administrator'}]},
  ]
  assert.deepEqual(collectionTotals(txs),{gross:240,voids:80,refunds:15,net:145})
})
