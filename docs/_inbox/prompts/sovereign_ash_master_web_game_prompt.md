# Sovereign Ash: Nareth Protocol
## Research synthesis and production-grade master prompt for an original browser-based heavy-walker combat simulator

> **Important IP boundary**
>
> This specification preserves the high-level design strengths of *MechWarrior 4: Vengeance*—cockpit vehicle simulation, weighty combat, localized damage, heat, hardpoint loadouts, salvage, squad commands, an operation-based campaign, instant action, and objective multiplayer—but it must **not** reproduce BattleTech/MechWarrior names, factions, story, characters, dialogue, music, sound effects, UI, logos, maps, mech silhouettes, or artwork. An exact clone requires permission from the relevant rights holders. Treat every name in this document as an original working name and conduct trademark clearance before release.

---

# 1. What was reviewed

The source review covered the two requested main pages and the game-relevant branches linked from them:

- Product history, genre, release context, gameplay, campaign structure, instant action, multiplayer, expansion structure, and reception.
- The seven-operation, 26-mission campaign structure and its progression through moon, tundra, mountain/forest, desert, coast/swamp, urban, and palace/citadel-style environments.
- BattleMech roster groupings and construction notes.
- Weapon/equipment balancing dimensions: mass, slot cost, range, damage, heat, recycle time, damage per second, and efficiency.
- Conventional vehicles, ships, aircraft, and dropship-scale support craft.
- Character roles, including protagonist, mission control, squadmates, rivals, political figures, and civilians.
- Setting/location references, expansion patterns, downloadable mech-pack concepts, and soundtrack references.

The review intentionally did **not** crawl every general encyclopedia link, every unrelated BattleTech lore page, site navigation, language pages, user pages, advertisements, or every individual weapon/chassis article. Those branches would expand into thousands of pages that are not necessary to define this game.

---

# 2. Design DNA extracted from the source material

The strongest reusable, non-proprietary design ideas are:

1. **First-person cockpit vehicle simulation** rather than a fast humanoid action game.
2. **Mass and inertia**: movement, turning, torso aiming, recoil, and stopping distance must communicate enormous weight.
3. **Localized damage**: armor and internal health by body section, component impairment, weapon loss, and limb destruction.
4. **Heat as a tactical resource**: powerful weapons create thermal pressure, leading to reduced performance, emergency shutdown, or reactor danger.
5. **Hardpoint-based construction**: chassis identity comes from constrained kinetic, beam, ordnance, utility, and adaptive mounts.
6. **Salvage progression**: successful missions expand the player’s roster and equipment pool.
7. **Four-unit squad command**: the player leads up to three AI squadmates with concise tactical orders.
8. **Operation-based campaign**: several missions share a theatre, story arc, environmental identity, and evolving strategic goal.
9. **A consequential late-game choice** that changes the final operation and ending.
10. **Instant action and multiplayer** that reuse the simulation systems beyond the campaign.
11. **Combined-arms battlefields** with walkers, tanks, missile carriers, aircraft, boats, emplacements, transports, and major support craft.
12. **Readable build statistics**: mass, hardpoint slots, range, damage, heat, cycle time, ammunition, velocity, spread, and efficiency.

---

# 3. Copy-paste master prompt

Use the following as a single master prompt for a coding/game-development agent.

