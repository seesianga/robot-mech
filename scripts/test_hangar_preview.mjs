#!/usr/bin/env node
/**
 * Hangar preview transition regression.
 *
 * The old hangar rendered a procedural box-mech immediately, then replaced it
 * with the generated LOD0 frame after the GLB arrived. On a cold connection
 * that made the obsolete model visible for 1–2 seconds. This test gates every
 * playable frame request and proves that the shared turntable instead follows:
 *
 *   loading + no rendered source -> generated LOD0 ready
 *
 * It also covers a stale-request race and a missing-asset failure. A tiny valid
 * GLB is reused as the response body so all 12 transitions are tested without
 * decoding the full 19.7 MiB catalog.
 *
 * Prerequisite: npm run build
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { fullProgress, seedOffline } from './seed_pilot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const mechs = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'mechs.json'), 'utf8')).mechs;
const ids = mechs.map((mech) => mech.id);
const fixture = fs.readFileSync(path.join(DIST, 'models', 'vp_frame_shared_skarn.lod2.glb'));
const source = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'hangar.ts'), 'utf8');

let passed = 0;
const check = (condition, label) => {
  if (!condition) throw new Error(label);
  passed++;
  console.log(`  ✓ ${label}`);
};

check(ids.length === 12, 'all 12 playable frame ids are in scope');
check(!/\bnew\s+Mech\s*\(/.test(source), 'hangar has no procedural Mech constructor');
check(!/\bbuildMechVisual\b/.test(source), 'hangar has no procedural visual builder');
check(!/\bCOMPACT_PALETTE\b/.test(source), 'hangar has no procedural preview palette');

const MIME = {
  '.css': 'text/css',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://local.test');
  const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const absolute = path.resolve(DIST, relative);
  if (!absolute.startsWith(`${DIST}${path.sep}`)) {
    response.writeHead(403).end();
    return;
  }
  fs.readFile(absolute, (error, data) => {
    if (error) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': MIME[path.extname(absolute)] ?? 'application/octet-stream' });
    response.end(data);
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('test server did not bind');
const base = `http://127.0.0.1:${address.port}`;

function findChromium() {
  const cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  for (const directory of fs.readdirSync(cacheDir).filter((name) => name.startsWith('chromium')).sort().reverse()) {
    for (const candidate of [
      path.join(cacheDir, directory, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
      path.join(cacheDir, directory, 'chrome-headless-shell-mac', 'chrome-headless-shell'),
      path.join(cacheDir, directory, 'chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    ]) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const executablePath = findChromium();
if (!executablePath) throw new Error('no cached Chromium found');

async function gateModels(page) {
  const gates = new Map();
  const requested = [];

  await page.route(/\/models\/vp_frame_shared_[a-z-]+\.lod0\.glb(?:\?.*)?$/, async (route) => {
    const match = /vp_frame_shared_([a-z-]+)\.lod0\.glb/.exec(route.request().url());
    const id = match?.[1] ?? '';
    requested.push(id);
    const status = await new Promise((resolve) => {
      gates.set(id, { release: resolve, url: route.request().url() });
    });
    if (status === 200) {
      await route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: fixture });
    } else {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing test model' });
    }
  });

  return {
    requested,
    async wait(id, timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      while (!gates.has(id) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const gate = gates.get(id);
      if (!gate) throw new Error(`no gated LOD0 request for ${id}`);
      return gate;
    },
  };
}

async function openHangar(page) {
  await seedOffline(page, { progress: fullProgress({ unlocked: 24, scrip: 300000 }) });
  await page.route('https://robot-mech.seesianga.workers.dev/**', (route) => route.abort());
  await page.goto(`${base}/play.html`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('#mm-hangar', { timeout: 20000 });
  await page.locator('#mm-hangar').click();
  await page.waitForSelector('#hangarscreen .turn', { timeout: 10000 });
}

async function previewState(page) {
  return page.evaluate(() => {
    const turn = document.querySelector('#hangarscreen .turn');
    const canvas = turn?.querySelector('canvas');
    const status = turn?.querySelector('.preview-status');
    return {
      chassis: turn?.getAttribute('data-preview-chassis') ?? '',
      state: turn?.getAttribute('data-preview-state') ?? '',
      source: turn?.getAttribute('data-preview-source') ?? '',
      rendered: turn?.getAttribute('data-rendered-chassis') ?? '',
      canvasVisibility: canvas ? getComputedStyle(canvas).visibility : 'missing',
      statusOpacity: status ? getComputedStyle(status).opacity : 'missing',
    };
  });
}

function checkLoading(state, id, label) {
  check(state.chassis === id, `${label}: requested chassis is ${id}`);
  check(state.state === 'loading', `${label}: state is loading`);
  check(state.source === 'none', `${label}: rendered source is none`);
  check(state.rendered === '', `${label}: no previous chassis remains`);
  check(state.canvasVisibility === 'hidden', `${label}: canvas is hidden`);
  check(state.statusOpacity === '1', `${label}: neutral loading status is visible`);
}

async function checkHeldLoading(page, id, label, durationMs = 2200) {
  const result = await page.evaluate(async ({ chassis, duration }) => {
    const values = [];
    const started = performance.now();
    while (performance.now() - started < duration) {
      const turn = document.querySelector('#hangarscreen .turn');
      const canvas = turn?.querySelector('canvas');
      values.push({
        chassis: turn?.getAttribute('data-preview-chassis') ?? '',
        state: turn?.getAttribute('data-preview-state') ?? '',
        source: turn?.getAttribute('data-preview-source') ?? '',
        rendered: turn?.getAttribute('data-rendered-chassis') ?? '',
        canvas: canvas ? getComputedStyle(canvas).visibility : 'missing',
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return { elapsed: performance.now() - started, values, chassis };
  }, { chassis: id, duration: durationMs });
  check(result.elapsed >= durationMs, `${label}: request stayed gated for ${durationMs}ms`);
  check(result.values.length > 0, `${label}: loading state was sampled`);
  check(result.values.every((sample) => sample.chassis === id
    && sample.state === 'loading' && sample.source === 'none'
    && sample.rendered === '' && sample.canvas === 'hidden'),
  `${label}: no old or previous picture appears while gated`);
  checkLoading(await previewState(page), id, label);
}

async function waitReady(page, id) {
  await page.waitForFunction((chassis) => {
    const turn = document.querySelector('#hangarscreen .turn');
    return turn?.getAttribute('data-preview-state') === 'ready'
      && turn.getAttribute('data-preview-source') === 'generated-lod0'
      && turn.getAttribute('data-rendered-chassis') === chassis
      && getComputedStyle(turn.querySelector('canvas')).visibility === 'visible';
  }, id, { timeout: 10000 });
  const state = await previewState(page);
  check(state.chassis === id && state.rendered === id, `${id}: exact generated frame is rendered`);
  check(state.state === 'ready' && state.source === 'generated-lod0', `${id}: loading transitions to generated LOD0 ready`);
  check(state.canvasVisibility === 'visible', `${id}: canvas is revealed only when ready`);
}

let browser = null;
try {
  browser = await chromium.launch({
    executablePath,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  console.log('\nall-frame cold-load transitions');
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const modelGates = await gateModels(page);
  await openHangar(page);

  const skarnGate = await modelGates.wait('skarn');
  await checkHeldLoading(page, 'skarn', 'skarn cold load');
  skarnGate.release(200);
  await waitReady(page, 'skarn');

  for (let i = 0; i < 3; i++) {
    const next = page.locator('#hg-coach-next');
    if (await next.count()) await next.click();
  }
  await page.locator('[data-tab="requisition"]').click();

  for (const id of ids.filter((value) => value !== 'skarn')) {
    await page.locator(`[data-preview="${id}"]`).click();
    const gate = await modelGates.wait(id);
    await checkHeldLoading(page, id, `${id} gated load`);
    gate.release(200);
    await waitReady(page, id);
  }
  check(new Set(modelGates.requested).size === 12, 'every playable chassis requested its generated LOD0');
  await page.close();

  console.log('\nstale-request race');
  const racePage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const raceGates = await gateModels(racePage);
  await openHangar(racePage);
  const staleSkarn = await raceGates.wait('skarn');
  await racePage.evaluate(() => {
    document.querySelector('[data-tab="requisition"]')?.click();
    document.querySelector('[data-preview="flint"]')?.click();
  });
  const currentFlint = await raceGates.wait('flint');
  staleSkarn.release(200);
  await racePage.waitForFunction(() => {
    const turn = document.querySelector('#hangarscreen .turn');
    return turn?.getAttribute('data-last-settled-chassis') === 'skarn';
  }, null, { timeout: 10000 });
  checkLoading(await previewState(racePage), 'flint', 'stale Skarn completion');
  currentFlint.release(200);
  await waitReady(racePage, 'flint');
  await racePage.close();

  console.log('\nmissing generated asset');
  const missingPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const missingGates = await gateModels(missingPage);
  await openHangar(missingPage);
  const missingSkarn = await missingGates.wait('skarn');
  missingSkarn.release(404);
  await missingPage.waitForFunction(() => {
    const turn = document.querySelector('#hangarscreen .turn');
    return turn?.getAttribute('data-preview-state') === 'unavailable';
  }, null, { timeout: 10000 });
  const unavailable = await previewState(missingPage);
  check(unavailable.source === 'none' && unavailable.rendered === '', 'missing GLB never falls back to the old picture');
  check(unavailable.canvasVisibility === 'hidden' && unavailable.statusOpacity === '1',
    'missing GLB keeps a neutral unavailable state');
  await missingPage.close();

  console.log(`\n${passed} hangar preview checks passed`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
