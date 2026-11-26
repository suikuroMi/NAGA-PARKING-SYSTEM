import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { loadEnvConfig } from '@next/env'
import { Pool } from 'pg'
import { buildSeed } from '../store/seed'
import { credentials } from '../server/credentials'
import { saveState, readState } from '../server/repository'
import { calcFee, netAmount } from '../store/logic'

loadEnvConfig(process.cwd())
const source=new URL(process.env.DATABASE_URL!)
const database='naga_test_'+randomUUID().replace(/-/g,'').slice(0,12)
const adminUrl=new URL(source);adminUrl.pathname='/postgres'
const management=new Pool({connectionString:adminUrl.toString()})
let testPool:Pool
let api:typeof import('../app/api/system/route')
let serverPool:Pool
const adminPin='7294',attendantPin='5839'

class Browser {
  cookies=new Map<string,string>()
  async call(command?:string,args:unknown[]=[],id=randomUUID()) {
    const headers:Record<string,string>={host:'localhost:3100',cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; ')}
    if(command)Object.assign(headers,{'content-type':'application/json','x-naga-request':'1',origin:'http://localhost:3100'})
    const req=new Request('http://localhost:3100/api/system',{method:command?'POST':'GET',headers,body:command?JSON.stringify({command,args,id}):undefined})
    const response=command?await api.POST(req):await api.GET(req)
    for(const value of response.headers.getSetCookie()){const [pair]=value.split(';');const n=pair.indexOf('=');this.cookies.set(pair.slice(0,n),pair.slice(n+1))}
    return {status:response.status,data:await response.json()}
  }
}

before(async()=>{
  await management.query(`CREATE DATABASE ${database}`)
  const url=new URL(source);url.pathname='/'+database
  process.env.DATABASE_URL=url.toString()
  testPool=new Pool({connectionString:url.toString()})
  const client=await testPool.connect()
  try {
    await client.query(readFileSync('server/schema.sql','utf8'))
    const state=buildSeed();state.admin={...credentials(adminPin),failedAttempts:0}
    state.attendants=state.attendants.map(a=>({...a,...credentials(attendantPin),mustChangePin:false,status:'Offline'}))
    await client.query('BEGIN');await saveState(client,null,state);await client.query('COMMIT')
  }finally{client.release()}
  api=await import('../app/api/system/route')
  serverPool=(await import('../lib/db')).pool
})
after(async()=>{await serverPool?.end();await testPool?.end();await management.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);await management.end()})

test('PostgreSQL entrance → authenticated exit → payment → refund persists',async()=>{
  const kiosk=new Browser(),exit=new Browser(),admin=new Browser()
  const initial=await kiosk.call();assert.equal(initial.status,200)
  assert.equal(initial.data.state.admin.pinHash,'')
  assert.deepEqual(initial.data.state.transactions,[])
  assert.equal((await kiosk.call('saveRates',[initial.data.state.rates.categories,0])).status,403)
  assert.equal((await admin.call('verifyAdminPin',[adminPin])).data.result.ok,true)
  assert.equal((await exit.call('signInExit',['ATT-001',attendantPin])).data.result.ok,true)
  const claim=await kiosk.call('claimSlot',['Car']);assert.ok(claim.data.result.slotId)
  const requestId=randomUUID()
  const issued=await kiosk.call('issueTicket',[],requestId)
  const ticket=issued.data.result.ticketId
  const repeated=await kiosk.call('issueTicket',[],requestId)
  assert.equal(repeated.data.result.ticketId,ticket)
  const lookup=await exit.call('lookupTicket',[ticket]);assert.equal(lookup.data.result.kind,'found')
  const paid=await exit.call('completePayment',[ticket,{method:'Cash',tender:500}])
  assert.equal(paid.status,200);assert.equal(paid.data.result.ticketId,ticket)
  const tx=paid.data.result
  assert.equal(typeof tx.paidAt,'number')
  assert.equal(tx.paidAt,paid.data.state.sessions[ticket].payment.paidAt)
  assert.ok(tx.paidAt>=tx.exit)
  assert.equal(paid.data.state.slots.find((s:any)=>s.id===tx.slotId).status,'available')
  assert.equal((await exit.call('completePayment',[ticket,{method:'Cash',tender:500}])).data.result,null)
  assert.equal((await kiosk.call('refundTransaction',[tx.id,10,'Overcharge','',adminPin])).status,403)
  const refund=await admin.call('refundTransaction',[tx.id,10,'Overcharge','',adminPin]);assert.equal(refund.data.result.ok,true)
  const loaded=await readState(testPool)
  assert.equal(loaded.transactions.find(t=>t.id===tx.id)?.paidAt,tx.paidAt)
  assert.equal(loaded.transactions.find(t=>t.id===tx.id)?.refunds?.[0].amount,10)
  assert.equal(loaded.sessions[ticket].status,'completed')
  const publicRead=await kiosk.call();assert.equal(publicRead.data.state.transactions.length,0)
  assert.equal(publicRead.data.state.attendants[0].pinHash,'')
})

