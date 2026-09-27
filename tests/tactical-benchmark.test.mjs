import assert from 'node:assert/strict';
import { tacticalCases } from '../fixtures/tactical-cases.js';
import { buildTacticalCase,judgeTacticalMove,nodeLabel } from '../src/tactical-benchmark.js';

assert.ok(tacticalCases.length>=10,'baseline should cover at least ten tactical positions');
for(const spec of tacticalCases){
  const tacticalCase=buildTacticalCase(spec);
  assert.equal(tacticalCase.game.topology.nodeCount,81,'diagnostic positions use the smallest supported game board');
  for(const node of [...tacticalCase.mustPlay,...tacticalCase.mustAvoid])assert.ok(tacticalCase.game.analyzeMove(node).legal,`${spec.id}: expected nodes must be legal`);
}
const capture=buildTacticalCase(tacticalCases[0]);
assert.equal(nodeLabel(capture.game,capture.mustPlay[0]),'E4');
assert.equal(judgeTacticalMove(capture,capture.mustPlay[0]).ok,true);
assert.equal(judgeTacticalMove(capture,0).ok,false);
const eye=buildTacticalCase(tacticalCases.at(-1));
assert.equal(judgeTacticalMove(eye,eye.mustAvoid[0]).ok,false);

console.log('tactical benchmark tests passed');
