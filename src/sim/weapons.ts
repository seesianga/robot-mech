import * as THREE from 'three';
import type { Mech, WeaponMount } from './mech';
import type { MechVisual } from '../world/mechfactory';
import type { Effects } from '../world/effects';
import type { Structure, Terrain } from '../world/terrain';
import type { ZoneId } from './types';

export interface HitInfo {
  mech?: Mech;
  zone?: ZoneId;
  structure?: Structure;
  point: THREE.Vector3;
}

interface Projectile {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  damage: number;
  owner: Mech;
  ttl: number;
  mesh: THREE.Mesh;
  isRocket: boolean;
}

interface PendingSalvo {
  mech: Mech;
  weapon: WeaponMount;
  remaining: number;
  interval: number;
  timer: number;
  aimPoint: THREE.Vector3;
}

export type FireCallback = (owner: Mech, weapon: WeaponMount, hit: HitInfo | null) => void;

export class WeaponsSystem {
  private projectiles: Projectile[] = [];
  private salvos: PendingSalvo[] = [];
  private ray = new THREE.Raycaster();
  private tracerGeo = new THREE.BoxGeometry(0.12, 0.12, 2.2);
  private tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd070 });
  private rocketMat = new THREE.MeshBasicMaterial({ color: 0xd0d8e0 });

  onHit: FireCallback | null = null;
  onFire: ((owner: Mech, weapon: WeaponMount, aim: THREE.Vector3) => void) | null = null;

  constructor(
    private scene: THREE.Scene,
    private effects: Effects,
    private terrain: Terrain,
    private getMechs: () => Mech[],
    private getVisual: (m: Mech) => MechVisual | undefined,
  ) {}

  /** All zone meshes belonging to living mechs other than `owner`, plus structures. */
  private hitCandidates(owner: Mech): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const m of this.getMechs()) {
      if (m === owner || !m.alive) continue;
      const v = this.getVisual(m);
      if (!v) continue;
      for (const zone of Object.keys(v.zoneMeshes) as ZoneId[]) {
        if (zone === 'la' || zone === 'ra') {
          if (m.zones[zone].destroyed) continue; // severed arms are debris now
        }
        out.push(...v.zoneMeshes[zone]);
      }
    }
    for (const s of this.terrain.structures) {
      if (!s.destroyed) out.push(...s.meshes);
    }
    out.push(...this.terrain.colliders);
    return out;
  }

  private resolveHitObject(obj: THREE.Object3D, point: THREE.Vector3): HitInfo | null {
    const mechId = obj.userData.mechId as number | undefined;
    if (mechId !== undefined) {
      const mech = this.getMechs().find((m) => m.id === mechId);
      if (mech) return { mech, zone: obj.userData.zone as ZoneId, point };
    }
    const sid = obj.userData.structureId as string | undefined;
    if (sid) {
      const s = this.terrain.structures.find((st) => st.id === sid);
      if (s) return { structure: s, point };
    }
    return null;
  }

  muzzleWorld(mech: Mech, w: WeaponMount, out: THREE.Vector3): THREE.Vector3 {
    const v = this.getVisual(mech);
    const node = v?.muzzles.get(w);
    if (node) return node.getWorldPosition(out);
    return out.copy(mech.pos).add(new THREE.Vector3(0, 6, 0));
  }

  /**
   * Fire every ready weapon in a group toward aimPoint.
   * subtargetZone (player-selected via E) biases hitscan onto that zone's mesh.
   */
  fireGroup(mech: Mech, group: number, aimPoint: THREE.Vector3, target: Mech | null, subtargetZone: ZoneId | null): boolean {
    let fired = false;
    for (const w of mech.weaponsInGroup(group)) {
      if (!mech.canFire(w)) continue;
      mech.payFireCost(w);
      fired = true;
      this.onFire?.(mech, w, aimPoint);

      // arm recoil kick
      const v = this.getVisual(mech);
      if (v) {
        if (w.zone === 'la') v.recoil.la = -0.12;
        if (w.zone === 'ra') v.recoil.ra = -0.12;
      }

      if (w.def.type === 'energy') {
        this.fireHitscan(mech, w, aimPoint, target, subtargetZone);
      } else if (w.def.type === 'missile') {
        this.salvos.push({
          mech, weapon: w,
          remaining: w.def.salvo,
          interval: 0.07,
          timer: 0,
          aimPoint: aimPoint.clone(),
        });
      } else {
        for (let i = 0; i < w.def.salvo; i++) {
          this.spawnProjectile(mech, w, aimPoint, i * 0.001, false);
        }
      }
    }
    return fired;
  }

  private fireHitscan(mech: Mech, w: WeaponMount, aimPoint: THREE.Vector3, target: Mech | null, subtargetZone: ZoneId | null): void {
    const from = this.muzzleWorld(mech, w, new THREE.Vector3());
    let at = aimPoint.clone();

    // subtargeting biases the beam onto the selected zone — but only when the
    // pilot is already aiming close to it (~6° cone), never as a 360° aimbot
    if (target && subtargetZone && target.alive && !target.zones[subtargetZone].destroyed) {
      const tv = this.getVisual(target);
      const zm = tv?.zoneMeshes[subtargetZone][0];
      if (zm) {
        const zonePoint = zm.getWorldPosition(new THREE.Vector3());
        const baseDir = at.clone().sub(from).normalize();
        const zoneDir = zonePoint.clone().sub(from).normalize();
        if (baseDir.angleTo(zoneDir) < THREE.MathUtils.degToRad(6)) {
          at = zonePoint;
          at.x += (Math.random() - 0.5) * 1.2;
          at.y += (Math.random() - 0.5) * 1.2;
          at.z += (Math.random() - 0.5) * 1.2;
        }
      }
    }

    const dir = at.sub(from).normalize();
    this.ray.set(from, dir);
    this.ray.far = w.def.range;
    const hits = this.ray.intersectObjects(this.hitCandidates(mech), false);
    const terrHit = this.ray.intersectObject(this.terrain.group.children[0], false)[0];

    let end = from.clone().addScaledVector(dir, w.def.range);
    let info: HitInfo | null = null;
    if (hits.length && (!terrHit || hits[0].distance < terrHit.distance)) {
      end = hits[0].point;
      info = this.resolveHitObject(hits[0].object, hits[0].point);
    } else if (terrHit) {
      end = terrHit.point;
    }

    this.effects.beam(from, end, mech.team === 'compact' ? 0xff5040 : 0xffa02a);
    if (info) this.applyHit(mech, w, info, w.def.damage);
  }

  private spawnProjectile(mech: Mech, w: WeaponMount, aimPoint: THREE.Vector3, delay: number, isRocket: boolean): void {
    const from = this.muzzleWorld(mech, w, new THREE.Vector3());
    const dir = aimPoint.clone().sub(from).normalize();
    const spreadRad = THREE.MathUtils.degToRad(w.def.spread);
    if (spreadRad > 0) {
      dir.x += (Math.random() - 0.5) * spreadRad;
      dir.y += (Math.random() - 0.5) * spreadRad;
      dir.z += (Math.random() - 0.5) * spreadRad;
      dir.normalize();
    }
    const mesh = new THREE.Mesh(
      isRocket ? new THREE.CylinderGeometry(0.14, 0.14, 1.6, 6) : this.tracerGeo,
      isRocket ? this.rocketMat : this.tracerMat,
    );
    mesh.position.copy(from);
    mesh.lookAt(from.clone().add(dir));
    if (isRocket) mesh.rotateX(Math.PI / 2);
    this.scene.add(mesh);
    this.projectiles.push({
      pos: from.clone(),
      vel: dir.multiplyScalar(w.def.projectileSpeed),
      damage: w.def.damage,
      owner: mech,
      ttl: w.def.range / w.def.projectileSpeed + 1.5,
      mesh,
      isRocket,
    });
    this.effects.muzzleFlash(from, isRocket ? 0xffe0a0 : 0xfff0c0);
  }

  private applyHit(owner: Mech, w: WeaponMount, info: HitInfo, damage: number): void {
    if (info.mech && info.zone) {
      info.mech.applyDamage(info.zone, damage);
    } else if (info.structure) {
      info.structure.hp -= damage;
    }
    this.effects.sparks(info.point, 14, 0xffcc70, 10);
    this.onHit?.(owner, w, info);
  }

  update(dt: number): void {
    // staggered rocket salvos — die with the shooter or the launcher
    for (let i = this.salvos.length - 1; i >= 0; i--) {
      const s = this.salvos[i];
      if (!s.mech.alive || s.weapon.destroyed || s.mech.zones[s.weapon.zone].destroyed) {
        this.salvos.splice(i, 1);
        continue;
      }
      s.timer -= dt;
      while (s.timer <= 0 && s.remaining > 0) {
        this.spawnProjectile(s.mech, s.weapon, s.aimPoint, 0, true);
        s.remaining--;
        s.timer += s.interval;
      }
      if (s.remaining <= 0) this.salvos.splice(i, 1);
    }

    // projectiles: segment-cast each step
    const seg = new THREE.Vector3();
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.ttl -= dt;
      if (p.isRocket) p.vel.y -= 3.5 * dt; // slight droop
      seg.copy(p.vel).multiplyScalar(dt);
      const segLen = seg.length();
      const from = p.pos.clone();
      p.pos.add(seg);
      p.mesh.position.copy(p.pos);

      let dead = p.ttl <= 0;
      if (!dead && segLen > 0) {
        this.ray.set(from, seg.clone().normalize());
        this.ray.far = segLen;
        const hits = this.ray.intersectObjects(this.hitCandidates(p.owner), false);
        if (hits.length) {
          const info = this.resolveHitObject(hits[0].object, hits[0].point);
          if (info) {
            const wStub = { def: { name: p.isRocket ? 'Rockets' : 'Autocannon' } } as WeaponMount;
            this.applyHit(p.owner, wStub, info, p.damage);
            if (p.isRocket) this.effects.explosion(hits[0].point, 2.5);
          } else {
            // cover prop absorbed the round
            if (p.isRocket) this.effects.explosion(hits[0].point, 2);
            else this.effects.sparks(hits[0].point, 8, 0xd8c8a8, 6);
          }
          dead = true;
        } else {
          // terrain
          const ground = this.terrain.heightAt(p.pos.x, p.pos.z);
          if (p.pos.y <= ground) {
            if (p.isRocket) this.effects.explosion(p.pos.clone().setY(ground + 0.5), 2);
            else this.effects.sparks(p.pos.clone().setY(ground + 0.5), 8, 0xd0c0a0, 6);
            dead = true;
          }
        }
      }

      if (dead) {
        this.scene.remove(p.mesh);
        if (p.isRocket) p.mesh.geometry.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }
}
