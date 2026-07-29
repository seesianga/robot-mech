# Campaign runtime config schema (content/campaign/mNN.json)

Engine-facing runtime configs for campaign stages 4–24. Each design document in
`content/missions/<designFile>.json` is translated into ONE runtime config that the
generic `CampaignMission` engine class executes. The design doc stays the narrative
source of truth; the runtime config is the playable layout.

## Coordinate system & world contract

- Every map is a 2400×2400 heightfield centered on (0,0). Keep ALL coordinates within
  **±520** on both axes.
- Positions are `[x, z]` pairs (y is derived from terrain height).
- The player cold-starts at `spawn` and is helpless for ~13 s (boot litany): the nearest
  **alerted** hostile must start ≥ 420 m away; patrol (non-alerted) hostiles ≥ 300 m.
- Typical engagement range is 300–550 m. A full map crossing is ~1000 m ≈ 75 s at cruise.
- Mission pacing target: 5–6 steps, 6–12 minutes, 6–14 total enemies, ramping with op.

## Map ids (per-biome terrain built in engine)

| map | biome | ops | notes |
|---|---|---|---|
| `salt` | halite_flats | Op 2 (m04–m07) | blinding flat white pan, mirage haze, `heatMult: 0.8` |
| `karst` | karst_highlands | Op 3 (m08–m11) | stone pillars & dolines, tight sightlines, dusk |
| `polar` | polar_refineries | Op 4 (m12–m14) | ice sheet, refinery glow, aurora night, `heatMult: 1.1` |
| `storm` | storm_coast | Op 5 (m15–m17) | dark rain squall coast, `heatMult: 1.15` |
| `arcology` | vell_arcology | Op 6 (m18–m21b) | city blocks + canyon streets (buildings collide) |
| `anchor` | spire_anchor | m21a, Op 7 (m22–m24) | vast steel anchor plate, stormwall gloom |

## Top-level config

```jsonc
{
  "id": "m04",                     // stage id: m04..m24 ("m21a"/"m21b" for the branch)
  "designFile": "m04_white_static",// design JSON basename in content/missions/
  "stage": 4,                      // 4..24
  "branch": "a",                   // ONLY on m21a/m21b ("a"|"b"); omit elsewhere
  "title": "WHITE STATIC",         // uppercase mission title
  "map": "salt",
  "spawn": { "x": -420, "z": 380, "yaw": 2.4 },   // yaw radians; 0 faces +z, PI faces -z
  "playerMech": "skarn",           // see chassis ramp below
  "heatMult": 0.8,                 // optional; omit for 1.0
  "extract": [430, -390],          // final extraction point (used by the "extract" step)
  "allies": [                      // optional fireteam (see roster below)
    { "callsign": "Sable", "def": "flint", "pos": [-400, 340] }
  ],
  "structures": [                  // optional destructible/protectable objects
    { "id": "pylon_aster", "name": "Pylon Aster", "kind": "pylon", "pos": [-260, -120], "hp": 140 }
  ],
  "artillery": { "fromStep": 2, "everySec": 10, "damage": 10, "radius": 30 }, // optional stale-coord barrage from step index (0-based) onward
  "timedVO": [ { "atSec": 35, "trigger": "on_heat_advisory" } ],              // optional mission-clock VO
  "playerWoundVO": [ { "frac": 0.5, "trigger": "on_player_wound_50" } ],      // optional: fires once as the PLAYER's remaining hull fraction drops below frac
  "steps": [ /* see step vocabulary */ ]
}
```

## Structures

`kind` ∈ `pylon` (tall lattice mast, topples) | `mast` (sensor tower, topples) |
`tank` (fuel/coolant tank, crushes) | `bunker` (low blockhouse, crushes) |
`building` (arcology block, crushes) | `gate` (checkpoint gate, crushes) |
`crawler` (vehicle hulk, crushes). HP guidance: pylon/mast 120–160, tank 60–90,
bunker 200–260, building 240–320, gate 100–140, crawler 80–120.
Structures referenced by `destroy`/`defend` steps MUST exist in `structures`.
Space multi-target structures ≥ 250 m apart so the mission reads as legs of a journey.

## Fireteam roster (allies)

- **Sable** — `flint` (25 t recon). Available m04+.
- **Tremor** — `basalt` (60 t heavy). Available m06+.
- **Vireo** — `chert` (40 t fire support). Available m08+.

Use the design doc's `allies` list. Allies spawn near the player, follow the player,
and fight hostiles on their own. They can die (mission continues unless an
`escort` step protects them — never make a fireteam member the escort subject).

## Enemy spawns

```jsonc
{ "def": "gabbro", "pos": [330, -260], "alerted": true,
  "waypoints": [[260,-40],[150,-180]],        // optional patrol rail (omit for default box)
  "name": "Halite Response Lance",            // optional callsign override
  "yieldFrac": 0.25 }                          // optional: powers down below this hull fraction
```

