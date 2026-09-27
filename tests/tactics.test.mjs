import assert from 'node:assert/strict';
import { BLACK, WHITE, GoGame, GridTopology } from '../src/engine.js';
import { chooseMove, rankMoves } from '../src/ai.js';
import { isTrueEye, readGroupCapture, urgentMoveWeights } from '../src/tactics.js';

const oneRegion=topology=>[{name:'测试区',points:10,nodes:Array.from({length:topology.nodeCount},(_,index)=>index)}];

const atari=new GoGame(new GridTopology(5));
atari.board[12]=BLACK;atari.board[7]=WHITE;atari.board[11]=WHITE;atari.board[13]=WHITE;atari.turn=BLACK;
assert.ok((urgentMoveWeights(atari,BLACK).get(17)||0)>0,'last liberty must be marked urgent');
assert.equal(chooseMove(atari,oneRegion(atari.topology),'deep',null,()=>.5),17,'AI must save a group in atari');

const target=new GoGame(new GridTopology(3));
target.board.set([0,1,0,1,2,1,0,0,0]);target.turn=BLACK;
assert.equal(readGroupCapture(target,4,BLACK,3),1,'a surrounded group with one liberty is capturable');

const cornerNet=new GoGame(new GridTopology(5));
cornerNet.board[0]=BLACK;cornerNet.board[6]=WHITE;cornerNet.turn=WHITE;
assert.equal(readGroupCapture(cornerNet,0,WHITE,5),1,'reader should solve a two-liberty corner net');

const eye=new GoGame(new GridTopology(5));
for(const node of [6,7,8,11,13,16,17,18])eye.board[node]=BLACK;
eye.turn=BLACK;
assert.equal(isTrueEye(eye,12,BLACK),true);
const ranked=rankMoves(eye,oneRegion(eye.topology),25);
assert.ok(ranked.find(move=>move.node===12).score<ranked[0].score-10,'filling a true eye must be strongly discouraged');

console.log('tactics tests passed');
