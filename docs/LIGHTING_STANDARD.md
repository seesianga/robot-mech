# LIGHTING & SHADING STANDARD — §5

**Status:** Normative. Owner: Technical Director.
**Engine:** Three.js r180 (see [ADR-0001](adr/0001-renderer-three-vs-babylon.md)).
**Parent:** [CONVERGENCE_PLAN.md](CONVERGENCE_PLAN.md).

This is the visual upgrade. It is also where the money goes.

> **API caveat.** Three.js identifiers move between releases, and several features below live in
> `examples/jsm` (addons) rather than core — which means *we* own their maintenance. Every
> identifier marked ⚠ must be verified against the installed r180 before use, and the verified
> mapping recorded in this file. Do not copy code from this document into `src/` without that check.

---

## §5.0 Where we start — the measured baseline

The entire game render path is 50 lines, [src/engine/renderer.ts](../src/engine/renderer.ts):

```
WebGLRenderer(antialias)  ·  setPixelRatio(min(dpr, 2))
shadowMap: PCFSoftShadowMap, ONE DirectionalLight, ONE 2048² map, bias -0.0004, frustum ±350 m
toneMapping: ACESFilmic, exposure 1.3   (hard-coded, global, no per-biome authoring)
ambient: HemisphereLight(0xc4d8e2, 0x6a5a48, 1.35)
fog: linear 250 → 1900
scene.environment: NEVER SET.   post-processing: NONE.   quality presets: NONE.
```

Two facts worth stating plainly, because they set the priority order:

1. **There is no image-based lighting in the game.** Every ambient contribution is a two-colour
   hemisphere gradient. No HDRI exists anywhere in the repository. This is the single largest
   gap between the current build and a premium look, and it is also the cheapest to close.
2. **`EffectComposer`, `UnrealBloomPass` and `PMREMGenerator` are already used correctly — in
   `src/site/stage.ts`, the marketing page.** The landing page is better lit than the game it
   advertises. The techniques are not unfamiliar to this codebase; they were simply never applied
   to the product.

The baseline is competent and honest. It is not premium, and the delta is well understood.

---

## §5.1 Colour and tone pipeline — set once, never fought with again

