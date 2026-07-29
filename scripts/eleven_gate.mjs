#!/usr/bin/env node
/**
 * §7.1 / §2.4 — the audio pipeline's pre-flight gate.
 *
 * Run this before any VO, music or SFX batch. It answers, from the live account:
 *   - can this plan produce the §7 standard at all
 *   - what format the batch must request
 *   - whether a master will exist afterwards
 *   - whether the quota covers the batch
 *
 *   node scripts/eleven_gate.mjs                       report account state
 *   node scripts/eleven_gate.mjs --chars 12000         check a batch of that size
 *   node scripts/eleven_gate.mjs --chars 12000 --i-accept-no-master
 *
 * Exits non-zero when a batch would be refused, so it can guard a generation script.
 * Reads the key from the environment only — never a literal, never a VITE_ var (§4.1).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPlan, formatFor, renderAllowed } from './eleven/plan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; };

// Vendor credentials live outside the repo and outside the bundle. .env.vendor is
// gitignored; the CI secret gate would fail the build if a key were ever committed.
for (const f of ['.env.vendor', '.env']) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error('ELEVENLABS_API_KEY is not set (checked env, .env.vendor, .env).');
  process.exit(2);
}

const plan = await fetchPlan(key);
const fmt = formatFor(plan);
const chars = Number(arg('--chars', '0')) || 0;

console.log('§7.1 ElevenLabs pre-flight');
console.log(`  tier            : ${plan.tier}`);
console.log(`  quota           : ${plan.used} / ${plan.limit} used (${plan.pctUsed.toFixed(0)}%), ${plan.remaining} remaining`);
console.log(`  request format  : ${fmt.request ?? '(none — pipeline refuses)'}`);
console.log(`  master archived : ${fmt.master ? 'YES' : 'NO'}`);
console.log(`  note            : ${fmt.note}`);

if (!plan.isPro && fmt.request) {
  console.log('\n  §7.1 fallback branch is active. Delivery spec is intact at 192 kbps/44.1 kHz,');
  console.log('  but no lossless master is produced, and takes are not reproducible — a line');
  console.log('  rendered now cannot have its master recovered by upgrading later.');
}

if (chars) {
  const refusal = renderAllowed(plan, {
    characters: chars,
    acceptNoMaster: process.argv.includes('--i-accept-no-master'),
    overrideBudget: process.argv.includes('--override'),
  });
  console.log(`\nbatch of ~${chars} characters:`);
  if (refusal) {
    console.error(`  REFUSED\n  ${refusal.split('\n').join('\n  ')}`);
    process.exit(1);
  }
  console.log('  ALLOWED');
}
