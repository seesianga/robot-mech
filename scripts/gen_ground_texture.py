#!/usr/bin/env python3
"""
Generate the battlefield ground material with gpt-image-2.

Why not Tripo3D: the ground is not a model. It is a 2400 m PlaneGeometry whose
collision is a Rapier heightfield derived from the analytic heightAt() in
src/world/terrain.ts — the mesh and the heightfield must agree or mechs float and
sink. What the plane needs is a TILING PBR material, and Tripo is a text-to-model
service, not a texture generator. gpt-image-2 is the right tool for this one asset.

Produces, per map mood, at 4096x4096:
  <id>_albedo.webp    base colour
  <id>_normal.webp    derived tangent-space normal (Sobel on luminance)
  <id>_rough.webp     derived roughness (inverted, flattened luminance)

WebP, not PNG: a 4096^2 PNG lands around 21 MB, so nine maps would add ~190 MB to
the deploy. WebP at q92 keeps the detail and costs roughly a tenth of that.

The normal and roughness maps are DERIVED from the albedo rather than generated,
because an image model has no way to emit a consistent tangent-space normal — asking
it for one yields a purple-ish picture that is not a valid normal map.

Usage:
  python3 scripts/gen_ground_texture.py            # every map
  python3 scripts/gen_ground_texture.py --ids yard
"""
import argparse
import base64
import json
import math
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "textures"
ENV = pathlib.Path(
    "/Users/angseesiang/Library/CloudStorage/GoogleDrive-ang.see.siang@gmail.com"
    "/My Drive/macbook/API Information/.env")

SHARED = (
    "Shot from directly overhead, completely flat orthographic top-down view, perfectly "
    "even diffuse lighting with absolutely no cast shadows, no specular highlights, no "
    "vignetting, no depth of field, no horizon. Uniform detail density across the entire "
    "frame so the edges tile seamlessly with no visible seam and no single landmark "
    "feature that would visibly repeat. No objects, no vegetation, no footprints, no "
    "vehicle tracks, no text, no watermark. Fine high-frequency natural grain, "
    "photographic realism, production game surface material."
)

# One per MapId in src/world/terrain.ts. A map with no entry falls back to 'yard'
# at load time, so adding a map never breaks the ground.
GROUNDS = {
    "yard": "Arid desert battlefield ground: fine wind-rippled sand in warm ochre and pale "
            "khaki, patches of compacted dry cracked clay hardpan, scattered small dark "
            "basalt gravel and angular pebbles, faint dried mineral salt streaks.",
    "range": "Military firing-range hardpan: compacted tan dirt scuffed and churned by "
             "heavy machine traffic, embedded grit and small stones, faint pale dust "
             "bloom, patches of bare cracked clay.",
    "tideflats": "Coastal tidal mud flat: damp grey-brown silt with fine ripple ridges, "
                 "shallow drying cracks, scattered broken shell fragments and dark wet "
                 "patches, thin films of standing water sheen.",
    "salt": "Cracked salt flat: blinding off-white evaporite crust broken into irregular "
            "polygonal plates, thin ochre dust settled in the cracks, faint grey mineral "
            "staining, brittle crystalline surface.",
    "karst": "Weathered limestone karst pavement: pale grey fissured rock slabs split by "
             "deep solution grooves, thin rusty soil caught in the seams, lichen "
             "blotches, sharp eroded edges.",
    "polar": "Wind-scoured polar ice and packed snow: hard blue-white ice lenses under "
             "sastrugi ridges of dry granular snow, faint grey grit frozen into the "
             "surface, brittle fracture lines.",
    "storm": "Rain-soaked coastal gravel: dark wet shingle and coarse grey pebbles in "
             "packed silt, glistening damp patches and shallow puddles, streaks of "
             "washed sand between stones.",
    "arcology": "Cracked urban concrete roadway: weathered pale grey slab with expansion "
                "joints, spidering hairline cracks, oil staining, patches of exposed "
                "aggregate and fine rubble dust.",
    "anchor": "Industrial steel deck plate: brushed gunmetal panels with raised anti-slip "
              "diamond tread, heavy weld seams and countersunk rivets, rust bleed at the "
              "joints, scuffed wear tracks.",
}


