# MASTER PROMPT — Build "BASIC TRAINING": the Input-Driven Controls Tutorial for SOVEREIGN ASH: NARETH PROTOCOL

> **How to use this file:** Fill in the `{VARIABLES}` block, then paste the entire document into your coding/game-development agent alongside (or after) the main *Sovereign Ash: Nareth Protocol* master prompt. Everything from "ROLE" onward is the prompt itself.
>
> **Why this document exists:** A previous tutorial spec produced a *narrative training mission* — objectives like "Reach NAV ALPHA through the slalom." That is a campaign mission, not a tutorial. This document replaces it. The tutorial defined here is an **input-driven controls tutorial**: the screen shows the exact key ("Hold **W**"), the game detects the actual input, confirms it with a checkmark, and only then advances. The narrative tutorial-under-pressure remains Campaign Mission 1 (DEAD ORBIT) and is untouched by this spec.
>
> **This revision** additionally bakes in the complete best-known-good **ElevenLabs** (voice, UI audio, ambience — §8) and **Tripo3D** (training-pad assets — §9) production configurations, adapted to what an input-driven tutorial actually needs: a minimal, hyper-consistent script and a small prop set — not the character-VO-heavy pipeline a narrative mission would use.

---

## 0. VARIABLES — fill these in before pasting

```
{KEYMAP_OVERRIDES}   = "none" or a list of action→binding changes vs. the default map in §3
{TRAINER_FRAME}      = the chassis used in Basic Training (default: SKYRAKE-35 — jump-capable, so every step is teachable)
{MIRA7_VOICE_ID}     = existing ElevenLabs voice ID for MIRA-7, or "design new"
{ELEVENLABS_TIER}    = your plan (affects PCM output availability & request concurrency)
{CONCEPT_ART_DIR}    = path/URLs to your drone-family concept art (Tripo image-to-model input for asset B4)
{LANGUAGES}          = e.g. EN (source), FR, DE, ES, JA
{EXISTING_INPUT}     = 1-paragraph note on the current input/action system (action IDs, rebinding, device detection) if any exists
```

---

# ROLE

You are the senior gameplay/UX engineer, tutorial designer, and technical audio/asset-pipeline engineer on **Sovereign Ash: Nareth Protocol**, the browser-based heavy-walker combat simulator (TypeScript monorepo, Babylon.js, WebGPU with WebGL2 fallback, React overlay UI, fixed-step deterministic sim in `packages/game-core`). The game's systems — throttle movement, decoupled torso aim, targeting, weapon groups, heat, coolant flush, shutdown override, boost, and squad commands — already exist or are specified in the main master prompt. Your job is to build **BASIC TRAINING**: a standalone, main-menu-accessible, input-gated controls tutorial.

Do not redesign existing systems. Do not write a mission. Teach the buttons.

# THE CORE RULE — WHAT THIS IS AND IS NOT

This is the correction to the previous attempt. Treat every row of this table as a hard requirement.

| ❌ NOT this (campaign-style) | ✅ THIS (input-driven tutorial) |
|---|---|
| "Reach NAV ALPHA through the barricade slalom." | "Hold **{bind:throttle_up}** to raise throttle." → game detects the input → ✓ |
| Objectives phrased as fiction; player infers the controls. | Every step names the exact key/button on screen. The player never guesses. |
| Success = arriving at a story beat. | Success = **detected input action + measurable sim-state change** (e.g., `throttle ≥ 40%`). |
| Instructor delivers paragraphs of characterful VO. | MIRA-7 speaks ≤ 8 functional words per line. No plot, no character arcs, no grief, no war. |
| Enemies, timers, pressure. | Zero threat until the optional final checkride. Player is invulnerable throughout. Infinite ammo. |
| Cinematic framing, comms drama, cutscenes. | A quiet training pad. HUD, glyphs, checkmarks, a soft confirmation chime. |

**Hard rules for every step:**

1. **The prompt string must contain at least one `{bind:...}` token.** If a step's on-screen text has no key/button in it, the step is wrong — rewrite it. (Enforce with a content-lint rule; see §10.)
2. **One input concept per step.** A step may show multiple glyphs only when they are the same concept (e.g., `{bind:steer_left}` / `{bind:steer_right}`) or in a combination drill whose every key was already individually taught — and then all glyphs stay on screen.
3. **Detect actions, not keycodes.** Steps listen to the input-action bus (`throttle_up`), never to raw `KeyW`, so rebinding always works and controller input passes the same steps.
4. **Verify the effect, not just the press.** Pressing W while the frame is powered down must not pass "throttle up." Success predicates read sim state.
5. **No failure states.** No death, no time-outs that punish, no resets required. The only exits are ✓, skip-step, or skip-tutorial.
6. **Info must still be input-gated.** Even "look at this HUD element" steps end with "Press **{bind:ui_confirm}** to continue," so the player's hands stay on the controls and pacing stays player-driven.

# MISSION — your deliverables

1. **Tutorial spec** — the step table in §4 implemented exactly, adapted to `{EXISTING_INPUT}` and `{KEYMAP_OVERRIDES}`.
2. **Data-driven step content** — `/content/tutorial/basic_training.json` conforming to the schema in §6, plus localization keys.
3. **Runtime implementation** — `TutorialDirector` in `packages/game-core`, prompt overlay in React, glyph resolver shared with the rebinding screen (§7).
4. **ElevenLabs production package** — MIRA-7 casting, final model + settings, the complete line script, pronunciation dictionary, runnable batch pipeline, and UI-audio/ambience generation (§8). VO is optional garnish; the tutorial must be 100% complete with sound off.
5. **Tripo3D production package** — training-pad asset manifest with per-asset ready-to-POST payloads, post-processing, and QC gates (§9).
6. **Automated tests + acceptance checklist** (§10).

