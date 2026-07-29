# Veyra Prime — Audio Bible

Complete audio production handbook for the Veyra Prime campaign (working title "MechWarrior", to be renamed pre-ship; 100% original IP). This document is the human-readable source of truth for voice design, VO scope, SFX generation prompts, and the adaptive music system. The machine-readable production plan lives in `content/audio-plan.json` — asset IDs in this document match that file exactly, and the JSON is canonical for build tooling.

---

## 1. Ground Rules

These rules apply to every audio asset in the project. No exceptions without a line in this document.

1. **Voice-from-description only.** Every voice is designed from a text description (ElevenLabs voice design). We never clone a real person's voice, and we never use a voice derived from any recording of a real individual. The design prompts in Section 2 are the complete and only source for each cast member.
2. **Dry masters, 48 kHz.** All VO is generated and archived dry: 48 kHz / 24-bit WAV, mono, no reverb, no EQ, no radio coloration baked in. Radio futz, room, and distance are applied in-engine (Section 3) so one recording serves every playback context.
3. **Dialogue loudness: −16 LUFS.** Every dialogue master is normalized to −16 LUFS integrated, −1 dBTP ceiling, before delivery. Systemic barks are additionally peak-matched within their category so round-robin variants don't jump in level.
4. **Three takes per line.** Every VO line is generated three times with intentional delivery variation. The best take ships; the other two are archived for round-robin use on systemic barks and as backups. Barks ship all usable takes as round-robin variants.
5. **Delivery format.** Shipping files are MP3 CBR 192 kbps, 44.1 kHz, laid out under `public/audio/{vo,sfx,music}/<id>.mp3`. WAV masters are archived outside the web build.
6. **Naming.** File basename = asset `id` from `content/audio-plan.json`. Round-robin variants append `_v2`, `_v3` (variant 1 has no suffix). Long music cues generated in segments are stitched before delivery — the game never sees segments.
7. **CAIRN is never futzed.** The onboard AI speaks on the cockpit's internal bus: clean, close, intimate. Everything arriving by radio is futzed (Section 3). Cinematics and epilogues are clean.
8. **Subtitles.** Every VO line ships with a subtitle string and speaker tag in the mission/bark content files (accessibility requirement, milestone M3).
9. **Music loudness.** Music beds sit at −21 LUFS integrated in the mix; stingers at −16. Music ducks −6 dB under any VO (Section 6.6).
10. **SFX layering.** Every significant game event is built from 2–3 layered generated elements (e.g., footstep = sub thump + hydraulic hiss + surface detail). Prompts in Section 5 describe the composite target; layer splits are at the sound designer's discretion.

---

## 2. Cast and Voice Design Prompts

Thirteen designed voices: nine named characters plus four ensemble voices. `futz` = default in-engine radio treatment (Section 3).

| Voice ID | Character | Futz | Notes |
|---|---|---|---|
| `cairn` | CAIRN (onboard AI) | no | Clean cockpit bus, never radio-filtered |
| `ekene` | Cmdr. Mara Ekene "Anchor" | yes | Clean in cinematics/epilogue |
| `relay` | Dae-jun Im "Relay" | yes | Primary briefing voice after M13 |
| `sable` | Riva Chen "Sable" | yes | Fireteam |
| `tremor` | Dozie Okafor "Tremor" | yes | Fireteam |
| `vireo` | Anja Kessler "Vireo" | yes | Two delivery stages (see below) |
| `kryce` | Director Halden Kryce | yes | Broadcast-PA futz variant |
| `rauk` | Col. Vesna Rauk | yes | Enemy comms |
| `sol` | Marshal Edrik Sol | yes | M24 duel link |
| `ens_compact_male` | Compact ensemble (male) | yes | Troops, dock workers, ferry crew |
| `ens_compact_female` | Compact ensemble (female) | yes | Troops, engineers, cell leaders |
| `ens_directorate_officer` | Directorate ensemble | yes | Enemy chatter, checkpoint PA |
| `ens_civilian_female` | Civilian ensemble | yes | Marrow Bay evacuees, arcology civilians |

### 2.1 Design prompts (verbatim, for voice generation)

