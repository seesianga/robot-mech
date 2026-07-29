#!/usr/bin/env node
/**
 * Headless verification of the mouse-yaw fix: moving the mouse RIGHT must
 * turn the torso RIGHT (yaw decreases in our convention), and LEFT must
 * increase it. Requires `npm run preview` (or dev) serving the current build.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? 'http://localhost:4199/play.html?test=1';
const cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
let exe = null;
for (const d of fs.readdirSync(cacheDir).filter((d) => d.startsWith('chromium')).sort().reverse()) {
  const c = path.join(cacheDir, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
  if (fs.existsSync(c)) { exe = c; break; }
}
if (!exe) { console.error('no cached chromium'); process.exit(2); }

const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });

// wait for boot lock to release
for (let i = 0; i < 40; i++) {
  const s = await page.evaluate(() => window.__STATE);
  if (s?.ready && s.bootLocked === false) break;
  await page.waitForTimeout(500);
}

const move = (dx) => page.evaluate((mx) => {
  window.dispatchEvent(new MouseEvent('mousemove', { movementX: mx, movementY: 0 }));
}, dx);

const yaw = async () => (await page.evaluate(() => window.__STATE)).torsoYaw;

const y0 = await yaw();
await move(400);                 // mouse RIGHT
await page.waitForTimeout(400);
const yRight = await yaw();
await move(-800);                // mouse LEFT, past center
await page.waitForTimeout(400);
const yLeft = await yaw();
await browser.close();

console.log(`yaw start=${y0}  after mouse-right=${yRight}  after mouse-left=${yLeft}`);
const rightOk = yRight < y0 - 0.05; // right = yaw decreases = view turns right
const leftOk = yLeft > yRight + 0.05;
if (rightOk && leftOk) {
  console.log('MOUSE FIX VERIFIED: right turns right, left turns left');
} else {
  console.error('MOUSE FIX FAILED');
  process.exit(1);
}
