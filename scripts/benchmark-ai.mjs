import { performance } from 'node:perf_hooks';
import { GridTopology, generateRandomRegions } from '../src/engine.js';
import { runSelfPlayGame } from '../src/simulation.js';

const pairs=Number(process.argv[2]||3),seed=String(process.argv[3]||'ai-v2-benchmark');
const games=[];const started=performance.now();
for(let pair=0;pair<pairs;pair++){
  const mapSeed=`${seed}:map:${pair}`,topology=new GridTopology(9),regions=generateRandomRegions(topology,{count:5,style:'natural',seed:mapSeed});
  const seedA=`${seed}:pair:${pair}:v2`,seedB=`${seed}:pair:${pair}:legacy`;
  games.push(runSelfPlayGame({size:9,regions,mapSeed,safeCount:1,blackLevel:'balanced',whiteLevel:'legacy',blackAgent:'v2',whiteAgent:'legacy',blackSeed:seedA,whiteSeed:seedB}));
  games.push(runSelfPlayGame({size:9,regions,mapSeed,safeCount:1,blackLevel:'legacy',whiteLevel:'balanced',blackAgent:'legacy',whiteAgent:'v2',blackSeed:seedB,whiteSeed:seedA}));
}
const wins=agent=>games.filter(game=>game.agentWinner===agent).length,ties=games.filter(game=>game.agentWinner==='tie').length;
const elapsed=(performance.now()-started)/1000;
console.log(`AI v2 vs legacy：${pairs} 张9路地图，换色共 ${games.length} 局`);
console.log(`v2 胜 ${wins('v2')}，legacy 胜 ${wins('legacy')}，平局 ${ties}`);
console.log(`v2 执黑胜 ${games.filter(game=>game.agentWinner==='v2'&&game.agents.black==='v2').length}，执白胜 ${games.filter(game=>game.agentWinner==='v2'&&game.agents.white==='v2').length}`);
console.log(`总耗时 ${elapsed.toFixed(2)} 秒，平均每局 ${(elapsed/games.length).toFixed(2)} 秒`);
console.log(`平均手数 ${(games.reduce((sum,game)=>sum+game.plies,0)/games.length).toFixed(1)}`);
