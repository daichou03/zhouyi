import { BLACK, WHITE, EMPTY } from './engine.js?v=8b7457d1d7688be4';
import { listGroups } from './tactics.js?v=8b7457d1d7688be4';

// Benson-style sufficient test for unconditional life. Unknown is not dead.
export function analyzeUnconditionalLife(game) {
  const groups = listGroups(game), groupByNode = new Int16Array(game.board.length).fill(-1);
  groups.forEach((group, index) => group.stones.forEach(node => { groupByNode[node] = index; }));
  const seen = new Set(), spaces = [];
  for (let start = 0; start < game.board.length; start++) {
    if (game.board[start] !== EMPTY || seen.has(start)) continue;
    const nodes = [], borders = new Set(), stack = [start];
    seen.add(start);
    while (stack.length) {
      const node = stack.pop(); nodes.push(node);
      for (const next of game.topology.neighbors(node)) {
        if (game.board[next] !== EMPTY) borders.add(groupByNode[next]);
        else if (!seen.has(next)) { seen.add(next); stack.push(next); }
      }
    }
    spaces.push({ nodes, borders });
  }
  const alive = new Set(), territory = new Uint8Array(game.board.length);
  for (const color of [BLACK, WHITE]) {
    const blocks = new Set(groups.map((group, index) => group.color === color ? index : -1).filter(index => index >= 0));
    let eyes = spaces.filter(space => space.borders.size && [...space.borders].every(index => blocks.has(index)));
    let changed = true;
    while (changed) {
      changed = false;
      for (const index of [...blocks]) {
        const vital = eyes.filter(space => space.nodes.every(node => groups[index].liberties.has(node))).length;
        if (vital < 2) { blocks.delete(index); changed = true; }
      }
      eyes = eyes.filter(space => [...space.borders].every(index => blocks.has(index)));
    }
    for (const index of blocks) for (const node of groups[index].stones) alive.add(node);
    for (const space of eyes) for (const node of space.nodes) territory[node] = color;
  }
  // Only classify an invader when every defensive move is impossible and its
  // boundary consists entirely of unconditionally alive opposing stones.
  const dead = new Set();
  for (const group of groups) {
    if (group.liberties.size !== 1 || [...group.stones].some(node => alive.has(node))) continue;
    const boundary = new Set();
    for (const node of group.stones) for (const next of game.topology.neighbors(node)) {
      if (game.board[next] !== EMPTY && game.board[next] !== group.color) boundary.add(next);
    }
    if (!boundary.size || ![...boundary].every(node => alive.has(node))) continue;
    const defense = game.clone(); defense.finished = false; defense.turn = group.color;
    // Ignore the current simple ko ban: ko-dependent groups are left unknown.
    defense.previousPosition = null;
    if ([...group.liberties].some(node => defense.analyzeMove(node).legal)) continue;
    const canCapture = [...boundary].some(node => defense.groupAt(node).liberties.size === 1);
    if (!canCapture) for (const node of group.stones) dead.add(node);
  }
  return { alive, dead, territory, groups };
}

export function isFutileInvasion(game, node, life) {
  const enemy = game.turn === BLACK ? WHITE : BLACK;
  if (life.territory[node] !== enemy) return false;
  const move = game.analyzeMove(node);
  if (!move.legal || move.captured) return false;
  const next = game.clone(); next.board = move.board;
  return next.groupAt(node).liberties.size <= 1;
}

export function deadStonesFromOwnership(game, first, second, threshold = .9) {
  const valid = values => Array.isArray(values) && values.length === game.board.length && values.every(value => Number.isFinite(value) && value >= -1 && value <= 1);
  if (!valid(first) || !valid(second)) return new Set();
  const life = analyzeUnconditionalLife(game), dead = new Set(life.dead);
  const koBans=new Set();
  if(game.previousPosition){
    const withoutKo=game.clone();withoutKo.finished=false;withoutKo.previousPosition=null;
    for(let node=0;node<game.board.length;node++)if(game.board[node]===EMPTY){
      const move=withoutKo.analyzeMove(node);
      if(move.legal&&game.positionKey(move.board)===game.previousPosition)koBans.add(node);
    }
  }
  for (const group of life.groups) {
    if([...group.liberties].some(node=>koBans.has(node))){for(const node of group.stones)dead.delete(node);continue;}
    if ([...group.stones].some(node => life.alive.has(node))) continue;
    const sign = group.color === BLACK ? 1 : -1;
    if ([...group.stones].every(node => first[node] * sign <= -threshold && second[node] * sign <= -threshold)) {
      for (const node of group.stones) dead.add(node);
    }
  }
  return dead;
}
