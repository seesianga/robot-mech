import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { withImpostor } from './impostor';

/**
 * Shared loader for the Tripo3D-derived GLBs in public/models/.
 *
 * Everything under public/models is produced by scripts/build_lods.mjs and is
 * meshopt-compressed, so the decoder is mandatory — without it GLTFLoader throws
 * on the EXT_meshopt_compression extension. The raw ~44 MB Tripo sources live in
 * assets/tripo/generated/ and are deliberately not served.
 *
 * Loads are cached and de-duplicated: N mechs of the same chassis share one
 * download and one GPU upload, and callers clone for their own instance.
 */

export type Lod = 'lod0' | 'lod1' | 'lod2';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

/**
 * §12.4 — KTX2 / Basis support.
 *
 * The models currently ship WebP (EXT_texture_webp), which is a correct web format but
 * is decoded to full RGBA in VRAM: a 2048² albedo costs 16 MB resident whatever the
 * file size was. KTX2/Basis stays GPU-compressed, which is the entire point of the
 * §5.7 texture budgets.
 *
 * This must exist BEFORE any asset is transcoded. A GLB carrying KTX2 textures fails to
 * load outright without the loader, so the client change comes first and the asset
 * change second — the reverse order breaks every model in the game.
 *
 * detectSupport() needs the live renderer to know which GPU formats are available, so
 * this is called from boot rather than at module scope. Until it is called, the loader
 * simply has no KTX2 support and WebP assets keep loading exactly as before, which is
 * why shipping this ahead of the transcode is safe.
 */
let ktx2: KTX2Loader | null = null;

export function installKtx2(renderer: THREE.WebGLRenderer): void {
  if (ktx2) return;
  try {
    ktx2 = new KTX2Loader()
      .setTranscoderPath('/basis/')
      .detectSupport(renderer);
    loader.setKTX2Loader(ktx2);
  } catch (e) {
    // A missing or broken transcoder must not take the game down: without KTX2 the
    // WebP assets still load. It only matters once assets are actually transcoded.
    console.warn('[assets] KTX2 unavailable, continuing without it:', e);
    ktx2 = null;
  }
}

const cache = new Map<string, Promise<THREE.Group>>();
const missing = new Set<string>();

function key(id: string, lod: Lod): string {
  return `${id}.${lod}`;
}

/**
 * Load a model, or resolve null if it has not been generated. Never rejects:
 * each caller owns its fallback policy (procedural gameplay geometry, a static
 * plate, or a neutral unavailable state such as the hangar preview).
 */
export function loadModel(id: string, lod: Lod = 'lod1'): Promise<THREE.Group | null> {
  const k = key(id, lod);
  if (missing.has(k)) return Promise.resolve(null);

  let p = cache.get(k);
  if (!p) {
    p = new Promise<THREE.Group>((resolve, reject) => {
      loader.load(
        `${import.meta.env.BASE_URL}models/${k}.glb`,
        (gltf) => resolve(gltf.scene),
        undefined,
        (err) => reject(err),
      );
    });
    cache.set(k, p);
  }
  return p.catch(() => {
    missing.add(k);
    cache.delete(k);
    console.warn(`[assets] ${k}.glb unavailable — using the caller's fallback state`);
    return null;
  });
}

/**
 * Drop a model from the cache and release its GPU memory.
 *
 * The game never needs this — a mission loads a bounded set of assets once and
 * keeps them for the session. The landing page does: a visitor clicking through
 * all twelve chassis would otherwise accumulate twelve resident GLBs, and each
 * lod0 carries 2048-square albedo, normal and roughness maps — roughly 67 MB of
 * GPU allocation apiece. Twelve of those will exhaust a 4 GB machine.
 *
 * Only safe for an id that nothing is currently drawing. Clones made by
 * `instantiate` share geometry and textures with the cached original, so
 * releasing an asset still on screen would tear the holes out of a live mesh.
 */
