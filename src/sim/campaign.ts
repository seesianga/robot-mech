import * as THREE from 'three';
import type { Mech } from './mech';
import type { MapId, Terrain, StructureSpec } from '../world/terrain';
import { BaseMission, type EnemySpawn, type MissionCallbacks } from './mission';

/**
 * Data-driven campaign runtime for stages 4–24. Each stage is a JSON config in
 * content/campaign/ (layout: steps, spawns, structures) paired with its design
 * document in content/missions/ (narrative: VO trigger lines, briefing text).
 * Schema: docs/campaign-runtime-schema.md.
 */

// ---------- config types (mirror the schema doc) ----------

export interface AllyCfg {
  callsign: string;
  def: string;
  pos: [number, number];
}

export interface StepCfg {
  kind: 'reach' | 'destroy' | 'defend' | 'hold' | 'survive' | 'escort' | 'duel' | 'extract';
  title?: string;
  sub?: string;
  vo?: string;
  doneVO?: string;
  spawns?: EnemySpawn[];
  // reach / hold
  at?: [number, number];
  radius?: number;
  // destroy
  targets?: string[];
  killAll?: boolean;
  perTargetVO?: Record<string, string>;
  // defend / hold / survive
  protect?: string;
  seconds?: number;
  waves?: EnemySpawn[][];
  waveGap?: number;
  // escort
  subject?: string;
  subjectDef?: string;
  from?: [number, number];
  route?: [number, number][];
  ambushes?: { atLeg: number; spawns: EnemySpawn[] }[];
  // duel
  spawn?: EnemySpawn;
  woundVO?: { frac: number; trigger: string }[];
}

export interface CampaignConfig {
  id: string;
  designFile: string;
  stage: number;
  branch?: 'a' | 'b';
  title: string;
  map: MapId;
  spawn: { x: number; z: number; yaw: number };
  playerMech: string;
  heatMult?: number;
  extract: [number, number];
  allies?: AllyCfg[];
  structures?: StructureSpec[];
  artillery?: { fromStep: number; everySec: number; damage: number; radius: number };
  timedVO?: { atSec: number; trigger: string }[];
  /** CAIRN status calls as the PLAYER's remaining hull fraction drops below each frac */
  playerWoundVO?: { frac: number; trigger: string }[];
  steps: StepCfg[];
}

export interface DesignVOTrigger {
  trigger: string;
  speaker: string;
  line: string;
  futz: boolean;
}

export interface DesignDoc {
  id: string;
  index: number;
  op: number;
  opName: string;
  name: string;
  briefing: { speaker: string; text: string };
  voTriggers: DesignVOTrigger[];
}

export interface CampaignEntry {
  cfg: CampaignConfig;
  design: DesignDoc;
}

// ---------- content loading (bundled at build time) ----------

const cfgModules = import.meta.glob('../../content/campaign/*.json', { eager: true }) as Record<string, { default: CampaignConfig }>;
const designModules = import.meta.glob('../../content/missions/*.json', { eager: true }) as Record<string, { default: DesignDoc }>;

const designsByFile: Record<string, DesignDoc> = {};
for (const [p, m] of Object.entries(designModules)) {
  const base = p.split('/').pop()!.replace('.json', '');
  designsByFile[base] = m.default;
}

/** Every campaign entry keyed by config id ('m04' … 'm21a', 'm21b', … 'm24'). */
export const CAMPAIGN: Record<string, CampaignEntry> = {};
for (const m of Object.values(cfgModules)) {
  const cfg = m.default;
  const design = designsByFile[cfg.designFile];
  if (design) CAMPAIGN[cfg.id] = { cfg, design };
}

export function campaignForStage(stage: number, branch: 'a' | 'b'): CampaignEntry | null {
  if (stage === 21) return CAMPAIGN[`m21${branch}`] ?? CAMPAIGN['m21a'] ?? null;
  const key = `m${String(stage).padStart(2, '0')}`;
  return CAMPAIGN[key] ?? null;
}

