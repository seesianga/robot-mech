# ASSET PIPELINE STANDARD — §6 Tripo3D · §7 ElevenLabs · §3.3 naming & schema

**Status:** Normative. Owner: Technical Artist (§6) / Audio Director (§7) / Producer (§3.3).
**Parent:** [CONVERGENCE_PLAN.md](CONVERGENCE_PLAN.md).

One pipeline per domain. This document supersedes conflicting generation settings anywhere else,
including in the scripts themselves.

> **Standing note on inherited work.** The brief assumed five divergent, immature pipelines. The
> audit found the opposite: this repository's generation tooling is **substantially correct
> already** — 357 models with measured 4K ORM/NormalGL textures, 1,486 audio files under real EBU
> R128 mastering. The job here is **consolidation and gating**, not replacement. Where the existing
> scripts are right, they are ratified below and left alone. That is a deliberate saving.

---

# PART A — §6 TRIPO3D

Tripo is a **source-asset generator**. It is never the authority on topology, scale, rigging or
game-readiness. Every call runs server-side with provenance logging. No key ever reaches a browser.

## §6.0 Measured baseline

| | |
|---|---|
| Generator | `scripts/gen_tripo_appearance.py`, model `v3.1-20260211` |
| Settings | `texture_quality=detailed`, PBR on, auto real-world scale, **no face cap** |
| Texture output | **Measured** 4096×4096 Color / ORM / NormalGL |
| Verifier | `scripts/check_tripo_quality.py` — reads embedded texture dimensions, triangle counts, material and animation counts **from the GLB itself rather than trusting the manifest** |
| LOD build | `scripts/build_lods.mjs` |
| Audit | `scripts/audit_assets.mjs`, `scripts/verify_assets.mjs` |
| Produced | 357 GLB models across `public/models/` |

**Already correct, ratified, do not change:** the ORM packing convention, NormalGL (OpenGL +Y,
matching glTF), `texture_quality=detailed`, PBR on, auto real-world scale, and — importantly — the
verify-by-reading-the-file discipline in `check_tripo_quality.py`. That last one is the habit most
studios lack.

**Gaps to close:**

| Gap | Consequence | Fix |
|---|---|---|
| **No face cap** at generation | Runtime triangle budgets (§6.8) are unenforced at source | Cap per class, §6.5 |
| **No de-lighting check** | Baked shadows in base colour double-shade under IBL. **Invisible today because the game has no IBL** — it becomes visible the moment LIGHTING §5.2 lands | §6.4 Rule 1 |
| **No shadow-caster proxies** | Cascades will cast from LOD0 | §6.4 Rule 2 |
| **No provenance records** | Cannot prove commercial rights per asset — see CONVERGENCE §9.1 | §6.7 |
| **QC is advisory, not gating** | `check_tripo_quality.py` is run by hand | Wire into CI, §6.6 |
| **No lighting-rig approval** | Assets approved in a viewer, not under the seven environments | LIGHTING §5.6 |

## §6.1 Endpoints, models, rights

- Pin **one** API surface in `.env` and verify the current `model_version` strings against live
  docs before every batch. The lineup versions fast; `v3.1-20260211` is a dated string and will age.
- Task types in use: `text_to_model`, `image_to_model`, `multiview_to_model`, `texture_model`,
  `refine_model`, `convert_model`, `mesh_segmentation`, and the `animate_*` family.
- **Commercial rights.** Free-tier output is not licensed for commercial use. The paid plan must
  cover **every one of the 357 already-generated models**, retroactively. Snapshot the terms to
  `assets-source/provenance/_terms/tripo_<date>.md`. See CONVERGENCE §9.1 — if any shipped asset
  was generated on a free tier it must be regenerated, and that is a schedule risk, not paperwork.

| Job | Model line | Why |
|---|---|---|
| Props, kit pieces, destructibles, instanced dressing | P1-class (clean topology) | Engine-ready topology, the workhorse |
| Hero frames, cockpit, objective structures | H3.1-class (high detail) | Dense geometry that holds up close and bakes well — **source only, never runtime** |
| Silhouette exploration | standard mode | Cheap, fast, throwaway |
| Hero texture finish | 8K upscale → downsample to 4K | Detail that survives compression |
| Damage separation | `mesh_segmentation` / `generate_parts` | Sections must separate for localised damage |

