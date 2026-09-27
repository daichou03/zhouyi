import { GoGame, GridTopology, BLACK, WHITE, EMPTY, createSeededRandom, generateRandomRegions, recommendedRegionCounts, recommendedSafeCount, scoreRegions, estimateLiveOwnership } from './engine.js';
import { chooseMove } from './ai.js';
import { MatchState, PHASES } from './match.js';
import { createMatchRecord, appendMatchEvent } from './record.js';

const colorName = color => color === BLACK ? 'black' : color === WHITE ? 'white' : 'tie';
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const deviation = values => {
  const average = mean(values);
  return Math.sqrt(mean(values.map(value => (value - average) ** 2)));
};

function correlation(xs, ys) {
  if (xs.length < 2 || xs.length !== ys.length) return 0;
  const xMean = mean(xs), yMean = mean(ys);
  const numerator = xs.reduce((sum, x, index) => sum + (x - xMean) * (ys[index] - yMean), 0);
  const denominator = Math.sqrt(xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0) * ys.reduce((sum, y) => sum + (y - yMean) ** 2, 0));
  return denominator ? numerator / denominator : 0;
}

function rounded(value, digits = 3) { return Number(value.toFixed(digits)); }

export function analyzeMap(topology, regions) {
  const areas = regions.map(region => region.nodes.length), points = regions.map(region => region.points);
  const centerX=(topology.width-1)/2,centerY=(topology.height-1)/2,maxDistance=Math.max(1,centerX+centerY);
  const centerScores = [], compactness = [], perimeters = [], adjacency = regions.map(()=>new Set());
  let tips=0,weightedX=0,weightedY=0;
  const owner=new Int16Array(topology.nodeCount).fill(-1);
  regions.forEach((region,index)=>region.nodes.forEach(node=>{owner[node]=index;}));
  for (let regionIndex=0;regionIndex<regions.length;regionIndex++) {
    const region=regions[regionIndex];
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,perimeter=0,distance=0;
    const nodes = new Set(region.nodes);
    for (const node of region.nodes) {
      const {x,y}=topology.coords(node);
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      distance += (Math.abs(x-centerX)+Math.abs(y-centerY))/maxDistance;
      const same=topology.neighbors(node).filter(next=>nodes.has(next)).length;
      perimeter += 4-same;if(same<=1)tips++;
      for(const next of topology.neighbors(node))if(owner[next]!==regionIndex)adjacency[regionIndex].add(owner[next]);
    }
    const centroidX=region.nodes.reduce((sum,node)=>sum+topology.coords(node).x,0)/region.nodes.length;
    const centroidY=region.nodes.reduce((sum,node)=>sum+topology.coords(node).y,0)/region.nodes.length;
    weightedX+=centroidX*region.points;weightedY+=centroidY*region.points;
    centerScores.push(1-distance/region.nodes.length);
    compactness.push(region.nodes.length/((maxX-minX+1)*(maxY-minY+1)));
    perimeters.push(perimeter);
  }
  const totalPoints=points.reduce((a,b)=>a+b,0),valueCenterX=weightedX/totalPoints,valueCenterY=weightedY/totalPoints;
  return {
    regionCount: regions.length,
    area: { min:Math.min(...areas), max:Math.max(...areas), mean:rounded(mean(areas)), cv:rounded(deviation(areas)/mean(areas)) },
    points: { min:Math.min(...points), max:Math.max(...points), mean:rounded(mean(points)), cv:rounded(deviation(points)/mean(points)), concentration:rounded(Math.max(...points)/points.reduce((a,b)=>a+b,0)) },
    compactness: { min:rounded(Math.min(...compactness)), mean:rounded(mean(compactness)) },
    perimeterPerNode: rounded(perimeters.reduce((a,b)=>a+b,0)/areas.reduce((a,b)=>a+b,0)),
    tipRatio:rounded(tips/topology.nodeCount),
    adjacency:{mean:rounded(mean(adjacency.map(set=>set.size))),max:Math.max(...adjacency.map(set=>set.size))},
    valueCentroidOffset:rounded(Math.hypot(valueCenterX-centerX,valueCenterY-centerY)/Math.max(1,Math.hypot(centerX,centerY))),
    areaPointCorrelation: rounded(correlation(areas,points)),
    centerPointCorrelation: rounded(correlation(centerScores,points))
  };
}

