#!/usr/bin/env node
/**
 * Screenshot the landing page at several viewports, and report what it cost.
 *
 * This is the site's regression harness. It is not only about how the page
 * looks: it fails on console errors, on requests that 404, and on a transferred
 * weight over budget, because all three are invisible in a screenshot and all
 * three are how a "premium" page quietly becomes a slow broken one.
 *
 * Needs `npm run build && npm run preview`.
 * Usage: node scripts/shot_site.mjs [baseUrl] [--full]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('http')) ?? 'http://localhost:4199';
const FULL = args.includes('--full');
const OUT = path.join(ROOT, '.site-shots');
fs.mkdirSync(OUT, { recursive: true });

/** Gzip-equivalent budget for everything fetched before the visitor scrolls. */
const FIRST_LOAD_BUDGET_KB = 900;

function findChromium() {
  const cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  for (const d of fs.readdirSync(cacheDir).filter((x) => x.startsWith('chromium')).sort().reverse()) {
    for (const c of [
      path.join(cacheDir, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
      path.join(cacheDir, d, 'chrome-headless-shell-mac', 'chrome-headless-shell'),
      path.join(cacheDir, d, 'chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    ]) if (fs.existsSync(c)) return c;
  }
  return null;
}

const VIEWS = [
  { name: 'desktop', width: 1600, height: 950, dsf: 1 },
  { name: 'laptop', width: 1280, height: 800, dsf: 1 },
  { name: 'tablet', width: 834, height: 1112, dsf: 1 },
  { name: 'phone', width: 390, height: 844, dsf: 2 },
];

const exe = findChromium();
if (!exe) { console.error('no cached chromium'); process.exit(2); }

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

let failures = 0;

for (const v of VIEWS) {
  const page = await browser.newPage({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: v.dsf,
  });

  const errors = [];
  const bad = [];
  let bytes = 0;
  let firstLoadBytes = 0;
  let scrolled = false;

  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', async (res) => {
    if (res.status() >= 400) bad.push(`${res.status()} ${res.url()}`);
    try {
      const len = Number((await res.allHeaders())['content-length'] ?? 0);
      bytes += len;
      if (!scrolled) firstLoadBytes += len;
    } catch { /* body already gone */ }
  });

  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);

  // Screenshots are diagnostics, never the pass/fail signal — Chromium can
  // refuse a capture (surface too large, GPU hiccup) on a page that is
  // completely healthy. The checks below are what actually gate the run.
  const shoot = async (file, opts = {}) => {
    try {
      await page.screenshot({ path: path.join(OUT, file), ...opts });
    } catch (e) {
      console.log(`  (capture skipped ${file}: ${String(e.message).split('\n')[0]})`);
    }
  };

  await shoot(`${v.name}-hero.png`);

  scrolled = true;
  // Walk the page so lazy images and the showroom stage actually initialise.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight * 0.8) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 260));
    }
  });
  await page.waitForTimeout(2500);

  if (v.name === 'desktop') {
    await page.evaluate(() => {
      document.getElementById('showroom')?.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(4000);
    await shoot('desktop-showroom.png');
  }

  if (FULL) {
    // A full-page capture of this document exceeds Chromium's maximum texture
    // size on wide viewports and fails outright. It is a nice-to-have for
    // eyeballing the whole layout, never a reason to fail the run.
    await shoot(`${v.name}-full.png`, { fullPage: true });
  }

  /**
   * Catch images whose rendered box is wildly off their source aspect ratio.
   *
   * This exists because of a real bug: the gallery <img> elements carry
   * width/height attributes for CLS, and a rule that set `width: 100%` without
   * a height let the 2160px attribute win over `aspect-ratio: 16/9`. Every tile
   * rendered 397 x 2160 and showed a hugely magnified crop. It is invisible in
   * the numbers and obvious in a screenshot, which is exactly the kind of thing
   * a harness should assert rather than a human remember to look at.
   */
  const boxes = await page.evaluate(() => {
    const bad = [];
    for (const img of document.querySelectorAll('img')) {
      const w = img.clientWidth, h = img.clientHeight;
      if (!w || !h) continue;
      const nat = img.naturalWidth && img.naturalHeight
        ? img.naturalWidth / img.naturalHeight : null;
      if (!nat) continue;
      const box = w / h;
      // object-fit:cover legitimately crops, but never by 3x.
      if (box / nat > 3 || nat / box > 3) {
        bad.push(`${img.currentSrc.split('/').pop()} box ${w}x${h} vs source ${img.naturalWidth}x${img.naturalHeight}`);
      }
    }
    return bad;
  });
  if (boxes.length) {
    boxes.slice(0, 6).forEach((b) => console.log(`    ! image box: ${b}`));
    failures++;
  }

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1);
    return {
      dcl: Math.round(nav?.domContentLoadedEventEnd ?? 0),
      load: Math.round(nav?.loadEventEnd ?? 0),
      lcp: Math.round(lcp?.startTime ?? 0),
      shifts: (performance.getEntriesByType('layout-shift') ?? [])
        .filter((s) => !s.hadRecentInput)
        .reduce((n, s) => n + s.value, 0),
    };
  });

  const kb = (n) => (n / 1024).toFixed(0);
  console.log(`\n[${v.name}] ${v.width}x${v.height}@${v.dsf}x`);
  console.log(`  first load ${kb(firstLoadBytes)} KB · total ${kb(bytes)} KB`);
  console.log(`  DCL ${metrics.dcl} ms · load ${metrics.load} ms · CLS ${metrics.shifts.toFixed(4)}`);
  console.log(`  console errors ${errors.length} · failed requests ${bad.length}`);
  if (errors.length) { errors.slice(0, 6).forEach((e) => console.log(`    ! ${e.slice(0, 160)}`)); failures++; }
  if (bad.length) { bad.slice(0, 8).forEach((b) => console.log(`    ! ${b}`)); failures++; }
  if (firstLoadBytes / 1024 > FIRST_LOAD_BUDGET_KB) {
    console.log(`    ! first load ${kb(firstLoadBytes)} KB exceeds ${FIRST_LOAD_BUDGET_KB} KB budget`);
    failures++;
  }
  if (metrics.shifts > 0.1) {
    console.log(`    ! CLS ${metrics.shifts.toFixed(3)} over the 0.1 threshold`);
    failures++;
  }

  await page.close();
}

await browser.close();
console.log(`\nshots in ${OUT}`);
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log('all checks passed');
