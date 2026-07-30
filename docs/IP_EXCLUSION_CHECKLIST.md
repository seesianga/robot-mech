# IP EXCLUSION CHECKLIST

**Status:** Normative. Owner: Producer. Signed off **per milestone**.
**Parent:** [CONVERGENCE_PLAN.md](CONVERGENCE_PLAN.md) §9.

---

## A. Baseline — measured 2026-07-29, product rename applied 2026-07-30

### A.1 Franchise-protected terms: clean

The shipping product is now **Robot Mech**, centralized in `content/brand.json`. The brand gate
binds the package, HTML/social metadata, visible wordmarks, Pages project, production Worker,
CSP and built release to that identity. **Veyra Prime remains the campaign world**, not the
product title.

The previous third-party working label is prohibited outside the two exact historical records
that explain the convergence decision and this checklist. The external asset-master folder may
retain its filesystem name until a separately planned path migration; that path is never emitted
into the build.

**Zero** hits for Dresari, Kentares, Steiner, Davion, Liao, Marik, Kurita, Daishi, Vulture,
Timberwolf, Madcat, Loki, Mauler, Uziel, Inner Sphere, ComStar.

The **frame roster is original and internally consistent** — a geology naming scheme, verified in
`content/mechs.json`:

```
flint · pumice · skarn · chert · halite · gabbro
basalt · dolerite · corundum · orogen · batholith · craton
```

There is no franchise-derived material to port. Product/world names and legacy compatibility
identifiers are now explicitly separated in `content/brand.json`.

### A.2 Retired-canon leak — FOUND and fixed

Adding the B.2 retired-canon terms to the scan caught a real defect on its first run:

> Before the M0 fix, **`src/ui/hangar.ts:326` rendered
> `MERIDIAN ASSEMBLY — CHIEF OKAFOR'S SERVICE BAY` in the shipped hangar UI.**

`Meridian Assembly` is a **Sovereign Ash faction**, not a Robot Mech one. Correct usage across
shipped source and content is `Free Veyran Compact` and `Karst Directorate`. The live string was
replaced with `FREE VEYRAN COMPACT — CHIEF OKAFOR'S SERVICE BAY`; the retired-canon scan stays in
CI to prevent a recurrence.

- **Action completed in M0.** The one-line shipped-UI correction is verified by the zero-hit scan.
- **This is the evidence for keeping B.2 in the scan permanently.** The two-canon bleed the brief
  warned about is real; it simply runs in the opposite direction from what the brief assumed.

Also flagged, and **not** defects:

| Hit | Verdict |
|---|---|
| `Okafor` (`src/ui/`, `content/audio-plan.json`) | **Original Robot Mech character** — Chief Nadi Okafor, Dozie Okafor "Tremor". Not a leak. |
| `pylon_meridian` / "Resonance Pylon Meridian" (`content/campaign/m22.json`) | Ordinary English word used as an object name. Review for confusion with A.2, but not canon bleed. |
| "UV0 atlas" (`docs/tripo-prompt-library.md:58`) | **Texture atlas** — standard technical vocabulary. See the §B.1 false-positive note. |
| `'atlas'` (`scripts/test_hangar.mjs:162, :243`) | **Test fixture strings only** — not a shipped frame id. Rename anyway in M0: a fixture named after a protected chassis is needless exposure. |
| `MechWarrior` (`scripts/vite-site-truth.mjs:134–153`) | The build-time truth plugin's *own* MechWarrior rule. Self-referential tooling; excluded by path. |

---

## B. The scan

Runs in CI on every commit (PLATFORM §10.2 gate 7). Fails the build on any word-bounded hit
outside `docs/_inbox/`.

### B.1 Franchise-protected terms

```
dresari · kentares · steiner · davion · liao · marik · kurita · comstar · clanner
atlas · daishi · vulture · timberwolf · madcat · timber wolf · mad cat
thor · loki · mauler · uziel
battlemech · battletech · mechwarrior · inner sphere
```

> **Word boundaries are mandatory.** An unbounded scan for `thor` matches `author` and returned
> ~93 false positives during the 2026-07-29 audit. This mistake was made and corrected — do not
> repeat it.
>
> **`atlas` is a known-noisy term** and must be reviewed by a human, never auto-failed:
> *texture atlas* is standard technical vocabulary and appears legitimately in the art pipeline
> documentation. Auto-failing it trains the team to ignore the gate, which is worse than not
> having one.
>
> **Excluded paths:** `docs/_inbox/` (archived reference) and `scripts/vite-site-truth.mjs`
> (the build-time truth plugin implements its own MechWarrior rule and necessarily names it).

