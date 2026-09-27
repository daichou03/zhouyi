import assert from 'node:assert/strict';
import { existsSync,readFileSync,readdirSync } from 'node:fs';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBuiltinOnlyHost } from '../src/katago.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
assert.ok(existsSync(join(root,'.nojekyll')),'.nojekyll is required for raw static publishing');

const html=readFileSync(join(root,'index.html'),'utf8');
const assets=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match=>match[1]).filter(path=>!/^https?:|^#|^data:/.test(path));
for(const asset of assets){
  assert.ok(!asset.startsWith('/'),`GitHub project pages require a relative asset path: ${asset}`);
  assert.ok(existsSync(join(root,asset)),`Missing page asset: ${asset}`);
}

const walk=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(directory,entry.name)):entry.name.endsWith('.js')?[join(directory,entry.name)]:[]);
for(const file of walk(join(root,'src'))){
  const source=readFileSync(file,'utf8');
  for(const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)){
    const target=match[1];
    if(!target.startsWith('.'))continue;
    assert.ok(existsSync(resolve(dirname(file),target)),`${file}: missing module ${target}`);
  }
}

assert.equal(isBuiltinOnlyHost({hostname:'example.github.io'}),true,'GitHub Pages must use the built-in AI');
console.log(`GitHub Pages check passed: ${assets.length} entry assets and relative ES modules are deployable.`);
