import * as THREE from 'three';
import { dressBox, dressGroup, applyGroundTexture, applyWaterTexture } from './assets';

export type MapId = 'yard' | 'tideflats' | 'range' | 'salt' | 'karst' | 'polar' | 'storm' | 'arcology' | 'anchor';

export interface Structure {
  id: string;
  name: string;
  hp: number;
  hpMax: number;
  group: THREE.Group;
  meshes: THREE.Mesh[];
  destroyed: boolean;
  /** true = whole group keels over on death (mast); false = meshes crush in place */
  topple: boolean;
}

export interface Terrain {
  group: THREE.Group;
  heightAt(x: number, z: number): number;
  structures: Structure[];
  /** solid cover props — block weapons fire and movement */
  colliders: THREE.Mesh[];
  size: number;
  map: MapId;
  /** Basic Training pad geometry (range map only): gate centers in walk
   *  order + the boost-barrier line (crossing along +x within ±halfW of z). */
  pad?: {
    gates: [number, number][];
    barrier: { x: number; z: number; halfW: number };
  };
}

function smoothstep(a: number, b: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// --- deterministic value noise (no RNG — physics heightfield must match) ---
function hash2(ix: number, iz: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** fractal noise, centered on 0, worst-case amplitude ≈ ±amp·(2−2^(1−oct)) */
function fbm(x: number, z: number, oct: number, freq: number, amp: number): number {
  let f = freq, a = amp, sum = 0;
  for (let i = 0; i < oct; i++) {
    sum += (vnoise(x * f + i * 13.7, z * f + i * 71.3) * 2 - 1) * a;
    f *= 2;
    a *= 0.5;
  }
  return sum;
}

/**
 * Stage 0 — the Saltglass Cove calibration pad: a graded flat basin ringed by
 * low scrub hills, with one steep-sided rock shelf left over from range work.
 */
function heightRange(x: number, z: number): number {
  let h = 6
    + fbm(x - 3000, z + 2200, 3, 1 / 130, 6)
    + fbm(x, z, 2, 1 / 42, 1.4);
  // the drill field is graded nearly flat
  const field = smoothstep(540, 320, Math.hypot(x, z));
  h = THREE.MathUtils.lerp(h, 5, field * 0.92);
  // the jump shelf — steep enough that walking up reads as cheating
  const shelf = smoothstep(85, 52, Math.hypot(x + 320, z + 320));
  return h + shelf * 26;
}

/** Stage 1/3 — the impound coast: rolling dunes and rocky rises shelving to sea. */
function heightYard(x: number, z: number): number {
  let h = 7
    + fbm(x, z, 3, 1 / 105, 10)             // big dunes and hollows
    + fbm(x + 500, z - 300, 2, 1 / 38, 2.4); // surface detail
  h += Math.max(0, (x - 150)) * 0.02;       // eastern rise toward the mast plateau
  const shore = smoothstep(-420, -700, x);
  return THREE.MathUtils.lerp(h, -6, shore);
}

/**
 * Stage 2 — the tidal flats at low tide: hummocky sandbars and channels with
 * flooded tide pools, a drying ridge in the east (player start), open sea far
 * west. The beached wreck line sits mid-flats.
 */
function heightTideflats(x: number, z: number): number {
  let h = 3.8
    + fbm(x - 900, z + 400, 3, 1 / 88, 5.2) // sandbars and channels
    + fbm(x, z, 2, 1 / 30, 1.3);            // ripple detail
  // flooded pools carved below the water line
  const p = Math.sin(x * 0.012 + 0.9) * Math.sin(z * 0.01 + 1.7);
  if (p > 0.45) h -= (p - 0.45) * 9;
  // eastern sandbar ridge (spawn overlook)
  h += Math.max(0, (x - 280)) * 0.035;
  // open sea west
  const shore = smoothstep(-520, -760, x);
  return THREE.MathUtils.lerp(h, -5, shore);
}

/** Op 2 — the Halite Flats: a blinding salt pan, one dry channel, dune rim far out. */
function heightSalt(x: number, z: number): number {
  let h = 4
    + fbm(x + 800, z - 600, 2, 1 / 240, 1.1)  // vast slow undulation
    + fbm(x, z, 2, 1 / 34, 0.35);             // crust ripple
  // the dry channel crossing — pylon Brine's ground
  const ch = Math.abs(x * 0.38 + z * 0.86 + 120) / 900;
  h -= smoothstep(0.16, 0.05, ch) * 5;
  // dune rim closes the basin far outside the play area
  h += smoothstep(680, 1050, Math.hypot(x, z)) * 26;
  return h;
}

/** Op 3 — the Karst Highlands: stone pillar country, dolines, dusk light. */
function heightKarst(x: number, z: number): number {
  let h = 10 + fbm(x, z, 4, 1 / 150, 12);
  const p = vnoise(x * 0.011 + 7.3, z * 0.011 - 2.1);
  if (p > 0.6) h += (p - 0.6) * (p - 0.6) * 900;   // steep tower-karst pillars
  const d = vnoise(x * 0.008 - 40, z * 0.008 + 13);
  if (d > 0.62) h -= (d - 0.62) * 85;              // sinkhole dolines
  return h;
}

/** Op 4 — the Polar Refineries: ice sheet, pressure ridges, glacier rise west. */
function heightPolar(x: number, z: number): number {
  let h = 5 + fbm(x - 4000, z + 900, 3, 1 / 220, 4);
  const r = 1 - Math.abs(vnoise(x * 0.02, z * 0.02) * 2 - 1);
  h += r * r * 6 * smoothstep(0.55, 0.9, r);       // sharp pressure-ridge lines
  h += smoothstep(-380, -620, x) * 18;             // the glacier shelf west
  return h;
}

/** Op 5 — the Storm Coast: drowned lowland shelving to open sea south. */
function heightStorm(x: number, z: number): number {
  let h = 5.5
    + fbm(x + 2500, z - 1500, 3, 1 / 95, 8)
    + fbm(x, z, 2, 1 / 30, 1.2);
  const p = Math.sin(x * 0.014 - 0.4) * Math.sin(z * 0.011 + 0.8);
  if (p > 0.5) h -= (p - 0.5) * 10;                // flooded pans
  const shore = smoothstep(460, 720, z);           // open sea SOUTH (+z)
  return THREE.MathUtils.lerp(h, -6, shore);
}

/** Op 6 — the Vell Arcology: graded city plate cut by the understreets canal. */
function heightArcology(x: number, z: number): number {
  let h = 6 + fbm(x, z, 2, 1 / 300, 1.6);
  const canal = Math.abs(x - 90 + Math.sin(z * 0.004) * 60);
  h -= smoothstep(70, 22, canal) * 7;
  return h;
}

/** Op 7 — the Spire Anchor plate: a dead-flat steel field over the sea. */
function heightAnchor(x: number, z: number): number {
  const r = Math.max(Math.abs(x), Math.abs(z));
  const plate = smoothstep(860, 700, r);
  const seams = (Math.sin(x * 0.05) + Math.sin(z * 0.045)) * 0.1;
  return THREE.MathUtils.lerp(-6, 12 + seams, plate);
}

function boxMesh(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

interface MapMood {
  background: number;
  fog: [number, number, number];
  water: { level: number; color: number };
  sunOffset: [number, number, number];
  sand: { wet: number; dry: number; rock: number };
  sunIntensity?: number;
  hemiIntensity?: number;
}

const MOODS: Record<MapId, MapMood> = {
  yard: {
    background: 0x9db6c2,
    fog: [0x9fb4bd, 250, 1900],
    water: { level: -2.8, color: 0x1d3d47 },
    sunOffset: [320, 520, 180],
    sand: { wet: 0x9c8c6e, dry: 0xbcae90, rock: 0x6f6656 },
  },
  tideflats: {
    background: 0xb6c3c9,
    fog: [0xaebfc4, 170, 1500],
    water: { level: -0.5, color: 0x2a4a50 },
    sunOffset: [480, 300, 60], // low dawn sun, long shadows
    sand: { wet: 0x8a8272, dry: 0xb0a68c, rock: 0x6f6a5c },
  },
  range: {
    background: 0xd9b98c,
    fog: [0xcfae84, 240, 1700],
    water: { level: -40, color: 0x2a4a50 }, // inland basin — no visible water
    sunOffset: [-430, 230, 240], // late-dusk gold, long shadows
    sand: { wet: 0x8d8266, dry: 0xb2a37e, rock: 0x6d6552 },
    sunIntensity: 1.9,
    hemiIntensity: 1.05,
  },
  salt: {
    background: 0xe6e2d6,
    fog: [0xe3ddcf, 420, 2300], // white-out glare — the horizon dissolves
    water: { level: -40, color: 0x2a4a50 },
    sunOffset: [120, 640, 80], // brutal midday overhead
    sand: { wet: 0xcfc9b8, dry: 0xede7d8, rock: 0x9a927e },
    sunIntensity: 2.7,
    hemiIntensity: 1.5,
  },
  karst: {
    background: 0x93998a,
    fog: [0x8b9284, 200, 1400],
    water: { level: -40, color: 0x24403c },
    sunOffset: [-380, 230, 200], // low dusk raking the pillars
    sand: { wet: 0x6f6a58, dry: 0x8e8871, rock: 0x565243 },
    sunIntensity: 2.0,
    hemiIntensity: 0.95,
  },
  polar: {
    background: 0x18232f,
    fog: [0x1c2836, 220, 1500], // aurora night over the ice
    water: { level: -1.4, color: 0x0d1c26 },
    sunOffset: [-300, 170, -260],
    sand: { wet: 0x9fb2bd, dry: 0xd6e2e8, rock: 0x5d6b74 },
    sunIntensity: 0.95,
    hemiIntensity: 0.6,
  },
  storm: {
    background: 0x4a555c,
    fog: [0x46525a, 130, 1000], // squall wall — short, grey sightlines
    water: { level: 0.3, color: 0x14262c },
    sunOffset: [200, 240, -300],
    sand: { wet: 0x585a50, dry: 0x75776a, rock: 0x43463e },
    sunIntensity: 0.85,
    hemiIntensity: 0.65,
  },
  arcology: {
    background: 0x6c7076,
    fog: [0x686d74, 220, 1600],
    water: { level: -40, color: 0x1a262b },
    sunOffset: [340, 420, -160], // hard city noon between the towers
    sand: { wet: 0x7c7f82, dry: 0x9a9da0, rock: 0x60646a },
    sunIntensity: 1.8,
    hemiIntensity: 1.0,
  },
  anchor: {
    background: 0x2b3138,
    fog: [0x2a3037, 180, 1300], // the stormwall pressing in
    water: { level: -4, color: 0x0e1a20 },
    sunOffset: [-200, 300, 240], // dawn buried behind the storm
    sand: { wet: 0x4c545c, dry: 0x6a737c, rock: 0x39404a },
    sunIntensity: 1.0,
    hemiIntensity: 0.55,
  },
};

const HEIGHT_FN: Record<MapId, (x: number, z: number) => number> = {
  yard: heightYard,
  tideflats: heightTideflats,
  range: heightRange,
  salt: heightSalt,
  karst: heightKarst,
  polar: heightPolar,
  storm: heightStorm,
  arcology: heightArcology,
  anchor: heightAnchor,
};

function addHullCarcass(group: THREE.Group, colliders: THREE.Mesh[], mat: THREE.Material,
  h: (x: number, z: number) => number, hx: number, hz: number, rot: number, scale = 1): void {
  const hull = new THREE.Group();
  const parts = [
    (() => { const m = boxMesh(70 * scale, 5, 26 * scale, mat); m.position.y = 2.5; return m; })(),
    (() => { const m = boxMesh(70 * scale, 30 * scale, 5, mat); m.position.set(0, 15 * scale, -12 * scale); return m; })(),
    (() => { const m = boxMesh(70 * scale, 5, 20 * scale, mat); m.position.set(0, 31 * scale, -4 * scale); return m; })(),
    (() => { const m = boxMesh(4, 30 * scale, 24 * scale, mat); m.position.set(-30 * scale, 15 * scale, -1); return m; })(),
    (() => { const m = boxMesh(4, 30 * scale, 24 * scale, mat); m.position.set(30 * scale, 15 * scale, -1); return m; })(),
  ];
  for (const p of parts) hull.add(p);
  // sink into the slope so no corner floats on uneven ground
  hull.position.set(hx, h(hx, hz) - 1.5, hz);
  hull.rotation.y = rot;
  group.add(hull);
  colliders.push(...parts);
}

export function buildTerrain(scene: THREE.Scene, map: MapId = 'yard'): Terrain {
  const mood = MOODS[map];
  const h = HEIGHT_FN[map];
  const group = new THREE.Group();
  const SIZE = 2400;
  const SEGS = 300;

  // --- mood: sky, fog, sun angle, light levels ---
  scene.background = new THREE.Color(mood.background);
  scene.fog = new THREE.Fog(mood.fog[0], mood.fog[1], mood.fog[2]);
  scene.userData.sunOffset = new THREE.Vector3(...mood.sunOffset);
  const sun = scene.userData.sun as THREE.DirectionalLight | undefined;
  if (sun) sun.intensity = mood.sunIntensity ?? 2.4;
  const hemi = scene.userData.hemi as THREE.HemisphereLight | undefined;
  if (hemi) hemi.intensity = mood.hemiIntensity ?? 1.35;

  // --- ground ---
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
  geo.rotateX(-Math.PI / 2);
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);
  const cSandWet = new THREE.Color(mood.sand.wet);
  const cSandDry = new THREE.Color(mood.sand.dry);
  const cRock = new THREE.Color(mood.sand.rock);
  const cRust = new THREE.Color(0x7a5844);
  const cPool = new THREE.Color(0x5c5a4a);
  const tmp = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const hh = h(x, z);
    posAttr.setY(i, hh);
    const hn = THREE.MathUtils.clamp((hh + 4) / 14, 0, 1);
    tmp.copy(cSandWet).lerp(cSandDry, hn);
    if (hh > 8) tmp.lerp(cRock, smoothstep(8, 14, hh));
    // steep faces read as exposed rock — makes the relief legible
    const slope = Math.hypot(h(x + 3, z) - h(x - 3, z), h(x, z + 3) - h(x, z - 3)) / 6;
    if (slope > 0.28) tmp.lerp(cRock, smoothstep(0.28, 0.6, slope) * 0.7);
    if (map === 'yard') {
      const yardStain = Math.max(0, 1 - Math.hypot(x + 250, z - 40) / 380);
      tmp.lerp(cRust, yardStain * 0.2 * (0.5 + 0.5 * Math.sin(x * 0.11) * Math.sin(z * 0.13)));
    } else if (hh < mood.water.level + 0.4) {
      // darker sand around and under the tide pools
      tmp.lerp(cPool, 0.55);
    }
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.02 });
  // Photoreal ground material. The vertex colours stay — they carry the per-map
  // wet/dry/rock variation — and the albedo map multiplies into them, so the surface
  // gains grain without losing the mood shading. Tiles every GROUND_TILE_M metres;
  // a 2400 m field would smear a single stretched texture into mush.
  applyGroundTexture(groundMat, map, SIZE);
  const ground = new THREE.Mesh(geo, groundMat);
  ground.receiveShadow = true;
  group.add(ground);

  const waterMat = new THREE.MeshStandardMaterial({ color: mood.water.color, roughness: 0.2, metalness: 0.5, transparent: true, opacity: 0.9 });
  applyWaterTexture(waterMat, map, SIZE * 1.6);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 1.6, SIZE * 1.6), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = mood.water.level;
  group.add(water);

  const hullMat = new THREE.MeshStandardMaterial({ color: 0x6b4a3a, roughness: 0.85, metalness: 0.5 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x55606a, roughness: 0.6, metalness: 0.7 });
  const amberMat = new THREE.MeshStandardMaterial({ color: 0xcf8a1d, roughness: 0.5, metalness: 0.4 });
  const colliders: THREE.Mesh[] = [];
  const structures: Structure[] = [];

  if (map === 'yard') {
    for (const [hx, hz, rot] of [[-340, -160, 0.4], [-420, 120, -0.8], [-280, 260, 2.2], [-460, -60, 1.4]] as Array<[number, number, number]>) {
      addHullCarcass(group, colliders, hullMat, h, hx, hz, rot);
    }

    // impound gantry at spawn
    const gantry = new THREE.Group();
    const gantryParts: THREE.Mesh[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = boxMesh(3, 34, 3, steelMat);
      leg.position.set(sx * 14, 17, sz * 10);
      gantry.add(leg);
      colliders.push(leg);
      gantryParts.push(leg);
    }
    const beam = boxMesh(34, 4, 24, steelMat);
    beam.position.y = 36;
    gantry.add(beam);
    colliders.push(beam);
    gantryParts.push(beam);
    // The gantry is legs AND beam: dressing only the beam left four bare posts under
    // a generated span. One model over the whole frame instead.
    dressGroup(gantry, gantryParts, 'env_tut_gantry');
    gantry.position.set(-350, h(-350, 40) - 1.5, 40);
    group.add(gantry);

    // scattered cover crates
    for (let i = 0; i < 26; i++) {
      const cx = -150 + Math.sin(i * 12.9898) * 5000 % 500;
      const cz = -60 + Math.cos(i * 78.233) * 5000 % 500;
      const c = boxMesh(10 + (i % 4) * 3, 6 + (i % 3) * 3, 8 + (i % 5) * 2, i % 3 === 0 ? amberMat : steelMat);
      c.position.set(cx, h(cx, cz) + 2, cz);
      c.rotation.y = i * 0.7;
      group.add(c);
      colliders.push(c);
      dressBox(c, 'env_tut_crate');
    }

    // tracking mast (destructible objective)
    const mast = new THREE.Group();
    const mMat = new THREE.MeshStandardMaterial({ color: 0x9aa2a8, roughness: 0.5, metalness: 0.8 });
    const aMat = new THREE.MeshStandardMaterial({ color: 0xd9931f, roughness: 0.45, metalness: 0.4, emissive: 0x552a00, emissiveIntensity: 0.6 });
    const meshes: THREE.Mesh[] = [];
    const tower = boxMesh(6, 90, 6, mMat); tower.position.y = 45; mast.add(tower); meshes.push(tower);
    for (const a of [0, 2.09, 4.18]) {
      const strut = boxMesh(2, 70, 2, mMat);
      strut.position.set(Math.sin(a) * 8, 35, Math.cos(a) * 8);
      strut.rotation.z = Math.sin(a) * -0.1;
      strut.rotation.x = Math.cos(a) * 0.1;
      mast.add(strut); meshes.push(strut);
    }
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(10, 12, 4, 12), aMat);
    dish.position.y = 92; dish.rotation.z = 0.5; dish.castShadow = true;
    mast.add(dish); meshes.push(dish);
    mast.position.set(260, h(260, -140) - 1, -140);
    group.add(mast);
    // Built inline rather than through addMissionStructure, so it needs dressing here.
    // A 90 m shaft with a dish on top: the generated control tower (tall shaft,
    // antenna cluster, observation deck) is the closest silhouette we have.
    dressGroup(mast, meshes, 'prop-control-tower');
    const s: Structure = { id: 'tracking_mast', name: 'Tracking Mast', hp: 120, hpMax: 120, group: mast, meshes, destroyed: false, topple: true };
    for (const m of meshes) m.userData.structureId = s.id;
    structures.push(s);
  } else if (map === 'range') {
    // --- Basic Training calibration pad: quiet ferrocrete apron, gate pylons,
    // aim board, target-board row, boost barrier, practice-drone pen ---
    const GATES: Array<[number, number]> = [[0, 350], [0, 290], [0, 230]];
    const BARRIER = { x: 150, z: 20, halfW: 18 };

    // three gate pylon pairs (emissive amber band; soft-collide — never block or snag)
    const pylonBandMat = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xcf7a12, emissiveIntensity: 1.6 });
    for (const [gx, gz] of GATES) {
      for (const sx of [-1, 1]) {
        const post = boxMesh(2.5, 16, 2.5, steelMat);
        post.position.set(gx + sx * 13, h(gx + sx * 13, gz) + 8, gz);
        group.add(post);
        dressBox(post, 'env_tut_nav_beacon');
        const band = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), pylonBandMat);
        band.position.set(gx + sx * 13, h(gx + sx * 13, gz) + 15, gz);
        group.add(band);
      }
    }

    // large static aim board west of the lane (B-phase tracking drills; indestructible)
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x8f3b2a, roughness: 0.8, metalness: 0.3 });
    {
      const aimGroup = new THREE.Group();
      const base = boxMesh(8, 3, 5, steelMat);
      base.position.y = 1.4;
      aimGroup.add(base);
      const panel = boxMesh(13, 14, 1.2, boardMat.clone());
      panel.position.y = 9.5;
      aimGroup.add(panel);
      dressGroup(aimGroup, [panel, base], 'env_tut_board_a');
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.5, 8, 24), pylonBandMat);
      ring.position.set(0, 9.5, -0.9);
      aimGroup.add(ring);
      aimGroup.position.set(-85, h(-85, 40) - 0.5, 40);
      aimGroup.rotation.y = Math.PI * 0.35; // face the lane
      group.add(aimGroup);
      const s: Structure = {
        id: 'bt_aim', name: 'Aim Board', hp: 999999, hpMax: 999999,
        group: aimGroup, meshes: [panel, base], destroyed: false, topple: false,
      };
      for (const m of s.meshes) m.userData.structureId = s.id;
      structures.push(s);
    }

    // four target boards on the firing row (D-phase; armed for destruction by the director)
    for (let i = 0; i < 4; i++) {
      const bx = -75 + i * 40, bz = -70;
      const boardGroup = new THREE.Group();
      const base = boxMesh(6, 2.5, 4, steelMat);
      base.position.y = 1.2;
      boardGroup.add(base);
      const panel = boxMesh(9, 11, 1.2, boardMat.clone());
      panel.position.y = 8;
      boardGroup.add(panel);
      dressGroup(boardGroup, [panel, base], 'env_tut_board_b');
      boardGroup.position.set(bx, h(bx, bz) - 0.5, bz);
      group.add(boardGroup);
      const s: Structure = {
        id: `board_${i + 1}`, name: 'Target Board', hp: 30, hpMax: 30,
        group: boardGroup, meshes: [panel, base], destroyed: false, topple: true,
      };
      for (const m of s.meshes) m.userData.structureId = s.id;
      structures.push(s);
    }

    // boost barrier — low wide block, sloped read, amber chevron band (F-phase)
    {
      const wall = boxMesh(10, 8, BARRIER.halfW * 2, steelMat);
      dressBox(wall, 'env_tut_barricade');
      wall.position.set(BARRIER.x, h(BARRIER.x, BARRIER.z) + 4, BARRIER.z);
      group.add(wall);
      colliders.push(wall);
      const chev = new THREE.Mesh(new THREE.BoxGeometry(10.5, 1.6, BARRIER.halfW * 2 + 0.5), pylonBandMat);
      chev.position.set(BARRIER.x, h(BARRIER.x, BARRIER.z) + 7.2, BARRIER.z);
      group.add(chev);
    }

    // practice-drone pen — open-frame fence sections, open on the pad side
    {
      const penX = -150, penZ = -170, half = 26;
      const mkFence = (fx: number, fz: number, ry: number): void => {
        const rail = boxMesh(half * 2, 6, 1.2, steelMat);
        dressBox(rail, 'env-bt-fence');
        rail.position.set(fx, h(fx, fz) + 3, fz);
        rail.rotation.y = ry;
        group.add(rail);
        colliders.push(rail);
      };
      mkFence(penX - half, penZ, Math.PI / 2);
      mkFence(penX + half, penZ, Math.PI / 2);
      mkFence(penX, penZ - half, 0); // north side (toward the pad) stays open
    }

    // coolant bowser near the heat drill
    const bowser = new THREE.Group();
    const tank = boxMesh(16, 8, 8, amberMat);
    tank.position.y = 6;
    bowser.add(tank);
    const cab = boxMesh(6, 6, 8, steelMat);
    cab.position.set(-11, 4, 0);
    bowser.add(cab);
    bowser.position.set(60, h(60, 100) - 0.5, 100);
    group.add(bowser);
    colliders.push(tank, cab);
    // One model across BOTH boxes. The generated bowser is a complete tanker with its
    // own cab, so dressing only the tank left the cab stand-in sitting beside it as a
    // bare black block. dressGroup fits the truck to the union and hides both boxes,
    // which stay in `colliders` so the bowser still blocks fire and movement.
    dressGroup(bowser, [tank, cab], 'env_tut_coolant_bowser');

    // pad light mast with a lit head
    const mastPost = boxMesh(3, 36, 3, steelMat);
    mastPost.position.set(-150, h(-150, 150) + 17, 150);
    group.add(mastPost);
    colliders.push(mastPost);
    dressBox(mastPost, 'prop-searchlight-tower');
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffe9a8, emissiveIntensity: 1.8 });
    const mastHead = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 3), lampMat);
    mastHead.position.set(-150, h(-150, 150) + 36, 150);
    group.add(mastHead);

    // equipment crates for pad dressing around the field edge
    for (let i = 0; i < 10; i++) {
      const cx = Math.sin(i * 2.4 + 0.7) * 430;
      const cz = Math.cos(i * 1.9 + 1.3) * 430;
      const c = boxMesh(9 + (i % 3) * 3, 5 + (i % 2) * 3, 8 + (i % 4) * 2, i % 3 === 0 ? amberMat : steelMat);
      c.position.set(cx, h(cx, cz) + 2.5, cz);
      c.rotation.y = i * 1.1;
      group.add(c);
      colliders.push(c);
      dressBox(c, 'env_tut_crate');
    }

    scene.add(group);
    return { group, heightAt: h, structures, colliders, size: SIZE, map, pad: { gates: GATES, barrier: BARRIER } };
  } else if (map === 'tideflats') {
    // --- tide flats: the beached wreck line the patrol is picking through ---
    const wrecks: Array<[number, number, number, number]> = [
      [-220, -140, 0.5, 1.0], [-320, -40, -0.9, 1.2], [-160, 20, 2.4, 0.8],
      [-280, 140, 0.2, 1.1], [-120, 200, -1.7, 0.9], [-360, 250, 1.1, 1.0],
      [-80, -60, 2.9, 0.7], [-240, 320, -0.4, 1.15], [-380, -220, 1.9, 0.85],
    ];
    for (const [hx, hz, rot, sc] of wrecks) addHullCarcass(group, colliders, hullMat, h, hx, hz, rot, sc);

    // half-buried keel ribs jutting from the sand
    for (let i = 0; i < 12; i++) {
      const rx = -300 + Math.sin(i * 37.7) * 260;
      const rz = 40 + Math.cos(i * 51.3) * 300;
      const rib = boxMesh(2.5, 14 + (i % 3) * 6, 5, hullMat);
      dressBox(rib, 'prop-hull-carcass');
      rib.position.set(rx, h(rx, rz) + 5, rz);
      rib.rotation.set(0.25 * Math.sin(i), i * 0.9, 0.3 * Math.cos(i * 2));
      group.add(rib);
      colliders.push(rib);
    }

    // stranded cargo crates on the flats
    for (let i = 0; i < 14; i++) {
      const cx = -60 + Math.sin(i * 91.3) * 350;
      const cz = -40 + Math.cos(i * 47.9) * 330;
      const c = boxMesh(8 + (i % 3) * 3, 5 + (i % 2) * 3, 7 + (i % 4) * 2, i % 4 === 0 ? amberMat : steelMat);
      c.position.set(cx, h(cx, cz) + 2.5, cz);
      c.rotation.y = i * 1.3;
      group.add(c);
      colliders.push(c);
      dressBox(c, 'env_tut_crate');
    }
  } else if (map === 'salt') {
    // --- halite flats: sparse by design — the sightline IS the level ---
    const saltMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.95, metalness: 0.02 });
    for (let i = 0; i < 9; i++) {
      const bx = Math.sin(i * 5.1 + 2.2) * 470;
      const bz = Math.cos(i * 3.7 + 0.6) * 470;
      const b = boxMesh(9 + (i % 4) * 4, 5 + (i % 3) * 3, 8 + (i % 5) * 3, saltMat);
      b.position.set(bx, h(bx, bz) + 1.5, bz);
      b.rotation.y = i * 0.9;
      b.rotation.z = 0.12 * Math.sin(i * 3.3);
      group.add(b);
      colliders.push(b);
    }
    // two salt-eaten crawler hulks — the only hard cover on the pan
    addHullCarcass(group, colliders, hullMat, h, -140, 210, 0.7, 0.8);
    addHullCarcass(group, colliders, hullMat, h, 220, -300, -1.9, 0.9);
  } else if (map === 'karst') {
    // --- tower-karst spires: hard cover pillars matching the height-field bumps ---
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5e5a4a, roughness: 0.9, metalness: 0.05 });
    let placed = 0;
    for (let gx = -500; gx <= 500 && placed < 34; gx += 84) {
      for (let gz = -500; gz <= 500 && placed < 34; gz += 84) {
        const p = vnoise(gx * 0.011 + 7.3, gz * 0.011 - 2.1);
        if (p < 0.68) continue;
        const tall = 22 + (p - 0.68) * 240;
        const w = 10 + ((placed * 7) % 12);
        const spire = boxMesh(w, tall, w * (0.8 + (placed % 3) * 0.2), rockMat);
        spire.position.set(gx, h(gx, gz) + tall * 0.42, gz);
        spire.rotation.y = placed * 0.6;
        group.add(spire);
        colliders.push(spire);
        placed++;
      }
    }
  } else if (map === 'polar') {
    // --- ice sheet: bergs, a pipeline run, refinery stacks glowing on the skyline ---
    const iceMat = new THREE.MeshStandardMaterial({ color: 0xbcd3de, roughness: 0.35, metalness: 0.1 });
    const flareMat = new THREE.MeshStandardMaterial({ color: 0xff9a33, emissive: 0xd96a10, emissiveIntensity: 2.2 });
    for (let i = 0; i < 12; i++) {
      const bx = Math.sin(i * 7.7 + 1.1) * 460;
      const bz = Math.cos(i * 4.9 + 2.8) * 460;
      const b = boxMesh(10 + (i % 4) * 5, 7 + (i % 3) * 5, 9 + (i % 5) * 4, iceMat);
      b.position.set(bx, h(bx, bz) + 2, bz);
      b.rotation.set(0.1 * Math.sin(i), i * 1.1, 0.14 * Math.cos(i * 2));
      group.add(b);
      colliders.push(b);
    }
    // elevated pipeline crossing east-west
    for (let px = -540; px <= 540; px += 120) {
      const seg = boxMesh(120, 5, 6, steelMat);
      seg.position.set(px, h(px, 150) + 6, 150 + Math.sin(px * 0.004) * 30);
      group.add(seg);
      colliders.push(seg);
    }
    // refinery stacks north — navigation landmarks with flare tips
    for (const [sx, sz] of [[-320, -520], [-180, -560], [40, -540], [260, -530]] as Array<[number, number]>) {
      const stack = boxMesh(14, 90, 14, steelMat);
      dressBox(stack, 'prop-cracking-tower', 'lod1');
      stack.position.set(sx, h(sx, sz) + 45, sz);
      group.add(stack);
      colliders.push(stack);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 8), flareMat);
      tip.position.set(sx, h(sx, sz) + 93, sz);
      group.add(tip);
    }
  } else if (map === 'storm') {
    // --- storm coast: breakwater blocks along the south shore, drowned wrecks ---
    const concMat = new THREE.MeshStandardMaterial({ color: 0x6a6e66, roughness: 0.85, metalness: 0.08 });
    for (let i = 0; i < 16; i++) {
      const bx = -480 + i * 62 + Math.sin(i * 3.1) * 18;
      const bz = 380 + Math.sin(i * 1.7) * 40;
      const b = boxMesh(16, 12 + (i % 3) * 4, 12, concMat);
      dressBox(b, 'prop-fortress-wall');
      b.position.set(bx, h(bx, bz) + 4, bz);
      b.rotation.y = i * 0.5;
      b.rotation.x = 0.1 * Math.sin(i * 2.2);
      group.add(b);
      colliders.push(b);
    }
    addHullCarcass(group, colliders, hullMat, h, -260, 120, 1.2, 1.0);
    addHullCarcass(group, colliders, hullMat, h, 160, 250, -0.6, 1.1);
    addHullCarcass(group, colliders, hullMat, h, 360, -80, 2.5, 0.85);
    for (let i = 0; i < 12; i++) {
      const cx = -80 + Math.sin(i * 47.9) * 380;
      const cz = -160 + Math.cos(i * 91.3) * 300;
      const c = boxMesh(8 + (i % 3) * 3, 5 + (i % 2) * 3, 7 + (i % 4) * 2, i % 4 === 0 ? amberMat : steelMat);
      c.position.set(cx, h(cx, cz) + 2.5, cz);
      c.rotation.y = i * 1.3;
      group.add(c);
      colliders.push(c);
      dressBox(c, 'env_tut_crate');
    }
  } else if (map === 'arcology') {
    // --- Vell: city blocks in a broken grid; the avenue (|x|<45) and the canal stay open ---
    const blockMatA = new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.7, metalness: 0.3 });
    const blockMatB = new THREE.MeshStandardMaterial({ color: 0x717880, roughness: 0.75, metalness: 0.25 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xcf8a1d, emissiveIntensity: 1.1 });
    let bi = 0;
    for (let gx = -480; gx <= 480; gx += 160) {
      for (let gz = -480; gz <= 480; gz += 160) {
        // keep the main avenue, the canal line, and the center plaza open
        if (Math.abs(gx) < 60) continue;
        if (Math.abs(gx - 90 + Math.sin(gz * 0.004) * 60) < 80) continue;
        if (Math.hypot(gx, gz) < 120) continue;
        const jx = gx + Math.sin(bi * 12.9) * 28;
        const jz = gz + Math.cos(bi * 7.3) * 28;
        const tall = 34 + ((bi * 13) % 56);
        const w = 46 + ((bi * 9) % 30);
        const d = 42 + ((bi * 17) % 34);
        const b = boxMesh(w, tall, d, bi % 2 ? blockMatA : blockMatB);
        // podium / mid-rise / crown by height, so the grid reads as a real skyline
        dressBox(b, tall > 90 ? 'prop-arcology-crown'
          : tall > 55 ? 'prop-arcology-mid' : 'prop-arcology-podium');
        b.position.set(jx, h(jx, jz) + tall / 2 - 1, jz);
        b.rotation.y = (bi % 4) * 0.02;
        group.add(b);
        colliders.push(b);
        if (bi % 3 === 0) {
          const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 4, 1), glowMat);
          sign.position.set(jx, h(jx, jz) + tall * 0.7, jz + d / 2 + 0.6);
          group.add(sign);
        }
        bi++;
      }
    }
  } else if (map === 'anchor') {
    // --- the anchor plate: tether pylon ring, seam ridges, old wreckage for the duel ---
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x49525c, roughness: 0.55, metalness: 0.8 });
    const warnMat = new THREE.MeshStandardMaterial({ color: 0xcf3a2a, emissive: 0x7a1408, emissiveIntensity: 1.4 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = Math.sin(a) * 430;
      const pz = Math.cos(a) * 430;
      const pylon = boxMesh(10, 64, 10, pylonMat);
      dressBox(pylon, 'prop-anchor-gate', 'lod1');
      pylon.position.set(px, h(px, pz) + 32, pz);
      group.add(pylon);
      colliders.push(pylon);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 5), warnMat);
      lamp.position.set(px, h(px, pz) + 66, pz);
      group.add(lamp);
    }
    // plate seams — low ridges that read as the plate's construction joins
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      const seam = boxMesh(700, 1.6, 4, pylonMat);
      seam.position.set(0, h(0, i * 160) + 0.4, i * 160);
      group.add(seam);
    }
    // duel cover: wreckage of machines that defended the plate and failed
    addHullCarcass(group, colliders, hullMat, h, -180, -120, 0.9, 0.9);
    addHullCarcass(group, colliders, hullMat, h, 200, 160, -2.1, 1.0);
    for (let i = 0; i < 6; i++) {
      const rx = Math.sin(i * 2.7 + 1) * 260;
      const rz = Math.cos(i * 3.9 + 2) * 260;
      const deb = boxMesh(9 + (i % 3) * 4, 6 + (i % 2) * 4, 8, pylonMat);
      dressBox(deb, i % 2 ? 'prop-ruin-a' : 'prop-ruin-b');
      deb.position.set(rx, h(rx, rz) + 2.5, rz);
      deb.rotation.set(0.2 * Math.sin(i), i * 1.4, 0.15 * Math.cos(i));
      group.add(deb);
      colliders.push(deb);
    }
  }

  scene.add(group);
  return { group, heightAt: h, structures, colliders, size: SIZE, map };
}

