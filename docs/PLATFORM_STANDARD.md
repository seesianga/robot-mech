# PLATFORM STANDARD — §3 repo & Drive · §4 stack · §8 delivery · §10 quality gates

**Status:** Normative. Owner: Platform Engineer.
**Parent:** [CONVERGENCE_PLAN.md](CONVERGENCE_PLAN.md).

---

# §3. THE ROOT

## §3.0 The finding that outranks everything else in this document

**There is no git repository.** `git rev-parse` returns *"not a git repository"* at `$MW_ROOT` and
above it.

The current state of this production is:

- **3.4 GB** of source, content and assets
- **14,508 lines** of TypeScript, 22 campaign configs, 1,486 audio files, 357 models
- **two live deployments** serving real players
- on a **Google Drive streaming mount**, with **no version control, no history, no branches, no
  review, no revert, and no CI**

Every other recommendation in this plan — the lighting upgrade, the QC gates, the re-material pass,
the naming migration — is a large, sweeping, multi-file change. **Executing any of them without
version control would be professional malpractice.** The naming migration alone touches
`content/`, `src/` and `public/` simultaneously, with no way back.

This is **M0, day one, hour one**, and nothing else starts until it is done.

There is one piece of good news: a scan for Drive's conflict-duplicate pattern (`file (1).ts`)
returned **zero hits**. The tree has not yet been corrupted. That is luck, and luck is not a
backup strategy — 11 `.DS_Store` files are already committed-in-spirit to the tree, and a
single simultaneous edit from two machines is all it takes.

## §3.1 Target layout

`$MW_ROOT` keeps its current shape — it works and churning it costs more than it returns. The
additions are marked **NEW**.

```
"$MW_ROOT"/
├─ README.md
├─ .env.example                     NEW  committed; real .env lives ONLY in $MW_BUILD
├─ .gitignore                       NEW
├─ docs/
│  ├─ CONVERGENCE_PLAN.md           NEW  §1 §2 §9 §11 §12
│  ├─ LIGHTING_STANDARD.md          NEW  §5
│  ├─ PIPELINE_STANDARD.md          NEW  §6 §7 §3.3
│  ├─ PLATFORM_STANDARD.md          NEW  this file
│  ├─ BACKLOG_POST_LAUNCH.md        NEW  M13–M24 and everything deferred
│  ├─ IP_EXCLUSION_CHECKLIST.md     NEW  signed off per milestone
│  ├─ adr/                          NEW  one ADR per irreversible decision
│  ├─ _inbox/                       NEW  archived inherited reference, READ-ONLY
│  └─ GDD.md  audio-bible.md  roadmap.md  tripo-prompt-library.md  … (existing, kept)
├─ src/            existing — engine, sim, world, ui, net, save, site, audio, ai, physics
├─ server/         existing — accounts, match, hangar, progress merge
├─ worker/         existing
├─ content/        existing — campaign, missions, hangar, nav, tutorial, vo + NEW lighting/
├─ scripts/        existing 49 → consolidated into tools-tripo / tools-eleven / testing
├─ migrations/     existing — D1
├─ public/         existing — models, audio, fonts
├─ assets-source/  NEW  masters. Never served. concept/ tripo-raw/ dcc/ audio-master/ hdri/ provenance/
├─ dist-release/   NEW  signed, versioned bundles per release tag
└─ ops/            NEW  scripts/, IaC, CDN config, headers, runbooks, dashboards
```

`assets-source/` is the important addition. Today there is no separation between **masters** and
**shipped derivatives** — `public/models/` holds the only copy of some assets. Masters must be
archived separately and never served.

## §3.2 Drive-sync hygiene

`$MW_ROOT` is a Google Drive for Desktop streaming mount. It is an excellent source-of-record and a
**terrible build directory**. Split them.

| Lives in `$MW_ROOT` (synced, versioned, backed up) | Lives in `$MW_BUILD` (local, disposable, never synced) |
|---|---|
| `docs/`, `content/`, `src/`, `server/`, `scripts/` source | `node_modules/`, `.vite/`, `dist/`, build caches |
| `assets-source/` masters | Generator download scratch, ffmpeg temp, KTX2 intermediates |
| `dist-release/` tagged bundles | Docker volumes, D1 local state, the real `.env` |
| `.env.example` | Playwright browsers, perf capture traces |

> **Violated today:** `node_modules/` (175 entries) and `dist/` both live inside the Drive mount,
> and `.wrangler/` local state with them. Moving the working tree to `$MW_BUILD` fixes all three at
> once.

**Hard rules:**

1. The **active git working tree is `$MW_BUILD/mw`.** `$MW_ROOT` holds a bare mirror at
   `.git-mirror/mw.git` plus the human-facing folders. Push to both a real remote and the mirror.
   **Never run `npm install` inside the Drive mount.**
2. Never point a database, Docker volume, or watcher-heavy toolchain at the mount. Drive
   placeholder files and file locks produce corruption that presents as random test failures.
