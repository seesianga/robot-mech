// Hangar + deck-contract test suite (node scripts/test_hangar.mjs).
// Exercises the SAME modules the game ships: server/hangarcore.mjs (economy,
// bays, ownership) and server/matchcore.mjs (deck snapshot, spent frames,
// redeploy, exhaustion). No browser, no mocks of the logic under test.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as H from '../server/hangarcore.mjs';
import { MatchCore } from '../server/matchcore.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const slotsJson = read('content/hangar/slots.json');
const catalogJson = read('content/hangar/requisition_catalog.json');
const mechs = read('content/mechs.json').mechs;
const TONS = new Map(mechs.map((m) => [m.id, m.tons]));

let now = 1_000_000;
let idSeq = 0;
const env = H.makeEnv(slotsJson, catalogJson, mechs.map((m) => m.id), () => now, () => `i${++idSeq}`);

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error(`  ✗ ${label}`); }
}
function section(name) { console.log(`— ${name}`); }

/** every committed account must satisfy the structural invariants */
function inv(acct, label) {
  const errs = H.checkInvariants(acct);
  ok(errs.length === 0, `${label} invariants: ${errs.join('; ')}`);
}

function freshAcct(scrip = 0) {
  let acct = { scrip, hangar: H.freshHangar() };
  const g = H.grantFrame(env, acct, 'skarn', 'grant', 'starter');
  acct = g.acct;
  return { acct, starter: g.iid };
}

// ---------- §3 bay economy ----------
section('bay economy');
{
  let { acct } = freshAcct(10_000);
  ok(acct.hangar.slots[0].state === 'unlocked', 'bay 1 free at creation');
  ok(acct.hangar.slots.slice(1).every((s) => s.state === 'locked'), 'bays 2–6 locked');

  // sequential: bay 3 before bay 2 rejected
  let r = H.unlockBay(env, acct, 2, 'k1');
  ok(!r.ok && r.err === 'PREREQ_LOCKED', 'sequential unlock enforced');

  // insufficient funds: machine-readable shortfall, wallet untouched
  const poor = freshAcct(100).acct;
  r = H.unlockBay(env, poor, 1, 'k2');
  ok(!r.ok && r.err === 'INSUFFICIENT_FUNDS' && r.short === slotsJson.slots[1].price - 100, 'INSUFFICIENT_FUNDS with shortfall');
  ok(poor.scrip === 100, 'failed unlock leaves wallet untouched');

  // happy path + exact debit
  r = H.unlockBay(env, acct, 1, 'k3');
  ok(r.ok && r.acct.scrip === 10_000 - slotsJson.slots[1].price, 'bay 2 unlock debits price');
  acct = r.acct;
  inv(acct, 'post-unlock');

  // replay: same idempotency key → exactly one charge
  const replay = H.unlockBay(env, acct, 1, 'k3');
  ok(replay.ok && replay.replay === true && replay.acct.scrip === acct.scrip, 'unlock replay: one charge');

  // double-unlock with a NEW key → ALREADY_UNLOCKED, no charge
  r = H.unlockBay(env, acct, 1, 'k4');
  ok(!r.ok && r.err === 'ALREADY_UNLOCKED', 'double unlock rejected');

  // wallet can never go negative on any path
  ok(acct.scrip >= 0, 'wallet floor holds');
}