/** The full campaign ladder. Stage 21 appears twice (branch a and b). */
export const MAX_STAGE = 24;

export interface StageListEntry {
  stage: number;
  name: string;
  op: number;
  opName: string;
  branch?: 'a' | 'b';
}

export function stageList(): StageListEntry[] {
  const out: StageListEntry[] = [
    { stage: 1, name: 'COLD IGNITION', op: 1, opName: 'Breaker Coast' },
    { stage: 2, name: 'TIDE TABLES', op: 1, opName: 'Breaker Coast' },
    { stage: 3, name: 'LOUD EXIT', op: 1, opName: 'Breaker Coast' },
  ];
  const entries = Object.values(CAMPAIGN)
    .sort((a, b) => a.cfg.stage - b.cfg.stage || (a.cfg.branch ?? '').localeCompare(b.cfg.branch ?? ''));
  for (const e of entries) {
    out.push({
      stage: e.cfg.stage,
      name: e.cfg.title,
      op: e.design.op,
      opName: e.design.opName,
      ...(e.cfg.branch ? { branch: e.cfg.branch } : {}),
    });
  }
  return out;
}

/** deterministic audio-manifest key for a design VO trigger */
export function voAudioId(missionId: string, trigger: string): string {
  return `vo.camp.${missionId}.${trigger.replace(/[^a-z0-9]+/gi, '_')}`;
}

export function briefingAudioId(missionId: string): string {
  return `vo.camp.${missionId}.briefing`;
}

// ---------- engine hooks provided by main.ts ----------

export interface AllySpawnReq {
  callsign: string;
  def: string;
  pos: [number, number];
  /** walk this route once then stand (escort subjects); omit to follow the player */
  route?: [number, number][];
  /** never fights (escort crawler) */
  passive?: boolean;
}

export interface CampaignHooks {
  spawnAllies(reqs: AllySpawnReq[]): Mech[];
  addStructure(spec: StructureSpec): void;
  /** artillery impact: explosion VFX + splash damage to the player if inside radius */
  barrage(x: number, z: number, radius: number, damage: number): void;
  /** the pilot's chosen M21 branch (defaults 'a') — drives the M24 ending */
  branch(): 'a' | 'b';
}

// ---------- the generic campaign mission ----------

interface StepState {
  started: boolean;
  done: boolean;
  mechs: Mech[];          // everything this step spawned
  wavesSpawned: number;
  waveClock: number;
  heldOrElapsed: number;  // hold: time-in-circle; defend/survive: elapsed
  escortMech: Mech | null;
  escortLeg: number;
  duelVOFired: Set<number>;
  perTargetFired: Set<string>;
}

const STRUCT_GRIND_RANGE = 160;
const STRUCT_GRIND_DPS = 8;        // per hostile, player absent — they wreck it fast
const STRUCT_GRIND_DPS_HELD = 2.5; // player contesting the perimeter — suppressed fire

export class CampaignMission extends BaseMission {
  readonly id: string;
  readonly title: string;
  timeLeft: number | null = null;
  timerLabel = 'HOLD';

  private stepIndex = -1;
  private st: StepState[] = [];
  private clock = 0;               // mission clock from afterBoot
  private timedFired = new Set<number>();
  private artilleryClock = 0;
  private artilleryWarned = false;
  private posHistory: { x: number; z: number }[] = [];
  private posSampleAcc = 0;

  constructor(
    player: Mech,
    terrain: Terrain,
    cb: MissionCallbacks,
    private hooks: CampaignHooks,
    private entry: CampaignEntry,
  ) {
    super(player, terrain, cb);
    this.id = entry.cfg.id;
    this.title = entry.cfg.title;
    this.st = entry.cfg.steps.map(() => ({
      started: false, done: false, mechs: [], wavesSpawned: 0, waveClock: 0,
      heldOrElapsed: 0, escortMech: null, escortLeg: 0,
      duelVOFired: new Set(), perTargetFired: new Set(),
    }));
  }