test('concurrent kiosks cannot reserve the same final space',async()=>{
  const first=new Browser(),second=new Browser()
  await first.call();await second.call()
  const client=await testPool.connect()
  try{await client.query('BEGIN');const s=await readState(client);const n=structuredClone(s)
    n.slots=n.slots.map(slot=>slot.category==='Van'&&slot.status==='available'?{...slot,status:'reserved',reason:'Concurrency test'}:slot)
    n.slots.push({id:'T01',block:'T',number:1,category:'Van',status:'available',reason:'Concurrency test'})
    await saveState(client,s,n);await client.query('COMMIT')
  }finally{client.release()}
  const responses=await Promise.all([first.call('claimSlot',['Van']),second.call('claimSlot',['Van'])])
  assert.equal(responses.filter(r=>r.data.result!==null).length,1)
})

test('rate snapshots, lost tickets, void/reopen and administrative closure',async()=>{
  const kiosk=new Browser(),exit=new Browser(),admin=new Browser();await kiosk.call()
  await admin.call('verifyAdminPin',[adminPin]);await exit.call('signInExit',['ATT-001',attendantPin])
  await kiosk.call('claimSlot',['Motorcycle']);const issued=await kiosk.call('issueTicket');const session=issued.data.result
  const snapshot=await admin.call();const rates=structuredClone(snapshot.data.state.rates.categories);rates.Motorcycle.initial+=30
  await admin.call('saveRates',[rates,5])
  assert.equal((await admin.call()).data.state.sessions[session.ticketId].rate.initial,session.rate.initial)
  assert.equal((await exit.call('openLostCheckout',[session.ticketId])).data.result.kind,'found')
  const paid=await exit.call('completePayment',[session.ticketId,{method:'Digital',provider:'GCash',reference:'TEST123456'}]);const tx=paid.data.result
  assert.ok(tx.lostTicketFee>0);assert.equal(tx.reference,'TEST123456')
  const reopened=await exit.call('voidAndReopen',[tx.id,'Wrong amount entered','',adminPin]);assert.equal(reopened.data.result.ok,true)
  await exit.call('cancelCheckout')
  const ended=await admin.call('endSession',[session.ticketId,'Vehicle towed or removed','',adminPin]);assert.equal(ended.data.result.ok,true)
  const state=await readState(testPool);assert.equal(state.sessions[session.ticketId].status,'closed');assert.ok(state.transactions.find(t=>t.id===tx.id)?.voided)
})

