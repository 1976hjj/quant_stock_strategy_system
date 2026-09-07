const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {readSnapshot}=require('./backend-snapshot.cjs');
const root=__dirname,mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png'},port=Number(process.env.PORT||8871);
http.createServer(async(req,res)=>{try{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end()}
 const url=decodeURIComponent(req.url.split('?')[0]);
 if(url==='/api/research-snapshot'){const body=JSON.stringify(await readSnapshot());res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});return res.end(req.method==='HEAD'?undefined:body)}
 const file=path.resolve(root,'.'+(url==='/'?'/index.html':url));if(!file.startsWith(root+path.sep)||!mime[path.extname(file)]||path.relative(root,file).split(path.sep).some(s=>s.startsWith('.'))){res.writeHead(403);return res.end()}
 const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data)
 }catch(e){res.writeHead(e.code==='ENOENT'?404:503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'已发布产物读取失败，请检查源目录与文件状态'}))}
}).listen(port,'127.0.0.1',()=>console.log('QUANT workspace http://127.0.0.1:'+port));
