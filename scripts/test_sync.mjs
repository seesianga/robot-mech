#!/usr/bin/env node
/**
 * Client sync-engine suite — the REAL src/save/profiles.ts, bundled with the
 * project's own esbuild and run in Node against a stubbed localStorage and a
 * scriptable fetch. Everything here is a regression test for a defect that was
 * found and fixed, so each case names the failure it prevents.
 *
 * The service-side rules live in test_accounts.mjs; this file is about the half
 * that runs on the player's device: what happens to a save that has not
 * synced yet when the network, the tab, the storage or the pilot changes.
 *
 * Run:  npm run sync:test
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { passed++; return; }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, actual, expected) => check(name, JSON.stringify(actual) === JSON.stringify(expected),
  `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

// ---------------------------------------------------------------- environment

class FakeStorage {
  constructor() { this.map = new Map(); this.failWrites = false; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) {
    if (this.failWrites) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    this.map.set(k, String(v));
  }
  removeItem(k) { this.map.delete(k); }
  get length() { return this.map.size; }
}

/** The registry, as far as the client can tell: one account, one revision. */
class FakeRegistry {
  constructor() {
    this.rev = 0;
    this.progress = { unlocked: 1, scrip: 0, completed: {}, tutorialDone: false };
    this.accounts = new Map(); // callsignKey -> { id, callsign, token }
    this.offline = false;
    this.holdPull = null;      // a promise the next GET /progress waits on
    this.calls = [];
    this.expiresAt = Date.now() + 180 * 24 * 60 * 60 * 1000;
    this.deadTokens = new Set();
  }

  account(callsign) {
    const key = callsign.trim().toLowerCase();
    if (!this.accounts.has(key)) {
      this.accounts.set(key, { id: `acct-${this.accounts.size + 1}`, callsign: callsign.trim(), token: `tok-${this.accounts.size + 1}` });
    }
    return this.accounts.get(key);
  }

  async handle(url, init = {}) {
    const route = url.replace(/^.*\/api/, '');
    const method = init.method ?? 'GET';
    this.calls.push(`${method} ${route}`);
    if (this.offline) throw new TypeError('Failed to fetch');
    const body = init.body ? JSON.parse(init.body) : {};
    const auth = (init.headers?.authorization ?? '').replace('Bearer ', '');
    const json = (status, obj) => ({
      ok: status < 400, status,
      text: async () => JSON.stringify(obj),
    });

    if (route === '/auth/register' || route === '/auth/login') {
      const acc = this.account(body.callsign);
      return json(route.endsWith('register') ? 201 : 200, {
        token: acc.token,
        account: { id: acc.id, callsign: acc.callsign, createdAt: 1 },
        progress: this.stateFor(acc.id).progress,
        rev: this.stateFor(acc.id).rev,
        expiresAt: this.expiresAt,
      });
    }
    const owner = [...this.accounts.values()].find((a) => a.token === auth);
    if (!owner || this.deadTokens.has(auth)) return json(401, { error: 'NO_SESSION', message: 'nope' });
    const state = this.stateFor(owner.id);

    if (route === '/progress' && method === 'GET') {
      // the response is decided WHEN THE REQUEST ARRIVES, then sits on the wire.
      // That is the whole point of holdPull: a slow pull carries the state as it
      // was, so a push that lands meanwhile makes the reply stale on arrival.
      const snapshot = { rev: state.rev, progress: JSON.parse(JSON.stringify(state.progress)), sessionExpiresAt: this.expiresAt };
      if (this.holdPull) await this.holdPull;
      return json(200, snapshot);
    }
    if (route === '/progress' && method === 'PUT') {
      if (body.baseRev !== state.rev) {
        return json(409, { error: 'REV_CONFLICT', message: 'conflict', rev: state.rev, progress: state.progress, sessionExpiresAt: this.expiresAt });
      }
      state.rev += 1;
      state.progress = body.progress;
      return json(200, { ok: true, rev: state.rev, sessionExpiresAt: this.expiresAt });
    }
    if (route === '/auth/logout') return json(200, { ok: true });
    return json(404, { error: 'NOT_FOUND', message: 'no' });
  }

  stateFor(id) {
    if (!this.states) this.states = new Map();
    if (!this.states.has(id)) this.states.set(id, { rev: 0, progress: { unlocked: 1, scrip: 0, completed: {}, tutorialDone: false } });
    return this.states.get(id);
  }
}

const listeners = new Map();
function installGlobals(storage, registry) {
  globalThis.localStorage = storage;
  globalThis.sessionStorage = new FakeStorage();
  globalThis.location = { hostname: 'localhost', origin: 'http://localhost:5199', protocol: 'http:', host: 'localhost:5199' };
  // navigator is a getter-only global in modern Node — define over it
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node-suite' }, configurable: true, writable: true,
  });
  listeners.clear();
  globalThis.window = {
    addEventListener: (t, fn) => listeners.set(`w:${t}`, fn),
    removeEventListener: () => {},
  };
  globalThis.document = {
    visibilityState: 'visible',
    addEventListener: (t, fn) => listeners.set(`d:${t}`, fn),
  };
  globalThis.fetch = (url, init) => registry.handle(String(url), init);
}

