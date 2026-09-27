import assert from 'node:assert/strict';
import { GridTopology, buildAustraliaRegions, generateRandomRegions } from '../src/engine.js';
import { analyzeMap, runSelfPlayGame, runPairedBatch } from '../src/simulation.js';
import { structuralRisk, generateMapStudy, selectReviewMaps } from '../src/map-study.js';

const topology=new GridTopology(9),regions=generateRandomRegions(topology,{count:5,style:'natural',seed:'metrics'});
const metrics=analyzeMap(topology,regions);
assert.equal(metrics.regionCount,5);
assert.equal(metrics.area.min>0,true);
assert.equal(metrics.points.concentration<=.25,true);
assert.equal(metrics.tipRatio>=0&&metrics.tipRatio<=1,true);
assert.equal(metrics.valueCentroidOffset>=0&&metrics.valueCentroidOffset<=1,true);
assert.equal(structuralRisk(metrics)>=0,true);

const options={size:9,regionCount:5,style:'natural',mapSeed:'repro',safeCount:1,blackSeed:'black',whiteSeed:'white',maxPlies:30};
const first=runSelfPlayGame(options),second=runSelfPlayGame(options);
for(const key of ['winner','blackTotal','whiteTotal','plies','termination','flips'])assert.deepEqual(first[key],second[key],key);
assert.deepEqual(first.record.events,second.record.events,'same seeds reproduce every event');
assert.equal(first.record.events.at(-1).type,'confirm');

const batch=runPairedBatch({pairs:1,size:9,regionCount:5,safeCount:1,seed:'paired-test',maxPlies:20});
assert.equal(batch.games.length,2);
assert.equal(batch.maps.length,1);
assert.equal(batch.games[0].mapSeed,batch.games[1].mapSeed);
assert.equal(batch.games[0].agents.black,'A');
assert.equal(batch.games[1].agents.white,'A');
assert.equal(batch.summary.games,2);

const australiaTopology=new GridTopology(15,11),australiaRegions=buildAustraliaRegions(australiaTopology);
const australiaGame=runSelfPlayGame({size:15,width:15,height:11,regions:australiaRegions,regionPreset:'australia',safeCount:1,mapSeed:'australia-ai-test',maxPlies:12});
assert.equal(australiaGame.record.config.width,15);
assert.equal(australiaGame.record.config.height,11);
assert.equal(australiaGame.record.regions.length,7);

const study=generateMapStudy({samplesPerCell:2,seed:'study-test'}),review=selectReviewMaps(study);
assert.equal(study.summary.maps,54);
assert.equal(study.cells.length,27);
assert.equal(review.length,12);
assert.equal(new Set(review.map(map=>map.id)).size,12);

console.log('simulation tests passed');
