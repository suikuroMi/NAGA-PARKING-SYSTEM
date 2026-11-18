const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const dir=path.resolve('.runtime/tls');fs.mkdirSync(dir,{recursive:true});
const openssl=process.env.OPENSSL_BIN||(process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl');
function run(args){const result=cp.spawnSync(openssl,args,{cwd:dir,windowsHide:true,stdio:['ignore','ignore','pipe']});if(result.status!==0)throw Error(result.stderr?.toString()||'OpenSSL failed')}
if(!fs.existsSync(path.join(dir,'ca.key')))run(['req','-x509','-newkey','rsa:3072','-nodes','-days','60','-keyout','ca.key','-out','ca.crt','-subj','/CN=Naga Thesis Local CA','-addext','basicConstraints=critical,CA:TRUE,pathlen:0','-addext','keyUsage=critical,keyCertSign,cRLSign']);
const ips=['127.0.0.1'];for(const list of Object.values(os.networkInterfaces()))for(const ip of list||[])if(ip.family==='IPv4'&&!ip.internal)ips.push(ip.address);
fs.writeFileSync(path.join(dir,'server.ext'),`basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,${ips.map(ip=>'IP:'+ip).join(',')}\n`);
run(['req','-newkey','rsa:2048','-nodes','-keyout','server.key','-out','server.csr','-subj','/CN=Naga Parking Laptop']);
run(['x509','-req','-in','server.csr','-CA','ca.crt','-CAkey','ca.key','-CAcreateserial','-out','server.crt','-days','45','-extfile','server.ext']);
fs.copyFileSync(path.join(dir,'ca.crt'),path.resolve('public/naga-local-ca.crt'));
run(['x509','-in','ca.crt','-outform','DER','-out',path.resolve('public/naga-local-ca.cer')]);
console.log('Local HTTPS certificates prepared for '+ips.join(', ')+'. No device trust settings were changed.');
