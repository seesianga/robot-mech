/**
 * Seed a signed-in pilot into a Playwright page, for harnesses that need to
 * start past the sign-in screen (hangar shots, hangar UI suite).
 *
 * Accounts live in the registry now, so there are two honest ways to be signed
 * in and this module offers both:
 *
 *   seedOffline(page, ...)     — plant the local cache with a token the registry
 *                                will never recognise. The app resumes from the
 *                                cache and reports 'offline', which is exactly
 *                                the supported no-network path. Use when the
 *                                harness runs no account API.
 *
 *   seedRegistered(page, ...)  — actually register through the API and plant the
 *                                real session. Use when the harness already runs
 *                                one (npm run mp serves it on :4177), so the
 *                                test exercises the real cloud-backed path.
 *
 * Both write the same localStorage record the client uses (`veyra.account.v2`);
 * keep it in step with CacheRecord in src/save/profiles.ts.
 */

import { deriveVerifier, sha256hex } from '../server/credentials.mjs';

/** Matches CacheFile in src/save/profiles.ts: one record per pilot, plus the
 *  id of whichever one is signed in. */
const CACHE_KEY = 'veyra.account.v3';
const cacheFile = (rec) => ({ v: 3, activeId: rec.id, accounts: { [rec.id]: rec } });

export function fullProgress(overrides = {}) {
  return {
    unlocked: 4,
    scrip: 30000,
    tutorialDone: true,
    completed: { 1: { scrip: 300, at: 1 }, 2: { scrip: 300, at: 1 }, 3: { scrip: 400, at: 1 } },
    ...overrides,
  };
}

function record({ id, callsign, token, rev, progress, verifierDigest }) {
  return {
    id,
    callsign,
    createdAt: 1,
    token,
    expiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000,
    rev,
    progress,
    dirty: false,
    verifierDigest: verifierDigest ?? '',
    lastSyncedAt: Date.now(),
  };
}

/** No API needed: the app resumes from the cache and runs in 'offline' state. */
export async function seedOffline(page, { callsign = 'TESTER', progress = fullProgress() } = {}) {
  const rec = record({
    id: 'test-account-0000',
    callsign,
    token: 'offline-harness-token',
    rev: 0,
    progress,
  });
  await page.addInitScript(([key, value]) => {
    localStorage.setItem(key, value);
  }, [CACHE_KEY, JSON.stringify(cacheFile(rec))]);
  return rec;
}

/**
 * Register through the real API and plant the resulting session, so the page
 * comes up signed in against an account that genuinely exists.
 * @param {string} apiBase e.g. http://localhost:4177/api
 */
export async function seedRegistered(page, { apiBase, callsign, passcode = 'harness-pass', progress = fullProgress() } = {}) {
  const cs = callsign ?? `Harness ${Math.random().toString(36).slice(2, 8)}`;
  const verifier = await deriveVerifier(passcode, cs);

  const reg = await fetch(`${apiBase}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callsign: cs, verifier, device: 'harness' }),
  });
  if (reg.status !== 201) throw new Error(`harness registration failed: ${reg.status} ${await reg.text()}`);
  const session = await reg.json();

  const put = await fetch(`${apiBase}/progress`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ baseRev: session.rev, progress, device: 'harness' }),
  });
  if (put.status !== 200) throw new Error(`harness progress seed failed: ${put.status} ${await put.text()}`);
  const { rev } = await put.json();

  const rec = record({
    id: session.account.id,
    callsign: session.account.callsign,
    token: session.token,
    rev,
    progress,
    verifierDigest: await sha256hex(`veyra.offline.v1|${verifier}`),
  });
  await page.addInitScript(([key, value]) => {
    localStorage.setItem(key, value);
  }, [CACHE_KEY, JSON.stringify(cacheFile(rec))]);
  return { ...rec, passcode };
}
