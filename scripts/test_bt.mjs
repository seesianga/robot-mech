#!/usr/bin/env node
/**
 * BASIC TRAINING input-injection suite: drives the real build headlessly
 * (?test=1&stage=0&cockpit=1) through EVERY step by performing the actual
 * inputs — real key events via CDP, torso aim injected into the same
 * accumulator real mousemove events feed. Asserts:
 *   - wrong inputs never advance a step (negative check at A0/A1);
 *   - each step confirms only via its declared action + sim-state predicate;
 *   - conditional squad steps auto-skip;
 *   - the run ends with mission phase 'complete'.
 * Prereq: `npm run build && npm run preview` (port 4199), like npm run smoke.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? 'http://localhost:4199/play.html?test=1&stage=0&cockpit=1';

// pad geometry — mirrors src/world/terrain.ts (range map)
const GATES = [[0, 350], [0, 290], [0, 230]];
const BARRIER = { x: 150, z: 20 };
const BOARDS = [[-75, -70], [-35, -70], [5, -70], [45, -70]];
const AIM_BOARD = [-85, 40];
const CONTACT_SPAWNS = [[-260, -180], [60, -320], [280, -110]];

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

// A venue handoff reloads the page mid-run (each phase trains on its own map),
// so evaluate() can land during navigation — swallow that into null and let the
// pollers ride through the reload instead of crashing on a destroyed context.
const S = () => page.evaluate(() => window.__STATE).catch(() => null);
const mouse = (dx, dy = 0) => page.evaluate(([x, y]) => window.__MOUSE?.(x, y), [dx, dy]).catch(() => {});
const sleep = (ms) => page.waitForTimeout(ms);
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/** Generous ceiling for any wait that has a venue reload + boot inside it. */
const VENUE_WAIT = 480000;

async function waitStep(id, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await S();
    if (s?.btStep === id) return s;
    await sleep(120);
  }
  throw new Error(`timeout waiting for step ${id} (at ${(await S())?.btStep})`);
}

async function whileStep(id, actFn, timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await S();
    if (s?.btStep && s.btStep !== id) return s;
    // don't drive inputs at a page that is still rebooting from a venue handoff
    if (s?.btStep && s.playerPos) await actFn(s);
    else await sleep(250);
  }
  throw new Error(`step ${id} did not confirm within ${timeoutMs} ms`);
}

/** Point the torso (and only the torso) at a world position via injected aim deltas. */
async function aimAt(s, tx, ty, tz) {
  const [px, py, pz] = s.playerPos;
  const desiredYaw = Math.atan2(tx - px, tz - pz);
  const curYaw = s.legYaw + s.torsoYaw;
  const dYaw = wrap(desiredYaw - curYaw);
  const dist = Math.hypot(tx - px, tz - pz);
  const desiredPitch = Math.atan2(ty - (py + 7), dist);
  const dPitch = desiredPitch - (s.torsoPitch ?? 0);
  await mouse(-dYaw / 0.0022, -dPitch / 0.0018);
}

/** Steer the legs toward a waypoint while walking. */
async function steerTo(s, tx, tz) {
  const [px, , pz] = s.playerPos;
  const want = Math.atan2(tx - px, tz - pz);
  const d = wrap(want - s.legYaw);
  if (Math.abs(d) > 0.5) {
    // stop and rotate in place — short taps cannot out-turn the spin-up ramp
    await page.keyboard.press('KeyX');
    const key = d > 0 ? 'KeyA' : 'KeyD';
    await page.keyboard.down(key); await sleep(Math.min(900, 250 + Math.abs(d) * 350)); await page.keyboard.up(key);
    return;
  }
  if (d > 0.06) { await page.keyboard.down('KeyA'); await sleep(120); await page.keyboard.up('KeyA'); }
  else if (d < -0.06) { await page.keyboard.down('KeyD'); await sleep(120); await page.keyboard.up('KeyD'); }
}

/** Torso twist is clamped to the chassis arc (±60° on the Skarn) — when the
 *  target sits beyond it, swing the legs first, exactly like a real pilot. */
async function faceAndAim(s, tx, ty, tz) {
  const [px, , pz] = s.playerPos;
  const want = Math.atan2(tx - px, tz - pz);
  const legDelta = wrap(want - s.legYaw);
  if (Math.abs(legDelta) > 0.6) {
    const key = legDelta > 0 ? 'KeyA' : 'KeyD';
    await page.keyboard.down(key); await sleep(150); await page.keyboard.up(key);
    return;
  }
  await aimAt(s, tx, ty, tz);
}

