# Vendor gates — §6.1 Tripo and §7.1 ElevenLabs, verified

Verified live 2026-07-29 against the credentials in `API Information/.env`.
This file records the *result*, never the keys. Re-verify before any batch (§2.4).

## §7.1 — ElevenLabs

| Check | Result |
|---|---|
| Key status | **LIVE** |
| Tier | **creator** |
| Quota | 116,798 / 131,000 characters — **89% consumed** |
| `pcm_44100` master (needs Pro+) | **NOT available** |
| `mp3_44100_192` (needs Creator+) | **Available** |

**Two things this changes.**

*The key is not dead.* It was recorded as dead on 2026-07-25 and reported as a standing
blocker. It works. That blocker is closed.

*We are on §7.1's fallback branch, not its primary one.* The spec's preferred path is
`pcm_44100` master → local 192 kbps encode, which needs Pro. On Creator we request
`mp3_44100_192` directly and skip the transcode. Per §7.1 that means: **the delivery
spec is intact, the lossless master is lost.** Recorded here as technical debt, exactly
as §7.1 instructs. Upgrade to Pro before final mastering — re-rendering 597 lines to
recover masters costs a full regeneration, and generation is not bit-reproducible, so
the takes would differ.

**The quota is the near-term constraint.** ~14,200 characters remain, roughly 25–40 VO
lines. Any batch must be metered against that (§2.4). `ELEVEN_CREDIT_BUDGET_MILESTONE`
exists for this; a runner that would exceed it must refuse without `--override` and log
the override.

## §6.1 — Tripo3D

| Check | Result |
|---|---|
| Key status | **LIVE** |
| Balance | **11,040 credits**, 0 frozen |
| API surface in `.env` | `https://openapi.tripo3d.ai/v3` |
| Surface that answered `/user/balance` | `https://api.tripo3d.ai/v2/openapi` |

**Pin one surface.** §6.1 requires it, and the two disagree today: the configured base is
v3 while the balance endpoint answering is v2. Confirm which surface serves the task
types we use (`multiview_to_model`, `texture_model`, `generate_parts`) and pin that one
in `.env` before batching, along with current `model_version` strings.

### Commercial rights — owner attestation, 2026-07-29

The project owner (account holder for the Tripo and ElevenLabs keys in
`API Information/.env`) has stated:

> "I am the owner and I am paying money for API usage. I own the full rights with legal
> authority."

Recorded as the §6.1 rights decision. `rights_status: "owner-attested"` is written into
every provenance record from this date, and the §6.6 QC gate no longer blocks on unknown
rights.

**What this does and does not settle.** It settles who decides, and it unblocks §6. It is
an attestation by the rights holder, not a legal opinion, and nothing here is legal
advice. Two things stay worth doing because they cost little and protect the attestation:

1. Snapshot the vendor terms in force to `assets-source/provenance/_terms/tripo_<date>.md`
   (§6.1). An attestation is much stronger with the terms it was made against attached.
2. If any of the 51 shipped models predates the paid plan, note it. §6.1's concern is the
   plan *at generation time*, not at attestation time — a model made on a free tier is
   not retroactively licensed by a later upgrade.

Neither blocks work. Both are cheap insurance on a decision that has been made.
