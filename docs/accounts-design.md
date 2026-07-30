# Pilot accounts and cloud saves

**Problem this solves.** Accounts used to live in `localStorage`. A pilot created on a
laptop did not exist on a phone, so every device meant starting the campaign again.
Accounts, campaign progress, the hangar and the scrip wallet now live in a database
behind an API, keyed by callsign, and any device that signs in gets the same save.

---

## 1 · Where things live

```
browser  ── src/save/profiles.ts ──┐   write-through cache in localStorage
         └─ src/save/cloud.ts ─────┤   HTTP, bearer token, no cookies
                                   │
                            /api/* │   CORS allowlist (accountapi.mjs)
                                   ▼
robot-mech Worker ── worker/index.mjs
         ├── /ws     → MatchLobby Durable Object   (unchanged)
         └── /api/*  → AccountService              (server/accountcore.mjs)
                            │
                            └── D1  "veyra-accounts"   (stable pre-rename database)
```

The game itself is served from Cloudflare **Pages** (`robot-mech.pages.dev`). Pages can
host neither a Durable Object nor a D1-backed API, so both stay on the **Worker** and the
browser reaches them cross-origin. `.env.production` bakes in `VITE_API_URL` and
`VITE_MP_URL`; with neither set the client falls back to same-origin `/api` and `/ws`,
which is correct if the game is ever served from the Worker again.

The D1 database, credential salt, browser storage keys, and model namespace keep their
pre-rename identifiers by design. Renaming them would orphan accounts, invalidate passcodes,
discard local saves/settings, or break asset URLs. `content/brand.json` records that exact
compatibility boundary while Robot Mech remains the only product/deployment identity.

Everything above the storage adapter is runtime-agnostic, so the same service code runs
in three places:

| Where | Store adapter | Entry point |
|---|---|---|
| Production | `accountstore-d1.mjs` (D1) | `worker/index.mjs` |
| `wrangler dev` | D1 local (`.wrangler/state`) | `worker/index.mjs` |
| `npm run mp` (LAN/dev) | `accountstore-memory.mjs` (JSON file) | `server/mp-server.mjs` |
| Tests | `accountstore-memory.mjs` (RAM) | `scripts/test_accounts.mjs` |

---

## 2 · Credentials: the passcode never leaves the device

`server/credentials.mjs` splits the key derivation:

```
client   verifier = PBKDF2-SHA256(passcode, salt="veyra.prime.pilot.v1|<callsign>", 200 000)
  ↓ TLS  (only the verifier is transmitted — never the passcode)
service  stored   = PBKDF2-SHA256(verifier, random per-account salt, 12 000)
```

Two things fall out of the split:

- **Stretching is not lost.** An attacker holding a database dump must still run the
  200 000-round client KDF per password guess, exactly as if the service had done all the
  work itself.
- **The service side fits in a Worker CPU slice.** A 200 000-round PBKDF2 is roughly 50 ms
  of CPU; on the Workers free plan (10 ms/request) every sign-in would be killed. 12 000
  rounds lands near 3 ms.

The client salt is **deterministic** rather than random, because a device signing in for
the first time has nothing else to go on, and asking the service for a per-account salt
would hand out a user-enumeration oracle. Uniqueness (no two pilots share a salt) is what
defeats cross-account rainbow tables, and callsigns are unique by construction.

Sessions are opaque 256-bit tokens. Only `sha256(token)` is stored, so a database dump
yields no usable sessions. They ride in `Authorization: Bearer`, never in a cookie —
third-party cookies are blocked by default in Safari and Firefox, which is precisely the
cross-origin case this API runs in. TTL is 180 days, sliding, re-written at most twice a
day so reads stay reads.

Rate limits (`throttles` table): 12 failed sign-ins per callsign and 60 per IP in a
15-minute window, 8 registrations per IP per hour. A correct passcode is *not* let through
during a lockout, and a successful sign-in clears the callsign counter.

---

## 3 · Sync: synchronous locally, eventually durable

Every progress mutation stays **synchronous**. `completeStage()` returns before anything
touches the network; a debounced flush (600 ms) pushes it. A mission ending must never
block on a round trip, and a pilot on a train must keep playing. What the network buys is
durability and reach, not the write itself.

```
updateProgress() ──► localStorage cache (dirty=true) ──► debounce 600ms ──► PUT /api/progress
                                                                              │
                     ◄──────────────── 200: rev advances, dirty=false ◄───────┤
                     ◄─ 409: merge with the service copy, retry ──────────────┤
                     ◄─ offline: keep dirty, exponential backoff, retry ──────┘
```

Flush is also forced at the points where the page is about to disappear:

- `main.ts` routes every mission-end **CONTINUE / RETRY / MAIN MENU** through
  `reloadAfterSync()`, which flushes before `location.reload()`.
- `pagehide` and `visibilitychange → hidden` fire a `keepalive` push, which survives the
  document being torn down. This is a backstop, not a guarantee — it cannot retry and
  cannot report failure, which is why the explicit flush exists.
- Signing out flushes first: switching pilots must never be the thing that loses a mission.
  If the push cannot complete, the local save is **kept** (only the token is stripped) and
  re-merged at the next successful sign-in.

**Offline is a state, not an error.** Already signed in → play on, edits queue. Signing in
on a device that has this pilot cached → allowed, gated on a locally stored
`sha256(verifier)` so the passcode still has to be right. Never signed in here and no
link → genuinely impossible; the UI says so and offers guest play.

Guests are unchanged: `sessionStorage`, gone with the tab, never synced. Registering
mid-run carries the guest's progress up into the new account — including a guest who has
only finished Basic Training, which banks no stage and no scrip but still counts.