function chooseSafeRegion(match, random) {
  const available=match.regions.map((region,index)=>({index,score:region.points+random()*8})).filter(({index})=>match.regions[index].safeSelectable!==false&&match.safeOwner(index)===EMPTY);
  available.sort((a,b)=>b.score-a.score);
  return available[0]?.index ?? null;
}

function liveWinners(game, regions) {
  return scoreRegions(game,regions,estimateLiveOwnership(game)).details.map(region=>region.winner);
}

function countFlips(before, after) {
  return after.reduce((count,winner,index)=>count+(before[index]!==EMPTY&&winner!==EMPTY&&before[index]!==winner),0);
}

export function runSelfPlayGame(options = {}) {
  const size=options.size??9,width=options.width??size,height=options.height??size,regionCount=options.regionCount??recommendedRegionCounts(Math.max(width,height)).standard;
  const mapSeed=String(options.mapSeed??'simulation-map'),style=options.style??'natural';
  const topology=new GridTopology(width,height),game=new GoGame(topology);
  const regions=options.regions?.map(region=>({...region,nodes:[...region.nodes]}))??generateRandomRegions(topology,{count:regionCount,style,seed:mapSeed});
  const safeEnabled=options.safeEnabled??true,safeCount=safeEnabled?(options.safeCount??recommendedSafeCount(regions.length)):0;
  const levels={ [BLACK]:options.blackLevel??'balanced', [WHITE]:options.whiteLevel??'balanced' };
  const agentsByColor={ [BLACK]:options.blackAgent??'A', [WHITE]:options.whiteAgent??'B' };
  const random={
    [BLACK]:createSeededRandom(options.blackSeed??`${mapSeed}:black`),
    [WHITE]:createSeededRandom(options.whiteSeed??`${mapSeed}:white`)
  };
  const config={size:width,width,height,controllers:{[BLACK]:'ai',[WHITE]:'ai'},safeEnabled,safeCount,aiLevel:'simulation',regionPreset:options.regionPreset??'random',density:'custom',regionStyle:style,mapSeed};
  const record=createMatchRecord(config,regions);
  const match=new MatchState({game,regions,safeEnabled,safeCount,onEvent:event=>appendMatchEvent(record,event)});
  match.start();

  while(match.phase===PHASES.DRAFT){
    const color=match.activeColor,choice=chooseSafeRegion(match,random[color]);
    if(choice===null)throw new Error('没有可供 AI 选择的安全州');
    const result=match.selectSafeRegion(choice);
    if(!result.ok)throw new Error(result.reason);
  }

  const maxPlies=options.maxPlies??Math.ceil(topology.nodeCount*1.5);
  const minStablePlies=options.minStablePlies??Math.ceil(topology.nodeCount*.55),stabilityWindow=options.stabilityWindow??Math.max(6,width,height);
  let plies=0,flips=0,stablePlies=0,winners=liveWinners(game,regions),termination='natural-passes';
  while([PHASES.SAFE_OPENING,PHASES.PLAY].includes(match.phase)){
    if(plies>=maxPlies&&match.phase===PHASES.PLAY){
      match.pass();match.pass();termination='move-cap';break;
    }
    if(match.phase===PHASES.PLAY&&plies>=minStablePlies&&stablePlies>=stabilityWindow){
      match.pass();
      if(match.phase===PHASES.REVIEW)termination='stability-passes';
      continue;
    }
    const color=game.turn,allowed=match.phase===PHASES.SAFE_OPENING?match.allowedNodes(color):null;
    const node=chooseMove(game,regions,levels[color],allowed,random[color]);
    if(node===null){
      if(match.phase===PHASES.SAFE_OPENING)throw new Error('安全州内没有合法着点');
      match.pass();
    }else{
      const movePhase=match.phase,result=match.play(node);
      if(!result.ok)throw new Error(result.reason);
      plies++;
      const next=liveWinners(game,regions),changed=countFlips(winners,next);
      flips+=changed;stablePlies=movePhase===PHASES.PLAY?(changed?0:stablePlies+1):0;winners=next;
    }
  }
  if(match.phase!==PHASES.REVIEW)throw new Error(`自战未进入终局确认：${match.phase}`);
  const finalScore=match.reviewScore();match.confirm(finalScore);
  const winner=finalScore.blackTotal===finalScore.whiteTotal?EMPTY:finalScore.blackTotal>finalScore.whiteTotal?BLACK:WHITE;
  return {
    mapSeed,size:width,width,height,regionCount:regions.length,style,safeCount,agents:{black:agentsByColor[BLACK],white:agentsByColor[WHITE]},
    aiSeeds:{black:options.blackSeed??`${mapSeed}:black`,white:options.whiteSeed??`${mapSeed}:white`},
    winner:colorName(winner),agentWinner:winner===EMPTY?'tie':agentsByColor[winner],
    blackTotal:finalScore.blackTotal,whiteTotal:finalScore.whiteTotal,margin:Math.abs(finalScore.blackTotal-finalScore.whiteTotal),
    plies,termination,flips,stablePlies,captures:{black:game.captures[BLACK],white:game.captures[WHITE]},
    safePicks:{black:[...match.picks[BLACK]],white:[...match.picks[WHITE]]},
    regionWinners:finalScore.details.map(region=>colorName(region.winner)),record
  };
}

