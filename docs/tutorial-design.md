# BASIC TRAINING — the input-gated controls tutorial (stage 0)

This document replaces the previous "Op 0: Proving Ground" campaign-style tutorial spec. That
attempt taught through fiction — "Reach NAV ALPHA through the barricade slalom", characterful
VO paragraphs, objectives the player had to decode into controls. **This is the correction:**
a standalone, main-menu-accessible, input-gated controls tutorial. It teaches the buttons.

## §0. THE CORE RULE

| ❌ NOT this (campaign-style) | ✅ THIS (input-driven tutorial) |
|---|---|
| "Reach NAV ALPHA through the barricade slalom." | "Hold **{bind:throttle_up}** to raise throttle." → detected → ✓ |
| Objectives phrased as fiction. | Every step names the exact key on screen. Never guess. |
| Success = arriving at a story beat. | Success = detected input action **+ measurable sim-state change**. |
| Instructor delivers characterful paragraphs. | CAIRN speaks ≤ 8 functional words per line. No plot. |
| Enemies, timers, pressure. | Zero threat until the optional checkride. Invulnerable. Infinite ammo. |
| Cinematic framing, comms drama. | A quiet training pad. HUD, glyphs, checkmarks, one soft chime. |

Hard rules, all lint- or code-enforced:
1. Every prompt contains ≥ 1 `{bind:...}` token (`scripts/lint_bt.mjs`).
2. One input concept per step; combination drills only from already-taught keys, chips pinned.
3. Steps listen to **input actions** (`throttle_up`), never raw key codes — the bindings
   registry (`content/tutorial/bindings.json` → `src/engine/bindings.ts`) is the single
   source of truth shared by gameplay, tutorial chips, and the menu controls line.
4. Predicates verify the **effect** in sim state (throttle %, torso yaw, heat), not the press.
5. No failure states. Exits: ✓, hold-F8 skip-step, Esc-menu skip-tutorial.
6. Info steps still end on `{bind:ui_confirm}`.

## §0.1 Variable resolution & standing assumptions

The source brief targets a fictional Babylon.js monorepo with a different retired setting
and instructor (MIRA-7). Per the brief's own instruction it is adapted to
`{EXISTING_INPUT}` / the shipped engine. Resolution:

