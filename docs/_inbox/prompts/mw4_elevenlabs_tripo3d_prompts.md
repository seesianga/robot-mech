# MechWarrior Extended Campaign — Asset Generation Prompts
## ElevenLabs (voice) + Tripo3D (3D models) for Operations 8 & 9

**Scope:** Every prompt below maps directly to the nine missions in `mw4_extended_missions_op8-9.md`. Section 1 gives you voice designs and recorded-line scripts for ElevenLabs; Section 2 gives you model prompts for Tripo3D plus a per-mission asset checklist.

**A note on IP:** The 3D prompts describe original designs in the classic "big stompy war robot" style rather than asking the generator to copy trademarked BattleTech units, so Tripo will produce its own take on each archetype. Character names and dialogue are original writing from the extended campaign.

---

# SECTION 1 — ELEVENLABS

**Workflow:** Create each character in Voice Lab → Voice Design using the description prompts below, then synthesize the mission scripts with that voice. Use the **Eleven v3** model if you want the bracketed performance tags read as delivery directions; on **Multilingual v2**, delete the bracket tags and rely on settings instead.

**Suggested settings:** Narrator/newscast — Stability 0.60, Similarity 0.75, Style 0.15. Lance chatter and combat lines — Stability 0.40, Similarity 0.75, Style 0.35. Villain monologues — Stability 0.50, Style 0.45.

**Radio effect:** ElevenLabs won't add comms distortion natively. Render clean, then in post apply a band-pass filter (~300 Hz–3 kHz), light distortion/bitcrush, and a squelch click at line start/end for all in-cockpit radio lines. Leave briefings and newscasts clean.

## 1A. Voice Design prompts

**Command Narrator (mission briefings):** "Middle-aged male military intelligence officer delivering a classified briefing. Low baritone, calm, clipped, and measured. Neutral accent, faintly weary, zero theatrics, slight command-room reverb."

**Ian Dresari (Duke, player character):** "Male, early thirties, noble-born soldier. Firm mid-range voice with controlled anger held just under the surface. Quiet authority, short sentences, cold and resolute. Aristocratic but battle-worn, minimal warmth."

**Terra Risner (lancemate):** "Female, late twenties, veteran MechWarrior. Confident alto with a slight rasp. Direct, principled, occasionally defiant, clear military diction."

**Jen McQuarrie (lancemate):** "Female, mid-thirties, dry-witted combat pilot. Warm mezzo with a sardonic edge, quick delivery, gallows humor, completely relaxed under fire."

**Casey Nolan (lancemate):** "Male, thirties, steady reliable wingman. Plain, workmanlike mid-range voice, unhurried, calls out targets and timers without drama."

**Jules Gonzales (lancemate):** "Male, mid-forties, grizzled veteran sergeant. Gravelly low voice, blunt, economical, protective of the younger pilots."

**Kommandant Elise Voss (Op8 M1):** "Female, forties, Lyran line officer. Cold, precise alto with a slight Germanic accent, clipped consonants, condescending calm that cracks into urgency when losing."

**"Kingfisher" (Op8 M2 spotter):** "Male, sixties, weathered coastal fisherman. Rough, hearty voice with a thick brogue, shouting over wind and engine noise, salt-of-the-earth cheer."

**"Blackard" (Op8 M3 pirate leader):** "Male, fifties, ex-soldier turned raider. Smoke-damaged growl, mocking sing-song taunts, sudden unhinged laughter, lazy menacing drawl."

**Baron Aldous Tremont (Op8 M4):** "Male, sixties, cornered aristocrat. Plummy, over-enunciated, oily politeness sliding into breathless panicked pleading."

**Leutnant-Colonel Marta Hess (Op8 M4):** "Female, fifties, intelligence officer. Quiet, icy, almost affectless monotone, unsettlingly calm, every word deliberate."

**Hauptmann Dieter Falk (Op8 M5):** "Male, fifties, fanatic garrison commander. Deep harsh bass with a Germanic accent, slow deliberate menace, parade-ground projection, zealous contempt."

**Colonel Katherine Vane (Op9, main antagonist):** "Female, forties, mercenary colonel. Smooth low alto, unhurried and professional, faint amusement, courteous menace — a soldier who genuinely respects her enemy."