### B.2 Retired canon — must not leak in from archived reference

`Qoder game/sovereign-ash/` is archived to `docs/_inbox/`. Its canon is **retired** and joins the
same scan:

```
sovereign ash · nareth · meridian assembly · helix directorate
```

### B.3 Exclusions

`docs/_inbox/` only. It is read-only reference, excluded from the scan, from builds, and from every
shipped artefact.

---

## C. Milestone sign-off

Signed by a named owner at each milestone. An unchecked box blocks the milestone.

### M0 — Foundations

- [x] **Fixed `src/ui/hangar.ts:326` — `MERIDIAN ASSEMBLY` → `FREE VEYRAN COMPACT`** (§A.2).
- [ ] Rename the `'atlas'` test fixtures in `scripts/test_hangar.mjs:162, :243`
- [ ] Folder renamed off the trademark; path no longer contains it
- [ ] `package.json` description updated
- [ ] All 6 disclaimer strings removed (the rename makes them unnecessary)
- [ ] Franchise scan wired into CI and green at **zero** hits outside `docs/_inbox/`
- [ ] Retired-canon terms (B.2) added to the scan
- [ ] **Tripo plan tier verified as commercial-use for all 357 existing models**, terms snapshotted
- [ ] **ElevenLabs plan tier verified as commercial-use for all 1,486 existing files**, terms snapshotted

> The two rights-verification items are the highest-risk lines in this document. Free-tier
> generator output is not licensed for commercial use. If any shipped asset was generated on a
> free tier it must be regenerated — a schedule risk, not paperwork. Resolve in M0, not at launch.

### M1 — The rig and the slice

- [ ] Shipping title chosen
- [ ] **Trademark clearance search commissioned** on the title and the top ten proper nouns
- [ ] Deployment subdomains reviewed against the chosen title
- [ ] Scan still zero

### M2 — Standards at volume

- [ ] **Silhouette review of all 357 models** against §D, during the re-material pass
- [ ] Every asset carries a provenance record with `rights_status`
- [ ] Concept-art inputs confirmed original — no franchise image, no screenshot, in any Tripo input
- [ ] HDRI licences present at `assets-source/hdri/<name>/LICENSE.txt` for every environment
- [ ] **Trademark clearance returned clean.** If not clean, rename now — after asset production it is a five-figure mistake
- [ ] Scan still zero

### M3 / M4 / M5

- [ ] Scan zero at every release candidate
- [ ] Marketing copy, store pages, capsule art and trailer reviewed against §D
- [ ] Voice direction and music briefs contain no franchise reference
- [ ] Final sign-off before launch

---

## D. Review criteria — what a reviewer actually looks for

Text scanning catches names. It does not catch resemblance. A human reviews:

**Chassis and silhouette**
- Does the outline read as a specific protected design rather than as a general heavy walker?
- Distinctive combinations — cockpit placement, shoulder-mount arrangement, leg articulation,
  weapon-pod geometry — that map one-to-one onto a known chassis
- **All 357 models are unreviewed on this axis today.** This is the M2 gap.

**Faction and iconography**
- Insignia, colour schemes, rank structures, unit naming that echo protected factions
- Free Veyran Compact and Karst Directorate must read as themselves

**Fiction**
- Place names, house names, character names, historical events, technology names
- Plot beats that track a specific published campaign

**Audio and UI**
- Distinctive sound signatures (startup, reactor, lock tone) that quote a known game
- HUD layout, reticle design, damage-diagram conventions

**Marketing**
- Comparative copy naming another franchise
- Key art composition quoting a known cover

---

## E. Standing rules

1. Concept art feeding Tripo must be **original**. Never a franchise image, never a screenshot.
   Recorded per asset in its provenance record (PIPELINE §6.7).
2. HDRIs must be CC0 or shot in-house, with the licence stored beside the file. Never a screenshot
   of another game as an environment.
3. Generator prompts must not name a franchise, chassis, faction or character — prompts are stored
   as `prompt_hash` in provenance and are auditable.
4. `docs/_inbox/` is read-only. Nothing is copied out of it into source, content or assets without
   this checklist's sign-off.
5. Commit messages, branch names and PR titles are shipped artefacts for legal purposes. The scan
   covers them.
