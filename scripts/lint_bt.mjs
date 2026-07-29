#!/usr/bin/env node
/**
 * BASIC TRAINING content lint (CI gate).
 *
 *  1. Every step prompt contains >= 1 {bind:...} token — a prompt with no key
 *     on screen is a broken step by definition.
 *  2. Every {bind:...} token in every tut.bt.* string references a real action
 *     ID in content/tutorial/bindings.json.
 *  3. Forbidden-word list across tut.bt.* strings: no NAV, objective, mission,
 *     enemy forces, or character names — keeps edits from drifting back into
 *     campaign voice.
 *  4. Every prompt_key / caption_key / checklist label_key resolves in
 *     strings.en.json; hint/ok VO string keys exist where a VO id is declared.
 *  5. VO discipline: bt-lines.csv rows are <= 8 words (breaks stripped), never
 *     contain a key/button name or a {bind:} token, and map 1:1 onto the
 *     steps' confirm_vo/hint_vo ids AND onto subtitle strings (same text).
 *  6. Audio manifest/file check: every vo_bt_* / ui.bt.* / amb.bt.* asset has
 *     a manifest entry and a file on disk (missing files are warnings until
 *     the batch has been generated; pass --audio to make them errors).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STRICT_AUDIO = process.argv.includes('--audio');

const bindings = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/tutorial/bindings.json'), 'utf8')).actions;
const strings = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/tutorial/strings.en.json'), 'utf8'));
const content = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/tutorial/basic_training.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/audio-manifest.json'), 'utf8')).entries;
// PATHLIGHT guidance strings — token rules apply; voice rules don't (see below)
let navStrings = {};
try { navStrings = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/nav/strings.en.json'), 'utf8')); } catch { /* no nav pack */ }

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// ---------- CSV ----------
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; if (row.some((f) => f !== '')) rows.push(row); row = []; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f !== '')) rows.push(row); }
  return rows;
}
const [csvHeader, ...csvRows] = parseCsv(fs.readFileSync(path.join(ROOT, 'content/vo/bt-lines.csv'), 'utf8'));
const col = Object.fromEntries(csvHeader.map((h, i) => [h, i]));
const csvById = new Map(csvRows.map((r) => [r[col.line_id], r]));

