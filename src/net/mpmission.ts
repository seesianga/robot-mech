import * as THREE from 'three';
import type { Mech } from '../sim/mech';
import { MECHS } from '../sim/content';
import type { NetSession } from './session';
import type { MissionCallbacks, MissionLike, MissionPhase, SalvageEntry } from '../sim/mission';
import { Announcer } from '../sim/announcer';
import { netSession } from './session';

/**
 * 5v5 quick-match referee (stage 99). The server owns the clock, the score,
 * and match assembly; this mission drives the local presentation — objective
 * line, match timer, announcer beats — plus the client-side duties of the
 * victim-authoritative model: reporting the local pilot's death, respawn
 * waves for the pilot AND every robot this client owns, and (when this client
 * is the match host) arbitrating the capture-the-flag conversion.
 *
 * Modes: dm (1 pt per kill, first team to 20) · ctf (convert the flag to your
 * color — stand it uncontested for 5 s — then your team accrues 1 pt/s to 100).
 */

const PLAYER_RESPAWN = 8;
const BOT_RESPAWN = 10;
const REDEPLOY_AUTO_PICK = 15; // AFK guard: auto-pick the first unspent frame
const FLAG_RADIUS = 45;
const FLAG_CONVERT_SECONDS = 5;
const FLAG_POS = new THREE.Vector3(0, 0, 0);

interface ScoreTable {
  teams: { a: number; b: number };
  table: Array<{ id: number; name: string; team: string; kills: number; bot?: boolean }>;
}

export class MpMission implements MissionLike {
  readonly id = 'mp_net';
  readonly title: string;
  phase: MissionPhase = 'boot';
  bootTimer = 0;
  salvageReport: SalvageEntry[] = [];
  extractPoint = new THREE.Vector3();
  timeLeft: number | null = null;
  timerLabel = 'MATCH';

  private announcer: Announcer;
  private warmup = 3;
  private clock = 0;
  private target: number;
  private warned60 = false;
  private warned10 = false;
  private matchPoint = false;
  private firstBlood = false;
  private downAt = -1;
  private invulnUntil = -1;
  private deadSent = false;
  // deck consumption: destroyed frame → pick another unspent one (Core Rule:
  // the six bays ARE the deck; a spent instance stays spent for the match)
  private choosing = false;
  private autoPickAt = -1;
  private ackChassis: string | null = null;
  private spectating = false;
  private flagColor: string | null = null;
  private flagProg = { a: 0, b: 0 };
  private lastScore: ScoreTable | null = null;

  constructor(
    private player: Mech,
    private cb: MissionCallbacks,
    private mode: 'dm' | 'ctf',
    private myId: number,
    private myTeam: string,
    private mySpawn: [number, number],
  ) {
    this.title = mode === 'ctf' ? 'CAPTURE THE FLAG — 5v5' : 'DEATHMATCH — 5v5';
    this.target = mode === 'ctf' ? 100 : 20;
    this.announcer = new Announcer((fileId, cueId, text) => {
      this.cb.onVO({ id: cueId, speaker: 'Control', text, futz: true, audioId: fileId });
    });
  }

  start(): void {
    this.phase = 'boot';
    this.player.bootLocked = true;
    this.cb.onPhase('boot');
    this.cb.onObjective('LINK-UP', 'All machines connected. Stand by.');
  }

