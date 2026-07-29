import * as THREE from 'three';

/**
 * §6.8 — "prop LOD3: impostor".
 *
 * Why this exists rather than more decimation
 * -------------------------------------------
 * 13 of 51 meshes will not simplify below ~4-14k triangles however low the target,
 * because meshoptimizer preserves topology and these are thousands of disconnected
 * shells. That is honest to the art: env-bt-fence is a "modular open-frame lattice",
 * prop-hull-carcass is "exposed rib frames and deck plates", prop-arcology-mid is
 * "repeating tiers with recessed window bands and service rails". Regenerating them
 * through Tripo was measured and moved the floor only 14,199 -> 11,333 (ADR notes in
 * scripts/tripo_regen.py). A lattice is not one surface, and no setting makes it one.
 *
 * §6.8's prop row ends "LOD3: impostor", not "LOD3: fewer triangles". A distant
 * background building should stop being geometry.
 *
 * Why baked at RUNTIME rather than offline
 * ----------------------------------------
 * The obvious design is an offline bake writing impostor atlases into public/models.
 * That costs download, and ADR-0002 established that download is this project's binding
 * budget — §8.2 allows ~280 MB total and models are already 76 MB. A runtime bake costs
 * one render-to-texture per prop at load, no bytes on the wire, and no new asset
 * pipeline to keep in sync with the §6.6 gate.
 *
 * The trade is that impostors are view-dependent: a single baked angle is correct only
 * from that angle. These are background dressing seen at 150 m+, where a camera-facing
 * billboard of a building reads as a building. It would NOT be acceptable for a mech,
 * which is why nothing here is applied to frames.
 */

let renderer: THREE.WebGLRenderer | null = null;

/** Impostors need the live renderer to bake. Called once from boot, like installKtx2. */
export function setImpostorRenderer(r: THREE.WebGLRenderer): void {
  renderer = r;
}

/**
 * Assets whose LOD chain hits a topology floor, measured by scripts/tripo_qc.mjs
 * against the §6.8 budgets. Only these get impostors — everything else already
 * decimates to its budget, and a billboard would be a downgrade for no gain.
 */
export const IMPOSTOR_ASSETS = new Set([
  'env-bt-fence', 'env_tut_barricade', 'env_tut_coolant_bowser',
  'prop-arcology-crown', 'prop-arcology-mid', 'prop-arcology-podium',
  'prop-cracking-tower', 'prop-fuel-tank', 'prop-hangar', 'prop-hull-carcass',
  'prop-relay-pylon', 'prop-searchlight-tower',
  // int-cockpit is deliberately absent: it is interior geometry viewed from inside,
  // where an impostor is meaningless.
]);

/** Distance in metres beyond which the billboard replaces the mesh. */
export const IMPOSTOR_DISTANCE = 140;

const TEX = 256;

/**
 * Render `model` to a transparent texture from a three-quarter view and return a
 * camera-facing billboard of the same world size.
 *
 * Returns null when baking is not possible (no renderer yet, degenerate bounds), and the
 * caller keeps the mesh — an impostor is an optimisation, never a correctness dependency.
 */
export function bakeImpostor(model: THREE.Object3D): THREE.Sprite | null {
  if (!renderer) return null;

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (size.x < 1e-6 || size.y < 1e-6 || size.z < 1e-6) return null;
  const centre = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.5;

  const target = new THREE.WebGLRenderTarget(TEX, TEX, {
    format: THREE.RGBAFormat,
    colorSpace: THREE.SRGBColorSpace,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });

  // An orthographic bake keeps the silhouette true to the mesh's proportions; a
  // perspective bake would embed the bake distance's foreshortening into the texture
  // and the billboard would look subtly wrong at every other distance.
  const cam = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.1, radius * 8);
  cam.position.set(centre.x + radius * 2, centre.y + radius * 1.1, centre.z + radius * 2);
  cam.lookAt(centre);

  // Bake in a scene of its own so the world's fog, sun angle and post chain do not get
  // burned into the texture — the billboard must be lit by the scene it ends up in.
  const scene = new THREE.Scene();
  const clone = model.clone(true);
  scene.add(clone);
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.copy(cam.position);
  scene.add(key);

  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearAlpha();
  renderer.setRenderTarget(target);
  renderer.setClearAlpha(0);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearAlpha(prevClear);

  // The clone is disposable, but its geometry and textures are SHARED with the cached
  // original — disposing them here would tear holes in every live instance.
  scene.remove(clone);

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: target.texture,
    transparent: true,
    // Alpha-tested rather than blended: a blended billboard does not write depth and
    // sorts badly against terrain, which is very visible on a hillside.
    alphaTest: 0.35,
    depthWrite: true,
    fog: true,
  }));
  sprite.scale.set(radius * 2, radius * 2, 1);
  sprite.position.copy(centre);
  return sprite;
}

/**
 * Wrap a model in a THREE.LOD that swaps to a baked billboard past IMPOSTOR_DISTANCE.
 * Falls back to the bare model whenever baking is unavailable.
 */
export function withImpostor(model: THREE.Object3D, assetId: string): THREE.Object3D {
  if (!IMPOSTOR_ASSETS.has(assetId)) return model;
  const sprite = bakeImpostor(model);
  if (!sprite) return model;

  const lod = new THREE.LOD();
  lod.addLevel(model, 0);
  lod.addLevel(sprite, IMPOSTOR_DISTANCE);
  return lod;
}
