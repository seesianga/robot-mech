#!/usr/bin/env python3
"""
Turn 4K PNG masters in assets/site/raw/ into the shipping responsive ladder in
public/site/.

One implementation for both sources of site imagery — gpt-image-2 key art and
real in-engine gameplay captures — so they cannot drift apart in encoder
settings or naming.

The ladder exists because "4K website" and "fast website" are only compatible if
the 4K plate is reserved for displays that can actually show it. A 390 px phone
pulling a 3840-wide hero is the difference between a 2 s and a 14 s load.

AVIF first, WebP as the universal fallback:
  <picture>
    <source type="image/avif" srcset="x-640.avif 640w, ... x.avif 3840w">
    <source type="image/webp" srcset="...">
    <img src="x-1280.webp">
  </picture>

Usage: python3 scripts/site_derivatives.py [--only id,id] [--force]
"""
import argparse
import json
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "assets" / "site" / "raw"
OUT = ROOT / "public" / "site"
INDEX = ROOT / "content" / "site-images.json"

WIDTHS = [3840, 2560, 1920, 1280, 640]

# Quality picked by eye against the 4K masters: AVIF 62 is visually transparent
# on these plates (dark, grainy, high-detail), WebP needs ~86 to match it.
ENCODERS = (
    ("avif", {"quality": 62, "speed": 4}),
    ("webp", {"quality": 86, "method": 6}),
)


def ladder(master: pathlib.Path, force: bool = False) -> dict:
    """Write every size/format for one master. Returns an index entry."""
    stem = master.stem
    img = Image.open(master).convert("RGB")
    entry = {"master": f"{img.width}x{img.height}", "sources": {}}

    for ext, kwargs in ENCODERS:
        srcset = []
        for w in WIDTHS:
            if w > img.width:
                continue
            suffix = "" if w == img.width else f"-{w}"
            path = OUT / f"{stem}{suffix}.{ext}"
            if path.exists() and not force:
                srcset.append({"w": w, "file": path.name, "kb": path.stat().st_size // 1024})
                continue
            h = round(img.height * w / img.width)
            resized = img if w == img.width else img.resize((w, h), Image.LANCZOS)
            try:
                resized.save(path, **kwargs)
            except Exception as e:  # noqa: BLE001
                print(f"    skip {path.name}: {e}", file=sys.stderr)
                continue
            srcset.append({"w": w, "file": path.name, "kb": path.stat().st_size // 1024})
        entry["sources"][ext] = srcset
    return entry


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=None)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    if not RAW.exists():
        print(f"no masters at {RAW}", file=sys.stderr)
        return 2
    OUT.mkdir(parents=True, exist_ok=True)

    only = set(args.only.split(",")) if args.only else None
    masters = sorted(p for p in RAW.glob("*.png") if not only or p.stem in only)
    if not masters:
        print("nothing to do", file=sys.stderr)
        return 2

    index = json.loads(INDEX.read_text()) if INDEX.exists() else {}
    total = 0
    for m in masters:
        entry = ladder(m, args.force)
        index[m.stem] = entry
        # WIDTHS runs largest-first, so srcset[0] is the 4K plate.
        avif = entry["sources"].get("avif", [])
        big = avif[0].get("kb", "?") if avif else "?"
        small = avif[-1].get("kb", "?") if avif else "?"
        print(f"  {m.stem:<20} {entry['master']}  "
              f"avif {small}KB (640w) .. {big}KB (4K)")
        total += sum(s["kb"] for fmts in entry["sources"].values() for s in fmts)

    INDEX.write_text(json.dumps(index, indent=2) + "\n")
    print(f"\n{len(masters)} images, {total / 1024:.1f} MB of derivatives in public/site/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
