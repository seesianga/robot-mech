#!/usr/bin/env node
/**
 * Music batch for the adaptive score (docs/audio-bible.md §6).
 * Source of truth: content/audio-plan.json `music` entries — id, prompt,
 * lengthSeconds, bpm, loop, file. Output: public/audio/music/<id>.mp3 at
 * MP3 CBR 192 kbps / 44.1 kHz (output_format=mp3_44100_192, bible §1.5).
 * Manifest keys: music.<id>. Provenance: content/music-provenance.json.
 * Idempotent: existing files are skipped (manifest entries always ensured).
 *
 * Each cue is one Eleven Music call at full length (all cues ≤210 s; the
 * known-bad case is ≥300 s composition plans). On a 5xx the cue falls back
 * to ≤48 s segments stitched with a 1 s acrossfade — same key/tempo/palette
 * is restated in the continuation prompts, seams land on bar boundaries
 * where a BPM is defined. Usage is polled after every cue and the run stops
 * before a cue whose projected cost exceeds the credits left on the plan.
 *
 * Flags: --only id,id   --dry   --skip-usage-guard
 */
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'audio', 'music');
const MANIFEST = path.join(ROOT, 'content', 'audio-manifest.json');
const PROVENANCE = path.join(ROOT, 'content', 'music-provenance.json');
fs.mkdirSync(OUT, { recursive: true });

const ONLY = (() => {
  const i = process.argv.indexOf('--only');
  return i >= 0 ? new Set(process.argv[i + 1].split(',')) : null;
})();
const DRY = process.argv.includes('--dry');
const NO_GUARD = process.argv.includes('--skip-usage-guard');

const { loadEnv } = await import('./check_key.mjs');
const KEY = loadEnv().ELEVENLABS_API_KEY ?? '';
if (!KEY) { console.error('No ElevenLabs key found'); process.exit(1); }

// Shared style suffix (score bible): keeps the 17 cues reading as one game
// and enforces instrumental-only, original-composition output.
const SUFFIX_LOOP =
  ' — original instrumental hybrid-orchestral score for a military science-fiction' +
  ' walker-combat game, dark modern cinematic production, wide stereo image, no vocals,' +
  ' no choir, no lyrics, no trailer clichés, no imitation of any existing game or film' +
  ' soundtrack, mixed with headroom for radio dialogue and weapon effects, ending on a' +
  ' clean loop-ready tail';
const SUFFIX_DRY = SUFFIX_LOOP.replace(
  'ending on a clean loop-ready tail',
  'dry ending with no reverb tail past the cutoff',
);

const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'audio-plan.json'), 'utf8'));
// Cheapest/most-used first so a credit shortfall costs the least important cues.
const PRIORITY = [
  'sting_complete', 'sting_failed', 'sting_duel_start', 'sting_ekene_down',
  'mus_combat_l1', 'mus_combat_l2', 'mus_combat_l3',
  'mus_biome_coast', 'mus_biome_salt', 'mus_biome_karst', 'mus_biome_polar', 'mus_biome_arcology',
  'theme_main', 'mus_ending_21a', 'mus_ending_21b',
  'mus_duel_rauk', 'mus_duel_sol',
];
const byId = new Map(plan.music.map((e) => [e.id, e]));
const cues = PRIORITY.filter((id) => byId.has(id)).map((id) => byId.get(id))
  .concat(plan.music.filter((e) => !PRIORITY.includes(e.id)));

async function usage() {
  const r = await fetch('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': KEY } });
  if (!r.ok) return null;
  const u = await r.json();
  return { used: u.subscription.character_count, limit: u.subscription.character_limit };
}

/** One Eleven Music render via curl (renders can outlive fetch's 5-min header timeout). */
function render(prompt, ms, outFile) {
  const body = path.join(os.tmpdir(), `elmus_${crypto.randomUUID()}.json`);
  fs.writeFileSync(body, JSON.stringify({
    prompt, music_length_ms: Math.max(3000, Math.round(ms)),
    model_id: 'music_v2', force_instrumental: true,
  }));
  try {
    const code = execFileSync('curl', [
      '-sS', '-X', 'POST',
      'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192',
      '-H', `xi-api-key: ${KEY}`, '-H', 'content-type: application/json',
      '-d', `@${body}`, '-o', outFile, '--max-time', '900', '-w', '%{http_code}',
    ], { encoding: 'utf8' }).trim();
    if (code !== '200') {
      const detail = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').slice(0, 200) : '';
      fs.rmSync(outFile, { force: true });
      const err = new Error(`HTTP ${code} ${detail}`);
      err.status = Number(code);
      throw err;
    }
  } finally { fs.rmSync(body, { force: true }); }
}

function durationOf(file) {
  try {
    return Number(execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
    ], { encoding: 'utf8' }).trim());
  } catch { return NaN; }
}

