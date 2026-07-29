// Multiplayer VO — reads content/vo/mp-lines.csv and generates:
//   ANNOUNCER ("Compact Net Control" — the campaign Command voice) → vo.mp.<id>
//   BATCOM (the pinned CAIRN voice, settings identical to campaign)  → vo.mp.<id>
//   PACK bark rows once per pilot pack (6 distinct premade voices)   → vo.mp.<id>_p<N>
// Files land in public/audio/vo/mp/; content/audio-manifest.json is patched.
// Idempotent: existing files are skipped; delete a file to retake it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'audio', 'vo', 'mp');
const CSV = path.join(ROOT, 'content', 'vo', 'mp-lines.csv');
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

const voicesRes = await fetch('https://api.elevenlabs.io/v1/voices', { headers: H });
const voices = (await voicesRes.json()).voices ?? [];
function pick(...names) {
  for (const n of names) {
    const v = voices.find((v) => v.name?.toLowerCase().split(' - ')[0].trim() === n.toLowerCase());
    if (v) return v.voice_id;
  }
  return voices[0]?.voice_id;
}

const ANNOUNCER = { voice: pick('Daniel', 'George', 'Brian'), settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 } };
const BATCOM = { voice: pick('River', 'Alice', 'Sarah'), settings: { stability: 0.75, similarity_boost: 0.8, style: 0.0 } };
// six pilot packs — distinct premades, none shared with the campaign cast
const PACKS = [
  ['p1', pick('Roger', 'Chris')], ['p2', pick('Laura', 'Sarah')], ['p3', pick('Callum', 'Eric')],
  ['p4', pick('Charlotte', 'Alice')], ['p5', pick('Will', 'Brian')], ['p6', pick('Jessica', 'Matilda')],
];
const PACK_SETTINGS = { stability: 0.6, similarity_boost: 0.75, style: 0.15 };
console.log('announcer:', ANNOUNCER.voice, 'batcom:', BATCOM.voice, 'packs:', PACKS.map(([, v]) => v).join(','));

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
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

// expand rows into concrete jobs: [file id, voice, text, settings]
const jobs = [];
for (const r of rows) {
  const id = r[col.line_id], speaker = r[col.speaker], text = r[col.text];
  if (speaker === 'ANNOUNCER') jobs.push([id, ANNOUNCER.voice, text, ANNOUNCER.settings]);
  else if (speaker === 'BATCOM') jobs.push([id, BATCOM.voice, text, BATCOM.settings]);
  else if (speaker === 'PACK') for (const [pid, v] of PACKS) jobs.push([`${id}_${pid}`, v, text, PACK_SETTINGS]);
  else console.warn(`unknown speaker ${speaker} for ${id}`);
}

let ok = 0, skip = 0, fail = 0;
const failures = [];
for (const [id, voice, text, settings] of jobs) {
  const file = path.join(OUT, `${id}.mp3`);
  manifest.entries[`vo.mp.${id}`] = `/audio/vo/mp/${id}.mp3`;
  if (fs.existsSync(file)) { skip++; continue; }
  try {
    const buf = await api(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?${FMT}`,
      { text, model_id: 'eleven_multilingual_v2', voice_settings: settings });
    fs.writeFileSync(file, buf);
    console.log(`  vo ${id} (${(buf.length / 1024).toFixed(0)} kB)`);
    ok++;
  } catch (e) {
    console.error(`  FAIL ${id}: ${e.message}`);
    fail++; failures.push(id);
  }
}

fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`done: ${ok} generated, ${skip} skipped, ${fail} failed — ${jobs.length} total jobs, manifest updated`);
if (failures.length) console.log('failures:', failures.join(', '));
process.exit(fail > 0 && ok === 0 ? 1 : 0);
