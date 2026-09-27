import { BLACK, WHITE, EMPTY, scoreRegions, estimateLiveOwnership } from './engine.js';
import { groupSafetyBalance, isTrueEye, readGroupCapture, urgentMoveWeights } from './tactics.js';

const SEARCH = {
  fast: { iterations: 20, candidates: 9, exploration: 1.18 },
  balanced: { iterations: 55, candidates: 13, exploration: 1.08 },
  deep: { iterations: 140, candidates: 18, exploration: .98 },
  simulation: { iterations: 28, candidates: 10, exploration: 1.08 }
};

const opponent = color => color === BLACK ? WHITE : BLACK;

function regionIndexByNode(game, regions) {
  const index = new Int16Array(game.topology.nodeCount).fill(-1);
  regions.forEach((region, regionIndex) => region.nodes.forEach(node => { index[node] = regionIndex; }));
  return index;
}

function groupKey(group) { return Math.min(...group.stones); }

function tacticalPrior(game, regions, byNode, node, color, urgency = 0, useReading = false, teacherPolicy = 0) {
  const move = game.analyzeMove(node, color);
  if (!move.legal) return null;
  const enemy = opponent(color), friendlyGroups = new Map(), enemyGroups = new Map();
  let saved = 0, threatened = 0, emptyNeighbors = 0;
  for (const next of game.topology.neighbors(node)) {
    if (game.board[next] === EMPTY) { emptyNeighbors++; continue; }
    const group = game.groupAt(next);
    const target = group.color === color ? friendlyGroups : enemyGroups;
    target.set(groupKey(group), group);
  }
  for (const group of friendlyGroups.values()) if (group.liberties.size === 1 && group.liberties.has(node)) saved += group.stones.size;
  const after = game.clone();after.play(node);
  for (const next of after.topology.neighbors(node)) {
    if (after.board[next] !== enemy) continue;
    const group = after.groupAt(next);
    if (group.liberties.size === 1) threatened += group.stones.size;
  }
  const ownGroup = after.groupAt(node), selfAtari = ownGroup.liberties.size === 1 && move.captured === 0;
  const region = regions[byNode[node]], valueDensity = region ? region.points / Math.sqrt(region.nodes.length) : 0;
  const {x,y}=game.topology.coords(node),edge=Math.min(x,y,game.topology.width-1-x,game.topology.height-1-y);
  const cornerShape=edge<=2?1.05:edge<=4?.35:0;
  const connection=Math.max(0,friendlyGroups.size-1),cut=Math.max(0,enemyGroups.size-1);
  const eyeFill=isTrueEye(game,node,color)&&move.captured===0;
  let reading=0;
  if(useReading&&(urgency>0||friendlyGroups.size||enemyGroups.size)){
    if(ownGroup.liberties.size<=2&&move.captured===0)reading-=Math.max(0,readGroupCapture(after,node,enemy,3))*Math.min(10,ownGroup.stones.size)*6;
    for(const group of enemyGroups.values()){
      const anchor=[...group.stones][0];if(group.liberties.size<=2&&after.board[anchor]===enemy)reading+=Math.max(0,readGroupCapture(after,anchor,color,3))*Math.min(10,group.stones.size)*5;
    }
  }
  const teacherBonus=teacherPolicy>0?Math.log1p(teacherPolicy*1000)*3.2:0;
  const baseScore=move.captured*15+saved*9+threatened*4+connection*2.8+cut*2.2+valueDensity*1.4+cornerShape+urgency+reading-(selfAtari?10+ownGroup.stones.size*2.5:0)-(eyeFill?18:0);
  return {node,score:baseScore+teacherBonus,baseScore,captured:move.captured,saved,reading,urgency,teacherPolicy};
}

