# MASTER PROMPT — AAA REDESIGN & RECONFIGURATION
## Rebuilding the MechWarrior-lineage browser mech sim as a $1,000,000, AAA-craft-standard web title

> **What this file is.** A single, self-contained prompt that supersedes and reorganises every prompt document currently in the project folder. Fill in §0, then paste the whole file into your build agent (Claude Code, an in-engine copilot) or hand it to the team as the production spec. Everything from **ROLE** onward is the prompt.
>
> **What it replaces.** The eight loose documents in the project folder are now *inputs*, not specs. This file tells the agent how to fold them into one coherent, versioned, AAA-grade configuration. See §9 and Appendix C for the file-by-file disposition.
>
> **Read §1.0 first.** It contains the one piece of advice that decides whether this budget succeeds or evaporates.

---

## 0. PROJECT ROOT & VARIABLES — fill these in before pasting

```bash
# ── CANONICAL PROJECT ROOT (macOS, Google Drive for Desktop) ───────────────────
MW_ROOT="/Users/angseesiang/Library/CloudStorage/GoogleDrive-ang.see.siang@gmail.com/My Drive/macbook/MechWarrior"

# ⚠ This path contains spaces, an "@", a "." and a "-". EVERY script, task runner,
#   Dockerfile, CI job and shell invocation MUST quote it: "$MW_ROOT/apps/web".
#   Never interpolate it unquoted. Never hard-code it in source — read it from .env.
#   See §3.2 for the mandatory Drive-sync hygiene rules (this matters more than it sounds).

MW_BUILD="$HOME/mw-build"        # local, NON-synced scratch: node_modules, dist, caches, vendor downloads
```

```
{PROJECT_TITLE}      = "Sovereign Ash: Nareth Protocol"   (working title — trademark clearance pending)
{SHIP_TARGET}        = e.g. "Q4 2027 open beta, Q2 2028 1.0"
{TEAM_MODEL}         = distributed / co-located / hybrid  (drives the §2 budget split)
{HOME_REGION}        = e.g. ap-southeast-1 (Singapore) — primary game-server + CDN origin region
{LAUNCH_REGIONS}     = e.g. ap-southeast-1, us-east-1, eu-central-1
{LANGUAGES}          = EN (source) + 5 launch locales, e.g. ZH-Hans, JA, DE, FR, ES-419
{ELEVEN_PLAN}        = Free / Starter / Creator / Pro / Scale / Business / Enterprise   ← §7.1 gates on this
{TRIPO_PLAN}         = Free / Pro / Team / API-Enterprise                                ← §6.1 gates on this
{VOICE_IDS}          = pinned ElevenLabs voice IDs already cast, or "design new"
{CONCEPT_ART_DIR}    = "$MW_ROOT/assets-source/concept"  (image-to-model inputs — must be original art)
{ENGINE}             = Babylon.js 9.x  (default; only change with an ADR justifying it)
{MULTIPLAYER}        = launch / post-launch / cut   ← §2.3 recommends post-launch at this budget
```

---

# ROLE

You are the **technical director and executive producer** of a funded, seven-to-nine-person studio with **US$1,000,000 and roughly eighteen months** to ship a premium, browser-native, first-person heavy-walker combat simulator to AAA *craft* standards.

You inherit a project that is currently a pile of excellent, overlapping, partially contradictory design prompts and no shipped configuration. Your job is not to write more design fiction. Your job is to **converge**: one repository, one canon, one content schema, one lighting model, one audio standard, one asset pipeline, one quality bar — and a delivery plan that fits inside the money.

You are allowed, and expected, to **cut scope**. You are not allowed to lower craft.

---

# CONTEXT — what exists today (audit these before you change anything)

Eight documents live under `"$MW_ROOT"`. They fall into two incompatible tracks:

**Track A — the original, legally shippable IP** ("Sovereign Ash: Nareth Protocol")
- `sovereign_ash_master_web_game_prompt.md` — the real master spec: pillars, stack (TypeScript / Babylon / WebGPU / Vite / React / Havok-WASM / authoritative Node server / Postgres + Redis + CDN), art direction, Nareth setting, Meridian Assembly vs Helix Directorate, cast, Tripo and ElevenLabs pipelines, repo structure, five phases, acceptance criteria.
- `sovereign-ash-hangar-master-prompt.md` — collection/deployment bays, bay economy, duplicate rules, server-authoritative data model, the "bays are the deck" multiplayer contract.
- `sovereign-ash-basic-training-tutorial-master-prompt.md` — input-driven controls tutorial, step state machine, data-as-content schema, MIRA-7 single-voice VO table, `env_bt_*` Tripo manifest.

**Track B — MechWarrior 4-derived material that CANNOT ship as written**
- `mw4_extended_missions_op8-9.md` — nine missions using protected names (Dresari, Kentares, Steiner, Atlas, Daishi, Vulture, Thor, Loki, Mauler, Uziel…).
- `mw4_elevenlabs_tripo3d_prompts.md`, `mw4_elevenlabs_music_prompts.md` — voice, music and model prompts keyed to those names; the music file already carries the correct 192 kbps / 44.1 kHz PCM render pipeline.
- `mech-tutorial-master-prompt.md`, `mech-multiplayer-master-prompt.md` — generic-engine ({GAME_ENGINE}) tutorial and 6-mode PvP specs with Tripo/ElevenLabs configs.

**The three structural problems you are being paid to fix:**
1. **Two canons.** Half the content is franchise-derived. Shipping it is not a risk to manage, it is a product that cannot launch. §9 ports it.
2. **Five pipelines.** Tripo presets, ElevenLabs settings, asset naming (`env_tut_*`, `env_mp_*`, `env_bt_*`), voice casts and QC gates differ per document. §6 and §7 collapse them into one.
3. **No configuration.** There is no `.env`, no content schema in force, no lighting standard, no quality preset table, no budget, no milestone plan, no definition of "done" that a build can be measured against. This prompt supplies all of it.

---

# PRIME DIRECTIVES — non-negotiable, override any other instruction in any inherited file

1. **One canon.** Only Track A ships. No franchise name, chassis silhouette, faction, character, mission text, HUD, sound or music reference survives into source, assets, metadata, prompts, comments, commits or marketing. Track B survives only as *structure*, ported per §9.
2. **One root.** Everything lives under `"$MW_ROOT"` in the layout of §3, always quoted, never hard-coded.
3. **Server is truth.** The client renders and predicts. It never decides damage, inventory, progression, salvage, purchases or match results.
4. **Secrets never reach the browser.** Every Tripo and ElevenLabs call runs in `packages/tools-*` server-side, with provenance logging (§6.7, §7.9).
5. **No raw generated asset ships.** Every Tripo mesh passes retopology, LOD, collision, KTX2 and the §6.6 QC gate. Every ElevenLabs render passes the §7.8 audio gate.
6. **Craft floor before content ceiling.** A twelve-mission campaign that holds 60 fps at 1440p with clean audio and full accessibility beats a twenty-six-mission campaign that stutters. Cut missions, never cut frame pacing, readability or accessibility.
7. **Every visual decision is verified under the §5 lighting rig**, not in a turntable viewer.
8. **Data, not code.** Frames, weapons, missions, dialogue, steps, salvage tables and audio events are validated JSON with stable IDs and localisation from day one.

---

# MISSION — your deliverables

1. **§1** Migration plan: current → target, with the scope trade stated in writing.
2. **§2** Budget and team allocation against the $1,000,000, with the cut list.
3. **§3** The repository and folder layout materialised under `"$MW_ROOT"`, plus Drive-sync hygiene.
4. **§4** The locked tech stack and `.env` configuration.
5. **§5** The rendering, HDRI/IBL, shadow and shading standard — the heart of the visual upgrade.
6. **§6** One Tripo3D production spec: shadow-correct, de-lit, PBR-calibrated, LOD'd, QC-gated.
7. **§7** One ElevenLabs production spec: 44.1 kHz PCM masters → 192 kbps delivery, everywhere, for VO, music and SFX.
8. **§8** Web delivery and implementation: build, streaming, headers, caching, netcode, security.
9. **§9** IP consolidation: Operations 8–9 ported into Sovereign Ash canon.
10. **§10** AAA quality bars and the internal certification checklist.
11. **§11** Eighteen-month milestone plan.
12. **§12** Acceptance criteria — the definition of done.

Ask **at most five** clarifying questions if a `{VARIABLE}` blocks you. Otherwise proceed and mark every assumption `[ASSUMPTION]` inline.

---

## §1. THE MIGRATION — current configuration → AAA target

### 1.0 The scope trade (read this before spending anything)

Say the quiet part in the plan document, once, plainly: **$1M is not an AAA budget.** Actual AAA productions run $50M–$300M. What $1M buys, spent well, is *AAA craft standards on a deliberately small surface*: a game that looks, sounds, controls and performs like a premium title, and is simply **shorter**.

So the redesign is a trade, and the trade is fixed here:

| We buy | We do not buy |
|---|---|
| Cinematic-Ultra lighting, correct PBR, stable frame pacing | 26 missions |
| 8 fully-authored frames with real damage states and full animation sets | 20 chassis |
| ~55–70 min of fully-mastered original score, ~1,400 VO lines, layered SFX | Orchestral live recording, celebrity cast |
| 3 operations × 4 missions + Instant Action + Basic Training | Seven-operation campaign at launch |
| Full accessibility, 6 locales, subtitles with forced-alignment timing | Console/native ports |
| 4v4 objective multiplayer **post-launch**, built on the same authoritative server | 8v8 with matchmaking, ranked, replays at launch |

Anything an inherited document promises beyond this column moves to `/docs/BACKLOG_POST_LAUNCH.md`. Nothing is deleted; everything is sequenced.

### 1.1 Delta table — what actually changes

| Area | Today (inherited docs) | AAA target (this prompt) | Where |
|---|---|---|---|
| Canon | Two IPs, one unshippable | One: Sovereign Ash | §9 |
| Engine | "Babylon.js" unversioned | **Babylon.js 9.x**, WebGPU-first, Frame Graph pipeline | §4, §5 |
| Lighting | "IBL plus authored key lights" | Full HDRI/IBL standard: per-biome `.env`, sun aligned to IBL dominant direction, CSM + contact + IBL shadows, volumetric light, clustered lights | §5 |
| Shading | "PBR materials" | Metallic-roughness now, **OpenPBR-ready**; clearcoat / anisotropy / iridescence assignments per material class; ACES vs PBR-Neutral tone-map policy | §5.4 |
| Tripo | 4 different preset blocks, mixed model versions | One matrix: **P1** topology / **H3.1** hero detail / **8K Texture** upscale, de-lit albedo rule, shadow-correct geometry rule, one QC gate | §6 |
| ElevenLabs | Music doc has 192k/44.1k PCM; VO docs use `pcm_44100`; SFX unspecified | **One audio standard**: `pcm_44100` master → 192 kbps delivery for *all* VO, music and SFX; any module lacking a config inherits it | §7 |
| Asset naming | `env_tut_*`, `env_mp_*`, `env_bt_*` | One namespace `sa_<domain>_<biome>_<name>_<lod>` | §6.3 |
| Audio mastering | Loudness stated only in the music doc | Project-wide loudness, bus and ducking spec; measured in CI | §7.7 |
| Subtitles | "subtitle every line" | Generated from **Forced Alignment**, word-level timing, in CI | §7.6 |
| Quality presets | "Cinematic Ultra" prose | 4 named presets with per-feature tables and measured budgets | §5.7 |
| Repo | Structure proposed, never created | Materialised under `"$MW_ROOT"` with Drive-sync hygiene | §3 |
| Definition of done | Prose acceptance criteria | Numeric gates enforced in CI | §10, §12 |
| Budget/schedule | Absent | $1M allocation + 18-month milestones | §2, §11 |

