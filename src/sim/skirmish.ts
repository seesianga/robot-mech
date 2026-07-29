import * as THREE from 'three';
import type { Mech } from './mech';
import type { Terrain } from '../world/terrain';
import { BaseMission, type MissionCallbacks } from './mission';
import { Announcer } from './announcer';

/**
 * Practice Skirmish — Deathmatch vs. bots (stage 90). The §1.2 DM ruleset on
 * the impound-coast arena: 1 pt per 1% of a target's total pool, +25 kill,
 * +15 per limb taken. Score target 500 inside five minutes. Bots wave-respawn
 * 15 s after destruction; the player respawns 5 s after going down (a match
 * is never over because you lost a machine). Known bot limitation, by design:
 * the pilot AI hunts the player only, so this plays as score-attack — true
 * bot-vs-bot combat is the Phase-3 backfill ticket in docs/multiplayer-design.md.
 */

const MATCH_SECONDS = 300;
const SCORE_TARGET = 500;
const BOT_RESPAWN = 15;
const PLAYER_RESPAWN = 5;

const BOT_SPAWNS: Array<[number, number]> = [[330, -260], [-100, -300], [260, 200], [-420, -140]];
const PLAYER_SPAWN: [number, number] = [-350, 40];

function pool(m: Mech): number {
  let max = 0;
  for (const z of Object.values(m.zones)) max += z.armorMax + z.structureMax;
  return max;
}

function limbCount(m: Mech): number {
  return (['la', 'ra', 'll', 'rl'] as const).filter((z) => m.zones[z].destroyed).length;
}

export class SkirmishMission extends BaseMission {
  readonly id = 'mp_dm_bots';
  readonly title = 'SKIRMISH — DEATHMATCH';
  timeLeft: number | null = null;
  timerLabel = 'MATCH';

  private announcer: Announcer;
  private score = 0;
  private kills = 0;
  private firstBlood = false;
  private closeCalled = false;
  private warned60 = false;
  private warned10 = false;
  private limbSeen = new Map<Mech, number>();
  private botRespawnAt = new Map<Mech, number>();
  private playerDownAt = -1;
  private invulnUntil = -1;
  private clock = 0;
  private hudTick = 0;

  constructor(player: Mech, terrain: Terrain, cb: MissionCallbacks) {
    super(player, terrain, cb);
    this.announcer = new Announcer((fileId, cueId, text) => {
      this.cb.onVO({ id: cueId, speaker: 'Control', text, futz: true, audioId: fileId });
    });
  }

  protected onStart(): void {
    this.enemies = this.cb.spawnEnemies([
      { def: 'gabbro', pos: BOT_SPAWNS[0], alerted: true, name: 'Bot: Ferrat' },
      { def: 'pumice', pos: BOT_SPAWNS[1], alerted: true, name: 'Bot: Sable' },
      { def: 'halite', pos: BOT_SPAWNS[2], alerted: true, name: 'Bot: Kess' },
    ]);
    for (const b of this.enemies) this.limbSeen.set(b, 0);
  }

  protected afterBoot(): void {
    this.setPhase('match', 'DEATHMATCH', `Score ${SCORE_TARGET} — damage pays, kills pay double.`);
    this.timeLeft = MATCH_SECONDS;
    this.announcer.say('an_mode_dm', 'mode', 'Deathmatch. Damage scores, kills pay bonus.');
    this.announcer.say('an_live', 'match', 'Weapons free. The match is live.');
  }

  // engine signals: 'hit' carries {mech, dmg} for every player shot that lands
  notify(kind: string, data?: unknown): void {
    if (this.phase !== 'match') return;
    if (kind === 'hit') {
      const d = data as { mech: Mech; dmg: number };
      if (this.enemies.includes(d.mech) && d.mech.alive) {
        this.score += (d.dmg / pool(d.mech)) * 100;
      }
    }
  }

  notifyEnemyKilled(m: Mech): void {
    super.notifyEnemyKilled(m);
    if (this.phase !== 'match') return;
    this.kills++;
    this.score += 25;
    this.botRespawnAt.set(m, this.clock + BOT_RESPAWN);
    if (!this.firstBlood) {
      this.firstBlood = true;
      this.announcer.say('an_first', 'score', 'First blood.');
    } else {
      this.announcer.say('an_kill', 'score', 'Machine down.');
    }
  }

