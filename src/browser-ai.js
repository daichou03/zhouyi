import { browserPosition } from './browser-position.js';

const aborted=()=>Object.assign(new Error('Browser analysis cancelled'),{name:'AbortError'});
export const supportsBrowserAi=topology=>topology.width===9&&topology.height===9;

// One worker/model per page; cancellation discards old results without reloading
// a healthy model. No dependency on the native analysis API.
export class BrowserAi {
  constructor({workerFactory=()=>new Worker(new URL('../assets/browser-ai/worker.js',import.meta.url),{type:'module'}),loadTimeout=120000,analysisTimeout=15000,onState=()=>{}}={}){
    this.workerFactory=workerFactory;this.loadTimeout=loadTimeout;this.analysisTimeout=analysisTimeout;this.onState=onState;
    this.worker=null;this.pending=new Map();this.sequence=0;this.generation=0;this.loading=null;this.state={phase:'idle'};
  }
  publish(state){this.state=state;this.onState({...state});}
  spawn(){
    if(this.worker)return;
    const worker=this.workerFactory();this.worker=worker;
    worker.onmessage=({data})=>{
      if(this.worker!==worker)return;
      if(data.type==='status'){if(this.state.phase==='loading'&&data.progress)this.publish({...this.state,progress:data.progress});return;}
      const item=this.pending.get(data.id);if(!item)return;
      clearTimeout(item.timer);this.pending.delete(data.id);
      if(data.error)item.reject(new Error(data.error));else item.resolve(data.result);
    };
    worker.onerror=event=>{if(this.worker===worker)this.fail(new Error(event.message||'Browser worker failed'));};
    worker.onmessageerror=()=>{if(this.worker===worker)this.fail(new Error('Invalid browser worker response'));};
  }
  request(type,payload={},timeout=this.analysisTimeout){
    return new Promise((resolve,reject)=>{
      try{this.spawn();const id=++this.sequence;
        const timer=setTimeout(()=>this.fail(new Error(`Browser ${type} timed out`)),timeout);
        this.pending.set(id,{type,resolve,reject,timer});this.worker.postMessage({id,type,...payload});
      }catch(error){this.fail(error);reject(error);}
    });
  }
  fail(error){
    for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(error);}this.pending.clear();
    this.worker?.terminate();this.worker=null;this.loading=null;this.generation++;
    this.publish({phase:'error',error:String(error.message||error)});
  }
  load(){
    if(this.state.phase==='ready')return Promise.resolve(this.state);
    if(this.state.phase==='error')return Promise.reject(new Error(this.state.error));
    if(this.loading)return this.loading;
    this.publish({phase:'loading'});
    const request=this.request('load',{backend:'auto'},this.loadTimeout),worker=this.worker;
    this.loading=request.then(result=>{
      if(this.worker!==worker)throw aborted();
      this.publish({phase:'ready',backend:result.backend,model:result.model});return this.state;
    }).catch(error=>{if(this.state.phase!=='error'&&error.name!=='AbortError')this.fail(error);throw error;});
    return this.loading;
  }
  cancel(){
    this.generation++;
    for(const [id,item] of this.pending){if(item.type==='load')continue;clearTimeout(item.timer);item.reject(aborted());this.pending.delete(id);}
  }
  dispose(){
    this.generation++;
    for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(aborted());}this.pending.clear();
    this.worker?.terminate();this.worker=null;this.loading=null;this.publish({phase:'idle'});
  }
  async retry(){this.dispose();return this.load();}
  async guidance(game,level='balanced',allowedNodes=null){
    if(!supportsBrowserAi(game.topology))throw new Error('Browser AI supports 9x9 only');
    const generation=this.generation,position=browserPosition(game),allowed=allowedNodes?new Set(allowedNodes):null;
    const legal=Array.from({length:81},(_,node)=>(!allowed||allowed.has(node))&&game.analyzeMove(node).legal);
    await this.load();if(generation!==this.generation)throw aborted();
    let result;
    try{result=await this.request('evaluate',{position});}catch(error){if(error.name!=='AbortError'&&this.state.phase!=='error')this.fail(error);throw error;}
    if(generation!==this.generation)throw aborted();
    if(!Array.isArray(result.policy)||result.policy.length!==82||!result.policy.every(value=>Number.isFinite(value)&&value>=0)||
      !Array.isArray(result.ownership)||result.ownership.length!==81||!result.ownership.every(value=>Number.isFinite(value)&&Math.abs(value)<=1)){
      const error=new Error('Invalid browser model output');this.fail(error);throw error;
    }
    const policy=result.policy.map((value,node)=>node===81?(allowed?0:value):legal[node]?value:0);
    const sum=policy.reduce((a,b)=>a+b,0);
    if(sum<=0){const error=new Error('Browser policy has no legal probability');this.fail(error);throw error;}
    for(let node=0;node<82;node++)policy[node]/=sum;
    const best=policy.indexOf(Math.max(...policy));
    return {policy:policy.slice(0,81),passPolicy:policy[81],ownership:result.ownership,bestMove:best===81?'pass':'move',source:'browser-katago',backend:result.backend,milliseconds:result.milliseconds};
  }
}