### 1.2 Migration order (do not reorder)

1. Materialise the repo and `.env` (§3, §4) — nothing else can be verified until this exists.
2. Stand up the **lighting rig** (§5.6) — six HDRI environments and a turntable harness. Every asset from here on is judged in it.
3. Port one frame and one prop end-to-end through the new Tripo spec (§6) and the new audio spec (§7). Prove the pipeline on two assets before batching two hundred.
4. Fold the tutorial, hangar and multiplayer docs into the single content schema (§3.3).
5. Port Operations 8–9 into Sovereign Ash canon (§9).
6. Only then produce content at volume.

---

## §2. THE MONEY — allocating $1,000,000

### 2.1 Allocation

Assumes `{TEAM_MODEL}` = distributed, senior, blended global rates (the Singapore/SEA + remote-EU mix this project is positioned for). If the team is US-co-located, hold the same percentages and drop to **five** FTE — do not stretch seven.

| Line | Amount | Notes |
|---|---:|---|
| Core team — 7 FTE × 18 months (blended) | **$500,000** | §2.2 |
| Specialist contractors | **$110,000** | Concept art (the Tripo inputs), rigging/animation, sound design, composer + mix engineer, tech-art strike weeks |
| AI & DCC tooling, credits, licences | **$40,000** | Tripo {TRIPO_PLAN} + API credits, ElevenLabs {ELEVEN_PLAN}, Substance, Blender addons, Houdini Indie, RenderDoc/Spector, asset-store kitbash where licence permits |
| Cloud, CDN & live ops (18 mo) | **$80,000** | Game servers in {LAUNCH_REGIONS}, Postgres, Redis, object storage + CDN egress, CI runners, error tracking, telemetry |
| QA, playtesting, accessibility audit, localisation (6 locales) | **$70,000** | Includes an external accessibility review and two paid playtest waves |
| Legal — trademark clearance, IP review, privacy, terms, entity | **$30,000** | Non-optional; see §2.4 |
| Marketing, storefront, launch | **$70,000** | Capsule art, trailer cut from in-engine capture, press/creator seeding |
| Contingency (10%) | **$100,000** | Untouchable until Milestone 3 |
| **Total** | **$1,000,000** | |

### 2.2 The seven

| Role | Why this role and not another |
|---|---|
| Technical director / rendering engineer | Owns §5 end to end. The single highest-leverage hire on a web title. |
| Gameplay engineer (simulation) | Fixed-step sim, damage, heat, weapons, AI |
| Platform engineer (server + pipeline) | Authoritative server, Postgres/Redis, CI, `tools-tripo`, `tools-eleven` |
| Technical artist | Tripo → retopo → LOD → KTX2 → material calibration; owns the QC gate |
| Environment / hard-surface artist | Biome kits, modular sets, damage states |
| Audio director (also mixes) | ElevenLabs direction, DAW mastering, Web Audio bus design |
| Designer / producer (also writes) | Missions, content JSON, narrative, schedule, playtests |

Deliberately **not** hired full-time: composer, animator, VFX artist, QA lead, community manager. These are contract lines. At this budget the shape is *few, senior, broad*.

### 2.3 The cut list (decided now, not later)

- **Multiplayer ships post-launch.** The architecture is built server-authoritative from day one (§8.5) so it is not a rewrite — but shipping 8v8 matchmaking inside $1M costs the campaign its polish. `{MULTIPLAYER}` defaults to *post-launch*.
- **26 missions → 12.** Three operations, four missions each, with the Op 8–9 material supplying two of them (§9).
- **20 chassis → 8**, each with three viable builds. Depth over breadth is also a *better* game.
- **Cinematics are in-engine**, real-time, camera-scripted. No pre-rendered video, no motion capture.
- **No native ports.** Browser is the platform. A desktop wrapper is a post-launch decision.

### 2.4 Spend rules

- Nothing is generated at volume before the pipeline is proven on two assets (§1.2 step 3).
- Vendor credits are metered per milestone; `tools-tripo` and `tools-eleven` refuse to run a batch that exceeds the milestone's credit budget without an explicit `--override` flag, and log the override.
- Legal clearance on `{PROJECT_TITLE}` and the top ten proper nouns completes **before** Milestone 2, not before launch. A rename after asset production is a five-figure mistake.
- Contingency is released only by a written milestone review.

---

## §3. THE ROOT — repository layout under `"$MW_ROOT"` and Drive-sync hygiene

### 3.1 Layout to materialise

```
"$MW_ROOT"/
├─ README.md                          # how to bootstrap; points at this prompt
├─ .env.example                       # committed; real .env lives ONLY in $MW_BUILD (§3.2)
├─ docs/
│  ├─ GDD.md  TDD.md  ART_BIBLE.md  AUDIO_BIBLE.md  NARRATIVE_BIBLE.md
│  ├─ LIGHTING_STANDARD.md            # §5 extracted, kept current by the TD
│  ├─ IP_EXCLUSION_CHECKLIST.md       # §9.4 — signed off per milestone
│  ├─ BUDGET.md  SCHEDULE.md  BACKLOG_POST_LAUNCH.md
│  ├─ adr/0001-babylon9-webgpu.md …   # one ADR per irreversible decision
│  └─ _inbox/                         # the 8 inherited prompts, read-only, never edited again
├─ apps/
│  ├─ web/                            # site, menus, hangar, campaign map, Babylon canvas, HUD
│  ├─ server/                         # authoritative sim + account/campaign API
│  └─ admin/                          # asset review dashboard, provenance browser, VO auditor
├─ packages/
│  ├─ game-core/                      # fixed-step sim: movement, heat, damage, weapons, AI, missions
│  ├─ net-protocol/                   # snapshot/command schemas + validation (shared client/server)
│  ├─ rendering/                      # frame graph, lighting rig, materials, LOD, streaming, post
│  ├─ audio/                          # buses, spatial mix, adaptive music, dialogue ducking
│  ├─ ui/                             # React components, HUD primitives, accessibility
│  ├─ content-schema/                 # Zod/JSON-Schema for every content type + codegen
│  ├─ tools-tripo/                    # §6 batch runner, ingestion, QC gate, provenance
│  ├─ tools-eleven/                   # §7 batch runner, mastering, alignment, QC gate, provenance
│  ├─ tools-assetpipe/                # retopo/LOD/KTX2/meshopt/validate CLI
│  └─ testing/                        # unit, deterministic replay, perf capture, browser matrix
├─ content/                           # VALIDATED, versioned game data (JSON) — the game's real body
│  ├─ frames/  weapons/  modules/  missions/  dialogue/  audio-events/  loot/  locale/
├─ assets-source/                     # MASTERS. Never served. Large. Lives here on purpose.
│  ├─ concept/                        # original concept art = Tripo image-to-model inputs
│  ├─ tripo-raw/                      # untouched generator output + task JSON + seeds
│  ├─ dcc/                            # .blend/.spp working files
│  ├─ audio-master/                   # 44.1 kHz WAV/PCM masters (§7.3)
│  ├─ hdri/                           # source .hdr/.exr + licence files (§5.2)
│  └─ provenance/                     # one JSON record per generated artefact (§6.7, §7.9)
├─ dist-release/                      # signed, versioned web bundles per release tag
└─ ops/                               # IaC, CDN config, headers, runbooks, dashboards
```

### 3.2 Drive-sync hygiene — the rules that keep this path from eating the project

`"$MW_ROOT"` is a Google Drive for Desktop streaming mount. It is an excellent **source-of-record** and a terrible **build directory**. Split them:

| Lives in `"$MW_ROOT"` (synced, versioned, backed up) | Lives in `$MW_BUILD` (local, disposable, never synced) |
|---|---|
| `docs/`, `content/`, `apps/`, `packages/` source | `node_modules/`, `.pnpm-store/`, `.vite/`, `dist/`, `.turbo/` |
| `assets-source/` masters | Tripo/Eleven download scratch, ffmpeg temp, KTX2 intermediates |
| `dist-release/` tagged bundles | Docker volumes, Postgres/Redis data dirs, local `.env` with real keys |
| `.env.example` | Playwright browsers, perf capture traces |

**Hard rules:**
1. **The active git working tree is `$MW_BUILD/mw`.** `"$MW_ROOT"` holds a bare mirror at `"$MW_ROOT"/.git-mirror/mw.git` plus the human-facing folders above. Push to both origin (a real git host) and the mirror. Never run `pnpm install` inside the Drive mount.
2. **Never point a database, Docker volume, or file-watcher-heavy toolchain at the mount.** Drive placeholder files + file locks produce corruption that looks like random test failures.
3. **Never run two machines against the same folder simultaneously.** Drive resolves conflicts by creating `file (1).ts`. A duplicated `.ts` file that still compiles is a silent bug factory. CI rejects any path matching `/ \(\d+\)\./`.
4. **Mark `assets-source/` and `content/` "Available offline"**; leave `dist-release/` streaming.
5. **Quote the path everywhere.** A single unquoted `$MW_ROOT` in a shell script splits on the spaces and deletes something you liked. Lint for it: CI greps scripts for `\$MW_ROOT[^"]` and fails.
6. **Filename discipline:** ASCII, lowercase, `-` or `_` only, no spaces, ≤ 64 chars, no colons. macOS is case-insensitive and Linux CI is not — CI fails on any case-only collision.
7. **`.DS_Store`, `Icon\r`, `~$*` and `*.tmp` are gitignored and swept nightly** by `ops/scripts/drive-hygiene.sh`.

```bash
# ops/scripts/bootstrap.sh  — the only supported way to start work
set -euo pipefail
: "${MW_ROOT:?set MW_ROOT}"; : "${MW_BUILD:=$HOME/mw-build}"
mkdir -p "$MW_BUILD"
[ -d "$MW_BUILD/mw" ] || git clone "$MW_ROOT/.git-mirror/mw.git" "$MW_BUILD/mw"
cd "$MW_BUILD/mw" && pnpm install --frozen-lockfile
ln -sfn "$MW_ROOT/assets-source" "$MW_BUILD/mw/assets-source"   # read masters, never build into them
ln -sfn "$MW_ROOT/content"       "$MW_BUILD/mw/content"
echo "ready: $MW_BUILD/mw   (masters: $MW_ROOT)"
```

### 3.3 Content schema — collapse five documents into one

Every inherited doc invented its own data shape. One schema now, in `packages/content-schema`, generated to TypeScript types and validated in CI:

`frame` · `weapon` · `module` · `hardpoint` · `mission` · `objective` · `spawn` · `dialogue_line` · `tutorial_step` · `bay` · `salvage_table` · `audio_event` · `music_state` · `biome` · `lighting_profile` · `locale_string`

