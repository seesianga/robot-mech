import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadModel, releaseModel, orientToGameForward, type Lod } from '../world/assets';

/**
 * The landing page's real-time chassis stage — a studio turntable showing the
 * same Tripo3D-derived machines the game itself renders, from the same files.
 * (Authored at 4096 square; the lod0 shipped to browsers carries 2048 maps.
 * The page must not claim 4K textures — see scripts/vite-site-truth.mjs.)
 *
 * This exists because the strongest possible claim the site can make is "these
 * are the actual assets, running in your browser, right now". A pre-rendered
 * video would be lighter but would prove nothing.
 *
 * Cost control is the whole design problem here. A naive implementation ships
 * fourteen 1.5 MB models and renders 4K bloom behind a scrolled-past section:
 *  - models load strictly on demand, one at a time, and are cached by the shared
 *    loader in world/assets, so revisiting a chassis is free;
 *  - the render loop is driven by an IntersectionObserver and stops dead when the
 *    canvas is off-screen — a background <canvas> spinning a GPU is the single
 *    most common way a "premium" site melts a laptop;
 *  - pixel ratio is capped at 2 and bloom is dropped on low-power devices.
 *
 * Degrades honestly: no WebGL, or prefers-reduced-motion, and the caller shows a
 * still plate instead. Nothing here throws into the page.
 */

export type StageQuality = 'high' | 'low';

export interface StageOptions {
  canvas: HTMLCanvasElement;
  /** Chassis id without the lod suffix, e.g. 'vp_frame_shared_gabbro'. */
  initial: string;
  quality?: StageQuality;
  lod?: Lod;
  /** Called whenever a chassis finishes loading (or fails). */
  onLoaded?: (id: string, ok: boolean) => void;
  /**
   * Camera distance multiplier. 1.0 frames the machine at roughly 45% of the
   * viewport height, which suits a tall panel; below 1.0 pulls in. Vertical fov
   * is 34 degrees and the stage normalises every machine to FRAME_HEIGHT, so
   * the fill fraction is FRAME_HEIGHT / (0.611 * 8.4 * distance).
   */
  distance?: number;
  /** Render on demand with no turntable or parallax (prefers-reduced-motion). */
  staticMode?: boolean;
}

const FRAME_HEIGHT = 3.2;      // world units the machine is normalised to
const TURNTABLE_RPM = 1.05;    // slow enough to read the silhouette, not a spin

