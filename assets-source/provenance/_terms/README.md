# Vendor terms snapshots — §6.1 / §7.9

One file per vendor per date, capturing the terms **in force when assets were generated**.

## Why this exists

§6.1 makes the licence a property of the plan **at generation time**, not at attestation
time. A later upgrade does not retroactively license output made on an earlier tier. So
an attestation is only as strong as the terms it was made against, and those terms change
without notice. This folder is where that evidence lives.

## What is recorded so far

**Rights decision, 2026-07-29 — owner attestation.** The project owner and account holder
for both vendor keys stated: *"I am the owner and I am paying money for API usage. I own
the full rights with legal authority."* Recorded in `docs/VENDOR_GATES.md`;
`rights_status: "owner-attested"` is written into provenance records from that date.

**Account state measured the same day** (see `docs/VENDOR_GATES.md` for detail):

| Vendor | State at 2026-07-29 |
|---|---|
| Tripo3D | key live, 11,040 credits |
| ElevenLabs | key live, tier `creator`, 116,798 / 131,000 characters used |

**Asset generation dates.** The 51 raw sources in `assets/tripo/generated/` were created
on two dates: **20 on 2026-07-24** and **31 on 2026-07-28**. Both predate the attestation
above by days, not months. That is worth knowing rather than assuming: if the Tripo plan
changed tier between 24 July and today, the earlier 20 assets were generated under
whatever plan was in force then.

## What is still worth capturing

Nothing here blocks work — the rights decision has been made by the person entitled to
make it. These are cheap and they protect that decision:

1. **Paste the vendor terms text** in force on 2026-07-24 and 2026-07-28 into
   `tripo_2026-07-24.md` and `tripo_2026-07-28.md`. A link is not a snapshot; terms pages
   are edited in place.
2. **Confirm the Tripo plan tier on those two dates** — the account's billing history
   answers this directly.
3. **Same for ElevenLabs** before the next VO batch, since the tier there is known to be
   below the spec's target and is expected to change.

Nothing in this folder is legal advice.
