import mechsJson from '../../content/mechs.json';
import weaponsJson from '../../content/weapons.json';
import type { MechDef, WeaponDef } from './types';

export const MECHS: Record<string, MechDef> = {};
for (const m of mechsJson.mechs as MechDef[]) MECHS[m.id] = m;

export const WEAPONS: Record<string, WeaponDef> = {};
for (const w of weaponsJson.weapons as WeaponDef[]) WEAPONS[w.id] = w;

export function mechDef(id: string): MechDef {
  const d = MECHS[id];
  if (!d) throw new Error(`Unknown mech def: ${id}`);
  return d;
}

export function weaponDef(id: string): WeaponDef {
  const d = WEAPONS[id];
  if (!d) throw new Error(`Unknown weapon def: ${id}`);
  return d;
}
