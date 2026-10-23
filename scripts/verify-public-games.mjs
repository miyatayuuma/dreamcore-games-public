import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=path.resolve('public');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'games/catalog.json'),'utf8'));
const expected=['core-break','factor-raid','tap-challenge','charge-crash'];
assert.deepEqual(catalog.games.map(g=>g.id),expected);
assert.deepEqual(catalog.works,[]);
for(const game of catalog.games){
 assert.match(game.id,/^[a-z0-9-]+$/);
 const gameFolder=path.resolve(root,game.path);
 assert.ok(gameFolder.startsWith(root+path.sep),'Game path escapes public root');
 const htmlPath=path.join(gameFolder,'index.html');
 const cover=path.join(root,game.cover);
 assert.ok(fs.existsSync(htmlPath),htmlPath+' is missing');
 assert.ok(fs.existsSync(cover),cover+' is missing');
 if(!['tap-challenge','charge-crash'].includes(game.id))continue;
 const html=fs.readFileSync(htmlPath,'utf8');
 assert.ok(!html.includes('../../assets/bgm/bridge.mjs'),'Restricted BGM bridge present');
 assert.ok(!/あおちゃん|宮田|(?:\/assets\/[^'"]+\.(?:png|jpe?g|mp3))/.test(html),'Private identifier or unreviewed media reference');
 const refs=[...html.matchAll(/\.\/assets\/([a-z0-9-]+\.svg)/g)];
 assert.ok(refs.length>=6,game.id+': fictional art references are missing');
 for(const [,name] of refs){
  assert.ok(fs.existsSync(path.join(gameFolder,'assets',name)),name+' is missing');
 }
 for(const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
  const attr=match[1],body=match[2].trim();
  if(!body)continue;
  if(/type=["']importmap["']/.test(attr)){
   const map=JSON.parse(body);
   assert.match(map.imports.three,/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\//);
   continue;
  }
  const kind=/type=["']module["']/.test(attr)?'module':'commonjs';
  const checked=spawnSync(process.execPath,['--check','--input-type='+kind],{
    encoding:'utf8',input:body,maxBuffer:1024*1024
  });
  assert.equal(checked.status,0,game.id+' inline JS syntax: '+checked.stderr);
 }
}
console.log('Public catalog, synthetic assets, and imported inline scripts validated');
