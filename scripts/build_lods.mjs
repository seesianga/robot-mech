#!/usr/bin/env node
/**
 * Turn the raw Tripo3D output into shippable game assets.
 *
 * Tripo hands back a ~44 MB, ~1.4M-triangle, 4096^2-textured GLB per asset. That is a
 * hi-poly SOURCE, not something a browser can load — 32 of them is 1.3 GB. This script
 * produces the three LODs the handbook calls for and writes them to public/models/,
 * which is the only place the game loads from.
 *
 *   LOD0  ~120k tris, 2048^2  — hangar turntable, cinematics, close camera
 *   LOD1   ~40k tris, 1024^2  — in-match player and nearby mechs
 *   LOD2   ~12k tris,  512^2  — distant mechs, crowds, minimap props
 *
 * Raw sources stay in assets/tripo/generated/ and are NEVER served: keeping them in
 * public/ is what made dist 1.3 GB.
 *
 * Usage:
 *   node scripts/build_lods.mjs                # build every raw GLB that is stale
 *   node scripts/build_lods.mjs --ids mech-halite,mech-craton
 *   node scripts/build_lods.mjs --force        # rebuild even if up to date
 *   node scripts/build_lods.mjs --only lod1    # single tier
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classOf } from './tripo/qc.mjs';

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, 'assets', 'tripo', 'generated');
const OUT_DIR = path.join(ROOT, 'public', 'models');

// We target the budget by RATIO, not by error tolerance. The error->triangle curve is
// wildly model-dependent — at error 0.0004 Orogen lands at 150k while Gabbro lands at
// 73k — so a fixed error silently blows the budget on dense models and wastes it on
// sparse ones. ratio = budget/sourceTris with the error cap released hits the number
// directly. `keep` leaves headroom for the welder, which can only merge, never split.
//
// Budgets are now PER CLASS, from §6.8 of the AAA redesign spec.
//
// The previous table was one tier set — 120k/40k/12k — applied to every asset. That is
// the single defect the §6.6 QC gate found: every shipped model came out at ~112,800
// triangles whether it was a hero mech or a supply crate, so 32 props carried 3.6M
// triangles against §6.8's 600k per-level dressing ceiling. Frames happened to fit
// their 180k budget; props were 9.4x over a 12k one.
//
// Class comes from scripts/tripo/qc.mjs so the gate and the builder cannot disagree
// about what an asset IS — a builder that classifies differently from its own gate
// produces assets that fail the moment they are written.
const CLASS_TIERS = {
  //          LOD0 tris   LOD1     LOD2    textures (LOD0/1/2)
  frame:    { budgets: [170000, 75000, 32000], textures: [2048, 1024, 512] },
  cockpit:  { budgets: [145000, 75000, 32000], textures: [2048, 1024, 512] },
  vehicle:  { budgets: [ 48000, 15000,  6000], textures: [2048, 1024, 512] },
  struct:   { budgets: [ 66000, 20000,  8000], textures: [2048, 1024, 512] },
  // §6.8 puts props at 3-12k LOD0. Dressing is instanced many times per level, so this
  // is where the frame-rate actually lives.
  prop:     { budgets: [ 11000,  4400,  1600], textures: [1024,  512, 256] },
};

const TIER_NAMES = ['lod0', 'lod1', 'lod2'];
const KEEP = 0.94;

function tiersFor(id) {
  const cls = classOf(id);
  const t = CLASS_TIERS[cls] ?? CLASS_TIERS.prop;
  return TIER_NAMES.map((name, i) => ({
    name, cls, texture: t.textures[i], budget: t.budgets[i], keep: KEEP,
  }));
}

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

const onlyTier = val('--only');
const idFilter = val('--ids')?.split(',').map((s) => s.trim()).filter(Boolean);
const force = has('--force');

function triCount(file) {
  const b = fs.readFileSync(file);
  if (b.subarray(0, 4).toString() !== 'glTF') return 0;
  const jlen = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jlen).toString());
  let t = 0;
  for (const m of j.meshes ?? []) {
    for (const p of m.primitives ?? []) {
      if (p.indices != null) t += Math.floor(j.accessors[p.indices].count / 3);
    }
  }
  return t;
}

const mb = (f) => (fs.statSync(f).size / 1024 / 1024);

async function buildTier(id, src, tier, srcTris) {
  const out = path.join(OUT_DIR, `${id}.${tier.name}.glb`);
  if (!force && fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) {
    return { id, tier: tier.name, skipped: true, tris: triCount(out), mb: mb(out) };
  }
  // Aim slightly under budget; release the error cap so ratio is what actually binds.
  const ratio = Math.min(1, (tier.budget * tier.keep) / Math.max(1, srcTris));
  await exec('npx', [
    'gltf-transform', 'optimize', src, out,
    '--simplify-ratio', String(ratio.toFixed(6)),
    '--simplify-error', '1',
    '--texture-size', String(tier.texture),
    '--texture-compress', 'webp',
    '--compress', 'meshopt',
    '--no-instance',
  ], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  return { id, tier: tier.name, skipped: false, tris: triCount(out), mb: mb(out) };
}

async function main() {
  if (!fs.existsSync(SRC_DIR)) { console.error(`no source dir: ${SRC_DIR}`); process.exit(1); }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let sources = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.glb')).sort();
  if (idFilter) sources = sources.filter((f) => idFilter.includes(path.basename(f, '.glb')));
  if (!sources.length) { console.error('no matching source GLBs'); process.exit(1); }

  if (onlyTier && !TIER_NAMES.includes(onlyTier)) {
    console.error(`unknown tier: ${onlyTier}`); process.exit(1);
  }

  console.log(`sources : ${sources.length} raw GLBs in assets/tripo/generated/`);
  console.log(`tiers   : ${onlyTier ?? TIER_NAMES.join(', ')} (budgets are PER CLASS, §6.8)`);
  console.log(`output  : public/models/\n`);

  const rows = [];
  let built = 0, skipped = 0;
  for (const file of sources) {
    const id = path.basename(file, '.glb');
    const src = path.join(SRC_DIR, file);
    const srcTris = triCount(src);
    const line = [];
    const tiers = tiersFor(id).filter((t) => !onlyTier || t.name === onlyTier);
    for (const tier of tiers) {
      try {
        const r = await buildTier(id, src, tier, srcTris);
        r.skipped ? skipped++ : built++;
        rows.push({ ...r, cls: tier.cls, budget: tier.budget, srcTris, srcMb: mb(src) });
        line.push(`${tier.name} ${r.tris.toLocaleString()}t/${r.mb.toFixed(2)}MB${r.skipped ? '*' : ''}`);
      } catch (e) {
        console.error(`  FAIL ${id} ${tier.name}: ${(e.stderr || e.message).toString().slice(0, 300)}`);
        rows.push({ id, tier: tier.name, failed: true });
      }
    }
    console.log(`  ${id.padEnd(24)} ${classOf(id).padEnd(8)} ${(srcTris / 1e6).toFixed(2)}M → ${line.join('  ')}`);
  }

  const ok = rows.filter((r) => !r.failed);
  const failed = rows.filter((r) => r.failed);
  const totalMb = ok.reduce((a, r) => a + r.mb, 0);
  const srcMb = [...new Set(ok.map((r) => r.id))]
    .reduce((a, id) => a + (ok.find((r) => r.id === id)?.srcMb ?? 0), 0);

  console.log(`\n${built} built, ${skipped} up-to-date (*), ${failed.length} failed`);
  console.log(`raw sources : ${srcMb.toFixed(0)} MB (never served)`);
  console.log(`shipped     : ${totalMb.toFixed(1)} MB across ${ok.length} files`);

  const groups = new Map();
  for (const r of ok) {
    const k = `${r.cls}/${r.tier}`;
    if (!groups.has(k)) groups.set(k, { budget: r.budget, tris: [] });
    groups.get(k).tris.push(r.tris);
  }
  let over = 0;
  for (const [k, g] of [...groups].sort()) {
    const max = Math.max(...g.tris);
    const bad = g.tris.filter((t) => t > g.budget).length;
    over += bad;
    console.log(
      `  ${k.padEnd(16)} n=${String(g.tris.length).padStart(3)}  max ${max.toLocaleString().padStart(9)}`
      + `  budget ${g.budget.toLocaleString().padStart(9)}  ${bad ? `${bad} OVER` : 'ok'}`,
    );
  }
  console.log(over ? `\n${over} outputs over budget` : '\nall outputs within their class budget');
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
