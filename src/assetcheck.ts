import * as THREE from 'three';
import { Mech } from './sim/mech';
import { mechDef } from './sim/content';
import { buildMechVisual, animateMech, COMPACT_PALETTE } from './world/mechfactory';
import { loadModel } from './world/assets';

/**
 * Third-person asset verification harness (assetcheck.html).
 *
 * The in-game camera is inside the cockpit, so a smoke screenshot can never show
 * whether the generated geometry actually replaced the procedural boxes. This page
 * renders each chassis from outside, mid-walk-cycle, and reports per-zone swap
 * counts on window.__SKIN for the headless checker to assert against.
 */

const params = new URLSearchParams(location.search);
const chassis = params.get('mech') ?? 'halite';
const walk = params.get('walk') !== '0';

declare global {
  interface Window {
    __SKIN?: {
      chassis: string;
      ready: boolean;
      zones: Record<string, number>;
      swapped: number;
      procedural: number;
      /** metres the drawn geometry sits from the mech's actual position */
      drift?: number;
      error?: string;
    };
    __SKIN_BOX?: { x: number; y: number; z: number };
  }
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11150f);
scene.add(new THREE.HemisphereLight(0xc4d8e2, 0x2a2a20, 1.6));
const key = new THREE.DirectionalLight(0xffe8c8, 2.4);
key.position.set(24, 40, 28);
scene.add(key);
const rim = new THREE.DirectionalLight(0x9fd4ff, 0.9);
rim.position.set(-30, 16, -22);
scene.add(rim);
scene.add(new THREE.GridHelper(60, 24, 0x2e4a3e, 0x1d2c26));

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 500);

async function main(): Promise<void> {
  window.__SKIN = { chassis, ready: false, zones: {}, swapped: 0, procedural: 0 };
  try {
    const mech = new Mech(mechDef(chassis), 'compact', 'CHECK');
    const visual = buildMechVisual(mech, COMPACT_PALETTE, false);
    scene.add(visual.root);

    // Place the mech AWAY from the world origin before skinning. The zone split
    // builds chunks relative to their joints, and a mech sitting at 0,0,0 makes a
    // world-space vs root-space mix-up invisible — which is how geometry that
    // actually rendered back at the origin passed this harness and only showed up
    // in a real match as mechs sunk into the ground or flying.
    const OFFSET = new THREE.Vector3(137, 0, -211);
    visual.root.position.copy(OFFSET);
    mech.pos.copy(OFFSET);
    visual.root.updateMatrixWorld(true);

    // Apply the skin synchronously so the screenshot cannot race the swap.
    const src = await loadModel(`vp_frame_shared_${chassis}`, 'lod1');
    if (src) {
      const { applyModelSkin } = await import('./world/mechfactory');
      applyModelSkin(visual, mech, src);
    }

    // Frame from the real bounds, after skinning — the generated mesh is wider and
    // taller than the box stand-in, and framing on the boxes crops it.
    const bounds = new THREE.Box3().setFromObject(visual.root);
    const size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3());
    // Straying more than a body-length from the root means chunks were placed in the
    // wrong space and are drifting toward the origin.
    const drift = Math.hypot(centre.x - OFFSET.x, centre.z - OFFSET.z);
    const h = Math.max(size.y, visual.unit * 10);
    const reach = Math.max(size.x, size.y, size.z);

    // ?view=front puts the camera on +Z looking back down the game's forward axis, so
    // a correctly-oriented mech looks straight at you. That is the only unambiguous
    // way to confirm the yaw fix — a 3/4 view can hide a quarter-turn.
    if (params.get('view') === 'front') {
      camera.position.set(OFFSET.x, h * 0.55, OFFSET.z + reach * 1.7);
    } else {
      camera.position.set(OFFSET.x + reach, h * 0.60, OFFSET.z + reach * 1.45);
    }
    camera.lookAt(OFFSET.x, h * 0.45, OFFSET.z);

    // Report the model's footprint so the checker can assert a biped is wider than
    // it is deep — the signature of correct facing.
    window.__SKIN_BOX = { x: size.x, y: size.y, z: size.z };

    const zones: Record<string, number> = {};
    let swapped = 0, procedural = 0;
    for (const [z, meshes] of Object.entries(visual.zoneMeshes)) {
      const visible = meshes.filter((m) => m.visible);
      const tris = visible.reduce((a, m) => {
        const g = m.geometry as THREE.BufferGeometry;
        const idx = g.index ? g.index.count : g.getAttribute('position').count;
        return a + Math.floor(idx / 3);
      }, 0);
      zones[z] = tris;
      // A swapped zone carries thousands of triangles; a box carries 12.
      if (tris > 200) swapped++; else procedural++;
    }

    let t = 0;
    const loop = (): void => {
      requestAnimationFrame(loop);
      if (walk) {
        t += 1 / 60;
        mech.walkPhase = t * 4;
        mech.speed = mech.maxSpeedMs * 0.6;
        mech.torsoYaw = Math.sin(t * 0.6) * 0.35;
        animateMech(visual, mech, 1 / 60);
        visual.root.position.copy(OFFSET);
        visual.root.rotation.y = t * 0.35;
      }
      renderer.render(scene, camera);
    };
    loop();

    window.__SKIN = { chassis, ready: true, zones, swapped, procedural, drift };
  } catch (e) {
    window.__SKIN = {
      chassis, ready: false, zones: {}, swapped: 0, procedural: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

void main();
