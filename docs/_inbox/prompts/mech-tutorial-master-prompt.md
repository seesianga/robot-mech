# MASTER PROMPT — Build the In-Game Tutorial for a MechWarrior 4: Vengeance–Style Mech Sim

> **How to use this file:** Fill in the `{VARIABLES}` block below, then paste the entire document into your AI agent (Claude, an in-engine copilot, or hand it to your team as a spec). Everything from "ROLE" onward is the prompt itself.

---

## 0. VARIABLES — fill these in before pasting

```
{GAME_NAME}          = e.g. "Project Vengeance"
{GAME_ENGINE}        = Unity 6 / Unreal 5.x / custom (name it)
{PLATFORMS}          = PC (KB+M, gamepad), etc.
{LANGUAGES}          = e.g. EN (source), FR, DE, ES, JA
{TRAINER_MECH}       = the light 'Mech the player pilots in the tutorial (e.g. a 35-ton scout with jump jets)
{CONCEPT_ART_DIR}    = path/URLs to your existing concept art (needed for Tripo image-to-model)
{ELEVENLABS_TIER}    = your plan (affects PCM output availability & concurrency)
{EXISTING_SYSTEMS}   = 1-paragraph note on how objectives, subtitles, save flags, and audio ducking already work in your build
{VOICE_IDS}          = existing ElevenLabs voice IDs if cast already; otherwise write "design new"
```

---

# ROLE

You are a senior game designer and technical audio/asset pipeline engineer embedded on a small team shipping **{GAME_NAME}**, a first-person BattleMech combat simulator in the spirit of *MechWarrior 4: Vengeance*. The game is **feature-complete and playable** — campaign, MechLab, lancemate AI, heat model, hardpoint-based customization, and multiplayer all work. The single missing piece is a **tutorial**. Your job is to design and fully specify one, including production-ready voice-over via the **ElevenLabs API** and production-ready 3D training-range assets via the **Tripo3D API**, plus the integration plan for **{GAME_ENGINE}**.

Do not redesign existing systems. Teach them.

# CONTEXT — what the game already contains

- Simulation-style 'Mech piloting: independent throttle (forward/reverse), leg steering, **torso twist** decoupled from leg facing, optional jump jets.
- Sensors: radar, target-nearest / target-under-reticle, target info panel with a **paper-doll damage readout** (limbs and components can be individually destroyed and blown off).
- Weapons: energy/ballistic/missile hardpoints, **fire groups**, chain-fire vs. group-fire toggle, per-weapon ammo.
- **Heat**: firing builds heat; overheating triggers automatic shutdown; the player can flush coolant and override shutdown at risk of internal damage.
- **Lancemates**: up to three AI squadmates that accept basic orders (attack my target, move to point, form up, hold).
- **MechLab**: hardpoint-based customization (specific weapon classes only fit matching hardpoints; ammo lives with the weapon), salvage acquired between missions.
- Campaign fiction: the player is **Ian Dresari**, heir of Kentares IV, who begins a guerrilla resistance campaign **from a staging base on the moon of Kentares IV** alongside commander **Elise Rathburn** and pilots Casey Nolan, Jen McQuarrie, and Jules Gonzales.

# MISSION — your deliverables

Produce all six of the following, in order:

1. **Tutorial design document** — the full stage-by-stage spec defined in §1 below, adapted to `{EXISTING_SYSTEMS}`.
2. **Complete VO script** — every line, in a table with stable line IDs (format in §2.6).
3. **ElevenLabs production package** — final voice casting, per-voice model + settings, and ready-to-run API payloads / batch script (§2).
4. **Tripo3D production package** — asset manifest with per-asset generation payloads, post-processing, and QC criteria (§3).
5. **Engine integration plan** for {GAME_ENGINE} (§4).
6. **QA + acceptance checklist** (§6).

Before starting, ask **at most five** clarifying questions if any `{VARIABLE}` is ambiguous; otherwise proceed with stated assumptions.

---

## §1. TUTORIAL DESIGN SPECIFICATION

### 1.1 Narrative framing (diegetic, lore-consistent)

The tutorial is **"Op 0: Moonlight Muster"** — a Resistance boot camp on the moon of Kentares IV, played immediately before the first campaign op. Ian Dresari, grieving and untested, is handed a salvaged **{TRAINER_MECH}** and drilled by **Commander Elise Rathburn** on a jury-rigged training range built from wreckage and mining equipment. This turns "the tutorial" into character establishment: Rathburn's drills foreshadow the guerrilla war, and the final stage doubles as Ian earning the Resistance's trust.

Two speaking roles are mandatory, one optional:

