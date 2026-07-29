import * as THREE from 'three';
import stepsJson from '../../content/tutorial/basic_training.json';
import stringsJson from '../../content/tutorial/strings.en.json';
import { isBound } from '../engine/bindings';
import type { Mech } from './mech';
import type { NavGuidanceSystem } from './nav';
import type { Structure, Terrain } from '../world/terrain';
import type { MissionCallbacks, MissionLike, MissionPhase, SalvageEntry } from './mission';

/**
 * BASIC TRAINING — the input-gated controls tutorial (stage 0).
 *
 * This is NOT a mission. Every step names the exact key on screen, detects the
 * action on the input-action bus, and verifies the resulting sim-state change.
 * No objectives-as-fiction, no timers, no failure states; the only exits are
 * ✓, skip-step, or skip-tutorial. Steps are content
 * (content/tutorial/basic_training.json) — this director is generic.
 *
 * State machine per step: ACTIVE → (DETECTING…) → CONFIRMED → [beat] → next.
 * Hint escalation: +8 s chip pulse + one functional VO nudge; +20 s ghost-input
 * demo + the prompt repeated verbatim in the subtitle strip. Nothing punitive.
 */

// ---------- content types ----------

type Pred =
  | { all: Pred[] }
  | { any: Pred[] }
  | { action_held: string }
  | { action_pressed: string }
  | { metric: string; op: '>=' | '<=' | '>' | '<' | '=='; value: number }
  | { flag: string }
  | { checklist_done: boolean };

interface StepDef {
  id: string;
  phase: string;
  prompt_key: string;
  caption_key?: string;
  hud_highlight?: string[];
  listen_actions?: string[];
  success: Pred;
  progress?: { metric: string; max: number };
  checklist?: { label_key: string; pred: Pred }[];
  hints?: { t1_sec?: number; t2_sec?: number };
  confirm_vo?: string;
  hint_vo?: string;
  prompt_vo?: string;
  beat?: number;
  on_enter?: string[];
  on_tick?: string[];
  on_confirm?: string[];
  on_skip?: string[];
  skippable?: boolean;
  conditional?: { feature: string } | null;
}

interface BtContent {
  hint_defaults: { t1_sec: number; t2_sec: number };
  phases: string[];
  steps: StepDef[];
}

const CONTENT = stepsJson as unknown as BtContent;
const STRINGS = stringsJson as unknown as Record<string, string>;

export function btString(key: string): string {
  return STRINGS[key] ?? key;
}

// ---------- runtime interfaces ----------

/** Input-action bus view: steps listen to actions, never raw key codes. */
export interface BtInput {
  held(action: string): boolean;
  pressed(action: string): boolean;
}

export type StepStatus = 'todo' | 'active' | 'done' | 'skipped' | 'auto' | 'jumped';

export interface BtRail {
  phase: string;
  name: string;
  steps: StepStatus[];
}

export interface BtSummary {
  seconds: number;
  hints: number;
  phasesDone: string[];
  /** phases that actually play on this build — feature-gated ones excluded */
  phasesAvailable: string[];
  stepsConfirmed: number;
  stepsSkipped: number;
  durations: Record<string, number>;
  completed: boolean;
}

export type BtEvent =
  | { t: 'step'; step: StepDef; index: number; total: number }
  | { t: 'progress'; frac: number; checks: boolean[] }
  | { t: 'confirm'; step: StepDef }
  | { t: 'hint'; level: 1 | 2; step: StepDef }
  | { t: 'rail'; rail: BtRail[] }
  | { t: 'taught'; actions: string[] }
  | { t: 'powerup' }
  | { t: 'done'; summary: BtSummary };