export function releaseModel(id: string, lod: Lod = 'lod1'): void {
  const k = key(id, lod);
  const entry = cache.get(k);
  if (!entry) return;
  cache.delete(k);
  void entry.then((group) => {
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry?.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        if (!mat) continue;
        // Textures are not disposed by Material.dispose(); they have to be
        // walked explicitly or the maps stay resident with no owner.
        for (const slot of Object.values(mat) as unknown[]) {
          if (slot instanceof THREE.Texture) slot.dispose();
        }
        mat.dispose();
      }
    });
  }).catch(() => { /* a load that already failed has nothing to free */ });
}

/**
 * Yaw correction applied to every generated model.
 *
 * Tripo emits these mechs facing +X, but the game's forward is +Z — the procedural
 * mech puts its cockpit visor at +Z and `root.rotation.y = mech.legYaw` is measured
 * from there. Left uncorrected the mech walks sideways, and worse, the hit-zone split
 * in mechfactory divides the mesh by its X axis: on a sideways model that separates
 * front from back rather than left from right, so `la`/`ra` and `ll`/`rl` come out
 * grossly unbalanced.
 *
 * The tell is the bounding box. A biped in A-pose is always wider than it is deep;
 * every raw mech GLB measures roughly twice as deep as wide, which only happens if
 * it is turned a quarter-turn. Rotating -90° about Y maps +X onto +Z.
 */
export const MODEL_YAW_FIX = -Math.PI / 2;

/** Turn a generated model to face the game's forward axis. Safe to call once only. */
export function orientToGameForward(obj: THREE.Object3D): THREE.Object3D {
  obj.rotation.y += MODEL_YAW_FIX;
  return obj;
}

/** A fresh, independently-transformable copy that still shares geometry and textures. */
export function instantiate(src: THREE.Group): THREE.Group {
  const clone = src.clone(true);
  clone.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      const m = o as THREE.Mesh;
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return clone;
}

/**
 * Uniformly scale and ground a model so it stands `targetHeight` metres tall with its
 * feet at y=0 and its centre on the origin. Tripo emits real-world-ish scale with an
 * arbitrary origin, so every asset needs this before it can share a scene with the
 * procedural geometry.
 */
export function fitToHeight(obj: THREE.Object3D, targetHeight: number): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  if (size.y > 1e-6) {
    const s = targetHeight / size.y;
    obj.scale.multiplyScalar(s);
  }
  const fitted = new THREE.Box3().setFromObject(obj);
  const c = fitted.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= fitted.min.y;
  return obj;
}

/**
 * Dress a procedural box with generated geometry, without touching gameplay.
 *
 * Cover props, crates, barriers and mission structures are plain `BoxGeometry`
 * meshes that are also the collision and weapons-raycast volumes — `Terrain.colliders`
 * holds them, and shots test against them directly. Swapping the geometry would move
 * the collision, so instead the box stays exactly where it is and simply stops being
 * drawn: its material goes fully transparent while the mesh itself remains visible to
 * the raycaster, and the generated model is parented to it, scaled to its bounds.
 *
 * Cover therefore blocks fire in precisely the same places it always did; only the
 * pixels change. A missing asset leaves the original box painted as before.
 *
 * Defaults to lod2. Scatter cover is numerous — a single map dresses 26 crates — and
 * at lod1 that alone is ~1M triangles of packing crates, which halved the frame rate.
 * These are small objects the player walks past, so the 11k-triangle tier is the right
 * one; pass 'lod1' explicitly for a hero prop.
 */
/**
 * ?noprops=1 leaves every prop as its untextured procedural box. Control arm for
 * attributing a failure to the prop dressing rather than to game logic, and the
 * low-end fallback for machines that cannot afford the extra geometry.
 */
function propsDisabled(): boolean {
  return typeof location !== 'undefined'
    && new URLSearchParams(location.search).get('noprops') === '1';
}