// ---------- §4 ownership, duplicates (the §4.3 table, verbatim) ----------
section('§4.3 duplicate rules');
{
  // row 1: 1× owned — the same instance cannot END UP in two bays; assign is a move
  let { acct, starter } = freshAcct(50_000);
  acct = H.unlockBay(env, acct, 1, 'u2').acct;
  acct = H.assignBay(acct, 0, starter).acct;
  let r = H.assignBay(acct, 1, starter);
  ok(r.ok, 'row1/row3: re-assign is a move, not a copy');
  acct = r.acct;
  ok(acct.hangar.slots[0].iid === null && acct.hangar.slots[1].iid === starter, 'row3: instance LEFT bay 1');
  ok(new Set(acct.hangar.slots.filter((s) => s.iid).map((s) => s.iid)).size
    === acct.hangar.slots.filter((s) => s.iid).length, 'row1: no instance in two bays');
  inv(acct, 'row1');

  // row 2: 2× owned → both bays, two different instances
  const buy = H.purchaseFrame(env, acct, 'skarn', 'p1');
  ok(buy.ok, 'duplicate purchase is first-class');
  acct = buy.acct;
  const second = buy.iid;
  ok(second !== starter, 'duplicate is a NEW instance');
  r = H.assignBay(acct, 0, second);
  acct = r.acct;
  ok(acct.hangar.slots[0].iid === second && acct.hangar.slots[1].iid === starter, 'row2: both copies fielded');
  ok(Object.values(acct.hangar.frames).filter((f) => f.chassis === 'skarn').length === 2, 'row2: two rows, same chassis');
  inv(acct, 'row2');

  // swap semantics: assigning bay1's frame onto bay2 swaps the occupants
  r = H.assignBay(acct, 1, second);
  acct = r.acct;
  ok(acct.hangar.slots[1].iid === second && acct.hangar.slots[0].iid === starter, 'occupied target swaps');
  inv(acct, 'swap');

  // row 4: scrap while slotted → bay empties
  const dead = H.scrapFrame(env, acct, second, 's1');
  ok(dead.ok, 'scrap slotted frame');
  acct = dead.acct;
  ok(acct.hangar.slots[1].iid === null, 'row4: bay EMPTY after scrap');
  ok(!acct.hangar.frames[second], 'row4: instance destroyed');
  inv(acct, 'row4');
}

section('assign validation + scrap rules');
{
  let { acct, starter } = freshAcct(20_000);
  // locked bay
  let r = H.assignBay(acct, 3, starter);
  ok(!r.ok && r.err === 'BAY_LOCKED', 'assign to locked bay rejected');
  // unowned instance
  r = H.assignBay(acct, 0, 'ghost');
  ok(!r.ok && r.err === 'NOT_OWNED', 'assign unowned rejected');
  // last-frame scrap block
  r = H.scrapFrame(env, acct, starter, 's2');
  ok(!r.ok && r.err === 'LAST_FRAME', 'last frame can never be scrapped');
  // scrap refund = 50% catalog
  const buy = H.purchaseFrame(env, acct, 'halite', 'p2');
  acct = buy.acct;
  const before = acct.scrip;
  r = H.scrapFrame(env, acct, buy.iid, 's3');
  ok(r.ok && r.refund === Math.floor(5400 * 0.5) && r.acct.scrip === before + 2700, 'scrap refunds 50% of catalog');
  // salvage-acquired frame refunds catalog value too, never zero
  const grant = H.grantFrame(env, acct, 'pumice', 'salvage', 'g1');
  acct = grant.acct;
  r = H.scrapFrame(env, acct, grant.iid, 's4');
  ok(r.ok && r.refund === Math.floor(3300 * 0.5), 'salvage frame refund from catalog, not zero');
  // scrap replay: one refund
  acct = r.acct;
  const again = H.scrapFrame(env, acct, grant.iid, 's4');
  ok(again.ok && again.replay && again.acct.scrip === acct.scrip, 'scrap replay: one refund');
}

