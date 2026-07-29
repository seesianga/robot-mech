#!/usr/bin/env python3
"""
Report the real quality configuration of every generated GLB by reading the file,
not by trusting the manifest: embedded texture pixel dimensions, triangle count,
material maps, and rig/animation presence.

This is how we established that the existing generation is 4K and not 8K.

Usage:
  python3 scripts/check_tripo_quality.py
  python3 scripts/check_tripo_quality.py --expect 4096   # non-zero exit on mismatch
"""
import argparse
import json
import pathlib
import struct
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
GEN_DIR = ROOT / "assets" / "tripo" / "generated"


def jpeg_dims(d):
    i = 2
    while i < len(d) - 1:
        if d[i] != 0xFF:
            i += 1
            continue
        marker = d[i + 1]
        i += 2
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            continue
        if i + 2 > len(d):
            break
        seglen = struct.unpack_from(">H", d, i)[0]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6,
                      0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            h, w = struct.unpack_from(">HH", d, i + 3)
            return w, h
        i += seglen
    return None


def png_dims(d):
    return struct.unpack_from(">II", d, 16)


def inspect(path):
    b = path.read_bytes()
    if b[:4] != b"glTF":
        raise ValueError("not a GLB")
    jlen = struct.unpack_from("<I", b, 12)[0]
    j = json.loads(b[20:20 + jlen])
    bin_off = 20 + jlen + 8

    maps = []
    for im in j.get("images", []):
        bv = j["bufferViews"][im["bufferView"]]
        start = bin_off + bv.get("byteOffset", 0)
        data = b[start:start + bv["byteLength"]]
        wh = png_dims(data) if im.get("mimeType") == "image/png" else jpeg_dims(data)
        name = im.get("name", "?").split("_")[0]
        maps.append((name, wh))

    tris = sum(j["accessors"][pr["indices"]]["count"] // 3
               for m in j.get("meshes", []) for pr in m["primitives"]
               if "indices" in pr)
    return {
        "maps": maps,
        "tris": tris,
        "materials": len(j.get("materials", [])),
        "animations": len(j.get("animations", [])),
        "skins": len(j.get("skins", [])),
        "mb": len(b) / 1024 / 1024,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--expect", type=int, default=None,
                    help="required texture edge in px (e.g. 4096); exit 1 on mismatch")
    args = ap.parse_args()

    files = sorted(GEN_DIR.glob("*.glb"))
    if not files:
        sys.exit(f"no GLBs in {GEN_DIR}")

    print(f"{'asset':34s} {'tris':>10s} {'MB':>6s} {'mat':>4s} {'anim':>5s}  textures")
    print("-" * 100)
    bad, sizes = [], set()
    for f in files:
        try:
            r = inspect(f)
        except Exception as e:
            print(f"{f.name:34s} ERROR {e}")
            bad.append(f.name)
            continue
        tex = "  ".join(f"{n}:{w}x{h}" for n, (w, h) in r["maps"]) or "(none)"
        for _, (w, h) in r["maps"]:
            sizes.add(w)
            if args.expect and (w != args.expect or h != args.expect):
                bad.append(f.name)
        print(f"{f.stem:34s} {r['tris']:10,d} {r['mb']:6.1f} "
              f"{r['materials']:4d} {r['animations']:5d}  {tex}")

    print("-" * 100)
    label = {1024: "1K", 2048: "2K", 4096: "4K", 8192: "8K"}
    print(f"{len(files)} assets | texture edges present: "
          + ", ".join(f"{s}px ({label.get(s, '?')})" for s in sorted(sizes)))
    if args.expect:
        if bad:
            print(f"MISMATCH vs expected {args.expect}px: {sorted(set(bad))}")
            sys.exit(1)
        print(f"all textures match the expected {args.expect}px "
              f"({label.get(args.expect, '?')})")


if __name__ == "__main__":
    main()
