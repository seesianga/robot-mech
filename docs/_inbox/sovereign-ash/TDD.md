# Sovereign Ash: Nareth Protocol — Technical Design Document

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                          │
├─────────────────────────────────────────────────────────────────┤
│  React UI Layer (menus, hangar, settings, post-mission)         │
├─────────────────────────────────────────────────────────────────┤
│  Babylon.js Render Layer (WebGPU primary / WebGL2 fallback)     │
├─────────────────────────────────────────────────────────────────┤
│  Game Core (fixed-step sim: damage, heat, weapons, movement)    │
├─────────────────────────────────────────────────────────────────┤
│  Audio Engine (Web Audio API, spatial, adaptive music)          │
├─────────────────────────────────────────────────────────────────┤
│  Net Client (WebSocket, prediction, reconciliation)             │
└─────────────────────────────────────────────────────────────────┘
                              │ WebSocket / HTTPS
┌─────────────────────────────────────────────────────────────────┐
│                     SERVER (Node.js)                             │
├─────────────────────────────────────────────────────────────────┤
│  Authoritative Sim (fixed-tick, damage, validation)             │
├─────────────────────────────────────────────────────────────────┤
│  Account / Campaign API (REST)                                  │
├─────────────────────────────────────────────────────────────────┤
│  Match Coordination (Redis)                                     │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL (accounts, campaigns, inventory)                    │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Monorepo Structure

```
sovereign-ash/
├── apps/
│   ├── web/                  # Vite + React + Babylon.js client
│   ├── server/               # Node.js authoritative server
│   └── admin/                # Internal content review dashboard
├── packages/
│   ├── game-core/            # Fixed-step simulation, damage, heat, weapons, missions
│   ├── net-protocol/         # Shared schemas, snapshots, commands, validation
│   ├── rendering/            # Materials, effects, LOD, streaming, postprocessing
│   ├── audio/                # Buses, spatial audio, dialogue, adaptive music
│   ├── ui/                   # Shared React components and accessibility
│   ├── content-schema/       # Zod schemas: frames, weapons, missions, dialogue
│   ├── tools-tripo/          # Server-side Tripo job submission and ingestion
│   ├── tools-eleven/         # Server-side ElevenLabs voice/music/SFX generation
│   └── testing/              # Unit, integration, deterministic replay, perf
├── assets-source/            # Source art metadata (never served to client)
├── content/                  # Versioned validated game data (JSON)
├── docs/                     # GDD, TDD, art/audio/narrative bibles, ADRs
├── package.json              # Workspace root
├── tsconfig.base.json        # Shared TS config
└── turbo.json                # Turborepo pipeline
```

## 3. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Language | TypeScript 5.x (strict) | Type safety across client/server |
| Renderer | Babylon.js 7.x | WebGPU support, scene graph, physics integration |
| GPU Primary | WebGPU | Compute shaders, better multithreading |
| GPU Fallback | WebGL2 | Broad compatibility |
| Build | Vite 6.x | Fast HMR, ESM-native |
| UI Framework | React 19 | Menus, hangar, settings |
| State (UI) | Zustand | Lightweight, no boilerplate |
| Physics | Havok WASM (via Babylon plugin) | Deterministic, performant |
| Monorepo | npm workspaces + Turborepo | Task caching, dependency graph |
| Server | Node.js 22 + Fastify | High-perf HTTP + WS |
| WebSocket | ws (Node) + native browser WS | Low overhead |
| Database | PostgreSQL 16 | Relational campaign/account data |
| Cache/PubSub | Redis 7 | Sessions, match coordination |
| Validation | Zod 3.x | Runtime + compile-time schema safety |
| Testing | Vitest + Playwright | Unit + E2E |
| CI | GitHub Actions | Automated test, build, deploy |
| CDN | Cloudflare R2 + CDN | Versioned asset delivery |
| Textures | KTX2 / Basis Universal | GPU-compressed, mipmapped |
| Models | glTF 2.0 / GLB + meshopt | Standard, compressed |

## 4. Fixed-Step Simulation

### 4.1 Loop Architecture

```typescript
const SIM_TICK_RATE = 60;           // Hz
const SIM_DT = 1000 / SIM_TICK_RATE; // ~16.67ms
const MAX_FRAME_TIME = 250;          // clamp spiral-of-death

let accumulator = 0;
let lastTime = performance.now();

function frameLoop(now: number) {
  const frameTime = Math.min(now - lastTime, MAX_FRAME_TIME);
  lastTime = now;
  accumulator += frameTime;

  while (accumulator >= SIM_DT) {
    simulation.step(SIM_DT / 1000); // fixed dt in seconds
    accumulator -= SIM_DT;
  }

  const alpha = accumulator / SIM_DT;
  renderer.render(alpha); // interpolate for smooth display
  requestAnimationFrame(frameLoop);
}
```

### 4.2 Determinism Requirements

- All gameplay logic uses fixed-point or bounded float operations
- No `Math.random()` in simulation; use seeded PRNG (xorshift128+)
- Server and client run identical simulation code (`game-core`)
- Input is sampled once per tick, not per frame

### 4.3 Server Tick

- Server runs at 30 Hz authoritative tick
- Client predicts at 60 Hz, reconciles on snapshot receipt
- Snapshot interpolation buffer: 100ms (3 server ticks)

## 5. Renderer Selection Module

```typescript
interface RendererCapability {
  backend: 'webgpu' | 'webgl2';
  maxTextureSize: number;
  supportsCompute: boolean;
  supportsTimestampQuery: boolean;
  maxColorAttachments: number;
  deviceTier: 'ultra' | 'high' | 'medium' | 'low';
}

async function detectRenderer(): Promise<RendererCapability> {
  // 1. Check navigator.gpu availability
  // 2. Request adapter with high-performance preference
  // 3. Query limits (maxTextureDimension, maxBindGroups, etc.)
  // 4. Fall back to WebGL2 context creation
  // 5. Classify device tier from limits + heuristic
}
```

