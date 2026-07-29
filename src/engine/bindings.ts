import bindingsJson from '../../content/tutorial/bindings.json';

/**
 * The input-action registry + glyph resolver — the single source of truth for
 * "what key does what". Gameplay code, the tutorial's prompt chips, and the
 * menu controls line all resolve bindings here, so they can never disagree.
 * Prompts carry {bind:action_id} tokens; code === null renders as UNBOUND.
 */

export interface Binding {
  code: string | null;
  label: string;
  kind: 'hold' | 'tap' | 'axis';
  name: string;
}

export const BINDS: Record<string, Binding> =
  (bindingsJson as unknown as { actions: Record<string, Binding> }).actions;

export function codeOf(action: string): string | null {
  return BINDS[action]?.code ?? null;
}

export function labelOf(action: string): string {
  return BINDS[action]?.label ?? '?';
}

export function isBound(action: string): boolean {
  return !!BINDS[action]?.code;
}

/** Plain-text glyph substitution for subtitles/menus: {bind:x} → [W]. */
export function resolveBindTokens(s: string): string {
  return s.replace(/\{bind:([a-z0-9_]+)\}/g, (_, a: string) =>
    isBound(a) ? `[${labelOf(a)}]` : '[UNBOUND]');
}

/** Two compact lines for the start-screen small print, generated from the registry. */
export function controlsSummary(): [string, string] {
  const g = (a: string): string => labelOf(a);
  return [
    `${g('throttle_up')}/${g('throttle_down')} throttle · ${g('steer_left')}/${g('steer_right')} turn · ${g('full_stop')} full stop · MOUSE aim · ${g('center_torso')} center · ${g('zoom')} zoom · ${g('jump')} jets`,
    `${g('target_reticle')}/${g('target_cycle')} target · ${g('subtarget_cycle')} subtarget · ${g('group_1')}/${g('group_2')}/${g('group_3')} weapons · ${g('override')} override · ${g('coolant_flush')} coolant · ${g('camera_toggle')} camera`,
  ];
}
