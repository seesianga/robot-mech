#!/usr/bin/env node
/**
 * Campaign VO batch for M04–M24: every design voTrigger line (except the
 * on_start litany, already recorded) plus each mission's long radio briefing.
 * Output: public/audio/vo/camp/<mid>_<slug>.mp3 at MP3 CBR 192 kbps / 44.1 kHz
 * (output_format=mp3_44100_192, per docs/audio-bible.md §1.5).
 * Manifest keys mirror src/sim/campaign.ts: vo.camp.<mid>.<slug> — slug is the
 * trigger with every non-alphanumeric run collapsed to "_", and "briefing".
 * Idempotent: existing files are skipped (manifest entries always ensured).
 * Provenance: content/vo/campaign-provenance.json.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'audio', 'vo', 'camp');
const MANIFEST = path.join(ROOT, 'content', 'audio-manifest.json');
const PROVENANCE = path.join(ROOT, 'content', 'vo', 'campaign-provenance.json');
fs.mkdirSync(OUT, { recursive: true });

const ONLY = (() => {
  const i = process.argv.indexOf('--only');
  return i >= 0 ? new Set(process.argv[i + 1].split(',')) : null;
})();

let KEY = '';
try {
  const { loadEnv } = await import('./check_key.mjs');
  KEY = loadEnv().ELEVENLABS_API_KEY ?? '';
} catch { /* fall through */ }
if (!KEY) { console.error('No ElevenLabs key found'); process.exit(1); }

const H = { 'xi-api-key': KEY, 'content-type': 'application/json' };
const FMT = 'output_format=mp3_44100_192';

// ---------- casting (docs/audio-bible.md §2) ----------
const voicesRes = await fetch('https://api.elevenlabs.io/v1/voices', { headers: H });
const voices = (await voicesRes.json()).voices ?? [];
function pick(...names) {
  for (const n of names) {
    const v = voices.find((v) => v.name?.toLowerCase().split(' - ')[0].trim() === n.toLowerCase());
    if (v) return v.voice_id;
  }
  console.error(`no voice match for ${names.join('/')} — using first available`);
  return voices[0]?.voice_id;
}

const CAST = {
  // returning cast (same as gen_audio.mjs)
  CAIRN: { id: pick('River', 'Alice', 'Sarah'), settings: { stability: 0.75, similarity_boost: 0.8, style: 0.0 } },
  Ekene: { id: pick('Lily', 'Matilda', 'Bella'), settings: { stability: 0.55, similarity_boost: 0.75, style: 0.25 } },
  Relay: { id: pick('Liam', 'Charlie', 'Will'), settings: { stability: 0.45, similarity_boost: 0.75, style: 0.4 } },
  Command: { id: pick('Daniel', 'George', 'Brian'), settings: { stability: 0.6, similarity_boost: 0.75, style: 0.15 } },
  // new speakers for Ops 2–7 (design prompts in audio-bible §2.1)
  Sable: { id: pick('Alice', 'Matilda', 'Sarah'), settings: { stability: 0.8, similarity_boost: 0.8, style: 0.05 } },   // quiet flat calm
  Tremor: { id: pick('Brian', 'Bill', 'George'), settings: { stability: 0.5, similarity_boost: 0.75, style: 0.35 } },   // booming bass, warm
  Vireo: { id: pick('Jessica', 'Aria', 'Laura'), settings: { stability: 0.4, similarity_boost: 0.75, style: 0.45 } },   // young, audible nerves
  Kryce: { id: pick('George', 'Callum', 'Daniel'), settings: { stability: 0.6, similarity_boost: 0.8, style: 0.3 } },   // patrician baritone
  Rauk: { id: pick('Aria', 'Charlotte', 'Alice'), settings: { stability: 0.7, similarity_boost: 0.8, style: 0.15 } },   // clipped icy alto
  Sol: { id: pick('Bill', 'Brian', 'Daniel'), settings: { stability: 0.65, similarity_boost: 0.8, style: 0.2 } },       // tired dignified baritone
};

const MISSION_IDS = {
  m04: 'm04_white_static', m05: 'm05_dust_convoy', m06: 'm06_mirage_line', m07: 'm07_the_weigh_station',
  m08: 'm08_sounding', m09: 'm09_undertow', m10: 'm10_ropeway', m11: 'm11_kryces_voice',
  m12: 'm12_flare_stack', m13: 'm13_icebound', m14: 'm14_the_mag_line', m15: 'm15_breakwater',
  m16: 'm16_rauks_wager', m17: 'm17_signal_fires', m18: 'm18_understreets', m19: 'm19_counterweight',
  m20: 'm20_the_registry', m21a: 'm21a_extraction', m21b: 'm21b_override', m22: 'm22_blackout',
  m23: 'm23_the_long_climb', m24: 'm24_reclamation',
};

const slug = (t) => t.replace(/[^a-z0-9]+/gi, '_');

async function tts(voiceId, text, settings) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?${FMT}`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: settings }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return { buf: Buffer.from(await res.arrayBuffer()), reqId: res.headers.get('request-id') ?? null };
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
let provenance = [];
try { provenance = JSON.parse(fs.readFileSync(PROVENANCE, 'utf8')); } catch { /* fresh */ }

let ok = 0, skip = 0, fail = 0, chars = 0;
const failures = [];

for (const [mid, designFile] of Object.entries(MISSION_IDS)) {
  if (ONLY && !ONLY.has(mid)) continue;
  const design = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'missions', `${designFile}.json`), 'utf8'));

  const jobs = [];
  // the long radio briefing (pre-mission card)
  jobs.push({ key: `vo.camp.${mid}.briefing`, file: `${mid}_briefing.mp3`, speaker: design.briefing.speaker, text: design.briefing.text });
  // every in-mission trigger line except the litany
  for (const t of design.voTriggers) {
    if (t.trigger === 'on_start') continue;
    jobs.push({ key: `vo.camp.${mid}.${slug(t.trigger)}`, file: `${mid}_${slug(t.trigger)}.mp3`, speaker: t.speaker, text: t.line });
  }

  for (const j of jobs) {
    const out = path.join(OUT, j.file);
    manifest.entries[j.key] = `/audio/vo/camp/${j.file}`;
    if (fs.existsSync(out)) { skip++; continue; }
    const cast = CAST[j.speaker];
    if (!cast?.id) { fail++; failures.push(`${j.key}: no casting for speaker "${j.speaker}"`); continue; }
    try {
      const { buf, reqId } = await tts(cast.id, j.text, cast.settings);
      fs.writeFileSync(out, buf);
      chars += j.text.length;
      provenance.push({
        key: j.key, speaker: j.speaker, voice_id: cast.id, model_id: 'eleven_multilingual_v2',
        output_format: 'mp3_44100_192', chars: j.text.length, request_id: reqId,
        sha256: crypto.createHash('sha256').update(buf).digest('hex'),
        generated_at: new Date().toISOString(),
      });
      ok++;
      if (ok % 20 === 0) console.log(`  …${ok} lines done (${chars} chars)`);
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      fail++;
      failures.push(`${j.key}: ${String(e.message).slice(0, 160)}`);
    }
  }
  console.log(`${mid}: ${jobs.length} lines queued (running totals ok=${ok} skip=${skip} fail=${fail})`);
}

fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(PROVENANCE, `${JSON.stringify(provenance, null, 2)}\n`);
console.log(`\ndone: ${ok} generated (${chars} chars), ${skip} skipped, ${fail} failed`);
for (const f of failures) console.log('  FAIL', f);
process.exit(fail > 0 && ok === 0 ? 1 : 0);