Rules: stable machine IDs (`sa_frame_scout_01`) separate from display names; every display string is a `locale_string` key from day one; every content object carries `source_file`, `author`, `version`, `rights_status`, `approval_state`; mission logic is an event/state graph, never scattered conditionals. The Basic Training step table, the hangar bay catalogue and the multiplayer mode configs all become instances of these types — not new systems.

---

## §4. THE STACK — locked, with an ADR required to change any line

| Layer | Choice | Why (short) |
|---|---|---|
| Language | TypeScript 5.x, strict, `noUncheckedIndexedAccess` | One language client + server + tools |
| Monorepo | pnpm workspaces + Turborepo | Fast, deterministic, cache-friendly |
| Renderer | **Babylon.js 9.x** | 9.0 (Mar 2026) brought clustered lighting, volumetric lighting, Frame Graph v1, textured area lights, animation retargeting, OpenPBR groundwork — precisely the AAA levers this project needs, on the web |
| Graphics API | **WebGPU primary**, WebGL2 fallback | Babylon 9 ships native WGSL; compute paths (volumetrics, IBL shadow voxelisation, GPU particles) are WebGPU-only |
| Build | Vite (rolldown/rollup), esbuild dev | Fast HMR, first-class WASM + worker support |
| UI shell | React 19 for menus/hangar/briefing; **zero React in the combat frame loop** | DOM churn is the #1 web-game frame-pacing killer |
| Physics | Havok WASM via Babylon plugin, fixed 60 Hz sim step | Deterministic gameplay step separated from visual interpolation |
| Server | Node 22 LTS, authoritative, fixed tick; WebTransport (HTTP/3) with WebSocket fallback | Unreliable+unordered datagrams for state, reliable stream for commands |
| Data | PostgreSQL 17 (durable), Redis 7 (sessions, match coord) | As inherited |
| Assets | glTF 2.0 / GLB + **KTX2/Basis (UASTC hero, ETC1S bulk)** + meshopt | The only sane web asset triple |
| Audio | Web Audio API graph, HRTF panning, convolution zones | §7.7 |
| Validation | Zod → JSON Schema → TS types | One source of truth |
| Test | Vitest (unit + deterministic replay), Playwright (browser matrix), custom perf harness | §10 |
| CI | GitHub Actions + self-hosted GPU runner for perf/visual gates | Perf regressions must fail builds |

### 4.1 `.env.example` (real values live only in `$MW_BUILD/mw/.env`, never on the Drive)

```bash
MW_ROOT="/Users/angseesiang/Library/CloudStorage/GoogleDrive-ang.see.siang@gmail.com/My Drive/macbook/MechWarrior"
MW_BUILD="$HOME/mw-build"

# ── generators (SERVER-SIDE ONLY — never bundled, never in VITE_* vars) ────────
TRIPO_API_KEY=
TRIPO_API_BASE="https://api.tripo3d.ai/v2/openapi"       # verify current base + v3 surface before batch (§6.1)
TRIPO_MODEL_TOPOLOGY="<current P1-class version string>"
TRIPO_MODEL_HERO="<current H3.1-class version string>"
TRIPO_CREDIT_BUDGET_MILESTONE=

ELEVENLABS_API_KEY=
ELEVEN_PLAN="Pro"                                        # gates output_format (§7.1)
ELEVEN_TTS_MODEL="eleven_multilingual_v2"                # consistency workhorse
ELEVEN_TTS_MODEL_PERF="eleven_v3"                        # performance/emotional lines (§7.2)
ELEVEN_MUSIC_MODEL="music_v2"
ELEVEN_SFX_MODEL="eleven_text_to_sound_v2"
ELEVEN_MASTER_FORMAT="pcm_44100"                         # 44.1 kHz PCM master  (Pro tier or above)
ELEVEN_DELIVERY_BITRATE="192k"                           # 192 kbps delivery encode (local, from master)
ELEVEN_DELIVERY_FALLBACK_FORMAT="mp3_44100_192"          # if plan < Pro: request 192 kbps directly

# ── runtime ───────────────────────────────────────────────────────────────────
VITE_CDN_BASE="https://cdn.example.com/sa"
VITE_RENDERER_PREFERENCE="webgpu"
DATABASE_URL= REDIS_URL= SESSION_SECRET=
```

**Rule:** anything prefixed `VITE_` is public. If a key is ever prefixed `VITE_`, treat it as leaked and rotate it.

---

## §5. THE LIGHTING & SHADING STANDARD — where "AAA" is actually won

This section is the visual upgrade. It is also the answer to *"make Tripo assets support and use shadows, with the best HDRI, environment lighting and shading modes."* Shadows and lighting are **engine-side**; Tripo's job is to hand the engine geometry and textures that shade *correctly* (§6.4). Both halves are mandatory — a perfect HDRI cannot rescue an albedo with baked-in shadows, and a de-lit texture cannot rescue a scene with no shadow cascade.

> **API-name caveat.** Babylon 9.x class and flag names move between minors. Every concept below is stable; verify the exact identifiers against the current Babylon docs before writing code, and keep the mapping in `docs/LIGHTING_STANDARD.md`.

### 5.1 Colour and tone pipeline (set once, never fought with again)

