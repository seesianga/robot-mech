# Veyra Prime — Mech Appearance Bible & Loadout-Accurate Prompts

Companion to `docs/tripo-prompt-library.md`. That handbook owns the **canonical bare-chassis**
prompts (§4) mirrored in `assets/tripo/manifest.json`. This document is additive:

- **Handbook §4 / manifest** = generic chassis prompts, weapons described loosely.
- **This document** = (a) the plain-language description of every robot for design, writing,
  and UI copy, and (b) **loadout-accurate prompts** where the equipped weapons are named as
  specific visible hardware. These are the prompts used by `scripts/gen_tripo_appearance.py`.

## Hard constraints on every prompt below

| Constraint | Value | Why |
|---|---|---|
| Max prompt length | **1024 characters** | Tripo3D API cap — longer submissions are rejected |
| Style suffix | 521 chars, verbatim, mandatory | art-direction + originality clause |
| Body budget | **≤ 501 chars** | 1024 − 521 suffix − 2 for the `, ` join |

Every prompt in this file is pre-assembled and verified under the cap. `gen_tripo_appearance.py`
re-checks on every run and refuses to submit an over-length prompt. If you edit a prompt, keep
it under budget — that is the constraint that shapes the terse phrasing here.

The `<!-- tripo:mech-xxx -->` comment above each fence is the machine-readable asset ID the
generator parses. Do not remove them.

---

## 1. Shared style suffix (verbatim, 521 chars)

Already appended to every prompt below. Reproduced for reference only:

