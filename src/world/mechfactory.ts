import * as THREE from 'three';
import type { Mech, WeaponMount } from '../sim/mech';
import type { ZoneId } from '../sim/types';
import { loadModel, orientToGameForward, type Lod } from './assets';

export interface MechVisual {
  root: THREE.Group;
  torsoPivot: THREE.Group;
  headNode: THREE.Object3D;
  armGroups: { la: THREE.Group; ra: THREE.Group };
  legJoints: {
    hipL: THREE.Group; kneeL: THREE.Group;
    hipR: THREE.Group; kneeR: THREE.Group;
  };
  zoneMeshes: Record<ZoneId, THREE.Mesh[]>;
  zoneMaterials: Record<ZoneId, THREE.MeshStandardMaterial>;
  muzzles: Map<WeaponMount, THREE.Object3D>;
  jetFlames: THREE.Mesh[];
  recoil: { la: number; ra: number };
  dead: boolean;
  deathT: number;
  unit: number;
  /**
   * True once the generated geometry has replaced the boxes. Rigid segments cannot
   * bend, so a wide joint swing opens a visible wedge at the cut; the walk cycle is
   * damped for skinned mechs to keep the seams closed. A 45-tonne machine taking
   * shorter, heavier strides also reads better than a box mech windmilling its legs.
   */
  skinned: boolean;
}

export interface MechPalette {
  primary: number;
  secondary: number;
  accent: number;
  visor: number;
}

export const COMPACT_PALETTE: MechPalette = { primary: 0x5c6b5e, secondary: 0x4a4f57, accent: 0x8a5a3a, visor: 0x53d7a8 };
export const DIRECTORATE_PALETTE: MechPalette = { primary: 0x565b61, secondary: 0x3d4147, accent: 0xd9931f, visor: 0xffb347 };

function mat(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.22 });
}

/**
 * @param skin when true (the default) the generated Tripo geometry is swapped in as
 *   soon as it loads. The hangar turntable passes false because it substitutes the
 *   whole unsplit LOD0 model itself — splitting there would be wasted work.
 */
