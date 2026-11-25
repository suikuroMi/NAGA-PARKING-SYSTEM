const {loadEnvConfig}=require('@next/env');loadEnvConfig(process.cwd());
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const url=new URL(process.env.DATABASE_URL);
const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:url.pathname.slice(1)};
const bin=process.env.PG_BIN||'';
const action=process.argv[2]||'backup';
function run(exe,args){const result=cp.spawnSync(path.join(bin,exe+(process.platform==='win32'?'.exe':'')),args,{env,stdio:'inherit',windowsHide:true});if(result.error)throw result.error;if(result.status!==0)throw Error(exe+' failed')}
if(action==='backup'){
 fs.mkdirSync('backups',{recursive:true});const file=path.resolve('backups',`parking-${new Date().toISOString().replace(/[:.]/g,'-')}.dump`);
 run('pg_dump',['--format=custom','--no-owner','--file',file]);console.log('Backup saved: '+file);
}else if(action==='restore-test'){
 const file=path.resolve(process.argv[3]||'');if(!fs.existsSync(file)||!file.endsWith('.dump'))throw Error('Provide an existing .dump backup file.');
 const name='naga_restore_'+Date.now();run('createdb',[name]);env.PGDATABASE=name;
 run('pg_restore',['--no-owner','--dbname',name,file]);console.log('Restored into new database '+name+'. The original database was not changed.');
}else throw Error('Use backup or restore-test. Restoring over existing data is intentionally not automatic.');
