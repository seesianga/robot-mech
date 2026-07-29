# §2 — Allocating the $1,000,000

Adopted from the master prompt §2.1, with the one change that ADR-0001 forces: the
engine port is not funded, so the money that would have paid for it buys craft instead.

## 2.0 The trade, stated plainly

$1M is not an AAA budget. Real AAA runs $50M–$300M. What $1M buys, spent well, is **AAA
craft standards on a deliberately small surface** — a game that looks, sounds, controls
and performs like a premium title, and is simply shorter.

This project starts from an unusual position for that trade: **the game already ships.**
24 missions, a tutorial, a hangar economy, pilot accounts, multiplayer, 51 models and 597
voice lines are live. The budget is therefore not building a game, it is raising the
craft floor under one that exists. That is a much better place to spend $1M than the
master prompt assumed, and it is why §2.3's cut list barely bites here.

## 2.1 Allocation

`[ASSUMPTION]` `{TEAM_MODEL}` = distributed, senior, blended global rates.

| Line | Amount | Notes |
|---|---:|---|
| Core team — 7 FTE × 18 months | $500,000 | §2.2 |
| Specialist contractors | $110,000 | Concept art (the Tripo inputs), rigging/animation, sound design, composer + mix engineer, tech-art strike weeks |
| AI & DCC tooling, credits, licences | $40,000 | Tripo credits, **ElevenLabs upgrade to Pro** (see below), Substance, Blender addons |
| Cloud, CDN & live ops (18 mo) | $80,000 | Cloudflare Workers/Pages/D1 + the AWS box, CI runners, error tracking, telemetry |
| QA, playtesting, accessibility audit, localisation (6 locales) | $70,000 | External accessibility review + two paid playtest waves |
| Legal — trademark clearance, IP review, privacy, terms | $30,000 | Non-optional; see §2.4 |
| Marketing, storefront, launch | $70,000 | Capsule art, trailer cut in-engine, press/creator seeding |
| Contingency (10%) | $100,000 | Untouchable until Milestone 3 |
| **Total** | **$1,000,000** | |

## 2.2 The seven

Unchanged from §2.2 of the spec. One note: the **technical director / rendering
engineer** is still the highest-leverage hire, and the §5 work done so far is a preview
of why — image-based lighting, a fitted shadow frustum and a post chain were a few
hundred lines that changed how every existing asset reads, with no new art commissioned.

Deliberately **not** full-time: composer, animator, VFX artist, QA lead, community
manager. Contract lines. At this budget the shape is *few, senior, broad*.

## 2.3 The cut list

The spec's cuts, reconciled against a game that already exists:

| Spec cut | Status here |
|---|---|
| 26 missions → 12 | **Not applicable.** 24 missions already ship and are proven completable by `npm run camptest`. Cutting shipped, tested content to hit a number in a plan would be vandalism. |
| 20 chassis → 8 | **Already 14.** Depth over breadth still applies to any *new* chassis. |
| Multiplayer post-launch | **Already shipped.** The Durable Object lobby is live. Nothing to defer. |
| Cinematics in-engine | Adopted. No pre-rendered video, no mocap. |
| No native ports | Adopted. Browser is the platform. |
| Babylon 9 + WebGPU port | **Cut — ADR-0001.** This is the single largest saving in the plan. |

**What the freed engine-port money buys instead:** the §5 craft ladder (cascades once a
material factory exists, per-biome HDRI environments, material class matrix), the §6
asset QC gate, and the ElevenLabs Pro upgrade below.

## 2.4 Spend rules

- Nothing generated at volume before the pipeline is proven on two assets (§1.2 step 3).
- Vendor credits metered per milestone. `tools-tripo` and `tools-eleven` must refuse a
  batch that exceeds the milestone budget without `--override`, and log the override.
- Legal clearance on the title and top ten proper nouns completes **before Milestone 2**.
  A rename after asset production is a five-figure mistake, and the working folder is
  still literally named after a live trademark (`roadmap.md:231` tracks it).
- Contingency released only by written milestone review.

## Two funded line items that are urgent, not eventual

**ElevenLabs Pro upgrade.** Measured 2026-07-29: the account is on **Creator**, so
`pcm_44100` masters are unavailable and we ship §7.1's fallback (192 kbps direct, no
lossless master). Generation is not bit-reproducible, so re-rendering later yields
*different takes*, not recovered masters. Every line rendered on Creator is a line whose
master is permanently lost. Upgrade before the next VO batch, not before final mastering.
Quota is also **89% consumed** (116,798 / 131,000). See `VENDOR_GATES.md`.

**Tripo commercial-rights confirmation.** The key is live with 11,040 credits, but a
funded balance does not prove the plan carries a commercial licence, and §6.1 is explicit
that free-tier output is not licensed for commercial use. 51 models already ship. If any
were generated on a free tier they must be regenerated on a paid plan — a schedule risk
sitting under finished work. This is a lawyer question and it is cheap to answer now.
