export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

export class GridTopology {
  constructor(width, height = width) {
    this.width = width;
    this.height = height;
    this.size = width;
    this.nodeCount = width * height;
  }
  index(x, y) { return y * this.width + x; }
  coords(index) { return { x: index % this.width, y: Math.floor(index / this.width) }; }
  neighbors(index) {
    const { x, y } = this.coords(index), out = [];
    if (x > 0) out.push(this.index(x - 1, y));
    if (x + 1 < this.width) out.push(this.index(x + 1, y));
    if (y > 0) out.push(this.index(x, y - 1));
    if (y + 1 < this.height) out.push(this.index(x, y + 1));
    return out;
  }
}

export class GoGame {
  constructor(topology, initial = []) {
    this.topology = topology;
    this.board = new Uint8Array(topology.nodeCount);
    for (const { node, color } of initial) this.board[node] = color;
    this.turn = BLACK;
    this.history = [];
    this.previousPosition = null;
    this.consecutivePasses = 0;
    this.finished = false;
    this.captures = { [BLACK]: 0, [WHITE]: 0 };
  }

  clone() {
    const copy = new GoGame(this.topology);
    copy.board = this.board.slice(); copy.turn = this.turn; copy.previousPosition = this.previousPosition;
    copy.consecutivePasses = this.consecutivePasses; copy.finished = this.finished; copy.captures = { ...this.captures };
    return copy;
  }

  groupAt(node, board = this.board) {
    const color = board[node], stones = new Set(), liberties = new Set(), stack = [node];
    while (stack.length) {
      const current = stack.pop();
      if (stones.has(current)) continue;
      stones.add(current);
      for (const next of this.topology.neighbors(current)) {
        if (board[next] === EMPTY) liberties.add(next);
        else if (board[next] === color && !stones.has(next)) stack.push(next);
      }
    }
    return { color, stones, liberties };
  }

  positionKey(board = this.board) { return Array.from(board).join(''); }

  analyzeMove(node, color = this.turn) {
    if (this.finished || this.board[node] !== EMPTY) return { legal: false };
    const next = this.board.slice(), opponent = color === BLACK ? WHITE : BLACK;
    next[node] = color;
    const captured = new Set();
    for (const neighbor of this.topology.neighbors(node)) {
      if (next[neighbor] !== opponent) continue;
      const group = this.groupAt(neighbor, next);
      if (group.liberties.size === 0) for (const stone of group.stones) captured.add(stone);
    }
    for (const stone of captured) next[stone] = EMPTY;
    if (this.groupAt(node, next).liberties.size === 0) return { legal: false };
    if (this.previousPosition === this.positionKey(next)) return { legal: false };
    return { legal: true, board: next, captured: captured.size };
  }

  play(node) {
    const result = this.analyzeMove(node);
    if (!result.legal) return false;
    this.saveHistory();
    this.previousPosition = this.positionKey();
    this.board = result.board;
    this.captures[this.turn] += result.captured;
    this.consecutivePasses = 0;
    this.turn = this.turn === BLACK ? WHITE : BLACK;
    return true;
  }

  pass() {
    if (this.finished) return;
    this.saveHistory();
    this.previousPosition = this.positionKey();
    this.consecutivePasses++;
    this.turn = this.turn === BLACK ? WHITE : BLACK;
    if (this.consecutivePasses >= 2) this.finished = true;
  }

  saveHistory() {
    this.history.push({ board: this.board.slice(), turn: this.turn, previousPosition: this.previousPosition, passes: this.consecutivePasses, finished: this.finished, captures: { ...this.captures } });
  }

  undo(plies = 1) {
    let state;
    while (plies-- > 0 && this.history.length) state = this.history.pop();
    if (!state) return false;
    this.board = state.board; this.turn = state.turn; this.previousPosition = state.previousPosition;
    this.consecutivePasses = state.passes; this.finished = state.finished; this.captures = state.captures;
    return true;
  }

