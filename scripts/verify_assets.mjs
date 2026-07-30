#!/usr/bin/env node
/**
 * Prove the generated geometry actually reaches the screen.
 *
 * The in-game camera sits inside the cockpit, so a gameplay screenshot can never
 * show whether the Tripo mesh replaced the procedural boxes. This drives
 * assetcheck.html — a third-person rig — once per chassis, screenshots it, and
 * asserts window.__SKIN: every hit zone must carry real geometry (thousands of
 * triangles) rather than the 12-triangle placeholder box.
 *
 * Prereq: npm run build, then a static server on PORT (this script starts one).
 *
 * Usage: node scripts/verify_assets.mjs [outDir]
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = process.argv[2] ?? '/tmp/robot-mech-assets';
const PORT = 4213;

const CHASSIS = ['flint', 'pumice', 'skarn', 'chert', 'halite', 'gabbro', 'basalt',
  'dolerite', 'corundum', 'orogen', 'batholith', 'craton'];

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webp': 'image/webp',
};

if (!fs.existsSync(path.join(DIST, 'assetcheck.html'))) {
  console.error('dist/assetcheck.html missing — run: npm run build');
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = path.join(DIST, decodeURIComponent(url.pathname));
  if (url.pathname === '/') p = path.join(DIST, 'index.html');
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(PORT, r));

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

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });

const ZONES = ['head', 'ct', 'lt', 'rt', 'la', 'ra', 'll', 'rl'];
const results = [];
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

// --static holds the neutral pose, which is how you tell a bad geometry split from
// a bad joint rotation: if the mech is clean standing still, the split is fine.
const walk = process.argv.includes('--static') ? '0' : '1';
const view = process.argv.includes('--front') ? 'front' : '';

for (const c of CHASSIS) {
  await page.goto(`http://localhost:${PORT}/assetcheck.html?mech=${c}&walk=${walk}&view=${view}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__SKIN?.ready === true || window.__SKIN?.error, null, { timeout: 30000 })
    .catch(() => {});
  await page.waitForTimeout(700);
  const skin = await page.evaluate(() => window.__SKIN);
  const box = await page.evaluate(() => window.__SKIN_BOX);
  await page.screenshot({ path: path.join(OUT, `${c}.png`) });
  results.push({ c, skin, box });
}

await browser.close();
server.close();

console.log(`${'chassis'.padEnd(11)} ${'swapped'.padStart(7)} ${'proc'.padStart(5)}  zone triangles`);
console.log('-'.repeat(96));
let bad = 0;
for (const { c, skin } of results) {
  if (!skin?.ready) {
    console.log(`${c.padEnd(11)}  FAILED  ${skin?.error ?? 'no state'}`);
    bad++;
    continue;
  }
  const cells = ZONES.map((z) => `${z}:${(skin.zones[z] ?? 0).toLocaleString()}`).join(' ');
  const flag = skin.procedural > 0 ? ' <- some zones still procedural' : '';
  console.log(`${c.padEnd(11)} ${String(skin.swapped).padStart(7)} ${String(skin.procedural).padStart(5)}  ${cells}${flag}`);
  if (skin.swapped < 8) bad++;
  // Geometry must stay with the mech; drift means a root/world space mix-up.
  if ((skin.drift ?? 0) > 12) {
    console.log(`${' '.repeat(11)} DRIFT ${skin.drift.toFixed(1)} m from the mech's position — chunks in the wrong space`);
    bad++;
  }
}
console.log('-'.repeat(96));
console.log(`screenshots: ${OUT}`);
if (consoleErrors.length) {
  console.log(`console errors (${consoleErrors.length}):`);
  for (const e of [...new Set(consoleErrors)].slice(0, 8)) console.log(`  ${e}`);
}
console.log(bad ? `FAIL — ${bad}/${results.length} chassis did not fully skin` : `PASS — all ${results.length} chassis fully skinned across all 8 hit zones`);
process.exit(bad ? 1 : 0);
