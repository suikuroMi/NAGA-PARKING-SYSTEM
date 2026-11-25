import { loadEnvConfig } from '@next/env'
import { Pool } from 'pg'
import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { buildSeed } from '../store/seed'
import { saveState } from '../server/repository'
import { credentials } from '../server/credentials'

loadEnvConfig(process.cwd())
const require = createRequire(import.meta.url)
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const name = 'naga_rehearsal_' + randomUUID().replace(/-/g, '').slice(0, 12)
const source = new URL(process.env.DATABASE_URL!)
const managementUrl = new URL(source); managementUrl.pathname = '/postgres'
const testUrl = new URL(source); testUrl.pathname = '/' + name
const management = new Pool({connectionString: managementUrl.toString()})
const db = new Pool({connectionString: testUrl.toString()})
let server: ChildProcess | undefined, browser: any, created = false
const checks: string[] = []
const responsiveFailures: unknown[] = []
const pass = (name: string) => {checks.push(name); console.log('PASS ' + name)}
async function checkFit(page:any,label:string) {
  const result=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    overflow:Array.from(document.querySelectorAll('body *')).filter(el=>{const r=el.getBoundingClientRect();return r.right>innerWidth+2||r.left<0}).slice(0,12).map(el=>({tag:el.tagName,classes:el.className,text:el.textContent?.slice(0,55)}))}))
  if(result.scrollWidth>result.width+2){responsiveFailures.push({label,...result});console.log('LAYOUT '+JSON.stringify({label,...result}));await page.screenshot({path:'docs/quality-evidence/layout-failure-'+responsiveFailures.length+'.png',fullPage:true,animations:'disabled'})}
}
async function checkPhoneWidths(page:any,label:string) {
  const original=page.viewportSize()
  for(const width of [390,320]){await page.setViewportSize({width,height:844});await checkFit(page,label+' '+width)}
  await page.setViewportSize(original)
}