Ask at most three clarifying questions if a `{VARIABLE}` is ambiguous; otherwise proceed with stated `[ASSUMPTION]` markers.

---

## §1. WHERE IT LIVES

- **Entry points:** (a) offered once on first boot after the intro/settings flow — "Take Basic Training? (recommended, ~7 minutes)" with Accept / Skip; (b) always available under **TRAINING → BASIC TRAINING** in the main menu; (c) replayable, with per-phase quick-jump chips once completed.
- **Relationship to campaign:** completing *or skipping* Basic Training sets the same save flag `basic_training_complete`. Campaign Mission 1 (DEAD ORBIT) remains the diegetic tutorial-under-pressure and may surface one-line MIRA-7 refreshers the first time a mechanic recurs — but DEAD ORBIT is out of scope for this prompt.
- **The space:** the Phase-0 "walkable test arena" from the main master prompt, dressed as a Meridian Assembly calibration pad: flat ferrocrete apron, three gate pylons, a target-board row, one jump barrier, one practice drone pen. Calm lighting, no weather, no music beyond a low ambient bed.
- **The frame:** `{TRAINER_FRAME}` with a fixed known loadout — Group 1: twin pulse lasers; Group 2: light autocannon; Group 3: rocket pod — so weapon-group steps are identical for every player.
- **Sim configuration:** player invulnerable, infinite ammo, heat model active (needed for Phase E) but reactor-damage disabled, squadmate AI unit available for Phase G, physics normal.

## §2. ANATOMY OF A STEP — the state machine

Every step runs the same loop. Implement once, drive by data.

```
LOCKED → ACTIVE → (DETECTING…) → CONFIRMED → [0.7 s beat] → next step ACTIVE
```

- **ACTIVE:** prompt card appears bottom-center: short imperative line + large device-correct glyph chip(s). Relevant HUD element (throttle tape, heat bar, target panel…) gets a soft highlight pulse. Input listeners arm.
- **DETECTING:** for held/analog inputs, the glyph chip fills like a radial/linear progress meter (e.g., hold W → chip fills as throttle rises to 40%). Multi-part steps show a mini-checklist; each sub-item gets its own ✓.
- **CONFIRMED:** chip flashes, ✓ stamps, one soft chime (the same chime every time — it becomes the "you did it" sound), optional MIRA-7 confirmation line. Prompt card holds 0.7 s so the player sees the ✓, then swaps.
- **Hint escalation (never punitive):** at **+8 s** of no qualifying input → glyph chip pulses larger + MIRA-7 nudge line ("Hold {key} now."). At **+20 s** → a ghost-input demonstration plays (animated key press on the chip; for mouse-aim steps, a faint arrow sweeps toward the target) and the on-screen line repeats verbatim in the subtitle strip. No third level; the prompt simply stays.
- **Always available:** `Hold {bind:skip_step}` (skip this step), `Esc → Skip Basic Training`, `Hold {bind:help}` (overlay cheat-sheet of everything taught so far).
- **Progress rail:** slim top-of-screen rail showing phases A–H with per-step ticks, so the player always sees how little remains.

## §3. DEFAULT INPUT MAP (rebind-aware)

Defaults below; apply `{KEYMAP_OVERRIDES}`. **Prompts never hardcode key names** — strings carry `{bind:action_id}` tokens and the glyph resolver renders the *current* binding for the *active device* (KB+M or gamepad), live-updating if the player rebinds mid-tutorial. If an action is unbound, the chip renders an amber "UNBOUND — open Settings" state and the step offers skip.

| Action ID | Default (KB+M) | Default (pad) | Notes |
|---|---|---|---|
| `throttle_up` / `throttle_down` | **W** / **S** | LS ↑ / LS ↓ | stepped throttle; S past zero = reverse |
| `steer_left` / `steer_right` | **A** / **D** | LS ← / LS → | leg heading |
| `full_stop` | **X** | B (tap) | zero throttle instantly |
| `torso_aim` | mouse | RS | torso yaw/pitch, decoupled from legs |
| `center_torso` | **C** | RS click | snap torso to leg heading |
| `align_legs` | **V** | — | legs to torso (mention only, not a step) |
| `zoom` | **RMB** (hold) | LT (hold) | optics magnification |
| `target_reticle` | **R** | X | lock target under reticle |
| `target_nearest` | **E** | Y | lock nearest hostile contact |
| `target_cycle` | **T** | RB | cycle sensor contacts |
| `fire` | **LMB** | RT | fires the selected weapon group |
| `group_1`…`group_6` | **1–6** | D-pad ←/→ cycles | select weapon group |
| `chainfire_toggle` | **Backspace** | D-pad ↓ | group/chain fire for selected group |
| `coolant_flush` | **F** | LB+X | coolant purge |
| `override` | **O** (hold) | LB+Y (hold) | override emergency shutdown |
| `jump` | **Space** (hold) | A (hold) | boost — chassis-specific |
| `command_wheel` | **Tab** (hold) | LB (hold) | radial squad menu; release to issue |
| `order_form_up` / `order_attack` | **F1** / **F2** | via wheel | quick orders (F3 move-to, F4 hold fire exist; not all are steps) |
| `ui_confirm` | **Enter** | A | acknowledge info cards |
| `skip_step` | **F8** (hold) | Back (hold) | per-step skip |
| `help` | **H** (hold) | Select (hold) | taught-so-far cheat sheet |

## §4. THE STEP TABLE — implement exactly, in order

Format: **ID | On-screen prompt (localized string; tokens resolve to glyph chips) | Success predicate (sim/action state) | Setup & notes.**
Target total: **6–9 minutes** first-time; median per step ≤ 25 s.

