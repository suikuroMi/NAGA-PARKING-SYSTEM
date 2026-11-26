const {loadEnvConfig}=require('@next/env');loadEnvConfig(process.cwd());
const next=require('next'),http=require('node:http'),https=require('node:https'),fs=require('node:fs'),os=require('node:os');
const port=Number(process.env.PORT||3100);
const app=next({dev:false,hostname:'0.0.0.0',port});
const isLoopback=addr=>!addr||addr==='127.0.0.1'||addr==='::1'||addr==='::ffff:127.0.0.1';
const CA_PATHS=new Set(['/naga-local-ca.crt','/naga-local-ca.cer','/favicon.svg','/logo.jpg']);

require('./preflight.cjs').check({launch:true}).then(failures=>{
 if(failures.length)throw Error('Startup checks failed. Resolve the messages above and retry.');
 return app.prepare();
}).then(()=>{
 const handler=app.getRequestHandler();
 const debug=process.env.NAGA_CONNECTION_DEBUG==='1';
 const hasTls=fs.existsSync('.runtime/tls/server.key')&&fs.existsSync('.runtime/tls/server.crt');
 const handle=(protocol)=>(req,res)=>{
  const remote=req.socket.remoteAddress||'127.0.0.1';
  delete req.headers['x-forwarded-for'];
  delete req.headers['x-forwarded-host'];
  req.headers['x-forwarded-proto']=protocol;
  req.headers['x-real-client-ip']=remote.replace(/^::ffff:/,'');
  if(debug){res.on('finish',()=>console.log('Connection',protocol,remote,res.statusCode));}
  if(protocol==='http'&&!isLoopback(remote)){
   const pathname=(req.url||'/').split('?')[0];
   const caDownload=(req.method==='GET'||req.method==='HEAD')&&CA_PATHS.has(pathname);
   if(!caDownload){
    if(hasTls&&(req.method==='GET'||req.method==='HEAD')){
     const hostHeader=String(req.headers.host||'').replace(/:\d+$/,'');
     if(hostHeader){
      res.writeHead(307,{Location:`https://${hostHeader}:3443${req.url||'/'}`});
      res.end();
      return;
     }
    }
    res.writeHead(403,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({error:'HTTPS is required over the network. Open port 3443.'}));
    return;
   }
  }
  handler(req,res);
 };
 http.createServer(handle('http')).listen(port,'0.0.0.0');
 if(hasTls){
  const secure=https.createServer({key:fs.readFileSync('.runtime/tls/server.key'),cert:fs.readFileSync('.runtime/tls/server.crt')},handle('https'));
  if(debug)secure.on('tlsClientError',(error,socket)=>console.log('TLS connection failed',socket.remoteAddress,error.code));
  secure.listen(3443,'0.0.0.0');
  for(const list of Object.values(os.networkInterfaces()))for(const ip of list||[])if(ip.family==='IPv4'&&!ip.internal)console.log('Phone HTTPS address: https://'+ip.address+':3443');
 }
 console.log('Laptop: http://localhost:'+port);
}).catch(error=>{console.error(error);process.exitCode=1});
