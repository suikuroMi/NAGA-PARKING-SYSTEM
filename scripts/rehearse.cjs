const {loadEnvConfig}=require('@next/env');loadEnvConfig(process.cwd());
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{randomUUID}=require('node:crypto'),{once}=require('node:events');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:3102';
const source=new URL(process.env.DATABASE_URL),database='naga_rehearsal_'+randomUUID().replace(/-/g,'').slice(0,12);
const isolated=new URL(source);isolated.pathname='/'+database;
const pgEnv={...process.env,PGHOST:source.hostname,PGPORT:source.port||'5432',PGUSER:decodeURIComponent(source.username),PGPASSWORD:decodeURIComponent(source.password),PGDATABASE:source.pathname.slice(1)};
const output=path.resolve('docs/rehearsal-results.json');
let server,browser;
function run(tool,args){return new Promise((resolve,reject)=>{
  const file=path.join(process.env.PG_BIN||'',tool+(process.platform==='win32'?'.exe':''));
  const child=spawn(file,args,{env:pgEnv,stdio:'inherit',windowsHide:true});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(tool+' failed')));
})}
async function stop(){if(server&&server.exitCode===null){const ended=once(server,'exit');server.kill();await ended}server=null}
async function start(){
  const began=performance.now();
  server=spawn(process.execPath,['scripts/rehearsal-server.cjs'],{env:{...process.env,DATABASE_URL:isolated.toString()},windowsHide:true,stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('Rehearsal server startup timed out')),30000);
    server.stdout.on('data',chunk=>{if(chunk.toString().includes('REHEARSAL_READY')){clearTimeout(timeout);resolve()}});
    server.once('error',error=>{clearTimeout(timeout);reject(error)});
    server.once('exit',code=>{clearTimeout(timeout);reject(Error('Rehearsal server exited: '+code))});
    server.stderr.on('data',chunk=>process.stderr.write(chunk));
  });
  return Math.round(performance.now()-began);
}
async function signIn(page,role){
  await page.goto(base+'/'+(role==='admin'?'admin':'exit'));
  await page.getByRole('heading',{name:role==='admin'?'Administrator sign-in':'Sign in to Terminal 01',exact:true}).waitFor();
  if(role!=='admin')await page.getByRole('button',{name:/Maria Santos/}).click();
  const pin=role==='admin'?process.env.INITIAL_ADMIN_PIN:process.env.INITIAL_PIN_ATT_001;
  for(const digit of pin)await page.getByRole('button',{name:digit,exact:true}).click();
  await page.getByRole('heading',{name:role==='admin'?'Parking operations overview':'Ready for the next vehicle',exact:true}).waitFor();
}
async function main(){
  const backup=process.argv[2]||fs.readdirSync('backups').filter(f=>/^verified-.*\.dump$/.test(f)).sort().at(-1);
  if(!backup)throw Error('Run npm run db:verify-recovery first.');
  const file=process.argv[2]?path.resolve(backup):path.resolve('backups',backup);
  assert.ok(fs.existsSync(file),'Backup file not found');
  await run('createdb',[database]);await run('pg_restore',['--exit-on-error','--no-owner','--dbname',database,file]);
  const report={executedAt:new Date().toISOString(),kind:'Automated production-browser rehearsal, not human presentation timing',database,rounds:[]};
  const firstStartMs=await start();
  browser=await chromium.launch({headless:true,channel:'chrome'});
  for(let round=1;round<=3;round++){
    const began=performance.now(),errors=[];
    const kiosk=await browser.newPage(),phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),admin=await browser.newPage();
    for(const page of[kiosk,phone,admin])page.on('pageerror',error=>errors.push(error.message));
    await signIn(admin,'admin');await signIn(phone,'attendant');
    await kiosk.goto(base+'/kiosk');await kiosk.getByRole('button',{name:'Start parking',exact:true}).click();
    await kiosk.getByRole('button',{name:/^Motorcycle /}).click();await kiosk.getByRole('button',{name:'Continue to QR ticket',exact:true}).click();
    await kiosk.getByRole('heading',{name:'Your parking ticket is ready',exact:true}).waitFor();
    const issued=await kiosk.evaluate(()=>fetch('/api/system').then(r=>r.json()));const ticket=issued.state.lastIssued;
    assert.ok(ticket);const slot=issued.state.sessions[ticket].slotId;
    await phone.getByPlaceholder('NSP-YYYYMMDD-0000').fill(ticket);await phone.getByRole('button',{name:'Find ticket',exact:true}).click();
    await phone.getByRole('button',{name:'Proceed to fee review',exact:true}).click();await phone.getByRole('button',{name:'Confirm payment',exact:true}).click();
    await phone.getByLabel('Cash received (PHP)',{exact:true}).fill('500');await phone.locator('label').filter({hasText:'I received'}).click();
    await phone.getByRole('button',{name:'Confirm received & complete',exact:true}).click();await phone.getByRole('heading',{name:'Payment completed',exact:true}).waitFor();
    await admin.goto(base+'/admin#/admin/transactions?ticket='+ticket);await admin.locator('tbody').first().getByText(ticket,{exact:true}).waitFor();
    let state=(await admin.evaluate(()=>fetch('/api/system').then(r=>r.json()))).state;
    assert.equal(state.transactions.filter(t=>t.ticketId===ticket).length,1);assert.equal(state.slots.find(s=>s.id===slot).status,'available');
    assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
    const workflowMs=Math.round(performance.now()-began);
    await stop();await phone.getByText('Connection lost · Actions require server confirmation. Reconnecting…',{exact:true}).waitFor();
    const restartMs=await start();await phone.getByText('Connected · Shared facility records',{exact:true}).waitFor();
    await admin.reload();await admin.locator('tbody').first().getByText(ticket,{exact:true}).waitFor();
    state=(await admin.evaluate(()=>fetch('/api/system').then(r=>r.json()))).state;
    assert.equal(state.transactions.filter(t=>t.ticketId===ticket).length,1);assert.equal(state.sessions[ticket].status,'completed');
    assert.deepEqual(errors,[]);
    report.rounds.push({round,ticket,workflowMs,appRestartMs:restartMs,firstStartMs:round===1?firstStartMs:undefined,paymentCount:1,spaceReleased:true,outageBanner:true,reconnected:true,persistedAfterRestart:true,pageErrors:errors});
    console.log('PASS rehearsal '+round+': workflow '+workflowMs+'ms; app restart '+restartMs+'ms');
    await Promise.all([kiosk.close(),phone.close(),admin.close()]);
  }
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log('Evidence: '+output);
}
main().catch(error=>{console.error(error.message);process.exitCode=1}).finally(async()=>{await browser?.close();await stop()});
