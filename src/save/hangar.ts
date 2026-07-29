/**
 * HangarService — the client's single gateway to the collection, the six
 * Deployment Bays, and the scrip wallet. All rules live in the shared engine
 * (server/hangarcore.mjs); this wrapper binds it to ProfileStore persistence
 * (localStorage profile or sessionStorage guest) and re-reads stored state
 * before every mutation so cross-tab writes are never clobbered.
 *
 * [ADAPTATION] The master prompt specifies PostgreSQL + authoritative HTTP
 * endpoints. This build's account system is deliberately local (see
 * src/save/profiles.ts — "this is not a security boundary; there's no
 * server"), so the transactional/idempotent op layer runs on the shared
 * engine client-side, and the genuinely server-authoritative surface is the
 * multiplayer deck contract in server/matchcore.mjs. If accounts ever move
 * server-side, hangarcore.mjs is the module that relocates unchanged.
 */

import * as core from '../../server/hangarcore.mjs';
import type { Account, FrameInstance, HangarEnv, OpResult } from '../../server/hangarcore.mjs';
import slotsJson from '../../content/hangar/slots.json';
import catalogJson from '../../content/hangar/requisition_catalog.json';
import awardsJson from '../../content/hangar/awards.json';
import mpJson from '../../content/hangar/mp.json';
import { MECHS } from '../sim/content';
import type { ProfileStore, Profile, Progress } from './profiles';

export type { Account, FrameInstance, HangarState, HangarSlot, LedgerEntry } from '../../server/hangarcore.mjs';
export const BAY_COUNT = core.BAY_COUNT;

export const STARTER_CHASSIS = 'skarn';
export const SCRAP_REFUND_PCT: number = (catalogJson as { scrapRefundPct: number }).scrapRefundPct;
export const MATCH_SCRIP: { win: number; loss: number; perKill: number } =
  (mpJson as { matchScrip: { win: number; loss: number; perKill: number } }).matchScrip;
export const STAGE_GRANTS: Record<string, string> = (awardsJson as { stageGrants: Record<string, string> }).stageGrants;

export interface DeckFrame {
  iid: string;
  chassis: string;
}

/** Friendly copy for every machine-readable failure the engine can return. */
export function errorCopy(r: OpResult): string {
  if (r.ok) return '';
  switch (r.err) {
    case 'INSUFFICIENT_FUNDS': return `Insufficient scrip — ${(r as { short?: number }).short ?? '?'} short.`;
    case 'PREREQ_LOCKED': return `Unlock Bay ${(r as { prereq?: number }).prereq ?? '?'} first.`;
    case 'ALREADY_UNLOCKED': return 'That bay is already unlocked.';
    case 'BAY_LOCKED': return 'That bay is still locked.';
    case 'NOT_OWNED': return 'You do not own that frame.';
    case 'LAST_FRAME': return 'A pilot always keeps at least one frame — the yard will not scrap your last machine.';
    case 'BAD_NAME': return 'That name will not clear the registry. Letters, digits, spaces — 24 max.';
    case 'BAD_CHASSIS': return 'Unknown chassis.';
    case 'NOT_AVAILABLE': return 'Not currently in the requisition catalog.';
    default: return 'The service bay rejected that request.';
  }
}

export class HangarService {
  readonly env: HangarEnv;

  constructor(private store: ProfileStore) {
    this.env = core.makeEnv(
      slotsJson, catalogJson, Object.keys(MECHS),
      () => Date.now(),
      () => crypto.randomUUID(),
    );
  }

  /** Hangar bootstrap on a Progress draft: create the hangar and the starter
   *  grant (auto-assigned to Bay 1) if missing. Returns the working account. */
  private initAcct(g: Progress): Account {
    if (!g.hangar) g.hangar = core.freshHangar();
    let acct: Account = { scrip: g.scrip, hangar: g.hangar };
    if (Object.keys(acct.hangar.frames).length === 0) {
      const granted = core.grantFrame(this.env, acct, STARTER_CHASSIS, 'grant', 'starter-grant');
      if (granted.ok) {
        acct = granted.acct;
        const assigned = core.assignBay(acct, 0, (granted as { iid?: string }).iid ?? '');
        if (assigned.ok) acct = assigned.acct;
      }
    }
    return acct;
  }