3. **Never run two machines against the same folder simultaneously.** Drive resolves conflicts by
   creating `file (1).ts`. A duplicated `.ts` that still compiles is a silent bug factory. CI
   rejects any path matching `/ \(\d+\)\./`.
4. Mark `assets-source/` and `content/` *Available offline*; leave `dist-release/` streaming.
5. **Quote the path everywhere.** `$MW_ROOT` contains spaces *and* an `@`. One unquoted expansion
   in a shell script splits the path and deletes something you liked. CI greps scripts for
   `\$MW_ROOT[^"]` and fails.
6. Filename discipline: ASCII, lowercase, `-` or `_` only, no spaces, ≤ 64 chars, no colons.
   macOS is case-insensitive and Linux CI is not — CI fails on any case-only collision.
7. `.DS_Store`, `Icon\r`, `~$*` and `*.tmp` are gitignored and swept by
   `ops/scripts/drive-hygiene.sh`. **11 `.DS_Store` files are present now.**

See [ops/scripts/bootstrap.sh](../ops/scripts/bootstrap.sh) — the only supported way to start work.

---

# §4. THE STACK — locked; an ADR is required to change any line

| Layer | Choice | Status |
|---|---|---|
| Language | TypeScript 5.6, strict | In place |
| Renderer | **Three.js r180** | In place — [ADR-0001](adr/0001-renderer-three-vs-babylon.md) |
| Graphics API | WebGL2 today; WebGPU evaluated at M2 | LIGHTING §5.9 — decision deferred with a spike, not assumed |
| Physics | Rapier3d-compat 0.14, fixed 60 Hz sim step | In place |
| Build | Vite 6 | In place |
| UI | Direct DOM (`src/ui/`), **zero framework in the combat frame loop** | In place, and correct — do not introduce React into the game canvas |
| Server | Node 22, `ws` 8.21, authoritative | Partly — §8.5 |
| Edge | Cloudflare Workers + Pages + Durable Objects | In place |
| Data | Cloudflare D1 + `migrations/` | In place |
| Assets | glTF 2.0 / GLB, `@gltf-transform/cli` 4.4, meshopt | In place; **KTX2 is the gap** — PIPELINE §6.6 rule 12 |
| Test | 19 bespoke scripts + `playwright-core` | In place, **not gated** — §10 |
| CI | GitHub Actions | **Does not exist** — M0 |
| Validation | Zod → JSON Schema → TS types | PIPELINE Part C |

**Deliberately not adopted from the brief:** Babylon.js, Havok, React 19 in the game, Postgres,
Redis, WebTransport, Turborepo, pnpm. Each would replace something already working. Cloudflare D1 +
Durable Objects already provide the durable store and match coordination those choices were meant
to supply.

## §4.1 `.env` policy

Real values live only in `$MW_BUILD/mw/.env`, never on the Drive. See
[.env.example](../.env.example).

**Rule: anything prefixed `VITE_` is public.** It is inlined into the client bundle at build time.
If a secret is ever prefixed `VITE_`, treat it as leaked and rotate it immediately.

Today `.env.production` correctly contains only two `VITE_` service URLs and no secrets — that is
the right shape. Generator keys (Tripo, ElevenLabs) must **never** appear with a `VITE_` prefix and
must only be read by server-side tooling in `scripts/` and `ops/`.

---

# §8. WEB DELIVERY AND IMPLEMENTATION

## §8.1 Build and streaming

- Route-split bundles: landing page, menu/hangar shell, and the combat runtime load separately.
  The landing page must never pull the sim.
- Assets stream by biome. A mission loads its biome kit, its `lighting_profile` environment and its
  audio bank — not the whole catalogue.
- **Cloudflare Workers enforce a 25 MiB per-file limit.** `public/.assetsignore` already excludes
  3D models from Worker upload; this constraint is load-bearing and must survive any deploy change.
- KTX2 + meshopt on every mesh (PIPELINE §6.6). Currently unmet and a real download-size win.

## §8.2 Caching and headers

- Content-hashed filenames, `Cache-Control: public, max-age=31536000, immutable` for hashed assets.
- `index.html` and manifests: `no-cache`, revalidated.
- `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` if
  `SharedArrayBuffer` is ever needed for physics or audio workers — decide before it is needed,
  because retrofitting COEP breaks third-party embeds.
- CSP with no `unsafe-eval`; `connect-src` restricted to the match and API origins.

## §8.3 Cross-origin topology

The split is deliberate and documented in `.env.production`: the game serves from Pages
(`robot-mech.pages.dev`), while the Durable Object match socket and the D1 account API stay on the
Worker, because **Pages can host neither a DO class nor the D1-backed API.**

- WebSockets are not subject to CORS preflight, so the match socket connects directly.
- The account API **does** enforce an Origin allowlist and answers preflights
  ([server/accountapi.mjs](../server/accountapi.mjs)). Keep it that way.
- Leaving both `VITE_*` URLs unset falls back to same-origin, which is correct if the game is ever
  served from the Worker again. Preserve that fallback.