export class MechStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer | null = null;
  private readonly pivot = new THREE.Group();
  private readonly canvas: HTMLCanvasElement;
  private readonly onLoaded?: (id: string, ok: boolean) => void;
  private readonly lod: Lod;

  private current: THREE.Object3D | null = null;
  private currentId = '';
  private loadToken = 0;

  /** Turntable + interaction state. */
  private spin = 0;
  private spinVel = 0;
  private dragging = false;
  private lastPointerX = 0;
  private autoRotate = true;
  private pointerX = 0;
  private pointerY = 0;
  private parallaxX = 0;
  private parallaxY = 0;
  private fade = 1;            // 0..1 opacity ramp for chassis cross-fade
  private poseDist = 1;        // camera distance multiplier (capture harness)
  private posePitch = 0.08;
  /**
   * Static mode: render on demand instead of continuously, with no turntable
   * and no camera parallax. Used for prefers-reduced-motion, where the right
   * answer is to stop MOVING, not to stop showing the machine — a visitor who
   * dislikes animation still wants to see the chassis they clicked.
   */
  private staticMode = false;

  private visible = false;
  private running = false;
  private loopGen = 0;
  private disposed = false;
  private clock = new THREE.Clock();

  /**
   * Least-recently-used ring of chassis kept resident. Each lod0 is roughly
   * 67 MB of GPU allocation once its three 2048 maps are uploaded, so a visitor
   * who clicks every tile would exhaust a 4 GB machine without this.
   */
  private readonly resident: string[] = [];
  private static readonly MAX_RESIDENT = 3;

  /**
   * Frame-budget guard. Degradation is deliberately one-way within a session:
   * a guard that can step back up oscillates, and an oscillating renderer is
   * more distracting than a permanently simpler one.
   */
  private readonly frameTimes: number[] = [];
  private overBudget = 0;
  private degradeStep = 0;
  private onDegrade?: (step: number, reason: string) => void;

  constructor(opts: StageOptions) {
    this.canvas = opts.canvas;
    this.onLoaded = opts.onLoaded;
    this.lod = opts.lod ?? 'lod0';
    this.poseDist = opts.distance ?? 1;
    this.staticMode = opts.staticMode ?? false;
    if (this.staticMode) this.autoRotate = false;
    const quality: StageQuality = opts.quality ?? 'high';

    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: quality === 'high',
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.25));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
    this.camera.position.set(0, 1.85, 8.4);

    this.buildEnvironment(quality);
    this.buildLights(quality);
    this.buildFloor(quality);
    this.scene.add(this.pivot);

    if (quality === 'high') {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      // Restrained: this is a product shot, not a fireworks display. The bloom is
      // here to make hot metal and emissive strips read, nothing more. At
      // 0.34/0.85/0.92 the top kicker's speculars on white ceramic blew past
      // threshold and smeared fist-sized white halos into the empty background
      // beside the shoulders — threshold and radius now keep bloom on genuinely
      // emissive pixels only.
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.55, 0.97));
      this.composer.addPass(new OutputPass());
    }

    this.resize();
    this.bindInput();
    void this.show(opts.initial);
  }

  // ---- construction helpers ------------------------------------------------

  private buildEnvironment(quality: StageQuality): void {
    // Image-based lighting is what separates a "product render" from a lit box.
    // RoomEnvironment is generated on the GPU at runtime, so it costs no download.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = quality === 'high' ? 0.55 : 0.7;
    pmrem.dispose();
  }

  private buildLights(quality: StageQuality): void {
    // Classic three-point plus a top kicker. Warm key, cold fill: the colour
    // split is what makes grey industrial armour look expensive.
    const key = new THREE.DirectionalLight(0xffe8cc, 3.1);
    key.position.set(4.2, 6.4, 5.0);
    if (quality === 'high') {
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 24;
      const s = 4.2;
      key.shadow.camera.left = -s; key.shadow.camera.right = s;
      key.shadow.camera.top = s; key.shadow.camera.bottom = -s;
      key.shadow.bias = -0.0012;
      key.shadow.normalBias = 0.02;
    }
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x9fc4e8, 1.05);
    fill.position.set(-5.5, 2.6, 3.2);
    this.scene.add(fill);

    // Rim from behind is what cuts the silhouette out of a dark background.
    // Blue to match the site accent (was the retired mint green).
    const rim = new THREE.DirectionalLight(0x8fb3f8, 2.2);
    rim.position.set(-2.4, 3.4, -6.2);
    this.scene.add(rim);

    const top = new THREE.SpotLight(0xffffff, 14, 22, Math.PI / 5, 0.7, 1.6);
    top.position.set(0, 9.5, 1.2);
    this.scene.add(top);
    this.scene.add(top.target);

    this.scene.add(new THREE.HemisphereLight(0x8fb6c9, 0x14181c, 0.5));
  }

  private buildFloor(quality: StageQuality): void {
    // A shadow-only plane: the machine appears to stand on the page background
    // rather than on a visible disc, which is what keeps the composite clean.
    if (quality === 'high') {
      const shadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 30),
        new THREE.ShadowMaterial({ opacity: 0.46 }),
      );
      shadowPlane.rotation.x = -Math.PI / 2;
      shadowPlane.receiveShadow = true;
      this.scene.add(shadowPlane);
    }

    // Soft contact pool under the feet. A radial-gradient sprite reads far better
    // than a shadow map alone, which goes thin and grey right where contact is.
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.62)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(7.5, 7.5),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.012;
    this.scene.add(pool);
  }

  // ---- chassis swapping ----------------------------------------------------

  /**
   * Swap in a chassis. Concurrent calls are safe: a stale load that resolves
   * after a newer one was requested is discarded rather than fighting for the
   * pivot, which is exactly what happens when a visitor clicks through the
   * roster faster than the network.
   */
  async show(id: string): Promise<void> {
    if (this.disposed) return;
    if (id === this.currentId) {
      // Already showing it. Still report success: the caller asked for this
      // chassis and this chassis is on screen. Returning silently leaves any
      // caller-side loading state up forever — which is exactly what happened
      // when a visitor re-clicked the tile that was already selected.
      this.onLoaded?.(id, true);
      this.start();
      return;
    }
    this.currentId = id;
    const token = ++this.loadToken;
    this.fade = 0;

    const model = await loadModel(id, this.lod);
    if (this.disposed || token !== this.loadToken) return;

    if (this.current) {
      this.pivot.remove(this.current);
      this.current = null;
    }
    if (!model) {
      this.onLoaded?.(id, false);
      return;
    }

    const obj = model.clone(true);
    orientToGameForward(obj);

    // Normalise to a constant on-screen height and stand it on y=0, so a 25 t
    // Flint and a 100 t Craton are framed identically and the turntable centre
    // never drifts. Mass is communicated by the spec panel, not by the framing.
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const scale = FRAME_HEIGHT / Math.max(size.y, 0.001);
    obj.scale.setScalar(scale);

    const scaled = new THREE.Box3().setFromObject(obj);
    const centre = scaled.getCenter(new THREE.Vector3());
    obj.position.x -= centre.x;
    obj.position.z -= centre.z;
    obj.position.y -= scaled.min.y;

    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      // Clone materials so the cross-fade opacity ramp cannot leak into the
      // shared cached model that every other instance is drawing from.
      const mat = m.material as THREE.Material | THREE.Material[];
      m.material = Array.isArray(mat) ? mat.map((x) => x.clone()) : mat.clone();
    });

    this.pivot.add(obj);
    this.current = obj;
    this.applyFade(0);
    this.evict(id);
    this.start();            // wake a parked static stage to draw the new chassis
    this.onLoaded?.(id, true);
  }

  /** Keep the resident set bounded, never releasing what is on screen. */
  private evict(justShown: string): void {
    const i = this.resident.indexOf(justShown);
    if (i >= 0) this.resident.splice(i, 1);
    this.resident.push(justShown);
    while (this.resident.length > MechStage.MAX_RESIDENT) {
      const oldest = this.resident.shift();
      if (oldest && oldest !== this.currentId) releaseModel(oldest, this.lod);
    }
  }

  private applyFade(v: number): void {
    if (!this.current) return;
    this.current.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        mat.transparent = v < 0.999;
        mat.opacity = v;
        mat.depthWrite = v > 0.5;
      }
    });
  }

  // ---- input ---------------------------------------------------------------

  private bindInput(): void {
    const el = this.canvas;

    el.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.start();          // a parked static stage has to wake to follow the hand
      this.lastPointerX = e.clientX;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    });
    el.addEventListener('pointerup', (e) => {
      this.dragging = false;
      el.releasePointerCapture(e.pointerId);
      el.style.cursor = 'grab';
    });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      this.pointerX = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.pointerY = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (this.dragging) {
        if (this.staticMode) {
          // No inertia in static mode: the model tracks the hand exactly and
          // stops the instant the hand does.
          this.spin += (e.clientX - this.lastPointerX) * 0.006;
          this.start();
        } else {
          // Hand velocity to the turntable rather than setting the angle, so
          // letting go coasts to a stop instead of stopping dead.
          this.spinVel += (e.clientX - this.lastPointerX) * 0.00042;
        }
        this.lastPointerX = e.clientX;
      }
    });
    el.addEventListener('pointerleave', () => {
      this.pointerX = 0;
      this.pointerY = 0;
    });
    el.style.cursor = 'grab';
    el.style.touchAction = 'pan-y'; // never trap the page scroll on mobile
  }

  setAutoRotate(on: boolean): void {
    this.autoRotate = on;
    if (!on) this.spinVel = 0;
  }

  /**
   * Pin the turntable to an exact pose. Used by the offline plate capture, which
   * needs a repeatable framing rather than wherever the auto-rotation happened
   * to be. `dist` is a multiplier on the default camera distance.
   */
  setPose(yaw: number, pitch = 0.08, dist = 1): void {
    this.autoRotate = false;
    this.spinVel = 0;
    this.spin = yaw;
    this.pivot.rotation.y = yaw;
    this.poseDist = dist;
    this.posePitch = pitch;
  }

  // ---- lifecycle -----------------------------------------------------------

  /** Start/stop the loop as the canvas enters and leaves the viewport. */
  observe(): () => void {
    const io = new IntersectionObserver(
      ([entry]) => {
        this.visible = entry.isIntersecting;
        if (this.visible) this.start(); else this.running = false;
      },
      { rootMargin: '120px' },
    );
    io.observe(this.canvas);

    const onVis = (): void => {
      if (document.hidden) this.running = false;
      else if (this.visible) this.start();
    };
    document.addEventListener('visibilitychange', onVis);

    const onResize = (): void => this.resize();
    window.addEventListener('resize', onResize);

    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
    };
  }

  private start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.clock.getDelta(); // discard the gap accumulated while paused

    // Generation token, not just the `running` flag. When a loop stops it has
    // usually already queued one more rAF callback; if start() is called before
    // that callback fires, the flag is true again and BOTH the stale callback
    // and the new loop keep scheduling — two rAF loops rendering the same scene
    // forever. Static mode parks and wakes constantly, so this is routine, not
    // theoretical. Only the newest generation survives.
    const gen = ++this.loopGen;
    const tick = (): void => {
      if (!this.running || this.disposed || gen !== this.loopGen) return;
      this.frame();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private resize(): void {
    this.start();            // a parked static stage must redraw at the new size
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.staticMode) {
      // No turntable, no parallax — just hold the pose.
      this.pivot.rotation.y = this.spin;
      this.camera.position.set(0, 1.85 + this.posePitch * 6, 8.4 * this.poseDist);
      this.camera.lookAt(0, 1.55, 0);
    } else if (this.autoRotate && !this.dragging) {
      this.spinVel += ((TURNTABLE_RPM * Math.PI / 30) - this.spinVel) * Math.min(1, dt * 1.4);
    }
    if (!this.staticMode) {
      this.spin += this.spinVel * dt * 60 * 0.0167;
      if (!this.dragging) this.spinVel *= 0.94;   // coast
      this.pivot.rotation.y = this.spin;
    }

    // Camera parallax: a small, damped response to the pointer. Enough to feel
    // alive and reactive, small enough that nobody notices it consciously.
    this.parallaxX += (this.pointerX * 0.42 - this.parallaxX) * Math.min(1, dt * 2.6);
    this.parallaxY += (this.pointerY * 0.22 - this.parallaxY) * Math.min(1, dt * 2.6);
    this.camera.position.x = this.parallaxX;
    this.camera.position.y = 1.85 + this.posePitch * 6 - this.parallaxY;
    this.camera.position.z = 8.4 * this.poseDist;
    this.camera.lookAt(0, 1.55, 0);

    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt * 1.7);
      this.applyFade(this.fade);
    }

    if (this.composer && this.degradeStep < 1) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    // Feed the guard the real frame interval, not the duration of the render
    // call. WebGL commands are queued asynchronously, so timing the call
    // measures CPU submission and returns almost instantly on a GPU-bound
    // device — the exact machine the guard is supposed to rescue. The rAF delta
    // includes GPU back-pressure because the next frame cannot start until the
    // previous one has been consumed.
    this.guard(dt * 1000);

    // Static mode draws only until the cross-fade finishes, then parks. show(),
    // resize() and a drag all call start() again, so it wakes when it matters
    // and costs nothing in between.
    if (this.staticMode && this.fade >= 1 && !this.dragging) this.running = false;
  }

  /**
   * Watch the rolling mean frame cost and shed work when it stays over budget.
   * 22 ms is the threshold: at 60 Hz the budget is 16.7 ms, and allowing a
   * third over that absorbs ordinary jitter without letting a genuinely
   * struggling device sit at 30 fps for the whole visit.
   */
  private guard(ms: number): void {
    this.frameTimes.push(ms);
    if (this.frameTimes.length < 30) return;
    const mean = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;

    if (mean <= 22) { this.overBudget = 0; return; }
    // Two consecutive bad windows, so one unlucky window (a background tab
    // waking, a GC pause) cannot permanently downgrade a capable machine.
    if (++this.overBudget < 2) return;
    this.overBudget = 0;

    // Skip rungs that cannot help on this device: a 'low' stage has no composer
    // and no shadow map, so steps 1 and 2 were no-ops and it took four bad
    // windows to reach the first lever that actually does anything.
    if (this.degradeStep === 0 && !this.composer) this.degradeStep = 1;
    if (this.degradeStep === 1 && !this.renderer.shadowMap.enabled) this.degradeStep = 2;

    switch (++this.degradeStep) {
      case 1:
        this.onDegrade?.(1, `bloom off (${mean.toFixed(1)} ms)`);
        break;
      case 2:
        this.renderer.shadowMap.enabled = false;
        this.scene.traverse((o) => {
          const l = o as THREE.DirectionalLight;
          if (l.isDirectionalLight) l.castShadow = false;
        });
        this.onDegrade?.(2, `shadows off (${mean.toFixed(1)} ms)`);
        break;
      case 3:
        this.renderer.setPixelRatio(1);
        this.resize();
        this.onDegrade?.(3, `pixel ratio 1 (${mean.toFixed(1)} ms)`);
        break;
      default:
        // Out of levers: stop drawing and let the caller reveal the still.
        this.running = false;
        this.onDegrade?.(4, `stage disabled (${mean.toFixed(1)} ms)`);
        break;
    }
  }

  /** Notified when the guard sheds a level; used to reveal the still plate. */
  onQualityDrop(fn: (step: number, reason: string) => void): void {
    this.onDegrade = fn;
  }

  dispose(): void {
    this.disposed = true;
    this.running = false;
    this.composer?.dispose();
    this.renderer.dispose();
  }
}

/** Whether a real-time stage is worth attempting on this device at all. */
export function stageSupported(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Coarse device-capability probe used to pick the quality tier. */
export function suggestedQuality(): StageQuality {
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if (coarse || mem <= 4 || cores <= 4) return 'low';
  return 'high';
}
