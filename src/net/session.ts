import type { Mech } from '../sim/mech';
import type { MpClient, RosterEntry } from './mpclient';

/**
 * Handoff between the quick-match queue (StartScreen) and the match
 * (main.ts / MpMission): the queue writes `active` right before igniting
 * stage 99; combat-side code reads the client, roster, and the
 * victim-authoritative bookkeeping. Robots assigned to this client are
 * registered in `ownedBots` by main.ts and refereed by MpMission.
 */

export interface OwnedBot {
  id: number;
  mech: Mech;
  team: string;
  /** respawn pad */
  sx: number;
  sz: number;
  /** net id of the last hostile that connected with this robot */
  lastAttacker: number;
  /** death already reported upstream; cleared on respawn */
  deadReported: boolean;
  /** mission clock time of death (respawn wave timing) */
  diedAt: number;
}

export interface NetSession {
  client: MpClient;
  myId: number;
  mode: 'dm' | 'ctf';
  roster: RosterEntry[];
  myTeam: string;
  /** current flag/host authority (the lowest-id real pilot; server reassigns on leave) */
  hostId: number;
  /** net id of the last hostile whose fire connected with the local machine */
  lastAttacker: number;
  /** robots this client simulates and reports for */
  ownedBots: OwnedBot[];
  /** every combat machine in the match with its team — flag arbitration reads this */
  combatants?: () => Array<{ m: Mech; team: string }>;
  /** repaint the flag prop (ctf) */
  setFlagColor?: (color: string) => void;
  /** the frozen deck snapshot (bay contents at ready-up) — the ONLY frames this pilot can field */
  deck: Array<{ iid: string; chassis: string }>;
  /** instances expended this match (server-confirmed via 'deckstate') */
  spent: Set<string>;
  /** the deck instance currently fielded */
  currentIid: string;
  /** what happens when every deck frame is spent (server-announced at start) */
  deckExhausted: 'recycle' | 'spectate';
}

export const netSession: { active: NetSession | null } = { active: null };