  // --- VO plumbing: design triggers → cue with pre-generated audio id ---

  private trig(trigger: string | undefined): DesignVOTrigger | null {
    if (!trigger) return null;
    return this.entry.design.voTriggers.find((t) => t.trigger === trigger) ?? null;
  }

  private playTrigger(trigger: string | undefined): void {
    const t = this.trig(trigger);
    if (!t) return;
    this.vo(t.trigger, t.speaker, t.line, t.futz, voAudioId(this.entry.cfg.id, t.trigger));
  }

  // --- lifecycle ---

  protected onStart(): void {
    const cfg = this.entry.cfg;
    this.setExtract(...cfg.extract);
    this.cb.setHeatMult?.(cfg.heatMult ?? 1); // biome thermal regime (salt 0.8× … storm 1.15×)
    for (const s of cfg.structures ?? []) this.hooks.addStructure(s);
    if (cfg.allies?.length) {
      this.hooks.spawnAllies(cfg.allies.map((a) => ({ callsign: a.callsign, def: a.def, pos: a.pos })));
    }
  }

  protected afterBoot(): void {
    this.beginStep(0);
  }

  /** 0-based active step (test/diagnostics; -1 during boot) */
  get currentStep(): number {
    return this.stepIndex;
  }

  private step(): StepCfg | null {
    return this.entry.cfg.steps[this.stepIndex] ?? null;
  }

  private state(): StepState {
    return this.st[this.stepIndex];
  }

  private beginStep(i: number): void {
    const cfg = this.entry.cfg;
    if (i >= cfg.steps.length) return;
    this.stepIndex = i;
    const s = cfg.steps[i];
    const ss = this.st[i];
    ss.started = true;
    this.timeLeft = null;

    const defaults: Record<StepCfg['kind'], [string, string]> = {
      reach: ['MOVE OUT', 'Follow the marker.'],
      destroy: ['DESTROY THE TARGETS', 'Put them down.'],
      defend: ['DEFEND THE POSITION', 'Nothing gets through.'],
      hold: ['HOLD THE GROUND', 'Stay inside the marked zone.'],
      survive: ['SURVIVE', 'Weather the assault.'],
      escort: ['ESCORT', 'Keep the convoy alive.'],
      duel: ['SINGLE COMBAT', 'One machine each.'],
      extract: ['REACH THE EXTRACTION LINE', 'Follow the amber marker home.'],
    };
    const [dt2, ds] = defaults[s.kind];
    this.setPhase(s.kind === 'extract' ? 'extract' : 'sweep', s.title ?? dt2, s.sub ?? ds);
    this.playTrigger(s.vo);

    if (s.spawns?.length) this.spawnInto(ss, s.spawns);

    switch (s.kind) {
      case 'defend':
      case 'survive':
        this.timeLeft = s.seconds ?? 90;
        this.timerLabel = s.kind === 'defend' ? 'DEFEND' : 'SURVIVE';
        if (s.waves?.length) { this.spawnWave(ss, s.waves[0]); ss.wavesSpawned = 1; ss.waveClock = 0; }
        break;
      case 'hold':
        this.timeLeft = s.seconds ?? 60;
        this.timerLabel = 'HOLD';
        if (s.waves?.length) { this.spawnWave(ss, s.waves[0]); ss.wavesSpawned = 1; }
        break;
      case 'escort': {
        const subject = this.hooks.spawnAllies([{
          callsign: s.subject ?? 'Convoy Crawler',
          def: s.subjectDef ?? 'halite',
          pos: s.from ?? [this.player.pos.x + 30, this.player.pos.z + 30],
          route: s.route,
          passive: true,
        }]);
        ss.escortMech = subject[0] ?? null;
        break;
      }
      case 'duel':
        if (s.spawn) this.spawnInto(ss, [{ ...s.spawn, alerted: true }]);
        break;
    }
  }

