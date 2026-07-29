/**
 * PATHLIGHT — NavGuidanceSystem (fixed-step sim side).
 *
 * Owns: the active route, current-waypoint index, arrival evaluation,
 * legError/camError/distance, the six-state arrow machine, stuck detection and
 * the re-route ladder, nav/* events, and telemetry. Runs inside tick() at
 * 60 Hz next to mission.update(). The renderer and HUD only READ `view` —
 * they never decide anything.
 *
 * Deliberately free of three.js and vite APIs so the whole system can be
 * driven headless under Node (scripts/test_nav_unit.mjs): route content is
 * registered from outside (src/sim/navroutes.ts does the vite glob).
 */

// note the explicit .ts extension — this module is also loaded straight into
// Node (type-stripping) by scripts/test_nav_unit.mjs, which needs it
import {
  wrapPi, groundBearing, arrived, DEG, offscreenEntryDeg,
  makeNavStateMachine, stepNavState, type NavArrowState, type NavStateMachine,
  type Aabb, firstBlocker, computeDetour,
} from './navmath.ts';

// ---------- content types (mirror content/nav/nav_route.schema.json) ----------

export interface NavWaypointDef {
  id: string;
  display_key: string;
  /** static position — OR a follow_entity for escort/ping reuse (§10; the
   *  union member is specified now, resolved via a provider registry) */
  position?: [number, number, number];
  follow_entity?: string;
  arrival: { radius_m: number; vertical_tolerance_m: number; dwell_s: number };
  arrival_extra?: { sim: string; op: '<' | '>' | '<=' | '>='; value: number } | null;
  los_verified?: boolean;
  on_arrive?: Array<{ event: string; id?: string }>;
  beacon_height_m?: number;
  next?: string | null;
}

export interface NavRouteDef {
  id: string;
  layers: { chevrons: boolean; beacon: boolean; arrow: boolean; compass: boolean };
  loop: boolean;
  /** speak the shared arrival VO on waypoint arrive (off for tutorial routes —
   *  the step machine voices its own confirms there) */
  arrive_vo?: boolean;
  waypoints: NavWaypointDef[];
}

export type NavEvent =
  | { t: 'route_start'; id: string }
  | { t: 'waypoint_arm'; id: string }
  | { t: 'waypoint_arrive'; id: string; seconds: number; wrong_direction_seconds: number; path_length_ratio: number }
  | { t: 'reroute'; reason: string }
  | { t: 'stuck'; level: number }
  | { t: 'route_complete'; id: string }
  | { t: 'route_stop'; id: string };

/** Everything the renderer + HUD read, refreshed once per fixed step. */
export interface NavView {
  active: boolean;
  routeId: string;
  layers: { chevrons: boolean; beacon: boolean; arrow: boolean; compass: boolean };
  wpId: string;
  wpNameKey: string;
  /** the armed waypoint (beacon anchor) */
  wpX: number; wpY: number; wpZ: number;
  wpRadius: number;
  beaconHeight: number;
  /** where the arrow points — the next reachable corner (detour) or the wp */
  targetX: number; targetZ: number;
  state: NavArrowState;
  legErrorRad: number;
  camErrorRad: number;
  /** world-absolute bearing to the path target (compass tick) */
  bearingRad: number;
  /** world-absolute bearing to the WAYPOINT (beacon), for L4 */
  wpBearingRad: number;
  distance: number;
  /** sim-time seconds (drives chevron flow + beacon breathe, never wall time) */
  simTime: number;
  /** 0.7 s arrival-hold progress 0..1 while state === 'arrived' */
  arriveHold: number;
  /** stuck ladder level 0..3 (2 = brightened chevrons, 3 = reposition offer) */
  stuckLevel: number;
  /** detour corner when re-routed around a blocker (chevrons thread it) */
  detourX: number | null;
  detourZ: number | null;
}

export interface NavPlayerState {
  x: number; y: number; z: number;
  legYaw: number;
  facingYaw: number; // legYaw + torsoYaw
  speed: number;
  throttle: number;
  alive: boolean;
  bootLocked: boolean;
}

