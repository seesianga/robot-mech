# Sovereign Ash: Nareth Protocol — Game Design Document

> Working title. All proper nouns require trademark clearance before publication.

## 1. Vision Statement

A premium desktop-browser, first-person heavy-walker combat simulator set on Nareth, a tidally locked industrial colony. The player commands 25–100 ton war machines from a physical cockpit, experiencing immense mass, dangerous heat, localized damage, tactical squad command, and cinematic combined-arms warfare.

**Core Fantasy:** You are not a superhero in a robot suit. You are the operator of a dangerous, heavy, heat-stressed industrial war machine whose every action has mechanical consequence.

## 2. Experience Pillars

| # | Pillar | Description |
|---|--------|-------------|
| 1 | MASS | Every step, turn, recoil, and structural failure communicates enormous weight |
| 2 | CONSEQUENCE | Armor loss, weapon destruction, heat, ammo, pilot decisions, squad survival, and salvage affect mission and campaign |
| 3 | TACTICAL EXPRESSION | Chassis, hardpoints, weapon groups, armor distribution, cooling, terrain, squad orders support multiple viable styles |
| 4 | COCKPIT PRESENCE | Diegetic displays, canopy reflections, warning lamps, vibration, audio occlusion, damage feedback |
| 5 | CINEMATIC CLARITY | Spectacle never hides targets, objectives, heat state, damage state, or critical warnings |
| 6 | ORIGINAL IDENTITY | Recognizable from a single silhouette, cockpit screenshot, musical cue, or radio exchange |

## 3. Target Platform

- **Primary:** Desktop browsers (Chrome, Edge, Firefox, Safari 18+)
- **Renderer:** WebGPU primary, WebGL2 fallback
- **Secondary:** Mobile hangar/spectator only (not full combat)
- **No native install required**

## 4. Core Systems

### 4.1 Walker Controls

- Independent leg heading and torso/cockpit yaw
- Throttle positions with acceleration/deceleration curves
- Mass-dependent turn rate, braking distance, slope handling, recoil response, fall recovery
- Input: Mouse+Keyboard, Controller, configurable HOTAS
- Optional assists: torso-centering, throttle decay, aim stabilization, simplified steering
- Cockpit view canonical; external camera for accessibility/photo/casual
- Head-look independent from weapon aim
- Jump/boost chassis-specific and physically limited

### 4.2 Damage Model

Tracked sections:
- Sensor crown / cockpit
- Center core
- Left torso, Right torso
- Left arm/boom, Right arm/boom
- Left leg, Right leg
- Rear reactor armor
- External modules (missile racks, radar mast, radiator wings, shield projector)

Each section: armor + internal integrity. Internal damage affects:
- Weapon availability, accuracy, recycle time
- Torso traverse, leg speed, turning
- Stability, fall risk
- Heat dissipation
- Sensors, target lock, minimap, identification
- Reactor output, max throttle
- Cockpit display reliability

Supports: severed limbs, destroyed modules, designed cook-offs, pilot ejection, disabled-but-salvageable enemies, location-specific visual damage. No gore.

### 4.3 Heat and Power

- Weapons, boost, sensors, shields, actuators generate heat/power demand
- Ambient biome temperature and water immersion affect cooling
- Thresholds: warning → aim drift → slower cycle → reduced acceleration → auto-vent → emergency shutdown → reactor damage
- Manual override (dangerous)
- Coolant purge: strong tactical option with resource cost and visible vapor
- Design goal: interesting firing rhythms, not punishment

### 4.4 Frame Construction

Four classes:
| Class | Tonnage | Role |
|-------|---------|------|
| Scout | 25–35t | Fast recon, spotting |
| Line | 40–55t | Versatile combat |
| Heavy | 60–80t | Durable assault |
| Siege | 85–100t | Mobile fortress |

Each chassis defines: tonnage limit, speed/accel, torso traverse, leg turn, armor capacity/distribution, internal structure, reactor output, cooling, hardpoints (kinetic/beam/ordnance/utility/adaptive), hardpoint size/clearance, ammo volume, module sockets, sensor profile, stability, unique geometry/animation.

### 4.5 Weapon Families