- **CAIRN** — "calm, measured, softly synthetic androgynous voice, mid-low pitch, perfectly even pacing, faint digital smoothness, zero emotion but strangely reassuring". Direction: never rushes, never rises in pitch, even under redline and ejection. High stability, minimal style variation.
- **Ekene** — "woman in her 50s, low gravelly voice with warm weight of authority, unhurried, faint parade-ground clip on commands". Direction: briefings are warm and deliberate; combat commands get the clip; the epilogue (21a) is her softest register.
- **Relay** — "man early 20s, crisp bright tenor, fast talker, dry wit, slight vocal smile even in danger". Direction: the smile thins after M13 but never fully disappears; briefings M14+ carry a forced steadiness.
- **Sable** — "woman 30s, quiet flat calm, almost a whisper on comms, precise consonants". Direction: no exclamation points, ever. Kill confirms delivered like weather reports.
- **Tremor** — "man 40s, booming bass, big easy laugh, rounds every sentence off warmly". Direction: the loudest thing on the net; protective anger only when a teammate is hit.
- **Vireo** — "woman early 20s, light voice with audible nerves early on". Two delivery stages from one designed voice: **early campaign** (Ops 3–4) audible nerves, breath before lines, small pitch cracks; **late campaign** (Op 5 onward) "steadier, confident" — same voice, controlled breathing, ends of sentences held. The 21b epilogue is her steadiest read of the entire game.
- **Kryce** — "older man, soft patrician baritone, unhurried, faint amusement, corporate-broadcast polish". Direction: never threatens; regrets, offers, condescends. His broadcast lines run through the PA futz variant, not the squad futz.
- **Rauk** — "woman 40s, clipped icy alto, open contempt, military brevity". Direction: contempt is cold, not hot. Her longest line in the game is under ten seconds.
- **Sol** — "man 60s, tired dignified baritone, regret under iron resolve". Direction: every duel line sounds like it costs him something. No anger anywhere in his read.
- **ens_compact_male** — "man 30s, rough working-class voice, honest and direct, slight wind-worn rasp, speaks like someone used to shouting over machinery".
- **ens_compact_female** — "woman 40s, steady practical alto, calm under pressure, the voice of someone who has run a crew for years".
- **ens_directorate_officer** — "man 30s, flat corporate-military voice, procedural and clipped, faint boredom curdling into alarm under fire".
- **ens_civilian_female** — "woman 20s to 30s, ordinary warm voice, frightened but holding it together, relief breaking through when rescued".

---

## 3. In-Engine Radio Futz Chain (Web Audio)

One shared futz bus; per-source send. CAIRN and cinematic/epilogue VO bypass it entirely.

Signal chain, in order:

1. **High-pass** — `BiquadFilterNode`, type `highpass`, 250 Hz, Q 0.71.
2. **Low-pass** — `BiquadFilterNode`, type `lowpass`, 3.2 kHz, Q 0.71.
3. **Light waveshaper** — `WaveShaperNode`, gentle tanh saturation curve (drive k ≈ 3), `oversample: '2x'`. Target: audible grit on consonants, no fizz on sustained vowels.
4. **Compression** — `DynamicsCompressorNode`, ratio 4:1, threshold −24 dB, knee 6 dB, attack 3 ms, release 100 ms.
5. **Squelch clicks** — 150–200 ms static click sample (`ui_squelch`, variants: open/close) played at transmission start and end, −20 dBFS relative to dialogue.
6. **Channel bed (optional, Ultra mix)** — narrowband noise floor at −45 dBFS while a channel is keyed open; muted otherwise.

**Variants:**
- **Squad/enemy futz** — the chain above, as specified.
- **Kryce broadcast/PA futz** — same chain, low-pass raised to 5 kHz, plus a 120 ms slap-echo send at −18 dB to read as city-wide public address. Used for propaganda broadcasts (M11, Op 6) and his Op 7 lines.
- **Degraded link** — for the M24 stormwall and jammed moments: squad futz plus periodic 80–150 ms dropouts (gain gate driven by a random LFO) and +6 dB on the waveshaper drive.

Priority ducking on the futz bus: only one radio speaker at a time; a higher-priority line (Ekene > Relay > fireteam > ensemble) sidechains the current speaker −9 dB and queues or drops the interrupted bark per its `interruptible` flag in the bark content file.

---

## 4. VO Content Plan

### 4.1 Startup litany (every mission)

CAIRN, clean bus, verbatim, plays over the startup sequence at the top of all 24 missions. Never re-worded, never trimmed. Asset `litany`.

> "Core ignition confirmed. Actuator lattice — green. Weapon buses — live. Coolant loop pressurized. All boards answer ready. Good hunting, Lodestar."

Read direction: identical delivery every time — the ritual is the point. Generate once, ship one take. The deep-impression checklist requires this line to land as hard on M24 as on M1; the *mix* changes (M24 layers it over the duel-start silence), the read never does.

### 4.2 Mission briefings — 24 slots (25 files with the branch)

60–90 seconds each, single speaker, clean-recorded then futzed contextually (briefing screen plays them clean with light room tone; in-cockpit replays are futzed). Scripts live in the mission content files; this table defines speaker, beat, and audio notes. Ekene briefs M1–M13; after her capture in M13, Relay carries every remaining briefing — his voice holding her chair is a deliberate wound in the soundtrack of the back half.