```text
You are the principal game director, technical director, rendering engineer, gameplay systems designer, narrative director, UI/UX lead, audio director, QA lead, and production architect for a premium browser game.

PROJECT WORKING TITLE
SOVEREIGN ASH: NARETH PROTOCOL

MISSION
Design and implement a production-quality, desktop-first, first-person heavy-combat-walker simulation that runs from a website. It must create the emotional impression of commanding a 25-to-100-ton war machine from a physical cockpit: immense scale, heavy momentum, dangerous heat, violent recoil, localized mechanical damage, tactical squad command, meaningful salvage, and cinematic combined-arms warfare.

The project may preserve high-level genre mechanics associated with classic cockpit-based walker simulators, but it must be an original work. Do not copy, trace, reproduce, adapt, or closely imitate any protected MechWarrior/BattleTech story, character, faction, location, terminology, dialogue, music, sound effect, logo, UI, mission script, map, chassis name, iconic silhouette, or artwork. Do not use copyrighted reference images as generation inputs. Never name the source franchise inside the shipped game, asset metadata, prompts, code comments, marketing, or dialogue. Create a distinct visual language, setting, roster, story, sound world, and user interface.

Treat “Sovereign Ash: Nareth Protocol” and every proper noun below as a working name that must pass trademark and legal clearance before publication.

PRIMARY EXPERIENCE PILLARS
1. MASS: Every step, turn, landing, recoil impulse, collision, and structural failure communicates enormous weight.
2. CONSEQUENCE: Armor loss, damaged actuators, destroyed weapons, heat, ammunition, pilot decisions, squad survival, and salvage affect the mission and campaign.
3. TACTICAL EXPRESSION: Chassis choice, hardpoints, weapon groups, armor distribution, cooling, utility modules, terrain, squad orders, and target selection support multiple viable play styles.
4. COCKPIT PRESENCE: The player inhabits a physical machine with diegetic displays, canopy reflections, warning lamps, vibration, audio occlusion, and damage feedback.
5. CINEMATIC CLARITY: Spectacular visuals and sound must never hide targets, objectives, heat state, damage state, or critical warnings.
6. ORIGINAL IDENTITY: The game must be recognizable from a single silhouette, cockpit screenshot, musical cue, or radio exchange without relying on an existing franchise.

TARGET PLATFORM AND STACK
- Desktop browsers are the primary target. Mobile may receive a spectator or hangar-only experience, not the full combat renderer.
- TypeScript monorepo.
- Babylon.js renderer and scene layer.
- WebGPU primary renderer; WebGL2 fallback with reduced features.
- Vite build system.
- React for menus, hangar, campaign map, settings, account, and post-mission interfaces; keep real-time HUD rendering efficient and avoid unnecessary DOM churn.
- Physics through Babylon-compatible Havok or an equivalent WebAssembly physics layer. Use deterministic fixed-step gameplay logic separate from purely visual physics.
- Authoritative Node.js/TypeScript multiplayer server using WebSockets. The client may predict local movement but never authoritatively decides damage, inventory, progression, match results, or purchases.
- PostgreSQL for durable account/campaign data, Redis for sessions/match coordination, object storage plus CDN for versioned assets.
- Static frontend and large assets served through a global CDN over HTTPS.
- All Tripo and ElevenLabs calls occur in trusted server-side tools or an internal content pipeline. Never expose vendor API keys in client JavaScript.

GRAPHICS QUALITY TARGET
Create a “Cinematic Ultra” preset that renders at the display’s native resolution up to 3840×2160 when the hardware can sustain it. Do not equate maximum quality with unbounded polygon counts. Highest visual quality means excellent source assets, intelligent LODs, compressed GPU-ready textures, stable frame pacing, perceptual detail, lighting, animation, damage response, scale cues, and art direction.

Performance targets:
- 60 FPS at 2560×1440 on a recommended modern gaming desktop in campaign combat.
- 45–60 FPS at 3840×2160 on the Ultra preset on high-end hardware.
- A locked 30 FPS cinematic fallback is acceptable only when the player explicitly selects it.
- Dynamic resolution range: 50%–100%, targeting the selected frame-rate cap.
- WebGL2 fallback must preserve gameplay and visual readability even when volumetrics, reflections, particles, shadow distance, and density are reduced.
- Never ship a raw 1.5–2-million-face generated model as a runtime combat asset.

RUNTIME ASSET BUDGETS
- Hero combat-frame LOD0: approximately 120,000–180,000 triangles, depending on silhouette and exposed mechanisms.
- LOD1: 55,000–80,000 triangles.
- LOD2: 20,000–35,000 triangles.
- LOD3: 6,000–12,000 triangles.
- Separate cockpit interior: up to approximately 150,000 triangles at first-person LOD, aggressively culled outside the cockpit.
- Main frame texture set: 4K base color, normal, ORM, and emissive for LOD0; 2K/1K streaming variants for distance and lower presets.
- Small props use atlases and trim sheets. Buildings use modular kits, decals, vertex color, and material variation rather than unique 4K sets everywhere.
- Export runtime assets as glTF 2.0/GLB with PBR materials, animation, skins, sockets, and hierarchy intact.
- Transcode textures to KTX2/Basis Universal with mipmaps.
- Use meshopt-compatible geometry compression where supported.
- Stream by operation, sector, and encounter. Preload only the next likely combat area.

ORIGINAL ART DIRECTION
Visual genre: grounded industrial science fiction with aerospace engineering, mining machinery, emergency-rescue hardware, and brutalist planetary infrastructure.

Signature visual language:
- Walkers use a visible torsion spine, offset armored reactor cradle, ring-shaped thermal radiators, ceramic-composite plates, and modular tool-derived weapon housings.
- Legs are reverse-jointed or digitigrade only when mechanically justified; do not reproduce recognizable franchise silhouettes.
- Avoid cat-ear cockpits, skull-faced assault heads, boxy shoulder missile silhouettes, or any arrangement strongly associated with an existing named chassis.
- Faction A, the Meridian Assembly, uses pale ceramic armor, dark graphite joints, amber rescue markings, and field-repaired asymmetry.
- Faction B, the Helix Directorate, uses monolithic charcoal armor, thin cold-white luminous seams, precision panel alignment, and sensor-mast geometry.
- Heat is visible through radiator glow, venting vapor, paint discoloration, heat shimmer, and emissive reactor conduits.
- Damage progresses through scorched paint, chipped ceramic, exposed honeycomb, severed cables, hydraulic spray, sparks, warped armor, and disabled subassemblies.
- Scale cues include tiny service vehicles, personnel lights, trees bending under pressure waves, dust lagging behind footfalls, delayed distant sound, collapsing façades, and aircraft flying below shoulder level.

RENDERING FEATURES
- Physically based materials with consistent metal/roughness calibration.
- Image-based lighting plus authored key lights.
- Cascaded sun shadows, contact shadows, local shadow maps for hero lights, and distance-based shadow budgets.
- Volumetric fog, dust, snow, rain, sea spray, heat shimmer, sparks, smoke columns, and localized atmospheric scattering on Ultra.
- Screen-space reflections and reflection probes; do not make hardware ray tracing a requirement.
- Temporal antialiasing or a stable equivalent, high-quality anisotropic filtering, sharpen control, and conservative motion blur.
- GPU instancing for repeated props, vegetation, debris, vehicles, and projectiles.
- Occlusion culling, frustum culling, hierarchical LOD, baked impostors for distant structures, and pooled particles.
- Terrain blending, tire/track/foot deformation decals, scorch decals, craters, and persistent but budgeted battlefield damage.
- Destructible objects are authored in tiers: cosmetic, breakable cover, objective structures, and fully scripted set pieces. Do not attempt universal destruction.

GAME WORLD AND STORY
Nareth is a tidally locked industrial colony built along the twilight band between a frozen night hemisphere and a furnace-bright day hemisphere. A shattered moon, Cinder, feeds a bright ring of orbital debris. The planet’s economy and survival depend on geothermal cities, a space elevator called the Skyhook, and the Crown Array—an orbital network that controls weather mirrors, navigation, and mass-driver defenses.

The Helix Directorate seizes the Crown Array during a failed emergency transition and declares permanent military rule. The player is the customizable commander of Ash Unit, a civilian rescue-and-salvage group forced into combat after its relief carrier is destroyed. The player is not royalty, is not reclaiming a family throne, and has no familial relationship with the principal antagonist.

The campaign theme is: “What is a victory worth if the world you save can no longer live with it?”

The principal antagonist, Marshal Oren Voss, is a former planetary-safety strategist who believes only centralized machine governance can prevent Nareth’s collapse. He is intelligent, persuasive, and responsible for severe atrocities, but he is never written as a cartoon villain.

The player’s core cast:
- Commander / callsign ASH ONE: customizable appearance and one of several original voice profiles.
- Dr. Amara Sen: mission control, systems engineer, restrained authority, emotionally honest.
- Tomas Rell: veteran heavy-frame pilot, protective, dry humor, carries survivor guilt.
- Iona Kest: young reconnaissance pilot, brilliant and impulsive, uses humor under stress.
- Chief Nadi Okafor: salvage master, practical, warm, blunt about impossible requests.
- Lieutenant Cael Marr: former Directorate officer who defects; tactically valuable but distrusted.
- MIRA-7: onboard diagnostic intelligence; concise, non-human cadence, gradually reveals unauthorized memories.
- Marshal Oren Voss: antagonist; low-key, strategic, never shouts without a specific loss of control.

No character may be a renamed copy of any source character. Dialogue must be original and contemporary, with military clarity but without imitating existing franchise phrasing.

CAMPAIGN STRUCTURE
Create 26 campaign missions across seven operations. Each operation has a unique biome, strategic objective, gameplay escalation, visual motif, weather system, music palette, enemy composition, and salvage tier. Average campaign length should be approximately 12–16 hours on the first playthrough, depending on difficulty and optional objectives.

OPERATION I — CINDER WAKE (shattered moon, 4 missions)
1. DEAD ORBIT: tutorial under combat pressure. Recover the relief carrier’s flight recorder while learning throttle, leg steering, torso aim, weapons, heat, and scanning.
2. SILENT ARRAY: reactivate a communications spine while engineers work; alternate between defense, power routing, and intercepting attackers in low gravity.
3. MASS DRIVER: infiltrate a mining rail complex, identify the correct targeting nodes, and sabotage the weapon without detonating civilian fuel stores.
4. BURN WINDOW: escort improvised transports to the launch field while the moon facility loses structural integrity. End with a playable launch escape, not a cutscene-only resolution.

OPERATION II — WHITE MERIDIAN (night-side tundra, 4 missions)
5. ICEFALL: hot-drop into a whiteout, secure a geothermal landing site, and use thermal vision to distinguish enemies from industrial machinery.
6. PALE THUNDER: locate mobile long-range artillery by tracing firing signatures through a storm; eliminate spotter drones or endure increasingly accurate barrages.
7. HEART OF WINTER: defend a heat-exchange plant whose pipes can be ruptured, creating temporary steam cover but harming civilian infrastructure.
8. GLASS SIGNAL: capture a weather-radar mesa and hold synchronized uplink zones long enough to reveal the Directorate supply network.

OPERATION III — VERDANT FAULT (mountain forest and geothermal caverns, 3 missions)
9. GHOST PINES: hunt electronic-warfare scouts through dense forest where canopy, rock, and geothermal interference disrupt sensors.
10. BROKEN SPINE: escort a civilian crawler across a collapsing mountain pass; choose routes that trade speed, exposure, and salvage opportunities.
11. ROOT FOUNDRY: descend into a partially automated underground factory, disable drone production, and escape before coolant flooding seals the caverns.

OPERATION IV — SUNKEN CROWN (flooded coast, 4 missions)
12. BLACK TIDE: rescue a floating settlement while fighting patrol boats, hover armor, aircraft, and walkers moving through shallow water.
13. SALT HAMMER: neutralize a sea fortress by destroying its sensor, shield, and gun systems in any order; the order changes reinforcements and hazards.
14. STORMBREAK: defend an evacuation flotilla during a supercell. Lightning, waves, visibility, and wind alter missiles, aircraft, and sensors without becoming random or unfair.
15. LEVIATHAN DOWN: assault a mobile command barge in tidal flats. Disable propulsion and communications before destroying or capturing it for major salvage.

OPERATION V — RED EXPANSE (day-side glass desert, 4 missions)
16. THIRST LINE: escort water crawlers through heat mirages and ambush terrain; overuse of high-heat weapons strains cooling more than normal.
17. BORROWED GIANTS: capture autonomous mining walkers intact by disabling legs, sensors, or command modules instead of destroying them.
18. RAILFIRE: assault a horizon-scale rail cannon during a silica storm; use terrain shadows and maintenance trenches to survive its firing cycle.
19. CHAINBREAKER: liberate a labor detention complex. Optional objectives preserve evidence, rescue more prisoners, and prevent retaliatory demolition.

OPERATION VI — CITY OF GLASS (dense urban twilight zone, 5 missions)
20. NIGHT CIRCUIT: penetrate a sensor-blackout district, triangulate hidden command relays, and avoid waking every defensive sector at once.
21. FALLEN WING: rescue downed allied pilots before enemy retrieval teams arrive; each rescue adds a pilot or intelligence benefit to the campaign.
22. TRANSIT WAR: hold a multi-level maglev interchange while trains, tunnels, rooftops, and service roads create simultaneous combat layers.
23. THE SPLIT: a true branch. Choose one:
    A. save a packed arcology from a staged reactor cascade, preserving lives and public support but allowing the Directorate to evacuate its orbital command key; or
    B. seize the orbital command key, gaining major military advantage while the arcology suffers catastrophic losses.
24. COUNTERWEIGHT: consequences of the choice become playable. Surviving allies, enemy morale, available salvage, civilian broadcasts, music, and objective structure change. Disable the Skyhook shield towers and open the final route.

OPERATION VII — SKYHOOK (orbital-elevator base and tether crown, 2 missions)
25. ASCENSION BURN: a large combined-arms assault involving every surviving squadmate and faction. The player assigns two allied groups to secondary objectives before launch, creating meaningful battlefield variation.
26. SOVEREIGN ASH: climb through the Skyhook crown while orbital debris falls through the atmosphere. Final battle against Voss’s unique command frame, designed as an original asymmetrical mobile defense platform rather than a recognizable franchise homage. Ending states depend on the branch choice, optional evidence, civilian survival, squadmate survival, captured infrastructure, and whether the player destroys or takes control of the Crown Array.

CAMPAIGN SYSTEMS
- Persistent roster, inventory, repairs, salvage, and pilot relationships.
- Mission results include primary objectives, optional objectives, civilian losses, allied losses, time, damage cost, ammunition expenditure, salvage recovered, evidence recovered, and strategic consequences.
- No arbitrary star rating. Use an after-action report that explains consequences in plain language.
- Mission failure should sometimes produce a retreat or damaged-campaign state rather than always forcing a reload.
- Difficulty affects enemy coordination, sensor discipline, aim quality, heat behavior, reinforcement timing, and resource forgiveness—not merely health multipliers.
- New chassis and weapons enter gradually. Early missions emphasize Scout and Line frames; late operations unlock Heavy and Siege frames.
- A New Game Plus mode may preserve cosmetics and pilot records while rebalancing progression.

CORE WALKER CONTROLS
- Independent leg heading and torso/cockpit yaw.
- Throttle positions with acceleration and deceleration curves, not instant forward speed.
- Mass-dependent turn rate, braking distance, slope handling, recoil response, and fall recovery.
- Mouse and keyboard, controller, and configurable HOTAS support where browser APIs permit.
- Optional torso-centering, throttle decay, aim stabilization, and simplified steering assists.
- Cockpit view is canonical. An external camera is available for accessibility, photo mode, and casual difficulty, but competitive modes may restrict it.
- Head-look is independent from weapon aim when enabled.
- Jump or boost capability is chassis-specific and physically limited.

DAMAGE MODEL
Track at minimum:
- Sensor crown / cockpit.
- Center core.
- Left and right torso.
- Left and right arms or weapon booms.
- Left and right legs.
- Rear reactor armor.
- External modules such as missile racks, radar mast, radiator wings, or shield projector where present.

Each section has armor and internal integrity. Internal damage can affect:
- Weapon availability.
- Weapon accuracy.
- Reload or recycle time.
- Torso traverse.
- Leg speed and turning.
- Stability and fall risk.
- Heat dissipation.
- Sensors, target lock, minimap, and identification.
- Reactor output and maximum throttle.
- Cockpit display reliability.

Support severed limbs, destroyed external modules, ammunition cook-off only where explicitly designed, pilot ejection, disabled-but-salvageable enemies, and location-specific visual damage. Avoid gore.

HEAT AND POWER
- Every weapon, boost system, active sensor, shield, and emergency actuator action can create heat or power demand.
- Ambient biome temperature and water immersion affect cooling.
- Heat thresholds produce escalating effects: warning, aim drift, slower cycle, reduced acceleration, automatic venting, emergency shutdown, and reactor damage.
- Manual override is possible but dangerous.
- Limited coolant purge provides a strong tactical option with a resource cost and visible vapor signature.
- Heat should create interesting firing rhythms, not simply punish the player for using weapons.

FRAME CONSTRUCTION
Use four original classes:
- Scout: 25–35 tonnes.
- Line: 40–55 tonnes.
- Heavy: 60–80 tonnes.
- Siege: 85–100 tonnes.

Each chassis has:
- Tonnage limit.
- Base speed and acceleration.
- Torso traverse and leg turn rate.
- Armor capacity and section distribution.
- Internal structure.
- Reactor output.
- Cooling capacity.
- Kinetic, beam, ordnance, utility, and adaptive hardpoints.
- Hardpoint size and physical clearance.
- Ammunition volume.
- Module sockets.
- Sensor profile.
- Stability.
- Unique geometry and animation behavior.

Use a transparent statistics model. Every weapon data row includes:
- Mass.
- Hardpoint category and size.
- Range bands.
- Projectile velocity or beam duration.
- Base damage and section-damage behavior.
- Heat.
- Power draw.
- Recycle time.
- Sustained damage per second.
- Damage per tonne.
- Ammunition count and reload behavior.
- Spread, recoil, lock time, splash, penetration, and guidance where applicable.

WEAPON FAMILIES
Kinetic:
- Light, medium, and heavy autocannons.
- Rotary cannon.
- Hypervelocity rail lance.
- Fragmentation cannon for aircraft and exposed components.

Beam / thermal:
- Continuous cutter beam.
- Pulse laser.
- Charged ion lance.
- Short-range plasma projector that adds enemy heat.

Ordnance:
- Short-range guided rockets.
- Long-range missiles.
- Top-attack missiles.
- Swarm micro-missiles.
- Area-denial mines.
- Targeting beacon round.

Utility:
- Active protection system.
- Electronic countermeasures.
- Advanced optics.
- Sensor booster.
- Drone spotter.
- Coolant reservoir.
- Gyro stabilizer.
- Jump/boost pack.
- Smoke or aerosol projector.

Armor choices:
- Dense composite: maximum raw protection.
- Mirror laminate: reduced capacity but strong against beam/thermal damage.
- Reactive lattice: reduced capacity but strong against explosive/kinetic burst damage.
- Heat-sink cladding: lighter protection with improved thermal behavior.

Create at least 20 wholly original chassis. Working roster:
SCOUT
- GLINT-25: fast visual scout, narrow profile, minimal armor.
- NEEDLE-30: missile spotter with elevated sensor crown.
- CINDER-32: electronic-warfare platform with folding radiator vanes.
- SKYRAKE-35: jump-capable striker with rear-mounted impulse pack.

LINE
- VANDAL-40: kinetic duelist with asymmetric gun arm and shielded off-arm.
- MORROW-45: beam support frame with distributed cooling loops.
- IBIS-50: command and sensor frame with long articulated optics mast.
- CAIRN-55: close-range brawler with low center of gravity.

HEAVY
- RAMPART-60: durable line holder with modular shoulder armor.
- WARDEN-65: long-range ordnance support with dorsal launch cells.
- HARROW-70: mobile flanker with high torso traverse.
- ANVIL-75: recoil-stabilized kinetic siege platform.
- MONSOON-80: sealed coastal assault frame with water-cooled exchangers.

SIEGE
- CITADEL-85: command frame with powerful sensors and defensive systems.
- CALDERA-90: thermal brawler with oversized heat radiators.
- SEPULCHER-95: long-range sniper with anchored firing stance.
- MONARCH-100: slow fortress frame with broad adaptive capacity.
- Add three further chassis after silhouette review to fill missing tactical roles.

These names are placeholders. Confirm they are not confusingly similar to existing game or product marks before release.

SQUAD COMMAND
The player commands up to three AI squadmates.

Commands:
- Form on me.
- Move to point.
- Attack my target.
- Focus fire by component.
- Defend this unit or area.
- Hold fire.
- Use long-range posture.
- Close and brawl.
- Break line of sight / take cover.
- Retreat to rally point.
- Vent heat now.
- Preserve target for salvage.

AI squadmates must report acknowledgement, refusal when physically impossible, damage, heat, loss of weapons, target changes, and retreat. Command UI must work through quick keys, radial menu, controller, and optional voice input later.

ENEMY AI
- Uses perception, memory, uncertainty, threat, line of sight, radar, sound, damage, heat, range preference, terrain, and squad role.
- Coordinates focus fire without perfect information.
- Protects artillery and missile carriers.
- Targets damaged legs, exposed rear armor, dangerous weapons, or mission-critical allies when tactically justified.
- Breaks locks with terrain and countermeasures.
- Manages heat and ammunition.
- Can retreat, eject, surrender, or become disabled depending on morale and orders.
- Uses authored encounter plans plus systemic reactions. Do not rely entirely on behavior trees that create repetitive circles around the player.

COMBINED-ARMS ROSTER
Create original versions of:
- Wheeled scout cars.
- Hover armor.
- Main battle tanks.
- Short-range missile carriers.
- Long-range missile carriers.
- Anti-air platforms.
- Mobile artillery.
- Armored personnel carriers.
- Cargo and repair vehicles.
- Patrol boats and command barges.
- Ground-attack aircraft and bombers.
- Heavy transports and orbital landers.
- Turrets, radar sites, shield nodes, generators, rail guns, drone nests, and mobile command units.

Do not make conventional units disposable visual clutter. They must create real tactical pressure, expose rear armor, spot for missiles, threaten objectives, or support walkers.

INSTANT ACTION
- Choose map, biome, time, weather, friendly roster, enemy roster, difficulty, objective, and mutators.
- Modes: custom battle, escalating waves, duel ladder, survival, convoy defense, target range, and damage laboratory.
- All unlocked chassis and equipment can be tested without campaign repair cost.

MULTIPLAYER
Initial target: 8v8 with server-authoritative simulation and region selection.
Modes:
- Free-for-all elimination.
- Team destruction.
- Territory crown: control one or more uplink zones.
- Relay capture: steal and return encrypted data.
- Convoy assault/escort.
- Data-core possession: carry a core to score while becoming visible to enemies.
- Objective operations with asymmetrical attackers and defenders.

Networking requirements:
- Client simulation at display frame rate; server simulation at a stable fixed tick.
- Snapshot interpolation, input prediction, reconciliation, lag compensation for appropriate weapons, and server validation.
- Projectile weapons retain travel time; do not turn every weapon into hitscan for networking convenience.
- Validate fire rate, heat, ammunition, speed, acceleration, transforms, inventory, damage, and objective actions server-side.
- Reconnect support, match rejoin, spectator mode, reporting, moderation, and replay-friendly event logging.
- No pay-to-win equipment. Monetization, if any, is cosmetic and transparent.

TRIPO 3D ASSET PIPELINE
Use Tripo as a rapid source-asset generator, not as the final authority on topology, rigging, silhouette, scale, or game readiness.

For each hero frame:
1. Produce an original concept sheet with front, left, back, and right orthographic views plus a separate three-quarter beauty view. No copyrighted reference images.
2. Use the four ordered orthographic views for multiview generation. Use the current H3 high-fidelity model for the master geometry when detail and multi-angle consistency are priorities.
3. Generate a high-fidelity PBR source pass with detailed texture quality.
4. Generate a separate untextured segmented-parts pass when editable parts are needed, because part generation may conflict with texturing/PBR and quad output in current Tripo workflows.
5. Consider the current P1/clean-topology path or smart-low-poly output for a starting retopology mesh, but manually inspect every joint, silhouette, weapon bore, vent, thin surface, and negative space.
6. Rebuild or clean topology around pelvis, torso ring, hips, knees, ankles, shoulders, elbows, weapon recoil rails, radiator vanes, and damage-separation seams.
7. Create a mechanical skeleton and constraints. Required bones include root, pelvis, torso yaw, torso pitch where supported, head/sensor, left/right hip, knee, ankle, foot, shoulder, elbow, wrist/weapon, recoil bones, launcher doors, radiator vanes, and optional antennae.
8. Create animation clips: idle powered, idle damaged, walk forward/back, run, turn in place, strafe where supported, slope adaptation, recoil by weapon class, brace, jump/boost, landing, stagger, fall, stand, overheat vent, shutdown, startup, ejection, and destruction variants.
9. Author named sockets for weapons, muzzle flashes, missile tubes, shell ejection, hit effects, footsteps, cockpit, camera, sensors, jump exhaust, damage smoke, and severable parts.
10. Create LOD0–LOD3, simple collision proxies, navigation footprint, radar bounds, occlusion bounds, and destructible submeshes.
11. Bake high-frequency source detail into normal, curvature, ambient-occlusion, thickness, and material masks.
12. Export GLB, validate hierarchy/materials/animation, transcode textures to KTX2, apply geometry compression, and run automated asset-budget checks.
13. Review in the actual game renderer under neutral, moon, snow, desert, rain, and night lighting. Never approve an asset only from a studio turntable.

TRIPO PROMPT — SCOUT FRAME
“Original 30-ton industrial military scout walker for a grounded science-fiction game, full body, bipedal, compact narrow torso around a visible armored torsion spine, long mechanically plausible legs, offset cockpit capsule with no face, folding ring-shaped heat radiators, one modular sensor mast and two small weapon hardpoints, rescue-machinery ancestry, pale ceramic armor over dark graphite joints, amber maintenance markings, realistic panel thickness, functional hinges, cables protected by guides, PBR hard-surface detail, neutral standing pose, isolated object, no base, no pilot, no text, no logos, no resemblance to any existing franchise robot or mech.”

TRIPO PROMPT — HEAVY FRAME
“Original 72-ton heavy combat walker for grounded industrial science fiction, broad but asymmetric silhouette, armored reactor cradle offset behind a rotating torso ring, reverse-jointed load-bearing legs with massive hydraulic knees, right-side hypervelocity cannon on a recoil rail, left articulated manipulator carrying a defensive projector, dorsal thermal radiator halo, layered ceramic composite armor, field repairs and replaceable panels, believable access hatches and service points, dark metallic mechanisms, physically based materials, neutral pose, isolated, no environment, no text, no logos, no copied robot or mech design.”

TRIPO PROMPT — SIEGE FRAME
“Original 100-ton siege walker, monumental mobile fortress designed around an orbital-elevator defense role, low stable pelvis, four-toed load-distributing feet, heavily armored central reactor, asymmetrical command cockpit buried behind sensor apertures, two independently articulated weapon booms, retractable ground anchors, segmented radiator crown that opens during overheating, monolithic charcoal ceramic armor with thin cold-white luminous seams, realistic military engineering, high-detail PBR hard-surface model, neutral stance, isolated, no text, no logos, no human face, no resemblance to any known franchise chassis.”

TRIPO PROMPT — FIRST-PERSON COCKPIT
“Original heavy-walker cockpit interior viewed from the seated pilot position, armored aerospace rescue capsule converted for combat, wide but reinforced canopy with thick structural ribs, two physical control sticks, foot pedals, central transparent tactical display, left heat and reactor panel, right damage and weapon grouping panel, overhead emergency breakers, worn labels made from fictional symbols rather than readable brands, layered cables and shock mounts, realistic scale, dark graphite materials, soft amber instrument light, red emergency lighting, no people, no logos, no resemblance to any existing game cockpit.”

TRIPO PROMPT — COASTAL COMMAND BARGE
“Original near-future armored command barge for a flooded alien industrial coast, 140 meters long, shallow draft, modular radar towers, drone deck, retractable missile cells, walker service crane, wave-breaking angular hull, ceramic composite armor, weathered salt streaks, floodlights, visible maintenance access and defensive turrets, grounded functional engineering, cinematic PBR detail, isolated vehicle, no ocean, no crew, no text, no logos, no resemblance to existing science-fiction ships.”

TRIPO QUALITY RULES
- Keep each model prompt specific about function, mass, silhouette, mechanisms, materials, pose, and exclusions.
- Save model seed and texture seed for reproducibility.
- Generate several silhouettes and reject anything derivative before investing in texture or rigging.
- Use high-detail source geometry only for baking and close-up marketing renders.
- For runtime topology, prefer silhouette, deformation, stable shading, damage segmentation, and material quality over tiny modeled bolts.
- Use 4K textures on hero assets, but pack ORM channels and stream lower mips early.
- Manually repair hands/manipulators, barrels, missile tubes, thin armor, symmetry errors, intersecting parts, floating geometry, and impossible joints.

ELEVENLABS VOICE PIPELINE
- Build every principal voice with Voice Design or a properly licensed actor/voice owner.
- Never imitate the original game cast, a celebrity, or a recognizable performer.
- Never clone a voice without documented rights and consent.
- Maintain a voice bible containing age range, vocal weight, accent, cadence, emotional range, forbidden mannerisms, pronunciation guide, and approved reference lines.
- Generate several neutral and emotional calibration lines before producing the script.
- Use voice-appropriate audio tags, punctuation, and line structure for expression. Do not put music or non-vocal effects inside TTS tags.
- Record/generate dry dialogue first; apply radio filtering, helmet resonance, distortion, packet loss, room response, and combat ducking in the game audio pipeline.
- Preserve intelligibility. Radio processing must never make objectives unclear.
- Export the highest-quality PCM format available to the account where practical, normalize consistently, remove long silence, create subtitles and timing data, and encode runtime files to an efficient web format.

VOICE DESIGN PROMPTS
DR. AMARA SEN — MISSION CONTROL
“Woman in her early forties with a low-mid register, precise international English, calm technical authority, restrained warmth, and clear consonants. She sounds like an experienced systems engineer leading people through a disaster, not a theatrical announcer. Medium pace, controlled breath, capable of quiet grief and sudden command intensity without melodrama. No celebrity resemblance, no exaggerated military stereotype.”

TOMAS RELL — VETERAN SQUADMATE
“Man in his late forties with a textured baritone, understated dry humor, slightly tired breath, and the compact phrasing of a veteran who avoids wasting radio time. Warm toward the squad, guarded about trauma, forceful only when someone is in immediate danger. Natural conversational delivery, no gravelly action-hero caricature, no resemblance to a known actor.”

IONA KEST — RECON PILOT
“Woman in her late twenties, agile bright voice with fast analytical cadence, subtle nervous humor, and excellent emotional transitions. She sounds highly intelligent and brave but not invulnerable. Clear radio diction, occasional clipped breaths during high-G movement, capable of awe, fear, irritation, and fierce focus. No cartoon energy, no celebrity resemblance.”

CAEL MARR — DEFECTOR
“Man in his mid-thirties with a measured mid register, controlled formal diction that softens over the campaign, faintly guarded tone, and a habit of pausing before revealing personal information. He carries moral injury rather than villainous menace. Precise, calm, believable under fire, no stereotyped accent and no resemblance to a known performer.”

MIRA-7 — ONBOARD INTELLIGENCE
“Feminine synthetic voice with near-human clarity, neutral age, narrow emotional range at first, exact timing, minimal breath, and slightly unusual emphasis on diagnostic terms. Gradually permit tiny signs of curiosity and concern. Never use a generic robotic monotone, metallic vocoder, seductive AI trope, or imitation of an existing fictional computer voice.”

MARSHAL OREN VOSS — ANTAGONIST
“Man in his early fifties with a controlled resonant tenor-baritone, educated diction, quiet confidence, and no need to shout. He sounds persuasive enough to have loyal followers and exhausted enough to believe ruthless control is mercy. Anger appears as reduced volume and sharper precision rather than theatrical rage. No celebrity resemblance, no imitation of an existing game villain.”

TTS LINE-DIRECTION EXAMPLES
- “[restrained, urgent] Ash One… the reactor wall is moving. You have ninety seconds before the district becomes the vent.”
- “[breathing hard, focused] Contact—two heavies above the rail line. I can mark one. The other is looking straight at you.”
- “[quietly, with contained grief] We saved the tower. We did not save the people who kept it alive.”
- “[cold, precise] Your rescue has altered the arithmetic, Commander. It has not altered the outcome.”

MUSIC DIRECTION
Create an original adaptive score with no recognizable melody, rhythm, harmony, orchestration, or sound design borrowed from any existing game or film soundtrack.

Core palette:
- Low brass and contrabass winds for mass.
- Granular industrial percussion created from metal strain, hydraulic impacts, cable tension, and distant machinery.
- Modular synthesis for planetary systems and orbital infrastructure.
- Processed strings for human cost.
- Sparse piano or hammered dulcimer-like prepared instrument for memory and loss.
- Sub-bass used selectively; preserve headroom for weapon and footfall effects.
- Avoid constant wall-to-wall percussion and generic trailer braams.

Adaptive music states:
- Exploration.
- Suspicion.
- Contact.
- Full combat.
- Critical damage.
- Objective success.
- Retreat/loss.
- Post-mission reflection.

Generate compatible musical layers or use stem separation. Align combat layers by key, meter, tempo, phrase length, and cadence so the runtime can transition at bar boundaries. Request instrumental output. On plans that support it, use high-quality PCM output and stem separation, then edit, loop, mix, and master in a DAW. Deliver runtime music as loop-safe Opus or another efficient web codec after mastering.

MUSIC PROMPT — MAIN TITLE
“Original instrumental main-title music for a premium heavy-walker science-fiction game. 76 BPM, minor mode with an ambiguous final chord. Begin with distant cable resonance, sparse prepared piano, and a three-note motif played by low horn; build gradually with contrabass winds, processed strings, modular pulses, and enormous but restrained industrial percussion. Mood: awe, duty, grief, and dangerous resolve. Wide cinematic dynamics, memorable original motif, no vocals, no choir, no trailer cliché, no recognizable reference to any existing franchise or composer. Structure: 20-second atmospheric opening, 45-second statement, 40-second development, 25-second restrained climax, loop-compatible tail.”

MUSIC PROMPT — CINDER MOON
“Instrumental adaptive exploration cue for a shattered low-gravity moon. 84 BPM, asymmetrical 5/4 pulse, brittle metallic ticks, radio-noise texture, glass harmonics, distant low brass, and slow modular bass. Convey exposed vacuum, orbital debris, and fragile machinery. Leave frequent space for radio dialogue and weapon sound. No vocals, no heroic anthem, no existing science-fiction theme. End on a clean loop point after 90 seconds.”

MUSIC PROMPT — WHITE MERIDIAN
“Instrumental tundra combat cue, 92 BPM, restrained taiko-like low percussion made from processed ice and metal, bowed bass, breathy contrabass woodwinds, cold granular pads, and a tense two-note ostinato. Start sparse for whiteout navigation, add pulse and brass for artillery contact, then open into determined strings for defense. No vocals, no generic trailer music, original harmony, loopable sections.”

MUSIC PROMPT — SUNKEN CROWN
“Instrumental storm-coast battle music, 100 BPM in 6/8, low drums, water-tank percussion, distorted hydrophone textures, brass swells that resemble waves without becoming nautical pastiche, and urgent modular arpeggios. Alternate moments of violent weather and brief exposed calm. Designed for walkers, boats, aircraft, and civilian evacuation. No vocals, no sea shanty, no existing theme, strong but original bar-boundary transitions.”

MUSIC PROMPT — RED EXPANSE
“Instrumental glass-desert siege cue, 88 BPM, dry irregular percussion, bowed metal, low strings, detuned analog pulse, and rare explosive brass. Convey lethal heat, mirage, and a horizon-scale rail cannon. Use silence before major impacts. No vocals, no stereotyped regional instruments, no franchise references, no continuous maximalism. Provide exploration, tension, and combat sections sharing the same motif.”

MUSIC PROMPT — THE SPLIT
“Instrumental moral-choice cue with no percussion for the first half. 64 BPM, prepared piano, solo viola, low synthetic heartbeat, distant industrial resonance, and a fragile version of the game’s original three-note motif. At the decision, divide into two possible continuations: one human and mournful with strings, one cold and strategic with modular pulses and low brass. Neither path should sound simply good or evil. No vocals, no sentimental cliché, no recognizable existing melody.”

MUSIC PROMPT — FINAL ASCENT
“Original instrumental final-operation score, 108 BPM, compound meter, massive industrial percussion with preserved dynamic range, low brass, urgent strings, modular sequencer, cable-strain samples, and the main three-note motif transformed into a rising phrase. Build in distinct gameplay-ready sections: approach, combined-arms assault, elevator ascent, final duel, system collapse, and aftermath. Heroic but costly rather than triumphant. No choir, no vocals, no trailer cliché, no resemblance to existing game music.”

SOUND-EFFECT PIPELINE
Design SFX as modular layers so the mixer can react to distance, environment, cockpit occlusion, weapon variant, heat, and damage.

For weapons create separate assets for:
- Mechanical prefire.
- Muzzle/transient.
- Body.
- Low-frequency report.
- Projectile pass-by.
- Distant tail.
- Indoor/urban reflection tail.
- Impact by armor, soil, concrete, water, shield, and internal structure.
- Reload/recycle.
- Dry fire or failure.

For walkers create:
- Foot plant by surface and weight class.
- Toe/ankle mechanics.
- Hip and torso servo.
- Reactor hum by load.
- Cooling fans and radiator deployment.
- Cockpit vibration and frame creak.
- Armor stress, actuator damage, cable snap, hydraulic loss, fall, stand, shutdown, startup, and destruction.

Use short generated durations for one-shots and loop-enabled longer durations for ambience. Request dry sounds without music or voice. Generate several variants and rotate them with pitch, gain, and timing variation. Layer and master in a DAW; do not rely on one generated file to carry an entire weapon.

SFX PROMPT — SCOUT FOOTSTEP
“Dry isolated sound effect, one foot plant from a 30-ton industrial combat walker onto frozen packed snow over rock. Sequence: fast hydraulic approach, compact metal joint clack, deep controlled impact, snow compression and ice fracture, short structural resonance. Powerful but lighter than a siege machine. No music, no voice, no ambience bed, no cinematic boom tail, no repeated steps, approximately 2.2 seconds.”

SFX PROMPT — SIEGE FOOTSTEP
“Dry isolated single footfall of a 100-ton siege walker on cracked urban concrete. Start with heavy servo strain and descending suspension, followed by a colossal low-frequency impact, concrete breakup, rebar vibration, armor rattle, and a delayed short structural groan. Realistic scale, not an explosion. No music, no voice, no long reverb, one step only, approximately 3 seconds.”

SFX PROMPT — HYPERVELOCITY CANNON
“Dry layered sci-fi kinetic cannon shot from a massive recoil-mounted walker weapon. Electromagnetic charge whine under one second, violent metallic launch transient, dense pressure crack, heavy breech recoil, sliding rail mechanism, and short capacitor decay. Grounded industrial physics, not a laser, not a naval cannon sample, no music, no voice, no long environment reverb, approximately 3.5 seconds.”

SFX PROMPT — PULSE BEAM
“Dry original pulse-beam weapon burst for a heavy combat walker: three tightly timed energy discharges with sharp ionized-air snaps, controlled electrical body, subtle thermal crackle, and cooling hardware chatter. Precise and dangerous, not a familiar film laser, no musical pitch sequence, no voice, no ambience, approximately 2 seconds.”

SFX PROMPT — MISSILE SALVO
“Dry close-perspective launch of twelve small guided missiles from armored dorsal cells. Rapid mechanical hatch clacks, staggered ignition transients, compressed rocket roar, turbulent exhaust, and empty-rack vibration. Distinct individual launches without becoming machine-gun fire. No impacts, no music, no voice, no long reverb, approximately 4 seconds.”

SFX PROMPT — ARMOR IMPACT
“Dry close impact of a large kinetic penetrator striking layered ceramic-composite walker armor without full penetration. Initial supersonic crack, violent ceramic shatter, deep metal plate flex, internal bolt rattle, and falling fragments. No gunshot source, no explosion, no music, no voice, approximately 1.8 seconds.”

SFX PROMPT — COCKPIT CRITICAL ALARM
“Original nonverbal cockpit critical-warning sound: urgent two-stage electronic pulse with a low mechanical relay click and a short descending fault tone, immediately recognizable but not shrill, designed to remain clear under combat audio. No speech, no melody, no resemblance to an existing game alarm, dry, one cycle approximately 1.2 seconds.”

SFX PROMPT — TUNDRA AMBIENCE
“Seamlessly looping frozen alien tundra ambience during a whiteout: deep wind pressure, fine snow striking armored surfaces, distant ice movement, occasional far industrial groan, and very subtle electromagnetic interference. No music, no voices, no animals, no close footsteps, stable 30-second loop, restrained low frequency so combat remains readable.”

AUDIO RUNTIME
- Web Audio API spatial mix with HRTF where available.
- Separate buses: master, music, dialogue, cockpit, weapons, impacts, machinery, vehicles, environment, UI.
- Sidechain music and nonessential effects under critical dialogue without making the mix pump.
- Cockpit occlusion filters exterior sound but preserves impactful low frequencies and critical enemy cues.
- Outdoor, forest, urban, cavern, hangar, and cockpit convolution/reverb zones.
- Distance modeling includes propagation delay only for very large distant events where it improves scale and does not impair gameplay.
- Dynamic-range presets: Night, Balanced, Cinema.
- Subtitle every spoken line and important radio event. Provide speaker, direction, and optional non-speech captions.
- Include tinnitus-safe option, reduced high-frequency alarm option, and independent dialogue boost.

HUD AND UI
Cockpit HUD must be diegetic-first but readable:
- Central reticle and convergence.
- Leg heading versus torso heading.
- Throttle and current speed.
- Heat and reactor load.
- Armor/internal silhouette with section state.
- Weapon groups, ammo, recycle, heat contribution, and range.
- Target range, velocity, facing, section damage, and lock state.
- Squad status and command acknowledgement.
- Compass, objective markers, and sensor contacts.
- Critical warning hierarchy.

Hangar UI:
- Full 3D turntable with section selection.
- Drag-and-drop and keyboard-accessible loadout editing.
- Live mass, heat, sustained damage, range, armor, speed, ammunition, and power graphs.
- Validate physical hardpoint clearance as well as abstract slot rules.
- Save, duplicate, share, import, and compare builds.
- Clearly explain why a configuration is invalid.

Do not copy the source game’s HUD composition, iconography, typography, colors, sounds, or wording. Build an original industrial-rescue visual system using high-contrast amber, white, cyan, and red states with colorblind-safe alternatives.

ACCESSIBILITY
- Full remapping for keyboard, mouse, controller, and supported flight controls.
- Separate sensitivity, acceleration, deadzone, inversion, and aim-assist settings.
- Toggle/hold choices for throttle, zoom, target lock, command wheel, and free look.
- Scalable HUD and subtitles.
- Colorblind palettes and symbol redundancy.
- Reduced camera shake, reduced flashes, reduced motion blur, and horizon stabilization.
- FOV control appropriate to cockpit geometry.
- Subtitle speaker labels, direction indicators, and non-speech captions.
- Difficulty assists for steering, heat, target lead, squad autonomy, and mission timing.

SECURITY AND OPERATIONS
- HTTPS everywhere; WebGPU requires a secure context on supporting browsers.
- API secrets only in server-side secret storage.
- Content Security Policy, strict CORS, signed asset URLs where appropriate, input validation, rate limiting, audit logs, and dependency scanning.
- Version every asset bundle and maintain a manifest with hashes.
- Save migration and rollback strategy for account/campaign data.
- Never allow generated user prompts to flow directly into privileged vendor API calls without moderation, quotas, and sanitization.
- Provide privacy controls, account deletion, telemetry consent, and regional compliance review.

REPOSITORY STRUCTURE
/apps/web                 website, menus, Babylon canvas, HUD
/apps/server              authoritative multiplayer and account API
/apps/admin               internal content review and asset dashboard
/packages/game-core       fixed-step simulation, damage, heat, weapons, missions
/packages/net-protocol    schemas, snapshots, commands, validation
/packages/rendering       materials, effects, LOD, streaming, postprocessing
/packages/audio           buses, spatial audio, dialogue, adaptive music
/packages/ui              shared React components and accessibility
/packages/content-schema  frames, weapons, missions, dialogue, localization
/packages/tools-tripo     server-side Tripo job submission and asset ingestion
/packages/tools-eleven    server-side ElevenLabs voice/music/SFX generation
/packages/testing         unit, integration, deterministic replay, performance
/assets-source            source art metadata, never served directly
/content                  versioned validated game data
/docs                     GDD, TDD, art bible, audio bible, narrative bible, ADRs

CONTENT MUST BE DATA-DRIVEN
- Frames, weapons, armor, modules, pilots, missions, objectives, spawns, dialogue triggers, salvage tables, AI roles, and audio events use validated schemas.
- Use stable IDs separate from display names.
- Support localization from the beginning.
- Mission scripts use event/state graphs with editor validation, not scattered hard-coded conditionals.
- Every content object records source file, author, version, license/rights status, and approval state.

DEVELOPMENT PHASES
PHASE 0 — FOUNDATION
- Create the GDD, technical design, art bible, audio bible, narrative bible, IP exclusion checklist, data schemas, repository, CI, and automated tests.

PHASE 1 — VERTICAL SLICE
Deliver one 15–20-minute original mission in the White Meridian biome with:
- One Scout, one Line, and one Heavy player chassis.
- Six weapons across kinetic, beam, and ordnance.
- Heat, localized damage, weapon grouping, salvage, repairs, and a four-unit squad.
- Tanks, missile carrier, aircraft, turret, and one objective structure.
- Functional cockpit, hangar, mission briefing, after-action report, voice, adaptive music, and spatial SFX.
- WebGPU and WebGL2 validation.

PHASE 2 — COMBAT DEPTH
- Full construction system, 10 chassis, 20+ weapons, expanded AI, damage visuals, biome modifiers, instant action, and performance budgets.

PHASE 3 — CAMPAIGN PRODUCTION
- Implement the seven operations, persistent consequences, 20 original chassis, cast, cinematics, mission variants, and accessibility.

PHASE 4 — MULTIPLAYER
- Dedicated authoritative servers, matchmaking, party flow, 8v8 modes, anti-cheat validation, replays, moderation, and load testing.

PHASE 5 — POLISH AND RELEASE
- Final asset optimization, browser matrix, network soak, save migration, localization, audio mastering, legal review, security review, telemetry review, store/landing page, and release candidate.

TESTING
- Unit tests for damage, heat, loadout legality, salvage, mission state, and data validation.
- Deterministic simulation/replay tests where possible.
- Integration tests for login, saves, mission completion, inventory, server reconciliation, reconnect, and branching campaign state.
- Automated browser tests for menus, settings, accessibility, and fallback renderer.
- Performance captures for every operation and quality preset.
- Asset validation: triangle count, texture dimensions, KTX2 presence, mipmaps, animation names, sockets, colliders, LODs, material count, and file size.
- Audio validation: peak, loudness, silence, clipping, loop seam, duration, subtitle link, and licensing metadata.
- Long multiplayer soak tests and adversarial network simulation.

ACCEPTANCE CRITERIA
- The vertical slice is playable from a public HTTPS URL without installing a native client.
- Controls communicate weight but remain responsive.
- Every hit visibly and mechanically corresponds to a body section.
- Heat decisions materially change firing and movement choices.
- Three distinct viable builds exist for each test chassis.
- Squad commands are acknowledged and executed reliably.
- Dialogue remains intelligible in maximum combat density.
- The Ultra preset looks exceptional at 4K while adaptive systems protect frame pacing.
- Runtime models use approved LODs and compressed web-ready assets; no raw high-poly Tripo output ships.
- WebGL2 fallback completes the same mission with reduced visual features.
- No shipped content contains protected franchise names, copied designs, copied text, copied music, copied voices, or copyrighted reference inputs without a license.
- All third-party generated assets have documented prompts, seeds, provenance, plan/usage rights, human review, and final approval.

WORKING METHOD FOR THE CODING AGENT
1. Do not respond with a vague design essay.
2. First create the repository plan, GDD, TDD, content schemas, ADRs, and vertical-slice backlog.
3. Then implement the smallest playable path: boot -> settings -> hangar -> briefing -> mission -> after-action -> saved progression.
4. At each checkpoint, run tests, report measurable results, list remaining risks, and provide exact files changed.
5. Use placeholders only when their replacement path is documented. Never pretend placeholder art or audio is final.
6. Keep systems modular and data-driven. Do not build all 26 missions before the vertical slice proves movement, combat, AI, streaming, audio, and performance.
7. When a requirement conflicts with browser performance, preserve the visual intent through LOD, streaming, compression, procedural variation, and adaptive quality rather than silently lowering quality or shipping unstable performance.
8. Begin now by producing:
   a. /docs/GDD.md
   b. /docs/TDD.md
   c. /docs/ART_BIBLE.md
   d. /docs/AUDIO_BIBLE.md
   e. /docs/NARRATIVE_BIBLE.md
   f. /docs/IP_EXCLUSION_CHECKLIST.md
   g. monorepo file tree
   h. content JSON schemas
   i. vertical-slice acceptance test plan
   j. the first implementation commit for boot, renderer selection, settings persistence, and a walkable test arena.
```

