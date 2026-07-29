export type HardpointType = 'energy' | 'ballistic' | 'missile' | 'utility';

export type ZoneId = 'head' | 'ct' | 'lt' | 'rt' | 'la' | 'ra' | 'll' | 'rl';

export const ZONES: ZoneId[] = ['head', 'ct', 'lt', 'rt', 'la', 'ra', 'll', 'rl'];

export const ZONE_NAMES: Record<ZoneId, string> = {
  head: 'HEAD', ct: 'C.TORSO', lt: 'L.TORSO', rt: 'R.TORSO',
  la: 'L.ARM', ra: 'R.ARM', ll: 'L.LEG', rl: 'R.LEG',
};

/** Where overflow damage transfers when a zone is already gone. */
export const ZONE_TRANSFER: Record<ZoneId, ZoneId | null> = {
  la: 'lt', ra: 'rt', ll: 'lt', rl: 'rt', lt: 'ct', rt: 'ct', head: null, ct: null,
};

export interface WeaponDef {
  id: string;
  name: string;
  type: HardpointType;
  damage: number;
  salvo: number;
  heat: number;
  cooldown: number;
  range: number;
  /** 0 = hitscan */
  projectileSpeed: number;
  /** degrees of scatter */
  spread: number;
  /** -1 = no ammo tracking */
  ammo: number;
  tons: number;
  tags?: string[];
}

export interface MechDef {
  id: string;
  name: string;
  class: 'light' | 'medium' | 'heavy' | 'assault';
  tons: number;
  speedKmh: number;
  twistArcDeg: number;
  jumpJets: boolean;
  heatSinks: number;
  hardpoints: HardpointType[];
  defaultLoadout: string[];
  role: string;
}

/** Fraction of a mech's armor pool assigned to each zone. */
export const ARMOR_SPLIT: Record<ZoneId, number> = {
  head: 0.04, ct: 0.22, lt: 0.13, rt: 0.13, la: 0.09, ra: 0.09, ll: 0.13, rl: 0.13,
};

export function armorFor(def: MechDef, zone: ZoneId): number {
  return Math.max(6, Math.round(def.tons * 3.2 * ARMOR_SPLIT[zone]));
}

export function structureFor(def: MechDef, zone: ZoneId): number {
  return Math.max(5, Math.round(armorFor(def, zone) * 0.5));
}

export type KillCause = 'ct' | 'head' | 'legs' | 'ammo';

/** Salvage yield fraction by how the machine died — kill condition matters. */
export const SALVAGE_YIELD: Record<KillCause, number> = {
  legs: 0.8, head: 0.9, ct: 0.5, ammo: 0.2,
};

export interface DamageEvent {
  type: 'armor' | 'structure' | 'crit' | 'zoneDestroyed' | 'severed' | 'killed' | 'cookoff' | 'weaponDestroyed';
  zone: ZoneId;
  amount?: number;
  weaponName?: string;
  cause?: KillCause;
}
