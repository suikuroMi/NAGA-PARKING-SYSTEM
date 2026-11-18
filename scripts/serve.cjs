const {loadEnvConfig}=require('@next/env');loadEnvConfig(process.cwd());
const next=require('next'),http=require('node:http'),https=require('node:https'),fs=require('node:fs'),os=require('node:os');
const app=next({dev:false,hostname:'0.0.0.0',port:Number(process.env.PORT||3100)});
require('./preflight.cjs').check({launch:true}).then(failures=>{
 if(failures.length)throw Error('Startup checks failed. Resolve the messages above and retry.');
 return app.prepare();
}).then(()=>{
 const handler=app.getRequestHandler();
 const debug=process.env.NAGA_CONNECTION_DEBUG==='1';
 const handle=(protocol)=>(req,res)=>{
  req.headers['x-forwarded-proto']=protocol;
  if(debug){const remote=req.socket.remoteAddress;res.on('finish',()=>console.log('Connection',protocol,remote,res.statusCode));}
  handler(req,res);
 };
 http.createServer(handle('http')).listen(Number(process.env.PORT||3100),'0.0.0.0');
 if(fs.existsSync('.runtime/tls/server.key')&&fs.existsSync('.runtime/tls/server.crt')){
  const secure=https.createServer({key:fs.readFileSync('.runtime/tls/server.key'),cert:fs.readFileSync('.runtime/tls/server.crt')},handle('https'));
  if(debug)secure.on('tlsClientError',(error,socket)=>console.log('TLS connection failed',socket.remoteAddress,error.code));
  secure.listen(3443,'0.0.0.0');
  for(const list of Object.values(os.networkInterfaces()))for(const ip of list||[])if(ip.family==='IPv4'&&!ip.internal)console.log('Phone HTTPS address: https://'+ip.address+':3443');
 }
 console.log('Laptop: http://localhost:'+(process.env.PORT||3100));
}).catch(error=>{console.error(error);process.exitCode=1});
