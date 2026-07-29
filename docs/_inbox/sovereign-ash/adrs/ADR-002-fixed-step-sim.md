# ADR-002: Fixed-Step Simulation with Interpolated Rendering

## Status: Accepted

## Context
A heavy-walker combat sim requires deterministic, reproducible physics for:
- Consistent damage/heat calculations
- Multiplayer synchronization
- Replay support
- Frame-rate independence

## Decision
- **Simulation:** Fixed 60 Hz tick on client, 30 Hz authoritative on server
- **Rendering:** Interpolated between simulation states using accumulator alpha
- **Determinism:** Seeded PRNG (xorshift128+), no `Math.random()` in sim code
- **Input:** Sampled once per tick, buffered from display-rate events

## Consequences
- Simulation code is renderer-agnostic (shared between client/server via `game-core`)
- Visual smoothness maintained at any display refresh rate
- Spiral-of-death protection via frame time clamping (250ms max)
- Server reconciliation corrects client prediction drift
