import http from 'node:http';
import {readFile} from 'node:fs/promises';
const files=new Set(['index.html','style.css','app.js','crypto.js','config.js','logo.png']);
const types={html:'text/html',css:'text/css',js:'text/javascript',png:'image/png'};
http.createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;const file=path==='/'?'index.html':path.slice(1);if(!files.has(file)){res.writeHead(404);res.end('Not found');return;}const data=await readFile(new URL(file,import.meta.url));res.writeHead(200,{'Content-Type':types[file.split('.').pop()]+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});res.end(data);}catch{res.writeHead(500);res.end('Unable to load file');}}).listen(5173,'127.0.0.1',()=>console.log('Bubloo Scientist Vault: http://localhost:5173'));
