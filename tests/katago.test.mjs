import assert from 'node:assert/strict';
import { BLACK, GoGame, GridTopology } from '../src/engine.js';
import { buildKataGoQuery, guidanceFromAnalysis, isBuiltinOnlyHost, nodeToGtp } from '../src/katago.js';
import { isAnalysisResultMessage, KataGoBridge } from '../scripts/katago-bridge.mjs';

const topology=new GridTopology(15,11),game=new GoGame(topology);
assert.equal(nodeToGtp(topology,topology.index(0,0)),'A11');
assert.equal(nodeToGtp(topology,topology.index(14,10)),'P1');
game.board[topology.index(0,0)]=BLACK;
const query=buildKataGoQuery(game,'deep');
assert.equal(query.boardXSize,15);assert.equal(query.boardYSize,11);assert.equal(query.maxVisits,400);
assert.deepEqual(query.initialStones,[['B','A11']]);

const policy=Array(topology.nodeCount+1).fill(0);policy[5]=.7;policy[6]=.2;policy[0]=.1;
const guidance=guidanceFromAnalysis(game,{policy,ownership:Array(topology.nodeCount).fill(0)},[5]);
assert.equal(guidance.policy[5],.7);assert.equal(guidance.policy[6],0);assert.equal(guidance.policy[0],0);
assert.equal(new KataGoBridge({}).status().configured,false);
assert.equal(isBuiltinOnlyHost({hostname:'example.github.io'}),true);
assert.equal(isBuiltinOnlyHost({hostname:'localhost'}),false);
assert.equal(isBuiltinOnlyHost({hostname:'play.example.com'}),false);
assert.equal(isAnalysisResultMessage({id:'x',warning:'unused field'}),false);
assert.equal(isAnalysisResultMessage({id:'x',rootInfo:{visits:1}}),true);
assert.equal(isAnalysisResultMessage({id:'x',error:'bad query'}),true);

console.log('katago bridge tests passed');