**Seeds:** fix `model_seed` per asset for geometry reproducibility; iterate looks with
`texture_seed` only. Both go in the provenance record.

## §6.2 Method selection

| Asset class | Method |
|---|---|
| Hero frame (Skarn → Craton line) | `multiview_to_model` from four **original** orthographic concepts + a ¾ beauty view for texture reference. Multiview is the only way to control silhouette. |
| Cockpit interior | `image_to_model`, H3.1-class, aggressively culled outside first-person |
| Vehicles, craft, emplacements | `image_to_model` or `multiview_to_model` |
| Structures, kit pieces, props | `text_to_model`, P1-class, prompt ≤ 255 chars |
| Biome variants | **Retexture the same mesh** via `texture_model` — one blast wall, seven biome material sets, not seven meshes |
| Destructibles | base mesh + `generate_parts`; verify each part has a sealed interior face and its own pivot |

Concept inputs must be original artwork. Never a franchise image, never a screenshot.

## §6.3 Naming — one namespace

Today three conventions coexist in `public/models/`:

```
vp_prop_shared_beacon.lod0.glb        vp_prop_range_gantry.lod1.glb      ← underscore, context-prefixed
vp_struct_shared_fortress-wall.lod0.glb   vp_frame_shared_craton-x.lod1.glb       ← hyphen, type-prefixed
vp_cockpit_shared_interior.lod0.glb                                        ← abbreviated type
```

One namespace replaces all three:

```
vp_<domain>_<biome|shared>_<name>_<variant>_<lod>

domain ∈ frame | cockpit | vehicle | struct | prop | kit | fx | ui
biome  ∈ coast | salt | karst | polar | storm | arcology | anchor | hangar | shared

  vp_frame_shared_craton-x_base_lod0
  vp_struct_salt_relay-mast_weathered_lod2
  vp_prop_shared_fortress-wall_a_lod1
  vp_cockpit_shared_standard_base_lod0
```

Proxies and sockets suffix the same stem: `_col`, `_shadow`, `_socket_<name>`.

**Migration:** a rename map in `content/naming-migration.json`, applied by a codemod across
`content/`, `src/` and `public/`, executed once at M2 with the full test suite as the safety net.
CI then rejects any new path not matching the pattern. Do not rename by hand and do not rename
piecemeal.

## §6.4 The two rules that make generated assets shade and shadow correctly

### Rule 1 — the albedo must be DE-LIT

Generated textures frequently arrive with lighting baked into base colour: ambient occlusion,
studio highlights, contact shadows. Under an HDRI this double-shades — the scene lights *an image
of an already-lit object*. It is the single most common reason generated assets look pasted on.

- Always request `pbr: true` with `texture_quality: "detailed"` (already the case — ratified).
- **Every prompt ends with the de-light clause:**
  > *"…evenly lit neutral studio illumination, no baked shadows, no baked ambient occlusion, no
  > cast shadows in the texture, no strong highlights, no reflections of the environment, flat
  > neutral albedo, isolated object on plain background, no ground plane, no text, no logos, no
  > watermark"*
- **Constant negative prompt, every job:**
  > *"low quality, blurry, cartoon, stylized, text, watermark, logo, ornate, baked lighting, baked
  > shadows, ambient occlusion in base color, studio highlights, ground shadow, environment
  > reflections, human figure"*
- **On ingest**, compute local luminance variance in cavity regions against the AO map. If base
  colour correlates with the AO channel above threshold, flag the asset: regenerate, or de-light in
  the DCC. **AO belongs in the ORM red channel only.**

> This check does not exist today and no existing asset has passed it. Budget the M2 re-material
> pass accordingly — assume a meaningful fraction of the 357 need de-lighting or regeneration, and
> measure the real rate on the first 20.

### Rule 2 — the geometry must be shadow-legal

Enforced by §6.6 and detailed in LIGHTING §5.3: watertight, outward normals, consistent winding, no
zero-thickness sheets (min 2 cm), no interior junk, no floating shells, no intersecting duplicate
hulls, explicit alpha mode, and a dedicated `_shadow` caster proxy for anything above prop scale.

### Channel conventions — non-negotiable

