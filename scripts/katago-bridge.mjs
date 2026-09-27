import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';

export function isAnalysisResultMessage(result){return Boolean(result&&(result.error||result.rootInfo||Array.isArray(result.policy)||Array.isArray(result.moveInfos)));}

export class KataGoBridge{
  constructor(env=process.env){
    this.executable=env.KATAGO_PATH||'katago';this.model=env.KATAGO_MODEL||'';this.config=env.KATAGO_CONFIG||'';
    this.configured=Boolean(this.executable&&this.model&&this.config&&existsSync(this.executable)&&existsSync(this.model)&&existsSync(this.config));
    this.process=null;this.pending=new Map();this.sequence=0;this.lastError='';
  }
  status(){return {configured:this.configured,running:Boolean(this.process&&!this.process.killed),model:this.model?this.model.split(/[\\/]/).at(-1):null,lastError:this.lastError||null};}
  start(){
    if(!this.configured)throw new Error('KataGo尚未配置');
    if(this.process&&!this.process.killed)return;
    this.process=spawn(this.executable,['analysis','-config',this.config,'-model',this.model],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    this.process.on('error',error=>{this.lastError=error.message;this.failAll(error);this.process=null;});
    this.process.on('exit',code=>{const error=new Error(`KataGo已退出（${code??'unknown'}）`);this.lastError=error.message;this.failAll(error);this.process=null;});
    createInterface({input:this.process.stdout}).on('line',line=>{try{const result=JSON.parse(line);if(!isAnalysisResultMessage(result)){if(result.warning)this.lastError=result.warning;return;}const entry=this.pending.get(String(result.id));if(!entry)return;this.pending.delete(String(result.id));clearTimeout(entry.timer);result.error?entry.reject(new Error(result.error)):entry.resolve(result);}catch{}});
    this.process.stderr.on('data',chunk=>{const message=String(chunk).trim();if(message)this.lastError=message.slice(-500);});
  }
  failAll(error){for(const entry of this.pending.values()){clearTimeout(entry.timer);entry.reject(error);}this.pending.clear();}
  analyze(query){
    this.start();const id=`zhouyi-${++this.sequence}`;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('KataGo分析超时'));},30000);this.pending.set(id,{resolve,reject,timer});this.process.stdin.write(`${JSON.stringify({...query,id})}\n`);});
  }
  close(){if(this.process&&!this.process.killed)this.process.kill();}
}