/** Mission-placed destructible structures (campaign objectives). */
export type StructureKind = 'pylon' | 'mast' | 'tank' | 'bunker' | 'building' | 'gate' | 'crawler';

export interface StructureSpec {
  id: string;
  name: string;
  kind: StructureKind;
  pos: [number, number];
  hp: number;
}

/** Build one campaign objective structure and register it on the terrain. */
export function addMissionStructure(terrain: Terrain, spec: StructureSpec): Structure {
  const h = terrain.heightAt;
  const [x, z] = spec.pos;
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa2a8, roughness: 0.5, metalness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x55606a, roughness: 0.6, metalness: 0.7 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xd9931f, roughness: 0.45, metalness: 0.4, emissive: 0x552a00, emissiveIntensity: 0.6 });
  const g = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  const add = (m: THREE.Mesh): void => { g.add(m); meshes.push(m); };
  let topple = false;

  switch (spec.kind) {
    case 'pylon':
    case 'mast': {
      topple = true;
      const tall = spec.kind === 'pylon' ? 78 : 90;
      const tower = boxMesh(6, tall, 6, steel);
      tower.position.y = tall / 2;
      add(tower);
      for (const a of [0, 2.09, 4.18]) {
        const strut = boxMesh(2, tall * 0.75, 2, steel);
        strut.position.set(Math.sin(a) * 8, tall * 0.38, Math.cos(a) * 8);
        strut.rotation.z = Math.sin(a) * -0.1;
        strut.rotation.x = Math.cos(a) * 0.1;
        add(strut);
      }
      const head = new THREE.Mesh(
        spec.kind === 'pylon' ? new THREE.BoxGeometry(16, 8, 6) : new THREE.CylinderGeometry(10, 12, 4, 12), amber);
      head.position.y = tall + 3;
      if (spec.kind === 'mast') head.rotation.z = 0.5;
      head.castShadow = true;
      add(head);
      break;
    }
    case 'tank': {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 18, 14), amber);
      drum.position.y = 9;
      drum.castShadow = true;
      drum.receiveShadow = true;
      add(drum);
      const skirt = boxMesh(26, 3, 26, dark);
      skirt.position.y = 1.5;
      add(skirt);
      break;
    }
    case 'bunker': {
      const slab = boxMesh(30, 12, 24, dark);
      slab.position.y = 6;
      add(slab);
      const roof = boxMesh(34, 3, 28, steel);
      roof.position.y = 13;
      add(roof);
      break;
    }
    case 'building': {
      const tall = 44;
      const core = boxMesh(30, tall, 26, dark);
      core.position.y = tall / 2;
      add(core);
      const crown = boxMesh(22, 8, 18, amber);
      crown.position.y = tall + 4;
      add(crown);
      break;
    }
    case 'gate': {
      for (const sx of [-1, 1]) {
        const post = boxMesh(6, 26, 6, dark);
        post.position.set(sx * 20, 13, 0);
        add(post);
      }
      const beam = boxMesh(46, 6, 5, amber);
      beam.position.y = 27;
      add(beam);
      break;
    }
    case 'crawler': {
      topple = false;
      const hull = boxMesh(30, 9, 14, dark);
      hull.position.y = 5.5;
      add(hull);
      const cab = boxMesh(9, 7, 12, amber);
      cab.position.set(-14, 10, 0);
      add(cab);
      for (const sx of [-10, 2, 12]) {
        const wheel = boxMesh(6, 4, 16, steel);
        wheel.position.set(sx, 2, 0);
        add(wheel);
      }
      break;
    }
  }

  for (const m of meshes) { m.castShadow = true; m.receiveShadow = true; }

  // Dress the slab assembly with its generated counterpart. The boxes stay as the
  // damage and hit volumes; only the visuals are replaced (see assets.dressGroup).
  const PROP_ASSET: Partial<Record<StructureSpec['kind'], string>> = {
    pylon: 'env_mp_hill_pylon',
    mast: 'prop-searchlight-tower',
    tank: 'prop-fuel-tank',
    bunker: 'prop-bunker',
    building: 'prop-hangar',
    gate: 'prop-gatehouse',
    crawler: 'veh-ore-crawler',
  };
  const asset = PROP_ASSET[spec.kind];
  if (asset) dressGroup(g, meshes, asset);

  g.position.set(x, h(x, z) - 1, z);
  terrain.group.add(g);
  const s: Structure = { id: spec.id, name: spec.name, hp: spec.hp, hpMax: spec.hp, group: g, meshes, destroyed: false, topple };
  for (const m of meshes) m.userData.structureId = s.id;
  terrain.structures.push(s);
  return s;
}