| ID | Mission | Speaker | Briefing beat | Audio notes |
|---|---|---|---|---|
| `briefing_m01` | M1 Cold Ignition | Ekene | Steal the mothballed Skarn from the impound gantry; kill the yard tracking mast | Warmest read of the campaign; first meeting |
| `briefing_m02` | M2 Tide Tables | Ekene | Ambush the patrol in the hull carcasses at low tide; take everything they drop | Introduces salvage doctrine |
| `briefing_m03` | M3 Loud Exit | Ekene | Hold the slipway until the dropbarge is away; two gun skiffs inbound | Introduces Sable; pace quickens |
| `briefing_m04` | M4 White Static | Ekene | Blind the salt-flat sensor grid: three relay pylons | Long-sightline tactics talk |
| `briefing_m05` | M5 Dust Convoy | Ekene | Take the fuel crawlers intact — leg them, do not burn them | "Intact" repeated three times, deliberately |
| `briefing_m06` | M6 Mirage Line | Ekene | Pull the pinned cell out; expect a long-range duel through shimmer | Introduces Tremor |
| `briefing_m07` | M7 The Weigh Station | Ekene | Seize the ore-weigh complex; hold through two counter-waves | First "hold" briefing; grimmer |
| `briefing_m08` | M8 Sounding | Ekene | Passive sensors only; paint the AA nests in the dolines | Introduces Vireo; quiet, careful read |
| `briefing_m09` | M9 Undertow | Ekene | Flooded cavern gallery; demolish the hidden fuel bunker | Mentions the dark and the water; rare unease |
| `briefing_m10` | M10 Ropeway | Ekene | Cut the cable-cars, then storm the clifftop garrison from below | Tactical relish |
| `briefing_m11` | M11 Kryce's Voice | Ekene | Silence the broadcast citadel; expect Rauk | Personal edge — she hates the propaganda most |
| `briefing_m12` | M12 Flare Stack | Ekene | Night raid; hide in the flare-tower thermal blooms; kill the cracking units | Conspirational, almost fond |
| `briefing_m13` | M13 Icebound | Ekene | Cover the engineers across the glacier under artillery | Her last briefing. Nothing in the read foreshadows it |
| `briefing_m14` | M14 The Mag-Line | Relay | Rauk's polar command train; cripple polar logistics | His first briefing; audibly not okay, doing it anyway |
| `briefing_m15` | M15 Breakwater | Relay | Defend the ferry evacuation at Marrow Bay | Finds his feet; the dry wit resurfaces once |
| `briefing_m16` | M16 Rauk's Wager | Relay | Rauk calls single combat; it smells like a stall — win fast | Warns about the demolition teams |
| `briefing_m17` | M17 Signal Fires | Relay | The uprising is tonight: fuel farm, drone hangar, checkpoint chain | Fastest, brightest briefing in the game |
| `briefing_m18` | M18 Understreets | Relay | In through the storm drains; secure the forward garage | Hushed, echo-conscious read |
| `briefing_m19` | M19 Counterweight | Relay | Crack the checkpoint fortresses; open the western districts | Methodical; collateral rules stated plainly |
| `briefing_m20` | M20 The Registry | Relay | Seize the data-registry | Ends mid-thought — the reveal happens in-mission |
| `briefing_m21a` | M21a Extraction | Relay | Spire Anchor holding decks; we get her back; the orbital guns stay theirs | He does not pretend it's the smart choice |
| `briefing_m21b` | M21b Override | Relay | Gunnery college; take the override; she's already off-world | Flat, careful, grief held offscreen |
| `briefing_m22` | M22 Blackout | Relay | Kill the anchor shield pylons in the lightning storm | 21a build adds Ekene trigger lines in-mission |
| `briefing_m23` | M23 The Long Climb | Relay | Up the terraces; kill the tether grid and Kryce's escape climber | Branch-variant closing sentence in mission files |
| `briefing_m24` | M24 Reclamation | Relay | Comms will die at the stormwall. Whatever walks out — finish it | Shortest briefing; ends on the litany hand-off |

### 4.3 Per-mission scripted trigger lines (~40 per mission, ~980 total)

Scripts live in each mission's content file (`content/missions/mNN.json`, `vo[]` array) with trigger IDs, speaker, futz flag, priority, and subtitle text. Standard budget per mission:

| Beat | Lines | Notes |
|---|---|---|
| Approach / infiltration | 4–6 | Relay intel, fireteam banter, CAIRN nav notes |
| Objective phases | 18–22 | Per-objective start/progress/complete; the mission's spine |
| Combat events | 6–8 | Wave arrivals, named-enemy appearances, reinforcement warnings |
| Success chain | 3–4 | Objective-complete → extraction → mission-complete sting hand-off |
| Failure lines | 3–4 | Per fail-state (objective destroyed, protectee lost, player down) |
| Optional / exploration | 2–3 | Salvage finds, off-route landmarks, biome color |

