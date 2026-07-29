# PATHLIGHT — navigation guidance layer

The system that gets a pilot from A to B without a single "…where am I supposed
to go?" moment. Diegetically a repurposed casualty-recovery beacon system from
the Meridian rescue machinery — industrial, functional, slightly worn.

## The guidance stack — four layers, one answer

| Layer | Question | Where | Implementation |
|---|---|---|---|
| L1 chevrons | What route do I take? | world, ground | `src/world/navpath.ts` — one `InstancedMesh`, ≤ 24 instances, flow driven by **sim time** (survives low fps), terrain-conformed via central-difference normals, +0.35 m lift (the visual mesh interpolates 8 m vertices) |
| L2 beacon | What am I heading for, how far? | world, at the waypoint | cyan column, vertex-color fade (additive black adds nothing — no shaders in this codebase), **ghost pass at `depthTest:false` / 30 %** so it reads through terrain; DOM label with name + live distance; collapses into a ring on arrival |
| L3 arrow | Which way do I turn right now? | screen | `src/ui/hud.ts` — chevron on a notional ring (R = 140 px × scale) around the reticle; six states; **never fails** |
| L4 compass | Where is it relative to everything? | screen, top | new compass strip (canvas): filled diamond = destination bearing, hollow chevron = leg heading (shown when look/legs diverge > 20°), numeric BRG readout |

Route **state** lives in the fixed-step sim (`src/sim/nav.ts`, stepped beside
`mission.update`); renderer and HUD only read `nav.view`. Routes are content:
`content/nav/*.route.json` (schema `content/nav/nav_route.schema.json`),
bundled via `import.meta.glob` in `src/sim/navroutes.ts`.

## Hard invariants (all tested)

- **Never zero guidance** — `__NAV_INVARIANT()` sweeps a full heading circle ×
  6 distances and asserts ≥ 1 visible layer per sample (`npm run navtest`).
- **Never ambiguous** — one six-state machine (`on_course / steer / behind /
  offscreen / arrived / rerouting`), each state a distinct glyph + label,
  never color alone.
- **Never a lie** — blocked legs enter RE-ROUTING (≤ 2 s), pick an AABB-corner
  detour or fall back to the straight line *and say so*.
- **Never color alone** — cyan `#3fd8f0` is nav-reserved (amber/red stay
  warnings); every state is shape + label; high-contrast mode available.
- **Deterministic** — scripted identical inputs give identical `nav/*` event
  order (unit + integration determinism tests).
- **Cheap** — ≤ 0.35 ms/tick, ≤ 3 draw calls, ≤ 2,000 triangles over baseline
  (asserted in `npm run navtest`).

## The two frames of reference (§2.4 — read this twice)

- The steering arrow uses `legError = wrapPi(bearing − legYaw)` — *how to
  steer the legs*. Torso twist NEVER moves it (unit-tested torso invariance).
- Off-screen clamping is camera-relative (`camError`, projection with the
  behind-camera sign guard — `projectView` divides by |vz| so a behind-camera
  point keeps its true direction; the classic inverted-arrow bug is
  unit-tested at frame bottom).
- When look and legs diverge > 20°, the compass shows both pips; aligning them
  is the mental model (taught in B4).

## Arrow states

| State | Entry | Presentation |
|---|---|---|
| ON COURSE | \|legError\| ≤ 5° | chevron, dead ahead on the ring |
| STEER | 5° < \|legError\| ≤ 130° | chevron rotates around the ring |
| BEHIND | \|legError\| > 130° | double-chevron glyph + BEHIND YOU |
| OFF-SCREEN | beacon outside the safe frame | chevron clamped to a rect inset 8 % (corners legal), beacon label attached |
| ARRIVED | inside radius (+vtol, +dwell) | ✓ bloom, shared confirm chime, 0.7 s hold (the tutorial beat), re-arm next |
| RE-ROUTING | leg blocked / stuck | rotating ring + RECALCULATING, holds last bearing, ≤ 2 s |

All bearing transitions require 0.25 s dwell + 3° hysteresis (boundary parking
can never flicker — unit-tested). Rendered angle runs through a critically
damped spring (τ = 120 ms) with a hard ≤ 6° lag clamp at max turn rate.
OFF-SCREEN entry is projection-derived from the live camera (fov changes with
zoom, aspect with resize) via `offscreenEntryDeg` — a horizontal-axis proxy;
the HUD's clamp position always uses the true projection. The tutorial pause
gates `nav.update` and the audio ping — pause really pauses. The 3 s
wall-stuck detector keys on actual per-tick displacement, not commanded speed
(collision push-out keeps kinematic speed high while pinned).

