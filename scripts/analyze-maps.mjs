import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {generateMapStudy,selectReviewMaps,formatMapStudyMarkdown} from '../src/map-study.js';

function argumentsMap(values){const result={};for(let i=0;i<values.length;i++)if(values[i].startsWith('--'))result[values[i].slice(2)]=values[i+1]&&!values[i+1].startsWith('--')?values[++i]:true;return result;}
const args=argumentsMap(process.argv.slice(2)),study=generateMapStudy({samplesPerCell:Number(args.samples??20),seed:String(args.seed??'EXP-002')});
const reviewMaps=selectReviewMaps(study),report={...study,reviewMaps},base=resolve(String(args.out??'reports/EXP-002-map-study'));
await mkdir(dirname(base),{recursive:true});
await writeFile(`${base}.json`,JSON.stringify(report,null,2));
await writeFile(`${base}.md`,formatMapStudyMarkdown(study,reviewMaps));
console.log(formatMapStudyMarkdown(study,reviewMaps));
console.log(`JSON: ${base}.json`);console.log(`Markdown: ${base}.md`);