**Voice of Kentares (newscasts):** "Female, thirties, broadcast news anchor. Bright, clear, well-paced delivery carrying an undertone of wartime gravity and cautious hope."

## 1B. Mission scripts

### Operation 8, Mission 1 — Secure the Starport
- **Narrator (briefing):** "Omega Lance, this is Command. A Steiner rearguard under Kommandant Elise Voss holds the Kentares City starport. They are loading the DropShip *Valkyrie's Wrath* with the planetary treasury — and Roland's intelligence archives. If that ship lifts, every collaborator file on this world goes with it. Ground her. Good hunting."
- **Voss:** "[calm] Dresari. Grant my column free passage to the jump point, and the archives are yours. [beat] Refuse, and I burn them on the pad."
- **Ian:** "[cold] You mistake this for a negotiation, Kommandant. Nothing on that ship leaves my world."
- **McQuarrie:** "[dry] Fuel farm on our left, civilians on our right. Try not to sneeze, people."
- **Nolan:** "[urgent] Launch countdown is running! Hit those drive housings, now!"

### Operation 8, Mission 2 — The Argonne Remnant
- **Narrator (briefing):** "The destroyer *Vigilant* has been shelling the Meridian Coast from Argonne, the last Lyran naval base still in arms. Silence the shore batteries, clear her escort screen, and put her on the bottom before she reaches deep water."
- **Kingfisher:** "[shouting over wind] Kingfisher here! Batteries on the north headland — I paint them, you break them!"
- **McQuarrie:** "[sardonic] Two destroyers at Vale, and now this. I am filing for a navy pension, Ian."
- **Gonzales:** "[gravelly, urgent] She's making for the harbor mouth. All guns on the *Vigilant*!"

### Operation 8, Mission 3 — Wolves of the Tundra
- **Narrator (briefing):** "Relief convoys into the Elysium tundra are being hit by raiders flying no colors — Lyran deserters gone pirate. See the convoy through Widow's Pass, then follow their trail home and burn it."
- **Blackard:** "[mocking drawl] Well, well. The Duke's own lapdogs, up here in the cold with us strays. [laughs] Come and get bit!"
- **Risner:** "[quiet] These were soldiers once. Look what the war left of them."
- **Rescued driver:** "[shaken, relieved] We thought we were dead. Thank you — thank the Duke."

### Operation 8, Mission 4 — The Duke's Justice
- **Narrator (briefing):** "Baron Tremont is smuggling Marta Hess — Roland's chief of intelligence — to a hidden airstrip in the Meer highlands, along with the only surviving copy of the collaborator files. Nothing reaches that shuttle. How you stop the Colonel's van is the Duke's call."
- **Tremont:** "[panicked, plummy] Hold your fire! I am a peer of this realm — I demand—"
- **Ian:** "[quiet, dangerous] You demand nothing, Baron. Stand your guard down, or share their grave."
- **Risner:** "[urgent] Ian — she's worth more alive! There are names in that van we will never recover! [beat, bitter] ...Yes, my Duke."
- **Hess:** "[icy monotone] Kill me, and the truth dies clean. Take me alive, and it stains everyone. Choose."

### Operation 8, Mission 5 — The Last Garrison
- **Narrator (briefing):** "Karst Redoubt. Hauptmann Dieter Falk, the last of Castro's guard, holds the fortress with a company of die-hards and two hundred political prisoners. Get the commandos to the turret bunker, breach the gate, and reach those cells before he does."
- **Falk:** "[deep, contemptuous] So. The butcher of Kentares comes to my gate himself. Two hundred souls in my cells, Dresari. Turn back — or I start with the old ones."
- **Ian:** "[level fury] Harm one of them, Falk, and I will unmake this mountain around you."
- **Commando lead:** "[tense whisper] Charges set. Turret grid going dark in three, two—"
- **Voice of Kentares (epilogue):** "The Voice of Kentares confirms: the last Lyran garrison has struck its colors. The occupation is over. Yet sources on Tharkad speak of new contracts, quietly signed..."

