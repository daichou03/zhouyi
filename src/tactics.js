import { BLACK, WHITE, EMPTY } from './engine.js';

const opponent=color=>color===BLACK?WHITE:BLACK;

export function listGroups(game){
  const seen=new Set(),groups=[];
  for(let node=0;node<game.topology.nodeCount;node++){
    if(game.board[node]===EMPTY||seen.has(node))continue;
    const group=game.groupAt(node);for(const stone of group.stones)seen.add(stone);
    groups.push(group);
  }
  return groups;
}

export function isTrueEye(game,node,color){
  if(game.board[node]!==EMPTY)return false;
  const {x,y}=game.topology.coords(node),{width,height}=game.topology;
  for(const next of game.topology.neighbors(node))if(game.board[next]!==color)return false;
  const diagonals=[[x-1,y-1],[x+1,y-1],[x-1,y+1],[x+1,y+1]].filter(([dx,dy])=>dx>=0&&dy>=0&&dx<width&&dy<height);
  const bad=diagonals.filter(([dx,dy])=>game.board[game.topology.index(dx,dy)]!==color).length;
  return diagonals.length<4?bad===0:bad<=1;
}

export function urgentMoveWeights(game,color=game.turn){
  const weights=new Map(),enemy=opponent(color);
  for(const group of listGroups(game)){
    const liberties=group.liberties.size;if(liberties>2)continue;
    const own=group.color===color,multiplier=liberties===1?(own?11:9):(own?4:3);
    const weight=Math.min(12,group.stones.size)*multiplier;
    for(const liberty of group.liberties)weights.set(liberty,(weights.get(liberty)||0)+weight);
    if(group.color!==color&&group.color!==enemy)continue;
  }
  return weights;
}

export function readGroupCapture(game,targetNode,attacker,maxDepth=5,memo=new Map()){
  const targetColor=opponent(attacker);
  if(game.board[targetNode]!==targetColor)return 1;
  const group=game.groupAt(targetNode),liberties=group.liberties.size;
  if(liberties>=4)return -1;
  if(maxDepth<=0)return liberties===1?.55:liberties===2?0:-.45;
  const key=`${game.positionKey()}|${game.turn}|${targetNode}|${attacker}|${maxDepth}`;
  if(memo.has(key))return memo.get(key);
  const actions=new Set(group.liberties);
  if(game.turn===targetColor){
    for(const stone of group.stones)for(const next of game.topology.neighbors(stone)){
      if(game.board[next]!==attacker)continue;
      const attackingGroup=game.groupAt(next);
      if(attackingGroup.liberties.size<=2)for(const liberty of attackingGroup.liberties)actions.add(liberty);
    }
  }
  let best=game.turn===attacker?-1:1,found=false;
  for(const action of actions){
    const next=game.clone();if(!next.play(action))continue;found=true;
    const value=readGroupCapture(next,targetNode,attacker,maxDepth-1,memo);
    best=game.turn===attacker?Math.max(best,value):Math.min(best,value);
    if((game.turn===attacker&&best===1)||(game.turn===targetColor&&best===-1))break;
  }
  if(!found)best=liberties===0?1:liberties===1?.7:-.2;
  memo.set(key,best);return best;
}

export function groupSafetyBalance(game){
  let balance=0;
  for(const group of listGroups(game)){
    const liberties=group.liberties.size,size=Math.min(12,group.stones.size);
    let value=0;
    if(liberties===1)value=-size*1.4;
    else if(liberties===2)value=-size*.42;
    else if(liberties>=5)value=Math.min(2,size*.12);
    const eyes=[...group.liberties].filter(node=>isTrueEye(game,node,group.color)).length;
    if(eyes>=2)value+=Math.min(8,size)*.65;
    balance+=group.color===BLACK?value:-value;
  }
  return balance;
}
