#!/usr/bin/env node
/**
 * First ElevenLabs audio pass for the M0 vertical slice.
 * Reads the API key from ~/.claude.json (mcpServers.ElevenLabs.env.ELEVENLABS_API_KEY).
 * Idempotent: skips any file that already exists. 192 kbps output throughout.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'audio');

// Primary key source: the shared "API Information/.env"; fallback: ~/.claude.json MCP env.
let KEY = '';
try {
  const { loadEnv } = await import('./check_key.mjs');
  KEY = loadEnv().ELEVENLABS_API_KEY ?? '';
} catch { /* fall through */ }
if (!KEY) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf8'));
    KEY = cfg?.mcpServers?.ElevenLabs?.env?.ELEVENLABS_API_KEY ?? '';
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

// ---------- voices ----------
const voicesRes = await fetch('https://api.elevenlabs.io/v1/voices', { headers: H });
const voices = (await voicesRes.json()).voices ?? [];
function pick(...names) {
  for (const n of names) {
    // premade names carry suffixes ("River - Relaxed, Neutral, Informative")
    const v = voices.find((v) => v.name?.toLowerCase().split(' - ')[0].trim() === n.toLowerCase());
    if (v) return v.voice_id;
  }
  return voices[0]?.voice_id;
}
const CAIRN = pick('River', 'Alice', 'Sarah');   // neutral, calm, faintly synthetic
const EKENE = pick('Lily', 'Matilda', 'Bella');  // low velvety authority, 50s
const RELAY = pick('Liam', 'Charlie', 'Will');   // young, bright, fast
const NARR = pick('Daniel', 'George', 'Brian');  // Compact Command — debriefs/briefings
console.log('voices:', { CAIRN, EKENE, RELAY });