| Brief | Resolution here |
|---|---|
| {TRAINER_FRAME} | **Skarn** (35 t starter; mounts jump jets → Phase F is IN). Groups: 1 = autocannon, 2 = laser, 3 = rockets (engine loadout order — prompts name what each group actually is). |
| MIRA-7 | **CAIRN** — the campaign's already-cast clean synthetic voice (River). The brief's own protocol: "if the campaign has already cast the voice, pin that voice ID". Same voice everywhere; new lines use the §8 tutorial settings. |
| Select-group-then-fire, chain fire | Not in this engine — 1/2/3 fire their group directly; no chain-fire mechanic. D-phase adapted (D1 autocannon, D2 laser, D3 rockets, D4 weapons-free). |
| target_nearest | Not in this engine. C-phase teaches what exists: T = lock under reticle, R = cycle contacts, E = section (subtarget) select. |
| Squad / command wheel (Phase G) | **No wingmate AI exists in this build.** G ships in content with `conditional: {feature:"squad"}` and auto-skips with a rail tick (same mechanism as F's jump-jet conditional). Its `command_wheel` / `order_form_up` actions are declared UNBOUND, which also exercises the amber UNBOUND chip path. VO lines are already recorded ("banked") for when the feature ships. |
| zoom (RIGHT-CLICK) | Added — small camera FOV hold-zoom (68°→30°), the one piece of kit the brief assumes that the engine lacked. Likewise added: X full stop, Enter ui-confirm, F8 hold-skip, H hold cheat-sheet, and override-forces-restart during shutdown (E4's teachable moment; also a genuine campaign feature). |
| {LANGUAGES} | English only for now; every string is keyed (`tut.bt.*`), tokens preserved, so localization is a CSV/JSON translation + per-language VO batch (§8.10). |
| {ELEVENLABS_TIER} | Creator → `mp3_44100_192` from the API (PCM output needs Pro), decoded exactly once through ffmpeg into mastered WAV. |
| {CONCEPT_ART_DIR} | None; the practice drone and range props reuse the existing generated asset family (§9). |
| Gamepad | The engine has no gamepad input; the bindings registry carries one `code` per action today. The glyph resolver renders whatever the registry holds, so a pad column is additive later. Device/rebind runtime tests are therefore N/A-until-Settings (noted in §10). |

## §1. WHERE IT LIVES

- **Entry points**: (a) first-boot offer after sign-in — "Take Basic Training? (recommended,
  about 7 minutes)" with ACCEPT / SKIP; skipping sets the same flag completing does, and the
  offer never returns. (b) Main menu → TRAINING — BASIC TRAINING. (c) Replayable; once the
  flag is set the menu shows A–H quick-jump chips (completed phases highlighted).
- **Save flags**: `tutorialDone` (= basic_training_complete) + `btPhases[]` in the profile
  store (guests: sessionStorage).
- **The space**: a calibration pad — flat graded apron, three amber-banded gate pylons
  (soft-collide), one large static aim board, a four-board target row, the boost barrier,
  a practice-drone pen, coolant bowser, light mast, crates. Calm light, no music — a low
  pad-ambience bed only.
- **The venues (2026-08-03)**: the pad TRAVELS — each phase trains on its own biome, with
  the apron graded into that biome's heightfield (`buildTerrain` `opts.btPad`) so every pad
  coordinate, nav route and the bttest mirror of them hold on every venue. Data:
  `phase_maps` + `phase_spawns` in `basic_training.json`. A = Saltglass Cove (dusk, the
  classic pad) · B = Tide Flats (dawn) · C = Polar Night (sensors when eyes fail) ·
  D = Impound Yard (live fire) · E = Halite Flats (the 0.8× heat-dissipation biome) ·
  F = Karst Highlands (jet country) · H = Storm Coast (checkride under weather). A phase
  boundary whose next phase maps to a different venue emits a `handoff` event: main banks
  the confirmed phases, seeds the phase hint, and relaunches stage 0 on the new map (the
  same jump machinery the A–H chips use). Phase jumps from the menu land directly on the
  phase's venue at its own spawn.
- **Sim config**: player invulnerable, infinite ammo (refilled per tick), heat model active
  with reactor damage moot (invulnerable), coolant re-armed if wasted, physics normal.
  **Nothing in Basic Training can damage the pilot — the checkride included.** H1 is live fire
  outbound only: drone shots register as feedback (flash, shake, impact audio) through
  `Mech.ghostHits` but cost no armor, no structure, no crits, no weapons. The drones are
  **practice drones, not combat machines**: flint airframes at 35 % speed (`Mech.speedScale`)
  with thinned armor, so H1 is a victory lap inside the 25 s step budget, not a fight.

## §2. ANATOMY OF A STEP

`ACTIVE → (DETECTING…) → CONFIRMED → [0.7 s beat] → next` — implemented once in
`src/sim/basictraining.ts` (the TutorialDirector), driven entirely by data.

- **ACTIVE**: bottom-center prompt card — short imperative line with device-correct glyph
  chips; relevant HUD element gets the amber highlight pulse (HUD-owned, reduced-motion-aware).
- **DETECTING**: held/analog steps fill the chips like a progress meter
  (`progress: {metric, max}`); multi-part steps show a sub-checklist, each item with its own ✓.
- **CONFIRMED**: chips fill, ✓ stamps, **the same soft chime every time** (`ui.bt.confirm`),
  optional one-line CAIRN confirm; card holds the beat, then swaps.
- **Hints** (never punitive, no third level): +8 s → chips pulse + one CAIRN nudge
  (≤ 8 words); +20 s → ghost-input press animation on the chips + the on-screen line repeated
  verbatim in the subtitle strip.
- **Always available**: hold F8 skip-step · Esc pause menu (Resume / Skip Basic Training) ·
  hold H cheat-sheet of everything taught so far.
- **Progress rail**: slim top rail, phases A–H with per-step ticks (✓ done, · skipped,
  dashed = auto-skipped conditional).

## §3. INPUT MAP

`content/tutorial/bindings.json` — the full table lives in the file. Additions for Basic
Training: `full_stop` X, `zoom` RIGHT-CLICK i.e. right mouse button (hold), `ui_confirm` Enter, `skip_step` F8 (hold),
`help` H (hold). `command_wheel` / `order_form_up` are declared UNBOUND. Prompts never
hardcode key names — `{bind:action_id}` tokens resolve at render time, live from the
registry, and an unbound action renders the amber "UNBOUND — open Settings" chip with the
step skippable.

## §4. THE STEP TABLE (as shipped — 29 steps)

Data: `content/tutorial/basic_training.json` · strings: `content/tutorial/strings.en.json`.

| ID | Prompt (resolved) | Success predicate |
|---|---|---|
| A0 | Systems ready. Press **ENTER** to power up. | ui_confirm pressed → power-up + HUD elements light with 1-word labels |
| A1 | Hold **W** to raise throttle. | throttle_up held ∧ throttle ≥ 40 % (chip fills with throttle) |
| A2 | Hold **S** to slow to a stop. | \|throttle\| ≤ 3 % ∧ \|speed\| < 0.5 m/s |
| A3 | Hold **S** again to walk backward. | throttle ≤ −20 % ∧ 8 m reversed |
| A4 | Press **A** and **D** to turn your legs. | cumulative yaw ≥ 45° left ✓ and right ✓ |
| A5 | Use **W A D** — walk through the three gates. | gates 1→2→3 (combination drill; chips pinned) |
| A6 | Press **X** for an instant full stop. | full_stop pressed ∧ throttle = 0 same tick |
| B1 | Move **MOUSE** to twist your torso. | torso-vs-leg yaw ≥ 30° left ✓ / right ✓ |
| B2 | Aim with **MOUSE** — hold the reticle on the board. | reticle-on-board cumulative 2.0 s (chip fills) |
| B3 | Press **C** to snap your torso back in line. | center_torso pressed ∧ \|torso−leg\| < 2° |
| B4 | Hold **W** and keep the reticle on the board while you walk. | speed > 3 m/s ∧ on-board 3.0 s |
| B5 | Hold **RIGHT-CLICK** to magnify. *(Release to return.)* | zoom held ≥ 1.0 s |
| C1 | Press **T** to lock the contact under your reticle. | lock via target_reticle |
| C2 | Press **R** to cycle contacts. Lock all three. | 3 distinct cycle-locks (3-pip checklist) |
| C3 | Press **E** to select a section of the locked contact. | ≥ 2 subtarget events *(caption: "No lock? Press T first.")* |
| C4 | Damage-readout info card. Press **ENTER** to continue. | ui_confirm (info still input-gated) |
| D1 | Press **1** to fire the autocannon at a board. | group-1 fire event ∧ board hit |
| D2 | Press **2** to fire the laser. | group-2 fire event *(caption: heat, not ammunition)* |
| D3 | Press **3** to fire a rocket salvo. | group-3 fire event |
| D4 | Weapons free — destroy all four boards with **1 2 3**. | 4 board-destroyed events (4-pip checklist) |
| E1 | Fire **1 2 3** until heat reaches the amber line. | heat ≥ 70 % (dissipation ×0.25 during E so the drill reads in seconds, not minutes) |
| E2 | Press **F** to purge coolant. | flush used ∧ (drop ≥ 25 pts ∨ heat ≤ 10 %) — self-healing; coolant re-armed on entry |
| E3 | Keep firing **1 2 3** past the red line. Let it shut down — you're safe here. | emergency-shutdown event (countdown extended to 6 s on confirm) |
| E4 | Hold **O** to force the reactor back online. | restart-while-override-held event; if the window is missed the drill re-trips itself (scripted-safe) *(caption: field-override risk)* |
| F1 | Build speed with **W**, then hold **SPACE** to boost over the barrier. | airborne lane crossing + upright landing *(conditional: jump_jets)* |
| G1–G2 | command wheel / recall *(conditional: squad — auto-skips with rail tick)* | — |
| H1 | Checkride: three practice drones inbound. Weapons free — **1 2 3**. | 3 drones destroyed (3-pip checklist); skip advertised from the start; no timer, no fail |
| H2 | Basic training complete. Press **ENTER** to return to the menu. | ui_confirm → flags written, summary card (time, hints, phases; Replay-a-phase / Campaign / Menu) |

Budget: ≤ 9 min total, no step median > 25 s (telemetry `bt_step_*`; fix the step, not the
player).

## §6–§7. DATA SCHEMA & RUNTIME

- Steps are content: predicate DSL `{all|any}`, `{action_held|action_pressed}`,
  `{metric, op, value}`, `{flag}`, `{checklist_done}` — evaluated per fixed step against the
  director's metric engine (per-step counters reset on entry). Named ops (`power_up`,
  `boards_arm`, `heat_drill_on/off`, `coolant_arm`, `extend_shutdown`,
  `ensure_shutdown_window`, `checkride_start/end`) are the only engine hooks content can call;
  designers reorder/retune steps without code changes.
