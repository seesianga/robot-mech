import * as THREE from 'three';

interface Burst {
  points: THREE.Points;
  vel: Float32Array;
  life: number;
  maxLife: number;
  gravity: number;
}

interface Beam {
  mesh: THREE.Mesh;
  life: number;
}

interface Flash {
  light: THREE.PointLight;
  life: number;
}

export class Effects {
  private bursts: Burst[] = [];
  private beams: Beam[] = [];
  private flashes: Flash[] = [];
  private smokes: THREE.Points[] = [];

  constructor(private scene: THREE.Scene) {}

  sparks(pos: THREE.Vector3, count = 24, color = 0xffc060, speed = 14): void {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
      const th = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const s = speed * (0.3 + Math.random() * 0.7);
      vel[i * 3] = Math.sin(phi) * Math.cos(th) * s;
      vel[i * 3 + 1] = Math.abs(Math.cos(phi)) * s;
      vel[i * 3 + 2] = Math.sin(phi) * Math.sin(th) * s;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.35, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.bursts.push({ points, vel, life: 0.9, maxLife: 0.9, gravity: 22 });
  }

  explosion(pos: THREE.Vector3, radius = 6): void {
    this.sparks(pos, 60, 0xff8830, radius * 4);
    this.sparks(pos, 30, 0xfff0a0, radius * 6);
    const light = new THREE.PointLight(0xffa040, 900, radius * 18, 2);
    light.position.copy(pos);
    this.scene.add(light);
    this.flashes.push({ light, life: 0.35 });
  }

  muzzleFlash(pos: THREE.Vector3, color = 0xffd080): void {
    const light = new THREE.PointLight(color, 260, 26, 2);
    light.position.copy(pos);
    this.scene.add(light);
    this.flashes.push({ light, life: 0.08 });
  }

  beam(from: THREE.Vector3, to: THREE.Vector3, color = 0xff4040, thickness = 0.14): void {
    const len = from.distanceTo(to);
    if (len < 0.1) return;
    const geo = new THREE.CylinderGeometry(thickness, thickness, len, 6, 1, true);
    geo.translate(0, len / 2, 0);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from);
    mesh.lookAt(to);
    this.scene.add(mesh);
    this.beams.push({ mesh, life: 0.12 });
    this.muzzleFlash(from, color);
  }

  /** Persistent smoke column over a wreck. */
  smokeColumn(pos: THREE.Vector3): void {
    const count = 40;
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = pos.x + (Math.random() - 0.5) * 3;
      p[i * 3 + 1] = pos.y + Math.random() * 26;
      p[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 3;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({ color: 0x2a2a2a, size: 5, transparent: true, opacity: 0.45, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    points.userData.base = pos.clone();
    this.scene.add(points);
    this.smokes.push(points);
  }

  update(dt: number, time: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
        this.bursts.splice(i, 1);
        continue;
      }
      const attr = b.points.geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let j = 0; j < arr.length / 3; j++) {
        b.vel[j * 3 + 1] -= b.gravity * dt;
        arr[j * 3] += b.vel[j * 3] * dt;
        arr[j * 3 + 1] += b.vel[j * 3 + 1] * dt;
        arr[j * 3 + 2] += b.vel[j * 3 + 2] * dt;
      }
      attr.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = b.life / b.maxLife;
    }

    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        this.beams.splice(i, 1);
      } else {
        (b.mesh.material as THREE.MeshBasicMaterial).opacity = b.life / 0.12;
      }
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.light);
        this.flashes.splice(i, 1);
      } else {
        f.light.intensity *= 0.82;
      }
    }

    // smoke drifts upward, loops
    for (const s of this.smokes) {
      const attr = s.geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const base = s.userData.base as THREE.Vector3;
      for (let j = 0; j < arr.length / 3; j++) {
        arr[j * 3 + 1] += dt * (2 + (j % 5) * 0.5);
        arr[j * 3] += Math.sin(time * 0.6 + j) * dt * 0.6;
        if (arr[j * 3 + 1] > base.y + 30) arr[j * 3 + 1] = base.y;
      }
      attr.needsUpdate = true;
    }
  }
}
