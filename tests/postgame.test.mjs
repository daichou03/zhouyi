import assert from 'node:assert/strict';
import { BLACK,WHITE,EMPTY,GoGame,GridTopology } from '../src/engine.js';
import { buildPostgameSummary,countRegionalMoves } from '../src/postgame.js';

const game=new GoGame(new GridTopology(3));
game.play(0);game.play(8);game.pass();game.pass();
const regions=[{name:'甲州',points:4,nodes:[0,1,2,3,4]},{name:'乙州',points:6,nodes:[5,6,7,8]}];
const moves=countRegionalMoves(game,regions);
assert.equal(moves[0][BLACK],1);assert.equal(moves[0][WHITE],0);
assert.equal(moves[1][BLACK],0);assert.equal(moves[1][WHITE],1);
const score={blackTotal:4,whiteTotal:6,details:[{...regions[0],black:3,white:2,winner:BLACK},{...regions[1],black:1,white:3,winner:WHITE}]};
const summary=buildPostgameSummary(score,regions,moves,{[BLACK]:[0],[WHITE]:[1]});
assert.equal(summary.winner,WHITE);assert.equal(summary.blackWon,1);assert.equal(summary.whiteWon,1);assert.equal(summary.closeRegions,1);assert.equal(summary.safeHeld,2);
assert.ok(summary.rows[0].tags.includes('安全州守住'));assert.ok(summary.rows[0].tags.includes('险胜'));
assert.equal(summary.rows[0].efficiency,4);assert.equal(summary.rows[1].efficiency,6);

const highLoss=buildPostgameSummary({blackTotal:0,whiteTotal:5,details:[{name:'丙州',points:5,nodes:[0,1,2,3],black:1,white:3,winner:WHITE}]},[{name:'丙州',points:5,nodes:[0,1,2,3]}],[{[BLACK]:5,[WHITE]:1}],{});
assert.equal(highLoss.highInvestmentLosses,1);assert.ok(highLoss.rows[0].tags.includes('高投入落败'));
assert.equal(buildPostgameSummary({blackTotal:2,whiteTotal:2,details:[{name:'平州',points:4,nodes:[0],black:0,white:0,winner:EMPTY}]},[{name:'平州',points:4,nodes:[0]}],[{[BLACK]:0,[WHITE]:0}],{}).winner,EMPTY);

console.log('postgame tests passed');
