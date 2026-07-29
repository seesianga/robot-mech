# Vertical Slice Acceptance Test Plan

## Mission: WHITE MERIDIAN — ICEFALL (Mission 5)

**Duration:** 15–20 minutes
**Biome:** Night-side tundra, whiteout conditions
**Objective:** Hot-drop into whiteout, secure geothermal landing site, use thermal vision to distinguish enemies from industrial machinery

---

## 1. Boot and Renderer Tests

| ID | Test | Pass Criteria |
|----|------|---------------|
| BOOT-01 | Application loads from HTTPS URL | No install required, < 5s to interactive |
| BOOT-02 | WebGPU detection on supported browser | `navigator.gpu` detected, WebGPU context created |
| BOOT-03 | WebGL2 fallback on unsupported browser | Graceful fallback, warning shown, game playable |
| BOOT-04 | Capability tier classification | Correct tier (ultra/high/medium/low) from GPU limits |
| BOOT-05 | Asset manifest validation | All hashes match, no missing assets |

## 2. Settings Tests

| ID | Test | Pass Criteria |
|----|------|---------------|
| SET-01 | Graphics preset application | All presets apply correct feature set |
| SET-02 | Settings persistence across sessions | localStorage save/load works, versioned migration |
| SET-03 | Audio bus volume control | Each bus independently adjustable, audible change |
| SET-04 | Control remapping | All actions remappable, persists correctly |
| SET-05 | Accessibility options | HUD scale, colorblind, reduced shake all functional |

## 3. Hangar Tests

| ID | Test | Pass Criteria |
|----|------|---------------|
| HGR-01 | 3D turntable display | Frame renders, rotates, section-selectable |
| HGR-02 | Loadout editing | Drag-drop weapons to hardpoints |
| HGR-03 | Loadout validation | Invalid configs rejected with clear explanation |
| HGR-04 | Mass/heat/DPS graphs | Live update on equipment change |
| HGR-05 | Three distinct builds per chassis | Scout/Line/Heavy each have 3 viable configs |
| HGR-06 | Save/load loadouts | Persist to local storage, reload correctly |

## 4. Mission Briefing Tests

| ID | Test | Pass Criteria |
|----|------|---------------|
| BRf-01 | Briefing display | Objectives, map, enemy composition shown |
| BRf-02 | Loadout selection | Choose from saved loadouts |
| BRf-03 | Squad composition | Assign 3 AI squadmates |
| BRf-04 | Launch transition | Smooth transition to gameplay |

## 5. Combat Tests

| ID | Test | Pass Criteria |
|----|------|---------------|
| CMB-01 | Walker movement | Mass/inertia felt, throttle curves work |
| CMB-02 | Torso/leg independent control | Torso aims independently of legs |
| CMB-03 | Weapon firing (6 weapons) | All fire, recoil, heat, ammo consumed |
| CMB-04 | Localized damage | Hits register on correct section |
| CMB-05 | Section destruction | Limbs sever, weapons destroyed |
| CMB-06 | Heat system | Thresholds trigger correct effects |
| CMB-07 | Coolant purge | Activates, reduces heat, visible vapor |
| CMB-08 | Weapon groups | Fire individually or chained |
| CMB-09 | Target lock | Acquire, track, display target info |
| CMB-10 | Thermal vision | Distinguish enemies from machinery in whiteout |

## 6. Squad Command Tests

| ID | Test | Pass Criteria |
|----|------|---------------|
| SQD-01 | Form on me | Squadmates converge on player |
| SQD-02 | Attack my target | Squadmates engage locked target |
| SQD-03 | Hold fire | Squadmates cease fire |
| SQD-04 | Move to point | Squadmates navigate to marked location |
| SQD-05 | Acknowledgement barks | Voice/text confirmation on command |
| SQD-06 | Refusal on impossible | Clear refusal when command infeasible |
| SQD-07 | Squad status display | Health, heat, ammo visible |

## 7. Enemy AI Tests

| ID | Test | Pass Criteria |
|----|------|---------------|
| AI-01 | Enemy detection | Detect player at appropriate range |
| AI-02 | Focus fire | Multiple enemies coordinate |
| AI-03 | Cover usage | Enemies break LOS when damaged |
| AI-04 | Target priority | Target damaged legs, exposed weapons |
| AI-05 | Heat management | Enemies vent when overheated |
| AI-06 | Retreat behavior | Enemies withdraw when critical |

