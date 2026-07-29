#!/usr/bin/env python3
"""
§6.5 RUNTIME TOPOLOGY regeneration for meshes that will not simplify.

Why this exists
---------------
13 of 51 shipped meshes plateau: the LOD simplifier cannot take them below ~4-14k
triangles however low the target ratio, because meshoptimizer preserves topology and
these meshes are thousands of disconnected shells. prop-arcology-mid floors at ~14,199,
which is roughly 3,550 components x 4 triangles.

The shared TripoClient generates every asset at maximum density on purpose:

    smart_low_poly = False   # "low-poly would REDUCE detail"
    quad           = False   # "triangles keep full detail (quad caps 150k)"
    face_limit     omitted   # "no cap -> full geometric detail"

That is right for a hero chassis and wrong for a lattice fence — the same
one-setting-for-every-class mistake that build_lods.mjs had, one layer upstream.

§6.5's RUNTIME TOPOLOGY preset asks for the opposite on non-hero assets: quad topology,
smart low-poly, and a real face_limit. Quad meshing in particular tends to produce
connected surfaces rather than shell soup, which is exactly the property the simplifier
needs.

Honest caveat, worth reading before spending credits
----------------------------------------------------
Some of these subjects are genuinely many separate objects. env-bt-fence is a "modular
open-frame lattice"; prop-hull-carcass is "exposed rib frames and deck plates". No
generator setting makes a lattice one connected shell. So this is expected to help the
buildings and help the lattices less, and the measurement below is what decides — not
the assumption.

Nothing is overwritten. Output goes to assets/tripo/regen/, and promotion is a separate,
deliberate step.

    python3 scripts/tripo_regen.py --ids prop-arcology-mid          # one, to prove it
    python3 scripts/tripo_regen.py --plateaued                      # all 13
    python3 scripts/tripo_regen.py --promote prop-arcology-mid      # after checking
"""
import argparse
import json
import pathlib
import shutil
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
CLIENT_DIR = pathlib.Path(
    "/Users/angseesiang/Library/CloudStorage/GoogleDrive-ang.see.siang@gmail.com"
    "/My Drive/macbook/API Information/tripo")
sys.path.insert(0, str(CLIENT_DIR))
from tripo_client import TripoClient, TripoError  # noqa: E402

SRC_DIR = ROOT / "assets" / "tripo" / "generated"
REGEN_DIR = ROOT / "assets" / "tripo" / "regen"
MANIFEST = ROOT / "assets" / "tripo" / "manifest.json"

# The 13 measured as plateaued: LOD2 within 80% of LOD1, i.e. the simplifier stopped
# making progress rather than hitting its target.
PLATEAUED = [
    "env-bt-fence", "env_tut_barricade", "env_tut_coolant_bowser", "int-cockpit",
    "prop-arcology-crown", "prop-arcology-mid", "prop-arcology-podium",
    "prop-cracking-tower", "prop-fuel-tank", "prop-hangar", "prop-hull-carcass",
    "prop-relay-pylon", "prop-searchlight-tower",
]

# §6.5 RUNTIME TOPOLOGY. face_limit here is the SOURCE density for a non-hero asset —
# still far above the runtime budget, because build_lods.mjs does the final decimation.
RUNTIME_TOPOLOGY = {
    "quad": True,
    "smart_low_poly": True,
    # The API enforces this: with smart_low_poly enabled on a quad mesh, face_limit must
    # be 500-10000. It rejected 60000 outright (code 1004). That constraint is a good
    # fit rather than a nuisance — 10,000 quads is roughly 20,000 triangles, so the
    # SOURCE arrives near the runtime budget instead of at 1.4M, and build_lods only has
    # to trim rather than attempt a 130:1 reduction the topology will not allow.
    "face_limit": 10000,
    "texture_quality": "detailed",
}


def tri_count(path: pathlib.Path) -> int:
    b = path.read_bytes()
    if b[:4] != b"glTF":
        return 0
    jlen = int.from_bytes(b[12:16], "little")
    j = json.loads(b[20:20 + jlen])
    t = 0
    for m in j.get("meshes", []):
        for p in m.get("primitives", []):
            if p.get("indices") is not None:
                t += j["accessors"][p["indices"]]["count"] // 3
    return t


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids")
    ap.add_argument("--plateaued", action="store_true")
    ap.add_argument("--promote")
    ap.add_argument("--timeout", type=int, default=900)
    a = ap.parse_args()

    if a.promote:
        src = REGEN_DIR / f"{a.promote}.glb"
        dst = SRC_DIR / f"{a.promote}.glb"
        if not src.exists():
            print(f"no regenerated source at {src}")
            return 1
        backup = SRC_DIR / f"{a.promote}.glb.pre-regen"
        if not backup.exists():
            shutil.copy2(dst, backup)
            print(f"backed up original -> {backup.name}")
        shutil.copy2(src, dst)
        print(f"promoted {a.promote}: {tri_count(dst):,} tris. Now run build_lods.")
        return 0

    ids = PLATEAUED if a.plateaued else (a.ids.split(",") if a.ids else [])
    if not ids:
        print("nothing to do: pass --ids or --plateaued")
        return 1

    items = json.loads(MANIFEST.read_text())
    items = items if isinstance(items, list) else items.get("assets", items.get("items", []))
    by_id = {x["id"]: x for x in items}

    REGEN_DIR.mkdir(parents=True, exist_ok=True)
    tc = TripoClient()

    print(f"regenerating {len(ids)} asset(s) with §6.5 RUNTIME TOPOLOGY")
    print(f"  {RUNTIME_TOPOLOGY}\n")

    tasks = {}
    for aid in ids:
        entry = by_id.get(aid)
        if not entry:
            print(f"  SKIP {aid}: not in manifest")
            continue
        try:
            overrides = dict(RUNTIME_TOPOLOGY)
            if entry.get("model_seed") is not None:
                overrides["model_seed"] = entry["model_seed"]
            tid = tc.text_to_model(entry["prompt"], **overrides)
            tasks[aid] = tid
            print(f"  submitted {aid} -> {tid}")
        except TripoError as e:
            print(f"  FAIL {aid}: {e}")

    if not tasks:
        return 1

    deadline = time.time() + a.timeout
    pending = dict(tasks)
    progress_note = {}
    while pending and time.time() < deadline:
        time.sleep(10)
        for aid, tid in list(pending.items()):
            try:
                st = tc.status(tid)
            except TripoError as e:
                print(f"  poll error {aid}: {e}")
                continue
            status = st.get("status")
            prog = int(st.get("progress", 0))
            if progress_note.get(aid) != f"{status}{prog}":
                progress_note[aid] = f"{status}{prog}"
                print(f"  {aid}: {status} {prog}%")
            if status == "success":
                out = REGEN_DIR / f"{aid}.glb"
                tc.download(st, out)
                before = tri_count(SRC_DIR / f"{aid}.glb")
                after = tri_count(out)
                print(f"  DONE {aid}: {before:,} -> {after:,} tris  ({out})")
                pending.pop(aid)
            elif status in ("failed", "cancelled", "banned", "expired"):
                print(f"  FAILED {aid}: {status}")
                pending.pop(aid)

    for aid in pending:
        print(f"  TIMEOUT {aid} (task {tasks[aid]} still running server-side)")

    print("\nNothing was overwritten. Inspect assets/tripo/regen/, then:")
    print("  python3 scripts/tripo_regen.py --promote <id>")
    print("  node scripts/build_lods.mjs --ids <id> --force")
    print("  node scripts/tripo_qc.mjs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