### PHASE A — POWER & LEGS
| ID | Prompt | Success | Setup / notes |
|---|---|---|---|
| A0 | "Systems ready. Press **{bind:ui_confirm}** to power up." | `ui_confirm` pressed → startup animation + HUD elements light up one by one with 1-word labels (THROTTLE, HEAT, RADAR, TARGET) | Cold cockpit → powered. This is the very first thing the player does: a keypress. |
| A1 | "Hold **{bind:throttle_up}** to raise throttle." | `throttle_up` held **and** throttle ≥ 40% | Throttle tape highlighted; chip fills with throttle %. |
| A2 | "Hold **{bind:throttle_down}** to slow to a stop." | throttle = 0 **and** speed < 0.5 m/s | |
| A3 | "Hold **{bind:throttle_down}** again to walk backward." | reverse throttle ≤ −20% **and** 8 m traveled backward | MIRA-7: "Reverse engaged." |
| A4 | "Press **{bind:steer_left}** and **{bind:steer_right}** to turn your legs." | two sub-checks: cumulative leg yaw ≥ 45° left ✓ and ≥ 45° right ✓ | Compass strip highlighted; two chips, each with its own ✓. |
| A5 | "Walk through the three gates." *(chips for {bind:throttle_up} {bind:steer_left} {bind:steer_right} stay pinned)* | gate triggers 1→2→3 passed, any order of inputs | First combination drill — allowed because every key was taught and remains on screen. Gates are wide; pylons are soft-collide. |
| A6 | "Press **{bind:full_stop}** for an instant full stop." | `full_stop` pressed **and** throttle = 0 within 0.3 s | MIRA-7: "Full stop." |

### PHASE B — TORSO (the signature mechanic)
| ID | Prompt | Success | Setup / notes |
|---|---|---|---|
| B1 | "Move the **mouse** to twist your torso." *(pad: "Move {bind:torso_aim}")* | torso-vs-leg yaw ≥ 30° left ✓ and right ✓ | Leg-heading vs torso-heading HUD indicator highlighted. |
| B2 | "Aim with **{bind:torso_aim}** — hold the reticle on the target board." | reticle-on-board cumulative 2.0 s | Static board T1, 80 m, generous hitbox. Chip = radial timer. |
| B3 | "Press **{bind:center_torso}** to snap your torso back in line." | `center_torso` pressed **and** \|torso−leg yaw\| < 2° | |
| B4 | "Hold **{bind:throttle_up}** and *keep the reticle on the board* while you walk." | speed > 3 m/s **and** reticle-on-board cumulative 3.0 s | The decoupling drill: legs one way, guns another. Board T1 stays static; the player walks past it. |
| B5 | "Hold **{bind:zoom}** to magnify." | zoom active ≥ 1.0 s | Then auto-release note: "Release to return." |

### PHASE C — SENSORS & TARGETING
| ID | Prompt | Success | Setup / notes |
|---|---|---|---|
| C1 | "Press **{bind:target_reticle}** to lock the contact under your reticle." | lock acquired on board T1 via `target_reticle` | Radar highlighted; three powered boards (T1–T3) come online at spread bearings. |
| C2 | "Press **{bind:target_nearest}** to lock the nearest contact." | lock on the nearest board via `target_nearest` | |
| C3 | "Press **{bind:target_cycle}** to cycle contacts. Lock all three." | three distinct lock events via `target_cycle`; 3-pip sub-checklist | |
| C4 | "This panel is your target's damage readout — each section lights as it takes hits. Press **{bind:ui_confirm}** to continue." | `ui_confirm` | Target info panel + paper-doll silhouette highlighted. Info step, still input-gated. |

### PHASE D — WEAPONS
| ID | Prompt | Success | Setup / notes |
|---|---|---|---|
| D1 | "Press **{bind:fire}** to fire Weapon Group 1 at the board." | fire event, group 1, hit on any board | Group HUD highlighted; Group 1 = pulse lasers (no ammo anxiety). |
| D2 | "Press **{bind:group_2}** to select Group 2, then **{bind:fire}**." | sub-checks: active group = 2 ✓ → fire event from group 2 ✓ | Autocannon: visible recoil sells mass. |
| D3 | "Press **{bind:chainfire_toggle}** to set chain fire, then hold **{bind:fire}**." | chain mode ON for selected group ✓ → ≥ 3 sequential discharges ✓ | Explain in 1 line under the chips: "Chain = one weapon at a time. Less heat." |
| D4 | "Weapons free — destroy all four boards." *(chips for {bind:group_1}–{bind:group_3}, {bind:fire} pinned)* | 4 board-destroyed events | Boards flip/shatter with satisfying feedback; combination drill. |

### PHASE E — HEAT
| ID | Prompt | Success | Setup / notes |
|---|---|---|---|
| E1 | "Hold **{bind:fire}** in group fire until heat reaches the amber line." | heat ≥ 70% | Heat bar highlighted; chain fire auto-reset to group fire for this drill. |
| E2 | "Press **{bind:coolant_flush}** to purge coolant." | flush used **and** heat drops ≥ 25 points | Visible vapor blast from radiators — the reward is spectacle. |
| E3 | "Keep holding **{bind:fire}** past the red line. Let it shut down — you're safe here." | reactor emergency-shutdown event | Screens die, fans spin down, 4-s restart countdown appears. Scripted-safe. |
| E4 | "Hold **{bind:override}** to force the reactor back online." | `override` held ≥ 1.5 s during countdown → reactor online | MIRA-7: "Override accepted. Reactor risk noted." One caption line: "In the field, overriding can damage your reactor." |

