# Robot Mech — Tripo3D Asset Generation Handbook

Shipping product: **Robot Mech**. Campaign world: **Veyra Prime**.
This document is the single source of truth for generating, cleaning, rigging, and shipping
every 3D asset in the game via the Tripo3D pipeline. The machine-readable companion is
`assets/tripo/manifest.json` — prompt strings, LOD budgets, texture tiers, and priorities in
this document and the manifest must always match. If they ever diverge, the manifest wins
and this document must be corrected.

**IP rule (non-negotiable):** every asset is 100% original. No silhouette, marking, name, or
design language may be traceable to any existing game, anime, or film franchise. Every prompt
below ends with an explicit originality clause; the QA originality gate (Section 9.5) enforces
it on the output.

---

## 1. Pipeline overview — per asset

Every asset moves through the same eight stages. No stage may be skipped, and each stage has
an acceptance gate. An asset is "shipped" only when its GLB passes Section 9 in full.

```
1. GENERATE      4 seeds, same prompt          → gate: at least 1 usable candidate
2. SILHOUETTE    pick best of 4                → gate: reads at 64 px, originality pass
3. RETOPO / UV   Blender, quad-dominant        → gate: LOD0 tri budget, clean UV0
4. NORMAL BAKE   hi-poly → LOD0, cage bake     → gate: no skew on flat plates, no seams
5. PBR PASS      Tripo textures base + repaint → gate: faction palette, no text/logos
6. RIG           auto-rig bipeds + manual fix  → gate: rig checklist (Section 9.3)
7. ANIMATION     required clip set             → gate: all clips named, loop-clean
8. EXPORT        GLB + Draco + KTX2            → gate: validator clean, size budget, 60 fps
```

### 1.1 Generate (4 seeds)
- Run the exact assembled prompt from Section 4/5/6/7 — copy-paste, do not retype.
- Generate **4 seeds** of the same prompt. Never judge from one roll.
- Export a 4-view turntable render (front / side / back / three-quarter) per seed.
- Log the chosen seed and the rejection reason for the other three in the asset folder
  (`assets/tripo/<id>/notes.txt`) so re-rolls are reproducible.

