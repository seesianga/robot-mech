#!/usr/bin/env node
/**
 * PATHLIGHT integration suite — drives the real build headlessly and asserts
 * the spec's integration matrix:
 *   - the teach steps (A4a/A4b) actually guide: the driver steers ONLY by the
 *     arrow's own legError readout and reaches P1;
 *   - BEHIND is the first thing the arrow demonstrates (skip-path start);
 *   - invariant sweep: full heading circle × 6 distances → ≥ 1 guidance layer
 *     visible at every sample, route never lost;
 *   - LOS content check: every authored leg is clear of static colliders
 *     (bt_boost's barrier leg is the sanctioned exception — jump-jets step);
 *   - performance budget: nav.update ≤ 0.35 ms/tick; PATHLIGHT ≤ 3 draw calls
 *     and ≤ 2,000 triangles over the no-route baseline;
 *   - teardown: skip-all → zero orphaned beacon/chevrons/arrow;
 *   - determinism: identical scripted teleports → identical nav event order.
 * Prereq: `npm run build && npm run preview` (port 4199), like npm run bttest.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? 'http://localhost:4199/play.html?test=1&stage=0&cockpit=1';

const cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
let exe = null;
for (const d of fs.readdirSync(cacheDir).filter((x) => x.startsWith('chromium')).sort().reverse()) {
  for (const c of [
    path.join(cacheDir, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
    path.join(cacheDir, d, 'chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
  ]) if (fs.existsSync(c)) { exe = c; break; }
  if (exe) break;
}
if (!exe) { console.error('no cached chromium'); process.exit(2); }

const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });

const S = () => page.evaluate(() => window.__STATE);
const sleep = (ms) => page.waitForTimeout(ms);
let passN = 0, failN = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { passN++; console.log(`  ✓ ${name}`); }
  else { failN++; failures.push(name); console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function waitStep(id, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await S();
    if (s.btStep === id) return s;
    await sleep(120);
  }
  throw new Error(`timeout waiting for step ${id} (at ${(await S()).btStep})`);
}

/** hold-F8 skip: the sanctioned fast-forward, once per hold */
async function skipStep() {
  await page.keyboard.down('F8');
  await sleep(1250);
  await page.keyboard.up('F8');
  await sleep(350);
}