```
industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

**Livery modifiers** — for 2D art only. Do **not** append these to a Tripo prompt; they would
blow the character budget, and liveries ship as texture sets on one shared mesh (handbook §4).

| Faction | Modifier text |
|---|---|
| Free Veyran Compact (player) | `mismatched salvaged panels from three machines on one chassis, hand-painted geometric unit marks, heavy weld seams and rust streaks` |
| Karst Directorate (enemy) | `clean gunmetal grey with hazard-amber striping, maintained factory finish, crisp geometric stencil blocks, minimal wear` |

The no-text rule survives both. Unit marks and stencils are **geometric shapes only** — no
letterforms, no numerals, no readable glyphs.

---

## 2. Weapon hardware lexicon

Whenever a weapon appears in a prompt, describe it with the **short form**. The long form is
for design docs and 2D art briefs where there is no character budget.

| Weapon | Class / tons | Short form (use in prompts) | Long form (2D art / docs) |
|---|---|---|---|
| Blaze Laser S | energy, 1 t | `small flush laser emitter` | small flush laser emitter, single recessed lens in a shallow armored bezel, two short cooling ribs |
| Blaze Laser M | energy, 2 t | `finned medium laser collar` | medium laser emitter, recessed lens in a finned collar, four cooling ribs along the housing |
| Blaze Laser L | energy, 5 t | `stepped-shroud laser with heat fins` | long laser barrel with a stepped focusing shroud and a stacked heat-fin block behind the lens |
| Pulse Array | energy, 3 t | `three stacked emitter apertures in one housing` | rectangular pulse housing with three small stacked emitter apertures behind a slotted guard |
| Particle Lance | energy, 7 t | `capacitor-ringed coil barrel with cooling fins` | long slender coil barrel wrapped in ring capacitors, deep cooling fins, insulated cable trunk running back into the torso |
| Scattergun | ballistic, 5 t | `wide-bore flared shotgun muzzle and boxy shell drum` | wide-bore short shotgun barrel with a flared muzzle choke and a boxy shell drum under the receiver |
| Autocannon 40 | ballistic, 6 t | `stubby four-barrel revolver-cluster autocannon` | short revolver-cluster autocannon with four stubby barrels and a linked ammo chute |
| Autocannon 80 | ballistic, 9 t | `heavy autocannon with slotted muzzle brake` | single heavy autocannon barrel with a slotted muzzle brake and a side ammo feed box |
| Autocannon 120 | ballistic, 12 t | `massive autocannon with deep muzzle brake and external belt feed` | massive single autocannon barrel with a deep muzzle brake and an external belt feed running into the shoulder |
| Gauss Driver | ballistic, 14 t | `gauss rail spine with ring coils and capacitor blister` | long rail spine with paired accelerator rails, ring coils, and a capacitor blister at the breech |
| Rocket Pod 8 | missile, 3 t | `eight-cell rocket pod, two-by-four tube face` | boxy eight-cell rocket pod, two-by-four tube face, hinged blast lid |
| Rocket Pod 16 | missile, 6 t | `sixteen-cell rocket silo, four-by-four tube face` | sixteen-cell rocket silo block, four-by-four tube face |
| Swarm Rack 10 | missile, 5 t | `ten-tube honeycomb swarm rack with corner seeker head` | ten-tube swarm rack with an angled honeycomb face and a small seeker head on the corner |
| Swarm Rack 20 | missile, 9 t | `twenty-tube honeycomb swarm rack` | twenty-tube swarm rack with a wide honeycomb face and a corner seeker head |
| ECM Veil | utility, 2 t | `flat ECM panel with dense antenna comb` | flat rectangular emitter panel with a dense antenna comb |
| Beacon Tagger | utility, 1 t | `gimballed designator pod` | slim gimbal-mounted designator pod with a small lens turret |
| Coolant Flush Pod | utility, 1 t | `strapped cylindrical coolant canister` | cylindrical coolant canister clamped to the hip with quick-release straps |
| Sensor Mast | utility, 2 t | `branching antler-like sensor mast` | tall branching sensor mast with an antler-like dish array |
| Smoke Discharger | utility, 1 t | `four angled smoke tubes on a hip bracket` | cluster of four short smoke tubes angled outward on a hip bracket |

**Mount conventions:** arm-end = primary ballistic or energy; forearm-top = secondary energy;
shoulder pauldron = missile; upper back = missile silos; head/crown = utility; hip = utility
and ammo.

---

## 3. FEATURED — Halite as currently requisitioned

**Halite** — Medium, 45 t, brawler. 81 km/h, 100° torso twist, no jump jets, 11 heat sinks.
Hardpoints: ballistic / ballistic / energy. Requisition price 5,400 scrip.

**Equipped:** Autocannon 40 · Scattergun · Blaze Laser M — 13 tons of weapons, all three
hardpoints filled, and the three of them describe one very specific animal.

### Description

The Halite is the roster's close-quarters bully and it is built like a door. Where Gabbro
stands upright like a soldier, Halite settles — knees slightly bent, shoulders enormously
wide, chest armor stacked in overlapping horizontal slabs like a loading ramp folded onto a
torso. It is only 10 metres tall but reads heavier than that because almost all of its mass
is carried forward and low. The head is barely a head: a short armored block set deep between
the shoulder yokes with a single narrow vision band, deliberately hard to hit.

Its signature is the **left forearm riot shield** — a rectangular slab plate, taller than the
arm it is bolted to, with a rolled edge lip and its own separate scarring history. It is the
most-repaired surface on the machine: fresh weld beads over old dents, one corner sheared flat
and re-plated with a mismatched panel. On a Compact machine that shield is the storytelling
piece — you can read the mech's whole career off it.

The equipped loadout doubles down on the brawler read. The **Autocannon 40** occupies the
right arm as a stubby four-barrel revolver cluster with a fat ammo chute curling into the
shoulder — a weapon with no reach and a very high rate of fire. The **Scattergun** is mounted
through the left arm, its wide flared muzzle protruding through a firing port cut in the riot
shield itself, so the shield and the shotgun are one assembly: it hides behind the plate,
walks into your face, and fires through its own cover at 180 metres. The **Blaze Laser M**
sits on the right shoulder as a finned emitter collar, canted slightly inboard — the only
part of the loadout with any range at all, and visibly the afterthought.

Silhouette test at 64 px: **wide flat-topped rectangle with one asymmetric slab on the left
side.** Nothing else on the roster has that profile.

### Prompt — Halite, AC40 + Scattergun + Blaze Laser M

<!-- tripo:mech-halite -->
```
squat 10-meter brawler mech, 45 tons, very wide shoulders, chest armor in stacked horizontal slabs, short armored head with one narrow vision band sunk between the shoulder yokes, tall rectangular riot-shield plate on the left forearm with a wide-bore flared shotgun muzzle and boxy shell drum firing through a port cut in the shield, right arm a stubby four-barrel revolver-cluster autocannon with a linked ammo chute into the shoulder, finned medium laser collar on the right shoulder, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