### 1.2 Silhouette pick
Judge candidates as **black-filled silhouettes at 64 px thumbnail size**:
- The class must read instantly (a 25 t scout must not read as a 60 t heavy).
- Every hardpoint named in the roster must be visibly present and on the correct side.
- Asymmetric features described in the prompt body (Flint's antler mast, Skarn's mixed arms,
  Halite's left-forearm shield, Gabbro's mixed forearms, Corundum's sensor crown) must have
  survived generation. The word "symmetrical" in the global suffix refers to overall massing;
  **the body text outranks it** — if a seed mirrored the asymmetric feature away, reroll.
- Originality gate: two reviewers look at the silhouette; if either can name an existing
  franchise unit it resembles, the seed is rejected regardless of quality.

### 1.3 Retopo / UV (Blender)
- Quad-dominant retopology to the LOD0 budget in Section 9.1. Preserve deformation loops at
  knee, hip, shoulder, and elbow (3 loops minimum per joint on mechs).
- Mechs must be split into damage-zone primitives named
  `GEO_head, GEO_ct, GEO_lt, GEO_rt, GEO_la, GEO_ra, GEO_ll, GEO_rl`
  (plus `GEO_shield` on Halite), each with **capped interior geometry at the seam** so limb
  shear produces closed debris meshes, not hollow shells.
- Single UV0 atlas per material. Seams hidden inside panel lines; hard edges get UV splits.
  No UDIMs. Pack to ≥ 85% shell coverage.
- Texel density: ≥ 512 px/m on hero surfaces (mechs, cockpit) at 4K; ≥ 256 px/m on 2K assets.
- LOD1 and LOD2 are decimated from LOD0 with joint loops preserved; kit pieces must keep
  their open tileable ends vertex-exact across LODs so tunnel sections still weld.

### 1.4 Normal bake
- Bake from the raw Tripo hi-poly (or a subdivided cleanup pass) onto LOD0 with a cage.
- 4096 × 4096, 16-bit working format, MikkTSpace tangents, glTF/OpenGL green channel (+Y).
- Reject bakes with ray-skew on large flat armor plates, seam lines across panel centers,
  or missed floaters (bolts, grab rails).

### 1.5 PBR pass
- Tripo's generated textures are the **base only**. Repaint wear by hand:
  - **Free Veyran Compact** assets: mismatched salvage patches, off-tone replacement panels,
    hand-brushed hull repairs.
  - **Karst Directorate** assets: uniform gunmetal grey, hazard-amber chevrons and striping,
    stenciled *geometric* unit glyphs only — never readable text.
- Mechs ship with **two livery texture sets** (Compact + Directorate) on the same mesh and
  rig — Directorate enemies reuse the player roster. Named-pilot units (Rauk's Corundum-V,
  Kryce's guard Batholiths) are livery/emissive variants only. **Craton-X is the single
  geometry variant in the game** (see Section 4.13).
- Pack ORM (occlusion / roughness / metallic). Author emissive masks where the design calls
  for them: sensor eyes, Craton-X coolant lattice, cockpit warning lamps.
- Final check: zero readable text, zero logos, anywhere, in any channel.

### 1.6 Rig
- Auto-rig bipeds in Tripo, then verify and correct in Blender against the full checklist in
  Section 9.3. Auto-rig is a starting point, never a shipped rig.
- Scale applied, 1 unit = 1 m, +Y up, asset faces +Z, root at ground origin between the feet.

### 1.7 Animation
- Author the complete required clip set (Section 8) for every mech, Craton-X included.
- Non-mech articulation (pop-up turret cradle, train couplers, dropbarge ramp) is **not**
  baked as clips: those assets expose named nodes (Section 9.3) that the engine drives.

### 1.8 Export
- GLB with Draco mesh compression (level 7; quantization: position 14, normal 10, UV 12) and
  embedded KTX2/Basis textures (ETC1S for color/ORM, UASTC for normals).
- Must pass the glTF validator with zero errors, load in the engine asset viewer at 60 fps,
  and land under the file-size budget in Section 9.4.

---

## 2. Folder and naming conventions

```
assets/tripo/<id>/
  source/        raw Tripo exports, all 4 seeds
  work/          .blend files (retopo, bake, rig, anim)
  bake/          baked maps, 16-bit masters
  textures/      final KTX2 sets (livery subfolders for mechs: compact/, directorate/)
  export/<id>.glb
  notes.txt      chosen seed, rejected seeds + reasons, deviations
```

Asset ids are kebab-case and identical to the `id` field in `manifest.json`
(e.g. `vp_frame_shared_skarn`, `veh-hover-skiff`, `prop-drain-junction`, `vp_cockpit_shared_interior`).

---

## 3. Style suffixes

### 3.1 GLOBAL STYLE SUFFIX — mechs (verbatim, append to every mech prompt body)

> In design docs the suffix is written with a leading ellipsis ("…industrial military…") to
> mark the join point; the ellipsis is not part of the prompt. Append the text below exactly.

```
industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 3.2 Adjusted suffix — vehicles

```
hard-surface vehicle design, functional silhouette, angular plating with visible panel lines and fasteners, exposed hydraulic lines and cable bundles at articulation points, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, resting stance on level ground, game-ready, plain background. Fully original design — do not imitate vehicles from any existing game, anime, or film franchise.
```

Single sanctioned deviation: the naval gun monitor replaces
"resting stance on level ground" with "hull level at the waterline".

### 3.3 Adjusted suffix — structures, emplacements, kit pieces

```
hard-surface industrial structure design, functional silhouette, plate and truss construction with visible panel lines, fasteners, and weld seams, mining-world utilitarian aesthetic, weathered matte surfaces with edge chipping, rust streaks, and grime, no text, no logos, PBR materials, modular game-ready geometry with the pivot at the base center, plain background. Fully original design — do not imitate structures from any existing game, anime, or film franchise.
```

### 3.4 Adjusted suffix — interiors

```
hard-surface industrial interior design, functional ergonomics, visible panel lines, fasteners, and cable bundles, mining-world utilitarian aesthetic, worn matte surfaces with edge chipping and polished-through paint on frequently handled controls, no readable text, no logos, PBR materials, game-ready, plain background. Fully original design — do not imitate cockpits from any existing game, anime, or film franchise.
```

### 3.5 Assembly rule

`assembled prompt = body text (trailing ellipsis dropped) + ", " + suffix`.
The prompts in Sections 4–7 are already assembled — paste them as-is. Do not edit them
per-run; if a prompt needs a change, change it here **and** in `manifest.json` together.

---

## 4. Mech prompt library (12 chassis + Craton-X) — ready to paste

All mechs: category `mech`, LODs 120000 / 40000 / 12000 tris, 4K textures, full animation
set (Section 8), two livery texture sets (Compact + Directorate).

### 4.1 Flint — Light, 25 t, recon (`vp_frame_shared_flint`)
```
lean 8-meter bipedal scout mech, 25 tons, reverse-joint digitigrade legs, narrow single-pilot canopy, oversized branching sensor mast like antlers on the right shoulder, two small forearm laser emitters, compact jump-jet thrusters on the calves, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.2 Pumice — Light, 30 t, harasser (`vp_frame_shared_pumice`)
```
light 9-meter bipedal mech, 30 tons, rough pockmarked ablative armor texture like volcanic stone, two boxy rocket pods on the shoulders, small head with a single horizontal visor slit, sprinter's stance, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.3 Skarn — Light, 35 t, starter skirmisher (`vp_frame_shared_skarn`) — **PRIORITY 1 (M0)**
```
agile 10-meter bipedal skirmisher mech, 35 tons, wedge-shaped cockpit like a raptor skull built from flat armor plates, one arm ends in a light autocannon barrel, other forearm mounts a laser, prominent jump-jet nacelles on the lower legs, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.4 Chert — Medium, 40 t, fire support (`vp_frame_shared_chert`)
```
10-meter fire-support mech, 40 tons, low crouched stance, large boxy missile silo rack across the upper back, thick forearm guards, wide stable feet, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.5 Halite — Medium, 45 t, brawler (`vp_frame_shared_halite`)
```
squat 10-meter brawler mech, 45 tons, very wide shoulders, a rectangular riot-shield plate integrated into the left forearm, short-barreled cannon right arm, heavy chest armor in stacked slabs, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.6 Gabbro — Medium, 55 t, workhorse (`vp_frame_shared_gabbro`) — **PRIORITY 1 (M0 enemy)**
```
balanced upright 11-meter workhorse mech, 55 tons, classic soldier proportions, one energy cannon forearm and one ballistic forearm, single chest missile hatch, dependable heroic silhouette, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.7 Basalt — Heavy, 60 t, line-breaker (`vp_frame_shared_basalt`)
```
60-ton 12-meter heavy assault-line mech, armor plates styled as interlocking hexagonal basalt columns, twin arm-mounted autocannons, thick digitigrade legs, brooding forward lean, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.8 Dolerite — Heavy, 70 t, missile boat (`vp_frame_shared_dolerite`)
```
70-ton 12-meter missile-artillery mech, both shoulders carry tall cathedral-like banks of vertical launch tubes, small armored head low between them, wide braced stance with rear stabilizer spurs, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.9 Corundum — Heavy, 75 t, command (`vp_frame_shared_corundum`)
```
75-ton 13-meter command mech, asymmetric sensor crown array on the head, one arm particle cannon with cooling fins, elegant but battle-worn officer's silhouette, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```
Note: Ekene's old chassis; Rauk's Corundum-V is a livery/emissive variant of this asset.

### 4.10 Orogen — Assault, 80 t, juggernaut (`vp_frame_shared_orogen`)
```
80-ton 13-meter juggernaut mech, forward-hunched gorilla-like posture, massive piston-driven arms each ending in a heavy cannon, small armored eye-slit head set deep in the chest, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.11 Batholith — Assault, 90 t, siege (`vp_frame_shared_batholith`)
```
90-ton 14-meter siege mech, two long gauss-cannon spines mounted over the shoulders like dorsal rails, huge cylindrical drum magazines on the hips, ponderous fortress-like mass, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```
Note: Kryce's guard Batholiths are livery variants of this asset.

### 4.12 Craton — Assault, 100 t, apex (`vp_frame_shared_craton`)
```
100-ton 15-meter apex assault mech, monolithic slab torso like a standing megalith, three energy cannon apertures across the chest, colossal column legs, terrifying stillness, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.13 Craton-X — boss variant, Marshal Sol's prototype (`vp_frame_shared_craton-x`, variant of `vp_frame_shared_craton`)
```
100-ton 15-meter apex assault mech, monolithic slab torso like a standing megalith, three energy cannon apertures across the chest, colossal column legs, terrifying stillness, glowing coolant lattice channels across the torso, prototype test markings, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```
Craton-X rules: reuses the Craton rig and full animation set; the coolant lattice is an
authored emissive mask (slow pulse driven in-engine); "prototype test markings" are painted
as **geometric stencils only** — the no-text rule still applies. This is the M24 duel boss;
its unique behavior is duel AI, not unique clips.

---

## 5. Vehicle prompts — ready to paste (suffix from 3.2)

### 5.1 Compact dropbarge (`veh-dropbarge`) — Op1 M3 defense objective
```
boxy heavy-lift dropbarge lander, four downward-angled thrust pods at the corners, wide bow cargo ramp, external fuel tanks and crane rails along the dorsal spine, hull built from mismatched salvaged plating patched over an older frame, hard-surface vehicle design, functional silhouette, angular plating with visible panel lines and fasteners, exposed hydraulic lines and cable bundles at articulation points, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, resting stance on level ground, game-ready, plain background. Fully original design — do not imitate vehicles from any existing game, anime, or film franchise.
```
Engine-driven nodes: `node_ramp`, `node_thrustpod_1..4`.

### 5.2 Ore-crawler hauler truck (`vp_vehicle_shared_ore-crawler`) — Op2 M5 convoy
```
massive articulated ore-crawler hauler truck, eight oversized wheels on twin bogies, open tipper ore bed, low armored cab at the front, boarding ladders and inspection catwalks along the flanks, hard-surface vehicle design, functional silhouette, angular plating with visible panel lines and fasteners, exposed hydraulic lines and cable bundles at articulation points, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, resting stance on level ground, game-ready, plain background. Fully original design — do not imitate vehicles from any existing game, anime, or film franchise.
```
Engine-driven nodes: `node_wheel_1..8`, `node_hitch` (articulation), `node_tipper`.

### 5.3 Directorate hover skiff (`veh-hover-skiff`)
```
low-slung fan-in-hull hover gunboat skiff, two large ducted lift fans recessed into the hull, chin-mounted rotary cannon under the bow, open rear crew deck with grab rails and stowage lockers, hard-surface vehicle design, functional silhouette, angular plating with visible panel lines and fasteners, exposed hydraulic lines and cable bundles at articulation points, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, resting stance on level ground, game-ready, plain background. Fully original design — do not imitate vehicles from any existing game, anime, or film franchise.
```
Engine-driven nodes: `node_fan_l`, `node_fan_r`, `node_cannon_yaw`, `node_cannon_pitch`.

### 5.4 Tracked APC "Ferric" (`veh-apc-ferric`)
```
tracked armored personnel carrier, low sloped glacis plate, six road wheels per side under armored skirts, roof-mounted remote weapon station with a light autocannon, rear troop ramp, side stowage bins, hard-surface vehicle design, functional silhouette, angular plating with visible panel lines and fasteners, exposed hydraulic lines and cable bundles at articulation points, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, resting stance on level ground, game-ready, plain background. Fully original design — do not imitate vehicles from any existing game, anime, or film franchise.
```
Engine-driven nodes: `node_rws_yaw`, `node_rws_pitch`, `node_ramp`; tracks are a scrolling
UV material, not geometry animation.

### 5.5 Polar command train — locomotive (`veh-polar-train-engine`) — Op4 M14
```
armored polar railway locomotive, heavy wedge snowplow prow, enclosed crew citadel with slit windows, twin exhaust stacks, ice shields over the bogies, coupling gear at the rear, hard-surface vehicle design, functional silhouette, angular plating with visible panel lines and fasteners, exposed hydraulic lines and cable bundles at articulation points, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, resting stance on level ground, game-ready, plain background. Fully original design — do not imitate vehicles from any existing game, anime, or film franchise.
```

### 5.6 Polar command train — command car (`veh-polar-train-command-car`)
```
armored railway command car, raised roofline fairing housing sensor and comms gear, retractable antenna masts, slit viewing windows, armored bogies with ice shields, couplers at both ends, hard-surface vehicle design, functional silhouette, angular plating with visible panel lines and fasteners, exposed hydraulic lines and cable bundles at articulation points, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, resting stance on level ground, game-ready, plain background. Fully original design — do not imitate vehicles from any existing game, anime, or film franchise.
```

### 5.7 Polar command train — flak car (`veh-polar-train-flak-car`)
```
armored railway air-defense car, open central gun pit with a twin-autocannon mount, folding armor bulwarks around the pit, ammunition lockers at both ends, armored bogies with ice shields, couplers at both ends, hard-surface vehicle design, functional silhouette, angular plating with visible panel lines and fasteners, exposed hydraulic lines and cable bundles at articulation points, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, resting stance on level ground, game-ready, plain background. Fully original design — do not imitate vehicles from any existing game, anime, or film franchise.
```
Train shared rules: all three rail assets share bogie spacing and coupler height so any
consist chains cleanly; `node_coupler_front` / `node_coupler_rear` on every car,
`node_gun_yaw` / `node_gun_pitch` on the flak car.

### 5.8 Naval gun monitor (`veh-gun-monitor`) — Op5 M15 boss setpiece
```
coastal naval gun monitor warship, very low freeboard armored hull, single enormous centerline gun turret, small aft superstructure with a rangefinder mast, deck cluttered with anchor chains, bollards, and towing gear, hard-surface vehicle design, functional silhouette, angular plating with visible panel lines and fasteners, exposed hydraulic lines and cable bundles at articulation points, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, hull level at the waterline, game-ready, plain background. Fully original design — do not imitate vehicles from any existing game, anime, or film franchise.
```
Engine-driven nodes: `node_turret_yaw`, `node_gun_pitch`. This is the only vehicle using the
waterline suffix deviation (Section 3.2).

---

## 6. Structure / emplacement / kit prompts — ready to paste (suffix from 3.3)

### 6.1 Twin-autocannon pop-up turret (`prop-popup-turret`)
```
twin-autocannon pop-up defense turret, armored clamshell housing that opens to raise the gun cradle, two barrels with muzzle brakes, rear ammunition drum, anchored ground base plate with cable conduits, hard-surface industrial structure design, functional silhouette, plate and truss construction with visible panel lines, fasteners, and weld seams, mining-world utilitarian aesthetic, weathered matte surfaces with edge chipping, rust streaks, and grime, no text, no logos, PBR materials, modular game-ready geometry with the pivot at the base center, plain background. Fully original design — do not imitate structures from any existing game, anime, or film franchise.
```
Engine-driven nodes: `node_clamshell_l`, `node_clamshell_r`, `node_cradle_lift`,
`node_gun_yaw`, `node_gun_pitch`. Pop-up/retract motion is engine-driven, not baked clips.

### 6.2 Relay pylon (`vp_struct_shared_relay-pylon`) — Op2 M4 objective
```
tall lattice relay pylon mast, triangular truss construction, cluster of three dish antennas near the top, small equipment cabin at the base, guy-wire anchor lugs, aviation marker cage at the tip, hard-surface industrial structure design, functional silhouette, plate and truss construction with visible panel lines, fasteners, and weld seams, mining-world utilitarian aesthetic, weathered matte surfaces with edge chipping, rust streaks, and grime, no text, no logos, PBR materials, modular game-ready geometry with the pivot at the base center, plain background. Fully original design — do not imitate structures from any existing game, anime, or film franchise.
```
Must include a pre-fractured destruction state (collapsed lattice) as a second mesh in the
same GLB (`GEO_intact` / `GEO_destroyed`).

### 6.3 Refinery cracking tower (`vp_struct_polar_cracking-tower`) — Op4 M12 objective
```
refinery cracking tower, vertical cylindrical reactor column wrapped in external pipework, catwalk rings at three heights, external elevator cage, side-mounted flare stack with a burner tip, valve manifolds at the base, hard-surface industrial structure design, functional silhouette, plate and truss construction with visible panel lines, fasteners, and weld seams, mining-world utilitarian aesthetic, weathered matte surfaces with edge chipping, rust streaks, and grime, no text, no logos, PBR materials, modular game-ready geometry with the pivot at the base center, plain background. Fully original design — do not imitate structures from any existing game, anime, or film franchise.
```
`node_flare_tip` marks the flame emitter for the M12 thermal-bloom masking mechanic.

### 6.4 Arcology building kit — podium module (`vp_prop_arcology_arcology-podium`)
```
arcology tower base module, monumental podium block with recessed vehicle arcades, angled structural buttresses, rooftop service gantries, flat stackable top face, hard-surface industrial structure design, functional silhouette, plate and truss construction with visible panel lines, fasteners, and weld seams, mining-world utilitarian aesthetic, weathered matte surfaces with edge chipping, rust streaks, and grime, no text, no logos, PBR materials, modular game-ready geometry with the pivot at the base center, plain background. Fully original design — do not imitate structures from any existing game, anime, or film franchise.
```

### 6.5 Arcology building kit — mid-rise module (`vp_prop_arcology_arcology-mid`)
```
arcology mid-rise stack module, repeating residential tiers with deep recessed window bands, external service rails and maintenance gondola tracks, flat stackable top and bottom faces, hard-surface industrial structure design, functional silhouette, plate and truss construction with visible panel lines, fasteners, and weld seams, mining-world utilitarian aesthetic, weathered matte surfaces with edge chipping, rust streaks, and grime, no text, no logos, PBR materials, modular game-ready geometry with the pivot at the base center, plain background. Fully original design — do not imitate structures from any existing game, anime, or film franchise.
```

### 6.6 Arcology building kit — crown module (`vp_prop_arcology_arcology-crown`)
```
arcology crown module, tapering mechanical penthouse with heat-exchanger fin arrays, antenna farm, aviation beacon cage, flat stackable bottom face, hard-surface industrial structure design, functional silhouette, plate and truss construction with visible panel lines, fasteners, and weld seams, mining-world utilitarian aesthetic, weathered matte surfaces with edge chipping, rust streaks, and grime, no text, no logos, PBR materials, modular game-ready geometry with the pivot at the base center, plain background. Fully original design — do not imitate structures from any existing game, anime, or film franchise.
```

### 6.7 Arcology building kit — skybridge (`prop-arcology-skybridge`)
```
enclosed arcology skybridge span, box-truss tube with a continuous window band, armored docking collars at both ends, expansion joints along the span, hard-surface industrial structure design, functional silhouette, plate and truss construction with visible panel lines, fasteners, and weld seams, mining-world utilitarian aesthetic, weathered matte surfaces with edge chipping, rust streaks, and grime, no text, no logos, PBR materials, modular game-ready geometry with the pivot at the base center, plain background. Fully original design — do not imitate structures from any existing game, anime, or film franchise.
```
Arcology kit rules: podium top, mid top/bottom, crown bottom, and skybridge collars share an
exact snap footprint so Vell Arcology districts kit-bash with zero gaps; window bands carry
an emissive mask for night lighting.

### 6.8 Storm-drain kit — straight (`prop-drain-straight`) — Op6 M18
```
colossal storm-drain tunnel section, straight run, 18-meter oval concrete bore, central water channel with raised maintenance walkways on both sides, bolted pipe runs and conduit brackets on the walls, open tileable ends, hard-surface industrial structure design, functional silhouette, plate and truss construction with visible panel lines, fasteners, and weld seams, mining-world utilitarian aesthetic, weathered matte surfaces with edge chipping, rust streaks, and grime, no text, no logos, PBR materials, modular game-ready geometry with the pivot at the base center, plain background. Fully original design — do not imitate structures from any existing game, anime, or film franchise.
```

### 6.9 Storm-drain kit — curve (`prop-drain-curve`)
```
colossal storm-drain tunnel section, sweeping 45-degree curved run, 18-meter oval concrete bore, central water channel with raised maintenance walkways, bolted pipe runs on the outer wall, open tileable ends, hard-surface industrial structure design, functional silhouette, plate and truss construction with visible panel lines, fasteners, and weld seams, mining-world utilitarian aesthetic, weathered matte surfaces with edge chipping, rust streaks, and grime, no text, no logos, PBR materials, modular game-ready geometry with the pivot at the base center, plain background. Fully original design — do not imitate structures from any existing game, anime, or film franchise.
```

### 6.10 Storm-drain kit — junction (`prop-drain-junction`)
```
colossal storm-drain junction chamber, vaulted ceiling, four tunnel mouths meeting over a central sump grate, raised maintenance walkways with ladder alcoves, valve wheels and conduit banks on the piers, open tileable ends, hard-surface industrial structure design, functional silhouette, plate and truss construction with visible panel lines, fasteners, and weld seams, mining-world utilitarian aesthetic, weathered matte surfaces with edge chipping, rust streaks, and grime, no text, no logos, PBR materials, modular game-ready geometry with the pivot at the base center, plain background. Fully original design — do not imitate structures from any existing game, anime, or film franchise.
```
Drain kit rules: the 18 m bore clears a 12 m mech with torso twist; all tunnel mouths use
the identical vertex-exact ring profile so any piece welds to any other in any order.

### 6.11 Beached ship hull carcass (`vp_prop_tideflats_hull-carcass`) — Op1 signature cover
```
beached ocean bulk-hauler ship hull carcass cut open for scrapping, exposed rib frames and deck plates in cross-section, torch-cut plate edges, collapsed internal decks, rust cascades down the hull, keel bedded in sand, hard-surface industrial structure design, functional silhouette, plate and truss construction with visible panel lines, fasteners, and weld seams, mining-world utilitarian aesthetic, weathered matte surfaces with edge chipping, rust streaks, and grime, no text, no logos, PBR materials, modular game-ready geometry with the pivot at the base center, plain background. Fully original design — do not imitate structures from any existing game, anime, or film franchise.
```
Gameplay note: interior cross-section is walkable cover for a 10 m mech (M2 ambush); the cut
face must be fully modeled, not a capped plane.

---

## 7. Cockpit interior — hero prop (`vp_cockpit_shared_interior`) — PRIORITY 1 (suffix from 3.4)

The cockpit is on screen for the entire game (cockpit view is default) and hosts the startup
litany, the warning lamps that mirror real sim state, and CAIRN. It gets hero treatment.

```
mech cockpit interior, wraparound instrument panels, physical switches and warning lamps, twin control sticks, worn padding, pilot seat with a five-point harness, overhead breaker rows, narrow armored viewport frames, hard-surface industrial interior design, functional ergonomics, visible panel lines, fasteners, and cable bundles, mining-world utilitarian aesthetic, worn matte surfaces with edge chipping and polished-through paint on frequently handled controls, no readable text, no logos, PBR materials, game-ready, plain background. Fully original design — do not imitate cockpits from any existing game, anime, or film franchise.
```

Cockpit-specific requirements:
- Every warning lamp is a **separately named mesh with its own emissive mask region** so the
  engine can light lamps that correspond to real sim states (heat, ammo, limb loss, override).
  Naming: `lamp_heat`, `lamp_override`, `lamp_ammo`, `lamp_gyro`, `lamp_leg_l`, `lamp_leg_r`,
  `lamp_arm_l`, `lamp_arm_r`, `lamp_sensor`, `lamp_coolant`, `lamp_master`.
- `node_stick_l`, `node_stick_r`, `node_throttle` for engine-driven control articulation.
- `socket_cockpit_cam` at pilot eye height; verify the viewport frames the HUD correctly.
- Screens and gauge faces are UV-mapped flat quads the engine renders into — model bezels,
  not screen content, and keep them free of baked text.
- Polished-through wear on stick grips, throttle, and the override cover is mandatory — this
  is a mech that has been flown hard for decades.

---

## 8. Required animation set — every mech, no exceptions

All 13 mech assets (12 chassis + Craton-X) ship all 16 clips, named exactly as below.
Chassis without jump-jet hardpoints still ship the jump-jet clips: the Assembly Bay allows
jump-jet-equipped variants, and enemy AI uses the same asset. 30 fps sampling, in-place
(engine owns root motion), no root drift on loops.

| # | Clip id | Content | Duration | Loop | Notes |
|---|---------------------|-----------------------------------------------|-----------|------|-------|
| 1 | `idle_sway` | subtle mass shift, breathing hydraulics | 4–6 s | yes | amplitude scales with tonnage |
| 2 | `walk` | full stride cycle | 0.9–2.2 s | yes | slower/heavier per class |
| 3 | `run` | full stride cycle at top speed | 0.6–1.6 s | yes | lights lope, assaults never leave "heavy jog" |
| 4 | `turn_in_place` | stepping turn cycle | 1.0–2.0 s | yes | engine drives yaw rate; feet must not skate |
| 5 | `jumpjet_launch` | crouch compression + thrust extension | 0.8–1.2 s | no | blends from any locomotion clip |
| 6 | `jumpjet_land` | impact compression + recover | 0.6–1.0 s | no | heavy landings dip lower |
| 7 | `fire_recoil_arm_l` | left-arm recoil kick | 0.3–0.5 s | no | additive layer over locomotion |
| 8 | `fire_recoil_arm_r` | right-arm recoil kick | 0.3–0.5 s | no | additive layer over locomotion |
| 9 | `hit_flinch_l` | torso flinch from left impact | ~0.4 s | no | additive |
| 10 | `hit_flinch_r` | torso flinch from right impact | ~0.4 s | no | additive |
| 11 | `legloss_stumble` | catastrophic stumble, near-fall recovery | 1.5–2.0 s | no | one-shot, exits into `limp_loop` |
| 12 | `limp_loop` | asymmetric dragging stride | 1.2–2.4 s | yes | works mirrored for either leg |
| 13 | `shutdown_slump` | powered slump to a dead stance | 5.0 s | no | must sync to the 5 s turbine-deceleration SFX |
| 14 | `powerup_rise` | rise from slump to idle | 5.0 s | no | must sync to the matching restart SFX |
| 15 | `death_collapse_a` | forward collapse | 3–4 s | no | ends fully settled, no sliding |
| 16 | `death_collapse_b` | sideways-backward collapse | 3–4 s | no | pick A/B at runtime by impact direction |

Personality guidance: reverse-joint chassis (Flint, Basalt) get bird-like weight shifts;
Orogen leads with the shoulders in a piston gait; Craton's `idle_sway` is nearly still —
its menace is stillness. Limb-loss and death clips must respect the damage-zone mesh split
(Section 1.3) so detached geometry never visibly animates.

---

## 9. QA acceptance criteria — per asset

An asset ships only when every row below passes. Numbers here mirror `manifest.json` exactly.

### 9.1 Triangle budgets by LOD (maximums, per asset)

| Asset id | LOD0 | LOD1 | LOD2 | Textures |
|---|---|---|---|---|
| `mech-*` (all 13, incl. `vp_frame_shared_craton-x`) | 120,000 | 40,000 | 12,000 | 4K |
| `vp_cockpit_shared_interior` | 120,000 | 60,000 | 20,000 | 4K |
| `veh-dropbarge` | 80,000 | 28,000 | 9,000 | 4K |
| `veh-gun-monitor` | 80,000 | 28,000 | 9,000 | 4K |
| `vp_prop_tideflats_hull-carcass` | 70,000 | 24,000 | 8,000 | 2K |
| `vp_vehicle_shared_ore-crawler` | 60,000 | 20,000 | 6,000 | 2K |
| `veh-polar-train-engine` | 60,000 | 20,000 | 6,000 | 2K |
| `vp_struct_polar_cracking-tower` | 50,000 | 16,000 | 5,000 | 2K |
| `veh-hover-skiff` | 45,000 | 15,000 | 5,000 | 2K |
| `veh-apc-ferric` | 45,000 | 15,000 | 5,000 | 2K |
| `veh-polar-train-command-car` | 45,000 | 15,000 | 5,000 | 2K |
| `veh-polar-train-flak-car` | 45,000 | 15,000 | 5,000 | 2K |
| `vp_prop_arcology_arcology-podium` | 40,000 | 14,000 | 4,000 | 2K |
| `vp_prop_arcology_arcology-mid` | 35,000 | 12,000 | 3,500 | 2K |
| `vp_prop_arcology_arcology-crown` | 35,000 | 12,000 | 3,500 | 2K |
| `prop-popup-turret` | 30,000 | 10,000 | 3,000 | 2K |
| `vp_struct_shared_relay-pylon` | 25,000 | 9,000 | 2,500 | 2K |
| `prop-arcology-skybridge` | 20,000 | 7,000 | 2,000 | 2K |
| `prop-drain-junction` | 20,000 | 7,000 | 2,000 | 2K |
| `prop-drain-curve` | 14,000 | 5,000 | 1,500 | 2K |
| `prop-drain-straight` | 12,000 | 4,000 | 1,200 | 2K |

The cockpit renders LOD0 essentially always; its LOD1/LOD2 exist only for the chase-cam and
menu-garage views. Distant arcology and refinery silhouettes beyond LOD2 range are handled by
engine-side impostors, not additional LODs.

### 9.2 Texture acceptance

- **4K set** (mechs, cockpit, dropbarge, gun monitor): basecolor 4096 ETC1S, ORM 4096 ETC1S,
  normal 4096 UASTC, emissive up to 2048 where used. **2K set** (everything else): same maps
  at 2048, emissive up to 1024.
- All maps KTX2/Basis, full mip chains, embedded in the GLB.
- Normal maps: MikkTSpace, glTF/OpenGL +Y green channel.
- Texel density: ≥ 512 px/m hero surfaces at 4K; ≥ 256 px/m at 2K; no visible stretching at
  the closest gameplay camera distance.
- Mechs: both livery sets (compact/, directorate/) complete and channel-identical except
  basecolor and emissive.
- Zero readable text or logos in any channel, any map, any livery.

### 9.3 Rig checks (mechs; node checks apply to all articulated assets)

- Scale applied, 1 unit = 1 m; +Y up; front faces +Z; root node at ground origin between the feet.
- Bone naming: `root, pelvis, spine_twist, chest, head, shoulder_l/r, elbow_l/r, wrist_l/r,
  hip_l/r, knee_l/r, ankle_l/r, toe_l/r`.
- `spine_twist` rotates independently of the pelvis through the full per-chassis arc with no
  mesh tearing: Lights ±110°, Mediums ±90°, Heavies ±70°, Assaults ±55°.
- Knees bend the correct direction — explicitly verify the reverse-joint/digitigrade chassis
  (Flint, Basalt) after auto-rig; auto-riggers routinely invert them.
- Skinning: max 4 influences per vertex, weights normalized, zero orphan vertices.
- Damage-zone primitives present and named (`GEO_head/ct/lt/rt/la/ra/ll/rl`, `GEO_shield` on
  Halite) with capped seam interiors; each shears off cleanly with its child hardpoints.
- Hardpoint sockets present, named `socket_hp_<e|b|m|u><index>` matching the chassis loadout
  (e.g. Skarn: `socket_hp_b1`, `socket_hp_e1`, `socket_hp_m1`), plus `socket_cockpit_cam`,
  `socket_eject` (head), and `socket_foot_l` / `socket_foot_r` for footfall FX and decals.
- Stress poses pass without collapse or major interpenetration: deepest crouch, full twist
  both directions, both arms raised to max elevation, `legloss_stumble` extremes.
- All 16 clips present (Section 8), exact names, correct loop flags, no root drift.

### 9.4 Export checks

- GLB, Draco level 7 (position 14-bit, normal 10-bit, UV 12-bit), KTX2 embedded.
- glTF validator: zero errors, zero warnings that touch geometry, skinning, or textures.
- File-size budgets: mech ≤ 18 MB; cockpit ≤ 20 MB; 4K vehicle ≤ 12 MB; 2K vehicle ≤ 8 MB;
  prop ≤ 5 MB; kit piece ≤ 3 MB. Priority-1 assets combined (Skarn + Gabbro + cockpit) must
  stay ≤ 50 MB — they ride inside the < 150 MB initial payload.
- ≤ 2 materials (draw calls) per asset — one opaque PBR, one optional emissive/glass.
- Loads and animates in the engine asset viewer at 60 fps on the RTX-3060-class reference
  machine at 1440p, alone and in a 12-instance stress row.

### 9.5 Art-direction and originality gate (every asset, final sign-off)

- Silhouette re-check at 64 px against the roster description.
- Two-reviewer originality pass on the finished, textured asset (not just the raw seed):
  if either reviewer can name an existing franchise design it evokes, it goes back to
  Stage 2 with a new seed. No exceptions, hero assets included.
- Faction read: Compact assets read patched-and-proud; Directorate assets read corporate,
  uniform, gunmetal-and-amber. A player must tell the side from the paint alone.
- Biome sanity: the asset's wear story matches where it deploys (salt bleaching on Halite
  Flats units, ice sheathing on polar assets, marine rust on Storm Coast assets).

---

## 10. Priorities and milestone mapping

- **Priority 1 (M0/M1):** `vp_frame_shared_skarn` (player starter), `vp_frame_shared_gabbro` (M0 enemy),
  `vp_cockpit_shared_interior` (default view + startup litany). These unblock the vertical slice.
- **Priority 2:** the remaining Op1–Op3-facing roster and props — Flint, Pumice, Chert,
  Halite, Basalt, Dolerite, Corundum, dropbarge, ore-crawler, hover skiff, APC Ferric,
  pop-up turret, relay pylon, beached hull carcass.
- **Priority 3:** late-campaign content — Orogen, Batholith, Craton, Craton-X, cracking
  tower, the polar train set, the gun monitor, the arcology kit, the storm-drain kit.

Work priority 1 to full ship quality before starting priority 2; a finished Skarn is worth
more than four half-finished chassis. Within a priority band, mechs before props.