- **Kinetic:** Light/Medium/Heavy autocannon, Rotary cannon, Hypervelocity rail lance, Fragmentation cannon
- **Beam/Thermal:** Continuous cutter beam, Pulse laser, Charged ion lance, Plasma projector (adds enemy heat)
- **Ordnance:** Short-range guided rockets, LRM, Top-attack missiles, Swarm micro-missiles, Area-denial mines, Targeting beacon
- **Utility:** APS, ECM, Advanced optics, Sensor booster, Drone spotter, Coolant reservoir, Gyro stabilizer, Jump/boost pack, Smoke projector

### 4.6 Armor Types

- Dense composite (max raw protection)
- Mirror laminate (anti-beam)
- Reactive lattice (anti-explosive/kinetic burst)
- Heat-sink cladding (lighter, improved thermal)

### 4.7 Squad Command

Player commands up to 3 AI squadmates:
- Form on me / Move to point / Attack my target / Focus fire by component
- Defend unit or area / Hold fire / Long-range posture / Close and brawl
- Break LOS / take cover / Retreat to rally / Vent heat / Preserve for salvage

AI reports: acknowledgement, refusal, damage, heat, weapon loss, target changes, retreat.

### 4.8 Enemy AI

- Perception, memory, uncertainty, threat, LOS, radar, sound, damage, heat, range preference, terrain, squad role
- Coordinated focus fire without perfect info
- Protects artillery/carriers
- Targets damaged legs, rear armor, dangerous weapons, mission-critical allies
- Breaks locks with terrain/countermeasures
- Manages heat/ammo
- Can retreat, eject, surrender, become disabled
- Authored encounter plans + systemic reactions

### 4.9 Salvage and Progression

- Successful missions expand roster and equipment pool
- Disabled enemies can be salvaged
- Repairs cost time/resources
- Persistent roster, inventory, pilot relationships

## 5. Campaign Structure

26 missions across 7 operations (~12–16 hours first playthrough):

| Operation | Biome | Missions |
|-----------|-------|----------|
| I — Cinder Wake | Shattered moon | 4 |
| II — White Meridian | Night-side tundra | 4 |
| III — Verdant Fault | Mountain forest / geothermal caverns | 3 |
| IV — Sunken Crown | Flooded coast | 4 |
| V — Red Expanse | Day-side glass desert | 4 |
| VI — City of Glass | Dense urban twilight | 5 |
| VII — Skyhook | Orbital elevator | 2 |

Key design: Mission 23 (THE SPLIT) is a true branch affecting Mission 24 and the ending.

## 6. Multiplayer

- 8v8 server-authoritative
- Modes: FFA elimination, Team destruction, Territory crown, Relay capture, Convoy assault/escort, Data-core possession, Objective operations
- Client prediction + server reconciliation
- No pay-to-win

## 7. Instant Action

- Custom battle, Escalating waves, Duel ladder, Survival, Convoy defense, Target range, Damage laboratory
- All unlocked chassis/equipment testable without campaign repair cost

## 8. Difficulty

Affects: enemy coordination, sensor discipline, aim quality, heat behavior, reinforcement timing, resource forgiveness. NOT merely health multipliers.

## 9. Accessibility

- Full remapping (KB/M, controller, flight controls)
- Sensitivity, deadzone, inversion, aim-assist
- Toggle/hold choices
- Scalable HUD and subtitles
- Colorblind palettes + symbol redundancy
- Reduced shake/flashes/motion blur, horizon stabilization
- FOV control
- Subtitle speaker labels, direction indicators, non-speech captions
- Difficulty assists: steering, heat, target lead, squad autonomy, timing

## 10. After-Action Report

No arbitrary star rating. Plain-language explanation of:
- Primary/optional objectives
- Civilian losses, allied losses
- Time, damage cost, ammo expenditure
- Salvage recovered, evidence recovered
- Strategic consequences

## 11. Vertical Slice Scope (Phase 1)

One 15–20 minute White Meridian mission with:
- 3 player chassis (Scout, Line, Heavy)
- 6 weapons (kinetic, beam, ordnance)
- Heat, localized damage, weapon grouping, salvage, repairs
- 4-unit squad
- Tanks, missile carrier, aircraft, turret, objective structure
- Functional cockpit, hangar, briefing, after-action report
- Voice, adaptive music, spatial SFX
- WebGPU + WebGL2 validation
