#!/usr/bin/env node
/**
 * PATHLIGHT audio batch — content/vo/nav-lines.csv → public/audio/vo/nav/
 * plus the ui.nav.ping beacon blip via sound-generation.
 *
 * Same production discipline as gen_bt_audio.mjs: the pinned CAIRN cast
 * (River), eleven_multilingual_v2 at stability 0.90 / similarity 0.75 /
 * style 0 / speaker_boost / speed 0.95, fixed seed per line (53001+ block),
 * no request-stitching, mp3_44100_192 raw → ffmpeg-mastered −16 LUFS WAV,
 * provenance in content/vo/nav-provenance.json.
 *
 * The game is fully wired BEFORE this runs: missing files play silent with
 * subtitles (vo) or fall back to the synthesized ping (ui.nav.ping) — run
 * this whenever the ElevenLabs key is live to bake the real assets.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'audio', 'vo', 'nav');
const RAW = path.join(OUT, '_raw');
const UI_OUT = path.join(ROOT, 'public', 'audio', 'ui');
const CSV = path.join(ROOT, 'content', 'vo', 'nav-lines.csv');
const MANIFEST = path.join(ROOT, 'content', 'audio-manifest.json');
const PROVENANCE = path.join(ROOT, 'content', 'vo', 'nav-provenance.json');
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(UI_OUT, { recursive: true });

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
if (!KEY) { console.error('No ElevenLabs key found — nav audio stays in wired-silent mode'); process.exit(1); }
const H = { 'xi-api-key': KEY, 'content-type': 'application/json' };

let FFMPEG = null;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); FFMPEG = 'ffmpeg'; } catch { /* none */ }
if (!FFMPEG) console.warn('ffmpeg not found — shipping un-mastered mp3');

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
console.log('CAIRN voice:', VOICE);

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

function measure(file) {
  const text = execFileSync('sh', ['-c',
    `"${FFMPEG}" -i "${file}" -af '${TRIM},loudnorm=print_format=summary' -f null - 2>&1 || true`]).toString();
  const i = /Input Integrated:\s*(-?[\d.]+)/.exec(text);
  return { i: i ? parseFloat(i[1]) : -16 };
}

function master(rawMp3, outWav, targetLufs = -16) {
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
for (const r of rows) {
  const id = r[col.line_id];
  const text = r[col.text_with_breaks];
  const seed = parseInt(r[col.seed], 10);
  const ext = FFMPEG ? 'wav' : 'mp3';
  const outFile = path.join(OUT, `${id}.${ext}`);
  const rawFile = path.join(RAW, `${id}.mp3`);
  manifest.entries[`vo.nav.${id}`] = `/audio/vo/nav/${id}.${ext}`;
  if (fs.existsSync(outFile)) { skip++; continue; }
  try {
    if (!fs.existsSync(rawFile)) {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_192`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ model_id: 'eleven_multilingual_v2', text, voice_settings: SETTINGS, seed }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      fs.writeFileSync(rawFile, Buffer.from(await res.arrayBuffer()));
      await new Promise((r2) => setTimeout(r2, 350));
    }
    const buf = fs.readFileSync(rawFile);
    if (FFMPEG) master(rawFile, outFile);
    else fs.copyFileSync(rawFile, outFile);
    provById.set(id, {
      line_id: id, text, seed, voice_id: VOICE, model_id: 'eleven_multilingual_v2',
      settings: SETTINGS, output_format: 'mp3_44100_192', mastered: !!FFMPEG,
      sha256_raw: crypto.createHash('sha256').update(buf).digest('hex'),
      generated_at: provById.get(id)?.generated_at ?? new Date().toISOString(),
    });
    console.log(`  vo ${id}`);
    ok++;
  } catch (e) {
    console.error(`  FAIL ${id}: ${e.message}`);
    fail++;
  }
}

// --- ui.nav.ping: short sonar-adjacent locator blip (sound-generation) ---
const PING_PROMPT = 'Single short clean navigation sonar ping, soft synthetic cockpit locator blip, '
  + 'bright but gentle, 300 milliseconds, no reverb tail, UI sound';
const pingRaw = path.join(UI_OUT, '_nav_ping_raw.mp3');
const pingOut = path.join(UI_OUT, `nav_ping.${FFMPEG ? 'wav' : 'mp3'}`);
manifest.entries['ui.nav.ping'] = `/audio/ui/nav_ping.${FFMPEG ? 'wav' : 'mp3'}`;
if (!fs.existsSync(pingOut)) {
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_192', {
      method: 'POST', headers: H,
      body: JSON.stringify({ text: PING_PROMPT, duration_seconds: 0.5, prompt_influence: 0.7 }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    fs.writeFileSync(pingRaw, Buffer.from(await res.arrayBuffer()));
    if (FFMPEG) master(pingRaw, pingOut, -18);
    else fs.copyFileSync(pingRaw, pingOut);
    console.log('  sfx ui.nav.ping');
    ok++;
  } catch (e) {
    console.error(`  FAIL ui.nav.ping: ${e.message}`);
    fail++;
  }
} else skip++;

fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(PROVENANCE, `${JSON.stringify([...provById.values()], null, 2)}\n`);
console.log(`done: ${ok} generated, ${skip} skipped, ${fail} failed`);
process.exit(fail > 0 && ok === 0 ? 1 : 0);
