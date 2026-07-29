import { MechStage } from './stage';

/**
 * Offline harness that renders one chassis on the showroom rig so the landing
 * page's hero plate can be captured at 4K from the real game asset.
 *
 * Why this exists rather than a from-scratch generated image: the hero plate is
 * the single most important frame on the site, and the most valuable thing it
 * can be is *true*. Rendering the shipped GLB under the same lighting rig the
 * live showroom uses means the plate and the interactive stage below it are the
 * same machine, lit the same way. A generated mech would be a different object
 * wearing the same name.
 *
 * The capture is then given a photographic grade pass by gpt-image-2
 * (scripts/gen_site_art.py, mode "edit") — geometry and framing preserved,
 * lighting and surface response pushed to photoreal.
 *
 * Query params: ?id=vp_frame_shared_craton&yaw=0.6&pitch=0.1&dist=1&fov=34
 * Signals readiness by setting window.__CAP_READY once the model is in and
 * several frames have been drawn, so the capture script never shoots an empty
 * or half-faded frame.
 */

declare global {
  interface Window {
    __CAP_READY?: boolean;
    __CAP_ERROR?: string;
  }
}

const params = new URLSearchParams(location.search);
const id = params.get('id') ?? 'vp_frame_shared_craton';
const num = (k: string, d: number): number => {
  const v = parseFloat(params.get(k) ?? '');
  return Number.isFinite(v) ? v : d;
};

const host = document.getElementById('cap')!;
const canvas = document.createElement('canvas');
host.appendChild(canvas);

const stage = new MechStage({
  canvas,
  initial: id,
  quality: 'high',
  lod: 'lod0',
  onLoaded: (loadedId, ok) => {
    if (!ok) {
      window.__CAP_ERROR = `model unavailable: ${loadedId}`;
      window.__CAP_READY = true; // let the harness fail loudly rather than hang
      return;
    }
    // Hold the pose still and let several frames land: the cross-fade ramp runs
    // for roughly 600 ms and the first frame after a texture upload is often
    // missing its maps.
    stage.setAutoRotate(false);
    stage.setPose(num('yaw', 0.62), num('pitch', 0.08), num('dist', 1));
    setTimeout(() => { window.__CAP_READY = true; }, 2400);
  },
});

stage.observe();