## Pathing ({NAVMESH} = no)

No navmesh exists. Routes are authored with waypoints dense enough that
straight legs are walkable; `npm run navtest` raycasts every leg against the
live static colliders at walker body height (the LOS content test — the
bt_boost barrier leg is the sanctioned exception, it is the jump-jets step).
Stuck ladder: 3 s slow / 8 s no-progress → re-route → brightened chevrons +
CAIRN nudge (10 s) → consented reposition offer at 35 s (hold skip in
training; telemetry `nav_reposition_used` flags it as a level-design defect).

## Basic Training integration

- `bt_a4a` (teach card, arms P1 **~150° behind** so BEHIND is the first thing
  the arrow demonstrates) and `bt_a4b` (face the arrow, walk to it) inserted
  after leg steering, before the gate walk.
- A5 gates = P2/P3/P4 (radius 14 = the director's `GATE_RADIUS`, so route and
  checklist can never disagree). B4 adds arrival at P5 (placed **~45°** off
  the board bearing, not the spec's 90° — the Skarn's torso twist arc is ±60°
  and the drill must be physically completable). F1's P6 ghosts through the
  barrier. H2 tears the route down (asserted: nothing survives).
- Amber `objMarker`/`#objmark`/radar square are **suppressed while a route is
  active** — PATHLIGHT owns guidance, the legacy amber marker still serves
  aim-targets (B2/D/H1) and non-route missions.
- Strings live in `hud.nav.*` (`content/nav/strings.en.json`) — explicitly
  exempt from the tut.bt forbidden-word lint (the rule itself is not
  weakened); waypoint names are neutral P1…P6; every tutorial prompt still
  carries a `{bind:…}` token.

## Audio

- Arrival = the same `ui.bt.confirm` chime as every tutorial confirm.
- Audio beacon (`nav.audioBeacon` off/subtle/full): HRTF-panned ping, interval
  3.0 s → 0.6 s with distance, +2 semitones inside 30 m. Falls back to a
  synthesized blip until `ui.nav.ping` is generated, so the non-visual path
  works today.
- CAIRN nudges (River, `SAz9YHcvj6GT2YYXdXww`, the BT §8 settings, fixed
  seeds 53001+): "Follow the light." / "Turn around." / "Path blocked.
  Recalculating." / "Waypoint reached." — `content/vo/nav-lines.csv`,
  generator `npm run navaudio`. **ElevenLabs key was dead (401) at build
  time** — everything is wired; lines play as subtitles until the batch runs.
  The six new BT step lines (a4a/a4b) ride the existing `npm run btaudio`.
- Nav VO ducks music like all VO; the ping rides the UI bus.

## Settings & accessibility (`src/save/navprefs.ts`, menu → SETTINGS)

chevrons · beacon · arrow (always/offscreen-only/off — **content may never
force it off**, validator-enforced) · compass · audio beacon · reduced motion
(freezes flow/breathe, stiffens the spring — rotation itself is information) ·
reduced flash (arrival bloom → scale pop) · high contrast · reposition assist
· nav HUD scale. Persisted device-level (`veyra.nav.v1`).

## Tests

- `npm run navunit` — wrapPi ±180° continuity, behind-camera sign, rect clamp
  edges+corners, torso invariance, hysteresis/dwell, arrival exactness,
  spring lag bound, segment/AABB + detour, scripted determinism, stuck
  ladder, 0.7 s arrive-hold.
- `npm run navcheck` — static route/schema/bounds/chain/string validation.
- `npm run navtest` — headless build: arrow-guided A4b drive, BEHIND-first
  teach, invariant sweep, LOS content check, perf + draw-call budget,
  teardown, determinism. (Prereq: `npm run build && npm run preview`.)
- `npm run bttest` — full tutorial injection run including the new steps.

## Campaign & MP reuse (designed now, ships later)

The schema reserves `follow_entity` (escort/ping); the validator rejects it
until a runtime provider exists — a mis-authored route must fail loudly, not
anchor at origin. Mission NAV sectors arm routes the same way BT ops do
(`startRoute`/`stopRoute`); M24's "no ticker" finale simply never arms one.

## Telemetry (localStorage `veyra.telemetry.v1`)

`nav_route_start`, `nav_wp_arrive {id, seconds, wrong_direction_seconds,
path_length_ratio}`, `nav_reroute {reason}`, `nav_stuck {level}`,
`nav_reposition_used`, `nav_setting_changed`. `path_length_ratio` p90 per
waypoint is the signposting health metric.