test('wrong PIN lockout is persisted; malformed money and cross-origin requests fail',async()=>{
  const browser=new Browser();await browser.call()
  for(let i=0;i<5;i++)await browser.call('signInExit',['ATT-003','0000'])
  const locked=await browser.call('signInExit',['ATT-003',attendantPin]);assert.equal(locked.data.result.error,'locked')
  const malformed=await browser.call('completePayment',['fake',{method:'Cash',tender:-1}]);assert.equal(malformed.status,400)
  const response=await api.POST(new Request('http://localhost:3100/api/system',{method:'POST',headers:{host:'localhost:3100',origin:'https://other.example','x-naga-request':'1'},body:'{}'}));assert.equal(response.status,403)
  const nullOrigin=await api.POST(new Request('http://localhost:3100/api/system',{method:'POST',headers:{host:'localhost:3100',origin:'null','x-naga-request':'1'},body:'{}'}));assert.equal(nullOrigin.status,403)
  const missingOrigin=await api.POST(new Request('http://localhost:3100/api/system',{method:'POST',headers:{host:'localhost:3100','x-naga-request':'1'},body:'{}'}));assert.equal(missingOrigin.status,403)
})

test('forged device cookies cannot hijack another kiosk session and public state redacts metadata',async()=>{
  const victim=new Browser(),attacker=new Browser()
  const vInit=await victim.call()
  await victim.call('claimSlot',['Motorcycle'])
  const issued=(await victim.call('issueTicket')).data.result.ticketId
  attacker.cookies.set('nsp_device',vInit.data.device)
  const forgedRead=await attacker.call()
  assert.notEqual(forgedRead.data.device,vInit.data.device)
  assert.equal(forgedRead.data.state.sessions[issued],undefined)
  assert.equal(forgedRead.data.state.admin.failedAttempts,0)
  assert.ok(forgedRead.data.state.attendants.every((a:any)=>a.failedAttempts===0&&a.lastAccess===undefined&&a.email===''))
  assert.ok(forgedRead.data.state.slots.every((s:any)=>s.reason===''))
  const {dbConfig}=await import('../lib/db')
  assert.equal(dbConfig('postgresql://u:p@127.0.0.1:5433/db').ssl,undefined)
  assert.equal(dbConfig('postgresql://u:p@dpg-abc123-a/db').ssl,undefined)
  assert.deepEqual(dbConfig('postgresql://u:p@dpg-abc123-a.singapore-postgres.render.com/db').ssl,{rejectUnauthorized:false})
})

test('concurrent payment and lost-response retry record one payment; expired sessions cannot pay',async()=>{
  const kiosk=new Browser(),exit=new Browser();await kiosk.call()
  await exit.call('signInExit',['ATT-002',attendantPin])
  await kiosk.call('claimSlot',['Car'])
  const issued=await kiosk.call('issueTicket');const ticket=issued.data.result.ticketId
  await exit.call('lookupTicket',[ticket])
  const id=randomUUID(),args=[ticket,{method:'Cash',tender:500}]
  const paid=await Promise.all([exit.call('completePayment',args,id),exit.call('completePayment',args,id)])
  assert.equal(paid[0].status,200);assert.equal(paid[1].status,200)
  assert.equal(paid[0].data.result.id,paid[1].data.result.id)
  assert.equal((await readState(testPool)).transactions.filter(t=>t.ticketId===ticket).length,1)
  const replay=await exit.call('completePayment',args,id)
  assert.equal(replay.data.result.id,paid[0].data.result.id)
  await testPool.query("UPDATE parking_auth SET expires_at=0 WHERE role='attendant'")
  assert.equal((await exit.call('completePayment',args)).status,403)
})