export function dressBox(box: THREE.Mesh, assetId: string, lod: Lod = 'lod2'): void {
  if (propsDisabled()) return;
  void loadModel(assetId, lod).then((src) => {
    if (!src || !box.parent) return;

    box.geometry.computeBoundingBox();
    const bb = box.geometry.boundingBox;
    if (!bb) return;
    const target = bb.getSize(new THREE.Vector3());

    const model = orientToGameForward(instantiate(src));
    const raw = new THREE.Box3().setFromObject(model);
    const size = raw.getSize(new THREE.Vector3());
    if (size.x < 1e-6 || size.y < 1e-6 || size.z < 1e-6) return;

    // Fill the box's footprint. Props are crates and slabs, so matching the volume
    // reads better than preserving the model's aspect ratio.
    model.scale.set(target.x / size.x, target.y / size.y, target.z / size.z);
    model.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(model);
    model.position.sub(fitted.getCenter(new THREE.Vector3()));

    // Keep the collider raycastable but invisible — do NOT use `visible = false`,
    // which would also hide the model parented beneath it.
    const hide = (m: THREE.Material): THREE.Material => {
      const c = m.clone();
      c.transparent = true;
      c.opacity = 0;
      c.depthWrite = false;
      return c;
    };
    box.material = Array.isArray(box.material)
      ? box.material.map(hide) : hide(box.material);
    box.castShadow = false;
    box.receiveShadow = false;

    // §6.8 LOD3 — the 13 meshes that cannot decimate become a billboard past 140 m.
    // Everything else is returned unchanged, so this is inert for 38 of 51 assets.
    box.add(withImpostor(model, assetId));
  });
}

/**
 * Same trick as `dressBox`, but for a multi-box assembly — a mission structure is a
 * group of slabs that together make a mast or a bunker. The generated model is fitted
 * to the union of their bounds and every slab is made invisible-but-hittable, so the
 * structure's damage model and `userData.structureId` keep working untouched.
 */
export function dressGroup(
  group: THREE.Group, parts: THREE.Mesh[], assetId: string, lod: Lod = 'lod1',
): void {
  if (propsDisabled() || !parts.length) return;
  void loadModel(assetId, lod).then((src) => {
    if (!src) return;

    // Bounds must be measured in the GROUP's LOCAL space, because that is the space
    // `model.position` is expressed in once the model is parented below. Box3
    // .expandByObject reports WORLD bounds, so on a group that has been placed on the
    // battlefield — the tracking mast sits at x=260,z=-140 — assigning the world
    // centre as a local position doubles the offset and flings the model hundreds of
    // metres away as a stretched slab. This is the same world-vs-local trap that put
    // mech chunks at the origin; dressGroup runs async, so it ALWAYS executes after
    // the group has been positioned, whatever order the call site uses.
    group.updateMatrixWorld(true);
    const toLocal = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const union = new THREE.Box3();
    for (const p of parts) {
      const bb = new THREE.Box3().setFromObject(p);
      if (bb.isEmpty()) continue;
      union.union(bb.applyMatrix4(toLocal));
    }
    if (union.isEmpty()) return;
    const target = union.getSize(new THREE.Vector3());
    const centre = union.getCenter(new THREE.Vector3());

    const model = orientToGameForward(instantiate(src));
    const raw = new THREE.Box3().setFromObject(model);
    const size = raw.getSize(new THREE.Vector3());
    if (size.x < 1e-6 || size.y < 1e-6 || size.z < 1e-6) return;
    model.scale.set(target.x / size.x, target.y / size.y, target.z / size.z);
    model.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(model);
    model.position.copy(centre).sub(fitted.getCenter(new THREE.Vector3()));

    for (const p of parts) {
      const hide = (m: THREE.Material): THREE.Material => {
        const c = m.clone();
        c.transparent = true;
        c.opacity = 0;
        c.depthWrite = false;
        return c;
      };
      p.material = Array.isArray(p.material) ? p.material.map(hide) : hide(p.material);
      p.castShadow = false;
      p.receiveShadow = false;
    }
    group.add(model);
  });
}

/** Metres covered by one repeat of the ground texture. */
const GROUND_TILE_M = 48;

/** Ground textures are authored per map; anything without its own set uses 'yard'. */
const GROUND_FALLBACK = 'yard';

const texLoader = new THREE.TextureLoader();

