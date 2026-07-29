#!/usr/bin/env node
/**
 * Render the landing page's hero plates at 4K from the real shipped GLBs.
 *
 * These are the base images for the gpt-image-2 grade pass. Capturing rather
 * than generating keeps the hero honest: the machine on the poster is the same
 * mesh, under the same lighting rig, as the one the visitor can spin in the
 * showroom two hundred pixels below it.
 *
 * Transparent background — the stage renderer is created with alpha, so the
 * plate composites onto whatever the page background is and the grade pass gets
 * a clean subject with no baked-in backdrop to fight.
 *
 * Needs `npm run preview` on 4199.
 * Usage: node scripts/shot_plinth.mjs [baseUrl]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] ?? 'http://localhost:4199';
const OUT = path.join(ROOT, 'assets', 'site', 'raw');
fs.mkdirSync(OUT, { recursive: true });

function findChromium() {
  const cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  for (const d of fs.readdirSync(cacheDir).filter((x) => x.startsWith('chromium')).sort().reverse()) {
    for (const c of [
      path.join(cacheDir, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
      path.join(cacheDir, d, 'chrome-headless-shell-mac', 'chrome-headless-shell'),
      path.join(cacheDir, d, 'chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    ]) if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Landscape is the desktop hero; portrait carries the entire first screen on a
 * phone, where WebGL never starts. yaw is the turntable angle: 0.62 rad puts
 * the machine three-quarter on, which reads the silhouette and the shoulder
 * hardpoints at the same time.
 */
const PLATES = [
  // dist is derived, not guessed. The camera's vertical fov is 34 degrees, so
  // the visible height at distance d is 2*d*tan(17 deg) = 0.611*d, and the
  // stage normalises every machine to 3.2 units tall. For a fill fraction f:
  //     d = 3.2 / (f * 0.611),  dist = d / 8.4
  // f=0.78 -> dist 0.80 (landscape: reads as a poster without clipping the
  // sensor mast or the feet); f=0.68 -> dist 0.92 (portrait needs more room
  // above the machine for the headline to sit over it).
  { id: 'cap-hero-craton', model: 'mech-craton', w: 1920, h: 1080, yaw: 0.62, pitch: 0.05, dist: 0.80 },
  { id: 'cap-hero-craton-portrait', model: 'mech-craton', w: 1080, h: 1920, yaw: 0.62, pitch: 0.02, dist: 0.92 },
  { id: 'cap-showroom-gabbro', model: 'mech-gabbro', w: 1920, h: 1080, yaw: -0.5, pitch: 0.05, dist: 0.84 },
];

const exe = findChromium();
if (!exe) { console.error('no cached chromium'); process.exit(2); }

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const failed = [];
for (const p of PLATES) {
  const page = await browser.newPage({
    viewport: { width: p.w, height: p.h },
    deviceScaleFactor: 2,          // -> 3840x2160 / 2160x3840
  });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  const url = `${BASE}/sitecap.html?id=${p.model}&yaw=${p.yaw}&pitch=${p.pitch}&dist=${p.dist}`;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.__CAP_READY === true, { timeout: 120000 });
    const err = await page.evaluate(() => window.__CAP_ERROR);
    if (err) throw new Error(err);
    const out = path.join(OUT, `${p.id}.png`);
    await page.screenshot({ path: out, omitBackground: true, timeout: 180000 });
    console.log(`captured ${p.id}  ${p.w * 2}x${p.h * 2}  `
      + `${(fs.statSync(out).size / 1048576).toFixed(1)}MB  pageErrs=${errs.length}`);
  } catch (e) {
    console.error(`FAIL ${p.id}: ${e.message}`);
    failed.push(p.id);
  }
  await page.close();
}

await browser.close();
if (failed.length) { console.error('NOT captured:', failed.join(', ')); process.exit(1); }
console.log('plates ready for the grade pass');
