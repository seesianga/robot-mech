import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** Standalone inspector for Tripo3D-generated GLBs in public/models/. */
const ASSETS = ['vp_frame_shared_skarn', 'vp_frame_shared_gabbro', 'vp_cockpit_shared_interior'];

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10141a);
scene.add(new THREE.HemisphereLight(0xc4d8e2, 0x3a352c, 1.4));
const key = new THREE.DirectionalLight(0xfff0d8, 2.2);
key.position.set(3, 5, 4);
scene.add(key);
scene.add(new THREE.GridHelper(10, 20, 0x2e4a3e, 0x1d2c26));

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 200);
camera.position.set(3.4, 2.6, 4.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.5, 0);

const loader = new GLTFLoader();
let current: THREE.Object3D | null = null;
const msg = document.getElementById('msg')!;
const bar = document.getElementById('bar')!;

function setMsg(t: string): void {
  msg.innerHTML = t;
}

function load(id: string): void {
  for (const b of Array.from(bar.children)) b.classList.toggle('on', (b as HTMLElement).dataset.id === id);
  if (current) scene.remove(current);
  current = null;
  setMsg(`loading ${id}…`);
  loader.load(
    `/models/${id}.glb`,
    (gltf) => {
      current = gltf.scene;
      const box = new THREE.Box3().setFromObject(current);
      const size = box.getSize(new THREE.Vector3());
      const scale = 3 / Math.max(size.x, size.y, size.z, 0.001);
      current.scale.setScalar(scale);
      const c = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
      current.position.sub(c).add(new THREE.Vector3(0, (size.y * scale) / 2, 0));
      scene.add(current);
      setMsg('');
    },
    undefined,
    () => setMsg(`<b>${id}.glb not generated yet</b><br>Run: python3 scripts/gen_tripo.py<br>(needs Tripo3D credits — account balance is currently 0)`),
  );
}

for (const id of ASSETS) {
  const b = document.createElement('button');
  b.textContent = id;
  b.dataset.id = id;
  b.onclick = () => load(id);
  bar.appendChild(b);
}
load(ASSETS[0]);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