### PHASE F — BOOST *(conditional: only if {TRAINER_FRAME} mounts a jump/boost pack; otherwise auto-skip with rail tick)*
| ID | Prompt | Success | Setup / notes |
|---|---|---|---|
| F1 | "Build speed, then hold **{bind:jump}** to boost over the barrier." | barrier-cleared trigger **and** upright landing | Low, wide barrier; chip fills with boost charge; heat cost visible on the bar (callback to Phase E). |

### PHASE G — SQUAD
| ID | Prompt | Success | Setup / notes |
|---|---|---|---|
| G1 | "Your wing is on the pad. Hold **{bind:command_wheel}**, select **ATTACK MY TARGET**, release." | order `attack_my_target` issued while a practice drone is locked → wingmate acknowledges → drone destroyed | One slow practice drone lifts from the pen; player locks it first (auto-prompt "Press {bind:target_nearest}" chip appears if no lock). |
| G2 | "Press **{bind:order_form_up}** to recall your wing." | `order_form_up` issued → acknowledgement event | Caption: "F1–F4 are quick orders. The wheel has everything." |

### PHASE H — CHECKRIDE *(optional; a "Skip checkride" chip is visible from the start)*
| ID | Prompt | Success | Setup / notes |
|---|---|---|---|
| H1 | "Checkride: three practice drones inbound. Weapons free." *(Hold {bind:help} anytime for the cheat sheet)* | 3 drones destroyed | Drones fire visibly harmless low-yield shots (player armor floors at 1%; hits still flash the paper doll so damage feedback is seen once). No timer. No fail. |
| H2 | "Basic Training complete. Press **{bind:ui_confirm}** to return to the menu." | `ui_confirm` → write `basic_training_complete`, show summary card (time, hints used, phases done) | Summary card offers: Replay a phase / Campaign / Menu. |

## §5. PACING, SKIP, REPLAY, ACCESS

- **Budget:** ≤ 9 min total; no step median > 25 s (telemetry §10). If a step's median exceeds budget in playtesting, fix the step, not the player.
- **Skip:** hold `{bind:skip_step}` skips a step; Esc menu skips the whole tutorial; both set the same flags a completion would. Skipping never nags.
- **Replay:** from TRAINING menu; completed players get phase quick-jump chips (A–H).
- **Accessibility:** every prompt exists as text + glyph + optional VO + subtitle — full completion possible with sound off; glyph chips meet contrast targets and are colorblind-safe (shape + label, never color alone); hold-inputs offer toggle alternatives per the game's global setting; all highlights respect reduced-flash settings; prompt text scales with the HUD scale slider.
- **Localization:** all strings by key (`tut.bt.<step>.prompt`, `.hint1`, `.caption`), tokens preserved in every language; glyphs are never localized text.

## §6. DATA SCHEMA — steps are content, not code

All steps live in `/content/tutorial/basic_training.json`, validated by a schema in `packages/content-schema`. The `TutorialDirector` is generic; designers reorder/retune without code changes.

```jsonc
// packages/content-schema → tutorial_step.schema.json (excerpt)
{
  "id": "bt_a1_throttle_up",
  "phase": "A",
  "prompt_key": "tut.bt.a1.prompt",          // "Hold {bind:throttle_up} to raise throttle."
  "caption_key": null,                        // optional 1-line sub-caption
  "hud_highlight": ["throttle_tape"],
  "listen_actions": ["throttle_up"],          // input-action bus subscriptions
  "success": {                                // predicate DSL evaluated in fixed step
    "all": [
      { "action_held": "throttle_up" },
      { "sim": "throttle_pct", "op": ">=", "value": 40 }
    ]
  },
  "progress_source": { "sim": "throttle_pct", "max": 40 },   // fills the glyph chip
  "hints": { "t1_sec": 8, "t1_vo": "vo_bt_a1_h1", "t2_sec": 20, "t2_ghost": "key_press" },
  "confirm_vo": "vo_bt_a1_ok",
  "on_enter": [{ "spawn": null }],
  "on_confirm": [],
  "skippable": true,
  "conditional": null                          // e.g. { "chassis_has": "boost" } for F1
}
```

**Lint rules enforced in CI on this content file (see §10):**
- every `prompt_key` string contains ≥ 1 `{bind:...}` token;
- every `{bind:...}` token references a real action ID;
- forbidden-word list in `tut.bt.*` strings: no `NAV`, `objective`, `mission`, `enemy forces`, character names, or narrative phrasing — keeps future edits from drifting back into campaign voice.

## §7. RUNTIME INTEGRATION (TypeScript / Babylon / React)

1. **`packages/game-core/src/tutorial/TutorialDirector.ts`** — fixed-step system: loads step content, arms listeners on the input-action bus, evaluates success predicates against sim state, emits `tutorial/*` events. Deterministic and replay-testable like every other game-core system.
2. **Input-action bus** — steps subscribe to *actions* (post-rebinding), never `KeyboardEvent.code`. Gamepad and KB+M produce identical action events, so one step definition serves both devices.
3. **`packages/ui` → `<TutorialPromptLayer/>`** — React overlay: prompt card, glyph chips with fill states, sub-checklists, ✓ animation, progress rail, cheat-sheet overlay. Subscribes to `tutorial/*` events; no per-frame React re-render — chip fill is driven by a ref/canvas value to avoid DOM churn per the main prompt's HUD rule.
4. **`<BindGlyph action="throttle_up"/>`** — the single glyph-resolver component, shared with the Settings/rebinding screen so tutorial glyphs and rebind UI can never disagree. Resolves: active device → current binding → glyph atlas sprite (+ text label). Live-updates on rebind events. Renders the amber UNBOUND state when applicable.
5. **HUD highlight service** — tutorial requests highlights by HUD element ID; the HUD owns the pulse effect (respecting reduced-flash setting).
6. **Save/flags** — `basic_training_complete: boolean`, `basic_training_phases: string[]` in the profile store; first-boot offer reads the flag; campaign refresher lines check it.
7. **Audio** — confirmation chime + MIRA-7 lines on the dialogue bus with standard ducking; the chime is a UI-bus one-shot; nothing here depends on audio to function.
8. **Entry wiring** — main menu TRAINING node; first-boot modal; Esc-menu skip; post-complete summary routes.

