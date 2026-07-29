#!/usr/bin/env node
/**
 * §3.3 — one content schema.
 *
 * The master prompt calls for `packages/content-schema` using Zod → JSON Schema → TS
 * types. Zod is not a dependency here and adding a runtime validation library to ship a
 * build-time check would be the wrong trade, so this is a dependency-free validator over
 * the SAME type list. If the project later adopts Zod, the shapes below port directly.
 *
 * The important departure from the spec: the schema is written against the content that
 * ACTUALLY EXISTS (12 chassis, 19 weapons, 22 campaign configs), not the greenfield
 * shape the spec imagined. A schema that fails every real file on day one gets deleted
 * by the second person who runs it. So this validates what is true today and enforces
 * the spec's *rules* — stable machine IDs, no duplicate IDs, referential integrity
 * between files, no display string without a home — on top of it.
 *
 *   node scripts/content_schema.mjs           validate
 *   node scripts/content_schema.mjs --types   emit TypeScript types to src/content-types.d.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const errors = [];
const warns = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warns.push(`${f}: ${m}`);

// ── field specs ──────────────────────────────────────────────────────────────
// t: 'str'|'num'|'int'|'bool'|'arr'|'obj', opt: optional, of: element check
const S = {
  frame: {
    id: { t: 'str', id: true }, name: { t: 'str' }, class: { t: 'str' },
    tons: { t: 'num' }, speedKmh: { t: 'num' }, twistArcDeg: { t: 'num' },
    // jumpJets is a capability flag, not a count — uniformly boolean across all 12
    // chassis. hardpoints is an ordered array of slot types ('energy' | 'ballistic' |
    // 'missile' | 'utility'), not a keyed object. Both were guessed wrong on the first
    // pass; the schema describes the content, the content does not bend to the schema.
    jumpJets: { t: 'bool' }, heatSinks: { t: 'num' },
    hardpoints: { t: 'arr', of: ['energy', 'ballistic', 'missile', 'utility'] },
    defaultLoadout: { t: 'arr' }, role: { t: 'str', opt: true },
  },
  weapon: {
    id: { t: 'str', id: true }, name: { t: 'str' }, type: { t: 'str' },
    damage: { t: 'num' }, salvo: { t: 'num', opt: true }, heat: { t: 'num' },
    cooldown: { t: 'num' }, range: { t: 'num' },
    projectileSpeed: { t: 'num', opt: true }, spread: { t: 'num', opt: true },
    ammo: { t: 'num', opt: true }, tons: { t: 'num', opt: true },
    tags: { t: 'arr', opt: true },
  },
  mission: {
    id: { t: 'str', id: true }, stage: { t: 'int' }, title: { t: 'str' },
    map: { t: 'str' }, spawn: { t: 'obj' }, playerMech: { t: 'str' },
    steps: { t: 'arr' }, extract: { t: 'arr', opt: true },
    designFile: { t: 'str', opt: true }, branch: { t: 'str', opt: true },
    allies: { t: 'arr', opt: true }, structures: { t: 'arr', opt: true },
    artillery: { t: 'obj', opt: true }, timedVO: { t: 'arr', opt: true },
    heatMult: { t: 'num', opt: true }, playerWoundVO: { t: 'arr', opt: true },
  },
};

function checkType(v, t) {
  switch (t) {
    case 'str': return typeof v === 'string';
    case 'num': return typeof v === 'number' && Number.isFinite(v);
    case 'int': return Number.isInteger(v);
    case 'bool': return typeof v === 'boolean';
    case 'arr': return Array.isArray(v);
    case 'obj': return v !== null && typeof v === 'object' && !Array.isArray(v);
    default: return true;
  }
}

/** §3.3 — stable machine IDs, separate from display names. */
const ID_RE = /^[a-z][a-z0-9_-]*$/;

function validate(kind, obj, where) {
  const spec = S[kind];
  for (const [field, rule] of Object.entries(spec)) {
    const v = obj[field];
    if (v === undefined) {
      if (!rule.opt) err(where, `missing required field "${field}"`);
      continue;
    }
    if (!checkType(v, rule.t)) {
      // Array vs object both report "object" from typeof, which made the first run of
      // this validator print "should be obj, got object" — true and useless.
      const actual = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
      err(where, `"${field}" should be ${rule.t}, got ${actual}`);
    }
    if (rule.of && Array.isArray(v)) {
      for (const e of v) {
        if (!rule.of.includes(e)) err(where, `"${field}" has unknown value "${e}" (allowed: ${rule.of.join(', ')})`);
      }
    }
    if (rule.id && typeof v === 'string' && !ID_RE.test(v)) {
      err(where, `id "${v}" is not a stable machine id (${ID_RE})`);
    }
  }
  for (const field of Object.keys(obj)) {
    if (!(field in spec)) warn(where, `unknown field "${field}" (schema may be behind the content)`);
  }
}

