# MASTER PROMPT — Build the Multiplayer Suite for a MechWarrior 4: Vengeance–Style Mech Sim

> **How to use this file:** Fill in the `{VARIABLES}` block, then paste the entire document into your AI agent (Claude, an in-engine copilot) or hand it to the team as a spec. Everything from "ROLE" onward is the prompt itself. Companion to the *Tutorial Master Prompt* — shared conventions (line-ID format, voice cast, asset naming, QC gates) carry over.

---

## 0. VARIABLES — fill these in before pasting

```
{GAME_NAME}          = e.g. "Project Vengeance"
{GAME_ENGINE}        = Unity 6 / Unreal 5.x / custom (name it)
{NETCODE_STACK}      = e.g. Unreal replication + EOS, Unity NGO, Photon Fusion, custom rollback — name it
{BACKEND}            = matchmaking/lobby/relay provider: EOS, Steamworks, PlayFab, custom
{MAX_PLAYERS}        = target per match (recommend 16; hard ceiling you'll accept)
{PLATFORMS}          = PC etc.; state whether cross-play is required
{REGIONS}            = dedicated-server regions at launch
{VOICE_CHAT_STACK}   = Vivox / EOS Voice / none (player voice chat is NOT an ElevenLabs job)
{LANGUAGES}          = e.g. EN (source), FR, DE, ES, JA
{CONCEPT_ART_DIR}    = path/URLs to existing concept art (for Tripo image-to-model)
{VOICE_IDS}          = pinned ElevenLabs voice IDs from the tutorial build (BATCOM especially) or "design new"
{EXISTING_SYSTEMS}   = 1 paragraph: how damage/heat/MechLab/save data are structured today, and any networking already present
```

---

# ROLE

You are a senior multiplayer systems designer and network engineer embedded on a small team shipping **{GAME_NAME}**, a first-person BattleMech combat simulator in the spirit of *MechWarrior 4: Vengeance*. The single-player game is **feature-complete** — campaign, MechLab hardpoint customization, per-component damage with limb destruction, heat management, lancemate AI. The missing piece is **multiplayer**. Your job is to design and fully specify the complete PvP suite: modes, netcode architecture, lobby/loadout flow, the **announcer + pilot-comms VO package via the ElevenLabs API**, the **arena/objective 3D asset package via the Tripo3D API**, and the integration plan for **{GAME_ENGINE}** on **{NETCODE_STACK}**.

Do not redesign the combat sim. Network it, referee it, and dress the arenas.

# CONTEXT — what multiplayer must honor

- **Simulation combat is the product.** Slow, heavy 'Mechs (30–100 tons), decoupled torso/leg facing, mixed hitscan (lasers) and projectile (ballistics, missile volleys) weapons, heat as a resource, and **per-component damage** — arms, legs, torso sections, and internal components are individually destructible, and limb loss changes a 'Mech's capability mid-fight. All of this must survive networking intact; if the paper doll lies under latency, the game is broken.
- **MechLab is a competitive surface.** Hardpoint-legal custom loadouts are the metagame. The server must validate legality — a hacked loadout is a cheat.
- **The classic mode set is the blueprint.** Ship the six-mode suite the original game was known for (defined in §1.2), then modernize the plumbing around it.

# MISSION — your deliverables

1. **Multiplayer design document** — modes, rules, scoring, match flow, lobby, balancing levers (§1).
2. **Netcode & backend architecture plan** for {NETCODE_STACK} + {BACKEND} (§2).
3. **ElevenLabs production package** — announcer + pilot-comms cast, per-voice model/settings, full line list, ready-to-run payloads (§3).
4. **Tripo3D production package** — objective props + arena kit manifest with per-asset payloads and QC (§4).
5. **Engine integration plan** broken into tickets (§5).
6. **Phased delivery plan + QA/acceptance checklist** (§6–§7).

Before starting, ask **at most five** clarifying questions if any `{VARIABLE}` is ambiguous; otherwise proceed and mark assumptions `[ASSUMPTION]` inline.

---

## §1. MULTIPLAYER DESIGN SPECIFICATION

### 1.1 Match framework (applies to all modes)

- Player count: 2–{MAX_PLAYERS}; team modes are two-sided with auto-balance by tonnage, not headcount.
- Lobby → MechLab loadout confirm (server-validated) → drop → match → results/salvage screen → rematch vote.
- Respawns: wave respawn every 15 s at protected spawn gantries (spawn rooms damage-immune, exit-only), except single-life rounds where noted.
- **Tonnage is the balance currency.** Lobby host sets: per-player tonnage cap, per-team tonnage pool, weight-class limits, stock-'Mechs-only toggle, and mutators (heat ×1.5, no repairs, limited ammo ×2). Defaults must produce a fair pub match with zero host effort.
- Out-of-bounds: 10 s return timer, then shutdown + escalating damage. No kill volumes that eat flags/beacons — objective carriers who leave bounds drop the objective at the boundary.
- Overtime: any mode ending in a tie extends 2 minutes, sudden-death scoring.

