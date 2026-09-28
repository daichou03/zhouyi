import assert from 'node:assert/strict';
import { lastMoveHighlightFrame, regionOverlayTitle } from '../src/board-effects.js';

const start=lastMoveHighlightFrame(0,40),middle=lastMoveHighlightFrame(.5,40),end=lastMoveHighlightFrame(1,40);
assert.equal(start.radius,64);
assert.ok(middle.radius<start.radius&&middle.radius>end.radius,'highlight ring should shrink continuously');
assert.ok(Math.abs(end.radius-20.8)<1e-9);
assert.equal(start.alpha,1);
assert.equal(end.alpha,0);
assert.deepEqual(lastMoveHighlightFrame(-1,40),start,'progress is clamped below zero');
assert.deepEqual(lastMoveHighlightFrame(2,40),end,'progress is clamped above one');
assert.equal(regionOverlayTitle(0,'第 1 州'),'01 · 第 1 州');
assert.equal(regionOverlayTitle(11,'新南威尔士 NSW'),'12 · 新南威尔士 NSW');

console.log('board effects tests passed');
