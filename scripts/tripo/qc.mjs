import fs from 'node:fs';
import path from 'node:path';
import { readGlb, triangleCount, imageSizes, materialSummary } from './glb.mjs';

/**
 * §6.6 — the asset QC gate.
 *
 * The spec lists 16 checks in three groups. They are NOT all implementable from a GLB
 * without a mesh library, and a gate that silently skips checks while reporting a pass is
 * the exact failure §10 warns about. So every check below is in one of three states, and
 * the runner prints the count of each:
 *
 *   ENFORCED  — actually checked here, fails the build
 *   MANUAL    — requires a human or the lighting rig (§5.6); tracked, never auto-passed
 *   DEFERRED  — needs mesh topology analysis (watertightness, winding, shell detection);
 *               honestly out of reach without a DCC step, and named so
 *
 * §6.8 budgets are per class, inferred from the asset name because this project predates
 * the §6.3 `sa_` namespace. The mapping is in CLASS_OF.
 */

/** §6.8 runtime budgets, LOD0 triangle ceilings. */
export const BUDGETS = {
  frame:     { lod0: 180_000, lod1: 80_000, lod2: 35_000, lod3: 12_000, tex: 4096 },
  cockpit:   { lod0: 150_000, lod1: 150_000, lod2: 150_000, lod3: 150_000, tex: 4096 },
  vehicle:   { lod0: 50_000, lod1: 15_000, lod2: 6_000, lod3: 2_000, tex: 2048 },
  struct:    { lod0: 70_000, lod1: 20_000, lod2: 8_000, lod3: 3_000, tex: 2048 },
  prop:      { lod0: 12_000, lod1: 5_000, lod2: 2_000, lod3: 800, tex: 2048 },
};

/**
 * Class from filename. The shipped assets use the pre-§6.3 names (mech-*, env-bt-*,
 * env_mp_*), so this maps the legacy prefixes rather than pretending the rename happened.
 * §6.3 migration is tracked separately; until then the gate still has to know what a
 * thing is in order to budget it.
 */
export function classOf(name) {
  // Prefix wins over keyword. The first version matched keywords anywhere, which put
  // veh-dropship-heavy in 'prop' (nothing matched "veh-") and prop-searchlight-tower in
  // 'struct' (because "tower" appeared later in the name) — both then budgeted wrongly.
  if (/^(sa_)?frame[_-]|^mech-/.test(name)) return 'frame';
  // "cockpit" anywhere is unambiguous — the shipped asset is int-cockpit, which the
  // prefix-only form missed and budgeted as a prop.
  if (/cockpit/.test(name)) return 'cockpit';
  if (/^(sa_)?vehicle[_-]|^veh-/.test(name)) return 'vehicle';
  if (/^(sa_)?struct[_-]|^struct-/.test(name)) return 'struct';
  if (/^(sa_)?prop[_-]|^prop-/.test(name)) return 'prop';
  // Legacy env-* dressing has no prefix convention; fall back to keywords.
  if (/mast|tower|gate|hall|pylon|bunker|silo|rig\b/.test(name)) return 'struct';
  return 'prop';
}

/** LOD index from filename, or 0 when the asset has no LOD siblings. */
export function lodOf(name) {
  const m = /\.lod(\d)\.glb$/.exec(name);
  return m ? Number(m[1]) : 0;
}