Chassis roster (Directorate uses all of them): flint 25t, pumice 30t, skarn 35t,
chert 40t, halite 45t, gabbro 55t, basalt 60t, dolerite 70t, corundum 75t,
orogen 80t, batholith 90t, craton 100t.

Map exotic design units to the nearest chassis: turrets/drones → `flint`/`pumice`
(name them "Sentry Drone" etc. — or make static turrets `structures`), hover skiffs →
`pumice`, BVR missile carriers → `chert`/`dolerite`, command units → `corundum`,
Rauk's duel machine → `batholith` ("Ironline — Col. Rauk"), Sol's prototype →
`craton` ("Craton-X — Marshal Sol").

Op difficulty ramp (approx. simultaneous hostiles): Op2 2–3 · Op3 3–4 · Op4 3–4 ·
Op5 4–5 · Op6 4–5 · Op7 4–6 (m24 is a pure 1-v-1 duel).

Player chassis ramp: m04–m05 `skarn` · m06–m09 `gabbro` · m10–m14 `basalt` ·
m15–m17 `corundum` · m18–m20 `orogen` · m21a/m21b–m23 `batholith` · m24 `craton`.

## Step vocabulary

Common fields on every step: `kind`, `title` (UPPERCASE HUD objective), `sub`
(one-line instruction), optional `vo` (design voTrigger name played when the step
begins), optional `doneVO` (played when it completes), optional `spawns`
(EnemySpawn[] created when the step begins).

1. `reach` — `{ "at": [x,z], "radius": 45 }` walk to the point.
2. `destroy` — `{ "targets": ["structId", ...], "killAll": false, "perTargetVO": {"structId": "trigger"} }`
   Destroy every listed structure (weapons fire damages them). `killAll: true` also
   requires this step's `spawns` to all be dead. `targets` may be `[]` with
   `killAll: true` for a pure kill step.
3. `defend` — `{ "protect": "structId", "seconds": 90, "waves": [[spawn,...],[...]], "waveGap": 25 }`
   Waves spawn alerted, `waveGap` seconds apart. Hostiles within 160 m grind the
   structure's HP; if it dies the mission FAILS. Completes when the timer expires
   AND every spawned wave is dead.
4. `hold` — `{ "at": [x,z], "radius": 120, "seconds": 60, "waves": [[...]] }`
   Timer only counts down while the player is inside the circle. Waves spawn at
   even timer fractions.
5. `survive` — `{ "seconds": 90, "waves": [[...]], "waveGap": 30 }` — endure; timer
   always runs; completes at zero even if hostiles remain.
6. `escort` — `{ "subject": "Convoy Crawler", "subjectDef": "halite", "from": [x,z], "route": [[x,z],...], "ambushes": [{"atLeg": 1, "spawns": [...]}] }`
   Spawns a friendly NPC walker that follows the route (~40% throttle) and stops at
   the end. Mission FAILS if it dies. `atLeg` = 0-based route index reached.
7. `duel` — `{ "spawn": {single EnemySpawn}, "woundVO": [{"frac": 0.75, "trigger": "on_sol_wound_25"}, ...] }`
   One boss machine; `woundVO` fires as ITS remaining hull fraction drops below
   each `frac` (list high→low). Completes on kill.
8. `extract` — `{}` — walk to the config's `extract` point; ALWAYS the final step.
   Default `doneVO` is `on_complete` (m24's branch endings are engine-handled).

## VO rules

- `vo` / `doneVO` / `perTargetVO` / `timedVO.trigger` / `woundVO.trigger` values MUST
  exactly match a `trigger` string in the design file's `voTriggers` array
  (e.g. `"on_objective:obj_2"`). The engine looks up speaker/text/futz there and
  plays the pre-generated audio file for that line. Never invent VO text.
- Do not reference `on_start` (the boot litany is automatic).
- Spread the design's triggers across the steps so nearly every trigger is heard:
  briefing radio call = first step's `vo` (usually `on_start_brief`), per-objective
  lines on the matching steps, wave warnings on `spawns`-bearing steps,
  `on_complete` on the extract step.
- Kryce propaganda/broadcast triggers and CAIRN advisories fit `timedVO`.

## Fail conditions (engine-global)

Player death always fails. `defend` structure loss and `escort` subject loss fail.
Do not encode other fail conditions.

## Quality bar

- Steps must chain geographically (each step's action site 250–500 m from the last,
  extraction at the far side) so the mission travels across the map.
- No two simultaneous alerted spawns within 60 m of each other.
- Every structure/step id unique within the mission; ids are `snake_case`.
- The mission must be completable with the listed player chassis: never more than
  ~6 simultaneous hostiles, and at most one chassis ≥ 80 t alive at once before Op 6.