## 8. Combined Arms Tests

| ID | Test | Pass Criteria |
|----|------|---------------|
| ARM-01 | Tanks present and functional | Move, fire, take damage |
| ARM-02 | Missile carrier | Launches missiles, repositions |
| ARM-03 | Aircraft | Flies, strafes, vulnerable to AA |
| ARM-04 | Turret | Fixed position, tracks targets |
| ARM-05 | Objective structure | Destructible, mission-critical |

## 9. Salvage Tests

| ID | Test | Pass Criteria |
|----|------|---------------|
| SLV-01 | Disabled enemy salvageable | Non-destroyed enemies yield salvage |
| SLV-02 | Salvage collection | Approach, interact, collect |
| SLV-03 | Post-mission salvage | Salvage added to inventory |

## 10. After-Action Report Tests

| ID | Test | Pass Criteria |
|----|------|---------------|
| AAR-01 | Report generation | All stats calculated correctly |
| AAR-02 | Objective summary | Primary/optional shown with status |
| AAR-03 | Damage/cost summary | Repair costs, ammo used displayed |
| AAR-04 | Salvage summary | Recovered items listed |
| AAR-05 | Consequence text | Plain-language outcome description |

## 11. Persistence Tests

| ID | Test | Pass Criteria |
|----|------|---------------|
| PST-01 | Campaign state saved | After mission, state persists |
| PST-02 | Loadout persistence | Saved loadouts available next session |
| PST-03 | Inventory persistence | Salvage/repairs persist |
| PST-04 | Settings persistence | All settings retained |

## 12. Audio Tests

| ID | Test | Pass Criteria |
|----|------|---------------|
| AUD-01 | Adaptive music transitions | State changes at bar boundaries |
| AUD-02 | Spatial weapon sounds | Directional, distance-attenuated |
| AUD-03 | Cockpit occlusion | Exterior muffled, interior clear |
| AUD-04 | Voiced dialogue | Original voice lines play, subtitled |
| AUD-05 | Footstep variation | Surface + weight class variation |
| AUD-06 | Dialogue intelligibility | Clear under maximum combat density |

## 13. Performance Tests

| ID | Test | Pass Criteria |
|----|------|---------------|
| PRF-01 | 60 FPS @ 1440p (High preset) | Sustained during combat |
| PRF-02 | 45+ FPS @ 4K (Ultra preset) | On recommended hardware |
| PRF-03 | WebGL2 fallback playable | Same mission completable |
| PRF-04 | Dynamic resolution | Engages before frame drop |
| PRF-05 | Frame pacing | < 5% frames > 2x target |
| PRF-06 | Load time | < 30s to gameplay from menu |

## 14. Asset Budget Tests

| ID | Test | Pass Criteria |
|----|------|---------------|
| AST-01 | LOD0 triangle count | Within 120k–180k for hero frames |
| AST-02 | LOD transitions | Smooth, no popping |
| AST-03 | KTX2 textures | All textures transcoded, mipmapped |
| AST-04 | No raw high-poly | No unprocessed Tripo output in runtime |
| AST-05 | Draw call budget | < 2000 draw calls in combat |

## 15. IP Compliance Tests

| ID | Test | Pass Criteria |
|----|------|---------------|
| IP-01 | No prohibited terms | String scan passes |
| IP-02 | Original silhouettes | No franchise resemblance (manual review) |
| IP-03 | Original audio | No franchise sound resemblance |
| IP-04 | Original dialogue | No franchise phrasing |
| IP-05 | Provenance documented | All generated assets have records |

---

## Test Execution Priority

1. **Critical Path:** BOOT → SET → HGR → BRf → CMB → AAR → PST
2. **Combat Depth:** CMB + SQD + AI + ARM
3. **Polish:** AUD + PRF + AST
4. **Compliance:** IP (ongoing)

## Automation Strategy

- Unit tests: Vitest (game-core logic)
- Integration tests: Vitest (schema validation, state transitions)
- E2E tests: Playwright (menu flow, settings)
- Performance: Custom harness with frame timing capture
- Asset validation: Automated script checking triangle counts, texture sizes
