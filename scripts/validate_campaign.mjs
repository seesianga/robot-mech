#!/usr/bin/env node
/**
 * Mechanical validator for content/campaign/*.json against the engine contract
 * (docs/campaign-runtime-schema.md + src/sim/campaign.ts). Exit 1 on any error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAMP = path.join(ROOT, 'content', 'campaign');
const MISS = path.join(ROOT, 'content', 'missions');

const CHASSIS = new Set(['flint', 'pumice', 'skarn', 'chert', 'halite', 'gabbro', 'basalt', 'dolerite', 'corundum', 'orogen', 'batholith', 'craton']);
const MAPS = new Set(['salt', 'karst', 'polar', 'storm', 'arcology', 'anchor']);
const KINDS = new Set(['reach', 'destroy', 'defend', 'hold', 'survive', 'escort', 'duel', 'extract']);
const STRUCT_KINDS = new Set(['pylon', 'mast', 'tank', 'bunker', 'building', 'gate', 'crawler']);
const BOUND = 520;

const EXPECTED = ['m04','m05','m06','m07','m08','m09','m10','m11','m12','m13','m14','m15','m16','m17','m18','m19','m20','m21a','m21b','m22','m23','m24'];

let errors = 0, warnings = 0;
const err = (id, msg) => { errors++; console.log(`ERR  [${id}] ${msg}`); };
const warn = (id, msg) => { warnings++; console.log(`warn [${id}] ${msg}`); };

const inBounds = (pt) => Array.isArray(pt) && pt.length === 2 && pt.every((v) => typeof v === 'number' && Math.abs(v) <= BOUND);

for (const id of EXPECTED) {
  const file = path.join(CAMP, `${id}.json`);
  if (!fs.existsSync(file)) { err(id, 'config file missing'); continue; }
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { err(id, `invalid JSON: ${e.message}`); continue; }

  if (cfg.id !== id) err(id, `id mismatch: ${cfg.id}`);
  const designPath = path.join(MISS, `${cfg.designFile}.json`);
  if (!fs.existsSync(designPath)) { err(id, `designFile not found: ${cfg.designFile}`); continue; }
  const design = JSON.parse(fs.readFileSync(designPath, 'utf8'));
  const triggers = new Set(design.voTriggers.map((t) => t.trigger));

  const expectStage = parseInt(id.replace(/[^0-9]/g, ''), 10);
  if (cfg.stage !== expectStage) err(id, `stage ${cfg.stage} != ${expectStage}`);
  if (id === 'm21a' && cfg.branch !== 'a') err(id, 'branch must be "a"');
  if (id === 'm21b' && cfg.branch !== 'b') err(id, 'branch must be "b"');
  if (!/^m21[ab]$/.test(id) && cfg.branch) err(id, 'branch only allowed on m21a/m21b');
  if (!cfg.title) err(id, 'missing title');
  if (!MAPS.has(cfg.map)) err(id, `bad map: ${cfg.map}`);
  if (!cfg.spawn || typeof cfg.spawn.x !== 'number' || typeof cfg.spawn.z !== 'number' || typeof cfg.spawn.yaw !== 'number') err(id, 'bad spawn');
  else if (Math.abs(cfg.spawn.x) > BOUND || Math.abs(cfg.spawn.z) > BOUND) err(id, 'spawn out of bounds');
  if (!CHASSIS.has(cfg.playerMech)) err(id, `bad playerMech: ${cfg.playerMech}`);
  if (!inBounds(cfg.extract)) err(id, `extract out of bounds/bad: ${JSON.stringify(cfg.extract)}`);
  if (cfg.heatMult !== undefined && (cfg.heatMult < 0.5 || cfg.heatMult > 1.5)) err(id, `suspicious heatMult ${cfg.heatMult}`);

  const structIds = new Set();
  for (const s of cfg.structures ?? []) {
    if (!s.id || structIds.has(s.id)) err(id, `structure id missing/dup: ${s.id}`);
    structIds.add(s.id);
    if (!STRUCT_KINDS.has(s.kind)) err(id, `structure ${s.id}: bad kind ${s.kind}`);
    if (!inBounds(s.pos)) err(id, `structure ${s.id}: pos out of bounds`);
    if (typeof s.hp !== 'number' || s.hp <= 0) err(id, `structure ${s.id}: bad hp`);
    if (!s.name) err(id, `structure ${s.id}: missing name`);
  }

  const checkTrig = (t, where) => {
    if (t === undefined) return;
    if (t === 'on_start') err(id, `${where}: on_start is reserved (auto litany)`);
    else if (!triggers.has(t)) err(id, `${where}: trigger "${t}" not in design voTriggers`);
  };
  const checkSpawn = (sp, where, mustSingle = false) => {
    if (!sp) { err(id, `${where}: missing spawn`); return; }
    if (!CHASSIS.has(sp.def)) err(id, `${where}: bad def ${sp.def}`);
    if (!inBounds(sp.pos)) err(id, `${where}: pos out of bounds ${JSON.stringify(sp.pos)}`);
    for (const wp of sp.waypoints ?? []) if (!inBounds(wp)) err(id, `${where}: waypoint out of bounds`);
    if (cfg.spawn && sp.pos) {
      const d = Math.hypot(sp.pos[0] - cfg.spawn.x, sp.pos[1] - cfg.spawn.z);
      const min = sp.alerted ? 420 : 300;
      // only step-0 IMMEDIATE spawns bind the cold-start distance rule; waves and
      // escort ambushes trip later in mission time, after the player has moved
      if (where === 'step0.spawns' || where.endsWith('.spawn')) {
        if (where.startsWith('step0') && d < min) err(id, `${where}: ${sp.def} only ${d.toFixed(0)}m from player spawn (min ${min})`);
      }
    }
    void mustSingle;
  };

  if (!Array.isArray(cfg.steps) || cfg.steps.length < 2) { err(id, 'steps missing/too few'); continue; }
  if (cfg.steps[cfg.steps.length - 1].kind !== 'extract') err(id, 'last step must be extract');

  cfg.steps.forEach((st, i) => {
    const w = `step${i}(${st.kind})`;
    if (!KINDS.has(st.kind)) { err(id, `${w}: unknown kind`); return; }
    checkTrig(st.vo, `${w}.vo`);
    checkTrig(st.doneVO, `${w}.doneVO`);
    for (const sp of st.spawns ?? []) checkSpawn(sp, `${w}.spawns`);
    switch (st.kind) {
      case 'reach':
        if (!inBounds(st.at)) err(id, `${w}: bad "at"`);
        break;
      case 'destroy':
        for (const t of st.targets ?? []) if (!structIds.has(t)) err(id, `${w}: target ${t} not in structures`);
        if (!(st.targets?.length) && !st.killAll) err(id, `${w}: no targets and killAll false`);
        if ((st.targets ?? []).length === 0 && st.killAll && !(st.spawns?.length)) err(id, `${w}: killAll with no spawns`);
        for (const [tid, trig] of Object.entries(st.perTargetVO ?? {})) {
          if (!structIds.has(tid)) err(id, `${w}: perTargetVO id ${tid} not a structure`);
          checkTrig(trig, `${w}.perTargetVO.${tid}`);
        }
        break;
      case 'defend': {
        if (!structIds.has(st.protect)) err(id, `${w}: protect ${st.protect} not in structures`);
        if (!(st.seconds >= 45 && st.seconds <= 180)) err(id, `${w}: seconds ${st.seconds} outside 45-180`);
        if (!(st.waves?.length)) err(id, `${w}: defend needs waves`);
        for (const wave of st.waves ?? []) for (const sp of wave) checkSpawn(sp, `${w}.wave`);
        break;
      }
      case 'hold':
        if (!inBounds(st.at)) err(id, `${w}: bad "at"`);
        if (!(st.seconds >= 45 && st.seconds <= 180)) err(id, `${w}: seconds ${st.seconds} outside 45-180`);
        for (const wave of st.waves ?? []) for (const sp of wave) checkSpawn(sp, `${w}.wave`);
        break;
      case 'survive':
        if (!(st.seconds >= 45 && st.seconds <= 180)) err(id, `${w}: seconds ${st.seconds} outside 45-180`);
        for (const wave of st.waves ?? []) for (const sp of wave) checkSpawn(sp, `${w}.wave`);
        break;
      case 'escort': {
        if (st.subjectDef && !CHASSIS.has(st.subjectDef)) err(id, `${w}: bad subjectDef`);
        if (!inBounds(st.from)) err(id, `${w}: bad "from"`);
        if (!(st.route?.length >= 2)) err(id, `${w}: route needs >= 2 legs`);
        for (const leg of st.route ?? []) if (!inBounds(leg)) err(id, `${w}: route leg out of bounds`);
        for (const amb of st.ambushes ?? []) {
          if (!(amb.atLeg >= 0 && amb.atLeg < (st.route?.length ?? 0))) err(id, `${w}: ambush atLeg ${amb.atLeg} out of route`);
          for (const sp of amb.spawns ?? []) checkSpawn(sp, `${w}.ambush`);
        }
        break;
      }
      case 'duel':
        checkSpawn(st.spawn, `${w}.spawn`);
        for (const wv of st.woundVO ?? []) checkTrig(wv.trigger, `${w}.woundVO`);
        break;
    }
  });

  // allies sanity
  const availableFrom = { Sable: 4, Tremor: 6, Vireo: 8 };
  for (const a of cfg.allies ?? []) {
    if (!CHASSIS.has(a.def)) err(id, `ally ${a.callsign}: bad def`);
    if (!inBounds(a.pos)) err(id, `ally ${a.callsign}: pos out of bounds`);
    const from = availableFrom[a.callsign];
    if (from && expectStage < from) err(id, `ally ${a.callsign} not available before m${String(from).padStart(2, '0')}`);
  }

  for (const tv of cfg.timedVO ?? []) checkTrig(tv.trigger, 'timedVO');
  for (const pw of cfg.playerWoundVO ?? []) checkTrig(pw.trigger, 'playerWoundVO');
  if (cfg.artillery && (cfg.artillery.fromStep < 0 || cfg.artillery.fromStep >= cfg.steps.length)) err(id, 'artillery.fromStep out of range');

  // coverage: how many design triggers are actually used
  const used = new Set();
  const collect = (t) => { if (t && triggers.has(t)) used.add(t); };
  for (const st of cfg.steps) {
    collect(st.vo); collect(st.doneVO);
    for (const t of Object.values(st.perTargetVO ?? {})) collect(t);
    for (const wv of st.woundVO ?? []) collect(wv.trigger);
  }
  for (const tv of cfg.timedVO ?? []) collect(tv.trigger);
  const usable = [...triggers].filter((t) => t !== 'on_start' && !t.startsWith('on_complete_branch'));
  const missing = usable.filter((t) => !used.has(t));
  if (missing.length > usable.length * 0.5) warn(id, `only ${used.size}/${usable.length} design triggers used (unused: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''})`);
}

console.log(`\n${errors} errors, ${warnings} warnings across ${EXPECTED.length} configs`);
process.exit(errors ? 1 : 0);