export function buildMechVisual(mech: Mech, palette: MechPalette, skin = true): MechVisual {
  const def = mech.def;
  const height = 7 + def.tons * 0.08; // 25t→9m, 100t→15m
  const u = height / 10;

  const zoneMaterials = {} as Record<ZoneId, THREE.MeshStandardMaterial>;
  const zoneMeshes: Record<ZoneId, THREE.Mesh[]> = { head: [], ct: [], lt: [], rt: [], la: [], ra: [], ll: [], rl: [] };
  (['head', 'ct', 'lt', 'rt', 'la', 'ra', 'll', 'rl'] as ZoneId[]).forEach((z, i) => {
    zoneMaterials[z] = mat(i % 2 === 0 ? palette.primary : palette.secondary);
  });

  function part(zone: ZoneId, w: number, h: number, d: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), zoneMaterials[zone]);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.mechId = mech.id;
    m.userData.zone = zone;
    zoneMeshes[zone].push(m);
    return m;
  }

  const root = new THREE.Group();
  root.name = `mech_${mech.id}_${def.id}`;

  const hipY = 4.3 * u;

  // --- legs (digitigrade) ---
  const legJoints = {} as MechVisual['legJoints'];
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? -1 : 1;
    const zone: ZoneId = side === 'L' ? 'll' : 'rl';
    const hip = new THREE.Group();
    hip.position.set(sx * 1.15 * u, hipY, 0);
    const thigh = part(zone, 0.85 * u, 2.3 * u, 1.05 * u);
    thigh.position.y = -1.15 * u;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -2.3 * u;
    const shin = part(zone, 0.68 * u, 2.3 * u, 0.85 * u);
    shin.position.y = -1.15 * u;
    knee.add(shin);
    const foot = part(zone, 1.15 * u, 0.5 * u, 1.9 * u);
    foot.position.set(0, -2.3 * u, 0.35 * u);
    knee.add(foot);
    if (def.jumpJets) {
      const nacelle = part(zone, 0.5 * u, 1.1 * u, 0.5 * u);
      nacelle.position.set(sx * 0.55 * u, -1.4 * u, -0.6 * u);
      knee.add(nacelle);
    }
    hip.add(knee);
    hip.rotation.x = -0.22;
    knee.rotation.x = 0.42;
    root.add(hip);
    if (side === 'L') { legJoints.hipL = hip; legJoints.kneeL = knee; }
    else { legJoints.hipR = hip; legJoints.kneeR = knee; }
  }

  // pelvis belongs to CT for hit purposes
  const pelvis = part('ct', 2.3 * u, 1.0 * u, 1.5 * u);
  pelvis.position.y = hipY + 0.1 * u;
  root.add(pelvis);

  // --- torso ---
  const torsoPivot = new THREE.Group();
  torsoPivot.position.y = hipY + 0.7 * u;
  root.add(torsoPivot);

  const ct = part('ct', 2.3 * u, 2.4 * u, 1.7 * u);
  ct.position.y = 1.2 * u;
  torsoPivot.add(ct);

  const lt = part('lt', 1.45 * u, 2.0 * u, 1.5 * u);
  lt.position.set(-1.85 * u, 1.1 * u, 0);
  torsoPivot.add(lt);
  const rt = part('rt', 1.45 * u, 2.0 * u, 1.5 * u);
  rt.position.set(1.85 * u, 1.1 * u, 0);
  torsoPivot.add(rt);

  // head — wedge cockpit with emissive visor
  const headNode = new THREE.Group();
  headNode.position.y = 2.75 * u;
  const skull = part('head', 1.05 * u, 0.75 * u, 1.25 * u);
  headNode.add(skull);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.8 * u, 0.22 * u, 0.06 * u),
    new THREE.MeshStandardMaterial({ color: palette.visor, emissive: palette.visor, emissiveIntensity: 1.6, roughness: 0.3 }),
  );
  visor.position.set(0, 0.05 * u, 0.63 * u);
  visor.userData.mechId = mech.id;
  visor.userData.zone = 'head';
  headNode.add(visor);
  torsoPivot.add(headNode);

  // --- arms with weapon barrels ---
  const armGroups = {} as MechVisual['armGroups'];
  const muzzles = new Map<WeaponMount, THREE.Object3D>();

  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? -1 : 1;
    const zone: ZoneId = side === 'L' ? 'la' : 'ra';
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * 2.75 * u, 1.85 * u, 0);
    const upper = part(zone, 0.8 * u, 1.5 * u, 0.9 * u);
    upper.position.y = -0.75 * u;
    shoulder.add(upper);
    const fore = part(zone, 0.7 * u, 1.5 * u, 0.8 * u);
    fore.position.y = -2.1 * u;
    shoulder.add(fore);
    torsoPivot.add(shoulder);
    if (side === 'L') armGroups.la = shoulder; else armGroups.ra = shoulder;
  }

  // mount weapon barrels on their assigned zones
  const accentMat = mat(palette.accent);
  for (const w of mech.weapons) {
    let holder: THREE.Object3D;
    let yOff = 0;
    if (w.zone === 'la') { holder = armGroups.la; yOff = -2.6 * u; }
    else if (w.zone === 'ra') { holder = armGroups.ra; yOff = -2.6 * u; }
    else if (w.zone === 'lt') { holder = torsoPivot; }
    else if (w.zone === 'rt') { holder = torsoPivot; }
    else { holder = torsoPivot; }

    const muzzle = new THREE.Object3D();
    if (w.def.type === 'missile') {
      // shoulder pod
      const pod = part(w.zone === 'ra' || w.zone === 'rt' ? 'rt' : 'lt', 1.1 * u, 0.9 * u, 1.3 * u);
      const px = (w.zone === 'ra' || w.zone === 'rt') ? 1.85 * u : -1.85 * u;
      pod.position.set(px, 2.5 * u, 0);
      torsoPivot.add(pod);
      for (let tx = 0; tx < 2; tx++) for (let ty = 0; ty < 2; ty++) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * u, 0.09 * u, 0.2 * u, 8), accentMat);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(px + (tx - 0.5) * 0.4 * u, 2.5 * u + (ty - 0.5) * 0.34 * u, 0.7 * u);
        torsoPivot.add(tube);
      }
      muzzle.position.set(px, 2.5 * u, 0.9 * u);
      torsoPivot.add(muzzle);
    } else if (w.def.type === 'ballistic') {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * u, 0.22 * u, 2.0 * u, 10), accentMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.castShadow = true;
      barrel.userData.mechId = mech.id;
      barrel.userData.zone = w.zone;
      if (holder === armGroups.la || holder === armGroups.ra) {
        barrel.position.set(0, yOff, 1.0 * u);
        holder.add(barrel);
        muzzle.position.set(0, yOff, 2.0 * u);
        holder.add(muzzle);
      } else {
        barrel.position.set(0, 2.2 * u, 1.2 * u);
        torsoPivot.add(barrel);
        muzzle.position.set(0, 2.2 * u, 2.2 * u);
        torsoPivot.add(muzzle);
      }
    } else if (w.def.type === 'energy') {
      const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * u, 0.15 * u, 1.4 * u, 8), accentMat);
      emitter.rotation.x = Math.PI / 2;
      emitter.castShadow = true;
      emitter.userData.mechId = mech.id;
      emitter.userData.zone = w.zone;
      if (holder === armGroups.la || holder === armGroups.ra) {
        emitter.position.set(0, yOff, 0.9 * u);
        holder.add(emitter);
        muzzle.position.set(0, yOff, 1.6 * u);
        holder.add(muzzle);
      } else {
        emitter.position.set(w.zone === 'rt' ? 1.85 * u : -1.85 * u, 1.6 * u, 1.0 * u);
        torsoPivot.add(emitter);
        muzzle.position.set(emitter.position.x, 1.6 * u, 1.8 * u);
        torsoPivot.add(muzzle);
      }
    } else {
      muzzle.position.set(0, 2 * u, u);
      torsoPivot.add(muzzle);
    }
    muzzles.set(w, muzzle);
  }

  // jump-jet flames (hidden unless jetting)
  const jetFlames: THREE.Mesh[] = [];
  if (def.jumpJets) {
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.85 });
    for (const sx of [-1, 1]) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.32 * u, 2.2 * u, 8), flameMat);
      flame.rotation.x = Math.PI;
      flame.position.set(sx * 1.15 * u, hipY - 3.4 * u, -0.6 * u);
      flame.visible = false;
      root.add(flame);
      jetFlames.push(flame);
    }
  }

  const visual: MechVisual = {
    root, torsoPivot, headNode, armGroups, legJoints, zoneMeshes, zoneMaterials,
    muzzles, jetFlames, recoil: { la: 0, ra: 0 }, dead: false, deathT: 0, unit: u,
    skinned: false,
  };
  if (skin) skinMechVisual(visual, mech);
  return visual;
}

