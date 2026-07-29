/**
 * PATHLIGHT content loading (vite side). Routes are content, not code:
 * every content/nav/*.route.json is bundled eagerly (same pattern as
 * campaign.ts) and registered into the nav route registry. nav.ts itself
 * stays vite-free so the sim can run headless under Node.
 */
import { registerNavRoute, type NavRouteDef } from './nav';
import navStringsJson from '../../content/nav/strings.en.json';

const routeModules = import.meta.glob('../../content/nav/*.route.json', { eager: true }) as
  Record<string, { default: NavRouteDef }>;

for (const mod of Object.values(routeModules)) {
  const def = mod.default;
  if (def && def.id && Array.isArray(def.waypoints)) registerNavRoute(def);
}

const NAV_STRINGS = navStringsJson as unknown as Record<string, string>;

/** hud.nav.* string lookup — its own namespace, exempt from the tut.bt.* lint
 *  voice rules (the exemption is explicit in scripts/lint_bt.mjs). */
export function navString(key: string): string {
  return NAV_STRINGS[key] ?? key;
}