section('purchases, grants, rename, credit');
{
  let { acct } = freshAcct(4_000);
  // idempotent double-click purchase → exactly one charge, one instance
  const k = 'buy-click-1';
  let r = H.purchaseFrame(env, acct, 'skarn', k);
  acct = r.acct;
  const rr = H.purchaseFrame(env, acct, 'skarn', k);
  ok(rr.ok && rr.replay && Object.keys(rr.acct.hangar.frames).length === 2, 'double purchase: one instance');
  ok(rr.acct.scrip === 4_000 - 3_850, 'double purchase: one charge');
  // insufficient funds purchase
  r = H.purchaseFrame(env, acct, 'craton', 'buy2');
  ok(!r.ok && r.err === 'INSUFFICIENT_FUNDS', 'purchase over budget rejected');
  // bad chassis
  r = H.purchaseFrame(env, acct, 'notachassis', 'buy3');
  ok(!r.ok && r.err === 'BAD_CHASSIS', 'unknown chassis rejected');
  // rename: happy, charset, profanity
  const iid = Object.keys(acct.hangar.frames)[0];
  ok(H.renameFrame(acct, iid, 'Brawler build').ok, 'rename ok');
  ok(!H.renameFrame(acct, iid, '<script>').ok, 'rename charset rejected');
  ok(!H.renameFrame(acct, iid, 'FuCk you').ok, 'rename profanity rejected');
  // credit: idempotent match payout
  r = H.creditScrip(env, acct, 150, 'award', { source: 'mp' }, 'match-1');
  acct = r.acct;
  const rc = H.creditScrip(env, acct, 150, 'award', { source: 'mp' }, 'match-1');
  ok(rc.ok && rc.replay && rc.acct.scrip === acct.scrip, 'match payout replay: one credit');
}

section('grant permanence survives ledger pruning');
{
  // stage awards are at-most-once FOREVER — even after 24h+ of ledger churn
  // pushes the award entry out of the capped idempotency window
  let { acct } = freshAcct(1_000_000);
  const g = H.grantFrame(env, acct, 'gabbro', 'salvage', 'award:s6');
  acct = g.acct;
  now += 25 * 60 * 60 * 1000; // a day passes
  for (let i = 0; i < 260; i++) { // heavy churn: >LEDGER_CAP ledgered ops
    const r = H.creditScrip(env, acct, 1, 'award', {}, `match-${i}`);
    acct = r.acct;
  }
  ok(!acct.hangar.ledger.some((e) => e.key === 'award:s6'), 'award key pruned from the 24h ledger (precondition)');
  const again = H.grantFrame(env, acct, 'gabbro', 'salvage', 'award:s6');
  ok(again.ok && again.replay, 'pruned award key still refuses a re-grant (claims)');
  ok(Object.values(again.acct.hangar.frames).filter((f) => f.chassis === 'gabbro').length === 1, 'no duplicate frame minted');
}

section('two-tab race (sequential commits over shared store)');
{
  // tab A and tab B each read the same state, then commit in turn — the
  // second op runs against the FIRST's committed result (service re-reads),
  // so the one-instance-one-bay invariant can never break
  let { acct, starter } = freshAcct(30_000);
  acct = H.unlockBay(env, acct, 1, 'u').acct;
  const commit1 = H.assignBay(acct, 0, starter);     // tab A: bay 1
  const commit2 = H.assignBay(commit1.acct, 1, starter); // tab B: bay 2 (re-read state)
  ok(commit2.ok, 'second tab op applies cleanly');
  inv(commit2.acct, 'two-tab');
  ok(commit2.acct.hangar.slots.filter((s) => s.iid === starter).length === 1, 'instance in exactly one bay after race');
  // scrap-vs-assign: scrap commits first, stale assign then fails cleanly
  const scrapped = H.scrapFrame(env, H.purchaseFrame(env, commit2.acct, 'flint', 'pf').acct, starter, 'sv');
  const stale = H.assignBay(scrapped.acct, 0, starter);
  ok(!stale.ok && stale.err === 'NOT_OWNED', 'scrap-vs-assign: loser gets clean NOT_OWNED');
  inv(scrapped.acct, 'scrap-vs-assign');
}

section('deck selector');
{
  let { acct, starter } = freshAcct(30_000);
  ok(H.deckFrames(acct).length === 0, 'empty bays → empty deck');
  acct = H.assignBay(acct, 0, starter).acct;
  const b = H.purchaseFrame(env, acct, 'gabbro', 'pg');
  acct = H.unlockBay(env, b.acct, 1, 'ug').acct;
  acct = H.assignBay(acct, 1, b.iid).acct;
  const deck = H.deckFrames(acct);
  ok(deck.length === 2 && deck[0].iid === starter && deck[1].chassis === 'gabbro', 'deck = occupied bays in order');
}

