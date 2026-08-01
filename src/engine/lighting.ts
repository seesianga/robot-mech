import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { DEFAULT_EXPOSURE } from './renderer';
import { isSoftwareRenderer } from './quality';

/**
 * §5.2 — per-biome lighting profiles, authored as data in content/lighting/.
 *
 * A profile replaces the neutral RoomEnvironment probe with a real prefiltered sky:
 * the SAME equirect drives both scene.background and scene.environment, so the visible
 * sky and the IBL can never disagree (the §5.2 rule). The sun direction was extracted
 * from the HDRI offline by scripts/build_env.mjs and stored rotated by envRotationY,
 * so the key light always agrees with the sky's bright region too.
 *
 * Biomes without a profile keep the MOODS path in world/terrain.ts unchanged —
 * resetLighting() restores everything a profile touches that MOODS does not.
 */
export interface LightingProfile {
  id: string;
  biome: string;
  /** MapIds this profile covers. A map without a profile uses the MOODS fallback. */
  maps: string[];
  envUrl: string;
  envRotationY: number;
  environmentIntensity: number;
  backgroundIntensity: number;
  backgroundBlurriness: number;
  /** §5.1 fixed exposure per biome — replaces DEFAULT_EXPOSURE while active. */
  exposureEV: number;
  /** Residual diffuse fill. Post-IBL absolute value, NOT scaled like MOODS. */
  hemiIntensity: number;
  sun: { direction: [number, number, number]; intensity: number; colorHex: string };
  shadow: { bias: number; normalBias: number };
  fog: { colorHex: string; near: number; far: number } | null;
}

const modules = import.meta.glob('../../content/lighting/*.json', { eager: true }) as
  Record<string, { default: LightingProfile }>;

const byMap = new Map<string, LightingProfile>();
for (const m of Object.values(modules)) {
  for (const id of m.default.maps) byMap.set(id, m.default);
}

export function lightingProfileFor(map: string): LightingProfile | null {
  return byMap.get(map) ?? null;
}

/** How far out the sun sits along its direction — matches the MOODS offset scale. */
const SUN_DISTANCE = 660;

const loader = new HDRLoader();
const envCache = new Map<string, THREE.Texture>();

/**
 * Applies a biome profile; returns false when it declined to (software rasteriser).
 *
 * Async: fetches the baked equirect (~1.2 MB, cached per session) and prefilters it —
 * this runs during mission load, behind the loading screen, never mid-play. The
 * one-time PMREM cost at 1024×512 is logged so the "prefilter offline vs at load"
 * call in LIGHTING §5.2 stays a measured number.
 *
 * Software rasterisers (CI, the lightprobe) keep the MOODS path: the prefilter alone
 * measured 54.7 s under swiftshader, which blows every harness timeout to produce
 * pixels the probe does not measure. ?ibl=1 forces the profile for manual QA;
 * ?ibl=0 skips it anywhere.
 */
export async function applyLightingProfile(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  p: LightingProfile,
): Promise<boolean> {
  const force = new URLSearchParams(location.search).get('ibl');
  if (force === '0' || (force !== '1' && isSoftwareRenderer())) {
    console.info(`[lighting] ${p.id}: skipped (software GL) — MOODS fallback active`);
    return false;
  }
  let equirect = envCache.get(p.envUrl);
  if (!equirect) {
    equirect = await loader.loadAsync(p.envUrl);
    equirect.mapping = THREE.EquirectangularReflectionMapping;
    envCache.set(p.envUrl, equirect);
  }

  const t0 = performance.now();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(equirect).texture;
  pmrem.dispose();
  console.info(`[lighting] ${p.id}: prefilter ${(performance.now() - t0).toFixed(1)} ms`);

  (scene.userData.profileEnv as THREE.Texture | undefined)?.dispose();
  scene.userData.profileEnv = env;

  scene.environment = env;
  scene.environmentIntensity = p.environmentIntensity;
  scene.environmentRotation.set(0, p.envRotationY, 0);

  // sky = IBL, same source (§5.2). The blur hides 1k equirect texels at the horizon.
  scene.background = equirect;
  scene.backgroundIntensity = p.backgroundIntensity;
  scene.backgroundBlurriness = p.backgroundBlurriness;
  scene.backgroundRotation.set(0, p.envRotationY, 0);

  const sun = scene.userData.sun as THREE.DirectionalLight | undefined;
  if (sun) {
    scene.userData.sunOffset = new THREE.Vector3(...p.sun.direction).multiplyScalar(SUN_DISTANCE);
    sun.intensity = p.sun.intensity;
    sun.color.set(p.sun.colorHex);
    sun.shadow.bias = p.shadow.bias;
    sun.shadow.normalBias = p.shadow.normalBias;
  }

  const hemi = scene.userData.hemi as THREE.HemisphereLight | undefined;
  if (hemi) hemi.intensity = p.hemiIntensity;

  if (p.fog) scene.fog = new THREE.Fog(new THREE.Color(p.fog.colorHex), p.fog.near, p.fog.far);

  renderer.toneMappingExposure = p.exposureEV;
  return true;
}

/**
 * Restores everything a profile changed that the MOODS path does not set itself.
 * buildTerrain() already reassigns background, fog, sunOffset, sun/hemi/environment
 * intensity — this covers the rest, and is safe to call when no profile was active.
 */
export function resetLighting(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
  scene.environment = (scene.userData.neutralEnv as THREE.Texture | undefined) ?? scene.environment;
  scene.environmentRotation.set(0, 0, 0);
  scene.backgroundRotation.set(0, 0, 0);
  scene.backgroundIntensity = 1;
  scene.backgroundBlurriness = 0;
  const sun = scene.userData.sun as THREE.DirectionalLight | undefined;
  if (sun) {
    sun.color.set(0xfff0d8);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
  }
  renderer.toneMappingExposure = DEFAULT_EXPOSURE;
  (scene.userData.profileEnv as THREE.Texture | undefined)?.dispose();
  scene.userData.profileEnv = undefined;
}
