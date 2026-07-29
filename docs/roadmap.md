# Veyra Prime — Production Roadmap

Working title "MechWarrior" (will be renamed before ship; internal codename **Veyra Prime**). Single-player browser mech simulator: TypeScript + Vite, Three.js (WebGL2 now, WebGPU scheduled), Rapier WASM physics, Web Audio, IndexedDB saves, all game data as JSON content files.

Companion documents: `docs/GDD.md` (design source of truth), `docs/audio-bible.md` (voice/SFX/music specs), `docs/tripo-prompt-library.md` (asset generation prompts). Content data lives in `content/` (`mechs.json`, `weapons.json`, `missions/`, `vo/`, `audio-manifest.json`, `audio-plan.json`).

---

## Milestone overview

| Milestone | Name | Theme | Ships when |
|---|---|---|---|
| **M0** | Vertical Slice | Prove the feel | One greybox Breaker Coast mission is genuinely fun and heavy |
| **M1** | Systems Complete | Prove the depth | Every game system exists and interlocks; content production can begin at full rate |
| **M2** | Content Complete | Prove the war | 7 ops / 24 missions, 12 mechs, full VO, adaptive music, both campaign branches playable start to finish |
| **M3** | Polish & Ultra | Prove the impression | Locked 60 fps on mid hardware, Ultra tier, accessibility, all 7 deep-impression gates pass |
| **Phase 2** | Post-ship | Multiplayer | After 1.0 only |

Dependency notation: **⟵ depends on** points at the task or milestone that must land first. Every milestone's exit criteria must be verified in a single build; partial credit across builds does not count.

---

## Master content ledger (counts referenced below)

