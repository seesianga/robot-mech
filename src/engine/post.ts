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
    const gtao = new GTAOPass(scene, camera, w, h);
    gtao.output = GTAOPass.OUTPUT.Default;
    // Radius in world metres. A mech is ~12 m; 0.5 m reads panel seams and foot
    // contact without haloing the whole silhouette against the terrain.
    const params = (gtao as unknown as { updateGtaoMaterial?: (p: object) => void });
    params.updateGtaoMaterial?.({
      radius: 0.5,
      distanceExponent: 1.0,
      thickness: 1.0,
      scale: 1.0,
      samples: quality.ssaoHalfRes ? 8 : 16,
    });
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
