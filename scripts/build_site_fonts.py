#!/usr/bin/env python3
"""
Self-host the landing page's typefaces as subsetted WOFF2.

Why self-host rather than link a font CDN: a third-party font request is a
render-blocking dependency on someone else's uptime and a privacy hop, and it
costs a DNS + TLS round trip before a single glyph paints. These files are small
enough (see the output) that inlining them into the deploy is strictly better.

Why subset: the full Inter TTF is ~800 KB. The page uses Latin text and a handful
of symbols, so the Latin + punctuation subset is around a tenth of that.

Both families are SIL Open Font License 1.1, which permits redistribution as
long as the licence travels with them — public/fonts/OFL.txt is written here and
must ship. Source TTFs come from ~/Library/Fonts.

Usage: python3 scripts/build_site_fonts.py
"""
import pathlib
import shutil
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = pathlib.Path.home() / "Library" / "Fonts"
OUT = ROOT / "public" / "fonts"

# Only the weights the page actually sets. Every extra weight is dead download.
FACES = [
    ("Inter-Regular.ttf", "inter-400"),
    ("Inter-Medium.ttf", "inter-500"),
    ("Inter-SemiBold.ttf", "inter-600"),
    ("Inter-Bold.ttf", "inter-700"),
    ("Inter-Black.ttf", "inter-900"),
    ("JetBrainsMono-Regular.ttf", "jbmono-400"),
    ("JetBrainsMono-Bold.ttf", "jbmono-700"),
]

# Basic Latin + Latin-1 + the typographic marks and box/geometric glyphs the
# page uses for HUD chrome (arrows, bullets, the play triangle, degree, hairspace).
UNICODES = (
    "U+0020-007E,"          # basic latin
    "U+00A0-00FF,"          # latin-1 supplement
    "U+2018-201D,"          # curly quotes
    "U+2013-2014,"          # en/em dash
    "U+2026,"               # ellipsis
    "U+2192,U+2190,U+2191,U+2193,"   # arrows
    "U+2022,U+00B7,"        # bullets
    "U+25B6,U+25C0,U+25A0,U+25CF,"   # play/geometric
    "U+00D7,U+00B0,U+2212,"          # multiply, degree, minus
    "U+2261,U+2248,"        # identical-to, approx (used in the roster key)
    "U+2500-257F"           # box drawing, for terminal chrome
)

OFL_NOTE = """\
The typefaces in this directory are redistributed under the SIL Open Font
License, Version 1.1.

  Inter — Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter)
  JetBrains Mono — Copyright (c) 2020 The JetBrains Mono Project Authors
                   (https://github.com/JetBrains/JetBrainsMono)

Both are licensed under the SIL Open Font License, Version 1.1. This license is
available with a FAQ at: https://openfontlicense.org

These files are subsets of the originals, produced by scripts/build_site_fonts.py.
Subsetting is permitted by the OFL provided the licence accompanies the files,
which is the purpose of this notice.
"""


def main() -> int:
    if not SRC.exists():
        print(f"no font source at {SRC}", file=sys.stderr)
        return 2
    OUT.mkdir(parents=True, exist_ok=True)

    missing = [f for f, _ in FACES if not (SRC / f).exists()]
    if missing:
        print(f"missing source fonts: {', '.join(missing)}", file=sys.stderr)
        return 2

    total_src = total_out = 0
    for filename, stem in FACES:
        src = SRC / filename
        dst = OUT / f"{stem}.woff2"

        font = TTFont(str(src))
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.desubroutinize = True
        opts.layout_features = ["kern", "liga", "calt", "tnum", "ccmp", "locl"]
        opts.name_IDs = ["*"]        # keep the name table so the licence is inspectable
        opts.notdef_outline = True
        opts.recalc_bounds = True

        subsetter = subset.Subsetter(options=opts)
        subsetter.populate(unicodes=subset.parse_unicodes(UNICODES))
        subsetter.subset(font)
        font.flavor = "woff2"
        font.save(str(dst))
        font.close()

        s, o = src.stat().st_size, dst.stat().st_size
        total_src += s
        total_out += o
        print(f"  {stem:<12} {s // 1024:>4} KB -> {o // 1024:>3} KB  {dst.name}")

    (OUT / "OFL.txt").write_text(OFL_NOTE)
    print(f"\n{len(FACES)} faces: {total_src // 1024} KB -> {total_out // 1024} KB "
          f"({100 - total_out * 100 // total_src}% smaller), licence written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
