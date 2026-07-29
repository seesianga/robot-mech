-- Veyra Prime — pilot accounts, sessions and campaign progress.
-- Applied with: npm run db:migrate        (local  — .wrangler/state)
--               npm run db:migrate:remote  (production D1)

CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,
  callsign      TEXT NOT NULL,            -- display form, case preserved
  callsign_key  TEXT NOT NULL UNIQUE,     -- lookup form: trimmed, lowercased
  pass_hash     TEXT NOT NULL,            -- PBKDF2(client verifier, pass_salt)
  pass_salt     TEXT NOT NULL,            -- random per account, hex
  kdf           TEXT NOT NULL DEFAULT 'v1',
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL
);

-- One campaign save per pilot. `rev` is the optimistic-concurrency token: a
-- write states the rev it was based on and only lands if that is still current,
-- so two devices can never silently overwrite one another.
CREATE TABLE IF NOT EXISTS progress (
  account_id  TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  rev         INTEGER NOT NULL DEFAULT 0,
  data        TEXT NOT NULL,              -- JSON Progress blob
  updated_at  INTEGER NOT NULL,
  device      TEXT NOT NULL DEFAULT ''    -- last writer, for player-facing copy
);

-- Only the SHA-256 of a session token is stored: a database dump yields no
-- usable sessions. One row per signed-in device.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash    TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  device        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sessions_account_idx ON sessions(account_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx  ON sessions(expires_at);

-- Sliding-window counters behind the sign-in and registration rate limits.
CREATE TABLE IF NOT EXISTS throttles (
  key           TEXT PRIMARY KEY,
  count         INTEGER NOT NULL DEFAULT 0,
  window_start  INTEGER NOT NULL
);
