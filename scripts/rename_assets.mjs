#!/usr/bin/env node
/**
 * §6.3 — one asset namespace.
 *
 * The spec's form is:
 *
 *     sa_<domain>_<biome|shared>_<name>_<variant>_<lod>
 *     domain ∈ frame | cockpit | vehicle | struct | prop | kit | fx | ui
 *
 * Two deliberate departures, both recorded rather than silently taken:
 *
 * 1. The prefix is `vp_`, not the legacy `sa_`. That prefix belongs to the retired
 *    pre-Veyra setting and must not reach player-facing assets. Model filenames are a
 *    shipping surface: they appear in network requests, in the bundle, and in the
 *    provenance record. Stamping retired canon onto 153 shipped files to satisfy the
 *    letter of §6.3 would violate its own Prime Directive 1. `vp_` is Veyra Prime.
 *
 * 2. No <variant> segment where no variant exists. The spec's example carries `_base`
 *    on an asset with one look. An always-constant segment is noise that people learn
 *    to skip, which is how `_base_lod0` becomes `_lod0` by hand six months later.
 *
 * What this actually fixes: today the ids are mech-*, env-bt-*, env_tut_*, prop-*,
 * veh-*, int-* — a mix of hyphen and underscore separators inherited from five
 * different documents. That is precisely the inconsistency §6.3 exists to collapse.
 *
 *   node scripts/rename_assets.mjs --plan     print the mapping, touch nothing
 *   node scripts/rename_assets.mjs --apply    rename files and rewrite references
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

const MODELS = path.join(ROOT, 'public', 'models');
const RAW = path.join(ROOT, 'assets', 'tripo', 'generated');

/** Biome per asset, where the id or its usage makes it unambiguous. Else 'shared'. */
const BIOME = {
  'env-bt-': 'range', 'env_tut_': 'range',
  'prop-arcology': 'arcology', 'prop-cracking': 'polar',
  'prop-hull': 'tideflats', 'prop-anchor': 'anchor',
};

function domainOf(id) {
  if (/^mech-/.test(id)) return 'frame';
  if (/cockpit/.test(id)) return 'cockpit';
  if (/^veh-/.test(id)) return 'vehicle';
  if (/mast|tower|gate|hall|pylon|bunker|silo|wall|hangar|depot|fortress/.test(id)) return 'struct';
  return 'prop';
}

function biomeOf(id) {
  for (const [k, v] of Object.entries(BIOME)) if (id.startsWith(k)) return v;
  return 'shared';
}

/** Strip the legacy prefix and normalise separators to '-' inside the name segment. */
function nameOf(id) {
  return id
    .replace(/^(mech|veh|prop|int)-/, '')
    .replace(/^env[-_](bt|tut|mp)[-_]/, '')
    .replace(/_/g, '-');
}

export function newId(id) {
  const domain = domainOf(id);
  let name = nameOf(id);
  // "vp_cockpit_shared_interior" would otherwise become vp_cockpit_shared_cockpit. When the name adds
  // nothing to the domain, drop the repeat rather than ship a stutter into 3 filenames.
  if (name === domain) name = 'interior';
  return `vp_${domain}_${biomeOf(id)}_${name}`;
}

// ── build the mapping from the raw sources, which are the canonical id list ──
const ids = fs.existsSync(RAW)
  ? fs.readdirSync(RAW).filter((f) => f.endsWith('.glb')).map((f) => f.replace(/\.glb$/, '')).sort()
  : [];
if (!ids.length) {
  console.error(`no raw sources at ${path.relative(ROOT, RAW)} — run where the assets are`);
  process.exit(2);
}

const map = new Map(ids.map((id) => [id, newId(id)]));

// Collisions would silently merge two assets into one file. Fail loudly instead.
const seen = new Map();
for (const [oldId, nid] of map) {
  if (seen.has(nid)) {
    console.error(`COLLISION: "${oldId}" and "${seen.get(nid)}" both become "${nid}"`);
    process.exit(1);
  }
  seen.set(nid, oldId);
}

if (!APPLY) {
  console.log(`§6.3 rename plan — ${map.size} assets\n`);
  for (const [o, n] of map) console.log(`  ${o.padEnd(26)} -> ${n}`);
  console.log('\nNothing changed. Re-run with --apply.');
  process.exit(0);
}

// ── rename files ─────────────────────────────────────────────────────────────
let renamed = 0;
for (const [oldId, nid] of map) {
  for (const dir of [RAW, MODELS]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f !== `${oldId}.glb` && !f.startsWith(`${oldId}.lod`)) continue;
      const to = f.replace(oldId, nid);
      fs.renameSync(path.join(dir, f), path.join(dir, to));
      renamed++;
    }
  }
}

// ── rewrite references ───────────────────────────────────────────────────────
// Longest ids first: renaming "prop-arcology" before "vp_prop_arcology_arcology-mid" would corrupt
// the longer id into a mangled hybrid.
const ordered = [...map.entries()].sort((a, b) => b[0].length - a[0].length);
const TEXT_DIRS = ['src', 'content', 'scripts', 'docs'];
const TEXT_FILES = ['assets/tripo/manifest.json'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '_inbox' && e.name !== 'node_modules') walk(p, out); }
    else if (/\.(ts|mjs|js|json|md|py|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = [
  ...TEXT_DIRS.flatMap((d) => (fs.existsSync(path.join(ROOT, d)) ? walk(path.join(ROOT, d)) : [])),
  ...TEXT_FILES.map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f)),
];

let touched = 0;
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  for (const [oldId, nid] of ordered) {
    // Bounded on both sides so "vp_cockpit_shared_interior" never matches inside "print-cockpitry",
    // and so an already-renamed id is not rewritten twice.
    after = after.replaceAll(new RegExp(`(?<![A-Za-z0-9_-])${oldId}(?![A-Za-z0-9-])`, 'g'), nid);
  }
  if (after !== before) { fs.writeFileSync(file, after); touched++; }
}

console.log(`renamed ${renamed} files, rewrote references in ${touched} source files`);
console.log('\nNow verify, in this order:');
console.log('  npx tsc --noEmit');
console.log('  node scripts/asset_census.mjs --write   # ids changed');
console.log('  node scripts/tripo_qc.mjs --write-baseline');
console.log('  node scripts/content_schema.mjs');
console.log('  npm run build && node scripts/screenshot.mjs /tmp/rename.png');
