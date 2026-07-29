import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { QualityPreset } from './quality';

/**
 * §5.5 — the post-processing stack, in the spec's order.
 *
 * The game had no composer at all; only src/site/stage.ts (the marketing page) did.
 * Order follows §5.5 with the WebGPU-only stages omitted per ADR-0001:
 *
 *   1  depth/normal prepass      → GTAOPass owns its own prepass
 *   2  opaque + shadows          → RenderPass
 *   3  SSAO2 on ambient only     → GTAOPass (ground-truth AO; strictly better than SSAO2)
 *   5  volumetric lighting       → omitted, needs compute
 *   6  SSR                       → omitted, environment probe instead
 *   7  TAA                       → SMAA (Three's TAA only converges on a static camera)
 *   8  bloom, threshold HIGH     → UnrealBloomPass, reactor/muzzle/sun only
 *   9  motion blur               → omitted; §5.8 makes it accessibility-gated anyway
 *  10  depth of field            → omitted, cinematics only and there are none yet
 *  11  tone map → output         → OutputPass (renderer tone mapping + sRGB)
 *
 * §5.5's banned list is honoured by omission: no chromatic aberration, no film grain,
 * no lens dirt, no vignette, no auto-exposure.
 *
 * AO is deliberately NOT applied to direct light. GTAOPass in Three composites over
 * the beauty buffer, which is an approximation of "ambient only" — acceptable because
 * the alternative (a full deferred ambient split) is not available on this renderer.
 * The blend is kept conservative so the error stays invisible.
 */
export interface PostChain {
  composer: EffectComposer;
  setSize(w: number, h: number): void;
  /** true when the chain is doing real work; false means render the scene directly */
  active: boolean;
}

export function createPostChain(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  quality: QualityPreset,
): PostChain {
  const w = window.innerWidth;
  const h = window.innerHeight;

  // Fallback preset renders straight to the canvas — a composer costs a full-screen
  // copy per pass, which is exactly what the weakest tier cannot afford.
  if (!quality.ssao && !quality.bloom && !quality.smaa) {
    return { composer: null as unknown as EffectComposer, setSize: () => {}, active: false };
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  if (quality.ssao) {
    // This is the pass that stops the mech floating: it darkens foot contact, panel
    // seams and the crevices the environment probe would otherwise fill uniformly.
    //
    // aoParameters is the SIXTH constructor argument. Setting them afterwards via
    // updateGtaoMaterial is unreliable — it early-outs when a value equals the current
    // one, so a partially-applied config silently keeps defaults tuned for a small
    // interior scene. This battlefield is ~2 km across, and those defaults are what
    // lifted the cast shadow at quality=high.
    // The bundled @types/three declares 5 constructor parameters; the shipped
    // GTAOPass.js takes 7 (…, parameters, aoParameters, pdParameters). The typings are
    // behind the implementation, so the call is made through the real signature. Do not
    // "fix" this by dropping aoParameters — that reinstates interior-scene defaults on
    // a 2 km battlefield, which is what washed the AO out in the first place.
    type GTAOCtor = new (
      scene: THREE.Scene, camera: THREE.Camera, w: number, h: number,
      parameters?: object, aoParameters?: object, pdParameters?: object,
    ) => GTAOPass;
    const gtao = new (GTAOPass as unknown as GTAOCtor)(scene, camera, w, h, undefined, {
      // Radius in world metres. A mech is ~12 m; 0.4 m reads panel seams and foot
      // contact without haloing the silhouette against the terrain behind it.
      radius: 0.4,
      distanceExponent: 1.0,
      thickness: 1.0,
      scale: 1.0,
      samples: quality.ssaoHalfRes ? 8 : 16,
      // Screen-space radius cap. Without it, geometry near the camera claims a huge
      // pixel radius and the AO smears across the whole lower screen — which is
      // exactly what read as "the shadow got weaker".
      screenSpaceRadius: false,
    });
    gtao.output = GTAOPass.OUTPUT.Default;
    // AO must not fight the sun's cast shadow. §5.5 says AO applies to ambient only;
    // this renderer composites over the beauty buffer instead, so the blend is kept
    // well under full strength to keep that approximation invisible.
    gtao.blendIntensity = 0.55;
    composer.addPass(gtao);
  }

  if (quality.bloom) {
    // §5.5 item 8 — threshold HIGH. Bloom is for the reactor, muzzle flash and the
    // sun, never for the HUD and never as a general glow. 0.85 keeps daylight terrain
    // (which tone-maps near 1.0 under ACES) out of the bloom buffer entirely.
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.6, 0.85));
  }

  if (quality.smaa) composer.addPass(new SMAAPass());

  // OutputPass applies tone mapping + sRGB once, at the end. Without it the composer
  // would double-encode, because the renderer already tone-maps on the first pass.
  composer.addPass(new OutputPass());
  composer.setSize(w, h);

  return {
    composer,
    active: true,
    setSize: (nw, nh) => composer.setSize(nw, nh),
  };
}
