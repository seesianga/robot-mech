// Runtime-agnostic 5v5 quick-match core — shared by the Cloudflare Durable
// Object (worker/matchlobby.mjs) and the LAN Node relay (server/mp-server.mjs).
//
// Flow: pilots who click JOIN enter a per-mode queue; the first joiner starts a
// 30-second matchmaking window; everyone who joins inside it drops together.
// At zero (or a full 10-pilot pool) the match starts and every empty slot is
// filled by a robot. Robots are simulated by their assigned owner client and
// speak the same message vocabulary via the `who` field (server-validated).
//
// Modes:
//   dm  — team deathmatch, 1 point per kill, first team to 20
//   ctf — one neutral flag; convert it to your color (host-arbitrated), then
//         your team accrues 1 pt/s while it stays yours; first to 100

const QUEUE_SECONDS = 30;
const MATCH_SIZE = 10;
const TEAM_SIZE = 5;
const MATCH_SECONDS = 300;
const TARGETS = { dm: 20, ctf: 100 };
const BOT_CHASSIS = ['pumice', 'flint', 'halite', 'gabbro', 'skarn', 'chert'];

export class MatchCore {
  constructor(tons, opts = {}) {
    this.TONS = tons; // Map(chassisId -> tons)
    this.clients = new Map(); // key -> { key, id, name, chassis, deck, deployIid, send, queued, room }
    this.queues = { dm: null, ctf: null };
    this.rooms = new Set();
    this.nextId = 1;
    this.botSeq = 100001;
    // what happens when every deck frame is spent (content/hangar/mp.json):
    // 'recycle' refreshes the deck (casual respawn modes); 'spectate' ends respawns
    this.deckPolicy = opts.deckExhausted === 'spectate' ? 'spectate' : 'recycle';
  }

  addClient(key, send) {
    this.clients.set(key, {
      key, id: 0, name: 'PILOT', chassis: 'skarn', send, queued: null, room: null,
      deck: null, deployIid: null,
    });
  }

  removeClient(key) {
    const c = this.clients.get(key);
    if (!c) return;
    this.unqueue(c);
    this.leaveRoom(c);
    this.clients.delete(key);
  }

