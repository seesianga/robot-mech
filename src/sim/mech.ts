import * as THREE from 'three';
import type { DamageEvent, KillCause, MechDef, WeaponDef, ZoneId } from './types';
import { ZONE_TRANSFER, ZONES, armorFor, structureFor } from './types';
import { weaponDef } from './content';

export interface ZoneState {
  armor: number;
  armorMax: number;
  structure: number;
  structureMax: number;
  destroyed: boolean;
}

export interface WeaponMount {
  def: WeaponDef;
  zone: ZoneId;
  group: number;
  cooldown: number;
  ammo: number;
  destroyed: boolean;
}

export interface MechEnv {
  heatMult: number;
  heightAt(x: number, z: number): number;
}

let nextMechId = 1;

export class Mech {
  readonly id: number;
  readonly def: MechDef;
  readonly team: 'compact' | 'directorate';
  callsign: string;

  pos = new THREE.Vector3();
  /** leg facing, radians */
  legYaw = 0;
  /** torso yaw relative to legs, clamped to twist arc */
  torsoYaw = 0;
  torsoPitch = 0;

  throttleTarget = 0; // -0.5 .. 1
  throttle = 0;
  speed = 0; // m/s signed
  vy = 0;
  grounded = true;

  heat = 0;
  readonly heatCap = 100;
  shutdown = false;
  shutdownTimer = 0;
  overrideHeld = false;
  coolantFlushes = 1;
  coolantActive = 0;

  jumpFuel = 1;
  jetting = false;

  zones: Record<ZoneId, ZoneState>;
  weapons: WeaponMount[] = [];
  alive = true;
  killCause: KillCause | null = null;
  walkPhase = 0;

  /** set true by the mission while the player powers up; AI mechs stay live */
  bootLocked = false;

  /** training-range safeties: all incoming and self-inflicted damage is simulated */
  invulnerable = false;

  /** live-fire training fuse: damage lands for real but can never finish a kill —
   *  head/CT/last-leg structure is clamped at 1 (graduation duels, sparring) */
  noKill = false;

  /** paired with `invulnerable`: incoming fire still reports (flash, shake, impact)
   *  but costs nothing — the checkride reads as live fire and never marks the mech */
  ghostHits = false;

  /** per-machine speed multiplier (practice drones fly slow; 1 = chassis spec) */
  speedScale = 1;

  onFootfall: ((mech: Mech) => void) | null = null;
  onEvent: ((mech: Mech, ev: DamageEvent) => void) | null = null;

  constructor(defObj: MechDef, team: 'compact' | 'directorate', callsign: string) {
    this.id = nextMechId++;
    this.def = defObj;
    this.team = team;
    this.callsign = callsign;

    this.zones = {} as Record<ZoneId, ZoneState>;
    for (const z of ZONES) {
      const a = armorFor(defObj, z);
      const s = structureFor(defObj, z);
      this.zones[z] = { armor: a, armorMax: a, structure: s, structureMax: s, destroyed: false };
    }

    const mountZones: ZoneId[] = ['ra', 'la', 'lt', 'rt', 'ct', 'head'];
    defObj.defaultLoadout.forEach((wid, i) => {
      const def = weaponDef(wid);
      if (def.type === 'utility' && def.tags?.includes('coolant')) return;
      this.weapons.push({
        def,
        zone: mountZones[Math.min(i, mountZones.length - 1)],
        group: i + 1,
        cooldown: 0,
        ammo: def.ammo,
        destroyed: false,
      });
    });
  }

  /** Full factory reset for respawn waves — zones, heat, ammo, coolant, jets. */
  refit(): void {
    for (const z of ZONES) {
      const zs = this.zones[z];
      zs.armor = zs.armorMax;
      zs.structure = zs.structureMax;
      zs.destroyed = false;
    }
    for (const w of this.weapons) {
      w.cooldown = 0;
      w.ammo = w.def.ammo;
      w.destroyed = false;
    }
    this.alive = true;
    this.killCause = null;
    this.heat = 0;
    this.shutdown = false;
    this.shutdownTimer = 0;
    this.overrideHeld = false;
    this.coolantFlushes = 1;
    this.coolantActive = 0;
    this.jumpFuel = 1;
    this.jetting = false;
    this.throttleTarget = 0;
    this.throttle = 0;
    this.speed = 0;
    this.vy = 0;
    this.grounded = true;
  }