const VO = [
  ['cairn_litany', CAIRN, 'Core ignition confirmed. Actuator lattice — green. Weapon buses — live. Coolant loop pressurized. All boards answer ready. Good hunting, Lodestar.', { stability: 0.75, similarity_boost: 0.8, style: 0.0 }],
  ['cairn_heat80', CAIRN, 'Heat at eighty percent. Watch your curve.', { stability: 0.75, similarity_boost: 0.8 }],
  ['cairn_heat_critical', CAIRN, 'Heat critical. Shutdown imminent.', { stability: 0.75, similarity_boost: 0.8 }],
  ['cairn_shutdown', CAIRN, 'Thermal redline. Emergency shutdown engaged.', { stability: 0.75, similarity_boost: 0.8 }],
  ['cairn_override', CAIRN, 'Override accepted. Core integrity is your responsibility, Lodestar.', { stability: 0.75, similarity_boost: 0.8 }],
  ['cairn_weapon_lost', CAIRN, 'Weapon destroyed.', { stability: 0.75, similarity_boost: 0.8 }],
  ['cairn_armor_breach', CAIRN, 'Armor breach. Structure exposed.', { stability: 0.75, similarity_boost: 0.8 }],
  ['cairn_leg_lost', CAIRN, 'Leg actuator destroyed. Speed capped. Recommend immediate cover.', { stability: 0.75, similarity_boost: 0.8 }],
  ['cairn_enemy_down', CAIRN, 'Hostile machine neutralized.', { stability: 0.75, similarity_boost: 0.8 }],
  ['cairn_mission_complete', CAIRN, 'Mission objectives complete. Powering down to transit mode. Well flown, Lodestar.', { stability: 0.75, similarity_boost: 0.8 }],
  ['ekene_brief1', EKENE, "Compact actual to Lodestar. That Skarn answers to you now — make it count. The yard's tracking mast is already sweeping for you. Put it down, then get to the extraction line.", { stability: 0.55, similarity_boost: 0.75, style: 0.25 }],
  ['ekene_extract', EKENE, 'Extraction line is lit. Bring it home, Lodestar — the Compact just got itself a mech.', { stability: 0.55, similarity_boost: 0.75, style: 0.25 }],
  ['relay_mast_down', RELAY, "Mast's down — the grid is blind! Heads up: one Gabbro, Directorate colors, coming off the ridge. Watch your heat curve, Lodestar.", { stability: 0.45, similarity_boost: 0.75, style: 0.4 }],
  ['relay_mast_down_clear', RELAY, "Mast's down and you already swept the patrol — you work fast, Lodestar. Extraction line is lit, north-west. Follow the marker home.", { stability: 0.45, similarity_boost: 0.75, style: 0.4 }],
  ['cairn_mission_failed', CAIRN, 'Critical damage. Ejection sequence engaged. Hold on, Lodestar — the Compact will recover you.', { stability: 0.75, similarity_boost: 0.8 }],
  ['ekene_brief_tide', EKENE, 'Low tide, Lodestar. A Directorate salvage patrol is picking through the beached hulls west of the yard — three machines, spread out and lazy. Take them one at a time, watch your heat, and remember: leg them and we keep what falls. Good salvage wins this war.', { stability: 0.55, similarity_boost: 0.75, style: 0.25 }],
  ['ekene_extract_tide', EKENE, 'Three wrecks on the sand and the tide coming in to bury them. Beautiful work. Extraction line is lit — bring it home.', { stability: 0.55, similarity_boost: 0.75, style: 0.25 }],
  ['ekene_brief_loud', EKENE, "This is it, Lodestar — the dropbarge is loading everything we've stolen and the Directorate knows exactly where we are. They will come from the east in force. Nothing gets past you to that slipway. Hold the line and we all go home rich.", { stability: 0.55, similarity_boost: 0.75, style: 0.25 }],
  ['ekene_extract_loud', EKENE, 'The barge is away and the beach is ours. That is how Operation Breaker Coast ends, Lodestar — walk to the line and take a breath. You earned it.', { stability: 0.55, similarity_boost: 0.75, style: 0.25 }],
  ['relay_wave1', RELAY, 'First wave on the scope — a Pumice and a Gabbro coming down the coast road. They are not here to negotiate.', { stability: 0.45, similarity_boost: 0.75, style: 0.4 }],
  ['relay_wave2', RELAY, 'Second wave — and they brought a Basalt. Sixty tons of bad mood, Lodestar. Make it count!', { stability: 0.45, similarity_boost: 0.75, style: 0.45 }],
  ['command_mission_failed', NARR, 'Mission failed. The Compact recovers your ejection pod under fire.', { stability: 0.6, similarity_boost: 0.75, style: 0.15 }],
];

const SFX = [
  ['footstep_salt', 'colossal metal footstep of a 40-ton walking machine on packed salt flats, deep sub-bass thump, hydraulic hiss follow-through, dry outdoor air', 1.2],
  ['footstep_metal', 'colossal metal footstep of a 40-ton walking machine on a hollow steel ship deck, deep clang with sub-bass thump and hydraulic hiss', 1.2],
  ['servo', 'heavy servo motor articulation, layered hydraulic whine and mechanical ratchet, slow powerful movement', 2],
  ['laser', 'sustained focused energy beam weapon firing, molten hum with crackling ionization edge, sharp attack, tight stereo', 1.6],
  ['ac40', 'heavy autocannon firing a rapid four-round burst, concussive mechanical hammer blows, ejecting brass, outdoor echo', 1.8],
  ['rockets', 'volley of eight rockets launching in fast sequence from a shoulder pod, whoosh cluster with igniter pops', 2],
  ['impact_armor', 'armor-piercing impact on thick steel plate, sharp clang with tortured metal groan', 1],
  ['impact_internal', 'internal structure crunch inside a war machine, snapping struts and shorting electronics, muffled', 1.5],
  ['cookoff', 'ammunition cook-off, muffled internal chain explosions bursting outward through armor seams', 3],
  ['collapse', 'forty tons of machinery collapsing onto packed earth, initial slam, cascading secondary metal impacts, settling debris', 4],
  ['shutdown', 'fusion core emergency shutdown, huge turbine decelerating, relays clunking off one by one, lights powering down', 5],
  ['startup', 'giant war machine reactor startup, huge turbine spinning up from silence, relays clunking on one by one, rising power hum', 5],
  ['klaxon', 'overheat warning klaxon, urgent two-tone industrial alarm, harsh but musical, seamless loop', 3],
  ['jumpjet', 'jump-jet thrust, dense rocket roar with metallic resonance, seamless loop', 3],
  ['coolant', 'high-pressure coolant flush venting from a machine, sharp hiss burst decaying into dripping condensation', 2],
  ['cockpit_amb', 'cockpit interior ambience: low reactor thrum, ventilation hiss, occasional relay clicks, intimate close space, seamless loop', 15],
  ['explosion', 'large structure demolition explosion, deep concussive blast with debris shower and long rumble tail', 3.5],
  ['lock', 'military targeting computer lock-on acquisition tone, rising then steady beep, clean synthetic', 1],
  ['eject', 'emergency cockpit ejection from a giant war machine, explosive canopy bolts firing, compressed-gas catapult launch, rocket motor receding upward, metal debris', 2.5],
];

