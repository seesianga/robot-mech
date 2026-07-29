// CI-style lint for the hangar content pack (node scripts/validate_hangar.mjs).
// Cross-checks slots.json / requisition_catalog.json / awards.json / mp.json
// against content/mechs.json — stable ids, sane prices, no dangling refs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const mechIds = new Set(read('content/mechs.json').mechs.map((m) => m.id));
const errs = [];
const check = (cond, msg) => { if (!cond) errs.push(msg); };

// slots.json
const slots = read('content/hangar/slots.json');
check(Array.isArray(slots.slots) && slots.slots.length === 6, 'slots: exactly 6 bays');
check(slots.slots[0]?.price === 0 && slots.slots[0]?.index === 1, 'slots: bay 1 free');
for (let i = 0; i < slots.slots.length; i++) {
  const s = slots.slots[i];
  check(typeof s.id === 'string' && s.index === i + 1, `slots[${i}]: stable id + 1-based index`);
  check(Number.isInteger(s.price) && s.price >= 0, `slots[${i}]: integer price`);
  if (i > 1) check(s.price > slots.slots[i - 1].price, `slots[${i}]: escalating price`);
}
check(typeof slots.sequentialUnlock === 'boolean', 'slots: sequentialUnlock flag');

// requisition_catalog.json — full scope: every chassis purchasable, no strays
const cat = read('content/hangar/requisition_catalog.json');
check(Number.isInteger(cat.scrapRefundPct) && cat.scrapRefundPct >= 0 && cat.scrapRefundPct <= 100, 'catalog: scrapRefundPct 0–100');
const catIds = new Set();
for (const e of cat.entries) {
  check(mechIds.has(e.chassis), `catalog: unknown chassis ${e.chassis}`);
  check(Number.isInteger(e.price) && e.price > 0, `catalog: bad price for ${e.chassis}`);
  check(!catIds.has(e.chassis), `catalog: duplicate entry ${e.chassis}`);
  catIds.add(e.chassis);
}
for (const id of mechIds) check(catIds.has(id), `catalog: ${id} missing (requisition scope = all chassis)`);

// awards.json
const awards = read('content/hangar/awards.json');
for (const [stage, chassis] of Object.entries(awards.stageGrants)) {
  const n = Number(stage);
  check(Number.isInteger(n) && n >= 1 && n <= 24, `awards: stage ${stage} out of range`);
  check(mechIds.has(chassis), `awards: unknown chassis ${chassis} at stage ${stage}`);
}

// mp.json
const mp = read('content/hangar/mp.json');
check(mp.deckExhausted === 'recycle' || mp.deckExhausted === 'spectate', 'mp: deckExhausted ∈ {recycle, spectate}');
check(Number.isInteger(mp.redeployAutoPickSecs) && mp.redeployAutoPickSecs > 0, 'mp: redeployAutoPickSecs');
for (const k of ['win', 'loss', 'perKill']) {
  check(Number.isInteger(mp.matchScrip?.[k]) && mp.matchScrip[k] >= 0, `mp: matchScrip.${k}`);
}

// provenance fields on every pack (source/author/version/approval)
for (const p of ['slots.json', 'requisition_catalog.json', 'awards.json', 'mp.json']) {
  const j = read(`content/hangar/${p}`);
  for (const f of ['version', 'source', 'author', 'approval']) {
    check(f in j, `${p}: missing provenance field ${f}`);
  }
}

if (errs.length) {
  console.error(`hangar content: ${errs.length} problem(s)`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log('hangar content: all checks passed');