---

# 4. Practical quality notes

## Highest fidelity is a pipeline, not a checkbox

Tripo’s high-detail modes can create very dense source geometry. That is useful for baking, close-up renders, and concept evaluation, but browser runtime assets must be retopologized, segmented, rigged, given collision proxies, converted to LODs, texture-compressed, and validated. Use the high-poly output to preserve detail in normal maps and material masks.

## Audio should be layered and mastered

A single generated “big gun” file rarely produces the best interactive result. Generate and curate components—prefire, transient, body, tail, mechanical return, projectile, and impacts—then assemble them in a DAW and in the runtime mixer. Music should be built in compatible sections or separated into stems, then edited for bar-aligned transitions.

## Commercial-rights tracking is mandatory

Keep a provenance record for every generated model, texture, voice, line, music cue, and effect: prompt, model/version, seed, source inputs, date, account/plan, license/terms snapshot, reviewer, edits, and approval. Voice cloning requires the rights and consent of the voice owner. Verify current Tripo and ElevenLabs commercial terms before release.

---

# 5. Reference links reviewed

- https://en.wikipedia.org/wiki/MechWarrior_4:_Vengeance
- https://www.sarna.net/wiki/MechWarrior_4:_Vengeance
- https://www.sarna.net/wiki/MechWarrior_4/BattleMechs
- https://www.sarna.net/wiki/MechWarrior_4/Equipment
- https://www.sarna.net/wiki/MechWarrior_4/Vehicles
- https://www.sarna.net/wiki/MechWarrior_4/Characters
- https://www.sarna.net/wiki/Kentares_IV
- https://platform.tripo3d.ai/docs
- https://docs.tripo3d.ai/
- https://elevenlabs.io/docs/
- https://www.khronos.org/gltf/
- https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API