## §8. ELEVENLABS PRODUCTION — VOICE + UI AUDIO (best-known-good configuration)

All audio is pre-baked offline through `packages/tools-eleven` (server-side; API keys never reach client JavaScript) and shipped as static assets — nothing is synthesized at runtime. Verify current model IDs, endpoints, and plan limits against the live ElevenLabs docs before batch-generating; the lineup versions quickly.

**Two audio hard rules, extending THE CORE RULE:**
- **VO never speaks key names.** Bindings are remappable, so MIRA-7 says the *action* ("Raise throttle now.") and the on-screen glyph names the key. A line containing "W" or "press F" is a bug.
- **Every line stands alone.** Steps can be skipped or replayed in any order, so lines must never depend on each other. Deliberately do **not** use `previous_text`/`next_text` request-stitching here — unlike long-form character VO, stitching creates cross-line prosody dependencies that break out-of-order playback.

### 8.1 Casting — MIRA-7 is the only voice
No Amara Sen, no squad banter, no story. Reuse the main master prompt's MIRA-7 voice bible. Voice Design prompt:

> "Feminine synthetic voice with near-human clarity, neutral age, narrow emotional range, exact timing, minimal breath, and slightly unusual emphasis on diagnostic terms. Calm, precise, quietly reassuring. Never a generic robotic monotone, metallic vocoder, seductive AI trope, or an imitation of any existing fictional computer voice."

Protocol:
1. If the campaign has already cast MIRA-7, **pin that `{MIRA7_VOICE_ID}`** — Basic Training and DEAD ORBIT must share one voice ID so MIRA-7 is identical everywhere. Otherwise generate 5–8 candidates via Voice Design.
2. Audition every candidate against the same 3-line calibration set at the *exact* settings in §8.3 (voice × model pairing matters as much as the settings): "Power online. Systems nominal." / "Heat critical. Shutdown imminent." / "Override accepted. Reactor risk noted."
3. Pin the winner and **never regenerate old lines with a new voice** — mid-project voice drift is the #1 VO pipeline failure.

### 8.2 Model selection matrix

| Use | Model | Why |
|---|---|---|
| MIRA-7 — every tutorial line | **`eleven_multilingual_v2`** | The consistency workhorse. ~60 short status lines must sound *identical*; v2 at high stability is far more deterministic than v3 across many tiny generations; supports SSML `<break time="0.25s" />` for the clipped diagnostic cadence; works with pronunciation dictionaries; localizes to `{LANGUAGES}` on the same voice. |
| *(rejected)* `eleven_v3` | — | v3's expressiveness and audio tags exist for characters with emotional range — exactly what MIRA-7 must not have. It also drops the `speed` parameter and SSML breaks and is most stable on ≥250-character generations; these lines are 2–8 words. Wrong tool for this job. |
| *(contingency)* future dynamic callouts | `eleven_flash_v2_5` | ~75 ms latency if runtime-generated lines are ever added. Do **not** use it for the shipped tutorial. |

### 8.3 Voice settings (starting values — A/B a 30-second sample before batch)

| Parameter | Value | Rationale |
|---|---|---|
| `stability` | **0.90** | Maximum determinism across dozens of tiny lines; don't use 1.0 — it sounds dead. |
| `similarity_boost` | **0.75** | Raise only if timbre drifts between lines; too high causes artifacts. |
| `style` | **0.0** | Any style exaggeration breaks the machine flatness. Zero, always. |
| `use_speaker_boost` | **true** | Cheap clarity gain over the pad ambience. |
| `speed` | **0.95** | Slightly slow for intelligibility; the glyph chip carries the information anyway. |
| `seed` | fixed per line, logged | Reproducible retakes; regenerate flagged lines with the same seed ± small stability nudges. |

### 8.4 Reference payload (ready to POST)

```jsonc
POST https://api.elevenlabs.io/v1/text-to-speech/{MIRA7_VOICE_ID}
{
  "model_id": "eleven_multilingual_v2",
  "text": "Override accepted. <break time=\"0.25s\" /> Reactor risk noted.",
  "voice_settings": { "stability": 0.90, "similarity_boost": 0.75, "style": 0.0, "use_speaker_boost": true, "speed": 0.95 },
  "seed": 52028,
  "output_format": "pcm_44100",
  "pronunciation_dictionary_locators": [
    { "pronunciation_dictionary_id": "<DICT_ID>", "version_id": "<VERSION_ID>" }
  ]
}
```

### 8.5 Pronunciation dictionary (create before the batch)
Create once via `POST /v1/pronunciation-dictionaries/add-from-file` (PLS lexicon), then attach at request time as above. Alias rules are the robust path on `eleven_multilingual_v2` (phoneme rules are only reliable on the Flash/Turbo v2 English models — verify against live docs). Minimum lexicon:

```xml
<lexicon version="1.0" xmlns="http://www.w3.org/2005/01/pronunciation-lexicon" alphabet="ipa" xml:lang="en-US">
  <lexeme><grapheme>MIRA</grapheme><alias>Meera</alias></lexeme>
  <lexeme><grapheme>Nareth</grapheme><alias>Nahreth</alias></lexeme>
</lexicon>
```

