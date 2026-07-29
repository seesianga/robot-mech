import * as THREE from 'three';
import type { Mech } from '../sim/mech';
import type { WeaponsSystem } from '../sim/weapons';

type AIState = 'patrol' | 'engage' | 'cooloff';

/**
 * Directorate pilot brain: patrol → engage → back off to cool.
 * Respects its own heat and telegraphs the cool-off so the player learns to punish it.
 */
export class EnemyController {
  state: AIState = 'patrol';
  alerted = false;
  /** training-range machine: walks its rail but never detects, engages, or fires */
  passive = false;
  /** hull fraction below which the pilot yields (powers down in place); null = fights to the end */
  yieldFrac: number | null = null;
  yielded = false;
  /** candidate targets (multiplayer bots fight whole teams); null = the campaign default, the player */
  targets: (() => Mech[]) | null = null;
  /** fireteam ally: while relaxed, keep formation on this machine instead of walking a rail */
  escortOf: Mech | null = null;
  /** false = walk the waypoint list once and stand at the end (escort subjects) */
  loop = true;
  private routeDone = false;
  private formationAngle = Math.random() * Math.PI * 2;
  private waypointIndex = 0;
  private strafeDir = 1;
  private strafeTimer = 0;
  private aimError = new THREE.Vector3();
  private aimErrorTimer = 0;
  private torsoAimYaw = 0;
  private torsoAimPitch = 0;

  constructor(
    public mech: Mech,
    private waypoints: THREE.Vector3[],
    private weapons: WeaponsSystem,
  ) {}

  get engaged(): boolean {
    return this.state !== 'patrol' && this.mech.alive;
  }

  alert(): void {
    this.alerted = true;
  }

  update(dt: number, player: Mech): void {
    const m = this.mech;
    if (!m.alive || m.shutdown) return;
    if (m.bootLocked) {
      // powered down (dormant hulk, forced yield) — reads as disengaged everywhere
      this.state = 'patrol';
      return;
    }

    if (this.yieldFrac !== null && !this.yielded) {
      let cur = 0, max = 0;
      for (const z of Object.values(m.zones)) { cur += z.armor + z.structure; max += z.armorMax + z.structureMax; }
      if (cur / max < this.yieldFrac) {
        this.yielded = true;
        m.bootLocked = true; // powers down where it stands — alive, silent, done fighting
        m.throttleTarget = 0;
      }
    }
    if (this.passive || this.yielded) {
      // never escalates; a boot-locked hulk stands frozen, a live drone walks its rail
      this.state = 'patrol';
      this.alerted = false;
    }

    // pick the nearest live foe — the campaign default is the player; multiplayer
    // bots get a team-aware candidate list and fight whoever is closest
    const candidates = this.targets ? this.targets() : [player];
    let foe: Mech | null = null;
    let dist = Infinity;
    for (const c of candidates) {
      if (!c.alive || c.bootLocked) continue;
      const d = c.pos.distanceTo(m.pos);
      if (d < dist) { dist = d; foe = c; }
    }

    if (!foe) {
      if (this.state !== 'patrol') { this.state = 'patrol'; m.throttleTarget = 0.3; }
      foe = null;
    }
    const toPlayer = foe ? new THREE.Vector3().subVectors(foe.pos, m.pos) : new THREE.Vector3();

    // a boot-locked pilot can't move or shoot — nobody gets a free execution
    // during the startup litany. No detection, no aggression.
    const foeVulnerable = foe !== null;

    // detection
    if (!this.passive && !this.yielded) {
      if (!this.alerted && foeVulnerable && dist < 550) this.alerted = true;
      if (this.alerted && this.state === 'patrol' && foeVulnerable) this.state = 'engage';
    }
    if (!foeVulnerable && this.state !== 'patrol') {
      this.state = 'patrol';
      m.throttleTarget = 0.3;
      return;
    }

    // heat discipline — telegraphed retreat
    const heatFrac = m.heat / m.heatCap;
    if (this.state === 'engage' && heatFrac > 0.82) this.state = 'cooloff';
    if (this.state === 'cooloff' && heatFrac < 0.45) this.state = 'engage';

    if (this.state === 'patrol') {
      if (this.escortOf) {
        // fireteam formation: hold a slot ~36 m off the leader, walk when it drifts
        const lead = this.escortOf;
        const slotX = lead.pos.x + Math.sin(this.formationAngle) * 36;
        const slotZ = lead.pos.z + Math.cos(this.formationAngle) * 36;
        const dx = slotX - m.pos.x, dz = slotZ - m.pos.z;
        const dSlot = Math.hypot(dx, dz);
        if (dSlot > 30) {
          this.steerToward(Math.atan2(dx, dz), dt);
          m.throttleTarget = dSlot > 140 ? 0.85 : 0.45;
        } else {
          m.throttleTarget = 0;
        }
      } else if (!this.waypoints.length || this.routeDone) {
        m.throttleTarget = 0;
      } else {
        const wp = this.waypoints[this.waypointIndex];
        const toWp = new THREE.Vector3().subVectors(wp, m.pos);
        toWp.y = 0;
        if (toWp.length() < 25) {
          if (!this.loop && this.waypointIndex >= this.waypoints.length - 1) {
            this.routeDone = true;
            m.throttleTarget = 0;
          } else {
            this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;
          }
        } else {
          this.steerToward(Math.atan2(toWp.x, toWp.z), dt);
          m.throttleTarget = 0.35;
        }
      }
      // torso follows legs while relaxed
      m.torsoYaw *= Math.max(0, 1 - dt * 2);
      return;
    }

    // --- engage / cooloff movement ---
    const bearingToPlayer = Math.atan2(toPlayer.x, toPlayer.z);

    if (this.state === 'cooloff') {
      // turn away and open the range — readable weakness window
      this.steerToward(bearingToPlayer + Math.PI, dt);
      m.throttleTarget = 0.85;
    } else {
      const idealRange = 320;
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeDir *= -1;
        this.strafeTimer = 3 + Math.random() * 4;
      }
      if (dist > idealRange + 120) {
        this.steerToward(bearingToPlayer, dt);
        m.throttleTarget = 0.9;
      } else if (dist < idealRange - 120) {
        this.steerToward(bearingToPlayer + Math.PI, dt);
        m.throttleTarget = 0.5;
      } else {
        // 45° oblique strafe keeps the player inside the torso twist arc
        this.steerToward(bearingToPlayer + (Math.PI / 4) * this.strafeDir, dt);
        m.throttleTarget = 0.55;
      }
    }

