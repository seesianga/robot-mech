// Runtime-agnostic hangar engine — the single authority for the collection,
// the six Deployment Bays, and the scrip economy around them. Shared by the
// browser client (src/save/hangar.ts wraps it over ProfileStore persistence)
// and the Node test suite (scripts/test_hangar.mjs). Pure data-in/data-out:
// no globals, no Date.now, no crypto — the environment injects now()/newId().
//
// Core rules enforced HERE, at the bottom layer, never in UI logic:
//   1. The collection is exactly the granted/purchased frame instances.
//   2. Six bays; bay 1 free, bays 2–6 priced, sequential unlock.
//   3. Bays hold owned frame INSTANCES — never chassis types.
//   4. One instance occupies at most one bay (assign = move/swap semantics).
//   5. Wallet floor: scrip never goes negative; every mutation is atomic
//      (built on a draft, committed only if valid) and idempotent by key.
//
// Every op takes and returns an account `{ scrip, hangar }` and reports
// `{ ok: true, acct, ... }` or `{ ok: false, err: 'MACHINE_CODE', ... }`.
// A failed op returns the ORIGINAL account untouched.

export const BAY_COUNT = 6;
const LEDGER_CAP = 200;
const IDEMPOTENCY_MS = 24 * 60 * 60 * 1000;
const NAME_RE = /^[A-Za-z0-9 '_.\-]{1,24}$/;
const BLOCKED_NAMES = ['fuck', 'shit', 'cunt', 'nigger', 'faggot', 'bitch', 'whore', 'nazi'];

/** env: { slots, catalog, chassisIds, now(), newId() }
 *  slots   — content/hangar/slots.json
 *  catalog — content/hangar/requisition_catalog.json
 */
export function makeEnv(slotsJson, catalogJson, chassisIds, now, newId) {
  const prices = new Array(BAY_COUNT).fill(null);
  for (const s of slotsJson.slots) {
    if (s.index >= 1 && s.index <= BAY_COUNT) prices[s.index - 1] = s.price;
  }
  const catalog = new Map();
  for (const e of catalogJson.entries) {
    catalog.set(e.chassis, { price: e.price, available: e.available !== false });
  }
  return {
    prices,
    catalog,
    chassisIds: new Set(chassisIds),
    sequential: slotsJson.sequentialUnlock !== false,
    scrapRefundPct: catalogJson.scrapRefundPct ?? 50,
    now,
    newId,
  };
}

/** A fresh hangar: bay 1 unlocked and empty, bays 2–6 locked. */
export function freshHangar() {
  return {
    v: 1,
    slots: Array.from({ length: BAY_COUNT }, (_, i) => ({
      state: i === 0 ? 'unlocked' : 'locked',
      iid: null,
    })),
    frames: {},
    ledger: [],
    // permanent at-most-once-EVER anchors (starter + stage awards). The ledger
    // is a 24h idempotency window and gets pruned; grant keys must never be —
    // a pruned award key would re-grant the frame and mint scrip via scrapping.
    claims: {},
  };
}

function clone(acct) {
  return JSON.parse(JSON.stringify(acct));
}

function ledgerFind(hangar, key) {
  return key ? hangar.ledger.find((e) => e.key === key) ?? null : null;
}

function ledgerPush(env, hangar, entry) {
  hangar.ledger.push({ ...entry, at: env.now() });
  // cap the ledger, but never prune entries still inside the idempotency window
  if (hangar.ledger.length > LEDGER_CAP) {
    const cutoff = env.now() - IDEMPOTENCY_MS;
    let excess = hangar.ledger.length - LEDGER_CAP;
    hangar.ledger = hangar.ledger.filter((e) => {
      if (excess > 0 && e.at < cutoff) { excess--; return false; }
      return true;
    });
  }
}

function fail(err, extra = {}) {
  return { ok: false, err, ...extra };
}

/** Replay guard shared by every keyed op. Returns a result to short-circuit
 *  with, or null to proceed. */
function replayOf(acct, key) {
  const hit = ledgerFind(acct.hangar, key);
  if (!hit) return null;
  return { ok: true, replay: true, acct, ledger: hit };
}

// ---------- bays ----------

export function unlockBay(env, acct, bayIndex, key) {
  if (!Number.isInteger(bayIndex) || bayIndex < 0 || bayIndex >= BAY_COUNT) return fail('BAD_BAY');
  const replay = replayOf(acct, key);
  if (replay) return replay;
  const cur = acct.hangar.slots[bayIndex];
  if (cur.state === 'unlocked') return fail('ALREADY_UNLOCKED');
  if (env.sequential && bayIndex > 0 && acct.hangar.slots[bayIndex - 1].state !== 'unlocked') {
    return fail('PREREQ_LOCKED', { prereq: bayIndex });
  }
  const price = env.prices[bayIndex] ?? 0;
  if (acct.scrip < price) return fail('INSUFFICIENT_FUNDS', { price, short: price - acct.scrip });
  const next = clone(acct);
  next.scrip -= price;
  next.hangar.slots[bayIndex].state = 'unlocked';
  ledgerPush(env, next.hangar, { key, kind: 'bay_unlock', amount: -price, ref: { bay: bayIndex + 1 } });
  return { ok: true, acct: next, price };
}

/** Assign an owned instance to an unlocked bay. Move/swap semantics make the
 *  one-instance-one-bay invariant structural: the instance LEAVES any bay it
 *  was in, and a displaced occupant takes the vacated bay (swap) or unslots. */
export function assignBay(acct, bayIndex, iid) {
  if (!Number.isInteger(bayIndex) || bayIndex < 0 || bayIndex >= BAY_COUNT) return fail('BAD_BAY');
  const slot = acct.hangar.slots[bayIndex];
  if (slot.state !== 'unlocked') return fail('BAY_LOCKED');
  const frame = acct.hangar.frames[iid];
  if (!frame) return fail('NOT_OWNED');
  const next = clone(acct);
  const slots = next.hangar.slots;
  const from = slots.findIndex((s) => s.iid === iid);
  const displaced = slots[bayIndex].iid;
  if (displaced === iid) return { ok: true, acct }; // already there — no-op
  slots[bayIndex].iid = iid;
  // swap: the displaced occupant takes the vacated bay; with no vacated bay
  // (the incoming frame was unslotted) the displaced frame simply unslots
  if (from >= 0) slots[from].iid = displaced;
  return { ok: true, acct: next, displaced };
}

export function clearBay(acct, bayIndex) {
  if (!Number.isInteger(bayIndex) || bayIndex < 0 || bayIndex >= BAY_COUNT) return fail('BAD_BAY');
  if (acct.hangar.slots[bayIndex].iid === null) return { ok: true, acct };
  const next = clone(acct);
  next.hangar.slots[bayIndex].iid = null;
  return { ok: true, acct: next };
}

// ---------- frames ----------

function createFrame(env, hangar, chassis, via) {
  const iid = env.newId();
  hangar.frames[iid] = { iid, chassis, via, at: env.now(), loadout: 'stock' };
  return iid;
}

export function purchaseFrame(env, acct, chassis, key) {
  const entry = env.catalog.get(chassis);
  if (!entry || !env.chassisIds.has(chassis)) return fail('BAD_CHASSIS');
  if (!entry.available) return fail('NOT_AVAILABLE');
  const replay = replayOf(acct, key);
  if (replay) return replay;
  if (acct.scrip < entry.price) {
    return fail('INSUFFICIENT_FUNDS', { price: entry.price, short: entry.price - acct.scrip });
  }
  const next = clone(acct);
  next.scrip -= entry.price;
  const iid = createFrame(env, next.hangar, chassis, 'purchase');
  ledgerPush(env, next.hangar, { key, kind: 'frame_purchase', amount: -entry.price, ref: { chassis, iid } });
  return { ok: true, acct: next, iid, price: entry.price };
}

/** Salvage / mission / event award — same path as purchases, price 0.
 *  Keyed grants are at-most-once FOREVER (hangar.claims), not merely inside
 *  the 24h ledger window — a re-granted award would be a frame/scrip faucet. */
export function grantFrame(env, acct, chassis, via, key) {
  if (!env.chassisIds.has(chassis)) return fail('BAD_CHASSIS');
  if (key && acct.hangar.claims?.[key]) return { ok: true, replay: true, acct };
  const replay = replayOf(acct, key);
  if (replay) return replay;
  const next = clone(acct);
  if (!next.hangar.claims) next.hangar.claims = {}; // pre-claims saves
  const iid = createFrame(env, next.hangar, chassis, via === 'salvage' ? 'salvage' : 'grant');
  if (key) next.hangar.claims[key] = true;
  ledgerPush(env, next.hangar, { key, kind: 'award', amount: 0, ref: { chassis, iid, via } });
  return { ok: true, acct: next, iid };
}

export function scrapFrame(env, acct, iid, key) {
  // replay guard FIRST: after a successful scrap the frame no longer exists,
  // so an ownership-first order would turn a retry into a bogus NOT_OWNED
  const replay = replayOf(acct, key);
  if (replay) return replay;
  const frame = acct.hangar.frames[iid];
  if (!frame) return fail('NOT_OWNED');
  if (Object.keys(acct.hangar.frames).length <= 1) return fail('LAST_FRAME');
  const catalogPrice = env.catalog.get(frame.chassis)?.price ?? frame.salvageValue ?? 0;
  const refund = Math.floor((catalogPrice * env.scrapRefundPct) / 100);
  const next = clone(acct);
  delete next.hangar.frames[iid];
  for (const s of next.hangar.slots) if (s.iid === iid) s.iid = null;
  next.scrip += refund;
  ledgerPush(env, next.hangar, { key, kind: 'scrap_refund', amount: refund, ref: { chassis: frame.chassis, iid } });
  return { ok: true, acct: next, refund };
}

export function renameFrame(acct, iid, name) {
  const frame = acct.hangar.frames[iid];
  if (!frame) return fail('NOT_OWNED');
  const trimmed = String(name ?? '').trim();
  if (trimmed !== '' && !NAME_RE.test(trimmed)) return fail('BAD_NAME');
  const lower = trimmed.toLowerCase().replace(/[^a-z]/g, '');
  if (BLOCKED_NAMES.some((w) => lower.includes(w))) return fail('BAD_NAME');
  const next = clone(acct);
  if (trimmed === '') delete next.hangar.frames[iid].name;
  else next.hangar.frames[iid].name = trimmed;
  return { ok: true, acct: next };
}

/** Earned-scrip credit (multiplayer match rewards, event payouts) — the same
 *  ledgered, idempotent path debits use, so refresh-spam never double-pays. */
export function creditScrip(env, acct, amount, kind, ref, key) {
  if (!Number.isFinite(amount) || amount < 0) return fail('BAD_AMOUNT');
  const replay = replayOf(acct, key);
  if (replay) return replay;
  const next = clone(acct);
  next.scrip += Math.floor(amount);
  ledgerPush(env, next.hangar, { key, kind: kind ?? 'award', amount: Math.floor(amount), ref: ref ?? {} });
  return { ok: true, acct: next };
}

// ---------- selectors (read-only; safe on any valid account) ----------

/** The multiplayer deck: instances sitting in occupied unlocked bays, in bay order. */
export function deckFrames(acct) {
  const out = [];
  for (const s of acct.hangar.slots) {
    if (s.state === 'unlocked' && s.iid !== null && acct.hangar.frames[s.iid]) {
      out.push({ iid: s.iid, chassis: acct.hangar.frames[s.iid].chassis });
    }
  }
  return out;
}

/** 1-based bay number the instance sits in, or 0. */
export function bayOf(acct, iid) {
  const i = acct.hangar.slots.findIndex((s) => s.iid === iid);
  return i + 1;
}

export function ownedCountByChassis(acct) {
  const counts = new Map();
  for (const f of Object.values(acct.hangar.frames)) {
    counts.set(f.chassis, (counts.get(f.chassis) ?? 0) + 1);
  }
  return counts;
}

/** Next purchasable locked bay (0-based index) honoring sequential unlock, or -1. */
export function nextLockedBay(acct) {
  for (let i = 0; i < BAY_COUNT; i++) {
    if (acct.hangar.slots[i].state === 'locked') return i;
  }
  return -1;
}

/** Structural invariants — the test suite calls this after every op. */
export function checkInvariants(acct) {
  const errs = [];
  if (acct.scrip < 0) errs.push('negative scrip');
  if (acct.hangar.slots.length !== BAY_COUNT) errs.push('slot count');
  if (acct.hangar.slots[0].state !== 'unlocked') errs.push('bay 1 locked');
  const seen = new Set();
  acct.hangar.slots.forEach((s, i) => {
    if (s.iid === null) return;
    if (s.state !== 'unlocked') errs.push(`bay ${i + 1} holds a frame while locked`);
    if (seen.has(s.iid)) errs.push(`instance ${s.iid} in two bays`);
    seen.add(s.iid);
    if (!acct.hangar.frames[s.iid]) errs.push(`bay ${i + 1} holds unowned ${s.iid}`);
  });
  return errs;
}