  onMessage(key, raw) {
    const c = this.clients.get(key);
    if (!c) return;
    let m;
    try { m = JSON.parse(String(raw).slice(0, 4096)); } catch { return; }

    switch (m.t) {
      case 'hello': {
        c.name = String(m.name ?? 'PILOT').slice(0, 24).replace(/[^\w \-]/g, '') || 'PILOT';
        if (!c.id) c.id = this.nextId++;
        c.send({ t: 'welcome', id: c.id });
        break;
      }
      case 'deck': {
        // the six Deployment Bays ARE the multiplayer deck — the client sends
        // its bay contents (owned instances) and the server freezes them at drop.
        // Ownership itself is client-attested: accounts are browser-local by
        // design (src/save/profiles.ts), so the server can enforce deck SHAPE
        // and per-match consumption, not that the instances exist in a wallet.
        // If accounts ever move server-side, validate here against hangarcore.
        if (c.room) return; // decks lock at drop
        const raw = Array.isArray(m.frames) ? m.frames.slice(0, 6) : [];
        const seen = new Set();
        const deck = [];
        for (const f of raw) {
          const iid = String(f?.iid ?? '').slice(0, 40);
          const chassis = String(f?.chassis ?? '');
          if (!iid || seen.has(iid) || !this.TONS.has(chassis)) {
            c.send({ t: 'error', msg: 'Illegal deck.' });
            return;
          }
          seen.add(iid);
          deck.push({ iid, chassis });
        }
        if (!deck.length) { c.send({ t: 'error', msg: 'Empty deck — outfit your Hangar first.' }); return; }
        c.deck = deck;
        if (!deck.some((f) => f.iid === c.deployIid)) c.deployIid = deck[0].iid;
        c.chassis = deck.find((f) => f.iid === c.deployIid).chassis;
        break;
      }
      case 'deploy': {
        // first-drop pick, pre-match only (in-match picks go through 'redeploy')
        if (c.room) return;
        const f = c.deck?.find((x) => x.iid === m.iid);
        if (!f) { c.send({ t: 'error', msg: 'That frame is not in your deck.' }); return; }
        c.deployIid = f.iid;
        c.chassis = f.chassis;
        break;
      }
      case 'queue': {
        if (!c.id || c.room) return;
        if (!c.deck?.length) { c.send({ t: 'error', msg: 'No deployable frames — outfit your Hangar first.' }); return; }
        this.queue(c, m.mode === 'ctf' ? 'ctf' : 'dm');
        break;
      }
      case 'unqueue': this.unqueue(c); break;
      case 'state': case 'fire': case 'respawned': {
        const room = c.room;
        if (!room || room.state !== 'live') return;
        const who = this.resolveWho(c, m);
        if (who === null) return;
        if (m.t === 'respawned' && who === c.id) {
          // a dead pilot must clear an unspent 'redeploy' first — otherwise a
          // client could self-respawn on a spent frame (or bypass spectate)
          if (c.dead && c.needsRedeploy) return;
          c.dead = false;
        }
        const out = m.t === 'state' ? { t: 'rstate', id: who, s: m.s }
          : m.t === 'fire' ? { t: 'rfire', id: who, group: m.group | 0, aim: m.aim }
          : { t: 'rrespawn', id: who };
        this.roomBroadcast(room, out, c);
        break;
      }
      case 'died': {
        const room = c.room;
        if (!room || room.state !== 'live') return;
        const who = this.resolveWho(c, m);
        if (who === null) return;
        this.onDeath(room, who, m.killer | 0);
        break;
      }
      case 'flagstate': {
        const room = c.room;
        if (!room || room.state !== 'live' || room.mode !== 'ctf') return;
        if (c.id !== room.hostId) return; // the host client arbitrates the flag
        const color = m.color === 'a' ? 'a' : m.color === 'b' ? 'b' : null;
        if (!color || room.flagColor === color) return;
        room.flagColor = color;
        this.roomBroadcast(room, { t: 'flag', color });
        this.roomBroadcast(room, this.scoreMsg(room));
        break;
      }
      case 'redeploy': {
        // pick another unspent deck frame after destruction — the server owns
        // the spent set, so a client can never field a frame twice per deck
        const room = c.room;
        if (!room || room.state !== 'live' || !c.deckSnap) return;
        if (!c.dead) return; // frames rotate only through destruction — never mid-life
        const f = c.deckSnap.find((x) => x.iid === m.iid);
        if (!f) { c.send({ t: 'error', msg: 'That frame is not in your deck.' }); return; }
        if (c.spent.size >= c.deckSnap.length) {
          if (this.deckPolicy === 'recycle') c.spent.clear(); // deck refreshes
          else { c.send({ t: 'deckout', policy: 'spectate' }); return; }
        }
        if (c.spent.has(f.iid)) { c.send({ t: 'error', msg: 'That frame is already expended.' }); return; }
        c.currentIid = f.iid;
        c.chassis = f.chassis;
        c.needsRedeploy = false;
        c.send({ t: 'deployok', iid: f.iid, chassis: f.chassis });
        this.roomBroadcast(room, { t: 'rredeploy', id: c.id, chassis: f.chassis }, c);
        break;
      }
      case 'leave': this.leaveRoom(c); break;
    }
  }

  // --- queueing ---

  queue(c, mode) {
    if (c.queued === mode) return;
    this.unqueue(c);
    let q = this.queues[mode];
    if (!q) {
      q = { members: new Set(), secs: QUEUE_SECONDS, timer: setInterval(() => this.qTick(mode), 1000) };
      this.queues[mode] = q;
    }
    q.members.add(c);
    c.queued = mode;
    this.qBroadcast(mode);
    if (q.members.size >= MATCH_SIZE) this.makeMatch(mode);
  }

