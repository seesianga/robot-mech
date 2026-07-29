# CONVERGENCE PLAN — Veyra Prime

**Status:** Adopted 2026-07-29. Supersedes conflicting statements in any other document.
**Owner:** Technical Director / Executive Producer.
**Scope:** §1 migration · §2 money · §9 IP · §11 milestones · §12 definition of done.

Companion standards, each normative in its own domain:

| Document | Owns |
|---|---|
| [LIGHTING_STANDARD.md](LIGHTING_STANDARD.md) | §5 rendering, HDRI/IBL, shadows, shading, quality presets |
| [PIPELINE_STANDARD.md](PIPELINE_STANDARD.md) | §6 Tripo3D, §7 ElevenLabs, §3.3 naming and content schema |
| [PLATFORM_STANDARD.md](PLATFORM_STANDARD.md) | §3 repo and Drive hygiene, §4 stack and `.env`, §8 delivery, §10 gates |

---

## §0. THE CORRECTION — read this before anything else

The commissioning brief described `$MW_ROOT` as *"a pile of excellent, overlapping, partially
contradictory design prompts and no shipped configuration"*, listing eight documents across two
incompatible canons.

**That description does not match this repository.** The audit of 2026-07-29 found:

- **None of the eight named documents exist** — not under `$MW_ROOT`, not anywhere on the Drive.
- `$MW_ROOT` is **Veyra Prime, a shipped and live game**: 14,508 lines of TypeScript across 43
  files, 22 campaign runtime configs, 25 mission documents, 1,486 audio files, 357 GLB models,
  Cloudflare D1 pilot accounts with migrations, a Durable Object match server, 49 npm scripts,
  11 design documents, and two live deployments.
- **The stack is Three.js 0.180 + Rapier3d + Vite 6** — not Babylon.js + Havok.
- **There is no Track A / Track B canon split here.** Veyra Prime is already single-canon
  original IP. A word-bounded scan for franchise terms across `docs/ src/ content/ scripts/
  server/` returned **six hits, every one a self-aware disclaimer** of the form *"working title,
  will be renamed pre-ship"*. Zero Dresari, Kentares, Steiner, Daishi, Vulture, Mauler, Uziel.
  There is no Operation 8–9 material to port. §9 is therefore a **trademark and rename** section,
  not an IP-laundering section.
- **One genuine canon leak was found, running the opposite way from the brief's assumption:**
  `src/ui/hangar.ts:326` displays `MERIDIAN ASSEMBLY` — a *Sovereign Ash* faction — in the live
  hangar UI. Sovereign Ash canon has bled into Veyra Prime, not the reverse. Fixed in M0; the
  retired-canon scan that caught it becomes permanent (§9.2).

What *does* exist, in a different folder, is `Qoder game/sovereign-ash/` — the "Sovereign Ash:
Nareth Protocol" monorepo. It is the brief's §3 layout almost verbatim and it is **hollow**:
`content/` empty, `assets-source/` empty, `apps/server/src` empty, `apps/admin/src` empty,
`apps/web/src` two files, six of nine packages with zero source, and an ADR locking Babylon.js
**7.x**. Eight source files in total.

So the brief's premise is inverted: the folder said to have "no shipped configuration" is the one
that is fully configured and live; the design-docs-and-empty-repo project is the other one.

### §0.1 The decision

**Converge onto `$MW_ROOT` (Veyra Prime). Import Sovereign Ash's *discipline*, not its *scaffold*.**

Both projects are legally clean original IP, so the Prime Directive's purpose — only shippable IP
ships — is already satisfied and does not favour either side. What differs is that one has a
working simulation, a live deployment and roughly 1,800 produced assets, and the other has eight
source files.

Sovereign Ash's real value is its rigour: the §5 lighting standard, the one-pipeline §6/§7 specs,
the §10 numeric gates, the IP checklist, the ADR habit. Rigour is portable. A Three.js → Babylon
rewrite is the most expensive line item available and buys the player nothing.

**Consequences of this decision, binding:**

1. Canon is **Veyra Prime**: Free Veyran Compact vs Karst Directorate, the occupied mining world
   Veyra Prime, chassis Skarn → Craton. Nareth, Meridian Assembly and Helix Directorate are
   **retired**. They do not appear in source, assets, content or marketing.
2. Renderer stays **Three.js**. The §5 upgrade is delivered *on Three*, not by porting.
   See [ADR-0001](adr/0001-renderer-three-vs-babylon.md).