const stripBreaks = (s) => s.replace(/<break[^>]*\/>/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- rule 3: forbidden words ----------
const FORBIDDEN = [
  /\bNAV\b/, /\bobjective/i, /\bmission/i, /enemy forces/i,
  /\bEkene\b/i, /\bRelay\b/i, /\bLodestar\b/i, /\bAmara\b/i, /\bMIRA\b/i, /\bCAIRN\b/i,
  /\bCompact\b/, /\bDirectorate\b/, /\bKryce\b/i, /\bVeyra\b/i, /\bSaltglass\b/i,
];

// The hud.nav.* namespace (PATHLIGHT guidance chrome) is EXEMPT from the
// forbidden-word rule by design — guidance labels legitimately say things the
// tutorial voice must not. The exemption is explicit and scoped: token
// well-formedness (rule 2) still applies to both namespaces; rule 3 stays
// tut.bt.-only and is not weakened.
for (const [key, val] of Object.entries({ ...strings, ...navStrings })) {
  const isBt = key.startsWith('tut.bt.');
  const isNav = key.startsWith('hud.nav.');
  if (!isBt && !isNav) continue;
  if (isBt) {
    for (const rx of FORBIDDEN) {
      if (rx.test(val)) err(`forbidden word ${rx} in ${key}: "${val}"`);
    }
  }
  // rule 2: tokens reference real action IDs — and every "{bind" opener must
  // be a well-formed token (a malformed one would render literally on screen)
  const wellFormed = [...val.matchAll(/\{bind:([a-z0-9_]+)\}/g)];
  for (const m of wellFormed) {
    if (!bindings[m[1]]) err(`unknown action "{bind:${m[1]}}" in ${key}`);
  }
  const openers = (val.match(/\{bind/g) ?? []).length;
  if (openers !== wellFormed.length) err(`malformed {bind:...} token in ${key}: "${val}"`);
}

// ---------- rules 1, 4, 5 per step ----------
const need = (key, where) => {
  if (typeof strings[key] !== 'string') err(`missing string key ${key} (${where})`);
  return strings[key] ?? '';
};

const voIdsInSteps = new Set();
for (const st of content.steps) {
  const prompt = need(st.prompt_key, st.id);
  if (!/\{bind:[a-z0-9_]+\}/.test(prompt)) {
    err(`step ${st.id}: prompt has NO {bind:...} token — every step must name its key on screen`);
  }
  if (st.caption_key) need(st.caption_key, st.id);
  for (const c of st.checklist ?? []) need(c.label_key, `${st.id} checklist`);

  const short = st.id.replace(/^bt_/, '');
  for (const [voField, kind] of [['confirm_vo', 'ok'], ['hint_vo', 'hint1'], ['prompt_vo', 'prompt_vo']]) {
    const voId = st[voField];
    if (!voId) continue;
    voIdsInSteps.add(voId);
    const textKey = `tut.bt.${short}.${kind}`;
    const sub = need(textKey, `${st.id} ${voField}`);
    const row = csvById.get(voId);
    if (!row) { err(`step ${st.id}: ${voField} "${voId}" has no row in bt-lines.csv`); continue; }
    const voText = stripBreaks(row[col.text_with_breaks]);
    if (voText !== sub) err(`VO/subtitle mismatch for ${voId}:\n    csv: "${voText}"\n    str: "${sub}"`);
  }
}

// ---------- rule 5: VO discipline on every CSV row ----------
for (const r of csvRows) {
  const id = r[col.line_id];
  const text = stripBreaks(r[col.text_with_breaks]);
  const words = text.replace(/[^\w'\s]/g, '').split(/\s+/).filter(Boolean);
  if (words.length > 8) err(`VO ${id}: ${words.length} words (max 8): "${text}"`);
  if (/\{bind/.test(text)) err(`VO ${id}: contains a {bind} token — VO never speaks key names`);
  // rebind-safety: no VO line may name a bound key. Multi-char labels
  // (ENTER, SPACE, F8, RIGHT-CLICK…) are banned anywhere; single-char labels
  // only when framed as a key ("press F"), since "a" is also an article.
  // MOUSE is exempt — "mouse" as a device word isn't a rebindable key name.
  for (const b of Object.values(bindings)) {
    if (!b.label || b.label === 'MOUSE') continue;
    const esc = b.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = b.label.length > 1
      ? new RegExp(`\\b${esc}\\b`, 'i')
      : new RegExp(`\\b(press|hold|tap|key)\\s+${esc}\\b`, 'i');
    if (rx.test(text)) err(`VO ${id}: names the key "${b.label}": "${text}"`);
  }
  for (const rx of FORBIDDEN) if (rx.test(text)) err(`VO ${id}: forbidden word ${rx}: "${text}"`);
  if (!voIdsInSteps.has(id)) warn(`VO ${id}: not referenced by any step (banked line?)`);
  if (!/^\d+$/.test(r[col.seed] ?? '')) err(`VO ${id}: missing fixed seed`);
}

// ---------- rule 6: audio manifest + files ----------
const audioProblem = STRICT_AUDIO ? err : warn;
for (const voId of voIdsInSteps) {
  const key = `vo.bt.${voId}`;
  if (!manifest[key]) { audioProblem(`manifest missing ${key}`); continue; }
  const f = path.join(ROOT, 'public', manifest[key].replace(/^\//, ''));
  if (!fs.existsSync(f)) audioProblem(`audio file missing for ${key}: ${manifest[key]}`);
}
for (const key of ['ui.bt.confirm', 'ui.bt.hint', 'ui.bt.phase', 'amb.bt.pad']) {
  if (!manifest[key]) { audioProblem(`manifest missing ${key}`); continue; }
  const f = path.join(ROOT, 'public', manifest[key].replace(/^\//, ''));
  if (!fs.existsSync(f)) audioProblem(`audio file missing for ${key}: ${manifest[key]}`);
}

// ---------- report ----------
for (const w of warnings) console.log(`  warn: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`  FAIL: ${e}`);
  console.error(`\nbt lint: ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}
console.log(`bt lint: OK — ${content.steps.length} steps, ${csvRows.length} VO lines, ${warnings.length} warning(s)`);
