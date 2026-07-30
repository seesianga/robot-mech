# ADR-0001: Keep Three.js; do not port to Babylon.js

**Status:** Accepted — 2026-07-29
**Deciders:** Technical Director / Executive Producer
**Supersedes:** `Qoder game/sovereign-ash/docs/adrs/ADR-001-renderer.md` ("Babylon.js 7.x"),
which is archived to `docs/_inbox/` as retired reference.

## Context

The commissioning brief specified Babylon.js 9.x with Havok WASM, citing Babylon 9's clustered
lighting, volumetric lighting, Frame Graph, textured area lights and OpenPBR groundwork as the
levers this project needs.

The brief described `$MW_ROOT` as design documents with no shipped configuration. **The audit of
2026-07-29 found the opposite**: `$MW_ROOT` is Robot Mech, a live game built on **Three.js
r0.180 + Rapier3d 0.14 + Vite 6**, comprising 14,508 lines of TypeScript, 22 campaign runtime
configs, 1,486 audio files, 357 models, a Cloudflare D1 account service, a Durable Object match
server, and two live deployments.

The Babylon.js ADR the brief inherited belongs to `Qoder game/sovereign-ash/` — a separate,
hollow scaffold of eight source files with empty `content/` and `assets-source/` directories,
which locks Babylon **7.x**, not 9.x.

So the real question is not "which engine would we choose greenfield" but **"is porting a working
game worth the money we have"**.

## Options considered

| Option | Cost | Player-visible benefit |
|---|---|---|
| **A. Keep Three.js; deliver §5 on Three** | Rendering engineering only | The full §5 upgrade |
| B. Rebuild on the sovereign-ash Babylon scaffold | ~12 of 18 months to reach current parity | None until parity is regained |
| C. Keep content, port renderer to Babylon 9 in place | ~5–7 months rendering + physics engineering | None — identical §5 features, later |

## Decision

**Option A. Three.js r180 remains the renderer.** The §5 lighting and shading standard is
delivered on Three.

## Rationale

1. **The brief's own Prime Directive 6 decides it.** *"Craft floor before content ceiling... Cut
   missions, never cut frame pacing, readability or accessibility."* A port cuts neither missions
   nor craft — it cuts *time*, and time is the only thing that buys craft here.
2. **The gap is not engine capability, it is that the features were never implemented.** The game
   today has no IBL, no post-processing stack, no cascaded shadows and no quality presets. None of
   those absences is caused by Three.js. Every one of them is buildable on Three, and
   `src/site/stage.ts` already does IBL via `PMREMGenerator` plus a bloom composer chain correctly
   — in the marketing page. The techniques are not unfamiliar to this codebase.
3. **A port pays the cost twice.** Option C rewrites the renderer *and* re-tunes all handling for
   Havok, and at the end the player sees exactly the §5 feature set that Option A delivers
   earlier and cheaper.
4. **Rapier is not a liability.** The sim is fixed-step at 60 Hz and works. Swapping physics
   engines re-tunes every mech's handling, which is a design regression risk with no upside.
5. **Cloudflare D1 + Durable Objects already do the job** Postgres, Redis and a Node match server
   were specified for. Porting the renderer drags the backend along with it.

## Consequences

**Accepted:**

- Several §5 features are `examples/jsm` addons rather than core — `CSM`, `GTAOPass`,
  `TAARenderPass`, `LUTPass`. **We own their maintenance.** Budget for that, and pin the Three
  version exactly.
- Three has no PCSS in core. Soft-shadow quality tops out at PCF unless the TD writes a custom
  shader; LIGHTING §5.3 treats PCSS as optional, not required.
- `RectAreaLight` does not cast shadows in Three. LIGHTING §5.2 pairs area lights with a shadowed
  spot where contact matters.
- No built-in clustered lighting on the WebGL path. The `arcology` night biome — the one that most
  wants hundreds of practicals — must be authored within a light budget rather than relying on the
  engine. This is the single genuine capability the brief's Babylon 9 argument was right about,
  and it is managed by art direction and the §5.7 preset budgets.
- No built-in volumetric lighting. LIGHTING §5.5 step 5 is a custom pass.

**Gained:**

- 14,508 lines of working simulation, 22 missions, 1,486 audio files, 357 models, a live
  deployment and an account service all keep working.
- The entire budget goes to craft rather than to regaining parity.

## Revisit if

WebGPU turns out to require re-authoring the post stack in TSL *and* the WebGPU path proves
necessary for the frame budget. That combination would mean paying a renderer-rewrite cost
regardless, at which point Babylon deserves a fresh comparison. The M1 spike in
[LIGHTING_STANDARD.md §5.9](../LIGHTING_STANDARD.md) answers it. **Do not begin a migration on the
strength of a specification document.**