  update(dt: number): void {
    if (this.phase === 'complete' || this.phase === 'failed') return;
    this.announcer.update(dt);

    if (this.phase === 'boot') {
      this.warmup -= dt;
      if (this.warmup <= 0) {
        this.player.bootLocked = false;
        this.phase = 'match';
        this.cb.onPhase('match');
        this.cb.onObjective(this.title, this.mode === 'ctf' ? 'Turn the flag your color — points follow.' : 'First team to 20 kills.');
        this.announcer.say('an_countdown', 'match', 'Three. Two. One. Engage.');
        this.announcer.say(this.mode === 'ctf' ? 'an_mode_ctf' : 'an_mode_dm', 'mode',
          this.mode === 'ctf' ? 'Capture the flag. Steal it, run it home.' : 'Deathmatch. Damage scores, kills pay bonus.');
      }
      return;
    }

    this.clock += dt;
    const ns = netSession.active;
    if (!ns) return;

    // --- own death → report once, then pick the next unspent deck frame ---
    if (!this.player.alive && !this.deadSent && !this.spectating) {
      this.deadSent = true;
      this.downAt = this.clock;
      ns.client.send({ t: 'died', killer: ns.lastAttacker });
      ns.spent.add(ns.currentIid); // local mirror; the server's 'deckstate' is truth
      this.openPicker(ns);
    }
    // AFK guard: the picker chooses for the pilot after a grace window
    if (this.choosing && this.clock >= this.autoPickAt) {
      const first = ns.deck.find((f) => !ns.spent.has(f.iid)) ?? ns.deck[0];
      if (first) this.pick(first.iid);
    }
    // respawn only once the server confirmed the redeploy AND the wave timer passed
    if (this.deadSent && this.ackChassis !== null && this.clock >= this.downAt + PLAYER_RESPAWN) {
      this.deadSent = false;
      const chassis = this.ackChassis;
      this.ackChassis = null;
      const fresh = this.cb.redeployPlayer?.(chassis);
      if (fresh) this.player = fresh;
      this.cb.respawn?.(this.player, ...this.mySpawn);
      this.player.invulnerable = true;
      this.invulnUntil = this.clock + 3;
      ns.lastAttacker = 0; // stale attribution must not credit the next death
      ns.client.send({ t: 'respawned' });
      this.vo(`refit_${Math.floor(this.clock)}`, 'CAIRN', 'Refit complete. Back in the fight.', 'vo.mp.bc_refit');
    }
    if (this.invulnUntil > 0 && this.clock >= this.invulnUntil) {
      this.invulnUntil = -1;
      this.player.invulnerable = false;
    }

    // --- robots this client owns: report deaths, run their respawn waves ---
    for (const b of ns.ownedBots) {
      if (!b.mech.alive && !b.deadReported) {
        b.deadReported = true;
        b.diedAt = this.clock;
        ns.client.send({ t: 'died', who: b.id, killer: b.lastAttacker });
      }
      if (b.deadReported && this.clock >= b.diedAt + BOT_RESPAWN) {
        b.deadReported = false;
        b.lastAttacker = 0;
        this.cb.respawn?.(b.mech, b.sx, b.sz);
        ns.client.send({ t: 'respawned', who: b.id });
      }
    }

    // --- ctf: the host client arbitrates the flag conversion ---
    if (this.mode === 'ctf' && this.myId === ns.hostId && ns.combatants) {
      const near = new Set<string>();
      for (const c of ns.combatants()) {
        if (!c.m.alive || c.m.bootLocked) continue;
        if (Math.hypot(c.m.pos.x - FLAG_POS.x, c.m.pos.z - FLAG_POS.z) < FLAG_RADIUS) near.add(c.team);
      }
      for (const team of ['a', 'b'] as const) {
        if (near.size === 1 && near.has(team) && this.flagColor !== team) {
          this.flagProg[team] += dt;
          if (this.flagProg[team] >= FLAG_CONVERT_SECONDS) {
            this.flagProg.a = 0;
            this.flagProg.b = 0;
            ns.client.send({ t: 'flagstate', color: team });
          }
        } else {
          this.flagProg[team] = Math.max(0, this.flagProg[team] - dt);
        }
      }
    }
  }

  // --- deck consumption: destruction spends the frame, the pilot picks the next ---

  private openPicker(ns: NetSession): void {
    let unspent = ns.deck.filter((f) => !ns.spent.has(f.iid));
    if (!unspent.length) {
      if (ns.deckExhausted === 'recycle') {
        // the deck refreshes — casual respawn modes only (server enforces the same rule)
        ns.spent.clear();
        unspent = [...ns.deck];
        this.vo(`recycle_${Math.floor(this.clock)}`, 'CAIRN', 'Deck expended. The yard resets your rotation.', 'vo.mp.bc_refit');
      } else {
        this.spectating = true;
        this.cb.onSpectate?.();
        return;
      }
    }
    this.choosing = true;
    this.autoPickAt = this.clock + REDEPLOY_AUTO_PICK;
    const choices = ns.deck.map((f) => ({
      iid: f.iid,
      label: `${(MECHS[f.chassis]?.name ?? f.chassis).toUpperCase()} — ${MECHS[f.chassis]?.tons ?? '?'}T`,
      spent: ns.spent.has(f.iid),
    }));
    this.cb.showRedeploy?.(choices, `Press 1–${choices.length} or click · auto-deploy in ${REDEPLOY_AUTO_PICK}s`, (iid) => this.pick(iid));
  }

  private pick(iid: string): void {
    if (!this.choosing) return;
    this.choosing = false;
    this.cb.hideRedeploy?.();
    netSession.active?.client.send({ t: 'redeploy', iid });
  }

