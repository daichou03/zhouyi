import assert from 'node:assert/strict';
import { isHumanVsAi, shouldAiOfferSwap } from '../src/controllers.js';

assert.equal(isHumanVsAi({ 1: 'human', 2: 'ai' }), true);
assert.equal(isHumanVsAi({ 1: 'ai', 2: 'human' }), true);
assert.equal(isHumanVsAi({ 1: 'human', 2: 'human' }), false);
assert.equal(isHumanVsAi({ 1: 'ai', 2: 'ai' }), false);
assert.equal(shouldAiOfferSwap({ 1: 'human', 2: 'ai' }, 0), false, 'AI accepts white against a human');
assert.equal(shouldAiOfferSwap({ 1: 'ai', 2: 'human' }, 0), false, 'AI accepts white after a human swaps');
assert.equal(shouldAiOfferSwap({ 1: 'ai', 2: 'ai' }, 0), true, 'AI self-play keeps the baseline swap policy');
assert.equal(shouldAiOfferSwap({ 1: 'ai', 2: 'ai' }, .5), false);

console.log('controller mode tests passed');