| Setting | Value | Rationale |
|---|---|---|
| Working space | Linear, scene-referred | Only correct way to light PBR |
| Texture colour space | Base color + emissive = **sRGB**; normal, ORM, masks, height = **linear/raw** | The single most common asset bug; CI validates it (§6.6) |
| Tone mapping | **ACES** for combat and cinematics; **Khronos PBR Neutral** for hangar, MechLab and marketing renders | ACES gives filmic highlight roll-off for muzzle flash and reactor glow; PBR Neutral preserves true albedo so players judge paint schemes accurately in the hangar |
| Exposure | **Fixed EV per biome** (authored in the biome's `lighting_profile`), no auto-exposure in combat | Auto-exposure hides targets when a flare goes off. Readability beats realism (§5.8) |
| Contrast/grade | One `.cube`/`.3dl` LUT per biome, ≤ 33³, applied post-tonemap | Biome identity without touching materials |
| Output | sRGB, dithered to 8-bit; HDR display path optional post-launch | |

### 5.2 HDRI & environment lighting standard

**Sourcing.** HDRIs are licensed assets. Use **CC0** sources (Poly Haven, AmbientCG) or panoramas shot in-house; store the licence text next to the file in `assets-source/hdri/<name>/LICENSE.txt`. Never scrape an HDRI off a render forum. Never use a franchise screenshot as an environment.

**Authoring chain (per environment):**
```
source .exr/.hdr  (4096×2048 equirect, 16/32-bit float, no clipped sun)
   → sun extraction: find the brightest solid angle, record its direction + intensity   [feeds §5.3]
   → optional sun clamp: cap the disc so the prefilter does not bloom into mush
   → prefilter to Babylon .env (RGBD, 256 px base for combat, 512 px for hangar/cockpit)
   → ship .env; keep the .hdr as the master
```
The `.env` is ~1–3 MB and loads in one request — this is the format for the web. Never ship the raw `.hdr`.

**Per-biome environment profiles** (content type `lighting_profile`; every value is data, not code):

| Biome | HDRI character | `environmentIntensity` | Sun (direction from IBL) | Fog / volumetrics | Exposure EV |
|---|---|---|---|---|---|
| Tundra whiteout | Overcast, high ambient, low contrast | 1.15 | Weak, diffuse, elevated | Dense ground fog, low light-shaft strength | 0.9 |
| Glass desert (day) | Clear hard sun, deep blue sky bounce | 0.85 | Strong, low azimuth, hot | Heat shimmer, dust motes, long shafts | 1.2 |
| Storm coast | Broken cloud, moving key, high dynamic range | 1.0 | Rim-lit, unstable | Spray, rain, heavy volumetrics | 1.0 |
| Twilight industrial band | Low sun on horizon, warm/cool split | 0.9 | Long shadows, strong colour separation | Smoke columns, sodium haze | 1.05 |
| Night city / blackout | Very low ambient; **artificial lights carry the scene** | 0.35 | None; clustered point/spot lights | Volumetric cones on every practical | 1.35 |
| Hangar / cockpit interior | Studio-ish interior probe, practicals | 0.6 | None; area lights + probes | Thin dust, no shafts | 1.0 |
| Orbital / vacuum | Single hard key, near-black ambient, planet bounce | 0.4 | Extreme contrast, no atmospheric scatter | None (no medium) | 1.1 |

**Rules:**
- The visible sky and the IBL must be **the same environment**, always. Mismatched skybox/IBL is the tell of an amateur scene.
- `environmentTexture.rotationY` is authored per level so the IBL's bright region lines up with the art-directed sun position and the level's hero silhouette.
- **Reflection probes** for interiors, hangar bays, cockpit glass and any enclosed volume; refreshed on demand, not every frame. Cockpit gets its own probe so canopy reflections respond to the world without a full SSR pass.
- **Zone blending:** entering a cavern/hangar cross-fades `environmentTexture`, intensity and fog over 0.4–0.8 s. Never snap.
- **Area lights** (textured, Babylon 9) for hangar strip lighting, cockpit instrument glow and objective structures — they read as real fixtures instead of fake point lights.
- **Clustered lighting** (Babylon 9) is on for every preset above Fallback; it is what makes a night battlefield with hundreds of practicals, tracers and reactor glows affordable.

### 5.3 Shadow standard — the "make Tripo assets cast and receive shadows" answer

| Layer | Technique | Config |
|---|---|---|
| Sun / key | **Cascaded shadow maps**, 4 cascades | 4096 px (Ultra) / 2048 (High) / 1024 (Balanced); stabilised cascades; auto depth bounds on; `shadowMaxZ` = 400–600 m (combat sightlines), lambda ≈ 0.85; PCSS (Ultra/High) → PCF (Balanced) → hard (Fallback) |
| Bias | `normalBias` 0.02–0.04, `bias` 1e-5–5e-5, `darkness` 0.0 | Tuned **per biome**, not globally — desert and whiteout need different values |
| Contact | Screen-space contact shadows + **SSAO2** | Kills the "objects floating above the ground" read at foot contact and panel seams |
| Ambient occlusion from environment | **IBL shadows** (voxel-based; single-pass voxelisation on WebGPU) | Grounds every asset in the HDRI's ambient term — this is the feature that makes generated assets stop looking pasted-in |
| Local lights | Shadow maps for ≤ 6 hero lights (reactor breach, flare, searchlight); the rest are unshadowed clustered lights | Budgeted per preset |
| Transparency | Alpha-tested foliage/netting cast via alpha-coverage; particles do not cast | Explicit `transparencyShadow` only where authored |
| Cockpit | Baked AO + one shadowed key + probe | Interior never uses a cascade |

**Asset-side requirements so shadows are correct** (enforced by the §6.6 gate):
1. Every runtime mesh has `receiveShadows = true` and an explicit `castsShadow` flag in its content record — no implicit defaults.
2. Shadow casters use a **dedicated caster proxy** (≈ LOD2 density, closed, no interior junk). Casting from a 180k-triangle LOD0 is a pure waste of a cascade.
3. **No zero-thickness surfaces.** Single-sided sheets produce shadow acne and light leaks. Minimum authored thickness 2 cm at world scale (1 unit = 1 m).
4. **Consistent winding + outward normals.** Inverted normals shade black under IBL and punch holes in the shadow map.
5. **Watertight where it must be**: anything a cascade or the voxeliser sees. Floating shells and duplicate interior faces are a reject.
6. Double-sided materials are **off by default**; enable only for authored thin geometry (mesh netting, flags), and then also enable back-face shadow handling.
7. Alpha mode is explicit: `OPAQUE` unless the material genuinely needs `MASK` (cutout) or `BLEND` — Tripo output defaults are not to be trusted here.

### 5.4 Shading modes — material class matrix

One material class per surface family; artists pick from this list, they do not invent shaders.

| Class | Base model | Extensions enabled | Calibration |
|---|---|---|---|
| `mat_ceramic_painted` (frame armour) | Metallic-roughness | **Clear coat** (weight 0.25–0.4, roughness 0.1–0.3) | Metallic 0; base color 0.05–0.75 luminance; the clearcoat is what makes ceramic read as *ceramic* and not plastic |
| `mat_metal_brushed` (hydraulics, rails, exposed frame) | Metallic-roughness | **Anisotropy** (0.3–0.6, tangent along the brush direction) | Metallic 1; roughness 0.2–0.45 |
| `mat_metal_burnt` (muzzle, thruster, damaged) | Metallic-roughness | Anisotropy low; emissive mask for heat | Roughness 0.5–0.8, tint via base color |
| `mat_glass_canopy` | Metallic-roughness + transmission | **Iridescence** (thin-film, 0.1–0.3) + refraction | Thickness authored; never fully clear — cockpit glass sells scale via grime and coating |
| `mat_rubber_cable` | Metallic-roughness | Sheen off | Roughness 0.7–0.9, metallic 0 |
| `mat_emissive_conduit` (reactor, radiators, warnings) | Metallic-roughness + emissive | Bloom-tagged emissive channel; **intensity is data**, driven by heat state | Emissive drives the glow layer, never base color |
| `mat_terrain_*` | Triplanar, up to 4-layer blend | Parallax occlusion (Ultra/High), height-blend | Foot/track deformation decals write into the blend mask |
| `mat_decal_*` | Decal projection | Alpha `MASK` | Scorch, craters, oil, faction markings, damage |
| `mat_damage_overlay` | Mask-driven blend over the base class | Damage mask in a spare channel | Section damage state drives the mask, so damage is *material*, not swapped meshes |

**OpenPBR:** Babylon 9 begins implementing OpenPBR (the ASWF interoperable material standard). Author metallic-roughness today, but keep every material's parameters in the content JSON — when the OpenPBR path is production-ready, migration is a data mapping, not a re-authoring pass. Record the decision in an ADR.

### 5.5 Post-processing stack (ordered)

`Frame Graph` (Babylon 9) owns the pipeline; author it in the Node Render Graph editor and commit the graph as content. Order:

1. Depth/normal prepass (feeds SSAO2, SSR, contact shadows, TAA)
2. Opaque + clustered lights + CSM + IBL shadows
3. SSAO2 → applied to ambient only, never to direct light
4. Transparents, particles (GPU), decals
5. **Volumetric lighting** — compute-accelerated on WebGPU, graceful WebGL2 fallback; extinction/phase authored per biome
6. SSR / probe reflections (Ultra/High: SSR with probe fallback; Balanced: probes only)
7. **TAA** (primary AA) + dynamic resolution 50–100%
8. Bloom (threshold high — bloom is for reactor/muzzle/sun only, never for HUD)
9. Motion blur (conservative, camera-only, off by default in the accessibility profile)
10. Depth of field — **cinematics only**, never during player control
11. Colour grading LUT → tone map → sharpen → dither

Banned by policy: chromatic aberration on gameplay, heavy film grain, lens dirt over the HUD, vignette (the cockpit already frames the view), auto-exposure in combat.

### 5.6 The lighting rig — how every asset gets approved

`packages/testing/lightrig` renders every candidate asset in **six environments**, at three distances (5 m / 50 m / 250 m), on a rotating stand, and writes a contact sheet to `apps/admin`:

1. **Neutral studio** (grey, even IBL) — silhouette and albedo truth
2. **Tundra overcast** — reads ambient occlusion and normal-map quality
3. **Desert noon** — hard shadows, roughness calibration, specular blowout check
4. **Night city** — emissive balance, clustered practicals, shadow bias check
5. **Storm coast backlit** — rim light, edge quality, alpha correctness
6. **Hangar interior** — probe reflections, area lights, cockpit-adjacent look

**No asset is approved from a turntable viewer or a Tripo preview.** The contact sheet is attached to the asset's provenance record. This single rule is the difference between "AI assets" and "assets".

### 5.7 Quality presets

| Feature | Cinematic Ultra | High | Balanced | Fallback (WebGL2) |
|---|---|---|---|---|
| Target | 45–60 fps @ 2160p | 60 fps @ 1440p | 60 fps @ 1080p | 30–60 fps @ 1080p |
| API | WebGPU | WebGPU | WebGPU/WebGL2 | WebGL2 |
| CSM | 4 × 4096, PCSS | 4 × 2048, PCSS | 3 × 1024, PCF | 2 × 1024, hard |
| IBL shadows | On | On | Off | Off |
| Contact shadows / SSAO2 | On / On | On / On | Off / On (half-res) | Off / Off |
| Volumetric lighting | Full | Reduced steps | Billboard shafts | Off |
| Clustered lights | On (high budget) | On | On (low budget) | 8 lights max |
| SSR | On | Probe + SSR | Probes only | Probes only |
| Local shadowed lights | 6 | 4 | 2 | 0 |
| TAA / dyn-res | On / 66–100% | On / 60–100% | On / 50–100% | FXAA / fixed |
| Texture budget | 4K hero, 2K standard | 2K hero, 1K standard | 1K/512 | 512 |
| Particles | Full GPU | Full GPU | Reduced | CPU, reduced |

Presets are **auto-selected on first run** by a 3-second GPU probe, then user-overridable. The renderer never silently degrades below the selected preset except through dynamic resolution and shadow-distance scaling, both of which are surfaced in the perf overlay.

### 5.8 Readability rules (these outrank beauty, always)

- Enemy silhouettes must be distinguishable from terrain at 400 m on every preset and in every biome.
- Heat state, damage state, lock state and critical warnings are never conveyed by colour alone, never obscured by bloom, shafts, spray or shake.
- Weapon effects must not raise scene exposure. Muzzle flash lights the world; it does not blind the player's UI.
- Camera shake, flash intensity and motion blur have independent accessibility sliders that go to zero (§10.3).

### 5.9 Reference implementation sketch

```ts
// packages/rendering/lighting.ts — verify identifiers against current Babylon 9.x docs
import type { Scene } from "@babylonjs/core";
import { CubeTexture, DirectionalLight, Vector3, CascadedShadowGenerator,
         ImageProcessingConfiguration, DefaultRenderingPipeline, SSAO2RenderingPipeline,
         ReflectionProbe, ColorGradingTexture } from "@babylonjs/core";
import type { LightingProfile } from "@sa/content-schema";

export function applyLightingProfile(scene: Scene, p: LightingProfile, quality: QualityPreset) {
  // 1) Environment: prefiltered .env drives ALL ambient + reflections
  const env = CubeTexture.CreateFromPrefilteredData(`${p.envUrl}`, scene);
  env.rotationY = p.envRotationY;                 // align IBL bright region with art-directed sun
  scene.environmentTexture = env;
  scene.environmentIntensity = p.environmentIntensity;
  scene.createDefaultSkybox(env, true, 1000, p.skyboxBlur);   // sky and IBL are the SAME source

  // 2) Sun: direction extracted from the HDRI at bake time, stored in the profile
  const sun = new DirectionalLight("sun", Vector3.FromArray(p.sunDirection).normalize(), scene);
  sun.intensity = p.sunIntensity;
  sun.diffuse.fromHexString(p.sunColorHex);
  sun.shadowMinZ = 1; sun.shadowMaxZ = p.shadowMaxZ;          // 400–600 m combat sightline

  // 3) Cascades
  const csm = new CascadedShadowGenerator(quality.shadowMapSize, sun, true);
  csm.numCascades = quality.cascades;
  csm.stabilizeCascades = true;
  csm.autoCalcDepthBounds = true;
  csm.lambda = 0.85;
  csm.normalBias = p.normalBias;                  // per-biome, not global
  csm.bias = p.depthBias;
  csm.filter = quality.pcss ? CascadedShadowGenerator.FILTER_PCSS
                            : CascadedShadowGenerator.FILTER_PCF;
  // Register CASTER PROXIES, not LOD0 meshes:
  for (const proxy of scene.getMeshesByTags("shadow_caster_proxy")) csm.addShadowCaster(proxy, false);

  // 4) Interior/cockpit probe
  if (p.probe) {
    const probe = new ReflectionProbe("interior", 256, scene);
    probe.refreshRate = 0;                        // on demand; refresh on zone change
    scene.customRenderTargets.push(probe.cubeTexture.renderTarget!);
  }

  // 5) Tone map, exposure, grade
  const ip = scene.imageProcessingConfiguration;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = p.toneMap === "aces"
      ? ImageProcessingConfiguration.TONEMAPPING_ACES
      : ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;   // hangar / MechLab
  ip.exposure = p.exposureEV;                     // FIXED — no auto-exposure in combat
  if (p.lutUrl) { ip.colorGradingTexture = new ColorGradingTexture(p.lutUrl, scene); ip.colorGradingEnabled = true; }

  // 6) Post stack (Frame Graph owns ordering in production; DRP shown for brevity)
  const drp = new DefaultRenderingPipeline("post", true, scene, scene.cameras);
  drp.samples = 1;                                 // TAA handles AA; no MSAA cost
  drp.bloomEnabled = true; drp.bloomThreshold = p.bloomThreshold;  // high: reactor/muzzle only
  drp.depthOfFieldEnabled = false;                 // cinematics only
  if (quality.ssao) new SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: quality.ssaoRatio, blurRatio: 1 });
  // IBL shadows, volumetric lighting and clustered lighting are enabled per preset —
  // wire them in the Frame Graph and gate on WebGPU support.
}
```

---

## §6. TRIPO3D PRODUCTION SPEC — one pipeline, shadow-correct and PBR-true

Tripo is a **source-asset generator**, never the authority on topology, scale, rigging or game-readiness. Everything runs through `packages/tools-tripo` server-side, with provenance. Replaces the four divergent Tripo sections in the inherited docs.

### 6.1 Endpoints, models, plan

- Task API: `POST https://api.tripo3d.ai/v2/openapi/task`, uploads via `/v2/openapi/upload`, poll `GET /v2/openapi/task/{task_id}`; a newer v3 generation surface exists (`openapi.tripo3d.ai/v3/generation/...`). **Pin one surface in `.env` and verify current `model_version` strings and task-type names against live docs before every batch** — the lineup versions fast.
- Task types in use: `text_to_model`, `image_to_model`, `multiview_to_model`, `texture_model`, `refine_model`, `convert_model`, `mesh_segmentation`, `animate_prerigcheck` / `animate_rig` / `animate_retarget`.
- Commercial rights: free-tier output is **not** licensed for commercial use. `{TRIPO_PLAN}` must be a paid plan before a single shipping asset is generated. Snapshot the terms into `assets-source/provenance/_terms/tripo_<date>.md`.

| Job | Model line | Why |
|---|---|---|
| Props, kit pieces, destructibles, anything instanced | **P1-class (Smart Mesh)** | Production-grade native 3D, clean engine-ready topology in seconds — the default workhorse |
| Hero frames, cockpit, objective structures, marketing renders | **H3.1-class (high detail)** | Dense geometry that holds up close and bakes beautifully into normals — source only, never runtime |
| Silhouette exploration / concept iteration | v3.x standard mode | Cheap, fast, throwaway |
| Hero texture finish | **8K Texture upscale**, then downsample | True 8192² base color → 4K KTX2 runtime with detail that survives compression |
| Damage separation | `mesh_segmentation` / `generate_parts` | Sections must be separable for localized damage |

Seeds: fix `model_seed` per asset (geometry reproducibility), iterate looks with `texture_seed` only. Both go in the provenance record.

### 6.2 Method selection

| Asset class | Method | Notes |
|---|---|---|
| Hero frame (8 chassis) | **`multiview_to_model`** from four original orthographic concepts (front/left/back/right) + a ¾ beauty view for texture reference | Multiview is the only way to control silhouette. Concept art must be original — never a franchise image, never a screenshot |
| Cockpit interior | `image_to_model` from an original interior concept, H3.1-class | Separate asset, aggressively culled outside first-person |
| Vehicles, craft, emplacements | `image_to_model` or `multiview_to_model` | Same rules as frames at lower budgets |
| Structures, kit pieces, props | `text_to_model`, P1-class | Prompt ≤ 255 chars: function + silhouette + materials + exclusions |
| Biome variants | **retexture the same mesh** via `texture_model` | Do not triple the manifest; one blast wall + three biome material sets |
| Destructibles | base mesh + `generate_parts` | Verify each part has a sealed interior face and its own pivot |

### 6.3 Naming — one namespace replacing `env_tut_*` / `env_mp_*` / `env_bt_*`

```
sa_<domain>_<biome|shared>_<name>_<variant>_<lod>
   domain ∈ frame | cockpit | vehicle | struct | prop | kit | fx | ui
   e.g. sa_frame_shared_scout-a_base_lod0
        sa_struct_tundra_relay-mast_iced_lod2
        sa_prop_shared_crate-heavy_a_lod1
```
Sockets, collision proxies and shadow proxies suffix the same stem: `_col`, `_shadow`, `_socket_<name>`.

### 6.4 The two rules that make generated assets shade and shadow correctly

**Rule 1 — the albedo must be DE-LIT.** Generated textures frequently arrive with lighting baked into base color (ambient occlusion, studio highlights, contact shadows). Under an HDRI that produces double-shading: the scene lights an image of a lit object. It is the single most common reason AI assets look "pasted on".

- Always request `pbr: true` with `texture_quality: "detailed"`.
- Every prompt ends with the **de-light clause**:
  `"...evenly lit neutral studio illumination, no baked shadows, no baked ambient occlusion, no cast shadows in the texture, no strong highlights, no reflections of the environment, flat neutral albedo, isolated object on plain background, no ground plane, no text, no logos, no watermark"`
- Negative prompt (constant, every job):
  `"low quality, blurry, cartoon, stylized, text, watermark, logo, ornate, baked lighting, baked shadows, ambient occlusion in base color, studio highlights, ground shadow, environment reflections, human figure"`
- On ingest, `tools-assetpipe` runs a **de-lighting check**: compute local luminance variance in cavity regions against the AO map; if base color correlates with the AO channel above threshold, the asset is flagged and either re-generated or de-lit in the DCC. AO belongs in the **ORM red channel only**.

**Rule 2 — the geometry must be shadow-legal.** Enforced by §5.3's asset requirements and the §6.6 gate: watertight, outward normals, consistent winding, no zero-thickness sheets, no interior junk, no floating shells, no intersecting duplicate hulls, explicit alpha mode, and a dedicated `_shadow` caster proxy.

**Channel conventions (non-negotiable):**

| Map | Format | Convention |
|---|---|---|
| Base color | sRGB, KTX2 (UASTC hero / ETC1S bulk) | De-lit. No AO. No baked shadow. |
| Normal | Linear, **OpenGL +Y (glTF standard)** | If the generator emits DirectX −Y, flip on ingest and log it |
| ORM | Linear, packed **R=AO, G=Roughness, B=Metallic** | One texture, three channels; never three files at runtime |
| Emissive | sRGB + intensity in material data | Drives the glow layer; heat state modulates intensity |
| Masks (damage, dirt, team tint) | Linear, packed | Damage is material-driven (§5.4), not mesh-swapped |

### 6.5 Ready-to-POST presets

```jsonc
// PRESET "HERO FRAME" — multiview from four original orthographic concepts; H3.1-class source pass
{
  "type": "multiview_to_model",
  "model_version": "<current H3.1-class version string>",
  "files": [
    { "type": "png", "file_token": "<front>" },
    { "type": "png", "file_token": "<left>"  },
    { "type": "png", "file_token": "<back>"  },
    { "type": "png", "file_token": "<right>" }
  ],
  "texture": true,
  "pbr": true,
  "texture_quality": "detailed",
  "texture_alignment": "original_image",
  "orientation": "align_image",
  "auto_size": true,
  "quad": true,
  "face_limit": 200000,          // SOURCE density for baking — never a runtime number
  "model_seed": 91001
}
```

```jsonc
// PRESET "RUNTIME TOPOLOGY" — P1-class clean-topology pass for the game mesh
{
  "type": "multiview_to_model",
  "model_version": "<current P1-class version string>",
  "files": [ /* same four views, same seed family */ ],
  "texture": true, "pbr": true,
  "texture_quality": "detailed",
  "auto_size": true,
  "quad": true,
  "smart_low_poly": true,
  "face_limit": 60000,           // pre-retopo target; final LOD0 budget is §6.8
  "model_seed": 91001
}
```

```jsonc
// PRESET "PROP" — text-to-model, P1-class (kit pieces, dressing, targets)
{
  "type": "text_to_model",
  "model_version": "<current P1-class version string>",
  "prompt": "<function + silhouette + materials> + <de-light clause §6.4>",   // ≤255 chars
  "negative_prompt": "low quality, blurry, cartoon, text, watermark, logo, baked lighting, baked shadows, ambient occlusion in base color, studio highlights, ground shadow",
  "texture": true, "pbr": true,
  "texture_quality": "detailed",
  "face_limit": 8000,
  "auto_size": true,
  "quad": true,
  "compress": true,
  "model_seed": 91120
}
```

```jsonc
// PRESET "DESTRUCTIBLE" — separable sections for localized damage
{ "type": "text_to_model", "model_version": "<P1-class>", "prompt": "<…>",
  "generate_parts": true, "texture": true, "pbr": true, "face_limit": 25000, "model_seed": 91210 }

// PRESET "HERO TEXTURE FINISH" — 8K upscale on an approved mesh, then downsample to 4K KTX2
{ "type": "texture_model", "model_version": "<current texture model>", "original_model_task_id": "<task>",
  "texture_quality": "detailed", "pbr": true, "texture_seed": 44021 }

// PRESET "EXPORT"
{ "type": "convert_model", "original_model_task_id": "<task>", "format": "GLB" }   // FBX only for DCC cleanup
```

### 6.6 QC gate — CI-enforced, reject or regenerate on any failure

**Geometry**
1. Within the §6.8 triangle budget at LOD0, LOD1, LOD2, LOD3.
2. Watertight where required; zero floating shells, zero interior junk, zero duplicate hulls.
3. Outward normals, consistent winding, no zero-thickness sheets (min 2 cm).
4. Pivot at ground contact; forward axis per project convention; `auto_size` verified against 1 unit = 1 m.
5. UVs: no overlaps in the lightmap/AO set, ≤ 8% shell waste, no cross-seam mirroring on hero assets.
6. Collision proxy ≤ 10% of render triangles and hand-verified against beam and projectile traces.
7. `_shadow` caster proxy present for anything above prop scale.

**Materials**
8. Full PBR set present; ORM packed R/G/B correctly; normal map is +Y.
9. **De-light check passes** (§6.4 Rule 1).
10. Roughness within the class band (§5.4); metallic is effectively binary; base color luminance inside 0.03–0.85.
11. Colour spaces correct (sRGB base/emissive, linear everything else) — CI reads the KTX2 headers.
12. Texture set is KTX2 with mips; no PNG/JPG ships.

**Look**
13. Silhouette reads at 400 m in all six §5.6 environments; contact sheet attached to the provenance record.
14. Palette consistent with the faction bible (Meridian pale ceramic/graphite/amber; Helix charcoal/cold-white).
15. No franchise resemblance — reviewed and signed against `docs/IP_EXCLUSION_CHECKLIST.md`.

**Record**
16. Provenance JSON complete (§6.7). No provenance, no merge.

### 6.7 Post-processing and provenance

Per asset: parts verification → retopology/cleanup of joints, bores, vents, thin armour, damage seams → skeleton + constraints (root, pelvis, torso yaw/pitch, sensor head, hips/knees/ankles/feet, shoulders/elbows/weapon mounts, recoil bones, launcher doors, radiator vanes) → animation set (idle powered/damaged, walk, run, turn, strafe, slope adapt, recoil per weapon class, brace, boost, land, stagger, fall, stand, vent, shutdown, startup, eject, destruction) → sockets (muzzle, tube, ejection, hit, foot, cockpit, camera, sensor, exhaust, smoke, severable) → LOD0–3 + collision + shadow proxy + nav footprint + radar bounds → bake high-poly detail into normal/curvature/AO/thickness/masks → GLB export → KTX2 transcode + meshopt → automated budget check → **lighting-rig contact sheet** → human approval.

```jsonc
// assets-source/provenance/sa_frame_shared_scout-a.json
{ "asset_id": "sa_frame_shared_scout-a", "generator": "tripo",
  "tasks": [{ "type": "multiview_to_model", "model_version": "…", "task_id": "…", "model_seed": 91001, "texture_seed": 44021 }],
  "inputs": ["assets-source/concept/scout-a/{front,left,back,right}.png"],
  "prompt_hash": "sha256:…", "plan": "Team", "terms_snapshot": "tripo_2026-07-01.md",
  "human_edits": ["retopo hips/knees", "rebuilt muzzle bore", "de-lit base color"],
  "qc": { "gate_version": 3, "passed": true, "contact_sheet": "…/lightrig/scout-a.png" },
  "reviewer": "TA", "approved_at": "…", "rights_status": "cleared" }
```

### 6.8 Runtime budgets

| Class | LOD0 | LOD1 | LOD2 | LOD3 | Textures |
|---|---|---|---|---|---|
| Hero frame | 120–180k | 55–80k | 20–35k | 6–12k | 4K base/normal/ORM/emissive |
| Cockpit interior | ≤ 150k | — | — | — | 4K, culled outside FP |
| Vehicle | 30–50k | 15k | 6k | 2k | 2K |
| Objective structure | 40–70k | 20k | 8k | 3k | 2K + trim |
| Prop / kit piece | 3–12k | 40% | 15% | impostor | Atlas / trim sheet |
| **Per-level dressing total** | ≤ 600k LOD0, ≤ 60 unique prop draws | | | | |

---

## §7. ELEVENLABS PRODUCTION SPEC — one audio standard: 44.1 kHz PCM master → 192 kbps delivery

**The global default, applied everywhere.** Every module that already has an ElevenLabs configuration is normalised to this. **Every module that has none — SFX, UI, ambience, announcer, cinematics, marketing — inherits this by default.** No module ships audio at any other spec.

```
MASTER    : output_format = pcm_44100      (16-bit LE PCM, 44.1 kHz)   → wrapped to WAV, archived
DELIVERY  : 192 kbps @ 44.1 kHz MP3        (encoded locally from that same master)
RUNTIME   : the 192 kbps MP3 ships; an Opus 48 kHz variant may be generated from the same
            master for bandwidth-sensitive regions — never re-generated, only transcoded
```

### 7.1 Plan gating (check this before the first batch, it decides the whole pipeline)

| Format | Requirement |
|---|---|
| `pcm_44100` (and `wav_44100`) | **Pro tier or above** |
| `mp3_44100_192` | **Creator tier or above** |
| `opus_48000_192` | available for web delivery |

- **`{ELEVEN_PLAN}` ≥ Pro (recommended):** request `pcm_44100`, archive the WAV master, encode 192 kbps locally. Lossless master, one generation, no double-lossy.
- **`{ELEVEN_PLAN}` = Creator:** request `mp3_44100_192` directly and skip the transcode. You keep the delivery spec, you lose the master — document this as technical debt in `docs/AUDIO_BIBLE.md` and upgrade before final mastering.
- **Below Creator:** the pipeline does not run. `tools-eleven` refuses the batch and prints the required upgrade. This is intentional.

**Generate once.** Each API call is a new take and costs credits; generation is not bit-reproducible even with a seed. Render the master once, then transcode:

```bash
# raw PCM (headerless, s16le, stereo) → WAV master
ffmpeg -f s16le -ar 44100 -ac 2 -i take.pcm "$MW_ROOT/assets-source/audio-master/${ID}.wav"
# identical take → 192 kbps / 44.1 kHz delivery MP3
ffmpeg -i "$MW_ROOT/assets-source/audio-master/${ID}.wav" -codec:a libmp3lame -b:a 192k -ar 44100 \
       "$MW_BUILD/mw/apps/web/public/audio/${ID}.mp3"
# optional runtime Opus (same master, never a second generation)
ffmpeg -i "$MW_ROOT/assets-source/audio-master/${ID}.wav" -c:a libopus -b:a 128k -vbr on \
       "$MW_BUILD/mw/apps/web/public/audio/${ID}.opus"
```
*(Mono VO renders: use `-ac 1`. If a WAV plays at half or double speed, the channel count is wrong.)*

### 7.2 Model matrix

| Use | Model | Why |
|---|---|---|
| Mission-control, squad callouts, tutorial, UI, announcer — anything that must sound *identical* across hundreds of short lines | **`eleven_multilingual_v2`** | Deterministic across many small generations, supports SSML breaks, pronunciation dictionaries, and `speed`; localises on the same voice |
| Story performances, emotional scenes, antagonist monologues, multi-character exchanges | **`eleven_v3`** (+ Text-to-Dialogue for two-hander scenes) | Widest expressive range and inline audio tags; strongest on longer generations, weakest on 3-word status barks — use it where performance matters, not where consistency matters |
| Any future runtime-generated line | `eleven_flash_v2_5` | Low latency. **Never** used for shipped baked audio |
| Score | **Eleven Music `music_v2`** | Prompt or `composition_plan` for section-accurate cues; Audio Reference to lock the score's sonic identity across cues; Music Finetunes if the composer wants a house sound |
| SFX, ambience, UI | **`eleven_text_to_sound_v2`** | 0.5–30 s, `loop: true` for seamless ambience beds |
| Subtitle timing | **Forced Alignment API** | Word-level timestamps generated from the master + script — subtitles are derived, never hand-timed |

### 7.3 Voice cast — pin once, never drift

One cast across campaign, tutorial, hangar and (post-launch) multiplayer announcer. Mid-project voice drift is the number-one VO pipeline failure.

1. Build every principal with **Voice Design** or a properly licensed actor with documented consent. Never imitate a celebrity, a known performer, or the original franchise cast.
2. Audition 5–8 candidates against the **same three calibration lines** at the exact settings below, then **pin the `voice_id`** in `content/dialogue/_cast.json`.
3. A pinned voice is never re-designed. Retakes reuse the pinned voice, the same model, and the same seed ± a small stability nudge.
4. Maintain a voice bible per role: age, weight, accent, cadence, emotional range, forbidden mannerisms, pronunciation notes, approved reference lines.

**Starting settings** (A/B a 30-second sample before any batch):

| Role type | stability | similarity_boost | style | speaker_boost | speed |
|---|---|---|---|---|---|
| Synthetic / onboard intelligence | 0.90 | 0.75 | 0.00 | true | 0.95 |
| Mission control | 0.75 | 0.75 | 0.10 | true | 1.00 |
| Squad / pilots (combat barks) | 0.65 | 0.80 | 0.25 | true | 1.02 |
| Antagonist / story performance (`eleven_v3`) | 0.50 | 0.80 | audio tags carry direction | true | — |

### 7.4 Reference payloads

```jsonc
// VO — consistency line (multilingual v2), 44.1 kHz PCM master
POST https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}?output_format=pcm_44100
{
  "model_id": "eleven_multilingual_v2",
  "text": "Override accepted. <break time=\"0.25s\" /> Reactor risk noted.",
  "voice_settings": { "stability": 0.90, "similarity_boost": 0.75, "style": 0.0,
                      "use_speaker_boost": true, "speed": 0.95 },
  "seed": 52028,
  "pronunciation_dictionary_locators": [
    { "pronunciation_dictionary_id": "<DICT_ID>", "version_id": "<VERSION_ID>" }
  ]
}
```

```jsonc
// VO — performance line (v3, inline audio tags)
POST https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}?output_format=pcm_44100
{ "model_id": "eleven_v3",
  "text": "[quietly, with contained grief] We saved the tower. We did not save the people who kept it alive." }
```

```bash
# MUSIC — 44.1 kHz PCM master (Eleven Music)
curl -X POST "https://api.elevenlabs.io/v1/music?output_format=pcm_44100" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" \
  -d '{ "model_id": "music_v2",
        "prompt": "<CUE PROMPT + SHARED STYLE SUFFIX>",
        "music_length_ms": 180000 }' --output cue.pcm
# composition_plan (mutually exclusive with prompt) when section boundaries must land on gameplay phases
```

```jsonc
// SFX / ambience
POST https://api.elevenlabs.io/v1/sound-generation?output_format=pcm_44100
{ "model_id": "eleven_text_to_sound_v2",
  "text": "Dry isolated single footfall of a 100-ton walker on cracked concrete: servo strain, colossal low impact, concrete breakup, rebar vibration, armor rattle, short structural groan. No music, no voice, no reverb tail.",
  "duration_seconds": 3.0, "loop": false }
```

**Pronunciation dictionary:** create once (`POST /v1/pronunciation-dictionaries/add-from-file`, PLS lexicon), attach at request time, cover every invented proper noun. Alias rules are the robust path on `eleven_multilingual_v2`. Re-check the lexicon per locale.

### 7.5 What the generator produces vs what the game plays

Generate **dry**. All character, space and combat processing happens in the runtime mixer, not in the render:

- VO is generated clean → radio band-pass, helmet resonance, codec artefacts, packet loss, distance and room response are applied in `packages/audio`. Radio processing must never reduce intelligibility of an objective.
- Weapons are built from **layers** (prefire, transient, body, low report, pass-by, distant tail, indoor reflection, impact per surface, recycle, dry-fire), generated as separate assets and assembled in the mixer. Never let one generated file carry a weapon.
- Walkers: foot plant per surface and weight class, toe/ankle mechanics, hip/torso servo, reactor hum by load, fans, radiator deploy, cockpit creak, armour stress, cable snap, hydraulic loss, fall, stand, shutdown, startup, destruction.
- 3–5 variants per one-shot, rotated with pitch/gain/timing jitter.

### 7.6 Subtitles, localisation, and the line database

- Every spoken line is a `dialogue_line` content record: `line_id`, speaker, trigger, source text, seed, model, voice_id, master path, delivery path, alignment path, locale keys.
- **Subtitle timing comes from Forced Alignment** on the master audio — word-level, regenerated automatically whenever a line is re-rendered. Hand-timed subtitles are banned.
- `{LANGUAGES}`: regenerate with the same voice and identical settings; re-run the lexicon per locale; re-align. Non-English lines get their own alignment files, never a stretched copy of the English timing.
- Speaker labels, direction indicators and non-speech captions are part of the subtitle payload, not an afterthought.

### 7.7 Mastering, buses and the runtime mix

| Target | Value |
|---|---|
| Dialogue | −16 LUFS integrated per line group, true peak ≤ −1.5 dBTP |
| Combat music cues | ≈ −16 LUFS, true peak ≤ −1 dBTP |
| Ambient/menu beds | ≈ −20 LUFS |
| SFX one-shots | Normalised per family, peaks ≤ −3 dBFS to leave transient headroom |
| Master bus | Program loudness ≈ −18 LUFS in the Balanced dynamic-range preset |

Buses: `master · music · dialogue · cockpit · weapons · impacts · machinery · vehicles · environment · ui`. Dialogue sidechain-ducks music by ~6 dB and non-critical SFX by ~3 dB, with a gentle 120 ms release so the mix never pumps. Cockpit occlusion filters exterior sound while preserving low-frequency impact and critical enemy cues. Convolution zones: outdoor, urban, cavern, hangar, cockpit. Propagation delay only for very large distant events. Dynamic-range presets: **Night / Balanced / Cinema**. Accessibility: independent dialogue boost, reduced high-frequency alarms, tinnitus-safe option, mono downmix.

Loop points are trimmed to bar boundaries in the DAW — the generator's "loop-ready tail" is a starting point, not a loop point. Master long, cut tight.

### 7.8 Audio QC gate — CI-enforced

1. Format: 44.1 kHz; master is PCM/WAV; delivery is 192 kbps MP3 (or the documented Creator-tier fallback).
2. Loudness and true-peak within §7.7 targets.
3. No clipping, no DC offset, no digital silence > 400 ms at head or tail (except authored beds).
4. Loop assets: seam verified by null-test across the loop point.
5. Every line has: master, delivery, alignment file, subtitle text, locale keys, and a provenance record.
6. Timbre consistency: automated spectral-centroid comparison against the pinned voice's calibration set; outliers flagged for re-take.
7. Intelligibility: dialogue must remain clear at maximum combat density in the automated mix test.
8. Zero mispronounced lexicon terms (checked against the dictionary list).

### 7.9 Rights, provenance, and one legal gate you must not skip

- Provenance record per artefact: prompt, model, seed, settings, plan, date, terms snapshot, human edits, reviewer, approval.
- Voice cloning requires documented rights and consent of the voice owner. No exceptions, no "it's just a test".
- **Eleven Music licensing:** music is cleared for broad commercial use on paid plans, but **film, TV and large-studio game rights sit behind Enterprise terms**. Before a single score cue is generated for the shipping build, have counsel read the current Eleven Music terms against this project's distribution model and record the answer in `docs/IP_EXCLUSION_CHECKLIST.md`. Discovering this after the score is written is a project-level risk, not a paperwork problem.
- No prompt anywhere may reference an existing franchise, soundtrack, composer or performer.

### 7.10 Batch runner (`packages/tools-eleven`)

```python
# skeleton — the agent completes retries, backoff, credit metering, provenance and QC hooks
FMT_MASTER   = os.environ.get("ELEVEN_MASTER_FORMAT", "pcm_44100")     # Pro+
FMT_FALLBACK = os.environ.get("ELEVEN_DELIVERY_FALLBACK_FORMAT", "mp3_44100_192")  # Creator
def render(line):
    fmt = FMT_MASTER if PLAN_AT_LEAST_PRO else FMT_FALLBACK
    audio = post_tts(line, output_format=fmt)          # one generation only
    master = wrap_wav(audio) if fmt.startswith("pcm") else save(audio)
    mp3    = encode_mp3(master, "192k", 44100)         # local transcode, same take
    align  = forced_alignment(master, line.text)       # word-level subtitle timing
    qc(master, mp3, align); provenance(line, fmt, seed=line.seed); return mp3, align
```

---

## §8. THE WEBSITE — delivery, streaming and implementation

The game *is* a website. Treat the site and the client as one product, not a marketing page with a game bolted on.

### 8.1 Site structure

```
/                      landing — hero is a LIVE in-engine hangar turntable (see 8.7), not a video
/play                  the client: boot → device probe → preset → account → hangar → briefing → mission
/hangar /campaign      deep links into the client shell (React), pre-boot for returning players
/media /devlog         capture from the real renderer only; never a bullshot
/legal /accessibility /credits   credits include every generated-asset provenance summary
```

### 8.2 Boot sequence (first paint to first frame)

1. **≤ 1.5 s to interactive shell** (React + fonts + landing hero poster), 100 kB critical JS budget.
2. Device probe (~3 s, cached): adapter, feature flags, memory, a micro-benchmark → picks a §5.7 preset.
3. Engine + WASM physics load in parallel with the *first mission's* asset manifest.
4. Streaming order: cockpit → player frame → immediate encounter set → biome kit → distant impostors → optional detail.
5. Anything not needed in the first 60 seconds of gameplay is deferred. **Time to first playable ≤ 20 s on a warm cache, ≤ 45 s cold on a 50 Mbps connection.**

### 8.3 Asset delivery

- glTF/GLB + **KTX2/Basis** (UASTC for hero, ETC1S for bulk) + **meshopt** compression. Textures are transcoded on the GPU, never decoded on the main thread.
- Content-hashed filenames, `Cache-Control: public, max-age=31536000, immutable`; a versioned `manifest.json` is the only mutable file.
- **Brotli** (level 11 pre-compressed at build) for JS/JSON/WASM; binary assets ship pre-compressed and are served with the right `Content-Encoding`.
- **HTTP/3 + global CDN**, origin in `{HOME_REGION}`, edges covering `{LAUNCH_REGIONS}`.
- Large assets cached in the **Cache API / OPFS** with an eviction policy and a "clear game data" control in settings.
- Progressive texture streaming: ship low mips inside the initial bundle so nothing is ever blurry-then-popping in the player's face.

### 8.4 Required headers

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp     # enables SharedArrayBuffer → threaded WASM physics
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval';
  connect-src 'self' https://cdn.example.com wss://… https://…; img-src 'self' data: blob:;
  media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'
Permissions-Policy: geolocation=(), camera=(), microphone=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```
WebGPU requires a secure context. HTTPS everywhere, including local dev.

### 8.5 Netcode (built now, shipped post-launch)

Authoritative server at a fixed tick; client predicts local movement only. **WebTransport (HTTP/3)** for unreliable state datagrams with a WebSocket fallback; reliable ordered stream for commands and chat. Snapshot interpolation, input prediction, reconciliation, lag compensation for hitscan only — projectiles keep travel time. The server validates fire rate, heat, ammunition, speed, transforms, inventory, damage, loadout legality and objective actions. Reconnect, rejoin, spectate, report, moderate, and event logs that can drive a replay later.

### 8.6 Security, privacy, ops

Secrets server-side only; signed asset URLs where warranted; strict CORS; rate limiting; input validation on every endpoint; audit logs; dependency and container scanning in CI; versioned bundles with hashes; save-migration and rollback strategy for account/campaign data; telemetry consent, data export and account deletion; regional compliance review before launch in `{LAUNCH_REGIONS}`. No user-supplied text ever reaches a vendor generation API without moderation, quotas and sanitisation.

### 8.7 Site design direction (so the front door matches the game)

- **Signature element:** the landing hero is a live, low-cost WebGPU scene — one frame on a turntable in the hangar HDRI, ~30k triangles, 12 MB budget, static poster fallback below the Balanced preset or on `prefers-reduced-motion`. The product sells itself by *being* the product.
- **Type:** one characterful industrial/technical display face used with restraint for headings and frame designations; a highly legible neutral body face; a monospaced utility face for stats, tonnage and telemetry — the stat blocks are part of the aesthetic.
- **Palette:** graphite and cold white (Helix) against pale ceramic and amber (Meridian). Amber is reserved for actions and warnings; it never decorates.
- **Structure encodes meaning:** operation and mission numbering appears only where order is real. No decorative `01 / 02 / 03`.
- **Copy:** active voice, plain verbs, one job per element. "Deploy" produces a deployment. Errors state what happened and what to do. The empty hangar is an invitation, not a shrug.
- **Quality floor, unannounced:** responsive to mobile (spectator/hangar only), visible keyboard focus, reduced motion respected, contrast ≥ 4.5:1 everywhere.

---

## §9. IP CONSOLIDATION — porting Operations 8–9 into Sovereign Ash

The Op 8–9 material is structurally excellent — a mop-up operation about the cost of winning, then a mercenary counter-invasion. **Keep the structure. Replace every proper noun, chassis, faction and line of dialogue.** Nothing is deleted; it is rewritten as original work.

### 9.1 Port map

| Op 8–9 element (do not ship) | Sovereign Ash equivalent (write fresh) |
|---|---|
| Ian Dresari, Duke of Kentares | The player-commander of **Ash Unit** — no royalty, no throne, no family tie to the antagonist |
| Kentares IV, Kentares City, Argonne, Jeteel, Hardra | Nareth locations: the Skyhook approach, the twilight band, Cinder-lit coast, the Crown Array relay towns |
| Lyran/Steiner occupation, the Archon | **Helix Directorate**, and a Directorate authority that writes Nareth off |
| Gray Talons, Colonel Katherine Vane | An original contracted combined-arms company and its commander — professional, unhated, paid |
| Named 'Mechs (Atlas, Daishi, Vulture, Thor, Loki, Mauler, Uziel, Catapult, Zeus…) | The eight Sovereign Ash frames by weight class and role; never a recognisable silhouette |
| Omega Lance roster and callsigns | The existing Sovereign Ash cast (Sen, Rell, Kest, Marr, MIRA-7) |
| Op 8 "Ashes of Victory" | **Operation 3 — the aftermath arc**: starport seizure, coastal remnant, relief-convoy raiders, a fugitive intelligence chief, a fortress with hostages |
| Op 9 "The Archon's Answer" | **Operation 4 (post-launch)** or the campaign finale: recon-in-force, bridge demolition, evacuation defence, decapitation duel |
| Op 8-4 "capture or kill" moral beat | Retained — it is a *structure*, not IP; rewritten with Sovereign Ash characters and stakes |
| Branch notes (a squadmate lives/dies) | Retained as the campaign's consequential branch |

Mission *shapes* that port cleanly and should be kept: launch-timer starport assault; naval/coastal target denial under a storm front; convoy escort into an ambush and a raider base; convoy interception with a capture-or-destroy choice; fortress assault with a timed hostage phase; night recon with beacon placement and a hot exfil; escort-and-demolish with a timed defence; three-wave defensive hold protecting an evacuation; final duel with comms jammed and no support.

### 9.2 The rewrite rule

Rewrite from **beat outline**, never from the original text. Take "launch timer + turret grid + command lance + civilian shelter + moral offer at the midpoint" and write new briefings, new dialogue, new names, new terrain. If a sentence in the new mission could be diffed against the old one and match, it is not a port, it is a copy.

### 9.3 Audio and asset consequences

- Every Op 8–9 voice, music and Tripo prompt in the inherited files is rewritten against the Sovereign Ash score bible and the §6.4 prompt rules. The two campaign motifs (a rising three-note duty figure; a clipped four-note antagonist figure) survive as *original* material — they were already described as original compositions.
- The 192 kbps / 44.1 kHz PCM render pipeline in the music document is **promoted** to the project-wide standard in §7. That document got it right; the rest of the project now matches it.

### 9.4 The IP exclusion checklist (signed at every milestone)

Automated: repository-wide banned-term scan across source, content, prompts, filenames, commit messages, asset metadata, subtitles and marketing copy — build fails on a hit. Manual: art lead confirms no chassis silhouette, no HUD composition, no iconography, no colour-and-shape identity and no audio motif reads as the source franchise; producer confirms every generated asset's provenance shows original inputs; counsel confirms trademark clearance on `{PROJECT_TITLE}` and the top proper nouns.

---

## §10. AAA QUALITY BARS — numeric, measured in CI, not asserted in a doc

### 10.1 Performance (measured on the reference machines, per preset, per biome)

| Gate | Threshold |
|---|---|
| Frame rate | Meets the §5.7 preset target at the 95th percentile, not the mean |
| **Frame pacing** | ≥ 99% of frames within ±25% of the target frame time; **zero** stalls > 100 ms in a 10-minute mission |
| GPU memory | ≤ 3.5 GB Ultra, ≤ 2 GB High, ≤ 1.2 GB Balanced |
| Heap | No growth > 5 MB per mission loop after 5 iterations (leak gate) |
| Load | Time-to-first-playable ≤ 20 s warm / ≤ 45 s cold @ 50 Mbps |
| Input latency | ≤ 50 ms click-to-photon at 60 fps on the Balanced preset |
| Crash-free sessions | ≥ 99.5% across the supported browser matrix |
| Bundle | Initial JS ≤ 100 kB critical + ≤ 900 kB deferred; engine chunk lazy |

Every perf number is captured by an automated flythrough per mission and stored per commit. **A regression fails the build.** Performance is a feature with an owner (the TD).

### 10.2 Browser matrix

Chrome/Edge (WebGPU) current + 1 previous · Firefox (WebGPU where enabled, WebGL2 otherwise) · Safari (Apple Silicon, WebGPU where available; WebGL2 fallback verified). Fallback must complete the same mission with reduced features, never a different game.

### 10.3 Accessibility (audited externally, not self-graded)

Full remapping (keyboard, mouse, gamepad, HOTAS); independent sensitivity/acceleration/deadzone/invert/aim-assist; toggle-or-hold for throttle, zoom, lock, command wheel, free look; scalable HUD and subtitles with background opacity; colourblind palettes plus shape/symbol redundancy; sliders to zero for camera shake, flash intensity, motion blur, with horizon stabilisation; FOV control appropriate to cockpit geometry; speaker labels, direction indicators and non-speech captions; difficulty assists for steering, heat, target lead, squad autonomy, mission timing; full dialogue-boost and mono-downmix audio options. **No mechanic may be conveyed by colour alone, sound alone, or timing alone.**

### 10.4 Content, localisation, telemetry

Every string is a locale key from day one; pseudo-localisation runs in CI (30% expansion + accent stress) and layout breakage fails the build; RTL readiness assessed even if no RTL locale launches. Telemetry: consented, aggregated, per-mission funnels (attempts, failure cause, time per objective, hint escalation, preset chosen, resolution scale hit, damage taken by section, build diversity). Telemetry answers design questions, not vanity ones.

### 10.5 Internal certification checklist (run before every milestone build)

Boot on a cold profile · every preset selectable and stable · pause/resume/alt-tab/lost-context recovery · resolution and DPI changes mid-mission · disconnect/reconnect mid-mission · save/load across a version bump · every mission completable and failable · every objective localised and subtitled · every audio asset at spec (§7.8) · every 3D asset through the gate (§6.6) · no console errors in a full playthrough · banned-term scan clean · licence and provenance report generated · accessibility settings all functional and persisted.

---

## §11. MILESTONES — 18 months

| # | Month | Deliverable | Exit gate |
|---|---|---|---|
| **M0 Foundation** | 0–2 | Repo materialised under `"$MW_ROOT"`, `.env`, CI, content schema, docs set, ADRs, banned-term scan, Drive hygiene scripts | A commit runs the schema + lint + banned-term gates |
| **M1 Lighting rig + pipeline proof** | 2–4 | §5 lighting standard implemented; six HDRI environments; one frame + one prop through the full Tripo gate; one VO line + one cue + one SFX layer through the full audio gate | Contact sheets generated automatically; both gates green on real assets |
| **M2 Vertical slice** | 4–8 | One 15–20 min mission, one biome, 3 chassis, 6 weapons, heat/damage/salvage/squad, cockpit, hangar, briefing, after-action, adaptive music, spatial SFX, WebGPU + WebGL2 | Playable from a public HTTPS URL; all §10.1 gates met; external playtest wave 1; **legal clearance complete** |
| **M3 Combat depth** | 8–12 | 8 chassis, 20+ weapons, full construction system, AI roles, damage visuals, Instant Action, Basic Training, second biome | Three viable builds per chassis proven by telemetry; contingency review |
| **M4 Campaign production** | 12–16 | 3 operations × 4 missions, full cast, branch, in-engine cinematics, 6 locales, accessibility audit | Playtest wave 2; accessibility audit passed; cert checklist green |
| **M5 Polish & launch** | 16–18 | Asset optimisation pass, browser matrix, soak tests, save migration, audio final mix, security review, storefront, RC | RC survives a 72-hour soak; crash-free ≥ 99.5%; launch |
| Post-launch | 18+ | 4v4 multiplayer, Operation 4, additional frames | On the same authoritative server built in M2 |

---

## §12. ACCEPTANCE CRITERIA — the definition of done

1. Playable from a public HTTPS URL with no install, on the full §10.2 matrix.
2. Every §10.1 performance gate met at the 95th percentile, with per-commit history proving no regression.
3. Cinematic Ultra is demonstrably excellent at 4K **and** frame-paced; Fallback completes the same missions.
4. Every runtime asset passes the §6.6 gate; **no raw generated mesh and no PNG texture ships**; every asset has a lighting-rig contact sheet and a provenance record.
5. Every audio asset is a 44.1 kHz master delivered at 192 kbps, passes §7.8, and has forced-alignment subtitle timing in every locale.
6. Shadows are correct everywhere: no acne, no peter-panning, no leaking through armour, no unshadowed hero object, verified per biome in the six environments.
7. Controls communicate mass but stay responsive; every hit maps visibly and mechanically to a body section; heat materially changes decisions; three viable builds exist per chassis; squad orders acknowledge and execute reliably.
8. Dialogue stays intelligible at maximum combat density; the mix never pumps; all accessibility options work and persist.
9. Server authority verified by an adversarial client that attempts illegal loadouts, fire rates, transforms and inventory writes — and fails at every one.
10. Zero franchise content anywhere in code, content, assets, metadata, prompts, commits, subtitles or marketing; checklist signed by art, production and counsel.
11. Budget reconciled against §2 with contingency remaining ≥ 0; schedule reconciled against §11.

---

# OUTPUT FORMAT REQUIRED FROM YOU

Do not reply with a design essay. Deliver, in this order, as clearly separated sections:

1. **Migration report** — the current-state audit of the eight inherited documents, the delta you will apply (§1), and the scope trade in writing.
2. **The materialised repository** — exact file tree created under `"$MW_ROOT"`, plus `.env.example`, `ops/scripts/bootstrap.sh` and `ops/scripts/drive-hygiene.sh`.
3. **The core docs** — `/docs/GDD.md`, `TDD.md`, `ART_BIBLE.md`, `AUDIO_BIBLE.md`, `NARRATIVE_BIBLE.md`, `LIGHTING_STANDARD.md`, `IP_EXCLUSION_CHECKLIST.md`, `BUDGET.md`, `SCHEDULE.md`, `BACKLOG_POST_LAUNCH.md`, and ADR 0001.
4. **Content schemas** — the Zod definitions for every type in §3.3, with generated TS types and one validated example per type (including a full `lighting_profile` for two biomes).
5. **Rendering package** — `packages/rendering` lighting/shadow/material implementation per §5, the Frame Graph pipeline, the quality-preset table as data, and the `lightrig` harness with its contact-sheet output.
6. **Tripo package** — `packages/tools-tripo`: batch runner, one ready-to-POST payload per asset class, the ingestion + QC gate implementation, and the provenance writer.
7. **Eleven package** — `packages/tools-eleven`: batch runner with the PCM-master → 192 kbps flow, plan detection and fallback, pronunciation dictionary bootstrap, forced-alignment subtitle generation, mastering chain, QC gate.
8. **Web delivery** — Vite config, header config, CDN/caching config, boot sequence implementation, device probe, preset selection.
9. **Op 8–9 port** — the twelve-mission campaign outline in Sovereign Ash canon, with the port map applied and fully original briefings for the first two missions as proof of method.
10. **CI** — the pipelines that enforce §6.6, §7.8, §10.1, the banned-term scan, pseudo-localisation and the path-quoting lint.
11. **Backlog** — every milestone in §11 broken into ≤ 1-day tickets, with owners from §2.2.

Mark every assumption `[ASSUMPTION]` inline. When a requirement collides with browser performance, preserve the *visual intent* through LOD, streaming, compression, procedural variation and adaptive quality — never by silently lowering quality or shipping unstable frame pacing. Use placeholders only where the replacement path is documented; never present placeholder art or audio as final.

---

## APPENDIX A — the two commands that must exist on day one

```bash
# A1. Full asset validation (runs in CI and locally, exits non-zero on any gate failure)
pnpm run validate:assets -- --root "$MW_ROOT" --gate 6.6 --contact-sheets
# checks: budgets, watertightness, normals, winding, thickness, pivots, scale, UVs,
#         collision + shadow proxies, ORM packing, normal-map handedness, colour spaces,
#         de-light correlation, KTX2 + mips, palette, provenance completeness

# A2. Full audio validation
pnpm run validate:audio -- --root "$MW_ROOT" --gate 7.8
# checks: 44.1 kHz, master present, 192 kbps delivery, LUFS + true peak, clipping, DC,
#         silence, loop seams, alignment files, subtitle links, timbre drift, lexicon, provenance
```

## APPENDIX B — a `lighting_profile` record (this is what "environment lighting as data" means)

```jsonc
{
  "id": "sa_light_tundra_whiteout",
  "biome": "tundra",
  "envUrl": "cdn:/env/tundra_overcast_256.env",     // prefiltered from a 4K CC0 .hdr master
  "hdriSource": "assets-source/hdri/tundra_overcast/",  // .hdr + LICENSE.txt live together
  "envRotationY": 2.31,
  "environmentIntensity": 1.15,
  "sunDirection": [-0.32, -0.86, 0.39],             // extracted from the HDRI at bake time
  "sunIntensity": 2.4, "sunColorHex": "#DCE6F2",
  "shadowMaxZ": 480, "normalBias": 0.035, "depthBias": 2.4e-5,
  "toneMap": "aces", "exposureEV": 0.9,
  "lutUrl": "cdn:/grade/tundra.cube",
  "fog": { "mode": "volumetric", "density": 0.018, "extinction": 0.9, "phase": 0.42 },
  "bloomThreshold": 0.92,
  "probe": false,
  "notes": "Ambient carries the scene; sun is weak and elevated. Watch shadow bias — high ambient hides acne in review and exposes it in play."
}
```

## APPENDIX C — disposition of the eight inherited documents

| File | Disposition |
|---|---|
| `sovereign_ash_master_web_game_prompt.md` | **Promoted to canon.** Superseded only where this prompt is more specific (stack version, lighting, Tripo, audio, budget, scope). Moves to `docs/_inbox/`, its content distributed into `docs/GDD.md`, `TDD.md`, the bibles and `content/`. |
| `sovereign-ash-hangar-master-prompt.md` | Folded into `content/` schemas + `apps/web` hangar module. Bay economy, duplicate rules and the server-authoritative model are kept verbatim in spirit. |
| `sovereign-ash-basic-training-tutorial-master-prompt.md` | Folded in as `tutorial_step` content + the tutorial module. Its VO discipline (no key names, every line standalone, pinned voice) is **promoted to a project-wide rule** in §7. |
| `mw4_elevenlabs_music_prompts.md` | Its 192 kbps / 44.1 kHz PCM pipeline is **promoted to §7, project-wide**. Its cue prompts are rewritten to Sovereign Ash names and motifs; the score-bible structure is kept. |
| `mw4_elevenlabs_tripo3d_prompts.md` | Voice-design and model prompts rewritten per §6.4 and §7.3; franchise chassis prompts deleted, replaced by the eight Sovereign Ash frames. |
| `mw4_extended_missions_op8-9.md` | Structure ported per §9; text never reused. Original file stays read-only in `docs/_inbox/` as a design reference. |
| `mech-tutorial-master-prompt.md` | Merged into the Basic Training module; the generic `{GAME_ENGINE}` framing is dropped — the engine is Babylon 9. |
| `mech-multiplayer-master-prompt.md` | Moves to `docs/BACKLOG_POST_LAUNCH.md` intact. Its mode set and netcode requirements shape the server architecture built during M2 so the post-launch add is not a rewrite. |

---

*End of master prompt. Everything above is the specification; nothing above is optional except where marked. If you must break a rule to ship, write an ADR that says which rule, why, what it costs, and when it gets fixed.*