| Map | Format | Convention |
|---|---|---|
| Base colour | sRGB, KTX2 (UASTC hero / ETC1S bulk) | **De-lit. No AO. No baked shadow.** |
| Normal | Linear, OpenGL +Y | Already NormalGL — ratified. If a generator emits DirectX −Y, flip on ingest and log it |
| ORM | Linear, packed R=AO, G=Roughness, B=Metallic | Already correct — ratified. One texture, three channels, never three files at runtime |
| Emissive | sRGB + intensity in material data | Drives the glow layer; heat state modulates intensity |
| Masks | Linear, packed | Damage is material-driven, never a mesh swap |

## §6.5 Ready-to-POST presets

```jsonc
// "HERO FRAME" — multiview from four original orthographic concepts; H3.1 source pass
{ "type": "multiview_to_model", "model_version": "<current H3.1-class>",
  "files": [ {"type":"png","file_token":"<front>"}, {"type":"png","file_token":"<left>"},
             {"type":"png","file_token":"<back>"},  {"type":"png","file_token":"<right>"} ],
  "texture": true, "pbr": true, "texture_quality": "detailed",
  "texture_alignment": "original_image", "orientation": "align_image",
  "auto_size": true, "quad": true,
  "face_limit": 200000,        // SOURCE density for baking — never a runtime number
  "model_seed": 91001 }

// "RUNTIME TOPOLOGY" — P1-class clean-topology pass for the game mesh
{ "type": "multiview_to_model", "model_version": "<current P1-class>",
  "files": [ /* same four views, same seed family */ ],
  "texture": true, "pbr": true, "texture_quality": "detailed",
  "auto_size": true, "quad": true, "smart_low_poly": true,
  "face_limit": 60000,         // pre-retopo; final LOD0 budget is §6.8
  "model_seed": 91001 }

// "PROP" — text-to-model, P1-class
{ "type": "text_to_model", "model_version": "<current P1-class>",
  "prompt": "<function + silhouette + materials> + <de-light clause §6.4>",   // ≤255 chars
  "negative_prompt": "<constant negative, §6.4>",
  "texture": true, "pbr": true, "texture_quality": "detailed",
  "face_limit": 8000, "auto_size": true, "quad": true, "compress": true,
  "model_seed": 91120 }

// "DESTRUCTIBLE" — separable sections for localised damage
{ "type": "text_to_model", "model_version": "<P1-class>", "prompt": "<…>",
  "generate_parts": true, "texture": true, "pbr": true,
  "face_limit": 25000, "model_seed": 91210 }

// "HERO TEXTURE FINISH" — 8K upscale on an approved mesh, then downsample to 4K KTX2
{ "type": "texture_model", "model_version": "<current texture model>",
  "original_model_task_id": "<task>", "texture_quality": "detailed",
  "pbr": true, "texture_seed": 44021 }

// "EXPORT"
{ "type": "convert_model", "original_model_task_id": "<task>", "format": "GLB" }
```

**`face_limit` is the headline change.** Today's pipeline sets no cap, so §6.8 budgets are aspirational.

## §6.6 QC gate — CI-enforced, reject or regenerate on any failure

`check_tripo_quality.py` already implements checks 1, 8 and part of 11 by reading the GLB directly.
Extend it and **wire it into CI as a gate**.

**Geometry**
1. Within §6.8 triangle budget at LOD0–LOD3
2. Watertight where required; zero floating shells, interior junk or duplicate hulls
3. Outward normals, consistent winding, no zero-thickness sheets (min 2 cm)
4. Pivot at ground contact; forward axis per convention; scale verified against 1 unit = 1 m
5. UVs: no overlaps in the AO set, ≤ 8% shell waste, no cross-seam mirroring on hero assets
6. Collision proxy ≤ 10% of render triangles, hand-verified against beam and projectile traces
7. `_shadow` caster proxy present for anything above prop scale

**Materials**

8. Full PBR set present; ORM packed correctly; normal map is +Y
9. **De-light check passes** (§6.4 Rule 1)
10. Roughness within the class band (LIGHTING §5.4); metallic effectively binary; base colour
    luminance inside 0.03–0.85
11. Colour spaces correct — CI reads the KTX2 headers
12. Textures are KTX2 with mips. **No PNG or JPG ships.**

**Look**

