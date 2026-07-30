#!/usr/bin/env node
/**
 * End-to-end check of the account/save layer against the real UI and a real
 * account service — the journey the cloud accounts exist for:
 *
 *   1. register a pilot through the sign-in form → ready screen with stage select
 *   2. confirm the account and its save landed in the SERVICE (not just this browser)
 *   3. record a stage-1 win the way the game records it, and let it sync
 *   4. reload → the session resumes from the service, stage 2 unlocked + preselected
 *   5. A DIFFERENT BROWSER PROFILE (an empty one — a second device) signs in with the
 *      same callsign and passcode and finds the same campaign waiting
 *   6. the second device plays on; the first device sees it after a refresh
 *
 * Serves dist/ itself and spawns server/mp-server.mjs for the account API, so
 * the only prerequisite is `npm run build`.
 *
 * Run:  npm run savetest
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = 4213;
const MP_PORT = 4177; // the client resolves the API to <host>:4177 on localhost

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
server.listen(PORT);

// The account service for this run. The client resolves the API to :4177 on
// localhost, so this MUST be our relay — a leftover one from another harness
// would quietly take the traffic and write somewhere else, which reads as a
// mystery failure. Fail loudly instead.
const accountsFile = path.join(os.tmpdir(), `robot-mech-savetest-${Date.now()}.json`);
const relayLog = [];
const relay = spawn(process.execPath, [path.join(ROOT, 'server', 'mp-server.mjs')], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, MP_PORT: String(MP_PORT), ACCOUNTS_FILE: accountsFile },
});
let relayExited = false;
relay.on('exit', () => { relayExited = true; });
relay.stdout.on('data', (d) => relayLog.push(String(d)));
relay.stderr.on('data', (d) => relayLog.push(String(d)));

let relayUp = false;
for (let i = 0; i < 20 && !relayUp && !relayExited; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try { relayUp = (await fetch(`http://localhost:${MP_PORT}/api/health`)).ok; } catch { /* not yet */ }
}
if (relayExited || !relayUp) {
  const busy = relayLog.join('').includes('EADDRINUSE');
  console.error(busy
    ? `\nPort ${MP_PORT} is already taken — stop the other match server (pkill -f mp-server.mjs) and retry.`
    : `\nThe account service would not start:\n${relayLog.join('')}`);
  process.exit(2);
}

let pass = 0;
const failures = [];
const ok = (cond, label, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); } else { failures.push(`${label}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
};

function cleanup(code) {
  try { relay.kill(); } catch { /* already gone */ }
  try { fs.unlinkSync(accountsFile); } catch { /* fine */ }
  server.close();
  process.exit(code);
}

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

const CALLSIGN = `Save ${Math.random().toString(36).slice(2, 7)}`;
const PASSCODE = 'code1234';
const PAGE_URL = `http://localhost:${PORT}/play.html`;

const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader'] });

/** A fresh browser context is a fresh device: its own localStorage, no session. */
async function device(label) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`${label} page error: ${e}`));
  await page.goto(PAGE_URL, { waitUntil: "load" });
  return { ctx, page };
}

const stageState = (page) => page.$$eval('.stages button', (bs) =>
  bs.map((b) => ({ text: b.textContent?.trim().slice(0, 24), disabled: b.disabled, sel: b.classList.contains('sel') })));

/** Edit the signed-in pilot's cached save in place — the client keeps one
 *  record per pilot under `veyra.account.v3` (see CacheFile in profiles.ts). */
const editCachedSave = (page, mutate) => page.evaluate((src) => {
  const KEY = 'veyra.account.v3';
  const file = JSON.parse(localStorage.getItem(KEY));
  const rec = file.accounts[file.activeId];
  // eslint-disable-next-line no-new-func
  new Function('p', src)(rec.progress);
  rec.dirty = true;
  localStorage.setItem(KEY, JSON.stringify(file));
}, mutate);