test('lost-ticket fee is charged once; refund retry is safe and excess refunds are rejected',async()=>{
  const kiosk=new Browser(),exit=new Browser(),admin=new Browser();await kiosk.call()
  await exit.call('signInExit',['ATT-002',attendantPin]);await admin.call('verifyAdminPin',[adminPin])
  await kiosk.call('claimSlot',['Other']);const issued=await kiosk.call('issueTicket');const session=issued.data.result
  await exit.call('openLostCheckout',[session.ticketId])
  const paymentId=randomUUID(),paymentArgs=[session.ticketId,{method:'Cash',tender:1000}]
  const paid=await exit.call('completePayment',paymentArgs,paymentId);const tx=paid.data.result
  assert.equal(tx.lostTicketFee,session.rate.lostFee)
  assert.equal(tx.amount,calcFee(session.rate,tx.minutes,session.grace,true).total)
  assert.equal((await exit.call('completePayment',paymentArgs,paymentId)).data.result.id,tx.id)
  const refundId=randomUUID(),refundArgs=[tx.id,10,'Overcharge','',adminPin]
  assert.equal((await admin.call('refundTransaction',refundArgs,refundId)).data.result.ok,true)
  assert.equal((await admin.call('refundTransaction',refundArgs,refundId)).data.result.ok,true)
  let saved=(await readState(testPool)).transactions.find(t=>t.id===tx.id)!
  assert.equal(saved.refunds?.length,1);assert.equal(netAmount(saved),tx.amount-10)
  assert.equal((await admin.call('refundTransaction',[tx.id,tx.amount,'Overcharge','',adminPin])).data.result.ok,false)
  assert.equal((await admin.call('voidTransaction',[tx.id,'Recorded in error','',adminPin])).data.result.ok,false)
  assert.equal((await admin.call('refundTransaction',[tx.id,tx.amount-10,'Overcharge','',adminPin])).data.result.ok,true)
  saved=(await readState(testPool)).transactions.find(t=>t.id===tx.id)!
  assert.equal(netAmount(saved),0);assert.equal(saved.refunds?.length,2)
  assert.equal((await admin.call('refundTransaction',[tx.id,0.01,'Overcharge','',adminPin])).data.result.ok,false)
})

test('full category rejects allocation without issuing a ticket or changing other categories',async()=>{
  const kiosk=new Browser();await kiosk.call()
  const client=await testPool.connect()
  try {
    await client.query('BEGIN');const before=await readState(client);const next=structuredClone(before)
    next.claims=next.claims.filter(c=>c.category!=='Van')
    next.slots=next.slots.map(s=>s.category==='Van'&&['available','claimed'].includes(s.status)?{...s,status:'unavailable',reason:'Full-capacity fixture'}:s)
    await saveState(client,before,next);await client.query('COMMIT')
  }finally{client.release()}
  const before=await readState(testPool)
  assert.equal((await kiosk.call('claimSlot',['Van'])).data.result,null)
  assert.equal((await kiosk.call('issueTicket')).data.result,null)
  const after=await readState(testPool)
  assert.equal(Object.keys(after.sessions).length,Object.keys(before.sessions).length)
  assert.equal(after.nextTicket,before.nextTicket)
  assert.deepEqual(after.slots,before.slots)
  assert.equal(after.transactions.length,before.transactions.length)
})

async function resetFixture() {
  const c=await testPool.connect()
  try {
    await c.query('BEGIN')
    await c.query('TRUNCATE parking_requests,parking_auth,parking_rate_limits,parking_audit,parking_payments,parking_sessions,parking_slots,parking_staff,parking_config')
    const s=buildSeed();s.admin={...credentials(adminPin),failedAttempts:0}
    s.attendants=s.attendants.map(a=>({...a,...credentials(attendantPin),mustChangePin:false,status:'Offline'}))
    await saveState(c,null,s);await c.query('COMMIT')
  }finally{c.release()}
}

