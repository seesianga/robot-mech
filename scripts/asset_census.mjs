import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

/**
 * A committed census of the shipped asset trees.
 *
 * Why this exists: scripts/vite-site-truth.mjs derives three of the landing page's
 * numbers — models, machines modelled, texture sets, and the count of voice lines
 * that actually shipped — by scanning public/models, public/textures and public/audio
 * on disk. That is the correct design and it is what caught "607 recorded lines"
 * overstating the build by ten. But public/ is Drive-only (400 MB, git-lfs is not
 * installed here), so a fresh CI checkout has no assets and the build died with
 * ENOENT before it could render anything.
 *
 * The fix is not to let the plugin tolerate missing assets — that would defeat the one
 * thing it exists to do — and not to stub the directories, which would ship false
 * claims. Instead the scan result is committed as content/asset-census.json, and the
 * plugin re-derives that census from the filesystem on every build that HAS the assets
 * and fails on any drift. So:
 *
 *   build with assets (local, asset runner) → census verified against reality
 *   build without assets (GitHub CI)        → census used as-is, and it can only have
 *                                             got there via a build that had them
 *
 * The numbers therefore still cannot exceed reality. The residual risk is someone
 * hand-editing this file to inflate a number and pushing it; the next build on a
 * machine with assets fails loudly. That is a smaller hole than "CI cannot build".
 *
 * Counts are never stored — only the underlying lists — so a count can never disagree
 * with the thing it counts.
 */

export const CENSUS_PATH = 'content/asset-census.json';

/** True when the Drive-only asset trees are present in this checkout. */
export function assetsPresent(root) {
  return ['models', 'textures'].every((d) => fs.existsSync(path.join(root, 'public', d)));
}

/**
 * Derive the census from the filesystem. This is the ONLY place the shapes are
 * defined; vite-site-truth.mjs consumes the result rather than scanning again, so the
 * two can never drift apart in the way the counts themselves used to.
 */
