import * as THREE from 'three';
import type { NavView } from '../sim/nav';

/**
 * PATHLIGHT world-space layers: L1 ground chevrons + L2 destination beacon.
 *
 * Budget (asserted by scripts/test_nav.mjs): 3 draw calls steady-state
 * (chevron InstancedMesh + beacon solid + beacon ghost; the arrival ring only
 * draws inside the 0.7 s arrive-hold, when the chevrons are already gone),
 * < 2,000 triangles, no per-frame allocation.
 *
 * House constraints respected: no postprocessing (glow = additive material +
 * ACES), no custom shaders (the vertical fade is vertex colors under additive
 * blending — black adds nothing), fog disabled on the beacon so it reads at
 * range on short-fog maps, materials never depthWrite. The ghost pass renders
 * with depthTest:false at 30% opacity so the column reads THROUGH terrain and
 * structures — "the dimmer light is on the other side of the hill".
 */

const NAV_CYAN = 0x3fd8f0;
const CHEVRON_MAX = 24;
const CHEVRON_SPACING = 12;
const CHEVRON_FLOW_MPS = 8;
const CHEVRON_NEAR = 5; // fade-in starts this far ahead of the player
const CHEVRON_FAR = 60; // and ends here (or at the corner/waypoint)
const CHEVRON_LIFT = 0.35; // above the analytic height — the visual mesh
// interpolates 8 m vertices, so a decal exactly at heightAt() would z-fight

export class NavPathRenderer {
  private chevrons: THREE.InstancedMesh;
  private beacon: THREE.Group;
  private beaconSolid: THREE.Mesh;
  private beaconGhost: THREE.Mesh;
  private beaconSolidMat: THREE.MeshBasicMaterial;
  private beaconGhostMat: THREE.MeshBasicMaterial;
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private heightAt: (x: number, z: number) => number;