try {
  // ---- 1. register on device A ------------------------------------------------
  console.log('\ndevice A — registration');
  const a = await device('A');
  await a.page.click('#swap');                    // sign-in form → registration
  await a.page.fill('#cs', CALLSIGN);
  await a.page.fill('#pw', PASSCODE);
  await a.page.click('#go');
  // registration runs a 200k-round PBKDF2 on the client before the request
  await a.page.waitForSelector('#mm-camp, .stages, #bt-accept', { timeout: 30000 });
  const btOffer = await a.page.$('#bt-accept');
  if (btOffer) await a.page.click('#bt-skip');    // the first-boot Basic Training offer
  await a.page.waitForSelector('#mm-camp', { timeout: 10000 });
  ok(true, 'registration reaches the main menu');
  ok((await a.page.$eval('.pilotline', (el) => el.textContent ?? '')).includes(CALLSIGN.toUpperCase()), 'the menu names the pilot');

  // ---- 2. the account exists in the SERVICE, not just this browser ------------
  const stored = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
  const account = (stored.accounts ?? []).find((acc) => acc.callsign === CALLSIGN);
  ok(Boolean(account), 'the account landed in the service database');
  ok(Boolean(account?.pass_hash) && account?.pass_hash.length === 64, 'the passcode is stored as a hash, not plaintext');
  ok(!JSON.stringify(stored).includes(PASSCODE), 'the passcode itself is nowhere in the database');

  // ---- 3. record a stage-1 win and let it sync -------------------------------
  console.log('\ndevice A — a mission win syncs');
  await editCachedSave(a.page, 'p.unlocked = 2; p.scrip = 330; p.completed[1] = { scrip: 330, at: Date.now() };');
  // nudge the store into flushing: re-entering the menu re-renders and the
  // visibility handler pushes; simplest deterministic nudge is a reload, which
  // routes through the pagehide keepalive + the post-load resume
  await a.page.reload({ waitUntil: 'load' });
  await a.page.waitForSelector('#mm-camp', { timeout: 20000 });

  let serviceSave = null;
  for (let i = 0; i < 30 && !serviceSave; i++) {
    const snap = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
    const row = snap.progress?.[account.id];
    const data = row ? JSON.parse(row.data) : null;
    if (data?.unlocked === 2) serviceSave = data;
    else await new Promise((r) => setTimeout(r, 300));
  }
  ok(Boolean(serviceSave), 'the win reached the service database');
  ok(serviceSave?.scrip === 330, 'the scrip reached the service database', `got ${serviceSave?.scrip}`);

  // ---- 4. reload resumes from the service ------------------------------------
  await a.page.click('#mm-camp');
  await a.page.waitForSelector('.stages', { timeout: 10000 });
  const afterReload = await stageState(a.page);
  ok(afterReload[1] && !afterReload[1].disabled, 'stage 2 is unlocked after resuming');
  ok(afterReload[1]?.sel === true, 'stage 2 is preselected after resuming');

  // ---- 5. THE FEATURE: a second device signs in and finds the campaign -------
  console.log('\ndevice B — a different device, same pilot');
  const b = await device('B');
  const seededOnB = await b.page.evaluate(() => localStorage.getItem('veyra.account.v3'));
  ok(seededOnB === null, 'device B starts with no local account');
  await b.page.fill('#cs', CALLSIGN);
  await b.page.fill('#pw', PASSCODE);
  await b.page.click('#go');
  await b.page.waitForSelector('#mm-camp, #bt-accept', { timeout: 30000 });
  if (await b.page.$('#bt-accept')) await b.page.click('#bt-skip');
  await b.page.waitForSelector('#mm-camp', { timeout: 10000 });
  ok(true, 'device B signs in with the same callsign and passcode');
  const pilotB = await b.page.$eval('.pilotline', (el) => el.textContent ?? '');
  ok(pilotB.includes(CALLSIGN.toUpperCase()), 'device B shows the same pilot');
  ok(pilotB.includes('330'), 'device B shows the wallet earned on device A', pilotB.trim());
  await b.page.click('#mm-camp');
  await b.page.waitForSelector('.stages', { timeout: 10000 });
  const stagesB = await stageState(b.page);
  ok(stagesB[1] && !stagesB[1].disabled, 'device B finds stage 2 already unlocked');
  ok(stagesB[2]?.disabled === true, 'device B does not get stages the pilot has not earned');

  // ---- 6. device B plays on; device A picks it up -----------------------------
  console.log('\nboth devices converge');
  await editCachedSave(b.page, 'p.unlocked = 3; p.scrip = 800; p.completed[2] = { scrip: 470, at: Date.now() };');
  await b.page.reload({ waitUntil: 'load' });
  await b.page.waitForSelector('#mm-camp', { timeout: 20000 });

  await a.page.reload({ waitUntil: 'load' });     // device A resumes → pulls the newer copy
  await a.page.waitForSelector('#mm-camp', { timeout: 20000 });
  const pilotA = await a.page.$eval('.pilotline', (el) => el.textContent ?? '');
  ok(pilotA.includes('800'), 'device A picks up what device B earned', pilotA.trim());
  await a.page.click('#mm-camp');
  await a.page.waitForSelector('.stages', { timeout: 10000 });
  const stagesA2 = await stageState(a.page);
  ok(stagesA2[2] && !stagesA2[2].disabled, 'device A finds stage 3 unlocked by device B');

  // ---- guests still work with no account at all ------------------------------
  console.log('\nguest path');
  const g = await device('G');
  await g.page.click('#guest');
  await g.page.waitForSelector('#mm-camp, #bt-accept', { timeout: 15000 });
  if (await g.page.$('#bt-accept')) await g.page.click('#bt-skip');
  await g.page.waitForSelector('#mm-camp', { timeout: 10000 });
  const guestLine = await g.page.$eval('.pilotline', (el) => el.textContent ?? '');
  ok(guestLine.includes('GUEST'), 'guest entry still reaches the menu');
} catch (e) {
  failures.push(`threw: ${e?.stack ?? e}`);
  console.log(`  ✗ ${e?.message ?? e}`);
}

await browser.close();
console.log(`\n${pass} checks passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  · ${f}`);
  cleanup(1);
}
console.log('SAVE FLOW VERIFIED: accounts live in the service, and one pilot reaches the same campaign from two devices.');
cleanup(0);
