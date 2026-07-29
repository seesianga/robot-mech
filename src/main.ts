import * as THREE from 'three';
import { createRenderer, createScene, installEnvironment, trackSun } from './engine/renderer';
import { Input } from './engine/input';
import { CameraRig } from './engine/camera';
import { buildTerrain, addMissionStructure, type Terrain, type StructureSpec } from './world/terrain';
import { buildMechVisual, animateMech, scorchZone, severArm, COMPACT_PALETTE, DIRECTORATE_PALETTE, type MechVisual } from './world/mechfactory';
import { Effects } from './world/effects';
import { PhysicsWorld } from './physics/physics';
import { Mech } from './sim/mech';
import { mechDef } from './sim/content';
import { WeaponsSystem } from './sim/weapons';
import { EnemyController } from './ai/enemy';
import { createMission, stageMap, stageSpawn, type EnemySpawn, type MissionLike, type MissionPhase } from './sim/mission';
import { CampaignMission, campaignForStage, briefingAudioId, stageList, MAX_STAGE, type AllySpawnReq, type CampaignEntry } from './sim/campaign';
import { BasicTrainingMission, type BtInput } from './sim/basictraining';
import { BtOverlay } from './ui/btoverlay';
import { codeOf, resolveBindTokens } from './engine/bindings';
import { NavGuidanceSystem, navRoute, type NavEvent } from './sim/nav';
import { navString } from './sim/navroutes';
import { NavPathRenderer } from './world/navpath';
import { loadNavPrefs, navReducedMotion } from './save/navprefs';
import { SkirmishMission } from './sim/skirmish';
import { MpMission } from './net/mpmission';
import { netSession } from './net/session';
import type { RosterEntry, StatePacket } from './net/mpclient';
import { buildStaticColliders, resolveMechVsStatics, separateMechs, type StaticCollider } from './sim/collision';
import { HUD } from './ui/hud';
import { StartScreen } from './ui/start';
import { ProfileStore, type Profile } from './save/profiles';
import { HangarService, MATCH_SCRIP } from './save/hangar';
import { MECHS } from './sim/content';
import { AudioMan } from './audio/audio';
import { ZONES, type ZoneId } from './sim/types';

const PARAMS = new URLSearchParams(location.search);
const TEST_MODE = PARAMS.has('test');

/** Scene handle for the asset probes — the only way to confirm from outside that
 *  generated geometry actually replaced the procedural boxes, on ANY stage. */
function exposeScene(sc: unknown): void {
  if (TEST_MODE) (window as unknown as Record<string, unknown>).__SCENE = sc;
}

interface TestState {
  ready: boolean;
  errors: string[];
  bc: string[]; // launch breadcrumbs (diagnostics, not errors)
  fps: number;
  phase: string;
  stage: number;
  enemyAlive: boolean;
  playerPos: number[];
  enemyPos: number[];
  torsoYaw: number;
  torsoPitch: number;
  bootLocked: boolean;
  btStep: string;
  legYaw: number;
  heat: number;
  shutdown: boolean;
  throttle: number;
  enemies: number[][]; // [id, x, y, z, alive] — Basic Training injection-driver support
  campStep: number; // active campaign step (stage 4+; -1 elsewhere/boot)
  navRoute: string; // PATHLIGHT: active route id ('' = none)
  navWp: string;
  navState: string;
  navDist: number;
  navLegErrDeg: number;
  navCamErrDeg: number;
  navStuck: number;
}
const __STATE: TestState = { ready: false, errors: [], bc: [], fps: 0, phase: 'init', stage: 0, enemyAlive: true, playerPos: [], enemyPos: [], torsoYaw: 0, torsoPitch: 0, bootLocked: true, btStep: '', legYaw: 0, heat: 0, shutdown: false, throttle: 0, enemies: [], campStep: -1, navRoute: '', navWp: '', navState: '', navDist: 0, navLegErrDeg: 0, navCamErrDeg: 0, navStuck: 0 };
(window as unknown as Record<string, unknown>).__STATE = __STATE;
window.addEventListener('error', (e) => __STATE.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => __STATE.errors.push(String(e.reason)));