3. `Qoder game/sovereign-ash/` is archived to `docs/_inbox/sovereign-ash/` as read-only
   reference. Its standards documents are the source material for the three companion standards
   above. Its code is not imported.
4. Prime Directives 3–8 of the brief (server authority, secrets server-side, no raw generated
   asset ships, craft floor before content ceiling, verify under the lighting rig, data not code)
   carry over **unchanged** and are enforced by [PLATFORM_STANDARD.md](PLATFORM_STANDARD.md) §10.

---

## §1. THE MIGRATION

### §1.0 The scope trade, stated once and plainly

$1M is not an AAA budget. Actual AAA productions run $50M–$300M. What $1M buys, spent well, is
**AAA craft standards on a deliberately small surface** — a game that looks, sounds, controls and
performs like a premium title, and is simply shorter.

This project starts from an unusual position: **the content ceiling has already been reached and
the craft floor has not.** There are 24 missions, 1,486 audio files and 357 models in the build,
and the game is lit by a hemisphere light and a single 2048 shadow map. Every other studio in this
budget bracket spends its money buying content. This one must spend it buying **craft**.

That inverts the usual trade:

| We buy | We do not buy |
|---|---|
| The §5 lighting and shading upgrade, applied to content that already exists | A renderer port |
| Re-lighting, re-materialing and QC-gating the 357 existing models | More missions |
| Cascaded shadows, real IBL per biome, contact shadows, SSAO, volumetrics, quality presets | More chassis |
| Version control, CI, and numeric gates that make quality non-negotiable | 8v8 ranked multiplayer with replays at launch |
| Frame pacing at 60 fps / 1440p, full accessibility, 6 locales | Console and native ports |
| A campaign **cut to 12 missions, each finished to the craft floor** | 24 missions at the current craft level |

**The mission cut is the hard call and it is made here.** 24 missions at the current lighting
standard is a worse product than 12 missions at the §5 standard, and 24 missions *at* the §5
standard does not fit in $1M. Missions M13–M24 move to
[BACKLOG_POST_LAUNCH.md](BACKLOG_POST_LAUNCH.md) with their content intact — they are sequenced,
not deleted, and they are the cheapest post-launch content any studio will ever ship because they
are already built.

Target shape at launch: **Basic Training + 3 operations × 4 missions (M01–M12) + Instant Action.**

### §1.1 Delta table — measured, not assumed

Every "today" cell below was verified against the working tree on 2026-07-29.

| Area | Today (measured) | Target | Where |
|---|---|---|---|
| **Version control** | **None. No `.git` anywhere.** 3.4 GB of production on a Drive sync mount. | Git working tree in `$MW_BUILD`, bare mirror on the Drive, remote origin | PLATFORM §3.2 |
| **CI** | **None.** 19 validation/test scripts exist; nothing runs them. | GitHub Actions; every §10 gate fails the build | PLATFORM §10 |
| **Game IBL** | **None.** No HDRI, no `.env`, no PMREM in the game path. All ambient is one `HemisphereLight(0xc4d8e2, 0x6a5a48, 1.35)`. | 7 per-biome prefiltered environments, sun direction extracted from the HDRI | LIGHTING §5.2 |
| **Post-processing in game** | **None.** `EffectComposer` + `UnrealBloomPass` + PMREM exist **only** in `src/site/stage.ts` — the marketing page is better lit than the game. | Full ordered stack: prepass → SSAO → volumetrics → TAA → bloom → grade | LIGHTING §5.5 |
| **Shadows** | Single `DirectionalLight`, one 2048 map, `PCFSoftShadowMap`, `bias -0.0004`, frustum ±350 m recentred per frame by `trackSun()` | 4-cascade CSM (4096/2048/1024 by preset), per-biome bias, contact shadows, caster proxies | LIGHTING §5.3 |
| **Tone mapping** | `ACESFilmicToneMapping`, `toneMappingExposure = 1.3`, hard-coded, global | ACES in combat, Neutral in hangar/MechLab; fixed EV **per biome**, authored as data | LIGHTING §5.1 |
| **Quality presets** | None. One code path, `setPixelRatio(min(dpr, 2))`, shadows toggled by a `?noshadow` URL param | 4 named presets, GPU-probed on first run, user-overridable, perf overlay | LIGHTING §5.7 |
| **Renderer API** | `WebGLRenderer` only | WebGPU-first via Three's `WebGPURenderer` with WebGL2 fallback — **evaluated at M2, not assumed** | LIGHTING §5.9 |
| **Asset naming** | **Three conventions coexisting**: `vp_prop_shared_beacon`, `vp_prop_range_gantry`, `vp_struct_shared_fortress-wall`, `vp_frame_shared_craton-x`, `vp_cockpit_shared_interior` | One namespace `vp_<domain>_<biome>_<name>_<variant>_<lod>` | PIPELINE §3.3 |
| **Audio format** | **Already largely correct** — 22 call sites at `mp3_44100_192`, 4 at `pcm_44100` | Uniform: `pcm_44100` master archived → 192 kbps delivery encoded locally. Close the 22/4 split. | PIPELINE §7 |
| **Tripo pipeline** | Real and working (`gen_tripo_appearance.py`, `check_tripo_quality.py`, `build_lods.mjs`), `texture_quality=detailed`, PBR on, 4096² measured | One matrix, de-lit albedo rule, shadow-caster proxies, CI-enforced QC gate, provenance records | PIPELINE §6 |
| **Content schema** | JSON exists and is validated by 4 bespoke validators (`validate_campaign`, `validate_hangar`, `validate_nav`, `lint_bt`) | One Zod schema set → JSON Schema → TS types, one validator, localisation keys from day one | PIPELINE §3.3 |
| **Server authority** | Accounts and match are server-side; campaign progression is client-computed and merged | Server is truth for damage, inventory, progression, salvage, purchases, match results | PLATFORM §8.5 |
| **Localisation** | Display strings inline in content JSON | Every display string a `locale_string` key; 6 locales | PIPELINE §3.3 |
| **Budget / schedule** | Absent | This document | §2, §11 |

