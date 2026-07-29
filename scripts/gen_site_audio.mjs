#!/usr/bin/env node
/**
 * Landing-page audio: UI sound effects and hero voice, via ElevenLabs.
 *
 * Format: 44.1 kHz at 192 kbps (output_format=mp3_44100_192).
 * Note on PCM — `pcm_44100` is gated to ElevenLabs Pro tier and this account is
 * Creator, so a raw-PCM master is not obtainable here (verified: HTTP 403
 * subscription_required). mp3_44100_192 is the highest format the plan allows and
 * is what the rest of this project already ships. If the plan is ever upgraded,
 * set PCM=1 and the script will pull pcm_44100 masters and encode down.
 *
 * Every cue is PEAK-normalised with ffmpeg before shipping (see master() for why
 * loudnorm is wrong here) and the result is asserted at the end of the run.
 * Website UI sound that is even slightly too loud reads as amateur, so the cues
 * sit well below the game's own SFX and the final level is trimmed again by the
 * WebAudio gains in src/site/audio.ts.
 *
 * Source of truth: content/site-audio-plan.json.
 * Output: public/audio/site/<id>.mp3   Provenance: content/site-audio-provenance.json
 * Idempotent — existing files are skipped unless --force.
 *
 * Flags: --only id,id   --force   --dry
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'audio', 'site');
const TMP = path.join(ROOT, '.tmp-siteaudio');
const PLAN_PATH = path.join(ROOT, 'content', 'site-audio-plan.json');
const PROV_PATH = path.join(ROOT, 'content', 'site-audio-provenance.json');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const ONLY = (() => {
  const i = process.argv.indexOf('--only');
  return i >= 0 ? new Set(process.argv[i + 1].split(',')) : null;
})();
const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry');
const WANT_PCM = process.env.PCM === '1';

const { loadEnv } = await import('./check_key.mjs');
const KEY = loadEnv().ELEVENLABS_API_KEY ?? '';
if (!KEY) { console.error('no ELEVENLABS_API_KEY'); process.exit(2); }
const H = { 'xi-api-key': KEY, 'Content-Type': 'application/json' };

const FMT = WANT_PCM ? 'pcm_44100' : 'mp3_44100_192';

// ---- quota guard -----------------------------------------------------------
// The character pool is nearly spent on this account, and a half-generated audio
// set is worse than none: check before spending and refuse to start a run that
// cannot finish.
const sub = await (await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: H })).json();
const remaining = (sub.character_limit ?? 0) - (sub.character_count ?? 0);
console.log(`tier=${sub.tier} credits remaining=${remaining}`);

const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
const prov = fs.existsSync(PROV_PATH) ? JSON.parse(fs.readFileSync(PROV_PATH, 'utf8')) : {};

const wanted = (list) => list.filter((c) => (!ONLY || ONLY.has(c.id))
  && (FORCE || !fs.existsSync(path.join(OUT, `${c.id}.mp3`))));

const sfx = wanted(plan.sfx ?? []);
const vo = wanted(plan.vo ?? []);

// ElevenLabs bills sound effects per second of output; text-to-speech per
// character. Both estimates are deliberately pessimistic.
const costSfx = sfx.reduce((n, c) => n + Math.ceil((c.seconds ?? 2) * 40), 0);
const costVo = vo.reduce((n, c) => n + c.text.length, 0);
console.log(`to generate: ${sfx.length} sfx (~${costSfx} credits), `
  + `${vo.length} vo (~${costVo} credits) — projected ${costSfx + costVo}`);

if (costSfx + costVo > remaining) {
  console.error(`\nSTOP: projected ${costSfx + costVo} credits exceeds ${remaining} remaining.`);
  console.error('Trim content/site-audio-plan.json or top up the plan.');
  process.exit(3);
}
if (DRY) { console.log('\n--dry: nothing generated'); process.exit(0); }

// ---- voices ----------------------------------------------------------------
const voices = (await (await fetch('https://api.elevenlabs.io/v1/voices', { headers: H })).json()).voices ?? [];
function pick(...names) {
  for (const n of names) {
    const v = voices.find((v) => v.name?.toLowerCase().split(' - ')[0].trim() === n.toLowerCase());
    if (v) return v.voice_id;
  }
  return voices[0]?.voice_id;
}
// Same casting as the game's own VO (scripts/gen_audio.mjs) so the site sounds
// like the product it is selling rather than like stock narration.
const CAST = {
  ekene: pick('Lily', 'Matilda', 'Bella'),   // Commander Mara Ekene — Compact actual
  cairn: pick('River', 'Alice', 'Sarah'),    // CAIRN — cockpit intelligence
  narr: pick('Daniel', 'George', 'Brian'),   // Compact Command
};
console.log('cast:', CAST);

// ---- generation ------------------------------------------------------------
async function grab(url, body, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: H, body: JSON.stringify(body) });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const text = await res.text();
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw new Error(`${label}: ${res.status} ${text.slice(0, 200)}`);
    }
    console.log(`   retry ${attempt}/2 (${res.status})`);
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
  throw new Error(`${label}: exhausted retries`);
}

/** Normalise and encode to the shipping format. */
function master(inPath, outPath, targetPeakDb) {
  // PEAK normalisation, deliberately NOT loudnorm. EBU R128 integrated loudness
  // is gated and needs roughly three seconds of material to mean anything; every
  // cue here is under 1.5 s. Single-pass loudnorm on them produced gains wrong by
  // tens of dB — the first run shipped a "panel" cue peaking at -66.8 dBFS and a
  // "launch" cue at -47.3, against the game's own SFX at -3.5. Inaudible, and
  // invisible to every check except a level measurement.
  //
  // So: measure the true peak, then apply the exact gain that lands it on target.
  // Relative loudness between cues comes from their per-cue targets; final
  // playback level is set by the WebAudio gains in src/site/audio.ts.
  const peak = peakDb(inPath);
  if (peak === null) throw new Error('could not measure peak level');
  const gain = targetPeakDb - peak;

  // Refuse an absurd boost: that means the generation is mostly silence and
  // wants regenerating, not amplifying into its own noise floor.
  if (gain > 40) throw new Error(`near-silent source (peak ${peak} dBFS) — regenerate`);

  // A 20 ms fade on the TAIL, to kill any click where the sample is cut off.
  // `afade=t=out` needs an explicit start time: `st=0` fades out from the very
  // beginning of the file, silencing everything after 20 ms. That is not a
  // theoretical hazard — it is what the first two attempts here actually did,
  // and it is why ui_panel came out at -90 dBFS.
  const dur = durationOf(inPath);
  const fadeStart = Math.max(0, dur - 0.02);
  execFileSync('ffmpeg', [
    '-y', '-i', inPath,
    '-af', `volume=${gain.toFixed(2)}dB,afade=t=out:st=${fadeStart.toFixed(3)}:d=0.02:curve=tri`,
    '-ar', '44100', '-b:a', '192k', '-codec:a', 'libmp3lame',
    outPath,
  ], { stdio: 'ignore' });
}

