#!/usr/bin/env node
/**
 * BASIC TRAINING VO batch — content/vo/bt-lines.csv → public/audio/vo/bt/.
 *
 * Production discipline (docs/tutorial-design.md §8):
 *  - ONE voice: the campaign's pinned CAIRN cast (same resolution as
 *    gen_audio.mjs) so the synthetic instructor is identical everywhere.
 *  - eleven_multilingual_v2 at stability 0.90 / similarity 0.75 / style 0 /
 *    speaker_boost / speed 0.95 — the consistency configuration for dozens of
 *    tiny status lines. Fixed seed per line (from the CSV) for reproducible
 *    retakes; regenerate a flagged line by deleting its file (same seed).
 *  - No request-stitching (previous_text/next_text): lines play out of order.
 *  - No pronunciation dictionary needed: the line table contains no proper
 *    nouns by design (lint-enforced) — nothing to alias.
 *  - Creator tier → mp3_44100_192 from the API (PCM needs Pro), then decoded
 *    EXACTLY ONCE through ffmpeg into mastered WAV: -16 LUFS / -1 dBTP, edge
 *    silence trimmed to <= 60 ms. Ships dry — cockpit DSP happens in-engine.
 *  - Provenance: content/vo/bt-provenance.json (request id, seed, settings,
 *    sha256, model, voice) per the rights-tracking rules.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'audio', 'vo', 'bt');
const RAW = path.join(OUT, '_raw');
const CSV = path.join(ROOT, 'content', 'vo', 'bt-lines.csv');
const MANIFEST = path.join(ROOT, 'content', 'audio-manifest.json');
const PROVENANCE = path.join(ROOT, 'content', 'vo', 'bt-provenance.json');
fs.mkdirSync(RAW, { recursive: true });

let KEY = '';
try {
  const { loadEnv } = await import('./check_key.mjs');
  KEY = loadEnv().ELEVENLABS_API_KEY ?? '';
} catch { /* fall through */ }
if (!KEY) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.claude.json'), 'utf8'));
    KEY = cfg.mcpServers?.ElevenLabs?.env?.ELEVENLABS_API_KEY ?? '';
  } catch { /* fall through */ }
}
if (!KEY) { console.error('No ElevenLabs key found'); process.exit(1); }
const H = { 'xi-api-key': KEY, 'content-type': 'application/json' };

let FFMPEG = null;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); FFMPEG = 'ffmpeg'; } catch { /* none */ }
if (!FFMPEG) console.warn('ffmpeg not found — shipping un-mastered mp3 (rerun after installing ffmpeg)');

// pinned campaign cast: CAIRN = River (identical resolution to gen_audio.mjs)
const voicesRes = await fetch('https://api.elevenlabs.io/v1/voices', { headers: H });
const voices = (await voicesRes.json()).voices ?? [];
function pick(...names) {
  for (const n of names) {
    const v = voices.find((v) => v.name?.toLowerCase().split(' - ')[0].trim() === n.toLowerCase());
    if (v) return v.voice_id;
  }
  return voices[0]?.voice_id;
}
const VOICE = pick('River', 'Alice', 'Sarah');
const SETTINGS = { stability: 0.9, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true, speed: 0.95 };
console.log('CAIRN voice:', VOICE, '| settings:', JSON.stringify(SETTINGS));

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
const [header, ...rows] = parseCsv(fs.readFileSync(CSV, 'utf8'));
const col = Object.fromEntries(header.map((h, i) => [h, i]));

const TRIM = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.06,'
  + 'areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.06,areverse';

/** dynamic loudnorm misjudges 1–3 s clips — measure, then apply pure linear gain */
function measure(file) {
  const text = execFileSync('sh', ['-c',
    `"${FFMPEG}" -i "${file}" -af '${TRIM},loudnorm=print_format=summary' -f null - 2>&1 || true`]).toString();
  const i = /Input Integrated:\s*(-?[\d.]+)/.exec(text);
  const tp = /Input True Peak:\s*(-?[\d.]+)/.exec(text);
  return { i: i ? parseFloat(i[1]) : -16, tp: tp ? parseFloat(tp[1]) : -1 };
}

function master(rawMp3, outWav, targetLufs = -16) {
  // full linear gain to target, then a true-peak limiter holds -1 dBTP —
  // short lines have hot consonant peaks that a pure gain cap can't clear.
  // One correction pass compensates the loudness the limiter takes back.
  let gain = targetLufs - measure(rawMp3).i;
  for (let pass = 0; pass < 2; pass++) {
    execFileSync(FFMPEG, ['-y', '-i', rawMp3, '-af',
      `${TRIM},volume=${gain.toFixed(2)}dB,alimiter=limit=0.891251:attack=2:release=30:level=false`,
      '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', outWav], { stdio: 'ignore' });
    const got = measure(outWav).i;
    if (Math.abs(got - targetLufs) <= 0.8) break;
    gain += targetLufs - got;
  }
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
let provenance = [];
try { provenance = JSON.parse(fs.readFileSync(PROVENANCE, 'utf8')); } catch { /* fresh */ }
const provById = new Map(provenance.map((p) => [p.line_id, p]));

let ok = 0, skip = 0, fail = 0;
const failures = [];
const provReq = new Map(); // request ids from THIS run's fresh generations
for (const r of rows) {
  const id = r[col.line_id];
  const text = r[col.text_with_breaks];
  const seed = parseInt(r[col.seed], 10);
  const ext = FFMPEG ? 'wav' : 'mp3';
  const outFile = path.join(OUT, `${id}.${ext}`);
  const rawFile = path.join(RAW, `${id}.mp3`);
  manifest.entries[`vo.bt.${id}`] = `/audio/vo/bt/${id}.${ext}`;
  if (fs.existsSync(outFile)) { skip++; continue; }
  try {
    // an existing raw take re-masters without an API call (delete the raw for a true retake)
    if (!fs.existsSync(rawFile)) {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_192`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ model_id: 'eleven_multilingual_v2', text, voice_settings: SETTINGS, seed }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      fs.writeFileSync(rawFile, Buffer.from(await res.arrayBuffer()));
      provReq.set(id, res.headers.get('request-id') ?? res.headers.get('x-request-id') ?? null);
      await new Promise((r2) => setTimeout(r2, 350)); // Creator-tier concurrency headroom
    }
    const buf = fs.readFileSync(rawFile);
    if (FFMPEG) master(rawFile, outFile);
    else fs.copyFileSync(rawFile, outFile);
    provById.set(id, {
      line_id: id, text, seed, voice_id: VOICE, model_id: 'eleven_multilingual_v2',
      settings: SETTINGS, output_format: 'mp3_44100_192', mastered: !!FFMPEG,
      request_id: provReq.get(id) ?? provById.get(id)?.request_id ?? null,
      sha256_raw: crypto.createHash('sha256').update(buf).digest('hex'),
      generated_at: provById.get(id)?.generated_at ?? new Date().toISOString(),
      mastered_at: new Date().toISOString(),
    });
    console.log(`  vo ${id} (${(buf.length / 1024).toFixed(0)} kB raw → ${ext})`);
    ok++;
  } catch (e) {
    console.error(`  FAIL ${id}: ${e.message}`);
    fail++; failures.push(id);
  }
}

fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(PROVENANCE, `${JSON.stringify([...provById.values()], null, 2)}\n`);
console.log(`done: ${ok} generated, ${skip} skipped, ${fail} failed — manifest + provenance updated`);
if (failures.length) console.log('failures:', failures.join(', '));
process.exit(fail > 0 && ok === 0 ? 1 : 0);