  /** net messages routed in from main.ts */
  notify(kind: string, data?: unknown): void {
    if (kind !== 'net') return;
    const ns = netSession.active;
    const msg = data as Record<string, unknown>;
    switch (msg.t) {
      case 'clock': {
        this.timeLeft = msg.left as number;
        if (!this.warned60 && this.timeLeft <= 60) {
          this.warned60 = true;
          this.announcer.say('an_60s', 'match', 'Sixty seconds remaining.');
          this.vo('final_min', 'CAIRN', 'Final minute.', 'vo.mp.bc_final_min');
        }
        if (!this.warned10 && this.timeLeft <= 10) { this.warned10 = true; this.announcer.say('an_10s', 'match', 'Ten seconds.'); }
        break;
      }
      case 'score': {
        const s = msg as unknown as ScoreTable;
        this.lastScore = s;
        this.refreshObjective();
        if (!this.matchPoint && Math.max(s.teams.a, s.teams.b) >= this.target - (this.mode === 'ctf' ? 10 : 1)) {
          this.matchPoint = true;
          this.announcer.say('an_matchpoint', 'score', 'Match point.');
          this.vo('matchpoint', 'CAIRN', 'Match point. One more.', 'vo.mp.bc_matchpoint');
        }
        break;
      }
      case 'rdied': {
        if (!this.firstBlood) {
          this.firstBlood = true;
          this.announcer.say('an_first', 'score', 'First blood.');
        } else {
          this.announcer.say('an_kill', 'score', 'Machine down.');
        }
        if (msg.killer === this.myId) {
          // only hostile kills count — a team-kill must never feed the match payout
          const victim = ns?.roster.find((r) => r.id === msg.id);
          if (victim && victim.team !== this.myTeam) {
            this.salvageReport.push({ name: 'Hostile machine', cause: 'ct', yield: 0.4 });
          }
        }
        break;
      }
      case 'flag': {
        this.flagColor = msg.color as string;
        this.flagProg.a = 0;
        this.flagProg.b = 0;
        ns?.setFlagColor?.(this.flagColor);
        if (this.flagColor === this.myTeam) this.announcer.say('an_flag_cap', 'objective', 'Flag captured.');
        else this.announcer.say('an_flag_own', 'objective', 'Your flag is taken.');
        this.refreshObjective();
        break;
      }
      case 'host': {
        if (ns) ns.hostId = msg.id as number;
        break;
      }
      case 'deployok': {
        // server confirmed the redeploy — the respawn gate in update() takes it from here
        if (ns) {
          ns.currentIid = String(msg.iid);
          ns.spent.delete(String(msg.iid)); // recycle may have refreshed the deck server-side
        }
        this.ackChassis = String(msg.chassis);
        break;
      }
      case 'deckstate': {
        // server's spent set is truth; a full set under recycle is cleared on redeploy
        if (ns) ns.spent = new Set((msg.spent as string[]) ?? []);
        break;
      }
      case 'deckout': {
        this.choosing = false;
        this.cb.hideRedeploy?.();
        this.spectating = true;
        this.cb.onSpectate?.();
        break;
      }
      case 'end': {
        if (this.phase === 'complete' || this.phase === 'failed') break; // once — a socket close after 'end' must not double-pay
        const winner = msg.winner as string;
        // A dropped socket is synthesised as an 'end' by main.ts so the client can
        // unwind cleanly, but it is NOT a result: reporting it as a 0-0 draw is
        // indistinguishable from a real drawn match, which is exactly how a server
        // restart mid-match reads to a player as "MATCH OVER" the moment they drop in.
        const lost = (msg as unknown as { reason?: string }).reason === 'disconnect';
        const iWon = !lost && winner === this.myTeam;
        const draw = !lost && winner === 'draw';
        this.timeLeft = null;
        this.choosing = false;
        this.cb.hideRedeploy?.();
        this.player.invulnerable = true;
        if (!lost) {
          this.announcer.say(draw ? 'an_draw' : iWon ? 'an_win' : 'an_loss', 'match',
            draw ? 'Drawn. No victor today.' : iWon ? 'Victory.' : 'Defeat.');
        }
        const s = (msg as unknown as ScoreTable);
        const mine = s.table?.find((r) => r.id === this.myId);
        this.phase = iWon ? 'complete' : 'failed';
        this.cb.onObjective(
          lost ? 'CONNECTION LOST' : iWon ? 'VICTORY' : draw ? 'DRAW' : 'DEFEAT',
          lost
            ? 'Link to the match server dropped — the match was not scored.'
            : `ALPHA ${s.teams?.a ?? 0} · BRAVO ${s.teams?.b ?? 0} · your kills: ${mine?.kills ?? 0}`);
        this.cb.onPhase(this.phase);
        break;
      }
    }
  }

  private refreshObjective(): void {
    const s = this.lastScore;
    if (!s) return;
    const mine = s.table.find((r) => r.id === this.myId);
    if (this.mode === 'ctf') {
      const flag = this.flagColor === 'a' ? 'ALPHA' : this.flagColor === 'b' ? 'BRAVO' : 'NEUTRAL';
      this.cb.onObjective(this.title, `FLAG ${flag} · ALPHA ${s.teams.a} · BRAVO ${s.teams.b} · FIRST TO ${this.target}`);
    } else {
      this.cb.onObjective(this.title, `ALPHA ${s.teams.a} · BRAVO ${s.teams.b} · FIRST TO ${this.target} · YOU ${mine?.kills ?? 0}`);
    }
  }

  notifyEnemyKilled(_m: Mech): void {
    // kill credit is the server's call (victims report their killer) — no local double-count
  }

  private vo(id: string, speaker: string, text: string, audioId: string): void {
    this.cb.onVO({ id, speaker, text, futz: false, audioId });
  }

  objectivePoint(): THREE.Vector3 | null {
    if (this.phase !== 'match') return null;
    if (this.mode === 'ctf') {
      return new THREE.Vector3(FLAG_POS.x, this.player.pos.y, FLAG_POS.z);
    }
    return null;
  }
}