test('every API command has explicit permissions; denied operations leave state unchanged',async()=>{
  const {adminCommands,exitCommands,kioskCommands,authCommands}=await import('../server/validation')
  const rate=buildSeed().rates.categories
  const args:Record<string,unknown[]>={
    addSlots:['Z','Other',1],updateSlot:['missing',{status:'available',category:'Car',reason:'Test'}],saveRates:[rate,5],
    addAttendant:[{name:'Test Staff',email:'test@example.test',lane:'Lane A',tempPin:'8275'}],updateAttendant:['ATT-001',{lane:'Lane B'}],
    resetAttendantPin:['ATT-001','8275'],setAttendantDisabled:['ATT-001',true],forceSignOutExit:[],changeAdminPin:[adminPin,'8275'],updateSettings:[{autoWelcome:false}],
    voidTransaction:['missing','Recorded in error','',adminPin],refundTransaction:['missing',1,'Overcharge','',adminPin],endSession:['missing','Vehicle towed or removed','',adminPin],
    setOwnPin:['8275'],lockExit:['manual'],startBreak:[],unlockExit:[attendantPin],signOutExit:[],touchExit:[],lookupTicket:['missing'],cancelCheckout:[],
    completePayment:['missing',{method:'Cash',tender:100}],openLostCheckout:['missing'],voidAndReopen:['missing','Wrong amount entered','',adminPin],
    claimSlot:['Other'],releaseClaim:[],issueTicket:[],verifyAdminPin:[adminPin],signInExit:['ATT-001',attendantPin],logout:[],touchAdmin:[],
  }
  const commands=[...adminCommands,...exitCommands,...kioskCommands,...authCommands]
  assert.deepEqual(Object.keys(args).sort(),[...commands].sort())
  for(const role of ['kiosk','attendant','admin'])for(const command of commands){
    await resetFixture();const b=new Browser();await b.call()
    if(role==='admin')await b.call('verifyAdminPin',[adminPin])
    if(role==='attendant')await b.call('signInExit',['ATT-001',attendantPin])
    const before=await readState(testPool)
    const allowed=command==='touchAdmin'?role==='admin':kioskCommands.includes(command)||authCommands.includes(command)||(role==='admin'&&adminCommands.includes(command))||(role==='attendant'&&exitCommands.includes(command))
    const response=await b.call(command,args[command])
    assert.equal(response.status,allowed?200:403,`${role}: ${command}`)
    if(!allowed)assert.deepEqual(await readState(testPool),before,`${role}: denied ${command} changed state`)
    if(allowed){assert.equal(response.data.state.admin.pinHash,'');assert.ok(response.data.state.attendants.every((a:any)=>!a.pinHash&&!a.pinSalt))}
  }
})

test('account lifecycle revokes old sessions and preserves new credentials',async()=>{
  await resetFixture();const admin=new Browser(),worker=new Browser();await admin.call('verifyAdminPin',[adminPin])
  await admin.call('addAttendant',[{name:'Lifecycle Test',email:'lifecycle@example.test',lane:'Lane A',tempPin:'8275'}])
  const id=(await readState(testPool)).attendants.find(a=>a.name==='Lifecycle Test')!.id
  assert.equal((await worker.call('signInExit',[id,'8275'])).data.result.ok,true)
  assert.equal((await worker.call('setOwnPin',['9362'])).data.result.ok,true)
  assert.equal((await worker.call()).data.state.attendants.find((a:any)=>a.id===id).mustChangePin,false)
  await worker.call('lockExit',['manual']);assert.equal((await worker.call('lookupTicket',['x'])).status,403)
  assert.equal((await worker.call('unlockExit',['9362'])).data.result.ok,true)
  await worker.call('startBreak');assert.equal((await worker.call('lookupTicket',['x'])).status,403)
  await worker.call('unlockExit',['9362'])
  await admin.call('setAttendantDisabled',[id,true]);assert.equal((await worker.call('lookupTicket',['x'])).status,403)
  assert.equal((await new Browser().call('signInExit',[id,'9362'])).data.result.error,'disabled')
  await admin.call('setAttendantDisabled',[id,false]);assert.equal((await worker.call('lookupTicket',['x'])).status,403)
  const second=new Browser();assert.equal((await second.call('signInExit',[id,'9362'])).data.result.ok,true)
  await admin.call('resetAttendantPin',[id,'7582']);assert.equal((await second.call('lookupTicket',['x'])).status,403)
  assert.equal((await new Browser().call('signInExit',[id,'9362'])).data.result.ok,false)
  const third=new Browser();await third.call('signInExit',[id,'7582']);await third.call('setOwnPin',['8642'])
  await admin.call('forceSignOutExit');assert.equal((await third.call('lookupTicket',['x'])).status,403)
  const fourth=new Browser();assert.equal((await fourth.call('signInExit',[id,'8642'])).data.result.ok,true)
  const stolen=new Browser();stolen.cookies=new Map(fourth.cookies)
  await fourth.call('logout');assert.equal((await stolen.call('lookupTicket',['x'])).status,403)
  const otherAdmin=new Browser();await otherAdmin.call('verifyAdminPin',[adminPin])
  await admin.call('changeAdminPin',[adminPin,'8275']);assert.equal((await otherAdmin.call('updateSettings',[{autoWelcome:false}])).status,403)
  assert.equal((await new Browser().call('verifyAdminPin',['8275'])).data.result.ok,true)
})

