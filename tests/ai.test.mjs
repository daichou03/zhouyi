import assert from 'node:assert/strict';
import { GoGame, GridTopology, BLACK, buildRegions } from '../src/engine.js';
import { chooseMove, evaluatePosition, selectProtectedTacticalMove } from '../src/ai.js';
import { tacticalCases } from '../fixtures/tactical-cases.js';
import { buildTacticalCase } from '../src/tactical-benchmark.js';

const game = new GoGame(new GridTopology(9));
const regions = buildRegions(game.topology, 'four');
const allowed = regions[0].nodes.slice(0, 4);
for (let i=0;i<20;i++) assert.ok(allowed.includes(chooseMove(game, regions, 'fast', allowed)), 'AI must respect forced opening region');

const capture=new GoGame(new GridTopology(3));
capture.board.set([0,1,0,1,2,1,0,0,0]);capture.turn=BLACK;
const captureRegions=[{name:'测试区',points:10,nodes:Array.from({length:9},(_,index)=>index)}];
assert.equal(chooseMove(capture,captureRegions,'deep',null,()=>.5),7,'AI should take an immediately capturable stone');

const advantage=new GoGame(new GridTopology(9));
advantage.board[0]=BLACK;advantage.board[1]=BLACK;advantage.board[9]=BLACK;
const advantageRegions=buildRegions(advantage.topology,'four');
assert.ok(evaluatePosition(advantage,advantageRegions,BLACK)>0,'smooth evaluation should recognize a black advantage');
assert.ok(evaluatePosition(advantage,advantageRegions,2)<0,'evaluation should reverse with perspective');

const teacherGame=new GoGame(new GridTopology(5)),teacherRegions=[{name:'测试区',points:10,nodes:Array.from({length:25},(_,index)=>index)}];
const teacherPolicy=new Float64Array(25);teacherPolicy[24]=.9;
assert.equal(chooseMove(teacherGame,teacherRegions,'deep',teacherRegions[0].nodes,()=>.5,{policy:teacherPolicy}),24,'teacher policy should guide root candidates');

const protectedChoice=selectProtectedTacticalMove([
  {action:1,baseScore:20,tacticalScore:20,captured:0,saved:2,reading:0},
  {action:2,baseScore:5,tacticalScore:30,captured:0,saved:0,reading:0},
]);
assert.equal(protectedChoice.action,1,'teacher bonus must not override a high-confidence tactical move');
assert.equal(selectProtectedTacticalMove([{action:1,baseScore:9,tacticalScore:20,captured:0,saved:0,reading:4},{action:2,baseScore:5,tacticalScore:5,captured:0,saved:0,reading:0}]),null,'small tactical margins should remain strategic choices');

const cornerNet=buildTacticalCase(tacticalCases.find(item=>item.id==='corner-net'));
const misleadingPolicy=new Float64Array(cornerNet.game.topology.nodeCount);misleadingPolicy[cornerNet.game.topology.index(5,5)]=.95;
assert.ok(cornerNet.mustPlay.includes(chooseMove(cornerNet.game,cornerNet.regions,'deep',null,()=>.5,{policy:misleadingPolicy})),'a global teacher prior must not suppress a forced corner attack');

const largeSave=buildTacticalCase(tacticalCases.find(item=>item.id==='save-large-chain'));
const capturePolicy=new Float64Array(largeSave.game.topology.nodeCount);capturePolicy[largeSave.game.topology.index(6,5)]=.95;
assert.equal(chooseMove(largeSave.game,largeSave.regions,'deep',null,()=>.5,{policy:capturePolicy}),largeSave.mustPlay[0],'saving a larger endangered chain must outrank a teacher-favored small capture');

console.log('ai tests passed');