> One sanctioned tension: the suffix says `symmetrical`, and this build is not — the
> shield-plus-shotgun assembly is a deliberate left-side asymmetry. Keep `symmetrical` in the
> string anyway; it governs the *frame* (legs, hips, shoulder yokes) and stops the generator
> warping the skeleton. If a seed returns a mirrored shield on both arms, reroll rather than
> editing the string.

---

## 4. Full roster — description + loadout-accurate prompt

Loadouts shown are each chassis's **default** requisition fit. To re-cut a prompt for another
build, swap in a short-form phrase from §2 and re-check the character budget.

### 4.1 Flint — Light, 25 t, recon — 2,750 scrip
118 km/h · 130° twist · **jump jets** · 10 heat sinks · energy / energy / utility
**Fit:** Blaze Laser S ×2 · Sensor Mast

The fastest thing the Compact owns and the least able to take a hit. Flint is all leg: tall
reverse-joint digitigrade limbs with the mass hung high and a torso that is barely more than
a single-pilot canopy on a swivel. The canopy is a narrow angled glasshouse, closer to a
crane cab than a cockpit, and it sits exposed — this machine survives by not being where the
shooting is. Its silhouette is owned by the branching sensor mast on the right shoulder, an
antler-like tangle of dishes and whip antennas that is deliberately oversized and deliberately
fragile-looking. Calf-mounted jump-jet thrusters give it a cocked, ready-to-spring stance even
at rest. Two small laser emitters on the forearms are almost apologetic. Silhouette read:
**thin vertical line with antlers.**

<!-- tripo:mech-flint -->
```
lean 8-meter bipedal scout mech, 25 tons, reverse-joint digitigrade legs, narrow angled single-pilot canopy, a tall branching antler-like sensor mast on the right shoulder, whip antennas, a small flush laser emitter on each forearm, compact jump-jet thrusters on the calves, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.2 Pumice — Light, 30 t, harasser — 3,300 scrip
108 km/h · 125° twist · no jump jets · 10 heat sinks · energy / missile / missile
**Fit:** Blaze Laser S · Rocket Pod 8 ×2

Pumice is the ugly one, on purpose. Its armor is not smooth plate but a rough, pitted,
vesicular surface like cooled volcanic rock — ablative material that is *meant* to erode, so
the machine looks half-eaten before the first shot lands. Proportions are a sprinter's:
forward lean, long stride, small head reduced to a single horizontal visor slit with no
protrusions to snag. Two boxy eight-cell rocket pods ride the shoulders like square
epaulettes, blast lids hinged open, and a single small laser fills the chest hardpoint. No
jump jets — Pumice goes around, not over. Silhouette read: **hunched runner with two boxes on
its shoulders.**

<!-- tripo:mech-pumice -->
```
light 9-meter bipedal mech, 30 tons, rough pitted vesicular ablative armor like cooled volcanic stone, forward-leaning sprinter stance, small head with a single horizontal visor slit, an eight-cell rocket pod with a two-by-four tube face and hinged blast lid on each shoulder, a small flush laser emitter on the chest, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.3 Skarn — Light, 35 t, skirmisher — 3,850 scrip — **THE STARTER** ✅ generated
97 km/h · 120° twist · **jump jets** · 11 heat sinks · ballistic / energy / missile
**Fit:** Autocannon 40 · Blaze Laser M · Rocket Pod 8