| Role | Function | Character |
|---|---|---|
| **INSTRUCTOR** | Teaches, corrects, escalates hints, reacts to success/failure | Cmdr. Elise Rathburn — mid-40s, dry, war-weary, warms up by graduation |
| **BATCOM** | Onboard battle computer; status callouts (heat, shutdown, target lock, limb loss) | Neutral, clipped, synthetic femme voice; must be *identical* every line |
| **RANGE TECH** *(optional)* | Color/banter, resets targets, comic relief | Casey Nolan — young, eager |

### 1.2 Design rules (non-negotiable)

- **One mechanic per beat.** Never introduce two systems in the same objective.
- **60–90 seconds per beat; 12–15 minutes total** for a first-time player.
- **Do → don't tell.** Every concept is taught by an action with a verifiable success condition, never by a text wall.
- **Hint escalation:** at +10 s of inactivity, a soft INSTRUCTOR voice nudge; at +25 s, an explicit on-screen prompt with the actual input glyph for the player's device; never punish.
- **No-fail early:** player 'Mech is invulnerable through Stage 5; drones don't return fire until Stage 6.
- **Skippable:** any stage individually (hold-to-skip) and the whole tutorial from the pause menu; skipping sets the same completion flag.
- **Replayable** from the main menu as "Training Range."
- **No soft-locks:** every stage has a timeout auto-advance and a "reset stage" option.
- **Reinforce, don't repeat:** the first campaign mission surfaces one-line contextual refreshers (BATCOM only) the first time each mechanic recurs.

### 1.3 Stage progression (adapt beats to the actual control map)

| # | Stage | Teaches | Success condition | Range setup |
|---|---|---|---|---|
| 0 | Cold Start | Framing cinematic; HUD orientation | (auto) | Cockpit power-up, Rathburn on comms |
| 1 | Legs | Throttle steps, full reverse, turning | Reach NAV ALPHA through a slalom of barricades | Barricade slalom |
| 2 | Torso | Torso twist vs. leg facing, center-torso command | Keep reticle on a moving drone for 5 s while walking a straight line | 1 hover drone on rail |
| 3 | Eyes | Radar, target-nearest, target-under-reticle, lock & info panel | Cycle and lock all 3 marked targets | 3 static hulks at spread bearings |
| 4 | Guns | Fire groups, chain vs. group fire, assigning weapons to groups, ammo readout | Destroy 4 pop-up silhouette targets using two different fire groups | Pop-up target row |
| 5 | Heat | Alpha strike to redline, coolant flush, shutdown override | Trigger heat warning, recover with flush, then survive one deliberate override | Firing line + coolant truck prop |
| 6 | Damage | Paper doll, component/limb destruction, why legs & torso matter | Blow the arm off a derelict tank/drone, then core it | Derelict destructible hulk |
| 7 | Sky *(conditional: only if {TRAINER_MECH} mounts jump jets)* | Jump jets, heat cost of jumping, terrain use | Jump a crevasse to NAV BRAVO | Crevasse + gantry |
| 8 | Lance | Lancemate orders: attack my target, form up, move to NAV, hold | Direct Nolan to destroy a target the player never fires on | Nolan joins in a second 'Mech |
| 9 | Graduation | Everything under pressure | Win a live-fire 1-v-1 duel vs. Rathburn (she yields at 40% armor) | Open arena |
| 10 | MechLab Gate | Hardpoint system: matching weapon class to hardpoint, ammo-with-weapon, armor tradeoffs | Mount one salvaged weapon onto a legal hardpoint and confirm loadout | Post-mission MechLab screen, guided |

Stage 10 is critical: hardpoint-restricted customization is the game's least-intuitive system for genre veterans, so it gets its own guided moment **before** Op 1, not a menu tooltip.

### 1.4 Telemetry

Emit events: `tutorial_start`, `stage_start/complete/skip {id}`, `hint_level {1|2}`, `tutorial_complete`, `duration_per_stage`. These drive the acceptance criteria in §6.

---

## §2. VOICE-OVER PRODUCTION — ELEVENLABS (best-known-good configuration)

All tutorial VO is **pre-baked offline** via the API (`POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`), never synthesized at runtime. Verify current model IDs and plan limits against the live ElevenLabs docs before batch-generating, as the lineup versions quickly.

### 2.1 Casting

- Use **Voice Design or a Professional Voice Clone** for INSTRUCTOR; pick/pin a library voice for BATCOM. Once cast, **pin the `voice_id`s in `{VOICE_IDS}` and never regenerate old lines with a new voice** — mid-project voice drift is the #1 VO pipeline failure.
- Audition each candidate voice against the same 3-line test script at the exact settings below; pairing of voice × model matters as much as the settings.

