import { BLACK, WHITE, GoGame, GridTopology } from './engine.js';

const colors={B:BLACK,W:WHITE};

export function buildTacticalCase(spec){
  const sourceHeight=spec.diagram.length,sourceWidth=spec.diagram[0]?.length||0;
  if(!sourceHeight||!sourceWidth||spec.diagram.some(row=>row.length!==sourceWidth))throw new Error(`${spec.id}: 棋盘图必须是非空矩形`);
  const width=Math.max(9,sourceWidth),height=Math.max(9,sourceHeight);
  const [originX,originY]=spec.origin||[Math.floor((width-sourceWidth)/2),Math.floor((height-sourceHeight)/2)];
  if(originX<0||originY<0||originX+sourceWidth>width||originY+sourceHeight>height)throw new Error(`${spec.id}: 棋盘图原点超出范围`);
  const game=new GoGame(new GridTopology(width,height));
  spec.diagram.forEach((row,y)=>[...row].forEach((cell,x)=>{
    if(cell==='X')game.board[game.topology.index(x+originX,y+originY)]=BLACK;
    else if(cell==='O')game.board[game.topology.index(x+originX,y+originY)]=WHITE;
    else if(cell!=='.')throw new Error(`${spec.id}: 未知棋盘字符 ${cell}`);
  }));
  game.turn=colors[spec.turn];
  if(!game.turn)throw new Error(`${spec.id}: turn 必须是 B 或 W`);
  const nodes=points=>(points||[]).map(([x,y])=>game.topology.index(x+originX,y+originY));
  const regions=[{name:'战术测试区',points:10,nodes:Array.from({length:game.topology.nodeCount},(_,node)=>node)}];
  return {spec,game,regions,mustPlay:nodes(spec.mustPlay),mustAvoid:nodes(spec.mustAvoid)};
}

export function judgeTacticalMove(tacticalCase,node){
  if(node===null)return {ok:false,reason:'停一手'};
  if(tacticalCase.mustAvoid.includes(node))return {ok:false,reason:'命中禁着'};
  if(tacticalCase.mustPlay.length&&!tacticalCase.mustPlay.includes(node))return {ok:false,reason:'未命中预期着'};
  return {ok:true,reason:'通过'};
}

export function nodeLabel(game,node){
  if(node===null||node===undefined)return 'PASS';
  const {x,y}=game.topology.coords(node);
  return `${String.fromCharCode(65+x+(x>=8?1:0))}${game.topology.height-y}`;
}
