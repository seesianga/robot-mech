/**
 * Cloudflare D1 (SQLite) implementation of the account store contract — see
 * accountstore-memory.mjs for the contract itself and migrations/0001_accounts.sql
 * for the schema.
 *
 * Two details carry the correctness of the whole sync design:
 *
 *   1. insertAccount leans on UNIQUE(callsign_key) instead of a read-then-write.
 *      A SELECT-then-INSERT would let two simultaneous registrations of the same
 *      callsign both pass the check.
 *
 *   2. putProgress is a single conditional UPDATE ... WHERE rev = ?. SQLite
 *      applies it atomically, so `meta.changes === 1` is proof that this write
 *      was the one that advanced the revision. Two devices racing cannot both
 *      succeed, and the loser is told to merge rather than being allowed to
 *      overwrite the winner.
 */

export class D1AccountStore {
  constructor(db) {
    this.db = db;
  }

  // ---------- accounts ----------

  async insertAccount(row) {
    try {
      const res = await this.db
        .prepare(`INSERT INTO accounts
            (id, callsign, callsign_key, pass_hash, pass_salt, kdf, created_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(row.id, row.callsign, row.callsign_key, row.pass_hash, row.pass_salt, row.kdf, row.created_at, row.last_seen_at)
        .run();
      return res.success !== false;
    } catch (e) {
      if (isUniqueViolation(e)) return false;
      throw e;
    }
  }

  async findAccountByKey(key) {
    return this.db.prepare('SELECT * FROM accounts WHERE callsign_key = ?').bind(key).first();
  }

  async findAccountById(id) {
    return this.db.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first();
  }

  async touchAccount(id, at) {
    await this.db.prepare('UPDATE accounts SET last_seen_at = ? WHERE id = ?').bind(at, id).run();
  }

  // ---------- progress ----------

  async getProgress(accountId) {
    return this.db.prepare('SELECT rev, data, updated_at, device FROM progress WHERE account_id = ?').bind(accountId).first();
  }

  async initProgress(accountId, data, at) {
    await this.db
      .prepare('INSERT OR IGNORE INTO progress (account_id, rev, data, updated_at, device) VALUES (?, 0, ?, ?, ?)')
      .bind(accountId, data, at, '')
      .run();
  }

  async putProgress(accountId, baseRev, data, at, device) {
    const res = await this.db
      .prepare('UPDATE progress SET data = ?, rev = rev + 1, updated_at = ?, device = ? WHERE account_id = ? AND rev = ?')
      .bind(data, at, device, accountId, baseRev)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }

  // ---------- sessions ----------

  async insertSession(row) {
    await this.db
      .prepare(`INSERT OR REPLACE INTO sessions
          (token_hash, account_id, created_at, last_used_at, expires_at, device)
        VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(row.token_hash, row.account_id, row.created_at, row.last_used_at, row.expires_at, row.device ?? '')
      .run();
  }

  async findSession(hash) {
    return this.db.prepare('SELECT * FROM sessions WHERE token_hash = ?').bind(hash).first();
  }

  async touchSession(hash, at, expires) {
    await this.db
      .prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?')
      .bind(at, expires, hash)
      .run();
  }

  async deleteSession(hash) {
    await this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();
  }

  async deleteSessionsForAccount(accountId) {
    await this.db.prepare('DELETE FROM sessions WHERE account_id = ?').bind(accountId).run();
  }

  async purgeExpiredSessions(now) {
    // bounded so housekeeping can never dominate a sign-in request
    await this.db
      .prepare('DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires_at <= ? LIMIT 200)')
      .bind(now)
      .run();
  }

  // ---------- throttles ----------

  async throttleCount(key, now, windowMs) {
    const row = await this.db.prepare('SELECT count, window_start FROM throttles WHERE key = ?').bind(key).first();
    if (!row) return 0;
    if (now - row.window_start >= windowMs) return 0;
    return row.count;
  }

  /** Upsert that rolls the window over when it has elapsed — one round trip. */
  async throttleHit(key, now, windowMs) {
    const res = await this.db
      .prepare(`INSERT INTO throttles (key, count, window_start) VALUES (?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET
          count = CASE WHEN ? - throttles.window_start >= ? THEN 1 ELSE throttles.count + 1 END,
          window_start = CASE WHEN ? - throttles.window_start >= ? THEN ? ELSE throttles.window_start END
        RETURNING count`)
      .bind(key, now, now, windowMs, now, windowMs, now)
      .first();
    return res?.count ?? 1;
  }

  async clearThrottle(key) {
    await this.db.prepare('DELETE FROM throttles WHERE key = ?').bind(key).run();
  }
}

function isUniqueViolation(e) {
  const msg = String(e?.message ?? e ?? '');
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(msg);
}
