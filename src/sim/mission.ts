import * as THREE from 'three';
import type { Mech } from './mech';
import type { MapId, Terrain } from '../world/terrain';
import { SALVAGE_YIELD, type KillCause } from './types';

export type MissionPhase = 'boot' | 'destroy_mast' | 'kill_patrol' | 'sweep' | 'train' | 'match' | 'extract' | 'complete' | 'failed';

export interface VOCue {
  id: string;
  speaker: string;
  text: string;
  futz: boolean;
  /** audio-manifest key for the recorded line (subtitle-only when absent) */
  audioId?: string;
}

export interface EnemySpawn {
  def: string;
  pos: [number, number];
  waypoints?: [number, number][];
  /** spawn already hunting the player (assault waves) */
  alerted?: boolean;
  /** training range: walks its rail but never detects, engages, or fires */
  passive?: boolean;
  /** training range: powered-down static hulk (implies passive) */
  dormant?: boolean;
  /** hull fraction below which this pilot yields and powers down */
  yieldFrac?: number;
  /** callsign override (defaults to "Directorate <def>") */
  name?: string;
}

export interface MissionCallbacks {
  onObjective(title: string, sub: string): void;
  onVO(cue: VOCue): void;
  onPhase(phase: MissionPhase): void;
  /** creates mechs + visuals + AI in the world and returns the sim handles */
  spawnEnemies(spawns: EnemySpawn[]): Mech[];
  /** on-screen input-glyph prompt (tutorial hint escalation); '' hides it */
  onHint?(text: string): void;
  /** refit + teleport + rebuild visuals — respawn waves (skirmish/multiplayer) */
  respawn?(m: Mech, x: number, z: number): void;
  /** scale the environment heat-dissipation multiplier (Basic Training heat drill) */
  setHeatMult?(m: number): void;
  /** multiplayer deck: show/hide the pick-next-frame overlay after destruction */
  showRedeploy?(choices: Array<{ iid: string; label: string; spent: boolean }>, subtitle: string, onPick: (iid: string) => void): void;
  hideRedeploy?(): void;
  /** multiplayer deck expended under the spectate rule — no further respawns */
  onSpectate?(): void;
  /** rebuild the local player machine as `chassis` (deck redeploy); returns the live player Mech */
  redeployPlayer?(chassis: string): Mech;
}

export interface SalvageEntry {
  name: string;
  cause: KillCause;
  yield: number;
}

export interface MissionLike {
  readonly id: string;
  readonly title: string;
  phase: MissionPhase;
  bootTimer: number;
  salvageReport: SalvageEntry[];
  extractPoint: THREE.Vector3;
  /** live countdown in seconds (match clocks, launch timers); null hides the HUD box */
  timeLeft?: number | null;
  timerLabel?: string;
  start(): void;
  update(dt: number): void;
  objectivePoint(): THREE.Vector3 | null;
  notifyEnemyKilled(m: Mech): void;
  /** gameplay signals from the engine: 'target'/'fire'/'flush'/'skip' (tutorial), 'hit' (scoring), 'net' (multiplayer) */
  notify?(kind: string, data?: unknown): void;
}

const LITANY = 'Core ignition confirmed. Actuator lattice — green. Weapon buses — live. Coolant loop pressurized. All boards answer ready. Good hunting, Lodestar.';

export abstract class BaseMission implements MissionLike {
  abstract readonly id: string;
  abstract readonly title: string;
  phase: MissionPhase = 'boot';
  bootTimer = 0;
  salvageReport: SalvageEntry[] = [];
  extractPoint = new THREE.Vector3();
  protected enemies: Mech[] = [];
  private voFired = new Set<string>();

  constructor(
    protected player: Mech,
    protected terrain: Terrain,
    protected cb: MissionCallbacks,
  ) {}

  protected vo(id: string, speaker: string, text: string, futz: boolean, audioId?: string): void {
    if (this.voFired.has(id)) return;
    this.voFired.add(id);
    this.cb.onVO({ id, speaker, text, futz, audioId });
  }

