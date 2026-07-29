#!/usr/bin/env node
/**
 * Captures the landing-page media set (hero + gallery) from the built game in
 * ?test=1 autopilot mode: the three campaign maps in chase cam plus a cockpit
 * view. Needs `npm run preview` running. Writes PNGs to public/site/raw/;
 * compress to JPEG afterwards (sips) into public/site/.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://localhost:4199';
const OUT_DIR = fileURLToPath(new URL('../public/site/raw/', import.meta.url));
fs.mkdirSync(OUT_DIR, { recursive: true });

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

const SHOTS = [
  { name: 'hero',       url: '/play.html?test=1&stage=1', settle: 9000 },
  { name: 'map-drill',  url: '/play.html?test=1&stage=1', settle: 14000 },
  { name: 'map-dunes',  url: '/play.html?test=1&stage=2', settle: 11000 },
  { name: 'map-flats',  url: '/play.html?test=1&stage=3', settle: 11000 },
  { name: 'cockpit',    url: '/play.html?test=1&stage=2&cockpit=1', settle: 9000 },
];

const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader'] });
for (const shot of SHOTS) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(BASE + shot.url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(shot.settle);
  const out = path.join(OUT_DIR, `${shot.name}.png`);
  await page.screenshot({ path: out, timeout: 90000 });
  console.log('captured', out);
  await page.close();
}
await browser.close();
console.log('done');