  update(dt: number): void {
    // custom loop: death here means a respawn wave, never mission failure
    switch (this.phase) {
      case 'boot': {
        this.bootTimer += dt;
        if (this.bootTimer > 13) {
          this.player.bootLocked = false;
          this.afterBoot();
        }
        break;
      }
      case 'complete':
      case 'failed':
        break;
      default:
        this.tick(dt);
    }
  }

  protected tick(dt: number): void {
    this.clock += dt;
    this.announcer.update(dt);
    if (this.timeLeft === null) return;
    this.timeLeft = Math.max(0, this.timeLeft - dt);

    // limb-taken bonus (+15 each, spec §1.2)
    for (const b of this.enemies) {
      const limbs = limbCount(b);
      const seen = this.limbSeen.get(b) ?? 0;
      if (limbs > seen && b.alive) this.score += (limbs - seen) * 15;
      this.limbSeen.set(b, limbs);
    }

    // bot respawn waves
    for (const [b, at] of this.botRespawnAt) {
      if (this.clock >= at) {
        this.botRespawnAt.delete(b);
        const sp = BOT_SPAWNS[(this.kills + Math.floor(this.clock)) % BOT_SPAWNS.length];
        this.cb.respawn?.(b, sp[0], sp[1]);
        this.limbSeen.set(b, 0);
      }
    }

    // player down → wave respawn with a short safety window
    if (!this.player.alive && this.playerDownAt < 0) {
      this.playerDownAt = this.clock;
      this.vo(`respawn_${Math.floor(this.clock)}`, 'CAIRN', 'Respawn in five.', false, 'vo.mp.bc_respawn5');
    }
    if (this.playerDownAt >= 0 && this.clock >= this.playerDownAt + PLAYER_RESPAWN) {
      this.playerDownAt = -1;
      this.cb.respawn?.(this.player, ...PLAYER_SPAWN);
      this.player.invulnerable = true;
      this.invulnUntil = this.clock + 3;
      this.vo(`refit_${Math.floor(this.clock)}`, 'CAIRN', 'Refit complete. Back in the fight.', false, 'vo.mp.bc_refit');
    }
    if (this.invulnUntil > 0 && this.clock >= this.invulnUntil) {
      this.invulnUntil = -1;
      this.player.invulnerable = false;
    }

    // announcer beats
    if (!this.closeCalled && this.score >= SCORE_TARGET * 0.85) {
      this.closeCalled = true;
      this.announcer.say('an_close', 'score', 'Score target within reach.');
    }
    if (!this.warned60 && this.timeLeft <= 60) {
      this.warned60 = true;
      this.announcer.say('an_60s', 'match', 'Sixty seconds remaining.');
    }
    if (!this.warned10 && this.timeLeft <= 10) {
      this.warned10 = true;
      this.announcer.say('an_10s', 'match', 'Ten seconds.');
    }

    // live score line
    this.hudTick -= dt;
    if (this.hudTick <= 0) {
      this.hudTick = 1;
      this.cb.onObjective('DEATHMATCH', `SCORE ${Math.floor(this.score)} / ${SCORE_TARGET} · KILLS ${this.kills}`);
    }

    // win / end
    if (this.score >= SCORE_TARGET) {
      this.timeLeft = null;
      this.player.invulnerable = true; // stand-down safety while the card shows
      this.announcer.say('an_win', 'match', 'Victory.');
      this.setPhase('complete', 'VICTORY', `Score ${Math.floor(this.score)} in ${Math.floor(this.clock)}s.`);
    } else if (this.timeLeft <= 0) {
      this.timeLeft = null;
      this.player.invulnerable = true;
      this.announcer.say('an_end', 'match', 'Match complete. Stand down.');
      this.setPhase('failed', 'TIME EXPIRED', `Final score ${Math.floor(this.score)} of ${SCORE_TARGET}.`);
    }
  }

  objectivePoint(): THREE.Vector3 | null {
    if (this.phase !== 'match') return null;
    let best: Mech | null = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = e.pos.distanceTo(this.player.pos);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best ? best.pos.clone() : null;
  }
}
