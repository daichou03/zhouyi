import assert from 'node:assert/strict';
import { GoGame, GridTopology, BLACK, WHITE, buildRegions } from '../src/engine.js';
import { MatchState, PHASES } from '../src/match.js';
import { createMatchRecord, appendMatchEvent, serializeMatchRecord, parseMatchRecord, applyMatchEvent } from '../src/record.js';

function makeMatch(safeCount = 2, onEvent = null) {
  const game = new GoGame(new GridTopology(9));
  return new MatchState({ game, regions: buildRegions(game.topology, 'four'), safeEnabled: true, safeCount, onEvent });
}

const match = makeMatch();
assert.equal(match.phase, PHASES.PREVIEW);
assert.equal(match.play(0).ok, false);
match.start();
assert.equal(match.phase, PHASES.DRAFT);
assert.equal(match.activeColor, WHITE, 'white drafts first');
assert.equal(match.canSwapSides, true);
assert.equal(match.requestSideSwap().ok, true);
assert.equal(match.whiteBonus, .5);
assert.equal(match.activeColor, WHITE, 'the new white player still acts after a swap');
assert.equal(match.requestSideSwap().ok, true);
assert.equal(match.whiteBonus, 1, 'every repeated swap adds another half point to white');
assert.equal(match.selectSafeRegion(0).ok, true);
assert.equal(match.canSwapSides, false);
assert.equal(match.requestSideSwap().ok, false, 'swap bidding closes after the first safe-state pick');
assert.equal(match.activeColor, BLACK);
assert.equal(match.selectSafeRegion(1).ok, true);
match.selectSafeRegion(2); match.selectSafeRegion(3);
assert.equal(match.phase, PHASES.SAFE_OPENING);

const blackSecondPick = match.regions[3].nodes[0];
assert.equal(match.play(blackSecondPick).ok, true, 'black may open in its second-picked state');
const whiteSecondPick = match.regions[2].nodes.find(node => match.game.board[node] === 0);
assert.equal(match.play(whiteSecondPick).ok, true);
const blackUsedAgain = match.regions[3].nodes.find(node => match.game.board[node] === 0);
assert.equal(match.play(blackUsedAgain).ok, false, 'a used safe state cannot receive another forced stone');
assert.equal(match.play(match.regions[1].nodes.find(node => match.game.board[node] === 0)).ok, true);
assert.equal(match.play(match.regions[0].nodes.find(node => match.game.board[node] === 0)).ok, true);
assert.equal(match.phase, PHASES.PLAY);

match.pass(); match.pass();
assert.equal(match.phase, PHASES.REVIEW);
assert.equal(match.resume().ok, true);
assert.equal(match.phase, PHASES.PLAY);

const events = [], recorded = makeMatch(1, event => events.push(event));
recorded.start(); recorded.selectSafeRegion(0); recorded.selectSafeRegion(1);
recorded.play(recorded.regions[1].nodes[0]); recorded.play(recorded.regions[0].nodes[0]);
const record = createMatchRecord({ size: 9, safeEnabled: true, safeCount: 1 }, recorded.regions);
events.forEach(event => appendMatchEvent(record, event));
const parsed = parseMatchRecord(serializeMatchRecord(record));
const replayGame = new GoGame(new GridTopology(9));
const replay = new MatchState({ game: replayGame, regions: parsed.regions, safeEnabled: true, safeCount: 1 });
replay.start();
for (const event of parsed.events) assert.equal(applyMatchEvent(replay, event).ok, true);
assert.deepEqual([...replay.game.board], [...recorded.game.board], 'replay reconstructs the board');
assert.equal(replay.phase, recorded.phase);

const swapEvents=[],swapped=makeMatch(1,event=>swapEvents.push(event));
swapped.start();swapped.requestSideSwap();swapped.selectSafeRegion(0);swapped.selectSafeRegion(1);
const swapRecord=createMatchRecord({size:9,safeEnabled:true,safeCount:1},swapped.regions);
swapEvents.forEach(event=>appendMatchEvent(swapRecord,event));
const swappedReplay=makeMatch(1);swappedReplay.start();
for(const event of parseMatchRecord(serializeMatchRecord(swapRecord)).events)assert.equal(applyMatchEvent(swappedReplay,event).ok,true);
assert.equal(swappedReplay.whiteBonus,.5,'swap bonus survives record replay');
assert.equal(swappedReplay.reviewScore().whiteBonus,.5);
assert.equal(swappedReplay.reviewScore().whiteTotal,swappedReplay.reviewScore().details.reduce((sum,region)=>sum+(region.winner===WHITE?region.points:region.winner===0?region.points/2:0),0)+.5);

console.log('match tests passed');