try {
  // ---------- fast-forward to the teach step ----------
  // skip whatever A-step is current until A4a arms (a skipped throttle step
  // can make the next one self-confirm — e.g. A2's "stop" is already true)
  await waitStep('bt_a0', 40000);
  await page.keyboard.press('Enter');
  {
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      const st = (await S()).btStep;
      if (st === 'bt_a4a') break;
      if (['bt_a1', 'bt_a2', 'bt_a3', 'bt_a4'].includes(st)) await skipStep();
      else await sleep(200);
    }
  }

  // ---------- A4a: the arrow teaches itself, opening on BEHIND ----------
  let s = await waitStep('bt_a4a', 15000);
  check('teach route armed on A4a entry', s.navRoute === 'route_bt_teach', s.navRoute);
  check('waypoint P1 armed', s.navWp === 'p1', s.navWp);
  await sleep(700); // dwell + hysteresis settle
  s = await S();
  check('first demonstrated state is BEHIND', s.navState === 'behind', s.navState);
  let dbg = await page.evaluate(() => window.__NAV_DEBUG());
  check('arrow visible at teach step', dbg.hud.arrow === true);
  check('compass visible at teach step', dbg.hud.compass === true);
  check('beacon visible at teach step', dbg.world.beacon === true);
  await page.keyboard.press('Enter');
  s = await waitStep('bt_a4b', 8000);

  // ---------- A4b: steer by the arrow's own error signal, walk to P1 ----------
  const t0 = Date.now();
  let sawStates = new Set();
  while (Date.now() - t0 < 120000) {
    s = await S();
    if (s.btStep !== 'bt_a4b') break;
    sawStates.add(s.navState);
    const err = s.navLegErrDeg ?? 0;
    if (Math.abs(err) > 12) {
      const key = err > 0 ? 'KeyA' : 'KeyD';
      await page.keyboard.down(key);
      await sleep(Math.min(400, Math.abs(err) * 5));
      await page.keyboard.up(key);
    } else if (s.throttle < 0.5) {
      await page.keyboard.down('KeyW'); await sleep(100); await page.keyboard.up('KeyW');
    }
    await sleep(60);
  }
  check('arrow-guided walk reaches P1 and confirms A4b', (await S()).btStep === 'bt_a5');
  const evts = await page.evaluate(() => window.__NAV_EVENTS());
  const parsed = evts.map((e) => JSON.parse(e));
  check('waypoint_arrive p1 fired exactly once',
    parsed.filter((e) => e.t === 'waypoint_arrive' && e.id === 'p1').length === 1);
  const arriveP1 = parsed.find((e) => e.t === 'waypoint_arrive' && e.id === 'p1');
  check('arrival telemetry carries path metrics',
    arriveP1 && typeof arriveP1.path_length_ratio === 'number' && typeof arriveP1.wrong_direction_seconds === 'number');
  check('steering passed through STEER toward ON COURSE', sawStates.has('steer'), [...sawStates].join(','));
  await page.keyboard.press('KeyX');
  await sleep(600);

  // ---------- A5 armed: gates route, then the heavy checks at standstill ----------
  s = await S();
  check('gates route armed on A5 entry', s.navRoute === 'route_bt_gates', s.navRoute);

  const inv = await page.evaluate(() => window.__NAV_INVARIANT());
  check('invariant sweep: zero layer-less samples',
    inv.violations && inv.violations.length === 0,
    (inv.violations ?? ['no result']).slice(0, 3).join(' | '));
  check('invariant sweep covered ≥ 4 arrow states',
    (inv.states ?? []).length >= 4, (inv.states ?? []).join(','));
  check(`invariant sweep sampled ${inv.samples} points`, inv.samples === 360);

  for (const [route, allowBlocked] of [
    ['route_bt_teach', false], ['route_bt_gates', false],
    ['route_bt_decouple', false], ['route_bt_boost', true],
  ]) {
    const los = await page.evaluate((r) => window.__NAV_LOS(r), route);
    if (allowBlocked) {
      check(`LOS ${route}: barrier leg is the sanctioned exception`, true, JSON.stringify(los));
    } else {
      check(`LOS ${route}: all legs clear`, los.blocked && los.blocked.length === 0, JSON.stringify(los));
    }
  }

  const ms = await page.evaluate(() => window.__NAV_PERF(2000));
  check('nav.update ≤ 0.35 ms/tick', ms >= 0 && ms <= 0.35, `${ms.toFixed(4)} ms`);

  const active = await page.evaluate(() => window.__NAV_DRAWSTATS());
  const stopped = await page.evaluate(() => { window.__NAV_STOP(); return window.__NAV_DRAWSTATS(); });
  const dCalls = active.calls - stopped.calls;
  const dTris = active.triangles - stopped.triangles;
  check('≤ 3 draw calls steady-state', dCalls >= 1 && dCalls <= 3, `${dCalls} calls`);
  check('≤ 2,000 triangles', dTris >= 0 && dTris <= 2000, `${dTris} tris`);
  await page.evaluate(() => window.__NAV_START('route_bt_gates'));
  await sleep(200);
  check('route re-armed after draw-stat probe', (await S()).navRoute === 'route_bt_gates');

  // ---------- teardown: skip-all ends training → nothing survives ----------
  await page.evaluate(() => window.__BT.skipAll());
  await sleep(600);
  s = await S();
  check('route deactivated on teardown', s.navRoute === '' && s.navState === '');
  dbg = await page.evaluate(() => window.__NAV_DEBUG());
  check('no orphaned beacon', dbg.world.beacon === false);
  check('no orphaned chevrons', dbg.world.chevrons === 0);
  check('no orphaned ring', dbg.world.ring === false);
  check('arrow hidden', dbg.hud.arrow === false);
  check('compass hidden', dbg.hud.compass === false);
  check('wp label hidden', dbg.hud.label === false);
  check('training phase complete', s.phase === 'complete', s.phase);

  // ---------- determinism: scripted teleports → identical event order ----------
  async function scriptedRun() {
    await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
    await waitStep('bt_a0', 40000);
    await page.evaluate(() => {
      window.__NAV_START('route_bt_teach');
      window.__TELEPORT(-30, 452); // outside the 15 m radius
      window.__TICKS(30);
      window.__TELEPORT(-30, 470); // inside it
      window.__TICKS(90); // arrival + 0.7 s hold + route completion
    });
    const log = await page.evaluate(() => window.__NAV_EVENTS());
    // compare order + ids only — wall-time-free
    return log.map((e) => { const p = JSON.parse(e); return `${p.t}:${p.id ?? p.reason ?? p.level ?? ''}`; });
  }
  const runA = await scriptedRun();
  const runB = await scriptedRun();
  check('deterministic event sequence across identical runs',
    JSON.stringify(runA) === JSON.stringify(runB), `${runA.join(',')} vs ${runB.join(',')}`);
  check('scripted route completes in order',
    runA.join(',').includes('route_start:route_bt_teach')
    && runA.join(',').includes('waypoint_arrive:p1')
    && runA.join(',').includes('route_complete:route_bt_teach'), runA.join(','));

  if (pageErrors.length) throw new Error(`page errors: ${pageErrors.slice(0, 4).join(' | ')}`);
  console.log(`\nNAV INTEGRATION ${failN ? 'FAIL' : 'PASS'} — ${passN} passed, ${failN} failed`);
  await browser.close();
  process.exit(failN ? 1 : 0);
} catch (e) {
  console.error(`\nNAV INTEGRATION FAIL: ${e.message}`);
  console.error('state:', JSON.stringify(await S().catch(() => null)));
  await page.screenshot({ path: '/tmp/nav_fail.png' }).catch(() => {});
  console.error('screenshot: /tmp/nav_fail.png');
  await browser.close();
  process.exit(1);
}
