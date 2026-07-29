# §11 — Eighteen-month milestone plan

`[ASSUMPTION]` `{SHIP_TARGET}` is not set. This plan is written as **M0 + 18 months**
from 2026-07-29, so M1 lands 2026-10-29 and 1.0 lands 2028-01-29. Substitute real dates
when the target is fixed; the ordering and the gates do not change.

The master prompt's §11 assumes a greenfield build. This project already ships, so the
plan is re-cut around raising the craft floor rather than reaching a first playable.
Every milestone ends in a numeric gate from §10/§12, not a demo.

---

## M0 — Convergence (DONE, 2026-07-29)

Establish that a build can be measured at all.

- Repo materialised, git working tree split from the Drive mount (§3.2), bare mirror
- CI live on GitHub with 11 gates: typecheck, 8 validators, secrets, IP, hygiene, bundle
- IP: canon leak fixed, `IP_EXCLUSION_CHECKLIST.md` enforced by gates 7a/7b/7c
- Asset census so CI can build without the 400 MB Drive-only asset trees
- §5 first pass: IBL, fitted shadow frustum, GTAO/SMAA/bloom post chain, 4 quality presets
- ADR-0001: engine stays Three.js
- Vendor gates measured (`VENDOR_GATES.md`)

**Gate:** CI green on `main`. ✅

---

## M1 — Craft floor (months 1–3)

The remaining §5 ladder, plus the schema that unblocks it.

- §3.3 `content-schema`: validated types for frame, weapon, mission, dialogue,
  tutorial_step, bay, audio_event, biome, lighting_profile, locale_string
- **One material factory** — the prerequisite CSM has been waiting on (ADR-0001)
- §5.3 cascaded shadow maps, once that factory exists
- §5.2 per-biome HDRI environments replacing the procedural RoomEnvironment probe
- §5.4 material class matrix: ceramic clearcoat, brushed anisotropy, emissive conduits
- §5.6 lighting rig extended to the six-environment contact sheet (`lightprobe` is the seed)

**Gate:** 60 fps @ 1440p on the High preset; `npm run lightprobe` green on all four
presets; every content file validates against the schema.

**Legal deadline:** trademark clearance on the title and top ten proper nouns completes
in this window, before asset production resumes (§2.4).

---

## M2 — Pipeline (months 4–6)

Make asset production repeatable and rights-clean.

- §6 `tools-tripo`: batch runner, de-light check, QC gate, provenance records
- §6.3 rename to the `sa_<domain>_<biome>_<name>_<lod>` namespace
- §6.6 QC gate in CI: triangle budgets, ORM packing, colour space, normal orientation
- §7 `tools-eleven`: **on Pro** — masters archived, 192 kbps delivery encoded locally
- §7.6 forced-alignment subtitles; §7.7 loudness measured in CI

**Gate:** one frame and one prop pass end-to-end through both pipelines with complete
provenance (§1.2 step 3). No asset produced at volume before this gate passes.

---

## M3 — Content at volume (months 7–11)

Only now does §1.2 step 6 open.

- Remaining chassis to full damage states and animation sets
- Biome kits rebuilt against the material class matrix
- VO and score completed on the Pro pipeline
- 6 locales through `locale_string`

**Gate:** §10 certification checklist passes. Contingency unlocks here (§2.4).

---

## M4 — Accessibility, performance, hardening (months 12–15)

- §5.8 readability rules verified per biome per preset: enemy silhouette at 400 m
- §10.3 accessibility sliders: camera shake, flash intensity, motion blur to zero
- External accessibility audit; two paid playtest waves
- Browser matrix; perf regression gates on a self-hosted runner

**Gate:** external accessibility review passes; no perf regression in CI.

---

## M5 — Beta and launch (months 16–18)

- Open beta in `{LAUNCH_REGIONS}`
- Trailer cut from in-engine capture
- §12 acceptance criteria signed off

**Gate:** §12, in full.

---

## Standing risks

| Risk | Why it bites | Mitigation |
|---|---|---|
| Tripo commercial rights unconfirmed | 51 models already ship; free-tier output is not licensed commercially | Settle in M1, before more assets. Legal, not technical. |
| ElevenLabs on Creator | Every line rendered now loses its master permanently; takes are not reproducible | Upgrade before the next VO batch, not before mastering |
| ElevenLabs quota 89% consumed | ~25–40 lines of headroom | Meter per §2.4 |
| Working title is a live trademark | Rename after asset production is five figures | Clearance in M1; `roadmap.md:231` tracks isolating the strings |
| No asset runner in CI | Nothing in CI builds with assets or plays a mission | Close per the three options in `ci.yml`'s `build-assets` job |
| Solo maintainer, Drive-only mirror | Bus factor and backup both | GitHub remote now exists; keep pushing both |