### 8.6 The complete line table (source language — this IS the shipped script)
CSV columns: `line_id, step, kind, text_with_breaks, seed, notes`. `line_id` = `vo_bt_{step}_{kind}`, kind ∈ `ok` (plays on ✓) | `h1` (plays at the +8 s hint). Every line ≤ 8 words, present tense, zero narrative, zero key names. Insert `<break time="0.25s" />` between the sentences of any two-sentence line. The agent **translates** this table to `{LANGUAGES}`; it does not extend it:

| Step | `_ok` (on ✓) | `_h1` (hint, +8 s) |
|---|---|---|
| A0 | "Power online. Systems nominal." | "Confirm to power up." |
| A1 | "Throttle set." | "Raise throttle now." |
| A2 | "All stop." | "Bring throttle to zero." |
| A3 | "Reverse engaged." | "Walk it backward." |
| A4 | "Leg steering confirmed." | "Turn your legs. Both directions." |
| A5 | "Gate run complete." | "Walk through the gates." |
| A6 | "Full stop." | "Try the instant stop." |
| B1 | "Torso articulation confirmed." | "Twist your torso. Both sides." |
| B2 | "Tracking steady." | "Hold the reticle on the board." |
| B3 | "Torso aligned." | "Recenter your torso." |
| B4 | "Moving fire posture confirmed." | "Walk and hold your aim." |
| B5 | "Optics engaged." | "Magnify your optics." |
| C1 | "Target locked." | "Lock the contact under your reticle." |
| C2 | "Nearest contact locked." | "Lock the nearest contact." |
| C3 | "All contacts logged." | "Cycle your contacts." |
| C4 | "Damage readout noted." | "Confirm when ready." |
| D1 | "Group one fired." | "Fire group one." |
| D2 | "Group two confirmed." | "Select group two. Then fire." |
| D3 | "Chain fire active." | "Toggle chain fire. Hold fire." |
| D4 | "Range clear." | "Destroy the remaining boards." |
| E1 | "Heat at amber." | "Keep firing. Build heat." |
| E2 | "Coolant purged. Temperature falling." | "Purge coolant now." |
| E3 | "Emergency shutdown." | "Keep firing. Let it stop." |
| E4 | "Override accepted. Reactor risk noted." | "Hold override now." |
| F1 | "Clean landing." | "Build speed. Boost over." |
| G1 | "Wing engaging." | "Open the command wheel." |
| G2 | "Wing returning." | "Recall your wing." |
| H1 | "Checkride complete." | "Three drones. Weapons free." |
| H2 | "Basic training complete." | — |

### 8.7 Batch pipeline (server-side, runnable)
Read CSV → call the API → write audio → log provenance. Respect `{ELEVENLABS_TIER}` concurrency; retry with backoff; human QC listen pass; regenerate flagged lines same-seed with small stability nudges.

```python
# packages/tools-eleven/scripts/generate_bt_vo.py  (skeleton — agent completes error handling/retries)
import csv, json, hashlib, os, time, requests

KEY = os.environ["ELEVENLABS_API_KEY"]          # secret store only — never client-side
VOICE = os.environ["MIRA7_VOICE_ID"]
SETTINGS = {"stability": 0.90, "similarity_boost": 0.75, "style": 0.0,
            "use_speaker_boost": True, "speed": 0.95}
manifest = []
for row in csv.DictReader(open("bt_vo_lines.csv")):
    body = {"model_id": "eleven_multilingual_v2", "text": row["text_with_breaks"],
            "voice_settings": SETTINGS, "seed": int(row["seed"]), "output_format": "pcm_44100",
            "pronunciation_dictionary_locators": [{
                "pronunciation_dictionary_id": os.environ["BT_DICT_ID"],
                "version_id": os.environ["BT_DICT_VER"]}]}
    r = requests.post(f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}",
                      headers={"xi-api-key": KEY}, json=body, timeout=120)
    r.raise_for_status()
    # NOTE: pcm_44100 is headerless raw PCM — wrap it in a WAV container on save
    # (Python 'wave' module), or request mp3_44100_192 and decode exactly once.
    path = f"out/{row['line_id']}.wav"
    write_wav(path, r.content, rate=44100)      # agent implements
    manifest.append({"line_id": row["line_id"], "request_id": r.headers.get("request-id"),
                     "seed": row["seed"], "settings": SETTINGS,
                     "sha256": hashlib.sha256(r.content).hexdigest()})
    time.sleep(0.3)                             # tune to {ELEVENLABS_TIER} limits
json.dump(manifest, open("out/bt_vo_manifest.json", "w"), indent=2)
```

### 8.8 Output & mastering
- `output_format`: **`pcm_44100`** where `{ELEVENLABS_TIER}` allows (headerless — see script note); else `mp3_44100_192` decoded once to WAV on import. Never re-compress twice.
- Loudness-normalize dialogue to **−16 LUFS**, −1 dB true-peak headroom; trim leading/trailing silence to ≤ 60 ms.
- **Ship files dry.** MIRA-7 is onboard, not radio — she routes to the clean full-range dialogue bus; any cockpit DSP happens in-engine so every retake and every language gets identical treatment.
- Dialogue bus sidechain-ducks SFX/ambience ~6 dB per the main prompt's audio rules; runtime encode to Opus per the main prompt's web-audio pipeline.

### 8.9 UI SFX + ambience — ElevenLabs sound generation
`POST https://api.elevenlabs.io/v1/sound-generation` with `text`, `duration_seconds`, `prompt_influence` (≈ 0.7 for prompts this specific). Generate 6 variants per asset, keep one, master to the UI bus.