13. Silhouette reads at 400 m in all seven LIGHTING §5.6 environments; contact sheet attached
14. Palette consistent with the faction bible (Free Veyran Compact vs Karst Directorate)
15. No accidental resemblance to protected designs — signed against `IP_EXCLUSION_CHECKLIST.md`

**Record**

16. Provenance JSON complete (§6.7). **No provenance, no merge.**

## §6.7 Post-processing and provenance

Per asset: parts verification → retopology of joints, bores, vents, thin armour and damage seams →
skeleton and constraints → animation set → sockets (muzzle, tube, ejection, hit, foot, cockpit,
camera, sensor, exhaust, smoke, severable) → LOD0–3 + collision + shadow proxy + nav footprint →
bake high-poly detail into normal/curvature/AO/thickness/masks → GLB export → KTX2 + meshopt →
budget check → lighting-rig contact sheet → human approval.

```jsonc
// assets-source/provenance/vp_frame_shared_craton-x.json
{ "asset_id": "vp_frame_shared_craton-x", "generator": "tripo",
  "tasks": [{ "type": "multiview_to_model", "model_version": "v3.1-20260211",
              "task_id": "…", "model_seed": 91001, "texture_seed": 44021 }],
  "inputs": ["assets-source/concept/craton-x/{front,left,back,right}.png"],
  "prompt_hash": "sha256:…", "plan": "<paid tier>",
  "terms_snapshot": "tripo_2026-08-01.md",
  "human_edits": ["retopo hips/knees", "rebuilt muzzle bore", "de-lit base color"],
  "qc": { "gate_version": 1, "passed": true, "contact_sheet": "…/lightrig/craton-x.png" },
  "reviewer": "TA", "approved_at": "…", "rights_status": "cleared" }
```

**Retroactive obligation:** the 357 existing models have no provenance records. Reconstruct what is
reconstructable during M2 and mark the rest `rights_status: "unverified"` until the plan-tier
question in CONVERGENCE §9.1 is answered.

## §6.8 Runtime budgets

| Class | LOD0 | LOD1 | LOD2 | LOD3 | Textures |
|---|---|---|---|---|---|
| Hero frame | 120–180k | 55–80k | 20–35k | 6–12k | 4K base/normal/ORM/emissive |
| Cockpit interior | ≤ 150k | — | — | — | 4K, culled outside FP |
| Vehicle | 30–50k | 15k | 6k | 2k | 2K |
| Objective structure | 40–70k | 20k | 8k | 3k | 2K + trim |
| Prop / kit piece | 3–12k | 40% | 15% | impostor | Atlas / trim sheet |
| **Per-level dressing total** | **≤ 600k LOD0, ≤ 60 unique prop draws** | | | | |

---

# PART B — §7 ELEVENLABS

## §7.0 Measured baseline — better than the brief assumed

1,486 audio files exist under a mastering pipeline that is genuinely sophisticated:

- Real **EBU R128 `loudnorm`** with per-category targets.
- A documented, correct gotcha in the code: *loudnorm misjudges 1–3 s clips, so measure then apply
  pure linear gain* — with the result asserted at the end of the run. This is careful engineering
  and it stays.
- `master_music.mjs` as a dedicated mastering stage.
- Per-category loudness handling rather than one global target.

**Ratified and left alone:** the R128 approach, the short-clip linear-gain path, the end-of-run
assertion, per-category targets, and the existing voice casting.

**The one real gap:**

| Script | Format | Master archived? |
|---|---|---|
| `gen_audio`, `gen_bt_audio`, `gen_mp_audio`, `gen_music`, `gen_tutorial_audio`, `gen_bt_sfx`, `gen_campaign_audio`, `gen_nav_audio` | `mp3_44100_192` | **No** |
| `gen_site_audio`, `master_music` | `pcm_44100` | Yes |

Nine generators go **straight to lossy 192 kbps with no lossless master retained**. Every
subsequent mastering operation — loudnorm, gain, trim — is therefore applied to already-lossy
audio, and any future re-master, re-mix or format change means **regenerating the line and paying
for a new, different take.**

## §7.1 The standard

```
MASTER   : output_format = pcm_44100  (16-bit LE PCM, 44.1 kHz) → wrapped to WAV, archived
DELIVERY : 192 kbps @ 44.1 kHz MP3, encoded LOCALLY from that same master
RUNTIME  : the 192 kbps MP3 ships. An Opus 48 kHz variant may be transcoded from the same
           master for bandwidth-sensitive regions — never re-generated, only transcoded.
```