/** 5xx fallback: ≤48 s bar-aligned segments stitched with a 1 s acrossfade. */
function renderSegmented(cue, suffix, outFile) {
  const total = cue.lengthSeconds;
  const bar = cue.bpm ? (60 / cue.bpm) * 4 : null;
  let seg = bar ? Math.floor(48 / bar) * bar : 45;
  const n = Math.ceil(total / seg);
  seg = total / n; // equalize so the last segment isn't a stub
  if (bar) seg = Math.round(seg / bar) * bar;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const part = path.join(os.tmpdir(), `elmus_${cue.id}_${i}.mp3`);
    const cont = i === 0 ? '' :
      ` (seamless continuation of the same piece, section ${i + 1} of ${n}: identical tempo, key, and instrumentation, no intro, continues mid-flow)`;
    render(cue.prompt + cont + suffix, seg * 1000 + (i < n - 1 ? 1000 : 0), part);
    parts.push(part);
  }
  const inputs = parts.flatMap((p) => ['-i', p]);
  let filter = '';
  for (let i = 1; i < parts.length; i++) {
    const outLbl = i === parts.length - 1 ? '[out]' : `[x${i}]`;
    filter += `${i === 1 ? '[0:a]' : `[x${i - 1}]`}[${i}:a]acrossfade=d=1${outLbl};`;
  }
  execFileSync('ffmpeg', [
    '-y', ...inputs, '-filter_complex', filter.replace(/;$/, ''),
    '-map', '[out]', '-codec:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', outFile,
  ], { stdio: 'ignore' });
  for (const p of parts) fs.rmSync(p, { force: true });
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const provenance = fs.existsSync(PROVENANCE) ? JSON.parse(fs.readFileSync(PROVENANCE, 'utf8')) : [];
let ok = 0, skip = 0, fail = 0, halted = false;
const failures = [];
let costPerSec = null; // learned from the first completed cue

let u = await usage();
console.log(`credits: ${u ? `${u.used}/${u.limit} used, ${u.limit - u.used} left` : 'unknown'}`);

for (const cue of cues) {
  if (ONLY && !ONLY.has(cue.id)) continue;
  const outFile = path.join(OUT, `${cue.id}.mp3`);
  manifest.entries[`music.${cue.id}`] = `/audio/music/${cue.id}.mp3`;
  if (fs.existsSync(outFile)) { skip++; continue; }
  if (DRY) { console.log(`would render ${cue.id} (${cue.lengthSeconds}s)`); continue; }
  if (!NO_GUARD && costPerSec && u) {
    const projected = cue.lengthSeconds * costPerSec * 1.15;
    if (u.used + projected > u.limit) {
      console.log(`HALT before ${cue.id}: projected ~${Math.round(projected)} credits > ${u.limit - u.used} left`);
      halted = true;
      break;
    }
  }
  const suffix = cue.id.startsWith('sting_') ? SUFFIX_DRY : SUFFIX_LOOP;
  const t0 = Date.now();
  try {
    try {
      render(cue.prompt + suffix, cue.lengthSeconds * 1000, outFile);
    } catch (e) {
      if (e.status >= 500 && cue.lengthSeconds > 50) {
        console.log(`  ${cue.id}: HTTP ${e.status} at full length — falling back to segments`);
        renderSegmented(cue, suffix, outFile);
      } else throw e;
    }
    const dur = durationOf(outFile);
    if (!(dur > cue.lengthSeconds * 0.5)) throw new Error(`bad duration ${dur}s for ${cue.lengthSeconds}s cue`);
    const buf = fs.readFileSync(outFile);
    const u2 = await usage();
    const spent = u2 && u ? u2.used - u.used : null;
    if (spent && !costPerSec) costPerSec = spent / cue.lengthSeconds;
    u = u2 ?? u;
    provenance.push({
      key: `music.${cue.id}`, prompt_source: 'content/audio-plan.json',
      model_id: 'music_v2', output_format: 'mp3_44100_192',
      length_requested_s: cue.lengthSeconds, length_actual_s: Math.round(durationOf(outFile) * 10) / 10,
      credits_spent: spent, sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      generated_at: new Date().toISOString(),
    });
    ok++;
    console.log(`  ${cue.id}: ${Math.round(dur)}s in ${Math.round((Date.now() - t0) / 1000)}s${spent ? `, ${spent} credits (${u.limit - u.used} left)` : ''}`);
    await new Promise((r) => setTimeout(r, 500));
  } catch (e) {
    fail++;
    fs.rmSync(outFile, { force: true });
    failures.push(`${cue.id}: ${String(e.message).slice(0, 200)}`);
    if (e.status === 401 || e.status === 402) { halted = true; break; }
  }
}

fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(PROVENANCE, `${JSON.stringify(provenance, null, 2)}\n`);
console.log(`\ndone: ${ok} generated, ${skip} skipped, ${fail} failed${halted ? ' (halted early)' : ''}`);
for (const f of failures) console.log('  FAIL', f);
process.exit(fail > 0 && ok === 0 ? 1 : 0);