- `src/sim/basictraining.ts` — TutorialDirector, a `MissionLike` (fixed-step, deterministic,
  event-emitting; no wall-clock, no RNG). `src/ui/btoverlay.ts` — prompt layer (direct DOM
  writes for chip fill — no per-frame re-render). Glyph resolution: `renderPrompt()` +
  `resolveBindTokens()` shared with the start-screen controls line, so tutorial glyphs and
  menus can never disagree. HUD highlight service: `hud.highlight(ids)` (HUD owns the pulse;
  reduced-motion gets a static ring).
- Boards are indestructible scenery (hp 9999) until D4's `boards_arm`; the aim board always.
  Contacts are invulnerable dormant hulks. Checkride drones stand down (`bootLocked`) on
  skip; the player is repaired after H1 either way.
- Telemetry (localStorage `veyra.telemetry.v1`): `bt_start`, `bt_step_start/confirm/skip`,
  `bt_step_auto_skip`, `bt_hint {id, level}`, `bt_complete {duration, hints_total}` + per-step
  durations in the summary.

## §8. ELEVENLABS PRODUCTION (shipped configuration)

Two audio hard rules: **VO never speaks key names** (bindings are remappable — the voice says
the action, the glyph names the key; lint-enforced) and **every line stands alone** (no
previous_text/next_text stitching — steps replay out of order).