### The cache holds one record PER PILOT

`veyra.account.v3` is `{ activeId, accounts: { [id]: record } }`, not a single slot. Three
rules fall out of that, and each of them existed because the single-slot version got them
wrong:

- **Signing out never deletes.** The record is kept with its token stripped. That is where
  unsynced edits wait, and it is what lets the same pilot sign in again with no link.
- **Signing in as somebody else cannot touch another pilot's record.** A second pilot — or
  a brand-new registration, or a legacy migration — writes under its own id. The first
  pilot's queued mission is still there at their next sign-in, and `adopt()` merges it up.
- **Records are bounded.** Six pilots, pruned clean-and-oldest first, so a shared machine
  cannot grow the cache without limit.

### Two rules the sync engine must never break

**A pull is adopted only if it is strictly newer.** Revisions are monotonic, so
`remote.rev < current.rev` means the response is older than the cache — a pull issued
before a push that has since landed. Adopting it would roll the player back to a
pre-mission save *and* drop the `hangar.claims` anchors, so replaying that mission would
re-award a once-only frame. `adoptRemote()` is the single gate; `refresh()` and the
resume path both go through it.

**The stored session expiry is a hint, not a verdict.** The service slides a session on
every use, so a locally-stored value routinely undershoots the real one. Only the service
can say a session has lapsed — so the client asks, and never deletes a cached save on the
strength of its own clock. Every authenticated response carries `sessionExpiresAt` so the
local copy tracks the sliding one.

If `localStorage` refuses a write (quota, private mode), the in-memory record becomes
authoritative and the store stops re-reading over the top of it — otherwise the edit that
could not be persisted would be silently discarded by the next read.

---

## 4 · Two devices at once

Every write states the revision it was based on:

```sql
UPDATE progress SET data = ?, rev = rev + 1, updated_at = ?, device = ?
 WHERE account_id = ? AND rev = ?
```

SQLite applies this atomically, so `meta.changes === 1` is proof that *this* write advanced
the revision. A device holding a stale copy is **rejected rather than allowed to
overwrite**, and the 409 carries the current copy back. `server/progressmerge.mjs` then
folds the two histories together and the client retries.

The merge rule is: **monotonic, and it never takes anything away from the player.**

| Field | Rule |
|---|---|
| `unlocked` | maximum |
| `completed` | union; best payout, earliest timestamp |
| `tutorialDone` | sticky OR |
| `btPhases` | union |
| `branch21` | the further-along side's choice |
| `hangar.frames` | union by instance id |
| `hangar.slots` | unlocked if unlocked on either side; occupancy repaired against the merged collection |
| `hangar.claims` | **union** — a spent at-most-once award stays spent |
| `hangar.ledger` | union by idempotency key; keyed entries survive the cap, plain history does not |
| `scrip` | maximum |

`scrip = max` is the one deliberately generous rule. The balance cannot be recomputed (the
ledger is pruned at 200 entries), and of the available rules it is the only one that can
never silently confiscate. Earn 300 on one device and 500 on the other and you end with
500 — not 800, and not 300. Losing scrip a player watched themselves earn reads as a bug;
a bounded over-credit in a single-player economy does not.

The one thing a merge must never do is resurrect a spent claim, hence the `claims` and
keyed-ledger unions: a stage award or match payout banked on either device cannot pay out
twice. Every merged hangar is checked against `hangarcore.checkInvariants()`; if the union
would produce an illegal hangar, the merge falls back wholesale to the further-along side
rather than shipping something the engine considers corrupt.

---

## 5 · What the service does not do

It does **not** adjudicate campaign progress. Single-player progress is client-authoritative
in this build; `validateProgress()` checks shape, ranges, size (512 KB) and hangar
invariants only. That is anti-corruption, not anti-cheat — it exists so a malformed blob
cannot poison an account. The genuinely authoritative surface remains the multiplayer deck
contract in `server/matchcore.mjs`.

---

## 6 · Migrating pre-cloud pilots

A browser that still holds `veyra.profiles.v1` shows its local pilots on the sign-in screen
under "PILOTS SAVED IN THIS BROWSER ONLY". Choosing one asks for its passcode, verifies it
against the *old local hash*, claims the callsign in the registry (or signs in, if the same
callsign+passcode already exists there), and merges the local save up. The local copy is
never deleted — it is only marked migrated so it stops being offered.

---

## 7 · Working on it

```bash
npm run db:migrate            # apply migrations to the local D1
npm run db:migrate:remote     # ...and to production
npm run accounts:test         # 89 checks: service rules, merge, HTTP layer
npm run sync:test             # 42 checks: the client sync engine (real profiles.ts in Node)
npm run savetest              # 18 checks: two devices through the REAL game UI
npm run accounts:probe        # live two-device probe against production
npm run accounts:probe -- --url http://localhost:8787/api    # ...or a local wrangler dev
npm run mp                    # LAN dev: match server AND account API on :4177
```

`sync:test` bundles the real `src/save/profiles.ts` with esbuild and runs it in Node
against a stubbed `localStorage` and a scriptable fetch. Every case in it is a regression
test for a defect that was found and fixed — a stale pull rolling a save back, a pilot
switch deleting another pilot's queued mission, a local clock deciding a live session had
expired, an unwritable cache swallowing an edit. Each one fails if you revert its fix.

`npm run dev` (vite on :5199) resolves the API to `http://<host>:4177/api`, so
`npm run mp` in a second terminal is all a local session needs.

### Schema

`accounts` · `progress` · `sessions` · `throttles` — see `migrations/0001_accounts.sql`.
Add a migration file rather than editing that one; both `db:migrate` targets are
incremental.