/**
 * Replace the procedural box geometry with the generated Tripo mesh, without
 * giving up anything the boxes were doing for us.
 *
 * The Tripo GLBs are a single unrigged mesh — no skeleton, no joints, no zones —
 * so they cannot simply be dropped in: the game needs eight named hit zones for
 * damage and subtargeting, and an articulated hierarchy for the walk cycle.
 *
 * So we cut the mesh into the same eight zones the boxes represented, by triangle
 * centroid, and parent each chunk to the joint that already drives that part. The
 * result animates and takes damage exactly as before, but is made of the real
 * geometry. This is rigid-segment animation — the same technique the mech games of
 * the era used — and it suits hard-surface machines, which have no skin to deform.
 *
 * A zone that receives no triangles keeps its original box, so `zoneMeshes[z][0]`
 * (the subtarget aim point) is never undefined.
 */
export function applyModelSkin(v: MechVisual, mech: Mech, src: THREE.Group): boolean {
  // Collect every triangle of the source in a single object space, at the right scale.
  const model = src.clone(true);
  const bbox0 = new THREE.Box3().setFromObject(model);
  const size0 = bbox0.getSize(new THREE.Vector3());
  if (size0.y < 1e-6) return false;

  const height = 10 * v.unit;
  model.scale.multiplyScalar(height / size0.y);
  // Face the game's forward axis BEFORE cutting: the zone split divides on X, so a
  // sideways model would be cut front-to-back instead of left-to-right.
  orientToGameForward(model);
  model.updateMatrixWorld(true);

  // Align the model to the skeleton's own frame before cutting: feet on y=0,
  // centred on x/z. Tripo emits an arbitrary origin, and without this every chunk
  // lands offset from the joint that is supposed to carry it.
  const raw = new THREE.Box3().setFromObject(model);
  const rawCentre = raw.getCenter(new THREE.Vector3());
  model.position.x -= rawCentre.x;
  model.position.z -= rawCentre.z;
  model.position.y -= raw.min.y;
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const centre = box.getCenter(new THREE.Vector3());
  const halfW = Math.max(1e-6, (box.max.x - box.min.x) / 2);
  const footY = box.min.y;

  // Gather world-space triangles plus their UVs, flattened from whatever node
  // hierarchy the GLB happened to arrive in.
  type Tri = { p: THREE.Vector3[]; n: THREE.Vector3[]; uv: THREE.Vector2[] };
  const tris: Tri[] = [];
  let material: THREE.Material | null = null;

  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    material ??= Array.isArray(m.material) ? m.material[0] : m.material;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const uvs = g.getAttribute('uv');
    for (let i = 0; i < pos.count; i += 3) {
      const p: THREE.Vector3[] = [], n: THREE.Vector3[] = [], uv: THREE.Vector2[] = [];
      for (let k = 0; k < 3; k++) {
        const idx = i + k;
        p.push(new THREE.Vector3().fromBufferAttribute(pos, idx).applyMatrix4(m.matrixWorld));
        n.push(nrm
          ? new THREE.Vector3().fromBufferAttribute(nrm, idx)
            .transformDirection(m.matrixWorld)
          : new THREE.Vector3(0, 1, 0));
        // Vector2.fromBufferAttribute is typed for BufferAttribute only; a meshopt
        // GLB can hand back an interleaved one, which is layout-compatible here.
        uv.push(uvs
          ? new THREE.Vector2().fromBufferAttribute(uvs as THREE.BufferAttribute, idx)
          : new THREE.Vector2());
      }
      tris.push({ p, n, uv });
    }
  });

  if (!tris.length || !material) return false;

  // --- classify each triangle into a zone -------------------------------------
  // Fractions of the model's own bounding box, so a 25 t scout and a 100 t assault
  // both split sensibly regardless of their very different proportions.
  // Cut the legs exactly where the joints are, not at guessed fractions. A chunk
  // pivots about its joint, so if the cut plane and the pivot disagree the rotation
  // opens a visible wedge at the seam. Reading the real hip and knee heights out of
  // the skeleton puts the pivot on the cut, which closes the gap.
  // Everything below works in ROOT space, not world space.
  //
  // The model was scaled and grounded around its own origin, so its points are in the
  // mech's local frame. A joint's matrixWorld, however, also carries the mech's
  // position on the battlefield. Mapping local points through it drops every chunk at
  // the world origin instead of on the mech — geometry smeared from the mech back to
  // 0,0,0. It is invisible for a mech standing at the origin, which is exactly where
  // the asset harness renders them, so this only showed up in a real match.
  v.root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(v.root.matrixWorld).invert();
  const inRoot = (o: THREE.Object3D): THREE.Matrix4 =>
    new THREE.Matrix4().copy(rootInv).multiply(o.matrixWorld);

  const jointY = (o: THREE.Object3D): number =>
    new THREE.Vector3().setFromMatrixPosition(inRoot(o)).y / height;

  const LEG_TOP = jointY(v.legJoints.hipL);   // hip joint height — top of the legs
  const KNEE = jointY(v.legJoints.kneeL);     // knee joint height — thigh/shin cut
  const NECK = 0.82;      // above this is head
  const ARM_OUT = 0.52;   // |x| beyond this fraction of half-width is an arm
  const CT_IN = 0.20;     // |x| within this stays centre torso

  // Parts, not zones: a leg is two rigid pieces driven by two different joints, but
  // both still report the same hit zone. Cutting the leg only at the hip makes the
  // whole limb swing as one bar and the foot scythes away from the body mid-stride.
  type PartId = ZoneId | 'll_lo' | 'rl_lo';
  const buckets: Record<PartId, Tri[]> = {
    head: [], ct: [], lt: [], rt: [], la: [], ra: [], ll: [], rl: [], ll_lo: [], rl_lo: [],
  };

  for (const t of tris) {
    const cx = (t.p[0].x + t.p[1].x + t.p[2].x) / 3 - centre.x;
    const cy = ((t.p[0].y + t.p[1].y + t.p[2].y) / 3 - footY) / height;
    const ax = Math.abs(cx) / halfW;

    let part: PartId;
    if (cy < LEG_TOP) {
      const left = cx < 0;
      if (cy < KNEE) part = left ? 'll_lo' : 'rl_lo';
      else part = left ? 'll' : 'rl';
    } else if (cy > NECK && ax < ARM_OUT) part = 'head';
    else if (ax > ARM_OUT) part = cx < 0 ? 'la' : 'ra';
    else if (ax < CT_IN) part = 'ct';
    else part = cx < 0 ? 'lt' : 'rt';
    buckets[part].push(t);
  }

  // --- rebuild each zone as a mesh parented to its existing joint --------------
  const jointFor: Record<PartId, THREE.Object3D> = {
    head: v.headNode,
    ct: v.torsoPivot, lt: v.torsoPivot, rt: v.torsoPivot,
    la: v.armGroups.la, ra: v.armGroups.ra,
    ll: v.legJoints.hipL, rl: v.legJoints.hipR,
    ll_lo: v.legJoints.kneeL, rl_lo: v.legJoints.kneeR,
  };
  // Both halves of a leg answer to the same hit zone.
  const zoneOf: Record<PartId, ZoneId> = {
    head: 'head', ct: 'ct', lt: 'lt', rt: 'rt', la: 'la', ra: 'ra',
    ll: 'll', rl: 'rl', ll_lo: 'll', rl_lo: 'rl',
  };

  const inv = new THREE.Matrix4();
  let replaced = 0;

  // A zone with too few triangles to be worth cutting keeps its original box, so
  // `zoneMeshes[z][0]` — the subtarget aim point — is never left dangling.
  const partIds = Object.keys(buckets) as PartId[];
  const replacingParts = partIds.filter((p) => buckets[p].length >= 12);
  const replacing = new Set(replacingParts.map((p) => zoneOf[p]));
  if (!replacing.size) return false;
  const zoneIds: ZoneId[] = ['head', 'ct', 'lt', 'rt', 'la', 'ra', 'll', 'rl'];

  // Retire the procedural build before adding the real geometry: not just the armour
  // boxes, but the visor panel and the stand-in weapon barrels, emitters and missile
  // tubes. The generated mesh already models this chassis's loadout as visible
  // hardware, so leaving the placeholders on would double them up and — because they
  // sit at procedural offsets — leave them floating in mid-air. Jump-jet flames are
  // effects rather than geometry, so they stay; and any zone we are NOT replacing
  // gets its box turned straight back on.
  const flames = new Set<THREE.Object3D>(v.jetFlames);
  v.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !flames.has(m)) m.visible = false;
  });
  for (const z of zoneIds) {
    if (!replacing.has(z)) for (const box of v.zoneMeshes[z]) box.visible = true;
  }

  // One material per zone, shared by every part of that zone, so battle damage tints
  // the thigh and the shin together exactly as the procedural per-zone material did.
  const zoneMats = new Map<ZoneId, THREE.MeshStandardMaterial>();
  const freshMeshes = new Map<ZoneId, THREE.Mesh[]>();

  for (const partId of replacingParts) {
    const zone = zoneOf[partId];
    const bucket = buckets[partId];
    const joint = jointFor[partId];
    inv.copy(inRoot(joint)).invert();

    const pos = new Float32Array(bucket.length * 9);
    const nrm = new Float32Array(bucket.length * 9);
    const uv = new Float32Array(bucket.length * 6);
    const tmp = new THREE.Vector3();

    bucket.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        tmp.copy(t.p[k]).applyMatrix4(inv);
        pos.set([tmp.x, tmp.y, tmp.z], i * 9 + k * 3);
        tmp.copy(t.n[k]).transformDirection(inv);
        nrm.set([tmp.x, tmp.y, tmp.z], i * 9 + k * 3);
        uv.set([t.uv[k].x, t.uv[k].y], i * 6 + k * 2);
      }
    });

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

    // Put the mesh's origin on its own centre of volume and carry the offset on the
    // node instead. Subtargeting and the damage-marker code both locate a zone with
    // zoneMeshes[z][0].getWorldPosition(); for a box that was the middle of the
    // armour, but a chunk built in joint space would report the JOINT — the hip for
    // a leg, the shoulder for an arm. Re-centring keeps that contract intact.
    g.computeBoundingBox();
    const mid = g.boundingBox!.getCenter(new THREE.Vector3());
    g.translate(-mid.x, -mid.y, -mid.z);
    g.computeBoundingSphere();

    let zoneMat = zoneMats.get(zone);
    if (!zoneMat) {
      zoneMat = (material as THREE.MeshStandardMaterial).clone();
      zoneMats.set(zone, zoneMat);
    }
    const mesh = new THREE.Mesh(g, zoneMat);
    mesh.position.copy(mid);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.mechId = mech.id;
    mesh.userData.zone = zone;

    joint.add(mesh);
    const list = freshMeshes.get(zone) ?? [];
    list.push(mesh);
    freshMeshes.set(zone, list);
    replaced++;
  }

  v.skinned = true;

  // Hand the new meshes over to the zone registry raycasting and damage read from.
  for (const [zone, meshes] of freshMeshes) {
    v.zoneMeshes[zone] = meshes;
    v.zoneMaterials[zone] = zoneMats.get(zone)!;
  }

  // The swap installs pristine materials, so re-apply the damage the mech has already
  // taken — otherwise a mech that gets skinned mid-fight visually repairs itself.
  for (const zone of zoneIds) scorchZone(v, mech, zone);

  return replaced > 0;
}