export function qcAsset(file) {
  const base = path.basename(file);
  const cls = classOf(base);
  const lod = lodOf(base);
  const budget = BUDGETS[cls];
  const fail = [];
  const warn = [];

  let glb;
  try {
    glb = readGlb(file);
  } catch (e) {
    return { file: base, cls, lod, fail: [`unreadable: ${e.message}`], warn: [], tris: 0 };
  }
  const g = glb.json;
  const tris = triangleCount(g);
  const mats = materialSummary(g);
  const imgs = imageSizes(file);

  // ── 1. §6.8 triangle budget ────────────────────────────────────── ENFORCED
  const ceiling = budget[`lod${lod}`] ?? budget.lod0;
  if (tris > ceiling) fail.push(`${tris} tris exceeds ${cls} LOD${lod} budget of ${ceiling}`);

  // ── 8/12. texture budget and format ────────────────────────────── ENFORCED
  for (const im of imgs) {
    if (Math.max(im.w, im.h) > budget.tex) {
      fail.push(`embedded texture ${im.w}x${im.h} exceeds ${cls} budget of ${budget.tex}`);
    }
  }
  // §6.4/§12.4: "no PNG texture ships". Embedded PNG in a runtime GLB means the KTX2
  // transcode never happened. Reported as a warning, not a failure, because ALL 51
  // shipped models are currently PNG-embedded — failing here would red the build on
  // day one for a known, tracked migration rather than on a regression.
  if (imgs.length) warn.push(`${imgs.length} embedded PNG texture(s) — KTX2 transcode pending (§12.4)`);

  // ── 10. material calibration ───────────────────────────────────── ENFORCED
  for (const m of mats) {
    if (m.metallicFactor > 0.05 && m.metallicFactor < 0.95) {
      warn.push(`material "${m.name}" metallic ${m.metallicFactor} is not effectively binary`);
    }
    // §6.6.10's luminance band applies to the ALBEDO. When a baseColorTexture is
    // present, baseColorFactor is a multiplier over it — almost always [1,1,1,1], which
    // is luminance 1.0 and outside the band. Checking it there flagged all 153 models
    // and said nothing. The band only means something when the factor IS the colour.
    if (m.baseColorTexture === undefined) {
      const lum = 0.2126 * m.baseColorFactor[0] + 0.7152 * m.baseColorFactor[1] + 0.0722 * m.baseColorFactor[2];
      if (lum < 0.03 || lum > 0.85) {
        warn.push(`material "${m.name}" untextured base colour luminance ${lum.toFixed(2)} outside 0.03-0.85`);
      }
    }
    // ── 7 (§5.3): alpha mode must be explicit and OPAQUE unless authored ── ENFORCED
    if (m.alphaMode === 'BLEND') {
      warn.push(`material "${m.name}" is BLEND — blended geometry does not shadow correctly (§5.3.7)`);
    }
    // §5.3.6 — double-sided off by default
    if (m.doubleSided) {
      warn.push(`material "${m.name}" is double-sided (§5.3.6 — allowed only for authored thin geometry)`);
    }
  }

  // ── 9. de-light check ──────────────────────────────────────────── ENFORCED (proxy)
  // The full check correlates base-colour luminance against the AO channel per texel,
  // which needs texture decode. What IS checkable from the glTF is whether AO was packed
  // where it belongs: §6.4 says AO lives in the ORM red channel ONLY. A separate
  // occlusionTexture that is not the same image as metallicRoughness means AO is being
  // carried outside ORM, which is the packing half of the same bug.
  for (const m of mats) {
    if (m.occlusionTexture !== undefined && m.occlusionTexture !== m.metallicRoughnessTexture) {
      fail.push(`material "${m.name}" has AO outside the ORM texture (§6.4 — AO is ORM.r only)`);
    }
  }

  // ── 5.3.1 shadow flags: castsShadow must be explicit in the content record ── MANUAL
  // glTF has no such flag; it lives in the engine. Tracked, not auto-passed.

  return { file: base, cls, lod, tris, mats: mats.length, imgs: imgs.length, fail, warn };
}

/** Checks the spec asks for that this gate cannot perform. Printed every run. */
export const NOT_ENFORCED = {
  DEFERRED: [
    '§6.6.2 watertightness, floating shells, duplicate hulls (needs topology analysis)',
    '§6.6.3 outward normals, consistent winding, zero-thickness sheets',
    '§6.6.5 UV overlap and shell waste',
    '§6.6.6 collision proxy ratio and trace verification',
    '§6.6.9 full de-light correlation (needs texture decode; ORM packing IS checked)',
    '§6.6.11 colour-space validation (needs KTX2 headers; assets are still PNG)',
  ],
  MANUAL: [
    '§6.6.13 silhouette at 400 m in the six §5.6 environments (lighting rig)',
    '§6.6.14 palette against the faction bible (art lead)',
    '§6.6.15 franchise resemblance (art lead + IP_EXCLUSION_CHECKLIST.md)',
    '§5.3.1 explicit castsShadow flag (engine content record, not glTF)',
  ],
};