export interface NavDeps {
  getPlayer: () => NavPlayerState;
  heightAt: (x: number, z: number) => number;
  getColliders: () => Aabb[];
  /** live camera frame (fov changes with zoom, aspect with resize) — makes
   *  the OFF-SCREEN entry threshold match the real frustum; horizontal-only
   *  proxy, the HUD clamp still uses the true projection */
  getCameraFrame?: () => { fovYRad: number; aspect: number };
  /** locale lookup for hud.nav.* keys (display names) */
  navString: (key: string) => string;
  onEvent?: (ev: NavEvent) => void;
  /** CAIRN nudge lines (stuck ladder / reroute / arrival) — id + subtitle key */
  onVO?: (lineId: string, textKey: string) => void;
  logEvent?: (ev: string, data?: Record<string, unknown>) => void;
}

const ARRIVE_HOLD_S = 0.7; // the same beat as the tutorial step machine
const LOS_PERIOD_S = 0.25; // ≤ 4 Hz path checks, never per tick
const REROUTE_MAX_S = 2.0;
const STUCK_SLOW_S = 3.0;
const STUCK_NOPROG_S = 8.0;
const STUCK_L2_S = 10.0;
const STUCK_L3_S = 35.0;
const WALKER_Y_LO = 1.0; // collider band: shin → shoulder
const WALKER_Y_HI = 8.0;

// route registry — populated by navroutes.ts (vite) or tests (manual)
const ROUTES = new Map<string, NavRouteDef>();

export function registerNavRoute(def: NavRouteDef): void {
  ROUTES.set(def.id, def);
}

export function navRoute(id: string): NavRouteDef | undefined {
  return ROUTES.get(id);
}

export function navRouteIds(): string[] {
  return [...ROUTES.keys()];
}

export class NavGuidanceSystem {
  readonly view: NavView = {
    active: false, routeId: '', layers: { chevrons: false, beacon: false, arrow: false, compass: false },
    wpId: '', wpNameKey: '', wpX: 0, wpY: 0, wpZ: 0, wpRadius: 15, beaconHeight: 40,
    targetX: 0, targetZ: 0, state: 'on_course', legErrorRad: 0, camErrorRad: 0,
    bearingRad: 0, wpBearingRad: 0, distance: 0, simTime: 0, arriveHold: 0,
    stuckLevel: 0, detourX: null, detourZ: null,
  };

  /** waypoints arrived at this mission (cumulative — BT reads these as flags) */
  readonly arrivedWps = new Set<string>();
  /** bounded event log (determinism + telemetry assertions read this) */
  readonly eventLog: string[] = [];

  private deps: NavDeps;
  private route: NavRouteDef | null = null;
  private wpIdx = 0;
  private sm: NavStateMachine = makeNavStateMachine();
  private simTime = 0;
  private arriveT = -1; // sim time the hold started; −1 = not arrived
  private dwellT = 0;
  private losT = 0;
  private rerouteT = -1; // sim time RE-ROUTING began; −1 = not rerouting
  private rerouteFailed = false;
  private detour: [number, number] | null = null;
  // stuck detection
  private slowT = 0;
  private progressRefDist = Infinity;
  private progressT = 0;
  private stuckT = -1; // sim time stuck began
  private nudgedL2 = false;
  private offeredL3 = false;
  // per-leg telemetry
  private legStartT = 0;
  private legStraight = 1;
  private legWalked = 0;
  private legWrongDir = 0;
  private lastPX = 0;
  private lastPZ = 0;

  constructor(deps: NavDeps) {
    this.deps = deps;
  }

  /** Arm a route by id (registry) or inline def. Re-arming the active route is
   *  a no-op, so tutorial quick-jump replays stay idempotent. */
  startRoute(routeOrId: string | NavRouteDef, fromWaypoint?: string): void {
    const def = typeof routeOrId === 'string' ? ROUTES.get(routeOrId) : routeOrId;
    if (!def || !def.waypoints.length) return;
    if (this.view.active && this.route?.id === def.id) return;
    this.route = def;
    this.wpIdx = Math.max(0, fromWaypoint ? def.waypoints.findIndex((w) => w.id === fromWaypoint) : 0);
    this.view.active = true;
    this.view.routeId = def.id;
    this.view.layers = { ...def.layers };
    this.emit({ t: 'route_start', id: def.id });
    this.deps.logEvent?.('nav_route_start', { id: def.id });
    this.armWaypoint(this.wpIdx);
  }

