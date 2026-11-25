const {loadEnvConfig}=require('@next/env');loadEnvConfig(process.cwd());
const {Client}=require('pg');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash,randomUUID}=require('node:crypto');
const tables=['parking_config','parking_slots','parking_sessions','parking_payments','parking_staff','parking_audit','parking_auth','parking_requests','parking_rate_limits'];
const sourceUrl=new URL(process.env.DATABASE_URL);
const env={...process.env,PGHOST:sourceUrl.hostname,PGPORT:sourceUrl.port||'5432',PGUSER:decodeURIComponent(sourceUrl.username),PGPASSWORD:decodeURIComponent(sourceUrl.password),PGDATABASE:sourceUrl.pathname.slice(1)};
function run(tool,args,environment=env){
  const executable=path.join(process.env.PG_BIN||'',tool+(process.platform==='win32'?'.exe':''));
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{env:environment,stdio:'inherit',windowsHide:true});
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(tool+' failed: '+code)));
  });
}
async function inspect(client){
  const result={tables:{},payments:{}};
  for(const table of tables){
    // Table names come only from the fixed application-schema list above.
    const rows=(await client.query(`SELECT to_jsonb(t)::text AS row FROM ${table} t ORDER BY to_jsonb(t)::text COLLATE "C"`)).rows;
    const hash=createHash('sha256');for(const {row}of rows)hash.update(row+'\n');
    result.tables[table]={count:rows.length,sha256:hash.digest('hex')};
  }
  const totals=await client.query(`WITH payments AS (
    SELECT (data->>'amount')::numeric amount, data ? 'voided' voided,
      COALESCE((SELECT sum((r->>'amount')::numeric) FROM jsonb_array_elements(COALESCE(data->'refunds','[]'::jsonb)) r),0) refunds
    FROM parking_payments)
    SELECT COALESCE(sum(amount),0)::text gross,
      COALESCE(sum(CASE WHEN voided THEN amount ELSE 0 END),0)::text voids,
      COALESCE(sum(refunds),0)::text refunds,
      COALESCE(sum(CASE WHEN voided THEN 0 ELSE amount-refunds END),0)::text net FROM payments`);
  result.payments=totals.rows[0];return result;
}
async function main(){
  const source=new Client({connectionString:sourceUrl.toString()});let restored;
  const name='naga_recovery_'+randomUUID().replace(/-/g,'').slice(0,12);
  fs.mkdirSync('backups',{recursive:true});
  const file=path.resolve('backups','verified-'+new Date().toISOString().replace(/[:.]/g,'-')+'.dump');
  try{
    await source.connect();await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot=(await source.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
    const expected=await inspect(source);
    await run('pg_dump',['--format=custom','--no-owner','--snapshot',snapshot,'--file',file]);
    await source.query('COMMIT');
    await run('createdb',[name]);
    await run('pg_restore',['--exit-on-error','--no-owner','--dbname',name,file]);
    const restoreUrl=new URL(sourceUrl);restoreUrl.pathname='/'+name;
    restored=new Client({connectionString:restoreUrl.toString()});await restored.connect();
    const actual=await inspect(restored);assert.deepEqual(actual,expected,'Restored data differs from the backup snapshot');
    const report={verifiedAt:new Date().toISOString(),restoredDatabase:name,backup:path.basename(file),...actual};
    fs.writeFileSync(file+'.verification.json',JSON.stringify(report,null,2)+'\n');
    console.log('VERIFIED: all nine application tables match the backup snapshot.');
    console.log(JSON.stringify(report,null,2));
    console.log('The live database is unchanged. The restored database is retained for rehearsal.');
  }finally{await restored?.end();await source.end()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
