require('@next/env').loadEnvConfig(process.cwd());
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{randomBytes,randomUUID}=require('node:crypto'),{once}=require('node:events'),{Client}=require('pg');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const token=randomUUID().replace(/-/g,'').slice(0,12),database='naga_rehearsal_'+token;
const folder=path.resolve('.runtime','reliability-'+token),dataDir=path.join(folder,'data');
const adminPin='7294',staffPin='5839',base='http://127.0.0.1:3102';
let port,url,env,server,browser,db,running=false;
const checks=[];const pass=name=>{checks.push(name);console.log('PASS '+name)};
function exec(file,args,customEnv=env){return new Promise((resolve,reject)=>{const child=spawn(file,args,{env:customEnv||process.env,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(path.basename(file)+' failed: '+code)))})}
const bin=name=>path.join(process.env.PG_BIN,name+(process.platform==='win32'?'.exe':''));
async function startDb(){await exec(bin('pg_ctl'),['-D',dataDir,'-l',path.join(folder,'postgresql.log'),'-o','-h 127.0.0.1 -p '+port,'start']);running=true}
async function stopDb(){if(running){await exec(bin('pg_ctl'),['-D',dataDir,'-m','fast','stop']);running=false}}
async function connectDb(){db=new Client({connectionString:url});db.on('error',()=>{});await db.connect()}
async function stopServer(){if(server&&server.exitCode===null){const ended=once(server,'exit');server.kill();await ended}server=null}
async function startServer(){
 server=spawn(process.execPath,['scripts/rehearsal-server.cjs'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timed out')),30000);server.stdout.on('data',c=>{if(c.toString().includes('REHEARSAL_READY')){clearTimeout(timer);resolve()}});server.stderr.on('data',c=>process.stderr.write(c));server.once('error',reject);server.once('exit',c=>{clearTimeout(timer);reject(Error('Server exited '+c))})});
}
async function call(page,command,args=[],id=randomUUID()){
 return page.evaluate(async({command,args,id})=>{const r=await fetch('/api/system',command?{method:'POST',headers:{'Content-Type':'application/json','X-Naga-Request':'1'},body:JSON.stringify({command,args,id})}:{});return {status:r.status,data:await r.json()}},{command,args,id});
}
async function stats(){return (await db.query(`SELECT
 (SELECT count(*) FROM parking_sessions) sessions,(SELECT count(*) FROM parking_payments) payments,
 (SELECT coalesce(jsonb_agg(data ORDER BY id),'[]') FROM parking_payments) payment_data,
 (SELECT coalesce(jsonb_agg(data ORDER BY id),'[]') FROM parking_slots) slots`)).rows[0]}
async function fault(table,on){
 if(on){await db.query("CREATE OR REPLACE FUNCTION reliability_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected precommit failure'; END $$");await db.query(`CREATE CONSTRAINT TRIGGER reliability_fail AFTER INSERT OR UPDATE ON ${table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reliability_fail()`)}
 else await db.query(`DROP TRIGGER reliability_fail ON ${table}`);
}
async function resilient(page,command,args,table){
 const id=randomUUID();const before=await stats();
 await page.context().setOffline(true);await assert.rejects(call(page,command,args,id));await page.context().setOffline(false);assert.deepEqual(await stats(),before);
 await fault(table,true);assert.equal((await call(page,command,args,id)).status,503);assert.deepEqual(await stats(),before);await fault(table,false);
 await db.end();await stopDb();assert.equal((await call(page,command,args,id)).status,503);await startDb();await connectDb();assert.deepEqual(await stats(),before);
 let committed;
 const handler=async route=>{const body=route.request().postDataJSON();if(body.id===id){committed=await route.fetch();await route.abort('failed')}else await route.continue()};
 await page.route('**/api/system',handler);await assert.rejects(call(page,command,args,id));await page.unroute('**/api/system',handler);
 assert.equal(committed.status(),200);const saved=await stats();const retry=await call(page,command,args,id);assert.equal(retry.status,200);assert.deepEqual(await stats(),saved);
 pass(command+': offline, precommit rollback, real database stop, lost-response retry');return retry.data.result;
}
async function pin(page,value){for(const digit of value)await page.getByRole('button',{name:digit,exact:true}).click()}
async function accounts(admin,worker){
 await admin.goto(base+'/admin#/admin/attendants');await admin.getByRole('button',{name:'Add account',exact:true}).click();
 await admin.getByLabel('Full name',{exact:true}).fill('Reliability Staff');await admin.getByLabel('Work email',{exact:true}).fill('reliability@example.test');await admin.getByLabel('Temporary PIN',{exact:true}).fill('8275');await admin.getByRole('button',{name:'Create account',exact:true}).click();
 await admin.getByRole('dialog').waitFor({state:'hidden'});
 await admin.getByPlaceholder('Search by name or ID').fill('Reliability Staff');await admin.locator('tbody').getByText('Reliability Staff',{exact:true}).waitFor();
 await worker.goto(base+'/exit');await worker.getByRole('button',{name:/Reliability Staff/}).click();await pin(worker,'8275');await worker.getByText('Enter a new PIN',{exact:true}).waitFor();await pin(worker,'9362');await worker.getByText('Confirm your new PIN',{exact:true}).waitFor();await pin(worker,'9362');await worker.getByRole('heading',{name:'Ready for the next vehicle',exact:true}).waitFor();
 await admin.locator('tbody tr').filter({has:admin.getByText('Reliability Staff',{exact:true})}).getByRole('button',{name:'Manage',exact:true}).click();await admin.getByRole('button',{name:'Deactivate account',exact:true}).click();await admin.getByRole('button',{name:'Deactivate',exact:true}).click();await worker.getByRole('heading',{name:'Sign in to Terminal 01',exact:true}).waitFor();
 await admin.getByRole('button',{name:'Reactivate account',exact:true}).click();await admin.getByLabel('Temporary PIN',{exact:true}).fill('7582');await admin.getByRole('button',{name:'Reset PIN',exact:true}).click();await admin.getByRole('button',{name:'Close',exact:true}).last().click();await admin.reload();await admin.getByPlaceholder('Search by name or ID').fill('Reliability Staff');await admin.locator('tbody').getByText('Reliability Staff',{exact:true}).waitFor();
 await worker.reload();await worker.getByRole('button',{name:/Reliability Staff/}).click();await pin(worker,'7582');await worker.getByText('Enter a new PIN',{exact:true}).waitFor();await pin(worker,'8642');await worker.getByText('Confirm your new PIN',{exact:true}).waitFor();await pin(worker,'8642');await worker.getByRole('heading',{name:'Ready for the next vehicle',exact:true}).waitFor();
 pass('account UI: create, required PIN change, disable, re-enable, reset and reload');
}
async function main(){
 fs.mkdirSync(folder,{recursive:true});const pw=randomBytes(24).toString('hex');fs.writeFileSync(path.join(folder,'password.txt'),pw);
 port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
 url=`postgresql://reliability:${pw}@127.0.0.1:${port}/${database}`;
 env={...process.env,DATABASE_URL:url,PGHOST:'127.0.0.1',PGPORT:String(port),PGUSER:'reliability',PGPASSWORD:pw,PGDATABASE:database,INITIAL_ADMIN_PIN:adminPin,INITIAL_PIN_ATT_001:staffPin,INITIAL_PIN_ATT_002:'6938',INITIAL_PIN_ATT_003:'4739',INITIAL_PIN_ATT_004:'7249'};
 await exec(bin('initdb'),['-D',dataDir,'-U','reliability','--auth=scram-sha-256','--pwfile='+path.join(folder,'password.txt'),'--encoding=UTF8','--no-locale']);await startDb();await exec(bin('createdb'),[database]);
 await exec(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/database.ts','--demo']);await connectDb();await startServer();
 browser=await chromium.launch({headless:true,channel:'chrome'});const kiosk=await browser.newPage(),exit=await browser.newPage(),admin=await browser.newPage();
 for(const p of[kiosk,exit,admin])await p.goto(base+'/');
 await call(admin,'verifyAdminPin',[adminPin]);await call(exit,'signInExit',['ATT-001',staffPin]);
 await call(kiosk,'claimSlot',['Other']);const session=await resilient(kiosk,'issueTicket',[],'parking_sessions');
 await call(exit,'lookupTicket',[session.ticketId]);const tx=await resilient(exit,'completePayment',[session.ticketId,{method:'Cash',tender:500}],'parking_payments');
 await resilient(admin,'refundTransaction',[tx.id,10,'Overcharge','',adminPin],'parking_payments');
 const saved=(await call(admin)).data.state;assert.equal(saved.transactions.filter(t=>t.id===tx.id).length,1);assert.equal(saved.transactions.find(t=>t.id===tx.id).refunds.length,1);assert.equal(saved.slots.find(s=>s.id===session.slotId).status,'available');
 const worker=await browser.newPage();await accounts(admin,worker);
 // A delayed poll must not replace state confirmed by a later mutation.
 await kiosk.goto(base+'/kiosk');await kiosk.getByRole('button',{name:'Start parking',exact:true}).waitFor();
 let release,seenResolve;const seen=new Promise(r=>seenResolve=r),held=new Promise(r=>release=r);let intercepted=false;
 const stale=async route=>{if(route.request().method()==='GET'&&!intercepted){intercepted=true;const response=await route.fetch();seenResolve();await held;await route.fulfill({response}).catch(()=>{})}else await route.continue()};
 await kiosk.route('**/api/system',stale);await seen;await kiosk.getByRole('button',{name:'Start parking',exact:true}).click();await kiosk.getByRole('button',{name:/^Other /}).click();await kiosk.getByRole('button',{name:'Continue to QR ticket',exact:true}).waitFor();release();await kiosk.waitForTimeout(300);assert.equal(await kiosk.getByRole('button',{name:'Continue to QR ticket',exact:true}).count(),1);await kiosk.unroute('**/api/system',stale);pass('stale polling response cannot discard a confirmed claim');
 // Drop the issuance response after commit and hold polling until the deadline fires.
 let posted=false,releaseResponse,requestBody;const delayed=new Promise(r=>releaseResponse=r);
 const lost=async route=>{const req=route.request();if(req.method()==='POST'&&req.postDataJSON().command==='issueTicket'&&!posted){posted=true;requestBody=req.postDataJSON();const response=await route.fetch();await delayed;await route.fulfill({response}).catch(()=>{})}else if(req.method()==='GET'&&posted){await delayed;await route.continue().catch(()=>{})}else await route.continue()};
 await kiosk.route('**/api/system',lost);const began=performance.now();await kiosk.getByRole('button',{name:'Continue to QR ticket',exact:true}).click();await kiosk.getByText(/not confirmed within 10 seconds/).waitFor({timeout:15000});assert.ok(performance.now()-began<14000);assert.ok(await kiosk.getByRole('button',{name:'Continue to QR ticket',exact:true}).isEnabled());releaseResponse();await kiosk.unroute('**/api/system',lost);
 await kiosk.getByRole('heading',{name:'Your parking ticket is ready',exact:true}).waitFor({timeout:15000});
 const recovered=(await call(kiosk,'issueTicket',[],requestBody.id)).data.result;assert.ok(recovered.ticketId);assert.equal((await db.query('SELECT count(*) FROM parking_sessions WHERE id=$1',[recovered.ticketId])).rows[0].count,'1');pass('deadline releases busy state; late issuance response recovers the existing ticket');
 fs.writeFileSync('docs/reliability-results.json',JSON.stringify({executedAt:new Date().toISOString(),isolatedCluster:true,checks},null,2)+'\n');
}
main().catch(error=>{console.error(error.stack);process.exitCode=1}).finally(async()=>{await browser?.close();await stopServer();await db?.end().catch(()=>{});await stopDb().catch(error=>console.error('Test cluster cleanup failed:',error.message));console.log('Isolated test files retained under '+folder)});
