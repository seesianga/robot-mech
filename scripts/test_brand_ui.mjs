#!/usr/bin/env node
/**
 * Browser-level identity check for the built landing page and game menu.
 *
 * Guards the product identity across titles, wordmarks, social metadata,
 * FAQ/CTA/copyright, and the post-entry main-menu heading.
 *
 * Prerequisite: npm run preview
 * Usage: node scripts/test_brand_ui.mjs [baseUrl]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:4199').replace(/\/+$/, '');
const failures = [];
let passed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    return;
  }
  failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

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
if (!executablePath) {
  console.error('brand UI check requires a cached Chromium');
  process.exit(2);
}

const browser = await chromium.launch({
  executablePath,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
const badResponses = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('response', (response) => {
  if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
});

await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60_000 });
const landing = await page.evaluate(() => ({
  title: document.title,
  ogSite: document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ?? '',
  ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? '',
  twitterTitle: document.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ?? '',
  wordmarks: [...document.querySelectorAll('.brand__name, .boot__brand')].map((node) => node.textContent?.trim() ?? ''),
  faq: [...document.querySelectorAll('summary')].map((node) => node.textContent?.trim() ?? ''),
  cta: [...document.querySelectorAll('a')].map((node) => node.textContent?.trim() ?? ''),
  legal: document.querySelector('.legal')?.textContent?.trim() ?? '',
}));

check('landing title', landing.title.startsWith('Robot Mech —'), landing.title);
check('Open Graph site name', landing.ogSite === 'Robot Mech', landing.ogSite);
check('Open Graph title', landing.ogTitle.startsWith('Robot Mech —'), landing.ogTitle);
check('Twitter title', landing.twitterTitle.startsWith('Robot Mech —'), landing.twitterTitle);
check('all visible wordmarks', landing.wordmarks.length >= 3
  && landing.wordmarks.every((value) => value === 'ROBOT MECH'), JSON.stringify(landing.wordmarks));
check('FAQ product name', landing.faq.includes('Is Robot Mech an original game?'));
check('product CTA', landing.cta.includes('▶ Play Robot Mech'));
check('copyright product name', landing.legal.includes('© 2026 Robot Mech.'));

await page.goto(`${BASE}/play.html`, { waitUntil: 'load', timeout: 90_000 });
await page.waitForSelector('#startscreen h1', { timeout: 30_000 });
const gameTitle = await page.title();
check('game document title', gameTitle.startsWith('ROBOT MECH —'), gameTitle);
check('game menu product heading', await page.locator('#startscreen h1').textContent() === 'ROBOT MECH');

await page.locator('#guest').click();
await page.locator('#bt-skip').click();
await page.waitForSelector('#mm-camp', { timeout: 10_000 });
const campaign = (await page.locator('#mm-camp').textContent())?.trim() ?? '';
check('campaign uses the Robot Mech name', campaign === 'CAMPAIGN — ROBOT MECH (24 MISSIONS)', campaign);
check('campaign omits the old name', !campaign.includes('VEYRA PRIME'), campaign);

check('browser console clean', errors.length === 0, errors.slice(0, 4).join(' | '));
check('network responses clean', badResponses.length === 0, badResponses.slice(0, 4).join(' | '));

await browser.close();

console.log(`brand UI: ${passed} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  - ${failure}`);
if (failures.length) process.exit(1);
