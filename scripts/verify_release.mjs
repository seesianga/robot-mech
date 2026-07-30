#!/usr/bin/env node
/**
 * Verify that dist/ is the complete, source-backed Cloudflare Pages package.
 *
 * This is intentionally stricter than the asset-less CI build. A production
 * release must carry the Drive-backed models, textures, shipped voice files and
 * site art, must match the committed census, and must satisfy Pages upload limits.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliseReleasePath, sourceOnlyReason } from './prune_release.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const DIST = path.resolve(ROOT, process.argv[2] ?? 'dist');
const PUBLIC = path.join(ROOT, 'public');
const PROVENANCE = path.join(ROOT, 'content', 'vo');
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.mjs',
  '.svg',
  '.txt',
  '.webmanifest',
  '.xml',
]);

const errors = [];

function fail(message) {
  errors.push(message);
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${label} is unreadable: ${error instanceof Error ? error.message : error}`);
    return {};
  }
}

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  function visit(directory, prefix = '') {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute, rel);
      else files.push(normaliseReleasePath(rel));
    }
  }
  visit(root);
  return files;
}

function compareSets(label, expectedValues, actualValues) {
  const expected = new Set(expectedValues);
  const actual = new Set(actualValues);
  const missing = [...expected].filter((value) => !actual.has(value)).sort();
  const extra = [...actual].filter((value) => !expected.has(value)).sort();
  if (!missing.length && !extra.length) return;
  const lines = [`${label} differs`];
  if (missing.length) {
    lines.push(`missing: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ` (+${missing.length - 12})` : ''}`);
  }
  if (extra.length) {
    lines.push(`extra: ${extra.slice(0, 12).join(', ')}${extra.length > 12 ? ` (+${extra.length - 12})` : ''}`);
  }
  fail(lines.join(' — '));
}

function sha256(file, length = 64) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, length);
}

function inlineScriptHashes(file) {
  if (!fs.existsSync(file)) return [];
  const html = fs.readFileSync(file, 'utf8');
  return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((body) => body.length > 0)
    .map((body) => `sha256-${createHash('sha256').update(body).digest('base64')}`);
}

function requireFile(file, label) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    fail(`${label} is missing`);
    return false;
  }
  if (fs.statSync(file).size === 0) {
    fail(`${label} is empty`);
    return false;
  }
  return true;
}

function safeManifestRelative(value, label) {
  const rel = normaliseReleasePath(value);
  const resolved = path.resolve(PUBLIC, rel);
  const boundary = `${PUBLIC}${path.sep}`;
  if (!rel || (resolved !== PUBLIC && !resolved.startsWith(boundary))) {
    fail(`${label} has an unsafe path: ${JSON.stringify(value)}`);
    return null;
  }
  return rel;
}

function verifyByteParity(sourceRoot, releaseRoot, files, label) {
  for (const rel of files) {
    const source = path.join(sourceRoot, ...rel.split('/'));
    const release = path.join(releaseRoot, ...rel.split('/'));
    if (!requireFile(source, `${label} source ${rel}`)) continue;
    if (!requireFile(release, `${label} release ${rel}`)) continue;
    if (sha256(source) !== sha256(release)) fail(`${label} changed during packaging: ${rel}`);
  }
}

for (const directory of ['models', 'audio', 'textures', 'site']) {
  if (!fs.existsSync(path.join(PUBLIC, directory))) {
    fail(`public/${directory} is missing; link the Drive-backed release assets before building`);
  }
}
if (!fs.existsSync(DIST)) fail(`${path.relative(ROOT, DIST) || DIST} is missing; run npm run release:prepare`);

const census = readJson(path.join(ROOT, 'content', 'asset-census.json'), 'asset census');
const audioManifest = readJson(path.join(ROOT, 'content', 'audio-manifest.json'), 'audio manifest');
const modelHashes = census.modelHashes && typeof census.modelHashes === 'object'
  ? census.modelHashes : {};
const expectedModelFiles = Object.keys(modelHashes).sort();

if (!Array.isArray(census.models)) fail('asset census models must be an array');
if (!Array.isArray(census.textureFiles)) fail('asset census textureFiles must be an array');
if (!Array.isArray(census.shippedVoiceKeys)) fail('asset census shippedVoiceKeys must be an array');
if (!expectedModelFiles.length) fail('asset census modelHashes is empty');

const sourceModelFiles = listFiles(path.join(PUBLIC, 'models')).filter((file) => file.endsWith('.glb'));
const releaseModelFiles = listFiles(path.join(DIST, 'models')).filter((file) => file.endsWith('.glb'));
compareSets('source models vs census hashes', expectedModelFiles, sourceModelFiles);
compareSets('release models vs census hashes', expectedModelFiles, releaseModelFiles);

const derivedModelIds = [...new Set(expectedModelFiles.map((file) => file.replace(/\.lod\d+\.glb$/, '')))].sort();
compareSets('census model ids vs model hash names', census.models ?? [], derivedModelIds);

for (const file of expectedModelFiles) {
  const expected = modelHashes[file];
  if (!/^[a-f0-9]{12}$/i.test(String(expected))) {
    fail(`asset census has an invalid model hash for ${file}`);
    continue;
  }
  for (const [kind, root] of [['source', PUBLIC], ['release', DIST]]) {
    const absolute = path.join(root, 'models', file);
    if (requireFile(absolute, `${kind} model ${file}`) && sha256(absolute, 12) !== expected) {
      fail(`${kind} model hash differs from census: ${file}`);
    }
  }
}

// The landing-page showroom is generated from content/mechs.json. Its data-mech
// ids are runtime URLs, not decoration: a stale pre-namespace id silently falls
// back to the still image while the page keeps returning 200. Bind every tile to
// the current vp_frame_shared_* namespace and require its hero LOD in the release.
const mechContent = readJson(path.join(ROOT, 'content', 'mechs.json'), 'mech content');
const expectedShowroomModels = Array.isArray(mechContent.mechs)
  ? mechContent.mechs.map((mech) => `vp_frame_shared_${mech.id}`).sort()
  : [];
if (!expectedShowroomModels.length) fail('mech content has no showroom chassis');
const releaseIndex = requireFile(path.join(DIST, 'index.html'), 'release index.html')
  ? fs.readFileSync(path.join(DIST, 'index.html'), 'utf8') : '';
const showroomModels = [...releaseIndex.matchAll(/\bdata-mech="([^"]+)"/g)]
  .map((match) => match[1]).sort();
compareSets('release showroom model ids vs mech content', expectedShowroomModels, showroomModels);
for (const id of expectedShowroomModels) {
  requireFile(path.join(DIST, 'models', `${id}.lod0.glb`), `showroom model ${id}.lod0.glb`);
}

const expectedTextures = Array.isArray(census.textureFiles) ? [...census.textureFiles].sort() : [];
const sourceTextures = listFiles(path.join(PUBLIC, 'textures'));
const releaseTextures = listFiles(path.join(DIST, 'textures'));
compareSets('source textures vs census', expectedTextures, sourceTextures);
compareSets('release textures vs census', expectedTextures, releaseTextures);
verifyByteParity(path.join(PUBLIC, 'textures'), path.join(DIST, 'textures'), expectedTextures, 'texture');

const entries = audioManifest.entries && typeof audioManifest.entries === 'object'
  ? audioManifest.entries : {};
const manifestFile = (entry) => (typeof entry === 'string' ? entry : entry?.file) ?? '';
const expectedVoiceKeys = Array.isArray(census.shippedVoiceKeys)
  ? [...census.shippedVoiceKeys].sort() : [];
const sourceVoiceKeys = [];
for (const [key, entry] of Object.entries(entries)) {
  if (!key.startsWith('vo.')) continue;
  const file = manifestFile(entry);
  const rel = safeManifestRelative(file, `audio manifest ${key}`);
  if (rel && fs.existsSync(path.join(PUBLIC, ...rel.split('/')))) sourceVoiceKeys.push(key);
}
compareSets('shipped voice census vs source files', expectedVoiceKeys, sourceVoiceKeys.sort());

for (const key of expectedVoiceKeys) {
  const entry = entries[key];
  const file = manifestFile(entry);
  const rel = safeManifestRelative(file, `audio manifest ${key}`);
  if (!rel) continue;
  if (!rel.startsWith('audio/')) {
    fail(`audio manifest ${key} does not point under /audio`);
    continue;
  }
  const source = path.join(PUBLIC, ...rel.split('/'));
  const release = path.join(DIST, ...rel.split('/'));
  if (!requireFile(source, `shipped voice source ${key}`)) continue;
  if (!requireFile(release, `shipped voice release ${key}`)) continue;
  if (sha256(source) !== sha256(release)) fail(`shipped voice changed during packaging: ${key}`);
}

let verifiedMasteredProvenance = 0;
const provenanceFiles = listFiles(PROVENANCE)
  .filter((file) => file.endsWith('-provenance.json'));
const manifestByBasename = new Map();
for (const [key, entry] of Object.entries(entries)) {
  const rel = normaliseReleasePath(manifestFile(entry));
  if (!rel) continue;
  const basename = path.posix.basename(rel, path.posix.extname(rel));
  const matches = manifestByBasename.get(basename) ?? [];
  matches.push({ key, rel });
  manifestByBasename.set(basename, matches);
}

for (const provenanceFile of provenanceFiles) {
  const absolute = path.join(PROVENANCE, ...provenanceFile.split('/'));
  const document = readJson(absolute, `audio provenance ${provenanceFile}`);
  const records = Array.isArray(document) ? document : [document];
  for (const [index, record] of records.entries()) {
    if (!record || typeof record !== 'object' || record.sha256_mastered == null) continue;
    const label = `audio provenance ${provenanceFile}[${index}]`;
    const expectedHash = String(record.sha256_mastered);
    if (!/^[a-f0-9]{64}$/i.test(expectedHash)) {
      fail(`${label} has an invalid sha256_mastered`);
      continue;
    }

    const candidates = new Map();
    for (const identifier of [record.key, record.asset_id]) {
      if (typeof identifier !== 'string' || !(identifier in entries)) continue;
      candidates.set(identifier, normaliseReleasePath(manifestFile(entries[identifier])));
    }
    if (typeof record.line_id === 'string') {
      for (const match of manifestByBasename.get(record.line_id) ?? []) {
        candidates.set(match.key, match.rel);
      }
    }
    for (const field of ['file', 'path', 'output', 'mastered_file']) {
      if (typeof record[field] === 'string') {
        candidates.set(`${field}:${record[field]}`, normaliseReleasePath(record[field]));
      }
    }

    const candidateFiles = [...new Set(candidates.values())].filter(Boolean);
    if (candidateFiles.length !== 1) {
      const identity = record.line_id ?? record.asset_id ?? record.key ?? `record ${index}`;
      fail(
        `${label} (${identity}) sha256_mastered maps to ${candidateFiles.length} manifest paths; `
        + 'provide one unambiguous mastered path',
      );
      continue;
    }

    const rel = safeManifestRelative(candidateFiles[0], label);
    if (!rel) continue;
    if (!rel.startsWith('audio/')) {
      fail(`${label} mastered path does not point under /audio: ${rel}`);
      continue;
    }
    const source = path.join(PUBLIC, ...rel.split('/'));
    const release = path.join(DIST, ...rel.split('/'));
    if (requireFile(source, `${label} mastered source ${rel}`)) {
      if (sha256(source) !== expectedHash) fail(`${label} mastered source hash differs: ${rel}`);
    }
    if (requireFile(release, `${label} mastered release ${rel}`)) {
      if (sha256(release) !== expectedHash) fail(`${label} mastered release hash differs: ${rel}`);
    }
    verifiedMasteredProvenance += 1;
  }
}

const sourceSiteFiles = listFiles(path.join(PUBLIC, 'site'))
  .filter((file) => !sourceOnlyReason(`site/${file}`));
const releaseSiteFiles = listFiles(path.join(DIST, 'site'));
compareSets('release site files vs shippable public/site', sourceSiteFiles, releaseSiteFiles);
verifyByteParity(path.join(PUBLIC, 'site'), path.join(DIST, 'site'), sourceSiteFiles, 'site asset');

for (const rel of ['_headers', 'robots.txt', 'favicon.svg']) {
  const source = path.join(PUBLIC, rel);
  const release = path.join(DIST, rel);
  if (!requireFile(source, `public/${rel}`) || !requireFile(release, `dist/${rel}`)) continue;
  if (sha256(source) !== sha256(release)) fail(`${rel} changed during packaging`);
}

const releaseFiles = listFiles(DIST);
if (releaseFiles.length > MAX_FILES) {
  fail(`Pages file limit exceeded: ${releaseFiles.length} > ${MAX_FILES}`);
}

let largest = { rel: '', size: 0 };
for (const rel of releaseFiles) {
  const absolute = path.join(DIST, ...rel.split('/'));
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) fail(`release contains a symbolic link: ${rel}`);
  if (!stat.isFile()) continue;
  if (stat.size > largest.size) largest = { rel, size: stat.size };
  if (stat.size > MAX_FILE_BYTES) {
    fail(`Pages 25 MiB file limit exceeded: ${rel} is ${(stat.size / 1024 / 1024).toFixed(2)} MiB`);
  }
  const reason = sourceOnlyReason(rel);
  if (reason) fail(`source-only file survived pruning: ${rel} (${reason})`);
}

const rawReferencePatterns = [
  /(?:^|["'`(])\/?(?:assets-source|assets\/tripo\/generated|masters?|site\/raw)(?:\/|["'`)]|$)/i,
  /\/audio\/[^"'`\s)]*\/_raw\//i,
  /\/audio\/[^"'`\s)]*(?:_|-)raw\.(?:mp3|wav)/i,
];
for (const rel of releaseFiles) {
  if (!TEXT_EXTENSIONS.has(path.extname(rel).toLowerCase())) continue;
  const body = fs.readFileSync(path.join(DIST, ...rel.split('/')), 'utf8');
  if (/%%FACT:[^%]*%%/.test(body)) fail(`unresolved site-truth token in ${rel}`);
  for (const pattern of rawReferencePatterns) {
    if (pattern.test(body)) {
      fail(`raw/source-only path reference in ${rel}: ${pattern}`);
      break;
    }
  }
}

const headersPath = path.join(DIST, '_headers');
let expectedInlineScriptHashes = [];
if (fs.existsSync(headersPath)) {
  const headers = fs.readFileSync(headersPath, 'utf8');
  const requiredHeaders = [
    /Content-Security-Policy:/,
    /\bconnect-src\b[^;\n]*\bblob:/i,
    /Cross-Origin-Opener-Policy:\s*same-origin/i,
    /Cross-Origin-Embedder-Policy:\s*require-corp/i,
    /Strict-Transport-Security:/i,
    /X-Content-Type-Options:\s*nosniff/i,
    /Referrer-Policy:/i,
    /\/assets\/\*/,
    /Cache-Control:\s*public,\s*max-age=31536000,\s*immutable/i,
  ];
  for (const pattern of requiredHeaders) {
    if (!pattern.test(headers)) fail(`dist/_headers is missing ${pattern}`);
  }
  const scriptSource = headers.match(/Content-Security-Policy:[^\n]*\bscript-src\s+([^;]+)/i)?.[1] ?? '';
  if (/'unsafe-inline'/i.test(scriptSource)) fail('dist/_headers script-src must not allow unsafe-inline');
  expectedInlineScriptHashes = inlineScriptHashes(path.join(DIST, 'index.html'));
  for (const hash of expectedInlineScriptHashes) {
    if (!scriptSource.includes(`'${hash}'`)) {
      fail(`dist/_headers script-src is missing the current index.html inline hash '${hash}'`);
    }
  }
}

if (errors.length) {
  console.error(`release verification FAILED (${errors.length} issue${errors.length === 1 ? '' : 's'}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('release verification passed');
console.log(`  files          ${releaseFiles.length}/${MAX_FILES}`);
console.log(`  largest file   ${(largest.size / 1024 / 1024).toFixed(2)} MiB  ${largest.rel}`);
console.log(`  model files    ${expectedModelFiles.length} (${derivedModelIds.length} asset ids)`);
console.log(`  texture files  ${expectedTextures.length}`);
console.log(`  shipped voices ${expectedVoiceKeys.length}`);
console.log(`  mastered hashes ${verifiedMasteredProvenance}`);
console.log(`  inline scripts ${expectedInlineScriptHashes.length}`);
console.log(`  site files     ${sourceSiteFiles.length}`);
