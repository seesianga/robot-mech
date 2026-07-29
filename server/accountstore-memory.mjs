/**
 * Reference store adapter — defines the contract every backend implements.
 * In-memory by default; pass a file path and it persists as JSON, which is what
 * the LAN dev server (`npm run mp`) uses so a local pilot survives a restart.
 *
 * THE CONTRACT (also implemented by accountstore-d1.mjs):
 *   insertAccount(row)                 → true, or false if callsign_key is taken
 *   findAccountByKey(key) / findAccountById(id) → row | null
 *   touchAccount(id, at)
 *   getProgress(accountId)             → { rev, data, updated_at, device } | null
 *   initProgress(accountId, data, at)  → creates rev 0 if absent (idempotent)
 *   putProgress(id, baseRev, data, at, device) → true iff the stored rev was
 *                                        baseRev; the write is atomic and the
 *                                        revision increments by exactly one
 *   insertSession(row) / findSession(hash) / touchSession(hash, at, expires)
 *   deleteSession(hash) / deleteSessionsForAccount(id) / purgeExpiredSessions(now)
 *   throttleCount(key, now, windowMs)  → hits inside the window
 *   throttleHit(key, now, windowMs)    → record one, returns the new count
 *   clearThrottle(key)
 */

import fs from 'node:fs';

export class MemoryAccountStore {
  constructor({ file = '' } = {}) {
    this.file = file;
    this.accounts = new Map();  // id → row
    this.byKey = new Map();     // callsign_key → id
    this.progress = new Map();  // account_id → { rev, data, updated_at, device }
    this.sessions = new Map();  // token_hash → row
    this.throttles = new Map(); // key → { count, window_start }
    if (file && fs.existsSync(file)) this.#load();
  }

  #load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const a of raw.accounts ?? []) { this.accounts.set(a.id, a); this.byKey.set(a.callsign_key, a.id); }
      for (const [k, v] of Object.entries(raw.progress ?? {})) this.progress.set(k, v);
      for (const [k, v] of Object.entries(raw.sessions ?? {})) this.sessions.set(k, v);
    } catch (e) {
      console.warn('[accounts] could not read', this.file, '-', e.message);
    }
  }

  #persist() {
    if (!this.file) return;
    const out = {
      accounts: [...this.accounts.values()],
      progress: Object.fromEntries(this.progress),
      sessions: Object.fromEntries(this.sessions),
    };
    fs.writeFileSync(this.file, JSON.stringify(out, null, 2));
  }

  // ---------- accounts ----------

  async insertAccount(row) {
    if (this.byKey.has(row.callsign_key)) return false;
    this.accounts.set(row.id, { ...row });
    this.byKey.set(row.callsign_key, row.id);
    this.#persist();
    return true;
  }

  async findAccountByKey(key) {
    const id = this.byKey.get(key);
    return id ? { ...this.accounts.get(id) } : null;
  }

  async findAccountById(id) {
    const row = this.accounts.get(id);
    return row ? { ...row } : null;
  }

  async touchAccount(id, at) {
    const row = this.accounts.get(id);
    if (row) { row.last_seen_at = at; this.#persist(); }
  }

  // ---------- progress ----------

  async getProgress(accountId) {
    const row = this.progress.get(accountId);
    return row ? { ...row } : null;
  }

  async initProgress(accountId, data, at) {
    if (this.progress.has(accountId)) return;
    this.progress.set(accountId, { rev: 0, data, updated_at: at, device: '' });
    this.#persist();
  }

  async putProgress(accountId, baseRev, data, at, device) {
    const row = this.progress.get(accountId);
    if (!row || row.rev !== baseRev) return false;
    this.progress.set(accountId, { rev: baseRev + 1, data, updated_at: at, device });
    this.#persist();
    return true;
  }

  // ---------- sessions ----------

  async insertSession(row) {
    this.sessions.set(row.token_hash, { ...row });
    this.#persist();
  }

  async findSession(hash) {
    const row = this.sessions.get(hash);
    return row ? { ...row } : null;
  }

  async touchSession(hash, at, expires) {
    const row = this.sessions.get(hash);
    if (row) { row.last_used_at = at; row.expires_at = expires; this.#persist(); }
  }

  async deleteSession(hash) {
    if (this.sessions.delete(hash)) this.#persist();
  }

  async deleteSessionsForAccount(accountId) {
    for (const [hash, row] of this.sessions) if (row.account_id === accountId) this.sessions.delete(hash);
    this.#persist();
  }

  async purgeExpiredSessions(now) {
    let dropped = false;
    for (const [hash, row] of this.sessions) if (row.expires_at <= now) { this.sessions.delete(hash); dropped = true; }
    if (dropped) this.#persist();
  }

  // ---------- throttles (never persisted — a restart is a fresh window) ----------

  async throttleCount(key, now, windowMs) {
    const row = this.throttles.get(key);
    if (!row || now - row.window_start >= windowMs) return 0;
    return row.count;
  }

  async throttleHit(key, now, windowMs) {
    const row = this.throttles.get(key);
    if (!row || now - row.window_start >= windowMs) {
      this.throttles.set(key, { count: 1, window_start: now });
      return 1;
    }
    row.count += 1;
    return row.count;
  }

  async clearThrottle(key) {
    this.throttles.delete(key);
  }
}