The first mech the player ever steals, so it has to look like a machine somebody could love.
Skarn's identity is its cockpit: a wedge of flat armor plates that resolves, from the side,
into a **raptor skull** — a forward-thrust brow, a sunken sensor band where the eye would be,
and a tapering jawline. It is not a decorative animal head; it is a hard-surface shape that
happens to read as predatory, which is exactly the trick. Below it the frame is lean and
mobile, one arm ending in a light four-barrel autocannon, the other forearm carrying a finned
laser collar, and one rocket pod on the left shoulder. The prominent jump-jet nacelles on the
lower legs are the machine's promise: it can leave. Silhouette read: **angled beak-head over a
light frame with calf pods.**

<!-- tripo:mech-skarn -->
```
agile 10-meter bipedal skirmisher mech, 35 tons, wedge cockpit of flat plates reading as a raptor skull with forward-thrust brow and sunken sensor band, right arm a stubby four-barrel revolver-cluster autocannon with linked ammo chute, left forearm a finned medium laser collar, an eight-cell rocket pod with a two-by-four tube face on the left shoulder, prominent jump-jet nacelles on the lower legs, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.4 Chert — Medium, 40 t, fire support — 4,800 scrip
86 km/h · 105° twist · no jump jets · 11 heat sinks · missile / missile / energy / utility
**Fit:** Rocket Pod 16 ×2 · Blaze Laser S · Beacon Tagger

Chert is a mortar with legs and it does not pretend otherwise. The whole machine crouches —
hips low, knees permanently bent, feet unusually wide and flat for a firing platform — because
everything above the waist is dedicated to carrying two enormous sixteen-cell missile silo
blocks across the upper back. Those racks are the design: four-by-four tube faces angled
skyward, deep enough that the torso looks like it is wearing a wall. Thick slab forearm
guards protect a pilot who is not supposed to be in melee range, a single small laser handles
anything that gets close anyway, and a gimballed designator pod on the head does the actual
work of aiming for everyone else. Silhouette read: **low crouch under a tall square back.**

<!-- tripo:mech-chert -->
```
10-meter fire-support mech, 40 tons, low crouched stance with permanently bent knees and wide flat stabilizing feet, two sixteen-cell rocket silos with four-by-four tube faces angled skyward across the upper back, thick slab forearm guards, a small flush laser emitter on the chest, a gimballed designator pod on the head, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.5 Halite — Medium, 45 t, brawler — 5,400 scrip
See **§3** for the full description and the currently-equipped prompt.

### 4.6 Gabbro — Medium, 55 t, workhorse — 6,600 scrip ✅ generated
76 km/h · 100° twist · no jump jets · 12 heat sinks · energy / energy / ballistic / missile
**Fit:** Blaze Laser M · Blaze Laser S · Autocannon 80 · Rocket Pod 8

The face of the war on both sides. Gabbro is the machine on the recruitment poster and the
machine in the enemy patrol, and it works because it is the most *ordinary* design on the
roster: upright, symmetrical, classic soldier proportions, head where a head belongs, arms
where arms belong. Nothing is exaggerated. Its armor is broad flat planes with clean panel
breaks — easy to stamp, easy to field-repair, easy to bolt someone else's spare plate onto,
which is why every Compact Gabbro looks like a quilt. One forearm carries a finned laser
collar, the other a heavy single-barrel autocannon with a side feed box, a small laser sits
in the chest, and a single eight-cell rocket hatch caps the right shoulder. It is
dependable-looking on purpose: heroic silhouette, zero flourish. Silhouette read: **the
default mech** — which is exactly its job.

