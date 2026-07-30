#!/usr/bin/env node
/**
 * Fast, asset-free guard for the hangar's generated-frame-only preview.
 *
 * The browser regression proves the full transition with real rendering, but
 * it belongs to the asset-backed CI tier. This guard runs on every push and
 * prevents the old procedural-first code path from being reintroduced.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'hangar.ts'), 'utf8');
const mechs = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'content', 'mechs.json'), 'utf8'),
).mechs;

let passed = 0;
const check = (condition, label) => {
  if (!condition) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
    return;
  }
  passed++;
  console.log(`✓ ${label}`);
};

check(mechs.length === 12, 'all 12 playable frames remain in scope');
check(!/\bnew\s+Mech\s*\(/.test(source), 'no procedural Mech constructor');
check(!/\bbuildMechVisual\b/.test(source), 'no procedural visual builder');
check(!/\bCOMPACT_PALETTE\b/.test(source), 'no procedural preview palette');
check(!/\bupgrade\s*\(/.test(source), 'no delayed procedural-to-generated upgrade');
check(
  source.includes("loadModel(`vp_frame_shared_${chassis}`, 'lod0')"),
  'every selected chassis loads its final generated LOD0',
);
check(
  source.includes("this.setPreviewState(chassis, 'loading', 'none'"),
  'loading begins with no rendered source',
);
check(
  source.includes("this.setPreviewState(chassis, 'ready', 'generated-lod0')"),
  'only generated LOD0 can enter the ready state',
);
check(
  source.includes("this.setPreviewState(chassis, 'unavailable', 'none'"),
  'failed loads remain neutral instead of falling back',
);
check(
  source.includes('#hangarscreen .turn canvas { width: 100%; height: 100%; display: block; visibility: hidden; }')
    && source.includes('#hangarscreen .turn[data-preview-state="ready"] canvas { visibility: visible; }'),
  'canvas stays hidden until generated-frame readiness',
);
check(
  /if \(this\.current\) this\.scene\.remove\(this\.current\);\s*this\.current = null;\s*this\.setPreviewState\(chassis, 'loading', 'none'/s.test(source),
  'switching frames clears the previous model before loading',
);
check(
  /const version = \+\+this\.loadVersion;[\s\S]*if \(version !== this\.loadVersion \|\| this\.chassis !== chassis\) return;/.test(source),
  'stale generated-frame requests cannot replace the current selection',
);

if (process.exitCode) {
  console.error(`\nHangar preview source guard failed (${passed}/12 checks passed)`);
} else {
  console.log(`\n${passed} hangar preview source checks passed`);
}
