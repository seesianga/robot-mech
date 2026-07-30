#!/usr/bin/env node
/**
 * Fail closed when the Robot Mech identity drifts across product, runtime,
 * Cloudflare, metadata, documentation, or a built release.
 *
 * Veyra Prime remains the story world. Compatibility-only values in
 * content/brand.json are also intentionally stable: changing the previous
 * Worker origin, runner label, D1 database, credential salt, storage keys, or
 * model namespace would strand sessions, accounts, saves, or asset references.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRAND_PATH = path.join(ROOT, 'content', 'brand.json');
const brand = JSON.parse(fs.readFileSync(BRAND_PATH, 'utf8'));
const errors = [];

function fail(message) {
  errors.push(message);
}

function text(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function requireValue(label, actual, expected) {
  if (actual !== expected) fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function requireText(relative, pattern, label = String(pattern)) {
  const body = text(relative);
  if (!pattern.test(body)) fail(`${relative} is missing ${label}`);
}

function requireLiteral(relative, expected, label = expected) {
  const body = text(relative);
  if (!body.includes(expected)) fail(`${relative} is missing ${label}`);
}

function forbidText(relative, pattern, label = String(pattern)) {
  const body = text(relative);
  if (pattern.test(body)) fail(`${relative} still contains ${label}`);
}

requireValue('productName', brand.productName, 'Robot Mech');
requireValue('productSlug', brand.productSlug, 'robot-mech');
requireValue('worldName', brand.worldName, 'Veyra Prime');
requireValue('pagesOrigin', brand.pagesOrigin, 'https://robot-mech.pages.dev');
requireValue('workerOrigin', brand.workerOrigin, 'https://robot-mech.seesianga.workers.dev');
requireValue('legacy Worker origin', brand.legacyCompatibility?.workerOrigin, 'https://veyra-prime.seesianga.workers.dev');
requireValue('legacy CI runner label', brand.legacyCompatibility?.ciRunnerLabel, 'veyra-assets');
requireValue('legacy D1 database', brand.legacyCompatibility?.d1Database, 'veyra-accounts');
requireValue(
  'legacy D1 database id',
  brand.legacyCompatibility?.d1DatabaseId,
  'fe404892-b11c-495b-9434-a597f229f5ce',
);
requireValue('legacy credential salt', brand.legacyCompatibility?.credentialSaltPrefix, 'veyra.prime.pilot.v1|');
requireValue('legacy offline digest', brand.legacyCompatibility?.offlineDigestPrefix, 'veyra.offline.v1|');
requireValue('legacy storage prefix', brand.legacyCompatibility?.storagePrefix, 'veyra.');
requireValue('legacy model prefix', brand.legacyCompatibility?.modelAssetPrefix, 'vp_');
const requiredStorageKeys = [
  'veyra.account.v3', 'veyra.account.v2', 'veyra.device.v1', 'veyra.resume.v1',
  'veyra.guest.progress.v1', 'veyra.bt.jump.v1', 'veyra.profiles.v1',
  'veyra.session.v1', 'veyra.nav.v1', 'veyra.telemetry.v1',
  'veyra.site.sound', 'veyra.hangar.coach.v1', 'vp.quality',
];
requireValue(
  'legacy storage keys',
  JSON.stringify(brand.legacyCompatibility?.storageKeys),
  JSON.stringify(requiredStorageKeys),
);

const pkg = JSON.parse(text('package.json'));
requireValue('package name', pkg.name, brand.productSlug);
if (!String(pkg.description).includes(brand.productName)) fail('package description does not name Robot Mech');
if (!String(pkg.scripts?.['deploy:pages']).includes('--project-name robot-mech')) {
  fail('deploy:pages does not target the robot-mech Pages project');
}
if (!String(pkg.scripts?.['deploy:worker']).includes('wrangler@4.115.0 deploy')) {
  fail('deploy:worker is not pinned to the reviewed Wrangler release');
}

requireText('wrangler.jsonc', /"name"\s*:\s*"robot-mech"/, 'Worker name robot-mech');
requireText('.env.production', /VITE_MP_URL=wss:\/\/robot-mech\.seesianga\.workers\.dev\/ws/, 'Robot Mech multiplayer endpoint');
requireText('.env.production', /VITE_API_URL=https:\/\/robot-mech\.seesianga\.workers\.dev\/api/, 'Robot Mech account endpoint');
requireText('public/_headers', /connect-src[^;\n]*https:\/\/robot-mech\.seesianga\.workers\.dev[^;\n]*wss:\/\/robot-mech\.seesianga\.workers\.dev/i, 'Robot Mech Worker CSP origins');
requireText('README.md', /https:\/\/robot-mech\.pages\.dev\//, 'canonical Pages URL');
requireText('.github/workflows/ci.yml', /runs-on:\s*\[self-hosted,\s*veyra-assets\]/, 'stable asset-runner label');
requireText('server/accountapi.mjs', /service:\s*'robot-mech-accounts'/, 'Robot Mech health service name');
requireLiteral(
  'src/ui/start.ts',
  'CAMPAIGN — ${PRODUCT_NAME.toUpperCase()} (24 MISSIONS)',
  'Robot Mech campaign menu label',
);
forbidText(
  'src/ui/start.ts',
  /CAMPAIGN[^`\n]*WORLD_NAME/,
  'a campaign menu label sourced from the retired world-name copy',
);

// A manifest-only assertion is not a compatibility gate. Pin every retained
// identifier at the runtime or release site that actually consumes it.
requireLiteral('wrangler.jsonc', '"database_name": "veyra-accounts"', 'stable D1 database name');
requireLiteral(
  'wrangler.jsonc',
  '"database_id": "fe404892-b11c-495b-9434-a597f229f5ce"',
  'stable D1 database id',
);
requireLiteral('server/credentials.mjs', "saltPrefix: 'veyra.prime.pilot.v1|'", 'stable credential salt');
requireLiteral('src/save/profiles.ts', '`veyra.offline.v1|${', 'stable offline verifier digest');
requireLiteral('server/accountapi.mjs', 'veyra-prime\\.', 'legacy Worker rollback origin');
requireLiteral('.github/workflows/ci.yml', 'runs-on: [self-hosted, veyra-assets]', 'stable asset-runner label');
requireLiteral('scripts/verify_release.mjs', '`vp_frame_shared_${', 'stable model asset namespace');

const runtimeStorageSites = {
  'src/save/profiles.ts': [
    'veyra.account.v3',
    'veyra.account.v2',
    'veyra.device.v1',
    'veyra.resume.v1',
    'veyra.guest.progress.v1',
    'veyra.bt.jump.v1',
    'veyra.profiles.v1',
    'veyra.session.v1',
  ],
  'src/save/navprefs.ts': ['veyra.nav.v1', 'veyra.telemetry.v1'],
  'src/site/audio.ts': ['veyra.site.sound'],
  'src/ui/hangar.ts': ['veyra.hangar.coach.v1'],
  'src/engine/quality.ts': ['vp.quality'],
};
for (const [relative, keys] of Object.entries(runtimeStorageSites)) {
  for (const key of keys) requireLiteral(relative, key, `stable storage key ${key}`);
}

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT })
  .toString('utf8').split('\0').filter(Boolean);

// Product identity checks are deliberately contextual. "Veyra Prime" is valid
// story copy, but it must not return as the application title, package, Worker,
// social card name, visible wordmark, FAQ product name, CTA, or copyright owner.
const retiredProductPatterns = [
  /<title>\s*Veyra Prime\b/i,
  /property="og:site_name"\s+content="Veyra Prime"/i,
  /property="og:title"\s+content="Veyra Prime\b/i,
  /name="twitter:title"\s+content="Veyra Prime\b/i,
  /"name"\s*:\s*"Veyra Prime"/i,
  />\s*VEYRA\s*<em>PRIME<\/em>/,
  /Is Veyra Prime an original game\?/i,
  />\s*Play Veyra Prime\s*</i,
  /©\s*2026\s+Veyra Prime\b/i,
];
for (const relative of ['index.html', 'play.html', 'assetcheck.html', 'sitecap.html', 'viewer.html']) {
  const body = text(relative);
  for (const pattern of retiredProductPatterns) {
    if (pattern.test(body)) fail(`${relative} still uses Veyra Prime as the product identity (${pattern})`);
  }
}

function walk(directory, prefix = '') {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute, relative));
    else files.push({ relative, absolute });
  }
  return files;
}

if (process.argv.includes('--dist')) {
  const dist = path.join(ROOT, 'dist');
  const textExtensions = new Set(['.css', '.html', '.js', '.json', '.map', '.mjs', '.svg', '.txt', '.xml']);
  if (!fs.existsSync(dist)) fail('dist is missing; build before running brandcheck --dist');
  for (const { relative, absolute } of walk(dist)) {
    if (!textExtensions.has(path.extname(relative).toLowerCase())) continue;
    const body = fs.readFileSync(absolute, 'utf8');
    for (const pattern of retiredProductPatterns) {
      if (pattern.test(body)) fail(`dist/${relative} uses Veyra Prime as the product identity (${pattern})`);
    }
  }
  requireText('dist/index.html', /<title>Robot Mech\b/, 'built Robot Mech title');
  forbidText('dist/index.html', /%%FACT:/, 'an unresolved site-truth token');
}

if (errors.length) {
  console.error(`brand verification FAILED (${errors.length} issue${errors.length === 1 ? '' : 's'}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`brand verification passed: ${brand.productName}`);
console.log(`  Pages   ${brand.pagesOrigin}`);
console.log(`  Worker  ${brand.workerOrigin}`);
console.log(`  tracked ${tracked.length} files`);
