import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import type { QualityPreset } from './quality';

/**
 * Hemisphere ambient AFTER image-based lighting exists. The pre-IBL value was 1.35,
 * which had to carry every ambient term by itself; with a real environment probe that
 * much flat fill erases the contact shadow under the mech and flattens the armour it
 * was meant to reveal. MOODS multiplies this per biome.
 */
const HEMI_BASE = 0.85;

/**
 * The per-biome hemiIntensity values in MOODS were art-directed against the old 1.35
 * baseline, and their RELATIVE relationships (salt brighter than storm, polar dimmest)
 * are deliberate. So they are scaled rather than rewritten: the ranking survives, the
 * absolute level drops to make room for the environment probe.
 */
export const HEMI_IBL_SCALE = HEMI_BASE / 1.35;

const SHADOW_FILTER = {
  soft: THREE.PCFSoftShadowMap,
  pcf: THREE.PCFShadowMap,
  hard: THREE.BasicShadowMap,
} as const;

/**
 * §5.1 fixed exposure for biomes without a lighting profile. Biomes WITH one carry
 * their own exposureEV (content/lighting/*.json) and engine/lighting.ts applies it.
 */
export const DEFAULT_EXPOSURE = 1.05;

export function createRenderer(container: HTMLElement, quality: QualityPreset): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    // SMAA replaces MSAA where the preset affords it (§5.5 item 7). Keeping both
    // costs a full multisample resolve for an effect SMAA already applied.
    antialias: !quality.smaa,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * quality.pixelRatioMax);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !new URLSearchParams(location.search).has('noshadow');
  renderer.shadowMap.type = SHADOW_FILTER[quality.shadowFilter];
  // §5.1 — ACES for combat. The hangar/MechLab uses PBR-Neutral so paint schemes read
  // true; that surface builds its own renderer, so this is the combat path only.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // §5.1 fixed exposure, no auto-exposure in combat. 1.3 predates IBL and now
  // double-counts against the environment probe the same way hemi did.
  renderer.toneMappingExposure = DEFAULT_EXPOSURE;
  container.appendChild(renderer.domElement);
  return renderer;
}

/**
 * §5.3 — shadow quality.
 *
 * Full cascaded shadow maps are NOT used, and that is a deliberate, revisitable call.
 * Three's CSM requires csm.setupMaterial() on every material individually; this
 * codebase creates 28 MeshStandardMaterials across 9 files with no central factory,
 * and several more at runtime (damage overlays, effects). Any material that missed the
 * patch would render with visibly wrong shadows, and a NEW material added later would
 * regress silently — the worst kind of bug to leave in a shipped game.
 *
 * What actually made the shadows mushy was not cascade count, it was texel density:
 * a fixed ±350 m frustum at 2048 px is 0.34 m per texel, and a mech foot is about a
 * metre, so foot contact resolved across three texels. Fitting the frustum to the
 * preset's combat sightline instead gives 0.05 m per texel at Ultra — roughly a
 * seven-fold gain — for none of the material risk.
 *
 * Revisit when materials go through one factory (§3.3 content-schema work would give
 * us that), at which point CSM is a contained change.
 */
export function createScene(quality: QualityPreset): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9db6c2);
  scene.fog = new THREE.Fog(0x9fb4bd, 250, 1900);

  // 1.35 was tuned when there was no image-based lighting, so the hemisphere was
  // standing in for ALL ambient. Now that installEnvironment supplies the ambient
  // specular, leaving it there double-counts and washes the contact shadows out.
  // HEMI_BASE is the post-IBL value; MOODS scales from it. See applyMood().
  const hemi = new THREE.HemisphereLight(0xc4d8e2, 0x6a5a48, HEMI_BASE);
  scene.add(hemi);
  scene.userData.hemi = hemi;

  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.position.set(320, 520, 180);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);

  // Fitted to the preset's combat sightline rather than a fixed ±350 m. The half-
  // extent is what sets texel density, so it is the single most important number here.
  const half = quality.shadowMaxZ * 0.25;      // Ultra: 150 m half-extent @ 4096 → 0.073 m/texel
  sun.shadow.camera.left = -half;
  sun.shadow.camera.right = half;
  sun.shadow.camera.top = half;
  sun.shadow.camera.bottom = -half;
  sun.shadow.camera.near = 50;
  sun.shadow.camera.far = 1400;
  // §5.3 asks for per-biome bias; applyMood() overrides both from the MOODS table.
  // normalBias scales with world texel size or thin armour panels self-shadow.
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);
  scene.userData.sun = sun;
  scene.userData.shadowHalf = half;

  return scene;
}

/**
 * Image-based lighting for the GAME scene.
 *
 * This was the single largest visual gap in the project: src/site/stage.ts (the
 * marketing showroom) has had IBL since it was written, and the game never did. In
 * Three's PBR model a metal has no diffuse term at all — everything you see on it is
 * reflected environment. With scene.environment unset, every metalness>0 surface fell
 * back to one specular highlight from the sun and read as flat dark plastic. The mechs
 * are almost entirely metal (metalness 0.3–0.8 throughout), so the whole cast was
 * being rendered with most of its shading missing.
 *
 * RoomEnvironment is generated on the GPU at load, so this costs no download and no
 * per-frame work — one prefiltered cubemap held for the session. It is a neutral studio
 * probe, not a sky: it supplies the ambient specular that makes metal read as metal.
 * Per-biome character still comes from the sun, hemisphere and fog in the MOODS table,
 * which now also scales environmentIntensity so a whiteout salt flat and a night
 * arcology do not get the same ambient.
 *
 * Next step when the HDRI budget lands (§5.2): swap the RoomEnvironment probe for a
 * per-biome prefiltered .env and align its bright region with mood.sunOffset. The call
 * site does not change.
 */
export function installEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 1.0;   // per-biome value applied by applyMood()
  scene.userData.envMap = env;        // so a biome swap can dispose it later
  scene.userData.neutralEnv = env;    // engine/lighting.ts restores this when a
  pmrem.dispose();                    // biome has no §5.2 profile
}

/** Keeps the shadow frustum centered on the player as they cross the map. */
export function trackSun(scene: THREE.Scene, focus: THREE.Vector3): void {
  const sun = scene.userData.sun as THREE.DirectionalLight | undefined;
  if (!sun) return;
  const off = (scene.userData.sunOffset as THREE.Vector3 | undefined) ?? new THREE.Vector3(320, 520, 180);
  sun.position.set(focus.x + off.x, off.y, focus.z + off.z);
  sun.target.position.copy(focus);
  sun.target.updateMatrixWorld();
}
