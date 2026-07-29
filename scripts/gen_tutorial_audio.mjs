// Op 0 tutorial VO — reads content/vo/tutorial-lines.csv, generates each line with
// the pinned campaign cast (same voices/model/settings as gen_audio.mjs), writes
// public/audio/vo/tut/<line_id>.mp3 and patches content/audio-manifest.json
// (key vo.tut.<line_id>). Idempotent: existing files are skipped; delete to retake.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'audio', 'vo', 'tut');
const CSV = path.join(ROOT, 'content', 'vo', 'tutorial-lines.csv');
const MANIFEST = path.join(ROOT, 'content', 'audio-manifest.json');
fs.mkdirSync(OUT, { recursive: true });

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
const FMT = 'output_format=mp3_44100_192';

async function api(url, body) {
  const res = await fetch(url, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

// ---------- voices: identical resolution to gen_audio.mjs so the cast is pinned ----------
const voicesRes = await fetch('https://api.elevenlabs.io/v1/voices', { headers: H });
const voices = (await voicesRes.json()).voices ?? [];
function pick(...names) {
  for (const n of names) {
    const v = voices.find((v) => v.name?.toLowerCase().split(' - ')[0].trim() === n.toLowerCase());
    if (v) return v.voice_id;
  }
  return voices[0]?.voice_id;
}
const CAST = {
  CAIRN: { voice: pick('River', 'Alice', 'Sarah'), settings: { stability: 0.75, similarity_boost: 0.8, style: 0.0 } },
  EKENE: { voice: pick('Lily', 'Matilda', 'Bella'), settings: { stability: 0.55, similarity_boost: 0.75, style: 0.25 } },
  RELAY: { voice: pick('Liam', 'Charlie', 'Will'), settings: { stability: 0.45, similarity_boost: 0.75, style: 0.4 } },
};
console.log('voices:', Object.fromEntries(Object.entries(CAST).map(([k, v]) => [k, v.voice])));

// ---------- CSV (handles quoted fields with commas) ----------
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

let ok = 0, skip = 0, fail = 0;
const failures = [];
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

for (const r of rows) {
  const id = r[col.line_id];
  const speaker = r[col.speaker];
  const text = r[col.text];
  const cast = CAST[speaker];
  if (!cast) { console.warn(`unknown speaker ${speaker} for ${id}`); fail++; failures.push(id); continue; }
  const file = path.join(OUT, `${id}.mp3`);
  manifest.entries[`vo.tut.${id}`] = `/audio/vo/tut/${id}.mp3`;
  if (fs.existsSync(file)) { skip++; continue; }
  try {
    const buf = await api(`https://api.elevenlabs.io/v1/text-to-speech/${cast.voice}?${FMT}`,
      { text, model_id: 'eleven_multilingual_v2', voice_settings: cast.settings });
    fs.writeFileSync(file, buf);
    console.log(`  vo ${id} (${(buf.length / 1024).toFixed(0)} kB)`);
    ok++;
  } catch (e) {
    console.error(`  FAIL ${id}: ${e.message}`);
    fail++; failures.push(id);
  }
}

fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`done: ${ok} generated, ${skip} skipped, ${fail} failed — manifest updated`);
if (failures.length) console.log('failures:', failures.join(', '));
process.exit(fail > 0 && ok === 0 ? 1 : 0);
