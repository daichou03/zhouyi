import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { runPairedBatch, formatBatchReportMarkdown } from '../src/simulation.js';

function argumentsMap(values) {
  const result={};
  for(let i=0;i<values.length;i++)if(values[i].startsWith('--'))result[values[i].slice(2)]=values[i+1]&&!values[i+1].startsWith('--')?values[++i]:true;
  return result;
}

const args=argumentsMap(process.argv.slice(2));
const size=Number(args.size??9),regionCount=Number(args.regions??(size<=9?5:size<=13?8:12));
const report=runPairedBatch({
  pairs:Number(args.pairs??5),size,regionCount,style:String(args.style??'natural'),
  safeEnabled:args['no-safe']?false:true,safeCount:Number(args.safe??(regionCount<=6?1:regionCount<=12?2:3)),
  blackLevel:String(args.level??'balanced'),whiteLevel:String(args.level??'balanced'),
  seed:String(args.seed??'pilot'),maxPlies:args['max-plies']?Number(args['max-plies']):undefined,
  minStablePlies:args['min-stable-plies']?Number(args['min-stable-plies']):undefined,
  stabilityWindow:args.stability?Number(args.stability):undefined
});
const base=resolve(String(args.out??`reports/selfplay-${Date.now()}`));
await mkdir(dirname(base),{recursive:true});
await writeFile(`${base}.json`,JSON.stringify(report,null,2));
await writeFile(`${base}.md`,formatBatchReportMarkdown(report));
console.log(formatBatchReportMarkdown(report));
console.log(`JSON: ${base}.json`);
console.log(`Markdown: ${base}.md`);
