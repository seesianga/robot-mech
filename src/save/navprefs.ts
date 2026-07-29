/**
 * PATHLIGHT settings — device-level (localStorage), same precedent as the
 * hangar coach key. Content may disable individual guidance layers per route;
 * settings may disable individual layers; NOTHING may disable all of them —
 * `nav.arrow` can only be turned off by the player, never by content, and the
 * compass tick is the layer that survives the minimal-HUD preset.
 */

export interface NavPrefs {
  chevrons: boolean;
  beacon: boolean;
  arrow: 'always' | 'offscreen' | 'off';
  compass: boolean;
  audioBeacon: 'off' | 'subtle' | 'full';
  reducedMotion: 'auto' | 'on';
  reducedFlash: boolean;
  highContrast: boolean;
  /** consented fade-to-black move back onto the route (stuck ladder level 3) */
  assistReposition: boolean;
  /** HUD scale hook: arrow ring radius, glyph and compass sizes scale together */
  scale: number;
}

const KEY = 'veyra.nav.v1';

export const NAV_PREF_DEFAULTS: NavPrefs = {
  chevrons: true,
  beacon: true,
  arrow: 'always',
  compass: true,
  audioBeacon: 'off',
  reducedMotion: 'auto',
  reducedFlash: false,
  highContrast: false,
  assistReposition: true,
  scale: 1,
};

/** The load-bearing guard: settings (or a hand-edited store) may disable
 *  individual layers but never ALL of them — the compass tick is the layer
 *  that survives the minimal preset. */
export function sanitizeNavPrefs(p: NavPrefs): NavPrefs {
  if (!p.chevrons && !p.beacon && p.arrow === 'off' && !p.compass) p.compass = true;
  return p;
}

export function loadNavPrefs(): NavPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...NAV_PREF_DEFAULTS };
    const p = JSON.parse(raw) as Partial<NavPrefs>;
    return sanitizeNavPrefs({ ...NAV_PREF_DEFAULTS, ...p });
  } catch {
    return { ...NAV_PREF_DEFAULTS };
  }
}

export function saveNavPrefs(p: NavPrefs): void {
  try {
    sanitizeNavPrefs(p);
    localStorage.setItem(KEY, JSON.stringify(p));
    logNavSetting(p);
  } catch { /* settings are best-effort */ }
}

function logNavSetting(p: NavPrefs): void {
  try {
    const TKEY = 'veyra.telemetry.v1';
    const arr = JSON.parse(localStorage.getItem(TKEY) ?? '[]') as unknown[];
    arr.push({ t: Date.now(), ev: 'nav_setting_changed', prefs: p });
    while (arr.length > 500) arr.shift();
    localStorage.setItem(TKEY, JSON.stringify(arr));
  } catch { /* telemetry is best-effort */ }
}

/** Reduced-motion resolves from the pref OR the OS media query. */
export function navReducedMotion(p: NavPrefs): boolean {
  if (p.reducedMotion === 'on') return true;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
