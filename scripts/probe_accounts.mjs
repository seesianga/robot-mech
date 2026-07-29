#!/usr/bin/env node
/**
 * Live two-device probe against a running account API — the deployed Worker,
 * `wrangler dev`, or the LAN dev server. Where test_accounts.mjs proves the
 * logic, this proves the deployment: real HTTP, real D1, real CORS.
 *
 * It walks the exact journey the feature exists for:
 *   DEVICE A registers, plays, saves
 *   DEVICE B signs in with the same callsign+passcode → finds the campaign
 *   DEVICE B plays on, DEVICE A (stale) tries to save → conflict, merge, retry
 *   both devices end on one identical save
 *
 * Run:  npm run accounts:probe                       (production Worker)
 *       npm run accounts:probe -- --url http://localhost:4177/api
 *       npm run accounts:probe -- --keep             (leave the pilot behind)
 */

import { deriveVerifier } from '../server/credentials.mjs';
import { mergeProgress } from '../server/progressmerge.mjs';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = (argOf('--url', process.env.VEYRA_API_URL ?? 'https://veyra-prime.seesianga.workers.dev/api')).replace(/\/+$/, '');
const ORIGIN = argOf('--origin', 'https://robot-mech.pages.dev');

let failures = 0;
const ok = (label, cond, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${cond || !detail ? '' : ` — ${detail}`}`);
  if (!cond) failures++;
};

async function call(path, { method = 'GET', token = '', body } = {}) {
  const headers = { origin: ORIGIN, accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let parsed = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
  return { status: res.status, body: parsed, headers: res.headers };
}

const callsign = `Probe ${Math.random().toString(36).slice(2, 8)}`;
const passcode = `pc-${Math.random().toString(36).slice(2, 10)}`;

console.log(`Veyra Prime — pilot registry probe\n  API      ${BASE}\n  Origin   ${ORIGIN}\n  Callsign ${callsign}\n`);

// ---- reachability + CORS ----------------------------------------------------
console.log('reachability');
const health = await call('/health');
ok('service answers /health', health.status === 200, `status ${health.status}`);
if (health.status !== 200) {
  console.log('\nThe API is not reachable — nothing else can be checked.');
  process.exit(1);
}
const preflight = await fetch(`${BASE}/auth/login`, {
  method: 'OPTIONS',
  headers: { origin: ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' },
});
ok('preflight accepts the game origin', preflight.status === 204 || preflight.status === 200, `status ${preflight.status}`);
ok('preflight echoes the origin', preflight.headers.get('access-control-allow-origin') === ORIGIN,
  String(preflight.headers.get('access-control-allow-origin')));
const evil = await fetch(`${BASE}/auth/login`, { method: 'OPTIONS', headers: { origin: 'https://not-the-game.example' } });
ok('preflight refuses an unknown origin', !evil.headers.get('access-control-allow-origin'));

// ---- device A: register and play -------------------------------------------
console.log('\ndevice A — a new pilot');
const verifier = await deriveVerifier(passcode, callsign);
const reg = await call('/auth/register', { method: 'POST', body: { callsign, verifier, device: 'probe-A' } });
ok('registers', reg.status === 201, `status ${reg.status} ${JSON.stringify(reg.body).slice(0, 160)}`);
if (reg.status !== 201) process.exit(1);
const tokenA = reg.body.token;
ok('starts a fresh campaign', reg.body.progress?.unlocked === 1 && reg.body.rev === 0);

const saveA = { unlocked: 4, scrip: 1750, completed: { 1: { scrip: 250, at: Date.now() } }, tutorialDone: true };
const pushA = await call('/progress', { method: 'PUT', token: tokenA, body: { baseRev: 0, progress: saveA, device: 'probe-A' } });
ok('saves three missions of progress', pushA.status === 200 && pushA.body.rev === 1, `status ${pushA.status}`);

// ---- device B: the actual feature -------------------------------------------
console.log('\ndevice B — same pilot, different device');
const loginB = await call('/auth/login', { method: 'POST', body: { callsign, verifier, device: 'probe-B' } });
ok('signs in with the same credentials', loginB.status === 200, `status ${loginB.status} ${JSON.stringify(loginB.body).slice(0, 160)}`);
const tokenB = loginB.body.token;
ok('gets its own session token', Boolean(tokenB) && tokenB !== tokenA);
ok('finds the campaign already there', loginB.body.progress?.unlocked === 4, `unlocked=${loginB.body.progress?.unlocked}`);
ok('finds the wallet already there', loginB.body.progress?.scrip === 1750, `scrip=${loginB.body.progress?.scrip}`);
ok('agrees on the revision', loginB.body.rev === 1);

const wrong = await call('/auth/login', { method: 'POST', body: { callsign, verifier: await deriveVerifier('not-it', callsign), device: 'probe-B' } });
ok('a wrong passcode is refused', wrong.status === 401, `status ${wrong.status}`);

// ---- divergence, conflict, merge --------------------------------------------
console.log('\nboth devices, diverging');
const saveB = { ...saveA, unlocked: 6, scrip: 1900, completed: { ...saveA.completed, 4: { scrip: 400, at: Date.now() } } };
const pushB = await call('/progress', { method: 'PUT', token: tokenB, body: { baseRev: 1, progress: saveB, device: 'probe-B' } });
ok('device B saves two more missions', pushB.status === 200 && pushB.body.rev === 2);

const staleA = { ...saveA, scrip: 2400, completed: { ...saveA.completed, 4: { scrip: 250, at: Date.now() } } };
const conflict = await call('/progress', { method: 'PUT', token: tokenA, body: { baseRev: 1, progress: staleA, device: 'probe-A' } });
ok('device A is refused, not allowed to clobber', conflict.status === 409, `status ${conflict.status}`);
ok('the refusal carries device B\'s copy', conflict.body.progress?.unlocked === 6);
ok('the refusal carries the current revision', conflict.body.rev === 2);

const merged = mergeProgress(staleA, conflict.body.progress);
ok('merge keeps device B\'s further unlock', merged.unlocked === 6, `unlocked=${merged.unlocked}`);
ok('merge keeps the larger wallet', merged.scrip === 2400, `scrip=${merged.scrip}`);
ok('merge keeps the better mission payout', merged.completed[4]?.scrip === 400);
const retry = await call('/progress', { method: 'PUT', token: tokenA, body: { baseRev: conflict.body.rev, progress: merged, device: 'probe-A' } });
ok('the merged retry lands', retry.status === 200 && retry.body.rev === 3, `status ${retry.status}`);

console.log('\nconvergence');
const finalA = await call('/progress', { token: tokenA });
const finalB = await call('/progress', { token: tokenB });
ok('both devices read the same revision', finalA.body.rev === finalB.body.rev && finalA.body.rev === 3);
ok('both devices read the same save', JSON.stringify(finalA.body.progress) === JSON.stringify(finalB.body.progress));
ok('nothing was lost by the merge', finalA.body.progress.unlocked === 6 && finalA.body.progress.scrip === 2400);

// ---- session hygiene ---------------------------------------------------------
console.log('\nsessions');
const me = await call('/auth/me', { token: tokenA });
ok('/auth/me resolves', me.status === 200);
ok('no password material comes back', !/pass_hash|pass_salt|verifier/i.test(JSON.stringify(me.body)));
const noAuth = await call('/auth/me');
ok('a missing token is a 401', noAuth.status === 401);
const badAuth = await call('/auth/me', { token: 'not-a-real-token' });
ok('a forged token is a 401', badAuth.status === 401);

if (!args.includes('--keep')) {
  await call('/auth/logout', { method: 'POST', token: tokenA });
  const afterLogout = await call('/auth/me', { token: tokenA });
  ok('logout invalidates the token', afterLogout.status === 401);
  const stillB = await call('/auth/me', { token: tokenB });
  ok('the other device stays signed in', stillB.status === 200);
  await call('/auth/logout-all', { method: 'POST', token: tokenB });
  ok('logout-all clears the rest', (await call('/auth/me', { token: tokenB })).status === 401);
}

console.log(`\n${failures ? `✗ ${failures} check(s) failed` : '✓ all checks passed'}`);
console.log(`  probe pilot: ${callsign}${args.includes('--keep') ? ` / ${passcode} (kept)` : ''}`);
process.exit(failures ? 1 : 0);