## §8.4 Security

- Passcodes are stretched client-side with 200,000 PBKDF2 rounds and **only the verifier is sent**.
  This is already implemented and is good practice — ratify and do not weaken it.
- Rate-limit account creation, sign-in and match join at the edge.
- No secret in any client bundle — CI greps every build artefact (§10 gate 6).
- Dependency audit in CI; pin `three`, `rapier3d-compat` and `ws` exactly.

## §8.5 Netcode and server authority

**This is the largest correctness gap outside rendering.** Accounts and match are server-side, but
**campaign progression is computed on the client and merged**, via an optimistic-concurrency merge
designed to never lose an unlock, frame or bay.

That merge is well-built for its actual purpose — cross-device convergence and offline play — and
it should be kept. But *convergence* is not *authority*: a merge that never loses an unlock will
also faithfully preserve an unlock the client simply invented.

**Target:** the server is truth for damage, inventory, progression, salvage, purchases and match
results. The client renders and predicts; it never decides.

**Migration, at M3:**

1. Server-side mission validation: accept a mission result only if its claimed outcome is
   reachable from the mission's own content definition.
2. Server-side economy: salvage and purchases resolve server-side against a server-held wallet.
3. Keep the offline queue and the merge — but the merge reconciles *server-validated* results, not
   client-authored ones.
4. Adversarial test in CI: a tampered client must not be able to grant itself a frame, a bay or
   currency (§10 gate 9).

---

# §10. QUALITY BARS AND CERTIFICATION

## §10.1 The gate philosophy

Nineteen validation and test scripts already exist — `validate_campaign`, `validate_hangar`,
`validate_nav`, `lint_bt`, `test_bt`, `test_campaign`, `test_nav`, `test_nav_unit`, `test_hangar`,
`test_hangar_ui`, `test_accounts`, `test_sync`, `verify_save`, `verify_assets`, `verify_mouse`,
`audit_assets`, `check_tripo_quality`, `check_key`, `probe_*`.

**They encode real knowledge and nothing enforces them.** M0's CI task is not to write new tests —
it is to make the existing ones **mandatory**. That is the cheapest quality win available on this
project, and it is available in week one.

## §10.2 CI gates — every one fails the build

| # | Gate | Source |
|---|---|---|
| 1 | Typecheck clean (`tsc --noEmit`) | Exists |
| 2 | All 19 existing validators and tests pass | Exists, **not gated** |
| 3 | Frame budget: 1% low ≥ 50 fps at High/1440p on the reference GPU, 10-min capture | New — perf harness |
| 4 | Every content object validates against the one schema | PIPELINE Part C |
| 5 | Every shipped asset has a passing QC record + contact sheet | PIPELINE §6.6 |
| 6 | **Zero secrets in any build artefact** | New — grep every bundle |
| 7 | Franchise + retired-canon term scan returns zero hits outside `docs/_inbox/` | CONVERGENCE §9.2 |
| 8 | No path matches `/ \(\d+\)\./`; no case-only collisions; no unquoted `$MW_ROOT` | §3.2 |
| 9 | Adversarial client cannot alter progression, inventory or economy | §8.5 |
| 10 | Audio: all shipped files at 192 kbps / 44.1 kHz, loudness targets met | PIPELINE §7 |
| 11 | Every VO line has a forced-alignment subtitle | PIPELINE §7.4 |
| 12 | Zero PNG/JPG textures in the build; KTX2 only | PIPELINE §6.6 |
| 13 | Colour-space correctness on every texture (KTX2 headers) | LIGHTING §5.1 |
| 14 | Browser matrix green (Chrome, Edge, Firefox, Safari — desktop) | Playwright |
| 15 | Bundle size budget per route not exceeded | New |

## §10.3 Accessibility bars

- Independent sliders to **zero** for camera shake, flash intensity and motion blur.
- No state conveyed by colour alone — heat, damage, lock and warnings all carry a second channel.
- Full input remapping (`src/engine/bindings.ts` exists — extend to complete coverage).
- Subtitle sizing, background opacity, and speaker labels.
- External accessibility audit passed at M4.

## §10.4 The certification checklist

Run in full before every release candidate. Every line is signed by a named owner.

**Craft** — 60 fps @ 1440p High with 1% low ≥ 50 · all 7 biomes have authored lighting profiles ·
silhouettes read at 400 m in every biome and preset · no raw generated assets · KTX2 only ·
contact sheet on file for every asset

**Audio** — every file 192 kbps / 44.1 kHz · loudness targets met · dialogue ducking verified ·
every line subtitled with word timing

**Correctness** — server is truth for all six protected domains · adversarial test passes · zero
secrets in artefacts · all content validates · zero bespoke validators remain

**Reach** — accessibility sliders reach zero · external audit passed · 6 locales complete with no
clipped strings · browser matrix green

**Process** — everything in version control · CI green · ADR for every irreversible decision ·
franchise scan zero · trademark clearance returned · commercial-use rights verified for every
generated asset in the build