- **Casting**: CAIRN pinned to the campaign voice (River — resolved identically to
  `gen_audio.mjs`, so the instructor is the same voice everywhere). One voice, no banter.
- **Model**: `eleven_multilingual_v2` — the consistency workhorse for ~57 tiny status lines;
  supports SSML `<break time="0.25s" />` (used between sentences of two-sentence lines).
  v3 rejected (expressive by design, drops speed/SSML breaks, happiest ≥ 250 chars —
  wrong tool for 2–8-word lines); flash kept only as a contingency for future runtime lines.
- **Settings**: stability 0.90 · similarity 0.75 · style 0.0 · speaker_boost · speed 0.95;
  **fixed seed per line** (in the CSV, logged in provenance) — regenerate a flagged line by
  deleting its file: same seed, same voice. Never a new voice mid-project.
- **Pronunciation dictionary**: intentionally none — the line table contains no proper nouns
  by design (the forbidden-word lint guarantees it), so there is nothing to alias.
- **Script**: `content/vo/bt-lines.csv` (line_id, step, kind ∈ ok|h1, text_with_breaks, seed)
  — 57 lines, ≤ 8 words each, present tense, zero narrative. This IS the shipped script.
  Localization translates it (≤ 10 words where grammar demands), same voice/model/settings,
  new fixed seeds per language, full re-batch — never mixed models or voices across languages.
- **Pipeline** (`npm run btaudio`): mp3_44100_192 from the API → decoded exactly once →
  edge silence trimmed ≤ 60 ms → −16 LUFS / −1 dBTP → mono WAV in `public/audio/vo/bt/`
  (raw takes kept in `_raw/`), manifest keys `vo.bt.*`, provenance
  `content/vo/bt-provenance.json` (request id, seed, settings, sha256, timestamps). Ships
  dry — CAIRN routes to the clean dialogue bus; any cockpit DSP is in-engine, so every
  retake and every language gets identical treatment. Dialogue ducks music/SFX per the
  existing bus rules.
- **UI audio** (`npm run btsfx`, sound-generation API, prompt_influence 0.7):
  `ui.bt.confirm` (THE chime — warm synthetic bell, no alarm quality; must be instantly
  distinguishable from every combat alarm in a blind test), `ui.bt.hint` (two-pulse tick),
  `ui.bt.phase` (restrained three-tone), `amb.bt.pad` (22 s calm pad loop, mastered to
  −30 LUFS ≈ ≥ 12 dB under dialogue; replaces music on stage 0). Default 2 takes per asset
  (credit-lean); rerun `--variants 6` before the final human listen pass — extra takes are
  saved as `_v2…` for the pick.
