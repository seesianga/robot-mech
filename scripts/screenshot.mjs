#!/usr/bin/env node
/**
 * Headless smoke test: loads the built game in ?test=1 mode (auto-start,
 * chase cam, autopilot), waits for the sim to run, screenshots it, and
 * dumps window.__STATE. Uses the locally cached Playwright Chromium.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const OUT = process.argv[2] ?? '/tmp/veyra_smoke.png';
const URL = process.argv[3] ?? 'http://localhost:4199/play.html?test=1';

const cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
const shells = fs.readdirSync(cacheDir).filter((d) => d.startsWith('chromium'));
let exe = null;
for (const d of shells.sort().reverse()) {
  const candidates = [
    path.join(cacheDir, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
    path.join(cacheDir, d, 'chrome-headless-shell-mac', 'chrome-headless-shell'),
    path.join(cacheDir, d, 'chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    path.join(cacheDir, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    path.join(cacheDir, d, 'chrome-mac', 'headless_shell'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) { exe = c; break; }
  if (exe) break;
}
if (!exe) { console.error('no cached chromium found in', cacheDir); process.exit(2); }
console.log('using browser:', exe);

const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

// 90 s, matching test_campaign.mjs. The old 30 s was a fixed budget for a page that
// compiles shaders and uploads meshes on a CPU-rendered swiftshader context, so it
// tracked machine load rather than anything about the build: measured at 47 s on a box
// under load average 25, and comfortably under 20 s on an idle one. A timeout that
// fails with load rather than with breakage teaches people to ignore the smoke test.
await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(2500);
const early = await page.evaluate(() => window.__STATE);
// let the boot sequence release and the mech walk a bit
await page.waitForTimeout(5000);
await page.screenshot({ path: OUT });
const state = await page.evaluate(() => window.__STATE);
await browser.close();

console.log('early state:', JSON.stringify(early));
console.log('final state:', JSON.stringify(state));
console.log('console errors:', JSON.stringify(consoleErrors.slice(0, 8)));
console.log('screenshot:', OUT);

const moved = early && state && JSON.stringify(early.playerPos) !== JSON.stringify(state.playerPos);
if (!state?.ready || (state.errors?.length ?? 0) > 0) {
  console.error('SMOKE FAIL');
  process.exit(1);
}
console.log(moved ? 'SMOKE PASS (sim running, player moving)' : 'SMOKE PASS (sim running)');