| Setting | Value | Rationale |
|---|---|---|
| Working space | Linear, scene-referred (`ColorManagement.enabled = true`, Three's default) | Only correct way to light PBR |
| Output | `renderer.outputColorSpace = SRGBColorSpace` | Already correct in `src/site`; must be explicit in the game path |
| Texture colour space | Base colour + emissive = `SRGBColorSpace`; normal, ORM, masks, height = `NoColorSpace` | The most common asset bug in any PBR project. CI validates it — PIPELINE §6.6 |
| Tone mapping | `ACESFilmicToneMapping` for combat and cinematics; `NeutralToneMapping` ⚠ (Khronos PBR Neutral) for hangar, MechLab and marketing renders | ACES gives filmic highlight roll-off for muzzle flash and reactor glow. Neutral preserves true albedo so players judge paint schemes accurately |
| Exposure | **Fixed EV per biome**, authored in that biome's `lighting_profile`. No auto-exposure in combat. | Auto-exposure hides targets when a flare goes off. Readability beats realism — §5.8. Replaces today's global `1.3`. |
| Grade | One LUT per biome, ≤ 33³, applied post-tonemap via `LUTPass` ⚠ | Biome identity without touching materials |

---

## §5.2 HDRI and environment lighting

**Sourcing.** HDRIs are licensed assets. Use CC0 sources (Poly Haven, AmbientCG) or panoramas shot
in-house. Store the licence text beside the file at `assets-source/hdri/<name>/LICENSE.txt`. Never
scrape an HDRI from a render forum. Never use a screenshot of another game as an environment.

**Authoring chain, per environment:**

```
source .hdr / .exr   (4096×2048 equirect, 16/32-bit float, sun not clipped)
  → sun extraction:  find the brightest solid angle; record direction + intensity  → feeds §5.3
  → optional sun clamp: cap the disc so the prefilter does not bloom into mush
  → PMREMGenerator.fromEquirectangular()  → prefiltered cube RT
  → serialise to a compressed prefiltered artefact; keep the .hdr as the master
  → runtime loads the prefiltered artefact, NOT the .hdr
```

**Container — confirmed at M1 (2026-08-02).** The shippable form is a **1024×512 RLE RGBE
equirect** (`public/env/<biome>_1k.hdr`, ~1.2 MB) plus the biome's profile JSON in
`content/lighting/<biome>.json` carrying the extracted sun, rotation, intensities, bias, EV and
provenance hashes. The prefilter itself runs at **load time** via
`PMREMGenerator.fromEquirectangular` in `src/engine/lighting.ts` — a one-time cost during the
mission load screen, logged per apply as `[lighting] <id>: prefilter N ms`; **measured 14.7 ms**
at 1024×512 on Apple Silicon hardware GL (2026-08-02). The original
"prefilter offline" plan was dropped: Three's PMREM output is a version-internal 2D atlas with no
stable serialised form, and at 1k the load-time cost does not justify maintaining a custom
container. **Software rasterisers decline the profile** (`isSoftwareRenderer()` in
`engine/quality.ts`) and keep the neutral probe + MOODS path: under swiftshader the prefilter
alone measured 54.7 s (on a contended host — tens of seconds regardless), which blows every CI
harness timeout to produce pixels the lightprobe does not measure. `?ibl=1` forces the profile
for manual QA on any GL; `?ibl=0` skips it anywhere. Bake tool: `scripts/build_env.mjs` (decode → sun extraction → highlight clamp →
linear downsample → RLE re-encode → profile merge). Masters stay in `assets/hdri/<name>/` beside
their `LICENSE.txt` and never ship.

### Per-biome profiles

Seven exterior biomes, matching the values already used as `map` in `content/campaign/*.json`,
plus the interior. Every number is **data** in `content/lighting/<biome>.json`, never code.

| `lighting_profile` | Location | Character | `environmentIntensity` | Sun (from IBL) | Fog / volumetrics | Exposure EV |
|---|---|---|---|---|---|---|
| `coast` | Breaker Coast, Saltglass Cove | Maritime haze, bright overcast, high ambient | 1.15 | Weak, diffuse, elevated | Sea haze, low shaft strength | 1.0 |
| `salt` | Halite Flats | Clear hard sun, deep sky bounce off salt | 0.85 | Strong, low azimuth, hot | Heat shimmer, dust motes, long shafts | 1.2 |
| `karst` | Karst Highlands | Broken cloud, moving key, high dynamic range | 1.0 | Rim-lit, unstable | Valley fog, medium shafts | 1.0 |
| `polar` | Polar Refineries | Whiteout, very high ambient, near-zero contrast | 1.25 | Very weak, omnidirectional | Dense ground fog, snow | 0.9 |
| `storm` | Storm Coast | Heavy cloud, lightning key, extreme range | 0.95 | Unstable, event-driven | Spray, rain, heavy volumetrics | 1.05 |
| `arcology` | Vell Arcology | Low ambient; artificial practicals carry the scene | 0.35 | None; clustered point/spot | Volumetric cones on every practical | 1.35 |
| `anchor` | Spire Anchor | Single hard key, near-black ambient, planet bounce | 0.4 | Extreme contrast, no scatter | None — no medium | 1.1 |
| `hangar` | Hangar / cockpit | Interior probe, practicals | 0.6 | None; area lights + probes | Thin dust, no shafts | 1.0 |

**Rules:**

- **The visible sky and the IBL must be the same environment, always.** Mismatched skybox and IBL
  is the tell of an amateur scene. Today the game's `scene.background` is a flat colour
  (`0x9db6c2`) and there is no IBL at all — both are replaced together, never one without the other.
- `scene.environmentRotation` ⚠ is authored per level so the IBL's bright region aligns with the
  art-directed sun and the level's hero silhouette.
- **Reflection probes** for interiors, hangar bays and cockpit glass, refreshed on demand and not
  per frame. The cockpit gets its own probe so canopy reflections respond to the world without a
  full SSR pass.
- **Zone blending:** entering a cavern or hangar cross-fades environment, intensity and fog over
  0.4–0.8 s. Never snap.
- `RectAreaLight` ⚠ (requires `RectAreaLightUniformsLib.init()`) for hangar strip lighting and
  cockpit instrument glow — they read as real fixtures instead of fake point lights. Note the Three
  limitation: **`RectAreaLight` does not cast shadows.** Pair with a shadowed spot where contact
  matters.

---

## §5.3 Shadow standard

This is the "make generated assets cast and receive shadows correctly" answer. It has an engine
half and an asset half, and **both are mandatory** — a perfect HDRI cannot rescue an albedo with
baked-in shadows, and a de-lit texture cannot rescue a scene with one shadow map.

### Engine side

| Layer | Technique | Config |
|---|---|---|
| Sun / key | **Cascaded shadow maps**, 4 cascades — `CSM` ⚠ from `examples/jsm/csm/` | 4096 (Ultra) / 2048 (High) / 1024 (Balanced); `shadowMaxZ` 400–600 m to match combat sightlines; practical split lambda ≈ 0.85; replaces today's single ±350 m frustum and its `trackSun()` recentring |
| Filtering | `PCFSoftShadowMap` (Ultra/High) → `PCFShadowMap` (Balanced) → `BasicShadowMap` (Fallback) | Three has no PCSS in core; a PCSS variant is a custom shader if the TD judges it worth the cost |
| Bias | `normalBias` 0.02–0.04, `bias` −1e-5 … −5e-5 | **Per biome, not global.** Today's single `-0.0004` cannot serve both a whiteout and a hard-sun desert |
| Contact | Screen-space contact shadows (custom pass) + `GTAOPass` ⚠ | Kills the "floating above the ground" read at foot contact and panel seams |
| Ambient occlusion | GTAO applied to **ambient only, never direct light** | With real IBL arriving, this is what grounds assets in the environment |
| Local lights | Shadow maps for ≤ 6 hero lights (reactor breach, flare, searchlight); the rest unshadowed | Budgeted per preset — §5.7 |
| Transparency | Alpha-tested foliage/netting casts via alpha coverage; particles never cast | Explicit only where authored |
| Cockpit | Baked AO + one shadowed key + probe. Never a cascade. | |

### Asset side — enforced by the PIPELINE §6.6 gate

1. Every runtime mesh has `receiveShadow = true` and an **explicit** `castsShadow` flag in its
   content record. No implicit defaults.
2. Shadow casters use a dedicated **caster proxy** at roughly LOD2 density — closed, no interior
   junk. Casting from a 180k-triangle LOD0 wastes a cascade for no visual gain.
3. **No zero-thickness surfaces.** Single-sided sheets produce acne and light leaks. Minimum
   authored thickness 2 cm at world scale (1 unit = 1 m).
4. **Consistent winding, outward normals.** Inverted normals shade black under IBL and punch holes
   in the shadow map. Invisible today precisely *because* there is no IBL — this class of defect
   will surface the moment §5.2 lands, across all 357 existing models.
5. **Watertight** wherever a cascade sees it. Floating shells and duplicate interior faces reject.
6. `side: FrontSide` by default. `DoubleSide` only for authored thin geometry, and then with
   back-face shadow handling.
7. Alpha mode explicit: opaque unless the material genuinely needs cutout or blend. Generator
   defaults are not to be trusted.

> **Scheduling note.** Rules 3–6 are the reason M2 budgets a full re-material pass over all 357
> existing models. They were shipped under a renderer that could not reveal the defects.

---

## §5.4 Shading modes — material class matrix

One material class per surface family. Artists pick from this list; they do not invent shaders.
All classes are `MeshPhysicalMaterial` unless noted — Three exposes clearcoat, anisotropy,
iridescence, transmission and sheen directly on it, which covers the whole matrix without custom
shader work.

| Class | Extensions | Calibration |
|---|---|---|
| `mat_ceramic_painted` — frame armour | `clearcoat` 0.25–0.4, `clearcoatRoughness` 0.1–0.3 | `metalness` 0; base colour luminance 0.05–0.75. **The clearcoat is what makes ceramic read as ceramic and not plastic.** |
| `mat_metal_brushed` — hydraulics, rails, exposed frame | `anisotropy` 0.3–0.6 ⚠, tangent along brush direction | `metalness` 1; `roughness` 0.2–0.45 |
| `mat_metal_burnt` — muzzle, thruster, damage | low anisotropy; emissive mask for heat | `roughness` 0.5–0.8, tint via base colour |
| `mat_glass_canopy` | `transmission` + `iridescence` 0.1–0.3 + `thickness` | Never fully clear — cockpit glass sells scale through grime and coating |
| `mat_rubber_cable` | none | `roughness` 0.7–0.9, `metalness` 0 |
| `mat_emissive_conduit` — reactor, radiators, warnings | `emissive` + bloom tag; intensity driven by heat state | Emissive drives the glow layer, **never** base colour |
| `mat_terrain_*` | Triplanar, ≤ 4-layer blend; parallax occlusion on Ultra/High | Foot and track deformation decals write into the blend mask |
| `mat_decal_*` | Decal projection, alpha cutout | Scorch, craters, oil, faction markings, damage |
| `mat_damage_overlay` | Mask-driven blend over the base class | **Damage is material, not a mesh swap.** Section damage state drives the mask |

Every material's parameters live in content JSON, not in code. That keeps a future migration — to
OpenPBR, to TSL node materials, to a different renderer — a data mapping rather than a re-authoring
pass.

---

## §5.5 Post-processing stack — ordered

There is currently **no post stack in the game.** This is built from nothing, which is an advantage:
the order below can be correct from the first commit.

1. Depth/normal prepass — feeds GTAO, SSR, contact shadows, TAA
2. Opaque + CSM
3. **GTAO → applied to ambient only, never to direct light**
4. Transparents, particles, decals
5. Volumetric lighting — custom pass; extinction and phase authored per biome
6. SSR (Ultra/High) with probe fallback; probes only below that
7. TAA ⚠ + dynamic resolution 50–100%
8. Bloom — **threshold high.** Bloom is for reactor, muzzle and sun. Never for HUD.
9. Motion blur — conservative, camera-only, **off by default** in the accessibility profile
10. Depth of field — cinematics only, never during player control
11. LUT grade → tone map → sharpen → dither
12. `OutputPass` (handles tone mapping + colour space conversion correctly — do not hand-roll)

**Banned by policy:** chromatic aberration during gameplay, heavy film grain, lens dirt over the
HUD, vignette (the cockpit already frames the view), auto-exposure in combat.

---

## §5.6 The lighting rig — how every asset gets approved

`scripts/lightrig.mjs` renders every candidate asset in **all seven §5.2 environments**, at three
distances (5 m / 50 m / 250 m), on a rotating stand, and writes a contact sheet.

The seven views each answer a specific question:

| Environment | Answers |
|---|---|
| Neutral studio | Silhouette and albedo truth — **is the base colour de-lit?** |
| `polar` whiteout | Ambient occlusion and normal-map quality |
| `salt` hard sun | Shadow correctness, roughness calibration, specular blowout |
| `arcology` night | Emissive balance, clustered practicals, shadow bias |
| `storm` backlit | Rim light, edge quality, alpha correctness |
| `hangar` interior | Probe reflections, area lights, cockpit-adjacent look |
| `anchor` vacuum | Extreme-contrast behaviour, black-point handling |

**No asset is approved from a turntable viewer or a generator preview.** The contact sheet attaches
to the asset's provenance record. This single rule is most of the difference between "AI assets"
and "assets".

This repository already has the harness for this — `scripts/shot_hangar.mjs`,
`scripts/shot_plinth.mjs` and `scripts/site_shots_4k.mjs` drive headless Playwright captures.
`lightrig.mjs` is a generalisation of work that already exists, not a new capability.

---

## §5.7 Quality presets

Today there is one code path and a `?noshadow` URL parameter. Four presets replace it.

| Feature | Cinematic Ultra | High | Balanced | Fallback |
|---|---|---|---|---|
| Target | 45–60 fps @ 2160p | **60 fps @ 1440p** | 60 fps @ 1080p | 30–60 fps @ 1080p |
| API | WebGPU | WebGPU | WebGPU / WebGL2 | WebGL2 |
| CSM | 4 × 4096 | 4 × 2048 | 3 × 1024 | 2 × 1024, basic |
| Filtering | PCFSoft | PCFSoft | PCF | Basic |
| GTAO / contact | On / On | On / On | Half-res / Off | Off / Off |
| Volumetrics | Full | Reduced steps | Billboard shafts | Off |
| SSR | On | Probe + SSR | Probes only | Probes only |
| Shadowed local lights | 6 | 4 | 2 | 0 |
| TAA / dyn-res | On / 66–100% | On / 60–100% | On / 50–100% | FXAA / fixed |
| Texture budget | 4K hero, 2K standard | 2K hero, 1K standard | 1K / 512 | 512 |
| Particles | Full | Full | Reduced | Reduced |

**High @ 1440p/60 is the certification target** (CONVERGENCE §12.1). Presets are auto-selected by a
3-second GPU probe on first run, then user-overridable. The renderer never silently degrades below
the selected preset except through dynamic resolution and shadow-distance scaling, and both are
surfaced in the perf overlay.

---

## §5.8 Readability rules — these outrank beauty, always

1. Enemy silhouettes must be distinguishable from terrain at **400 m**, on every preset, in every
   biome. This is a §12 acceptance gate, and it is the rule most likely to be violated by the
   `polar` whiteout and `anchor` vacuum profiles — verify those two first.
2. Heat state, damage state, lock state and critical warnings are never conveyed by colour alone
   and never obscured by bloom, shafts, spray or shake.
3. **Weapon effects must not raise scene exposure.** Muzzle flash lights the world; it does not
   blind the player's UI. This is why exposure is fixed per biome and auto-exposure is banned.
4. Camera shake, flash intensity and motion blur each have an independent accessibility slider
   that reaches zero.

---

## §5.9 WebGPU — a decision to be made with data, not now

The brief specifies WebGPU-first. Three r180 ships `WebGPURenderer` via `three/webgpu` with TSL
node materials, and it is genuinely capable — but it is **a different renderer, not a flag**.
Node materials are a separate authoring path from `MeshPhysicalMaterial`, and several
`examples/jsm` post passes this standard depends on target the WebGL path.

**Decision: deferred to M2, with a spike in M1.** The M1 spike answers three questions and nothing
else:

1. Does the §5.5 post stack exist on the WebGPU path, or must it be re-authored in TSL?
2. Does `CSM` ⚠ work there, or is cascade support a rebuild?
3. What is the measured frame-time delta on the reference GPU for the M01 slice?

If the answer is "re-author the post stack in TSL", WebGPU is a post-launch item and the launch
ships WebGL2 — which is a perfectly respectable place to hit 1440p/60, and is what the game runs on
today. **Do not begin a renderer migration on the strength of a spec document.** Record the outcome
in an ADR either way.

---

## §5.10 Reference implementation sketch

Illustrative. Verify every ⚠ identifier against the installed r180 before use.

```ts
// src/engine/lighting.ts — replaces the ad-hoc lights in createScene()
import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';           // ⚠ verify path in r180
import type { LightingProfile } from '../content/lighting-profile';

export function applyLightingProfile(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  p: LightingProfile,
  q: QualityPreset,
) {
  // 1) Environment — the prefiltered IBL drives ALL ambient and reflections.
  //    Replaces HemisphereLight entirely. Sky and IBL come from the SAME source.
  const env = loadPrefilteredEnvironment(p.envUrl);            // baked offline, §5.2
  scene.environment = env;
  scene.background = env;
  scene.environmentIntensity = p.environmentIntensity;
  scene.environmentRotation = new THREE.Euler(0, p.envRotationY, 0);   // ⚠ r163+
  scene.backgroundRotation  = new THREE.Euler(0, p.envRotationY, 0);   // ⚠ keep in lockstep

  // 2) Sun — direction extracted from the HDRI at bake time and stored in the profile,
  //    so the key light and the ambient agree. This is what today's build cannot do.
  const sun = new THREE.DirectionalLight(
    new THREE.Color(p.sunColorHex), p.sunIntensity);
  sun.position.fromArray(p.sunDirection).multiplyScalar(-1).normalize();

  // 3) Cascades — replaces the single ±350 m frustum and trackSun().
  const csm = new CSM({                                        // ⚠ verify constructor shape
    maxFar: p.shadowMaxZ,            // 400–600 m, matches combat sightlines
    cascades: q.cascades,
    shadowMapSize: q.shadowMapSize,
    lightDirection: sun.position.clone().negate().normalize(),
    camera, parent: scene,
  });
  for (const light of csm.lights) {
    light.shadow.normalBias = p.normalBias;   // PER BIOME — not the global -0.0004
    light.shadow.bias       = p.depthBias;
  }
  // Register CASTER PROXIES, never LOD0 meshes — §5.3 asset rule 2.

  // 4) Tone map and exposure — fixed EV per biome, no auto-exposure in combat.
  renderer.toneMapping = p.toneMap === 'neutral'
    ? THREE.NeutralToneMapping                                 // ⚠ r162+, hangar/MechLab
    : THREE.ACESFilmicToneMapping;                             // combat
  renderer.toneMappingExposure = p.exposureEV;                 // was hard-coded 1.3
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // 5) Fog authored per biome rather than the global 250 → 1900.
  scene.fog = new THREE.Fog(new THREE.Color(p.fogColorHex), p.fogNear, p.fogFar);

  return { sun, csm };
}
```

---

## §5.11 Verified-identifier log

Filled in at M1 as each ⚠ is checked against the installed r180. Empty until then — an unchecked
box here is a known unknown, not an oversight.

| Identifier | Verified | r180 path / status | Notes |
|---|---|---|---|
| `NeutralToneMapping` | ☐ | | |
| `scene.environmentRotation` | ☐ | | |
| `scene.backgroundRotation` | ☐ | | |
| `CSM` | ☐ | | Addon — we own maintenance |
| `GTAOPass` | ☐ | | |
| `TAARenderPass` | ☐ | | |
| `LUTPass` | ☐ | | |
| `RectAreaLightUniformsLib` | ☐ | | No shadow casting |
| `anisotropy` on `MeshPhysicalMaterial` | ☐ | | |
| `WebGPURenderer` + TSL | ☐ | | §5.9 spike |
