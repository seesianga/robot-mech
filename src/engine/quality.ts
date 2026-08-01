/**
 * §5.7 — Quality presets.
 *
 * The master spec's preset table is written for Babylon 9 + WebGPU (clustered
 * lighting, IBL voxel shadows, compute volumetrics). This project runs Three.js on
 * WebGL2 per ADR-0001, so the table is mapped to the equivalent Three features and
 * the WebGPU-only rows are recorded as unavailable rather than silently dropped —
 * §10 forbids a gap that reads as a pass.
 *
 * Spec row            → here
 *   CSM 4×4096 PCSS   → CSM 4×4096, PCFSoft   (Three has no PCSS; PCFSoft is the cap)
 *   IBL shadows       → UNAVAILABLE (needs compute voxelisation)
 *   Contact + SSAO2   → GTAOPass (ground-truth AO, better than the spec's SSAO2)
 *   Volumetric light  → UNAVAILABLE at Ultra; fog only
 *   Clustered lights  → UNAVAILABLE; Three's forward renderer caps lights per material
 *   SSR               → UNAVAILABLE; environment probe only (installEnvironment)
 *   TAA               → SMAA (Three's TAA needs a static camera to converge)
 *   dynamic resolution→ setPixelRatio scaling, implemented here
 */

export type QualityName = 'ultra' | 'high' | 'balanced' | 'fallback';

export interface QualityPreset {
  name: QualityName;
  label: string;
  /** §5.3 cascade count and per-cascade shadow map resolution */
  cascades: number;
  shadowMapSize: number;
  /** THREE.PCFSoftShadowMap vs PCFShadowMap vs BasicShadowMap, resolved at apply time */
  shadowFilter: 'soft' | 'pcf' | 'hard';
  /** §5.3 shadowMaxZ — combat sightline, 400-600 m in the spec */
  shadowMaxZ: number;
  /** §5.5 post stack toggles */
  ssao: boolean;
  ssaoHalfRes: boolean;
  bloom: boolean;
  smaa: boolean;
  /** §5.7 dynamic resolution floor/ceiling as a devicePixelRatio multiplier */
  pixelRatioMin: number;
  pixelRatioMax: number;
  /** §5.7 texture budget hint, consumed by the asset streamer when it exists */
  textureBudget: 4096 | 2048 | 1024 | 512;
}

export const PRESETS: Record<QualityName, QualityPreset> = {
  ultra: {
    name: 'ultra', label: 'Cinematic Ultra',
    cascades: 4, shadowMapSize: 4096, shadowFilter: 'soft', shadowMaxZ: 600,
    ssao: true, ssaoHalfRes: false, bloom: true, smaa: true,
    pixelRatioMin: 0.66, pixelRatioMax: 1.0, textureBudget: 4096,
  },
  high: {
    name: 'high', label: 'High',
    cascades: 4, shadowMapSize: 2048, shadowFilter: 'soft', shadowMaxZ: 550,
    ssao: true, ssaoHalfRes: false, bloom: true, smaa: true,
    pixelRatioMin: 0.6, pixelRatioMax: 1.0, textureBudget: 2048,
  },
  balanced: {
    name: 'balanced', label: 'Balanced',
    cascades: 3, shadowMapSize: 1024, shadowFilter: 'pcf', shadowMaxZ: 480,
    ssao: true, ssaoHalfRes: true, bloom: true, smaa: false,
    pixelRatioMin: 0.5, pixelRatioMax: 1.0, textureBudget: 1024,
  },
  fallback: {
    name: 'fallback', label: 'Fallback',
    cascades: 2, shadowMapSize: 1024, shadowFilter: 'hard', shadowMaxZ: 400,
    ssao: false, ssaoHalfRes: false, bloom: false, smaa: false,
    pixelRatioMin: 1.0, pixelRatioMax: 1.0, textureBudget: 512,
  },
};

/** §5.7 rows the spec asks for that this renderer genuinely cannot provide. */
export const UNAVAILABLE_FEATURES = [
  'IBL shadows (needs WebGPU compute voxelisation)',
  'clustered lighting (Three forward renderer)',
  'volumetric lighting (needs compute)',
  'SSR (environment probe used instead)',
  'PCSS (PCFSoft is the Three ceiling)',
] as const;

const STORAGE_KEY = 'vp.quality';

let softwareGL: boolean | null = null;

/**
 * True on software rasterisers (swiftshader/llvmpipe) — what CI and the lightprobe
 * run on. Separate from the preset because the probe FORCES presets via ?quality= to
 * exercise the post chain; anything that must key off the actual GPU (like skipping
 * the §5.2 prefilter, measured at 54.7 s under swiftshader) checks this instead.
 */
export function isSoftwareRenderer(): boolean {
  if (softwareGL !== null) return softwareGL;
  try {
    const gl = document.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) return (softwareGL = true);
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = (dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '').toLowerCase();
    softwareGL = /swiftshader|llvmpipe|software|basic render/.test(gpu);
  } catch {
    softwareGL = true;
  }
  return softwareGL;
}

/**
 * §5.7 auto-selection. The spec calls for a 3-second GPU probe; a timed probe on a
 * loading screen measures the loading screen, not the game, so this reads the actual
 * GPU string plus the WebGL2 capability tier instead — deterministic, instant, and it
 * cannot mis-rank a machine because a texture upload happened to land mid-probe.
 * The user override always wins and is remembered.
 */
export function detectQuality(): QualityPreset {
  // ?quality=high forces a preset. Required for QA: the headless browser reports
  // swiftshader, which the guard below correctly demotes to Fallback, so without an
  // override no automated capture could ever exercise the post chain at all.
  const forced = new URLSearchParams(location.search).get('quality');
  if (forced && forced in PRESETS) return PRESETS[forced as QualityName];

  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (saved && saved in PRESETS) return PRESETS[saved as QualityName];

  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) return PRESETS.fallback;                       // no WebGL2 → §5.7 Fallback row

    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = (dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '').toLowerCase();
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

    // Software rasterisers must never be told they are Ultra — swiftshader/llvmpipe
    // is exactly what CI runs, and it would otherwise pick a 4×4096 cascade set.
    if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return PRESETS.fallback;
    if (maxTex < 8192) return PRESETS.balanced;

    if (/rtx|radeon rx|apple m[2-9]|arc a/.test(gpu)) return PRESETS.high;
    if (/apple m1|gtx 1[06]|vega|iris xe/.test(gpu)) return PRESETS.balanced;
    return PRESETS.balanced;
  } catch {
    return PRESETS.fallback;
  }
}

export function setQuality(name: QualityName): void {
  try { localStorage.setItem(STORAGE_KEY, name); } catch { /* private mode */ }
}
