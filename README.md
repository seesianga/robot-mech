# VEYRA PRIME

*Working folder name "MechWarrior" — note that name is an existing franchise's trademark, so the
shipping title must go through the same trademark pass the spec already requires for mech names.
Everything inside is 100% original IP: the world, factions, characters, chassis, weapons, VO, and audio.*

> **Production plan (adopted 2026-07-29).** This project is converging on a single set of standards
> for the 18-month production run. Read [docs/CONVERGENCE_PLAN.md](docs/CONVERGENCE_PLAN.md) first —
> it carries the scope trade, the budget, the milestones and the definition of done. Its three
> companion standards are normative in their domains:
> [LIGHTING_STANDARD.md](docs/LIGHTING_STANDARD.md) ·
> [PIPELINE_STANDARD.md](docs/PIPELINE_STANDARD.md) ·
> [PLATFORM_STANDARD.md](docs/PLATFORM_STANDARD.md).
>
> **Before doing anything else, run `ops/scripts/bootstrap.sh`.** This tree is not yet under
> version control; the script creates the repository, moves the working tree off the Drive mount,
> and is the only supported way to start work.

A single-player, browser-based **giant-robot combat simulator** — you pilot multi-ton walking war
machines for the Free Veyran Compact, liberating the occupied mining world Veyra Prime from the
Karst Directorate across a 24-mission campaign.

**This repo contains the FULL 24-MISSION CAMPAIGN**: **BASIC TRAINING** — an input-gated
controls tutorial on the Saltglass Cove calibration pad (29 data-driven steps across phases
A–H, docs/tutorial-design.md) — plus all seven operations of the liberation: Op 1 Breaker
Coast (M01–M03, hand-scripted), then the data-driven arc M04–M24 across six new biomes
(Halite Flats, Karst Highlands, Polar Refineries, Storm Coast, Vell Arcology, Spire Anchor),
including the M21 EXTRACTION/OVERRIDE branch and the M24 Craton-X duel. Stages 4+ are
executed by a generic `CampaignMission` engine (src/sim/campaign.ts) from per-mission runtime
configs in `content/campaign/` (schema: docs/campaign-runtime-schema.md) paired with the
design docs in `content/missions/` for briefings and VO. Fireteam allies (Sable/Tremor/Vireo)
fight alongside you; missions ship pre-mission voiced briefings, per-objective radio VO,
biome heat regimes (salt 0.8× / storm 1.15× dissipation), stale-coordinate artillery, and a
per-stage player chassis ramp (Skarn → Craton). After sign-in the game offers Basic Training
once (accept/skip, ~7 min), then the main menu: TRAINING / CAMPAIGN / MULTIPLAYER / SETTINGS.
**Pilot accounts live in the service database** (Cloudflare D1 behind `/api`, design:
docs/accounts-design.md), so one callsign + passcode reaches the same campaign, hangar and
wallet from any device. The passcode never leaves the browser — it is stretched into a
verifier with 200 000 PBKDF2 rounds locally and only that is sent. Saves are cached in
`localStorage` and pushed in the background, so progress writes stay instant and offline
play keeps working; two devices playing the same pilot are reconciled by an
optimistic-concurrency merge that never loses an unlock, a frame or a bay. Pilots created
before this shipped can be moved up from the sign-in screen. Guests still get tab-lifetime
progress.

## Run it

