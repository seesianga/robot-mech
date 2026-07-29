# Sovereign Ash: Nareth Protocol — Audio Bible

## 1. Audio Vision

**Core Principle:** Sound communicates mass, danger, and mechanical reality. The player should feel the machine's weight through every footfall, recoil, and structural groan. Audio must never obscure critical gameplay information.

**Sonic Identity:** Industrial, mechanical, grounded. No generic sci-fi laser pew-pew. Weapons sound like converted mining equipment. Walkers sound like walking factories. The world sounds like heavy industry under stress.

## 2. Bus Architecture

```
Master (-0 dBFS ceiling, -14 LUFS integrated target)
├── Music          (-6 dB default, adaptive layers)
├── Dialogue       (-3 dB default, sidechain priority)
├── Cockpit        (-6 dB, occlusion-filtered interior)
├── Weapons        (-4 dB, layered one-shots)
├── Impacts        (-5 dB, material-dependent)
├── Machinery      (-8 dB, loops + servos)
├── Vehicles       (-6 dB, engines + movement)
├── Environment    (-10 dB, ambiences + weather)
└── UI             (-8 dB, interface feedback)
```

## 3. Dynamic Range Presets

| Preset | Compression | Use Case |
|--------|-------------|----------|
| Night | Heavy (12:1 above -20dB) | Quiet environments, late night |
| Balanced | Medium (4:1 above -14dB) | Default, most players |
| Cinema | Light (2:1 above -8dB) | Headphones, dedicated listening |

## 4. Spatial Audio

### 4.1 Engine
- Web Audio API PannerNode
- HRTF panning where browser supports
- Fallback: equal-power stereo panning

### 4.2 Distance Model
- Inverse clamped: `gain = maxDistance / (maxDistance + rolloff * (distance - refDistance))`
- Reference distance: 5m (walker scale)
- Max distance: 2000m
- Rolloff: 1.0 (adjusted per source type)

### 4.3 Cockpit Occlusion
- Low-pass filter on exterior buses: cutoff 800Hz when sealed
- Preserve sub-bass (< 100Hz) for impact feel
- Critical enemy cues bypass occlusion (gameplay clarity)
- Canopy damage increases high-frequency bleed

### 4.4 Propagation Delay
- Applied ONLY to very large distant events (> 500m)
- Speed of sound: 343 m/s
- Maximum delay: 3 seconds (then fade)
- Never applied to gameplay-critical cues

## 5. Weapon Sound Design

### 5.1 Layered Architecture

Each weapon uses modular layers mixed at runtime:

| Layer | Purpose | Duration |
|-------|---------|----------|
| Pre-fire | Mechanical charge/spool | 0.2–1.0s |
| Transient | Initial attack (muzzle/launch) | 10–50ms |
| Body | Main character | 0.1–0.5s |
| LF Report | Low-frequency pressure | 0.2–0.8s |
| Pass-by | Projectile Doppler (if applicable) | 0.3–1.0s |
| Distant Tail | Far-off report | 0.5–2.0s |
| Reflection | Urban/indoor echo | 0.3–1.5s |
| Impact | Material-specific hit | 0.2–1.0s |
| Reload/Recycle | Mechanical reset | 0.5–3.0s |
| Dry Fire | Failure/empty | 0.1–0.3s |

### 5.2 Weapon Character Guidelines

| Weapon Type | Character |
|-------------|-----------|
| Autocannon | Mechanical, punchy, belt-feed clatter |
| Rail Lance | EM charge whine → violent launch → capacitor decay |
| Pulse Beam | Ionized-air snaps, electrical body, cooling chatter |
| Cutter Beam | Continuous industrial cutting, humming transformer |
| Missiles | Hatch clacks → staggered ignition → rocket roar |
| Plasma | Superheated gas release, thermal crackle |

### 5.3 Variation System
- 3–5 variants per layer
- Random pitch: ±3 semitones
- Random gain: ±2 dB
- Random timing: ±20ms on multi-layer triggers
- Never repeat same variant consecutively

## 6. Walker Sound Design

### 6.1 Footstep System

Parameters: weight class, surface material, gait speed

| Weight | Character |
|--------|-----------|
| Scout (25–35t) | Hydraulic approach → joint clack → controlled impact → surface response |
| Line (40–55t) | Servo strain → metal impact → ground compression → structural resonance |
| Heavy (60–80t) | Heavy servo → deep impact → ground shake → armor rattle |
| Siege (85–100t) | Extreme servo strain → colossal LF impact → concrete breakup → delayed groan |