| Asset | Prompt | Duration |
|---|---|---|
| `ui_bt_confirm` — THE chime, identical every step | "Soft single confirmation chime for a cockpit interface, warm synthetic bell with one brief low harmonic, clean fast decay, dry, no reverb, no melody, no alarm quality" | 0.5 s |
| `ui_bt_hint` | "Quiet two-pulse electronic attention tick, gentle, rounded, non-alarming, dry, no melody" | 0.4 s |
| `ui_bt_phase` | "Short rising three-tone synthetic confirmation flourish, restrained industrial character, dry, no reverb tail, no melodic hook" | 1.0 s |
| `amb_bt_pad_loop` | "Seamlessly looping calm interior landing-pad ambience, low ventilation hum, distant machinery, faint electrical texture, no music, no voices, no footsteps, restrained low frequencies, stable loop" | 22 s → trim to a clean loop in the DAW |

Rules: the confirm chime must be instantly distinguishable from every combat alarm in a blind test; the ambience sits ≥ 12 dB under dialogue; no melodic hooks anywhere (this is a tutorial, not a jingle).

### 8.10 Localization
Translate the §8.6 CSV keeping the ≤ 8-word constraint (≤ 10 where grammar demands); same `{MIRA7_VOICE_ID}`, same model, same settings, new fixed seeds per language; re-verify the pronunciation lexicon per language; regenerate the full batch per language. Never mix models or voices across languages.

### 8.11 Audio QC gate (reject/regenerate on any failure)
1. Timbre identical across the whole batch (blind A/B the first vs last generated line).
2. Zero lexicon mispronunciations.
3. Loudness within ±1 LU of −16 LUFS; no clipping; no truncated tails.
4. Every audio file ↔ localization key ↔ subtitle, 1:1.
5. A sound-off run of the tutorial loses zero information (audio is garnish by design).

## §9. TRIPO3D PRODUCTION — TRAINING-PAD ASSETS (best-known-good configuration)

Props and targets only — the trainer frame, the wingmate, and all walkers come from the game's existing library. All generation runs through `packages/tools-tripo` server-side with full provenance logging. API: `POST https://api.tripo3d.ai/v2/openapi/task` (uploads via `/v2/openapi/upload`); task types `text_to_model`, `image_to_model`, plus `convert` post-processing. **Verify current `model_version` strings against the live Tripo platform docs before running the batch — the lineup versions quickly.**

### 9.1 Model-version & seed strategy
- **Default:** the current **P1-class clean-topology** model — engine-ready quads, ideal for props and fast validation loops.
- **Hero escalation:** rerun an asset on the current high-precision (H3.x-class) line only if it reads badly at gameplay distance; nothing in this manifest should need it.
- Fix `model_seed` per asset so approved geometry is reproducible; iterate looks via `texture_seed` only.
- **Never** text-prompt for anything resembling a franchise mech or drone. The practice drone (B4) is `image_to_model` **from your own concept art** in `{CONCEPT_ART_DIR}` so it visibly belongs to the game's drone family and art direction.

### 9.2 Asset manifest (naming `env_bt_*`; palette = Meridian pale ceramic / graphite / amber)

| ID | Asset | Method | Faces (LOD0) | `model_seed` | Special flags |
|---|---|---|---|---|---|
| B1 | Powered target board, ×2 variants (flip-on-destroy) | text_to_model | 4k | 52101 | `generate_parts: true` → panel / hinge base as separate meshes |
| B2 | Gate pylon (emissive amber band, soft-collide) | text_to_model | 3k | 52102 | compression on |
| B3 | Jump barrier (low wide ramp-block) | text_to_model | 5k | 52103 | — |
| B4 | Practice drone (transform-animated — no rig) | **image_to_model** from `{CONCEPT_ART_DIR}` | 12k | 52104 | `quad: true`; must match the game's drone family; **no franchise resemblance** |
| B5 | Pad dressing kit — cable spool / light mast / equipment crate | text_to_model ×3 | ≤ 4k each | 52105–52107 | `texture_quality: "standard"` |
| B6 | Drone-pen fence section (modular, instanced) | text_to_model | 3k | 52108 | compression on |

### 9.3 Ready-to-POST payloads

```jsonc
// PRESET "DRONE" — image-to-model from your own concept art (B4)
{
  "type": "image_to_model",
  "model_version": "<current P1-class version string>",
  "file": { "type": "png", "file_token": "<upload via /v2/openapi/upload>" },
  "texture": true,
  "pbr": true,
  "texture_quality": "detailed",
  "texture_alignment": "original_image",
  "orientation": "align_image",
  "face_limit": 12000,
  "auto_size": true,
  "quad": true,
  "model_seed": 52104
}
```

```jsonc
// PRESET "PROP" — text-to-model (B1–B3, B5, B6; swap prompt / face_limit / model_seed per manifest)
{
  "type": "text_to_model",
  "model_version": "<current P1-class version string>",
  "prompt": "<per-asset prompt below>",
  "negative_prompt": "low quality, blurry, cartoon, text, watermark, logo",
  "texture": true,
  "pbr": true,
  "texture_quality": "detailed",
  "face_limit": 4000,
  "auto_size": true,
  "model_seed": 52101
}
```

Per-asset prompts (each ≤ 255 chars — function + silhouette + materials + exclusions):
- **B1** — "powered military calibration target board on hinged base, tall rectangular ceramic panel, amber sensor ring markers, scorch-resistant face, pale ceramic over graphite frame, industrial sci-fi range prop, hard-surface, game-ready, isolated, no text, no logos"
- **B2** — "slender industrial gate pylon, emissive amber light band near the top, ceramic composite shell over graphite frame, bolted base plate, sci-fi rescue-infrastructure styling, hard-surface, game-ready, isolated, no text, no logos"
- **B3** — "low wide modular training barrier block, sloped impact faces, layered ceramic armor panels, amber hazard chevrons, industrial sci-fi range obstacle, hard-surface, game-ready, isolated, no text, no logos"
- **B5a/B5b/B5c** — heavy cable spool / portable floodlight mast / stackable equipment crate, each in the same register: "…pale ceramic and graphite, amber markings, industrial sci-fi landing-pad equipment, hard-surface, game-ready, isolated, no text, no logos"
- **B6** — "modular open-frame holding-pen fence section, graphite lattice, amber edge-lighting strip, heavy stabilizer feet, industrial sci-fi range equipment, hard-surface, game-ready, isolated, no text, no logos"

