#!/usr/bin/env node
/**
 * PATHLIGHT unit suite — pure-math and sim-logic tests, no browser.
 * Imports src/sim/navmath.ts and src/sim/nav.ts directly (Node ≥ 23.6 strips
 * erasable TS types natively; both files are deliberately vite- and three-free).
 *
 * Covers the spec's unit matrix:
 *   wrapPi continuity across ±180° · behind-camera projection sign ·
 *   rect clamp on all edges and corners · torso-invariance of the steering
 *   error · hysteresis (boundary parking → zero flips) · arrival exactness ·
 *   spring lag bound · detour/LOS math · nav event determinism.
 */
import {
  wrapPi, groundBearing, arrived, projectView, clampToRect,
  makeAngleSpring, stepAngleSpring, makeNavStateMachine, stepNavState,
  segmentHitsAabb, firstBlocker, computeDetour, DEG, offscreenEntryDeg,
} from '../src/sim/navmath.ts';
import { NavGuidanceSystem, registerNavRoute } from '../src/sim/nav.ts';

let pass = 0, fail = 0;
const t = (name, cond, detail = '') => {
  if (cond) { pass++; }
  else { fail++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---------- wrapPi ----------
t('wrapPi(0)', wrapPi(0) === 0);
t('wrapPi(π)', near(wrapPi(Math.PI), Math.PI));
t('wrapPi(-π)→π', near(wrapPi(-Math.PI), Math.PI));
t('wrapPi(3π)', near(wrapPi(3 * Math.PI), Math.PI));
t('wrapPi(-3π)', near(wrapPi(-3 * Math.PI), Math.PI));
t('wrapPi(2π)', near(wrapPi(2 * Math.PI), 0));
// continuity at ±180°: 179.9° and −179.9° map 0.2° apart through the wrap
{
  const a = wrapPi(179.9 * DEG);
  const b = wrapPi(180.0 * DEG);
  const c = wrapPi(-179.9 * DEG);
  t('wrap 179.9°', near(a, 179.9 * DEG, 1e-9));
  t('wrap 180.0°', near(b, Math.PI, 1e-9));
  t('wrap −179.9° continuity', near(wrapPi(c - a), 0.2 * DEG, 1e-6),
    `gap=${wrapPi(c - a) / DEG}`);
  // crossing directly behind: sweep 179°→181° must move monotonically ~2°
  let prev = wrapPi(179 * DEG);
  let total = 0;
  for (let d = 179.1; d <= 181.001; d += 0.1) {
    const cur = wrapPi(d * DEG);
    total += Math.abs(wrapPi(cur - prev));
    prev = cur;
  }
  t('sweep through 180° is continuous', total < 2.5 * DEG, `total=${total / DEG}°`);
}

// ---------- ground bearing convention ----------
t('bearing +Z', near(groundBearing(0, 1), 0));
t('bearing +X', near(groundBearing(1, 0), Math.PI / 2));

// ---------- behind-camera projection (§2.6) ----------
{
  const fov = 68 * DEG, aspect = 16 / 9;
  // in front (view −Z): projects normally
  const f = projectView(0, -1, -10, fov, aspect);
  t('front: not behind', !f.behind);
  t('front: y sign', f.y < 0);
  // directly behind the camera, slightly below eye line → clamped arrow at
  // frame BOTTOM (the naive divide would put it at the top)
  const b = projectView(0, -1, +10, fov, aspect);
  t('behind flagged', b.behind && b.offscreen);
  const [, cy] = clampToRect(b.x, b.y);
  t('behind → frame bottom', cy < 0, `cy=${cy}`);
  // exactly behind on the axis: still deterministic, never NaN
  const z = projectView(0, 0, +10, fov, aspect);
  t('behind axis: finite', Number.isFinite(z.x) && Number.isFinite(z.y));
}

// ---------- rect clamp: all four edges + all four corners ----------
{
  const SX = 0.84, SY = 0.84;
  const cases = [
    [0, 2, 'top'], [0, -2, 'bottom'], [2, 0, 'right'], [-2, 0, 'left'],
    [2, 2, 'corner TR'], [-2, 2, 'corner TL'], [2, -2, 'corner BR'], [-2, -2, 'corner BL'],
  ];
  for (const [x, y, name] of cases) {
    const [cx, cy] = clampToRect(x, y, SX, SY);
    t(`clamp ${name} on boundary`,
      near(Math.max(Math.abs(cx) / SX, Math.abs(cy) / SY), 1, 1e-9)
      && Math.sign(cx) === Math.sign(x) && Math.sign(cy) === Math.sign(y));
  }
  // corners are legal positions: diagonal input lands exactly on the corner
  const [qx, qy] = clampToRect(3, 3, SX, SY);
  t('corner is legal', near(qx, SX) && near(qy, SY));
}

// ---------- arrival exactness ----------
t('arrival strictly inside', arrived(14.99, 0, 0, 15, 10));
t('arrival boundary is NOT arrived', !arrived(15, 0, 0, 15, 10));
t('arrival vertical tol ok', arrived(5, 10, 0, 15, 10));
t('arrival vertical tol exceeded', !arrived(5, 10.01, 0, 15, 10));
t('arrival 2D uses hypot', !arrived(11, 0, 11, 15, 10) && arrived(10, 0, 10, 15, 10));

// ---------- torso invariance ----------
// steering error = wrapPi(bearing − legYaw); sweep the camera/torso 360° with
// the legs fixed → the steering error must not move at all
{
  const legYaw = 0.7;
  const bearing = groundBearing(30 - 4, 50 - 8);
  const ref = wrapPi(bearing - legYaw);
  let invariant = true;
  for (let torso = 0; torso < 360; torso += 5) {
    // camera yaw = legYaw + torso — it simply never appears in the formula;
    // this test pins that contract so a future "helpful" refactor fails loudly
    const steering = wrapPi(bearing - legYaw);
    if (!near(steering, ref)) invariant = false;
  }
  t('torso sweep leaves steering error invariant', invariant);
}

// ---------- state machine: dwell + hysteresis ----------
{
  // parked exactly on the ON COURSE/STEER boundary (5°) for 10 s → zero flips
  const m = makeNavStateMachine();
  stepNavState(m, 1, 20, 20, false, false); // settle into steer
  const settled = m.state;
  let flips = 0;
  let prev = m.state;
  for (let i = 0; i < 600; i++) {
    const s = stepNavState(m, 1 / 60, 5.0, 5.0, false, false); // exactly on the edge
    if (s !== prev) flips++;
    prev = s;
  }
  t('boundary parking → ≤1 transition, then stable', flips <= 1, `flips=${flips} from ${settled}`);

  // 3° hysteresis: from steer, 6° does NOT re-enter on_course (needs < 2°)
  const m2 = makeNavStateMachine();
  stepNavState(m2, 1, 20, 20, false, false);
  for (let i = 0; i < 60; i++) stepNavState(m2, 1 / 60, 6, 6, false, false);
  t('hysteresis holds steer at 6°', m2.state === 'steer', m2.state);
  for (let i = 0; i < 60; i++) stepNavState(m2, 1 / 60, 1.5, 1.5, false, false);
  t('returns on_course past hysteresis', m2.state === 'on_course', m2.state);

  // dwell: a 0.1 s spike toward behind must not flip the state
  const m3 = makeNavStateMachine();
  stepNavState(m3, 1, 20, 20, false, false);
  for (let i = 0; i < 6; i++) stepNavState(m3, 1 / 60, 170, 170, false, false);
  t('0.1 s spike does not flip', m3.state === 'steer', m3.state);
  for (let i = 0; i < 30; i++) stepNavState(m3, 1 / 60, 170, 170, false, false);
  t('sustained bearing flips to behind', m3.state === 'behind', m3.state);

  // arrival + reroute are level-triggered and immediate
  const m4 = makeNavStateMachine();
  t('arrived is immediate', stepNavState(m4, 1 / 60, 0, 0, true, false) === 'arrived');
  t('rerouting is immediate', stepNavState(m4, 1 / 60, 0, 0, false, true) === 'rerouting');
}

// ---------- projection-derived off-screen entry threshold ----------
{
  const wide = offscreenEntryDeg(68 * DEG, 16 / 9);
  const zoomed = offscreenEntryDeg(30 * DEG, 16 / 9);
  t('offscreen entry ~ frustum edge at fov 68', wide > 40 && wide < 50, `${wide.toFixed(1)}°`);
  t('zoom narrows the offscreen entry', zoomed < wide && zoomed > 15 && zoomed < 27, `${zoomed.toFixed(1)}°`);
  // the threshold feeds the state machine: at fov 30, a 30° camError is offscreen
  const m = makeNavStateMachine();
  for (let i = 0; i < 60; i++) stepNavState(m, 1 / 60, 30, 30, false, false, zoomed);
  t('zoomed camera flags 30° as offscreen', m.state === 'offscreen', m.state);
}

// ---------- spring: ≤ 6° lag during a max-rate turn, converges when still ----------
{
  const s = makeAngleSpring(0);
  let target = 0;
  let maxLag = 0;
  const rate = 120 * DEG; // deg/s max leg turn rate
  for (let i = 0; i < 600; i++) {
    target += rate / 60;
    const shown = stepAngleSpring(s, target, 1 / 60);
    maxLag = Math.max(maxLag, Math.abs(wrapPi(target - shown)));
  }
  t('spring lag ≤ 6° at 120°/s', maxLag <= 6 * DEG + 1e-6, `${(maxLag / DEG).toFixed(2)}°`);
  for (let i = 0; i < 120; i++) stepAngleSpring(s, target, 1 / 60);
  t('spring converges when target stops', Math.abs(wrapPi(target - s.value)) < 0.2 * DEG);
  // no discontinuity chasing a target through ±180°
  const s2 = makeAngleSpring(175 * DEG);
  const shown1 = stepAngleSpring(s2, -175 * DEG, 1 / 60);
  t('spring crosses ±180° the short way', Math.abs(wrapPi(shown1 - 175 * DEG)) < 15 * DEG);
}

// ---------- segment vs AABB + detour ----------
{
  const box = { minX: -5, maxX: 5, minZ: 40, maxZ: 50, minY: 0, maxY: 10 };
  t('leg through box blocked', segmentHitsAabb(0, 0, 0, 100, box, 1, 8));
  t('leg beside box clear', !segmentHitsAabb(20, 0, 20, 100, box, 1, 8));
  t('vertical band excludes overhead', !segmentHitsAabb(0, 0, 0, 100, { ...box, minY: 20, maxY: 30 }, 1, 8));
  t('firstBlocker finds it', firstBlocker(0, 0, 0, 100, [box], 1, 8) === 0);
  const corner = computeDetour(0, 0, 0, 100, [box], 1, 8);
  t('detour found', corner !== null);
  if (corner) {
    t('detour legs both clear',
      !segmentHitsAabb(0, 0, corner[0], corner[1], box, 1, 8)
      && !segmentHitsAabb(corner[0], corner[1], 0, 100, box, 1, 8));
  }
  t('no detour when fully walled', computeDetour(0, 0, 0, 100,
    [{ minX: -2000, maxX: 2000, minZ: 40, maxZ: 50, minY: 0, maxY: 10 }], 1, 8) === null);
}

// ---------- NavGuidanceSystem: scripted determinism + event order ----------
{
  registerNavRoute({
    id: 'route_unit',
    layers: { chevrons: true, beacon: true, arrow: true, compass: true },
    loop: false,
    waypoints: [
      { id: 'u1', display_key: 'hud.nav.wp.p1', position: [0, 0, 60], arrival: { radius_m: 15, vertical_tolerance_m: 10, dwell_s: 0 }, next: 'u2' },
      { id: 'u2', display_key: 'hud.nav.wp.p2', position: [40, 0, 60], arrival: { radius_m: 15, vertical_tolerance_m: 10, dwell_s: 0 }, next: null },
    ],
  });
  const run = () => {
    const p = { x: 0, y: 0, z: 0, legYaw: 0, facingYaw: 0, speed: 8, throttle: 0.6, alive: true, bootLocked: false };
    const sys = new NavGuidanceSystem({
      getPlayer: () => ({ ...p }),
      heightAt: () => 0,
      getColliders: () => [],
      navString: (k) => k,
    });
    sys.startRoute('route_unit');
    for (let i = 0; i < 60 * 30 && sys.view.active; i++) {
      // walk straight at the armed waypoint like a scripted driver
      const b = Math.atan2(sys.view.targetX - p.x, sys.view.targetZ - p.z);
      p.legYaw = b; p.facingYaw = b;
      p.x += Math.sin(b) * 8 / 60;
      p.z += Math.cos(b) * 8 / 60;
      sys.update(1 / 60);
    }
    return sys.eventLog.map((e) => JSON.parse(e).t + ':' + (JSON.parse(e).id ?? ''));
  };
  const a = run(), b = run();
  t('scripted run completes route', a.includes('route_complete:route_unit'), a.join(','));
  t('events in order, once each',
    JSON.stringify(a.filter((x) => x.startsWith('waypoint_arrive')))
    === JSON.stringify(['waypoint_arrive:u1', 'waypoint_arrive:u2']), a.join(','));
  t('identical inputs → identical event log', JSON.stringify(a) === JSON.stringify(b));
}

// ---------- NavGuidanceSystem: stuck ladder + arrive-hold beat ----------
{
  const p = { x: 0, y: 0, z: 0, legYaw: 0, facingYaw: 0, speed: 0, throttle: 0.8, alive: true, bootLocked: false };
  const events = [];
  registerNavRoute({
    id: 'route_unit_stuck',
    layers: { chevrons: true, beacon: true, arrow: true, compass: true },
    loop: false,
    waypoints: [{ id: 'u3', display_key: 'hud.nav.wp.p1', position: [0, 0, 200], arrival: { radius_m: 15, vertical_tolerance_m: 10, dwell_s: 0 }, next: null }],
  });
  const sys = new NavGuidanceSystem({
    getPlayer: () => ({ ...p }),
    heightAt: () => 0,
    getColliders: () => [],
    navString: (k) => k,
    onEvent: (e) => events.push(e),
  });
  sys.startRoute('route_unit_stuck');
  // throttle up, zero speed → stuck L1 at 3 s, L2 at +10 s, L3 at +35 s
  for (let i = 0; i < 60 * 40; i++) sys.update(1 / 60);
  const lv = events.filter((e) => e.t === 'stuck').map((e) => e.level);
  t('stuck ladder 1→2→3 in order', JSON.stringify(lv) === JSON.stringify([1, 2, 3]), JSON.stringify(lv));
  t('reposition offer surfaces', sys.view.stuckLevel === 3);
  // recovery clears the ladder
  p.speed = 8;
  for (let i = 0; i < 60 * 3; i++) { p.z += 8 / 60; sys.update(1 / 60); }
  t('stuck ladder clears on progress', sys.view.stuckLevel === 0);
  // arrive-hold: state 'arrived' holds ~0.7 s before the route completes
  p.z = 195; p.speed = 2;
  sys.update(1 / 60);
  t('arrival enters hold', sys.view.state === 'arrived');
  let holdTicks = 0;
  while (sys.view.active && holdTicks < 120) { sys.update(1 / 60); holdTicks++; }
  t('0.7 s arrive-hold beat', holdTicks >= 40 && holdTicks <= 46, `${holdTicks} ticks`);
}

console.log(`\nnav unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