  unqueue(c) {
    if (!c.queued) return;
    const q = this.queues[c.queued];
    q?.members.delete(c);
    if (q && q.members.size === 0) {
      clearInterval(q.timer);
      this.queues[c.queued] = null;
    }
    c.queued = null;
  }

  qTick(mode) {
    const q = this.queues[mode];
    if (!q) return;
    q.secs -= 1;
    if (q.secs <= 0) this.makeMatch(mode);
    else this.qBroadcast(mode);
  }

  qBroadcast(mode) {
    const q = this.queues[mode];
    if (!q) return;
    for (const c of q.members) c.send({ t: 'qstatus', mode, count: q.members.size, secs: q.secs });
  }

  // --- match assembly: reals first (tonnage-balanced), robots fill to 5v5 ---

  makeMatch(mode) {
    const q = this.queues[mode];
    if (!q) return;
    clearInterval(q.timer);
    this.queues[mode] = null;
    const reals = [...q.members].slice(0, MATCH_SIZE);
    for (const c of q.members) c.queued = null;
    if (!reals.length) return;

    const room = {
      mode, state: 'live', clock: MATCH_SECONDS,
      players: new Map(), bots: new Map(),
      kills: { a: 0, b: 0 }, points: { a: 0, b: 0 }, flagColor: null,
      hostId: Math.min(...reals.map((c) => c.id)), timer: null,
    };

    // team split: heaviest real machines first, alternating to the lighter side
    const sorted = [...reals].sort((x, y) => (this.TONS.get(y.chassis) ?? 0) - (this.TONS.get(x.chassis) ?? 0));
    let ta = 0, tb = 0, na = 0, nb = 0;
    for (const c of sorted) {
      const pickA = (na < TEAM_SIZE) && (nb >= TEAM_SIZE || ta <= tb);
      if (pickA) { c.team = 'a'; ta += this.TONS.get(c.chassis) ?? 0; na++; }
      else { c.team = 'b'; tb += this.TONS.get(c.chassis) ?? 0; nb++; }
      c.kills = 0;
      // freeze the deck at ready-up: hangar edits during the match change nothing live
      c.deckSnap = (c.deck ?? [{ iid: 'legacy', chassis: c.chassis }]).map((f) => ({ ...f }));
      c.spent = new Set();
      c.dead = false;
      c.needsRedeploy = false;
      c.currentIid = c.deckSnap.some((f) => f.iid === c.deployIid) ? c.deployIid : c.deckSnap[0].iid;
      room.players.set(c.id, c);
      c.room = room;
    }

    // robots fill the empty seats
    let bn = 1;
    while (na + nb < MATCH_SIZE) {
      const team = na <= nb && na < TEAM_SIZE ? 'a' : 'b';
      const owner = reals[(bn - 1) % reals.length].id;
      const bot = {
        id: this.botSeq++, name: `ROBOT-${bn}`, bot: true, owner, team,
        chassis: BOT_CHASSIS[(bn - 1) % BOT_CHASSIS.length], kills: 0,
      };
      room.bots.set(bot.id, bot);
      if (team === 'a') na++; else nb++;
      bn++;
    }

    // per-team slot numbering 0..4
    const slotCount = { a: 0, b: 0 };
    const roster = [];
    for (const c of room.players.values()) {
      roster.push({ id: c.id, name: c.name, chassis: c.chassis, team: c.team, slot: slotCount[c.team]++ });
    }
    for (const b of room.bots.values()) {
      roster.push({ id: b.id, name: b.name, chassis: b.chassis, team: b.team, slot: slotCount[b.team]++, bot: true, owner: b.owner });
    }

    this.rooms.add(room);
    this.roomBroadcast(room, { t: 'start', mode, roster, host: room.hostId, deckExhausted: this.deckPolicy });
    room.timer = setInterval(() => this.tickRoom(room), 1000);
  }

