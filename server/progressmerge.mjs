/**
 * Deterministic merge of two campaign-progress snapshots — the conflict
 * resolver for cross-device play.
 *
 * Normal operation never gets here: every push carries the revision it was
 * based on, so a device holding a stale copy is rejected rather than allowed to
 * clobber. This module is what runs on that rejection — the two histories that
 * diverged (a mission finished on the phone while the laptop was offline) get
 * folded back into one.
 *
 * Design rule: THE MERGE IS MONOTONIC AND NEVER LOSES THE PLAYER ANYTHING.
 * Unlocks, completions, owned frames and unlocked bays are unions or maxima. A
 * merge can, in the rare simultaneous-play case, be *generous* — scrip takes
 * the maximum of the two sides rather than a sum or a re-derivation, so a
 * player who earned 300 on one device and 500 on the other ends with 500, not
 * 800 and not 300. The balance cannot be recomputed from the ledger (it is
 * pruned at 200 entries), and of the available rules this is the only one that
 * can never silently confiscate. Losing scrip a player watched themselves earn
 * reads as a bug; a bounded over-credit in a single-player economy does not.
 *
 * The one thing a merge must never do is resurrect a spent at-most-once claim:
 * `hangar.claims` and keyed ledger entries are UNIONED, so a stage award or a
 * match payout that either side already banked stays banked and cannot pay out
 * a second time.
 *
 * Shared by the client (src/save/profiles.ts) and the Node test suite
 * (scripts/test_accounts.mjs). Pure: no clock, no crypto, no globals.
 */

import { BAY_COUNT, checkInvariants, freshHangar } from './hangarcore.mjs';

const LEDGER_CAP = 200;

function num(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

/** Plain-object coercion — every merge input is untrusted (it came off a wire
 *  or out of another device's localStorage). */
function obj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

/** How far along a snapshot is — the tie-break for genuinely ambiguous fields. */
export function progressRank(p) {
  const g = obj(p);
  const hangar = obj(g.hangar);
  const bays = arr(hangar.slots).filter((s) => s?.state === 'unlocked').length;
  return [
    num(g.unlocked, 1),
    Object.keys(obj(g.completed)).length,
    bays,
    Object.keys(obj(hangar.frames)).length,
    num(g.scrip, 0),
  ];
}

function rankGte(a, b) {
  const ra = progressRank(a);
  const rb = progressRank(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return ra[i] > rb[i];
  }
  return true; // equal — `a` (the local side) wins by convention
}

function mergeCompleted(rawA, rawB) {
  const a = obj(rawA);
  const b = obj(rawB);
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[key];
    const y = b[key];
    if (!x) { out[key] = y; continue; }
    if (!y) { out[key] = x; continue; }
    // best payout wins, earliest completion timestamp is the true one
    out[key] = { scrip: Math.max(num(x.scrip), num(y.scrip)), at: Math.min(num(x.at, y.at), num(y.at, x.at)) };
  }
  return out;
}

function mergeFrames(rawA, rawB) {
  const a = obj(rawA);
  const b = obj(rawB);
  const out = {};
  for (const iid of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[iid];
    const y = b[iid];
    if (!x || !y) { out[iid] = x ?? y; continue; }
    // same instance id on both sides — same frame; keep the first acquisition
    // and any custom name the pilot gave it on either device
    const earlier = num(x.at, 0) <= num(y.at, 0) ? x : y;
    const named = x.name ?? y.name;
    out[iid] = named ? { ...earlier, name: named } : { ...earlier };
  }
  return out;
}

/** Union by idempotency key; keyless entries (pure history) are unioned by
 *  identity and trimmed to the cap, newest first. */