<!-- tripo:mech-gabbro -->
```
balanced upright 11-meter workhorse mech, 55 tons, classic soldier proportions, broad flat armor planes with clean panel breaks, left forearm a finned medium laser collar, right arm a heavy autocannon with slotted muzzle brake and side ammo feed box, small flush laser emitter set in the chest, an eight-cell rocket pod with a two-by-four tube face capping the right shoulder, dependable heroic silhouette, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.7 Basalt — Heavy, 60 t, line-breaker — 7,800 scrip
70 km/h · 90° twist · no jump jets · 13 heat sinks · ballistic / ballistic / energy / energy
**Fit:** Autocannon 80 ×2 · Blaze Laser M ×2

Basalt is where the roster's geology theme stops being a naming convention and becomes
geometry. Its armor is built from **interlocking hexagonal columns** — the columnar-jointing
pattern of cooled basalt, rendered as stacked hex prisms across the chest, shoulders, and
thighs, each column a separately replaceable block. The effect is a machine that looks
quarried rather than manufactured. It stands with a brooding forward lean on thick digitigrade
legs, both arms terminating in heavy autocannons with slotted muzzle brakes and side feed
boxes, and a finned laser collar tucked above each gun. Four weapons, all forward, no
subtlety: this thing exists to walk into a firing line and stay there. Silhouette read:
**broad hexagonal mass leaning forward, twin barrels.**

<!-- tripo:mech-basalt -->
```
60-ton 12-meter heavy line-breaker mech, armor plates styled as interlocking hexagonal basalt columns across the chest, shoulders, and thighs, each column a separate replaceable block, brooding forward lean, thick digitigrade legs, both arms ending in a heavy autocannon with slotted muzzle brake and side ammo feed box, a finned medium laser collar mounted above each gun, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.8 Dolerite — Heavy, 70 t, missile boat — 9,100 scrip
63 km/h · 85° twist · no jump jets · 13 heat sinks · missile ×4 / energy
**Fit:** Swarm Rack 10 ×2 · Rocket Pod 16 ×2 · Blaze Laser S

Seventy tons of launch tube. Dolerite carries **tall vertical banks of missile cells rising off
both shoulders like cathedral organ pipes** — angled honeycomb-faced swarm racks outboard with
their little seeker heads on the corners, four-by-four rocket silo blocks inboard — and the
armored head is a small dark wedge sunk down *between* them, almost swallowed. The stance is
braced rather than aggressive: legs planted wide, hips squared, and two rear stabilizer spurs
extending from the lower back to absorb salvo recoil. A single small laser on the chest is
purely a last resort. Everything about the machine says *stand still and empty the sky.*
Silhouette read: **two vertical towers with a mech hiding underneath.**