/** Duration in seconds, 0 if unreadable. */
function durationOf(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  const v = parseFloat((r.stdout ?? '').trim());
  return Number.isFinite(v) ? v : 0;
}

/**
 * True peak of a file in dBFS, or null if it cannot be measured.
 *
 * ffmpeg writes the volumedetect report to STDERR, and exits 0 doing it — so
 * execFileSync's return value (stdout) is empty and its catch block never runs.
 * spawnSync is the only shape that reliably gets at the report.
 */
function peakDb(file) {
  const r = spawnSync('ffmpeg', ['-i', file, '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8' });
  const text = `${r.stderr ?? ''}${r.stdout ?? ''}`;
  const m = /max_volume:\s*(-?[\d.]+) dB/.exec(text);
  return m ? parseFloat(m[1]) : null;
}

const made = [];
const failed = [];

for (const cue of sfx) {
  const out = path.join(OUT, `${cue.id}.mp3`);
  try {
    console.log(`sfx  ${cue.id} (${cue.seconds}s)`);
    const buf = await grab(
      `https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_192`,
      { text: cue.prompt, duration_seconds: cue.seconds, prompt_influence: cue.influence ?? 0.45 },
      cue.id,
    );
    const raw = path.join(TMP, `${cue.id}.raw.mp3`);
    fs.writeFileSync(raw, buf);
    master(raw, out, cue.peak ?? -14);
    prov[cue.id] = { kind: 'sfx', prompt: cue.prompt, seconds: cue.seconds, format: 'mp3_44100_192', peakDbfs: cue.peak ?? -14, usage: cue.usage };
    made.push(cue.id);
  } catch (e) { console.error(`  FAIL ${cue.id}: ${e.message}`); failed.push(cue.id); }
}

for (const cue of vo) {
  const out = path.join(OUT, `${cue.id}.mp3`);
  const voiceId = CAST[cue.voice] ?? CAST.ekene;
  try {
    console.log(`vo   ${cue.id} (${cue.text.length} chars, ${cue.voice})`);
    const buf = await grab(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${FMT}`,
      {
        text: cue.text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: cue.settings ?? { stability: 0.55, similarity_boost: 0.78, style: 0.25 },
      },
      cue.id,
    );
    const raw = path.join(TMP, `${cue.id}.raw.${WANT_PCM ? 'pcm' : 'mp3'}`);
    fs.writeFileSync(raw, buf);
    if (WANT_PCM) {
      const wav = path.join(TMP, `${cue.id}.wav`);
      execFileSync('ffmpeg', ['-y', '-f', 's16le', '-ar', '44100', '-ac', '1', '-i', raw, wav], { stdio: 'ignore' });
      master(wav, out, cue.peak ?? -9);
    } else {
      master(raw, out, cue.peak ?? -9);
    }
    prov[cue.id] = { kind: 'vo', voice: cue.voice, voiceId, text: cue.text, format: FMT, peakDbfs: cue.peak ?? -9, usage: cue.usage };
    made.push(cue.id);
  } catch (e) { console.error(`  FAIL ${cue.id}: ${e.message}`); failed.push(cue.id); }
}

fs.writeFileSync(PROV_PATH, JSON.stringify(prov, null, 2) + '\n');
fs.rmSync(TMP, { recursive: true, force: true });

// Assert what actually shipped. A cue that encodes fine but comes out 40 dB
// too quiet passes every other check and is simply never heard.
let tooQuiet = 0;
for (const id of made) {
  const p = path.join(OUT, `${id}.mp3`);
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', p]).toString().trim();
  const peak = peakDb(p);
  const flag = peak !== null && peak < -30 ? '  <-- TOO QUIET' : '';
  if (flag) tooQuiet++;
  console.log(`  ${id}.mp3  ${(fs.statSync(p).size / 1024).toFixed(0)}KB  `
    + `${(+dur).toFixed(2)}s  peak ${peak ?? '?'} dBFS${flag}`);
}
if (tooQuiet) {
  console.error(`\n${tooQuiet} cue(s) below -30 dBFS peak — they will not be audible.`);
  process.exit(4);
}

console.log(`\n${made.length} generated, ${failed.length} failed`);
if (failed.length) { console.error('NOT generated:', failed.join(', ')); process.exit(1); }
