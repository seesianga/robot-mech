// Type surface of the cross-device progress merge (progressmerge.mjs).
//
// Generic over the progress shape on purpose: the merge is structural, and
// typing it against src/save/profiles.ts would point a shared server module at
// client code.

import type { HangarState } from './hangarcore.mjs';

/** [unlocked, completions, unlocked bays, frames, scrip] — the ordering used to
 *  decide which side of a conflict is "further along". */
export declare function progressRank(progress: unknown): number[];

/** Fold two divergent snapshots into one. Monotonic: never removes an unlock,
 *  a completion, an owned frame or an unlocked bay. `local` wins exact ties. */
export declare function mergeProgress<T>(local: T, remote: T): T;

export declare function mergeHangar(
  a: HangarState | null | undefined,
  b: HangarState | null | undefined,
  preferA?: boolean,
): HangarState;

/** Structural sanity for a snapshot off the wire. Empty array = storable. */
export declare function validateProgress(
  progress: unknown,
  opts?: { maxBytes?: number; maxStage?: number },
): string[];