    // --- torso aim with imperfect tracking ---
    this.aimErrorTimer -= dt;
    if (this.aimErrorTimer <= 0) {
      this.aimErrorTimer = 0.8;
      const err = 2 + dist / 200 + Math.abs(foe ? foe.speed : 0) * 0.28;
      this.aimError.set((Math.random() - 0.5) * err, (Math.random() - 0.5) * err * 0.5, (Math.random() - 0.5) * err);
    }

    if (!foe) return;
    const aimPoint = foe.pos.clone();
    aimPoint.y += 6;
    aimPoint.add(this.aimError);
    // ballistic lead
    aimPoint.x += Math.sin(foe.legYaw) * foe.speed * (dist / 850);
    aimPoint.z += Math.cos(foe.legYaw) * foe.speed * (dist / 850);

    const toAim = new THREE.Vector3().subVectors(aimPoint, m.pos);
    const wantYaw = this.normalizeAngle(Math.atan2(toAim.x, toAim.z) - m.legYaw);
    const wantPitch = Math.atan2(toAim.y - 7, Math.hypot(toAim.x, toAim.z));
    const slew = THREE.MathUtils.degToRad(65) * dt;
    this.torsoAimYaw = m.torsoYaw + THREE.MathUtils.clamp(wantYaw - m.torsoYaw, -slew, slew);
    this.torsoAimPitch = m.torsoPitch + THREE.MathUtils.clamp(wantPitch - m.torsoPitch, -slew, slew);
    m.twistBy(this.torsoAimYaw - m.torsoYaw, this.torsoAimPitch - m.torsoPitch);

    // --- trigger discipline ---
    if (this.state === 'engage' && dist < 560 && Math.abs(wantYaw - m.torsoYaw) < 0.06) {
      for (const w of m.weapons) {
        if (!m.canFire(w) || w.def.type === 'utility') continue;
        if (dist > w.def.range) continue;
        if (m.heat + w.def.heat > m.heatCap * 0.95) continue;
        this.weapons.fireGroup(m, w.group, aimPoint, foe, null);
      }
    }
  }

  private steerToward(targetYaw: number, dt: number): void {
    const diff = this.normalizeAngle(targetYaw - this.mech.legYaw);
    this.mech.legTurn(THREE.MathUtils.clamp(diff * 3, -1, 1), dt);
  }

  private normalizeAngle(a: number): number {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
}