### 1.2 The six launch modes

| Mode | Core rule | Scoring | Win | Key edge rules |
|---|---|---|---|---|
| **Deathmatch** | Free-for-all | Points for **damage dealt** (1 pt per 1% of a target's total structure) + 25-pt kill bonus + 15-pt "limb taken" bonus | Score target or timer | Damage-based scoring keeps light 'Mechs viable; self-damage scores nothing; kill-steal is impossible by design |
| **Team Deathmatch** | Two teams | Team sum of DM scoring | Score target or timer | Friendly fire toggle (default ON at 50% transfer — it's a sim) |
| **Capture the Flag** | Steal enemy flag, run it home | 1 capture point per delivered flag | First to N or timer | Carrier: jump jets disabled, +10% heat gen; dropped flag auto-returns after 30 s; your flag must be home to score |
| **King of the Hill** (solo & team variants) | Hold the marked zone | +1 pt/s while you (solo) or your team (team) solely occupy the hill | Score target | Contested hill scores no one; hill relocates every 3 min on large maps |
| **Escort (VIP)** | Each team designates one VIP 'Mech; destroy the enemy VIP | Round win per VIP kill | Best of 5 rounds | Single-life rounds; VIP gets +20% armor, visible to all on sensors; VIP self-destruct/disconnect = round loss |
| **Steal the Beacon** | One neutral beacon; carry it to score | Carrier gains +1 pt/s held | Score target | Carrier broadcast on all radar, torso-mounted glow; beacon drops on death, never resets to center unless it falls out of bounds |

### 1.3 Lobby, social, progression

- Server browser (filterable) **and** quickmatch playlists; private/custom lobbies with full rule control; map vote/veto between matches.
- Party of up to 4 stays together through matchmaking. Spectator slots (2) with free-cam and pilot-cam.
- Progression is **cosmetic + salvage-flavored only**: paint patterns, decals, pilot callsign titles. No pay/grind power. Loadout legality is identical for everyone.
- Player conduct: mute (text and {VOICE_CHAT_STACK} voice), block, report; vote-kick in unranked customs only; AFK detection returns idlers to lobby.
- Bots: Phase-3 backfill using the existing lancemate AI, clearly tagged, never in ranked.

## §2. NETCODE & BACKEND ARCHITECTURE (requirements, adapt to {NETCODE_STACK})

1. **Server-authoritative simulation** on dedicated servers in {REGIONS} ({BACKEND} for matchmaking, sessions, relays/NAT). Listen-server allowed for private customs only, with host-migration or graceful match end.
2. **Tick rate 30 Hz** (heavy, slow actors make this sufficient), client interpolation ~100 ms, client-side prediction for own movement/torso, server reconciliation.
3. **Torso twist replicates as its own aim state** (yaw/pitch quantized), separate from leg facing — both matter to observers for reading intent.
4. **Hitscan (lasers/PPC-class):** server-side lag compensation with hit rewind up to 200 ms; beyond that, favor the shooter visually but score server truth.
5. **Projectiles & missile volleys:** replicate **one spawn event + deterministic seed per volley**, simulate trajectories locally; never replicate per-missile state. An LRM-40 volley is 1 packet, not 40 actors.
6. **Per-component damage:** replicate component health as compact quantized arrays (per-'Mech bitpacked delta), limb-detach and component-destroyed as reliable events driving VFX/physics debris locally. The paper doll a player sees must match server state within one snapshot.
7. **Heat, coolant, shutdown, override are server-authoritative** (heat hacks are the obvious cheat vector); predicted locally for feel, corrected silently.
8. **Loadout validation:** on lobby ready-up the server re-derives loadout legality from base chassis + hardpoint rules + tonnage; illegal = rejected with reason. Never trust the client's MechLab output.
9. **Bandwidth budget:** ≤ 256 kbps down / ≤ 64 kbps up per client at {MAX_PLAYERS}; instrument and enforce in CI soak tests.
10. **Anti-cheat & trust:** server validation first (speed/heat/fire-rate sanity), {PLATFORMS}-appropriate client anti-cheat second; full server-side match log for report review.
11. **Resilience:** reconnect-to-match window (60 s), idle-kick, results submitted transactionally to {BACKEND} so disconnects can't void everyone's match.

## §3. VOICE-OVER PRODUCTION — ELEVENLABS (best-known-good configuration)

All multiplayer VO is **pre-baked offline** via `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` — never synthesized at runtime, and **never** speech from player-authored text or player names (latency, cost, and moderation risk; callsigns render as text only). Verify current model IDs against the live ElevenLabs docs before batch-generating.

### 3.1 Cast

| Role | Function | Voice source |
|---|---|---|
| **ANNOUNCER** — "GarrisonNet Control" | Match phases, objective events, countdowns, overtime, victory | New: Voice Design, authoritative military net controller |
| **BATCOM** | Personal status: heat, shutdown, component loss, "beacon acquired" | **Reuse the exact tutorial `voice_id` + settings** — cross-mode continuity is a feature |
| **PILOT PACKS ×6** | Ping-wheel comms & auto-barks for you, teammates, and Phase-3 bots | 6 distinct designed voices (mixed genders/accents); player picks a pack per profile |

Pin all `voice_id`s in `{VOICE_IDS}`; never regenerate an approved line with a different voice.

### 3.2 Model & settings matrix (A/B a 30 s sample per voice before batch)

| Parameter | ANNOUNCER (`eleven_v3`) | BATCOM (`eleven_multilingual_v2`) | PILOT PACKS (`eleven_multilingual_v2`) |
|---|---|---|---|
| Why this model | Expressive; audio tags (`[urgent]`, `[calm]`) sell match drama | Deterministic across dozens of short lines — reuse tutorial config verbatim | Barks need pack-internal consistency across ~35 short lines more than theatrics |
| `stability` | 0.50 | 0.90 | 0.60 |
| `similarity_boost` | 0.80 | 0.75 | 0.75 |
| `style` | 0.35 | 0.0 | 0.15 |
| `use_speaker_boost` | true | true | true |
| `speed` | — (unsupported in v3) | 0.95 | 1.0 |
| `seed` | fixed per batch | fixed | fixed per pack |

- Countdown/sequence lines ("Three. Two. One. **Engage.**") are generated as one stitched sequence using `previous_text`/`next_text` so prosody carries across the cut points.
- Pronunciation lexicon carries over from the tutorial package (*Gauss, PPC/LRM/ECM as letters, 'Mech = "meck"*); v3 gets inline IPA, v2 the pronunciation dictionary.

### 3.3 Line inventory (~420 lines total; write all of it)

- **ANNOUNCER (~90):** match start/end per mode, mode-explainer one-liner at drop, objective globals ("Enemy flag taken", "Beacon secured", "Hill contested", "VIP down"), score milestones, 60 s/10 s warnings, overtime, victory/defeat/draw stingers. ≤ 8 words per line; every scoring event in §1.2 must map to a line ID.
- **BATCOM (~40 new):** carrier states ("Beacon acquired", "Flag lost"), kill confirms, component/limb loss (reuse tutorial lines where identical), respawn count-in.
- **PILOT PACKS (6 × ~35):** ping wheel — enemy spotted, attacking/defending NAV A/B/C, need backup, fall back, affirmative/negative, thanks, apology; auto-barks — low armor, overheating, kill confirm, VIP escort calls. ≤ 6 words per bark; identical line list across packs so localization and triggers are 1:1.

**Trigger discipline (spec it):** global announcer bus with priority + 4 s per-category cooldown so simultaneous events queue rather than overlap; BATCOM always preempts announcer for the local player's safety callouts; pilot barks are 3D-positional from the speaking 'Mech.

### 3.4 Output, mastering, localization

- `output_format`: **`pcm_44100`** (WAV) if plan allows, else `mp3_44100_192` decoded once on import; normalize to −16 LUFS, −1 dB true peak.
- No baked FX: announcer gets "arena net" DSP (mild band-pass + compression), pilot packs get the tighter comms band-pass (~300–3400 Hz + squelch), BATCOM stays clean — all applied on engine buses so all {LANGUAGES} match.
- File naming: `vo_mp_{cat}_{line:03d}_{speaker}[_{packid}].wav`; subtitles and localization CSV key off the same IDs; regenerate per language with identical settings.

### 3.5 Reference payloads

```jsonc
// ANNOUNCER — Eleven v3
POST /v1/text-to-speech/{ANNOUNCER_VOICE_ID}
{
  "model_id": "eleven_v3",
  "text": "[urgent] Beacon secured. Hostile carrier on the move.",
  "voice_settings": { "stability": 0.5, "similarity_boost": 0.8, "style": 0.35, "use_speaker_boost": true },
  "seed": 52001,
  "output_format": "pcm_44100"
}
```

```jsonc
// PILOT PACK 03 — Multilingual v2 bark
POST /v1/text-to-speech/{PILOT03_VOICE_ID}
{
  "model_id": "eleven_multilingual_v2",
  "text": "Overheating — venting now!",
  "voice_settings": { "stability": 0.6, "similarity_boost": 0.75, "style": 0.15, "use_speaker_boost": true, "speed": 1.0 },
  "seed": 52103,
  "output_format": "pcm_44100"
}
```

## §4. 3D ASSET PRODUCTION — TRIPO3D (best-known-good configuration)

Arenas need **objective props, spawn/facility structures, and modular cover kits — not BattleMechs** (all 'Mechs come from the existing library; never text-prompt branded mech designs — bespoke signature pieces use image-to-model on `{CONCEPT_ART_DIR}`).

API: `POST https://api.tripo3d.ai/v2/openapi/task`. Default `model_version`: **`P1-20260311`** (Tripo P1.0 — production-grade, engine-ready topology) for iteration and props; rerun approved **hero/objective pieces** on the current high-precision tier (v3.1/H3.1-class). Pin `model_seed` per approved asset; iterate looks with `texture_seed`. Verify current version strings against the live Tripo docs before the batch.

### 4.1 Competitive-readability rule (governs every asset)

Players read fights at 100–800 m. Objective props must be identifiable by **silhouette + emissive color alone** at 500 m (flag = tall standard, beacon = carried case with core glow, hill = ground ring emitters). Cover kits must have **simple, honest collision** — no invisible lips that eat Gauss rounds, no silhouette noise. Team-agnostic geometry; team identity comes from emissive/texture tint only.

### 4.2 Asset manifest (naming `env_mp_*`)

| ID | Asset | Method | Faces | Special flags |
|---|---|---|---|---|
| M1 | CTF flag standard (pole + base; banner is an engine cloth plane, not generated) | image_to_model (hero) | 15k | emissive team-tint sockets |
| M2 | Beacon case (carryable objective) | image_to_model (hero) | 20k | `quad: true`; attach socket for torso mount |
| M3 | Hill control ring (4 emitter pylons + ground plate) | text_to_model | 10k total | emissive state: neutral/owned/contested |
| M4 | Spawn gantry / drop bay (exit-only structure) | image_to_model | 30k | interior navigable; `generate_parts: true` for doors |
| M5 | Repair/rearm pad (mutator facility) | text_to_model | 15k | animated-by-engine arms as separate parts |
| M6 | Modular cover kit — 8 pieces (walls, half-cover, bunker, arch) | text_to_model | 2–8k each | **one neutral geometry set**, see §4.3 |
| M7 | Crashed dropship set piece (map landmark) | image_to_model (hero) | 40k | `generate_parts: true` (hull/engine/wing debris) |
| M8 | Comm tower + holo scoreboard billboard | text_to_model | 8k + 5k | emissive screen surface for engine UI projection |
| M9 | Bridge segment (span kit ×2) | text_to_model | 10k each | collision-critical: flat, honest deck |

### 4.3 The biome-retexture trick (do this, don't triple the manifest)

Generate the M6 cover kit **once**, then produce **arctic / desert / urban texture variants via Tripo's texture task** on the same geometry (distinct `texture_seed` per biome, `texture_quality: "detailed"`, `pbr: true`). Identical silhouettes across all maps = competitive consistency; three looks for one geometry budget.

### 4.4 Parameter presets

```jsonc
// PRESET "OBJECTIVE HERO" — image-to-model from concept art
{
  "type": "image_to_model",
  "model_version": "P1-20260311",
  "file": { "type": "png", "file_token": "<upload via /v2/openapi/upload>" },
  "texture": true, "pbr": true,
  "texture_quality": "detailed",
  "texture_alignment": "original_image",
  "orientation": "align_image",
  "face_limit": 20000,
  "auto_size": true,
  "quad": true,
  "model_seed": 88002
}
```

```jsonc
// PRESET "COVER KIT" — text-to-model, neutral base for retexture variants
{
  "type": "text_to_model",
  "model_version": "P1-20260311",
  "prompt": "modular sci-fi military blast wall segment, angled deflection face, bolt seams, worn metal and concrete, hard-surface, game-ready, neutral grey",  // ≤255 chars
  "negative_prompt": "low quality, blurry, cartoon, text, watermark, ornate",
  "texture": true, "pbr": true,
  "texture_quality": "detailed",
  "face_limit": 6000,
  "auto_size": true,
  "compress": true,
  "model_seed": 88006
}
```

- LOD1/LOD2 via `smart_low_poly`/retopo passes (~40% / ~15% of base); export GLB (runtime) + FBX (DCC cleanup) via the `convert` task.
- Per-asset QC gate = tutorial gate (§3.4 of the companion prompt: watertight, ground pivot, budget, full PBR set, no baked lighting) **plus**: collision mesh ≤ 10% of render tris and hand-verified against Gauss/laser traces; objective silhouette test at 500 m; team-tint sockets confirmed.
- Per-map dressing budget: ≤ 600k triangles LOD0 total, ≤ 60 unique prop draws.

## §5. ENGINE INTEGRATION ({GAME_ENGINE} + {NETCODE_STACK})

1. **GameMode framework:** one match-flow state machine (lobby → warmup → live → overtime → results) with the six modes as data-driven rule sets (scoring hooks, objective actors, win checks) — adding mode #7 later must not touch netcode.
2. **Objective actors** (flag, beacon, hill, VIP marker) are server-owned, replicated with carrier attachment, drop physics, and out-of-bounds rules from §1.1.
3. **VO trigger service:** subscribes to match events, resolves to line IDs, enforces §3.3 priority/cooldown; BATCOM local, announcer global, barks positional.
4. **Scoreboard/HUD:** live per-component damage on targeted enemy (server truth), tonnage shown in lobby, mode objective widget per §1.2.
5. **MechLab-online path:** loadout serialization → server legality re-derivation (§2.8) → signed loadout blob for the match.
6. **Telemetry:** match results, mode/map pick rates, weapon damage share, TTK percentiles, quit timing — piped to {BACKEND} for the balance loop.

## §6. PHASED DELIVERY

- **Phase 1 (vertical slice):** TDM + DM, 2 maps, dedicated servers in 2 regions, loadout validation, announcer+BATCOM VO, spawn/cover assets. *Gate: 8-player soak, 60 min, zero desyncs.*
- **Phase 2 (the suite):** CTF, KotH, Escort, Beacon; 4–6 maps via biome retexture; pilot packs; server browser + parties + spectators.
- **Phase 3 (retention):** ranked playlist with tonnage-tiered MMR, bot backfill (lancemate AI), replays/kill-cam, seasonal cosmetic salvage.

## §7. ACCEPTANCE CRITERIA — definition of done (Phase 2)

- [ ] {MAX_PLAYERS}-player match holds tick 30 Hz with server frame p95 < 33 ms; client bandwidth within §2.9 budget.
- [ ] Hit-reg parity: at 150 ms simulated ping, ≥ 99% of hitscan hits on a moving target resolve identically client/server; missile volleys replicate as single events.
- [ ] Paper-doll fidelity: after a 10-minute soak with scripted combat, client component states match server bit-for-bit.
- [ ] Loadout security: 100% of a fuzzed corpus of illegal loadouts (wrong hardpoint class, tonnage overflow, ammo tampering) rejected server-side with reasons.
- [ ] Every §1.2 mode completes full match loop including every edge rule (dropped flag return, contested hill, VIP disconnect, beacon out-of-bounds) in automated tests.
- [ ] VO coverage: every scoring/objective event maps to a line; no overlapping announcer audio in a 100-event stress replay; all six pilot packs line-complete and level-matched; localization CSV parity across {LANGUAGES}.
- [ ] Assets: all pass §4 QC; objective props pass the 500 m silhouette test with 10/10 testers; no collision-vs-visual mismatch bugs open.
- [ ] Disconnect/reconnect inside 60 s restores the player to their 'Mech; match results always post to {BACKEND}.
- [ ] Conduct tools (mute/block/report/AFK-kick) functional; no runtime TTS anywhere; player names never synthesized.

# OUTPUT FORMAT REQUIRED FROM YOU

Deliver, in this order, as separate clearly-headed sections: (1) the adapted multiplayer design doc with full scoring math per mode; (2) the netcode architecture doc mapped to {NETCODE_STACK}/{BACKEND} with replication tables for 'Mech state and components; (3) the complete VO line list (~420 lines) with IDs, triggers, and per-voice settings plus a runnable ElevenLabs batch script; (4) the Tripo3D manifest with one ready-to-POST payload per asset and the biome-retexture task chain; (5) the {GAME_ENGINE} integration plan as ≤1-day tickets grouped by §6 phase; (6) the filled QA checklist template with test procedures for each §7 item. Mark every assumption about `{EXISTING_SYSTEMS}` as `[ASSUMPTION]` inline.