  /**
   * Migration + first-run: guarantee the account has a hangar with the
   * starter frame in Bay 1, and back-fill first-completion salvage grants for
   * stages the pilot finished before the Hangar shipped (idempotent by stage
   * key, so the mission-end grant path never double-pays). Safe to call every
   * render.
   */
  ensure(profile: Profile | null): Account {
    const progress = this.store.updateProgress(profile, (g) => {
      let acct = this.initAcct(g);
      // salvage back-fill: stages completed before the Hangar existed still pay out
      for (const [stageStr, chassis] of Object.entries(STAGE_GRANTS)) {
        if (!g.completed[Number(stageStr)]) continue;
        const r = core.grantFrame(this.env, acct, chassis, 'salvage', `award:s${stageStr}`);
        if (r.ok && !r.replay) acct = r.acct;
      }
      g.scrip = acct.scrip;
      g.hangar = acct.hangar;
    });
    return { scrip: progress.scrip, hangar: progress.hangar! };
  }

  /** Fresh read (post-ensure) — what every Hangar render starts from. */
  account(profile: Profile | null): Account {
    return this.ensure(profile);
  }

  private mutate(profile: Profile | null, op: (acct: Account) => OpResult): OpResult {
    this.ensure(profile);
    let result: OpResult = { ok: false, err: 'INTERNAL' };
    this.store.updateProgress(profile, (g: Progress) => {
      result = op({ scrip: g.scrip, hangar: g.hangar! });
      if (result.ok) {
        g.scrip = result.acct.scrip;
        g.hangar = result.acct.hangar;
      }
    });
    return result;
  }

  unlockBay(profile: Profile | null, bayIndex: number, key: string): OpResult {
    return this.mutate(profile, (acct) => core.unlockBay(this.env, acct, bayIndex, key));
  }

  purchase(profile: Profile | null, chassis: string, key: string): OpResult {
    return this.mutate(profile, (acct) => core.purchaseFrame(this.env, acct, chassis, key));
  }

  assign(profile: Profile | null, bayIndex: number, iid: string): OpResult {
    return this.mutate(profile, (acct) => core.assignBay(acct, bayIndex, iid));
  }

  clear(profile: Profile | null, bayIndex: number): OpResult {
    return this.mutate(profile, (acct) => core.clearBay(acct, bayIndex));
  }

  scrap(profile: Profile | null, iid: string, key: string): OpResult {
    return this.mutate(profile, (acct) => core.scrapFrame(this.env, acct, iid, key));
  }

  rename(profile: Profile | null, iid: string, name: string): OpResult {
    return this.mutate(profile, (acct) => core.renameFrame(acct, iid, name));
  }

  /**
   * First-completion campaign salvage — idempotent by stage key. Runs its own
   * bootstrap (NOT mutate → ensure, whose back-fill would claim the key first
   * and mask freshness). Returns the grant only when it happened just now.
   */
  grantStageAward(profile: Profile | null, stage: number): { chassis: string; iid: string } | null {
    const chassis = STAGE_GRANTS[String(stage)];
    if (!chassis) return null;
    let fresh: { chassis: string; iid: string } | null = null;
    this.store.updateProgress(profile, (g) => {
      let acct = this.initAcct(g);
      const r = core.grantFrame(this.env, acct, chassis, 'salvage', `award:s${stage}`);
      if (r.ok) {
        if (!r.replay) fresh = { chassis, iid: (r as { iid?: string }).iid ?? '' };
        acct = r.acct;
      }
      g.scrip = acct.scrip;
      g.hangar = acct.hangar;
    });
    return fresh;
  }

  /** Multiplayer match payout — idempotent by per-match key. */
  awardMatchScrip(profile: Profile | null, amount: number, key: string): OpResult {
    return this.mutate(profile, (acct) => core.creditScrip(this.env, acct, amount, 'award', { source: 'mp_match' }, key));
  }

  /** The multiplayer deck: occupied unlocked bays, in bay order. */
  deck(profile: Profile | null): DeckFrame[] {
    return core.deckFrames(this.account(profile));
  }

  bayOf(profile: Profile | null, iid: string): number {
    return core.bayOf(this.account(profile), iid);
  }

  ownedCounts(profile: Profile | null): Map<string, number> {
    return core.ownedCountByChassis(this.account(profile));
  }

  nextLockedBay(profile: Profile | null): number {
    return core.nextLockedBay(this.account(profile));
  }

  catalogPrice(chassis: string): number {
    return this.env.catalog.get(chassis)?.price ?? 0;
  }

  bayPrice(bayIndex: number): number {
    return this.env.prices[bayIndex] ?? 0;
  }

  /** Player-facing label: custom name, else "CHASSIS-<last 4 of iid>". */
  frameLabel(f: FrameInstance): string {
    if (f.name) return f.name;
    const mech = MECHS[f.chassis];
    return `${mech?.name ?? f.chassis} ${f.iid.slice(-4).toUpperCase()}`;
  }
}