  protected setExtract(x: number, z: number): void {
    this.extractPoint.set(x, this.terrain.heightAt(x, z), z);
  }

  notifyEnemyKilled(mech: Mech): void {
    const cause = mech.killCause ?? 'ct';
    this.salvageReport.push({ name: mech.def.name, cause, yield: SALVAGE_YIELD[cause] });
    this.vo(`enemy_down_${this.salvageReport.length}`, 'CAIRN', 'Hostile machine neutralized.', false, 'vo.cairn.enemy_down');
  }

  start(): void {
    this.phase = 'boot';
    this.bootTimer = 0;
    this.player.bootLocked = true;
    this.cb.onPhase('boot');
    this.cb.onObjective('COLD START', 'Bring the Skarn online.');
    this.vo('litany', 'CAIRN', LITANY, false, 'vo.cairn.litany');
    this.onStart();
  }

  /** mission-specific setup at cold start (pre-boot spawns etc.) */
  protected onStart(): void { /* override */ }

  /** first objective + briefing once the reactor is up */
  protected abstract afterBoot(): void;

  /** per-frame mission logic outside boot/extract/terminal phases */
  protected tick(dt: number): void { void dt; }

  abstract objectivePoint(): THREE.Vector3 | null;

  protected setPhase(phase: MissionPhase, title: string, sub: string): void {
    this.phase = phase;
    this.cb.onPhase(phase);
    this.cb.onObjective(title, sub);
  }

  protected goExtract(voId: string, speaker: string, line: string, audioId?: string): void {
    this.setPhase('extract', 'REACH THE EXTRACTION LINE', 'Follow the amber marker. The dropbarge is waiting.');
    this.vo(voId, speaker, line, true, audioId);
  }

  update(dt: number): void {
    if (this.phase !== 'failed' && this.phase !== 'complete' && !this.player.alive) {
      this.setPhase('failed', 'MISSION FAILED', 'The Skarn is down.');
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
      case 'extract': {
        const d = Math.hypot(this.player.pos.x - this.extractPoint.x, this.player.pos.z - this.extractPoint.z);
        if (d < 40) {
          this.setPhase('complete', 'MISSION COMPLETE', 'Operation Breaker Coast is underway.');
          this.vo('complete', 'CAIRN', 'Mission objectives complete. Powering down to transit mode. Well flown, Lodestar.', false, 'vo.cairn.mission_complete');
        }
        break;
      }
      case 'complete':
      case 'failed':
        break;
      default:
        this.tick(dt);
    }
  }
}

/** Stage 1 — steal the Skarn, blind the yard, survive the patrol it woke. */
export class ColdIgnition extends BaseMission {
  readonly id = 'm01';
  readonly title = 'COLD IGNITION';

  protected onStart(): void {
    this.setExtract(-300, 330);
    this.enemies = this.cb.spawnEnemies([{
      def: 'gabbro',
      pos: [330, -260],
      waypoints: [[260, -40], [150, -180], [330, -260], [390, -80]],
    }]);
  }

  protected afterBoot(): void {
    this.setPhase('destroy_mast', 'DESTROY THE TRACKING MAST',
      'Kill the yard sensor mast east of the yard before it profiles the stolen Skarn.');
    this.vo('brief', 'Ekene', "Compact actual to Lodestar. That Skarn answers to you now — make it count. The yard's tracking mast is already sweeping for you. Put it down, then get to the extraction line.", true, 'vo.ekene.brief1');
  }