# Water is the same case as ground and for the same reason: a 3840 m plane with a
# flat colour and no map at all, not a model Tripo could produce. Only the maps whose
# water level is above the sea floor get their own set; the rest hide it at y=-40.
WATERS = {
    "yard": "Murky inland basin water: silt-laden olive-brown surface with fine wind "
            "chop, soft foam wisps, suspended sediment swirls.",
    "tideflats": "Shallow tidal water over sand: clear green-grey with visible rippled "
                 "sand bed showing through, thin foam lines, gentle wave chop.",
    "storm": "Storm-driven open sea: dark slate-grey swell with breaking whitecaps, "
             "streaked foam, heavy chop and spray.",
    "arcology": "Urban canal water: near-black green surface with oily iridescent sheen, "
                "slow ripples, scattered debris film.",
    "anchor": "Deep cold ocean: near-black blue-green swell, long slow waves, sparse "
              "foam crests, high specular sheen.",
}


def api_key() -> str:
    for line in ENV.read_text().splitlines():
        if line.strip().startswith("OPENAI_API_KEY"):
            return line.partition("=")[2].strip().strip('"').strip("'")
    sys.exit(f"OPENAI_API_KEY not found in {ENV}")


def generate(key: str, prompt: str, size: str = "1024x1024") -> bytes:
    body = json.dumps({
        "model": "gpt-image-2",
        "prompt": prompt,
        "size": size,
        "quality": "high",
        "n": 1,
    }).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/images/generations", data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        data = json.load(r)
    return base64.b64decode(data["data"][0]["b64_json"])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", default="", help="comma-separated map ids")
    ap.add_argument("--size", default="1024x1024",
                    help="generation size; upscaled to --edge for the shipped map")
    ap.add_argument("--edge", type=int, default=4096, help="final texture edge in px")
    ap.add_argument("--water", action="store_true",
                    help="generate water surfaces instead of ground")
    args = ap.parse_args()

    try:
        from PIL import Image, ImageFilter
    except ImportError:
        sys.exit("needs Pillow:  python3 -m pip install --user Pillow")

    OUT.mkdir(parents=True, exist_ok=True)
    key = api_key()
    table = WATERS if args.water else GROUNDS
    prefix = "water_" if args.water else ""
    wanted = [s.strip() for s in args.ids.split(",") if s.strip()] or list(table)

    for gid in wanted:
        if gid not in table:
            print(f"  unknown ground id: {gid}")
            continue
        print(f"generating {prefix}{gid} ...", flush=True)
        raw = generate(key, f"A seamless tileable photorealistic PBR albedo texture. "
                            f"{table[gid]} {SHARED}", args.size)
        tmp = OUT / f"{prefix}{gid}_albedo_raw.png"
        tmp.write_bytes(raw)

        img = Image.open(tmp).convert("RGB")
        # Resample to the target edge — the model tops out below 4K, and a clean
        # Lanczos upscale of a high-detail source beats a lower-res map on a surface
        # this large.
        img = img.resize((args.edge, args.edge), Image.LANCZOS)
        albedo = OUT / f"{prefix}{gid}_albedo.webp"
        img.save(albedo, quality=92, method=6)

        # roughness: flattened inverse luminance — darker, damper-looking grains read
        # smoother, pale dry crust reads rougher
        lum = img.convert("L")
        rough = lum.point(lambda v: int(150 + (255 - v) * 0.35))
        rough.save(OUT / f"{prefix}{gid}_rough.webp", quality=90, method=6)

        # normal: Sobel over luminance, packed tangent-space
        gx = lum.filter(ImageFilter.Kernel((3, 3), [-1, 0, 1, -2, 0, 2, -1, 0, 1], 1, 128))
        gy = lum.filter(ImageFilter.Kernel((3, 3), [-1, -2, -1, 0, 0, 0, 1, 2, 1], 1, 128))
        blue = Image.new("L", img.size, 255)
        # normals are direction data, so keep them near-lossless
        Image.merge("RGB", (gx, gy, blue)).save(
            OUT / f"{prefix}{gid}_normal.webp", quality=97, method=6)

        tmp.unlink()
        kb = albedo.stat().st_size // 1024
        print(f"  {prefix}{gid}: {args.edge}x{args.edge} albedo ({kb} kB) + normal + rough")

    print(f"\nwritten to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
