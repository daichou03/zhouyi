const visitsByLevel={fast:64,balanced:160,deep:400};
import { analyzeUnconditionalLife, deadStonesFromOwnership } from './life.js';
import { cloneWithHistory } from './browser-position.js';
let unavailableUntil=0;

const columns='ABCDEFGHJKLMNOPQRSTUVWXYZ';

export function isBuiltinOnlyHost(locationLike=globalThis.location){
  return Boolean(locationLike?.hostname?.toLowerCase().endsWith('.github.io'));
}

export function nodeToGtp(topology,node){
  const {x,y}=topology.coords(node);
  if(x<0||x>=columns.length)throw new Error('棋盘宽度超出KataGo坐标范围');
  return `${columns[x]}${topology.height-y}`;
}

export function buildKataGoQuery(game,level='balanced'){
  const initialStones=[];
  game.board.forEach((color,node)=>{if(color)initialStones.push([color===1?'B':'W',nodeToGtp(game.topology,node)]);});
  return {
    initialStones,
    initialPlayer:game.turn===1?'B':'W',
    moves:[],rules:'chinese',komi:0,
    boardXSize:game.topology.width,boardYSize:game.topology.height,
    maxVisits:visitsByLevel[level]||visitsByLevel.balanced,
    includePolicy:true,includeOwnership:true
  };
}

export function guidanceFromAnalysis(game,analysis,allowedNodes=null){
  if(!analysis||!Array.isArray(analysis.policy))return null;
  const allowed=allowedNodes?new Set(allowedNodes):null,policy=new Float64Array(game.topology.nodeCount);
  for(let node=0;node<policy.length;node++)if((!allowed||allowed.has(node))&&analysis.policy[node]>=0&&game.analyzeMove(node).legal)policy[node]=analysis.policy[node];
  const ownership=Array.isArray(analysis.ownership)&&analysis.ownership.length===game.board.length&&analysis.ownership.every(value=>Number.isFinite(value)&&Math.abs(value)<=1)?analysis.ownership:null;
  const best=[...(analysis.moveInfos||[])].sort((a,b)=>(b.visits||0)-(a.visits||0)||(a.order??0)-(b.order??0))[0];
  return {policy,ownership,bestMove:best?.move??null,passPolicy:analysis.policy[game.board.length]??0,source:'katago'};
}

export async function suggestDeadStones(game,request=requestKataGoGuidance){
  const conservative=analyzeUnconditionalLife(game).dead;
  const first=cloneWithHistory(game);first.finished=false;first.turn=1;
  const second=cloneWithHistory(game);second.finished=false;second.turn=2;
  // Deliberately sequential: both requests use the same persistent local engine.
  const black=await request(first,'deep');
  if(!black?.ownership)return {dead:conservative,source:'builtin'};
  const white=await request(second,'deep');
  if(!white?.ownership)return {dead:conservative,source:'builtin'};
  return {dead:deadStonesFromOwnership(game,black.ownership,white.ownership),source:black.source==='browser-katago'&&white.source==='browser-katago'?'browser-katago':'katago'};
}

export async function requestKataGoGuidance(game,level='balanced',allowedNodes=null){
  if(isBuiltinOnlyHost())return null;
  if(Date.now()<unavailableUntil)return null;
  try{
    // OpenCL needs a few seconds to load the model on the first request; later calls are typically sub-second.
    const response=await fetch('/api/katago/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(buildKataGoQuery(game,level)),signal:AbortSignal.timeout(level==='deep'?12000:10000)});
    if(!response.ok){unavailableUntil=Date.now()+30000;return null;}
    return guidanceFromAnalysis(game,await response.json(),allowedNodes);
  }catch{unavailableUntil=Date.now()+30000;return null;}
}

export async function kataGoStatus(){
  if(isBuiltinOnlyHost())return {configured:false,running:false,builtinOnly:true};
  try{const response=await fetch('/api/katago/status',{signal:AbortSignal.timeout(1200)});return response.ok?await response.json():{configured:false,running:false};}
  catch{return {configured:false,running:false};}
}
