import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { KataGoBridge } from './scripts/katago-bridge.mjs';

const root = process.cwd(), port = Number(process.env.PORT || 5173);
const localKataGoRoot = join(root,'.local','katago');
const katago=new KataGoBridge({
  ...process.env,
  KATAGO_PATH:process.env.KATAGO_PATH||join(localKataGoRoot,'katago.exe'),
  KATAGO_MODEL:process.env.KATAGO_MODEL||join(localKataGoRoot,'model-b10c128.txt.gz'),
  KATAGO_CONFIG:process.env.KATAGO_CONFIG||join(localKataGoRoot,'analysis.cfg'),
});
const types = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json' };
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
const readJson=req=>new Promise((resolve,reject)=>{let body='';req.on('data',chunk=>{body+=chunk;if(body.length>1_000_000){reject(new Error('请求过大'));req.destroy();}});req.on('end',()=>{try{resolve(JSON.parse(body||'{}'));}catch{reject(new Error('JSON格式错误'));}});req.on('error',reject);});
createServer(async (req,res)=>{
  try {
    if(req.url==='/api/katago/status'&&req.method==='GET')return json(res,200,katago.status());
    if(req.url==='/api/katago/analyze'&&req.method==='POST'){
      if(!katago.configured)return json(res,503,{error:'KataGo尚未配置'});
      const query=await readJson(req);
      if(!Number.isInteger(query.boardXSize)||!Number.isInteger(query.boardYSize)||!Array.isArray(query.initialStones))return json(res,400,{error:'分析请求无效'});
      try{return json(res,200,await katago.analyze(query));}catch(error){return json(res,502,{error:error.message});}
    }
    const requested = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const file = normalize(join(root, requested));
    if (!file.startsWith(root)) throw new Error('Invalid path');
    const data = await readFile(file); res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(data);
  } catch { res.writeHead(404);res.end('Not found'); }
}).listen(port,()=>console.log(`州弈 running at http://localhost:${port}`));
process.on('SIGINT',()=>{katago.close();process.exit(0);});
process.on('SIGTERM',()=>{katago.close();process.exit(0);});