async function main() {
  await management.query(`CREATE DATABASE ${name}`); created = true
  const state = buildSeed()
  for (const staff of state.attendants) Object.assign(staff, credentials('5839'), {mustChangePin:false,status:'Offline'})
  state.admin = {...credentials('7294'), failedAttempts: 0}
  const client = await db.connect()
  try {
    await client.query('BEGIN'); await client.query(readFileSync('server/schema.sql', 'utf8'))
    await saveState(client, null, state); await client.query('COMMIT')
  } finally {client.release()}
  server = spawn(process.execPath, ['scripts/rehearsal-server.cjs'], {
    env: {...process.env, DATABASE_URL: testUrl.toString()}, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']})
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Isolated report server did not start')), 60000)
    server!.stdout!.on('data', data => {if (String(data).includes('REHEARSAL_READY')) {clearTimeout(timer); resolve()}})
    server!.once('exit', () => {clearTimeout(timer); reject(Error('Isolated report server exited'))})
    server!.once('error', reject)
  })
  browser = await chromium.launch({headless: true, channel: 'chrome'})

  const audit = process.argv.includes('--audit')
  const page = await browser.newPage({viewport: {width: 1280, height: 900}})
  const errors: string[] = [], external: string[] = [], layouts: any[] = []
  page.on('pageerror', (e: Error) => errors.push(e.message))
  page.on('request', (r: any) => {if(!r.url().startsWith('http://127.0.0.1:3102')) external.push(r.url())})
  await page.goto('http://127.0.0.1:3102/admin')
  for (const digit of '7294') await page.getByRole('button', {name:digit,exact:true}).click()
  await page.getByRole('heading',{name:'Parking operations overview',exact:true}).waitFor()
  mkdirSync('docs/quality-evidence',{recursive:true})
  for (const width of [1280,390,320]) {
    await page.setViewportSize({width,height:900})
    for (const route of ['', '/map','/slots','/sessions','/rates','/transactions','/reports','/attendants','/settings']) {
      await page.goto('http://127.0.0.1:3102/admin#/admin'+route)
      await page.locator('main h1').waitFor()
      await page.waitForTimeout(150)
      const layout = await page.evaluate(() => ({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,scrollX,
        offenders:Array.from(document.querySelectorAll('body *')).filter(el=>{const r=el.getBoundingClientRect();return r.right>innerWidth+2&&getComputedStyle(el).position!=='fixed'}).slice(0,8).map(el=>({tag:el.tagName,classes:el.className,text:el.textContent?.slice(0,60)}))}))
      layouts.push({route:'/admin'+route,...layout})
      if((route==='/rates'&&width===320)||((route==='/reports'||route==='/settings'||route==='/transactions')&&width===390))await page.screenshot({path:'docs/quality-evidence/'+(audit?'before-':'after-')+route.slice(1)+'.png',fullPage:true,animations:'disabled'})
    }
  }
  const failures=layouts.filter(x=>x.scrollWidth>x.width+2)
  if(audit){writeFileSync('docs/quality-before.json',JSON.stringify({failures,errors,external:[...new Set(external)]},null,2));console.log(JSON.stringify({failures,errors},null,2));return}
  assert.deepEqual(failures,[],'Admin pages must fit laptop and narrow phone widths')
  pass('All nine administrator pages fit 1280px, 390px and 320px viewports')
  await page.setViewportSize({width:1280,height:900})
  await page.goto('http://127.0.0.1:3102/admin#/admin/attendants')
  const trigger=page.getByRole('button',{name:'Add account',exact:true})
  await trigger.click();const dialog=page.getByRole('dialog')
  await dialog.waitFor()
  assert.equal(await dialog.evaluate((d:HTMLElement)=>d.contains(document.activeElement)),true)
  for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.equal(await dialog.evaluate((d:HTMLElement)=>d.contains(document.activeElement)),true)}
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'})
  assert.equal(await trigger.evaluate((b:HTMLElement)=>b===document.activeElement),true)
  pass('Dialog focus stays inside, Escape closes, and focus returns to its trigger')
  await page.setViewportSize({width:390,height:844})
  await page.getByRole('button',{name:'Open menu',exact:true}).click()
  for(let i=0;i<15;i++){await page.keyboard.press('Tab');assert.equal(await page.locator('aside').evaluate((el:HTMLElement)=>el.contains(document.activeElement)),true)}
  await page.getByRole('button',{name:'Close menu',exact:true}).click()
  assert.equal(await page.locator('aside').evaluate((el:HTMLElement)=>getComputedStyle(el).visibility),'hidden')
  const stationTrigger=page.getByRole('button',{name:'Switch station',exact:true})
  await stationTrigger.click()
  assert.equal(await page.getByRole('menuitem',{name:'Close station menu',exact:true}).evaluate((el:HTMLElement)=>el===document.activeElement),true)
  await page.keyboard.press('ArrowDown')
  assert.equal(await page.getByRole('menuitem',{name:'Entrance kiosk',exact:true}).evaluate((el:HTMLElement)=>el===document.activeElement),true)
  await page.keyboard.press('Escape')
  assert.equal(await stationTrigger.evaluate((el:HTMLElement)=>el===document.activeElement),true)
  pass('Station switcher supports arrow keys and Escape with focus restoration')
  const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
  phone.on('pageerror',(e:Error)=>errors.push(e.message))
  phone.on('request',(r:any)=>{if(!r.url().startsWith('http://127.0.0.1:3102'))external.push(r.url())})
  const cameraDiagnostics:string[]=[]
  phone.on('console',(message:any)=>{if(message.type()==='error'||message.type()==='warning')cameraDiagnostics.push(message.text())})
  phone.on('requestfailed',(request:any)=>cameraDiagnostics.push(request.url()+': '+request.failure()?.errorText))
  await phone.goto('http://127.0.0.1:3102/exit')
  await phone.getByRole('button',{name:/Maria Santos/}).click()
  for(const digit of '5839')await phone.getByRole('button',{name:digit,exact:true}).click()
  await phone.getByRole('heading',{name:'Ready for the next vehicle',exact:true}).waitFor()
  const accountMenu=phone.getByRole('button',{name:'Attendant account menu',exact:true})
  await accountMenu.click()
  assert.equal(await phone.getByRole('menuitem',{name:'Lock terminal',exact:true}).evaluate((el:HTMLElement)=>el===document.activeElement),true)
  await phone.keyboard.press('ArrowDown')
  assert.equal(await phone.getByRole('menuitem',{name:'Take a break',exact:true}).evaluate((el:HTMLElement)=>el===document.activeElement),true)
  await checkPhoneWidths(phone,'Attendant account menu')
  await phone.keyboard.press('Escape')
  assert.equal(await accountMenu.evaluate((el:HTMLElement)=>el===document.activeElement),true)
  await phone.getByRole('link',{name:'Skip to main content',exact:true}).focus()
  await phone.keyboard.press('Enter')
  assert.equal(await phone.locator('main').evaluate((el:HTMLElement)=>el===document.activeElement),true)
  pass('Attendant menu supports keyboard navigation and Escape focus restoration; skip link focuses main content')
  for(const width of [1280,390,320]){
    await phone.setViewportSize({width,height:844})
    await checkFit(phone,'Exit dashboard '+width)
  }
  await phone.setViewportSize({width:390,height:844})
  const kiosk=await browser.newPage()
  kiosk.on('pageerror',(e:Error)=>errors.push(e.message))
  kiosk.on('request',(r:any)=>{if(!r.url().startsWith('http://127.0.0.1:3102'))external.push(r.url())})
  await kiosk.bringToFront()
  await kiosk.goto('http://127.0.0.1:3102/kiosk')
  await checkPhoneWidths(kiosk,'Kiosk welcome')
  await kiosk.getByRole('button',{name:'Start parking',exact:true}).click()
  await checkPhoneWidths(kiosk,'Kiosk vehicle selection')
  await kiosk.getByRole('button',{name:/^Motorcycle /}).click()
  await kiosk.getByRole('button',{name:'Continue to QR ticket',exact:true}).waitFor()
  await checkPhoneWidths(kiosk,'Kiosk assigned space')
  await kiosk.getByRole('button',{name:'Continue to QR ticket',exact:true}).click()
  await kiosk.getByRole('heading',{name:'Your parking ticket is ready',exact:true}).waitFor()
  for(const width of [1280,390,320]){
    await kiosk.setViewportSize({width,height:844})
    await checkFit(kiosk,'Kiosk ticket '+width)
  }
  assert.equal(await kiosk.locator('.skip-link').evaluate((el:HTMLElement)=>el.getBoundingClientRect().bottom<=0),true,'Unfocused skip link stays outside the viewport')
  await kiosk.screenshot({path:'docs/quality-evidence/kiosk-ticket-320.png',fullPage:true,animations:'disabled'})
  await kiosk.setViewportSize({width:1280,height:900})
  const issued=await kiosk.evaluate(()=>fetch('/api/system').then(r=>r.json())),ticket=issued.state.lastIssued
  const qr = 'data:image/png;base64,'+(await kiosk.getByRole('img',{name:'QR code for '+ticket,exact:true}).screenshot({animations:'disabled'})).toString('base64')
  await phone.evaluate(`(async (url)=>{
    const image=new Image();image.src=url;await image.decode()
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=640
    const ctx=canvas.getContext('2d');const draw=()=>{ctx.fillStyle='white';ctx.fillRect(0,0,640,640);ctx.drawImage(image,170,170,300,300)}
    draw();const stream=canvas.captureStream(30),track=stream.getVideoTracks()[0]
    const timer=setInterval(()=>{if(track.readyState==='ended')clearInterval(timer);else draw()},33)
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>stream})
    Object.defineProperty(navigator.mediaDevices,'enumerateDevices',{configurable:true,value:async()=>[{kind:'videoinput',deviceId:'test-camera',label:'Synthetic QR camera',groupId:'test'}]})
    window.__testCameraStream=stream
    window.__testCameraTrack=stream.getVideoTracks()[0]
  })(${JSON.stringify(qr)})`)
  await phone.bringToFront()
  await phone.getByRole('button',{name:'Scan with camera',exact:true}).click()
  await phone.getByRole('button',{name:'Proceed to fee review',exact:true}).waitFor({timeout:20000}).catch(async(error:Error)=>{
    await phone.screenshot({path:'docs/quality-evidence/camera-failure.png',fullPage:true,animations:'disabled'})
    console.log(JSON.stringify({cameraDiagnostics,body:await phone.locator('main').innerText(),video:await phone.locator('video').evaluateAll((videos:HTMLVideoElement[])=>videos.map(v=>({width:v.videoWidth,height:v.videoHeight,paused:v.paused,ready:v.readyState})))},null,2))
    throw error
  })
  await phone.waitForFunction(()=>(window as any).__testCameraTrack.readyState==='ended')
  pass('Real scanner decodes a synthetic camera QR frame and stops its video track')
  await phone.getByRole('button',{name:'Proceed to fee review',exact:true}).click()
  await phone.getByRole('button',{name:'Confirm payment',exact:true}).click()
  await db.query("UPDATE parking_config SET data=jsonb_set(data,'{checkout,openedAt}',to_jsonb($1::bigint)) WHERE id=1",[Date.now()-6*60000])
  await phone.getByText('Fee quote expired',{exact:true}).waitFor({timeout:15000})
  assert.equal(await phone.getByRole('button',{name:'Confirm received & complete',exact:true}).isDisabled(),true)
  await phone.getByRole('button',{name:'Review updated fee',exact:true}).click()
  await phone.getByRole('button',{name:'Proceed to fee review',exact:true}).click()
  await phone.getByRole('button',{name:'Confirm payment',exact:true}).click()
  await phone.getByLabel('Cash received (PHP)',{exact:true}).fill('500.001')
  assert.equal(await phone.getByRole('button',{name:'Confirm received & complete',exact:true}).isDisabled(),true)
  pass('Expired checkout refreshes safely; malformed cash input cannot be confirmed')
  await phone.getByLabel('Cash received (PHP)',{exact:true}).fill('500')
  await phone.locator('label').filter({hasText:'I received'}).click()
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false)
  await phone.screenshot({path:'docs/quality-evidence/phone-payment.png',fullPage:true,animations:'disabled'})
  await phone.getByRole('button',{name:'Confirm received & complete',exact:true}).click()
  await phone.getByRole('heading',{name:'Payment completed',exact:true}).waitFor()
  await checkPhoneWidths(phone,'Payment receipt')
  const saved=await phone.evaluate(()=>fetch('/api/system').then(r=>r.json()))
  assert.equal(saved.state.transactions.filter((t:any)=>t.ticketId===ticket).length,1)
  assert.equal(saved.state.slots.find((s:any)=>s.id===issued.state.sessions[ticket].slotId).status,'available')
  pass('Laptop kiosk to phone-sized cash payment records once and releases the space')
  await phone.getByRole('button',{name:'Void and redo payment · supervisor',exact:true}).click()
  const override=phone.getByRole('dialog',{name:'Supervisor override',exact:true})
  await override.getByLabel('Wrong amount entered',{exact:true}).check()
  for(const digit of '7294')await override.getByRole('button',{name:digit,exact:true}).click()
  await phone.getByLabel('Cash received (PHP)',{exact:true}).fill('500')
  await phone.locator('label').filter({hasText:'I received'}).click()
  await phone.getByRole('button',{name:'Confirm received & complete',exact:true}).click()
  await phone.getByRole('heading',{name:'Payment completed',exact:true}).waitFor()
  const repaid=(await phone.evaluate(()=>fetch('/api/system').then(r=>r.json()))).state
  assert.equal(repaid.transactions.filter((t:any)=>t.ticketId===ticket).length,2)
  assert.equal(repaid.transactions.filter((t:any)=>t.ticketId===ticket&&!t.voided).length,1)
  assert.equal(repaid.sessions[ticket].status,'completed')
  pass('Supervisor UI voids and reopens; repayment leaves one effective payment and one completed session')
  await phone.goto('http://127.0.0.1:3102/exit')
  await phone.bringToFront()
  await phone.evaluate(`(()=>{
    Object.defineProperty(navigator.permissions,'query',{configurable:true,value:async()=>({state:'denied'})});
    Object.defineProperty(navigator.mediaDevices,'enumerateDevices',{configurable:true,value:async()=>[{kind:'videoinput',deviceId:'test-camera',label:'Test camera',groupId:'test'}]});
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{throw new DOMException('Permission denied','NotAllowedError')}});
  })()`)
  await phone.getByRole('button',{name:'Scan with camera',exact:true}).click()
  await phone.getByText('Camera blocked',{exact:true}).waitFor()
  await phone.screenshot({path:'docs/quality-evidence/camera-denied.png',fullPage:true,animations:'disabled'})
  await phone.getByPlaceholder('NSP-YYYYMMDD-0000').fill(ticket)
  await phone.getByRole('button',{name:'Find ticket',exact:true}).click()
  await phone.getByRole('heading',{name:'This ticket has already been paid',exact:true}).waitFor()
  pass('Camera denial has clear guidance; manual lookup detects an already-paid ticket without charging')
  await page.goto('http://127.0.0.1:3102/admin#/admin/transactions?ticket='+ticket)
  await page.getByRole('button',{name:'Refund',exact:true}).click()
  const refund=page.getByRole('dialog',{name:'Issue refund',exact:true})
  await refund.getByLabel('Overcharge',{exact:true}).check()
  await refund.getByLabel('Administrator PIN',{exact:true}).fill('7294')
  await refund.getByLabel(/Refund amount/).fill('0.015')
  assert.equal(await refund.getByRole('button',{name:'Issue refund',exact:true}).isDisabled(),true)
  await refund.getByLabel(/Refund amount/).fill('1.25')
  await refund.getByRole('button',{name:'Issue refund',exact:true}).click()
  await refund.waitFor({state:'hidden'})
  const corrected=(await page.evaluate(()=>fetch('/api/system').then(r=>r.json()))).state.transactions.find((t:any)=>t.ticketId===ticket&&!t.voided)
  assert.equal(corrected.refunds.length,1);assert.equal(corrected.refunds[0].amount,1.25)
  pass('Refund UI rejects fractional centavos and saves the exact authorized refund')
  await kiosk.goto('http://127.0.0.1:3102/kiosk')
  await kiosk.getByRole('button',{name:'Start parking',exact:true}).click()
  await kiosk.getByRole('button',{name:/^Car /}).click()
  await kiosk.getByRole('button',{name:'Continue to QR ticket',exact:true}).click()
  await kiosk.getByRole('heading',{name:'Your parking ticket is ready',exact:true}).waitFor()
  const digitalTicket=(await kiosk.evaluate(()=>fetch('/api/system').then(r=>r.json()))).state.lastIssued
  await phone.goto('http://127.0.0.1:3102/exit')
  await phone.getByPlaceholder('NSP-YYYYMMDD-0000').fill(digitalTicket)
  await phone.getByRole('button',{name:'Find ticket',exact:true}).click()
  await phone.getByRole('button',{name:'Proceed to fee review',exact:true}).click()
  await phone.getByRole('button',{name:'Confirm payment',exact:true}).click()
  await phone.getByRole('radio',{name:'Digital',exact:true}).click()
  await phone.getByLabel('GCash reference number',{exact:true}).fill('QUALITY123456')
  await phone.locator('label').filter({hasText:'I verified the GCash'}).click()
  await phone.getByRole('button',{name:'Confirm received & complete',exact:true}).click()
  await phone.getByRole('heading',{name:'Payment completed',exact:true}).waitFor()
  const digital=(await phone.evaluate(()=>fetch('/api/system').then(r=>r.json()))).state.transactions.filter((t:any)=>t.ticketId===digitalTicket)
  assert.equal(digital.length,1);assert.equal(digital[0].method,'Digital');assert.equal(digital[0].reference,'QUALITY123456')
  pass('Manual lookup and recorded digital-payment UI save one payment with its reference')
  await kiosk.getByRole('button',{name:'Done',exact:true}).click()
  await checkPhoneWidths(kiosk,'Kiosk ready to park')
  await phone.context().setOffline(true)
  await phone.getByText('Connection lost · Actions require server confirmation. Reconnecting…',{exact:true}).waitFor({timeout:15000})
  await phone.context().setOffline(false)
  await phone.getByText('Connected · Shared facility records',{exact:true}).waitFor({timeout:15000})
  pass('Phone-sized browser reports disconnection and automatically reconnects')
  assert.deepEqual(errors,[])
  assert.deepEqual(responsiveFailures,[])
  pass('Kiosk ticket and attendant dashboard fit laptop, 390px and 320px widths')
  assert.equal(external.filter(url=>/fonts.googleapis|fonts.gstatic/.test(url)).length,0)
  pass('No browser exceptions or external font requests')
  writeFileSync('docs/quality-results.json',JSON.stringify({executedAt:new Date().toISOString(),isolatedDatabase:true,checks,layouts:layouts.map(({offenders,...x})=>x)},null,2)+'\n')

}

main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
  await browser?.close()
  if (server && server.exitCode === null) {const stopped = once(server, 'exit'); server.kill(); await stopped}
  await db.end()
  if (created) await management.query(`DROP DATABASE ${name} WITH (FORCE)`)
  await management.end()
})