// ---------- §5/§6 multiplayer deck contract (matchcore) ----------
function mkClient(core, name) {
  const inbox = [];
  const key = {};
  core.addClient(key, (msg) => inbox.push(msg));
  core.onMessage(key, JSON.stringify({ t: 'hello', name }));
  return { key, inbox, last: (t) => [...inbox].reverse().find((m) => m.t === t) };
}
const send = (core, c, msg) => core.onMessage(c.key, JSON.stringify(msg));

section('matchcore: deck validation + snapshot');
{
  const core = new MatchCore(TONS, { deckExhausted: 'recycle' });
  const a = mkClient(core, 'ALPHA');
  // queue without a deck → refused
  send(core, a, { t: 'queue', mode: 'dm' });
  ok(a.last('error')?.msg.includes('Hangar'), 'queue without deck refused');
  // malformed decks
  send(core, a, { t: 'deck', frames: [{ iid: 'x', chassis: 'notachassis' }] });
  ok(a.last('error')?.msg === 'Illegal deck.', 'illegal chassis refused');
  send(core, a, { t: 'deck', frames: [{ iid: 'x', chassis: 'skarn' }, { iid: 'x', chassis: 'flint' }] });
  ok(a.last('error')?.msg === 'Illegal deck.', 'duplicate instance ids refused');
  // valid deck + first-drop pick
  send(core, a, { t: 'deck', frames: [{ iid: 'A', chassis: 'skarn' }, { iid: 'B', chassis: 'basalt' }] });
  send(core, a, { t: 'deploy', iid: 'B' });
  send(core, a, { t: 'deploy', iid: 'ZZ' });
  ok(a.last('error')?.msg.includes('not in your deck'), 'deploy outside deck refused');
  send(core, a, { t: 'queue', mode: 'dm' });
  core.makeMatch('dm');
  const start = a.last('start');
  ok(start && start.deckExhausted === 'recycle', 'start announces exhaustion policy');
  const meRow = start.roster.find((r) => !r.bot);
  ok(meRow.chassis === 'basalt', 'lobby snapshot fields the first-drop pick');
  // hangar edits mid-match change nothing live: new deck message is ignored in-room
  const client = core.clients.get(a.key);
  send(core, a, { t: 'deck', frames: [{ iid: 'C', chassis: 'craton' }] });
  ok(client.deckSnap.length === 2 && client.deckSnap[1].iid === 'B', 'mid-match deck edit does not alter the frozen snapshot');
  // a LIVING pilot can never rotate frames — redeploy is death-gated
  send(core, a, { t: 'redeploy', iid: 'A' });
  ok(!a.inbox.some((msg) => msg.t === 'deployok'), 'redeploy while alive is ignored');
  ok(client.currentIid === 'B', 'living pilot keeps the fielded instance');
  // death spends the current instance
  send(core, a, { t: 'died', killer: 0 });
  ok(a.last('deckstate')?.spent.includes('B'), 'destruction spends the fielded instance');
  // redeploy to the spent frame while another remains → refused
  send(core, a, { t: 'redeploy', iid: 'B' });
  ok(a.last('error')?.msg.includes('expended'), 'spent frame cannot redeploy');
  // redeploy to the unspent frame → confirmed
  send(core, a, { t: 'redeploy', iid: 'A' });
  const okMsg = a.last('deployok');
  ok(okMsg && okMsg.chassis === 'skarn', 'redeploy to unspent frame confirmed');
  ok(client.currentIid === 'A', 'server tracks the fielded instance');
  for (const room of core.rooms) core.endMatch(room, 'time');
}