  protected tick(): void {
    const mast = this.terrain.structures.find((s) => s.id === 'tracking_mast');
    if (this.phase === 'destroy_mast' && mast && mast.destroyed) {
      if (this.enemies.every((e) => !e.alive)) {
        this.goExtract('mast_down_clear', 'Relay', "Mast's down and you already swept the patrol — you work fast, Lodestar. Extraction line is lit, north-west. Follow the marker home.", 'vo.relay.mast_down_clear');
      } else {
        this.setPhase('kill_patrol', 'DESTROY THE PATROL', 'A Directorate Gabbro is inbound. Watch your heat.');
        this.vo('mast_down', 'Relay', "Mast's down — the grid is blind! Heads up: one Gabbro, Directorate colors, coming off the ridge. Watch your heat curve, Lodestar.", true, 'vo.relay.mast_down');
      }
    }
    if (this.phase === 'kill_patrol' && this.enemies.every((e) => !e.alive)) {
      this.goExtract('extract', 'Ekene', 'Extraction line is lit. Bring it home, Lodestar — the Compact just got itself a mech.', 'vo.ekene.extract');
    }
  }

  objectivePoint(): THREE.Vector3 | null {
    switch (this.phase) {
      case 'destroy_mast': {
        const mast = this.terrain.structures.find((s) => s.id === 'tracking_mast');
        return mast && !mast.destroyed ? mast.group.position.clone() : null;
      }
      case 'kill_patrol': {
        const e = this.enemies.find((en) => en.alive);
        return e ? e.pos.clone() : null;
      }
      case 'extract':
        return this.extractPoint.clone();
      default:
        return null;
    }
  }
}

interface WaveMissionConfig {
  id: string;
  title: string;
  objective: [string, string];
  brief: { speaker: string; text: string; audioId?: string };
  /** wave 0 can pre-exist during boot (patrols); later waves spawn alerted */
  spawnFirstWaveAtColdStart: boolean;
  waves: EnemySpawn[][];
  waveVO: ({ speaker: string; text: string; audioId?: string } | null)[];
  extract: [number, number];
  extractVO: { speaker: string; text: string; audioId?: string };
}

/** Generic kill-the-waves-then-extract mission used by stages 2 and 3. */
export class WaveMission extends BaseMission {
  readonly id: string;
  readonly title: string;
  private waveIndex = 0;
  private firstWaveSpawned = false;

  constructor(player: Mech, terrain: Terrain, cb: MissionCallbacks, private cfg: WaveMissionConfig) {
    super(player, terrain, cb);
    this.id = cfg.id;
    this.title = cfg.title;
  }

  private spawnWave(i: number): void {
    this.enemies.push(...this.cb.spawnEnemies(this.cfg.waves[i]));
    const voLine = this.cfg.waveVO[i];
    if (voLine) this.vo(`wave_${i}`, voLine.speaker, voLine.text, true, voLine.audioId);
  }

  protected onStart(): void {
    this.setExtract(...this.cfg.extract);
    if (this.cfg.spawnFirstWaveAtColdStart) {
      this.spawnWave(0);
      this.firstWaveSpawned = true;
    }
  }

  protected afterBoot(): void {
    this.setPhase('sweep', ...this.cfg.objective);
    this.vo('brief', this.cfg.brief.speaker, this.cfg.brief.text, true, this.cfg.brief.audioId);
    if (!this.firstWaveSpawned) {
      this.spawnWave(0);
      this.firstWaveSpawned = true;
    }
  }

  protected tick(): void {
    if (this.phase !== 'sweep') return;
    if (this.enemies.every((e) => !e.alive)) {
      this.waveIndex++;
      if (this.waveIndex < this.cfg.waves.length) {
        this.spawnWave(this.waveIndex);
      } else {
        this.goExtract('extract', this.cfg.extractVO.speaker, this.cfg.extractVO.text, this.cfg.extractVO.audioId);
      }
    }
  }

  objectivePoint(): THREE.Vector3 | null {
    if (this.phase === 'sweep') {
      let best: Mech | null = null;
      let bestD = Infinity;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const d = e.pos.distanceTo(this.player.pos);
        if (d < bestD) { bestD = d; best = e; }
      }
      return best ? best.pos.clone() : null;
    }
    if (this.phase === 'extract') return this.extractPoint.clone();
    return null;
  }
}