  private spawnInto(ss: StepState, spawns: EnemySpawn[]): void {
    const created = this.cb.spawnEnemies(spawns);
    ss.mechs.push(...created);
    this.enemies.push(...created);
  }

  private spawnWave(ss: StepState, wave: EnemySpawn[]): void {
    this.spawnInto(ss, wave.map((w) => ({ ...w, alerted: true })));
  }

  private completeStep(): void {
    const s = this.step()!;
    const ss = this.state();
    ss.done = true;
    this.timeLeft = null;

    if (s.kind === 'extract') {
      // m24 branch endings: the design carries on_complete_branch_a/b instead of on_complete
      const branchTrig = this.trig(`on_complete_branch_${this.hooks.branch()}`);
      if (s.doneVO || !branchTrig) this.playTrigger(s.doneVO ?? 'on_complete');
      else this.playTrigger(branchTrig.trigger);
      this.setPhase('complete', 'MISSION COMPLETE', `${this.title} — objectives met.`);
      return;
    }

    this.playTrigger(s.doneVO);
    this.beginStep(this.stepIndex + 1);
  }

  private fail(title: string, sub: string): void {
    this.timeLeft = null;
    this.setPhase('failed', title, sub);
  }

  // --- per-frame ---

  update(dt: number): void {
    if (this.phase !== 'failed' && this.phase !== 'complete' && !this.player.alive) {
      this.fail('MISSION FAILED', 'The mech is down.');
      return;
    }
    switch (this.phase) {
      case 'boot': {
        this.bootTimer += dt;
        if (this.bootTimer > 13) {
          this.player.bootLocked = false;
          this.afterBoot();
        }
        break;
      }
      case 'complete':
      case 'failed':
        break;
      default:
        this.tickCampaign(dt);
    }
  }

