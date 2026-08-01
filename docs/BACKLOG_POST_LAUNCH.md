# POST-LAUNCH BACKLOG

**Status:** Sequenced, not deleted. Owner: Producer.
**Parent:** [CONVERGENCE_PLAN.md](CONVERGENCE_PLAN.md) §1.0, §2.3.

Nothing here is cancelled. Everything here is **built or specified and deliberately not shipped at
launch**, because the launch budget buys craft on a smaller surface (CONVERGENCE §1.0).

Re-read this document at every milestone review. Items move *up* only by a written decision that
names what moves down.

---

## 1. Campaign missions M13–M24 — the cheapest content any studio will ever ship

**Status: already built.** Twelve missions with runtime configs in `content/campaign/`, mission
documents in `content/missions/`, VO, and biome coverage.

| Deferred | Biome | Configs |
|---|---|---|
| M13–M16 | `arcology` — Vell Arcology | present |
| M17–M20 | `anchor` — Spire Anchor | present |
| M21–M24 | incl. the M21 EXTRACTION/OVERRIDE branch and the M24 Craton-X duel | present |

**Why deferred:** 24 missions at the current lighting standard is a worse product than 12 at the
§5 standard, and 24 *at* the §5 standard does not fit in $1M.

**What launch must not break:** the data-driven `CampaignMission` engine and the
`content/campaign/` schema stay general. M13–M24 must remain loadable without an engine change —
the only work to ship them is the §5 re-light and a QC pass.

**Post-launch cost:** re-light + QC only. Measured at M1 (CONVERGENCE §1.2 step 5). This is the
highest-value, lowest-risk content drop available and should be the first post-launch beat.

**Design reference for operations beyond M24:** the inherited Op 8–9 brief
(`docs/_inbox/prompts/mw4_extended_missions_op8-9.md`, archived 2026-08-01) carries nine proven
mission *shapes* — launch-timer starport assault, coastal target denial under a storm front,
convoy escort into an ambush, convoy interception with a capture-or-destroy midpoint, fortress
assault with a timed hostage phase, night recon with beacon placement and a hot exfil,
escort-and-demolish with a timed defence, three-wave evacuation hold, comms-jammed final duel.
The brief is franchise-derived and unshippable as written; its structures may be used only under
the rewrite rule in [`docs/_inbox/prompts/README.md`](_inbox/prompts/README.md) — new briefings,
new names, new terrain, in Veyra Prime canon.

---

## 2. Multiplayer

**Status: built and running.** Durable Object match lobby at `/ws`, D1 pilot accounts, cross-device
progress merge, `mp-server.mjs`, `matchcore.mjs`, an MP VO pack, and MP-specific models
(`env_mp_*`).

**Deferred:** 4v4 objective play as a *supported, certified, live-ops'd* mode — matchmaking,
ranked, replays.

**Why deferred:** shipping and supporting competitive multiplayer inside $1M costs the campaign its
polish. The architecture is already server-authoritative-capable, so this is sequencing, not a
rewrite.

**What launch must not break:** keep the DO match server and account service maintained and
deployed. Do not let the MP path rot — CI keeps `test_accounts`, `test_sync` and `probe_mp` green.

---

## 3. WebGPU renderer path

See [LIGHTING_STANDARD.md §5.9](LIGHTING_STANDARD.md) and
[ADR-0001](adr/0001-renderer-three-vs-babylon.md).

Deferred pending the M1 spike. If the §5.5 post stack requires re-authoring in TSL, WebGPU is
post-launch and the game ships WebGL2 — a perfectly respectable way to hit 1440p/60.

---

## 4. Rendering features beyond the launch bar

| Item | Note |
|---|---|
| PCSS soft shadows | Three has no core PCSS; custom shader. Launch ships PCF. |
| Clustered lighting | Not built into Three's WebGL path. The `arcology` biome is authored to a light budget instead — ADR-0001. |
| OpenPBR materials | Material parameters already live in content JSON, so migration is a data mapping. Revisit when the ecosystem is production-ready. |
| HDR display output | sRGB dithered to 8-bit at launch. |
| Ray-traced / path-traced reflections | Not on the web, not at this budget. |

---

## 5. Platform reach

| Item | Note |
|---|---|
| Native / desktop wrapper | Browser is the platform. A wrapper is a post-launch decision, not a port. |
| Console | Out of scope entirely at this budget. |
| Mobile / touch | The Fallback preset targets low-end desktop, not phones. Touch input is unspecified. |
| Locales beyond the launch 6 | Schema carries `locale_string` from day one, so adding locales is translation cost only. |

---

## 6. Content and systems

| Item | Note |
|---|---|
| Chassis beyond the launch 8 | Depth over breadth — three viable builds each beats twenty shallow chassis. |
| Pre-rendered cinematics, motion capture | Cinematics are in-engine, real-time, camera-scripted. |
| Instant Action map/mode expansion | Launch ships the mode; more maps are cheap post-launch. |
| Live-ops economy, seasons, battle pass | Requires the §8.5 server-authority migration to be complete and proven first. |

---

## 7. Deferred debt — carried deliberately, with a named cost

| Debt | Cost of carrying | Trigger to pay it |
|---|---|---|
| **1,486 audio files have no lossless master** (PIPELINE §7.0) — generated straight to 192 kbps MP3, so every master operation was applied to lossy audio and any re-master means regenerating and paying for a different take | Cannot re-master or change delivery format without re-recording | Pay per-line, only when a line needs a performance change anyway. Never transcode lossy→lossy. |
| `assets/` 2.2 GB of raw generator output is Drive-only, not in git | Protected by Drive sync and the offline pin, not by version control | If a second contributor needs it, move to Git LFS or object storage |
| Marketing site frozen at current quality until M4 | It is already the best-looking surface in the project | M4, when in-engine capture can replace its media |
| Four bespoke content validators until M2 | Duplicated rules, drift risk | Retire by **porting their assertions** into the schema, never by deleting them |