### §1.2 Migration order — do not reorder

1. **Put it in git.** Before anything else. Everything below is unreviewable and unrevertable
   without it, and a Drive sync conflict on an untracked 3.4 GB tree is an extinction event.
   `ops/scripts/bootstrap.sh` does this. **This is day one, hour one.**
2. **Stand up CI** with the existing 19 scripts as the first gates. They already encode real
   knowledge; they are simply not enforced.
3. **Stand up the lighting rig** (LIGHTING §5.6) — seven environments, three distances, contact
   sheets to the admin view. From here on, no asset is approved in a turntable viewer.
4. **Port one frame and one prop end-to-end** through the new Tripo and audio specs. Prove the
   pipeline on two assets before touching the other 355.
5. **Re-light one mission end-to-end** (M01, Breaker Coast) to the §5 standard. This is the
   vertical slice that proves the craft floor is reachable and tells you what it really costs.
6. **Unify naming and the content schema** across the existing content.
7. **Only then** apply the standard at volume to M02–M12.

Step 5 is the schedule's load-bearing measurement. If re-lighting one mission takes six weeks
rather than three, the launch campaign is 8 missions, not 12, and that is discovered in month 4
rather than month 14.

---

## §2. THE MONEY — allocating $1,000,000

**[ASSUMPTION]** `{TEAM_MODEL}` = distributed, senior, blended global rates (Singapore/SEA +
remote-EU), consistent with where this project is already based. If the team is US-co-located,
hold the percentages and drop to five FTE — do not stretch seven.

### §2.1 Allocation

| Line | Amount | Notes |
|---|---:|---|
| Core team — 7 FTE × 18 months (blended) | $500,000 | §2.2 |
| Specialist contractors | $110,000 | Concept art (the Tripo inputs), rigging/animation, sound design, composer + mix engineer, tech-art strike weeks |
| AI & DCC tooling, credits, licences | $40,000 | Tripo paid plan + API credits, ElevenLabs Pro, Substance, Blender addons, Houdini Indie, RenderDoc/Spector |
| Cloud, CDN & live ops (18 mo) | $80,000 | Cloudflare Workers/Pages/D1/DO already in place, object storage + CDN egress, CI runners, error tracking, telemetry |
| QA, playtesting, accessibility audit, localisation (6 locales) | $70,000 | Includes an external accessibility review and two paid playtest waves |
| Legal — trademark clearance, IP review, privacy, terms, entity | $30,000 | Non-optional; see §9 |
| Marketing, storefront, launch | $70,000 | Capsule art, trailer cut from in-engine capture, press/creator seeding |
| Contingency (10%) | $100,000 | Untouchable until Milestone 3 |
| **Total** | **$1,000,000** | |

### §2.2 The seven