### Operation 9, Mission 1 — Eyes on the Drop
- **Narrator (briefing):** "Orbital watch tracked multiple DropShips grounding on the Hardra Peninsula. Before the Duke commits us, we need eyes on their strength. Image the three landing zones, tag their fuel dumps, and get out. Preferably unseen."
- **Vane (intercept):** "[smooth, amused] Talon Actual to all pickets. Our hosts will come looking. When they do — be polite. I want the Duke to know exactly who has come calling."
- **Risner:** "[whispers] Beacon three planted. Ghosting back to the extraction point."

### Operation 9, Mission 2 — Cut the Chain
- **Narrator (briefing):** "The Talons' entire supply line crosses the Hardra gorge on one heavy bridge. Escort the engineers in, hold while they rig the span, burn the depot on the far bank, and be gone before their heavies arrive. We have run this play before."
- **Engineer:** "[strained] Four minutes on the span! Keep them off us!"
- **Vane:** "[courteous] Nothing personal, your Grace. The Archon simply pays better than yours ever could. [beat] Walk away, and I leave your cities standing."
- **Ian:** "[grim] You're on my land, Colonel. There is nowhere to walk."

### Operation 9, Mission 3 — The Line at Jeteel
- **Narrator (briefing):** "The Talon main body is driving on Jeteel and the evacuation is still loading. Hold the three sectors, keep the guns alive, and do not let that column die on the road."
- **Denali lead:** "[warm, steady] Denali Lance on station. Good to fight beside you again, Omega."
- **Talon XO:** "[harsh] Breakthrough element — forward! Roll over them!"
- **McQuarrie:** "[shouting] Ammo trucks coming up — reload fast, wave three inbound!"

### Operation 9, Mission 4 — Duel at the Palace Gates
- **Narrator (briefing):** "Vane is gambling everything on a decapitation strike — straight up the palace approach. This ends where it began, in the streets of Kentares City. Command out... and good luck, your Grace."
- **Vane (endgame):** "[calm, formal] The jamming is mine, Dresari. No lances. No tricks. You killed your own blood in these streets — show me that man. [soft] Colonel Katherine Vane requests the honor."
- **Ian:** "[grim] You'll have it. And Kentares will bury you with more respect than you have earned."
- **Ian (post-duel):** "[quiet, exhausted] Command... it's done. Tell the Talons their contract died with her."

---

# SECTION 2 — TRIPO3D

