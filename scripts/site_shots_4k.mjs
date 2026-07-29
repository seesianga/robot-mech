#!/usr/bin/env node
/**
 * Landing-page gallery capture at TRUE 4K (3840x2160), from the running game.
 *
 * These are the shots that carry the site's credibility: generated key art sells
 * a mood, but only real frames prove the game looks like this. Captured through
 * ?test=1 autopilot on each biome, chase cam plus cockpit.
 *
 * 4K is reached with viewport 1920x1080 at deviceScaleFactor 2 rather than a
 * literal 3840-wide viewport — the game lays its HUD out in CSS pixels, so a
 * 3840 CSS viewport would render a correct-but-wrong-looking HUD at half scale.
 *
 * Software GL at 4K is slow, so settle times are generous and shots run strictly
 * one at a time (two headless Chromiums at once starves both and the autopilot
 * misses its marks).
 *
 * Needs a server: `npm run build && npm run preview` (port 4199).
 * Writes PNG masters to assets/site/raw/, then AVIF/WebP ladders to public/site/
 * via scripts/site_derivatives.mjs.
 *
 * Usage: node scripts/site_shots_4k.mjs [baseUrl] [--only id,id]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('http')) ?? 'http://localhost:4199';
const ONLY = (() => {
  const i = args.indexOf('--only');
  return i >= 0 ? new Set(args[i + 1].split(',')) : null;
})();

const OUT_DIR = path.join(ROOT, 'assets', 'site', 'raw');
fs.mkdirSync(OUT_DIR, { recursive: true });

function findChromium() {
  const cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  const shells = fs.readdirSync(cacheDir).filter((d) => d.startsWith('chromium'));
  for (const d of shells.sort().reverse()) {
    for (const c of [
      path.join(cacheDir, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
      path.join(cacheDir, d, 'chrome-headless-shell-mac', 'chrome-headless-shell'),
      path.join(cacheDir, d, 'chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      path.join(cacheDir, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    ]) if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * One entry per gallery slot. `settle` is how long the autopilot gets to walk
 * into a composition worth showing — longer on the big maps where the opening
 * frames are still facing empty terrain.
 */
const SHOTS = [
  { id: 'shot-hero-range',   url: '/play.html?test=1&stage=0',  settle: 16000, caption: 'Saltglass Cove — Basic Training' },
  { id: 'shot-cockpit',      url: '/play.html?test=1&stage=2&cockpit=1', settle: 15000, caption: 'Cockpit view — Tide Tables' },
  { id: 'shot-coast',        url: '/play.html?test=1&stage=1',  settle: 18000, caption: 'Breaker Coast — Cold Ignition' },
  { id: 'shot-salt',         url: '/play.html?test=1&stage=5',  settle: 18000, caption: 'Salt Flats — Dust Convoy' },
  { id: 'shot-karst',        url: '/play.html?test=1&stage=9',  settle: 18000, caption: 'Karst Highlands — Undertow' },
  { id: 'shot-polar',        url: '/play.html?test=1&stage=13', settle: 18000, caption: 'Polar Refineries — Icebound' },
  { id: 'shot-storm',        url: '/play.html?test=1&stage=15', settle: 18000, caption: 'Storm Coast — Breakwater' },
  { id: 'shot-arcology',     url: '/play.html?test=1&stage=18', settle: 18000, caption: 'Vell Arcology — Understreets' },
  { id: 'shot-anchor',       url: '/play.html?test=1&stage=23', settle: 18000, caption: 'Spire Anchor — The Long Climb' },
];

const exe = findChromium();
if (!exe) { console.error('no cached chromium found'); process.exit(2); }
console.log('browser:', exe);
console.log('base:', BASE);

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});

const captured = [];
const failed = [];

for (const shot of SHOTS) {
  if (ONLY && !ONLY.has(shot.id)) continue;
  const out = path.join(OUT_DIR, `${shot.id}.png`);
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2, // -> 3840x2160 device pixels
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(BASE + shot.url, { waitUntil: 'load', timeout: 60000 });
    // Wait for the harness to report a live scene rather than trusting a timer.
    await page.waitForFunction(() => window.__STATE?.ready === true, { timeout: 90000 })
      .catch(() => console.log(`  (${shot.id}: no ready flag, falling back to settle)`));
    await page.waitForTimeout(shot.settle);
    const state = await page.evaluate(() => ({
      fps: Math.round(window.__STATE?.fps ?? 0),
      phase: window.__STATE?.phase,
      errs: (window.__STATE?.errors ?? []).length,
    }));
    await page.screenshot({ path: out, timeout: 180000 });
    const kb = fs.statSync(out).size / 1024;
    console.log(`captured ${shot.id}  fps=${state.fps} phase=${state.phase} `
      + `stateErrs=${state.errs} pageErrs=${errors.length}  ${kb.toFixed(0)}KB`);
    captured.push({ ...shot, fps: state.fps, errors: errors.length });
  } catch (e) {
    console.error(`FAIL ${shot.id}: ${e.message}`);
    failed.push(shot.id);
  }
  await page.close();
}

await browser.close();

// Record captions alongside the files so the page builder does not have to
// re-derive which mission each frame came from.
fs.writeFileSync(
  path.join(ROOT, 'content', 'site-gallery.json'),
  JSON.stringify({ shots: captured.map(({ id, caption, fps }) => ({ id, caption, fps })) }, null, 2) + '\n',
);

console.log(`\n${captured.length} captured, ${failed.length} failed`);
if (failed.length) { console.error('NOT captured:', failed.join(', ')); process.exit(1); }
