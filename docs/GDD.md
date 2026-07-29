# VEYRA PRIME — Game Design Document

**Working title:** "MechWarrior" (placeholder — WILL be renamed before ship)
**Internal codename:** Veyra Prime
**Document status:** Source of truth. All content, code, and asset decisions defer to this document. Conflicts are resolved here first, then propagated to content JSON.
**IP policy:** 100% original IP. No names, lore, lines, designs, or mechanics-as-branding from any existing franchise may appear in the game, its content files, its marketing, or its asset prompts.

---

## Table of Contents

1. [Vision & Pillars](#1-vision--pillars)
2. [Setting, Factions & Characters](#2-setting-factions--characters)
3. [Campaign Structure — 7 Operations / 24 Missions](#3-campaign-structure)
4. [Core Gameplay Systems](#4-core-gameplay-systems)
5. [Mech Roster](#5-mech-roster)
6. [Weapons](#6-weapons)
7. [Controls & HUD](#7-controls--hud)
8. [Enemy & AI Design](#8-enemy--ai-design)
9. [Tech Targets & Performance Budgets](#9-tech-targets--performance-budgets)
10. [Production Milestones M0–M3](#10-production-milestones-m0m3)
11. [Deep-Impression Checklist](#11-deep-impression-checklist)

---

## 1. Vision & Pillars

### 1.1 One-line pitch

A single-player, browser-based giant-robot combat **simulator**: you are a salvaged war machine and its pilot, fighting a 24-mission campaign to liberate an occupied mining world — where heat, weight, and every lost limb are real, and the war visibly turns because of you.

### 1.2 Player fantasy

You are not a superhero and your machine is not a sports car. You are **Lodestar**, a Compact pilot strapped into forty-plus tons of patched, mismatched, stolen salvage. The fantasy is *operating* a colossal machine: the startup litany, the throttle ladder, the torso twisting independently of the legs, the heat bar creeping toward redline while you decide whether one more alpha strike is worth an emergency shutdown in the open. Every mission begins with CAIRN's voice and every victory is earned through systems mastery, not reflexes. By the end, the player should feel they personally tipped a planetary war — and should be able to point at the map, mission by mission, and say where it turned.

This is a **simulator, not an arcade game**. Weapons converge where you aim them; heat is a resource; positioning and loadout decisions made in the Assembly Bay win fights before they start. It runs in a browser, but it must never *feel* like a browser game.

### 1.3 Pillars

Every feature must serve at least one pillar. Features serving none are cut.

| # | Pillar | Meaning | Concrete expressions |
|---|--------|---------|----------------------|
| 1 | **Weight** | The machine is heavy and you feel it constantly. | Slow throttle response; ground-shake scaled by tonnage; inertia in turns and stops; footfall audio with sub-bass; knockdowns; jump jets that lift a building, not a bird. |
| 2 | **Systems mastery** | Skill = understanding the machine, not twitch. | Heat discipline; subtargeting components; positioning and range bands; Assembly Bay loadout decisions; sensor modes; fireteam orders. |
| 3 | **A war you can feel turning** | The campaign is a liberation with visible momentum. | Op structure moves from theft (M1) to planetwide uprising (M17) to capital assault (Op6–7); briefings, VO, propaganda, and biomes reflect the shifting front. |
| 4 | **Consequence** | Choices and damage persist. | Blown-off limbs stay off for the mission; salvage quality depends on *how* you killed; fireteam permadeath on Ironline; one late-game fork (M21) that changes the ending. |
| 5 | **Deep impression** | Moments that stay with the player. | The startup litany at the top of every mission; the adaptive soundtrack; Ekene's capture; the drowned-quarry duel; the silent 1v1 with Marshal Sol on the anchor plate. |

### 1.4 Scope guardrails

- Single-player only at 1.0. Multiplayer is Phase 2 and must not influence 1.0 architecture beyond clean sim/render separation (which we want anyway).
- 24 missions, 7 operations, 12 player-usable chassis, ~17 weapons/utilities, 5 biomes, 2 ending branches. No open world; missions are authored spaces on 2–4 km² terrain chunks.
- Browser delivery: TypeScript + Three.js (WebGPU with WebGL2 fallback) + Rapier physics. All game data lives in JSON content files.

---

## 2. Setting, Factions & Characters

### 2.1 The world: Veyra Prime

Veyra Prime is a resource world — a place worth conquering and worth bleeding for. Its biomes are the campaign's chapters, each visually and mechanically distinct:

| Biome | Location in campaign | Visual identity | Mechanical identity |
|-------|----------------------|-----------------|---------------------|
| **Breaker Coast** | Op1 | Shipbreaking yards, beached hull carcasses cut open like whale skeletons, tidal flats, gantry cranes | Tutorial spaces; hulls as hard cover; tide-dependent terrain |
| **Halite Flats** | Op2 | Blinding white salt desert, heat shimmer, mirage distortion, endless sightlines | Long-range combat; heat dissipation ×0.8 (hot); nowhere to hide |
| **Karst Highlands** | Op3 | Sinkholes (dolines), cliffs, flooded caverns, cable-car ropeways — the signature biome | Verticality; passive-sensor play; underground set-pieces; fall hazards |
| **Polar Refineries** | Op4 | Arctic night, flare stacks blooming against aurora, glaciers, ice fog | Heat dissipation ×1.25 (cold bonus); footing penalties on ice; thermal-masking play |
| **Storm Coast** | Op5 | Monsoon rain, drowned quarries, the fishing town Marrow Bay, grey surf | Rain heat bonus ×1.15; reduced visibility; naval and amphibious enemies |
| **Vell Arcology / Spire Anchor** | Op6–7 | Dense vertical capital city at the base of the space-elevator anchor "Spire Anchor"; lightning stormwall in the finale | Urban verticality; collateral rules; the final duel arena on the anchor plate |

**Backstory (player-facing, delivered through briefings and VO — never a lore dump):** Eighteen months ago the **Karst Directorate**, an off-world extraction conglomerate with a private army, executed a coup against Veyra Prime's elected Assembly. The Directorate runs the planet as a mine: quotas, checkpoints, propaganda towers, drone patrols. Resistance coalesced into the **Free Veyran Compact** — miners, shipbreakers, and defected soldiers. The campaign begins the night the Compact stops being an insurgency and starts being an army: the night they steal their first mech.

### 2.2 Factions

**Karst Directorate (enemy).** Corporate occupation force. Visual identity: gunmetal grey with hazard-amber striping, clean stenciling, maintained finishes — the look of money. Doctrine: drone-heavy, sensor-grid dependent, artillery and air support on call, propaganda saturation. Their mechs are factory-standard versions of the same geology roster the player uses, plus three named-pilot variants (see §8.4). Their weakness is institutional: they fight for pay and quota, and when the grid goes down or the pay stops, they hesitate.

**Free Veyran Compact (player side).** Liberation movement. Visual identity: patched, mismatched, field-repaired salvage — panels from three different machines on one chassis, hand-painted unit marks, rust streaks and weld seams. Doctrine: theft, ambush, salvage, and knowing the ground. Their strength is that every machine they field was taken from the enemy, and every pilot has something to lose.

### 2.3 Characters

Full cast with role, personality, arc, and verbatim ElevenLabs voice-design directions (voices are designed from text description; **never cloned**).

| Character | Callsign | Role | Personality & arc | Voice direction (ElevenLabs prompt) | Radio futz? |
|-----------|----------|------|-------------------|--------------------------------------|-------------|
| Player | **Lodestar** | Compact mech pilot | Silent-ish protagonist; speaks only in rare, short scripted confirmations so the player owns the seat | n/a (minimal barks if any; neutral, clipped) | — |
| Mara Ekene | **Anchor** | Commander / CO / mentor | Woman, 50s. Ex-orbital marine. Warm gravel authority; believes in the player before the player does. Captured alive in M13; her fate drives Ops 5–7 and the M21 choice. | "woman in her 50s, low gravelly voice with warm weight of authority, unhurried, faint parade-ground clip on commands" | Yes |
| Dae-jun Im | **Relay** | Comms & intel officer | Man, early 20s. Fast, crisp, dry humor as a coping mechanism; the voice in your ear for objectives. Steps up as acting coordinator after M13. | "man early 20s, crisp bright tenor, fast talker, dry wit, slight vocal smile even in danger" | Yes |
| Riva Chen | **Sable** | Fireteam — sharpshooter | Woman, 30s. Calm, minimal words; when she speaks, it matters. Joins M3. | "woman 30s, quiet flat calm, almost a whisper on comms, precise consonants" | Yes |
| Dozie Okafor | **Tremor** | Fireteam — brawler | Man, 40s. Booming bass, big laugh, protective of the young ones. Joins M6. | "man 40s, booming bass, big easy laugh, rounds every sentence off warmly" | Yes |
| Anja Kessler | **Vireo** | Fireteam — rookie | Woman, early 20s. Nervous early, grows into a steady veteran; her confidence arc is audible. Joins M8. | Early campaign: "woman early 20s, light voice with audible nerves early on" → late campaign lines re-recorded direction: "steadier, confident" | Yes |
| CAIRN | — | Onboard AI (Cockpit Autonomic Intelligence, Reflex Node) | Measured, neutral, faintly synthetic. Never panics. Delivers the startup litany, system callouts, damage reports. The machine's soul. | "calm, measured, softly synthetic androgynous voice, mid-low pitch, perfectly even pacing, faint digital smoothness, zero emotion but strangely reassuring" | **Never** (always clean, in-cockpit) |
| Director Halden Kryce | — | Antagonist — Directorate planetary director | Soft patrician menace; heard mostly via propaganda broadcasts and hijacked comms. Arrested (branch 21a) or dies fleeing (21b) in M23. | "older man, soft patrician baritone, unhurried, faint amusement, corporate-broadcast polish" | Broadcast coloration (distinct from squad futz) |
| Colonel Vesna Rauk | — | Enforcer — Directorate field commander | Icy, contemptuous, genuinely dangerous. First clash M11 (withdraws); calls single combat M16 and dies there. | "woman 40s, clipped icy alto, open contempt, military brevity" | Yes |
| Marshal Edrik Sol | — | Final duelist | Man, 60s. The soldier who sold out the Assembly and has carried it for eighteen months. Regret under iron resolve. Pilots the prototype Craton-X. Fought 1v1 in M24. | "man 60s, tired dignified baritone, regret under iron resolve" | Yes (until the final exchange, delivered clean at conversational distance on the anchor plate) |
| Ensemble | — | Compact soldiers, civilians, Directorate chatter | 3–4 generic designed voices covering incidental lines | Designed per casting pass; distinct from principals | Yes |

**The startup litany.** CAIRN speaks this verbatim over the power-up sequence at the top of **every** mission — it is the game's signature sound:

> "Core ignition confirmed. Actuator lattice — green. Weapon buses — live. Coolant loop pressurized. All boards answer ready. Good hunting, Lodestar."

It must land with the same weight on M24 as on M1. Do not vary the read except for the two sanctioned moments: M13's post-mission somber context (litany plays as normal at mission start — the contrast is the point) and M24, where a two-second longer pre-litany silence is authored.

---

## 3. Campaign Structure

7 operations, 24 missions. Each mission below expands the design intent into: **Setup** (fiction and situation), **Beats** (the authored sequence), **Objectives** (primary/secondary), **Failure states**, **Teaches** (mechanical curriculum), and **Emotional job** (what the mission does to the player's heart, and where it sits in the war's turning).

The campaign curriculum is deliberate: Op1 teaches the body, Op2 teaches the trigger, Op3 teaches the eyes, Op4 breaks your heart, Op5 lights the fire, Op6 makes you choose, Op7 makes it cost.

---

### Operation 1 — BREAKER COAST *(shipbreaking yards; tutorial op)*

The Compact's first armed action. Tone: nocturnal, illicit, thrilling — a heist that becomes a war.

#### M1 — Cold Ignition

- **Setup:** Night. The Compact has infiltrated a Directorate impound yard on the Breaker Coast where a mothballed **Skarn** hangs in a maintenance gantry. Lodestar — until tonight a shipbreaker crane operator — is the only one who has logged simulator hours. Ekene runs the op from a truck outside the wire; Relay has spoofed the gate rosters for exactly forty minutes.
- **Beats:** (1) On-foot-free opening skipped — the mission opens *in the cockpit*, dark. First input is the ignition. The full startup litany plays for the first time as the yard lights flicker through the canopy. (2) Guided first steps: throttle up, leg steering, torso twist against fixed gantry targets. (3) Walk the yard lanes between dead hulls while Relay talks the player through weapon-group basics on wrecks. (4) Alarm trips (scripted): light drone security responds — first live fire. (5) The yard's **tracking mast** must be destroyed before it burst-transmits the Skarn's transponder, or the Directorate will hunt the machine forever. (6) Exit through the breach as Ekene's truck lights the way.
- **Objectives:** Primary — power up the Skarn; reach the yard gate; destroy the tracking mast. Secondary — destroy all four yard cameras (small scrip bonus); take less than 25% armor damage.
- **Failure states:** Skarn destroyed (player death → eject → mission failed, this mission only: no eject-continue); tracking mast completes its transmission (timer starts when the alarm trips; generous — 6 minutes).
- **Teaches:** Ignition/litany, throttle ladder including reverse, A/D leg steer vs. mouse torso aim, C recenter, weapon groups 1–2, basic radar ring.
- **Emotional job:** Birth. The player must fall in love with the *machine* before the war. The litany, the first ground-shaking step, the gantry falling away — this is the moment trailers are cut from. The war has not turned yet; tonight it merely *begins*.

#### M2 — Tide Tables

- **Setup:** Dawn, low tide. Relay has intercepted a Directorate patrol route through the beached hull carcasses — a two-mech escort with tracked APCs. Ekene wants their machines, not their wreckage: "We don't win by breaking their toys, Lodestar. We win by taking them."
- **Beats:** (1) Pre-positioning phase: the player walks the tidal flat with passive guidance, choosing an ambush lane among the cut-open hulls. (2) The patrol enters; scripted hold until Ekene calls it or the player is spotted. (3) The ambush: a Gabbro and a Pumice plus two Ferric APCs. Relay coaches subtargeting — "Leg it, don't cook it." (4) First **field salvage**: post-combat, the player physically walks to the downed Gabbro and holds interact; salvage percentages display against kill condition, making the lesson concrete. (5) Rising tide closes the mission with a soft timer on the exit route.
- **Objectives:** Primary — destroy or disable the patrol; salvage at least one enemy chassis. Secondary — take one kill by leg destruction (foreshadows M5); keep heat below redline for the whole mission.
- **Failure states:** Player mech destroyed; both salvage targets destroyed by ammo cook-off (mission completes but Ekene's debrief is pointedly cold and the scrip payout is halved — a *soft* failure the player feels).
- **Teaches:** Heat as a rhythm (fire, wait, fire), R/T/E targeting and subtarget cycling, kill-condition salvage economy, first use of thermal vision at dawn.
- **Emotional job:** Competence. The player graduates from "surviving the machine" to "using it." First taste of the loop that powers the whole game: fight carefully, salvage well, grow the arsenal.

#### M3 — Loud Exit

- **Setup:** The Compact's stolen **dropbarge** — their entire logistics future — is on the slipway and the Directorate knows. Hold the yard until launch. **Riva Chen "Sable" joins**, in a captured Pumice, introducing the fireteam.
- **Beats:** (1) Sable checks in; command-rose tutorial (F1–F4) against the first probe wave. (2) Wave defense along the slipway: drones, then APCs, then a mech pair. (3) Two Directorate **gun skiffs** enter the bay and begin shelling the barge — they must die; Sable calls their approach lanes. (4) Launch klaxon; final wave arrives as the barge's engines light; the mission ends walking backward up the ramp, firing, as the barge lifts.
- **Objectives:** Primary — barge survives to launch (hull bar shown); destroy both gun skiffs. Secondary — no fireteam incapacitation; destroy 6+ drones (Relay bounty).
- **Failure states:** Barge hull reaches zero; player mech destroyed; Sable destroyed (on Recruit/Regular she ejects and the mission continues with a penalty; on Ironline she is dead permanently — the first place the difficulty contract shows its teeth).
- **Teaches:** Fireteam command rose (Form Up / Attack My Target / Hold Position / Move To), defending an objective with a health bar, prioritizing target classes.
- **Emotional job:** Belonging. The player is no longer alone in the machine — there is a voice on the wing. The op closes with the Compact's first real victory and the first bars of the main theme's heroic strain. The war has a heartbeat now.

---

### Operation 2 — HALITE FLATS *(blinding salt desert; long sightlines)*

The Compact goes on the offensive against the Directorate's sensor and logistics web. Tone: white glare, heat shimmer, patience.

#### M4 — White Static

- **Setup:** The flats are a Directorate panopticon: three **relay pylons** triangulate every moving contact for two hundred kilometers. Ekene: "Right now they see everything. By tonight, I want them blind."
- **Beats:** (1) Approach across open salt under active sensor sweep — the mission introduces detection radii honestly (the map shows pylon coverage circles). (2) Each pylon is a mini-assault: turret ring, drone screen, one garrison mech at the second and third. (3) Each pylon destroyed visibly shrinks the coverage overlay on the tactical map — the player *watches* the enemy go blind. (4) After the third, a blind counter-patrol wanders past close enough to touch, not seeing them: the reward made diegetic.
- **Objectives:** Primary — destroy all 3 relay pylons. Secondary — never enter an active detection circle before its pylon falls (ghost bonus); destroy the fuel bowser at pylon 2.
- **Failure states:** Player destroyed; a full alert being raised triggers heavy reinforcements (not a failure — a consequence — but sustaining two full alerts scrubs the secondary and hardens pylon 3).
- **Teaches:** The tactical map (Tab) as a planning tool, sensor coverage as terrain, engagement-range choice on long sightlines (Blaze Laser L and AC/120 shine here).
- **Emotional job:** Initiative. For the first time the Compact chooses where and when. The desert's scale sells the size of the war; the shrinking sensor circles are the campaign's momentum made literal.

#### M5 — Dust Convoy

- **Setup:** A reactor-fuel crawler convoy is crossing the flats. The Compact needs the fuel **intact** — the crawlers must be disabled, not destroyed. This is the **legged-kill tutorial** elevated into a full mission.
- **Beats:** (1) Parallel shadowing of the convoy through shimmer, using terrain scrape and passive sensors. (2) Relay marks the escort: two mechs, outrider skiffs. Ekene's rule of engagement, stated twice: "Legs and weapons only on anything within a hundred meters of a crawler." (3) The strike: escorts must be pulled away or dropped precisely; each crawler is stopped by destroying its drive bogies (subtarget) — hitting the tank cluster risks detonation. (4) A crawler that panics and runs must be legged before it reaches the escarpment gap. (5) Compact riggers arrive; escort-the-recovery coda with one counterattack wave.
- **Objectives:** Primary — stop the convoy with at least 3 of 4 crawlers intact; defeat the escort. Secondary — all 4 crawlers intact; no crawler destroyed by player fire (distinct: a stray escort shot can kill one).
- **Failure states:** More than two crawlers destroyed (mission failure — Ekene aborts); player destroyed.
- **Teaches:** Precision subtargeting under pressure, aimed leg destruction as a skill (not an accident), trigger discipline — *not* firing as gameplay.
- **Emotional job:** Discipline. The fantasy matures: overwhelming force means responsibility. Also quietly seeds the campaign's moral spine — the Compact fights to *keep* things, because this is their home; the Directorate can afford to break what it merely rents.

#### M6 — Mirage Line

- **Setup:** A Compact cell is pinned in a ruined weigh-shed on the open flat, bracketed by a Directorate long-gun lance shooting through heat shimmer from extreme range. **Dozie Okafor "Tremor" joins** mid-mission, arriving overland in his Halite like a rescue in a storm.
- **Beats:** (1) Sprint across open salt under long-range fire — shimmer distorts both ways; the mission teaches reading distorted silhouettes and muzzle flashes. (2) Reach the shed, tuck the survivors behind hull plate, and begin the duel: a sniper-configured Basalt pair and a spotter Flint at 900m+. (3) Kill or blind the spotter first (Relay: "The little one is their eyes — the big ones are just the fists."). (4) Tremor crashes the flank with a booming introduction, converting the long duel into a pincer. (5) Extract the cell on a crawler as the sun sets the salt orange.
- **Objectives:** Primary — all pinned survivors alive (starts at 6, scripted floor of 4); destroy the long-gun lance. Secondary — kill the spotter Flint before either Basalt falls; extract with the shed's supply cache.
- **Failure states:** Survivors drop below 4; player destroyed.
- **Teaches:** Long-range dueling (lead reticle mastery, Gauss/AC ballistics over 800m), the value of killing sensors before shooters, fighting alongside a second fireteam member with a different temperament.
- **Emotional job:** The war has a cost and a family. First mission where named civilians can die under your protection. Tremor's arrival is a joy beat — his laugh over the radio while shells fall must make the player grin.

#### M7 — The Weigh Station

- **Setup:** Op2 capstone: seize the fortified **ore-weigh complex** — the chokepoint that meters every ton the Directorate ships off-world — and hold it against two counter-waves. Taking it means the occupation stops being profitable.
- **Beats:** (1) Assault phase: breach the wall at one of three authored points (each teaches a different approach — ramp rush, jump-jet over, or long-range turret deletion). (2) Interior fight through weighbridge canyons — tight lanes between ore hoppers, brawler heaven. (3) Capture: Relay hardwires the tower; hold begins. (4) Counter-wave one: armor and skiffs, artillery warning markers teach displacement. (5) Regroup/repair beat — the game's first mid-mission field-repair pause. (6) Counter-wave two: mech lance with a Dolerite firing indirect from beyond the wall; the player must sally to kill it. (7) Compact flag over the tower; Kryce's first direct broadcast to the player, silken and amused.
- **Objectives:** Primary — take the complex; hold the tower through both waves. Secondary — keep all three weighbridges intact (salvage economy bonus for the whole op's epilogue); no fireteam losses.
- **Failure states:** Tower retaken (enemy squads reach the console for 60 uncontested seconds); player destroyed.
- **Teaches:** Assault→defend rhythm; artillery displacement; sallying versus turtling; using Sable (overwatch) and Tremor (counter-breach) per their strengths.
- **Emotional job:** The first strategic victory — the moment the player *feels the war turn* for the first time. Kryce noticing you personally raises the stakes: you are no longer an incident report. You are a name.

---

### Operation 3 — KARST HIGHLANDS *(sinkholes, cliffs, caverns — the signature biome)*

The campaign's visual centerpiece. Tone: vertical, echoing, hidden. The Compact learns to fight in three dimensions.

#### M8 — Sounding

- **Setup:** The Directorate has seeded the collapsed dolines with AA nests, closing the highlands to Compact air. Recon them **passively** and paint targets for a rocket strike. **Anja Kessler "Vireo" joins** — nervous, brand new, assigned to you because Ekene believes the player is the right teacher.
- **Beats:** (1) Passive-sensors tutorial: P mode, staying below acoustic and EM thresholds, reading the radar ring's passive returns. (2) Descend doline rims on jump jets — controlled-burn descent tutorial. (3) Locate and Beacon-Tag four AA nests without triggering the net; Vireo chatters nervously and must be steadied via command rose (using Hold Position on her at the right moments is *the* soft lesson). (4) Optional stealth-break: if detected, the mission converts honestly into a running gunfight with harder AA suppression. (5) The painted strike arrives — a horizon-wide rocket barrage the player watches from a cliff edge with Vireo: "…oh. *Oh.* That's what we do now?"
- **Objectives:** Primary — tag all 4 AA nests; survive to the observation point. Secondary — never break passive (full-ghost bonus); tag the hidden fifth nest (unmarked, found by reading terrain).
- **Failure states:** Player destroyed; Vireo destroyed (Recruit/Regular: ejects, mission continues, her arc dialogue adjusts; Ironline: permanent).
- **Teaches:** Passive sensor mode, Beacon Tagger utility, jump-jet descent control, protecting a weaker wingman.
- **Emotional job:** Mentorship. The player becomes what Ekene is to them. Vireo's awe at the strike is the player's own power reflected back — and her fragility plants the fear the campaign will later harvest.

#### M9 — Undertow

- **Setup:** Beneath the highlands, a flooded cavern gallery hides the fuel bunker feeding every Directorate patrol in the region. Go under, demolish it, get out. The underground set-piece.
- **Beats:** (1) Enter through a sinkhole lake — wading depth mechanics, hip-deep water slowing legs and masking thermals. (2) Cavern navigation by low-light and thermal, radar cluttered by stone; sound design carries the mission (dripping, sonar-like ping echoes, distant machinery). (3) Fight a garrison that fights *smart* in tunnels — Halites at corners, mines at chokes. (4) Rig the bunker: place three charges (interact hold) while the fireteam holds a perimeter the player positions — a command-rose exam. (5) The escape: collapsing gallery on a hard 3-minute timer, water surging, exit lit by flare sticks Sable dropped on the way in (quiet competence, characteristic of her). Detonation breaches the cavern roof; the player jump-jets out of the smoking doline.
- **Objectives:** Primary — destroy the fuel bunker; extract. Secondary — full fireteam extraction with zero structure damage to any member; find the flooded Directorate supply cache (salvage).
- **Failure states:** Timer expiry post-detonation; player destroyed; charge placement interrupted three times at any single point (garrison overruns the site).
- **Teaches:** Low-light/thermal switching, fighting in enclosed spaces where jump jets and long guns are liabilities, perimeter-defense orders.
- **Emotional job:** Claustrophobic awe. The signature biome's underworld. Cavern heat neutrality (×1.0) after the desert's ×0.8 lets the player *feel* the biome system in their heat bar. The roof-breach escape is a trailer moment.

#### M10 — Ropeway

- **Setup:** The clifftop garrison at Kettle Spur is supplied entirely by cargo **cable-cars**. Sever the ropeway, then storm the starving garrison from below — a two-act mission that turns geometry into strategy.
- **Beats:** (1) Act one, the valley floor: destroy three ropeway pylons while their car-mounted gun pods and escort skiffs fight back; falling cars become physics set-dressing and hazards. (2) The garrison, cut off, goes to emergency posture — searchlights, flares dropped into the valley. (3) Act two, the climb: an authored ascent route mixing jump-jet ledges and switchback ramps under plunging fire; Tremor takes the direct ramp drawing fire (his choice, in character) while the player picks the route. (4) Crest fight in the garrison yard — close, ugly, backlit by burning fuel. (5) The garrison commander attempts to flee by the last intact cable-car; the player chooses: shoot the cable (kill, least salvage, Rauk's voice notes the "execution") or leg the car's docking clamps (capture, best intel — feeds an extra recon overlay in M11).
- **Objectives:** Primary — sever the ropeway (3 pylons); take the garrison. Secondary — capture the commander; keep Tremor above 50% structure on the ramp.
- **Failure states:** Player destroyed; both ascent routes rendered impassable (only possible through repeated reckless demolition — telegraphed).
- **Teaches:** Fighting up and down gradients (torso pitch limits matter), plunging-fire cover logic, jump-jet fuel management on long climbs, mission-shaping micro-choice.
- **Emotional job:** Cunning. The Compact wins by understanding the ground the Directorate merely occupies. First time Rauk speaks directly to the player — cold, evaluating.

#### M11 — Kryce's Voice

- **Setup:** The Op3 capstone: the **propaganda broadcast citadel** crowning the highlands — the tower that pipes Kryce's face into every settlement feed. Destroying it doesn't just cut a signal; it tells the planet the Compact is real. **Colonel Rauk defends it in person** — her Corundum-V's first appearance.
- **Beats:** (1) Approach through the karst under the tower's rotating broadcast — Kryce's voice everywhere, discussing the "bandit problem" with silky contempt, occasionally addressing Lodestar by callsign. (2) Outer defense grid: turret belts, a mech lance, drone screens — the op's accumulated curriculum tested at once. (3) **Rauk engagement:** she fights the player directly — mobile, vicious, focused on the player's weak side facings; scripted to withdraw cleanly at 40% structure ("Adequate. We will do this again, Lodestar, when it matters."). She cannot be killed here on any difficulty; her withdrawal is authored to feel like *her* choice, robbing the player of closure on purpose. (4) Topple the citadel: destroy four anchor trusses; the tower falls in the campaign's biggest physics spectacle to date. (5) Every screen on the planet cuts to static, then to a shaky Compact camera: Ekene, delivering thirty seconds of quiet defiance to the whole world.
- **Objectives:** Primary — destroy the broadcast citadel. Secondary — force Rauk's withdrawal before she cripples any fireteam member; destroy the citadel's backup transmitter trucks before they scatter.
- **Failure states:** Player destroyed; all four trusses' demolition points expended without a topple (requires repeated total misuse; effectively a skill floor).
- **Teaches:** Boss-adjacent dueling against duel-AI-lite (Rauk previews M16's systems), sustained mixed-arms defense penetration.
- **Emotional job:** Defiance goes public. The war's turn becomes *visible to the world in-fiction*. Rauk's withdrawal leaves a splinter under the skin that M16 will pull out. Ekene's broadcast is the op-end emotional high — which the next op is built to shatter.

---

### Operation 4 — POLAR REFINERIES *(arctic night; heat bonus ×1.25, footing penalties)*

The dark mid-campaign. Tone: aurora, flare-light, breath-fog, and the series' gut-punch. Mechanically the most heat-generous biome — inviting aggressive loadouts — and the most treacherous underfoot.

#### M12 — Flare Stack

- **Setup:** Night raid on the Vask refinery field. The plan is Relay's best work: the refinery's own **flare towers** bloom hot enough to blank thermal sensors — walk the bloom shadows, and the grid sees nothing. Destroy the cracking units and choke Directorate fuel at the source.
- **Beats:** (1) Insertion across black ice — footing penalty tutorial: momentum carries, sharp turns slide, jump-jet landings need flare braking. (2) Bloom-hopping stealth: timed movement windows synced to flare cycles (each tower's cycle is readable on the HUD after Relay tags it); patrols pass within meters, blind. (3) Sabotage three **cracking units** — each placement drops local light and raises local alert differently, so order matters. (4) The third charge is discovered seconds before detonation: open fight in flare-lit snow, the raid's stealth economy converted into chaos honestly. (5) Withdrawal under a burning skyline; heat dissipation ×1.25 lets the player fire like never before, and the mission's finale is tuned to let them feel it.
- **Objectives:** Primary — destroy all 3 cracking units; extract. Secondary — reach the third unit without a general alert; no slip-fall knockdowns (footing mastery).
- **Failure states:** Player destroyed; extraction corridor lost to the quick-reaction force for over 3 minutes.
- **Teaches:** Ice movement, thermal-signature play from the *hiding* side (the player has spent three ops exploiting thermals; now they experience being the ghost), alert-economy planning.
- **Emotional job:** Mastery and swagger — deliberately. The player struts through the Directorate's own light. The campaign inflates confidence here so M13 can cut it down.

#### M13 — Icebound

- **Setup:** Compact engineers must cross the Sorrow's Span glacier bridge with the equipment that will keep the northern front alive through the winter. The Directorate knows. Ekene takes the field in her Corundum — the first time she fights beside the player. It is the last.
- **Beats:** (1) Escort across the glacier under intermittent artillery — displacement discipline from M7 retested on ice. (2) Wave defense at the span's midpoint while engineers cut anchor points; Ekene anchors the line like the veteran she is, her VO in-fight revealing more warmth and history than the whole campaign so far. (3) The **span collapse**: scripted artillery strike drops the central section; the convoy splits — engineers across, player's team astride the gap, and Ekene's Corundum on the *wrong side* with the enemy. (4) Ekene refuses extraction and covers the retreat — the player fights a delaying action watching her paper-doll degrade on the team readout, and *nothing they do can change it* (the mission quietly hard-gates the gap: jump-jet fuel is scripted-insufficient; CAIRN states it flatly: "Crossing is not achievable. I am sorry, Lodestar."). (5) Her Corundum goes down; the somber cue — solo cello lament — plays over live gameplay as Directorate recovery crews swarm the wreck. Relay, voice cracking for the first time: capture confirmed. **Ekene is taken alive.** (6) The survivors walk off the glacier in aurora light. No victory stinger. The mission-complete screen is silent.
- **Objectives:** Primary — engineers across (floor: 5 of 8 vehicles); survive the delaying action for the scripted duration. Secondary — none. This mission has no bonus objectives by design.
- **Failure states:** Engineer vehicles below 5; player destroyed. Ekene's capture is **not preventable** and is not a failure state; the game never pretends otherwise on replay.
- **Teaches:** Nothing new mechanically — deliberately. It is an exam of Op1–4 skills so that full attention lands on the story.
- **Emotional job:** The gut-punch. The campaign's midpoint wound. Every briefing after this is Relay carrying weight too heavy for him; every fireteam bark library shifts one shade quieter for the rest of Op4. The player's motivation for the back nine missions is forged here.

#### M14 — The Mag-Line

- **Setup:** Grief becomes work. Rauk ran the Icebound ambush from her **polar command train** on the magnetic freight line. Relay has found its window. The Compact cannot get Ekene back yet — but they can make the woman who took her bleed logistics. Intel from the wreck will reveal where Ekene is held.
- **Beats:** (1) Overland interception race across pack ice — the campaign's fastest traversal sequence, drift-running a light lance parallel to the train. (2) Rolling battle: board-and-breach is for infantry; mechs do it by *killing the train* — destroy escort skiffs, then the two flak cars, then subtarget the engine's mag-bogies at speed (the M5 crawler lesson at 90 km/h). (3) The train derails into the ice field — a huge, long, sliding physics wreck. (4) Assault the wreck: Rauk's guard fights a last stand around the command car; Rauk herself is *not aboard* (her voice, from elsewhere, acknowledging the player's work with something almost like respect — hatred deferred, again, to M16). (5) Relay strips the command car's cores live on comms and goes quiet, then: "…Found her. Spire Anchor. They took her to the *capital*, Lodestar." The campaign's endgame geography locks into place.
- **Objectives:** Primary — stop the train; seize the command car's intel cores intact. Secondary — derail the train with the engine bogey subtarget method (clean derail) rather than brute-force car destruction (preserves more salvage and the flak cars' weapons); destroy all escort skiffs before the derail.
- **Failure states:** Command car destroyed (cores lost — mission failure, the campaign's stakes tolerate no fallback here); train escapes the interception zone; player destroyed.
- **Teaches:** Fighting at maximum sustained speed, moving-target subtargeting, momentum management on ice at full throttle.
- **Emotional job:** Purpose out of grief. The op ends cold and burning at once: the player knows where Ekene is, knows the capital is coming, and has learned that Rauk is always one step away. Revenge is promised, not delivered — the campaign keeps its debts honest.

---

### Operation 5 — STORM COAST *(monsoon; drowned quarries; the town of Marrow Bay)*

The turn of the tide, in rain. Tone: grey water, courage, and the night the whole planet stands up.

#### M15 — Breakwater

- **Setup:** The Directorate moves to make an example of **Marrow Bay** — a fishing town that fed the Compact all winter. Civilian ferries are loading at the mole. Between them and the town: a naval **gun monitor** offshore, hover skiff squadrons, and shore-landing mechs, all in driving monsoon rain.
- **Beats:** (1) Arrival as the first shells walk across the harbor — immediate defense, no setup phase; rain (heat ×1.15) and wind-driven spray cut visibility to instinct and radar. (2) Layered threat management: skiffs harry the ferries (fast, weak), shore mechs push the mole (slow, hard), the monitor's main gun fires on a readable 40-second cycle that forces mid-fight repositioning of the *ferries* via a Relay-linked order. (3) Wade-out engagement against the monitor once the shore push breaks: hip-deep surf fighting, the M9 water lessons at scale. Killing the monitor requires subtargeting its turret ring or magazines through gaps in its low armored hull. (4) The last ferry clears the breakwater through shellfall; the mission scores each surviving boat by name, not number.
- **Objectives:** Primary — at least 3 of 5 named ferries survive; destroy the gun monitor. Secondary — all 5 ferries; the harbor crane survives (rebuilding-era flavor payoff in the epilogue).
- **Failure states:** Three ferries lost; player destroyed.
- **Teaches:** Multi-axis threat triage, weather-degraded sensor play, fighting from water, protecting moving civilian assets.
- **Emotional job:** Guardianship. After two missions of loss and revenge, the player *saves* people, by name, in the rain. The town's gratitude in the debrief is the campaign's warmth returning — and the reason the uprising in M17 feels earned.

#### M16 — Rauk's Wager

- **Setup:** Rauk broadcasts an open challenge on the Compact's own frequency: single combat, her Corundum-V against Lodestar, in the flooded pit of the Greywater drowned quarry. Relay smells the trap immediately — she is *stalling*, and demolition teams are moving toward Marrow Bay's sea-locks while the duel holds every Compact eye. The Compact takes the duel anyway, because refusing would cost the coast's belief in them. Win fast.
- **Beats:** (1) Descent into the quarry amphitheater — terraced stone, black water, wrecked excavators as cover; rain hammering; the duel-start stinger (single massive drum hit into silence). (2) **The duel:** full duel-AI debut (see §8.5) — Rauk reads the player's loadout, refuses their optimal range band, uses the terraces and water concealment, and manages her own heat with visible discipline. Scripted wound-threshold VO exchanges chart her contempt curving into fury as she loses. (3) Rauk dies in the pit — no withdrawal this time; her last line is contempt for Kryce, not the player. (4) **The race:** Relay breaks in — charges are set at the sea-locks, timer live. Full-throttle ascent out of the quarry and a sprint along the coast road, killing demolition-team vehicles at speed. (5) Disarm/destroy the three charge sites with seconds authored to feel closer than they are; the locks hold; Marrow Bay's lights stay on through the storm.
- **Objectives:** Primary — defeat Rauk; prevent the sea-lock demolition (all 3 charge sites). Secondary — win the duel without losing any limb; kill Rauk's Corundum-V by anything *other* than ammo cook-off (its salvage — her particle lance — is a campaign-best weapon).
- **Failure states:** Player destroyed; any charge site detonates.
- **Teaches:** Reading duel AI (range-band denial, heat-baiting — fire discipline makes her overextend), sprint-phase time management immediately after an exhausting fight.
- **Emotional job:** The debt from M11 and M13/14 is paid — and the payment is complicated on purpose: winning the duel is triumphant, discovering it was a stall is a cold plunge, and saving the locks anyway is the recovery. The player should end the mission breathing hard.

#### M17 — Signal Fires

- **Setup:** The spark meets the fuel. With Rauk dead and the coast held, the Compact calls the rising: one long night, three simultaneous fronts, the planet-wide uprising the whole campaign has been building toward. Op5's capstone and the campaign's longest single mission.
- **Beats:** (1) Nightfall briefing over the strategic map — the player chooses the order of three targets: the **Cassel fuel farm**, the **drone hangar** at Point Vane, and the **checkpoint chain** on the coast highway. (2) Each target is a distinct combat problem (fuel farm: demolition among explosion-chain hazards; drone hangar: kill it before its full wing launches — a hard-timer assault; checkpoint chain: a rolling four-node sweep with fireteam split orders). (3) **Dynamic reinforcements:** the Directorate's response strength migrates based on the player's route order and speed — hit the drone hangar first and the other two targets face no air; leave it last and fight under drones all night (the systems-mastery pillar expressed at strategic scale). (4) Between targets, radio traffic pours in from risings across the planet — some winning, some begging for help that cannot come tonight (authored, unanswerable; the war is bigger than the player). (5) Dawn: all three targets burning, the coast free, and the mission's last shot is the player's lance on a headland watching signal fires answer each other down the whole grey coastline.
- **Objectives:** Primary — destroy all 3 targets before dawn (generous global timer; the pressure is reinforcement migration, not the clock). Secondary — order-dependent bonuses (hangar-first: intact fuel-farm salvage; checkpoints-first: civilian column uses the open highway mid-mission); zero fireteam losses on the longest night.
- **Failure states:** Global timer expiry; player destroyed; two of three fireteam members down simultaneously (the line breaks).
- **Teaches:** Strategic sequencing, resource pacing across an extended sortie (one coolant flush, finite ammo, field repairs between targets), fireteam split management.
- **Emotional job:** The war turns — the pillar delivered at maximum. The player *chose the shape* of the rising's first night. The signal-fires closing image is the campaign's heart: they started alone in a stolen machine; now the whole coastline answers.

---

### Operation 6 — VELL ARCOLOGY *(dense urban verticality; collateral rules; the Choice)*

The capital. Tone: canyon streets, occupied civilians, and the campaign's moral fork. Collateral rules are live: occupied habitation blocks are marked on IFF and HUD, and Compact rules of engagement penalize (scrip, standing, and specific dialogue) damage to them — the Directorate exploits this shamelessly.

#### M18 — Understreets

- **Setup:** No army walks in Vell's front door. The Compact enters through the **storm drains** — mech-scale flood tunnels under the arcology — to seize an abandoned municipal garage as the underground forward base.
- **Beats:** (1) Tunnel insertion through the drain network (straight/curve/junction kit): tight, dark, thermal-and-lamplight navigation; drone pickets and sound-triggered sensors punish sloppy throttle work. (2) Junction fights against tunnel-garrison Halites — the M9 curriculum in mech-scale corridors. (3) Breach up into the garage from below; clear it room by room (mech-scale rooms: vehicle bays, gantry halls). (4) Hold the garage against the local response while Relay's crews pour in behind — the base literally assembles around the player during the fight (sandbags, generators, lights coming on bay by bay). (5) First rooftop-glimpse coda: the player rides the garage's heavy lift up for a single look across the arcology at night — Spire Anchor lit like a blade against the stormwall, impossibly far up. Somewhere in that tower is Ekene.
- **Objectives:** Primary — reach and secure the garage; hold until the base is established. Secondary — enter the garage undetected from below (tunnel-ghost); map all four drain junctions (unlocks alternate approach routes in M19/M21).
- **Failure states:** Player destroyed; base-establishment convoy destroyed in the hold phase.
- **Teaches:** Urban-underground movement, sound-discipline throttle work, the collateral-rules HUD language (introduced here where mistakes are cheap).
- **Emotional job:** Infiltration dread and awe. The city is the biggest thing the player has ever stood under, and it is *occupied* — lit windows, curfew announcements, Kryce's face on every public screen. Proximity to Ekene becomes a physical fact.

#### M19 — Counterweight

- **Setup:** The western districts are sealed by three **checkpoint fortresses** — hardened intersections with interlocking fields of fire that have strangled Vell for eighteen months. Crack them and the west rises like the coast did.
- **Beats:** (1) Three fortress assaults, each a distinct urban-tactics lesson: the **Trellis Gate** (vertical: jump-jet flanking via parking structures and skybridges), **Nine Columns** (armored: a Batholith emplacement demanding subtarget play through gaps), and the **Counterweight Yard** itself (combined: drone screen + turret belt + mech reserve, near occupied habitation blocks where every stray round costs). (2) Between fortresses, the districts visibly answer — barricades going up behind the player, civilians hauling Directorate signage down; risen districts contribute spotter intel (free enemy pings) for the rest of the op. (3) The third fortress triggers the Directorate's armored counterattack down the Grand Concourse — a street-fight climax the newly risen districts help channel with dropped barricades.
- **Objectives:** Primary — destroy all 3 checkpoint fortresses; defeat the Concourse counterattack. Secondary — zero habitation-block damage from player fire (rules-of-engagement mastery); Nine Columns' Batholith legged for salvage.
- **Failure states:** Player destroyed; the counterattack pushes through to the garage base.
- **Teaches:** Urban verticality (fighting up/down between street and skybridge levels), collateral discipline under pressure, leveraging risen-district intel.
- **Emotional job:** Liberation at street level — the campaign's macro turn made human-scale. The player fights *among* the people they've been fighting *for* all campaign, and the city physically changes behind them.

#### M20 — The Registry

- **Setup:** The Directorate's **data-registry** — the administrative brainstem of the occupation — sits in a hardened vault tower. Everything the Compact needs for the endgame is in it. Seize it.
- **Beats:** (1) Night assault on the registry tower's base defenses, using every risen-district advantage banked in M19. (2) Vault-crack hold: Relay works the intrusion in person from a crawler while the player holds the plaza against three escalating relief columns — the campaign's hardest pure defense, on a clock the player cannot see (Relay's progress is narrated, not metered, and his narration becomes the mission's tension instrument). (3) **The reveal, live on comms:** the registry opens and Relay finds two things at once. One: **Ekene's exact cell block** on Spire Anchor's holding decks — with a transfer order moving her off-world in days. Two: **override codes for the orbital defense guns** — the weapon that could break Spire Anchor's defenses from above. Then the trap in the data: acting on either one *burns the access*, and the Directorate's response to either raid makes the other target impossible. **You can only act on one.** (4) Exfiltration under drone pursuit while the argument starts over the radio — Tremor for Ekene, Sable (quietly) for the override, Vireo asking the question no one answers: "What would the Commander choose?" (Everyone knows: she'd choose the override. That's the problem.) (5) The mission ends at the garage base with the choice *not yet made* — the decision screen is the start of M21, after a full save point, with the fireteam's positions restated. No timer on the menu. The game waits.
- **Objectives:** Primary — hold the plaza until the vault opens; exfiltrate with Relay alive. Secondary — all three relief columns destroyed rather than merely repelled; the registry building intact (its records matter to the epilogue's rebuilding, either branch).
- **Failure states:** Relay's crawler destroyed; player destroyed; plaza overrun for 90+ seconds during any hold phase.
- **Teaches:** Extended defense pacing; nothing new — like M13, it clears mechanical bandwidth for narrative weight.
- **Emotional job:** The scales. This mission exists to make M21's fork *hurt*. The transfer order supplies urgency; the fireteam argument supplies stakes; Vireo's question supplies the knife. Op6's design goal — real hesitation at the choice screen — is won or lost here.

#### M21 — THE CHOICE *(two versions; the campaign forks)*

The player commits to one operation. The other is forfeited **permanently** and the game says so in plain text on the decision screen. Both versions are full missions of equal production quality; endings, epilogue VO, and final music differ by branch from here to the credits.

##### M21a — Extraction *(rescue Ekene; forfeit the orbital override — harder, hopeful)*

- **Setup:** A strike force punches up Spire Anchor's **holding decks** to take Ekene and the surviving Assembly ministers out — through the most fortified structure on the planet, with no orbital support, ever.
- **Beats:** (1) Elevator-freight insertion onto the lower holding decks — deck-by-deck fighting in anchor infrastructure (the M18 tunnel curriculum, vertical). (2) Cell-block approach with a hostage-rules constraint: Directorate wardens threaten prisoner decks; the player must kill warden armor *fast* (subtarget exam under the hardest pressure in the game) before executions begin. (3) **The reunion:** Ekene, eighteen months of iron unbowed, takes thirty seconds to assess, and then — as if she never left — starts issuing calm orders from a commandeered console: the mentor returned as ally. (4) Fighting withdrawal with the Assembly aboard a freight climber, the player as rearguard. (5) The forfeited override arrives as consequence, live: **orbital fire** starts landing on Compact positions across the city — the finale condition for Op7a. The dropbarge extraction happens under a burning sky.
- **Objectives:** Primary — Ekene and at least 4 of 6 ministers extracted; player survives as rearguard. Secondary — all 6 ministers; zero prisoner-deck casualties from player fire.
- **Failure states:** Ekene's climber destroyed; ministers below 4; player destroyed.
- **Teaches:** Everything, under maximum pressure; the hostage-rules beat is the subtargeting final exam.
- **Emotional job:** The heart's choice, paid for honestly — the sky itself turns hostile the moment you choose people over power, and the campaign makes you play the rest under that sky. Ekene's voice returning to the command net should raise hair on arms.

##### M21b — Override *(seize the orbital-gun codes; Ekene is moved off-world — easier, colder)*

- **Setup:** The override codes only work if keyed from the Directorate **gunnery college** — a fortified fire-control campus in the upper arcology. Take it, key the override, and turn the planet's own orbital guns against its occupiers.
- **Beats:** (1) Campus assault through fire-control radar lawns and instruction halls — a cleaner, more conventional military problem than 21a, deliberately (the "easier" branch is easier *because you chose the soldier's answer*). (2) Hold the keying array through a countdown the enemy fully understands — the Directorate throws its guard Batholiths at the array with open desperation on comms. (3) **The keying:** the player's own HUD gains the orbital-strike authority — a new, terrible weapon icon. First authorized strike is scripted on the college's own relief column: the game makes the player *use it* immediately, and watch. (4) The cost, live: Relay, flat and quiet, confirms Ekene's transfer shuttle lifted from Spire Anchor twenty minutes ago. Cell block empty. The channel stays open four seconds too long before he says "…copy" to nobody. (5) The mission ends with the stormwall on the horizon and the guns of the sky now pointing the player's way — Op7b's opening condition.
- **Objectives:** Primary — take the campus; key the override; hold until confirmation. Secondary — array undamaged (strike accuracy bonus for Op7b); guard Batholiths both legged (their gauss spines are the branch's best salvage).
- **Failure states:** Keying array destroyed; player destroyed.
- **Teaches:** The orbital-strike targeting interface (used in Op7b); holding under all-in assault.
- **Emotional job:** The head's choice, and its silence. No reunion, no returning voice — a weapon instead of a mentor. The branch is mechanically stronger and emotionally hollowed, and every design element (music: colder; barks: quieter; Vireo asks about Ekene once and is not answered) makes the player carry it.

---

### Operation 7 — SPIRE ANCHOR *(the finale; differs by branch throughout)*

The last three missions climb the anchor itself under a permanent lightning stormwall. Branch differences are woven through every mission, not just the ending: in the **21a branch**, Ekene's voice shares command with Relay and enemy orbital fire intermittently shells the battlespace (authored danger zones with warning language); in the **21b branch**, the player wields orbital strikes (limited authorizations per mission) and the command net is Relay alone, carrying it.

#### M22 — Blackout

- **Setup:** Spire Anchor is shielded by a ring of **shield pylons** that no weapon on the surface can outshoot. They can, however, be walked to and killed in the middle of the worst lightning storm the coast has ever produced — the stormwall that will also, in two missions, decide the ending's stage.
- **Beats:** (1) Storm insertion: lightning strobes replace reliable sight; radar ghosting from EM chaos makes the sensor suite — the player's oldest crutch — half-trustworthy at best. (2) Five shield pylons around the anchor's skirt, each defended and each killable by overloading its arrestor towers so *the storm itself* strikes it — the campaign's geology-and-weather-as-weapon thesis, final statement. (3) Branch texture: 21a — enemy orbital fire probes the skirt between lightning cells (move between authored shadows); 21b — the player may spend exactly two orbital authorizations of five total remaining, on any two pylons, trading finale resources for present ease (a real budget decision that carries into M23). (4) The fifth pylon drops the shield with a planet-audible harmonic; the anchor stands naked in the storm.
- **Objectives:** Primary — destroy all 5 shield pylons. Secondary — kill at least 2 pylons via arrestor-overload lightning (the storm-kill); full fireteam survival in the EM soup.
- **Failure states:** Player destroyed; a pylon's arrestor field fully repaired twice (repair crews must be interdicted — teaching the interdiction rhythm M23 needs).
- **Teaches:** Fighting with degraded sensors, weather-as-weapon interactions, branch-resource budgeting (21b).
- **Emotional job:** Awe and dread. The stormwall is the campaign's final antagonist-as-place. The shield falling is the point of no return, and the harmonic should be felt in the chest.

#### M23 — The Long Climb

- **Setup:** Up the anchor's exterior **terraces** — the mech-scale service ledges spiraling the tether base — to destroy the tether defense grid and stop **Director Kryce** from escaping up the elevator in his private climber.
- **Beats:** (1) Terrace-by-terrace ascent: the campaign's verticality curriculum (M10's climb, M19's levels) at monumental scale, with wind shear affecting jump-jet trajectories. (2) The tether defense grid — gun galleries built into the anchor face — must be silenced at four nodes; Kryce's personal guard **Batholiths** anchor the upper nodes (the named-variant pair, dorsal gauss spines lighting the storm). (3) Kryce on the open channel the whole climb: the patrician polish cracking by degrees, from silk to bargaining to something naked — the campaign's quietest villain finally audible as a man. (4) **The climber:** Kryce's escape vehicle starts its run mid-mission on a real, visible track up the tether. Branch resolution: **21a** — the player disables the climber's track clamps (M5's lesson, one last time: *intact*); the climber sails to a stop; Compact troops arrest Kryce on camera, and Ekene's voice reads him the Assembly's charge sheet as the storm howls. **21b** — with no capture infrastructure and orbital authority in hand, the climber becomes the player's final authorized strike or gun solution; Kryce dies fleeing, mid-sentence, and the silence after is its own verdict. (5) The terrace-top: the anchor plate above, the storm around, one signature left on the war.
- **Objectives:** Primary — silence all 4 tether-grid nodes; stop Kryce's climber (branch method). Secondary — defeat both guard Batholiths without limb loss; (21a only) climber stopped with zero hull damage; (21b only) at least one orbital authorization still unspent (it is *not* usable in M24 — the discipline is symbolic, and the epilogue notes it).
- **Failure states:** Kryce's climber escapes the tether's lower span; player destroyed; two grid nodes retaken by repair crews simultaneously.
- **Teaches:** Wind-modified jump-jet play; everything the campaign taught about *how* to kill converging on one machine that must be stopped a specific way.
- **Emotional job:** Judgment. The system that occupied a world is decapitated — by law (21a, hopeful: the world gets a trial) or by war (21b, colder: the world gets an ending). Either way, the player looks up and there is exactly one thing left between them and dawn.

#### M24 — Reclamation

- **Setup:** The anchor plate — the flat colossal summit deck at the tether root. The stormwall jams all comms: no Relay, no fireteam, no Ekene, no music but the wind. Out of the far stair walks one machine, alone: **Marshal Edrik Sol** in the prototype **Craton-X**, coolant lattice glowing through the rain. The man who sold out the Assembly, come to settle the account in person. He offers no broadcast. He raises one arm in an old soldier's salute. The duel-start stinger — a single massive drum hit — and then silence and rain.
- **Beats:** (1) **Pure 1v1 duel, no tutorial text, no objective ticker beyond a single word: DUEL.** The Craton-X duel AI (§8.5) reads the player's loadout and history (aggregate stats from the campaign inform its opening posture), fights in range bands, uses the plate's sparse cover (tether root, service massifs), respects its own heat with visible, telegraphed discipline — the enemy the entire game trained the player to be. (2) Scripted wound thresholds trigger the campaign's last VO exchanges — Sol speaks clean over open air at conversational distance, the radio futz gone: why he did it, what he thought he was saving, and finally, without begging, what he hopes comes after. CAIRN's damage litany against Sol's tired baritone is the finale's whole soundscape. (3) The Craton-X goes down not with a fireball but with the shutdown-slump animation — kneeling, powering down, rain on cooling armor. Sol's last transmission is four words of surrender to the *Assembly*, not to Lodestar. (4) The stormwall breaks — authored, immediate: light through the wall as comms roar back in, every channel at once, the whole planet calling. (5) **Ending by branch.** **21a:** dawn ceremony at the anchor plate — Ekene, restored Assembly at her back, addressing the free world; the fireteam in a ragged parade line; the "dawn hymn" strings; the litany's final grace note as the player powers down for the first time by *choice*. **21b:** the memorial ending — a quieter dawn, stone markers on the plate for the ones the war took and the one it took *away*; Relay reads the names; the cold sparse piano over the main theme's cello; the campaign ends on the empty seat the player chose to leave empty. Both epilogues carry full VO and distinct final music.
- **Objectives:** Primary — defeat the Craton-X. There are no secondaries. There is nothing else on the plate.
- **Failure states:** Player destroyed. (Eject is available; the campaign's eject-continue rule is suspended for the finale — the duel restarts from the salute. The finale is the one fight the war cannot absorb losing.)
- **Teaches:** Nothing. It *examines* everything — heat, range, subtargets, footing, patience — with no interface training wheels. The deep-impression checklist requires this duel to need no tutorial text; if a playtester is confused here, the previous 23 missions have failed and must be fixed *there*.
- **Emotional job:** Consummation. The litany that opened M1 opens M24 and must land harder, not softer. One machine, one pilot, one plate, rain. Then the sky opens, and the war the player felt turning finishes turning — into whichever dawn they chose.

---

### 3.1 Campaign-wide structural notes

- **Fireteam availability by mission:** solo M1–M2; Sable from M3; Tremor from M6; Vireo from M8; full trio thereafter except authored exceptions (M16 duel and M24 are solo by fiction; M21a/21b field the full trio).
- **Permadeath continuity (Ironline):** dead fireteam members are acknowledged in all subsequent briefings and their barks are absent; replacement pilots are *not* provided (thinner fireteam is the consequence).
- **Save structure:** checkpoint saves at authored beats; mid-mission saves disabled on Ironline; M20→M21 boundary is a full save + branch bookmark (one bookmark only — no branch-scumming within a campaign slot; players wanting both endings replay from the bookmark on a copied slot, which the UI offers once, clearly).
- **Salvage flow:** salvage screens run post-mission; field salvage interactions during missions mark claims. Convoy/intact-capture missions (M5, M10 option, M14, M23a) feed bonus chassis/weapons per their objective outcomes.

---

## 4. Core Gameplay Systems

### 4.1 Piloting model

The sim's spine. Legs and torso are separate control domains:

- **Throttle (W/S):** sets target velocity on a stepped ladder (reverse −40% … 0 … 100%). S below zero enters reverse. Throttle response — the lag between ordered and actual speed — scales with tonnage: a Flint answers in under a second; a Craton takes several. This lag is the Weight pillar's primary lever and is never reduced below feel-threshold for balance reasons.
- **Leg steering (A/D):** yaw rate scales inversely with tonnage and is degraded by leg damage. Turning at speed carries lateral inertia; heavy chassis drift wide.
- **Torso/arm aim (mouse):** free within a per-chassis twist arc (light chassis ~±120°, assault ~±70°; exact values in content JSON per chassis), independent of leg facing. **C** recenters torso to legs. Twist rate is a chassis stat and is reduced by gyro crits.
- **Jump jets:** on chassis so equipped (Flint, Skarn per roster; others by hardpoint fiction). Fuel gauge regenerates when grounded; burns for launch, sustains, and landing flare. Landing above safe velocity risks leg structure damage and knockdown; landing on a slope beyond tolerance causes a slide.
- **Footfall & knockdown:** every footfall emits camera-shake and audio scaled by tonnage (also the enemy-detection acoustic signature in stealth contexts). Knockdown occurs from scripted heavy impacts, slope failures, over-speed collisions, and certain heavy weapon staggers; recovery is an authored get-up animation during which the mech is vulnerable — the sim's harshest fair punishment.
- **Terrain interaction:** water (wading slows legs, masks thermals, blocks jump jets at depth), ice (traction penalty; momentum carries — Op4), slopes (speed and stability modifiers), and biome heat multipliers (§4.2).

### 4.2 Heat

- Every weapon adds heat on fire; the mech dissipates continuously via heat-sink count × biome multiplier:

| Biome | Dissipation multiplier |
|-------|------------------------|
| Arctic (Op4) | ×1.25 |
| Salt desert (Op2) | ×0.8 |
| Caverns (Op3 underground) | ×1.0 |
| Storm rain (Op5, storms elsewhere) | ×1.15 |
| Temperate baseline (Op1, Op6, Op7 non-rain) | ×1.0 |

- **Redline → auto-shutdown:** exceeding redline triggers emergency shutdown: the mech is helpless for **4–6 seconds** with a full dramatic power-down/power-up audio sequence (turbine deceleration, dead cockpit, restart). This must be *terrifying* mid-fight — the audio and lighting sell it.
- **Override (hold O):** rides past redline at the cost of internal structure damage per second plus a rising ammo cook-off chance. Legitimate expert play; visibly dangerous.
- **Coolant flush (F):** if a Coolant Flush Pod is equipped, one use per mission dumps a large fixed heat quantum instantly (venting cloud VFX). Utility-slot opportunity cost is the balance.
- The heat bar with redline mark is a permanent HUD element; CAIRN delivers escalating heat callouts (systemic bark library).

### 4.3 Damage model

- **Zones:** Head, Center Torso (CT), Left/Right Torso (LT/RT), Left/Right Arm (LA/RA), Left/Right Leg (LL/RL). Armor per zone (player-allocated in Assembly Bay), internal structure behind each.
- **Criticals** (rolled on internal-structure hits): weapon destroyed, actuator damage (reduced twist/turn/aim rates), gyro damage (aim sway, knockdown susceptibility), ammo cook-off (chain-detonates stored ammo into internal damage — the salvage-worst kill), sensor damage (radar/thermal fuzz).
- **Limb consequences:** arms shear off with their hardpoints — physics debris and spark showers, weapons gone for the mission. One leg destroyed: speed cap + limp animation. Both legs: kill. Side-torso destruction takes its attached arm with it. Head destruction: kill (headshot preserves the rest — salvage-best along with legging).
- **Player destruction:** the pilot ejects; the campaign continues; the mech is lost unless the mission outcome allows Compact recovery. On Ironline plus limb-loss sim toggle, all of the above applies to the player at full harshness.
- **Persistence:** limbs stay off for the mission (Consequence pillar). Field repairs at authored points restore fractions of armor/structure, never lost limbs.

### 4.4 Sensors & targeting

- **Radar ring** with IFF coloring (colorblind-safe alternative palette ships at 1.0); **passive mode (P)** — no emissions, reduced detection of you, bearings-only contacts; **vision modes (V):** standard / thermal / low-light.
- **Targeting:** R cycles targets, T targets under reticle, E cycles subtargets on the current target (zone-level: aim at the leg, the arm, the ammo-fed torso). Target paper-doll shows zone damage.
- **Fire control:** lock-on diamond (time-to-lock) for Swarm Racks; ballistic lead reticle for projectile weapons computing target motion.
- **Utility layer:** ECM Veil (lock/sensor degradation bubble), Beacon Tagger (paints targets for allied strikes/orders), Sensor Mast (deployed elevation of your sensor horizon), Smoke Discharger (LOS denial that also blocks your own thermals honestly).

### 4.5 Fireteam AI & command

- Up to 3 wingmates with distinct combat personalities (Sable: range and patience; Tremor: closing and pressure; Vireo: cautious early campaign, assertive late — her AI parameters literally shift with her arc).
- **Command rose (F1–F4):** Form Up / Attack My Target / Hold Position / Move To (map or reticle point). Orders are acknowledged in-voice with personality barks; unfulfillable orders are declined with reasons ("No path, Lodestar.").
- Fireteam members manage their own heat, take real damage on the same model, can be legged, can eject, and on Ironline die permanently — with the campaign acknowledging it (§3.1).

### 4.6 Salvage economy & Assembly Bay

- **Kill-condition salvage:** destroyed enemies yield chassis/weapon salvage percentages by *how* they died — legged or headshot kills yield best; CT-core kills middling; ammo-explosion kills least (the wreck is confetti). This makes marksmanship an economic act (Consequence pillar; taught at M2/M5).
- **Scrip:** mission bonuses pay scrip for repairs, ammo, and market purchases where fiction allows; salvage is the primary chassis/weapon acquisition path — you fly what you take.
- **Assembly Bay:** between missions. Fixed typed hardpoints per chassis (Energy/Ballistic/Missile/Utility at fixed sizes — no slot conversion), armor tonnage slider per zone, heat-sink count, hard tonnage budget per chassis. Loadout presets (save/name/apply). Field-repair look toggle (patched mismatched plates vs. cleaned finish — pure cosmetics, Compact identity).
- No weapon crafting, no rarity tiers, no stat rerolls: a Blaze Laser M is a Blaze Laser M. Depth lives in configuration, not itemization.

### 4.7 Difficulty & sim options

- **Difficulties:** Recruit / Regular / Veteran / **Ironline** (fireteam permadeath; no mid-mission saves). Difficulty scales enemy competence/accuracy/aggression — never bullet-sponge HP inflation on the player-facing damage model, which stays honest at all tiers.
- **Sim toggles** (independent of difficulty; default per difficulty, freely adjustable except on Ironline where all are forced on): player limb-loss, ammo cook-off, friendly fire, HUD minimalism (progressively diegetic-only HUD).
- **Accessibility (M3 milestone commitments):** full input rebinding + gamepad, subtitles with speaker tags, colorblind-safe IFF modes.

---

## 5. Mech Roster

Twelve chassis, geology-named, spanning 25–100 tons. All appear on both sides (Directorate factory-grey/amber vs. Compact patched-salvage skins).

| Class | Name | Tons | Speed (km/h) | Hardpoints | Role |
|-------|------|------|--------------|------------|------|
| Light | **Flint** | 25 | 118 | 2E, 1U | Recon |
| Light | **Pumice** | 30 | 108 | 1E, 2M | Harasser |
| Light | **Skarn** *(starter)* | 35 | 97 | 1B, 1E, 1M | Skirmisher |
| Medium | **Chert** | 40 | 86 | 2M, 1E, 1U | Fire support |
| Medium | **Halite** | 45 | 81 | 2B, 1E | Brawler |
| Medium | **Gabbro** | 55 | 76 | 2E, 1B, 1M | Workhorse |
| Heavy | **Basalt** | 60 | 70 | 2B, 2E | Line-breaker |
| Heavy | **Dolerite** | 70 | 63 | 4M, 1E | Missile boat |
| Heavy | **Corundum** | 75 | 61 | 2E, 1B, 1M, 1U | Command |
| Assault | **Orogen** | 80 | 55 | 3B, 1M | Juggernaut |
| Assault | **Batholith** | 90 | 49 | 2B, 2E, 2M | Siege |
| Assault | **Craton** | 100 | 44 | 3E, 2B, 1M | Apex |

*(E = Energy, B = Ballistic, M = Missile, U = Utility.)*

### Per-chassis role notes

- **Flint (25t, recon):** Reverse-joint digitigrade legs, antler-like branching sensor mast, calf jump jets. The eyes of a lance: fastest chassis, best passive-sensor platform (fiction: the mast), and the Utility slot makes it the natural Sensor Mast / Beacon Tagger carrier. Fragile by design — a Flint that gets shot has already failed.
- **Pumice (30t, harasser):** Pockmarked ablative plating, twin shoulder rocket pods. Dumbfire Rocket Pod drive-bys and displacement; teaches hit-and-fade. Sable's early-campaign ride.
- **Skarn (35t, starter/skirmisher):** Wedge raptor-skull cockpit, calf jump-jet nacelles, one of each weapon type. The teaching chassis: every system in miniature. Deliberately never obsolete — a well-flown late-campaign Skarn remains viable for players who bond with it (M1's machine matters).
- **Chert (40t, fire support):** Crouched stance, boxy back-rack silos. Swarm Rack platform with an Energy backup and a Utility slot for the Beacon Tagger — the indirect-pressure specialist that rewards lock-on discipline and spotter play.
- **Halite (45t, brawler):** Squat, very wide shoulders, riot-shield left forearm (fiction for its strong LA armor profile). Scattergun/AC knife-fighter; the tunnel and street champion (M9, M18). Tremor's signature machine.
- **Gabbro (55t, workhorse):** Upright, balanced, dependable — the "soldier proportions" silhouette. One of everything plus doubled energy; the roster's baseline against which all balance is sanity-checked. The Directorate's most common line mech; the player's first field salvage (M2).
- **Basalt (60t, line-breaker):** Hexagonal columnar armor motif, twin arm autocannons. The push chassis: walks through fire trading ballistic volume, anchoring assaults (and enemy sniper lances, M6).
- **Dolerite (70t, missile boat):** Cathedral banks of vertical launch tubes, rear stabilizer spurs. 4M saturation platform; devastating with locks and a spotter, near-helpless when rushed under ECM — the roster's clearest strength/weakness statement (and M7's indirect-fire antagonist).
- **Corundum (75t, command):** Asymmetric sensor crown, particle-cannon arm with cooling fins, officer's silhouette. The all-domain command chassis: unique 4-type hardpoint spread. **Ekene's old chassis** — she fights in it in M13, and Rauk's personal **Corundum-V** variant (M11/M16) is its dark mirror. Emotionally the roster's heaviest machine.
- **Orogen (80t, juggernaut):** Forward-hunched piston gait, cannon arms, eye-slit head deep in the chest. 3B alpha-brawling: walking artillery that arrives like a verdict. Teaches assault-tonnage patience (55 km/h is a commitment).
- **Batholith (90t, siege):** Twin dorsal gauss spines, hip drum magazines, fortress mass. The long-kill chassis: Gauss Driver platform with missile self-cover. Kryce's guard pair (M23) are the named variants. Positional play at its purest — where a Batholith stands *is* its skill expression.
- **Craton (100t, apex):** Monolithic slab torso, three chest energy apertures, colossal column legs, "terrifying stillness." The endgame prize and the campaign's final adversary as **Craton-X** (glowing coolant lattice, prototype markings, unique duel AI). Slowest thing on the field and the reason everything else runs.

---

## 6. Weapons

Design language: every weapon states a rhythm (heat, reload, projectile behavior) that the player internalizes. No weapon is strictly superior; each is best somewhere on the range/heat/tonnage surface. Numeric stats live in content JSON; this section fixes each weapon's *intent*.

### Energy *(no ammo; heat-expensive — the heat system's primary customers)*

- **Blaze Laser S / M / L:** The baseline beam family. Instant-hit, honest, range-tiered. S is a light backup that barely warms the bar; M is the workhorse trade of heat for reliable zone damage; L is the long-sightline scalpel (Op2's star) whose heat cost enforces firing discipline. Intent: the weapons that *teach heat*.
- **Pulse Array:** Burst of short beams; higher DPS-in-window, higher heat-per-second, forgiving of imperfect tracking (burst spread). Intent: the brawl-range energy option; pairs with Halite/Gabbro aggression.
- **Particle Lance:** Heavy single bolt with concussive delivery plus a **sensor-flicker** debuff on the victim (targeting fuzz for a few seconds). Big heat, big punch, visible bolt travel. Intent: the duelist's statement weapon — Rauk's arm-mounted signature, and salvageable from her (M16 secondary).

### Ballistic *(ammo-fed; heat-light; cook-off risk is the tax)*

- **Scattergun:** Mech-scale close-range cone. Devastating inside 150m against opened structure; useless at range. Intent: tunnel/street queen; crit-fisher on exposed internals.
- **Autocannon 40 / 80 / 120:** The hammer family. AC/40 is a fast-cycling pressure gun; AC/80 the mid trade; AC/120 a slow, staggering line-breaker round with real lead requirements. Intent: sustained honest damage limited by ammo logistics, not heat — the counter-rhythm to energy play.
- **Gauss Driver:** Charge-up (hold-to-charge, release), flat hypersonic trajectory, brutal single-hit damage, near-zero heat, severe ammo weight, and a magazine that cooks off *hard*. Intent: the sniper's discipline weapon and the Batholith's reason to exist; charge-hold timing is a skill ceiling all its own.

### Missile *(ammo-fed; indirect volume; countered by ECM and smoke)*

- **Rocket Pod 8 / 16:** Dumbfire salvos, unguided, cheap, fast to fire. Skill-expressed through aim prediction at speed (Pumice drive-bys). Intent: burst pressure with no lock dependency.
- **Swarm Rack 10 / 20:** Lock-on flights (lock diamond); arcing group tracks that saturate zones rather than sniping them. Intent: the fire-support economy — locks take time, ECM breaks them, terrain shadows them; the Chert/Dolerite backbone.

### Utility *(the fourth economy: one slot, many answers)*

- **ECM Veil:** Local bubble degrading enemy locks/sensor quality. Intent: the missile answer and the stealth enabler (M8, M12).
- **Beacon Tagger:** Paints targets for allied fire and strike calls. Intent: force-multiplication; the recon fantasy's trigger (M8's rocket strike).
- **Coolant Flush Pod:** One emergency heat dump per mission (§4.2). Intent: the alpha-strike enabler and the redline insurance policy — carried instead of, never alongside, other answers.
- **Sensor Mast:** Deployable elevated sensor horizon. Intent: the overwatch/defense pick (M7, M20 holds).
- **Smoke Discharger:** LOS-denial cloud that blocks thermals both ways. Intent: the honest disengage button; skill is in knowing which side of the smoke you win on.

---

## 7. Controls & HUD

### 7.1 Controls (default bindings; full rebinding + gamepad support ship at 1.0)

| Input | Function |
|-------|----------|
| W / S | Throttle up / down (S past zero = reverse) |
| A / D | Leg turn |
| Mouse | Torso/arm aim (within chassis twist arc) |
| C | Recenter torso to legs |
| Space | Jump jets (hold) |
| 1–6 | Fire weapon group |
| \\ (backslash) | Toggle chainfire on current group |
| O (hold) | Heat override |
| F | Coolant flush (if equipped) |
| R | Cycle targets |
| T | Target under reticle |
| E | Cycle subtarget |
| V | Cycle vision modes |
| P | Passive sensors toggle |
| Tab | Tactical map |
| F1–F4 | Fireteam command rose |

### 7.2 HUD *(diegetic-leaning; everything corresponds to a machine truth)*

- **Paper-dolls:** self and target zone/armor/structure readouts.
- **Heat bar** with redline mark and override zone.
- **Radar ring** with IFF (colorblind-safe modes).
- **Weapon-group panel:** per-group weapons, ammo, ready-state, chainfire flag.
- **Throttle ladder + twist indicator** (leg facing vs. torso facing at a glance).
- **Lock diamond + lead reticle** per fire-control (§4.4).
- **Command rose** overlay on F-key hold.
- **Objective ticker** (suppressed in authored moments — M24 shows one word).
- **Cockpit view (default):** fully modeled interior; physical warning lamps correspond to real system states (a lamp is never decoration); CAIRN speaks clean/un-futzed in-cockpit. **Chase cam** available; HUD-minimalism sim toggle strips non-diegetic elements progressively.

---

## 8. Enemy & AI Design

### 8.1 Enemy classes

- **Drones:** cheap aerial harassers; teach target-class triage; die to anything, punish ignoring them.
- **Tracked armor (incl. "Ferric" APC):** ground volume; APCs deploy infantry-scale objectives fiction but fight as vehicles.
- **Hover skiffs:** fast fan-in-hull gunboats; flanking speed threat, weak when tracked.
- **Turrets:** twin-autocannon pop-ups; positional punctuation marking fortified space.
- **Strafing aircraft:** run-based attackers with warning telegraphs; the anti-loitering incentive.
- **Mechs:** the same 12-chassis roster in Directorate grey/amber, configured per doctrine (factory-standard loadouts, by-the-book tactics — the contrast to the Compact's improvisation is a storytelling device).

### 8.2 Behavior model

State machine: **patrol → investigate → engage → flank → retreat-to-repair.** Investigation is honestly sensor-driven (acoustic footfalls, EM emissions, visual contact — the same signature model the player's stealth relies on, so stealth never feels arbitrary). Doctrine layer: heavies anchor and hold lines; lights circle for rear arcs; lances maintain rough mutual support.

### 8.3 Heat honesty *(signature AI feature)*

AI mechs run the same heat model, **respect their own heat, and back off to cool — visibly telegraphed** (weapon downshift, disengage posture, venting VFX). This is a core fairness statement and a skill-reading opportunity: a cooling enemy is an opening, and veteran players fight the enemy's heat bar as much as its armor.

### 8.4 Named-pilot variants

- **Rauk's Corundum-V** (M11 scripted-withdrawal encounter; M16 duel): mobility-tuned Corundum, Particle Lance arm, aggressive flanking profile.
- **Kryce's guard Batholiths** (M23, pair): siege anchors with overlapping gauss lanes; fought as a positional puzzle.
- **Sol's Craton-X** (M24): unique prototype — glowing coolant lattice (fiction for its superior heat curve), full duel AI, the game's final examination.

### 8.5 Duel AI *(M16, M24)*

Beyond the standard state machine: reads the player's **loadout** on engagement start (range-band denial vs. their optimal envelope), fights across **range bands** deliberately, uses **terrain cover** with intent (Rauk: quarry terraces and water; Sol: anchor-plate massifs), manages its own heat with telegraphed discipline, and fires **scripted wound-threshold VO exchanges** that chart the duel's emotional arc. Sol's variant additionally seeds its opening posture from campaign-aggregate player stats. Requirement (deep-impression checklist): the final duel must need **no tutorial text** — every behavior must be readable through systems the campaign already taught.

---

## 9. Tech Targets & Performance Budgets

### 9.1 Stack

- **TypeScript + Vite.** Three.js **WebGPURenderer** with **WebGL2 fallback**. **Rapier** physics (WASM). **bitECS** entity architecture. **Web Audio** (no middleware; radio-futz chain per audio bible: HP 250Hz → LP 3.2kHz → light waveshaper → 4:1 compression → squelch clicks; CAIRN and cinematics clean). **IndexedDB** saves. **All game data as JSON content files.**
- Source layout: `/src/{engine,sim,ai,ui,audio,content}` — sim fully deterministic and renderer-agnostic (Phase-2 multiplayer insurance and replay/test enabler).

### 9.2 Performance targets

- **60 fps at 1440p on RTX-3060-class hardware** (locked; the deep-impression checklist's hard perf line).
- Quality tiers: **Ultra / High / Medium / Potato.**
- **Ultra tier:** native 4K HDR ACES tonemapping, 4-cascade 4096px shadows, GTAO, TAA, bloom, volumetric fog + light shafts, GPU particles, decal persistence, heat-shimmer, wet-surface + rain response, snow shader, tracers that light terrain.
- **Potato tier:** must remain a *simulator* — all sim systems intact; only presentation degrades.

### 9.3 Budgets

| Budget | Target |
|--------|--------|
| Hero mech geometry | ≤120k tris LOD0 → 40k LOD1 → 12k LOD2 |
| Draw calls | <1,500 per frame |
| Initial download | <150 MB (operations streamed thereafter) |
| Terrain | 2–4 km² heightmap chunks, 4-layer splats, impostors for far detail |
| Textures | KTX2/Basis universal |
| Meshes | Draco / Meshopt compressed GLB |

### 9.4 Asset pipeline (Tripo3D)

Per asset: 4 seed generations → best-silhouette selection → retopo/UV in Blender → normal bake → PBR pass (Tripo base textures, hand-repainted wear) → rig (auto-rig bipeds; verify knees and torso-twist ranges against §4.1 arcs) → animation set → GLB + Draco. **Required animation set per mech:** idle sway, walk, run, turn-in-place, jump-jet launch/land, per-arm fire recoil, hit flinch L/R, leg-loss stumble + limp loop, shutdown slump, power-up rise, death collapse A/B. All mech prompts append the global style suffix verbatim (original-design clause included); vehicles/props per the established prompt list; cockpit interior is its own hero prop. Terrain is engine-side (heightmaps/splats); cities kit-bashed from arcology modules.

### 9.5 Audio & music systems

- **VO plan:** 24 briefings (60–90s), ~40 scripted trigger lines per mission, ~120 shared systemic barks (heat warnings, component loss, kill confirms, low ammo, fireteam status), branch-specific Op6/7 scenes, two full epilogues, startup litany every mission. Dry 48kHz WAV masters, radio coloration in-engine, dialogue −16 LUFS, 3 takes per line. Voices designed from text (never cloned) per §2.3 directions.
- **SFX:** layered 2–3 per event from the prompt library (footsteps ×3 tonnage variants × 4 surfaces; servo articulation; collapse; full weapon set; damage/systems including the 5s shutdown/restart turbines; ambience and UI set).
- **Music (adaptive):** hybrid orchestral-industrial; D minor; 96/112 BPM; 8/16-bar seamless loops. Main theme 2:30 (lone distorted cello → war-drum groove 0:40 → heroic-tragic brass 1:20 → anvil climax → cello). 5 biome ambient loops; 3 combat layers at 112 BPM (L1 muted string ostinato + toms; L2 + taiko + brass stabs; L3 full frenzy — shrieking brass clusters, anvil industrial). Stingers: mission complete (6s brass lift), failed (collapsing cluster), Ekene down (solo cello lament, 20s — M13), duel start (single massive drum hit into silence — M16/M24), 21a "dawn hymn" hopeful strings, 21b cold sparse piano over the main-theme cello. **Vertical layering:** ambient always on; combat layers keyed to threat state; music ducks −6 dB under VO; duel missions run exclusive scripted cues.

---

## 10. Production Milestones M0–M3

### M0 — Vertical Slice

One greybox Breaker Coast mission. Skarn vs. enemy Gabbro. **Full** piloting model, heat, zone damage, limb loss. CAIRN litany implemented with first ElevenLabs voice pass. *Exit criteria:* the Weight pillar is provable in greybox — testers describe the machine as "heavy" unprompted; the litany already lands.

### M1 — Systems Complete

Assembly Bay, salvage economy, fireteam AI + command rose, sensors/subtargeting complete, save system, all four difficulties + sim toggles. *Exit criteria:* the full gameplay loop (mission → salvage → refit → mission) runs on greybox content; Ironline is playable end-to-loop.

### M2 — Content Complete

All 7 operations / 24 missions playable; all 12 mechs with full animation sets; full VO recorded and implemented; adaptive music system with all cues; **both** M21 branches and branch-differentiated Op7 + endings. *Exit criteria:* campaign completable on all difficulties, both branches, no placeholder content.

### M3 — Polish & Ultra

Full post-processing suite, weather set-pieces (M15 monsoon, M22 stormwall), decal persistence, performance to target (60/1440p/3060-class locked), accessibility complete (rebinding, subtitles with speaker tags, colorblind IFF). *Exit criteria:* the deep-impression checklist (§11) passes in blind playtests.

**Phase 2 (post-1.0):** multiplayer. No 1.0 feature may compromise for it beyond the sim/render separation already mandated.

---

## 11. Deep-Impression Checklist

The ship gate. Each item is testable and is tested blind (players who haven't seen the checklist):

1. **The litany gives goosebumps on M24 as on M1.** Same read, greater weight; if familiarity has dulled it, the campaign's pacing has failed somewhere upstream — fix upstream.
2. **First-time players instinctively slow their fire at high heat** — without being told to — by end of Op1. The heat UI/audio language teaches through consequence, not text.
3. **A blown-off leg = debris + stumble + bark + salvage: one action, five payoffs** (physics spectacle, animation, VO reaction, tactical change, economic result). Verify every payoff fires every time.
4. **Each biome is identifiable from one screenshot and one second of ambient audio.** Tested literally, as described.
5. **The Op6 choice provokes real hesitation.** Measured: median decision time on the M21 screen, plus post-test interviews. If most players decide instantly, M20 has failed and is rewritten.
6. **The final duel needs no tutorial text.** No new interface elements in M24; every Sol behavior readable through prior teaching.
7. **Locked 60 fps on mid hardware** (1440p, RTX-3060-class) through the worst case (M17 triple-front, M22 stormwall).
8. **Ultra-tier screenshots get shared unprompted.** The vanity metric that isn't: if testers don't screenshot the salt flats at dawn or the stormwall over the anchor on their own, the art hasn't hit.

---

*End of document. Downstream artifacts — content JSON schemas, mission scripts, VO line sheets, asset prompt sheets — derive from this GDD and must cite the section they implement.*
