#!/usr/bin/env node
/**
 * Remove generation intermediates and source-only files from the Vite output.
 *
 * Vite copies public/ verbatim. That is useful for the shipped binary trees, but
 * public/ also contains raw ElevenLabs takes and superseded capture masters that
 * must never become guessable production URLs. This pass is deliberately based on
 * paths, not mtimes, so the same source tree always produces the same release tree.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');

const SOURCE_ONLY_SEGMENTS = new Set([
  '_raw',
  'raw',
  'source',
  'sources',
  'source-only',
  'master',
  'masters',
  'provenance',
]);

const SOURCE_ONLY_EXTENSIONS = new Set([
  '.aep',
  '.aif',
  '.aiff',
  '.als',
  '.aup3',
  '.blend',
  '.blend1',
  '.fbx',
  '.flac',
  '.kra',
  '.logicx',
  '.ma',
  '.mb',
  '.mtl',
  '.obj',
  '.prproj',
  '.psb',
  '.psd',
  '.sesx',
  '.xcf',
]);

const LEGACY_SITE_FILES = new Set([
  'site/cockpit.jpg',
  'site/hero.jpg',
  'site/map-drill.jpg',
  'site/map-dunes.jpg',
  'site/map-flats.jpg',
]);

const OS_METADATA = new Set([
  '.ds_store',
  'desktop.ini',
  'thumbs.db',
]);

export function normaliseReleasePath(value) {
  return String(value).replaceAll(path.sep, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
}

/** Return the deterministic pruning reason, or null when a path is shippable. */
export function sourceOnlyReason(value) {
  const rel = normaliseReleasePath(value);
  const lower = rel.toLowerCase();
  const segments = lower.split('/').filter(Boolean);
  const base = segments.at(-1) ?? '';
  const ext = path.posix.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;

  if (!rel || rel.includes('\0')) return 'invalid path';
  if (segments.some((segment) => OS_METADATA.has(segment))) return 'operating-system metadata';
  if (base === '.assetsignore') return 'upload-tool source configuration';
  if (segments.some((segment) => SOURCE_ONLY_SEGMENTS.has(segment))) {
    return 'raw or source-only directory';
  }
  if (SOURCE_ONLY_EXTENSIONS.has(ext)) return 'source-authoring format';
  if (/(?:^|[_-])raw(?:[_-]|$)/.test(stem)) return 'raw generation intermediate';
  if (/(?:^|[_-])provenance(?:[_-]|$)/.test(stem)) return 'provenance sidecar';
  if (LEGACY_SITE_FILES.has(lower)) return 'superseded prototype art';
  return null;
}

export function listReleaseEntries(root) {
  const files = [];
  const directories = [];

  function visit(directory, prefix = '') {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        directories.push(rel);
        visit(absolute, rel);
      } else {
        files.push(rel);
      }
    }
  }

  visit(root);
  return { files, directories };
}

export function pruneRelease(dist) {
  const releaseRoot = path.resolve(dist);
  const relative = path.relative(ROOT, releaseRoot);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`[release:prune] refusing to prune outside the project: ${releaseRoot}`);
  }
  if (!fs.existsSync(path.join(releaseRoot, 'index.html'))) {
    throw new Error(`[release:prune] ${relative}/index.html is missing; run the production build first`);
  }

  const { files, directories } = listReleaseEntries(releaseRoot);
  const removedByReason = new Map();
  let removedFiles = 0;
  let removedBytes = 0;

  for (const rel of files) {
    const reason = sourceOnlyReason(rel);
    if (!reason) continue;
    const absolute = path.join(releaseRoot, ...rel.split('/'));
    const stat = fs.lstatSync(absolute);
    fs.rmSync(absolute, { force: true });
    removedFiles += 1;
    removedBytes += stat.size;
    removedByReason.set(reason, (removedByReason.get(reason) ?? 0) + 1);
  }

  for (const rel of directories.sort((a, b) => b.length - a.length || b.localeCompare(a))) {
    const absolute = path.join(releaseRoot, ...rel.split('/'));
    if (fs.existsSync(absolute) && fs.readdirSync(absolute).length === 0) fs.rmdirSync(absolute);
  }

  const remaining = listReleaseEntries(releaseRoot).files.length;
  console.log(
    `[release:prune] removed ${removedFiles} source-only file(s) `
    + `(${(removedBytes / 1024 / 1024).toFixed(2)} MiB); ${remaining} release file(s) remain`,
  );
  for (const [reason, count] of [...removedByReason].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${String(count).padStart(4)}  ${reason}`);
  }
}

function main() {
  const dist = path.resolve(ROOT, process.argv[2] ?? 'dist');
  pruneRelease(dist);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