/**
 * Build-and-upgrade: hand back the procedural mech immediately so the frame is never
 * blocked, then swap in the generated geometry when it lands. A mech with no generated
 * asset simply stays procedural forever, which is why every chassis remains playable
 * whether or not its GLB has been built.
 */
export function skinMechVisual(v: MechVisual, mech: Mech, lod: Lod = 'lod1'): void {
  // ?noskin=1 keeps the procedural boxes. Kept as a supported switch, not debug
  // scaffolding: it is the fallback for low-end machines and the control arm when
  // attributing a test failure to the geometry swap rather than to game logic.
  if (typeof location !== 'undefined'
    && new URLSearchParams(location.search).get('noskin') === '1') return;

  void loadModel(`mech-${mech.def.id}`, lod).then((src) => {
    if (!src || v.dead) return;
    try {
      applyModelSkin(v, mech, src);
    } catch (e) {
      console.warn(`[mechfactory] skin failed for ${mech.def.id}, staying procedural`, e);
    }
  });
}

/** Per-frame pose update: walk cycle, torso twist, recoil, limp, death collapse. */
export function animateMech(v: MechVisual, mech: Mech, dt: number): void {
  v.root.position.copy(mech.pos);
  v.root.rotation.y = mech.legYaw;

  if (!mech.alive) {
    if (!v.dead) { v.dead = true; v.deathT = 0; }
    for (const f of v.jetFlames) f.visible = false;
    v.deathT = Math.min(1, v.deathT + dt / 1.1);
    const t = v.deathT;
    v.root.rotation.x = t * t * 1.35;
    v.root.position.y = mech.pos.y + Math.sin(t * Math.PI * 0.5) * -0.5;
    return;
  }

  const speedFrac = Math.abs(mech.speed) / Math.max(1, mech.maxSpeedMs);
  const llGone = mech.zones.ll.destroyed;
  const rlGone = mech.zones.rl.destroyed;
  const limp = llGone || rlGone;
  // Rigid generated segments open at the cut under a wide swing, so damp the gait
  // once the mech is skinned; the boxes can still stride freely.
  const gait = v.skinned ? 0.38 : 1;
  const amp = (0.18 + speedFrac * 0.42) * (limp ? 0.6 : 1) * gait;
  const ph = mech.walkPhase;

  const swingL = Math.sin(ph) * amp * (llGone ? 0.25 : 1);
  const swingR = Math.sin(ph + Math.PI) * amp * (rlGone ? 0.25 : 1);
  v.legJoints.hipL.rotation.x = -0.22 + swingL;
  v.legJoints.hipR.rotation.x = -0.22 + swingR;
  v.legJoints.kneeL.rotation.x = 0.42 + Math.max(0, -swingL) * 1.1 * gait;
  v.legJoints.kneeR.rotation.x = 0.42 + Math.max(0, -swingR) * 1.1 * gait;

  // body bob + limp lurch
  const bob = Math.abs(Math.sin(ph)) * 0.08 * v.unit * speedFrac;
  const lurch = limp ? Math.sin(ph) * 0.06 * v.unit : 0;
  v.root.position.y = mech.pos.y + bob;
  v.root.rotation.z = lurch + (mech.shutdown ? 0.04 : 0);

  // torso
  v.torsoPivot.rotation.y = mech.torsoYaw;
  v.torsoPivot.rotation.x = -mech.torsoPitch * 0.35;
  v.armGroups.la.rotation.x = -mech.torsoPitch * 0.65 + v.recoil.la;
  v.armGroups.ra.rotation.x = -mech.torsoPitch * 0.65 + v.recoil.ra;
  v.recoil.la *= Math.pow(0.001, dt);
  v.recoil.ra *= Math.pow(0.001, dt);

  // shutdown slump
  const slump = mech.shutdown ? 0.18 : 0;
  v.torsoPivot.rotation.x += slump;

  for (const f of v.jetFlames) {
    f.visible = mech.jetting;
    if (f.visible) f.scale.setScalar(0.8 + Math.random() * 0.4);
  }
}