function boot(): void {
  const container = document.getElementById('app')!;
  const renderer = createRenderer(container);
  const scene = createScene();
  installEnvironment(renderer, scene);   // IBL — see engine/renderer.ts for why
  exposeScene(scene);
  const input = new Input(renderer.domElement);
  const rig = new CameraRig(window.innerWidth / window.innerHeight);
  scene.add(rig.camera);
  const hud = new HUD(document.body);
  const audio = new AudioMan();
  audio.onSubtitle = (s, t, sec) => hud.subtitle(s, t, sec);
  const store = new ProfileStore();
  const hangarSvc = new HangarService(store);
  /**
   * Every "back to the menu" path below tears the page down, and a just-banked
   * mission reward may still be queued for the pilot registry. Push it before
   * the reload. The pagehide keepalive flush is a backstop, not a guarantee —
   * it cannot retry and it cannot report failure.
   */
  const reloadAfterSync = (): void => {
    void store.flush().finally(() => location.reload());
  };
  const effects = new Effects(scene);

  // --- world state (created at launch, once the stage/map is known) ---
  let terrain: Terrain | null = null;
  let physics: PhysicsWorld | null = null;
  let staticColliders: StaticCollider[] = [];
  let weapons: WeaponsSystem | null = null;
  let mission: MissionLike | null = null;
  // --- PATHLIGHT (nav guidance) ---
  let nav: NavGuidanceSystem | null = null;
  let navPath: NavPathRenderer | null = null;
  const navPrefs = loadNavPrefs();
  let navPingT = 0.5;
  let navHintShown = false;
  let currentStage = 1;
  let currentBranch: 'a' | 'b' = 'a';
  let profile: Profile | null = null;
  let started = false;

  // --- player ---
  let player = new Mech(mechDef('skarn'), 'compact', 'Lodestar');
  const enemies: Mech[] = [];
  const friends: Mech[] = []; // same-team remote machines (LAN) — never targetable
  const controllers: EnemyController[] = [];
  const visuals = new Map<Mech, MechVisual>();
  const allMechs = (): Mech[] => [player, ...enemies, ...friends];

  // --- LAN match bookkeeping (stage 99) ---
  const remoteById = new Map<number, Mech>(); // net-driven replicas only (snapshots own them)
  const netIdOf = new Map<Mech, number>(); // every match machine (replicas AND owned robots)
  interface NetLerp { fromPos: THREE.Vector3; toPos: THREE.Vector3; fromLy: number; toLy: number; acc: number }
  const netLerp = new Map<number, NetLerp>();
  let netSendAcc = 0;
  let netBeat = 0;
  /** robots this client simulates: mech → roster id */
  const localBots = new Map<Mech, number>();
  /** every match machine's team letter (flag arbitration, bot target lists) */
  const teamOf = new Map<Mech, string>();
  // 5v5 — five pads per side, west vs east
  const MP_TEAM_A: Array<[number, number]> = [[-420, 40], [-380, -120], [-360, 180], [-440, -260], [-340, 320]];
  const MP_TEAM_B: Array<[number, number]> = [[420, -40], [380, 120], [360, -180], [440, 260], [340, -320]];

  function mpSlotCoord(e: { team: string; slot: number }): [number, number] {
    const list = e.team === 'a' ? MP_TEAM_A : MP_TEAM_B;
    return list[e.slot % list.length];
  }

  const pv = buildMechVisual(player, COMPACT_PALETTE);
  visuals.set(player, pv);
  scene.add(pv.root);

  /** Campaign chassis ramp: rebuild the player machine for the launched stage. */
  function setPlayerChassis(defId: string): void {
    if (player.def.id === defId) return;
    const old = visuals.get(player);
    if (old) scene.remove(old.root);
    visuals.delete(player);
    player = new Mech(mechDef(defId), 'compact', 'Lodestar');
    wireMech(player);
    const v = buildMechVisual(player, COMPACT_PALETTE);
    visuals.set(player, v);
    scene.add(v.root);
  }

  let target: Mech | null = null;
  let subtargetIdx = 0;
  let skipHold = 0; // hold-F8 accumulator (Basic Training step skip)
  const SUBTARGET_ORDER: (ZoneId | null)[] = [null, 'ct', 'lt', 'rt', 'la', 'ra', 'll', 'rl', 'head'];
  const centerRay = new THREE.Raycaster();
  const breachAnnounced = new Set<string>();

  // --- Basic Training (stage 0) ---
  let btMission: BasicTrainingMission | null = null;
  let btOverlay: BtOverlay | null = null;
  let wasPointerLocked = false;
  // input-action bus view: the tutorial listens to actions, never raw key codes
  const btAdapter: BtInput = {
    held: (a) => {
      const code = codeOf(a);
      if (code === 'MouseMove') return Math.abs(input.mouseDX) + Math.abs(input.mouseDY) > 0.5;
      return code ? input.isDown(code) : false;
    },
    pressed: (a) => {
      const code = codeOf(a);
      return code && code !== 'MouseMove' ? input.wasPressed(code) : false;
    },
  };

  const worldPosOf = (m: Mech, zone: ZoneId): THREE.Vector3 => {
    const v = visuals.get(m);
    const mesh = v?.zoneMeshes[zone][0];
    if (mesh) return mesh.getWorldPosition(new THREE.Vector3());
    return m.pos.clone().add(new THREE.Vector3(0, 6, 0));
  };

  function wireMech(m: Mech): void {
    m.onFootfall = (mm) => {
      const dist = mm === player ? 0 : mm.pos.distanceTo(player.pos);
      const vol = Math.max(0, 1 - dist / 220);
      if (vol > 0) {
        void audio.play('sfx.footstep_salt', { volume: vol * (0.5 + mm.def.tons / 150), rate: 1.15 - mm.def.tons / 400 });
        rig.addShake(0.05 * (mm.def.tons / 55) * (mm === player ? 1 : vol * 0.6));
      }
    };
    m.onEvent = (mm, ev) => {
      const v = visuals.get(mm)!;
      switch (ev.type) {
        case 'armor': {
          // amount 0 = a hit the safeties absorbed: it registers, it never marks the hull
          if ((ev.amount ?? 0) > 0) scorchZone(v, mm, ev.zone);
          if (mm === player) {
            hud.damageFlash();
            rig.addShake(0.12);
            void audio.play('sfx.impact_armor', { volume: 0.8 });
          } else {
            void audio.play('sfx.impact_armor', { volume: 0.4 });
          }
          break;
        }
        case 'structure': {
          scorchZone(v, mm, ev.zone);
          void audio.play('sfx.impact_internal', { volume: mm === player ? 0.9 : 0.5 });
          if (mm === player) {
            hud.damageFlash();
            rig.addShake(0.16);
            const key = `${mm.id}:${ev.zone}`;
            if (!breachAnnounced.has(key)) {
              breachAnnounced.add(key);
              void audio.playVO('vo.cairn.armor_breach', 'CAIRN', `Armor breach — ${ev.zone.toUpperCase()} structure exposed.`, false);
            }
          }
          break;
        }
        case 'weaponDestroyed': {
          if (mm === player) void audio.playVO('vo.cairn.weapon_lost', 'CAIRN', `${ev.weaponName ?? 'Weapon'} destroyed.`, false);
          effects.sparks(worldPosOf(mm, ev.zone), 20, 0xffe080, 8);
          break;
        }
        case 'severed': {
          const pos = worldPosOf(mm, ev.zone);
          effects.sparks(pos, 50, 0xffc050, 16);
          effects.explosion(pos, 3);
          if (ev.zone === 'la' || ev.zone === 'ra') {
            const g = severArm(v, scene, ev.zone);
            if (g && physics) {
              physics.addDebris(g, new THREE.Vector3((Math.random() - 0.5) * 8, 7 + Math.random() * 4, (Math.random() - 0.5) * 8));
            }
          }
          scorchZone(v, mm, ev.zone);
          break;
        }
        case 'zoneDestroyed': {
          scorchZone(v, mm, ev.zone);
          if (mm === player && (ev.zone === 'll' || ev.zone === 'rl')) {
            void audio.playVO('vo.cairn.leg_lost', 'CAIRN', 'Leg actuator destroyed. Speed capped. Recommend immediate cover.', false);
          }
          break;
        }
        case 'cookoff': {
          const pos = worldPosOf(mm, ev.zone);
          effects.explosion(pos, 5);
          void audio.play('sfx.cookoff', { volume: 0.9 });
          rig.addShake(mm === player ? 0.5 : 0.2);
          break;
        }
        case 'crit': {
          if (ev.weaponName === '__shutdown__' && mm === player) {
            void audio.play('sfx.shutdown', { volume: 1 });
            void audio.playVO('vo.cairn.shutdown', 'CAIRN', 'Thermal redline. Emergency shutdown engaged.', false);
          }
          if (ev.weaponName === '__restart__' && mm === player) {
            void audio.play('sfx.startup', { volume: 1 });
          }
          break;
        }
        case 'killed': {
          const pos = mm.pos.clone().add(new THREE.Vector3(0, 6, 0));
          effects.explosion(pos, 8);
          effects.smokeColumn(mm.pos.clone());
          void audio.play('sfx.collapse', { volume: mm === player ? 1 : 0.8 });
          rig.addShake(0.4);
          if (mm !== player) {
            // only hostile losses feed the salvage report — a fallen ally is not a claim
            if (mm.team === 'directorate') mission?.notifyEnemyKilled(mm);
            if (target === mm) { target = null; subtargetIdx = 0; }
          } else {
            // the pilot punches out — spec: destroyed player mechs eject
            void audio.play('sfx.eject', { volume: 1 });
            void audio.playVO('vo.cairn.mission_failed', 'CAIRN', 'Critical damage. Ejection sequence engaged. Hold on, Lodestar — the Compact will recover you.', false);
          }
          break;
        }
      }
    };
  }
  wireMech(player);

  function spawnEnemies(spawns: EnemySpawn[]): Mech[] {
    const T = terrain!;
    const out: Mech[] = [];
    for (const s of spawns) {
      const m = new Mech(mechDef(s.def), 'directorate', s.name ?? `Directorate ${s.def}`);
      m.pos.set(s.pos[0], T.heightAt(s.pos[0], s.pos[1]), s.pos[1]);
      const v = buildMechVisual(m, DIRECTORATE_PALETTE);
      visuals.set(m, v);
      scene.add(v.root);
      wireMech(m);
      const wpSrc = s.waypoints ?? [
        [s.pos[0] - 80, s.pos[1]], [s.pos[0], s.pos[1] + 80],
        [s.pos[0] + 80, s.pos[1]], [s.pos[0], s.pos[1] - 80],
      ];
      const wps = wpSrc.map(([x, z]) => new THREE.Vector3(x, T.heightAt(x, z), z));
      const ctrl = new EnemyController(m, wps, weapons!);
      if (s.passive || s.dormant) ctrl.passive = true;
      if (s.dormant) m.bootLocked = true; // powered-down range hulk — damageable, frozen
      if (s.yieldFrac !== undefined) ctrl.yieldFrac = s.yieldFrac;
      if (s.alerted) ctrl.alert();
      // hostiles fight the whole Compact side — the player plus any fireteam
      ctrl.targets = () => [player, ...friends];
      enemies.push(m);
      controllers.push(ctrl);
      out.push(m);
    }
    return out;
  }

  /** Campaign fireteam + escort subjects: Compact machines with their own pilot AI. */
  function spawnAllies(reqs: AllySpawnReq[]): Mech[] {
    const T = terrain!;
    const out: Mech[] = [];
    for (const r of reqs) {
      const m = new Mech(mechDef(r.def), 'compact', r.callsign);
      m.pos.set(r.pos[0], T.heightAt(r.pos[0], r.pos[1]), r.pos[1]);
      const v = buildMechVisual(m, COMPACT_PALETTE);
      visuals.set(m, v);
      scene.add(v.root);
      wireMech(m);
      const wps = (r.route ?? []).map(([x, z]) => new THREE.Vector3(x, T.heightAt(x, z), z));
      const ctrl = new EnemyController(m, wps, weapons!);
      if (r.passive) {
        ctrl.passive = true;      // escort subject: walks its route, never fights
        ctrl.loop = false;
      } else {
        ctrl.escortOf = player;   // fireteam: hold formation, engage hostiles on sight
        ctrl.targets = () => enemies;
      }
      friends.push(m);
      controllers.push(ctrl);
      out.push(m);
    }
    return out;
  }

  /** Blind-artillery impact: VFX always, splash damage if the player is inside. */
  function barrage(x: number, z: number, radius: number, damage: number): void {
    if (!terrain) return;
    const y = terrain.heightAt(x, z);
    const p = new THREE.Vector3(x, y + 2, z);
    effects.explosion(p, 9);
    effects.sparks(p, 24, 0xffc050, 12);
    const d = Math.hypot(player.pos.x - x, player.pos.z - z);
    void audio.play('sfx.explosion', { volume: Math.max(0.25, 1 - d / 600) });
    rig.addShake(Math.max(0.08, 0.5 - d / 400));
    if (d < radius && player.alive) {
      const zones = ['ct', 'lt', 'rt', 'la', 'ra', 'll', 'rl'] as const;
      const zone = zones[Math.floor(Math.random() * zones.length)];
      player.applyDamage(zone, damage * (1 - d / radius));
    }
  }

  /** Refit + teleport + rebuild visuals — respawn waves (skirmish/LAN). */
  function respawnMech(m: Mech, x: number, z: number): void {
    m.refit();
    m.pos.set(x, terrain!.heightAt(x, z), z);
    const old = visuals.get(m);
    if (old) scene.remove(old.root);
    const v = buildMechVisual(m, m.team === 'compact' ? COMPACT_PALETTE : DIRECTORATE_PALETTE);
    visuals.set(m, v);
    scene.add(v.root);
    for (const zone of ZONES) breachAnnounced.delete(`${m.id}:${zone}`);
  }

  /** Quick-match: build a net-driven replica of a machine another client simulates. */
  function addRemote(e: RosterEntry, myTeam: string): void {
    const hostile = e.team !== myTeam;
    const m = new Mech(mechDef(e.chassis), hostile ? 'directorate' : 'compact', e.name);
    const [sx, sz] = mpSlotCoord(e);
    m.pos.set(sx, terrain!.heightAt(sx, sz), sz);
    const v = buildMechVisual(m, hostile ? DIRECTORATE_PALETTE : COMPACT_PALETTE);
    visuals.set(m, v);
    scene.add(v.root);
    wireMech(m);
    (hostile ? enemies : friends).push(m);
    remoteById.set(e.id, m);
    netIdOf.set(m, e.id);
    teamOf.set(m, e.team);
  }

  /** Quick-match: spawn a robot THIS client owns — full local sim + team-aware AI. */
  function addLocalBot(e: RosterEntry, myTeam: string): Mech {
    const hostile = e.team !== myTeam;
    const m = new Mech(mechDef(e.chassis), hostile ? 'directorate' : 'compact', e.name);
    const [sx, sz] = mpSlotCoord(e);
    m.pos.set(sx, terrain!.heightAt(sx, sz), sz);
    const v = buildMechVisual(m, hostile ? DIRECTORATE_PALETTE : COMPACT_PALETTE);
    visuals.set(m, v);
    scene.add(v.root);
    wireMech(m);
    const wps = [[sx - 80, sz], [sx, sz + 80], [sx + 80, sz], [sx, sz - 80]]
      .map(([x, z]) => new THREE.Vector3(x, terrain!.heightAt(x, z), z));
    const ctrl = new EnemyController(m, wps, weapons!);
    ctrl.alert();
    // robots fight the whole opposing team — never their own side
    ctrl.targets = hostile
      ? () => [player, ...friends]
      : () => enemies;
    (hostile ? enemies : friends).push(m);
    controllers.push(ctrl);
    localBots.set(m, e.id);
    netIdOf.set(m, e.id);
    teamOf.set(m, e.team);
    return m;
  }

  function packState(m: Mech): StatePacket {
    const a: number[] = [], s: number[] = [];
    let d = 0;
    ZONES.forEach((z, i) => {
      const zs = m.zones[z];
      a.push(Math.round((zs.armor / Math.max(1, zs.armorMax)) * 100));
      s.push(Math.round((zs.structure / Math.max(1, zs.structureMax)) * 100));
      if (zs.destroyed) d |= 1 << i;
    });
    return {
      p: [m.pos.x, m.pos.y, m.pos.z], ly: m.legYaw, ty: m.torsoYaw, tp: m.torsoPitch,
      sp: m.speed, a, s, d, h: m.heat / m.heatCap,
    };
  }

  /** Owner state is truth: correct the replica's paper doll, fire the VFX for new losses. */
  function applyRemoteState(id: number, s: StatePacket): void {
    const m = remoteById.get(id);
    if (!m) return;
    netLerp.set(id, {
      fromPos: m.pos.clone(), toPos: new THREE.Vector3(s.p[0], s.p[1], s.p[2]),
      fromLy: m.legYaw, toLy: s.ly, acc: 0,
    });
    m.torsoYaw = s.ty;
    m.torsoPitch = s.tp;
    m.speed = s.sp;
    m.heat = s.h * m.heatCap;
    ZONES.forEach((z, i) => {
      const zs = m.zones[z];
      zs.armor = (s.a[i] / 100) * zs.armorMax;
      zs.structure = (s.s[i] / 100) * zs.structureMax;
      const dead = ((s.d >> i) & 1) === 1;
      if (dead && !zs.destroyed) {
        zs.destroyed = true;
        zs.armor = 0;
        zs.structure = 0;
        m.onEvent?.(m, { type: z === 'la' || z === 'ra' ? 'severed' : 'zoneDestroyed', zone: z, amount: 0 });
      }
    });
  }

  function lerpAngle(a: number, b: number, t: number): number {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  /** Per-frame interpolation of net-driven machines toward their latest snapshot. */
  function applyNetLerp(dt: number): void {
    for (const [id, l] of netLerp) {
      const m = remoteById.get(id);
      if (!m || !m.alive) continue;
      l.acc = Math.min(1, l.acc + dt / 0.09);
      m.pos.lerpVectors(l.fromPos, l.toPos, l.acc);
      m.legYaw = lerpAngle(l.fromLy, l.toLy, l.acc);
      m.walkPhase += Math.abs(m.speed) * dt * 0.55;
    }
  }

  // --- objective nav marker: amber beam + bobbing diamond at the active goal ---
  const objMarker = new THREE.Group();
  const objBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 1.8, 240, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  objBeam.position.y = 120;
  const objDiamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(3.4),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9 }),
  );
  objDiamond.position.y = 26;
  objMarker.add(objBeam, objDiamond);
  objMarker.visible = false;
  scene.add(objMarker);

  // structure destruction check (the tracking mast)
  function checkStructures(): void {
    if (!terrain) return;
    for (const s of terrain.structures) {
      if (!s.destroyed && s.hp <= 0) {
        s.destroyed = true;
        const p = s.group.position.clone().add(new THREE.Vector3(0, 40, 0));
        effects.explosion(p, 14);
        effects.smokeColumn(s.group.position.clone());
        void audio.play('sfx.explosion', { volume: 1 });
        rig.addShake(0.5);
        if (s.topple) {
          s.group.rotation.z = 1.15;
          s.group.position.y -= 4;
        } else {
          // crush in place (drive housings etc.) — never keel the whole parent over
          for (const mesh of s.meshes) {
            mesh.scale.setScalar(0.55);
            mesh.position.y -= 3;
            (mesh.material as THREE.MeshStandardMaterial).color?.setHex(0x1c1a18);
          }
        }
        // the wreckage still blocks movement — recompute its AABBs
        staticColliders = buildStaticColliders(terrain);
      }
    }
  }

  /** Set when the match socket drops, so the end screen can tell that apart from a result. */
  let netDropped = false;

  function onMissionEnd(phase: 'complete' | 'failed'): void {
    audio.stingerPreempt();
    // A dropped link is not a defeat — and must not bank scrip for a match that was
    // never scored. A server restart or a flaky connection would otherwise read as a
    // completed 0-0 match the instant the player drops in.
    const dropped = netDropped;
    netDropped = false;

    // Basic Training: flags + summary card (overlay-owned); completing or
    // skipping sets the same basic_training_complete flag. No salvage screen.
    if (currentStage === 0 && btMission) {
      store.markTutorialDone(profile);
      store.saveBtPhases(profile, btMission.summary?.phasesDone ?? []);
      hud.setHint('');
      hud.highlight([]);
      return;
    }

    // M21 endings run their own bed under the epilogue (bible §6.5); everything
    // else gets the stinger, with the legacy pair as pre-generation fallback
    const ending = phase === 'complete' && currentStage === 21
      ? `music.mus_ending_21${currentBranch}` : null;
    if (ending) {
      audio.stopMusic();
      void audio.playFirst([ending, 'music.sting_complete', 'music.stinger_win'], { bus: 'music' });
    } else {
      void audio.playFirst(phase === 'complete'
        ? ['music.sting_complete', 'music.stinger_win']
        : ['music.sting_failed', 'music.stinger_fail'], { bus: 'music' });
    }
    const m = mission!;

    // match modes (skirmish 90 / online 99): results card — online pays match scrip
    if (currentStage >= 90) {
      hud.setHint('');
      hud.hideRedeploy();
      let mpScrip: number | undefined;
      let mpNote = 'Skirmish complete. The range crew is already rebuilding the bots.';
      if (currentStage === 99 && dropped) {
        mpNote = 'Link to the match server dropped, so the match was not scored and no '
          + 'scrip was banked. Your Collection is untouched — queue again from the menu.';
      } else if (currentStage === 99) {
        const kills = m.salvageReport.length;
        mpScrip = (phase === 'complete' ? MATCH_SCRIP.win : MATCH_SCRIP.loss) + MATCH_SCRIP.perKill * kills;
        hangarSvc.awardMatchScrip(profile, mpScrip, crypto.randomUUID());
        mpNote = `Match scrip banked: +${mpScrip} (${kills} kill${kills === 1 ? '' : 's'}). Your deck resets — the Collection is permanent.`;
        // "Bay 3 is now within reach" deep-link nudge toward the Hangar
        const acct = hangarSvc.account(profile);
        const nb = hangarSvc.nextLockedBay(profile);
        if (nb >= 0) {
          const short = hangarSvc.bayPrice(nb) - acct.scrip;
          mpNote += short > 0
            ? ` Bay ${nb + 1}: ◈ ${short.toLocaleString()} short.`
            : ` Bay ${nb + 1} is now affordable — visit the HANGAR.`;
        }
      }
      setTimeout(() => {
        hud.showEnd(phase, m.salvageReport, {
          title: dropped ? 'CONNECTION LOST' : phase === 'complete' ? 'VICTORY' : 'MATCH OVER',
          label: 'MAIN MENU',
          onClick: () => {
            netSession.active?.client.close();
            netSession.active = null;
            reloadAfterSync();
          },
          note: mpNote,
          ...(phase === 'complete' && mpScrip !== undefined ? { scrip: mpScrip } : {}),
        });
      }, 2600);
      return;
    }

    const scrip = phase === 'complete'
      ? Math.round(m.salvageReport.reduce((a, s) => a + s.yield, 0) * 100) + 250
      : 0;
    let salvageNote = '';
    if (phase === 'complete') {
      store.completeStage(profile, currentStage, scrip, MAX_STAGE);
      // first-completion campaign salvage: the stage signs a frame over to the Collection
      const award = hangarSvc.grantStageAward(profile, currentStage);
      if (award) {
        salvageNote = ` <b style="color:#ffb347">SALVAGE SIGNED OVER: ${(MECHS[award.chassis]?.name ?? award.chassis).toUpperCase()}</b> — now in your HANGAR collection.`;
      }
    }
    hud.setHint('');
    const saveNote = (profile
      ? `Progress saved to pilot <b>${profile.callsign.toUpperCase()}</b>.`
      : 'Guest progress lasts only until this tab closes — register a pilot to keep it.') + salvageNote;
    setTimeout(() => {
      if (phase === 'failed') {
        // spoken debrief lands with the pop-up
        void audio.playVO('vo.command.mission_failed', 'Command', 'Mission failed. The Compact recovers your ejection pod under fire.', false);
        hud.showEnd('failed', m.salvageReport, {
          label: `RETRY — ${m.title}`,
          onClick: () => { store.setResume(currentStage); reloadAfterSync(); },
        });
      } else if (currentStage < MAX_STAGE) {
        const nextStage = currentStage + 1;
        const next = stageList().find((s) => s.stage === nextStage);
        const label = nextStage === 21
          ? 'CONTINUE — STAGE 21: THE FORK (CHOOSE 21A OR 21B)'
          : `CONTINUE — STAGE ${nextStage}: ${next?.name ?? ''}`;
        hud.showEnd('complete', m.salvageReport, {
          label,
          onClick: () => { store.setResume(nextStage); reloadAfterSync(); },
          note: saveNote,
          scrip,
        });
      } else {
        hud.showEnd('complete', m.salvageReport, {
          title: 'THE WAR IS OVER',
          label: 'MAIN MENU',
          onClick: () => { reloadAfterSync(); },
          note: `Reclamation is complete — the Anchor is yours and Veyra Prime is free. ${saveNote}`,
          scrip,
        });
      }
    }, 2600);
  }

  /** Pre-mission briefing overlay — resolves when the pilot hits LAUNCH. */
  function showBriefing(entry: CampaignEntry): Promise<void> {
    return new Promise((resolve) => {
      const d = document.createElement('div');
      d.id = 'briefing';
      d.setAttribute('style',
        'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(3,8,6,.92);font-family:inherit;color:#cfe;');
      const num = entry.cfg.branch ? `21${entry.cfg.branch.toUpperCase()}` : String(entry.cfg.stage);
      d.innerHTML = `
        <div style="max-width:680px;border:1px solid rgba(126,230,176,.4);background:rgba(8,16,13,.95);padding:26px 32px;">
          <div style="color:#7ee6b0;font-size:11px;letter-spacing:3px;">OPERATION ${entry.design.op} — ${entry.design.opName.toUpperCase()}</div>
          <div style="color:#ffb347;font-size:20px;letter-spacing:4px;margin:8px 0 14px;">M${num} · ${entry.cfg.title}</div>
          <div style="color:#7ee6b0;font-size:11px;letter-spacing:2px;margin-bottom:6px;">${entry.design.briefing.speaker.toUpperCase()} — MISSION BRIEFING</div>
          <div style="font-size:13px;line-height:1.75;letter-spacing:.4px;max-height:44vh;overflow-y:auto;color:rgba(220,240,232,.92);">${entry.design.briefing.text}</div>
          <div style="display:flex;justify-content:center;margin-top:20px;">
            <button id="brief-launch" style="background:none;border:1px solid #ffb347;color:#ffb347;font-family:inherit;font-size:13px;letter-spacing:3px;padding:10px 26px;cursor:pointer;">LAUNCH ▶</button>
          </div>
        </div>`;
      document.body.appendChild(d);
      void audio.playBriefing(briefingAudioId(entry.cfg.id));
      (d.querySelector('#brief-launch') as HTMLButtonElement).onclick = () => {
        audio.stopBriefing();
        d.remove();
        resolve();
      };
    });
  }

  // --- launch: build the stage's world, then start the mission ---
  async function launch(stage: number, prof: Profile | null, branch21?: 'a' | 'b'): Promise<void> {
    if (started) return;
    Object.assign(navPrefs, loadNavPrefs()); // settings edited in the menu apply to this sortie
    audio.stopLoop('music.theme_main'); // the menu theme ends where the sortie begins
    currentStage = stage;
    profile = prof;
    __STATE.stage = stage;

    // campaign stages 4+ are data-driven: map, spawn, chassis, steps from content/campaign
    let campaignEntry: CampaignEntry | null = null;
    if (stage >= 4 && stage <= MAX_STAGE) {
      const storedBranch = store.progressOf(prof).branch21 ?? 'a';
      currentBranch = stage === 21 ? (branch21 ?? storedBranch) : storedBranch;
      if (stage === 21) store.setBranch(prof, currentBranch);
      campaignEntry = campaignForStage(stage, currentBranch);
      if (!campaignEntry) {
        __STATE.errors.push(`missing campaign config for stage ${stage}`);
        return;
      }
      setPlayerChassis(campaignEntry.cfg.playerMech);
    }

    terrain = buildTerrain(scene, campaignEntry ? campaignEntry.cfg.map : stageMap(stage));
    staticColliders = buildStaticColliders(terrain);
    __STATE.bc.push('prePhysics');
    physics = await PhysicsWorld.create(terrain.heightAt, terrain.size);
    __STATE.bc.push('postPhysics');

    const spawn = campaignEntry ? campaignEntry.cfg.spawn : stageSpawn(stage);
    player.pos.set(spawn.x, terrain.heightAt(spawn.x, spawn.z), spawn.z);
    player.legYaw = spawn.yaw;

    weapons = new WeaponsSystem(scene, effects, terrain, allMechs, (m) => visuals.get(m));
    weapons.onFire = (owner, w, aim) => {
      if (owner === player) {
        mission?.notify?.('fire', w.group); // player fire sfx handled at the key press
        return;
      }
      // robots this client owns broadcast their fire so every client replays it
      const botId = localBots.get(owner);
      if (botId !== undefined) {
        netSession.active?.client.send({ t: 'fire', who: botId, group: w.group, aim: [aim.x, aim.y, aim.z] });
      }
      const dist = owner.pos.distanceTo(player.pos);
      const vol = Math.max(0, 1 - dist / 700) * 0.7;
      if (vol > 0.03) {
        const sfx = w.def.type === 'energy' ? 'sfx.laser' : w.def.type === 'missile' ? 'sfx.rockets' : 'sfx.ac40';
        void audio.play(sfx, { volume: vol });
      }
    };
    weapons.onHit = (owner, w, hit) => {
      if (!hit?.mech) return;
      if (owner === player && hit.mech !== player) {
        mission?.notify?.('hit', { mech: hit.mech, dmg: w.def.damage }); // skirmish scoring feed
      }
      const ns = netSession.active;
      if (!ns || owner === hit.mech) return;
      const attackerId = owner === player ? ns.myId : netIdOf.get(owner);
      if (attackerId === undefined) return;
      // victim-authoritative attribution — for the pilot and every owned robot
      if (hit.mech === player && owner !== player) ns.lastAttacker = attackerId;
      const botId = localBots.get(hit.mech);
      if (botId !== undefined) {
        const ob = ns.ownedBots.find((b) => b.id === botId);
        if (ob && attackerId !== botId) ob.lastAttacker = attackerId;
      }
    };

    // --- PATHLIGHT: route state in the fixed-step sim, visuals render-side ---
    const navTelemetry = (ev: string, data?: Record<string, unknown>): void => {
      try {
        const KEY = 'veyra.telemetry.v1';
        const arr = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown[];
        arr.push({ t: Date.now(), ev, ...data });
        while (arr.length > 500) arr.shift();
        localStorage.setItem(KEY, JSON.stringify(arr));
      } catch { /* telemetry is best-effort */ }
    };
    nav = new NavGuidanceSystem({
      getPlayer: () => ({
        x: player.pos.x, y: player.pos.y, z: player.pos.z,
        legYaw: player.legYaw, facingYaw: player.legYaw + player.torsoYaw,
        speed: player.speed, throttle: player.throttle,
        alive: player.alive, bootLocked: player.bootLocked,
      }),
      heightAt: env.heightAt,
      getColliders: () => staticColliders,
      getCameraFrame: () => ({ fovYRad: rig.camera.fov * Math.PI / 180, aspect: rig.camera.aspect }),
      navString,
      onEvent: (ev: NavEvent) => {
        if (ev.t === 'waypoint_arrive') {
          // one shared "you did it" sound across the whole game
          void audio.play('ui.bt.confirm', { bus: 'ui', volume: 0.9 });
        }
      },
      onVO: (lineId, textKey) => {
        void audio.playVO(`vo.nav.${lineId}`, 'CAIRN', navString(textKey), false);
      },
      logEvent: navTelemetry,
    });
    navPath = new NavPathRenderer(scene, (x, z) => terrain ? terrain.heightAt(x, z) : 0);

    const missionCallbacks = {
      onObjective: (t: string, s: string) => hud.setObjective(t, s),
      onVO: (cue: { audioId?: string; speaker: string; text: string; futz: boolean }) => {
        void audio.playVO(cue.audioId ?? '', cue.speaker, cue.text, cue.futz);
        // M13 lament (bible §6.5): the score mutes and the solo cello grieves,
        // then the biome bed eases back in under the aftermath
        if (cue.audioId === 'vo.camp.m13.on_ekene_down') {
          audio.stingerPreempt();
          void audio.play('music.sting_ekene_down', { bus: 'music' });
          setTimeout(() => audio.resumeBed(), 22000);
        }
      },
      onPhase: (phase: MissionPhase) => {
        __STATE.phase = phase;
        if (phase === 'kill_patrol') for (const c of controllers) c.alert();
        if (phase === 'complete' || phase === 'failed') onMissionEnd(phase);
      },
      spawnEnemies,
      onHint: (text: string) => hud.setHint(text),
      respawn: respawnMech,
      setHeatMult: (m: number) => { env.heatMult = m; },
      // multiplayer deck consumption (MpMission drives these)
      showRedeploy: (choices: Array<{ iid: string; label: string; spent: boolean }>, sub: string, onPick: (iid: string) => void) =>
        hud.showRedeploy(choices, sub, onPick),
      hideRedeploy: () => hud.hideRedeploy(),
      onSpectate: () => hud.showSpectate('DECK EXPENDED — SPECTATING · the match continues without you'),
      redeployPlayer: (chassis: string): Mech => {
        if (player.def.id !== chassis) {
          const myTeam = teamOf.get(player);
          teamOf.delete(player);
          setPlayerChassis(chassis);
          if (myTeam) teamOf.set(player, myTeam);
        }
        return player;
      },
    };

    const ns = netSession.active;
    if (stage === 99 && ns) {
      const me = ns.roster.find((r) => r.id === ns.myId);
      const myTeam = me?.team ?? 'a';
      const mySpawn = me ? mpSlotCoord(me) : MP_TEAM_A[0];
      // the roster carries the server-validated first-drop chassis from the deck
      if (me?.chassis) setPlayerChassis(me.chassis);
      player.pos.set(mySpawn[0], terrain.heightAt(...mySpawn), mySpawn[1]);
      teamOf.set(player, myTeam);
      for (const e of ns.roster) {
        if (e.id === ns.myId) continue;
        if (e.bot && e.owner === ns.myId) {
          // a robot filling an empty seat, simulated by this client
          const m = addLocalBot(e, myTeam);
          const [sx, sz] = mpSlotCoord(e);
          ns.ownedBots.push({ id: e.id, mech: m, team: e.team, sx, sz, lastAttacker: 0, deadReported: false, diedAt: 0 });
        } else {
          addRemote(e, myTeam);
        }
      }
      ns.combatants = () => [{ m: player, team: myTeam }, ...[...teamOf].filter(([m]) => m !== player).map(([m, team]) => ({ m, team }))];

      // ctf: the flag standard at field center — repainted as teams convert it
      if (ns.mode === 'ctf') {
        const flagGroup = new THREE.Group();
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x55606a, roughness: 0.6, metalness: 0.7 });
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 34, 8), poleMat);
        pole.position.y = 17;
        pole.castShadow = true;
        flagGroup.add(pole);
        const bannerMat = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xffb347, emissiveIntensity: 0.6, side: THREE.DoubleSide });
        const banner = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 0.4), bannerMat);
        banner.position.set(6.4, 29, 0);
        flagGroup.add(banner);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 2, 10), poleMat);
        base.position.y = 1;
        flagGroup.add(base);
        flagGroup.position.set(0, terrain.heightAt(0, 0), 0);
        scene.add(flagGroup);
        ns.setFlagColor = (color: string) => {
          const hex = color === 'a' ? 0x39d98a : color === 'b' ? 0xff5533 : 0xffb347;
          bannerMat.color.setHex(hex);
          bannerMat.emissive.setHex(hex);
        };
      }

      mission = new MpMission(player, missionCallbacks, ns.mode, ns.myId, myTeam, mySpawn);
      // net → sim glue
      ns.client.on('rstate', (msg) => applyRemoteState(msg.id as number, msg.s as StatePacket));
      ns.client.on('rfire', (msg) => {
        const m = remoteById.get(msg.id as number);
        if (!m || !m.alive || !weapons) return;
        const aim = msg.aim as [number, number, number];
        for (const w of m.weaponsInGroup(msg.group as number)) w.cooldown = 0;
        weapons.fireGroup(m, msg.group as number, new THREE.Vector3(aim[0], aim[1], aim[2]), null, null);
      });
      ns.client.on('rdied', (msg) => {
        const m = remoteById.get(msg.id as number);
        if (m?.alive) m.kill('ct');
        mission?.notify?.('net', msg);
      });
      // deck redeploy: the roster entry's chassis changes; the replica is
      // rebuilt when its respawn lands (never mid-death)
      const rebuildRemote = (e: RosterEntry): Mech | undefined => {
        const old = remoteById.get(e.id);
        if (!old) return undefined;
        const v = visuals.get(old);
        if (v) scene.remove(v.root);
        visuals.delete(old);
        for (const arr of [enemies, friends]) {
          const i = arr.indexOf(old);
          if (i >= 0) arr.splice(i, 1);
        }
        remoteById.delete(e.id);
        netIdOf.delete(old);
        teamOf.delete(old);
        netLerp.delete(e.id);
        addRemote(e, myTeam);
        return remoteById.get(e.id);
      };
      ns.client.on('rredeploy', (msg) => {
        const e = ns.roster.find((r) => r.id === msg.id);
        if (e && typeof msg.chassis === 'string' && MECHS[msg.chassis]) e.chassis = msg.chassis;
      });
      ns.client.on('rrespawn', (msg) => {
        const e = ns.roster.find((r) => r.id === msg.id);
        if (!e) return;
        let m = remoteById.get(msg.id as number);
        if (m && m.def.id !== e.chassis) m = rebuildRemote(e);
        // drop the stale death-site lerp target or the respawn rubber-bands
        netLerp.delete(msg.id as number);
        if (m) respawnMech(m, ...mpSlotCoord(e));
      });
      ns.client.on('score', (msg) => mission?.notify?.('net', msg));
      ns.client.on('clock', (msg) => mission?.notify?.('net', msg));
      ns.client.on('flag', (msg) => mission?.notify?.('net', msg));
      ns.client.on('host', (msg) => mission?.notify?.('net', msg));
      ns.client.on('end', (msg) => mission?.notify?.('net', msg));
      // deck consumption protocol — without these the pilot stays dead forever
      ns.client.on('deployok', (msg) => mission?.notify?.('net', msg));
      ns.client.on('deckstate', (msg) => mission?.notify?.('net', msg));
      ns.client.on('deckout', (msg) => mission?.notify?.('net', msg));
      // transport death: no server, no clock, no end card — synthesize the end
      ns.client.on('__close', () => {
        // Mark the drop before unwinding so the end screen can say "connection lost"
        // rather than presenting a transport failure as a legitimate 0-0 draw.
        netDropped = true;
        mission?.notify?.('net', { t: 'end', reason: 'disconnect', winner: 'draw', teams: { a: 0, b: 0 }, table: [] });
      });
      ns.client.on('pleave', (msg) => {
        const m = remoteById.get(msg.id as number);
        if (m?.alive) m.kill('ct');
      });
    } else if (stage === 0) {
      // BASIC TRAINING — input-gated controls tutorial on the calibration pad
      btMission = new BasicTrainingMission(player, terrain, missionCallbacks, btAdapter, store.takeBtPhase(), nav);
      mission = btMission;
      const bt = btMission;
      btOverlay = new BtOverlay(document.body, {
        playSfx: (id, volume) => { void audio.play(id, { bus: 'ui', volume: volume ?? 0.8 }); },
        highlight: (ids) => hud.highlight(ids),
        subtitle: (text) => hud.subtitle('PROMPT', text, 4),
        onResume: () => input.requestPointerLock(),
        onSkipAll: () => bt.skipAll(),
        onSummary: (action, phase) => {
          if (action === 'campaign') { store.setResume(1); reloadAfterSync(); return; }
          if (action === 'replay' && phase) { store.setBtPhase(phase); store.setResume(0); reloadAfterSync(); return; }
          reloadAfterSync();
        },
      });
      bt.onEvent((ev) => btOverlay?.handle(ev));
      if (TEST_MODE) (window as unknown as Record<string, unknown>).__BT = bt;
    } else if (campaignEntry) {
      const campaignHooks = {
        spawnAllies,
        addStructure: (spec: StructureSpec) => {
          addMissionStructure(terrain!, spec);
          staticColliders = buildStaticColliders(terrain!);
        },
        barrage,
        branch: () => currentBranch,
      };
      mission = new CampaignMission(player, terrain, missionCallbacks, campaignHooks, campaignEntry);
    } else {
      mission = stage === 90 ? new SkirmishMission(player, terrain, missionCallbacks)
        : createMission(stage, player, terrain, missionCallbacks);
    }

    audio.init();
    // pre-mission briefing card: the radio call plays until LAUNCH cuts it
    if (campaignEntry && !TEST_MODE) await showBriefing(campaignEntry);
    audio.preload(['vo.cairn.litany', 'sfx.startup', 'sfx.footstep_salt', 'sfx.laser', 'sfx.ac40', 'sfx.rockets', 'sfx.klaxon', 'sfx.shutdown', 'sfx.impact_armor', 'sfx.eject', 'vo.cairn.mission_failed']);
    if (stage === 0) audio.preload(['ui.bt.confirm', 'ui.bt.hint', 'ui.bt.phase', 'amb.bt.pad', 'music.mus_training', 'sfx.coolant', 'sfx.lock', 'ui.nav.ping']);
    void audio.play('sfx.startup', { volume: 1 });
    void audio.play('sfx.cockpit_amb', { loop: true, volume: 0.45 });
    // Basic Training: pad ambience + the low training bed (mus_training) —
    // both loop on the music bus so CAIRN's constant VO ducks them together
    if (stage === 0) {
      void audio.play('amb.bt.pad', { loop: true, bus: 'music', volume: 0.5 });
      void audio.play('music.mus_training', { loop: true, bus: 'music', volume: 0.9 });
    }
    else {
      // biome bed per bible §6.3 (storm shares the coast bed; anchor is the
      // arcology's pitch world); m16/m24 swap to exclusive duel suites — the
      // duel-start sting decays into silence and the suite rises out of it
      const BIOME_ALIAS: Record<string, string> = { storm: 'coast', anchor: 'arcology' };
      const map = campaignEntry?.cfg.map as string | undefined;
      const biome = map ? (BIOME_ALIAS[map] ?? map) : 'coast';
      const suite = campaignEntry?.cfg.id === 'm16' ? 'mus_duel_rauk'
        : campaignEntry?.cfg.id === 'm24' ? 'mus_duel_sol' : undefined;
      if (suite) {
        void audio.play('music.sting_duel_start', { bus: 'music' });
        setTimeout(() => void audio.startMusic({ suite, biome }), 4500);
      } else void audio.startMusic({ biome });
    }
    mission.start();

    if (TEST_MODE) {
      mission.bootTimer = 12.4; // skip most of the litany wait
      if (!PARAMS.has('cockpit')) rig.toggleMode();
      input.wantPointerLock = false;
      (window as unknown as Record<string, unknown>).__TELEPORT = (x: number, z: number) => {
        player.pos.set(x, terrain!.heightAt(x, z), z);
      };
      // campaign completion-driver hooks (scripts/test_campaign.mjs)
      (window as unknown as Record<string, unknown>).__DAMAGE_STRUCT = (id: string, amt: number) => {
        const s = terrain!.structures.find((st) => st.id === id);
        if (s) s.hp -= amt;
      };
      (window as unknown as Record<string, unknown>).__KILL_HOSTILES = () => {
        for (const e of enemies) if (e.alive) e.kill('ct');
      };
      (window as unknown as Record<string, unknown>).__GOD = (on: boolean) => { player.invulnerable = on; };
      (window as unknown as Record<string, unknown>).__TICKS = (n: number) => {
        for (let i = 0; i < n; i++) tick(STEP);
      };
      // synchronous sim state — hidden-tab timer throttling starves the frame
      // loop that refreshes __STATE, so the driver reads the mission directly
      (window as unknown as Record<string, unknown>).__SIM = () => ({
        phase: mission?.phase ?? 'init',
        step: mission instanceof CampaignMission ? mission.currentStep : -1,
        boot: player.bootLocked,
      });
      // torso-aim axis injection for the tutorial input-injection suite — feeds the
      // SAME accumulator real mousemove events feed, so the full chain stays exercised
      (window as unknown as Record<string, unknown>).__MOUSE = (dx: number, dy: number) => {
        input.mouseDX += dx;
        input.mouseDY += dy;
      };

      // ---- PATHLIGHT test hooks ----
      const w = window as unknown as Record<string, unknown>;
      w.__NAV_START = (id: string) => nav?.startRoute(id);
      w.__NAV_STOP = () => nav?.stopRoute();
      w.__NAV_EVENTS = () => nav ? [...nav.eventLog] : [];
      w.__NAV_DEBUG = () => ({
        hud: hud.navDebug(),
        world: navPath?.debug() ?? { chevrons: 0, beacon: false, ring: false },
        view: nav ? { ...nav.view } : null,
      });
      // per-tick CPU cost of the nav system, ms/call over n calls
      w.__NAV_PERF = (n: number) => {
        if (!nav) return -1;
        const t0 = performance.now();
        for (let i = 0; i < n; i++) nav.update(STEP);
        return (performance.now() - t0) / n;
      };
      w.__NAV_DRAWSTATS = () => {
        // reflect the CURRENT route state before rendering — the probe may run
        // between frames, right after a start/stop
        navPath?.update(nav && nav.view.active ? nav.view : null, player.pos.x, player.pos.z, {
          chevrons: navPrefs.chevrons, beacon: navPrefs.beacon,
          reducedMotion: true, reducedFlash: false,
        });
        renderer.render(scene, rig.camera);
        return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
      };
      // LOS content check: each authored leg (player→wp0, then wp chain) is
      // raycast against the live static colliders at walker body height
      w.__NAV_LOS = (routeId: string) => {
        const def = navRoute(routeId);
        if (!def) return { error: `unknown route ${routeId}` };
        const blocked: string[] = [];
        const pts: Array<[number, number, string]> = [[player.pos.x, player.pos.z, 'player']];
        for (const wp of def.waypoints) {
          if (wp.position) pts.push([wp.position[0], wp.position[2], wp.id]);
        }
        for (let i = 0; i + 1 < pts.length; i++) {
          const [x1, z1] = pts[i], [x2, z2, id2] = pts[i + 1];
          for (const b of staticColliders) {
            const minY = b.minY, maxY = b.maxY;
            if (maxY < 1 || minY > 8) continue;
            // 2D slab test (same math as the sim's navmath.segmentHitsAabb)
            const dx = x2 - x1, dz = z2 - z1;
            let t0 = 0, t1 = 1, hit = true;
            for (const [p, lo, hi, d] of [[x1, b.minX - 2.5, b.maxX + 2.5, dx], [z1, b.minZ - 2.5, b.maxZ + 2.5, dz]] as const) {
              if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { hit = false; break; } continue; }
              let ta = (lo - p) / d, tb = (hi - p) / d;
              if (ta > tb) { const tt = ta; ta = tb; tb = tt; }
              t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
              if (t0 > t1) { hit = false; break; }
            }
            if (hit) { blocked.push(`${pts[i][2]}→${id2}`); break; }
          }
        }
        return { blocked };
      };
      // invariant sweep: full circle of leg headings × 6 distances → at every
      // sample ≥ 1 guidance layer must be visible and no frame is ambiguous
      w.__NAV_INVARIANT = () => {
        if (!nav || !nav.view.active || !terrain || !navPath) return { error: 'no active route' };
        const savedPos = player.pos.clone();
        const savedLeg = player.legYaw, savedTorso = player.torsoYaw;
        const wx = nav.view.wpX, wz = nav.view.wpZ;
        const dists = [25, 60, 150, 400, 800, 1500];
        const violations: string[] = [];
        const statesSeen = new Set<string>();
        for (const d of dists) {
          const px = wx, pz = wz + d; // due south of the wp; heading sweep covers all bearings
          player.pos.set(px, terrain.heightAt(px, pz), pz);
          for (let hDeg = 0; hDeg < 360; hDeg += 6) {
            player.legYaw = hDeg * Math.PI / 180;
            player.torsoYaw = 0;
            for (let i = 0; i < 24; i++) nav.update(STEP); // let dwell/hysteresis settle
            navPath.update(nav.view, player.pos.x, player.pos.z, {
              chevrons: navPrefs.chevrons, beacon: navPrefs.beacon,
              reducedMotion: true, reducedFlash: false,
            });
            hud.update(STEP, player, null, null, [player], null, rig.camera, null, nav.view, navPrefs);
            const hd = hud.navDebug();
            const wd = navPath.debug();
            statesSeen.add(nav.view.state);
            const layers = (hd.arrow ? 1 : 0) + (hd.compass ? 1 : 0) + (hd.label ? 1 : 0)
              + (wd.beacon ? 1 : 0) + (wd.chevrons > 0 ? 1 : 0);
            if (layers < 1) violations.push(`d=${d} h=${hDeg}: zero layers`);
            if (!nav.view.active) violations.push(`d=${d} h=${hDeg}: route lost`);
          }
        }
        player.pos.copy(savedPos);
        player.legYaw = savedLeg;
        player.torsoYaw = savedTorso;
        return { violations, states: [...statesSeen], samples: dists.length * 60 };
      };
    } else {
      input.requestPointerLock();
    }
    setTimeout(() => hud.bootReveal(), 1200);
    started = true;
    __STATE.bc.push('started');
  }

  if (TEST_MODE) {
    const raw = parseInt(PARAMS.get('stage') ?? '1', 10);
    const stage = !Number.isFinite(raw) ? 1 : raw === 90 ? 90 : Math.min(MAX_STAGE, Math.max(0, raw));
    void launch(stage, null, PARAMS.get('branch') === 'b' ? 'b' : undefined);
  } else {
    // Title theme (bible §6.2) from page load: start immediately — in a
    // suspended context the loop sits queued and becomes audible the moment
    // resume() lands, so browsers that allow autoplay get music at load and
    // the rest get it on the first interaction anywhere. launch() stops it.
    let themeOn = false;
    const primeTheme = (): void => {
      audio.init(); // re-entrant: repeat calls re-attempt resume
      if (!themeOn && !started) {
        themeOn = true;
        void audio.play('music.theme_main', { bus: 'music', loop: true, volume: 0.6 });
      }
    };
    primeTheme();
    window.addEventListener('pointerdown', primeTheme, { once: true });
    window.addEventListener('keydown', primeTheme, { once: true });

    // the 4th arg primes the AudioContext on a real user gesture — LAN matches
    // launch from a server message, which is not a gesture
    new StartScreen(
      store, stageList(),
      (stage, prof, branch) => void launch(stage, prof, branch),
      primeTheme,
      (id, vol) => { void audio.play(id, { bus: 'ui', volume: vol ?? 0.7 }); },
    ).show();
  }

  renderer.domElement.addEventListener('click', () => {
    // never steal the cursor back while the tutorial pause menu wants it
    if (started && !btOverlay?.pauseVisible) input.requestPointerLock();
  });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    rig.camera.aspect = window.innerWidth / window.innerHeight;
    rig.camera.updateProjectionMatrix();
  });

  // --- fixed-step loop ---
  const env = { heatMult: 1.0, heightAt: (x: number, z: number) => terrain ? terrain.heightAt(x, z) : 0 };
  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 60;
  let elapsed = 0;
  let klaxonOn = false;
  let heat80Warned = false;
  let heatCritWarned = false;
  let overrideAnnounced = false;
  let testFireTimer = 1;
  let fpsAcc = 0, fpsN = 0;

  let rafQueued = false;
  let lastFrameAt = 0;
  function scheduleFrame(): void {
    if (rafQueued) return;
    rafQueued = true;
    requestAnimationFrame((t) => { rafQueued = false; frame(t); });
  }
  // headless test runs render through swiftshader at ~5 fps — without a wider
  // catch-up window the sim would crawl at a fraction of real time and starve
  // the injection suite. Test mode alone gets the bigger dt/step budget.
  const DT_CAP = TEST_MODE ? 0.5 : 0.1;
  const STEP_CAP = TEST_MODE ? 30 : 5;
  let frameN = 0;
  function frame(now: number): void {
    scheduleFrame();
    const dt = Math.min(DT_CAP, (now - last) / 1000);
    last = now;
    lastFrameAt = now;
    frameN++;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) { __STATE.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    if (!started || !mission || !terrain) { input.endFrame(); renderer.render(scene, rig.camera); return; }
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < STEP_CAP) {
      tick(STEP);
      acc -= STEP;
      steps++;
    }
    // drop sim-time debt after a stall instead of fast-forwarding later
    if (steps === STEP_CAP) acc = 0;
    elapsed += dt;

    for (const m of allMechs()) animateMech(visuals.get(m)!, m, dt);
    // the camera sits inside the head in cockpit view — never render our own
    // hull across the lens (enemy raycasts ignore visibility, so hits still land)
    visuals.get(player)!.root.visible = rig.mode === 'chase';
    effects.update(dt, elapsed);
    physics?.step(dt);
    rig.update(dt, player, visuals.get(player)!, terrain.heightAt);
    trackSun(scene, player.pos);

    const navView = nav?.view ?? null;
    const navActive = !!navView?.active;
    const objPos = mission.objectivePoint();
    // while a PATHLIGHT route is active the cyan beacon owns the destination —
    // never two beams at the same goal
    objMarker.visible = objPos !== null && !navActive;
    if (objPos && !navActive) {
      objMarker.position.set(objPos.x, terrain.heightAt(objPos.x, objPos.z), objPos.z);
      objDiamond.position.y = 26 + Math.sin(elapsed * 2.2) * 2;
      objDiamond.rotation.y = elapsed * 1.4;
    }
    navPath?.update(navView, player.pos.x, player.pos.z, {
      chevrons: navPrefs.chevrons, beacon: navPrefs.beacon,
      reducedMotion: navReducedMotion(navPrefs), reducedFlash: navPrefs.reducedFlash,
    });
    // audio-navigation assist: spatialized ping, interval closing with distance,
    // pitch rising inside the last 30 m — the route is completable ears-only
    // (silent while the tutorial pause menu is up — pause really pauses)
    if (navActive && navView && navPrefs.audioBeacon !== 'off' && !btOverlay?.pauseVisible) {
      navPingT -= dt;
      if (navPingT <= 0) {
        const d = navView.distance;
        navPingT = 0.6 + Math.min(1, Math.max(0, (d - 30) / 370)) * 2.4;
        void audio.playNavPing(navPrefs.audioBeacon === 'full' ? 0.5 : 0.22,
          d < 30 ? 1.122 : 1, navView.camErrorRad);
      }
    } else {
      navPingT = 0.5;
    }
    // stuck ladder level 3: offer the consented reposition (hold-skip in
    // training) — never a teleport without consent, never unprompted
    if (navActive && navView && navView.stuckLevel >= 3 && navPrefs.assistReposition) {
      if (!navHintShown) {
        navHintShown = true;
        hud.setHint(resolveBindTokens(navString('hud.nav.offer.reposition')));
      }
    } else if (navHintShown) {
      navHintShown = false;
      hud.setHint('');
    }

    const leadPoint = computeLeadPoint();
    hud.update(dt, player, target, SUBTARGET_ORDER[subtargetIdx], allMechs(), objPos, rig.camera, leadPoint, navView, navPrefs);
    hud.setTimer(mission.timeLeft ?? null, mission.timerLabel ?? 'MATCH');
    rig.setLamps([
      player.heat > player.heatCap * 0.8,
      player.shutdown,
      player.zones.ll.destroyed || player.zones.rl.destroyed,
      player.weapons.some((w) => w.destroyed),
      !player.alive,
    ]);
    // Basic Training chrome: skip-hold fill, cheat sheet, Esc pause menu
    if (btOverlay && btMission) {
      const helpCode = codeOf('help');
      btOverlay.update(btMission.canSkipNow ? Math.max(0, skipHold) : 0,
        helpCode ? input.isDown(helpCode) : false);
      if (!TEST_MODE && btMission.phase === 'train'
        && wasPointerLocked && !input.pointerLocked && !btOverlay.pauseVisible) {
        btOverlay.showPause(true);
      }
      // an open pause menu really pauses: step time, hints, and detection freeze
      btMission.paused = btOverlay.pauseVisible;
    }
    wasPointerLocked = input.pointerLocked;

    // headless: software rendering dominates the frame budget — draw 1 in 3,
    // but keep world matrices fresh so targeting/hitscan raycasts stay exact
    if (!TEST_MODE || frameN % 3 === 0) renderer.render(scene, rig.camera);
    else scene.updateMatrixWorld();
    __STATE.playerPos = [player.pos.x, player.pos.y, player.pos.z].map((v) => Math.round(v));
    const e0 = enemies.find((e) => e.alive) ?? enemies[0];
    __STATE.enemyPos = e0 ? [e0.pos.x, e0.pos.y, e0.pos.z].map((v) => Math.round(v)) : [];
    __STATE.enemyAlive = enemies.some((e) => e.alive);
    __STATE.torsoYaw = Math.round(player.torsoYaw * 1000) / 1000;
    __STATE.torsoPitch = Math.round(player.torsoPitch * 1000) / 1000;
    __STATE.bootLocked = player.bootLocked;
    __STATE.btStep = btMission?.currentStepId ?? '';
    __STATE.legYaw = Math.round(player.legYaw * 1000) / 1000;
    __STATE.heat = Math.round(player.heat);
    __STATE.shutdown = player.shutdown;
    __STATE.throttle = Math.round(player.throttle * 100) / 100;
    __STATE.enemies = enemies.map((m) => [m.id, Math.round(m.pos.x), Math.round(m.pos.y), Math.round(m.pos.z), m.alive ? 1 : 0]);
    __STATE.campStep = mission instanceof CampaignMission ? mission.currentStep : -1;
    __STATE.navRoute = navView?.active ? navView.routeId : '';
    __STATE.navWp = navView?.active ? navView.wpId : '';
    __STATE.navState = navView?.active ? navView.state : '';
    __STATE.navDist = navView?.active ? Math.round(navView.distance) : 0;
    __STATE.navLegErrDeg = navView?.active ? Math.round(navView.legErrorRad * 180 / Math.PI) : 0;
    __STATE.navCamErrDeg = navView?.active ? Math.round(navView.camErrorRad * 180 / Math.PI) : 0;
    __STATE.navStuck = navView?.active ? navView.stuckLevel : 0;
    __STATE.ready = true;
  }

  function computeLeadPoint(): THREE.Vector3 | null {
    if (!target || !target.alive) return null;
    const hasBallistic = player.weapons.some((w) => w.def.type === 'ballistic' && !w.destroyed && w.def.projectileSpeed > 0);
    if (!hasBallistic) return null;
    const dist = target.pos.distanceTo(player.pos);
    const tof = dist / 900;
    return target.pos.clone().add(new THREE.Vector3(
      Math.sin(target.legYaw) * target.speed * tof, 7,
      Math.cos(target.legYaw) * target.speed * tof,
    ));
  }

  function playerAimPoint(): THREE.Vector3 {
    const dir = new THREE.Vector3();
    rig.camera.getWorldDirection(dir);
    return rig.camera.position.clone().addScaledVector(dir, 1500);
  }

  let tickedOnce = false;
  function tick(dt: number): void {
    if (!mission || !weapons) return;
    if (!tickedOnce) { tickedOnce = true; __STATE.bc.push('tick'); }
    const wpns = weapons;

    // --- player input (codes resolved through the action-bindings registry) ---
    const down = (a: string): boolean => { const c = codeOf(a); return c ? input.isDown(c) : false; };
    const pressed = (a: string): boolean => { const c = codeOf(a); return c ? input.wasPressed(c) : false; };

    // hold F8 — skip the current tutorial step (no-op outside Basic Training)
    if (down('skip_step')) {
      skipHold += dt;
      if (skipHold >= 1.0) {
        skipHold = -999; // once per hold
        // a consented hold-skip while the reposition offer is up IS the
        // reposition path in training — log it as a signposting defect signal
        if (nav?.view.stuckLevel === 3) {
          try {
            const arr = JSON.parse(localStorage.getItem('veyra.telemetry.v1') ?? '[]') as unknown[];
            arr.push({ t: Date.now(), ev: 'nav_reposition_used', route: nav.view.routeId, wp: nav.view.wpId });
            while (arr.length > 500) arr.shift();
            localStorage.setItem('veyra.telemetry.v1', JSON.stringify(arr));
          } catch { /* telemetry is best-effort */ }
        }
        mission.notify?.('skip');
      }
    } else {
      skipHold = 0;
    }
    rig.setZoom(down('zoom') && player.alive && !player.bootLocked && !player.shutdown);

    if (player.alive && !player.bootLocked) {
      if (down('throttle_up')) player.throttleTarget = Math.min(1, player.throttleTarget + 0.9 * dt);
      if (down('throttle_down')) player.throttleTarget = Math.max(-0.5, player.throttleTarget - 0.9 * dt);
      if (pressed('full_stop')) { player.throttleTarget = 0; player.throttle = 0; }
      // yaw convention: +yaw = turn left (camera renders at yaw+PI), so
      // mouse-right and D must DECREASE yaw
      if (down('steer_left')) player.legTurn(1, dt);
      if (down('steer_right')) player.legTurn(-1, dt);
      player.twistBy(-input.mouseDX * 0.0022, -input.mouseDY * 0.0018);
      if (pressed('center_torso')) player.centerTorso();
      player.jetting = down('jump') && player.def.jumpJets && !player.shutdown;
      if (player.jetting && player.grounded && player.jumpFuel > 0.05) {
        player.grounded = false;
        player.vy = Math.max(player.vy, 2);
        void audio.play('sfx.jumpjet', { volume: 0.7 });
      }
      player.overrideHeld = down('override');
      if (pressed('coolant_flush') && player.fireCoolant()) {
        void audio.play('sfx.coolant', { volume: 0.8 });
        mission.notify?.('flush');
      }
      if (pressed('camera_toggle')) rig.toggleMode();

      // targeting
      if (pressed('target_cycle')) {
        const living = enemies.filter((m) => m.alive)
          .sort((a, b) => a.pos.distanceTo(player.pos) - b.pos.distanceTo(player.pos));
        if (living.length) {
          const idx = target ? (living.indexOf(target) + 1) % living.length : 0;
          target = living[idx];
          subtargetIdx = 0;
          void audio.play('sfx.lock', { bus: 'ui', volume: 0.6 });
          mission.notify?.('target', { mech: target, via: 'cycle' });
        }
      }
      if (pressed('target_reticle')) {
        centerRay.setFromCamera(new THREE.Vector2(0, 0), rig.camera);
        centerRay.far = 1600;
        const candidates: THREE.Object3D[] = [];
        for (const m of enemies) {
          if (!m.alive) continue;
          const v = visuals.get(m)!;
          for (const z of ZONES) {
            if ((z === 'la' || z === 'ra') && m.zones[z].destroyed) continue; // severed arms are debris
            candidates.push(...v.zoneMeshes[z]);
          }
        }
        const hits = centerRay.intersectObjects(candidates, false);
        if (hits.length) {
          const id = hits[0].object.userData.mechId as number;
          const m = enemies.find((mm) => mm.id === id);
          if (m) {
            target = m;
            subtargetIdx = 0;
            void audio.play('sfx.lock', { bus: 'ui', volume: 0.6 });
            mission.notify?.('target', { mech: m, via: 'reticle' });
          }
        }
      }
      if (pressed('subtarget_cycle') && target) {
        for (let i = 0; i < SUBTARGET_ORDER.length; i++) {
          subtargetIdx = (subtargetIdx + 1) % SUBTARGET_ORDER.length;
          const z = SUBTARGET_ORDER[subtargetIdx];
          if (!z || !target.zones[z].destroyed) break; // skip zones already gone
        }
        mission.notify?.('subtarget');
      }

      // weapon groups
      for (let g = 1; g <= 6; g++) {
        if (input.wasPressed(codeOf(`group_${g}`) ?? `Digit${g}`)) {
          const aim = playerAimPoint();
          const fired = wpns.fireGroup(player, g, aim, target, SUBTARGET_ORDER[subtargetIdx]);
          if (fired) {
            // broadcast own fire ONCE per volley so other clients replay it —
            // the victim-authoritative model needs the victim to simulate these shots
            netSession.active?.client.send({ t: 'fire', group: g, aim: [aim.x, aim.y, aim.z] });
            const w = player.weaponsInGroup(g)[0];
            const sfx = w ? (w.def.type === 'energy' ? 'sfx.laser' : w.def.type === 'missile' ? 'sfx.rockets' : 'sfx.ac40') : 'sfx.ac40';
            void audio.play(sfx, { volume: 0.85 });
            rig.addShake(w && w.def.type === 'ballistic' ? 0.1 : 0.05);
          }
        }
      }
    }

    // heat warnings
    const hf = player.heat / player.heatCap;
    if (hf > 0.8 && !heat80Warned && !player.shutdown) {
      heat80Warned = true;
      void audio.playVO('vo.cairn.heat80', 'CAIRN', 'Heat at eighty percent. Watch your curve.', false);
    }
    if (hf > 0.93 && !heatCritWarned && !player.shutdown) {
      heatCritWarned = true;
      void audio.playVO('vo.cairn.heat_critical', 'CAIRN', 'Heat critical. Shutdown imminent.', false);
    }
    // Basic Training speaks its own override line (E4) — skip the campaign bark there
    if (player.overrideHeld && player.heat > player.heatCap && !overrideAnnounced && currentStage !== 0) {
      overrideAnnounced = true;
      void audio.playVO('vo.cairn.override', 'CAIRN', 'Override accepted. Core integrity is your responsibility, Lodestar.', false);
    }
    if (hf < 0.6) { heat80Warned = false; heatCritWarned = false; overrideAnnounced = false; }
    const wantKlaxon = hf > 0.85 && player.alive && !player.shutdown;
    if (wantKlaxon && !klaxonOn) { klaxonOn = true; void audio.play('sfx.klaxon', { loop: true, volume: 0.5 }); }
    if (!wantKlaxon && klaxonOn) { klaxonOn = false; audio.stopLoop('sfx.klaxon'); }

    // test-mode autopilot: walk forward and periodically fire so the smoke
    // test exercises the full combat path (hitscan, projectiles, heat).
    // Basic Training is driven by the injection test instead — no autopilot.
    if (TEST_MODE && currentStage !== 0 && !player.bootLocked && player.alive) {
      player.throttleTarget = 0.55;
      testFireTimer -= dt;
      if (testFireTimer <= 0) {
        testFireTimer = 2.2;
        const aim = playerAimPoint();
        wpns.fireGroup(player, 1, aim, target, null);
        wpns.fireGroup(player, 2, aim, target, null);
      }
    }

    // --- sim updates (net-driven replicas skip local physics — snapshots own them) ---
    for (const m of allMechs()) {
      if (remoteById.size && remoteById.get(netIdOf.get(m) ?? -1) === m) continue; // replicas skip local physics
      m.update(dt, env);
      resolveMechVsStatics(m, staticColliders);
    }
    applyNetLerp(dt);
    separateMechs(allMechs());
    for (const c of controllers) c.update(dt, player);
    wpns.update(dt);
    checkStructures();
    mission.update(dt);
    // PATHLIGHT route state advances in the fixed step, beside the mission —
    // renderer and HUD only read nav.view. The tutorial pause really pauses:
    // route timers, arrivals, the stuck ladder, and nav VO freeze with it.
    if (!btMission?.paused) nav?.update(dt);

    // quick-match: broadcast own state ~12 Hz; owned robots on alternate beats (~6 Hz)
    const ns = netSession.active;
    if (ns && started) {
      netSendAcc += dt;
      if (netSendAcc >= 0.08) {
        netSendAcc = 0;
        netBeat++;
        // a downed machine broadcasts nothing — corpse-position packets would
        // drag the replica back to the death site across a redeploy respawn
        if (player.alive) ns.client.send({ t: 'state', s: packState(player) });
        if (netBeat % 2 === 0) {
          for (const b of ns.ownedBots) {
            if (b.mech.alive) ns.client.send({ t: 'state', who: b.id, s: packState(b.mech) });
          }
        }
      }
    }

    // threat state for the vertical score (bible §6.4): calm 0 / alert 1 /
    // engaged 2 / overwhelmed 3 — escalation is instant, de-escalation held
    {
      const engaged = ns
        ? enemies.filter((m) => m.alive && m.pos.distanceTo(player.pos) < 500).length
        : controllers.filter((c) => c.engaged && c.mech.alive).length;
      const aware = !ns && engaged === 0 &&
        controllers.some((c) => c.mech.alive && c.mech.pos.distanceTo(player.pos) < 500);
      audio.setCombat(engaged >= 3 ? 3 : engaged >= 1 ? 2 : aware ? 1 : 0);
    }
    // clear edge-triggered input only after a tick consumed it, so presses
    // landing on zero-tick frames (>60 Hz displays) are never dropped
    input.endFrame();
  }

  scheduleFrame();
  // hidden/throttled tabs starve requestAnimationFrame — in an online match the sim
  // and net sync must keep breathing, so a coarse heartbeat drives frames when rAF stalls.
  // Headless test runs starve rAF permanently, so test mode heartbeats at sim rate —
  // otherwise the injection suite would run the tutorial at ~1/4 speed.
  setInterval(() => {
    const now = performance.now();
    if (started && now - lastFrameAt > (TEST_MODE ? 20 : 350)) frame(now);
  }, TEST_MODE ? 8 : 250);
}

try {
  boot();
} catch (err) {
  __STATE.errors.push(String(err));
  console.error(err);
}