test('kiosks cannot read another device ticket or financial history',async()=>{
  await resetFixture();const a=new Browser(),b=new Browser();await a.call();await b.call()
  await a.call('claimSlot',['Other']);const ticket=(await a.call('issueTicket')).data.result.ticketId
  assert.ok((await a.call()).data.state.sessions[ticket]);const hidden=(await b.call()).data.state
  assert.equal(hidden.sessions[ticket],undefined);assert.deepEqual(hidden.transactions,[]);assert.deepEqual(hidden.activity,[])
})

test('malformed envelopes return 400 and leave facility records unchanged',async()=>{
  const before=await readState(testPool)
  for(const body of ['null','[]','true','"text"','{}']) {
    const response=await api.POST(new Request('http://localhost:3100/api/system',{method:'POST',headers:{host:'localhost:3100',origin:'http://localhost:3100','x-naga-request':'1'},body}))
    assert.equal(response.status,400)
  }
  assert.deepEqual(await readState(testPool),before)
})

test('six-minute supervisor reopen can be repaid; cached payment survives a different expired checkout',async()=>{
  await resetFixture()
  const kiosk=new Browser(),exit=new Browser();await kiosk.call()
  await exit.call('signInExit',['ATT-001',attendantPin])
  await kiosk.call('claimSlot',['Car']);const ticket=(await kiosk.call('issueTicket')).data.result.ticketId
  await exit.call('lookupTicket',[ticket])
  const tx=(await exit.call('completePayment',[ticket,{method:'Cash',tender:500}])).data.result
  const client=await testPool.connect()
  try {
    const before=await readState(client),next=structuredClone(before),saved=next.transactions.find(t=>t.id===tx.id)!
    saved.exit-=6*60000;saved.paidAt!-=6*60000
    next.sessions[ticket].payment!.paidAt=saved.paidAt!;next.sessions[ticket].exit=saved.exit
    await client.query('BEGIN');await saveState(client,before,next);await client.query('COMMIT')
  }finally{client.release()}
  assert.equal((await exit.call('voidAndReopen',[tx.id,'Wrong amount entered','',adminPin])).data.result.ok,true)
  const requestId=randomUUID(),args=[ticket,{method:'Cash',tender:500}]
  const paid=await exit.call('completePayment',args,requestId);assert.equal(paid.status,200);assert.ok(paid.data.result)
  await kiosk.call('claimSlot',['Car']);const other=(await kiosk.call('issueTicket')).data.result.ticketId
  await exit.call('lookupTicket',[other])
  await testPool.query("UPDATE parking_config SET data=jsonb_set(data,'{checkout,openedAt}',to_jsonb($1::bigint)) WHERE id=1",[Date.now()-6*60000])
  const replay=await exit.call('completePayment',args,requestId)
  assert.equal(replay.status,200);assert.equal(replay.data.result.id,paid.data.result.id)
  assert.equal((await exit.call('completePayment',[other,{method:'Cash',tender:500}])).status,409)
  const state=await readState(testPool)
  assert.equal(state.transactions.filter(t=>t.ticketId===ticket).length,2)
  assert.equal(state.sessions[ticket].status,'completed');assert.equal(state.sessions[other].status,'active')
})
