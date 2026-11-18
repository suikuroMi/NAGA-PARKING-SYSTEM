const {loadEnvConfig}=require('@next/env');loadEnvConfig(process.cwd());
const {spawnSync}=require('node:child_process'),path=require('node:path'),fs=require('node:fs');
const {Client}=require('pg');
async function main(){
let url;try{url=new URL(process.env.DATABASE_URL)}catch{throw Error('Set DATABASE_URL in .env.local.')}
const probe=new Client({connectionString:url.toString(),connectionTimeoutMillis:3000,query_timeout:3000});
try{await probe.connect();await probe.query('SELECT 1');console.log('Configured PostgreSQL database is already reachable.');return}catch{}finally{await probe.end().catch(()=>{})}
if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('Remote database unavailable. Check its service and connection settings.');
if(!process.env.PG_BIN||!process.env.PG_DATA)throw Error('Set PG_BIN and PG_DATA in .env.local to the project-local PostgreSQL paths.');
const ready=spawnSync(path.join(process.env.PG_BIN,process.platform==='win32'?'pg_isready.exe':'pg_isready'),['-h',url.hostname,'-p',url.port||'5432'],{windowsHide:true,stdio:'ignore'});
if(ready.status===0)throw Error('PostgreSQL is running, but the configured database or login is unavailable. Verify DATABASE_URL; no second server was started.');
const executable=path.join(process.env.PG_BIN,process.platform==='win32'?'pg_ctl.exe':'pg_ctl');
const status=spawnSync(executable,['-D',process.env.PG_DATA,'status'],{windowsHide:true});
if(status.status===0)throw Error('The cluster is running but not reachable at DATABASE_URL. Check the configured port and server log.');
fs.mkdirSync('.runtime',{recursive:true});
const port=new URL(process.env.DATABASE_URL).port||'5432';
const result=spawnSync(executable,['-D',process.env.PG_DATA,'-l',path.resolve('.runtime/postgresql.log'),'-o',`-h 127.0.0.1 -p ${port}`,'start'],{stdio:'inherit',windowsHide:true});
if(result.error||result.status!==0)throw Error('PostgreSQL failed to start. Inspect .runtime/postgresql.log.');
const verify=new Client({connectionString:url.toString(),connectionTimeoutMillis:5000});
try{await verify.connect();await verify.query('SELECT 1');console.log('Configured database is ready.')}catch{throw Error('Server started, but the configured database/login is unavailable. Verify DATABASE_URL.')}finally{await verify.end().catch(()=>{})}
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
