#!/usr/bin/env node
/**
 * Screenshot the HANGAR screen so the turntable can be eyeballed.
 *
 * test_hangar_ui.mjs asserts the hangar's behaviour but never looks at it, so it
 * passes just as happily with a procedural box on the turntable as with the real
 * generated mech. This drives menu -> HANGAR on the real build and captures the
 * screen, which is the only way to confirm the LOD0 swap actually landed.
 *
 * Prereq: npm run build, and a preview server on 4199.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { fullProgress, seedOffline } from './seed_pilot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] ?? '/tmp/robot-mech-hangar.png';
const BASE = process.argv[3] ?? 'http://localhost:4199';

const cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
let exe = null;
for (const d of fs.readdirSync(cacheDir).filter((x) => x.startsWith('chromium')).sort().reverse()) {
  for (const c of [
    path.join(cacheDir, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
    path.join(cacheDir, d, 'chrome-headless-shell-mac', 'chrome-headless-shell'),
  ]) if (fs.existsSync(c)) { exe = c; break; }
  if (exe) break;
}
if (!exe) { console.error('no cached chromium'); process.exit(2); }

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// The main menu only appears for a signed-in pilot. No account API runs for a
// screenshot pass, so seed the local cache and let the client resume offline —
// the supported no-network path (see scripts/seed_pilot.mjs).
await seedOffline(page, {
  progress: fullProgress({ unlocked: 24, scrip: 300000 }),
});
await page.goto(`${BASE}/play.html`, { waitUntil: 'load' });

await page.waitForSelector('#mm-hangar', { timeout: 20000 });
await page.focus('#mm-hangar');
await page.keyboard.press('Enter');
await page.waitForSelector('#hangarscreen', { timeout: 10000 });

// Give the LOD0 GLB time to download and swap in over the procedural placeholder.
await page.waitForTimeout(6000);
await page.screenshot({ path: OUT });

const info = await page.evaluate(() => {
  const c = document.querySelector('#hangarscreen .turn canvas');
  return { hasCanvas: !!c, w: c?.width ?? 0, h: c?.height ?? 0 };
});

await browser.close();
console.log(`turntable canvas: ${info.hasCanvas ? `${info.w}x${info.h}` : 'MISSING'}`);
if (errors.length) {
  console.log(`console errors (${errors.length}):`);
  for (const e of [...new Set(errors)].slice(0, 6)) console.log(`  ${e}`);
}
console.log(`screenshot: ${OUT}`);
process.exit(info.hasCanvas ? 0 : 1);
