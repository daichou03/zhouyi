import { GridTopology, generateRandomRegions, recommendedRegionCounts } from './engine.js';
import { analyzeMap } from './simulation.js';

const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
const rounded=(value,digits=3)=>Number(value.toFixed(digits));

export function structuralRisk(metrics) {
  const compactRisk=Math.max(0,.62-metrics.compactness.min)/.22;
  const areaRisk=Math.max(0,metrics.area.cv-.18)/.18;
  const perimeterRisk=Math.max(0,metrics.perimeterPerNode-1.05)/.45;
  const tipRisk=Math.max(0,metrics.tipRatio-.035)/.08;
  const adjacencyRisk=Math.max(0,metrics.adjacency.max-5)/3;
  return rounded(100*(compactRisk*1.8+areaRisk+perimeterRisk+tipRisk*1.4+adjacencyRisk*.7),1);
}

function percentile(values,p){
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b),position=(sorted.length-1)*p,lower=Math.floor(position),upper=Math.ceil(position);
  return sorted[lower]+(sorted[upper]-sorted[lower])*(position-lower);
}

function compactRegions(regions){return regions.map(region=>({name:region.name,points:region.points,nodes:[...region.nodes]}));}

export function generateMapStudy({samplesPerCell=20,seed='EXP-002'}={}){
  const sizes=[9,13,19],styles=['regular','natural','complex'],densities=['few','standard','many'],maps=[];
  for(const size of sizes)for(const style of styles)for(const density of densities){
    const regionCount=recommendedRegionCounts(size)[density],topology=new GridTopology(size);
    for(let sample=0;sample<samplesPerCell;sample++){
      const mapSeed=`${seed}:${size}:${style}:${density}:${sample}`,regions=generateRandomRegions(topology,{count:regionCount,style,seed:mapSeed}),metrics=analyzeMap(topology,regions);
      maps.push({id:`${size}-${style}-${density}-${sample}`,size,style,density,regionCount,mapSeed,metrics,risk:structuralRisk(metrics),regions:compactRegions(regions)});
    }
  }
  const cells=[];
  for(const size of sizes)for(const style of styles)for(const density of densities){
    const values=maps.filter(map=>map.size===size&&map.style===style&&map.density===density);
    cells.push({size,style,density,regionCount:values[0].regionCount,samples:values.length,
      risk:{mean:rounded(mean(values.map(map=>map.risk)),1),p90:rounded(percentile(values.map(map=>map.risk),.9),1),max:Math.max(...values.map(map=>map.risk))},
      compactness:{mean:rounded(mean(values.map(map=>map.metrics.compactness.mean))),min:Math.min(...values.map(map=>map.metrics.compactness.min))},
      areaCv:{mean:rounded(mean(values.map(map=>map.metrics.area.cv))),p90:rounded(percentile(values.map(map=>map.metrics.area.cv),.9))},
      tipRatio:{mean:rounded(mean(values.map(map=>map.metrics.tipRatio))),p90:rounded(percentile(values.map(map=>map.metrics.tipRatio),.9))},
      valueOffset:{mean:rounded(mean(values.map(map=>map.metrics.valueCentroidOffset))),p90:rounded(percentile(values.map(map=>map.metrics.valueCentroidOffset),.9))}
    });
  }
  return {format:'zhouyi-map-study',version:1,createdAt:new Date().toISOString(),config:{samplesPerCell,seed,sizes,styles,densities},summary:{maps:maps.length,cells:cells.length},cells,maps};
}

function nearestUnused(candidates,target,used,selector){
  return candidates.filter(map=>!used.has(map.id)).sort((a,b)=>Math.abs(selector(a)-target)-Math.abs(selector(b)-target))[0];
}

export function selectReviewMaps(study){
  const naturalStandard=study.maps.filter(map=>map.style==='natural'&&map.density==='standard'),used=new Set(),selected=[];
  const add=(map,group)=>{if(!map)return;used.add(map.id);selected.push({...map,reviewGroup:group});};
  for(const size of [9,13,19]){
    const pool=naturalStandard.filter(map=>map.size===size),sorted=[...pool].sort((a,b)=>a.risk-b.risk);
    add(sorted[Math.floor(sorted.length*.2)],'low-risk');
  }
  for(const size of [9,13,19]){
    const pool=naturalStandard.filter(map=>map.size===size);
    add(nearestUnused(pool,percentile(pool.map(map=>map.risk),.75),used,map=>map.risk),'borderline');
  }
  for(const size of [9,13,19]){
    const pool=study.maps.filter(map=>map.size===size);
    add([...pool].filter(map=>!used.has(map.id)).sort((a,b)=>b.risk-a.risk)[0],'shape-risk');
  }
  const visuallyOkay=study.maps.filter(map=>map.risk<percentile(study.maps.map(item=>item.risk),.6)&&!used.has(map.id));
  for(const map of [...visuallyOkay].sort((a,b)=>b.metrics.valueCentroidOffset-a.metrics.valueCentroidOffset).slice(0,3))add(map,'value-offset');
  return selected.map((map,index)=>({...map,reviewId:`M${String(index+1).padStart(2,'0')}`}));
}

export function formatMapStudyMarkdown(study,reviewMaps){
  const bySize=size=>study.maps.filter(map=>map.size===size);
  const lines=['# EXP-002 地图结构试跑','',`- 生成时间：${study.createdAt}`,`- 批次种子：\`${study.config.seed}\``,`- 样本：${study.summary.maps} 张地图，${study.summary.cells} 个配置单元`,'','## 尺寸汇总','','| 棋盘 | 地图数 | 平均最小紧凑度 | 平均面积 CV | 平均价值重心偏移 |','|---|---:|---:|---:|---:|'];
  for(const size of study.config.sizes){const maps=bySize(size);lines.push(`| ${size}×${size} | ${maps.length} | ${rounded(mean(maps.map(map=>map.metrics.compactness.min)))} | ${rounded(mean(maps.map(map=>map.metrics.area.cv)))} | ${rounded(mean(maps.map(map=>map.metrics.valueCentroidOffset)))} |`);}
  lines.push('','## 盲评样本','','评审板使用 M01–M12，不先显示自动分组。内部抽样由低风险、边缘、形状风险和价值重心偏移四组构成，每组3张。','','| 编号 | 棋盘 | 风格 | 区域数 | 自动分组 | 结构风险 | 最小紧凑度 | 面积 CV | 价值偏移 |','|---|---:|---|---:|---|---:|---:|---:|---:|');
  for(const map of reviewMaps)lines.push(`| ${map.reviewId} | ${map.size}×${map.size} | ${map.style} | ${map.regionCount} | ${map.reviewGroup} | ${map.risk} | ${map.metrics.compactness.min} | ${map.metrics.area.cv} | ${map.metrics.valueCentroidOffset} |`);
  lines.push('','## 限制','','- 结构风险分是用于抽样的暂定工具，不是地图最终质量分。','- 风格与密度具有不同目标，不能只按紧凑度排出统一名次。','- 价值重心偏移用于发现高分集中，不表示不对称地图必然不公平。','- 是否易读、自然和有战略趣味，必须由人工盲评校准。','');
  return lines.join('\n');
}