| Role | Why this role and not another |
|---|---|
| **Technical director / rendering engineer** | Owns §5 end to end. Given that the game currently has no IBL, no post stack and no presets, this is by a wide margin the highest-leverage hire on the project. |
| **Gameplay engineer (simulation)** | Fixed-step sim, damage, heat, weapons, AI. Owns making progression server-authoritative. |
| **Platform engineer (server + pipeline)** | Git, CI, the D1/DO backend, `tools-tripo`, `tools-eleven`. Day one is §1.2 steps 1–2. |
| **Technical artist** | Tripo → retopo → LOD → KTX2 → material calibration; owns the QC gate and the re-material pass over 357 existing models. |
| **Environment / hard-surface artist** | Biome kits, modular sets, damage states across seven biomes. |
| **Audio director (also mixes)** | ElevenLabs direction, DAW mastering, Web Audio bus design. Inherits 1,486 files needing a uniform master. |
| **Designer / producer (also writes)** | The M01–M12 cut, content JSON, narrative, schedule, playtests. |

Deliberately **not** hired full-time: composer, animator, VFX artist, QA lead, community manager.
Contract lines. At this budget the shape is few, senior, broad.

### §2.3 The cut list — decided now, not later

1. **Campaign cut to 12 missions at launch.** M13–M24 are sequenced to post-launch with content
   intact. This is the single largest scope decision and it buys the craft floor.
2. **Multiplayer stays post-launch.** The Durable Object match server and D1 accounts already
   exist and stay maintained, so this is a sequencing decision and not a rewrite.
3. **Renderer port: cancelled.** Three.js is the engine. See ADR-0001.
4. **Cinematics are in-engine, real-time, camera-scripted.** No pre-rendered video, no mocap.
5. **No native ports.** Browser is the platform.
6. **The marketing site is frozen** at its current quality until Milestone 4. It is already the
   best-looking surface in the project and it is not the product.

### §2.4 Spend rules

- Nothing is generated at volume before the pipeline is proven on two assets (§1.2 step 4).
- Vendor credits are metered per milestone. `tools-tripo` and `tools-eleven` refuse a batch that
  exceeds the milestone credit budget without an explicit `--override` flag, and log the override.
- **Legal clearance on the shipping title and the top ten proper nouns completes before
  Milestone 2.** See §9 — this is currently the project's largest un-managed risk.
- Contingency is released only by a written milestone review.

---

## §9. IP — trademark and rename, not laundering

The brief's §9 assumed franchise-derived content needing a port into clean canon. **That work is
already done.** Veyra Prime is original IP throughout. What remains is narrower and genuinely
urgent.

### §9.1 The actual exposure

| Item | Status | Action |
|---|---|---|
| Folder name `MechWarrior/` | **Live trademark of another rightsholder.** Appears in the repo path, `package.json` description, and 6 documentation strings. | Rename folder and strings at Milestone 1. Cosmetic, but it must not reach a build artefact, a commit message or a store page. |
| Shipping title | Undecided. `veyra-prime` is the working name and the deployed subdomain. | **Trademark clearance search before Milestone 2.** A rename after asset production is a five-figure mistake. |
| World, factions, characters, chassis, weapons, VO, music | Original. Verified 2026-07-29. Frame roster is a consistent geology scheme — `flint · pumice · skarn · chert · halite · gabbro · basalt · dolerite · corundum · orogen · batholith · craton`. | Maintain. Re-scan in CI on every commit. |
| **Retired-canon leak** | **`src/ui/hangar.ts:326` renders `MERIDIAN ASSEMBLY` — a *Sovereign Ash* faction — in the shipped hangar UI.** Correct usage elsewhere is `Free Veyran Compact` (3×). | **Fix in M0.** One line. The two-canon bleed the brief warned about is real; it just runs the other way. |
| `'atlas'` test fixtures | `scripts/test_hangar.mjs:162, :243`. Not a shipped frame id — the roster above is clean. | Rename in M0. Needless exposure in a fixture. |
| Chassis silhouettes (357 models) | Original generation, but **never audited for accidental resemblance** to protected designs. | Silhouette review against `IP_EXCLUSION_CHECKLIST.md` during the M2 re-material pass. |
| Tripo commercial rights | Plan tier unverified. Free-tier output is **not licensed for commercial use**. | Verify the plan covers every already-generated asset **before Milestone 1 closes**. If any of the 357 models were generated on a free tier, they must be regenerated. This is a schedule risk, not a paperwork risk. |
| ElevenLabs commercial rights | Plan tier unverified; 1,486 files already produced. | Same — verify coverage retroactively, snapshot terms. |

### §9.2 Standing rules

