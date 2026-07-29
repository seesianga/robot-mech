# ADR-001: Babylon.js as Primary Renderer

## Status: Accepted

## Context
We need a WebGL/WebGPU rendering engine for a complex 3D browser game with:
- WebGPU primary with WebGL2 fallback
- PBR materials, shadows, particles, post-processing
- glTF/GLB asset loading with KTX2 textures
- Physics integration (Havok WASM)
- LOD system, occlusion culling, instancing

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| Babylon.js | WebGPU-native, built-in physics, glTF, LOD, particles, large community | Larger bundle than Three.js |
| Three.js | Smaller core, huge ecosystem | WebGPU still maturing (WebGPURenderer), less built-in game features |
| Custom WebGPU | Maximum control | Enormous engineering cost, no ecosystem |
| PlayCanvas | Good editor, WebGPU support | Less flexible for custom game logic |

## Decision
**Babylon.js 7.x** — Best WebGPU maturity, built-in Havok physics plugin, native glTF/KTX2 support, comprehensive LOD/culling/instancing, and active development.

## Consequences
- Bundle size ~1.2MB gzipped (acceptable for game, not a website)
- Team must learn Babylon-specific APIs
- Strong TypeScript support out of the box
- Physics via `@babylonjs/havok` WASM plugin