// ── load ─────────────────────────────────────────────────────────────────────
const frames = read('content/mechs.json').mechs;
const weaponsRaw = read('content/weapons.json');
const weapons = Array.isArray(weaponsRaw) ? weaponsRaw : weaponsRaw.weapons;
const missionFiles = fs.readdirSync(path.join(ROOT, 'content', 'campaign')).filter((f) => f.endsWith('.json'));
const missions = missionFiles.map((f) => ({ file: f, data: read(path.join('content', 'campaign', f)) }));

frames.forEach((f, i) => validate('frame', f, `mechs.json[${i}]`));
weapons.forEach((w, i) => validate('weapon', w, `weapons.json[${i}]`));
missions.forEach(({ file, data }) => validate('mission', data, `campaign/${file}`));

// ── uniqueness ───────────────────────────────────────────────────────────────
function uniq(list, label) {
  const seen = new Map();
  for (const { id, where } of list) {
    if (seen.has(id)) err(label, `duplicate id "${id}" (${seen.get(id)} and ${where})`);
    else seen.set(id, where);
  }
  return new Set(seen.keys());
}
const frameIds = uniq(frames.map((f, i) => ({ id: f.id, where: `mechs.json[${i}]` })), 'frames');
const weaponIds = uniq(weapons.map((w, i) => ({ id: w.id, where: `weapons.json[${i}]` })), 'weapons');
uniq(missions.map(({ file, data }) => ({ id: data.id, where: file })), 'missions');

// ── referential integrity: the check a flat file list cannot do for itself ────
for (const f of frames) {
  for (const w of f.defaultLoadout ?? []) {
    const wid = typeof w === 'string' ? w : w?.id ?? w?.weapon;
    if (wid && !weaponIds.has(wid)) err(`frame ${f.id}`, `defaultLoadout references unknown weapon "${wid}"`);
  }
}
for (const { file, data } of missions) {
  if (data.playerMech && !frameIds.has(data.playerMech)) {
    err(`campaign/${file}`, `playerMech "${data.playerMech}" is not a known chassis`);
  }
  for (const a of data.allies ?? []) {
    if (a.def && !frameIds.has(a.def)) err(`campaign/${file}`, `ally def "${a.def}" is not a known chassis`);
  }
  // Every structure a step targets must exist, or the mission is uncompletable —
  // exactly the class of bug test_campaign.mjs takes 45 s per mission to find.
  const structIds = new Set((data.structures ?? []).map((s) => s.id));
  for (const [i, step] of (data.steps ?? []).entries()) {
    for (const t of step.targets ?? []) {
      if (!structIds.has(t)) err(`campaign/${file}`, `step ${i} targets unknown structure "${t}"`);
    }
    if (step.protect && !structIds.has(step.protect)) {
      err(`campaign/${file}`, `step ${i} protects unknown structure "${step.protect}"`);
    }
    for (const sp of step.spawns ?? []) {
      if (sp.def && !frameIds.has(sp.def)) err(`campaign/${file}`, `step ${i} spawn def "${sp.def}" unknown`);
    }
  }
}

// ── emit types ───────────────────────────────────────────────────────────────
if (process.argv.includes('--types')) {
  const tsType = (r) => ({ str: 'string', num: 'number', int: 'number', bool: 'boolean', arr: 'unknown[]', obj: 'Record<string, unknown>' }[r.t]);
  let out = '// GENERATED by scripts/content_schema.mjs --types. Do not edit.\n\n';
  for (const [kind, spec] of Object.entries(S)) {
    out += `export interface ${kind[0].toUpperCase()}${kind.slice(1)} {\n`;
    for (const [f, r] of Object.entries(spec)) out += `  ${f}${r.opt ? '?' : ''}: ${tsType(r)};\n`;
    out += '}\n\n';
  }
  fs.writeFileSync(path.join(ROOT, 'src', 'content-types.d.ts'), out);
  console.log('wrote src/content-types.d.ts');
}

// ── report ───────────────────────────────────────────────────────────────────
for (const w of warns) console.log(`warn: ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);
console.log(
  `\ncontent schema: ${frames.length} frames, ${weapons.length} weapons, ${missions.length} missions`
  + ` — ${errors.length} errors, ${warns.length} warnings`,
);
process.exit(errors.length ? 1 : 0);
