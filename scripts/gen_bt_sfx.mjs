#!/usr/bin/env node
/**
 * BASIC TRAINING UI audio + pad ambience — ElevenLabs sound generation.
 *
 *  ui.bt.confirm — THE chime: identical every step, must be instantly
 *                  distinguishable from every combat alarm in a blind test.
 *  ui.bt.hint    — quiet two-pulse attention tick (hint escalation, sub-checks).
 *  ui.bt.phase   — short restrained three-tone phase flourish.
 *  amb.bt.pad    — calm landing-pad ambience loop (sits >= 12 dB under dialogue).
 *
 * Generates `--variants N` takes per UI asset (default 2; spec asks for 6 when
 * credits allow — rerun with --variants 6 before final QC), keeps take 1 as the
 * shipped file and saves the rest alongside as _v2.. for the human listen pass.
 * Mastering: UI one-shots to -16 LUFS / -1 dBTP; ambience to -30 LUFS.
 * Provenance: content/vo/bt-sfx-provenance.json.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'audio', 'ui');
const RAW = path.join(OUT, '_raw');
const MANIFEST = path.join(ROOT, 'content', 'audio-manifest.json');
const PROVENANCE = path.join(ROOT, 'content', 'vo', 'bt-sfx-provenance.json');
fs.mkdirSync(RAW, { recursive: true });

const VARIANTS = (() => {
  const i = process.argv.indexOf('--variants');
  return i >= 0 ? Math.max(1, parseInt(process.argv[i + 1], 10) || 2) : 2;
})();

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

let FFMPEG = null;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); FFMPEG = 'ffmpeg'; } catch { /* none */ }

const ASSETS = [
  {
    key: 'ui.bt.confirm', file: 'bt_confirm', dur: 0.6, lufs: -16, variants: VARIANTS,
    prompt: 'Soft single confirmation chime for a cockpit interface, warm synthetic bell with one brief low harmonic, clean fast decay, dry, no reverb, no melody, no alarm quality',
  },
  {
    key: 'ui.bt.hint', file: 'bt_hint', dur: 0.5, lufs: -18, variants: VARIANTS,
    prompt: 'Quiet two-pulse electronic attention tick, gentle, rounded, non-alarming, dry, no melody',
  },
  {
    key: 'ui.bt.phase', file: 'bt_phase', dur: 1.0, lufs: -16, variants: VARIANTS,
    prompt: 'Short rising three-tone synthetic confirmation flourish, restrained industrial character, dry, no reverb tail, no melodic hook',
  },
  {
    key: 'amb.bt.pad', file: 'bt_pad_amb', dur: 22, lufs: -30, variants: 1,
    prompt: 'Seamlessly looping calm interior landing-pad ambience, low ventilation hum, distant machinery, faint electrical texture, no music, no voices, no footsteps, restrained low frequencies, stable loop',
  },
];

async function soundGen(prompt, dur) {
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_192', {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ text: prompt, duration_seconds: dur, prompt_influence: 0.7 }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return { buf: Buffer.from(await res.arrayBuffer()), reqId: res.headers.get('request-id') ?? null };
}

function master(rawMp3, outWav, lufs) {
  execFileSync(FFMPEG, ['-y', '-i', rawMp3, '-af', `loudnorm=I=${lufs}:TP=-1:LRA=11`,
    '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', outWav], { stdio: 'ignore' });
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
let provenance = [];
try { provenance = JSON.parse(fs.readFileSync(PROVENANCE, 'utf8')); } catch { /* fresh */ }

let ok = 0, skip = 0, fail = 0;
for (const a of ASSETS) {
  const ext = FFMPEG ? 'wav' : 'mp3';
  const shipped = path.join(OUT, `${a.file}.${ext}`);
  manifest.entries[a.key] = `/audio/ui/${a.file}.${ext}`;
  if (fs.existsSync(shipped)) { skip++; continue; }
  for (let v = 1; v <= a.variants; v++) {
    const suffix = v === 1 ? '' : `_v${v}`;
    const outFile = path.join(OUT, `${a.file}${suffix}.${ext}`);
    try {
      const { buf, reqId } = await soundGen(a.prompt, a.dur);
      const rawFile = path.join(RAW, `${a.file}${suffix}.mp3`);
      fs.writeFileSync(rawFile, buf);
      if (FFMPEG) master(rawFile, outFile, a.lufs);
      else fs.copyFileSync(rawFile, outFile);
      provenance.push({
        key: a.key, variant: v, prompt: a.prompt, duration_seconds: a.dur,
        prompt_influence: 0.7, lufs_target: a.lufs, request_id: reqId,
        sha256_raw: crypto.createHash('sha256').update(buf).digest('hex'),
        generated_at: new Date().toISOString(),
      });
      console.log(`  sfx ${a.key}${suffix} (${(buf.length / 1024).toFixed(0)} kB raw → ${ext})`);
      ok++;
      await new Promise((r) => setTimeout(r, 400));
    } catch (e) {
      console.error(`  FAIL ${a.key}${suffix}: ${e.message}`);
      fail++;
    }
  }
}

fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(PROVENANCE, `${JSON.stringify(provenance, null, 2)}\n`);
console.log(`done: ${ok} generated, ${skip} skipped, ${fail} failed`);
process.exit(fail > 0 && ok === 0 ? 1 : 0);
