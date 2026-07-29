# ADR-0002 — KTX2 loader adopted; KTX2 assets are not, on measured download cost

- **Status:** Accepted
- **Date:** 2026-07-30
- **Concerns:** §4 "Assets: glTF 2.0 / GLB + KTX2/Basis (UASTC hero, ETC1S bulk)",
  §12.4 "no raw generated mesh and no PNG texture ships", §8.2 load budget,
  §10.1 GPU memory gates.

## Context

§4 locks the asset triple to GLB + KTX2/Basis + meshopt. The project ships GLB + **WebP**
+ meshopt. The stated reason to move is real: WebP is a correct web format but decodes to
full RGBA in VRAM, so a 1024² albedo costs 4 MB resident whatever the file weighed. KTX2
stays GPU-compressed, which is the point of the §5.7 texture budgets.

So the transcode was set up properly and measured rather than assumed.

## What was measured

The Khronos `ktx` CLI is required by `gltf-transform --texture-compress ktx2` and is not
installed; there is no brew formula or cask, only a `.pkg`. It was extracted from the
official v4.4.2 package **without a system install** — `pkgutil --expand`, then the
payload unpacked to `~/mw-build/ktx/`, with `libktx.4.dylib` placed where the binary's
`@rpath` looks. `ktx --version` reports v4.4.2. Nothing was written outside that folder.

Same source asset (`env-bt-barrier`), same simplify ratio, same 1024 texture size, same
meshopt pass, only the texture codec differing:

| build | size | verified by |
|---|---:|---|
| WebP + meshopt (**what ships today**) | **0.240 MB** | `EXT_texture_webp`, `image/webp` |
| KTX2/Basis + meshopt | **1.382 MB** | `KHR_texture_basisu`, `image/ktx2` |

**KTX2 is 5.8× larger on disk for this content.**

A third run appeared to show ETC1S matching WebP at 0.240 MB. It was a no-op: inspecting
the file showed it still carried `EXT_texture_webp` and `image/webp`. `gltf-transform
etc1s` silently skips textures that are already WebP-encoded. The number was checked
before it was believed, and it was wrong.

Encoding cost is also material: **159 s of UASTC per asset**, so ~6.7 hours for 153.

## Decision

**Adopt the loader. Do not transcode the assets.**

`KTX2Loader` and the Basis transcoder are wired at boot and verified inert — `basis` is
never requested during page load, so today's WebP assets load exactly as before. The
client is ready the day the trade changes.

The assets stay WebP, because the download budget is the binding constraint here, not
VRAM:

- `public/models` is **76 MB** today. At 5.8× it becomes roughly **440 MB**.
- §8.2 requires time-to-first-playable **≤ 45 s cold at 50 Mbps**. That is ~280 MB for
  the *entire* payload. 440 MB of models alone breaks it outright.
- §10.1's GPU gates (≤ 3.5 GB Ultra / ≤ 2 GB High / ≤ 1.2 GB Balanced) are not currently
  the limit. Textures were also just reduced by the §6.8 per-class LOD work — props now
  carry 1024/512/256 rather than 2048/1024/512 — which cut the VRAM pressure KTX2 exists
  to relieve.

Paying 5.8× download to relieve a budget that is not binding, in order to break a budget
that is, is the wrong trade for a browser game.

## Revisit when

Any of:

- §10.1's GPU memory gate starts failing on the Balanced preset — VRAM becomes binding.
- Texture budgets rise (4K hero textures per §5.7 Ultra) — the RGBA cost scales 4× and
  the arithmetic flips.
- A smaller-output encoder path is available. This measurement is
  `gltf-transform optimize --texture-compress ktx2` at its defaults; a hand-tuned
  ETC1S-only pass with RDO could land far below UASTC, and was not explored because the
  CLI's `etc1s` command does not operate on already-encoded textures.

## Consequence for §12.4

§12.4's "no PNG texture ships" is **satisfied** — nothing ships PNG; everything is WebP.
The §6.6 gate keeps a standing warning naming the real state and this ADR, so the gap
stays visible rather than being read as complete.