<!-- tripo:mech-dolerite -->
```
70-ton 12-meter missile-artillery mech, both shoulders carrying tall vertical launch-tube banks like cathedral organ pipes, an outboard ten-tube honeycomb swarm rack with corner seeker head plus an inboard sixteen-cell rocket silo with four-by-four tube face on each shoulder, small armored wedge head sunk low between the racks, small flush chest laser, wide braced stance with rear stabilizer spurs, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.9 Corundum — Heavy, 75 t, command — 9,750 scrip
61 km/h · 90° twist · no jump jets · 14 heat sinks · energy / energy / ballistic / missile / utility
**Fit:** Particle Lance · Blaze Laser M · Autocannon 80 · Swarm Rack 10 · ECM Veil
**Narrative:** Mara Ekene's old chassis. Rauk's *Corundum-V* is a livery/emissive variant.

The officer's machine, and the only one on the roster with any elegance in it. Corundum is
taller and narrower than its tonnage suggests, with a longer neck and a deliberately
**asymmetric sensor crown** — a fan of dishes, blades, and comb antennas that rises higher on
the left than the right and gives the head an unmistakable tilted profile at any range. That
asymmetry is the whole point: on a battlefield of identical silhouettes, the command mech is
the one you can pick out, which is both its function and its risk. The left arm is a particle
lance — a long slender coil barrel ringed with capacitors and deep cooling fins, with an
insulated cable trunk running visibly back into the torso — and the right is a conventional
heavy autocannon. A swarm rack sits on the right shoulder; a flat ECM panel with a dense
antenna comb is bolted to the left. Battle-worn, but the wear is *old*; this machine has been
repaired by people who cared. Silhouette read: **tilted crown over a narrow tall torso.**

<!-- tripo:mech-corundum -->
```
75-ton 13-meter command mech, tall narrow torso, asymmetric sensor crown of dishes, blades, and comb antennas rising higher on the left, left arm a long slender coil barrel ringed with capacitors and deep cooling fins with an insulated cable trunk into the torso, right arm a heavy autocannon with slotted muzzle brake, finned medium laser collar on the left shoulder, ten-tube honeycomb swarm rack on the right, flat ECM panel with dense antenna comb, battle-worn officer silhouette, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.10 Orogen — Assault, 80 t, juggernaut — 11,600 scrip
55 km/h · 75° twist · no jump jets · 14 heat sinks · ballistic ×3 / missile
**Fit:** Autocannon 120 · Autocannon 80 · Autocannon 40 · Rocket Pod 8

Orogen does not stand up straight and it never has. The chassis is **forward-hunched, with a
gorilla's weight distribution** — vast shoulders, arms so heavy they hang below the hipline,
and a back curved by the load. Both arms are piston-driven slabs ending in guns: the left in a
massive 120 barrel with a deep muzzle brake and an external belt feed climbing visibly into
the shoulder, the right in a heavy 80. A four-barrel revolver cluster is chin-mounted under
the chest and a rocket pod fills the right shoulder. The head is not a head so much as a small
armored eye-slit set deep in the chest cavity, protected by the mass of the torso around it.
The gait sells it: exposed hip and knee pistons the size of tree trunks, every step a decision.
Silhouette read: **knuckle-dragging wedge, arms lower than the waist.**

<!-- tripo:mech-orogen -->
```
80-ton 13-meter juggernaut mech, forward-hunched gorilla posture with vast shoulders and arms hanging below the hipline, left arm a massive autocannon with deep muzzle brake and external belt feed climbing into the shoulder, right arm a heavy autocannon with slotted muzzle brake and side feed box, chin-mounted four-barrel revolver-cluster autocannon under the chest, eight-cell rocket pod on the right shoulder, armored eye-slit head deep in the chest cavity, oversized hip and knee pistons, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.11 Batholith — Assault, 90 t, siege — 13,050 scrip
49 km/h · 70° twist · no jump jets · 15 heat sinks · ballistic ×2 / energy ×2 / missile ×2
**Fit:** Gauss Driver ×2 · Blaze Laser M ×2 · Rocket Pod 8 ×2
**Narrative:** Director Kryce's guard Batholiths are livery variants of this asset.

A fortress that was asked to walk and grudgingly agreed. Batholith's defining feature is the
pair of **gauss rail spines mounted over the shoulders like dorsal fins** — long paired
accelerator rails, ring coils spaced down their length, capacitor blisters swelling at the
breech, extending well past the silhouette front and back. Feeding them are two huge
cylindrical drum magazines slung on the hips, which give the mech a wide-bottomed,
bottom-heavy profile no other chassis has. Everything else is bulk: slab plating in
overlapping courses like masonry, a deep-set head, finned laser collars flanking the chest,
and a rocket pod on each shoulder cap. It moves at 49 km/h and is entirely unbothered by that.
Silhouette read: **fin-backed block with drums on its hips.**

<!-- tripo:mech-batholith -->
```
90-ton 14-meter siege mech, two long gauss rail spines over the shoulders like dorsal fins with paired accelerator rails, ring coils, and capacitor blisters at the breech extending past the silhouette front and back, two huge cylindrical drum magazines slung on the hips, slab armor in overlapping courses like masonry, deep-set head, a finned medium laser collar flanking each side of the chest, an eight-cell rocket pod on each shoulder cap, ponderous fortress mass, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.12 Craton — Assault, 100 t, apex — 14,500 scrip
44 km/h · 70° twist · no jump jets · 17 heat sinks · energy ×3 / ballistic ×2 / missile
**Fit:** Particle Lance · Blaze Laser L ×2 · Autocannon 80 ×2 · Rocket Pod 16