export function scanAssets(root) {
  // Models: LOD siblings collapse to one id. Every file is <id>.lod<N>.glb.
  const modelIds = new Set(
    fs.readdirSync(path.join(root, 'public', 'models'))
      .filter((f) => f.endsWith('.glb'))
      .map((f) => f.replace(/\.lod\d\.glb$/, '')),
  );

  const textureFiles = fs.readdirSync(path.join(root, 'public', 'textures'))
    .filter((f) => f.endsWith('.webp'));

  // Voice lines that SHIPPED, not lines the manifest declares.
  const entries = JSON.parse(
    fs.readFileSync(path.join(root, 'content', 'audio-manifest.json'), 'utf8'),
  ).entries;
  const shippedVoiceKeys = Object.keys(entries).filter((k) => {
    if (!k.startsWith('vo.')) return false;
    const e = entries[k];
    const file = (typeof e === 'string' ? e : e?.file) ?? '';
    return Boolean(file) && fs.existsSync(path.join(root, 'public', file.replace(/^\//, '')));
  });

  // Content hashes — the only record git has of what the binaries actually ARE.
  //
  // public/models is gitignored (400 MB, Drive-only), so rebuilding every shipped
  // asset produces an EMPTY COMMIT. That happened: 39 objective structures were
  // rebuilt from prop budgets to struct budgets, changing 13 MB of shipped geometry,
  // and `git status` said "working tree clean". The id list could not see it — ids do
  // not change when the bytes do — and neither could the QC baseline, which records
  // which models fail rather than what they contain.
  //
  // Hashing the files fixes that for ~12 KB of JSON and no binary in the repo: a
  // rebuild now shows up as a diff in this file, so the commit history records that
  // the assets moved even though it cannot record the assets.
  //
  // Truncated to 12 hex chars. This is a change-detector, not a security boundary —
  // 48 bits is far past collision risk for 153 files, and a full hash triples the
  // size of the noisiest part of the diff.
  const modelHashes = {};
  for (const f of fs.readdirSync(path.join(root, 'public', 'models')).sort()) {
    if (!f.endsWith('.glb')) continue;
    modelHashes[f] = createHash('sha256')
      .update(fs.readFileSync(path.join(root, 'public', 'models', f)))
      .digest('hex').slice(0, 12);
  }

  return {
    models: [...modelIds].sort(),
    textureFiles: textureFiles.sort(),
    shippedVoiceKeys: shippedVoiceKeys.sort(),
    modelHashes,
  };
}

export function readCensus(root) {
  const p = path.join(root, CENSUS_PATH);
  if (!fs.existsSync(p)) {
    throw new Error(
      `[asset-census] ${CENSUS_PATH} is missing. Run \`npm run assetcensus\` on a machine `
      + `that has the asset trees.`,
    );
  }
  const c = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const k of ['models', 'textureFiles', 'shippedVoiceKeys']) {
    if (!Array.isArray(c[k])) throw new Error(`[asset-census] ${CENSUS_PATH}: "${k}" must be an array`);
  }
  // Required, not optional. An absent hash map would silently restore the old
  // behaviour where a full asset rebuild is invisible — the bug this key exists to
  // close. Better to fail and be regenerated than to degrade quietly.
  if (!c.modelHashes || typeof c.modelHashes !== 'object') {
    throw new Error(
      `[asset-census] ${CENSUS_PATH}: "modelHashes" is missing. Regenerate with `
      + '`npm run assetcensus` on a machine that has the asset trees.',
    );
  }
  return c;
}

export function writeCensus(root, census) {
  const body = {
    $comment: 'GENERATED by scripts/asset_census.mjs — do not hand-edit. See that file for why.',
    ...census,
  };
  fs.writeFileSync(path.join(root, CENSUS_PATH), `${JSON.stringify(body, null, 2)}\n`);
}

/** Human-readable drift, most useful first. Empty array means identical. */
export function diffCensus(committed, actual) {
  const out = [];
  for (const key of ['models', 'textureFiles', 'shippedVoiceKeys']) {
    const was = new Set(committed[key] ?? []);
    const now = new Set(actual[key] ?? []);
    const added = [...now].filter((x) => !was.has(x));
    const removed = [...was].filter((x) => !now.has(x));
    if (added.length || removed.length) {
      out.push(
        `${key}: ${was.size} committed vs ${now.size} on disk`
        + (added.length ? `\n    + ${added.slice(0, 8).join(', ')}${added.length > 8 ? ` (+${added.length - 8} more)` : ''}` : '')
        + (removed.length ? `\n    - ${removed.slice(0, 8).join(', ')}${removed.length > 8 ? ` (+${removed.length - 8} more)` : ''}` : ''),
      );
    }
  }

  // Content drift: same files, different bytes. This is the case the id lists cannot
  // see, and the reason a 13 MB rebuild of 39 shipped structures committed as nothing.
  const was = committed.modelHashes ?? {};
  const now = actual.modelHashes ?? {};
  const changed = Object.keys(now).filter((f) => f in was && was[f] !== now[f]);
  if (changed.length) {
    out.push(
      `modelHashes: ${changed.length} file(s) rebuilt (same name, different bytes)`
      + `\n    ~ ${changed.slice(0, 8).join(', ')}${changed.length > 8 ? ` (+${changed.length - 8} more)` : ''}`,
    );
  }
  return out;
}

/**
 * What the build uses. Verifies against the filesystem wherever that is possible,
 * and falls back to the committed census only when the assets genuinely are absent.
 */
export function censusForBuild(root, { log = console.log } = {}) {
  const committed = readCensus(root);
  if (!assetsPresent(root)) {
    log(
      `[asset-census] assets not in this checkout — building from ${CENSUS_PATH} `
      + `(${committed.models.length} models, ${committed.shippedVoiceKeys.length} voice lines). `
      + `Numbers were verified on the build that wrote it.`,
    );
    return committed;
  }
  const actual = scanAssets(root);
  const drift = diffCensus(committed, actual);
  if (drift.length) {
    throw new Error(
      `[asset-census] ${CENSUS_PATH} does not match the assets on disk:\n  `
      + `${drift.join('\n  ')}\n\n`
      + `  The landing page's numbers come from this file, so a stale census means the\n`
      + `  page would state something the build cannot back up. Refresh it with:\n`
      + `      npm run assetcensus\n`,
    );
  }
  return actual;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// node scripts/asset_census.mjs            verify census against the filesystem
// node scripts/asset_census.mjs --write    regenerate it from the filesystem
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const write = process.argv.includes('--write');

  if (!assetsPresent(root)) {
    console.error(
      '[asset-census] public/models and public/textures are not in this checkout.\n'
      + '  This command reads the real assets, so it only runs where they exist —\n'
      + '  the working tree created by ops/scripts/bootstrap.sh, or an asset runner.',
    );
    process.exit(2);
  }

  const actual = scanAssets(root);
  if (write) {
    writeCensus(root, actual);
    console.log(
      `wrote ${CENSUS_PATH}: ${actual.models.length} models, `
      + `${actual.textureFiles.length} texture maps, ${actual.shippedVoiceKeys.length} voice lines`,
    );
    process.exit(0);
  }

  const drift = diffCensus(readCensus(root), actual);
  if (drift.length) {
    console.error(`asset census is STALE:\n  ${drift.join('\n  ')}\n\nRun: npm run assetcensus`);
    process.exit(1);
  }
  console.log(
    `asset census matches disk: ${actual.models.length} models, `
    + `${actual.textureFiles.length} texture maps, ${actual.shippedVoiceKeys.length} voice lines`,
  );
}