  territoryOwnership() {
    const owner = new Uint8Array(this.topology.nodeCount), visited = new Set();
    this.board.forEach((value, i) => { if (value) owner[i] = value; });
    for (let start = 0; start < this.topology.nodeCount; start++) {
      if (this.board[start] !== EMPTY || visited.has(start)) continue;
      const area = new Set(), borders = new Set(), stack = [start];
      while (stack.length) {
        const node = stack.pop();
        if (visited.has(node)) continue;
        visited.add(node); area.add(node);
        for (const next of this.topology.neighbors(node)) {
          if (this.board[next] === EMPTY && !visited.has(next)) stack.push(next);
          else if (this.board[next] !== EMPTY) borders.add(this.board[next]);
        }
      }
      if (borders.size === 1) for (const node of area) owner[node] = [...borders][0];
    }
    return owner;
  }
}

export function buildRegions(topology, preset = 'four') {
  if (preset === 'australia') return buildAustraliaRegions(topology);
  const w = topology.width, h = topology.height;
  const specs = preset === 'three'
    ? [{ name: '西部州', points: 25, test: (x) => x < w / 3 }, { name: '中部州', points: 45, test: (x) => x >= w / 3 && x < 2*w/3 }, { name: '东部州', points: 30, test: (x) => x >= 2*w/3 }]
    : preset === 'center'
      ? [{ name: '中原', points: 36, test: (x,y) => x >= w*.3 && x < w*.7 && y >= h*.3 && y < h*.7 }, { name: '北境', points: 18, test: (x,y) => y < h*.3 }, { name: '东境', points: 16, test: (x,y) => x >= w*.7 }, { name: '南境', points: 17, test: (x,y) => y >= h*.7 }, { name: '西境', points: 13, test: () => true }]
      : [{ name: '西北州', points: 22, test: (x,y) => x < w/2 && y < h/2 }, { name: '东北州', points: 28, test: (x,y) => x >= w/2 && y < h/2 }, { name: '西南州', points: 18, test: (x,y) => x < w/2 && y >= h/2 }, { name: '东南州', points: 32, test: () => true }];
  const regions = specs.map(s => ({ name: s.name, points: s.points, nodes: [] }));
  for (let i = 0; i < topology.nodeCount; i++) {
    const { x, y } = topology.coords(i);
    const index = specs.findIndex(s => s.test(x, y));
    regions[index].nodes.push(i);
  }
  return regions;
}

export function buildAustraliaRegions(topology = new GridTopology(15, 11)) {
  if (topology.width !== 15 || topology.height !== 11) throw new Error('澳大利亚预设需要 15×11 棋盘');
  const layout = [
    'WWWWNNNNNQQQQQQ',
    'WWWWNNNNNQQQQQQ',
    'WWWWNNNNNQQQQQQ',
    'WWWWNNNNNQQQQQQ',
    'WWWWNNNNNQQQQQQ',
    'WWWWSSSSSEEEEEE',
    'WWWWSSSSSEEAAEE',
    'WWWWSSSSSEEAAEE',
    'WWWWSSSSSVVVVEE',
    'WWWWSSSSSVVVVVV',
    'WWWWSSSSSVVVVVV'
  ];
  const specs = [
    { code: 'W', name: '西澳 WA', points: 6 },
    { code: 'N', name: '北领地 NT', points: 4 },
    { code: 'S', name: '南澳 SA', points: 5 },
    { code: 'Q', name: '昆士兰 QLD', points: 7 },
    { code: 'E', name: '新南威尔士 NSW', points: 8 },
    { code: 'V', name: '维多利亚 VIC', points: 6 },
    { code: 'A', name: '首都领地 ACT', points: 1, safeSelectable: false }
  ];
  const byCode = new Map(specs.map((spec, index) => [spec.code, index]));
  const regions = specs.map(({ code, ...spec }) => ({ ...spec, nodes: [] }));
  layout.forEach((row, y) => [...row].forEach((code, x) => regions[byCode.get(code)].nodes.push(topology.index(x, y))));
  return regions;
}

function seedNumber(value) {
  const text = String(value), fallback = 0x9e3779b9;
  let hash = fallback;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 2654435761);
  return hash >>> 0;
}