function wilson(successes, total) {
  if(!total)return [0,0];
  const z=1.96,p=successes/total,denominator=1+z*z/total;
  const center=(p+z*z/(2*total))/denominator;
  const spread=z*Math.sqrt((p*(1-p)+z*z/(4*total))/total)/denominator;
  return [rounded(center-spread),rounded(center+spread)];
}

export function summarizeBatch(games, maps) {
  const decisive=games.filter(game=>game.winner!=='tie'),blackWins=games.filter(game=>game.winner==='black').length,whiteWins=games.filter(game=>game.winner==='white').length;
  const agentAWins=games.filter(game=>game.agentWinner==='A').length,agentBWins=games.filter(game=>game.agentWinner==='B').length;
  const pairs=new Map();
  for(const game of games){if(!pairs.has(game.pair))pairs.set(game.pair,[]);pairs.get(game.pair).push(game);}
  let blackSweeps=0,whiteSweeps=0,agentASweeps=0,agentBSweeps=0,splitPairs=0;
  for(const pairGames of pairs.values()){
    if(pairGames.length!==2){splitPairs++;continue;}
    if(pairGames[0].winner!=='tie'&&pairGames[0].winner===pairGames[1].winner){if(pairGames[0].winner==='black')blackSweeps++;else whiteSweeps++;}
    else if(pairGames[0].agentWinner!=='tie'&&pairGames[0].agentWinner===pairGames[1].agentWinner){if(pairGames[0].agentWinner==='A')agentASweeps++;else agentBSweeps++;}
    else splitPairs++;
  }
  return {
    games:games.length,maps:maps.length,
    blackWins,whiteWins,ties:games.length-blackWins-whiteWins,
    blackWinRateDecisive:decisive.length?rounded(blackWins/decisive.length):0,
    blackWinRate95:wilson(blackWins,decisive.length),
    agentAWins,agentBWins,
    meanMargin:rounded(mean(games.map(game=>game.margin))),
    meanPlies:rounded(mean(games.map(game=>game.plies))),
    meanFlips:rounded(mean(games.map(game=>game.flips))),
    cappedGames:games.filter(game=>game.termination==='move-cap').length,
    stabilityEndedGames:games.filter(game=>game.termination==='stability-passes').length,
    pairOutcomes:{blackSweeps,whiteSweeps,agentASweeps,agentBSweeps,splitPairs},
    meanMapAreaCv:rounded(mean(maps.map(map=>map.metrics.area.cv))),
    meanMapPointCv:rounded(mean(maps.map(map=>map.metrics.points.cv))),
    meanCompactness:rounded(mean(maps.map(map=>map.metrics.compactness.mean)))
  };
}