## 6. Asset Pipeline

### 6.1 Model Pipeline (Tripo → Runtime)

```
Tripo Generation (H3 high-fidelity)
  → Manual topology review/repair
  → Rig (mechanical skeleton + constraints)
  → Animation clips
  → LOD generation (LOD0–LOD3)
  → Collision proxies
  → Texture bake (normal, curvature, AO, thickness, masks)
  → glTF/GLB export
  → KTX2 texture transcode
  → meshopt geometry compression
  → Automated budget validation
  → CDN upload with content hash
```

### 6.2 Runtime Asset Budgets

| Asset | Budget |
|-------|--------|
| Hero LOD0 | 120k–180k tris |
| Hero LOD1 | 55k–80k tris |
| Hero LOD2 | 20k–35k tris |
| Hero LOD3 | 6k–12k tris |
| Cockpit interior | ≤150k tris |
| Hero textures (LOD0) | 4K BC/ASTC (base, normal, ORM, emissive) |
| Streaming variants | 2K/1K for distance/lower presets |
| Props | Atlases + trim sheets |
| Buildings | Modular kits, decals, vertex color |

### 6.3 Texture Pipeline

```
Source (4K PNG/TIFF)
  → Channel pack: ORM (AO/Roughness/Metallic)
  → Basis Universal encode (UASTC for quality, ETC1S for size)
  → KTX2 container with mipmaps
  → CDN with content-hash filename
```

## 7. Networking Architecture

### 7.1 Client-Side

- Input sampling at display rate → buffered to sim tick
- Local prediction for player movement
- Snapshot interpolation for remote entities
- Reconciliation on server correction

### 7.2 Server-Side

- Authoritative 30 Hz tick
- Validates: fire rate, heat, ammo, speed, transforms, inventory, damage, objectives
- Lag compensation for hitscan (rewind up to 200ms)
- Projectile travel time preserved (no universal hitscan)
- Event log for replay

### 7.3 Protocol

- Binary snapshots (Float32Array position, Uint8 state flags)
- Delta compression against previous snapshot
- Reliable UDP-like ordering via WebSocket (initial), consider WebTransport later
- Message types: Input, Snapshot, Event, RPC, Chat

## 8. Audio Architecture

### 8.1 Bus Structure

```
Master
├── Music (adaptive layers)
├── Dialogue (sidechain duck target)
├── Cockpit (occlusion-filtered interior)
├── Weapons
├── Impacts
├── Machinery
├── Vehicles
├── Environment
└── UI
```

### 8.2 Spatial Audio

- Web Audio API PannerNode (HRTF where available)
- Distance model: inverse clamped
- Cockpit occlusion: low-pass filter on exterior buses
- Propagation delay for very large distant events only

### 8.3 Adaptive Music

- Bar-aligned transitions between states
- States: Exploration, Suspicion, Contact, Full Combat, Critical Damage, Objective Success, Retreat/Loss, Post-Mission
- Layers share key, meter, tempo, phrase length

## 9. Settings Persistence

```typescript
interface SettingsSchema {
  graphics: {
    preset: 'ultra' | 'high' | 'medium' | 'low' | 'custom';
    resolution: number;         // percentage 50-100
    frameCap: 30 | 60 | 120 | 0; // 0 = uncapped
    shadows: 'off' | 'low' | 'medium' | 'high' | 'ultra';
    reflections: boolean;
    volumetrics: boolean;
    antialiasing: 'off' | 'fxaa' | 'taa';
    motionBlur: boolean;
    anisotropy: 1 | 2 | 4 | 8 | 16;
  };
  audio: {
    master: number;
    music: number;
    dialogue: number;
    sfx: number;
    dynamicRange: 'night' | 'balanced' | 'cinema';
    subtitles: boolean;
    dialogueBoost: number;
  };
  controls: {
    sensitivity: number;
    invertY: boolean;
    deadzone: number;
    throttleMode: 'hold' | 'toggle';
    torsoCentering: boolean;
    aimAssist: number;
  };
  accessibility: {
    hudScale: number;
    colorblindMode: 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia';
    reducedShake: boolean;
    reducedFlashes: boolean;
    horizonStabilization: boolean;
    fov: number;
  };
}
```

Storage: `localStorage` with versioned schema + migration. Server-synced for authenticated users.

## 10. Performance Targets

| Target | Value |
|--------|-------|
| Campaign combat @ 1440p | 60 FPS |
| Ultra preset @ 4K | 45–60 FPS |
| Cinematic fallback | Locked 30 FPS (opt-in) |
| Dynamic resolution range | 50%–100% |
| Frame time budget (60fps) | 16.67ms |
| Sim tick budget | ≤4ms |
| Render budget | ≤10ms |
| Audio budget | ≤2ms |
| UI budget | ≤1ms |

## 11. Security

- HTTPS everywhere (WebGPU requires secure context)
- API secrets server-side only (Tripo, ElevenLabs keys in env/secret store)
- CSP headers, strict CORS
- Signed asset URLs
- Input validation (Zod on all endpoints)
- Rate limiting
- Audit logs
- Dependency scanning (npm audit + Snyk)
- No user prompts flow to vendor APIs without moderation/sanitization

## 12. Content Versioning

- Every asset bundle has a manifest with SHA-256 hashes
- Content objects record: source file, author, version, license/rights, approval state
- Stable IDs separate from display names
- Localization from day one (string tables, no hardcoded UI text)