### 2.2 Model selection matrix

| Role | Model | Why |
|---|---|---|
| INSTRUCTOR | **`eleven_v3`** | Most expressive current model; supports inline **audio tags** (`[sighs]`, `[shouting]`, `[dry laugh]`) for drill-sergeant dynamics and the emotional turn at graduation. Note: v3 has **no `speed` parameter and no SSML `<break>`** — control pacing with punctuation, ellipses, and tags; keep each generation's text ≥250 characters where possible for stability. |
| BATCOM | **`eleven_multilingual_v2`** | The consistency workhorse. BATCOM must sound *identical* across 40+ short status lines; v2 at high stability is more deterministic than v3, supports `<break time="0.3s" />` for clipped cadence, and works with pronunciation dictionaries. |
| RANGE TECH | `eleven_v3` (share INSTRUCTOR settings) | Banter benefits from expressiveness. |
| (contingency) runtime/dynamic lines | `eleven_flash_v2_5` | Only if you later add dynamic callouts; ~75 ms latency. Do **not** use it for the shipped tutorial. |

### 2.3 Voice settings (starting values — A/B a 30-second sample before batch)

| Parameter | INSTRUCTOR (v3) | BATCOM (multilingual v2) | Notes |
|---|---|---|---|
| `stability` | **0.45** (v3 "Natural"; drop toward "Creative" ≈0.3 only for duel taunts) | **0.90** | Lower = wider emotional range but more variance between takes; 1.0 sounds dead. |
| `similarity_boost` | 0.80 | 0.75 | Push higher only if timbre drifts; too high causes artifacts. |
| `style` | 0.30 | **0.0** | >0.5 starts distorting; keep BATCOM at zero for machine flatness. |
| `use_speaker_boost` | true | true | Cheap clarity gain; leave on unless artifacts appear. |
| `speed` | — (unsupported in v3) | 0.95 | Slightly slow BATCOM for intelligibility over combat SFX. |
| `seed` | fixed per line batch | fixed | Reproducible retakes. |

Also pass **`previous_text` / `next_text`** on consecutive INSTRUCTOR lines within a stage so prosody flows across cuts.

### 2.4 Output & mastering

- `output_format`: **`pcm_44100`** (WAV) if `{ELEVENLABS_TIER}` allows; else `mp3_44100_192`, decoded once to WAV on import. Never re-compress twice.
- Loudness-normalize dialog stems to **−16 LUFS** (leave −1 dB true-peak headroom).
- **Do not bake radio FX into the files.** Apply the comms treatment in-engine (band-pass ~300–3400 Hz, light saturation, squelch tail) on the VO bus so every language and every retake gets the identical treatment, and BATCOM can stay clean/full-range by routing to a different bus.
- Route VO through a bus that **sidechain-ducks SFX/music by ~6 dB**.

### 2.5 Pronunciation (do this before batch generation)

- v3: inline **IPA with stress markers** for proper nouns; test per voice (IPA adherence is good but not 100% — regenerate outliers).
- v2 (BATCOM): a **pronunciation dictionary** applied at request time.
- Minimum lexicon: *Dresari, Kentares, Rathburn, Daishi* ("DYE-shee"), *Gauss* ("gowss"), *PPC / LRM / ECM* (spelled out as letters), *'Mech* (= "meck", never "mech-anism" elision).

### 2.6 Script & batch pipeline

1. Write the script as CSV: `line_id, stage, speaker, trigger, text_with_tags, ipa_notes`. Line ID format: `vo_t{stage:02d}_{line:03d}_{speaker}` (e.g. `vo_t05_020_batcom`). Subtitles and localization key off the same IDs.
2. Batch-generate with a small script (Python/Node) that reads the CSV, calls the API, writes `{line_id}.wav`, and logs `request_id` + settings per file.
3. Human QC listen pass; regenerate flagged lines with the same seed ± small stability nudges.
4. Keep total INSTRUCTOR wordcount under ~1,100 words; BATCOM lines ≤ 8 words each.

### 2.7 Reference payloads

```jsonc
// INSTRUCTOR — Eleven v3, expressive
POST /v1/text-to-speech/{INSTRUCTOR_VOICE_ID}
{
  "model_id": "eleven_v3",
  "text": "[dry] Throttle up, Dresari. This isn't a parade. ... Good. Now walk it back — full reverse. [beat] Your father made this look easy. Prove it runs in the family.",
  "voice_settings": { "stability": 0.45, "similarity_boost": 0.8, "style": 0.3, "use_speaker_boost": true },
  "seed": 41007,
  "previous_text": "Cockpit's live. Reactor online, sensors online, weapons online.",
  "output_format": "pcm_44100"
}
```