const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- bundle

const outfile = path.join(os.tmpdir(), `veyra-profiles-${process.pid}.mjs`);
await build({
  entryPoints: [path.join(ROOT, 'src', 'save', 'profiles.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile,
  define: { 'import.meta.env.VITE_API_URL': '"http://localhost:4177/api"' },
  logLevel: 'silent',
});
const { ProfileStore } = await import(`file://${outfile}`);

async function freshStore(registry = new FakeRegistry(), storage = new FakeStorage()) {
  installGlobals(storage, registry);
  return { store: new ProfileStore(), registry, storage };
}

// ---------------------------------------------------------------- cases

/** A pull issued before a push must never be adopted after it. */
async function testStalePullNeverRollsBack() {
  const { store, registry } = await freshStore();
  const profile = await store.register('Cinder', 'passcode1');
  store.completeStage(profile, 1, 300, 24);
  await store.flush();
  eq('baseline synced', registry.stateFor('acct-1').rev, 1);

  // a pull leaves, and is held open while the player finishes another mission
  let release;
  registry.holdPull = new Promise((r) => { release = r; });
  const refreshing = store.refresh();
  await settle(5);
  store.completeStage(store.current(), 2, 500, 24);
  await store.flush();
  const afterPush = store.progressOf(store.current());
  eq('the second win is banked locally', afterPush.scrip, 800);
  eq('the second win reached the registry', registry.stateFor('acct-1').progress.scrip, 800);

  // ...and only now does the older pull come back
  release();
  registry.holdPull = null;
  await refreshing;

  const after = store.progressOf(store.current());
  eq('a stale pull does not roll the wallet back', after.scrip, 800);
  eq('a stale pull does not re-lock a stage', after.unlocked, 3);
  check('a stale pull does not strand the save', store.syncStatus().state !== 'error');
}

/** The at-most-once award anchors must survive whatever sync does. */
async function testStalePullKeepsGrantAnchors() {
  const { store, registry } = await freshStore();
  const profile = await store.register('Ash', 'passcode1');
  store.updateProgress(profile, (g) => {
    g.unlocked = 5;
    g.hangar = { v: 1, slots: [{ state: 'unlocked', iid: 'f1' }, ...Array.from({ length: 5 }, () => ({ state: 'locked', iid: null }))], frames: { f1: { iid: 'f1', chassis: 'skarn', via: 'grant', at: 1, loadout: 'stock' } }, ledger: [], claims: { 'award:s3': true } };
  });
  await store.flush();

  let release;
  registry.holdPull = new Promise((r) => { release = r; });
  const refreshing = store.refresh();
  await settle(5);
  store.completeStage(store.current(), 4, 250, 24);
  await store.flush();
  release();
  registry.holdPull = null;
  await refreshing;

  const after = store.progressOf(store.current());
  check('a spent award anchor is never dropped by a sync', after.hangar?.claims?.['award:s3'] === true);
}

/** Signing in as somebody else must not delete the first pilot's queued work. */
async function testSwitchingPilotsKeepsQueuedWork() {
  const { store, registry } = await freshStore();
  const first = await store.register('Rook', 'passcode1');
  store.completeStage(first, 1, 400, 24);
  registry.offline = true;                    // the win cannot reach the registry
  await store.flush();
  check('the unsynced win is still queued', store.current() !== null);

  store.clearSession();                        // "switch pilot"
  registry.offline = false;                    // a NEW pilot does need the registry
  const second = await store.register('Vesper', 'passcode2');
  check('the second pilot signs in', second.callsign === 'Vesper');
  eq('the second pilot starts fresh', store.progressOf(second).scrip, 0);

  // the first pilot comes back once the link returns
  registry.offline = false;
  store.clearSession();
  const back = await store.login('Rook', 'passcode1');
  const rec = store.progressOf(back);
  eq('the first pilot\'s queued win survived the switch', rec.scrip, 400);
  eq('...and its unlock too', rec.unlocked, 2);
  await store.flush();
  eq('...and it reaches the registry', registry.stateFor('acct-1').progress.scrip, 400);
}

/** A registered pilot must not lose queued work to a new registration either. */
async function testRegistrationKeepsAnotherPilotsQueuedWork() {
  const { store, registry } = await freshStore();
  const first = await store.register('Halyard', 'passcode1');
  registry.offline = true;
  store.completeStage(first, 1, 700, 24);
  await store.flush();
  store.clearSession();
  registry.offline = false;

  await store.register('Newcomer', 'passcode2');   // a brand-new pilot on the same device
  store.clearSession();
  const back = await store.login('Halyard', 'passcode1');
  eq('a new registration does not wipe the other pilot\'s queued save', store.progressOf(back).scrip, 700);
}

/** A locally-stale expiry must not delete anything: only the service decides. */
async function testExpiryIsTheServersCall() {
  const registry = new FakeRegistry();
  const storage = new FakeStorage();
  let ctx = await freshStore(registry, storage);
  const profile = await ctx.store.register('Tessellate', 'passcode1');
  ctx.store.completeStage(profile, 1, 250, 24);
  await ctx.store.flush();

  // force the stored expiry into the past, as a long-lived sliding session does
  const file = JSON.parse(storage.getItem('veyra.account.v3'));
  file.accounts[file.activeId].expiresAt = Date.now() - 1000;
  file.accounts[file.activeId].dirty = true;
  file.accounts[file.activeId].progress.scrip = 999;
  storage.setItem('veyra.account.v3', JSON.stringify(file));

  ctx = await freshStore(registry, storage);       // reload the page
  const resumed = await ctx.store.restore();
  check('a locally-expired session still resumes when the service accepts it', resumed !== null);
  eq('...with the queued progress intact', ctx.store.progressOf(resumed).scrip, 999);

  // and when the service really has revoked it mid-queue, the queued work is
  // still kept: re-dirty the record with a win the registry has never seen
  const queued = JSON.parse(storage.getItem('veyra.account.v3'));
  queued.accounts[queued.activeId].dirty = true;
  queued.accounts[queued.activeId].progress.scrip = 4242;
  storage.setItem('veyra.account.v3', JSON.stringify(queued));
  registry.deadTokens.add('tok-1');
  ctx = await freshStore(registry, storage);
  const denied = await ctx.store.restore();
  check('a genuinely dead session signs the pilot out', denied === null);
  const parked = JSON.parse(storage.getItem('veyra.account.v3'));
  check('...but the unsynced save is parked, not deleted', Object.keys(parked.accounts).length === 1);
  check('...with the queued win still in it', Object.values(parked.accounts)[0]?.progress?.scrip === 4242,
    JSON.stringify(Object.values(parked.accounts)[0]?.progress?.scrip));
  registry.deadTokens.clear();
  ctx = await freshStore(registry, storage);
  const recovered = await ctx.store.login('Tessellate', 'passcode1');
  eq('...and comes back on the next sign-in', ctx.store.progressOf(recovered).scrip, 4242);
}

/** The client's expiry must track the service's sliding one. */
async function testExpirySlides() {
  const { store, registry, storage } = await freshStore();
  const profile = await store.register('Kestrel', 'passcode1');
  registry.expiresAt = Date.now() + 400 * 24 * 60 * 60 * 1000;
  store.completeStage(profile, 1, 100, 24);
  await store.flush();
  const file = JSON.parse(storage.getItem('veyra.account.v3'));
  check('a push carries the service\'s new expiry back', file.accounts[file.activeId].expiresAt === registry.expiresAt,
    String(file.accounts[file.activeId].expiresAt));
}

/** An unwritable localStorage must not silently discard the edit. */
async function testStorageFailureKeepsTheEditInMemory() {
  const { store, registry, storage } = await freshStore();
  const profile = await store.register('Bastion', 'passcode1');
  await store.flush();
  storage.failWrites = true;
  store.completeStage(profile, 1, 640, 24);
  eq('the edit survives an unwritable cache', store.progressOf(store.current()).scrip, 640);
  await store.flush();
  eq('...and still reaches the registry', registry.stateFor('acct-1').progress.scrip, 640);
}

/** A guest who only ran Basic Training still carries that up on registering. */
async function testGuestTutorialCarriesUp() {
  const { store } = await freshStore();
  store.markTutorialDone(null);
  store.saveBtPhases(null, ['A', 'B']);
  check('the guest ran the tutorial', store.guestProgress().tutorialDone === true);
  const profile = await store.register('Vireo', 'passcode1');
  const progress = store.progressOf(profile);
  check('registering keeps the guest\'s tutorial completion', progress.tutorialDone === true);
  eq('...and the phases they confirmed', progress.btPhases, ['A', 'B']);
}

/** Two devices diverging must converge without losing either side. */
async function testConflictConverges() {
  const { store, registry } = await freshStore();
  const profile = await store.register('Cinder', 'passcode1');
  await store.flush();
  // another device moves the registry on underneath us
  const state = registry.stateFor('acct-1');
  state.rev = 5;
  state.progress = { unlocked: 6, scrip: 2000, completed: { 5: { scrip: 400, at: 1 } }, tutorialDone: true };

  store.completeStage(profile, 1, 300, 24);
  await store.flush();

  const after = store.progressOf(store.current());
  eq('the merge keeps the other device\'s unlock', after.unlocked, 6);
  eq('the merge keeps the larger wallet', after.scrip, 2000);
  check('the merge keeps this device\'s completion', Boolean(after.completed[1]));
  eq('the sync settles clean', store.syncStatus().state, 'clean');
  eq('the registry holds the merged copy', registry.stateFor('acct-1').progress.unlocked, 6);
}

/** Offline play queues and drains; nothing is lost in between. */
async function testOfflineQueueDrains() {
  const { store, registry } = await freshStore();
  const profile = await store.register('Sable', 'passcode1');
  await store.flush();
  registry.offline = true;
  store.completeStage(profile, 1, 250, 24);
  await store.flush();
  eq('offline is reported, not swallowed', store.syncStatus().state, 'offline');
  eq('the win is still on the device', store.progressOf(store.current()).scrip, 250);

  registry.offline = false;
  await store.flush();
  eq('the queue drains when the link returns', registry.stateFor('acct-1').progress.scrip, 250);
  eq('...and the status clears', store.syncStatus().state, 'clean');
}

/** A pilot who has signed in here before can sign in with no network. */
async function testOfflineSignIn() {
  const registry = new FakeRegistry();
  const storage = new FakeStorage();
  let ctx = await freshStore(registry, storage);
  const profile = await ctx.store.register('Tremor', 'passcode1');
  ctx.store.completeStage(profile, 1, 180, 24);
  await ctx.store.flush();
  ctx.store.clearSession();

  registry.offline = true;
  ctx = await freshStore(registry, storage);
  const offline = await ctx.store.login('Tremor', 'passcode1');
  check('a cached pilot can sign in offline', offline !== null);
  eq('...with their progress', ctx.store.progressOf(offline).scrip, 180);

  ctx = await freshStore(registry, storage);
  let rejected = false;
  try { await ctx.store.login('Tremor', 'wrong-passcode'); } catch { rejected = true; }
  check('offline sign-in still checks the passcode', rejected);

  ctx = await freshStore(registry, storage);
  let unknown = false;
  try { await ctx.store.login('Stranger', 'passcode1'); } catch { unknown = true; }
  check('an uncached pilot cannot sign in offline', unknown);
}

/** The pre-cloud single-record cache is folded up, not dropped. */
async function testV2CacheMigration() {
  const registry = new FakeRegistry();
  const storage = new FakeStorage();
  registry.account('Legacy');
  registry.stateFor('acct-1').rev = 3;
  registry.stateFor('acct-1').progress = { unlocked: 4, scrip: 900, completed: {}, tutorialDone: true };
  storage.setItem('veyra.account.v2', JSON.stringify({
    id: 'acct-1', callsign: 'Legacy', createdAt: 1, token: 'tok-1',
    expiresAt: Date.now() + 1000, rev: 3,
    progress: { unlocked: 4, scrip: 900, completed: {}, tutorialDone: true },
    dirty: false, verifierDigest: '', lastSyncedAt: 1,
  }));
  const ctx = await freshStore(registry, storage);
  const resumed = await ctx.store.restore();
  check('a v2 cache still resumes its session', resumed?.callsign === 'Legacy');
  eq('...with its progress', ctx.store.progressOf(resumed).scrip, 900);
  check('...and is folded into the v3 map', Boolean(storage.getItem('veyra.account.v3')));
}

// ---------------------------------------------------------------- run

const suites = [
  ['stale pull never rolls back', testStalePullNeverRollsBack],
  ['stale pull keeps grant anchors', testStalePullKeepsGrantAnchors],
  ['switching pilots keeps queued work', testSwitchingPilotsKeepsQueuedWork],
  ['registration keeps another pilot\'s work', testRegistrationKeepsAnotherPilotsQueuedWork],
  ['expiry is the service\'s call', testExpiryIsTheServersCall],
  ['expiry slides with the session', testExpirySlides],
  ['storage failure keeps the edit', testStorageFailureKeepsTheEditInMemory],
  ['guest tutorial carries up', testGuestTutorialCarriesUp],
  ['conflicts converge', testConflictConverges],
  ['offline queue drains', testOfflineQueueDrains],
  ['offline sign-in', testOfflineSignIn],
  ['v2 cache migration', testV2CacheMigration],
];

console.log('Veyra Prime — client sync-engine suite\n');
for (const [name, fn] of suites) {
  const before = failures.length;
  try {
    await fn();
  } catch (e) {
    failures.push(`${name} — threw: ${e?.stack ?? e}`);
  }
  const added = failures.length - before;
  console.log(`  ${added ? '✗' : '✓'} ${name}${added ? ` (${added} failed)` : ''}`);
}

fs.rmSync(outfile, { force: true });
console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  · ${f}`);
  process.exit(1);
}