function candidateMoves(game, regions, byNode, limit, allowedNodes = null, useReading = false, guidance = null) {
  const allowed=allowedNodes?new Set(allowedNodes):null,candidates=[],urgent=urgentMoveWeights(game,game.turn);
  for(let node=0;node<game.topology.nodeCount;node++){
    if(allowed&&!allowed.has(node))continue;
    const candidate=tacticalPrior(game,regions,byNode,node,game.turn,urgent.get(node)||0,useReading,guidance?.policy?.[node]||0);
    if(candidate)candidates.push(candidate);
  }
  candidates.sort((a,b)=>b.score-a.score||a.node-b.node);
  return candidates.slice(0,limit);
}

export function rankMoves(game,regions,limit=12,allowedNodes=null){return candidateMoves(game,regions,regionIndexByNode(game,regions),limit,allowedNodes,true).map(candidate=>({...candidate}));}

export function evaluatePosition(game, regions, perspective = BLACK) {
  if(game.finished){
    const exact=scoreRegions(game,regions),total=Math.max(1,exact.blackTotal+exact.whiteTotal);
    const value=(exact.blackTotal-exact.whiteTotal)/total;
    return perspective===BLACK?value:-value;
  }
  const owners=estimateLiveOwnership(game,{maxDistance:5,margin:1}),totalPoints=Math.max(1,regions.reduce((sum,region)=>sum+region.points,0));
  let expected=0;
  for(const region of regions){
    let black=0,white=0;
    for(const node of region.nodes){if(owners[node]===BLACK)black++;else if(owners[node]===WHITE)white++;}
    const scale=Math.max(1.6,Math.sqrt(region.nodes.length)*.72),probability=1/(1+Math.exp(-(black-white)/scale));
    expected+=region.points*(probability*2-1);
  }
  expected+=groupSafetyBalance(game);
  const value=Math.max(-1,Math.min(1,expected/totalPoints));
  return perspective===BLACK?value:-value;
}

function applyAction(game,action){if(action===null)game.pass();else game.play(action);}

function expand(node,game,regions,byNode,settings,allowedNodes=null,useReading=false,guidance=null){
  const candidates=candidateMoves(game,regions,byNode,settings.candidates,allowedNodes,useReading,guidance);
  const occupied=game.board.reduce((count,color)=>count+(color!==EMPTY),0);
  if(!allowedNodes&&occupied>game.topology.nodeCount*.58)candidates.push({node:null,score:-1.5});
  const peak=candidates.length?Math.max(...candidates.map(candidate=>candidate.score)):0;
  const weights=candidates.map(candidate=>Math.exp(Math.max(-12,(candidate.score-peak)/3.2))),sum=weights.reduce((a,b)=>a+b,0)||1;
  node.children=candidates.map((candidate,index)=>({action:candidate.node,prior:weights[index]/sum,tacticalScore:candidate.score,baseScore:candidate.baseScore??candidate.score,captured:candidate.captured||0,saved:candidate.saved||0,reading:candidate.reading||0,urgency:candidate.urgency||0,visits:0,valueSum:0,node:{children:null}}));
}

export function selectProtectedTacticalMove(children,margin=6,tieWindow=1.5){
  const tactical=children.filter(child=>child.action!==null&&(child.captured>0||child.saved>0||child.reading>=4));
  if(!tactical.length)return null;
  const bestBase=Math.max(...tactical.map(child=>child.baseScore));
  const bestOrdinary=Math.max(...children.filter(child=>!tactical.includes(child)).map(child=>child.baseScore),-Infinity);
  if(bestBase<bestOrdinary+margin)return null;
  return tactical.filter(child=>child.baseScore>=bestBase-tieWindow).sort((a,b)=>b.tacticalScore-a.tacticalScore||b.baseScore-a.baseScore||a.action-b.action)[0]||null;
}

function selectChild(node,turn,rootColor,settings){
  const parentVisits=Math.max(1,node.children.reduce((sum,child)=>sum+child.visits,0));
  let best=null,bestScore=-Infinity;
  for(const child of node.children){
    const mean=child.visits?child.valueSum/child.visits:0;
    const exploit=turn===rootColor?mean:-mean;
    const explore=settings.exploration*child.prior*Math.sqrt(parentVisits)/(1+child.visits);
    const score=exploit+explore;
    if(score>bestScore){bestScore=score;best=child;}
  }
  return best;
}