**Plan gating decides whether this is achievable:**

- `pcm_44100` / `wav_44100` require **Pro tier or above**.
- `mp3_44100_192` requires **Creator tier or above**.

**[ASSUMPTION]** the account is currently on **Creator**, which is consistent with nine scripts
requesting `mp3_44100_192` directly — that is the *correct* Creator-tier behaviour, not a mistake.
It also means the two scripts requesting `pcm_44100` would fail on Creator; verify which is true
before M1 closes.

**Decision:** upgrade to **Pro before the M2 re-master**, then:

- All new generation requests `pcm_44100`, archives the WAV, encodes 192 kbps locally.
- The 1,486 existing files **cannot be retroactively rescued** — their masters were never created
  and regeneration produces different takes. Treat them as **legacy delivery masters**: keep them,
  do not re-encode them (never transcode lossy→lossy), and regenerate only lines that need a
  performance change anyway. Record this in `docs/audio-bible.md` as accepted technical debt.

Below Creator the pipeline does not run: `tools-eleven` refuses the batch and prints the required
upgrade. That is intentional.

**Generate once.** Each call is a new take, costs credits, and is not bit-reproducible even with a
seed. Render the master once, then transcode:

```bash
# raw PCM (headerless, s16le, stereo) → WAV master
ffmpeg -f s16le -ar 44100 -ac 2 -i take.pcm "assets-source/audio-master/${ID}.wav"
# identical take → 192 kbps delivery
ffmpeg -i "assets-source/audio-master/${ID}.wav" -b:a 192k -ar 44100 "public/audio/${ID}.mp3"
```

## §7.2 Operational blocker

**[ASSUMPTION, needs confirmation]** the ElevenLabs API key was reported dead as of 2026-07-25,
and nav VO is currently wired-silent for that reason. **No audio work in this plan can start until
the key is restored.** This is an M0 blocker, not an M2 detail — it gates §7.1's upgrade, the
re-master, and every remaining VO line. Resolve it in week one.

## §7.3 Scope

| Domain | Applies |
|---|---|
| Campaign VO, Basic Training VO, multiplayer VO, nav VO | §7.1 |
| Music and stings | §7.1 + `master_music.mjs` |
| SFX, UI chimes, ambience | §7.1 — **inherits by default**, no separate spec |
| Marketing and trailer audio | §7.1 |

Any module lacking its own configuration inherits §7.1. No module ships audio at another spec.

## §7.4 Subtitles

Every VO line has a subtitle with **word-level timing from forced alignment**, generated in CI
rather than hand-authored, and validated against the line table. `lint_bt.mjs` already enforces VO
discipline for Basic Training; generalise it to all VO domains.

---

# PART C — §3.3 CONTENT SCHEMA

Four bespoke validators exist today — `validate_campaign.mjs`, `validate_hangar.mjs`,
`validate_nav.mjs`, `lint_bt.mjs`. Each encodes real knowledge and each invented its own shape.

**One schema set** in `packages/content-schema`, authored in Zod, generated to JSON Schema and TS
types, validated in CI:

```
frame · weapon · module · hardpoint · mission · objective · spawn · dialogue_line
tutorial_step · bay · salvage_table · audio_event · music_state · biome
lighting_profile · locale_string
```

**Rules:**

1. Stable machine IDs (`vp_frame_craton_x`) separate from display names.
2. **Every display string is a `locale_string` key from day one.** Six locales at launch; strings
   currently inline in content JSON are extracted at M2. Extracting late is the expensive path.
3. Every content object carries `source_file`, `author`, `version`, `rights_status`,
   `approval_state`.
4. Mission logic is an event/state graph, never scattered conditionals — the existing
   `CampaignMission` engine and `content/campaign/*.json` already work this way and are the model
   to generalise from.
5. The Basic Training step table, the hangar bay catalogue and the multiplayer mode configs become
   **instances of these types**, not new systems.
6. The four bespoke validators are retired once their rules are expressed as schema constraints.
   **Retire them by porting their assertions, not by deleting them** — they encode hard-won
   knowledge about this content.
