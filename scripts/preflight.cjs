const fs=require('node:fs'),net=require('node:net'),os=require('node:os'),https=require('node:https');
const {X509Certificate,createPrivateKey}=require('node:crypto');
const {Client}=require('pg');
const tables=['parking_config','parking_slots','parking_sessions','parking_payments','parking_staff','parking_audit','parking_auth','parking_requests','parking_rate_limits'];
async function available(port){return new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(false));s.listen(port,'0.0.0.0',()=>s.close(()=>resolve(true)))})}
async function check({launch=false}={}){
 const failures=[];const pass=m=>console.log('OK: '+m),fail=m=>{failures.push(m);console.log('FAIL: '+m)};
 let url;try{url=new URL(process.env.DATABASE_URL);if(!['postgres:','postgresql:'].includes(url.protocol))throw Error()}catch{fail('Set a valid DATABASE_URL in .env.local.');return failures}
 if(fs.existsSync('.next/BUILD_ID'))pass('Production build exists.');else fail('Production build missing. Run npm run build.');
 const db=new Client({connectionString:url.toString(),connectionTimeoutMillis:5000,query_timeout:5000});
 try{
  await db.connect();await db.query('SELECT 1');pass('Configured database is reachable.');
  for(const table of tables){const r=await db.query('SELECT to_regclass($1) AS name',['public.'+table]);if(!r.rows[0].name)fail('Missing table '+table+'. Check the selected database before running db:setup.')}
  if(!failures.some(x=>x.startsWith('Missing table'))){const r=await db.query('SELECT id FROM parking_config WHERE id=1');if(!r.rowCount)fail('Facility is not initialized.');else pass('Application schema and facility record exist.')}
 }catch{fail('Database unavailable. Run npm run db:start and verify DATABASE_URL locally.')}finally{await db.end().catch(()=>{})}
 const port=Number(process.env.PORT||3100);if(!Number.isInteger(port)||port<1||port>65535||port===3443){fail('PORT must be valid and different from HTTPS port 3443.');return failures}
 const addresses=Object.entries(os.networkInterfaces()).flatMap(([name,list])=>(list||[]).filter(a=>a.family==='IPv4'&&!a.internal).map(a=>({name,ip:a.address})));
 const wifi=addresses.filter(a=>/wi-?fi|wireless|wlan/i.test(a.name));const targets=wifi.length?wifi:addresses;
 let ca;
 try{
  const cert=new X509Certificate(fs.readFileSync('.runtime/tls/server.crt'));ca=fs.readFileSync('.runtime/tls/ca.crt');const root=new X509Certificate(ca);
  if(!cert.checkPrivateKey(createPrivateKey(fs.readFileSync('.runtime/tls/server.key')))||!cert.verify(root.publicKey))throw Error();
  for(const [label,c]of [['server',cert],['CA',root]]){if(Date.now()<Date.parse(c.validFrom)||Date.parse(c.validTo)-Date.now()<7*86400000)fail(label+' certificate is invalid or expires within seven days. Renew HTTPS before rehearsal.');else pass(label+' certificate valid through '+new Date(c.validTo).toISOString().slice(0,10)+'.')}
  for(const {ip}of targets)if(!cert.checkIP(ip))fail('Certificate does not cover '+ip+'. Run npm run https:setup, then restart the app.');
 }catch{fail('HTTPS certificate/key missing or mismatched. Run npm run https:setup. No trust settings were changed.')}
 for(const p of [port,3443]){
  if(await available(p)){pass('Port '+p+' is available.');continue}
  let parking=false;
  try{if(p===port){const r=await fetch('http://127.0.0.1:'+p+'/exit',{signal:AbortSignal.timeout(5000)});parking=r.ok&&(await r.text()).includes('<title>Naga Smart Park')}
  else if(ca)parking=await new Promise(resolve=>{const r=https.get('https://127.0.0.1:'+p+'/exit',{ca,timeout:5000},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>{resolve(res.statusCode===200&&body.includes('<title>Naga Smart Park'))})});r.on('timeout',()=>r.destroy());r.on('error',()=>resolve(false))})}catch{}
  if(parking&&!launch)pass('Parking app already responds on port '+p+'. Do not start a duplicate.');else fail(parking?'Parking app already running on port '+p+'. Use its existing window.':'Port '+p+' is occupied; a healthy parking API was not verified. Inspect the process without terminating it automatically.');
 }
 if(!targets.length)fail('No LAN address found. Connect the laptop to Wi-Fi.');
 for(const {name,ip}of targets)console.log('Phone ('+name+'): https://'+ip+':3443/exit');
 console.log('Laptop: http://localhost:'+port+'/kiosk');return failures;
}
module.exports={check};
if(require.main===module){require('@next/env').loadEnvConfig(process.cwd());check().then(f=>{process.exitCode=f.length?1:0}).catch(()=>{console.error('Preflight could not finish. Check local configuration.');process.exitCode=1})}
