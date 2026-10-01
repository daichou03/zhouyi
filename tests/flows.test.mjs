import assert from 'node:assert/strict';
import { GoGame, GridTopology, BLACK, WHITE, buildRegions, buildAustraliaRegions, buildUsRegions } from '../src/engine.js';
import { MatchState, PHASES } from '../src/match.js';
import { createMatchRecord, appendMatchEvent, serializeMatchRecord, parseMatchRecord, applyMatchEvent } from '../src/record.js';

function noSafeMatch(onEvent = null) {
  const game = new GoGame(new GridTopology(9));
  const regions = buildRegions(game.topology, 'center');
  return new MatchState({ game, regions, safeEnabled: false, onEvent });
}

// Complete ordinary flow: preview -> play -> review -> finished.
const events = [];
const played = noSafeMatch(event => events.push(event));
assert.equal(played.start(), true);
assert.equal(played.phase, PHASES.PLAY);
assert.equal(played.play(0).ok, true);
assert.equal(played.play(10).ok, true);
assert.equal(played.pass().ok, true);
assert.equal(played.pass().ok, true);
assert.equal(played.phase, PHASES.REVIEW);
assert.equal(played.toggleDeadGroup(10).ok, true);
assert.equal(played.deadStones.has(10), true);
assert.equal(played.confirm().ok, true);
assert.equal(played.phase, PHASES.FINISHED);
assert.ok(played.finalScore.details.length > 0);
assert.equal(played.resume().ok, false, 'a confirmed game cannot be resumed');

// Every event, including review edits and confirmation, reconstructs exactly.
const record = createMatchRecord({ size: 9, safeEnabled: false, safeCount: 0, controllers: { [BLACK]: 'human', [WHITE]: 'human' } }, played.regions);
events.forEach(event => appendMatchEvent(record, event));
const parsed = parseMatchRecord(serializeMatchRecord(record));
const replay = noSafeMatch();
replay.start();
for (const event of parsed.events) assert.equal(applyMatchEvent(replay, event).ok, true, event.type);
assert.deepEqual([...replay.game.board], [...played.game.board]);
assert.deepEqual([...replay.deadStones], [...played.deadStones]);
assert.equal(replay.phase, PHASES.FINISHED);
assert.deepEqual(replay.finalScore.owners, played.finalScore.owners);
assert.equal(replay.finalScore.blackTotal, played.finalScore.blackTotal);
assert.equal(replay.finalScore.whiteTotal, played.finalScore.whiteTotal);

// Review may be cancelled; undo never crosses the protected opening boundary.
const resumed = noSafeMatch();
resumed.start(); resumed.play(0); resumed.play(10); resumed.pass(); resumed.pass();
assert.equal(resumed.resume().ok, true);
assert.equal(resumed.phase, PHASES.PLAY);
assert.equal(resumed.game.consecutivePasses, 0);
assert.equal(resumed.undo(2).ok, true);
assert.equal(resumed.game.history.length, 2);

assert.throws(() => parseMatchRecord('{"format":"wrong"}'), /不支持/);
const broken = JSON.parse(serializeMatchRecord(record));
broken.regions[0].nodes.pop();
assert.throws(() => parseMatchRecord(JSON.stringify(broken)), /区域地图无效/);

const australiaGame=new GoGame(new GridTopology(15,11)),australiaRegions=buildAustraliaRegions(australiaGame.topology);
const australiaRecord=createMatchRecord({size:15,width:15,height:11,regionPreset:'australia',safeEnabled:true,safeCount:1,controllers:{[BLACK]:'human',[WHITE]:'human'}},australiaRegions);
assert.equal(parseMatchRecord(serializeMatchRecord(australiaRecord)).regions.length,7);
const australiaMatch=new MatchState({game:australiaGame,regions:australiaRegions,safeEnabled:true,safeCount:1});
australiaMatch.start();
const actIndex=australiaRegions.findIndex(region=>region.name.includes('ACT'));
assert.equal(australiaMatch.selectSafeRegion(actIndex).ok,false,'ACT cannot be a safe state');

const usGame=new GoGame(new GridTopology(19,13)),usRegions=buildUsRegions(usGame.topology);
const usRecord=createMatchRecord({size:19,width:19,height:13,regionPreset:'usa',safeEnabled:true,safeCount:3,controllers:{[BLACK]:'human',[WHITE]:'human'}},usRegions);
assert.equal(parseMatchRecord(serializeMatchRecord(usRecord)).regions.length,15);

console.log('flow tests passed');