**Workflow:** One object per prompt — Tripo3D handles single subjects far better than scenes. Generate, pick the best draft, then Refine. For anything you plan to rig (the 'Mechs), add "standing in a neutral A-pose, legs slightly apart, arms lowered" so the skeleton binds cleanly. Keep the same style suffix on every prompt so all assets read as one game.

**Shared style suffix (append to every prompt below):** `military science fiction, hard-surface game asset, battle-worn painted armor with chipped edges and unit decals, PBR materials, clean readable silhouette, neutral studio background`

## 2A. BattleMech archetypes
*Each entry lists which campaign units it stands in for — generate once, retint and decal per faction (Dresari green/gold, Steiner blue/white, pirate rust, Gray Talon grey/red).*

- **Assault command 'Mech** *(Atlas role — Falk, heavy guard lances):* "Colossal 100-ton bipedal war robot, broad barrel-chested torso, massive squared shoulder armor, grim skull-motif armored head, thick trunk-like legs, ballistic cannon on one arm and energy cannon on the other, standing in a neutral A-pose"
- **Assault weapons platform** *(Daishi role — Vane, Talon XO):* "Extremely heavy bipedal war machine, wide flat-topped armored torso, both arms replaced by huge multi-barrel weapon pods, low set cockpit visor, wide stable legs, neutral A-pose"
- **Twin-cannon siege 'Mech** *(Mauler role):* "Slab-sided heavy bipedal robot with tall boxy torso, paired stacked autocannon arrays on each shoulder, narrow armored head, angular plating, neutral A-pose"
- **Noble humanoid assault 'Mech** *(Zeus / Awesome role):* "Broad-chested humanoid battle robot, knight-like proportions, shield-shaped forearm plating, long-barreled particle cannon arm, crested armored head, neutral A-pose"
- **Hunched missile carrier** *(Vulture role):* "Heavy birdlike war robot with hunched forward torso, two large box missile racks mounted over the shoulders, reverse-jointed digitigrade legs, no hands, weapon-pod arms, neutral stance"
- **Birdlike heavy omni 'Mech** *(Thor / Loki role):* "Heavy digitigrade battle robot, angular hunched torso, asymmetric arms — one long energy cannon, one clawed weapon mount — narrow sensor head, reverse-jointed legs, neutral stance"
- **Fire-support missile 'Mech** *(Catapult role):* "Heavy fire support robot with rounded cockpit-forward torso, two large armored missile launcher boxes mounted like ears on either side, no arms, strong reverse-jointed legs, neutral stance"
- **Workhorse heavy 'Mech** *(Argus role):* "Rugged utilitarian heavy bipedal robot, riveted industrial armor plating, rotary cannon arm, boxy shoulders, sturdy straight legs, neutral A-pose"
- **Low-slung medium trooper** *(Bushwacker role):* "Medium battle robot with long low horizontal torso like an armored muzzle, cockpit at the nose, weapon pods along the flanks, digitigrade legs, neutral stance"
- **Medium skirmisher** *(Uziel / Chimera role):* "Agile medium humanoid battle robot, twin shoulder-mounted cannons, compact torso with jump jet nozzles on the back, angular armor, neutral A-pose"
- **Fast recon 'Mech** *(Shadow Cat role):* "Sleek medium scout war robot, smooth rounded armor, single long cannon arm, light frame built for speed, digitigrade legs, neutral stance"
- **Birdlike light scouts** *(Cougar / Uller / Raven role):* "Small fast birdlike scout robot, angular beak-shaped sensor nose, slender reverse-jointed legs, twin light weapon pods, neutral stance"
- **Light humanoid striker** *(Osiris role):* "Small nimble humanoid battle robot, narrow winged silhouette, light armor panels, small laser arms, sprinter's legs, neutral A-pose"
- **Pirate patchwork modifier** *(Blackard's lance — apply to any archetype above):* append "…mismatched salvaged armor plates in clashing colors, heavy rust and scorch marks, welded scrap repairs, one arm replaced by a crude oversized cannon"

## 2B. Vehicles and craft

- **Spheroid DropShip** *(Valkyrie's Wrath, Talon landers):* "Colossal egg-shaped military spacecraft standing on four heavy landing legs, hull ringed with turrets, cargo ramps and hatches, heat-scorched ablative plating"
- **Blue-water destroyer** *(Vigilant):* "Futuristic naval destroyer warship, angular stealth superstructure, twin forward gun turrets, vertical missile cells amidships, grey wartime hull"
- **Fast patrol boat:** "Small futuristic armed patrol boat, planing hull, single deck gun, rear missile rack, spray-worn grey paint"
- **Hover tank:** "Military hovercraft tank with armored skirt, turret-mounted twin cannons, rear turbofans"
- **Anti-air tank:** "Tracked military anti-aircraft tank, rotating turret with four-barrel autocannon array and folding radar dish"
- **Armored car:** "Wheeled six-wheel armored military scout car, small cannon turret, angular hull"
- **Cargo crawler:** "Massive tracked cargo hauler, flatbed stacked with strapped shipping containers, small forward crew cab"
- **Command van** *(Hess's vehicle):* "Armored eight-wheel military command van, antenna masts and sensor domes on the roof, no visible weapons"
- **Fuel tanker truck:** "Rugged military fuel tanker truck, cylindrical armored tank, hazard markings"
- **Relief truck:** "Canvas-backed military cargo truck with red cross relief markings, all-terrain wheels"
- **VTOL gunship:** "Twin-turbofan military VTOL gunship, stubby weapon-pod wings, armored chin turret, no rotor blades"
- **Evac transport VTOL:** "Boxy twin-turbofan VTOL transport aircraft, rear loading ramp, red cross markings"
- **Self-propelled artillery:** "Tracked self-propelled artillery vehicle, very long heavy howitzer barrel, rear stabilizer spades"
- **Combat engineer vehicle:** "Armored tracked engineering vehicle with forward dozer blade and folding crane arm"
- **VIP shuttle** *(airstrip escape craft):* "Small sleek aerodyne VIP shuttle, swept delta wings, boarding stairs, polished hull"
- **Fishing trawler** *(Kingfisher):* "Weathered working fishing trawler, rust-streaked hull, boom crane, stacked crab pots"
- **Civilian ferry** *(Jeteel evacuation):* "Mid-size civilian passenger ferry, open vehicle deck, twin stacks, worn white and blue paint"

## 2C. Structures and props

- **Starport control tower:** "Tall futuristic airport control tower, hexagonal glass observation deck, antenna cluster, concrete shaft"
- **DropShip hangar:** "Huge arched military hangar with massive sliding doors, ribbed metal roof, gantry lights"
- **Fuel farm tank:** "Large cylindrical industrial fuel storage tank with external pipework, valve manifold and safety railings" *(cluster three to five in-engine)*
- **Coastal gun battery:** "Fortified concrete coastal artillery emplacement, twin long naval gun barrels under an armored casemate"
- **Defense turret:** "Automated military defense turret on a reinforced pedestal, twin rotary cannons, armored sensor cluster" *(retexture for starport, fortress, and palace grids)*
- **Searchlight tower:** "Tall lattice steel watchtower topped with a large swiveling searchlight and small radar dish"
- **Arctic outpost module** *(pirate den):* "Prefabricated arctic military outpost building, rounded insulated panels, snow buildup on roof, external heater units, improvised scrap barricades"
- **Airstrip flak nest:** "Sandbagged anti-aircraft gun position, quad autocannon on pintle mount, ammo crates"
- **Fortress gatehouse** *(Karst Redoubt):* "Massive alpine fortress gatehouse carved into rock, armored blast gate, flanking gun casemates, overhanging battlements"
- **Fortress wall segment:** "Thick sloped fortress curtain wall segment of reinforced concrete and stone, firing ports, integrated turret base" *(tile in-engine)*
- **Prison cellblock:** "Grim rectangular military prison block, tiny barred windows, razor-wire fenced yard, guard catwalk on the roof"
- **Heavy truss bridge span:** "Heavy steel truss bridge span for armored vehicles, riveted girders, concrete piers" *(model intact; make a second 'destroyed' pass with snapped girders for the demolition set-piece)*
- **Supply depot warehouse:** "Long military warehouse, corrugated walls, loading dock with stacked crates and fuel drums"
- **Target beacon prop:** "Small deployable military target beacon, tripod legs, folding antenna, blinking indicator dome"
- **Palace gate facade:** "Grand ducal palace gate facade, tall armored doors set in carved stone arch, twin banner poles, battle damage"
- **Ruined city block:** "War-torn futuristic city building, collapsed floors, exposed rebar, rubble skirt, scorch marks" *(generate two or three variants and scatter)*

## 2D. Per-mission asset checklist

| Mission | 'Mech archetypes | Vehicles/craft | Structures/props |
|---|---|---|---|
| 8-1 Starport | Light scouts, striker, noble assault, fire-support, low-slung trooper | Spheroid DropShip, cargo crawler, AA tank | Control tower, hangar, fuel tanks, defense turrets |
| 8-2 Argonne | Skirmisher, fast recon, birdlike scout, fire-support | Destroyer, patrol boat, hover tank, fuel tanker, trawler | Coastal battery, depot warehouse |
| 8-3 Tundra | Any archetypes + pirate modifier, birdlike scouts | Relief truck, armed truck (reuse cargo crawler) | Arctic outpost, searchlight tower |
| 8-4 Duke's Justice | Workhorse heavy, skirmisher ×2 | Command van, armored car, VIP shuttle | Airstrip flak nest |
| 8-5 Last Garrison | Birdlike heavy omni, hunched missile carrier, siege, assault command | — | Gatehouse, wall segments, cellblock, defense turrets |
| 9-1 Eyes on the Drop | Light scouts, fast recon | Spheroid DropShip, VTOL gunship, fuel tanker | Searchlight towers, beacon prop, firebase ruins (ruined block) |
| 9-2 Cut the Chain | Low-slung trooper, workhorse, fire-support; late birdlike heavies, siege | Combat engineer vehicle, cargo crawler | Truss bridge (intact + destroyed), depot warehouse |
| 9-3 Jeteel | Missile carrier, birdlike heavy, noble assault, weapons platform (XO) | Self-propelled artillery, fuel/ammo trucks, civilian ferry, evac VTOL | Ruined blocks, HQ compound (reuse warehouse) |
| 9-4 Palace Duel | Siege, noble assault, birdlike heavy, fire-support, weapons platform (Vane) | — | Palace gate facade, defense turrets, ruined city blocks |