### 9.4 Post-processing pipeline (per asset)
1. **Parts:** B1 uses `generate_parts: true`; verify panel and hinge base are separate meshes with sealed interior faces and their own pivots (the panel flips on destroy).
2. **LODs:** LOD1 ≈ 40% and LOD2 ≈ 15% of base faces via the smart-low-poly / `convert` path or the engine reducer.
3. **Export:** `convert` task → **GLB** for runtime (FBX only if DCC cleanup is needed); `auto_size: true`, then verify against the project's 1-unit scale on import; pivot at ground contact; forward axis per engine convention.
4. **Textures:** transcode to KTX2/Basis with mipmaps per the main prompt; ORM channels packed; no baked lighting or shadows in albedo.
5. **Collision:** simple proxies authored in-engine (boxes/capsules); pylons soft-collide; the barrier's ramp collision is tested with the heaviest frame class, not just `{TRAINER_FRAME}`.
6. **Provenance:** log prompt, `model_version`, seeds, task IDs, date, account/plan, reviewer, edits, and approval into `/assets-source` metadata per the main prompt's rights-tracking rules.

### 9.5 Per-asset QC gate (reject/regenerate on any failure)
1. Watertight where required; no floating shells or interior junk geometry.
2. Pivot at ground contact; correct forward axis; within face budget after LOD0 import.
3. Full PBR set (albedo / normal / ORM); no baked lighting.
4. Reads correctly at gameplay camera distance (50–300 m) — silhouette first, detail second.
5. Palette consistent with Meridian pale ceramic / graphite / amber; the drone is visibly kin to the game's drone family.
6. **Total Basic Training added asset budget ≤ 90k triangles at LOD0** (everything else on the pad is reused art).

## §10. TESTS, TELEMETRY & ACCEPTANCE — definition of done

**Automated tests (CI):**
- [ ] **Input-injection run:** a scripted driver feeds action events + sim state and completes all steps; asserts each step confirms *only* via its declared actions/predicates (pressing the wrong key never advances).
- [ ] **Rebind test:** rebind `throttle_up` W→↑ mid-tutorial; assert every rendered prompt/glyph updates, and the step passes with the new binding, not the old.
- [ ] **Device test:** same content run with gamepad action source renders pad glyphs and completes identically.
- [ ] **Unbound test:** unbind an action → chip shows UNBOUND state, step is skippable, no soft-lock.
- [ ] **Content lint:** every prompt has ≥ 1 valid `{bind:...}` token; forbidden-word list passes; all localization keys exist in source language.
- [ ] **Audio manifest check:** every `vo_bt_*` / `ui_bt_*` / `amb_bt_*` file exists, sits within loudness spec, and maps 1:1 to a localization/subtitle key (scripted).
- [ ] **Determinism:** TutorialDirector replay test produces identical event logs for identical inputs.
- [ ] WebGL2 fallback completes the full tutorial.

**Telemetry:** `bt_start`, `bt_step_start/confirm/skip {id}`, `bt_hint {id, level}`, `bt_complete {duration, hints_total}`, per-step duration histogram.

**Playtest acceptance:**
- [ ] First-time players finish in **6–9 minutes**; no step median > 25 s.
- [ ] ≥ 90% of first-time players clear every step without reaching hint level 2.
- [ ] 100% of steps are passed by performing the actual input (verified vs telemetry + input-injection suite).
- [ ] A sound-off, subtitle-off run loses zero required information.
- [ ] Skipping at any point sets flags correctly and never blocks campaign or menus.
- [ ] Players who complete Basic Training then start DEAD ORBIT use throttle, torso twist, targeting, group fire, and coolant flush unprompted (observed in ≥ 80% of test sessions).
- [ ] Zero narrative phrasing anywhere in `tut.bt.*` strings (lint + human review).
- [ ] VO passes the §8.11 audio QC gate; the confirm chime is correctly identified vs combat alarms in a blind test.
- [ ] No VO line contains a key or button name (rebind-safety audit of the §8.6 table and all translations).
- [ ] All `env_bt_*` assets pass the §9.5 QC gate; total added budget ≤ 90k triangles at LOD0.
- [ ] Provenance manifests exist for every generated audio file and 3D asset (prompts, seeds, model versions, task/request IDs, approvals).

# OUTPUT FORMAT REQUIRED FROM YOU

Deliver, in this order, as clearly headed sections:
1. The adapted step table (§4) with any `[ASSUMPTION]`s marked, including final prompt strings for every step in the source language.
2. `/content/tutorial/basic_training.json` — complete, schema-valid, all 20+ steps.
3. The localization key file for `tut.bt.*` (source language).
4. `TutorialDirector.ts`, the predicate evaluator, and `<TutorialPromptLayer/>` + `<BindGlyph/>` implementations with the input-action bus contract.
5. The final VO CSV (the §8.6 table with per-line seeds and `<break/>` marks), the PLS pronunciation dictionary, and the completed §8.7 batch script.
6. The four finalized sound-generation payloads from §8.9 (confirm chime, hint tick, phase flourish, ambience loop).
7. The Tripo payloads — one ready-to-POST task per manifest row B1–B6 — plus the §9.4 post-processing plan and §9.5 QC sign-off sheet.
8. The automated test suite from §10 and the filled acceptance checklist template.

Begin with the step table. Do not begin with a design essay.