export function createSeededRandom(seed) {
  let state = seedNumber(seed) || 1;
  return () => {
    state |= 0; state = state + 0x6D2B79F5 | 0;
    let n = Math.imul(state ^ state >>> 15, 1 | state);
    n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n;
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

export function recommendedRegionCounts(size) {
  if (size <= 9) return { few: 4, standard: 5, many: 7 };
  if (size <= 13) return { few: 6, standard: 8, many: 12 };
  return { few: 9, standard: 12, many: 16 };
}

export function recommendedSafeCount(regionCount) {
  return Math.max(1, Math.min(4, Math.round(regionCount * .2)));
}

function shuffled(values, random) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

function makeSeeds(topology, count, random) {
  const candidates = Array.from({ length: topology.nodeCount }, (_, i) => i);
  const margin = Math.max(topology.width, topology.height) >= 13 ? 1 : 0;
  const eligible = candidates.filter(i => { const {x,y}=topology.coords(i); return x>=margin&&y>=margin&&x<topology.width-margin&&y<topology.height-margin; });
  const seeds = [eligible[Math.floor(random() * eligible.length)]];
  while (seeds.length < count) {
    let best = null, bestScore = -Infinity;
    for (const node of shuffled(eligible, random)) {
      if (seeds.includes(node)) continue;
      const {x,y}=topology.coords(node);
      const distance = Math.min(...seeds.map(s => { const c=topology.coords(s); return Math.abs(x-c.x)+Math.abs(y-c.y); }));
      const score = distance + random() * 1.8;
      if (score > bestScore) { bestScore = score; best = node; }
    }
    seeds.push(best);
  }
  return seeds;
}

function growCandidate(topology, count, style, random) {
  const seeds = makeSeeds(topology, count, random), owner = new Int16Array(topology.nodeCount).fill(-1);
  const nodes = Array.from({length:count},()=>[]), frontiers = Array.from({length:count},()=>new Set());
  const variation = style === 'regular' ? .08 : style === 'complex' ? .28 : .16;
  const rawTargets = Array.from({length:count},()=>1 + (random()-.5)*2*variation);
  const scale = topology.nodeCount / rawTargets.reduce((a,b)=>a+b,0);
  const targets = rawTargets.map(v=>v*scale);
  seeds.forEach((seed,r)=>{owner[seed]=r;nodes[r].push(seed);});
  seeds.forEach((seed,r)=>{for(const n of topology.neighbors(seed))if(owner[n]<0)frontiers[r].add(n);});

  let remaining = topology.nodeCount - count;
  while (remaining > 0) {
    const available = Array.from({length:count},(_,r)=>r).filter(r=>frontiers[r].size);
    if (!available.length) break;
    available.sort((a,b)=>(targets[b]-nodes[b].length)/targets[b]-(targets[a]-nodes[a].length)/targets[a]);
    const region = available[Math.floor(random() * Math.min(3, available.length))];
    const seedCoord = topology.coords(seeds[region]);
    let bestNode = null, bestCost = Infinity;
    for (const node of frontiers[region]) {
      if (owner[node] >= 0) continue;
      let same=0, foreign=0, empty=0;
      for(const n of topology.neighbors(node)){if(owner[n]===region)same++;else if(owner[n]>=0)foreign++;else empty++;}
      const {x,y}=topology.coords(node), distance=Math.abs(x-seedCoord.x)+Math.abs(y-seedCoord.y);
      const noiseScale = style==='regular'?.45:style==='complex'?2.1:1.05;
      const tipPenalty = same===1 && empty>=2 ? (style==='complex'?.8:2.4) : 0;
      const cost = distance*.12 - same*1.75 + foreign*.38 + tipPenalty + random()*noiseScale;
      if(cost<bestCost){bestCost=cost;bestNode=node;}
    }
    if(bestNode===null){frontiers[region].clear();continue;}
    owner[bestNode]=region;nodes[region].push(bestNode);remaining--;
    for(const set of frontiers)set.delete(bestNode);
    for(const n of topology.neighbors(bestNode))if(owner[n]<0)frontiers[region].add(n);
  }
  return { owner, nodes };
}

function regionQuality(topology, generated, style) {
  let score=0;
  for(const area of generated.nodes){
    let minX=Infinity,minY=Infinity,maxX=-1,maxY=-1,perimeter=0,tips=0;
    const region=generated.owner[area[0]];
    for(const node of area){
      const {x,y}=topology.coords(node);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      const same=topology.neighbors(node).filter(n=>generated.owner[n]===region).length;
      perimeter += 4-same;if(same<=1)tips++;
    }
    const compact=area.length/((maxX-minX+1)*(maxY-minY+1));
    const target=style==='regular'?.83:style==='complex'?.59:.7;
    score -= Math.abs(compact-target)*18 + perimeter/area.length + tips*2;
  }
  return score;
}

function allocatePoints(areas, total, random) {
  const weights=areas.map(a=>Math.sqrt(a.length)*(0.82+random()*.36));
  const sum=weights.reduce((a,b)=>a+b,0), raw=weights.map(w=>w/sum*total), points=raw.map(Math.floor);
  let rest=total-points.reduce((a,b)=>a+b,0);
  const order=raw.map((v,i)=>({i,f:v-Math.floor(v)})).sort((a,b)=>b.f-a.f);
  for(let i=0;i<rest;i++)points[order[i%order.length].i]++;
  return points;
}

export function generateRandomRegions(topology, { count, style='natural', seed='default', totalPoints=100 } = {}) {
  count=Math.max(2,Math.min(count||recommendedRegionCounts(Math.max(topology.width,topology.height)).standard,Math.floor(topology.nodeCount/6)));
  let best=null,bestScore=-Infinity;
  for(let attempt=0;attempt<30;attempt++){
    const random=createSeededRandom(`${seed}:${attempt}`), candidate=growCandidate(topology,count,style,random), score=regionQuality(topology,candidate,style);
    if(score>bestScore){best=candidate;bestScore=score;}
  }
  const pointRandom=createSeededRandom(`${seed}:points`), points=allocatePoints(best.nodes,totalPoints,pointRandom);
  return best.nodes.map((nodes,i)=>({name:`第 ${i+1} 州`,points:points[i],nodes}));
}

export function estimateLiveOwnership(game, { maxDistance = 4, margin = 2 } = {}) {
  const owners = new Uint8Array(game.topology.nodeCount);
  const sources = { [BLACK]: [], [WHITE]: [] };
  game.board.forEach((color,node)=>{if(color!==EMPTY){owners[node]=color;sources[color].push(node);}});
  if(!sources[BLACK].length||!sources[WHITE].length)return owners;

  const distances=color=>{
    const result=new Int16Array(game.topology.nodeCount).fill(-1), queue=[...sources[color]];
    for(const node of queue)result[node]=0;
    for(let head=0;head<queue.length;head++){
      const node=queue[head];
      for(const next of game.topology.neighbors(node))if(result[next]===-1){result[next]=result[node]+1;queue.push(next);}
    }
    return result;
  };
  const blackDistance=distances(BLACK), whiteDistance=distances(WHITE);
  for(let node=0;node<game.topology.nodeCount;node++){
    if(game.board[node]!==EMPTY)continue;
    const black=blackDistance[node],white=whiteDistance[node];
    if(black<=maxDistance&&black+margin<=white)owners[node]=BLACK;
    else if(white<=maxDistance&&white+margin<=black)owners[node]=WHITE;
  }
  return owners;
}

export function scoreRegions(game, regions, ownership = null) {
  const owners = ownership || game.territoryOwnership();
  let blackTotal = 0, whiteTotal = 0;
  const details = regions.map(region => {
    let black = 0, white = 0;
    for (const node of region.nodes) { if (owners[node] === BLACK) black++; else if (owners[node] === WHITE) white++; }
    let winner = EMPTY;
    if (black > white) { winner = BLACK; blackTotal += region.points; }
    else if (white > black) { winner = WHITE; whiteTotal += region.points; }
    else { blackTotal += region.points / 2; whiteTotal += region.points / 2; }
    return { ...region, black, white, winner };
  });
  return { details, blackTotal, whiteTotal, owners };
}