const SCORCH = new THREE.Color(0x241f1a);
const DESTROYED = new THREE.Color(0x2a2622);

/**
 * Darken a zone as its armour is stripped, and char it on destruction.
 *
 * Computed from the zone's CURRENT state against a remembered base colour, never by
 * blending the material further each call. The old version lerped the live colour
 * toward the scorch tone on every damage event, so the darkening accumulated with
 * hit count rather than tracking damage — a mech that took twenty small hits ended
 * up black. That was survivable when a zone was a flat-coloured box, but a skinned
 * zone's colour multiplies its albedo map, so the same drift turned the generated
 * geometry into an unlit silhouette.
 *
 * Skinned zones are also scorched more gently: the texture is already carrying the
 * weathering, so it only needs tinting, not repainting.
 */
export function scorchZone(v: MechVisual, mech: Mech, zone: ZoneId): void {
  const z = mech.zones[zone];
  const m = v.zoneMaterials[zone];

  // Remember the untouched colour the first time we ever tint this material.
  let base = m.userData.baseColor as THREE.Color | undefined;
  if (!base) {
    base = m.color.clone();
    m.userData.baseColor = base;
  }

  // A textured zone must stay readable; a flat box can go much darker.
  const ceiling = v.skinned ? 0.55 : 1;

  if (z.destroyed) {
    m.color.copy(base).lerp(DESTROYED, ceiling);
    m.emissive.setHex(0x000000);
    return;
  }

  const frac = Math.max(0, Math.min(1, z.armor / z.armorMax));
  const structural = z.structure < z.structureMax ? 0.25 : 0;
  const t = Math.min(1, (1 - frac) * 0.25 + structural) * ceiling;
  m.color.copy(base).lerp(SCORCH, t);
}

/** Detach an arm group for physics debris; returns it in world space, or null. */
export function severArm(v: MechVisual, scene: THREE.Scene, zone: 'la' | 'ra'): THREE.Group | null {
  const g = v.armGroups[zone];
  if (!g.parent) return null;
  scene.attach(g);
  return g;
}