  private tickCampaign(dt: number): void {
    this.clock += dt;
    this.tickTimedVO();
    this.tickArtillery(dt);
    this.tickPlayerWoundVO();

    const s = this.step();
    if (!s || this.state().done) return;
    const ss = this.state();

    switch (s.kind) {
      case 'reach': {
        const [x, z] = s.at ?? this.entry.cfg.extract;
        if (this.dist2d(x, z) < (s.radius ?? 45)) this.completeStep();
        break;
      }
      case 'extract': {
        if (this.dist2d(...this.entry.cfg.extract) < (s.radius ?? 40)) this.completeStep();
        break;
      }
      case 'destroy': {
        for (const id of s.targets ?? []) {
          const st = this.terrain.structures.find((t) => t.id === id);
          if (st?.destroyed && !ss.perTargetFired.has(id)) {
            ss.perTargetFired.add(id);
            this.playTrigger(s.perTargetVO?.[id]);
          }
        }
        const structsDone = (s.targets ?? []).every((id) =>
          this.terrain.structures.find((t) => t.id === id)?.destroyed);
        const killsDone = !s.killAll || ss.mechs.every((m) => !m.alive || m.bootLocked);
        if (structsDone && killsDone) this.completeStep();
        break;
      }
      case 'defend': {
        const prot = this.terrain.structures.find((t) => t.id === s.protect);
        if (!prot || prot.destroyed) {
          this.fail('MISSION FAILED', `${prot?.name ?? 'The objective'} was destroyed.`);
          return;
        }
        // hostiles inside the perimeter grind the structure down; the player
        // standing the perimeter suppresses their fire — absence is fatal
        let grinders = 0;
        for (const m of ss.mechs) {
          if (!m.alive || m.bootLocked) continue;
          const d = Math.hypot(m.pos.x - prot.group.position.x, m.pos.z - prot.group.position.z);
          if (d < STRUCT_GRIND_RANGE) grinders++;
        }
        if (grinders > 0) {
          const playerNear = Math.hypot(this.player.pos.x - prot.group.position.x, this.player.pos.z - prot.group.position.z) < 300;
          prot.hp -= (playerNear ? STRUCT_GRIND_DPS_HELD : STRUCT_GRIND_DPS) * grinders * dt;
        }
        this.tickWaves(s, ss, dt, true);
        if (this.timeLeft !== null) {
          this.timeLeft = Math.max(0, this.timeLeft - dt);
          const allWavesOut = ss.wavesSpawned >= (s.waves?.length ?? 0);
          const allDead = ss.mechs.every((m) => !m.alive || m.bootLocked);
          if (this.timeLeft <= 0 && allWavesOut && allDead) this.completeStep();
        }
        break;
      }
      case 'hold': {
        const [x, z] = s.at ?? [this.player.pos.x, this.player.pos.z];
        const inside = this.dist2d(x, z) < (s.radius ?? 120);
        const total = s.seconds ?? 60;
        if (inside) ss.heldOrElapsed += dt;
        this.timeLeft = Math.max(0, total - ss.heldOrElapsed);
        // waves at even fractions of the hold
        const waves = s.waves ?? [];
        if (waves.length > ss.wavesSpawned) {
          const nextAt = (ss.wavesSpawned) * (total / waves.length);
          if (ss.heldOrElapsed >= nextAt) {
            this.spawnWave(ss, waves[ss.wavesSpawned]);
            ss.wavesSpawned++;
          }
        }
        if (ss.heldOrElapsed >= total) this.completeStep();
        break;
      }
      case 'survive': {
        ss.heldOrElapsed += dt;
        const total = s.seconds ?? 90;
        this.timeLeft = Math.max(0, total - ss.heldOrElapsed);
        this.tickWaves(s, ss, dt, false);
        if (ss.heldOrElapsed >= total) this.completeStep();
        break;
      }
      case 'escort': {
        const subject = ss.escortMech;
        if (!subject) { this.completeStep(); break; }
        if (!subject.alive) {
          this.fail('MISSION FAILED', `${subject.callsign} was destroyed.`);
          return;
        }
        const route = s.route ?? [];
        // ambushes trip as the subject passes each leg
        for (let leg = ss.escortLeg; leg < route.length; leg++) {
          const [lx, lz] = route[leg];
          if (Math.hypot(subject.pos.x - lx, subject.pos.z - lz) < 40) {
            ss.escortLeg = leg + 1;
            for (const amb of s.ambushes ?? []) {
              if (amb.atLeg === leg) this.spawnWave(ss, amb.spawns);
            }
          }
        }
        if (route.length && ss.escortLeg >= route.length) this.completeStep();
        break;
      }
      case 'duel': {
        const boss = ss.mechs[0];
        if (!boss) { this.completeStep(); break; }
        if (boss.alive && !boss.bootLocked) {
          const frac = this.hullFrac(boss);
          for (let i = 0; i < (s.woundVO?.length ?? 0); i++) {
            const w = s.woundVO![i];
            if (frac < w.frac && !ss.duelVOFired.has(i)) {
              ss.duelVOFired.add(i);
              this.playTrigger(w.trigger);
            }
          }
        } else {
          this.completeStep();
        }
        break;
      }
    }
  }

  /** defend/survive shared wave pacing: next wave on gap timer OR previous wave wiped */
  private tickWaves(s: StepCfg, ss: StepState, dt: number, alertedOnly: boolean): void {
    void alertedOnly;
    const waves = s.waves ?? [];
    if (ss.wavesSpawned >= waves.length) return;
    ss.waveClock += dt;
    const gap = s.waveGap ?? 25;
    const cleared = ss.mechs.every((m) => !m.alive || m.bootLocked);
    if (ss.waveClock >= gap || cleared) {
      ss.waveClock = 0;
      this.spawnWave(ss, waves[ss.wavesSpawned]);
      ss.wavesSpawned++;
    }
  }