  // --- refereeing ---

  entity(room, id) {
    return room.players.get(id) ?? room.bots.get(id) ?? null;
  }

  resolveWho(c, m) {
    const who = Number(m.who ?? c.id);
    if (who === c.id) return who;
    const bot = c.room?.bots.get(who);
    return bot && bot.owner === c.id ? who : null;
  }

  onDeath(room, victimId, killerId) {
    const victim = this.entity(room, victimId);
    const killer = this.entity(room, killerId);
    if (killer && victim && killer.team !== victim.team) {
      killer.kills += 1;
      room.kills[killer.team] += 1;
    }
    // a destroyed deck frame is spent for the remainder of the match (real pilots only)
    const vp = room.players.get(victimId);
    if (vp?.deckSnap && vp.currentIid) {
      vp.dead = true; // gates 'redeploy' — a living pilot can never rotate frames
      vp.needsRedeploy = true; // and gates 'respawned' — no lives without a fresh frame
      vp.spent.add(vp.currentIid);
      vp.send({ t: 'deckstate', spent: [...vp.spent], of: vp.deckSnap.length });
    }
    this.roomBroadcast(room, { t: 'rdied', id: victimId, killer: killerId });
    this.roomBroadcast(room, this.scoreMsg(room));
    if (room.mode === 'dm' && (room.kills.a >= TARGETS.dm || room.kills.b >= TARGETS.dm)) {
      this.endMatch(room, 'target');
    }
  }

  scoreMsg(room) {
    const teams = room.mode === 'dm' ? { ...room.kills } : { ...room.points };
    const table = [...room.players.values(), ...room.bots.values()]
      .map((p) => ({ id: p.id, name: p.name, team: p.team, kills: p.kills, bot: Boolean(p.bot) }))
      .sort((x, y) => y.kills - x.kills);
    return { t: 'score', teams, table };
  }

  tickRoom(room) {
    room.clock -= 1;
    this.roomBroadcast(room, { t: 'clock', left: room.clock });
    if (room.mode === 'ctf') {
      if (room.flagColor) room.points[room.flagColor] += 1;
      this.roomBroadcast(room, this.scoreMsg(room));
      if (room.points.a >= TARGETS.ctf || room.points.b >= TARGETS.ctf) { this.endMatch(room, 'target'); return; }
    }
    if (room.clock <= 0) this.endMatch(room, 'time');
  }

  endMatch(room, reason) {
    if (room.state !== 'live') return;
    room.state = 'over';
    clearInterval(room.timer);
    const s = room.mode === 'dm' ? room.kills : room.points;
    const winner = s.a > s.b ? 'a' : s.b > s.a ? 'b' : 'draw';
    this.roomBroadcast(room, { t: 'end', reason, winner, ...this.scoreMsg(room) });
    for (const p of room.players.values()) { p.room = null; }
    this.rooms.delete(room);
  }

  leaveRoom(c) {
    const room = c.room;
    if (!room) return;
    room.players.delete(c.id);
    c.room = null;
    // a departing pilot takes their robots down with them
    for (const [bid, b] of [...room.bots]) {
      if (b.owner === c.id) {
        room.bots.delete(bid);
        this.roomBroadcast(room, { t: 'rdied', id: bid, killer: 0 });
      }
    }
    if (room.players.size === 0) {
      clearInterval(room.timer);
      this.rooms.delete(room);
      return;
    }
    this.roomBroadcast(room, { t: 'pleave', id: c.id });
    if (room.hostId === c.id) {
      room.hostId = Math.min(...[...room.players.keys()]);
      this.roomBroadcast(room, { t: 'host', id: room.hostId });
    }
    this.roomBroadcast(room, this.scoreMsg(room));
  }

  roomBroadcast(room, msg, exceptClient = null) {
    for (const p of room.players.values()) {
      if (p !== exceptClient) p.send(msg);
    }
  }
}
