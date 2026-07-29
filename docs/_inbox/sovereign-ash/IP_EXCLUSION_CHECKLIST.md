# Sovereign Ash: Nareth Protocol — IP Exclusion Checklist

> **Purpose:** Ensure zero reproduction, adaptation, or close imitation of any protected MechWarrior/BattleTech intellectual property. Every element must be independently created.

## 1. Prohibited References

### 1.1 Names and Terminology (NEVER USE)

| Category | Prohibited Terms |
|----------|-----------------|
| Franchise | MechWarrior, BattleTech, BattleMech, 'Mech, Mech |
| Factions | Inner Sphere, Clans, ComStar, Word of Blake, Capellan, Draconis, Lyran, Federated Suns, Free Worlds League |
| Characters | Any named character from source material |
| Locations | Kentares IV, New Avalon, Luthien, Tharkad, Solaris VII, Terra, any canon planet |
| Technology | PPC, AC/20, LRMs (as branded), SRMs (as branded), JumpShip, DropShip (as branded), HPG |
| Organizations | Any canon military unit names |
| Products | Any canon chassis names (Atlas, Timber Wolf, Mad Cat, Locust, etc.) |

### 1.2 Visual Elements (NEVER REPRODUCE)

| Element | Prohibited |
|---------|------------|
| Silhouettes | Any recognizable BattleMech silhouette (Atlas skull, Locust shape, etc.) |
| Cockpit layouts | MechWarrior 4 HUD composition, icon arrangement |
| Logos | Any faction insignia, unit patches from canon |
| UI | MechWarrior menu structure, color schemes, typography |
| Maps | Any canon battlefield layouts |
| Art style | Direct tracing or close adaptation of canon artwork |

### 1.3 Audio (NEVER REPRODUCE)

| Element | Prohibited |
|---------|------------|
| Music | Any MechWarrior/BattleTech soundtrack melody, motif, or arrangement |
| Voice | Any canon character voice or performance style |
| SFX | Any recognizable weapon/mech sound from the franchise |
| Dialogue | Any canon dialogue lines or close paraphrases |

### 1.4 Narrative (NEVER REPRODUCE)

| Element | Prohibited |
|---------|------------|
| Story | Any canon storyline, mission sequence, or plot structure |
| Characters | Renamed or adapted canon characters |
| Factions | Adapted canon factions with different names |
| Themes | "Reclaiming family throne" (MW4 specific plot) |
| Dialogue | Paraphrased canon dialogue |

## 2. Original Replacements

| Source Concept | Our Original |
|---------------|--------------|
| BattleMech | Combat Frame / Walker |
| MechWarrior | Frame Pilot / Commander |
| Inner Sphere | Nareth (single colony) |
| Clans | Helix Directorate |
| ComStar/HPG | Crown Array |
| 'Mech chassis names | GLINT-25, VANDAL-40, RAMPART-60, etc. |
| PPC | Charged Ion Lance |
| AC/20 | Heavy Autocannon |
| LRMs | Long-Range Missiles (generic term) |
| JumpShip/DropShip | Relief Carrier / Orbital Lander |
| C-Bill | Credits (generic) |
| Star League | Pre-collapse colonial administration |

## 3. Review Process

### 3.1 Asset Review Gates

Every asset passes through IP review before approval:

1. **Concept Stage:** Silhouette review against known franchise shapes
2. **Generation Stage:** Tripo prompt review (no franchise references in prompts)
3. **Model Stage:** Visual comparison against prohibited silhouettes
4. **Texture Stage:** No canon color schemes, markings, or patterns
5. **Animation Stage:** No franchise-specific movement signatures
6. **Audio Stage:** A/B comparison against canon sounds (must be distinct)
7. **Text Stage:** All names, dialogue, descriptions scanned for prohibited terms
8. **Final Stage:** Holistic review — "Would a reasonable person associate this with [franchise]?"

### 3.2 Automated Checks

- [ ] String scan: No prohibited terms in code, comments, metadata, filenames
- [ ] Asset metadata: No franchise references in Tripo/ElevenLabs prompts
- [ ] Visual: Silhouette comparison tool (manual review with reference sheet)
- [ ] Audio: Spectral comparison against reference samples (manual)
- [ ] Legal: Trademark search on all proper nouns before release

### 3.3 Documentation Requirements

Every generated asset must record:
- Original prompt (verified free of franchise references)
- Generation parameters and seeds
- Reviewer name and date
- IP clearance sign-off
- Edits made post-generation

## 4. Code and Comments

### 4.1 Forbidden in Codebase

- No franchise names in variable names, comments, or documentation
- No reference URLs to franchise wikis in code comments
- No "inspired by [franchise]" notes
- No comparison comments ("like a [chassis name]")

### 4.2 Acceptable References

- Generic genre terms: "mech simulator", "walker combat", "cockpit-based"
- Technical references: glTF spec, WebGPU docs, physics papers
- Original project documentation only

## 5. Marketing and Public Communication

- Never reference the source franchise in marketing
- Never use "if you liked [franchise], try this"
- Never compare directly to franchise games
- Genre comparisons acceptable: "cockpit-based walker sim" without naming specific titles
- All press materials reviewed for IP compliance

## 6. Legal Review Triggers

Escalate to legal review if:
- Any asset receives > 2 "resembles [franchise]" flags in review
- Any proper noun has > 60% phonetic similarity to canon terms
- Any silhouette test produces uncertainty
- Any third-party contributor references franchise in their work
- Community feedback identifies potential similarity

## 7. Sign-Off Authority

| Level | Authority | Scope |
|-------|-----------|-------|
| Asset-level | Art Director | Individual models, textures, sounds |
| System-level | Game Director | Mechanics, UI, overall feel |
| Release-level | Legal Counsel | Full product clearance |
| Ongoing | QA Lead | Post-release monitoring |

---

**This checklist is a living document. Update as new risks are identified.**
