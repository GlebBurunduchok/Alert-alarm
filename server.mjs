import http from 'node:http';
import worker from './worker.mjs';
const port=4173;
const server=http.createServer(async(req,res)=>{
 try{
  const request=new Request('http://127.0.0.1:'+port+req.url,{method:req.method,headers:req.headers});
  const response=await worker.fetch(request);
  res.writeHead(response.status,Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
 }catch{
  res.writeHead(500,{'content-type':'text/plain; charset=utf-8'});
  res.end('Не вдалося обробити запит.');
 }
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Порт 4173 вже зайнятий. Закрийте інший локальний запуск сайту.':e.message);process.exitCode=1});
server.listen(port,'127.0.0.1',()=>console.log('Відкрийте http://127.0.0.1:'+port+' у браузері. Для зупинки натисніть Ctrl+C.'));
