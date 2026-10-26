// GoGame.clone deliberately omits history for cheap search. Neural inputs need it.
export function cloneWithHistory(game){
  const copy=game.clone();
  copy.history=game.history.map(state=>({...state,board:state.board.slice(),captures:{...state.captures}}));
  return copy;
}

export function browserPosition(game){
  // Counterfactual 'other side to move' analyses are new setups, not a fabricated
  // non-alternating history. In particular, do not carry a ko ban to its owner.
  const history=game.history.at(-1)?.turn===game.turn?[]:game.history;
  return {width:game.topology.width,height:game.topology.height,board:[...game.board],toPlay:game.turn,
    previousBoard:history.at(-1)?[...history.at(-1).board]:undefined,
    previousPreviousBoard:history.at(-2)?[...history.at(-2).board]:undefined,
    moves:history.map((before,index)=>{
      const after=index+1<history.length?history[index+1].board:game.board;
      let node=-1;for(let i=0;i<after.length;i++)if(before.board[i]===0&&after[i]===before.turn){node=i;break;}
      return {x:node<0?-1:node%game.topology.width,y:node<0?-1:Math.floor(node/game.topology.width),player:before.turn===1?'black':'white'};
    })};
}
