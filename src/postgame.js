import { BLACK,WHITE,EMPTY } from './engine.js';

export function countRegionalMoves(game,regions){
  const byNode=new Int16Array(game.topology.nodeCount).fill(-1),counts=regions.map(()=>({[BLACK]:0,[WHITE]:0}));
  regions.forEach((region,index)=>region.nodes.forEach(node=>{byNode[node]=index;}));
  for(let index=0;index<game.history.length;index++){
    const before=game.history[index],after=index+1<game.history.length?game.history[index+1].board:game.board,color=before.turn;
    let played=-1;
    for(let node=0;node<after.length;node++)if(before.board[node]===EMPTY&&after[node]===color){played=node;break;}
    const regionIndex=played>=0?byNode[played]:-1;
    if(regionIndex>=0)counts[regionIndex][color]++;
  }
  return counts;
}

export function buildPostgameSummary(score,regions,moveCounts,safePicks={}){
  let blackWon=0,whiteWon=0,tied=0,closeRegions=0,highInvestmentLosses=0,safeTotal=0,safeHeld=0;
  const rows=score.details.map((detail,index)=>{
    const winner=detail.winner,margin=Math.abs(detail.black-detail.white),closeLimit=Math.max(1,Math.ceil(detail.nodes.length*.05));
    if(winner===BLACK)blackWon++;else if(winner===WHITE)whiteWon++;else tied++;
    if(winner!==EMPTY&&margin<=closeLimit)closeRegions++;
    const blackMoves=moveCounts[index]?.[BLACK]||0,whiteMoves=moveCounts[index]?.[WHITE]||0;
    const winnerMoves=winner===BLACK?blackMoves:winner===WHITE?whiteMoves:0,loserMoves=winner===BLACK?whiteMoves:winner===WHITE?blackMoves:0;
    const safeOwner=(safePicks[BLACK]||[]).includes(index)?BLACK:(safePicks[WHITE]||[]).includes(index)?WHITE:EMPTY;
    const tags=[];
    if(safeOwner!==EMPTY){safeTotal++;if(winner===safeOwner){safeHeld++;tags.push('安全州守住');}else if(winner===EMPTY)tags.push('安全州战平');else tags.push('安全州失守');}
    if(winner!==EMPTY&&loserMoves>=winnerMoves+3){highInvestmentLosses++;tags.push('高投入落败');}
    if(winner!==EMPTY&&margin<=closeLimit)tags.push('险胜');
    return {index,name:detail.name,points:detail.points,winner,black:detail.black,white:detail.white,margin,blackMoves,whiteMoves,efficiency:winner!==EMPTY&&winnerMoves?detail.points/winnerMoves:null,tags};
  });
  const winner=score.blackTotal===score.whiteTotal?EMPTY:score.blackTotal>score.whiteTotal?BLACK:WHITE;
  return {winner,blackTotal:score.blackTotal,whiteTotal:score.whiteTotal,blackWon,whiteWon,tied,closeRegions,highInvestmentLosses,safeTotal,safeHeld,rows};
}