The heaviest thing that walks on Veyra Prime, and it is designed to be frightening while
standing still. Craton's torso is a **single monolithic slab** — not panelled, not sculpted, a
standing megalith with the barest suggestion of a seam, pierced by three energy cannon
apertures set in a row across the chest. There is no discernible neck and barely a head; the
sensor band is cut directly into the top edge of the slab. The legs are columns rather than
limbs, straight and enormous, and the arms are short by proportion because the torso does the
intimidating. A particle lance runs along the left arm, a long-barrelled laser with a stepped
focusing shroud on each shoulder, a heavy autocannon on the right arm and another under the
chest, and a sixteen-cell silo block across the upper back. Its 17 heat sinks show up as
visible radiator banks flanking the spine. Silhouette read: **a standing wall.**

<!-- tripo:mech-craton -->
```
100-ton 15-meter apex assault mech, monolithic slab torso like a standing megalith, three energy cannon apertures across the chest, sensor band cut into the slab's top edge, no neck, column legs, left arm a capacitor-ringed coil barrel with cooling fins, heavy autocannons on the right arm and under the chest with slotted muzzle brakes, a stepped-shroud laser with heat fins on each shoulder, sixteen-cell rocket silo across the upper back, radiator banks flanking the spine, terrifying stillness, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.13 Craton-X — boss variant, Marshal Sol's prototype
Same chassis, same rig, same animation set as Craton. Two additions and nothing else:
**glowing coolant lattice channels** cut across the torso slab as an authored emissive mask
(slow pulse driven in-engine, not baked), and **prototype test markings** painted as geometric
stencils only — the no-text rule is absolute, including here. It is the M24 duel boss; the
uniqueness lives in the duel AI, not in new geometry.

<!-- tripo:mech-craton-x -->
```
100-ton 15-meter apex assault mech, monolithic slab torso like a standing megalith, three energy cannon apertures set in a row across the chest, colossal straight column legs, glowing coolant lattice channels tracing across the torso slab, geometric prototype test stencil markings, terrifying stillness, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

### 4.14 Gabbro (Slagwolves patchwork) — enemy variant
`variantOf: mech-gabbro` in the manifest, but it ships as its own mesh because the geometry
actually differs: the right arm is **gone**, replaced by a crude oversized cannon welded
straight to the shoulder actuator with no proper mount. The Slagwolves are scavengers, not
soldiers, and their Gabbro reads as a stolen machine kept alive past the point of dignity —
mismatched plate in clashing colors, scorch marks nobody sanded out, scrap welded over holes.
It is the same silhouette as a Gabbro at 64 px, which is the point: you do not know which one
you are looking at until it is close. Silhouette read: **Gabbro, wrong arm.**

<!-- tripo:mech-gabbro-slagwolf -->
```
balanced upright 11-meter workhorse mech, 55 tons, classic soldier proportions, left forearm a finned medium laser collar, right arm replaced by a crude oversized welded autocannon, small flush chest laser, eight-cell rocket pod on the right shoulder, mismatched salvaged armor plates in clashing colors, heavy rust and scorch marks, welded scrap repairs, industrial military walking tank, hard-surface design, functional silhouette, angular composite armor plates with visible panel lines and fasteners, exposed hydraulic pistons and cable bundles at the knee and hip joints, antenna cluster, mining-world utilitarian aesthetic, weathered matte paint with edge chipping and rust streaks, no text, no logos, PBR materials, neutral A-pose, symmetrical, game-ready, plain background. Fully original design — do not imitate robots from any existing game, anime, or film franchise.
```

