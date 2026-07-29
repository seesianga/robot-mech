# Sovereign Ash: Nareth Protocol — Art Bible

## 1. Visual Identity

**Genre:** Grounded industrial science fiction
**Influences (non-franchise):** Aerospace engineering, mining machinery, emergency-rescue hardware, brutalist planetary infrastructure

**Core Visual Principle:** Every machine looks like it was engineered for a purpose, not styled for a toy shelf. Form follows mechanical function.

## 2. Signature Visual Language

### 2.1 Walker Design Principles

- Visible torsion spine connecting pelvis to torso ring
- Offset armored reactor cradle (never perfectly centered)
- Ring-shaped thermal radiators that glow with heat state
- Ceramic-composite plates over dark graphite joints
- Modular tool-derived weapon housings (weapons look like converted industrial tools)
- Realistic panel thickness, functional hinges, cables in protective guides
- Field-repaired asymmetry (especially Meridian Assembly faction)

### 2.2 Forbidden Silhouettes

**NEVER create:**
- Cat-ear cockpit heads
- Skull-faced assault heads
- Boxy shoulder missile pods (rectangular backpack launchers)
- Any arrangement strongly associated with existing named franchise chassis
- Humanoid "super robot" proportions

### 2.3 Leg Design

- Reverse-jointed (digitigrade) ONLY when mechanically justified for load distribution
- Standard forward-jointed for most Line/Heavy frames
- Four-toed load-distributing feet for Siege class
- Visible hydraulic knees, ankle actuators, toe grip mechanisms

## 3. Faction Visual Identity

### 3.1 Meridian Assembly (Faction A — Player Allied)

| Attribute | Description |
|-----------|-------------|
| Armor | Pale ceramic (off-white, light grey) |
| Joints | Dark graphite |
| Markings | Amber rescue/maintenance stripes |
| Character | Field-repaired asymmetry, welded patches, mismatched panels |
| Philosophy | Rescue machinery converted for war |
| Wear | Heavy use, honest repair, proud scars |

### 3.2 Helix Directorate (Faction B — Antagonist)

| Attribute | Description |
|-----------|-------------|
| Armor | Monolithic charcoal |
| Seams | Thin cold-white luminous lines |
| Panels | Precision alignment, minimal gaps |
| Character | Sensor-mast geometry, surveillance aesthetic |
| Philosophy | Centralized control, machine governance |
| Wear | Minimal — replaced rather than repaired |

## 4. Color System

### 4.1 UI/HUD Colors

| State | Color | Hex |
|-------|-------|-----|
| Primary/Active | Amber | #F5A623 |
| Information | Cyan | #4ECDC4 |
| Alert/Warning | White-Red | #FF6B6B |
| Critical | Deep Red | #C0392B |
| Background | Dark Graphite | #1A1A2E |
| Text | Warm White | #F0EDE8 |

### 4.2 Colorblind Alternatives

All states use shape + color redundancy:
- Friendly: circle marker
- Hostile: diamond marker
- Objective: triangle marker
- Neutral: square marker

## 5. Damage Progression Visuals

| Stage | Visual |
|-------|--------|
| Light | Scorched paint, surface scoring |
| Moderate | Chipped ceramic, exposed honeycomb substrate |
| Heavy | Severed cables, hydraulic spray (amber fluid), sparks |
| Critical | Warped armor, glowing internal structure, smoke |
| Destroyed | Disabled subassemblies, severed limbs, structural collapse |

## 6. Heat Visualization

- Radiator glow: emissive intensity scales with heat (amber → orange → white)
- Venting vapor: particle bursts at threshold crossings
- Paint discoloration: progressive browning/yellowing on hot sections
- Heat shimmer: refraction distortion above radiators
- Emissive reactor conduits: visible through armor gaps

## 7. Scale Cues