export function runPairedBatch(options = {}) {
  const pairs=options.pairs??5,size=options.size??9,regionCount=options.regionCount??recommendedRegionCounts(size).standard;
  const batchSeed=String(options.seed??'batch'),style=options.style??'natural';
  const safeEnabled=options.safeEnabled??true,safeCount=safeEnabled?(options.safeCount??recommendedSafeCount(regionCount)):0;
  const games=[],maps=[];
  for(let pair=0;pair<pairs;pair++){
    const mapSeed=`${batchSeed}:map:${pair}`,topology=new GridTopology(size),regions=generateRandomRegions(topology,{count:regionCount,style,seed:mapSeed});
    maps.push({pair,mapSeed,metrics:analyzeMap(topology,regions)});
    const seedA=`${batchSeed}:pair:${pair}:agent:A`,seedB=`${batchSeed}:pair:${pair}:agent:B`;
    games.push({id:`P${pair+1}-A`,pair,...runSelfPlayGame({...options,size,regionCount,style,mapSeed,regions,safeEnabled,safeCount,blackAgent:'A',whiteAgent:'B',blackSeed:seedA,whiteSeed:seedB})});
    games.push({id:`P${pair+1}-B`,pair,...runSelfPlayGame({...options,size,regionCount,style,mapSeed,regions,safeEnabled,safeCount,blackAgent:'B',whiteAgent:'A',blackSeed:seedB,whiteSeed:seedA})});
  }
  return {
    format:'zhouyi-selfplay-report',version:1,createdAt:new Date().toISOString(),
    config:{pairs,size,regionCount,style,safeEnabled,safeCount,blackLevel:options.blackLevel??'balanced',whiteLevel:options.whiteLevel??'balanced',seed:batchSeed,maxPlies:options.maxPlies??Math.ceil(size*size*1.5),minStablePlies:options.minStablePlies??Math.ceil(size*size*.55),stabilityWindow:options.stabilityWindow??Math.max(6,size)},
    summary:summarizeBatch(games,maps),maps,games
  };
}

export function formatBatchReportMarkdown(report) {
  const s=report.summary,c=report.config,pct=value=>`${(value*100).toFixed(1)}%`;
  return `# 州弈自战试跑报告\n\n- 生成时间：${report.createdAt}\n- 批次种子：\`${c.seed}\`\n- 配置：${c.size}×${c.size}，${c.regionCount} 州，${c.style}，安全州 N=${c.safeCount}\n- 样本：${c.pairs} 张地图，每张交换智能体颜色，共 ${s.games} 局\n\n## 摘要\n\n| 指标 | 结果 |\n|---|---:|\n| 黑胜 / 白胜 / 平局 | ${s.blackWins} / ${s.whiteWins} / ${s.ties} |\n| 决胜局黑胜率 | ${pct(s.blackWinRateDecisive)} |\n| 黑胜率 95% 区间 | ${pct(s.blackWinRate95[0])}–${pct(s.blackWinRate95[1])} |\n| 智能体 A / B 胜局 | ${s.agentAWins} / ${s.agentBWins} |\n| 平均分差 | ${s.meanMargin} |\n| 平均手数 | ${s.meanPlies} |\n| 平均区域翻转数 | ${s.meanFlips} |\n| 达到手数上限 | ${s.cappedGames} / ${s.games} |\n| 稳定领先后停手 | ${s.stabilityEndedGames} / ${s.games} |\n| 黑方横扫 / 白方横扫配对 | ${s.pairOutcomes.blackSweeps} / ${s.pairOutcomes.whiteSweeps} |\n| 智能体 A / B 横扫配对 | ${s.pairOutcomes.agentASweeps} / ${s.pairOutcomes.agentBSweeps} |\n| 其余分裂配对 | ${s.pairOutcomes.splitPairs} |\n| 平均区域面积 CV | ${s.meanMapAreaCv} |\n| 平均区域分值 CV | ${s.meanMapPointCv} |\n| 平均紧凑度 | ${s.meanCompactness} |\n\n## 解释限制\n\n- 当前 AI 是无搜索的单手启发式 AI，本报告只能校验实验管线和发现异常，不能确定正式平衡。\n- AI 尚未形成可靠的主动停一手判断；试跑在区域领先连续稳定 ${c.stabilityWindow} 手且至少完成 ${c.minStablePlies} 手后让双方停手。达到 ${c.maxPlies} 手上限的对局会被强制结束。\n- 自动终局没有进行人工死子标记。\n- 黑白胜率必须结合颜色互换、代表棋谱和后续增强 AI 复验。\n`;
}
