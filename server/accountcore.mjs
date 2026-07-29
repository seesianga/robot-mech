/**
 * Pilot accounts, sessions and campaign progress — the server-side authority
 * that replaced per-browser localStorage profiles. Runtime-agnostic: all
 * persistence goes through an injected store adapter (D1 in the Worker,
 * in-memory/JSON for tests and the LAN dev server), all crypto is WebCrypto.
 *
 * Transport lives next door in accountapi.mjs. Nothing in here knows about
 * Request/Response, so the whole surface is testable in plain Node.
 *
 * What the service guarantees
 *   - A callsign is claimed exactly once, case- and whitespace-insensitively.
 *   - The passcode is never transmitted or stored (see credentials.mjs).
 *   - A session token is a random 256-bit opaque string; only its SHA-256 is
 *     stored, so a database dump does not yield usable sessions.
 *   - Progress writes are optimistically concurrent: a write states the
 *     revision it was based on, and a stale write is REJECTED rather than
 *     applied. That rejection is what makes two devices safe — the loser gets
 *     the winner's copy back and merges (server/progressmerge.mjs).
 *
 * What it deliberately does not do: adjudicate campaign progress. Single-player
 * progress is client-authoritative in this build; the service validates shape
 * and size only (anti-corruption, not anti-cheat).
 */

import {
  assertCallsign,
  callsignKey,
  hashVerifier,
  randomHex,
  randomToken,
  sha256hex,
  timingSafeEqual,
} from './credentials.mjs';
import { validateProgress } from './progressmerge.mjs';

export const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days, sliding
const SESSION_TOUCH_MS = 12 * 60 * 60 * 1000;            // only re-write the row twice a day
const VERIFIER_RE = /^[0-9a-f]{64}$/;                    // 32 bytes of client KDF output, hex

/** Failed sign-ins tolerated before the pair is locked out for the window. */
const THROTTLE = {
  windowMs: 15 * 60 * 1000,
  loginPerCallsign: 12,
  loginPerIp: 60,
  registerPerIp: 8,
  registerWindowMs: 60 * 60 * 1000,
};

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const freshProgress = () => ({ unlocked: 1, scrip: 0, completed: {}, tutorialDone: false });

function requireVerifier(v) {
  if (typeof v !== 'string' || !VERIFIER_RE.test(v)) {
    throw new ApiError(400, 'BAD_VERIFIER', 'This client sent a malformed credential. Reload the game and try again.');
  }
  return v;
}

function deviceLabel(v) {
  return typeof v === 'string' ? v.slice(0, 64) : '';
}

export class AccountService {
  /**
   * @param {object} store   adapter — see accountstore-memory.mjs for the contract
   * @param {object} [opts]
   * @param {() => number} [opts.now]
   * @param {() => string} [opts.newId]
   */
  constructor(store, opts = {}) {
    this.store = store;
    this.now = opts.now ?? (() => Date.now());
    this.newId = opts.newId ?? (() => crypto.randomUUID());
  }

  // ---------- identity ----------

  async register({ callsign, verifier, device, ip }) {
    const cs = assertCallsignOr400(callsign);
    const key = callsignKey(cs);
    requireVerifier(verifier);
    await this.#throttle(`reg:${ip || 'anon'}`, THROTTLE.registerPerIp, THROTTLE.registerWindowMs,
      'Too many pilots registered from here. Try again later.');

