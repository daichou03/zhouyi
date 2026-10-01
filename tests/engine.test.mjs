import assert from 'node:assert/strict';
import { GoGame, GridTopology, BLACK, WHITE, buildRegions, buildAustraliaRegions, buildUsRegions, scoreRegions, generateRandomRegions, recommendedRegionCounts, recommendedSafeCount, estimateLiveOwnership } from '../src/engine.js';

const game = new GoGame(new GridTopology(3));
assert.equal(game.play(1), true);
game.play(4); game.play(3); game.play(8); game.play(5); game.play(7);
assert.equal(game.play(7), false, 'occupied point is illegal');

const capture = new GoGame(new GridTopology(3));
capture.board.set([0,1,0,1,2,1,0,0,0]);
capture.turn = BLACK;
assert.equal(capture.play(7), true);
assert.equal(capture.board[4], 0, 'surrounded white stone is captured');
assert.equal(capture.captures[BLACK], 1);

const regions = buildRegions(new GridTopology(9), 'four');
assert.equal(regions.length, 4);
assert.equal(regions.reduce((n,r)=>n+r.nodes.length,0), 81);
assert.equal(regions.reduce((n,r)=>n+r.points,0), 100);

const full = new GoGame(new GridTopology(3));
full.board.fill(BLACK);
const result = scoreRegions(full, buildRegions(full.topology, 'three'));
assert.equal(result.blackTotal, 100);
assert.equal(result.whiteTotal, 0);

const ending = new GoGame(new GridTopology(3));
ending.pass(); ending.pass();
assert.equal(ending.finished, true, 'two consecutive passes enter endgame');
assert.equal(ending.consecutivePasses, 2);
ending.undo(2);
assert.equal(ending.finished, false, 'endgame can be rolled back');

assert.deepEqual(recommendedRegionCounts(9), { few: 4, standard: 5, many: 7 });
assert.equal(recommendedSafeCount(5), 1);
assert.equal(recommendedSafeCount(8), 2);
assert.equal(recommendedSafeCount(12), 2);
assert.equal(recommendedSafeCount(16), 3);
const randomMap = generateRandomRegions(new GridTopology(9), { count: 5, style: 'natural', seed: 'test-map' });
assert.equal(randomMap.length, 5);
assert.equal(randomMap.reduce((n,r)=>n+r.nodes.length,0), 81);
assert.equal(new Set(randomMap.flatMap(r=>r.nodes)).size, 81, 'every node belongs to exactly one region');
assert.equal(randomMap.reduce((n,r)=>n+r.points,0), 100);
for (const region of randomMap) {
  const allowed = new Set(region.nodes), seen = new Set(), stack = [region.nodes[0]];
  while (stack.length) { const node=stack.pop(); if(seen.has(node))continue; seen.add(node); for(const n of new GridTopology(9).neighbors(node))if(allowed.has(n))stack.push(n); }
  assert.equal(seen.size, region.nodes.length, 'random region must be connected');
}
assert.deepEqual(randomMap, generateRandomRegions(new GridTopology(9), { count: 5, style: 'natural', seed: 'test-map' }), 'seed is reproducible');

const australiaTopology=new GridTopology(15,11),australia=buildAustraliaRegions(australiaTopology);
assert.equal(australiaTopology.nodeCount,165);
assert.deepEqual(australiaTopology.coords(164),{x:14,y:10});
assert.equal(australiaTopology.neighbors(australiaTopology.index(14,10)).length,2);
assert.equal(australia.length,7);
assert.equal(australia.reduce((sum,region)=>sum+region.nodes.length,0),165);
assert.equal(australia.reduce((sum,region)=>sum+region.points,0),37);
assert.equal(australia.some(region=>region.name.includes('塔斯马尼亚')),false);
assert.equal(australia.find(region=>region.name.includes('ACT')).safeSelectable,false);
for(const region of australia){
  const allowed=new Set(region.nodes),seen=new Set(),stack=[region.nodes[0]];
  while(stack.length){const node=stack.pop();if(seen.has(node))continue;seen.add(node);for(const next of australiaTopology.neighbors(node))if(allowed.has(next))stack.push(next);}
  assert.equal(seen.size,region.nodes.length,`${region.name} must be connected`);
}

const usTopology=new GridTopology(19,13),us=buildUsRegions(usTopology);
assert.equal(us.length,15);
assert.equal(us.reduce((sum,region)=>sum+region.nodes.length,0),247);
assert.equal(new Set(us.flatMap(region=>region.nodes)).size,247);
assert.equal(us.reduce((sum,region)=>sum+region.points,0),100);
assert.equal(us.find(region=>region.name==='五大湖').points,10);
for(const region of us){
  const allowed=new Set(region.nodes),seen=new Set(),stack=[region.nodes[0]];
  while(stack.length){const node=stack.pop();if(seen.has(node))continue;seen.add(node);for(const next of usTopology.neighbors(node))if(allowed.has(next))stack.push(next);}
  assert.equal(seen.size,region.nodes.length,`${region.name} must be connected`);
}

const live = new GoGame(new GridTopology(9));
live.board[40] = BLACK;
let estimated = estimateLiveOwnership(live);
assert.equal(estimated.reduce((n,color)=>n+(color===BLACK),0), 1, 'a lone stone must not claim the open board');
live.board[0] = WHITE;
estimated = estimateLiveOwnership(live);
assert.equal(estimated[40], BLACK);
assert.equal(estimated[0], WHITE);
assert.ok(estimated.reduce((n,color)=>n+(color===0),0)>0, 'uncertain open points remain neutral');

console.log('engine tests passed');
