// Type surface of the runtime-agnostic hangar engine (hangarcore.mjs).

export declare const BAY_COUNT: number;

export type BayState = 'locked' | 'unlocked';
export type AcquiredVia = 'grant' | 'salvage' | 'purchase';

export interface HangarSlot {
  state: BayState;
  iid: string | null;
}

export interface FrameInstance {
  iid: string;
  chassis: string;
  via: AcquiredVia;
  at: number;
  loadout: string;
  name?: string;
  salvageValue?: number;
}

export interface LedgerEntry {
  key?: string;
  kind: string;
  amount: number;
  ref: Record<string, unknown>;
  at: number;
}

export interface HangarState {
  v: number;
  slots: HangarSlot[];
  frames: Record<string, FrameInstance>;
  ledger: LedgerEntry[];
  /** permanent at-most-once-ever grant anchors (outlive the pruned ledger) */
  claims?: Record<string, boolean>;
}

export interface Account {
  scrip: number;
  hangar: HangarState;
}

export interface HangarEnv {
  prices: number[];
  catalog: Map<string, { price: number; available: boolean }>;
  chassisIds: Set<string>;
  sequential: boolean;
  scrapRefundPct: number;
  now: () => number;
  newId: () => string;
}

export type OpResult =
  | ({ ok: true; acct: Account; replay?: boolean } & Record<string, unknown>)
  | ({ ok: false; err: string } & Record<string, unknown>);

export declare function makeEnv(
  slotsJson: unknown, catalogJson: unknown, chassisIds: Iterable<string>,
  now: () => number, newId: () => string,
): HangarEnv;
export declare function freshHangar(): HangarState;
export declare function unlockBay(env: HangarEnv, acct: Account, bayIndex: number, key?: string): OpResult;
export declare function assignBay(acct: Account, bayIndex: number, iid: string): OpResult;
export declare function clearBay(acct: Account, bayIndex: number): OpResult;
export declare function purchaseFrame(env: HangarEnv, acct: Account, chassis: string, key?: string): OpResult;
export declare function grantFrame(env: HangarEnv, acct: Account, chassis: string, via: string, key?: string): OpResult;
export declare function scrapFrame(env: HangarEnv, acct: Account, iid: string, key?: string): OpResult;
export declare function renameFrame(acct: Account, iid: string, name: string): OpResult;
export declare function creditScrip(env: HangarEnv, acct: Account, amount: number, kind?: string, ref?: Record<string, unknown>, key?: string): OpResult;
export declare function deckFrames(acct: Account): Array<{ iid: string; chassis: string }>;
export declare function bayOf(acct: Account, iid: string): number;
export declare function ownedCountByChassis(acct: Account): Map<string, number>;
export declare function nextLockedBay(acct: Account): number;
export declare function checkInvariants(acct: Account): string[];
