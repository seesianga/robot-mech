import * as THREE from 'three';

export function createRenderer(container: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !new URLSearchParams(location.search).has('noshadow');
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  container.appendChild(renderer.domElement);
  return renderer;
}

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9db6c2);
  scene.fog = new THREE.Fog(0x9fb4bd, 250, 1900);

  const hemi = new THREE.HemisphereLight(0xc4d8e2, 0x6a5a48, 1.35);
  scene.add(hemi);
  scene.userData.hemi = hemi;

  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.position.set(320, 520, 180);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -350;
  sun.shadow.camera.right = 350;
  sun.shadow.camera.top = 350;
  sun.shadow.camera.bottom = -350;
  sun.shadow.camera.near = 50;
  sun.shadow.camera.far = 1400;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  scene.userData.sun = sun;

  return scene;
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