  stopRoute(): void {
    if (!this.view.active || !this.route) return;
    const id = this.route.id;
    this.route = null;
    this.view.active = false;
    this.view.routeId = '';
    this.view.stuckLevel = 0;
    this.view.detourX = this.view.detourZ = null;
    this.detour = null;
    this.emit({ t: 'route_stop', id });
  }

  /** Jump the active route's armed waypoint (keeps a route in step with an
   *  external authority, e.g. the tutorial's sequential gate metric). */
  syncWaypoint(index: number): void {
    if (!this.route || !this.view.active) return;
    const i = Math.min(Math.max(0, index), this.route.waypoints.length - 1);
    if (i !== this.wpIdx) this.armWaypoint(i);
  }

  hasArrived(wpId: string): boolean {
    return this.arrivedWps.has(wpId);
  }

  private armWaypoint(i: number): void {
    if (!this.route) return;
    this.wpIdx = i;
    const wp = this.route.waypoints[i];
    const p = this.deps.getPlayer();
    const [wx, , wz] = this.wpPos(wp);
    this.arriveT = -1;
    this.dwellT = 0;
    this.rerouteT = -1;
    this.rerouteFailed = false;
    this.detour = null;
    this.losT = 0;
    this.slowT = 0;
    this.stuckT = -1;
    this.nudgedL2 = false;
    this.offeredL3 = false;
    this.progressRefDist = Infinity;
    this.progressT = 0;
    this.legStartT = this.simTime;
    this.legStraight = Math.max(1, Math.hypot(wx - p.x, wz - p.z));
    this.legWalked = 0;
    this.legWrongDir = 0;
    this.lastPX = p.x;
    this.lastPZ = p.z;
    this.emit({ t: 'waypoint_arm', id: wp.id });
  }

  private wpPos(wp: NavWaypointDef): [number, number, number] {
    if (wp.position) {
      const [x, , z] = wp.position;
      return [x, this.deps.heightAt(x, z), z];
    }
    // follow_entity: not resolved in this build — anchor at the player start
    // so a mis-authored route degrades visibly instead of lying (validator
    // rejects follow_entity routes until a provider ships).
    return [0, this.deps.heightAt(0, 0), 0];
  }

  private emit(ev: NavEvent): void {
    this.eventLog.push(JSON.stringify(ev));
    if (this.eventLog.length > 400) this.eventLog.shift();
    this.deps.onEvent?.(ev);
  }