### 6.2 Surface Materials
- Packed snow/ice
- Rock/gravel
- Concrete/asphalt
- Metal grating
- Water (shallow/deep)
- Sand/glass desert

### 6.3 Mechanical Layers (Continuous)
- Reactor hum (pitch/volume by load)
- Cooling fans (speed by heat)
- Torso traverse servo
- Hip/knee/ankle articulation
- Gyro stabilizer whine
- Cockpit vibration (RPM-based)

## 7. Adaptive Music System

### 7.1 State Machine

```
Exploration → Suspicion → Contact → Full Combat
     ↓            ↓          ↓          ↓
  (calm)      (tension)   (rhythm)   (intensity)
                                        ↓
                              Critical Damage / Objective Success
                                        ↓
                              Retreat/Loss / Post-Mission
```

### 7.2 Transition Rules
- Transitions occur at bar boundaries ONLY
- Crossfade duration: 1–2 bars
- Layers share: key, meter, tempo, phrase length
- No abrupt cuts (except designed stingers)

### 7.3 Musical Palette

| Element | Source |
|---------|--------|
| Mass | Low brass, contrabass winds |
| Industry | Granular percussion (metal strain, hydraulic impacts, cable tension) |
| Systems | Modular synthesis |
| Human cost | Processed strings |
| Memory/loss | Prepared piano / hammered dulcimer |
| Sub-bass | Selective use, preserve headroom for SFX |

### 7.4 Forbidden Musical Elements
- Constant wall-to-wall percussion
- Generic trailer braams
- Recognizable melodies from any existing franchise
- Heroic anthem structures
- Sea shanties, regional stereotypes

## 8. Voice Direction

### 8.1 Processing Chain (Runtime)

```
Dry dialogue (ElevenLabs output)
  → Radio EQ (bandpass 300Hz–4kHz for comm quality)
  → Helmet resonance (short convolution, ~80ms)
  → Light compression (3:1)
  → Optional distortion (damage state)
  → Optional packet loss (damage state)
  → Spatial positioning
  → Bus routing (Dialogue bus)
```

### 8.2 Intelligibility Rules
- Dialogue ALWAYS ducks music (-6dB) and non-essential SFX (-3dB)
- Duck attack: 50ms, release: 300ms
- Radio processing NEVER makes objectives unclear
- Critical mission info repeated if player takes > 5s damage

### 8.3 Subtitle Requirements
- Every spoken line subtitled
- Speaker name + color coding
- Direction indicator (L/R/Behind)
- Non-speech captions for important events
- Scalable (0.8x–1.5x)

## 9. Environmental Audio by Biome

| Biome | Ambience Character |
|-------|-------------------|
| Cinder Wake | Vacuum silence + structural vibration, radio noise, distant debris impacts |
| White Meridian | Deep wind pressure, snow on armor, distant ice movement, EM interference |
| Verdant Fault | Forest wind, geothermal hiss, cavern drip, distant machinery |
| Sunken Crown | Waves, rain, wind gusts, hull creaking, distant thunder |
| Red Expanse | Dry wind, silica hiss, thermal expansion ticks, oppressive silence |
| City of Glass | Urban hum, maglev whoosh, distant crowds, electrical infrastructure |
| Skyhook | Cable strain, structural groan, orbital debris, atmosphere thinning |

## 10. Accessibility Audio Options

| Option | Effect |
|--------|--------|
| Tinnitus-safe | Removes high-frequency ringing effects |
| Reduced HF alarms | Lowers alarm frequencies below 8kHz |
| Dialogue boost | +3 to +9 dB on dialogue bus |
| Mono output | Collapses spatial to single channel |
| Visual audio cues | On-screen indicators for directional sound |

## 11. Audio Asset Standards

| Parameter | Standard |
|-----------|----------|
| Source format | WAV 48kHz / 24-bit |
| Runtime format | Opus 48kHz (voice), Vorbis/Opus (SFX/music) |
| Loudness target | -14 LUFS integrated (music), -18 LUFS (ambience) |
| True peak | -1 dBTP maximum |
| Loop seams | < 5ms crossfade, validated |
| Silence trimming | < 100ms leading/trailing |
| Metadata | Prompt, seed, date, reviewer, license |