  private playerWoundFired = new Set<number>();

  private tickPlayerWoundVO(): void {
    const list = this.entry.cfg.playerWoundVO ?? [];
    if (!list.length || !this.player.alive) return;
    const frac = this.hullFrac(this.player);
    for (let i = 0; i < list.length; i++) {
      if (!this.playerWoundFired.has(i) && frac < list[i].frac) {
        this.playerWoundFired.add(i);
        this.playTrigger(list[i].trigger);
      }
    }
  }

  private tickTimedVO(): void {
    const list = this.entry.cfg.timedVO ?? [];
    for (let i = 0; i < list.length; i++) {
      if (!this.timedFired.has(i) && this.clock >= list[i].atSec) {
        this.timedFired.add(i);
        this.playTrigger(list[i].trigger);
      }
    }
  }

  private tickArtillery(dt: number): void {
    const art = this.entry.cfg.artillery;
    if (!art) return;
    // 1 Hz position history — barrage lands on ~4-second-old coordinates
    this.posSampleAcc += dt;
    if (this.posSampleAcc >= 1) {
      this.posSampleAcc = 0;
      this.posHistory.push({ x: this.player.pos.x, z: this.player.pos.z });
      if (this.posHistory.length > 8) this.posHistory.shift();
    }
    if (this.stepIndex < art.fromStep) return;
    this.artilleryClock += dt;
    if (this.artilleryClock >= art.everySec) {
      this.artilleryClock = 0;
      if (!this.artilleryWarned) {
        this.artilleryWarned = true;
        this.playTrigger('on_artillery');
      }
      const p = this.posHistory[Math.max(0, this.posHistory.length - 5)] ?? { x: this.player.pos.x, z: this.player.pos.z };
      const jx = p.x + (Math.random() - 0.5) * 30;
      const jz = p.z + (Math.random() - 0.5) * 30;
      this.hooks.barrage(jx, jz, art.radius, art.damage);
    }
  }

  // --- helpers ---

  private dist2d(x: number, z: number): number {
    return Math.hypot(this.player.pos.x - x, this.player.pos.z - z);
  }

  private hullFrac(m: Mech): number {
    let cur = 0, max = 0;
    for (const z of Object.values(m.zones)) {
      cur += z.armor + z.structure;
      max += z.armorMax + z.structureMax;
    }
    return max > 0 ? cur / max : 0;
  }

  objectivePoint(): THREE.Vector3 | null {
    const s = this.step();
    if (!s || this.phase === 'complete' || this.phase === 'failed') return null;
    const ss = this.state();
    const v = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x, this.terrain.heightAt(x, z), z);
    switch (s.kind) {
      case 'reach': return s.at ? v(...s.at) : null;
      case 'extract': return this.extractPoint.clone();
      case 'destroy': {
        for (const id of s.targets ?? []) {
          const st = this.terrain.structures.find((t) => t.id === id);
          if (st && !st.destroyed) return st.group.position.clone();
        }
        return this.nearestLiving(ss.mechs);
      }
      case 'defend': {
        const prot = this.terrain.structures.find((t) => t.id === s.protect);
        return this.nearestLiving(ss.mechs) ?? (prot ? prot.group.position.clone() : null);
      }
      case 'hold': return s.at ? v(...s.at) : null;
      case 'survive': return this.nearestLiving(ss.mechs);
      case 'escort': return ss.escortMech && ss.escortMech.alive ? ss.escortMech.pos.clone() : null;
      case 'duel': return this.nearestLiving(ss.mechs);
    }
  }

  private nearestLiving(mechs: Mech[]): THREE.Vector3 | null {
    let best: Mech | null = null;
    let bestD = Infinity;
    for (const m of mechs) {
      if (!m.alive || m.bootLocked) continue;
      const d = m.pos.distanceTo(this.player.pos);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best ? best.pos.clone() : null;
  }
}
