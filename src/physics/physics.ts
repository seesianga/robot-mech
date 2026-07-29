import * as THREE from 'three';
import type * as RapierNS from '@dimforge/rapier3d-compat';

type RigidBody = RapierNS.RigidBody;
type RapierAPI = (typeof import('@dimforge/rapier3d-compat'))['default'];

interface DebrisPair {
  body: RigidBody;
  obj: THREE.Object3D;
  age: number;
}

/**
 * Rapier is used for what the player can see and feel: severed limbs and wreck
 * debris tumbling over real terrain collision. Mech locomotion stays kinematic.
 */
export class PhysicsWorld {
  private debris: DebrisPair[] = [];
  private accumulator = 0;

  private constructor(
    private RAPIER: RapierAPI,
    private world: RapierNS.World,
  ) {}

  static async create(heightAt: (x: number, z: number) => number, size: number): Promise<PhysicsWorld | null> {
    try {
      const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
      await RAPIER.init();
      const world = new RAPIER.World({ x: 0, y: -19.6, z: 0 });

      // heightfield matching the analytic terrain (column-major, cols→x, rows→z)
      const N = 96;
      const heights = new Float32Array((N + 1) * (N + 1));
      for (let col = 0; col <= N; col++) {
        const x = (col / N - 0.5) * size;
        for (let row = 0; row <= N; row++) {
          const z = (row / N - 0.5) * size;
          heights[col * (N + 1) + row] = heightAt(x, z);
        }
      }
      const hfDesc = RAPIER.ColliderDesc.heightfield(N, N, heights, { x: size, y: 1, z: size });
      world.createCollider(hfDesc);
      // backstop under the water line
      const floor = RAPIER.ColliderDesc.cuboid(size, 1, size).setTranslation(0, -8, 0);
      world.createCollider(floor);

      return new PhysicsWorld(RAPIER, world);
    } catch (err) {
      console.warn('[physics] Rapier unavailable, debris will be static:', err);
      return null;
    }
  }

  /** Take ownership of a scene-space object and let it tumble. */
  addDebris(obj: THREE.Object3D, impulse: THREE.Vector3): void {
    const box = new THREE.Box3().setFromObject(obj);
    const sz = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    if (!isFinite(sz.x) || sz.length() < 0.01) return;

    const bodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(center.x, center.y, center.z)
      .setLinvel(impulse.x, impulse.y, impulse.z)
      .setAngvel({ x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 5, z: (Math.random() - 0.5) * 5 });
    const body = this.world.createRigidBody(bodyDesc);
    const colDesc = this.RAPIER.ColliderDesc
      .cuboid(Math.max(0.2, sz.x / 2), Math.max(0.2, sz.y / 2), Math.max(0.2, sz.z / 2))
      .setDensity(4)
      .setRestitution(0.15);
    this.world.createCollider(colDesc, body);

    // remember the visual offset from bbox center so the mesh tracks the body
    obj.userData.debrisOffset = new THREE.Vector3().subVectors(obj.position, center);
    obj.userData.debrisQuatInv = obj.quaternion.clone();
    this.debris.push({ body, obj, age: 0 });
  }

  step(dt: number): void {
    this.accumulator += dt;
    const h = 1 / 60;
    let steps = 0;
    while (this.accumulator >= h && steps < 4) {
      this.world.timestep = h;
      this.world.step();
      this.accumulator -= h;
      steps++;
    }
    const q = new THREE.Quaternion();
    for (const d of this.debris) {
      d.age += dt;
      const t = d.body.translation();
      const r = d.body.rotation();
      q.set(r.x, r.y, r.z, r.w);
      const off = (d.obj.userData.debrisOffset as THREE.Vector3).clone().applyQuaternion(q);
      d.obj.position.set(t.x + off.x, t.y + off.y, t.z + off.z);
      d.obj.quaternion.copy(q).multiply(d.obj.userData.debrisQuatInv as THREE.Quaternion);
      // let settled debris sleep forever — limbs stay where they fell
      if (d.age > 12) d.body.sleep();
    }
  }
}