function mergeLedger(rawA, rawB) {
  const byKey = new Map();
  const keyless = [];
  for (const e of [...arr(rawA), ...arr(rawB)]) {
    if (!e || typeof e !== 'object') continue;
    if (e.key) {
      const seen = byKey.get(e.key);
      if (!seen || num(e.at, 0) < num(seen.at, 0)) byKey.set(e.key, e);
    } else {
      keyless.push(e);
    }
  }
  const seen = new Set();
  const uniqueKeyless = keyless.filter((e) => {
    const sig = `${e.kind}|${e.amount}|${e.at}|${JSON.stringify(e.ref ?? {})}`;
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
  const all = [...byKey.values(), ...uniqueKeyless].sort((x, y) => num(x.at) - num(y.at));
  // keyed entries are the replay guards — they survive the cap, history doesn't
  if (all.length <= LEDGER_CAP) return all;
  const keyed = all.filter((e) => e.key);
  const room = Math.max(0, LEDGER_CAP - keyed.length);
  const trimmedHistory = all.filter((e) => !e.key).slice(-room);
  return [...keyed, ...trimmedHistory].sort((x, y) => num(x.at) - num(y.at));
}

/**
 * Merge two hangars. Bays are unioned as unlocked; occupancy is taken from the
 * further-along side and then repaired so the one-instance-one-bay invariant
 * holds against the merged collection.
 */
export function mergeHangar(rawA, rawB, preferA = true) {
  // a hangar that is not an object at all (a corrupted or hand-edited save)
  // is treated as absent rather than propagated
  const hasA = rawA && typeof rawA === 'object' && !Array.isArray(rawA);
  const hasB = rawB && typeof rawB === 'object' && !Array.isArray(rawB);
  if (!hasA && !hasB) return freshHangar();
  if (!hasA) return structuredCloneish(rawB);
  if (!hasB) return structuredCloneish(rawA);
  const a = obj(rawA);
  const b = obj(rawB);
  const frames = mergeFrames(a.frames, b.frames);
  const primary = preferA ? a : b;
  const secondary = preferA ? b : a;

  const slots = [];
  const taken = new Set();
  // a missing slot is a bay that was never written, not a bay that was locked:
  // bay 1 is unlocked by definition (hangarcore invariant), the rest are not
  const slotAt = (raw, i) => {
    const s = arr(raw)[i];
    return s && typeof s === 'object' ? s : { state: i === 0 ? 'unlocked' : 'locked', iid: null };
  };
  for (let i = 0; i < BAY_COUNT; i++) {
    const pa = slotAt(a.slots, i);
    const pb = slotAt(b.slots, i);
    const state = pa.state === 'unlocked' || pb.state === 'unlocked' ? 'unlocked' : 'locked';
    let iid = (preferA ? pa.iid ?? pb.iid : pb.iid ?? pa.iid) ?? null;
    // repair: a bay may only hold an owned instance, and only one bay may hold it
    if (iid && (!frames[iid] || taken.has(iid) || state !== 'unlocked')) iid = null;
    if (iid) taken.add(iid);
    slots.push({ state, iid });
  }
  // a frame the further-along side had loaded but the repair dropped gets a
  // vacant unlocked bay back, so a merge never silently empties the deck
  for (const s of [...arr(primary.slots), ...arr(secondary.slots)]) {
    if (!s?.iid || taken.has(s.iid) || !frames[s.iid]) continue;
    const vacant = slots.find((slot) => slot.state === 'unlocked' && slot.iid === null);
    if (!vacant) break;
    vacant.iid = s.iid;
    taken.add(s.iid);
  }

  return {
    v: Math.max(num(a.v, 1), num(b.v, 1)),
    slots,
    frames,
    ledger: mergeLedger(a.ledger, b.ledger),
    claims: { ...obj(b.claims), ...obj(a.claims) },
  };
}

function structuredCloneish(v) {
  return JSON.parse(JSON.stringify(v));
}

/**
 * Fold two divergent progress snapshots into one.
 * @param {object} local  this device's copy (wins ties)
 * @param {object} remote the copy the service holds
 */
export function mergeProgress(local, remote) {
  const a = obj(local);
  const b = obj(remote);
  const preferA = rankGte(a, b);

  const merged = {
    unlocked: Math.max(num(a.unlocked, 1), num(b.unlocked, 1)),
    scrip: Math.max(num(a.scrip, 0), num(b.scrip, 0)),
    completed: mergeCompleted(a.completed, b.completed),
    tutorialDone: Boolean(a.tutorialDone || b.tutorialDone),
  };
  const phases = [...new Set([...arr(a.btPhases), ...arr(b.btPhases)])].sort();
  if (phases.length) merged.btPhases = phases;
  // the M21 fork is a story choice, not a resource: the further-along pilot's
  // choice is the one that shaped the missions they actually played
  const branch = preferA ? a.branch21 ?? b.branch21 : b.branch21 ?? a.branch21;
  if (branch) merged.branch21 = branch;

  if (a.hangar || b.hangar) {
    const hangar = mergeHangar(a.hangar, b.hangar, preferA);
    // a merge that would produce an illegal hangar is not worth the union —
    // fall back wholesale to the side that is further along, and if THAT is
    // unreadable too, to an empty hangar the engine will re-bootstrap
    let errs;
    try {
      errs = checkInvariants({ scrip: merged.scrip, hangar });
    } catch {
      errs = ['unreadable'];
    }
    if (!errs.length) {
      merged.hangar = hangar;
    } else {
      const fallback = (preferA ? a : b).hangar;
      let ok = false;
      try {
        ok = fallback && checkInvariants({ scrip: merged.scrip, hangar: fallback }).length === 0;
      } catch { /* ok stays false */ }
      merged.hangar = ok ? structuredCloneish(fallback) : freshHangar();
    }
  }
  return merged;
}

/**
 * Structural sanity for a snapshot arriving over the wire. This is anti-
 * corruption, NOT anti-cheat: campaign progress is client-authoritative in this
 * build (the authoritative surface is the multiplayer deck contract in
 * matchcore.mjs). It exists so a malformed or oversized blob can't poison an
 * account or bloat the row.
 * @returns {string[]} problems, empty when the snapshot is storable
 */
export function validateProgress(p, { maxBytes = 512 * 1024, maxStage = 200 } = {}) {
  const errs = [];
  if (!p || typeof p !== 'object' || Array.isArray(p)) return ['progress must be an object'];
  const size = JSON.stringify(p).length;
  if (size > maxBytes) errs.push(`progress too large (${size} > ${maxBytes} bytes)`);
  if (!Number.isFinite(p.unlocked) || p.unlocked < 0 || p.unlocked > maxStage) errs.push('unlocked out of range');
  if (!Number.isFinite(p.scrip) || p.scrip < 0 || p.scrip > 1e12) errs.push('scrip out of range');
  if (p.completed && (typeof p.completed !== 'object' || Array.isArray(p.completed))) errs.push('completed must be an object');
  if (p.btPhases && !Array.isArray(p.btPhases)) errs.push('btPhases must be an array');
  if (p.branch21 && p.branch21 !== 'a' && p.branch21 !== 'b') errs.push('branch21 must be a or b');
  if (p.hangar !== undefined) {
    const h = p.hangar;
    if (!h || typeof h !== 'object' || Array.isArray(h)) errs.push('hangar must be an object');
    else if (!Array.isArray(h.slots) || h.slots.length !== BAY_COUNT) errs.push(`hangar: expected ${BAY_COUNT} slots`);
    else if (!h.frames || typeof h.frames !== 'object' || Array.isArray(h.frames)) errs.push('hangar: frames must be an object');
    else if (h.ledger !== undefined && !Array.isArray(h.ledger)) errs.push('hangar: ledger must be an array');
    else {
      // shape is sound — now the hangar engine's own structural rules
      try {
        errs.push(...checkInvariants({ scrip: num(p.scrip, 0), hangar: h }).map((e) => `hangar: ${e}`));
      } catch {
        errs.push('hangar: unreadable');
      }
    }
  }
  return errs;
}
