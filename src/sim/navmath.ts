/**
 * PATHLIGHT pure math — no three.js, no DOM, no vite-isms. Every function here
 * is deterministic and unit-tested directly under Node (scripts/test_nav_unit.mjs
 * imports this file via Node's TS type-stripping), so keep the syntax erasable:
 * no enums, no namespaces, no parameter properties.
 *
 * Conventions (match the sim everywhere):
 *   yaw 0 = +Z, forward = (sin yaw, 0, cos yaw), +yaw = turn LEFT.
 *   bearing to a target = atan2(dx, dz), world-absolute.
 *   relative bearing = wrapPi(bearing − heading); positive = to the pilot's LEFT.
 */

export const NAV_CYAN = '#3fd8f0';

/** Wrap an angle into (−π, π]. Continuous across ±180° — the arrow crossing
 *  directly behind is one frame of motion, never a snap. */
export function wrapPi(a: number): number {
  const TWO_PI = Math.PI * 2;
  let x = a % TWO_PI;
  if (x <= -Math.PI) x += TWO_PI;
  else if (x > Math.PI) x -= TWO_PI;
  return x;
}

/** World-absolute ground bearing of (dx, dz) — atan2 x-first per the sim. */
export function groundBearing(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** Horizontal arrival predicate with vertical tolerance. Strictly-inside on the
 *  radius: standing exactly ON the boundary is not arrived (tested). */
export function arrived(dx: number, dy: number, dz: number, radius: number, vTol: number): boolean {
  return Math.hypot(dx, dz) < radius && Math.abs(dy) <= vTol;
}

// ---------------------------------------------------------------------------
// Rendered-angle smoothing: critically damped spring with a hard lag clamp.
// The spec wants a 120 ms time constant AND ≤ 6° of lag during a max-rate turn;
// a plain spring at τ=120 ms lags a 120°/s ramp by more than that, so the
// spring is followed by a clamp that never lets the rendered angle trail the
// true bearing by more than maxLag. Both halves are deterministic.
// ---------------------------------------------------------------------------

export interface AngleSpring {
  /** rendered angle, radians (unwrapped internally, read via wrapPi) */
  value: number;
  vel: number;
}

export function makeAngleSpring(initial: number): AngleSpring {
  return { value: initial, vel: 0 };
}

export function stepAngleSpring(s: AngleSpring, target: number, dt: number,
  tau = 0.12, maxLag = (6 * Math.PI) / 180): number {
  // chase the nearest representation of the target so we never unwind laps
  const t = s.value + wrapPi(target - s.value);
  const omega = 2 / tau; // critically damped: x'' = ω²(t−x) − 2ω x'
  const acc = omega * omega * (t - s.value) - 2 * omega * s.vel;
  s.vel += acc * dt;
  s.value += s.vel * dt;
  const err = t - s.value;
  if (Math.abs(err) > maxLag) {
    s.value = t - Math.sign(err) * maxLag;
    // keep velocity from winding up against the clamp
    s.vel = Math.sign(err) * Math.min(Math.abs(s.vel), Math.abs(err) / Math.max(dt, 1e-4));
  }
  return wrapPi(s.value);
}

// ---------------------------------------------------------------------------
// Screen-space projection helpers — pure, view-space in, NDC out. The classic
// off-screen-indicator bug is a behind-camera point surviving the perspective
// divide with an inverted sign; guard it HERE, once, and test it.
// Camera convention (three.js): view space looks down −Z, so vz < 0 is in
// front of the camera and vz > 0 is behind it.
// ---------------------------------------------------------------------------

export interface ProjectedPoint {
  x: number; // NDC −1..1
  y: number;
  behind: boolean;
  offscreen: boolean;
}

/** Project a view-space point to NDC with the behind-camera sign guard, then
 *  flag off-screen against an inset safe frame (default 8% inset → ±0.84). */
export function projectView(vx: number, vy: number, vz: number,
  fovYRad: number, aspect: number, safeX = 0.84, safeY = 0.84): ProjectedPoint {
  const behind = vz >= 0;
  const f = 1 / Math.tan(fovYRad / 2);
  // dividing by |vz| (instead of the signed −vz a raw projection uses) is the
  // sign guard itself: a behind-camera point keeps its TRUE direction instead
  // of the inverted one the perspective divide would produce
  const depth = Math.max(Math.abs(vz), 1e-6);
  const x = (vx * f / aspect) / depth;
  const y = (vy * f) / depth;
  const offscreen = behind || Math.abs(x) > safeX || Math.abs(y) > safeY;
  return { x, y, behind, offscreen };
}

/** Clamp an NDC direction onto the inset safe rect (corners are legal —
 *  clamp to the RECT, not to a circle). Returns the boundary point. */
export function clampToRect(x: number, y: number, safeX = 0.84, safeY = 0.84): [number, number] {
  const m = Math.max(Math.abs(x) / safeX, Math.abs(y) / safeY, 1e-6);
  return [x / m, y / m];
}

// ---------------------------------------------------------------------------
// State machine with dwell + hysteresis. Six states; every transition needs
// 0.25 s of dwell AND 3° past the threshold, so a bearing parked exactly on a
// boundary never flickers.
// ---------------------------------------------------------------------------

export type NavArrowState = 'on_course' | 'steer' | 'behind' | 'offscreen' | 'arrived' | 'rerouting';

export const DEG = Math.PI / 180;
export const ON_COURSE_DEG = 5;
export const BEHIND_DEG = 130;
export const OFFSCREEN_DEG = 42; // sim-side camera-frame proxy (half-fov + margin)
export const HYST_DEG = 3;
export const DWELL_S = 0.25;

export interface NavStateMachine {
  state: NavArrowState;
  pending: NavArrowState | null;
  pendingT: number;
}

export function makeNavStateMachine(): NavStateMachine {
  return { state: 'on_course', pending: null, pendingT: 0 };
}

/** Raw classification with a per-current-state hysteresis margin: thresholds
 *  move HYST_DEG against leaving the current state. */
function classify(cur: NavArrowState, legErrDeg: number, camErrDeg: number,
  offscreenDeg: number): NavArrowState {
  const h = (edge: number, insideState: boolean): number =>
    insideState ? edge + HYST_DEG : edge - HYST_DEG;
  const aLeg = Math.abs(legErrDeg);
  const aCam = Math.abs(camErrDeg);
  if (aLeg > h(BEHIND_DEG, cur !== 'behind')) return 'behind';
  if (aCam > h(offscreenDeg, cur !== 'offscreen')) return 'offscreen';
  if (aLeg > h(ON_COURSE_DEG, cur !== 'steer' && cur !== 'offscreen' && cur !== 'behind')) return 'steer';
  return 'on_course';
}

/** The horizontal bearing at which the beacon leaves the inset safe frame for
 *  a given camera — feeds stepNavState so zoom (fov 68→30) narrows the
 *  OFF-SCREEN entry exactly as the real frustum does. */
export function offscreenEntryDeg(fovYRad: number, aspect: number, safeX = 0.84): number {
  return Math.atan(safeX * Math.tan(fovYRad / 2) * aspect) / DEG;
}

/**
 * Advance the machine one fixed step. `arrivedNow` / `rerouting` are
 * level-triggered overrides (no dwell — arrival and reroute must read
 * immediately); the bearing-derived states go through dwell + hysteresis.
 */
export function stepNavState(m: NavStateMachine, dt: number,
  legErrDeg: number, camErrDeg: number, arrivedNow: boolean, rerouting: boolean,
  offscreenDeg = OFFSCREEN_DEG): NavArrowState {
  if (arrivedNow) { m.state = 'arrived'; m.pending = null; m.pendingT = 0; return m.state; }
  if (rerouting) { m.state = 'rerouting'; m.pending = null; m.pendingT = 0; return m.state; }
  const base = (m.state === 'arrived' || m.state === 'rerouting') ? 'steer' : m.state;
  if (m.state === 'arrived' || m.state === 'rerouting') m.state = classify(base, legErrDeg, camErrDeg, offscreenDeg);
  const want = classify(m.state, legErrDeg, camErrDeg, offscreenDeg);
  if (want === m.state) { m.pending = null; m.pendingT = 0; return m.state; }
  if (m.pending !== want) { m.pending = want; m.pendingT = 0; }
  m.pendingT += dt;
  if (m.pendingT >= DWELL_S) {
    m.state = want;
    m.pending = null;
    m.pendingT = 0;
  }
  return m.state;
}

// ---------------------------------------------------------------------------
// Straight-leg walkability against world AABBs (the game has no navmesh —
// routes are authored dense; these checks catch blocked legs and drive the
// single-detour "re-route" and the LOS content test).
// ---------------------------------------------------------------------------

export interface Aabb {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
  minY: number; maxY: number;
}

/** 2D segment-vs-AABB slab test, with a vertical band check: the box only
 *  blocks if it overlaps the walker's body band [yLo, yHi]. `pad` fattens the
 *  box by the walker's radius. */
export function segmentHitsAabb(x1: number, z1: number, x2: number, z2: number,
  box: Aabb, yLo: number, yHi: number, pad = 0): boolean {
  if (box.maxY < yLo || box.minY > yHi) return false;
  const minX = box.minX - pad, maxX = box.maxX + pad;
  const minZ = box.minZ - pad, maxZ = box.maxZ + pad;
  const dx = x2 - x1, dz = z2 - z1;
  let t0 = 0, t1 = 1;
  for (const [p, lo, hi, d] of [[x1, minX, maxX, dx], [z1, minZ, maxZ, dz]] as const) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return false;
    } else {
      let ta = (lo - p) / d, tb = (hi - p) / d;
      if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/** First box (index) blocking the leg, or −1 if the leg is clear. */
export function firstBlocker(x1: number, z1: number, x2: number, z2: number,
  boxes: Aabb[], yLo: number, yHi: number, pad = 0): number {
  for (let i = 0; i < boxes.length; i++) {
    if (segmentHitsAabb(x1, z1, x2, z2, boxes[i], yLo, yHi, pad)) return i;
  }
  return -1;
}

/**
 * Single-corner detour around one blocking AABB: try the four padded corners,
 * keep the nearest one whose two half-legs are both clear. Returns null when
 * no corner works (caller falls back to the straight line and says so).
 */
export function computeDetour(px: number, pz: number, tx: number, tz: number,
  boxes: Aabb[], yLo: number, yHi: number, pad = 6): [number, number] | null {
  const bi = firstBlocker(px, pz, tx, tz, boxes, yLo, yHi, pad * 0.5);
  if (bi < 0) return null;
  const b = boxes[bi];
  const corners: [number, number][] = [
    [b.minX - pad, b.minZ - pad], [b.maxX + pad, b.minZ - pad],
    [b.minX - pad, b.maxZ + pad], [b.maxX + pad, b.maxZ + pad],
  ];
  let best: [number, number] | null = null;
  let bestCost = Infinity;
  for (const [cx, cz] of corners) {
    if (firstBlocker(px, pz, cx, cz, boxes, yLo, yHi, pad * 0.4) >= 0) continue;
    if (firstBlocker(cx, cz, tx, tz, boxes, yLo, yHi, pad * 0.4) >= 0) continue;
    const cost = Math.hypot(cx - px, cz - pz) + Math.hypot(tx - cx, tz - cz);
    if (cost < bestCost) { bestCost = cost; best = [cx, cz]; }
  }
  return best;
}