```jsonc
// BATCOM — Multilingual v2, deterministic
POST /v1/text-to-speech/{BATCOM_VOICE_ID}
{
  "model_id": "eleven_multilingual_v2",
  "text": "Heat critical. <break time=\"0.3s\" /> Shutdown imminent.",
  "voice_settings": { "stability": 0.9, "similarity_boost": 0.75, "style": 0.0, "use_speaker_boost": true, "speed": 0.95 },
  "seed": 41008,
  "output_format": "pcm_44100"
}
```

### 2.8 Script tone reference (write ~90–110 lines total in this register)

- `vo_t01_010_instr` — "Feet first, weapons later. Push the throttle to line three and thread those barricades. Scratch the paint and Nolan repaints it with your stipend."
- `vo_t02_010_instr` — "Torso and legs are two different animals. Legs walk the line — hips do the aiming. Twist onto that drone and *hold* it."
- `vo_t05_030_batcom` — "Coolant flush engaged."
- `vo_t09_040_instr` — "[quiet] Enough. You'll do, Dresari. ... Your father would've said the same. Now let's go take your planet back."

---

## §3. 3D ASSET PRODUCTION — TRIPO3D (best-known-good configuration)

The training range needs **props, targets, and destructibles — not BattleMechs.** All 'Mechs come from the game's existing library. Never text-prompt Tripo for branded/licensed mech designs; where a bespoke shape must match your art direction, use **image-to-model on your own concept art** from `{CONCEPT_ART_DIR}`.

API: `POST https://api.tripo3d.ai/v2/openapi/task` (task types `text_to_model`, `image_to_model`, `multiview_to_model`, plus texture/refine/rig/retarget/convert post-processing). Verify the current `model_version` strings against the live Tripo platform docs before running the batch.

### 3.1 Model-version strategy

- **Default / iteration:** `P1-20260311` (Tripo **P1.0**) — the production-grade native-3D model; clean, engine-ready topology, ideal for game props and fast validation loops.
- **Hero upgrade:** rerun keeper assets on the current high-precision line (**v3.1 / H3.1-class**) when silhouette fidelity matters (the graduation-arena gate, the holo-projector).
- Fix `model_seed` per asset so approved geometry is reproducible; iterate textures with `texture_seed`.

### 3.2 Asset manifest (generate exactly these; naming `env_tut_*`)

| ID | Asset | Method | Faces | Special flags |
|---|---|---|---|---|
| A1 | Hover target drone | image_to_model (your concept art) | 20k | `quad: true` (engine-animated: bob/strafe via transforms — no skeletal rig needed) |
| A2 | Pop-up silhouette target board ×2 variants | text_to_model | 4k | hinge base as separate part |
| A3 | Derelict tank hulk (destructible) | image_to_model | 25k | `generate_parts: true` → turret / hull / left track / right track separate meshes |
| A4 | Coolant truck (static prop) | text_to_model | 12k | — |
| A5 | Barricade + crate kit (4 pieces) | text_to_model | 3–5k each | `compress: true` |
| A6 | Holo-projector pedestal (objective beacon) | text_to_model | 8k | emissive areas called out in prompt |
| A7 | Gantry / comms mast | text_to_model | 6k | — |
| A8 | Graduation arena gate (hero) | image_to_model | 30k | hero pass on high-precision model |
| A9 | Lunar landing-pad set dressing (3 pcs) | text_to_model | ≤5k each | `texture_quality: "standard"` |

### 3.3 Parameter presets

```jsonc
// PRESET “HERO / INTERACTIVE” — image-to-model from your concept art
{
  "type": "image_to_model",
  "model_version": "P1-20260311",
  "file": { "type": "png", "file_token": "<upload via /v2/openapi/upload>" },
  "texture": true,
  "pbr": true,
  "texture_quality": "detailed",
  "texture_alignment": "original_image",
  "orientation": "align_image",
  "face_limit": 30000,
  "auto_size": true,
  "quad": true,
  "model_seed": 77001
}
```

```jsonc
// PRESET “PROP” — text-to-model
{
  "type": "text_to_model",
  "model_version": "P1-20260311",
  "prompt": "weathered military coolant tanker truck, sci-fi lunar base, olive-drab panels, hazard striping, hoses coiled on rear rack, hard-surface, game-ready",  // ≤255 chars, concrete nouns + materials + silhouette
  "negative_prompt": "low quality, blurry, cartoon, text, watermark",
  "texture": true,
  "pbr": true,
  "texture_quality": "detailed",
  "face_limit": 12000,
  "auto_size": true,
  "model_seed": 77004
}
```