  // scratch (never allocate per frame)
  private m = new THREE.Matrix4();
  private vPos = new THREE.Vector3();
  private vRight = new THREE.Vector3();
  private vUp = new THREE.Vector3();
  private vFwd = new THREE.Vector3();
  private col = new THREE.Color();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 1);

  constructor(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
    this.heightAt = heightAt;

    // --- chevron: flat "V" band, points +Z at yaw 0 (the sim's forward) ---
    const shape = new THREE.Shape();
    shape.moveTo(-2.0, -1.2);
    shape.lineTo(0.0, 0.8);
    shape.lineTo(2.0, -1.2);
    shape.lineTo(2.0, -0.4);
    shape.lineTo(0.0, 1.6);
    shape.lineTo(-2.0, -0.4);
    shape.closePath();
    const chevGeo = new THREE.ShapeGeometry(shape);
    chevGeo.rotateX(Math.PI / 2); // lay flat: +Y (point) becomes +Z (travel)
    const chevMat = new THREE.MeshBasicMaterial({
      color: NAV_CYAN, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.chevrons = new THREE.InstancedMesh(chevGeo, chevMat, CHEVRON_MAX);
    this.chevrons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // instanceColor drives the fade under additive blending (black = invisible)
    for (let i = 0; i < CHEVRON_MAX; i++) this.chevrons.setColorAt(i, this.col.setScalar(0));
    this.chevrons.count = 0;
    this.chevrons.visible = false;
    this.chevrons.frustumCulled = false; // instances span 60 m — cheap to always draw
    scene.add(this.chevrons);

    // --- beacon: unit-height open cylinder, vertex-color vertical fade ---
    const colGeo = new THREE.CylinderGeometry(0.6, 0.6, 1, 12, 1, true);
    colGeo.translate(0, 0.5, 0); // base at y=0, scale.y = height
    const colors: number[] = [];
    const pos = colGeo.getAttribute('position');
    const c = new THREE.Color(NAV_CYAN);
    for (let i = 0; i < pos.count; i++) {
      const f = 1 - pos.getY(i); // 1 at base → 0 at top (fades out upward)
      colors.push(c.r * f, c.g * f, c.b * f);
    }
    colGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.beaconSolidMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.beaconGhostMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      side: THREE.DoubleSide, fog: false,
    });
    this.beaconSolid = new THREE.Mesh(colGeo, this.beaconSolidMat);
    this.beaconGhost = new THREE.Mesh(colGeo, this.beaconGhostMat);
    this.beaconGhost.renderOrder = 10; // after the world so the ghost reads on top
    this.beacon = new THREE.Group();
    this.beacon.add(this.beaconSolid, this.beaconGhost);
    this.beacon.visible = false;
    scene.add(this.beacon);

    // --- arrival ring: the column collapses down into this ---
    const ringGeo = new THREE.RingGeometry(4, 6.5, 28);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: NAV_CYAN, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.visible = false;
    scene.add(this.ring);
  }

  /** Layer visibility for the invariant sweep + teardown assertions. */
  debug(): { chevrons: number; beacon: boolean; ring: boolean } {
    return {
      chevrons: this.chevrons.visible ? this.chevrons.count : 0,
      beacon: this.beacon.visible,
      ring: this.ring.visible,
    };
  }

  hide(): void {
    this.chevrons.visible = false;
    this.chevrons.count = 0;
    this.beacon.visible = false;
    this.ring.visible = false;
  }

  /**
   * Render-side placement from the sim view. Flow phase is driven by SIM time
   * (the motion is the direction cue — it must survive low frame rates), the
   * rest is pure presentation.
   */
  update(view: NavView | null, px: number, pz: number,
    opts: { chevrons: boolean; beacon: boolean; reducedMotion: boolean; reducedFlash: boolean }): void {
    if (!view || !view.active) { this.hide(); return; }

    const arriving = view.state === 'arrived';

    // ---------- beacon ----------
    if (view.layers.beacon && opts.beacon) {
      this.beacon.visible = true;
      const gy = this.heightAt(view.wpX, view.wpZ);
      this.beacon.position.set(view.wpX, gy, view.wpZ);
      const breathe = opts.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(view.simTime * Math.PI); // 0.5 Hz
      const collapse = arriving ? Math.max(0.05, 1 - view.arriveHold) : 1;
      this.beacon.scale.set(1, view.beaconHeight * collapse, 1);
      this.beaconSolidMat.opacity = 0.55 * breathe;
      this.beaconGhostMat.opacity = 0.3 * breathe;
      // arrival ring rises as the column collapses
      if (arriving) {
        this.ring.visible = true;
        this.ring.position.set(view.wpX, gy + 0.4, view.wpZ);
        const pop = opts.reducedFlash ? 1 : 0.4 + 0.6 * view.arriveHold;
        this.ring.scale.set(pop, 1, pop);
        this.ringMat.opacity = 0.9 * Math.min(1, view.arriveHold * 2);
      } else {
        this.ring.visible = false;
      }
    } else {
      this.beacon.visible = false;
      this.ring.visible = false;
    }

    // ---------- chevrons ----------
    if (!view.layers.chevrons || !opts.chevrons || arriving) {
      this.chevrons.visible = false;
      this.chevrons.count = 0;
      return;
    }
    // polyline: player → (detour corner) → waypoint
    const hasCorner = view.detourX !== null && view.detourZ !== null;
    const ax = px, az = pz;
    const bx = hasCorner ? (view.detourX as number) : view.wpX;
    const bz = hasCorner ? (view.detourZ as number) : view.wpZ;
    const cx = view.wpX, cz = view.wpZ;
    const len1 = Math.hypot(bx - ax, bz - az);
    const len2 = hasCorner ? Math.hypot(cx - bx, cz - bz) : 0;
    const total = len1 + len2;
    const boosted = view.stuckLevel >= 2;
    const near = boosted ? 0.5 : CHEVRON_NEAR;
    const far = Math.min(total - 3, CHEVRON_FAR);
    if (far <= near) {
      this.chevrons.visible = false;
      this.chevrons.count = 0;
      return;
    }
    const flow = opts.reducedMotion ? 0 : (view.simTime * CHEVRON_FLOW_MPS) % CHEVRON_SPACING;
    let n = 0;
    for (let s = near + flow; s < far && n < CHEVRON_MAX; s += CHEVRON_SPACING) {
      // param along the polyline
      let x: number, z: number, dx: number, dz: number;
      if (s <= len1 || !hasCorner) {
        const t = Math.min(1, s / Math.max(len1, 1e-6));
        x = ax + (bx - ax) * t; z = az + (bz - az) * t;
        dx = (bx - ax) / Math.max(len1, 1e-6); dz = (bz - az) / Math.max(len1, 1e-6);
      } else {
        const t = Math.min(1, (s - len1) / Math.max(len2, 1e-6));
        x = bx + (cx - bx) * t; z = bz + (cz - bz) * t;
        dx = (cx - bx) / Math.max(len2, 1e-6); dz = (cz - bz) / Math.max(len2, 1e-6);
      }
      const y = this.heightAt(x, z) + CHEVRON_LIFT;
      // slope-conform: central differences, the house pattern
      const nx = -(this.heightAt(x + 3, z) - this.heightAt(x - 3, z)) / 6;
      const nz = -(this.heightAt(x, z + 3) - this.heightAt(x, z - 3)) / 6;
      this.vUp.set(nx, 1, nz).normalize();
      this.vFwd.set(dx, 0, dz);
      this.vFwd.addScaledVector(this.vUp, -this.vFwd.dot(this.vUp)).normalize();
      this.vRight.crossVectors(this.vUp, this.vFwd).normalize();
      this.m.makeBasis(this.vRight, this.vUp, this.vFwd);
      this.q.setFromRotationMatrix(this.m);
      this.vPos.set(x, y, z);
      this.m.compose(this.vPos, this.q, this.s);
      this.chevrons.setMatrixAt(n, this.m);
      // fade in at the near edge, out at the far edge
      const fade = Math.min(1, (s - near) / 8, (far - s) / 10);
      const bright = Math.max(0.08, fade) * (boosted ? 1.6 : 1);
      this.chevrons.setColorAt(n, this.col.setScalar(bright));
      n++;
    }
    this.chevrons.count = n;
    this.chevrons.visible = n > 0;
    this.chevrons.instanceMatrix.needsUpdate = true;
    if (this.chevrons.instanceColor) this.chevrons.instanceColor.needsUpdate = true;
  }
}
