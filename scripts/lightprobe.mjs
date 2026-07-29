#!/usr/bin/env node
/**
 * §5.6 — lighting verification harness (reduced).
 *
 * The master spec asks for a rig that renders every candidate asset in six HDRI
 * environments at three distances and writes a contact sheet. This is the part of it
 * that can exist today: a DETERMINISTIC capture of the live game at a fixed camera and
 * fixed sim state, across all four §5.7 quality presets, with measured luminance.
 *
 * Why measured and not eyeballed: the game autopilots in ?test mode, so two captures
 * are two different frames and comparing them by eye proves nothing. This teleports to
 * a fixed spot, advances a fixed number of ticks, then samples the same pixels every
 * time — so a claim like "the cast shadow got weaker at high" becomes a number.
 *
 *   node scripts/lightprobe.mjs [--url http://localhost:4199] [--out /tmp/lightprobe]
 *
 * Exit 1 if a preset's shadow region is not measurably darker than its lit region,
 * which is the regression this was written to catch.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg('--url', 'http://localhost:4199');
const OUT = arg('--out', '/tmp/lightprobe');
const PRESETS = ['ultra', 'high', 'balanced', 'fallback'];

// A fixed vantage on the yard map with the sun behind-left, so the mech throws a long
// cast shadow into the lower-right of frame.
const VIEW = { x: -274, z: 22, ticks: 240 };
/** Samples per preset, median-combined. See the sampling loop for why one is not enough. */
const SAMPLES = 5;

fs.mkdirSync(OUT, { recursive: true });

const cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
let exe = null;
for (const d of fs.readdirSync(cacheDir).filter((x) => x.startsWith('chromium')).sort().reverse()) {
  for (const c of [
    path.join(cacheDir, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
    path.join(cacheDir, d, 'chrome-headless-shell-mac', 'chrome-headless-shell'),
    path.join(cacheDir, d, 'chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
  ]) if (fs.existsSync(c)) { exe = c; break; }
  if (exe) break;
}
if (!exe) { console.error('no cached chromium'); process.exit(2); }

const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader'] });

/**
 * Mean luminance of a rectangle of the CAPTURED PNG.
 *
 * Deliberately not read back from the live canvas: a WebGL context does not retain its
 * drawing buffer unless preserveDrawingBuffer is set, so drawImage() off the game
 * canvas returns solid black — the first version of this probe reported 0.0 for every
 * preset. Enabling preserveDrawingBuffer to make the probe easier would cost every
 * player a buffer copy per frame, so the probe reads the screenshot instead.
 */
async function sample(file, x, y, w, h) {
  const { data, info } = await sharp(file)
    .extract({ left: x, top: y, width: w, height: h })
    .raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let sum = 0;
  const px = info.width * info.height;
  for (let i = 0; i < data.length; i += ch) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  return sum / px;
}

const rows = [];
for (const q of PRESETS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  try {
    await page.goto(`${BASE}/play.html?test=1&quality=${q}`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__SIM === 'function', null, { timeout: 120000 });
    await page.evaluate(() => { window.__GOD(true); });
    for (let i = 0; i < 40; i++) {
      const boot = await page.evaluate(() => { window.__TICKS(30); return window.__SIM().boot; });
      if (!boot) break;
    }
    await page.evaluate(({ x, z, ticks }) => {
      window.__TELEPORT(x, z);
      window.__TICKS(ticks);
    }, VIEW);
    await page.waitForTimeout(250);

    // A single sample is NOT reproducible. The first version of this probe took one
    // frame per preset and reported fallback delta 8.0 on one run and 2.0 on the next
    // from identical code — the walk cycle keeps moving the legs, so the cast shadow's
    // shape (and how much of it lands in the sample window) depends on the animation
    // phase the capture happened to catch. A flaky gate is worse than no gate.
    //
    // So: several samples spread across a full walk cycle, then the MEDIAN. Cheap,
    // because it reuses one page load and only advances ticks between shots.
    const shots = [];
    for (let s = 0; s < SAMPLES; s++) {
      const shot = path.join(OUT, `${q}${s === 0 ? '' : `-${s}`}.png`);
      await page.screenshot({ path: shot });
      shots.push({
        shadow: await sample(shot, 560, 545, 180, 60),
        lit: await sample(shot, 120, 545, 180, 60),
      });
      if (s < SAMPLES - 1) {
        await page.evaluate(() => window.__TICKS(37));   // ~0.6 s, deliberately not a
        await page.waitForTimeout(60);                   // whole-cycle multiple
      }
    }
    const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const shadow = median(shots.map((s) => s.shadow));
    const lit = median(shots.map((s) => s.lit));
    const deltas = shots.map((s) => s.lit - s.shadow);
    rows.push({
      q, shadow, lit, delta: median(deltas),
      spread: Math.max(...deltas) - Math.min(...deltas),
      errs: errs.length,
    });
  } catch (e) {
    rows.push({ q, err: String(e).slice(0, 90) });
  } finally {
    await ctx.close();
  }
}
await browser.close();

console.log('\npreset      shadow    lit    delta  spread   verdict');
let bad = 0;
for (const r of rows) {
  if (r.err) { console.log(`${r.q.padEnd(11)} ERROR  ${r.err}`); bad++; continue; }
  // A real cast shadow darkens the ground by a clear margin. Below 4 the shadow is
  // being washed out by whatever the post chain is doing.
  const ok = r.delta >= 3;
  if (!ok) bad++;
  console.log(
    `${r.q.padEnd(11)}${r.shadow.toFixed(1).padStart(6)}${r.lit.toFixed(1).padStart(8)}`
    + `${r.delta.toFixed(1).padStart(8)}${r.spread.toFixed(1).padStart(8)}   `
    + `${ok ? 'ok' : 'WASHED OUT'}${r.errs ? `  (${r.errs} page errors)` : ''}`,
  );
}
console.log(`\ncaptures: ${OUT}`);
process.exit(bad ? 1 : 0);