const TIDE_TABLES: WaveMissionConfig = {
  id: 'm02',
  title: 'TIDE TABLES',
  objective: ['AMBUSH THE SALVAGE PATROL', 'Destroy all three Directorate machines picking through the hulls.'],
  brief: { speaker: 'Ekene', text: 'Low tide, Lodestar. A Directorate salvage patrol is picking through the beached hulls west of the yard — three machines, spread out and lazy. Take them one at a time, watch your heat, and remember: leg them and we keep what falls. Good salvage wins this war.', audioId: 'vo.ekene.brief_tide' },
  spawnFirstWaveAtColdStart: true,
  // wreck line mid-flats, all >550 m from the player's sandbar spawn
  waves: [[
    { def: 'skarn', pos: [-220, -60], waypoints: [[-280, -120], [-160, 0], [-260, 40]] },
    { def: 'halite', pos: [-120, 180], waypoints: [[-60, 100], [-180, 220], [-100, 260]] },
    { def: 'gabbro', pos: [-320, 60], waypoints: [[-380, 0], [-260, 120], [-360, 140]] },
  ]],
  waveVO: [null],
  extract: [420, 240],
  extractVO: { speaker: 'Ekene', text: 'Three wrecks on the sand and the tide coming in to bury them. Beautiful work. Extraction line is lit — bring it home.', audioId: 'vo.ekene.extract_tide' },
};

const LOUD_EXIT: WaveMissionConfig = {
  id: 'm03',
  title: 'LOUD EXIT',
  objective: ['HOLD THE SLIPWAY', 'Destroy the Directorate assault before it reaches the dropbarge.'],
  brief: { speaker: 'Ekene', text: "This is it, Lodestar — the dropbarge is loading everything we've stolen and the Directorate knows exactly where we are. They will come from the east in force. Nothing gets past you to that slipway. Hold the line and we all go home rich.", audioId: 'vo.ekene.brief_loud' },
  spawnFirstWaveAtColdStart: false,
  waves: [
    [
      { def: 'pumice', pos: [340, 160], alerted: true },
      { def: 'gabbro', pos: [420, -40], alerted: true },
    ],
    [
      { def: 'halite', pos: [300, 320], alerted: true },
      { def: 'basalt', pos: [460, 120], alerted: true },
    ],
  ],
  waveVO: [
    { speaker: 'Relay', text: 'First wave on the scope — a Pumice and a Gabbro coming down the coast road. They are not here to negotiate.', audioId: 'vo.relay.wave1' },
    { speaker: 'Relay', text: 'Second wave — and they brought a Basalt. Sixty tons of bad mood, Lodestar. Make it count!', audioId: 'vo.relay.wave2' },
  ],
  extract: [-300, 330],
  extractVO: { speaker: 'Ekene', text: 'The barge is away and the beach is ours. That is how Operation Breaker Coast ends, Lodestar — walk to the line and take a breath. You earned it.', audioId: 'vo.ekene.extract_loud' },
};

/** Which terrain each OP-1 stage plays on. Stage 0 is Basic Training; stages 4+ read their map from content/campaign. */
export function stageMap(stage: number): MapId {
  if (stage === 0) return 'range';
  if (stage === 2) return 'tideflats';
  return 'yard';
}

/** Player cold-start position per stage — always far from any enemy. */
export function stageSpawn(stage: number): { x: number; z: number; yaw: number } {
  if (stage === 0) return { x: 0, z: 420, yaw: Math.PI }; // south gate of the drill field, facing in
  if (stage === 2) return { x: 340, z: -240, yaw: -1.15 }; // sandbar overlook, facing the wreck line
  return { x: -350, z: 40, yaw: 1.8 }; // under the impound gantry
}

export function createMission(stage: number, player: Mech, terrain: Terrain, cb: MissionCallbacks): MissionLike {
  switch (stage) {
    case 2: return new WaveMission(player, terrain, cb, TIDE_TABLES);
    case 3: return new WaveMission(player, terrain, cb, LOUD_EXIT);
    default: return new ColdIgnition(player, terrain, cb);
  }
}
