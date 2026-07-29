#!/usr/bin/env node
/**
 * PATHLIGHT route content validator (CI gate, same style as
 * validate_campaign.mjs). Static checks only — leg walkability (LOS) is a
 * runtime content test in scripts/test_nav.mjs because it needs the real
 * collider set. Hard rules:
 *   - schema shape per content/nav/nav_route.schema.json (hand-rolled checks)
 *   - route ids unique; waypoint ids unique across ALL routes (they surface
 *     as flags/telemetry keys)
 *   - layers.arrow === true — content may NEVER force the arrow off; only the
 *     player's settings can
 *   - coords within ±520 like campaign content; radius ≥ 8; vtol ≥ 2
 *   - next-chain refs resolve, no cycles unless loop:true, chain terminates
 *   - display_key resolves in content/nav/strings.en.json
 *   - follow_entity is schema-reserved but rejected until a provider ships
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAV_DIR = path.join(ROOT, 'content', 'nav');
const BOUND = 520;

let errors = 0, warnings = 0;
const err = (m) => { console.log(`  FAIL: ${m}`); errors++; };
const warn = (m) => { console.log(`  warn: ${m}`); warnings++; };

const strings = JSON.parse(fs.readFileSync(path.join(NAV_DIR, 'strings.en.json'), 'utf8'));
const files = fs.readdirSync(NAV_DIR).filter((f) => f.endsWith('.route.json')).sort();
if (!files.length) err('no *.route.json files in content/nav');

const routeIds = new Set();
const wpIdsGlobal = new Set();
let wpTotal = 0;

for (const f of files) {
  let r;
  try {
    r = JSON.parse(fs.readFileSync(path.join(NAV_DIR, f), 'utf8'));
  } catch (e) {
    err(`${f}: unparseable JSON (${e.message})`);
    continue;
  }
  const where = `${f} (${r.id ?? '?'})`;
  if (typeof r.id !== 'string' || !/^route_[a-z0-9_]+$/.test(r.id)) err(`${where}: bad or missing id`);
  if (routeIds.has(r.id)) err(`${where}: duplicate route id`);
  routeIds.add(r.id);
  if (typeof r.loop !== 'boolean') err(`${where}: loop must be boolean`);
  const L = r.layers ?? {};
  for (const k of ['chevrons', 'beacon', 'arrow', 'compass']) {
    if (typeof L[k] !== 'boolean') err(`${where}: layers.${k} must be boolean`);
  }
  if (L.arrow !== true) err(`${where}: layers.arrow must be true — content may never force the arrow off`);
  if (!Array.isArray(r.waypoints) || r.waypoints.length < 1) {
    err(`${where}: waypoints must be a non-empty array`);
    continue;
  }
  const localIds = new Set();
  for (const wp of r.waypoints) {
    wpTotal++;
    const wpw = `${where} wp ${wp.id ?? '?'}`;
    if (typeof wp.id !== 'string' || !/^[a-z0-9_]+$/.test(wp.id)) err(`${wpw}: bad id`);
    if (localIds.has(wp.id)) err(`${wpw}: duplicate waypoint id in route`);
    localIds.add(wp.id);
    if (wpIdsGlobal.has(wp.id)) err(`${wpw}: waypoint id reused across routes (ids surface as flags — keep them globally unique)`);
    wpIdsGlobal.add(wp.id);
    if (typeof wp.display_key !== 'string' || !wp.display_key.startsWith('hud.nav.')) {
      err(`${wpw}: display_key must be a hud.nav.* key`);
    } else if (typeof strings[wp.display_key] !== 'string') {
      err(`${wpw}: display_key ${wp.display_key} missing from content/nav/strings.en.json`);
    }
    if (wp.follow_entity !== undefined) {
      err(`${wpw}: follow_entity is schema-reserved but has no runtime provider yet — remove it`);
    }
    if (!Array.isArray(wp.position) || wp.position.length !== 3 || wp.position.some((v) => typeof v !== 'number')) {
      err(`${wpw}: position must be [x, y, z] numbers`);
    } else {
      const [x, , z] = wp.position;
      if (Math.abs(x) > BOUND || Math.abs(z) > BOUND) err(`${wpw}: position (${x}, ${z}) outside ±${BOUND}`);
    }
    const a = wp.arrival ?? {};
    if (typeof a.radius_m !== 'number' || a.radius_m < 8) err(`${wpw}: arrival.radius_m must be ≥ 8 (a 100-ton frame must stop inside it)`);
    if (typeof a.vertical_tolerance_m !== 'number' || a.vertical_tolerance_m < 2) err(`${wpw}: arrival.vertical_tolerance_m must be ≥ 2`);
    if (typeof a.dwell_s !== 'number' || a.dwell_s < 0) err(`${wpw}: arrival.dwell_s must be ≥ 0`);
    if (wp.beacon_height_m !== undefined && (typeof wp.beacon_height_m !== 'number' || wp.beacon_height_m < 5 || wp.beacon_height_m > 120)) {
      err(`${wpw}: beacon_height_m out of range 5..120`);
    }
    if (wp.arrival_extra != null) {
      const ex = wp.arrival_extra;
      if (!['speed_mps', 'throttle'].includes(ex.sim) || !['<', '>', '<=', '>='].includes(ex.op) || typeof ex.value !== 'number') {
        err(`${wpw}: malformed arrival_extra`);
      }
    }
    if (wp.los_verified !== true) warn(`${wpw}: los_verified not set — run scripts/test_nav.mjs to verify the leg (bt_boost's barrier leg is the known exception)`);
    if (wp.next !== undefined && wp.next !== null && typeof wp.next !== 'string') err(`${wpw}: next must be a waypoint id or null`);
  }
  // next-chain: refs resolve, no cycle unless loop
  for (const wp of r.waypoints) {
    if (wp.next && !localIds.has(wp.next)) err(`${where}: wp ${wp.id} next → unknown "${wp.next}"`);
  }
  const seen = new Set();
  let cur = r.waypoints[0];
  while (cur) {
    if (seen.has(cur.id)) {
      if (!r.loop) err(`${where}: next-chain cycles at ${cur.id} but loop is false`);
      break;
    }
    seen.add(cur.id);
    cur = cur.next ? r.waypoints.find((w) => w.id === cur.next) : null;
  }
  if (seen.size !== r.waypoints.length) warn(`${where}: ${r.waypoints.length - seen.size} waypoint(s) unreachable from the chain head`);
}

if (errors) {
  console.log(`\nnav check: ${errors} error(s), ${warnings} warning(s)`);
  process.exit(1);
}
console.log(`nav check: OK — ${files.length} routes, ${wpTotal} waypoints, ${warnings} warning(s)`);
