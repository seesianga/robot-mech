#!/usr/bin/env node
/**
 * Asset coverage audit: what exists, what ships, and what the game actually uses.
 *
 * Three different questions that are easy to conflate:
 *   GENERATED — a raw Tripo GLB exists in assets/tripo/generated/
 *   SHIPPED   — LODs exist in public/models/ (built by scripts/build_lods.mjs)
 *   WIRED     — some file under src/ actually references it, so a player sees it
 *
 * An asset can be generated and shipped and still be invisible in game. This
 * reports all three so the gap is explicit rather than assumed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets', 'tripo', 'generated');
const PUB = path.join(ROOT, 'public', 'models');
const MANIFEST = path.join(ROOT, 'assets', 'tripo', 'manifest.json');

const generated = new Set(fs.existsSync(SRC)
  ? fs.readdirSync(SRC).filter((f) => f.endsWith('.glb')).map((f) => path.basename(f, '.glb')) : []);
const shipped = new Map();
if (fs.existsSync(PUB)) {
  for (const f of fs.readdirSync(PUB).filter((x) => x.endsWith('.glb'))) {
    const m = f.match(/^(.*)\.(lod[012])\.glb$/);
    if (!m) continue;
    const list = shipped.get(m[1]) ?? [];
    list.push(m[2]);
    shipped.set(m[1], list.sort());
  }
}

// Walk src/ once and note every asset id that appears in code, including ids built
// by template (`mech-${...}`), which a plain substring search would miss.
const code = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|mjs|js|html)$/.test(e.name)) code.push(fs.readFileSync(p, 'utf8'));
  }
})(path.join(ROOT, 'src'));
const blob = code.join('\n');
const templated = /`mech-\$\{/.test(blob);

const wired = (id) => blob.includes(id) || (templated && id.startsWith('mech-'));

const manifest = fs.existsSync(MANIFEST)
  ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).assets : [];
const byCat = new Map();
for (const a of manifest) {
  const list = byCat.get(a.category) ?? [];
  list.push(a.id);
  byCat.set(a.category, list);
}
// Generated assets absent from the manifest still deserve a row.
const extra = [...generated].filter((id) => !manifest.some((a) => a.id === id));
if (extra.length) byCat.set('unlisted', extra);

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('asset', 28)} ${pad('generated', 10)} ${pad('shipped', 18)} wired`);
console.log('-'.repeat(78));

const totals = { generated: 0, shipped: 0, wired: 0, total: 0 };
for (const [cat, ids] of byCat) {
  console.log(`\n[${cat}]`);
  for (const id of ids.sort()) {
    const g = generated.has(id);
    const s = shipped.get(id);
    const w = wired(id);
    totals.total++;
    if (g) totals.generated++;
    if (s) totals.shipped++;
    if (w && g) totals.wired++;
    console.log(`  ${pad(id, 26)} ${pad(g ? 'yes' : '—', 10)} ${pad(s ? s.join(',') : '—', 18)} ${w && g ? 'yes' : '—'}`);
  }
}

const rawMb = [...generated].reduce((a, id) => a + fs.statSync(path.join(SRC, `${id}.glb`)).size, 0) / 1e6;
const shipMb = fs.existsSync(PUB)
  ? fs.readdirSync(PUB).reduce((a, f) => a + fs.statSync(path.join(PUB, f)).size, 0) / 1e6 : 0;

console.log('\n' + '='.repeat(78));
console.log(`assets known      : ${totals.total}`);
console.log(`generated (raw)   : ${totals.generated}   ${rawMb.toFixed(0)} MB  (source only, never served)`);
console.log(`shipped (LODs)    : ${totals.shipped}   ${shipMb.toFixed(1)} MB  in public/models/`);
console.log(`wired into game   : ${totals.wired}`);
const gap = totals.generated - totals.wired;
if (gap > 0) {
  console.log(`\n${gap} generated asset(s) are built and shipped but nothing in src/ references them —`);
  console.log(`they are downloadable but no player will ever see them.`);
}
