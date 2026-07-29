/**
 * Credential primitives shared by the browser client and the account service.
 * Runtime-agnostic: WebCrypto only (browser, Workers, Node 18+).
 *
 * WHY A CLIENT-SIDE KDF
 * ---------------------
 * The passcode NEVER leaves the device. The client derives
 *
 *     verifier = PBKDF2-SHA256(passcode, salt = "veyra.prime.pilot.v1|<callsign>", 200k)
 *
 * and sends only that. The service treats the verifier as an opaque secret and
 * stores PBKDF2-SHA256(verifier, random per-account salt, 12k).
 *
 * Two properties fall out of the split:
 *   1. An attacker holding a database dump still has to run the 200k-iteration
 *      client KDF per password guess — the stretching is not lost by making the
 *      server side cheap.
 *   2. The server side stays inside a Workers CPU slice. A 200k PBKDF2 costs
 *      ~50ms of CPU; on the free plan (10ms/request) every sign-in would be
 *      killed. 12k lands around 3ms, which fits with room to spare.
 *
 * The client salt has to be derivable from the callsign alone — a device
 * signing in for the first time has nothing else to go on, and asking the
 * server for a per-account salt would hand out a user-enumeration oracle. It is
 * therefore deterministic rather than random, which is the accepted trade for
 * login-from-anywhere. Uniqueness (no two pilots share a salt) is what stops
 * cross-account rainbow tables, and the callsign is unique by construction.
 */

/** Client-side stretch. Bump `version` and the service can migrate lazily. */
export const CLIENT_KDF = {
  version: 1,
  hash: 'SHA-256',
  iterations: 200_000,
  bytes: 32,
  saltPrefix: 'veyra.prime.pilot.v1|',
};

/** Server-side stretch applied to the verifier before storage. */
export const SERVER_KDF = { hash: 'SHA-256', iterations: 12_000, bytes: 32 };

export const CALLSIGN_RE = /^[A-Za-z0-9 _-]{2,24}$/;
/** New registrations only. Legacy local profiles migrate with whatever they
 *  had — the service can't see passcode length, so this is a client-side gate. */
export const MIN_PASSCODE = 6;

export function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256hex(str) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return toHex(digest);
}

/** Canonical lookup form: trimmed, collapsed inner whitespace, lowercased.
 *  "  Ash  Vane " and "ash vane" are the same pilot. */
export function callsignKey(callsign) {
  return String(callsign ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Display form: trimmed and whitespace-collapsed, case preserved. */
export function normalizeCallsign(callsign) {
  return String(callsign ?? '').trim().replace(/\s+/g, ' ');
}

/** @returns {string} the normalized callsign
 *  @throws {Error} with player-facing copy */
export function assertCallsign(callsign) {
  const cs = normalizeCallsign(callsign);
  if (!CALLSIGN_RE.test(cs)) throw new Error('Callsign: 2-24 letters, digits, spaces, - or _');
  return cs;
}

async function pbkdf2(secret, saltBytes, iterations, bytes, hash) {
  const key = await crypto.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations, hash }, key, bytes * 8);
  return toHex(bits);
}

/**
 * The value the client sends in place of the passcode. Deterministic for a
 * given (passcode, callsign) pair on every device — that is the whole point.
 */
export async function deriveVerifier(passcode, callsign) {
  const enc = new TextEncoder();
  const salt = enc.encode(CLIENT_KDF.saltPrefix + callsignKey(callsign));
  return pbkdf2(enc.encode(String(passcode)), salt, CLIENT_KDF.iterations, CLIENT_KDF.bytes, CLIENT_KDF.hash);
}

/** Storage hash of a verifier, under a random per-account salt. */
export async function hashVerifier(verifier, saltHex) {
  const enc = new TextEncoder();
  return pbkdf2(enc.encode(String(verifier)), hexToBytes(saltHex), SERVER_KDF.iterations, SERVER_KDF.bytes, SERVER_KDF.hash);
}

export function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function randomHex(bytes) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** URL-safe opaque session token (256 bits). */
export function randomToken() {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  let bin = '';
  for (const b of raw) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Constant-time comparison of two non-empty hex digests. Both sides are the
 *  same fixed length here, but the compare costs nothing and removes the
 *  question. Empty/absent input is never equal to anything. */
export function timingSafeEqual(a, b) {
  const x = String(a ?? '');
  const y = String(b ?? '');
  if (!x || !y || x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