  get maxSpeedMs(): number {
    let cap = (this.def.speedKmh / 3.6) * this.speedScale;
    const legsLost = (this.zones.ll.destroyed ? 1 : 0) + (this.zones.rl.destroyed ? 1 : 0);
    if (legsLost >= 1) cap *= 0.4;
    return cap;
  }

  get turnRateDeg(): number {
    let r = Math.min(120, Math.max(35, 140 - this.def.tons));
    if (this.zones.ll.destroyed || this.zones.rl.destroyed) r *= 0.6;
    return r;
  }

  get facingYaw(): number {
    return this.legYaw + this.torsoYaw;
  }

  aimDir(out = new THREE.Vector3()): THREE.Vector3 {
    const yaw = this.facingYaw;
    const pitch = this.torsoPitch;
    out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    return out;
  }

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    out.set(Math.sin(this.legYaw), 0, Math.cos(this.legYaw));
    return out;
  }

  twistBy(dYaw: number, dPitch: number): void {
    if (this.shutdown || !this.alive || this.bootLocked) return;
    const arc = THREE.MathUtils.degToRad(this.def.twistArcDeg) / 2;
    this.torsoYaw = THREE.MathUtils.clamp(this.torsoYaw + dYaw, -arc, arc);
    this.torsoPitch = THREE.MathUtils.clamp(this.torsoPitch + dPitch, -0.5, 0.42);
  }

  centerTorso(): void {
    this.torsoYaw *= 0.0;
  }

  legTurn(dir: number, dt: number): void {
    if (this.shutdown || !this.alive || this.bootLocked) return;
    const rate = THREE.MathUtils.degToRad(this.turnRateDeg);
    this.legYaw += dir * rate * dt;
  }

  fireCoolant(): boolean {
    if (this.coolantFlushes <= 0 || this.coolantActive > 0) return false;
    this.coolantFlushes--;
    this.coolantActive = 2;
    return true;
  }

  update(dt: number, env: MechEnv): void {
    if (!this.alive) {
      // wrecks still obey gravity — a mech killed mid-jump comes down
      const ground = env.heightAt(this.pos.x, this.pos.z);
      if (this.pos.y > ground) {
        this.vy -= 26 * dt;
        this.pos.y = Math.max(ground, this.pos.y + this.vy * dt);
      }
      return;
    }

    // --- heat ---
    const dissipation = this.def.heatSinks * 0.35 * env.heatMult;
    this.heat = Math.max(0, this.heat - dissipation * dt * (this.shutdown ? 2 : 1));
    if (this.coolantActive > 0) {
      this.coolantActive = Math.max(0, this.coolantActive - dt);
      this.heat = Math.max(0, this.heat - 20 * dt);
    }

    if (!this.shutdown && this.heat >= this.heatCap && !this.overrideHeld) {
      this.shutdown = true;
      this.shutdownTimer = 5;
      this.throttle = 0;
      this.onEvent?.(this, { type: 'crit', zone: 'ct', weaponName: '__shutdown__' });
    }
    if (this.shutdown) {
      // holding override during the countdown forces the reactor back online
      // early and bypasses the cool-enough gate — at the usual override risk
      this.shutdownTimer -= dt * (this.overrideHeld ? 4 : 1);
      if (this.shutdownTimer <= 0 && (this.heat < this.heatCap * 0.8 || this.overrideHeld)) {
        this.shutdown = false;
        this.onEvent?.(this, { type: 'crit', zone: 'ct', weaponName: '__restart__' });
      }
    }
    // running past redline on override cooks the internals
    if (this.overrideHeld && this.heat > this.heatCap) {
      const zone = ZONES[Math.floor(Math.random() * ZONES.length)];
      this.applyStructureDamage(zone, 2 * dt);
      if (Math.random() < 0.04 * dt * (this.heat - this.heatCap)) this.cookOff(zone);
    }

    // --- movement ---
    const legsGone = this.zones.ll.destroyed && this.zones.rl.destroyed;
    if (this.shutdown || this.bootLocked || legsGone) this.throttleTarget = 0;

    const throttleRate = 0.65;
    this.throttle = THREE.MathUtils.clamp(
      this.throttle + THREE.MathUtils.clamp(this.throttleTarget - this.throttle, -throttleRate * dt, throttleRate * dt),
      -0.5, 1,
    );

    const targetSpeed = this.throttle * this.maxSpeedMs;
    const accel = this.maxSpeedMs / (1.6 + this.def.tons / 45);
    this.speed = THREE.MathUtils.clamp(
      this.speed + THREE.MathUtils.clamp(targetSpeed - this.speed, -accel * 1.6 * dt, accel * dt),
      -this.maxSpeedMs * 0.5, this.maxSpeedMs,
    );

    this.pos.x += Math.sin(this.legYaw) * this.speed * dt;
    this.pos.z += Math.cos(this.legYaw) * this.speed * dt;

    // --- jump jets / vertical ---
    const ground = env.heightAt(this.pos.x, this.pos.z);
    if (this.jetting && this.def.jumpJets && this.jumpFuel > 0 && !this.shutdown && !this.bootLocked) {
      // thrust must beat the 26 m/s^2 gravity applied below (net +32 up)
      this.vy = Math.min(this.vy + 58 * dt, 10);
      this.jumpFuel = Math.max(0, this.jumpFuel - dt / 3);
      this.heat += 2.5 * dt;
      this.grounded = false;
    } else {
      this.jetting = false;
    }
    if (!this.grounded || this.pos.y > ground + 0.05) {
      this.vy = Math.max(this.vy - 26 * dt, -35);
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) {
        this.pos.y = ground;
        // normal jet hops land clean — only a true burnout free-fall from the
        // top of the envelope (or a cliff) exceeds -28 m/s and hurts the legs
        if (this.vy < -28) this.applyStructureDamage(Math.random() < 0.5 ? 'll' : 'rl', (-this.vy - 28) * 0.8);
        this.vy = 0;
        this.grounded = true;
        this.onFootfall?.(this);
      }
    } else {
      this.pos.y = ground;
      this.jumpFuel = Math.min(1, this.jumpFuel + dt / 6);
    }

    // --- walk cycle for footfall events + animation ---
    const stride = 3.4 + this.def.tons * 0.02;
    const prevPhase = this.walkPhase;
    this.walkPhase += (Math.abs(this.speed) / stride) * dt * Math.PI * 2;
    if (this.grounded && Math.abs(this.speed) > 0.5) {
      const prevStep = Math.floor(prevPhase / Math.PI);
      const nowStep = Math.floor(this.walkPhase / Math.PI);
      if (nowStep > prevStep) this.onFootfall?.(this);
    }

    // --- weapon cooldowns ---
    for (const w of this.weapons) w.cooldown = Math.max(0, w.cooldown - dt);
  }

  weaponsInGroup(group: number): WeaponMount[] {
    return this.weapons.filter((w) => w.group === group && !w.destroyed && !this.zones[w.zone].destroyed);
  }

  canFire(w: WeaponMount): boolean {
    return this.alive && !this.shutdown && !this.bootLocked && !w.destroyed &&
      !this.zones[w.zone].destroyed && w.cooldown <= 0 && (w.ammo !== 0);
  }

  payFireCost(w: WeaponMount): void {
    w.cooldown = w.def.cooldown;
    if (w.ammo > 0) w.ammo = Math.max(0, w.ammo - Math.max(1, w.def.salvo));
    this.heat += w.def.heat;
  }

  /** Apply weapon damage to a zone. Emits events through onEvent. */
  applyDamage(zone: ZoneId, amount: number): void {
    if (!this.alive) return;
    if (this.invulnerable) {
      // safeties eat it — a zero-amount event lets the HUD register the hit
      if (this.ghostHits) this.onEvent?.(this, { type: 'armor', zone, amount: 0 });
      return;
    }
    let z = this.zones[zone];
    // already-destroyed zones transfer inward
    while (z.destroyed) {
      const next = ZONE_TRANSFER[zone];
      if (!next) return;
      zone = next;
      z = this.zones[zone];
    }

    if (z.armor > 0) {
      const absorbed = Math.min(z.armor, amount);
      z.armor -= absorbed;
      amount -= absorbed;
      this.onEvent?.(this, { type: 'armor', zone, amount: absorbed });
    }
    if (amount > 0) {
      this.applyStructureDamage(zone, amount, true);
    }
  }

  private applyStructureDamage(zone: ZoneId, amount: number, allowCrit = false): void {
    const z = this.zones[zone];
    if (z.destroyed || !this.alive || this.invulnerable) return;
    if (this.noKill && amount >= z.structure) {
      const lethal = zone === 'head' || zone === 'ct'
        || ((zone === 'll' || zone === 'rl') && this.zones[zone === 'll' ? 'rl' : 'll'].destroyed);
      if (lethal) {
        amount = Math.max(0, z.structure - 1);
        if (amount <= 0) return;
      }
    }
    const excess = Math.max(0, amount - z.structure);
    z.structure -= amount;
    if (allowCrit) this.onEvent?.(this, { type: 'structure', zone, amount });

    if (allowCrit && amount > 0.5 && Math.random() < 0.3) {
      const mounted = this.weapons.filter((w) => w.zone === zone && !w.destroyed);
      if (mounted.length && Math.random() < 0.6) {
        const w = mounted[Math.floor(Math.random() * mounted.length)];
        w.destroyed = true;
        this.onEvent?.(this, { type: 'weaponDestroyed', zone, weaponName: w.def.name });
      } else if (mounted.some((w) => w.ammo > 0) && Math.random() < 0.35) {
        this.cookOff(zone);
      }
    }

    if (z.structure <= 0) {
      z.structure = 0;
      z.destroyed = true;
      this.destroyZone(zone);
      // overkill on the killing blow carries inward instead of vanishing
      const next = ZONE_TRANSFER[zone];
      if (excess > 0.5 && this.alive && next) this.applyDamage(next, excess);
    }
  }

  private cookOff(zone: ZoneId): void {
    if (this.invulnerable) return; // training safeties cover self-inflicted blasts too
    const ammoWeapons = this.weapons.filter((w) => w.zone === zone && w.ammo > 0);
    if (!ammoWeapons.length) return;
    for (const w of ammoWeapons) w.ammo = 0;
    this.onEvent?.(this, { type: 'cookoff', zone });
    const z = this.zones[zone];
    // the noKill fuse holds through cook-offs too — a lethal-zone blast floors at 1
    if (this.noKill && z.structure - 20 <= 0) {
      const lethal = zone === 'head' || zone === 'ct'
        || ((zone === 'll' || zone === 'rl') && this.zones[zone === 'll' ? 'rl' : 'll'].destroyed);
      if (lethal) { z.structure = 1; return; }
    }
    z.structure -= 20;
    if (z.structure <= 0) {
      z.structure = 0;
      z.destroyed = true;
      this.killCause = 'ammo';
      this.destroyZone(zone);
      // a survived side-zone cook-off must not taint a later CT kill's salvage
      if (this.alive) this.killCause = null;
    }
  }

  private destroyZone(zone: ZoneId): void {
    this.onEvent?.(this, { type: 'zoneDestroyed', zone });

    if (zone === 'head') return this.kill('head');
    if (zone === 'ct') return this.kill(this.killCause ?? 'ct');

    if (zone === 'la' || zone === 'ra') {
      this.onEvent?.(this, { type: 'severed', zone });
    }
    if (zone === 'lt' || zone === 'rt') {
      // side torso takes its arm with it
      const arm: ZoneId = zone === 'lt' ? 'la' : 'ra';
      if (!this.zones[arm].destroyed) {
        this.zones[arm].destroyed = true;
        this.zones[arm].armor = 0;
        this.zones[arm].structure = 0;
        this.onEvent?.(this, { type: 'severed', zone: arm });
      }
    }
    if (zone === 'll' || zone === 'rl') {
      if (this.zones.ll.destroyed && this.zones.rl.destroyed) {
        return this.kill('legs');
      }
    }
  }

  kill(cause: KillCause): void {
    if (!this.alive) return;
    this.alive = false;
    this.killCause = cause;
    this.throttle = 0;
    this.speed = 0;
    this.onEvent?.(this, { type: 'killed', zone: 'ct', cause });
  }
}