Worked example — M1 Cold Ignition (40 lines): 5 approach (Relay talks Lodestar through the impound fence, CAIRN cold-boot chatter before the litany), 21 objective (gantry release ×6, first-steps tutorial ×8 — throttle, twist, weapon groups, recenter — tracking mast ×7), 7 combat (yard security waves, first enemy mech contact), 4 success (mast down → Ekene's "Now you're one of us" → extraction), 3 failure (Skarn destroyed, mast timer expired, detected early). Duel missions (M16, M24) trade the objective budget for scripted duel exchanges at wound thresholds (Section 4.5).

Fireteam availability gates lines by roster: Sable from M3, Tremor from M6, Vireo from M8. On Ironline, a dead teammate's mission lines are skipped and later briefings acknowledge the loss (one alternate sentence per briefing from M9 onward, held in the mission files).

### 4.4 Systemic barks — 120 shared lines

Context-triggered, mission-agnostic, round-robin across surviving takes. Text lives in `content/barks.json`; the budget below is binding. Total: **120**.

| Group | Count | Contents |
|---|---|---|
| CAIRN canonical systems | 10 | The ten lines below, verbatim, mirrored in `content/audio-plan.json` |
| CAIRN secondary systems | 12 | heat nominal again; override sustained warning; sensor damage; gyro damage; ammo depleted; eject advisory; salvage tagged; objective updated; target destroyed; new hostiles on sensors; jump-jet fuel low; stability warning (knockdown imminent) |
| Sable | 16 | 4 order acks (form up / attack / hold / move), 2 enemy spotted, 2 kill confirms, 2 taking damage, 1 component lost, 1 low ammo, 1 overheating, 1 down/critical, 2 banter |
| Tremor | 16 | same 16-slot template |
| Vireo | 16 | same template; record early-nervous and late-steady takes, engine picks by campaign progress |
| Ekene command net | 10 | praise, redirect, hold the line, casualty response, extraction call, disappointment, urgency ×2, calm-under-fire ×2 (used M1–M13, and M22–M24 on the 21a branch) |
| Relay intel net | 14 | contact reports ×3, reinforcement warning ×2, objective ping ×2, pickup/extraction ×2, jamming/comms status ×2, weather/biome hazard ×3 |
| Directorate ensemble | 14 | spotted the target, requesting support, falling back, mech down panic, checkpoint PA ×2, drone-control chatter ×2, morale collapse ×3, Rauk-era discipline ×3 |
| Compact ensemble / civilians | 12 | thanks/relief ×3, evacuation calls ×3, uprising cheers ×3, wounded ×2, ferry crew ×1 |

**CAIRN canonical ten (verbatim, clean bus, one even read each):**

1. `cairn_heat_high` — "Heat approaching redline."
2. `cairn_heat_critical` — "Redline. Shutdown imminent."
3. `cairn_shutdown` — "Emergency shutdown engaged. Restart cycle initiated."
4. `cairn_restart` — "Restart complete. All boards answer ready."
5. `cairn_override` — "Override accepted. Structural damage accruing."
6. `cairn_coolant_flush` — "Coolant flush deployed. Core temperature falling."
7. `cairn_armor_breach` — "Armor breach. Internal structure exposed."
8. `cairn_weapon_lost` — "Weapon system destroyed."
9. `cairn_leg_damage` — "Leg actuator compromised. Locomotion capped."
10. `cairn_ammo_low` — "Munition reserves below twenty percent."

Bark playback rules: cooldown 8 s per line, 3 s per group; priority CAIRN systems > order acks > damage > kill confirms > banter; banter suppressed while any hostile is within 400 m of a fireteam member; heat and shutdown lines are never suppressed.

### 4.5 Branch-specific scenes (Op 6 / Op 7)

Scripts in mission files; scope defined here.

- **M20 — The Registry reveal.** In-mission scene (~12 lines): Relay reads the registry live and realizes the two prizes — Ekene's cell block, the orbital override — are time-locked against each other. Fireteam weighs in once each (Sable: two words; Tremor: for the rescue; Vireo: for the guns, hating herself). CAIRN states the facts. No music; ambient only. The choice UI holds on silence.
- **M21a — Extraction (~30 branch lines).** Holding-deck approach under orbital fire warnings, cell-block breach, Ekene's first post-rescue lines (weak, then unmistakably her: she asks about the fireteam before herself), carry-out finale. Ends on the `sting_ekene_down` cello motif inverted — same instrument, rising line (scripted in the 21a finale music, Section 6.5).
- **M21b — Override (~30 branch lines).** Gunnery-college seizure, CAIRN confirming override handshake, Relay reporting the prison transport's departure burn mid-mission — the player hears her leave. Finale opens with the player's orbital strike called in cold, by-the-numbers.
- **M22–M23 branch tints.** 21a: Ekene returns to the command net (10 new trigger lines across both missions, voice roughened, authority intact). 21b: Relay carries alone; two lines acknowledge the empty channel.
- **M23 — Kryce resolution.** 21a: arrest scene — Kryce negotiates to the last sentence, patrician polish finally cracking (6 lines). 21b: death fleeing — his escape climber is brought down mid-broadcast; the PA futz cuts to squelch (4 lines + hard cut).
- **M24 — Sol duel.** Pre-duel walkout (Sol on the degraded link, 4 lines: he names the player's chassis, states his terms, apologizes in advance). Wound-threshold exchanges at 75% / 50% / 25% Craton-X structure (2 lines each; he speaks of the Assembly he sold and why). Player-side answers come from CAIRN status calls only — Lodestar stays silent; the machine speaks for them. Post-duel: one final Sol line, branch-agnostic ("Tell them it was never the machines."), then branch endings.
- **Endings.** 21a: dawn ceremony scene, Ekene leading the restored Assembly (8 lines + epilogue). 21b: memorial scene at Marrow Bay (6 lines + epilogue).

### 4.6 Epilogues (two full scripts)

Both clean-bus, no futz, over the branch ending music. Canonical scripts below; mission files carry them for subtitle/build purposes.

**`epilogue_21a` — Ekene, over `mus_ending_21a` (dawn hymn), ~80 s:**

> "Archive entry one. Commander Mara Ekene, Free Veyran Compact — though I suppose that name retires today, along with the rest of us who only ever meant to be temporary.
>
> The sun came up over the anchor plate this morning, and for the first time in eighteen months nobody needed permission to watch it. The Assembly sits at noon. Real chairs, real names, real votes. The Directorate's flags came down without ceremony — someone folded them into packing crates, which feels about right. This world was never theirs. It was collateral on a ledger.
>
> I want the record to keep the cost. We buried friends in salt, in snow, in black water off Marrow Bay. Say their names when you teach this. Do not make it clean.
>
> And to the pilot who flew my wing from the breaker yards to the anchor plate — the one the net called Lodestar. Every compass needs its fixed star. You were ours. Stand down, pilot. The watch is ours now. Ekene out."

**`epilogue_21b` — Vireo (late-campaign steady read), over `mus_ending_21b` (cold piano), ~80 s:**

> "This is Vireo. Relay says the archive needs a closing entry, and everyone keeps looking at me. So. Fine.
>
> We won. I keep saying it, waiting for it to sound like the word. The orbital guns fired on our order. The Spire is ours. The Directorate is finished on this world. Marshal Sol is under the anchor plate where he fell, and Kryce never made it off. Those are facts, and facts are supposed to help.
>
> There's a wall in Marrow Bay now — names cut into ship steel. People read it in the rain. That feels right. There's no marker for the Commander. You don't cut a name for someone you haven't stopped waiting for. Her transport jumped before the guns spoke, and somewhere out there she is still standing the way she stood on the glacier. Straight.
>
> If you can hear this, ma'am: we held. Lodestar held first, and the rest of us learned it. Come home. We'll keep the light on. Vireo out."

### 4.7 VO production totals

| Category | Lines | Files shipped |
|---|---|---|
| Startup litany | 1 | 1 |
| Briefings | 25 (24 slots + branch pair) | 25 |
| Mission trigger lines | ~980 (24 × ~40, incl. duel and branch scenes) | ~980 |
| Systemic barks | 120 (plus Vireo early/late doubles and Ironline alternates) | ~150 |
| Epilogues | 2 | 2 |
| **Total** | **~1,130 lines** | **~1,160 files** (~3,400 generated takes at 3 per line) |

---

## 5. SFX Prompt Library

Generation prompts for the text-to-sound-effects pipeline. Layer 2–3 generated elements per event where noted. Every entry ships as `public/audio/sfx/<id>.mp3`; `variants` = round-robin count. Durations and loop flags match `content/audio-plan.json`.

### 5.1 Movement

Footsteps: 3 tonnage classes × 4 surfaces = 12 assets, 3 round-robin variants each, 1.2 s. Base prompt pattern (the 70-ton/salt line is the spec reference, kept verbatim):

- `footstep_heavy_salt` — "colossal metal footstep of a 70-ton walking machine on packed salt, deep sub-bass thump, hydraulic hiss follow-through, dry outdoor air, 1.2 seconds"
- Tonnage substitutions: **light** "a 30-ton walking machine, quicker and lighter, sharp servo whine"; **assault** "a 95-ton walking machine, ground-shaking, longer settling rumble".
- Surface substitutions: **rock** "on bare rock, hard slapback echo off stone"; **deck** "on steel deck plating, hollow metallic resonance and structural ring"; **snow** "on compacted snow, muffled crunch, cold damped air".

| ID | Prompt summary | Dur | Loop | Var |
|---|---|---|---|---|
| `footstep_light_salt` / `_rock` / `_deck` / `_snow` | 30-ton footstep × surface | 1.2 | no | 3 |
| `footstep_heavy_salt` / `_rock` / `_deck` / `_snow` | 70-ton footstep × surface | 1.2 | no | 3 |
| `footstep_assault_salt` / `_rock` / `_deck` / `_snow` | 95-ton footstep × surface | 1.2 | no | 3 |
| `servo_articulation` | "heavy servo motor articulation, layered hydraulic whine and mechanical ratchet, slow powerful movement, 2 seconds loopable" | 2 | yes | 2 |
| `jumpjet_launch` | "jump-jet ignition, concussive thruster light-off with dust blast and rising roar, 1.5 seconds" | 1.5 | no | 2 |
| `jumpjet_burn` | "mech jump-jet sustained burn, roaring thruster with turbine underlayer and crackling exhaust, 2 seconds seamless loopable" | 2 | yes | 1 |
| `jumpjet_land` | "multi-ton machine landing from a jet-assisted jump, hydraulic shock absorbers compressing, heavy double thud with joint hiss, 2 seconds" | 2 | no | 2 |
| `mech_collapse` | "forty tons of machinery collapsing onto concrete, initial slam, cascading secondary metal impacts, settling debris, 4 seconds" | 4 | no | 2 |

Runtime: footstep gain and camera-shake scale with tonnage; playback rate ±3% randomization on all round-robins; limping mechs alternate normal/limp step timing with the damaged-side step pitched down 15%.

### 5.2 Weapons

| ID | Prompt | Dur | Loop | Var |
|---|---|---|---|---|
| `laser_beam_s` | "sustained energy beam, focused thermal hum with crackling ionization, high tight register, precise, 2 seconds seamless loopable" | 2 | yes | 1 |
| `laser_beam_m` | "sustained energy beam, focused thermal hum with crackling ionization, mid register with more body, 2 seconds seamless loopable" | 2 | yes | 1 |
| `laser_beam_l` | "sustained heavy energy beam, deep thermal roar with crackling ionization and air distortion, low register, 2 seconds seamless loopable" | 2 | yes | 1 |
| `pulse_array_burst` | "three rapid energy bursts in quick succession, sharp electric zaps with snapping transients and short decay, 1 second" | 1 | no | 2 |
| `particle_lance` | "heavy particle cannon discharge, deep thunderclap with electrical tearing onset, long rolling decay, ionized sizzle tail, 3 seconds" | 3 | no | 2 |
| `autocannon_40` | "autocannon hammer blow, light 40-class cannon, sharp mechanical bark with brass casing clink, 1 second" | 1 | no | 3 |
| `autocannon_80` | "autocannon hammer blow, medium 80-class cannon, concussive slam with mechanical action cycling, 1 second" | 1 | no | 3 |
| `autocannon_120` | "autocannon hammer blow, heavy 120-class cannon, artillery-grade detonation with long low tail, 1 second" | 1 | no | 3 |
| `gauss_charge` | "electromagnetic charge-up whine rising smoothly through two octaves, capacitor hum swelling with tension, 1.5 seconds" | 1.5 | no | 1 |
| `gauss_fire` | "supersonic slug crack, brutal flat detonation with whip-crack air split and distant echo, 2 seconds" | 2 | no | 2 |
| `scattergun_blast` | "short-range scattergun blast, wide percussive boom with metal pellet spray rattling off armor plate, 1 second" | 1 | no | 2 |
| `rocket_volley_launch` | "staggered rocket volley launch, rapid overlapping whooshing ignitions with smoke hiss, 2 seconds" | 2 | no | 2 |
| `rocket_flight_loop` | "rocket motor in flight, hissing roar with doppler shimmer, 2 seconds seamless loopable" | 2 | yes | 1 |
| `rocket_impacts` | "staggered rocket impact explosions, four to eight overlapping concussive blasts with debris scatter, 3 seconds" | 3 | no | 3 |
| `swarm_launch` | "twenty micro-missiles ripple-launching from a rack, fast popping ignitions blending into a rising swarm hiss, 2 seconds" | 2 | no | 2 |

Runtime: gauss chain = `gauss_charge` → `gauss_fire` on release; chainfire staggers autocannon round-robins 60 ms apart; laser loops crossfade in/out over 80 ms.

### 5.3 Damage and systems

| ID | Prompt | Dur | Loop | Var |
|---|---|---|---|---|
| `armor_impact_clang` | "armor-piercing round striking composite plate, sharp metallic clang with ricochet whine and stress groan, 1 second" | 1 | no | 3 |
| `internal_crunch` | "internal structure damage, deep crunching metal deformation, snapping struts, electrical arcing, 1.5 seconds" | 1.5 | no | 3 |
| `ammo_cookoff` | "ammunition magazine cooking off inside a metal hull, chain of muffled internal explosions ripping outward, tearing metal, 3 seconds" | 3 | no | 2 |
| `overheat_klaxon` | "two-tone emergency klaxon, harsh industrial alarm alternating high-low, 1 second seamless loopable" | 1 | yes | 1 |
| `core_shutdown` | "fusion core emergency shutdown, huge turbine decelerating from full spin to silence, descending pitch, dying electrical hum, relays clunking off, 5 seconds" | 5 | no | 1 |
| `core_restart` | "fusion core restart, turbine spooling up from silence to full spin, rising pitch, relays engaging, systems chime at full power, 5 seconds" | 5 | no | 1 |
| `coolant_flush` | "high-pressure coolant flush, explosive pressurized hiss venting into steam, liquid spatter on hot metal, crackling condensation, 3 seconds" | 3 | no | 2 |
| `ejection` | "cockpit ejection sequence, explosive canopy bolts firing, rocket seat igniting with violent whoosh, rushing wind tail, 3 seconds" | 3 | no | 1 |
| `limb_shear` | "giant mechanical limb shearing off, screaming metal tear, snapping hydraulic lines spraying fluid, heavy component crashing to the ground, 3 seconds" | 3 | no | 2 |
| `spark_shower` | "electrical short-circuit spark shower, crackling arcs and fizzing sparks with small metallic pings, 1.5 seconds" | 1.5 | no | 2 |

Runtime: `core_shutdown`/`core_restart` bracket the redline-shutdown helpless window and are never ducked — the power-down is the drama. `limb_shear` + `spark_shower` + debris physics + fireteam bark + salvage tag = the one-action-five-payoffs moment from the deep-impression checklist.

### 5.4 Ambience

All seamless loops, played on the environment bus with biome crossfades over 4 s.

| ID | Prompt | Dur | Loop | Var |
|---|---|---|---|---|
| `amb_cockpit` | "sealed mech cockpit interior room tone, low reactor hum, soft avionics fan whir, occasional relay ticks and instrument chirps, 30 seconds seamless loopable" | 30 | yes | 1 |
| `amb_rain_canopy` | "heavy monsoon rain drumming on an armored glass canopy, dense droplet impacts, muffled thunder, occasional wind gust, 30 seconds seamless loopable" | 30 | yes | 1 |
| `amb_distant_war` | "distant battlefield ambience, far-off artillery rumbles, faint mechanical footfalls, sporadic muffled gunfire on the wind, 60 seconds seamless loopable" | 60 | yes | 1 |
| `amb_salvage_yard` | "industrial shipbreaking yard ambience, distant cutting torches, groaning hull metal, chain hoists clanking, gulls and sea wind, 60 seconds seamless loopable" | 60 | yes | 1 |
| `amb_salt_wind` | "vast open salt-flat wind, dry hissing gusts carrying fine salt grains against metal, deep desert emptiness, 60 seconds seamless loopable" | 60 | yes | 1 |
| `amb_cavern` | "flooded limestone cavern ambience, echoing water drips, low subterranean air movement, distant stone settling, 60 seconds seamless loopable" | 60 | yes | 1 |
| `amb_polar_wind` | "arctic night wind, biting polar gusts whistling over refinery pipework, creaking ice, faint flare-stack roar far away, 60 seconds seamless loopable" | 60 | yes | 1 |
| `amb_storm_surf` | "storm coast ambience, driving rain, heavy surf pounding drowned quarry walls, rolling thunder, 60 seconds seamless loopable" | 60 | yes | 1 |
| `amb_arcology` | "dense vertical city under occupation, deep structural hum, distant public-address echoes, skybridge wind, sporadic sirens far below, 60 seconds seamless loopable" | 60 | yes | 1 |

Biome map: Op1 `amb_salvage_yard`; Op2 `amb_salt_wind`; Op3 `amb_cavern` (+`amb_salt_wind` on surface dolines); Op4 `amb_polar_wind`; Op5 `amb_storm_surf`; Op6–7 `amb_arcology` (+`amb_storm_surf` layered on M22–M24 exteriors). `amb_cockpit` always on in cockpit view; `amb_rain_canopy` layers over it in rain; `amb_distant_war` layers wherever the front is audible (M7, M13, M17, Op6+).

### 5.5 UI

| ID | Prompt | Dur | Loop | Var |
|---|---|---|---|---|
| `ui_console_click` | "single physical console switch click, satisfying mechanical toggle, soft plastic-metal contact, 0.3 seconds" | 0.3 | no | 3 |
| `ui_target_lock` | "target lock acquisition tone, short ascending two-note electronic confirmation, clean and precise, 0.5 seconds" | 0.5 | no | 1 |
| `ui_warning_chirp` | "cockpit warning chirp, urgent short electronic double-beep, slightly harsh, 0.5 seconds" | 0.5 | no | 1 |
| `ui_squelch` | "radio squelch click, brief static burst with carrier pop, channel keying open, 0.2 seconds" | 0.2 | no | 2 |
| `ui_salvage_chime` | "salvage tag confirmation chime, low industrial two-note bell, worn and analog, 0.8 seconds" | 0.8 | no | 1 |

---

## 6. Adaptive Music Plan

### 6.1 Palette and rules

Hybrid orchestral-industrial: low brass clusters, driving string ostinatos, taiko and struck anvil, granular drones sourced from mining-machinery textures, and one recurring **distorted solo cello** — the voice of the campaign, present in the main theme, the Ekene lament, and the final duel. Home key **D minor** throughout. Tempi: **96 BPM** narrative / **112 BPM** combat. All looping cues are 8- or 16-bar seamless loops with clean bar seams; combat layers are phase-aligned stems of one arrangement. Long cues are generated in ≤50 s segments and stitched at bar boundaries before delivery.

### 6.2 Main theme — `theme_main` (2:30, 96 BPM, D minor)

Structure: lone distorted cello (0:00) → war-drum groove enters (0:40) → heroic-tragic low brass theme (1:20) → struck-anvil industrial climax (~2:00) → collapse back to the lone cello (2:15–2:30). Used on the title screen and as the melodic DNA for every stinger and both endings.

### 6.3 Biome ambient loops (5, always-on layer)

Textural, tempo-free (no transient grid, so the 112 BPM combat layers can enter on their own clock), ~2:00 loops, D-minor pitch world.

| ID | Ops | Character |
|---|---|---|
| `mus_biome_coast` | Op1, Op5 | groaning-hull granular drones, slow tidal low-string swells, distant metallic percussion |
| `mus_biome_salt` | Op2 | shimmering high string harmonics over a vast hollow drone, sparse dry cracking-earth percussion |
| `mus_biome_karst` | Op3 | deep resonant cavern drones, bowed metal, slow low woodwind fragments |
| `mus_biome_polar` | Op4 | glassy icy pads, subharmonic industrial hum, distant anvil strikes muffled by snow |
| `mus_biome_arcology` | Op6, Op7 | pulsing sub-bass, drifting clustered string dissonances, faint processed choir, ticking industrial percussion |

Op1 vs Op5 on the shared coast bed is differentiated by the SFX layer (salvage yard vs storm surf) and by combat-layer mix (Op5 runs L2 hotter).

### 6.4 Combat layers (3, vertical, 112 BPM, 16-bar loops ≈ 34 s)

One arrangement delivered as three aligned stems:

- `mus_combat_l1` — muted string ostinato + rolling toms; restrained tension.
- `mus_combat_l2` — adds taiko war drums + low brass stabs.
- `mus_combat_l3` — full frenzy: shrieking brass clusters, struck anvils, industrial percussion barrage.

Threat-state mapping (from the AI/threat system): **calm** = ambient only → **alert** (hostile aware, no line of fire) = +L1 → **engaged** (weapons exchanged) = +L2 → **overwhelmed** (3+ hostiles engaged, or player internal structure exposed, or a named enemy active) = +L3. Layers fade in on the next bar boundary (≤2.1 s wait), fade out only after 4 consecutive bars below the state, so the score never flutters. De-escalation to calm requires 10 s with no hostile contact.

### 6.5 Stingers and scripted cues

| ID | Cue | Length | Notes |
|---|---|---|---|
| `sting_complete` | mission complete | 6 s | rising brass lift with a single anvil accent, resolving open fifth; combat layers hard-mute on trigger |
| `sting_failed` | mission failed | 6 s | collapsing dissonant brass cluster sagging into silence |
| `sting_ekene_down` | M13 scripted | 20 s | solo cello lament, raw and close; everything else mutes; the somber cue of the campaign |
| `sting_duel_start` | M16, M24 | 5 s | single massive war-drum hit decaying into ringing silence; the duel begins in that silence |
| `mus_ending_21a` | 21a-branch ending + epilogue bed | 90 s | dawn hymn: hopeful strings blooming from the main-theme cello motif, warm brass sunrise swell |
| `mus_ending_21b` | 21b-branch ending + epilogue bed | 90 s | cold sparse piano over the main-theme cello line, distant, unresolved |
| `mus_duel_rauk` | M16 exclusive suite | 3:00, 112 BPM | relentless taiko + staccato low strings + icy metallic accents; three intensities with clean 8-bar seams driven by scripted wound thresholds |
| `mus_duel_sol` | M24 exclusive suite | 3:30, 112 BPM | funereal brass chorale over war drums breaking into full industrial-orchestral fury; the main-theme cello motif returns at the final threshold; 8-bar scripted seams |
| `mus_training` | Basic Training bed | 2:00 loop, 66 BPM | workmanlike training-pad bed: reactor-hum drone, slow chain-hoist percussion, warm low synth bass; very low dynamic ceiling — CAIRN talks over it constantly; loops with `amb.bt.pad` on the music bus |

Duel missions are **exclusive scripted**: the vertical layer system is disabled and the duel suite follows the fight's scripted thresholds. `sting_duel_start` precedes both suites; the litany is the only VO over M24's opening silence.

### 6.6 Runtime layering and ducking rules

1. Biome ambient layer: always on in-mission, −21 LUFS bed level.
2. Combat layers: threat-state driven per 6.4; bar-quantized transitions; stems share one clock.
3. VO duck: any VO line ducks all music −6 dB (attack 150 ms, hold to line end, release 800 ms). CAIRN systems lines also duck the SFX bus −3 dB.
4. Stingers preempt: `sting_*` cues mute combat layers instantly (2 s release on ambient).
5. Duel exclusivity: M16/M24 suppress the vertical system entirely.
6. Shutdown silence: during redline shutdown, music ducks −12 dB under `core_shutdown`/`core_restart` — the turbine is the score for those seconds.
7. Endings: `mus_ending_21a`/`mus_ending_21b` run clean under their ending scenes and epilogues; the epilogue VO duck applies at −4 dB only, so the bed stays present.

---

## 7. Production Workflow Summary

1. **Voices**: design all 13 voices from the Section 2 prompts; lock voice IDs in the team vault; regenerate nothing after lock without a bible change.
2. **VO batches**: litany + CAIRN canonical ten first (they gate the M0 vertical slice), then M1 mission set, then barks, then remaining briefings/missions in op order, branch content last.
3. **SFX**: generate per Section 5 prompts, 2–4 candidates per asset, layer and master to category loudness, deliver per naming rules.
4. **Music**: main theme first (it seeds every derived cue), then combat stems (must be one arrangement), then biome beds, stingers, duel suites, endings.
5. **QA gates**: litany A/B against the M24 mix (deep-impression checklist); bark round-robin level match ±1 dB; every loop point auditioned at 3× speed for seam clicks; futz chain verified against reference renders on Potato tier.

All asset IDs, prompts, durations, and file paths in this document are mirrored in `content/audio-plan.json`; when in doubt, the JSON wins for tooling and this document wins for intent.