    const now = this.now();
    const salt = randomHex(16);
    const account = {
      id: this.newId(),
      callsign: cs,
      callsign_key: key,
      pass_hash: await hashVerifier(verifier, salt),
      pass_salt: salt,
      kdf: 'v1',
      created_at: now,
      last_seen_at: now,
    };
    // UNIQUE(callsign_key) is the real gate — a pre-check would still race
    const inserted = await this.store.insertAccount(account);
    if (!inserted) throw new ApiError(409, 'CALLSIGN_TAKEN', 'That callsign is already registered.');
    await this.store.initProgress(account.id, JSON.stringify(freshProgress()), now);
    await this.store.throttleHit(`reg:${ip || 'anon'}`, now, THROTTLE.registerWindowMs);
    return this.#issue(account, device, now);
  }

  async login({ callsign, verifier, device, ip }) {
    const cs = assertCallsignOr400(callsign);
    const key = callsignKey(cs);
    requireVerifier(verifier);
    await this.#throttle(`ip:${ip || 'anon'}`, THROTTLE.loginPerIp, THROTTLE.windowMs,
      'Too many sign-in attempts from here. Try again in a few minutes.');
    await this.#throttle(`cs:${key}`, THROTTLE.loginPerCallsign, THROTTLE.windowMs,
      'Too many sign-in attempts for that callsign. Try again in a few minutes.');

    const account = await this.store.findAccountByKey(key);
    // same rejection either way — an unknown callsign and a wrong passcode must
    // be indistinguishable, or the endpoint enumerates the pilot roster
    const ok = account && timingSafeEqual(account.pass_hash, await hashVerifier(verifier, account.pass_salt));
    if (!ok) {
      await this.#countFailure(key, ip);
      throw new ApiError(401, 'BAD_CREDENTIALS', 'Callsign or passcode not recognised.');
    }
    await this.store.clearThrottle(`cs:${key}`);
    const now = this.now();
    await this.store.touchAccount(account.id, now);
    return this.#issue(account, device, now);
  }

  async me(token) {
    const { account, session, expiresAt } = await this.#auth(token);
    const row = await this.#progressRow(account.id);
    return {
      account: publicAccount(account),
      progress: JSON.parse(row.data),
      rev: row.rev,
      expiresAt,
      session: { device: session.device ?? '', createdAt: session.created_at, expiresAt },
    };
  }

  async logout(token) {
    const hash = await sha256hex(String(token ?? ''));
    await this.store.deleteSession(hash);
    return { ok: true };
  }

  /** Sign every device out — the "I lost my phone" lever. */
  async logoutAll(token) {
    const { account } = await this.#auth(token);
    await this.store.deleteSessionsForAccount(account.id);
    return { ok: true };
  }

  // ---------- progress ----------

  async getProgress(token) {
    const { account, expiresAt } = await this.#auth(token);
    const row = await this.#progressRow(account.id);
    // sessionExpiresAt rides along on every authenticated call: the session
    // slides server-side on use, and a client that never learns the new value
    // would eventually believe a perfectly good session had lapsed
    return { rev: row.rev, progress: JSON.parse(row.data), updatedAt: row.updated_at, device: row.device ?? '', sessionExpiresAt: expiresAt };
  }

  /**
   * Optimistically concurrent write.
   * @returns {{ok: true, rev: number}} on success
   * @throws {ApiError} 409 carrying the current server copy when `baseRev` is
   *         stale — the caller merges and retries.
   */
  async putProgress(token, { baseRev, progress, device }) {
    const { account, expiresAt } = await this.#auth(token);
    if (!Number.isInteger(baseRev) || baseRev < 0) {
      throw new ApiError(400, 'BAD_BASE_REV', 'A progress write must state the revision it was based on.');
    }
    const errs = validateProgress(progress);
    if (errs.length) throw new ApiError(422, 'BAD_PROGRESS', `Progress rejected: ${errs.join('; ')}`);

    const now = this.now();
    const written = await this.store.putProgress(account.id, baseRev, JSON.stringify(progress), now, deviceLabel(device));
    if (!written) {
      const current = await this.#progressRow(account.id);
      const err = new ApiError(409, 'REV_CONFLICT', 'This pilot was played on another device — merge and retry.');
      err.payload = { rev: current.rev, progress: JSON.parse(current.data), updatedAt: current.updated_at, device: current.device ?? '' };
      throw err;
    }
    await this.store.touchAccount(account.id, now);
    return { ok: true, rev: baseRev + 1, sessionExpiresAt: expiresAt };
  }

  // ---------- internals ----------

  async #issue(account, device, now) {
    const token = randomToken();
    await this.store.insertSession({
      token_hash: await sha256hex(token),
      account_id: account.id,
      created_at: now,
      last_used_at: now,
      expires_at: now + SESSION_TTL_MS,
      device: deviceLabel(device),
    });
    // opportunistic housekeeping; never let it fail a sign-in
    try { await this.store.purgeExpiredSessions(now); } catch { /* best effort */ }
    const row = await this.#progressRow(account.id);
    return {
      token,
      account: publicAccount(account),
      progress: JSON.parse(row.data),
      rev: row.rev,
      expiresAt: now + SESSION_TTL_MS,
    };
  }

  async #auth(token) {
    const raw = String(token ?? '');
    if (!raw) throw new ApiError(401, 'NO_SESSION', 'Sign in to sync this pilot.');
    const hash = await sha256hex(raw);
    const session = await this.store.findSession(hash);
    const now = this.now();
    if (!session) throw new ApiError(401, 'NO_SESSION', 'Session not recognised. Sign in again.');
    if (session.expires_at <= now) {
      await this.store.deleteSession(hash);
      throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired. Sign in again.');
    }
    const account = await this.store.findAccountById(session.account_id);
    if (!account) {
      await this.store.deleteSession(hash);
      throw new ApiError(401, 'NO_SESSION', 'Session not recognised. Sign in again.');
    }
    // sliding expiry, written at most twice a day so reads stay read-only
    let expiresAt = session.expires_at;
    if (now - session.last_used_at > SESSION_TOUCH_MS) {
      expiresAt = now + SESSION_TTL_MS;
      await this.store.touchSession(hash, now, expiresAt);
    }
    return { account, session, expiresAt };
  }

  /** Progress row, created on demand — an account always has one. */
  async #progressRow(accountId) {
    const row = await this.store.getProgress(accountId);
    if (row) return row;
    const now = this.now();
    await this.store.initProgress(accountId, JSON.stringify(freshProgress()), now);
    return (await this.store.getProgress(accountId))
      ?? { rev: 0, data: JSON.stringify(freshProgress()), updated_at: now, device: '' };
  }

  async #throttle(key, limit, windowMs, message) {
    const count = await this.store.throttleCount(key, this.now(), windowMs);
    if (count >= limit) throw new ApiError(429, 'RATE_LIMITED', message);
  }

  async #countFailure(callsignKeyValue, ip) {
    await this.store.throttleHit(`cs:${callsignKeyValue}`, this.now(), THROTTLE.windowMs);
    await this.store.throttleHit(`ip:${ip || 'anon'}`, this.now(), THROTTLE.windowMs);
  }
}

function assertCallsignOr400(callsign) {
  try {
    return assertCallsign(callsign);
  } catch (e) {
    throw new ApiError(400, 'BAD_CALLSIGN', e instanceof Error ? e.message : String(e));
  }
}

function publicAccount(account) {
  return { id: account.id, callsign: account.callsign, createdAt: account.created_at };
}