- **LODs:** generate LOD1/LOD2 via `smart_low_poly` / retopo-convert passes (or your engine's reducer) at ~40% and ~15% of base faces.
- **Destructibles:** `generate_parts: true`, then verify each part has a sealed interior face and its own pivot.
- **Rigging:** only humanoid/creature assets go through Tripo's pre-rig-check → rig → retarget chain; nothing in this manifest needs it (drone A1 is transform-animated). Keep the pipeline documented anyway for future range-crew characters.
- **Export:** GLB for runtime, FBX for DCC cleanup, via the `convert` task. `auto_size: true` gives real-world scale — still verify against your 1-unit standard on import.

### 3.4 Per-asset QC gate (reject/regenerate if any fail)

1. Watertight where required; no floating shells or interior junk geometry.
2. Pivot at ground contact, +Z/+Y forward per {GAME_ENGINE} convention.
3. Within face budget after LOD0 import.
4. PBR set complete (albedo / normal / roughness-metallic), no baked lighting or shadows in albedo.
5. Reads correctly at gameplay camera distance (50–300 m) — silhouette first, detail second.
6. Consistent with `{CONCEPT_ART_DIR}` palette (lunar regolith greys, Resistance olive/rust accents).

---

## §4. ENGINE INTEGRATION ({GAME_ENGINE})

1. **ObjectiveManager**: a simple state machine — one state per stage, with `enter / success-check / hint-timer / timeout / exit`; data-driven from a stage table so designers can reorder without code.
2. **VO trigger table** keyed to `line_id`s; a line can be bound to state-enter, success, hint-1, hint-2, or gameplay events (heat ≥90%, limb destroyed, lock acquired). Enforce a per-speaker interrupt priority (BATCOM safety callouts > INSTRUCTOR teaching > TECH banter).
3. **Subtitles** read from the same localization CSV; speaker-colored; always on during tutorial regardless of global setting (user can disable).
4. **Input glyphs** resolve per active device (KB+M vs. gamepad) in all prompt text.
5. **Completion** writes `tutorial_complete` to the save profile; campaign menu shows Op 0 as recommended-but-optional; first campaign mission checks the flag to enable BATCOM refreshers.
6. **Audio**: VO bus with sidechain ducking (§2.4); radio DSP on INSTRUCTOR/TECH only.

## §5. ACCESSIBILITY & LOCALIZATION

- All teaching survives with VO muted (subtitles + glyph prompts carry full information).
- Hold-to-skip and stage-reset are always available; no timed failure states before Stage 9.
- Colorblind-safe target markers; heat conveyed by bar + BATCOM callout + controller rumble, never color alone.
- Line-ID-keyed CSV localizes to `{LANGUAGES}`; regenerate non-English VO with the same multilingual models and identical settings; re-check pronunciation lexicon per language.

## §6. ACCEPTANCE CRITERIA — definition of done

- [ ] A first-time playtester finishes in **12–15 minutes**; no single stage median exceeds 2 minutes (telemetry §1.4).
- [ ] ≥90% of playtesters clear every stage without reaching hint level 2.
- [ ] Every mechanic used in campaign Op 1 is taught in Op 0 (traceability table required).
- [ ] Stage 10 measurably works: ≥80% of testers complete a legal MechLab hardpoint swap unaided afterward.
- [ ] VO: consistent timbre across all lines per speaker; intelligible over combat SFX; zero mispronounced lexicon words; subtitles match audio 1:1.
- [ ] Assets: all pass the §3.4 QC gate; total tutorial-range asset budget ≤ 350k triangles at LOD0.
- [ ] Skipping at any point never blocks campaign progress; replay from main menu works.
- [ ] No soft-locks: every stage timeout-advances; "reset stage" restores a valid state.

# OUTPUT FORMAT REQUIRED FROM YOU

Deliver, in this order, as separate clearly-headed sections: (1) the adapted stage-by-stage design doc; (2) the complete VO script table (~90–110 lines) with line IDs, triggers, and v3 audio tags; (3) the ElevenLabs batch plan — final settings per voice plus a runnable generation script; (4) the Tripo3D manifest with one ready-to-POST payload per asset; (5) the {GAME_ENGINE} integration task list broken into ≤1-day tickets; (6) the filled QA checklist template. Where you make an assumption about `{EXISTING_SYSTEMS}`, mark it `[ASSUMPTION]` inline.