  update(dt: number): void {
    this.simTime += dt;
    this.view.simTime = this.simTime;
    if (!this.view.active || !this.route) return;

    const wp = this.route.waypoints[this.wpIdx];
    const p = this.deps.getPlayer();
    const [wx, wy, wz] = this.wpPos(wp);

    // ---- arrival-hold beat (✓ blooms, then the next waypoint arms) ----
    if (this.arriveT >= 0) {
      this.view.arriveHold = Math.min(1, (this.simTime - this.arriveT) / ARRIVE_HOLD_S);
      this.view.state = 'arrived';
      if (this.view.arriveHold >= 1) this.advanceAfterArrival();
      return;
    }

    // ---- geometry ----
    const dxW = wx - p.x, dzW = wz - p.z;
    const dist = Math.hypot(dxW, dzW);
    const wpBearing = groundBearing(dxW, dzW);

    // path target: detour corner while one is held, else the waypoint
    let tx = wx, tz = wz;
    if (this.detour) {
      // release the corner once we're past it
      if (Math.hypot(this.detour[0] - p.x, this.detour[1] - p.z) < 8) this.detour = null;
      else { tx = this.detour[0]; tz = this.detour[1]; }
    }
    const bearing = groundBearing(tx - p.x, tz - p.z);
    const legError = wrapPi(bearing - p.legYaw);
    const camError = wrapPi(bearing - p.facingYaw);

    this.view.wpId = wp.id;
    this.view.wpNameKey = wp.display_key;
    this.view.wpX = wx; this.view.wpY = wy; this.view.wpZ = wz;
    this.view.wpRadius = wp.arrival.radius_m;
    this.view.beaconHeight = wp.beacon_height_m ?? 40;
    this.view.targetX = tx; this.view.targetZ = tz;
    this.view.legErrorRad = legError;
    this.view.camErrorRad = camError;
    this.view.bearingRad = bearing;
    this.view.wpBearingRad = wpBearing;
    this.view.distance = dist;
    this.view.arriveHold = 0;
    this.view.detourX = this.detour ? this.detour[0] : null;
    this.view.detourZ = this.detour ? this.detour[1] : null;

    // ---- per-leg telemetry accumulation ----
    const stepDist = Math.hypot(p.x - this.lastPX, p.z - this.lastPZ);
    this.legWalked += stepDist;
    this.lastPX = p.x; this.lastPZ = p.z;
    if (Math.abs(p.speed) > 2 && Math.abs(legError) > 90 * DEG) this.legWrongDir += dt;

    // ---- LOS / re-route (≤ 4 Hz) ----
    this.losT -= dt;
    let rerouting = this.rerouteT >= 0;
    if (this.losT <= 0) {
      this.losT = LOS_PERIOD_S;
      const boxes = this.deps.getColliders();
      const blocked = firstBlocker(p.x, p.z, wx, wz, boxes, WALKER_Y_LO, WALKER_Y_HI, 2.5) >= 0;
      if (blocked && !this.detour && !this.rerouteFailed) {
        if (this.rerouteT < 0) {
          this.rerouteT = this.simTime;
          rerouting = true;
          this.emit({ t: 'reroute', reason: 'blocked' });
          this.deps.logEvent?.('nav_reroute', { reason: 'blocked' });
          this.deps.onVO?.('vo_nav_reroute', 'hud.nav.vo.reroute');
        }
        const corner = computeDetour(p.x, p.z, wx, wz, boxes, WALKER_Y_LO, WALKER_Y_HI, 6);
        if (corner) {
          this.detour = corner;
          this.rerouteT = -1;
          rerouting = false;
        } else if (this.simTime - this.rerouteT > REROUTE_MAX_S) {
          // fall back to the straight line and stop pretending — never a lie,
          // and never a spinner forever
          this.rerouteFailed = true;
          this.rerouteT = -1;
          rerouting = false;
          this.emit({ t: 'reroute', reason: 'fallback_straight' });
        }
      } else if (!blocked) {
        this.rerouteFailed = false;
        if (this.rerouteT >= 0) { this.rerouteT = -1; rerouting = false; }
      }
    }

    // ---- stuck ladder (only while the pilot is actually trying) ----
    const trying = p.alive && !p.bootLocked;
    // key the slow detector on ACTUAL displacement, not commanded speed —
    // Mech.speed is open-loop and stays high while collision pushes the mech
    // back out of a wall every tick, so kinematic speed never reads "stuck"
    const moveSpeed = dt > 0 ? stepDist / dt : 0;
    if (trying && p.throttle > 0.2 && moveSpeed < 0.5) this.slowT += dt;
    else this.slowT = 0;
    this.progressT += dt;
    if (dist < this.progressRefDist - 1) { this.progressRefDist = dist; this.progressT = 0; }
    const noProgress = trying && Math.abs(p.speed) > 2 && this.progressT > STUCK_NOPROG_S;
    const isStuck = this.slowT > STUCK_SLOW_S || noProgress;
    if (isStuck && this.stuckT < 0) {
      this.stuckT = this.simTime;
      this.view.stuckLevel = 1;
      this.emit({ t: 'stuck', level: 1 });
      this.deps.logEvent?.('nav_stuck', { level: 1 });
    }
    if (this.stuckT >= 0) {
      const s = this.simTime - this.stuckT;
      if (s > STUCK_L2_S && !this.nudgedL2) {
        this.nudgedL2 = true;
        this.view.stuckLevel = 2;
        this.emit({ t: 'stuck', level: 2 });
        this.deps.logEvent?.('nav_stuck', { level: 2 });
        // contextual nudge: behind → "Turn around.", else → "Follow the light."
        if (Math.abs(legError) > BEHIND_NUDGE) this.deps.onVO?.('vo_nav_turn_around', 'hud.nav.vo.turn_around');
        else this.deps.onVO?.('vo_nav_follow', 'hud.nav.vo.follow');
      }
      if (s > STUCK_L3_S && !this.offeredL3) {
        this.offeredL3 = true;
        this.view.stuckLevel = 3;
        this.emit({ t: 'stuck', level: 3 });
        this.deps.logEvent?.('nav_stuck', { level: 3 });
      }
      // recovery: moving and making progress again clears the ladder
      if (!isStuck && this.progressT < 1) {
        this.stuckT = -1;
        this.view.stuckLevel = 0;
        this.nudgedL2 = false;
        this.offeredL3 = false;
      }
    }

    // ---- arrival ----
    const atWp = arrived(dxW, wy - p.y, dzW, wp.arrival.radius_m, wp.arrival.vertical_tolerance_m)
      && this.extraOk(wp, p);
    if (atWp) {
      this.dwellT += dt;
      if (this.dwellT >= (wp.arrival.dwell_s ?? 0)) {
        this.arriveT = this.simTime;
        this.arrivedWps.add(wp.id);
        const ratio = Math.round((this.legWalked / this.legStraight) * 100) / 100;
        this.emit({
          t: 'waypoint_arrive', id: wp.id,
          seconds: Math.round((this.simTime - this.legStartT) * 10) / 10,
          wrong_direction_seconds: Math.round(this.legWrongDir * 10) / 10,
          path_length_ratio: ratio,
        });
        this.deps.logEvent?.('nav_wp_arrive', {
          id: wp.id, seconds: Math.round(this.simTime - this.legStartT),
          wrong_direction_seconds: Math.round(this.legWrongDir * 10) / 10,
          path_length_ratio: ratio,
        });
        if (this.route.arrive_vo) this.deps.onVO?.('vo_nav_arrive', 'hud.nav.vo.arrive');
        this.view.state = 'arrived';
        this.view.arriveHold = 0;
        return;
      }
    } else {
      this.dwellT = 0;
    }

    // ---- state machine (dwell + hysteresis in navmath) ----
    const cam = this.deps.getCameraFrame?.();
    const offDeg = cam ? offscreenEntryDeg(cam.fovYRad, cam.aspect) : undefined;
    this.view.state = stepNavState(this.sm, dt, legError / DEG, camError / DEG, false, rerouting, offDeg);
  }

  private extraOk(wp: NavWaypointDef, p: NavPlayerState): boolean {
    const ex = wp.arrival_extra;
    if (!ex) return true;
    const v = ex.sim === 'speed_mps' ? Math.abs(p.speed)
      : ex.sim === 'throttle' ? p.throttle : 0;
    switch (ex.op) {
      case '<': return v < ex.value;
      case '>': return v > ex.value;
      case '<=': return v <= ex.value;
      case '>=': return v >= ex.value;
    }
    return true;
  }

  private advanceAfterArrival(): void {
    if (!this.route) return;
    const wp = this.route.waypoints[this.wpIdx];
    const nextId = wp.next;
    const ni = nextId ? this.route.waypoints.findIndex((w) => w.id === nextId) : -1;
    if (ni >= 0) {
      this.armWaypoint(ni);
    } else if (this.route.loop) {
      this.armWaypoint(0);
    } else {
      const id = this.route.id;
      this.emit({ t: 'route_complete', id });
      this.route = null;
      this.view.active = false;
      this.view.routeId = '';
      this.view.stuckLevel = 0;
    }
  }
}

const BEHIND_NUDGE = 130 * DEG;
