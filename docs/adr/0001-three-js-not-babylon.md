# ADR-0001 — Renderer stays Three.js; the spec's Babylon 9 mandate is not adopted

- **Status:** Accepted
- **Date:** 2026-07-29
- **Supersedes:** §4 "Renderer: Babylon.js 9.x" and §0 `{ENGINE} = Babylon.js 9.x` of the
  AAA Redesign master prompt.

## Context

The master prompt locks the stack to Babylon.js 9.x + WebGPU + Havok + pnpm/Turborepo,
in a 13-package monorepo under `apps/` and `packages/`.

The project it is being applied to is not a greenfield. It is **Robot Mech**: a shipped,
live browser mech sim on Three.js 0.180 + Rapier + npm, flat Vite layout, with a
24-mission campaign, an input-gated tutorial, a hangar economy, pilot accounts on
Cloudflare D1, multiplayer on a Durable Object, 51 models, 597 shipped voice lines and
19 validation suites. It is deployed and playable.

§0 of the master prompt anticipates exactly this: *"{ENGINE} = Babylon.js 9.x (default;
only change with an ADR justifying it)"*. This is that ADR.

## Decision

**Keep Three.js.** Import the master prompt's *standards* — §5 lighting and shading, §6
Tripo pipeline, §7 audio, §9 IP consolidation, §10 quality gates — and map each to its
Three.js equivalent. Do not port the engine.

## Rationale

1. **The engine is not the gap.** The audit found the game had no image-based lighting,
   no post chain, no quality presets and a single fixed 2048 shadow map. Every one of
   those is a Three.js feature that was simply never wired up — not a Babylon capability
   the project lacked. The first day of §5 work (IBL, fitted shadow frustum, GTAO, SMAA,
   bloom, four presets) produced a visible improvement without changing renderer.

2. **The cost is the entire budget.** Porting means re-authoring every material, light,
   camera, loader, LOD path, particle system, HUD overlay and the 24-mission runtime
   against a different scene graph and physics engine, then re-verifying 19 suites. That
   is the eighteen months and the million dollars, spent to arrive back at a game that
   already exists — while §1.0's own scope trade says the money buys *craft on a small
   surface*, not a rewrite.

3. **Prime Directive 6 points the same way.** "Craft floor before content ceiling… Cut
   missions, never cut frame pacing, readability or accessibility." A rewrite cuts all
   three for a year.

4. **The genuinely Babylon-only items are affordable to lose.** Clustered lighting, IBL
   voxel shadows, compute volumetrics and Frame Graph are WebGPU-era features. They
   matter for a night battlefield with hundreds of practicals. This game's biomes are
   sunlit exteriors where a fitted cascade, GTAO and an environment probe carry the look.

## Consequences

Accepted, and recorded so nobody rediscovers them as bugs:

- **Unavailable vs §5.7:** IBL shadows, clustered lighting, volumetric lighting, SSR,
  PCSS. Enumerated in `src/engine/quality.ts` as `UNAVAILABLE_FEATURES` so the gap is
  visible in code rather than implied by silence.
- **TAA → SMAA.** Three's TAA needs a static camera to converge; SMAA is the honest
  substitute for a game played in motion.
- **SSAO2 → GTAO.** Ground-truth ambient occlusion, strictly better than the spec's ask.
- **No cascaded shadow maps yet.** Three's `CSM` requires `setupMaterial()` per material;
  this codebase has 28 `MeshStandardMaterial` sites across 9 files with no central
  factory, and creates more at runtime. A missed patch renders visibly wrong shadows and
  a newly added material regresses silently. Deferred until §3.3 gives us one material
  factory; the texel-density win was taken instead by fitting the frustum to the preset's
  combat sightline (0.34 → 0.07 m/texel at Ultra).
- **§3.1's `apps/` + `packages/` layout is not materialised.** The flat layout stays. The
  13-package split is a monorepo shape for a 7-person team with separate build targets;
  imposing it on a working single-app codebase is churn without a beneficiary. Revisit if
  a second app (a real `admin`) needs to share `game-core`.
- **pnpm/Turborepo not adopted** for the same reason — one app, one lockfile.

## Revisit when

Any of: a second application needs to share the simulation; WebGPU clustered lighting
becomes the difference between shipping and not; or the campaign moves to night-city
biomes where hundreds of shadowed practicals are the core look.