const stepLog = [];
const t0 = Date.now();
const mark = (id) => { stepLog.push([id, ((Date.now() - t0) / 1000).toFixed(1)]); console.log(`  ✓ ${id} @ ${stepLog.at(-1)[1]}s`); };

try {
  // ---------- A0: cold cockpit ----------
  let s = await waitStep('bt_a0', 300000);
  // NEGATIVE: throttle key must not power up or advance
  await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.up('KeyW');
  s = await S();
  if (s.btStep !== 'bt_a0' || s.throttle !== 0) throw new Error('NEGATIVE FAIL: W advanced/moved during A0');
  await page.keyboard.press('Enter');
  await waitStep('bt_a1'); mark('bt_a0');

  // NEGATIVE: wrong keys never advance A1
  for (const k of ['KeyT', 'KeyR', 'KeyE', 'KeyF', 'Enter']) await page.keyboard.press(k);
  await sleep(700);
  if ((await S()).btStep !== 'bt_a1') throw new Error('NEGATIVE FAIL: wrong key advanced A1');

  // ---------- A1: throttle up ----------
  await page.keyboard.down('KeyW');
  await whileStep('bt_a1', () => sleep(120));
  await page.keyboard.up('KeyW'); mark('bt_a1');

  // ---------- A2: slow to a stop (tap toward zero like a human) ----------
  await whileStep('bt_a2', async (st) => {
    if (st.throttle > 0.015) { await page.keyboard.down('KeyS'); await sleep(80); await page.keyboard.up('KeyS'); }
    else if (st.throttle < -0.015) { await page.keyboard.down('KeyW'); await sleep(80); await page.keyboard.up('KeyW'); }
    else await sleep(120);
  }, 90000); mark('bt_a2');

  // ---------- A3: reverse ----------
  await page.keyboard.down('KeyS');
  await whileStep('bt_a3', () => sleep(120));
  await page.keyboard.up('KeyS'); mark('bt_a3');

  // ---------- A4: leg steering both ways (closed-loop) ----------
  // The leg turn spins up from rest, so a fixed-length hold banks an
  // fps-dependent number of degrees under swiftshader jank. Steer by the
  // measured excursion instead: hold A until >=52 deg is banked, then D
  // until the step's own 45/45 predicate confirms.
  {
    const entryYaw = (await S()).legYaw;
    let leftDone = false;
    await page.keyboard.down('KeyA');
    await whileStep('bt_a4', async (st) => {
      if (!leftDone && st.legYaw - entryYaw >= 0.9) {
        await page.keyboard.up('KeyA');
        await page.keyboard.down('KeyD');
        leftDone = true;
      }
      await sleep(150);
    }, 90000);
    await page.keyboard.up('KeyA').catch(() => {});
    await page.keyboard.up('KeyD').catch(() => {});
    mark('bt_a4');
  }

  // ---------- A4a: PATHLIGHT teach card (arrow + beacon light up) ----------
  s = await waitStep('bt_a4a', 8000);
  if (s.navRoute !== 'route_bt_teach') throw new Error(`A4a without teach route (navRoute="${s.navRoute}")`);
  // NEGATIVE: steering keys must not advance the info step
  await page.keyboard.down('KeyA'); await sleep(500); await page.keyboard.up('KeyA');
  if ((await S()).btStep !== 'bt_a4a') throw new Error('NEGATIVE FAIL: steering advanced A4a');
  await page.keyboard.press('Enter');
  await waitStep('bt_a4b', 8000); mark('bt_a4a');

  // ---------- A4b: face the arrow, walk to P1 — steered by the arrow's own
  // legError readout, which is the whole point of the step ----------
  await whileStep('bt_a4b', async (st) => {
    const err = st.navLegErrDeg ?? 0;
    if (Math.abs(err) > 12) {
      const key = err > 0 ? 'KeyA' : 'KeyD';
      await page.keyboard.down(key); await sleep(Math.min(400, Math.abs(err) * 5)); await page.keyboard.up(key);
    } else if (st.throttle < 0.5) {
      await page.keyboard.down('KeyW'); await sleep(90); await page.keyboard.up('KeyW');
    }
    await sleep(60);
  }, 150000);
  await page.keyboard.press('KeyX'); mark('bt_a4b');

  // ---------- A5: gate run ----------
  // Moderate throttle + proportional steering taps: at low headless fps the
  // state poll is stale, and a full-speed fixed-tap loop orbits or overshoots.
  // Steering toward the current gate point self-recovers from any overshoot.
  let gate = 0;
  await whileStep('bt_a5', async (st) => {
    const [px, , pz] = st.playerPos;
    if (gate < 2 && Math.hypot(px - GATES[gate][0], pz - GATES[gate][1]) < 15) gate++;
    if (st.throttle > 0.55) { await page.keyboard.down('KeyS'); await sleep(70); await page.keyboard.up('KeyS'); }
    else if (st.throttle < 0.35) { await page.keyboard.down('KeyW'); await sleep(70); await page.keyboard.up('KeyW'); }
    const want = Math.atan2(GATES[gate][0] - px, GATES[gate][1] - pz);
    const d = wrap(want - st.legYaw);
    if (Math.abs(d) > 0.5) {
      // way off the lane: stop and rotate in place — walking taps cannot
      // out-turn the leg spin-up ramp at headless fps, they just orbit
      await page.keyboard.press('KeyX');
      const key = d > 0 ? 'KeyA' : 'KeyD';
      await page.keyboard.down(key); await sleep(Math.min(900, 250 + Math.abs(d) * 350)); await page.keyboard.up(key);
      await sleep(50);
      return;
    }
    if (Math.abs(d) > 0.08) {
      const key = d > 0 ? 'KeyA' : 'KeyD';
      await page.keyboard.down(key); await sleep(Math.min(400, 120 + Math.abs(d) * 500)); await page.keyboard.up(key);
    }
    await sleep(50);
  }, 180000);
  await page.keyboard.press('KeyX'); mark('bt_a5');

  // ---------- A6: instant full stop ----------
  await page.keyboard.down('KeyW'); await sleep(600); await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyX');
  await waitStep('bt_b1', VENUE_WAIT); mark('bt_a6'); // A→B venue reload

  // ---------- B1: torso twist both ways ----------
  await mouse(-360); await sleep(400);
  await mouse(720); await sleep(400);
  await whileStep('bt_b1', async () => { await mouse(-720); await sleep(350); await mouse(720); await sleep(350); }, 20000);
  mark('bt_b1');

  // ---------- B2: hold reticle on the aim board ----------
  await whileStep('bt_b2', async (st) => { await faceAndAim(st, AIM_BOARD[0], st.playerPos[1] + 9, AIM_BOARD[1]); await sleep(100); }, 120000);
  mark('bt_b2');

  // ---------- B3: recenter ----------
  await page.keyboard.press('KeyC');
  await waitStep('bt_b4', 8000); mark('bt_b3');

  // ---------- B4: decoupling drill — walk to P5 (arrow-guided), then hold
  // aim on the board while moving; success needs BOTH checks ----------
  {
    let ph = 'goto';
    let sawRoute = false;
    await whileStep('bt_b4', async (st) => {
      if (st.navRoute === 'route_bt_decouple') sawRoute = true;
      if (ph === 'goto' && sawRoute && st.navRoute !== 'route_bt_decouple') {
        ph = 'aim'; // P5 reached — the route completed itself
      }
      if (ph === 'goto') {
        const err = st.navLegErrDeg ?? 0;
        if (Math.abs(err) > 12) {
          const key = err > 0 ? 'KeyA' : 'KeyD';
          await page.keyboard.down(key); await sleep(Math.min(380, Math.abs(err) * 5)); await page.keyboard.up(key);
        } else if (st.throttle < 0.5) {
          await page.keyboard.down('KeyW'); await sleep(90); await page.keyboard.up('KeyW');
        }
        await sleep(60);
      } else {
        if (st.throttle < 0.3) { await page.keyboard.down('KeyW'); await sleep(90); await page.keyboard.up('KeyW'); }
        await faceAndAim(st, AIM_BOARD[0], st.playerPos[1] + 9, AIM_BOARD[1]);
        await sleep(90);
      }
    }, VENUE_WAIT); // E→F venue reload rides inside this wait
    await page.keyboard.press('KeyX'); // full stop — the throttle target latches where W left it
    mark('bt_b4');
  }

  // ---------- B5: zoom hold ----------
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: 'right' });
  await whileStep('bt_b5', () => sleep(150), 15000);
  await page.mouse.up({ button: 'right' }); mark('bt_b5');

  // ---------- C1: lock under reticle (T) ----------
  await whileStep('bt_c1', async (st) => {
    const alive = st.enemies.filter((e) => e[4]);
    if (!alive.length) throw new Error('no contacts');
    const [px, , pz] = st.playerPos;
    alive.sort((a, b) => Math.hypot(a[1] - px, a[3] - pz) - Math.hypot(b[1] - px, b[3] - pz));
    const c = alive[0];
    await faceAndAim(st, c[1], c[2] + 6, c[3]);
    await sleep(180);
    await page.keyboard.press('KeyT');
    await sleep(220);
  }, VENUE_WAIT); mark('bt_c1'); // B→C venue reload rides inside this wait

  // ---------- C2: cycle-lock all three ----------
  await whileStep('bt_c2', async () => { await page.keyboard.press('KeyR'); await sleep(350); }, 20000);
  mark('bt_c2');

  // ---------- C3: subtarget sections ----------
  await whileStep('bt_c3', async () => { await page.keyboard.press('KeyE'); await sleep(300); }, 15000);
  mark('bt_c3');

  // ---------- C4: readout info card ----------
  await page.keyboard.press('Enter');
  await waitStep('bt_d1', VENUE_WAIT); mark('bt_c4'); // C→D venue reload

  // ---------- D1: autocannon on a board ----------
  await whileStep('bt_d1', async (st) => {
    await faceAndAim(st, BOARDS[1][0], 8, BOARDS[1][1]);
    await sleep(200);
    await page.keyboard.press('Digit1');
    await sleep(600);
  }, 60000); mark('bt_d1');

  // ---------- D2 / D3: laser, rockets ----------
  await whileStep('bt_d2', async () => { await page.keyboard.press('Digit2'); await sleep(500); }, 20000); mark('bt_d2');
  await whileStep('bt_d3', async () => { await page.keyboard.press('Digit3'); await sleep(500); }, 20000); mark('bt_d3');

  // ---------- D4: destroy all four boards ----------
  let bi = 0;
  await whileStep('bt_d4', async (st) => {
    const b = BOARDS[bi % 4]; bi++;
    for (let burst = 0; burst < 3; burst++) {
      await faceAndAim(st, b[0], 8, b[1]);
      await sleep(150);
      await page.keyboard.press('Digit1');
      await page.keyboard.press('Digit2');
      await page.keyboard.press('Digit3');
      await sleep(700);
      st = await S();
      if (st.btStep !== 'bt_d4') return;
    }
  }, 150000); mark('bt_d4');

  // ---------- E1–E3: heat drill ----------
  const spamFire = async () => { await page.keyboard.press('Digit1'); await page.keyboard.press('Digit2'); await page.keyboard.press('Digit3'); await sleep(280); };
  await whileStep('bt_e1', spamFire, VENUE_WAIT); mark('bt_e1'); // D→E venue reload
  await page.keyboard.press('KeyF');
  await whileStep('bt_e2', () => sleep(200), 20000); mark('bt_e2');
  await whileStep('bt_e3', spamFire, 60000); mark('bt_e3');

  // ---------- E4: override the shutdown ----------
  await page.keyboard.down('KeyO');
  await whileStep('bt_e4', () => sleep(150), 30000);
  await page.keyboard.up('KeyO'); mark('bt_e4');

  // ---------- F1: boost over the barrier ----------
  // Staged navigation: creep to a staging point west of the barrier, stop,
  // align the legs to the lane (+x), then a full-throttle run with an early
  // jet hold. Weak steering taps at full speed just orbit the waypoint.
  {
    const stage = { x: BARRIER.x - 70, z: BARRIER.z };
    let phase = 'goto';
    await whileStep('bt_f1', async (st) => {
      const [px, , pz] = st.playerPos;
      if (phase === 'goto') {
        if (Math.hypot(px - stage.x, pz - stage.z) < 18) {
          await page.keyboard.press('KeyX');
          phase = 'align';
        } else {
          const want = Math.atan2(stage.x - px, stage.z - pz);
          const d = wrap(want - st.legYaw);
          if (Math.abs(d) > 0.15) {
            await page.keyboard.press('KeyX'); // turn in place, never while sprinting
            const key = d > 0 ? 'KeyA' : 'KeyD';
            await page.keyboard.down(key); await sleep(160); await page.keyboard.up(key);
          } else if (st.throttle < 0.45) {
            await page.keyboard.down('KeyW'); await sleep(120); await page.keyboard.up('KeyW');
          }
        }
      } else if (phase === 'align') {
        const d = wrap(Math.PI / 2 - st.legYaw); // face +x down the lane
        if (Math.abs(d) > 0.08) {
          const key = d > 0 ? 'KeyA' : 'KeyD';
          await page.keyboard.down(key); await sleep(120); await page.keyboard.up(key);
        } else {
          await page.keyboard.down('KeyW');
          phase = 'run';
        }
      } else {
        if (px > BARRIER.x - 45) await page.keyboard.down('Space');
        if (px > BARRIER.x + 15 || Math.hypot(px - BARRIER.x, pz - BARRIER.z) > 300) {
          await page.keyboard.up('Space');
          await page.keyboard.up('KeyW');
          await page.keyboard.press('KeyX');
          phase = 'goto'; // landed (confirm pending) or overshot — re-stage if needed
        }
      }
      await sleep(70);
    }, 240000);
    await page.keyboard.up('KeyW').catch(() => {});
    await page.keyboard.up('Space').catch(() => {});
    await page.keyboard.press('KeyX'); mark('bt_f1');
  }

  // ---------- G auto-skips → H1 checkride ----------
  s = await waitStep('bt_h1', VENUE_WAIT); // F→H venue reload; G (squad-gated) is jumped with the venue change
  await whileStep('bt_h1', async (st) => {
    const alive = st.enemies.filter((e) => e[4]
      && !CONTACT_SPAWNS.some(([cx, cz]) => Math.hypot(e[1] - cx, e[3] - cz) < 12));
    if (!alive.length) { await sleep(200); return; }
    const [px, , pz] = st.playerPos;
    alive.sort((a, b) => Math.hypot(a[1] - px, a[3] - pz) - Math.hypot(b[1] - px, b[3] - pz));
    const d = alive[0];
    const dist = Math.hypot(d[1] - px, d[3] - pz);
    // drones hold their AI range band — close to laser-accurate distance first
    if (dist > 190) {
      const want = Math.atan2(d[1] - px, d[3] - pz);
      const dd = wrap(want - st.legYaw);
      if (Math.abs(dd) > 0.25) {
        const key = dd > 0 ? 'KeyA' : 'KeyD';
        await page.keyboard.down(key); await sleep(Math.min(300, Math.abs(dd) * 400)); await page.keyboard.up(key);
      } else if (st.throttle < 0.5) {
        await page.keyboard.down('KeyW'); await sleep(100); await page.keyboard.up('KeyW');
      }
    } else if (st.throttle > 0.05) {
      await page.keyboard.press('KeyX');
    }
    await faceAndAim(st, d[1], d[2] + 5, d[3]);
    await sleep(120);
    await page.keyboard.press('Digit2');
    await page.keyboard.press('Digit1');
    await sleep(300);
  }, 360000); mark('bt_h1');

  // ---------- H2: done ----------
  await waitStep('bt_h2', 8000);
  await page.keyboard.press('Enter');
  const tEnd = Date.now();
  while (Date.now() - tEnd < 8000) {
    s = await S();
    if (s.phase === 'complete') break;
    await sleep(150);
  }
  if (s.phase !== 'complete') throw new Error(`mission phase is ${s.phase}, expected complete`);
  mark('bt_h2');

  if (pageErrors.length) throw new Error(`page errors: ${pageErrors.slice(0, 4).join(' | ')}`);
  console.log(`\nBT INJECTION PASS — ${stepLog.length} checkpoints, ${((Date.now() - t0) / 1000).toFixed(0)}s wall clock`);
  await browser.close();
  process.exit(0);
} catch (e) {
  console.error(`\nBT INJECTION FAIL: ${e.message}`);
  console.error('state:', JSON.stringify(await S().catch(() => null)));
  await page.screenshot({ path: '/tmp/bt_fail.png' }).catch(() => {});
  console.error('screenshot: /tmp/bt_fail.png');
  await browser.close();
  process.exit(1);
}