- Tiny service vehicles at walker feet
- Personnel lights on structures
- Trees bending under pressure waves
- Dust lagging behind footfalls (particle delay)
- Delayed distant sound (audio propagation)
- Collapsing façades on walker contact
- Aircraft flying below shoulder level

## 8. Environment Art Direction by Biome

### 8.1 Cinder Wake (Shattered Moon)
- Low-gravity debris fields, exposed vacuum
- Brittle metallic surfaces, orbital infrastructure
- Lighting: harsh directional (no atmosphere), deep shadows
- Palette: gunmetal, cold blue highlights, amber interior lights

### 8.2 White Meridian (Night-Side Tundra)
- Whiteout conditions, geothermal vents
- Ice formations over industrial infrastructure
- Lighting: minimal natural, thermal vision important
- Palette: blue-white, grey, amber geothermal glow

### 8.3 Verdant Fault (Mountain Forest)
- Dense canopy, geothermal caverns below
- Organic meets industrial
- Lighting: dappled forest, warm cavern glow
- Palette: deep green, brown, orange geothermal

### 8.4 Sunken Crown (Flooded Coast)
- Shallow water, storm systems, industrial coast
- Corroded metal, salt deposits
- Lighting: storm flashes, grey overcast
- Palette: teal, rust, grey

### 8.5 Red Expanse (Glass Desert)
- Day-side heat, silica storms, mirage
- Fused glass terrain, extreme sun
- Lighting: harsh overhead, heat distortion
- Palette: burnt orange, white-hot, deep shadow

### 8.6 City of Glass (Urban Twilight)
- Dense vertical city, maglev infrastructure
- Glass towers, neon utility lighting
- Lighting: mixed artificial, twilight sky
- Palette: deep blue, cyan, amber

### 8.7 Skyhook (Orbital Elevator)
- Massive tether structure, orbital debris
- Industrial cathedral scale
- Lighting: earthshine, structural floods
- Palette: charcoal, cold white, warning amber

## 9. Rendering Quality Tiers

| Feature | Ultra | High | Medium | Low |
|---------|-------|------|--------|-----|
| Resolution | Native (up to 4K) | Native | 75-100% | 50-75% |
| Shadows | Cascaded 4K | Cascaded 2K | Single 2K | Single 1K |
| Reflections | SSR + probes | Probes | Probes (low) | Off |
| Volumetrics | Full | Reduced | Off | Off |
| Particles | Full density | 75% | 50% | 25% |
| AA | TAA | TAA | FXAA | FXAA |
| LOD distance | Far | Medium | Near | Nearest |
| Anisotropy | 16x | 8x | 4x | 2x |

## 10. Asset Production Standards

### 10.1 Topology
- Clean quads for deformation areas (joints, radiators)
- Triangles acceptable for static armor plates
- No poles > 6 on deforming surfaces
- Minimum 3 edge loops at panel seams for clean bevels

### 10.2 UV Standards
- No stretching > 5% on visible surfaces
- Texel density consistent within asset class
- UV shells aligned to cardinal axes where possible
- Minimum 8px padding between shells at 4K

### 10.3 Material Standards
- PBR Metal/Roughness workflow
- Metals: roughness 0.2–0.6, metallic 1.0
- Ceramics: roughness 0.4–0.8, metallic 0.0
- Painted surfaces: roughness 0.3–0.7, metallic 0.0
- Emissive: separate channel, calibrated to nits

### 10.4 Naming Conventions
```
{faction}_{class}_{chassis}_{section}_{variant}
Example: meridian_scout_glint25_torso_base
```

## 11. Cockpit Design Principles

- Diegetic-first: all information exists as physical displays
- Thick structural canopy ribs (scale cue, framing)
- Two physical control sticks visible
- Left panel: heat/reactor
- Right panel: damage/weapons
- Central: transparent tactical display
- Overhead: emergency breakers
- Worn labels use fictional symbols (no readable brands)
- Amber instrument light, red emergency lighting
- Damage affects cockpit: cracked displays, sparking wires, smoke