- The franchise-term scan runs in CI on every commit and fails the build on a word-bounded hit
  outside `docs/_inbox/`. The six existing disclaimer strings are removed by the rename, so the
  allowed-hit count after Milestone 1 is **zero**.
- `docs/_inbox/` is read-only reference and is excluded from the scan, from builds and from
  shipped artefacts.
- Sovereign Ash canon terms (Nareth, Meridian Assembly, Helix Directorate) join the same scan as
  **retired canon** — they must not leak in from the archived reference material.

---

## §11. EIGHTEEN-MONTH MILESTONE PLAN

**[ASSUMPTION]** Month 1 = 2026-08. Launch = 2028-01.

| # | Months | Name | Exit criteria — all measurable |
|---|---|---|---|
| **M0** | 1 | **Foundations** | Git tree + Drive mirror + remote live. CI green with the 19 existing scripts as gates. `.env.example` in force, zero secrets in client bundles. Folder and strings renamed off the trademark. Tripo/ElevenLabs plan-tier rights **verified for all existing assets**. |
| **M1** | 2–4 | **The rig and the slice** | Lighting rig running: 7 environments × 3 distances, contact sheets in admin. One frame + one prop through the full new Tripo and audio specs. **M01 Breaker Coast re-lit to the §5 standard at 60 fps / 1440p.** Cost of a re-lit mission is now a measured number. |
| **M2** | 5–8 | **Standards at volume** | Naming unified across all content. One content schema in force, 4 bespoke validators retired. 357 models through the QC gate: de-lit check, caster proxies, KTX2, LOD budgets. 1,486 audio files re-mastered to the uniform §7 standard. Silhouette IP review complete. Trademark clearance returned. |
| **M3** | 9–12 | **Campaign to the floor** | M01–M12 at the §5 standard. Progression made server-authoritative. Quality presets shipped and GPU-probed. Localisation extraction complete, 6 locales in translation. **Contingency unlocks here or not at all.** |
| **M4** | 13–15 | **Certification** | Every §10 gate green in CI. External accessibility audit passed. Playtest wave 1 + 2 complete and acted on. Browser matrix green. Perf budgets held on the reference hardware set. |
| **M5** | 16–18 | **Launch** | Store pages, trailer cut from in-engine capture, marketing site unfrozen and updated, day-one patch path proven, live-ops dashboards running, post-launch backlog sequenced. |

**Load-bearing dependency:** M1's measured cost-per-re-lit-mission sets M3's scope. If it comes in
high, the launch campaign shrinks from 12 missions before M3 begins — a scope decision made in
month 4 with data, not in month 14 with panic.

---

## §12. ACCEPTANCE CRITERIA — the definition of done

A build ships when **all** of the following are true, each verified by an automated gate or a
signed review. No exceptions, no "we'll fix it in a patch".

### Craft
1. 60 fps at 1440p on the reference GPU at the High preset, measured over a 10-minute capture,
   **1% low ≥ 50 fps**. Frame pacing, not average framerate, is the metric.
2. Every one of the 7 biomes has an authored `lighting_profile` with a prefiltered environment,
   an IBL-extracted sun direction, per-biome shadow bias and a fixed exposure EV.
3. No asset ships without a passing §6.6 QC gate record and a lighting-rig contact sheet.
4. Enemy silhouettes distinguishable from terrain at 400 m on every preset, in every biome.
5. Zero raw generated assets in the build. Zero PNG/JPG textures — KTX2 only.

### Audio
6. 100% of shipped audio derived from an archived 44.1 kHz master, delivered at 192 kbps.
7. Project loudness targets met and measured in CI. Dialogue ducking verified.
8. Every VO line has a subtitle with forced-alignment word timing.

### Correctness
9. Server is truth for damage, inventory, progression, salvage, purchases and match results.
   A tampered client cannot alter any of them — verified by an adversarial test.
10. Zero secrets in any client bundle. CI greps every artefact.
11. All content validates against the one schema. Zero bespoke validators remain.

### Accessibility and reach
12. Camera shake, flash intensity and motion blur each have an independent slider that reaches
    zero. No state conveyed by colour alone.
13. Full remapping, subtitle sizing, and a passing external accessibility audit.
14. 6 locales complete, no clipped strings, no untranslated display text.

### Process
15. Everything in version control. CI green. Every irreversible decision has an ADR.
16. Franchise-term scan returns zero hits outside `docs/_inbox/`.
17. Trademark clearance returned clean on the shipping title and top ten proper nouns.
18. Commercial-use rights verified and terms snapshotted for every generated asset in the build.