- **QC gate** (reject/regenerate on any failure): timbre A/B first-vs-last line · zero
  mispronunciations · ±1 LU of target, no clipping, no truncated tails · file ↔ key ↔
  subtitle 1:1 (lint `--audio`) · **a sound-off run loses zero information** (audio is
  garnish by design — the whole game already runs silent-safe).

## §9. TRIPO3D PRODUCTION — training-pad assets

Props only; walkers come from the existing library. **Reuse first** (the brief's own budget
rule): target boards = `vp_prop_range_board-a/b`, practice drone = `vp_prop_range_drone` (visibly kin to
the existing drone family), crates = `vp_prop_range_crate`, coolant bowser =
`vp_prop_range_coolant-bowser`, light mast ≈ `vp_struct_shared_searchlight-tower`.

New entries in `assets/tripo/manifest.json` (palette: pale ceramic / graphite / amber; all
`text_to_model`; fixed `model_seed` per asset so approved geometry is reproducible — iterate
looks via texture seed only; prompts end "hard-surface, game-ready, isolated, no text, no
logos"):

| ID | Asset | Faces (LOD0) | model_seed |
|---|---|---|---|
| vp_struct_range_pylon | Gate pylon, emissive amber band, soft-collide | 3 k | 52102 |
| vp_prop_range_barrier | Boost barrier, low wide, amber chevrons | 5 k | 52103 |
| vp_prop_range_fence | Drone-pen fence section (modular, instanced) | 3 k | 52108 |
| vp_prop_range_spool | Pad dressing — heavy cable spool | 4 k | 52105 |
| vp_struct_range_lightmast | Pad dressing — portable floodlight mast | 4 k | 52106 |

Run: `python3 scripts/gen_tripo.py --ids vp_struct_range_pylon,vp_prop_range_barrier,vp_prop_range_fence` (add the
priority-3 dressing when credits allow). **The Tripo account is at zero credits (403
code=2010) — the batch is submit-ready and blocked only on a top-up**; the pad ships greybox
until then, consistent with the project's overall art status. Post-processing per the
existing pipeline: GLB export via the shared max-quality client, ground-contact pivot,
engine-forward axis, LOD1 ≈ 40 % / LOD2 ≈ 15 %, simple proxy collision authored in-engine
(pylons soft-collide; the barrier's ramp tested with the heaviest chassis, not just the
Skarn), provenance logged per the rights-tracking rules.

Per-asset QC gate: watertight; ground pivot + correct forward axis; within face budget after
import; full PBR (no baked lighting); reads at 50–300 m (silhouette first); palette
consistent. **Total added budget ≤ 90 k triangles at LOD0** — the five new assets sum ≤ 19 k;
everything else on the pad is reused art.

## §10. TESTS, TELEMETRY & ACCEPTANCE

Automated (run: `npm run btlint`, `npm run bttest` against a built preview):
- ✅ **Content lint** (`scripts/lint_bt.mjs`) — every prompt has ≥ 1 valid `{bind:}` token;
  tokens reference real actions; forbidden-word list (NAV / objective / mission / enemy
  forces / every character name) across all `tut.bt.*` strings AND all VO lines; every
  string key resolves; VO ≤ 8 words, no key names, fixed seeds; VO ↔ subtitle text 1:1;
  audio manifest + files (strict with `--audio`).
- ✅ **Input-injection run** (`scripts/test_bt.mjs`) — a scripted driver completes ALL steps
  in the real headless build by performing the actual inputs (real key events; torso-aim
  deltas injected into the same accumulator real mousemove events feed). Includes negative
  checks (wrong keys never advance A0/A1), proves the G-phase conditional auto-skip, and
  asserts the run ends with phase `complete`.
- ◻ **Rebind / device / unbound runtime tests** — N/A until the Settings rebinding UI and
  gamepad input exist. The mechanism is in place: single bindings registry, live token
  resolution, amber UNBOUND chip state (exercised by the G-phase actions in content).
- ✅ **Determinism by construction** — the director runs in the fixed-step loop off content
  data; no wall-clock, no RNG anywhere in the step machine.

Playtest acceptance (human, pending): first-timers finish in 6–9 min · ≥ 90 % clear every
step below hint level 2 · a sound-off, subtitle-off run loses zero required information ·
skipping at any point sets flags and never blocks campaign or menus · campaign carryover
(stage-1 players use throttle, torso twist, targeting, group fire, coolant flush unprompted)
· the confirm chime is identified vs combat alarms blind · VO passes the §8 QC listen pass.
