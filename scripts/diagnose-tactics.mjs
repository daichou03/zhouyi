import { mkdir,writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { chooseMove,rankMoves } from '../src/ai.js';
import { buildKataGoQuery,guidanceFromAnalysis } from '../src/katago.js';
import { buildTacticalCase,judgeTacticalMove,nodeLabel } from '../src/tactical-benchmark.js';
import { tacticalCases } from '../fixtures/tactical-cases.js';

const endpoint=process.env.KATAGO_ENDPOINT||'http://localhost:5173/api/katago/analyze';
const deterministic=()=>.5;

async function requestAnalysis(game){
  const query=buildKataGoQuery(game,'fast');query.maxVisits=64;
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(query),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
}

function topPolicyMoves(game,analysis,limit=5){
  return analysis.policy.map((policy,node)=>({node,policy})).filter(item=>item.node<game.topology.nodeCount&&item.policy>=0&&game.analyzeMove(item.node).legal).sort((a,b)=>b.policy-a.policy).slice(0,limit);
}

function classification(row){
  if(row.builtin.ok&&!row.final.ok)return '融合覆盖内置战术';
  if(row.final.ok&&row.builtin.ok)return '内置已通过';
  if(row.final.ok&&!row.builtin.ok)return 'KataGo纠正成功';
  if(row.katago.ok&&!row.final.ok)return '融合覆盖正确战术';
  if(!row.katago.ok)return 'KataGo首选未命中';
  return '待分析';
}

const rows=[];
for(const spec of tacticalCases){
  const tacticalCase=buildTacticalCase(spec),{game,regions}=tacticalCase;
  const started=performance.now();let analysis=null,analysisError=null;
  try{analysis=await requestAnalysis(game);}catch(error){analysisError=error.message;}
  const elapsedMs=Math.round(performance.now()-started);
  const ranked=rankMoves(game,regions,5),builtinNode=chooseMove(game,regions,'deep',null,deterministic);
  const policyMoves=analysis?topPolicyMoves(game,analysis):[],katagoNode=policyMoves[0]?.node??null;
  const guidance=analysis?guidanceFromAnalysis(game,analysis):null,finalNode=chooseMove(game,regions,'deep',null,deterministic,guidance);
  const row={
    id:spec.id,title:spec.title,category:spec.category,elapsedMs,analysisError,
    expected:[...tacticalCase.mustPlay].map(node=>nodeLabel(game,node)),avoid:[...tacticalCase.mustAvoid].map(node=>nodeLabel(game,node)),
    builtin:{move:nodeLabel(game,builtinNode),...judgeTacticalMove(tacticalCase,builtinNode)},
    katago:{move:nodeLabel(game,katagoNode),...judgeTacticalMove(tacticalCase,katagoNode)},
    final:{move:nodeLabel(game,finalNode),...judgeTacticalMove(tacticalCase,finalNode)},
    builtinTop:ranked.map(item=>({move:nodeLabel(game,item.node),score:Number(item.score.toFixed(2)),captured:item.captured,saved:item.saved})),
    katagoTop:policyMoves.map(item=>({move:nodeLabel(game,item.node),policy:Number(item.policy.toFixed(5))})),
  };
  row.classification=analysisError?'KataGo请求失败':classification(row);rows.push(row);
  console.log(`${row.final.ok?'✓':'✗'} ${row.title}: 内置 ${row.builtin.move} / KataGo ${row.katago.move} / 混合 ${row.final.move} — ${row.classification}`);
}

const summary={generatedAt:new Date().toISOString(),endpoint,total:rows.length,builtinPassed:rows.filter(row=>row.builtin.ok).length,katagoPassed:rows.filter(row=>row.katago.ok).length,finalPassed:rows.filter(row=>row.final.ok).length,rows};
const expected=row=>row.expected.length?row.expected.join('、'):`避开 ${row.avoid.join('、')}`;
const markdown=`# 死活与战术诊断 · 战术保护验证\n\n生成时间：${summary.generatedAt}\n\n| 题目 | 类型 | 预期 | 内置AI | KataGo全局首选 | 混合结果 | 分类 |\n|---|---|---:|---:|---:|---:|---|\n${rows.map(row=>`| ${row.title} | ${row.category} | ${expected(row)} | ${row.builtin.ok?'✓':'✗'} ${row.builtin.move} | ${row.katago.ok?'✓':'✗'} ${row.katago.move} | ${row.final.ok?'✓':'✗'} ${row.final.move} | ${row.classification} |`).join('\n')}\n\n## 汇总\n\n- 内置AI：${summary.builtinPassed}/${summary.total}\n- KataGo全局首选命中局部题解：${summary.katagoPassed}/${summary.total}\n- 当前混合决策：${summary.finalPassed}/${summary.total}\n\nKataGo一栏记录整盘最优策略首选，并非受限于局部的死活解题器；未命中不能单独视为模型不会死活。这个指标的用途是检查全局先验是否覆盖本地强制着。详细候选顺序与分数见 \`EXP-004-tactical-protection.json\`。初始8/10结果保存在 \`EXP-003-tactical-baseline.md\`。\n`;
await mkdir('reports',{recursive:true});
await Promise.all([writeFile('reports/EXP-004-tactical-protection.json',JSON.stringify(summary,null,2)),writeFile('reports/EXP-004-tactical-protection.md',markdown)]);
console.log(`报告已写入 reports/EXP-004-tactical-protection.md（混合通过 ${summary.finalPassed}/${summary.total}）`);
