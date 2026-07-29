#!/usr/bin/env node
/**
 * Loudness pass over the generated score (docs/audio-bible.md §1.9/§6.6).
 * Pure static gain — no loudnorm/dynamics, so takes keep their character and
 * the known loudnorm 192 kHz resample gotcha never applies. Per-category
 * integrated-loudness targets put every cue at a predictable level relative
 * to its bus; gain is capped so true peak never exceeds −1.0 dBTP.
 * Re-running is safe: cues already within 0.5 dB of target are skipped.
 *
 * Also archives every cue as a 44.1 kHz 16-bit PCM WAV in masters/music/
 * (kept out of public/, so it never ships to Cloudflare). API-side PCM
 * (output_format=pcm_44100) is Pro-tier-only — 403 on this Creator account,
 * re-verified 2026-07-25 — so these WAVs are decodes of the 192 kbps
 * deliveries, not lossless masters (the §3.0 Creator-tier fallback).
 *
 * Flags: --only id,id   --dry
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public', 'audio', 'music');
const MASTERS = path.join(ROOT, 'masters', 'music');
const PROVENANCE = path.join(ROOT, 'content', 'music-provenance.json');

const ONLY = (() => {
  const i = process.argv.indexOf('--only');
  return i >= 0 ? new Set(process.argv[i + 1].split(',')) : null;
})();
const DRY = process.argv.includes('--dry');

const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'audio-plan.json'), 'utf8'));

function targetFor(id) {
  if (id.startsWith('mus_biome_') || id === 'mus_training') return -19; // beds under constant VO sit low
  if (id.startsWith('mus_combat_')) return -14; // stems stack — keep them uniform
  if (id.startsWith('sting_')) return -16;
  return -14; // theme, endings, duel suites
}

function summary(file) {
  const r = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-',
  ], { encoding: 'utf8' });
  const text = String(r.stderr ?? '');
  const tail = text.slice(text.lastIndexOf('Summary:'));
  const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(tail)?.[1]);
  const TP = Number(/True peak:\s+Peak:\s+(-?[\d.]+) dBFS/.exec(tail)?.[1]);
  return { I, TP };
}

const provenance = fs.existsSync(PROVENANCE) ? JSON.parse(fs.readFileSync(PROVENANCE, 'utf8')) : [];
let changed = 0;
if (!DRY) fs.mkdirSync(MASTERS, { recursive: true });

function archivePcm(id, file) {
  if (DRY) return;
  const wav = path.join(MASTERS, `${id}.wav`);
  if (fs.existsSync(wav) && fs.statSync(wav).mtimeMs >= fs.statSync(file).mtimeMs) return;
  execFileSync('ffmpeg', ['-y', '-i', file, '-ar', '44100', '-c:a', 'pcm_s16le', wav], { stdio: 'ignore' });
}

for (const cue of plan.music) {
  if (ONLY && !ONLY.has(cue.id)) continue;
  const file = path.join(DIR, `${cue.id}.mp3`);
  if (!fs.existsSync(file)) { console.log(`${cue.id}: missing — run npm run music first`); continue; }
  const { I, TP } = summary(file);
  if (!Number.isFinite(I) || !Number.isFinite(TP)) { console.log(`${cue.id}: measurement failed`); continue; }
  const target = targetFor(cue.id);
  let gain = target - I;
  const ceiling = -1.0 - TP; // max upward gain before TP passes −1 dBTP
  if (gain > ceiling) gain = ceiling;
  if (Math.abs(gain) < 0.5) {
    console.log(`${cue.id}: I=${I} TP=${TP} — within 0.5 dB of ${target}, skipped`);
    archivePcm(cue.id, file);
    continue;
  }
  console.log(`${cue.id}: I=${I} TP=${TP} → ${gain > 0 ? '+' : ''}${gain.toFixed(1)} dB (target ${target})`);
  if (DRY) continue;
  const tmp = path.join(os.tmpdir(), `master_${cue.id}.mp3`);
  execFileSync('ffmpeg', [
    '-y', '-i', file, '-af', `volume=${gain.toFixed(2)}dB`,
    '-codec:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', tmp,
  ], { stdio: 'ignore' });
  fs.copyFileSync(tmp, file);
  fs.rmSync(tmp, { force: true });
  const post = summary(file);
  const entry = provenance.find((p) => p.key === `music.${cue.id}`);
  if (entry) Object.assign(entry, { mastered_I_lufs: post.I, mastered_TP_dbfs: post.TP, mastered_gain_db: Number(gain.toFixed(2)) });
  archivePcm(cue.id, file);
  changed++;
}

if (!DRY) fs.writeFileSync(PROVENANCE, `${JSON.stringify(provenance, null, 2)}\n`);
console.log(`\n${changed} cue(s) adjusted`);
