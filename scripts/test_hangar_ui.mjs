#!/usr/bin/env node
/**
 * HANGAR keyboard-only UI journey (§9): drives the real build headlessly
 * through menu → HANGAR → unlock Bay 2 → buy a duplicate → field both copies
 * → multiplayer queue (against the real LAN relay). Every activation is
 * focus + Enter/Escape on native buttons — no mouse — and screen-reader
 * labels on wallet/bays/prices are asserted along the way.
 * Prereq: npm run build (serves dist/ itself; no preview server needed).
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { fullProgress, seedRegistered } from './seed_pilot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = 4211;
const MP_PORT = 4177;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://x`);
  let p = path.join(DIST, decodeURIComponent(url.pathname));
  if (url.pathname === '/') p = path.join(DIST, 'index.html');
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(PORT, r));

// the real LAN relay — the queue step exercises the actual deck protocol
const relay = spawn(process.execPath, [path.join(ROOT, 'server', 'mp-server.mjs')], { stdio: 'ignore', env: { ...process.env, MP_PORT: String(MP_PORT) } });
await new Promise((r) => setTimeout(r, 600));

const cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
let exe = null;
for (const d of fs.readdirSync(cacheDir).filter((x) => x.startsWith('chromium')).sort().reverse()) {
  for (const c of [
    path.join(cacheDir, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
    path.join(cacheDir, d, 'chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
  ]) if (fs.existsSync(c)) { exe = c; break; }
  if (exe) break;
}
if (!exe) { console.error('no cached chromium'); cleanup(2); }

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) pass++; else { fail++; console.error(`  ✗ ${label}`); } };

function cleanup(code) {
  try { relay.kill(); } catch { /* gone */ }
  server.close();
  process.exit(code);
}

const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

// Seed a signed-in pilot with campaign history (stage 3 done → pumice salvage
// back-fill) and 30,000 scrip, BEFORE any app code runs. The relay above serves
// the account API too, so this registers a REAL account and plants a REAL
// session — the hangar journey then runs over the cloud-backed save path.
const seeded = await seedRegistered(page, {
  apiBase: `http://localhost:${MP_PORT}/api`,
  progress: fullProgress(),
});
await page.goto(`http://localhost:${PORT}/play.html`, { waitUntil: 'load', timeout: 30000 });

/** keyboard-only activation: move focus to the control, hit Enter */
async function press(sel, key = 'Enter') {
  await page.waitForSelector(sel, { timeout: 8000 });
  const tag = await page.$eval(sel, (el) => el.tagName);
  ok(tag === 'BUTTON' || tag === 'INPUT', `${sel} is natively focusable (${tag})`);
  await page.focus(sel);
  await page.keyboard.press(key);
}
const text = (sel) => page.$eval(sel, (el) => el.textContent ?? '').catch(() => '');
const count = (sel) => page.$$eval(sel, (els) => els.length).catch(() => 0);

// --- menu → hangar ---
await page.waitForSelector('#mm-hangar', { timeout: 15000 });
ok((await text('.pilotline')).includes(seeded.callsign.toUpperCase()), 'signed-in pilot on menu');
await press('#mm-hangar');
await page.waitForSelector('#hangarscreen', { timeout: 8000 });

// coach marks: three one-time cards, dismissed by Enter
for (let i = 0; i < 3; i++) {
  if (await count('#hg-coach-next')) await press('#hg-coach-next');
}
ok((await count('#hg-coach-next')) === 0, 'coach marks dismissed');

// first-run state: starter in Bay 1, salvage back-fill in the collection
ok((await text('.hg-wallet')).includes('30,000'), 'wallet shows 30,000 scrip');
ok((await page.$eval('.hg-wallet', (el) => el.getAttribute('aria-label') ?? '')).includes('30000'), 'wallet has screen-reader label');
ok((await count('.bay.occupied')) === 1, 'exactly one occupied bay (starter)');
ok((await text('#hg-rail')).includes('SKARN'), 'starter Skarn sits in Bay 1');
ok((await text('#hg-collection')).includes('PUMICE'), 'stage-3 salvage back-filled into the Collection');
ok((await page.$$eval('#hg-rail [aria-label]', (els) => els.length)) >= 3, 'bay chips carry aria-labels');

// --- unlock Bay 2 (keyboard) ---
await press('[data-unlockbay="1"]');
await press('#hg-mod-ok');
await page.waitForSelector('[data-assignbay="1"]', { timeout: 8000 });
ok((await text('.hg-wallet')).includes('28,000'), 'bay 2 unlock debited 2,000');
ok((await count('[data-unlockbay="2"]')) === 1, 'bay 3 is now the next purchasable');

// --- catalog preview: ANY chassis is viewable, owned or not ---
await press('[data-tab="requisition"]');
await press('[data-preview="flint"]');
await page.waitForFunction(() => (document.querySelector('.hg-right')?.textContent ?? '').includes('CATALOG PREVIEW — FLINT'), { timeout: 8000 });
ok((await text('.hg-right')).includes('NOT OWNED'), 'unowned Flint previews in the inspector');
await press('[data-preview="craton"]');
await page.waitForFunction(() => (document.querySelector('.hg-right')?.textContent ?? '').includes('CATALOG PREVIEW — CRATON'), { timeout: 8000 });
ok(true, 'unaffordable Craton previews too — listings are always clickable');

// --- buy a duplicate Skarn from Requisition ---
await press('[data-buy="skarn"]');
ok((await text('.modal')).includes('COPY 2'), 'purchase modal marks the duplicate copy');
await press('#hg-mod-ok');
await page.waitForSelector('#hg-collection', { timeout: 8000 });
ok((await text('.hg-wallet')).includes('24,150'), 'duplicate purchase debited 3,850');
ok((await text('#hg-collection')).includes('×2 OWNED'), 'collection shows ×2 owned');

// --- assign the duplicate to Bay 2 (picker) ---
await press('[data-assignbay="1"]');
await page.waitForSelector('[data-pick]', { timeout: 8000 });
const pickIid = await page.evaluate(() => {
  for (const card of document.querySelectorAll('.chassis-card')) {
    if ((card.textContent ?? '').includes('SKARN')) {
      const b = card.querySelector('[data-pick]');
      if (b) return b.getAttribute('data-pick');
    }
  }
  return null;
});
ok(pickIid !== null, 'unslotted duplicate offered in the picker');
await press(`[data-pick="${pickIid}"]`);
await page.waitForFunction(() => document.querySelectorAll('.bay.occupied').length === 2, { timeout: 8000 });
ok(true, 'both Skarn copies fielded — one per bay (Core Rule 5)');

// --- Escape back to menu, then queue with the 2-frame deck ---
await page.keyboard.press('Escape');
await page.waitForSelector('#mm-mp', { timeout: 8000 });
await press('#mm-mp');
await page.waitForSelector('#mp-dm', { timeout: 8000 });
ok((await text('#startscreen')).includes('YOUR DECK'), 'lobby shows the bay rail');
await press('#mp-dm');
await page.waitForFunction(() => (document.body.textContent ?? '').includes('FIRST DROP'), { timeout: 10000 });
ok((await count('[data-deploy]')) === 2, 'queue offers exactly the two deck frames');
ok((await text('#startscreen')).includes('MATCHMAKING'), 'queued against the real match server');

ok(pageErrors.length === 0, `no page errors (${pageErrors[0] ?? ''})`);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
cleanup(fail ? 1 : 0);