**Play online: https://veyra-prime.seesianga.workers.dev** — the root URL is the marketing
landing page (mw5mercs-style layout, self-contained `index.html`; media regenerated with
`node scripts/site_shots.mjs` while `npm run preview` runs); the game itself lives at
**/play** (`play.html`). Game + online match server
(Cloudflare Worker static assets + a Durable Object match lobby at `/ws`). Redeploy with
`npm run build && npx wrangler deploy` (3-D models are excluded from upload via
`public/.assetsignore` — Workers' 25 MiB/file limit).

```bash
npm install
npm run dev        # → http://localhost:5199
npm run build      # production build to dist/
npm run preview    # serve dist/ on :4199
npm run mp         # LAN match server AND pilot-account API on :4177 (dev auto-targets both)
npm run accounts:test    # pilot registry suite: service, cross-device merge, HTTP layer
npm run sync:test        # client sync engine: stale pulls, pilot switches, offline queueing
npm run savetest         # two devices through the real game UI against a real account service
npm run accounts:probe   # live two-device probe against production (--url for a local worker)
npm run db:migrate       # apply migrations/ to the local D1 (--remote variant: db:migrate:remote)
npm run audio      # generate ElevenLabs VO/SFX/music into public/audio (needs valid API key)
npm run btaudio    # Basic Training VO batch (content/vo/bt-lines.csv → mastered WAV + provenance)
npm run btsfx      # Basic Training UI chime/tick/flourish + pad ambience (--variants 6 for final QC)
npm run btlint     # tutorial content lint: {bind:} tokens, forbidden words, VO discipline (--audio strict)
npm run bttest     # tutorial input-injection suite — completes every step headlessly (needs preview)
npm run mpaudio    # generate the multiplayer VO pack (content/vo/mp-lines.csv)
npm run campaudio  # generate the M04-M24 campaign VO (briefings + trigger lines, 192 kbps)
npm run campcheck  # mechanical validation of content/campaign/*.json vs the engine contract
npm run smoke      # headless-browser smoke test + screenshot (needs preview running)
```

Multiplayer (design + status: docs/multiplayer-design.md): **5 vs 5 quick-match** from the
main menu — JOIN pools you with every pilot who joins in the same 30-second window; seats
still empty at the drop are filled by robots (target-agnostic pilot AI, simulated by their
assigned owner client and refereed by the server). Modes: **Deathmatch** (1 point per kill,
first team to 20) and **Capture the Flag** (stand the center flag uncontested for 5 s to turn
it your color — while it's yours your team accrues 1 pt/s, first to 100). Stock chassis,
server-validated loadouts, victim-authoritative kill reports. Practice Skirmish vs bots
remains for offline warm-up.

## The M0 slice — what's implemented and playable

- **Piloting model**: throttle-based movement with reverse, leg steering, mouse torso/arm aim
  independent of leg facing within the Skarn's 120° twist arc, `C` recenter, jump jets with fuel,
  tonnage-scaled acceleration and turn rates, footfall camera shake.
- **Heat**: per-weapon heat, heat-sink dissipation, redline auto-shutdown (helpless ~5 s),
  `O`-hold override with internal damage + ammo cook-off risk, `F` one-shot coolant flush.
- **Damage model**: 8 armor zones with internal structure, crits (weapon destruction, cook-off),
  arm severance with **Rapier physics debris that stays where it fell**, leg loss → speed cap +
  visible limp, side-torso loss takes the arm, head/CT kills, per-zone scorch on the model.
- **Combat**: hitscan lasers, ballistic autocannon with travel time + lead pip, dumbfire rocket
  salvos, subtargeting (`E`) that biases lasers onto the chosen zone, `R`/`T` target cycling.
- **Enemy AI**: Directorate Gabbro with patrol → engage → cool-off states, range-band strafing,
  imperfect tracking, and telegraphed heat discipline you can punish.
- **Mission flow**: cold-start boot with the CAIRN startup litany → destroy the tracking mast →
  kill the patrol → extraction, with radio VO cues, salvage-by-kill-condition debrief
  (legged/headshot kills yield the most), and fail state.
- **HUD**: paper-doll (self + target), heat bar with redline, radar ring with IFF, weapon-group
  panel with ready/ammo states, throttle ladder, objective ticker, subtitles with speaker tags,
  cockpit frame with warning lamps that mirror real sim states, chase cam toggle (`G`).
- **Audio architecture**: Web Audio buses, in-engine radio-futz chain (HP 250 Hz → LP 3.2 kHz →
  waveshaper → 4:1 comp → squelch), CAIRN always clean, music ducking under VO, vertical
  ambient/combat music layering. The game runs fully silent-safe when audio files are absent.

### Known slice scope (scheduled, not cut)
- Art is **procedural greybox** — the Tripo3D pass (docs/tripo-prompt-library.md +
  assets/tripo/manifest.json) replaces it asset-for-asset.
- WebGL renderer first; WebGPU + the Ultra post stack are an M3 line item (docs/roadmap.md).
- Class-based sim entities; bitECS migration scheduled with M1.
- Mechs don't collide with props/each other yet; no fireteam, Assembly Bay, or save profiles (M1).
- **Audio is LIVE**: all 35 assets (13 VO, 18 SFX, 4 music cues) generated at 192 kbps via
  `npm run audio`, key sourced from `../API Information/.env`. Casting: River = CAIRN,
  Lily = Ekene, Liam = Relay.
- **Tripo3D models pending credits**: `python3 scripts/gen_tripo.py` submits at max quality
  (model v3.1-20260211, detailed PBR, no face cap) using the shared client in
  `../API Information/tripo/`, but the Tripo account currently has zero credits
  (every task returns 403 code=2010). After topping up at platform.tripo3d.ai, run it —
  GLBs land in `assets/tripo/generated/` + `public/models/`, then inspect them at
  `/viewer.html` (asset viewer page, part of the build).

## Content pack (source of truth for the full game)

| Path | Contents |
| --- | --- |
| docs/GDD.md | Full consolidated game design document |
| docs/tripo-prompt-library.md | Tripo3D prompts + pipeline for all 33 assets |
| docs/audio-bible.md | Voice designs, futz spec, SFX/music prompt library |
| docs/roadmap.md | M0–M3 production plan with exit criteria |
| docs/deep-impression-checklist.md | The 7 ship-gate checks as testable QA procedures |
| docs/accounts-design.md | Pilot accounts, cloud saves and the cross-device merge |
| content/missions/*.json | All 24 missions (m21a + m21b branches) with briefings + VO triggers |
| content/vo/systemic-barks.json | 122 systemic barks across 6 speakers |
| content/vo/op1-trigger-lines.json | Scripted in-mission lines for Op 1 |
| content/mechs.json, weapons.json | The 12-chassis roster and full weapon list (engine-loaded) |
| content/audio-plan.json | Machine-readable audio production plan (13 voices / 56 SFX / 17 music) |
| assets/tripo/manifest.json | Asset manifest with LOD/texture budgets and priorities |

## Architecture

```
src/
  engine/   renderer (WebGL, ACES, shadows), input, camera rig (cockpit/chase + shake)
  sim/      mech runtime (heat/damage/movement), weapons system, mission script, types, content loader
  ai/       enemy controller state machine
  world/    analytic terrain + greybox props, procedural mech factory, particle/beam effects
  physics/  Rapier (debris + heightfield ground) — mech locomotion stays kinematic
  ui/       DOM/canvas HUD
  audio/    Web Audio manager (buses, futz, ducking, music layers)
content/    all game data as JSON — tuning never requires code changes
```