const MUSIC = [
  ['ambient_coast', 'dark ambient military score, vast desolate drone over distant metallic wind chimes and slow deep pulse, salt wind over a shipbreaking coast, tense but quiet, hybrid orchestral-industrial, seamless loop, 96 BPM, D minor, no melody, instrumental', 40000],
  ['combat1', 'urgent hybrid orchestral-industrial combat music, muted driving string ostinato with rolling tom groove and low brass swells, restrained intensity, seamless loop, 112 BPM, D minor, instrumental', 32000],
  ['stinger_win', 'triumphant but weary brass lift over war drums, short military victory stinger, hybrid orchestral, D minor resolving upward, instrumental', 10000],
  ['stinger_fail', 'collapsing low orchestral cluster with dying industrial drone, short defeat stinger, dark, D minor, instrumental', 10000],
];

let ok = 0, skip = 0, fail = 0;
const failures = [];

for (const [id, voice, text, settings] of VO) {
  const file = path.join(OUT, 'vo', `${id}.mp3`);
  if (fs.existsSync(file)) { skip++; continue; }
  try {
    const buf = await api(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?${FMT}`, {
      text, model_id: 'eleven_multilingual_v2', voice_settings: settings,
    });
    fs.writeFileSync(file, buf);
    console.log('vo ok:', id, `${(buf.length / 1024).toFixed(0)}kB`);
    ok++;
  } catch (e) { fail++; failures.push(`vo/${id}: ${String(e).slice(0, 160)}`); }
}

for (const [id, prompt, dur] of SFX) {
  const file = path.join(OUT, 'sfx', `${id}.mp3`);
  if (fs.existsSync(file)) { skip++; continue; }
  try {
    const buf = await api(`https://api.elevenlabs.io/v1/sound-generation?${FMT}`, {
      text: prompt, duration_seconds: dur, prompt_influence: 0.45,
    });
    fs.writeFileSync(file, buf);
    console.log('sfx ok:', id, `${(buf.length / 1024).toFixed(0)}kB`);
    ok++;
  } catch (e) { fail++; failures.push(`sfx/${id}: ${String(e).slice(0, 160)}`); }
}

for (const [id, prompt, ms] of MUSIC) {
  const file = path.join(OUT, 'music', `${id}.mp3`);
  if (fs.existsSync(file)) { skip++; continue; }
  try {
    const buf = await api(`https://api.elevenlabs.io/v1/music?${FMT}`, {
      prompt, music_length_ms: ms,
    });
    fs.writeFileSync(file, buf);
    console.log('music ok:', id, `${(buf.length / 1024).toFixed(0)}kB`);
    ok++;
  } catch (e) { fail++; failures.push(`music/${id}: ${String(e).slice(0, 160)}`); }
}

console.log(`\ndone: ${ok} generated, ${skip} skipped, ${fail} failed`);
for (const f of failures) console.log('  FAIL', f);
process.exit(fail > 0 && ok === 0 ? 1 : 0);
