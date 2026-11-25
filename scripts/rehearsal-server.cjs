const url=new URL(process.env.DATABASE_URL);
if(!/^naga_rehearsal_[a-f0-9]{12}$/.test(url.pathname.slice(1)))throw Error('Rehearsal server requires an isolated rehearsal database.');
const app=require('next')({dev:false,hostname:'127.0.0.1',port:3102});
app.prepare().then(()=>{
  const server=require('node:http').createServer(app.getRequestHandler());
  server.on('error',error=>{console.error(error.message);process.exit(1)});
  server.listen(3102,'127.0.0.1',()=>console.log('REHEARSAL_READY'));
}).catch(error=>{console.error(error.message);process.exit(1)});