function logEvent(ev: string, data?: Record<string, unknown>): void {
  try {
    const KEY = 'veyra.telemetry.v1';
    const arr = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown[];
    arr.push({ t: Date.now(), ev, ...data });
    while (arr.length > 500) arr.shift();
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch { /* telemetry is best-effort */ }
}

const AIM_CONE_RAD = THREE.MathUtils.degToRad(4.5);
const GATE_RADIUS = 14;

export class BasicTrainingMission implements MissionLike {
  readonly id = 'bt';
  readonly title = 'BASIC TRAINING';
  phase: MissionPhase = 'train';
  bootTimer = 0;
  salvageReport: SalvageEntry[] = [];
  extractPoint = new THREE.Vector3();
  timeLeft: number | null = null;

  private steps = CONTENT.steps;
  private idx = -1;
  private state: 'active' | 'confirmed' | 'finished' = 'active';
  private stepTime = 0;
  private beatTime = 0;
  private totalTime = 0;
  private hintsUsed = 0;
  private hint1Fired = false;
  private hint2Fired = false;
  private status: StepStatus[] = [];
  private taught: string[] = [];
  private listeners: ((ev: BtEvent) => void)[] = [];
  private features: Record<string, boolean>;

  // per-step counters/flags (reset on step entry)
  private m: Record<string, number> = {};
  private flags = new Set<string>();
  private prevLegYaw = 0;
  private prevShutdown = false;
  private lastAirborne = -99;
  private barrierSide = -1;
  private barrierPendingLand = false;
  private heatAtFlush = -1;
  private checkrideOn = false;
  private contacts: Mech[] = [];
  private drones: Mech[] = [];
  private boardPrevHp = new Map<string, number>();
  private summaryOut: BtSummary | null = null;
  private durations: Record<string, number> = {};

  constructor(
    private player: Mech,
    private terrain: Terrain,
    private cb: MissionCallbacks,
    private io: BtInput,
    private startPhase: string | null = null,
    private nav: NavGuidanceSystem | null = null,
  ) {
    this.features = { jump_jets: !!player.def.jumpJets, squad: false };
    this.status = this.steps.map(() => 'todo');
  }

  onEvent(fn: (ev: BtEvent) => void): void {
    this.listeners.push(fn);
  }

  private emit(ev: BtEvent): void {
    for (const fn of this.listeners) fn(ev);
  }

  get summary(): BtSummary | null {
    return this.summaryOut;
  }

  get currentStepId(): string | null {
    return this.steps[this.idx]?.id ?? null;
  }

  /** The skip-gauge only means something on an active, skippable step. */
  get canSkipNow(): boolean {
    return this.state === 'active' && this.steps[this.idx]?.skippable !== false;
  }

  /** Phases that actually play on this build (feature-gated ones excluded). */
  get phasesAvailable(): string[] {
    return CONTENT.phases.filter((p) =>
      this.steps.some((s) => s.phase === p && (!s.conditional || this.features[s.conditional.feature])));
  }

  // ---------- mission lifecycle ----------

  start(): void {
    logEvent('bt_start', { phase: this.startPhase ?? 'A' });
    this.phase = 'train';
    this.cb.onPhase('train');
    this.player.invulnerable = true;
    this.player.bootLocked = true; // cold cockpit until A0's ui_confirm

    // all range furniture spawns up front so skipping a step never starves a later one
    this.contacts = this.cb.spawnEnemies([
      { def: 'pumice', pos: [-260, -180], dormant: true, name: 'Contact A' },
      { def: 'halite', pos: [60, -320], dormant: true, name: 'Contact B' },
      { def: 'gabbro', pos: [280, -110], dormant: true, name: 'Contact C' },
    ]);
    for (const c of this.contacts) c.invulnerable = true; // calibration targets, not salvage

    // boards are inert scenery until D4 arms them
    for (const s of this.boards()) {
      s.hp = 99999;
      s.hpMax = 99999;
      this.boardPrevHp.set(s.id, s.hp);
    }
    const aim = this.aimBoard();
    if (aim) { aim.hp = 999999; aim.hpMax = 999999; }

    // phase quick-jump: earlier steps are pre-passed, cockpit already powered
    let startIdx = 0;
    if (this.startPhase && CONTENT.phases.includes(this.startPhase)) {
      startIdx = this.steps.findIndex((s) => s.phase === this.startPhase);
      if (startIdx < 0) startIdx = 0;
      if (startIdx > 0) {
        // pre-passed, not confirmed: 'jumped' never counts toward the summary,
        // saved phases, or the rail's ✓ ticks — the pilot didn't play them
        for (let i = 0; i < startIdx; i++) this.status[i] = 'jumped';
        this.player.bootLocked = false; // already powered; no intro sequence
        for (let i = 0; i < startIdx; i++) {
          for (const a of this.steps[i].listen_actions ?? []) {
            if (!this.taught.includes(a)) this.taught.push(a);
          }
        }
        this.emit({ t: 'taught', actions: [...this.taught] });
      }
    }
    this.idx = startIdx - 1;
    this.advance('start');
  }

  /** Esc menu open: freezes step time, hints, detection, and beats. */
  paused = false;

  update(dt: number): void {
    if (this.state === 'finished' || this.paused) return;
    this.totalTime += dt;
    const st = this.steps[this.idx];
    if (!st) return;

    // standing training safeties: infinite ammo, coolant never strands a drill
    for (const w of this.player.weapons) if (w.ammo >= 0) w.ammo = w.def.ammo;

    this.computeMetrics(dt, st);
    for (const op of st.on_tick ?? []) this.runOp(op);

    if (this.state === 'confirmed') {
      this.beatTime += dt;
      if (this.beatTime >= (st.beat ?? 0.7)) this.advance('confirm');
      return;
    }

    this.stepTime += dt;
    this.emitProgress(st);

    if (this.evalPred(st.success, st)) {
      this.confirmStep(st);
      return;
    }

    // hint escalation — never punitive, never a third level
    const t1 = st.hints?.t1_sec ?? CONTENT.hint_defaults.t1_sec;
    const t2 = Math.max(st.hints?.t2_sec ?? CONTENT.hint_defaults.t2_sec, t1 + 6);
    if (!this.hint1Fired && this.stepTime > t1) {
      this.hint1Fired = true;
      this.hintsUsed++;
      logEvent('bt_hint', { id: st.id, level: 1 });
      this.emit({ t: 'hint', level: 1, step: st });
      if (st.hint_vo) this.playVO(st.hint_vo, `tut.bt.${this.shortId(st)}.hint1`);
    }
    if (!this.hint2Fired && this.stepTime > t2) {
      this.hint2Fired = true;
      this.hintsUsed++;
      logEvent('bt_hint', { id: st.id, level: 2 });
      this.emit({ t: 'hint', level: 2, step: st });
    }
  }

  // ---------- engine signals (wired in main.ts) ----------

  notify(kind: string, data?: unknown): void {
    if (this.state === 'finished') return;
    switch (kind) {
      case 'target': {
        const d = data as { mech: Mech; via: 'reticle' | 'cycle' };
        if (d.via === 'reticle') this.m.locks_reticle = (this.m.locks_reticle ?? 0) + 1;
        else this.addDistinct('cycle_ids', d.mech.id, 'locks_cycle_distinct');
        break;
      }
      case 'subtarget':
        this.m.subtarget_cycles = (this.m.subtarget_cycles ?? 0) + 1;
        break;
      case 'fire': {
        const g = data as number;
        if (g >= 1 && g <= 6) this.m[`fired_g${g}`] = (this.m[`fired_g${g}`] ?? 0) + 1;
        break;
      }
      case 'flush':
        this.flags.add('flush_used');
        this.heatAtFlush = this.player.heat;
        break;
      case 'skip':
        this.skipStep();
        break;
      case 'skip_all':
        this.skipAll();
        break;
    }
  }

  notifyEnemyKilled(m: Mech): void {
    void m; // quiet pad: no salvage ledger, no kill VO — the checklist pip is the feedback
  }

  objectivePoint(): THREE.Vector3 | null {
    const st = this.steps[this.idx];
    if (!st || this.state !== 'active') return null;
    const pad = this.terrain.pad;
    switch (st.id) {
      case 'bt_a5': {
        const g = pad?.gates[Math.min(this.m.gates_passed ?? 0, (pad?.gates.length ?? 1) - 1)];
        return g ? new THREE.Vector3(g[0], 0, g[1]) : null;
      }
      case 'bt_b2': case 'bt_b4': {
        const p = this.aimBoardCenter();
        return p ? p.setY(0) : null;
      }
      case 'bt_d1': case 'bt_d4': {
        const b = this.boards().find((s) => !s.destroyed);
        return b ? b.group.position.clone().setY(0) : null;
      }
      case 'bt_f1':
        return pad ? new THREE.Vector3(pad.barrier.x, 0, pad.barrier.z) : null;
      case 'bt_h1': {
        const d = this.drones.find((dr) => dr.alive && !dr.bootLocked);
        return d ? d.pos.clone().setY(0) : null;
      }
      default:
        return null;
    }
  }

  // ---------- step machine ----------

  private shortId(st: StepDef): string {
    return st.id.replace(/^bt_/, '');
  }

  private confirmStep(st: StepDef): void {
    this.state = 'confirmed';
    this.beatTime = 0;
    this.status[this.idx] = 'done';
    this.durations[st.id] = Math.round(this.stepTime * 10) / 10;
    logEvent('bt_step_confirm', { id: st.id, seconds: Math.round(this.stepTime) });
    for (const a of st.listen_actions ?? []) {
      if (!this.taught.includes(a)) this.taught.push(a);
    }
    for (const op of st.on_confirm ?? []) this.runOp(op);
    this.emit({ t: 'confirm', step: st });
    this.emit({ t: 'taught', actions: [...this.taught] });
    this.emit({ t: 'rail', rail: this.rail() });
    if (st.confirm_vo) this.playVO(st.confirm_vo, `tut.bt.${this.shortId(st)}.ok`);
  }

  private skipStep(): void {
    const st = this.steps[this.idx];
    if (!st || this.state !== 'active' || st.skippable === false) return;
    this.status[this.idx] = 'skipped';
    logEvent('bt_step_skip', { id: st.id });
    for (const op of st.on_skip ?? []) this.runOp(op);
    this.advance('skip');
  }

  /** Esc-menu skip: sets the same flags a completion would. Never nags. */
  skipAll(): void {
    if (this.state === 'finished') return;
    for (let i = this.idx; i < this.steps.length; i++) {
      if (this.status[i] === 'todo' || this.status[i] === 'active') this.status[i] = 'skipped';
    }
    this.safetiesOn();
    this.finish(false);
  }

  private advance(via: 'start' | 'confirm' | 'skip'): void {
    this.cb.onHint?.('');
    this.idx++;
    // conditional steps auto-skip with a rail tick — no VO, no nag
    while (this.idx < this.steps.length) {
      const st = this.steps[this.idx];
      const cond = st.conditional;
      if (cond && !this.features[cond.feature]) {
        this.status[this.idx] = 'auto';
        logEvent('bt_step_auto_skip', { id: st.id, feature: cond.feature });
        this.idx++;
        continue;
      }
      break;
    }
    if (this.idx >= this.steps.length) {
      this.finish(true);
      return;
    }
    // no content edit may ever strand a cold cockpit past A0 — power up on
    // entry to any later step regardless of how A0 was exited
    if (this.idx > 0 && this.player.bootLocked) this.runOp('power_up');
    const st = this.steps[this.idx];
    this.state = 'active';
    this.stepTime = 0;
    this.hint1Fired = false;
    this.hint2Fired = false;
    this.resetStepCounters();
    this.status[this.idx] = 'active';
    logEvent('bt_step_start', { id: st.id });
    // every step voices its own arrival — spoken text avoids key names (they
    // are rebindable), the HUD prompt shows the actual glyphs. Arrivals via
    // 'confirm' wait for the previous step's ok line to clear; the stale-step
    // guard drops the read if the pilot has already finished the step.
    if (st.prompt_vo) {
      const voId = st.prompt_vo;
      setTimeout(() => {
        if (this.steps[this.idx] === st && this.state === 'active') {
          this.playVO(voId, `tut.bt.${this.shortId(st)}.prompt_vo`);
        }
      }, via === 'confirm' ? 1500 : 300);
    }
    for (const op of st.on_enter ?? []) this.runOp(op);
    this.cb.onObjective(btString('tut.bt.title'), `PHASE ${st.phase} — ${btString(`tut.bt.phase.${st.phase}`)}`);
    this.emit({ t: 'step', step: st, index: this.idx, total: this.steps.length });
    this.emit({ t: 'rail', rail: this.rail() });
  }

  private finish(completed: boolean): void {
    if (this.state === 'finished') return;
    this.state = 'finished';
    this.safetiesOn();
    this.nav?.stopRoute(); // teardown: no orphaned beacon or chevrons survive
    const phasesDone = CONTENT.phases.filter((p) => {
      const ph = this.steps.map((s, i) => ({ s, i })).filter((x) => x.s.phase === p);
      return ph.length > 0 && ph.every((x) => this.status[x.i] === 'done');
    });
    this.summaryOut = {
      seconds: Math.round(this.totalTime),
      hints: this.hintsUsed,
      phasesDone,
      phasesAvailable: this.phasesAvailable,
      stepsConfirmed: this.status.filter((s) => s === 'done').length,
      stepsSkipped: this.status.filter((s) => s === 'skipped').length,
      durations: this.durations,
      completed,
    };
    logEvent('bt_complete', { duration: this.summaryOut.seconds, hints_total: this.hintsUsed, completed });
    this.emit({ t: 'done', summary: this.summaryOut });
    this.phase = 'complete';
    this.cb.onPhase('complete');
  }

  private safetiesOn(): void {
    this.player.invulnerable = true;
    this.player.ghostHits = false;
    this.player.noKill = false;
    this.cb.setHeatMult?.(1);
    for (const d of this.drones) if (d.alive) d.bootLocked = true;
  }

  rail(): BtRail[] {
    return CONTENT.phases.map((p) => ({
      phase: p,
      name: btString(`tut.bt.phase.${p}`),
      steps: this.steps.map((s, i) => ({ s, i })).filter((x) => x.s.phase === p).map((x) => this.status[x.i]),
    }));
  }

  private playVO(voId: string, textKey: string): void {
    this.cb.onVO({ id: voId, speaker: 'CAIRN', text: btString(textKey), futz: false, audioId: `vo.bt.${voId}` });
  }

  // ---------- ops (named hooks the content can invoke) ----------

  private runOp(op: string): void {
    switch (op) {
      case 'power_up':
        this.player.bootLocked = false;
        this.emit({ t: 'powerup' });
        break;
      case 'boards_arm': {
        for (const s of this.boards()) {
          if (!s.destroyed) { s.hp = 30; s.hpMax = 30; }
          this.boardPrevHp.set(s.id, s.hp);
        }
        break;
      }
      case 'heat_drill_on':
        this.cb.setHeatMult?.(0.25); // throttle dissipation so the drill reads in seconds, not minutes
        break;
      case 'heat_drill_off':
        this.cb.setHeatMult?.(1);
        // post-drill coolant top-up so the next step doesn't start under a klaxon;
        // also clears any drill shutdown (heat is now well under the restart gate)
        this.player.heat = Math.min(this.player.heat, 40);
        if (this.player.shutdown) {
          this.player.shutdown = false;
          this.player.shutdownTimer = 0;
        }
        break;
      case 'coolant_arm':
        if (this.player.coolantFlushes < 1 && this.player.coolantActive <= 0) this.player.coolantFlushes = 1;
        break;
      case 'extend_shutdown':
        // widen the E4 window: the countdown holds long enough to teach the override
        if (this.player.shutdown) this.player.shutdownTimer = Math.max(this.player.shutdownTimer, 6);
        break;
      case 'ensure_shutdown_window':
        // E4 self-heals: if the reactor came back without the override, trip the
        // shutdown again directly — going through the heat path would let a
        // pre-held override key prevent it forever (scripted-safe drill)
        if (!this.player.shutdown && !this.flags.has('override_restart') && this.stepTime > 1.5) {
          this.player.heat = Math.max(this.player.heat, this.player.heatCap * 0.95);
          this.player.shutdown = true;
          this.player.shutdownTimer = 6;
          this.player.throttle = 0;
          this.player.onEvent?.(this.player, { type: 'crit', zone: 'ct', weaponName: '__shutdown__' });
          this.prevShutdown = true; // a same-tick O-hold restart still counts as override
        }
        break;
      case 'checkride_start': {
        this.checkrideOn = true;
        // training safeties stay on for the whole tutorial — the checkride is
        // live fire outbound only. Drone shots register (flash, shake, impact
        // audio) through ghostHits but cost no armor, no structure, no crits.
        this.player.invulnerable = true;
        this.player.ghostHits = true;
        this.player.noKill = false;
        this.drones = this.cb.spawnEnemies([
          { def: 'flint', pos: [-165, -175], alerted: true, name: 'Practice Drone' },
          { def: 'flint', pos: [-140, -190], alerted: true, name: 'Practice Drone' },
          { def: 'flint', pos: [-150, -155], alerted: true, name: 'Practice Drone' },
        ]);
        // practice drones, not combat machines: slow movers with thin skins so
        // the checkride is a victory lap, not a fight (their shots stay harmless
        // to the player through the noKill fuse either way)
        for (const d of this.drones) {
          d.speedScale = 0.35;
          for (const z of Object.values(d.zones)) {
            z.armor = Math.round(z.armorMax * 0.35);
            z.structure = Math.round(z.structureMax * 0.6);
          }
        }
        break;
      }
      // ---- PATHLIGHT route ops: each nav step arms its own leg, so phase
      // quick-jumps and skips can never strand a route (idempotent by design;
      // re-arming the active route is a no-op in the nav system) ----
      case 'nav_p1':
        this.nav?.startRoute('route_bt_teach');
        break;
      case 'nav_gates':
        this.nav?.startRoute('route_bt_gates');
        break;
      case 'nav_b4':
        this.nav?.startRoute('route_bt_decouple');
        break;
      case 'nav_f1':
        this.nav?.startRoute('route_bt_boost');
        break;
      case 'nav_off':
        this.nav?.stopRoute();
        break;
      case 'checkride_end': {
        this.checkrideOn = false;
        this.safetiesOn();
        // backstop: the safeties should have left nothing to fix, but the pad
        // crew signs the machine off whole either way — nothing from the range
        // is allowed to follow the pilot out of training
        for (const z of Object.values(this.player.zones)) {
          if (!z.destroyed) { z.armor = z.armorMax; z.structure = z.structureMax; }
        }
        for (const w of this.player.weapons) w.destroyed = false;
        break;
      }
    }
  }

  // ---------- metrics engine ----------

  private resetStepCounters(): void {
    this.m = {};
    this.flags.clear();
    this.prevLegYaw = this.player.legYaw;
    this.prevShutdown = this.player.shutdown;
    this.heatAtFlush = -1;
    this.barrierSide = Math.sign(this.player.pos.x - (this.terrain.pad?.barrier.x ?? 0)) || -1;
    this.barrierPendingLand = false;
  }

  private addDistinct(setKey: string, id: number, countKey: string): void {
    const key = `__set_${setKey}_${id}`;
    if (!this.flags.has(key)) {
      this.flags.add(key);
      this.m[countKey] = (this.m[countKey] ?? 0) + 1;
    }
  }

  private boards(): Structure[] {
    return this.terrain.structures.filter((s) => s.id.startsWith('board_'));
  }

  private aimBoard(): Structure | undefined {
    return this.terrain.structures.find((s) => s.id === 'bt_aim');
  }

  private aimBoardCenter(): THREE.Vector3 | null {
    const b = this.aimBoard();
    return b ? b.group.position.clone().add(new THREE.Vector3(0, 9, 0)) : null;
  }

  private computeMetrics(dt: number, st: StepDef): void {
    const p = this.player;
    this.m.throttle_pct = p.throttle * 100;
    this.m.throttle_abs_pct = Math.abs(p.throttle) * 100;
    this.m.speed_abs = Math.abs(p.speed);
    this.m.heat_pct = (p.heat / p.heatCap) * 100;

    // reverse distance
    if (p.speed < -0.3) this.m.reverse_m = (this.m.reverse_m ?? 0) + (-p.speed) * dt;

    // cumulative leg yaw, split by direction (+yaw = left in this sim)
    let dYaw = p.legYaw - this.prevLegYaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    this.prevLegYaw = p.legYaw;
    const dDeg = THREE.MathUtils.radToDeg(dYaw);
    if (dDeg > 0) this.m.yaw_left_deg = (this.m.yaw_left_deg ?? 0) + dDeg;
    else this.m.yaw_right_deg = (this.m.yaw_right_deg ?? 0) - dDeg;

    // torso peaks
    const tDeg = THREE.MathUtils.radToDeg(p.torsoYaw);
    this.m.torso_left_deg = Math.max(this.m.torso_left_deg ?? 0, tDeg);
    this.m.torso_right_deg = Math.max(this.m.torso_right_deg ?? 0, -tDeg);

    // gates (sequential, any input path)
    const pad = this.terrain.pad;
    if (pad && st.id === 'bt_a5') {
      const next = pad.gates[this.m.gates_passed ?? 0];
      if (next && Math.hypot(p.pos.x - next[0], p.pos.z - next[1]) < GATE_RADIUS) {
        this.m.gates_passed = (this.m.gates_passed ?? 0) + 1;
      }
    }

    // full stop: X zeroes throttle in the same step — verify the effect, not the press
    if (this.io.pressed('full_stop') && Math.abs(p.throttle) < 0.01) this.flags.add('full_stop_ok');

    // torso recenter by key
    if (this.io.pressed('center_torso') && Math.abs(THREE.MathUtils.radToDeg(p.torsoYaw)) < 2) {
      this.flags.add('centered_by_key');
    }

    // reticle-on-board time (B2 stationary drill, B4 moving drill)
    const boardC = this.aimBoardCenter();
    if (boardC) {
      const eye = p.pos.clone().add(new THREE.Vector3(0, 7, 0));
      const to = boardC.sub(eye);
      if (to.length() < 500 && p.aimDir(new THREE.Vector3()).angleTo(to) < AIM_CONE_RAD) {
        this.m.aim_board_s = (this.m.aim_board_s ?? 0) + dt;
        if (Math.abs(p.speed) > 3) this.m.aim_board_move_s = (this.m.aim_board_move_s ?? 0) + dt;
      }
    }

    // zoom hold
    if (this.io.held('zoom')) this.m.zoom_s = (this.m.zoom_s ?? 0) + dt;

    // heat drill flags
    if (this.flags.has('flush_used') && this.heatAtFlush >= 0) {
      this.m.flush_drop = Math.max(this.m.flush_drop ?? 0, this.heatAtFlush - p.heat);
    }
    if (p.shutdown && !this.prevShutdown) this.flags.add('shutdown_event');
    if (p.shutdown) {
      this.flags.add('shutdown_event'); // entering the step already shut down still counts
      if (p.overrideHeld) this.m.override_held_s = (this.m.override_held_s ?? 0) + dt;
    }
    if (!p.shutdown && this.prevShutdown && p.overrideHeld) this.flags.add('override_restart');
    this.prevShutdown = p.shutdown;

    // board hits + destruction (the aim board the player just trained on counts too)
    const aimB = this.aimBoard();
    for (const s of aimB ? [...this.boards(), aimB] : this.boards()) {
      const prev = this.boardPrevHp.get(s.id) ?? s.hp;
      if (s.hp < prev) this.flags.add('board_hit');
      this.boardPrevHp.set(s.id, s.hp);
    }
    this.m.boards_down = this.boards().filter((s) => s.destroyed).length;

    // barrier crossing with boost (F1): airborne over the line, upright landing
    if (!p.grounded) this.lastAirborne = this.totalTime;
    if (pad && st.id === 'bt_f1') {
      const b = pad.barrier;
      const side = Math.sign(p.pos.x - b.x) || this.barrierSide;
      const inLane = Math.abs(p.pos.z - b.z) < b.halfW;
      if (inLane && side !== this.barrierSide && this.totalTime - this.lastAirborne < 0.5) {
        this.barrierPendingLand = true;
      }
      this.barrierSide = side;
      if (this.barrierPendingLand && p.grounded && p.alive && !p.shutdown) this.flags.add('barrier_cleared');
    }

    // checkride
    if (this.checkrideOn) this.m.drones_down = this.drones.filter((d) => !d.alive).length;

    // PATHLIGHT waypoint arrivals surface as flags (predicates stay data)
    if (this.nav) {
      if (this.nav.hasArrived('p1')) this.flags.add('nav_p1_reached');
      if (this.nav.hasArrived('p5')) this.flags.add('nav_p5_reached');
      if (this.nav.hasArrived('p6')) this.flags.add('nav_p6_reached');
    }
  }

  private evalPred(pred: Pred, st: StepDef): boolean {
    if ('all' in pred) return pred.all.every((x) => this.evalPred(x, st));
    if ('any' in pred) return pred.any.some((x) => this.evalPred(x, st));
    if ('action_held' in pred) return this.io.held(pred.action_held);
    if ('action_pressed' in pred) return this.io.pressed(pred.action_pressed);
    if ('flag' in pred) return this.flags.has(pred.flag);
    if ('checklist_done' in pred) return (st.checklist ?? []).every((c) => this.evalPred(c.pred, st));
    if ('metric' in pred) {
      const v = this.m[pred.metric] ?? 0;
      switch (pred.op) {
        case '>=': return v >= pred.value;
        case '<=': return v <= pred.value;
        case '>': return v > pred.value;
        case '<': return v < pred.value;
        case '==': return v === pred.value;
      }
    }
    return false;
  }

  private emitProgress(st: StepDef): void {
    let frac = 0;
    if (st.progress) {
      frac = THREE.MathUtils.clamp((this.m[st.progress.metric] ?? 0) / st.progress.max, 0, 1);
    }
    const checks = (st.checklist ?? []).map((c) => this.evalPred(c.pred, st));
    this.emit({ t: 'progress', frac, checks });
  }

  /** A step whose prompt names an unbound action renders the amber UNBOUND chip and stays skippable. */
  stepHasUnboundAction(st: StepDef): boolean {
    return (st.listen_actions ?? []).some((a) => !isBound(a));
  }
}
