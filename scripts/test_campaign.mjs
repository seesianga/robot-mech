#!/usr/bin/env node
/**
 * Campaign completion suite: headlessly plays EVERY campaign stage (m04–m24)
 * to the COMPLETE screen through the ?test hooks (__TELEPORT, __DAMAGE_STRUCT,
 * __KILL_HOSTILES, __TICKS, __GOD). Proves each runtime config is completable
 * by the engine: steps chain, structures exist, escorts arrive, extract fires.
 * Needs `npm run preview` (or --url). Runs SERIALLY by default: swiftshader WebGL is
 * CPU-rendered, so concurrent missions starve each other badly (see the --conc note
 * near the worker pool). Per-mission time budget scales with the mission's own held
 * seconds rather than a flat number.
 *
 *   node scripts/test_campaign.mjs [--only m04,m21b] [--url http://localhost:4199] [--conc N]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (() => {
  const i = process.argv.indexOf('--url');
  return i >= 0 ? process.argv[i + 1] : 'http://localhost:4199';
})();
const ONLY = (() => {
  const i = process.argv.indexOf('--only');
  return i >= 0 ? new Set(process.argv[i + 1].split(',')) : null;
})();

const MISSIONS = fs.readdirSync(path.join(ROOT, 'content', 'campaign'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'campaign', f), 'utf8')))
  .filter((c) => !ONLY || ONLY.has(c.id))
  .sort((a, b) => a.stage - b.stage || (a.branch ?? '').localeCompare(b.branch ?? ''));

const CONC = (() => {
  const i = process.argv.indexOf('--conc');
  const n = i >= 0 ? Number(process.argv[i + 1]) : 1;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
})();

const cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
let exe = null;
for (const d of fs.readdirSync(cacheDir).filter((d) => d.startsWith('chromium')).sort().reverse()) {
  for (const c of [
    path.join(cacheDir, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
    path.join(cacheDir, d, 'chrome-headless-shell-mac', 'chrome-headless-shell'),
    path.join(cacheDir, d, 'chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
  ]) if (fs.existsSync(c)) { exe = c; break; }
  if (exe) break;
}
if (!exe) { console.error('no cached chromium'); process.exit(2); }

const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader'] });

async function runMission(cfg) {
  const t0 = Date.now();
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const trace = [];
  try {
    const url = `${BASE}/play.html?test=1&stage=${cfg.stage}${cfg.branch === 'b' ? '&branch=b' : ''}`;
    await page.goto(url, { waitUntil: 'load', timeout: 90000 });
    // __SIM appears once the world is built; hidden-tab throttling can starve the
    // frame loop, so boot time is advanced by driving ticks ourselves
    await page.waitForFunction(() => typeof window.__SIM === 'function', null, { timeout: 120000 });
    await page.evaluate(() => { window.__GOD(true); });
    for (let i = 0; i < 40; i++) {
      const boot = await page.evaluate(() => { window.__TICKS(30); return window.__SIM().boot; });
      if (!boot) break;
    }

    // Budget the mission by the held time its OWN config demands, not a flat number.
    // Timed steps (defend/hold/survive) advance 6 s of sim per pass, and each pass
    // costs real wall-clock on CPU-rendered swiftshader — so a mission's floor is set
    // by its own `seconds` totals. A flat 480 s budget silently penalised exactly the
    // missions with the most held time: m21b holds 180 s (two 90 s defends), m07 165 s,
    // m20 145 s. Those are the missions most likely to time out, which reads as
    // "mission broken" when it only ever meant "budget too small".
    // 5 min base + 4 s of wall per held sim-second → m04 300 s, m21b 1020 s.
    const heldSeconds = cfg.steps.reduce((n, s) => n + (s.seconds ?? 0), 0);
    const budgetMs = 300000 + heldSeconds * 4000;
    const deadline = Date.now() + budgetMs;
    let lastStep = -2, stuck = 0;
    while (Date.now() < deadline) {
      const st = await page.evaluate(() => ({ ...window.__SIM(), errs: window.__STATE.errors }));
      if (st.errs?.length) return { id: cfg.id, ok: false, why: `runtime errors: ${st.errs.slice(0, 2).join(' | ')}`, trace };
      if (st.phase === 'complete') return { id: cfg.id, ok: true, secs: ((Date.now() - t0) / 1000).toFixed(0), trace };
      if (st.phase === 'failed') return { id: cfg.id, ok: false, why: `mission FAILED at step ${st.step}`, trace };

      const step = cfg.steps[st.step];
      if (!step) { await page.waitForTimeout(300); continue; }
      if (st.step !== lastStep) { trace.push(`step${st.step}:${step.kind}`); lastStep = st.step; stuck = 0; } else stuck++;
      if (stuck > 60) return { id: cfg.id, ok: false, why: `stuck on step ${st.step} (${step.kind})`, trace };

      await page.evaluate(({ step, extract }) => {
        const W = window;
        switch (step.kind) {
          case 'reach': W.__TELEPORT(step.at[0], step.at[1]); W.__TICKS(150); break;
          case 'extract': W.__TELEPORT(extract[0], extract[1]); W.__TICKS(150); break;
          case 'destroy':
            for (const t of step.targets ?? []) W.__DAMAGE_STRUCT(t, 999999);
            if (step.killAll) W.__KILL_HOSTILES();
            W.__TICKS(150);
            break;
          case 'defend':
            W.__KILL_HOSTILES();
            W.__TICKS(360); // 6 s sim per pass — waves die at each boundary
            W.__KILL_HOSTILES();
            break;
          case 'hold':
            W.__TELEPORT(step.at[0], step.at[1]);
            W.__KILL_HOSTILES();
            W.__TICKS(360);
            W.__KILL_HOSTILES();
            break;
          case 'survive':
            W.__KILL_HOSTILES();
            W.__TICKS(360);
            W.__KILL_HOSTILES();
            break;
          case 'escort':
            W.__KILL_HOSTILES();
            W.__TICKS(300); // 5 s sim — the subject keeps walking its route
            W.__KILL_HOSTILES();
            break;
          case 'duel': W.__KILL_HOSTILES(); W.__TICKS(150); break;
        }
      }, { step, extract: cfg.extract });
      await page.waitForTimeout(30);
    }
    return { id: cfg.id, ok: false, why: `timeout (${(budgetMs / 1000) | 0}s budget, ${heldSeconds}s held)`, trace };
  } catch (e) {
    return { id: cfg.id, ok: false, why: String(e).slice(0, 200), trace, pageErrors: errors.slice(0, 3) };
  } finally {
    await ctx.close();
  }
}

const queue = [...MISSIONS];
const results = [];
async function worker() {
  while (queue.length) {
    const cfg = queue.shift();
    const r = await runMission(cfg);
    results.push(r);
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id}${r.ok ? ` (${r.secs}s)` : ` — ${r.why}`}  [${r.trace.join(' → ')}]`);
  }
}
// Concurrency is a real performance cliff here, not a free speedup. Measured on an
// M-series Mac against this preview build: m04 alone 45 s, m21b alone 100 s — but the
// two together at CONC=2 did not finish inside 600 s. swiftshader renders on the CPU,
// so parallel contexts starve each other and every mission drifts toward its deadline
// at once. Serial is the honest default; raise it only on a machine you have measured.
await Promise.all(Array.from({ length: CONC }, worker));
await browser.close();

const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} campaign missions completable`);
process.exit(fails.length ? 1 : 0);