function searchMove(game,regions,settings,random,guidance=null){
  const rootColor=game.turn,byNode=regionIndexByNode(game,regions),root={children:null};
  expand(root,game,regions,byNode,settings,null,true,guidance);
  if(!root.children.length)return null;
  const protectedTactical=selectProtectedTacticalMove(root.children);
  if(protectedTactical)return protectedTactical.action;
  for(let iteration=0;iteration<settings.iterations;iteration++){
    const simulation=game.clone(),path=[];let node=root;
    while(node.children?.length){
      const child=selectChild(node,simulation.turn,rootColor,settings);if(!child)break;
      applyAction(simulation,child.action);path.push(child);node=child.node;
      if(simulation.finished)break;
    }
    if(!simulation.finished&&node.children===null)expand(node,simulation,regions,byNode,settings);
    const value=evaluatePosition(simulation,regions,rootColor);
    for(const edge of path){edge.visits++;edge.valueSum+=value;}
  }
  root.children.sort((a,b)=>b.visits-a.visits||(b.visits?b.valueSum/b.visits:0)-(a.visits?a.valueSum/a.visits:0)||String(a.action).localeCompare(String(b.action)));
  const most=root.children[0]?.visits??0,finalists=root.children.filter(child=>child.visits===most);
  return finalists[Math.floor(random()*finalists.length)]?.action??null;
}

export function chooseLegacyMove(game, regions, level = 'balanced', allowedNodes = null, random = Math.random) {
  const color=game.turn,candidates=[],before=scoreRegions(game,regions),allowed=allowedNodes?new Set(allowedNodes):null;
  for(let node=0;node<game.topology.nodeCount;node++){
    if(allowed&&!allowed.has(node))continue;
    const move=game.analyzeMove(node,color);if(!move.legal)continue;
    const simulation=game.clone();simulation.board=move.board;
    const after=scoreRegions(simulation,regions),electoralSwing=color===WHITE?after.whiteTotal-before.whiteTotal:after.blackTotal-before.blackTotal;
    let adjacent=0;for(const next of game.topology.neighbors(node)){if(game.board[next]===color)adjacent+=.7;else if(game.board[next]!==EMPTY)adjacent+=1.1;else adjacent+=.15;}
    const {x,y}=game.topology.coords(node),midX=(game.topology.width-1)/2,midY=(game.topology.height-1)/2;
    const centerBias=1-(Math.abs(x-midX)+Math.abs(y-midY))/Math.max(game.topology.width,game.topology.height);
    const noise=random()*(level==='fast'?2.8:level==='deep'?.45:1.2);
    candidates.push({node,score:move.captured*7+electoralSwing*1.8+adjacent+centerBias+noise});
  }
  if(!candidates.length)return null;
  candidates.sort((a,b)=>b.score-a.score);const pool=level==='fast'?candidates.slice(0,5):level==='deep'?candidates.slice(0,2):candidates.slice(0,3);
  return pool[Math.floor(random()*pool.length)].node;
}

export function chooseMove(game, regions, level = 'balanced', allowedNodes = null, random = Math.random, guidance = null) {
  if(level==='legacy')return chooseLegacyMove(game,regions,'balanced',allowedNodes,random);
  const settings=SEARCH[level]||SEARCH.balanced,byNode=regionIndexByNode(game,regions);
  if(allowedNodes){
    const candidates=candidateMoves(game,regions,byNode,settings.candidates,allowedNodes,true,guidance);
    if(!candidates.length)return null;
    const pool=candidates.slice(0,level==='fast'?3:level==='deep'?1:2);
    return pool[Math.floor(random()*pool.length)].node;
  }
  return searchMove(game,regions,settings,random,guidance);
}
