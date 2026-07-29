#!/usr/bin/env node
// Verifies the ElevenLabs + Tripo3D keys in "API Information/.env".
// Prints only masked prefixes and HTTP statuses — never the keys.
import fs from 'node:fs';

const ENV_PATH = '/Users/angseesiang/Library/CloudStorage/GoogleDrive-ang.see.siang@gmail.com/My Drive/macbook/API Information/.env';

export function loadEnv() {
  const out = {};
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const mask = (k) => (k ? `${k.slice(0, 7)}…${k.slice(-3)} (len ${k.length})` : 'EMPTY');

if (process.argv[1]?.endsWith('check_key.mjs')) {
  const env = loadEnv();
  const el = env.ELEVENLABS_API_KEY;
  const tp = env.TRIPO_API_KEY;
  console.log('ELEVENLABS_API_KEY:', mask(el));
  console.log('TRIPO_API_KEY:', mask(tp));

  if (el) {
    const r = await fetch('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': el } });
    console.log('elevenlabs /v1/user ->', r.status);
    if (r.ok) {
      const u = await r.json();
      console.log('  tier:', u?.subscription?.tier, '| chars:', u?.subscription?.character_count, '/', u?.subscription?.character_limit);
    }
  }
  if (tp) {
    const base = (env.TRIPO_BASE_URL || 'https://openapi.tripo3d.ai/v3').replace(/\/$/, '');
    const r = await fetch(`${base}/user/balance`, { headers: { Authorization: `Bearer ${tp}` } });
    console.log('tripo /user/balance ->', r.status);
    try {
      const b = await r.json();
      if (b?.data) console.log('  balance:', JSON.stringify(b.data));
      else if (b?.code !== undefined) console.log('  code:', b.code, b.message ?? '');
    } catch { /* non-JSON */ }
  }
}