section('matchcore: exhaustion — recycle');
{
  const core = new MatchCore(TONS, { deckExhausted: 'recycle' });
  const a = mkClient(core, 'SOLO');
  send(core, a, { t: 'deck', frames: [{ iid: 'ONLY', chassis: 'skarn' }] });
  send(core, a, { t: 'queue', mode: 'dm' });
  core.makeMatch('dm');
  send(core, a, { t: 'died', killer: 0 });
  ok(a.last('deckstate')?.spent.length === 1, 'single-frame deck fully spent');
  send(core, a, { t: 'redeploy', iid: 'ONLY' });
  ok(a.last('deployok')?.iid === 'ONLY', 'recycle: deck refreshes, same instance redeploys');
  for (const room of core.rooms) core.endMatch(room, 'time');
}

section('matchcore: exhaustion — spectate');
{
  const core = new MatchCore(TONS, { deckExhausted: 'spectate' });
  const a = mkClient(core, 'SOLO2');
  send(core, a, { t: 'deck', frames: [{ iid: 'ONLY', chassis: 'skarn' }] });
  send(core, a, { t: 'queue', mode: 'dm' });
  core.makeMatch('dm');
  ok(a.last('start')?.deckExhausted === 'spectate', 'spectate policy announced');
  send(core, a, { t: 'died', killer: 0 });
  send(core, a, { t: 'redeploy', iid: 'ONLY' });
  ok(a.last('deckout')?.policy === 'spectate', 'spectate: exhausted deck refuses redeploy');
  ok(!a.inbox.some((m) => m.t === 'deployok'), 'spectate: no deployok ever sent');
  for (const room of core.rooms) core.endMatch(room, 'time');
}

section('matchcore: respawn requires a redeploy (no lives without a fresh frame)');
{
  const core = new MatchCore(TONS, { deckExhausted: 'recycle' });
  const a = mkClient(core, 'GATE');
  const b = mkClient(core, 'WATCHER');
  send(core, a, { t: 'deck', frames: [{ iid: 'G1', chassis: 'skarn' }, { iid: 'G2', chassis: 'gabbro' }] });
  send(core, b, { t: 'deck', frames: [{ iid: 'W1', chassis: 'skarn' }] });
  send(core, a, { t: 'queue', mode: 'dm' });
  send(core, b, { t: 'queue', mode: 'dm' });
  core.makeMatch('dm');
  send(core, a, { t: 'died', killer: 0 });
  const seen = () => b.inbox.filter((m) => m.t === 'rrespawn').length;
  const before = seen();
  send(core, a, { t: 'respawned' });
  ok(seen() === before, 'bare respawned while a redeploy is owed → dropped');
  send(core, a, { t: 'redeploy', iid: 'G2' });
  send(core, a, { t: 'respawned' });
  ok(seen() === before + 1, 'respawn flows once a redeploy cleared the debt');
  for (const room of core.rooms) core.endMatch(room, 'time');
}

section('matchcore: redeploy broadcast reaches the other pilots');
{
  const core = new MatchCore(TONS, { deckExhausted: 'recycle' });
  const a = mkClient(core, 'ONE');
  const b = mkClient(core, 'TWO');
  for (const c of [a, b]) {
    send(core, c, { t: 'deck', frames: [{ iid: `${c === a ? 'A' : 'B'}1`, chassis: 'skarn' }, { iid: `${c === a ? 'A' : 'B'}2`, chassis: 'gabbro' }] });
    send(core, c, { t: 'queue', mode: 'dm' });
  }
  core.makeMatch('dm');
  send(core, a, { t: 'died', killer: 0 });
  send(core, a, { t: 'redeploy', iid: 'A2' });
  const seen = b.last('rredeploy');
  ok(seen && seen.chassis === 'gabbro', 'other clients learn the new chassis');
  ok(!a.inbox.some((m) => m.t === 'rredeploy'), 'redeployer gets deployok, not the broadcast');
  for (const room of core.rooms) core.endMatch(room, 'time');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