---

## 5. Silhouette separation matrix

The roster's design rule: **no two chassis may share a 64 px read.**

| Chassis | 64 px read | Owns |
|---|---|---|
| Flint | thin line with antlers | the sensor mast |
| Pumice | hunched runner, two shoulder boxes | pitted ablative texture |
| Skarn | beak-head, calf pods | the raptor cockpit |
| Chert | low crouch under a tall square back | the back wall of silos |
| **Halite** | **wide flat rectangle, one left-side slab** | **the riot shield** |
| Gabbro | the default mech | ordinariness |
| Basalt | forward-leaning hex mass, twin barrels | columnar hexagon armor |
| Dolerite | two vertical towers | organ-pipe launch banks |
| Corundum | tilted crown, narrow torso | asymmetry |
| Orogen | knuckle-dragger, arms below waist | the hunch |
| Batholith | fin-backed block, hip drums | dorsal rail spines |
| Craton | a standing wall | the monolith slab |

Closest collision risk is **Chert vs. Dolerite** (both back-heavy missile carriers). Separation
is enforced by stance — Chert crouches and is wide, Dolerite stands braced and is tall — and by
rack geometry: Chert's silos lie flat across the back, Dolerite's rise vertically off the
shoulders. If a Dolerite seed comes back crouching, reroll it.

Slagwolf is a deliberate exception: it *shares* Gabbro's read on purpose.

---

## 6. Generation — how these prompts are run

```bash
npm run tripomechs -- --dry-run     # parse + validate, no API calls, no credits
npm run tripomechs                  # generate every missing mech
npm run tripomechs -- --ids mech-halite
```

`scripts/gen_tripo_appearance.py` parses **this file** as its only prompt source, keyed on the
`<!-- tripo:… -->` markers. It is idempotent — any mech whose GLB already exists in
`assets/tripo/generated/` is skipped, so Skarn and Gabbro are never regenerated.

**Configuration — matches the existing 20 assets exactly.** Verified by reading the embedded
texture dimensions out of the shipped GLBs:

| Setting | Value | Evidence |
|---|---|---|
| model | `v3.1-20260211` | `TripoClient.MODEL_VERSION` |
| `texture_quality` | `detailed` | produces **4096×4096** Color/ORM/NormalGL — measured on all 20 existing GLBs |
| `pbr` | `true` | 3-map PBR set present in every GLB |
| `face_limit` | omitted | existing meshes land at 1.39M–1.49M tris, no cap |
| `auto_size` | `true` | real-world scale |
| `quad` / `compress` / `smart_low_poly` | `false` | full-detail triangles |

**The existing generation is 4K, not 8K.** All 20 GLBs measure 4096×4096 on every map, and
`manifest.json` declares `"textures": "4k"` for all 17 hero assets — so 4K is the intended
spec, not an accident. The generator therefore reproduces `detailed`/4K so the new mechs match
Skarn and Gabbro. Two higher tiers may exist but are **unverified against this account**:
`texture_quality: "extreme"` (reported by third-party API mirrors, +30 credits) and
`geometry_quality: "detailed"` (documented, never set by our client). Both are one-line
overrides — `--texture-quality extreme`, `--geometry-quality detailed` — but using either
means the new mechs will **not** match the two already generated.

- Run **4 seeds** per prompt and judge silhouette-first at 64 px (handbook §1.1–1.2).
- LOD0/1/2 budgets are 120k/40k/12k tris — Tripo output at ~1.4M tris is the **hi-poly source**
  for the retopo and normal-bake stages, never the shipped mesh.
