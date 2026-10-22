import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const pub = join(root, 'public');
const catalog = JSON.parse(readFileSync(join(pub, 'games/catalog.json'), 'utf8'));
const byId = new Map(catalog.games.map(g => [g.id,g]));
assert.equal(byId.size, catalog.games.length, 'Duplicate catalog ID');
for (const id of ['core-break', 'factor-raid']) {
  const game = byId.get(id);
  assert.equal(game?.status, 'ready', 'Missing ready game: ' + id);
  assert.equal(game.path, 'games/' + id + '/');
  assert.ok(existsSync(join(pub, game.path, 'index.html')));
}
const core = join(pub, 'games/core-break');
const html = readFileSync(join(core, 'index.html'), 'utf8');
const version = JSON.parse(readFileSync(join(core, 'version.json'), 'utf8')).version;
assert.match(version, /^\d+(?:\.\d+)*$/);
assert.ok(html.includes('src="src/bootstrap.mjs?v=' + version + '"'), 'CORE BREAK bootstrap must be versioned');
assert.ok(html.includes('rel="manifest"'), 'CORE BREAK PWA metadata missing');
const modules = new Set();
function inspectModule(path) {
  const full = resolve(core, path);
  assert.ok(full.startsWith(core + '/'), 'Unexpected module path: ' + path);
  assert.ok(existsSync(full), 'Missing module: ' + path);
  if (modules.has(full)) return;
  modules.add(full);
  const source = readFileSync(full, 'utf8');
  execFileSync(process.execPath, ['--check', full]);
  for (const [, spec, query] of source.matchAll(/(?:\bfrom\s*|\bimport\s*)["'](\.\.?\/[^"'?]+\.mjs)(\?[^"']*)?["']/g)) {
    assert.equal(query, '?v=' + version, 'Unversioned CORE BREAK dependency: ' + path + ' -> ' + spec);
    const dep = resolve(dirname(full), spec);
    assert.ok(dep.startsWith(join(core, 'src') + '/'), 'Cross-game import: ' + spec);
    inspectModule(dep.slice(core.length + 1));
  }
}
inspectModule('src/bootstrap.mjs');
assert.ok(modules.size >= 14, 'Incomplete CORE BREAK module graph: ' + modules.size);
for (const asset of ['play.css', 'favicon.svg', 'manifest.webmanifest']) assert.ok(existsSync(join(core, asset)), 'Missing CORE BREAK asset: ' + asset);

const factor = join(pub, 'games/factor-raid');
const factorHtml = readFileSync(join(factor, 'index.html'), 'utf8');
assert.ok(factorHtml.includes('<title>FACTOR RAID</title>'));
assert.ok(factorHtml.includes('<div class="brand">FACTOR RAID</div>'));
assert.ok(!factorHtml.includes('← エリアをえらぶ'), 'Duplicate in-game back link');
assert.ok(!factorHtml.includes('classic.html'), 'Legacy source path left in new game');
assert.ok(existsSync(join(factor, 'style.css')));
assert.ok(existsSync(join(factor, 'favicon.svg')));
const scripts = [...factorHtml.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);
const sharedAudio = '../../assets/audio-settings.js';
assert.equal(scripts.filter(url=>url===sharedAudio).length,1,
  'FACTOR RAID must include the single approved shared audio settings script');
const gameScripts=scripts.filter(url=>url!==sharedAudio);
assert.equal(gameScripts.length, 10, 'Unexpected FACTOR RAID game dependency count');
for(const url of gameScripts) {
  assert.match(url, /^[a-z0-9-]+\.js\?v=[a-zA-Z0-9.]+$/, 'Nonlocal FACTOR RAID script: ' + url);
  const name = url.split('?')[0];
  const full = join(factor, name);
  assert.ok(existsSync(full), 'Missing FACTOR RAID script: ' + name);
  execFileSync(process.execPath, ['--check', full]);
}
assert.equal(readdirSync(factor).filter(x=>x.endsWith('.js')).length, gameScripts.length, 'FACTOR RAID stray/missing JavaScript');
console.log('Both math games: isolated entrypoints, module/script graph, syntax and launcher catalog verified.');