| Category | Count | Source of truth |
|---|---|---|
| Operations / missions | 7 ops / 24 missions (**25 mission builds** — M21 ships as 21a Extraction and 21b Override) | `content/missions/` |
| Mech chassis | 12 (Flint, Pumice, Skarn, Chert, Halite, Gabbro, Basalt, Dolerite, Corundum, Orogen, Batholith, Craton) | `content/mechs.json` |
| Boss / named-pilot variants | 3 (Rauk's Corundum-V, Kryce's guard Batholith livery, Sol's Craton-X) + Directorate grey/amber livery set for all 12 | `content/mechs.json` |
| Animation clips per mech | 13 (idle sway, walk, run, turn-in-place, jump-jet launch, jump-jet land, per-arm fire recoil L/R, hit flinch L/R, leg-loss stumble, limp loop, shutdown slump, power-up rise, death collapse A/B) = **156 clips** across the roster | `docs/tripo-prompt-library.md` |
| Weapons + utility items | 19 (5 Energy: Blaze S/M/L, Pulse Array, Particle Lance · 5 Ballistic: Scattergun, AC-40/80/120, Gauss Driver · 4 Missile: Rocket Pod 8/16, Swarm Rack 10/20 · 5 Utility: ECM Veil, Beacon Tagger, Coolant Flush Pod, Sensor Mast, Smoke Discharger) | `content/weapons.json` |
| Vehicles / props (Tripo3D) | 21 assets: dropbarge, ore-crawler, hover skiff, tracked APC "Ferric", pop-up turret, relay pylon, cracking tower, polar train (engine + 2 car types), naval gun monitor, arcology kit (3 modules + skybridge), storm-drain kit (straight, curve, junction), beached hull carcass, cockpit interior hero prop | `docs/tripo-prompt-library.md` |
| Designed voices | 12–13 (CAIRN, Ekene, Relay, Sable, Tremor, Vireo, Kryce, Rauk, Sol + 3–4 generic ensemble) — all text-designed, never cloned | `docs/audio-bible.md` |
| Mission briefings | 24 × 60–90 s | `content/vo/` |
| Scripted trigger lines | ~40 per mission ≈ **960 lines** (+ branch-specific Op6/Op7 scenes, 2 full epilogues) | `content/vo/` |
| Shared systemic barks | ~120 (heat warnings, component loss, kill confirms, low ammo, fireteam status) | `content/vo/` |
| Takes per VO line | 3 (dry 48 kHz WAV, −16 LUFS, radio futz applied in-engine) | `docs/audio-bible.md` |
| SFX events | Footfalls 3 tonnage classes × 4 surfaces (salt, rock, metal deck, snow) = 12 · servo loop · collapse · 12+ weapon events · 6 damage/system events · 6 ambience/UI events — each mixed from 2–3 generated layers | `content/audio-plan.json` |
| Music | Main theme 2:30 · 5 biome ambient loops · 3 combat layers (112 BPM) · 6 stingers (mission complete, mission failed, Ekene down, duel start, 21a dawn hymn, 21b cold piano) — D minor, 96/112 BPM, 8/16-bar seamless loops | `docs/audio-bible.md` |
| Difficulty | 4 levels (Recruit / Regular / Veteran / Ironline) + 4 sim toggles (player limb-loss, ammo cook-off, friendly fire, HUD minimalism) | `docs/GDD.md` |
| Perf budget | 60 fps @1440p on RTX-3060-class · <1500 draw calls · <150 MB initial payload (ops streamed) · hero mech ≤120k tris LOD0 → 40k → 12k | `docs/GDD.md` |

---

## M0 — Vertical Slice

**Goal:** One greybox Breaker Coast mission (M1 "Cold Ignition" scope), player Skarn vs. enemy Gabbro, that already *feels* like a 35-ton machine: weight, heat discipline, zone damage, limb loss, and the CAIRN startup litany. If M0 isn't fun in greybox, no amount of M2 content saves it.

### Engineering
- [ ] Vite + TypeScript project shell, `/src/{engine,sim,ai,ui,audio,content}` layout enforced, JSON content loading path (`content/*.json`) with schema validation on load.
- [ ] Three.js **WebGL2** renderer bring-up: heightmap terrain chunk, directional sun + shadow, basic fog, chase cam + cockpit cam toggle. *(WebGPU is scheduled M3 — see Known slice deviations.)*
- [ ] Rapier WASM integration: mech capsule/compound colliders, terrain collider, ragdoll-free debris bodies for sheared limbs.
- [ ] Piloting model: W/S throttle with reverse past zero, A/D leg steer, mouse torso/arm aim independent of legs within per-chassis twist arc, C recenter, Space jump jets with regen fuel gauge. Accel/turn scaled by tonnage and leg damage.
- [ ] Weight feel pass: footfall camera shake scaled by tonnage, inertia on throttle changes, knockdown state.
- [ ] Heat system v1: per-weapon heat, heat-sink dissipation, biome multiplier hook (Breaker Coast = 1.0), redline auto-shutdown (helpless 4–6 s with power-down/up audio), hold-O override with internal damage/s + cook-off chance roll, F coolant flush pod (one per mission).
- [ ] Zone damage v1: 8 zones (head/CT/LT/RT/LA/RA/LL/RL) + internal structure, crit table (weapon destroyed, actuator, gyro sway, ammo cook-off chain, sensor fuzz), arm shear with hardpoint loss + physics debris + sparks, one-leg speed cap + limp, both-legs kill, side-torso takes attached arm, player eject on destruction.
- [ ] Weapon groups 1–6 + backslash chainfire; three representative weapons live (Blaze Laser M, Autocannon 40, Rocket Pod 8) with tracers, impact decals (non-persistent), hit resolution against zones.
- [ ] Enemy AI v1 (single Gabbro): patrol → investigate → engage → flank → retreat-to-repair skeleton; AI respects its own heat and telegraphs backing off to cool.
- [ ] HUD v1: paper-doll self+target, heat bar with redline, throttle ladder + twist indicator, weapon-group panel, objective ticker, reticle.
- [ ] Web Audio graph v1: SFX bus, VO bus, music bus, radio-futz chain (HP 250 Hz → LP 3.2 kHz → light waveshaper → 4:1 compression → squelch clicks) applied to fireteam/enemy, **never** to CAIRN.
- [ ] Mission script runner v1: trigger volumes, objective states, scripted VO triggers, mission complete/fail flow.

### Art (Tripo3D)
- [ ] **Greybox stand-ins only this milestone** (see Known slice deviations): procedural primitive mechs for Skarn and Gabbro with correct proportions, twist arcs, and hardpoint sockets so animation/sim code targets final skeletons.
- [ ] Skeleton + socket convention locked (shared biped rig spec: hips, knees incl. reverse-joint option, torso twist bone, per-arm mounts, head) — every later Tripo3D mech must bind to it.
- [ ] Tripo3D pipeline dry run on ONE asset (Skarn): 4 seeds → best silhouette → Blender retopo/UV → normal bake → PBR pass → auto-rig verify (knees, torso twist) → GLB + Draco export → loads in engine. Pipeline doc updated with actual timings.
- [ ] Breaker Coast greybox terrain: slipway, gantry, 3–4 beached hull blockouts, tide-line dressing.

### Audio (ElevenLabs)
- [ ] Voice designs created and locked for **CAIRN** and **Ekene** from the audio-bible text prompts (no cloning). Store voice IDs + settings in `content/audio-manifest.json`.
- [ ] CAIRN startup litany recorded verbatim, 3 takes: *"Core ignition confirmed. Actuator lattice — green. Weapon buses — live. Coolant loop pressurized. All boards answer ready. Good hunting, Lodestar."* Plays clean (no futz) at mission start with signature sound design.
- [ ] First-pass mission VO: M1 briefing draft + ~15 scripted trigger lines + 10 systemic barks (heat warning ×2, shutdown, component loss ×2, kill confirm ×2, low ammo, override warning, eject).
- [ ] First-pass SFX set (2–3 layers each): footstep ×1 tonnage ×2 surfaces (salt, metal deck), servo loop, laser beam, autocannon, rocket volley + impact, AP clang, internal crunch, overheat klaxon, shutdown turbine 5 s + restart, jump-jet loop, cockpit ambience 30 s, console click, warning chirp.
- [ ] Music placeholder: main-theme sketch + combat layer L1 loop, wired to threat state (ambient always on, L1 on engage), −6 dB duck under VO.

### Design / Content
- [ ] `content/mechs.json` entries for Skarn + Gabbro (final stat format: tonnage, speed, twist arc, hardpoints, armor/structure per zone, heat sinks).
- [ ] `content/weapons.json` final schema, 3 M0 weapons tuned.
- [ ] M1 "Cold Ignition" mission script: steal the mothballed Skarn from the impound gantry, first startup, destroy yard tracking mast; teaches movement / torso twist / weapon groups.
- [ ] Tuning targets written down: time-to-kill vs. Gabbro, heat cost of an alpha strike, shutdown frequency for a careless player.

### QA
- [ ] Playtest protocol drafted (think-aloud, no coaching); run with ≥5 fresh players.
- [ ] Bug triage flow + build smoke test (load, complete mission, save-less restart).
- [ ] Browser matrix v1: Chrome + Edge + Firefox on macOS/Windows, WebGL2 path.

### Dependencies
- Piloting model ⟵ Rapier integration. Heat/damage ⟵ weapon groups. AI v1 ⟵ zone damage (it must respond to being legged). Audio futz chain ⟵ Web Audio graph. Litany trigger ⟵ mission script runner. Tripo3D dry run ⟵ skeleton convention.

### Exit criteria (all in one build)
1. A fresh player completes greybox "Cold Ignition" in cockpit view with no verbal coaching.
2. Limb loss works both directions: enemy Gabbro can be legged (debris, stumble, limp, speed cap) and the player can lose an arm and keep fighting.
3. Redline shutdown occurs, plays the full power-down/up audio, and the player survives or dies by positioning — no scripting.
4. CAIRN litany plays verbatim and clean at mission start; internal playtest feedback confirms it lands as a signature moment.
5. 60 fps at 1440p on the RTX-3060-class reference machine in the slice scene.
6. Team go/no-go review: "does it feel heavy?" — unanimous yes required.

---

## M1 — Systems Complete

**Goal:** Every mechanic in the GDD exists, interlocks, and is stable enough that 24 missions can be built on top without engine churn. Content production (art, VO, missions) ramps in parallel from here.

### Engineering
- [ ] **bitECS migration** of sim entities (scheduled deviation from the class-based M0 slice — see Known slice deviations): components for chassis, zones, heat, weapons, sensors, AI state; system ordering documented; perf budget verified at 12+ simultaneous mechs.
- [ ] Sensors suite: radar ring + IFF, passive mode (P), thermal/low-light vision modes (V), R target cycle, T target-under-reticle, E subtarget cycle, lock-on diamond for swarm racks, lead reticle for ballistics, sensor fuzz crit effects.
- [ ] Utility items functional: ECM Veil, Beacon Tagger, Coolant Flush Pod, Sensor Mast, Smoke Discharger.
- [ ] Fireteam AI: 3 squadmates with command rose F1–F4 (Form Up / Attack My Target / Hold Position / Move To), role behaviors (sharpshooter, brawler, rookie), personality bark hooks, permadeath support for Ironline.
- [ ] Enemy AI complete: drones, tracked armor, hover skiffs, turrets, strafing aircraft, mechs in Directorate livery; full state machine (patrol → investigate → engage → flank → retreat-to-repair); heavies anchor while lights circle; heat-aware cooldown behavior.
- [ ] Salvage system: yield % by kill condition (legged/headshot best, ammo-explosion least), mission scrip bonuses, persistence into campaign save.
- [ ] Assembly Bay: fixed typed hardpoints (Energy/Ballistic/Missile/Utility, fixed sizes), armor tonnage slider per zone, heat-sink count, hard tonnage budget, loadout presets, field-repair look toggle.
- [ ] Campaign shell: op/mission select, persistent mech + salvage inventory, fireteam roster (with death acknowledged in later briefings), branch flag plumbing for M21a/M21b.
- [ ] Saves: IndexedDB campaign saves + mid-mission checkpoints (disabled on Ironline), save migration versioning.
- [ ] Difficulty: Recruit/Regular/Veteran/Ironline + all 4 sim toggles wired into sim, not just UI.
- [ ] Full input: rebinding UI, gamepad support, Tab tactical map, all GDD keys (W/S/A/D, mouse, C, Space, 1–6, backslash, O, F, R/T/E, V, P, F1–F4).
- [ ] Biome hooks: heat dissipation multipliers (arctic ×1.25, salt desert ×0.8, caverns ×1.0, storm rain ×1.15), footing penalty hook (polar), weather system API (rain, snow, lightning, heat shimmer — visuals may be placeholder until M3).
- [ ] Streaming: op-level asset bundles, <150 MB initial payload architecture proven with two ops' worth of data.
- [ ] Adaptive music engine: vertical layering (ambient always on, combat L1–L3 by threat state), stinger triggers, −6 dB VO ducking, exclusive scripted-cue mode for duel missions.

### Art (Tripo3D)
- [ ] Production run begins against the locked skeleton: **first 4 mechs final** (Skarn, Gabbro, Flint, Halite) — full pipeline per asset (4 seeds → retopo/UV → bakes → PBR with repainted wear → rig verify → 13-clip animation set → GLB + Draco).
- [ ] Tris/LOD budget enforced per mech: ≤120k LOD0 → 40k → 12k; KTX2/Basis textures.
- [ ] Directorate grey/amber livery variant system (material swap, not remodel) proven on Gabbro.
- [ ] Cockpit interior hero prop v1 (modeled interior, warning lamps bound to real sim states).
- [ ] 6 gameplay-blocking props final: pop-up turret, relay pylon, tracked APC "Ferric", hover skiff, ore-crawler, beached hull carcass.
- [ ] Environment kit pipeline proven: Breaker Coast terrain to final splat/texture quality as the reference biome.

### Audio (ElevenLabs)
- [ ] All remaining voice designs locked: Relay, Sable, Tremor, Vireo, Kryce, Rauk, Sol, + 3–4 generic ensemble (Vireo gets two settings: nervous early-campaign, steadier late-campaign).
- [ ] Full **~120 systemic bark library** written, generated (3 takes each), edited, and wired: heat warnings, component loss, kill confirms, low ammo, fireteam status, command-rose acknowledgments.
- [ ] Complete SFX library per `content/audio-plan.json`: all 12 footfall variants (3 tonnage × 4 surfaces), full weapon set (energy beam loop, 3-burst pulse, particle thunderclap, autocannon ×3 calibers, gauss charge whine + supersonic crack, rocket volley/flight/impacts), damage/system set (AP clang, internal crunch, cook-off, two-tone klaxon loop, 5 s shutdown + restart, jump-jet loop), ambience/UI set (cockpit 30 s, rain-on-canopy 30 s, distant war 60 s, console click, lock tone, warning chirp). 2–3 layers per event, mixed.
- [ ] Music: main theme final 2:30 (cello → war-drum 0:40 → brass 1:20 → anvil climax → cello), combat layers L1–L3 final, first 2 biome ambients (Breaker Coast, Halite Flats), stingers "complete" + "failed".
- [ ] Mix standard enforced: dialogue −16 LUFS, dry 48 kHz WAV masters, futz only in-engine.

### Design / Content
- [ ] `content/mechs.json` complete: all 12 chassis stats + Craton-X boss variant + 3 named-pilot variants.
- [ ] `content/weapons.json` complete: all 19 items tuned on paper + in test range.
- [ ] Ops 1–2 missions built to beta quality on final systems (M1–M7), including the teaching beats: M2 heat + subtargeting, M3 squad orders (Sable joins), M5 legged-kill/capture-intact tutorial, M6 Tremor joins.
- [ ] Mission-script authoring toolkit documented so Op3–7 production can parallelize in M2.
- [ ] Salvage economy tuning sheet (yield tables by kill condition × chassis class, scrip curve across 24 missions).

### QA
- [ ] Automated: content-JSON schema CI check, headless sim smoke (spawn 12 mechs, run 5 sim minutes, assert no NaN/leak), save/load round-trip test.
- [ ] Systems test matrix: every crit type, every limb-loss permutation, every difficulty × sim-toggle combination smoke-tested.
- [ ] Fireteam AI soak: 2-hour scripted battle without stuck states.
- [ ] Weekly playtest cadence starts (Ops 1–2 beta).

### Dependencies
- Fireteam + enemy AI at scale ⟵ bitECS migration. Assembly Bay ⟵ final `weapons.json`/`mechs.json` schemas. Salvage ⟵ kill-condition data from zone-damage system. Adaptive music engine ⟵ threat-state API from AI. Op1–2 beta missions ⟵ sensors, fireteam, salvage all landed. Bark wiring ⟵ bark library + futz chain. Livery system ⟵ first final mech materials.

### Exit criteria
1. Every GDD system is playable in one build: sensors/subtargeting, fireteam rose, salvage → Assembly Bay → next mission loop, saves, all 4 difficulties + sim toggles.
2. Ops 1–2 (M1–M7) playable end-to-end at beta quality with 4 final mechs and final systemic audio.
3. A designer can build a new mission from `content/missions/` data + script toolkit with zero engine changes.
4. bitECS sim holds 60 fps with 12 active mechs + drones on the reference machine.
5. Salvage/Assembly loop passes economy review: three viable Skarn loadouts, meaningful choice pressure on tonnage.
6. No P0/P1 bugs open against core systems.

---

## M2 — Content Complete

**Goal:** The whole war exists. 7 operations, 24 missions (25 builds), 12 mechs with full animation sets, complete VO, adaptive music, and both branch endings playable start to finish.

### Engineering
- [ ] Mission-count support hardened: streaming for all 7 op bundles, op transition flow, branch flag (M20 Registry choice) driving 21a/21b, Op7 variant scenes (Kryce arrested vs. dies fleeing), dual epilogues + dual final music.
- [ ] Set-piece tech: M9 flooded cavern (underground rendering + water), M13 glacier span collapse + Ekene capture sequence, M16/M24 **duel AI** (reads player loadout, range bands, terrain cover, scripted wound thresholds trigger VO exchanges), M17 three-target long-night dynamic reinforcements, M21a orbital-fire finale / M21b orbital-strike opener, M22 lightning storm + shield pylons, M24 comms-jam stormwall.
- [ ] Enemy vehicle roster complete in sim: drones, tracked armor, hover skiffs, turrets, strafing aircraft, naval gun monitor, command train (drivable-track logic), all mission-specific objective actors (crawler convoy, cable-cars, ferry, flare towers).
- [ ] Collateral rules for Op6 urban (Vell Arcology) + verticality navigation for AI.
- [ ] Knockdown/footing penalties live in polar biome; biome heat multipliers verified in all 7 ops.
- [ ] Full campaign persistence: fireteam death acknowledged in later briefings, mech loss/eject consequences, salvage carried across all 24 missions.

### Art (Tripo3D)
- [ ] **Remaining 8 mechs final** (Pumice, Chert, Basalt, Dolerite, Corundum, Orogen, Batholith, Craton) — full pipeline each; roster total 12.
- [ ] **156 animation clips delivered and integrated** (12 mechs × 13-clip set; L/R and A/B variants included per the set definition). Craton-X adds duel-specific additive layers for M24.
- [ ] 3 named-pilot variants final: Rauk's Corundum-V, Kryce's guard Batholith livery, Sol's Craton-X (glowing coolant lattice + prototype test markings).
- [ ] Directorate grey/amber livery across all 12 chassis.
- [ ] All 21 vehicle/prop assets final (dropbarge, ore-crawler, hover skiff, Ferric APC, turret, relay pylon, cracking tower, train engine + 2 cars, naval monitor, arcology 3 modules + skybridge, drain kit ×3, hull carcass, cockpit hero prop).
- [ ] 7 op environments final: Breaker Coast, Halite Flats, Karst Highlands (incl. cavern galleries), Polar Refineries, Storm Coast + Marrow Bay, Vell Arcology (kit-bashed from modules), Spire Anchor. 2–4 km² heightmap chunks, 4-layer splats, impostors.
- [ ] Weapon models/effects for all 19 items on all hardpoint sockets.

### Audio (ElevenLabs)
- [ ] **24 briefings** (60–90 s each) recorded, 3 takes, edited, integrated — including post-M13 tonal shift and branch-specific Op6/7 variants.
- [ ] **~960 scripted trigger lines** (~40 × 24 missions) recorded and wired, including: M13 Ekene-captured sequence, M16 Rauk duel exchanges, M24 Sol duel wound-threshold exchanges, Kryce propaganda broadcasts, M17 uprising night.
- [ ] Branch content: both M21 mission VO sets, both epilogue VO reads, Kryce arrest vs. death scenes.
- [ ] Vireo arc: early lines on "nervous" voice settings, late-campaign lines regenerated "steadier, confident".
- [ ] Startup litany verified present and identical at the top of **all 24 missions**.
- [ ] Music complete: all **5 biome ambient loops**, all **6 stingers** (complete, failed, Ekene-down solo cello lament 20 s, duel-start drum-hit-into-silence, 21a dawn hymn, 21b cold sparse piano), duel-mission exclusive scripted cues (M16, M24), branch-distinct final/credits music.
- [ ] Full-campaign mix pass v1: bus balance, ducking, futz consistency, loudness check.

### Design / Content
- [ ] All 24 missions (25 builds) implemented to content-complete: every design intent from the GDD one-liners realized (e.g., M5 capture-intact legging rules, M10 storm-from-below, M11 Rauk withdrawal, M14 train cripple, M15 ferry defense, M20 either/or Registry reveal).
- [ ] Difficulty tuning pass across the full campaign at Regular; Veteran/Ironline pass on Ops 1, 4, 7 minimum.
- [ ] Economy final: salvage yields, scrip bonuses, and Assembly Bay availability curve across the campaign (Corundum unlock as Ekene's old chassis, Craton late-game).
- [ ] M20 choice presentation designed for genuine hesitation (both stakes legible, no "correct answer" signaling).
- [ ] Subtitles with speaker tags authored for 100% of VO (accessibility integration lands M3, text is authored now).

### QA
- [ ] Full campaign playthroughs weekly: both branches, all difficulties on rotation.
- [ ] Content acceptance checklist per mission (objectives, VO triggers, music states, salvage payout, save points, litany).
- [ ] Duel AI test plan: 6 archetype loadouts (energy boat, brawler, missile boat, sniper, mixed, under-tonnage) vs. M16 and M24 — each must produce a competent, readable fight.
- [ ] Branch matrix: M20→21a→22→23(arrest)→24→dawn ending and M20→21b→22→23(death)→24→memorial ending both verified with correct VO/music/epilogue.
- [ ] Soak: 4-hour continuous campaign session without memory growth past budget.

### Dependencies
- All mission builds ⟵ M1 systems + script toolkit. Duel missions ⟵ duel AI ⟵ final Craton-X/Corundum-V assets for telegraph animation. Briefing recordings ⟵ locked mission scripts (record only after design lock — re-records are the schedule killer). Biome ambients ⟵ final environment identity per op. Branch QA ⟵ dual-epilogue engineering. 156-clip integration ⟵ all 12 rigs bound to the shared skeleton from M0.

### Exit criteria
1. Both campaign branches completable start (M1) to finish (M24 + epilogue) in a single build, saves intact throughout.
2. Content ledger verified at 100%: 12 mechs + variants, 156 clips, 19 weapons, 21 props, 24 briefings, ~960 scripted lines, ~120 barks, 5 ambients + 3 combat layers + 6 stingers, 25 mission builds.
3. No placeholder assets, temp VO, or greybox geometry anywhere in the shipping path.
4. M16 and M24 duels pass the 6-loadout QA plan.
5. Mission acceptance checklist signed for all 25 builds.
6. First full run of the deep-impression checklist (`docs/deep-impression-checklist.md`) executed — failures allowed at this gate but must have owned fix plans.

---

## M3 — Polish & Ultra

**Goal:** The game looks like the screenshots, runs like a metronome, and every deep-impression gate passes. Ship candidate at the end.

### Engineering
- [ ] **WebGPU renderer upgrade** (scheduled deviation from WebGL2-first slice): Three.js WebGPURenderer primary path, WebGL2 kept as tested fallback with automatic capability detection.
- [ ] Ultra tier: native 4K HDR ACES tonemapping, 4-cascade 4096 shadow maps, GTAO, TAA, bloom, volumetric fog + light shafts, GPU particles, decal persistence, heat-shimmer, wet-surface + rain response, snow shader, tracers that light terrain.
- [ ] Quality tiers finalized: Ultra / High / Medium / Potato with per-tier feature tables and auto-detect defaults.
- [ ] Performance lock: 60 fps @1440p on RTX-3060-class (Medium/High), <1500 draw calls in worst scenes (M15 rain naval battle, M17 night triple-target, M22 lightning storm), <150 MB initial payload re-verified after all content.
- [ ] Weather set-pieces final: monsoon rain (Op5), polar night + snow (Op4), lightning storm (M22/M24), salt-flat heat shimmer (Op2).
- [ ] Decal persistence (battle scars remain across a mission), debris lifetime tuning.
- [ ] Accessibility: full rebinding UI shipped, subtitles with speaker tags rendered, colorblind-safe IFF palette options, HUD minimalism toggle verified.
- [ ] Load-time and streaming polish; IndexedDB save robustness (quota, corruption recovery).
- [ ] Rename readiness: all "MechWarrior" working-title strings isolated behind one constant + one asset pass, so the final name drops in with a single change.

### Art (Tripo3D)
- [ ] Hero polish pass on all 12 mechs: wear repaint QC, edge chipping, emissive tuning (Craton-X lattice), LOD pop audit.
- [ ] Cockpit interior final: all warning lamps mapped to real sim states, screen-space readability at Potato tier.
- [ ] Biome art lock: each of the 7 ops reads unmistakably in a single screenshot (deep-impression gate DI-4 input).
- [ ] Marketing/Ultra screenshot scene dressing for each op.

### Audio (ElevenLabs)
- [ ] Final mix master pass: full-campaign loudness ride, stinger timing polish, duel-cue sync to wound thresholds.
- [ ] Litany presentation polish: signature sound design element at top of every mission tuned so M24 hits as hard as M1 (DI-1 input).
- [ ] Ambience QC: each biome identifiable from 1 second of audio (DI-4 input).
- [ ] VO pickup budget spent: replace the weakest ~5% of takes flagged by playtests.

### Design / Content
- [ ] Full-campaign balance final on all 4 difficulties; Ironline permadeath tuning (fireteam loss must sting, not soft-lock).
- [ ] Onboarding audit: confirm M24 duel requires **zero** tutorial text because M1–M23 taught everything (DI-6 input).
- [ ] Heat readability tuning: audio/visual escalation so new players self-regulate (DI-2 input).
- [ ] M20 choice final presentation review (DI-5 input).

### QA
- [ ] **Deep-impression checklist executed to full pass — all 7 gates, one RC build** (`docs/deep-impression-checklist.md`). This is the ship gate.
- [ ] Perf regression harness: automated replay flythroughs of the 3 worst scenes on the reference machine, run per build.
- [ ] Browser/device certification matrix final (Chrome, Edge, Firefox, Safari where WebGPU/WebGL2 allows; macOS/Windows; gamepad on each).
- [ ] Zero P0/P1 at RC; P2 burn-down to agreed ship list.
- [ ] Accessibility verification pass (rebinding conflicts, subtitle coverage 100%, colorblind IFF check with simulation tooling).

### Dependencies
- Ultra tier ⟵ WebGPU upgrade. Perf lock ⟵ content complete (M2) — no re-locking after new content. DI checklist full run ⟵ everything above. Rename drop ⟵ string isolation task.

### Exit criteria
1. All 7 deep-impression gates **pass in the same release-candidate build**, signed per the checklist doc.
2. 60 fps locked at 1440p on the RTX-3060-class reference across the 3 worst-case replay scenes; <1500 draw calls; <150 MB initial payload.
3. Ultra tier feature-complete and stable; Potato tier playable on integrated graphics.
4. Accessibility criteria met (rebinding, tagged subtitles, colorblind IFF).
5. Zero P0/P1; final name applied via the rename constant; 1.0 build tagged.

---

## Phase 2 (post-ship): Multiplayer

Explicitly out of scope for 1.0 — nothing in M0–M3 may block on it, but M1's bitECS migration and deterministic-leaning sim keep the door open.

- [ ] Feasibility spike: authoritative-server vs. lockstep for a heat/zone-damage sim; browser transport (WebTransport/WebRTC) evaluation.
- [ ] Netcode-ready sim audit: isolate nondeterminism (Rapier settings, random rolls, timers), define replicated component set from the bitECS schema.
- [ ] Mode design: 1v1 duels (reuses M16/M24 duel arenas) as the first mode; team skirmish later; Assembly Bay loadouts as the meta.
- [ ] Backend selection, matchmaking, progression/anti-cheat approach — decided only after 1.0 telemetry shows demand.
- [ ] No multiplayer marketing promises before the spike concludes.

---

## Known slice deviations

These are **scheduled engineering steps, not cut scope**. Each has a landing milestone and an owner-visible task above.

| Deviation in current build | Why it's correct for the slice | Scheduled resolution |
|---|---|---|
| **Procedural greybox mechs** instead of Tripo3D assets | Proves feel (weight, twist arcs, limb loss) against the locked skeleton/socket convention before spending the 4-seed → retopo → rig pipeline on 12 chassis; sim code binds to final skeletons from day one | Tripo3D production replaces greyboxes: first 4 mechs in **M1**, remaining 8 + variants in **M2** |
| **WebGL2-first rendering** | Widest browser reach for playtesting now; render abstraction written against Three.js so the WebGPURenderer swap is contained | **WebGPU upgrade in M3** (Ultra tier depends on it); WebGL2 remains the shipped fallback |
| **Class-based sim entities** | Fastest path to a fun slice; entity count in the slice (2 mechs) doesn't need ECS throughput | **bitECS migration in M1**, before fireteam + enemy AI push simultaneous-mech counts past what classes handle at 60 fps |

Rule: no new deviation may be added to this table without a scheduled resolution milestone attached in the same change.
