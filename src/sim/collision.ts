import * as THREE from 'three';
import type { Mech } from './mech';
import type { Terrain } from '../world/terrain';

/**
 * Walkable-world collision: mechs are 2D circles, cover props and structures
 * are world-space AABBs (greybox boxes; the slight corner margin on rotated
 * hulls is invisible at mech scale). Vertical gating lets mechs walk under
 * the gantry beam but never through walls, crates, hulls, or the mast.
 */

export interface StaticCollider {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
  minY: number; maxY: number;
}

const _box = new THREE.Box3();

export function buildStaticColliders(terrain: Terrain): StaticCollider[] {
  const out: StaticCollider[] = [];
  const meshes = [
    ...terrain.colliders,
    ...terrain.structures.flatMap((s) => s.meshes), // fallen structures still block
  ];
  for (const m of meshes) {
    m.updateWorldMatrix(true, false);
    _box.setFromObject(m);
    if (!isFinite(_box.min.x)) continue;
    out.push({
      minX: _box.min.x, maxX: _box.max.x,
      minZ: _box.min.z, maxZ: _box.max.z,
      minY: _box.min.y, maxY: _box.max.y,
    });
  }
  return out;
}

function mechRadius(m: Mech): number {
  return 0.25 * (7 + m.def.tons * 0.08);
}

export function resolveMechVsStatics(m: Mech, cols: StaticCollider[]): void {
  const height = 7 + m.def.tons * 0.08;
  const r = mechRadius(m);
  const footY = m.pos.y;
  const topY = m.pos.y + height;
  for (const c of cols) {
    // ignore overhead beams and ankle-height debris
    if (c.minY > topY - 1 || c.maxY < footY + 0.6) continue;
    // cheap broadphase
    if (m.pos.x < c.minX - r - 2 || m.pos.x > c.maxX + r + 2 ||
        m.pos.z < c.minZ - r - 2 || m.pos.z > c.maxZ + r + 2) continue;

    const cx = THREE.MathUtils.clamp(m.pos.x, c.minX, c.maxX);
    const cz = THREE.MathUtils.clamp(m.pos.z, c.minZ, c.maxZ);
    const dx = m.pos.x - cx;
    const dz = m.pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;

    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      m.pos.x = cx + (dx / d) * r;
      m.pos.z = cz + (dz / d) * r;
    } else {
      // center is inside the box — exit along the shallowest axis
      const pxMin = m.pos.x - c.minX, pxMax = c.maxX - m.pos.x;
      const pzMin = m.pos.z - c.minZ, pzMax = c.maxZ - m.pos.z;
      const minPen = Math.min(pxMin, pxMax, pzMin, pzMax);
      if (minPen === pxMin) m.pos.x = c.minX - r;
      else if (minPen === pxMax) m.pos.x = c.maxX + r;
      else if (minPen === pzMin) m.pos.z = c.minZ - r;
      else m.pos.z = c.maxZ + r;
    }
  }
}

/** Mechs can't occupy the same footprint either. */
export function separateMechs(mechs: Mech[]): void {
  for (let i = 0; i < mechs.length; i++) {
    for (let j = i + 1; j < mechs.length; j++) {
      const a = mechs[i], b = mechs[j];
      if (!a.alive || !b.alive) continue;
      const min = mechRadius(a) + mechRadius(b);
      let dx = b.pos.x - a.pos.x;
      let dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      dx /= d; dz /= d;
      a.pos.x -= dx * push; a.pos.z -= dz * push;
      b.pos.x += dx * push; b.pos.z += dz * push;
    }
  }
}
