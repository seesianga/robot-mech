#!/usr/bin/env node
/**
 * Focused steering probe — answers "is left/right leg steering actually broken?"
 * in seconds, instead of waiting five minutes for the whole Basic Training suite
 * to reach bt_a4 and time out.
 *
 * bt_a4 requires >=45 degrees of accumulated yaw in BOTH directions. The test holds
 * KeyA for 1000 ms, and Skarn turns at 105 deg/s, so it should clear the bar with
 * more than twice the margin. This drives exactly that input and measures the real
 * legYaw delta, which separates "steering is broken" from "the step's metric or the
 * harness is at fault".
 *
 * Usage: node scripts/probe_steer.mjs [baseUrl]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://localhost:4199';
const URL = `${BASE}/play.html?test=1&stage=1&cockpit=1`;

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
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = () => page.evaluate(() => window.__STATE);

await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => window.__STATE?.ready === true, null, { timeout: 30000 });

// Clear the boot lock the same way a pilot would.
for (let i = 0; i < 40; i++) {
  if (!(await S()).bootLocked) break;
  await page.keyboard.press('Enter');
  await sleep(250);
}

const deg = (r) => (r * 180) / Math.PI;
const results = [];
for (const [label, key] of [['LEFT (KeyA)', 'KeyA'], ['RIGHT (KeyD)', 'KeyD']]) {
  await sleep(400);
  const before = (await S()).legYaw;
  const t0 = Date.now();
  await page.keyboard.down(key);
  await sleep(1000);
  await page.keyboard.up(key);
  const held = Date.now() - t0;
  await sleep(150);
  const after = (await S()).legYaw;
  const turned = deg(after - before);
  results.push({ label, turned, held, fps: (await S()).fps });
}

await browser.close();

console.log(`${'input'.padEnd(14)} ${'held'.padStart(6)} ${'yaw'.padStart(10)}  ${'fps'.padStart(4)}  verdict`);
console.log('-'.repeat(62));
let bad = 0;
for (const r of results) {
  // Skarn turns at 105 deg/s; bt_a4 wants >= 45 in each direction.
  const ok = Math.abs(r.turned) >= 45;
  if (!ok) bad++;
  console.log(`${r.label.padEnd(14)} ${String(r.held + 'ms').padStart(6)} `
    + `${(r.turned.toFixed(1) + '°').padStart(10)}  ${String(r.fps).padStart(4)}  `
    + `${ok ? 'OK (>=45°)' : 'UNDER 45°'}`);
}
console.log('-'.repeat(62));
console.log(bad
  ? `FAIL — ${bad}/2 directions under the bt_a4 threshold: steering itself is at fault`
  : 'PASS — both directions clear 45°; steering works, so bt_a4 fails for another reason');
process.exit(bad ? 1 : 0);