function groundMap(
  map: string, suffix: string, srgb: boolean, repeat: number,
): Promise<THREE.Texture | null> {
  const load = (id: string): Promise<THREE.Texture> => new Promise((res, rej) => {
    texLoader.load(
      `${import.meta.env.BASE_URL}textures/${id}_${suffix}.webp`, res, undefined, rej);
  });
  return load(map)
    .catch(() => (map === GROUND_FALLBACK ? Promise.reject(new Error('no fallback')) : load(GROUND_FALLBACK)))
    .then((t) => {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })
    .catch(() => null);
}

/**
 * Apply the generated ground material to the terrain plane.
 *
 * These are the one set of assets NOT produced by Tripo3D, and deliberately so: the
 * ground is a 2400 m plane whose collision comes from an analytic heightfield, not a
 * model, and it needs a seamless tiling PBR material. Tripo is a text-to-model
 * service and cannot author one, so the maps come from gpt-image-2 via
 * scripts/gen_ground_texture.py.
 *
 * Loads asynchronously and leaves the existing vertex-coloured surface in place if a
 * map has no texture yet, so the terrain is never blank.
 */
export function applyGroundTexture(
  mat: THREE.MeshStandardMaterial, map: string, sizeM: number,
): void {
  // ?lowtex=1 leaves the plain vertex-coloured ground. The 4K maps are the shipping
  // fidelity, but the headless suites run on a software rasteriser where a 50 MB
  // texture set halves the frame rate, so this is the control arm for telling a real
  // regression apart from the test box simply being slow.
  if (typeof location !== 'undefined'
    && new URLSearchParams(location.search).get('lowtex') === '1') return;

  const repeat = Math.max(1, Math.round(sizeM / GROUND_TILE_M));
  void Promise.all([
    groundMap(map, 'albedo', true, repeat),
    groundMap(map, 'normal', false, repeat),
    groundMap(map, 'rough', false, repeat),
  ]).then(([albedo, normal, rough]) => {
    if (albedo) mat.map = albedo;
    if (normal) {
      mat.normalMap = normal;
      mat.normalScale.set(0.6, 0.6);
    }
    if (rough) mat.roughnessMap = rough;
    if (albedo || normal || rough) mat.needsUpdate = true;
  });
}

/** Metres per repeat of the water texture — finer than ground so chop reads at speed. */
const WATER_TILE_M = 30;

/**
 * Apply the generated water surface.
 *
 * Same category as the ground and generated the same way: the sea is a 3840 m plane
 * carrying a flat colour and no map at all, not a model, so it comes from gpt-image-2
 * rather than Tripo. Only maps whose water level sits above the sea floor get their
 * own set; the rest park the plane at y=-40 where it is never seen.
 *
 * The mood colour is kept and multiplied into the albedo so each map's water still
 * reads as its own body of water rather than every sea looking identical.
 */
export function applyWaterTexture(
  mat: THREE.MeshStandardMaterial, map: string, sizeM: number,
): void {
  if (typeof location !== 'undefined'
    && new URLSearchParams(location.search).get('lowtex') === '1') return;

  const repeat = Math.max(1, Math.round(sizeM / WATER_TILE_M));
  const load = (suffix: string, srgb: boolean): Promise<THREE.Texture | null> =>
    new Promise<THREE.Texture>((res, rej) => {
      texLoader.load(
        `${import.meta.env.BASE_URL}textures/water_${map}_${suffix}.webp`, res, undefined, rej);
    }).then((t) => {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }).catch(() => null);

  void Promise.all([load('albedo', true), load('normal', false)])
    .then(([albedo, normal]) => {
      if (albedo) mat.map = albedo;
      if (normal) {
        mat.normalMap = normal;
        mat.normalScale.set(0.35, 0.35);
      }
      if (albedo || normal) mat.needsUpdate = true;
    });
}

/** Warm the cache for a set of ids so the first in-match spawn does not hitch. */
export function preload(ids: string[], lod: Lod = 'lod1'): Promise<void> {
  return Promise.all(ids.map((id) => loadModel(id, lod))).then(() => undefined);
}

/** Diagnostics for the asset-audit script and the viewer. */
export function assetStatus(): { cached: string[]; missing: string[] } {
  return { cached: [...cache.keys()], missing: [...missing] };
}
