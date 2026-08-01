#!/usr/bin/env node
/**
 * §5.2 — environment bake: HDRI master → shippable runtime artefact + lighting profile.
 *
 *   node scripts/build_env.mjs --biome coast \
 *     --src assets/hdri/fish_hoek_beach/fish_hoek_beach_4k.hdr \
 *     [--size 1024] [--target-azimuth 0.5124]
 *
 * What it does, per the authoring chain in docs/LIGHTING_STANDARD.md §5.2:
 *   1. Decodes the 4K RGBE master (RLE and flat scanline formats).
 *   2. Extracts the sun: solid-angle-weighted centroid of the brightest 0.05% of the
 *      sphere, recorded as a direction in Three's equirect convention plus a
 *      sun/sky-median contrast ratio and the cluster's mean colour.
 *   3. Clamps extreme highlights so the runtime prefilter does not bloom into mush.
 *   4. Box-downsamples in linear space to a 2:1 equirect (default 1024×512) and
 *      re-encodes as RLE RGBE — the shippable artefact in public/env/.
 *   5. Writes content/lighting/<biome>.json: authored fields are preserved on re-runs,
 *      extracted fields (sun, provenance, envUrl) are always refreshed.
 *
 * The 4K master never ships (PLATFORM §3.2); public/env/ carries only the bake.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; };

const BIOME = arg('--biome', null);
const SRC = arg('--src', null);
const SIZE = Number(arg('--size', '1024'));
const TARGET_AZ = arg('--target-azimuth', null) ? Number(arg('--target-azimuth')) : null;
if (!BIOME || !SRC) {
  console.error('usage: build_env.mjs --biome <name> --src <master.hdr> [--size 1024] [--target-azimuth <rad>]');
  process.exit(2);
}

// ── RGBE decode ──────────────────────────────────────────────────────────────

function decodeHdr(buf) {
  let pos = 0;
  const readLine = () => {
    let end = pos;
    while (end < buf.length && buf[end] !== 0x0a) end++;
    const line = buf.toString('latin1', pos, end);
    pos = end + 1;
    return line;
  };
  const magic = readLine();
  if (!magic.startsWith('#?')) throw new Error('not a Radiance HDR file');
  let exposure = 1;
  for (;;) {
    const line = readLine();
    if (line === '') break;
    if (line.startsWith('EXPOSURE=')) exposure *= Number(line.slice(9));
    if (line.startsWith('FORMAT=') && !line.includes('rgbe')) throw new Error(`unsupported ${line}`);
  }
  const res = readLine().trim().split(/\s+/);
  if (res[0] !== '-Y' || res[2] !== '+X') throw new Error(`unsupported orientation ${res.join(' ')}`);
  const H = Number(res[1]);
  const W = Number(res[3]);

  const rgbe = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const row = y * W * 4;
    if (W >= 8 && W < 32768 && buf[pos] === 2 && buf[pos + 1] === 2) {
      const w = (buf[pos + 2] << 8) | buf[pos + 3];
      if (w !== W) throw new Error(`scanline width ${w} != ${W}`);
      pos += 4;
      for (let ch = 0; ch < 4; ch++) {
        let x = 0;
        while (x < W) {
          const count = buf[pos++];
          if (count > 128) {                      // run
            const v = buf[pos++];
            for (let n = count - 128; n > 0; n--) rgbe[row + (x++) * 4 + ch] = v;
          } else {                                 // literal
            for (let n = count; n > 0; n--) rgbe[row + (x++) * 4 + ch] = buf[pos++];
          }
        }
      }
    } else {                                       // flat scanline
      for (let x = 0; x < W * 4; x++) rgbe[row + x] = buf[pos++];
    }
  }

  const data = new Float32Array(W * H * 3);
  const inv = 1 / exposure;
  for (let i = 0, j = 0; i < W * H * 4; i += 4, j += 3) {
    const e = rgbe[i + 3];
    if (e === 0) continue;
    const s = Math.pow(2, e - 136) * inv;         // 2^(e-128) / 256
    data[j] = rgbe[i] * s;
    data[j + 1] = rgbe[i + 1] * s;
    data[j + 2] = rgbe[i + 2] * s;
  }
  return { W, H, data };
}

// ── RGBE encode (new-format RLE) ─────────────────────────────────────────────

function floatToRgbe(r, g, b, out, o) {
  const max = Math.max(r, g, b);
  if (max < 1e-32) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; return; }
  let e = Math.ceil(Math.log2(max));
  if (Math.pow(2, e) === max) e += 1;              // mantissa must be < 1
  const s = Math.pow(2, 8 - e);                    // 256 / 2^e
  out[o] = Math.min(255, Math.floor(r * s));
  out[o + 1] = Math.min(255, Math.floor(g * s));
  out[o + 2] = Math.min(255, Math.floor(b * s));
  out[o + 3] = e + 128;
}

function rleChannel(bytes, chunks) {
  const W = bytes.length;
  const MINRUN = 4;
  let x = 0;
  while (x < W) {
    // find the next run of >= MINRUN
    let runStart = x;
    let runLen = 0;
    while (runStart < W) {
      runLen = 1;
      while (runLen < 127 && runStart + runLen < W && bytes[runStart + runLen] === bytes[runStart]) runLen++;
      if (runLen >= MINRUN) break;
      runStart += runLen;
    }
    // literals before the run
    let lit = runStart < W ? runStart - x : W - x;
    while (lit > 0) {
      const n = Math.min(128, lit);
      chunks.push(Buffer.from([n]), Buffer.from(bytes.subarray(x, x + n)));
      x += n; lit -= n;
    }
    if (runStart < W && runLen >= MINRUN) {
      chunks.push(Buffer.from([128 + runLen, bytes[runStart]]));
      x = runStart + runLen;
    }
  }
}

function encodeHdr(W, H, data) {
  const chunks = [Buffer.from(`#?RADIANCE\n# baked by scripts/build_env.mjs\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`, 'latin1')];
  const rgbe = new Uint8Array(W * 4);
  const ch = new Uint8Array(W);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const j = (y * W + x) * 3;
      floatToRgbe(data[j], data[j + 1], data[j + 2], rgbe, x * 4);
    }
    chunks.push(Buffer.from([2, 2, (W >> 8) & 0xff, W & 0xff]));
    for (let c = 0; c < 4; c++) {
      for (let x = 0; x < W; x++) ch[x] = rgbe[x * 4 + c];
      rleChannel(ch, chunks);
    }
  }
  return Buffer.concat(chunks);
}

// ── bake ─────────────────────────────────────────────────────────────────────

const srcPath = path.resolve(ROOT, SRC);
const master = fs.readFileSync(srcPath);
const { W, H, data } = decodeHdr(master);
console.log(`master: ${W}x${H} (${(master.length / 1e6).toFixed(1)} MB)`);

const lum = (j) => 0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2];

// Direction for texel (x, y): row 0 is the TOP scanline (-Y order), matching Three's
// equirect convention (u = atan2(z,x)/2π + 0.5, v = asin(y)/π + 0.5, flipY on load).
function dirOf(x, y) {
  const theta = Math.PI * ((y + 0.5) / H);         // polar angle from +Y
  const phi = 2 * Math.PI * ((x + 0.5) / W - 0.5);
  const st = Math.sin(theta);
  return [st * Math.cos(phi), Math.cos(theta), st * Math.sin(phi)];
}

// 1. weighted luminance census (weight = solid angle ∝ sin θ per row)
const samples = [];
for (let y = 0; y < H; y++) {
  const w = Math.sin(Math.PI * ((y + 0.5) / H));
  for (let x = 0; x < W; x++) {
    samples.push({ l: lum((y * W + x) * 3), w, x, y });
  }
}
samples.sort((a, b) => a.l - b.l);
const totalW = samples.reduce((s, p) => s + p.w, 0);
let acc = 0, median = 0;
for (const p of samples) { acc += p.w; if (acc >= totalW / 2) { median = p.l; break; } }

// 2. sun extraction — brightest 0.05% of the sphere by solid angle
const top = [];
acc = 0;
for (let i = samples.length - 1; i >= 0 && acc < totalW * 0.0005; i--) { top.push(samples[i]); acc += samples[i].w; }
let sx = 0, sy = 0, sz = 0, sr = 0, sg = 0, sb = 0, sl = 0, sw = 0;
for (const p of top) {
  const [dx, dy, dz] = dirOf(p.x, p.y);
  const wl = p.w * p.l;
  sx += dx * wl; sy += dy * wl; sz += dz * wl;
  const j = (p.y * W + p.x) * 3;
  sr += data[j] * p.w; sg += data[j + 1] * p.w; sb += data[j + 2] * p.w;
  sl += p.l * p.w; sw += p.w;
}
const norm = Math.hypot(sx, sy, sz);
const sunDir = [sx / norm, sy / norm, sz / norm];
const sunMeanLum = sl / sw;
const contrast = sunMeanLum / median;
const cMax = Math.max(sr, sg, sb);
const sunColor = '#' + [sr, sg, sb].map((v) => Math.round(255 * Math.pow(v / cMax, 1 / 2.2)).toString(16).padStart(2, '0')).join('');
const azimuth = Math.atan2(sunDir[2], sunDir[0]);
const elevation = Math.asin(sunDir[1]);
console.log(`sun: az ${(azimuth * 180 / Math.PI).toFixed(1)}° el ${(elevation * 180 / Math.PI).toFixed(1)}°  contrast ${contrast.toFixed(1)}x  colour ${sunColor}`);

// 3. highlight clamp — protects the runtime prefilter from a specular disc that would
// alias into blotches. Weighted 99.9th percentile, cap at 8x above it. Overcast skies
// (contrast < ~30x) are typically untouched.
acc = 0; let p999 = samples.at(-1).l;
for (let i = samples.length - 1; i >= 0; i--) { acc += samples[i].w; if (acc >= totalW * 0.001) { p999 = samples[i].l; break; } }
const cap = p999 * 8;
let clamped = 0;
for (let j = 0; j < data.length; j += 3) {
  const l = lum(j);
  if (l > cap) { const s = cap / l; data[j] *= s; data[j + 1] *= s; data[j + 2] *= s; clamped++; }
}
console.log(`clamp: cap ${cap.toFixed(2)} — ${clamped} texel(s) touched`);

// 4. linear-space box downsample to SIZE x SIZE/2
const OW = SIZE, OH = SIZE / 2;
const fx = W / OW, fy = H / OH;
const out = new Float32Array(OW * OH * 3);
for (let y = 0; y < OH; y++) {
  for (let x = 0; x < OW; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = Math.floor(y * fy); yy < Math.floor((y + 1) * fy); yy++) {
      for (let xx = Math.floor(x * fx); xx < Math.floor((x + 1) * fx); xx++) {
        const j = (yy * W + xx) * 3;
        r += data[j]; g += data[j + 1]; b += data[j + 2]; n++;
      }
    }
    const o = (y * OW + x) * 3;
    out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
  }
}
const outName = `${BIOME}_${SIZE >= 1024 ? '1k' : SIZE}.hdr`;
const outPath = path.join(ROOT, 'public', 'env', outName);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const encoded = encodeHdr(OW, OH, out);
fs.writeFileSync(outPath, encoded);
console.log(`baked: public/env/${outName} ${OW}x${OH} (${(encoded.length / 1e6).toFixed(2)} MB)`);

// 5. profile JSON — authored fields survive re-runs; extracted fields refresh
const profilePath = path.join(ROOT, 'content', 'lighting', `${BIOME}.json`);
fs.mkdirSync(path.dirname(profilePath), { recursive: true });
const existing = fs.existsSync(profilePath) ? JSON.parse(fs.readFileSync(profilePath, 'utf8')) : null;

// envRotationY: on first bake, rotate the extracted sun azimuth onto the art-directed
// azimuth (--target-azimuth, e.g. the old MOODS sunOffset) so mission shadow
// direction survives the re-light. Authored thereafter.
let rotY = existing?.envRotationY ?? 0;
if (existing == null && TARGET_AZ != null) rotY = TARGET_AZ - azimuth;

// the runtime consumes the ROTATED direction — no per-frame math, and the light and
// the rendered sky can never disagree.
// Rotating the environment by +rotY about Y sends a texel seen at azimuth φ to
// azimuth φ + rotY (scene.environmentRotation.y convention, verified by lightprobe).
const rotAz = azimuth + rotY;
const el = elevation;
const rotatedDir = [Math.cos(el) * Math.cos(rotAz), Math.sin(el), Math.cos(el) * Math.sin(rotAz)];

const profile = {
  id: existing?.id ?? `vp_light_${BIOME}`,
  biome: BIOME,
  maps: existing?.maps ?? [],
  envUrl: `/env/${outName}`,
  envRotationY: Number(rotY.toFixed(4)),
  environmentIntensity: existing?.environmentIntensity ?? 1.0,
  backgroundIntensity: existing?.backgroundIntensity ?? 1.0,
  backgroundBlurriness: existing?.backgroundBlurriness ?? 0,
  exposureEV: existing?.exposureEV ?? 1.0,
  hemiIntensity: existing?.hemiIntensity ?? 0.15,
  sun: {
    direction: rotatedDir.map((v) => Number(v.toFixed(4))),
    intensity: existing?.sun?.intensity ?? 2.0,
    colorHex: existing?.sun?.colorHex ?? sunColor,
    extracted: {
      direction: sunDir.map((v) => Number(v.toFixed(4))),
      azimuthDeg: Number((azimuth * 180 / Math.PI).toFixed(1)),
      elevationDeg: Number((elevation * 180 / Math.PI).toFixed(1)),
      contrast: Number(contrast.toFixed(1)),
      colorHex: sunColor,
    },
  },
  shadow: existing?.shadow ?? { bias: -0.0004, normalBias: 0.02 },
  fog: existing?.fog ?? null,
  provenance: {
    source: path.relative(ROOT, srcPath),
    licence: 'CC0 1.0 (see LICENSE.txt beside the master)',
    masterSha256: crypto.createHash('sha256').update(master).digest('hex'),
    bakedSha256: crypto.createHash('sha256').update(encoded).digest('hex'),
    size: `${OW}x${OH}`,
    tool: 'scripts/build_env.mjs',
  },
};
fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2) + '\n');
console.log(`profile: content/lighting/${BIOME}.json (envRotationY ${profile.envRotationY}, sun [${profile.sun.direction.join(', ')}])`);
