#!/usr/bin/env python3
"""
Tripo3D tutorial-range assets (Op 0: Proving Ground) — env_tut_* set from
docs/tutorial-design.md §3. Same shared max-quality TripoClient as gen_tripo.py.

The playable range ships on procedural greybox; these assets replace the props
asset-for-asset when generated. Runs only when the Tripo account has credits
(zero balance returns 403 code=2010 per task — see README).

Usage:
  python3 scripts/gen_tripo_range.py            # all range assets
  python3 scripts/gen_tripo_range.py --ids env_tut_drone,env_tut_board_a
Idempotent: assets whose GLB already exists are skipped.
"""
import argparse
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

OUT_DIR = ROOT / "assets" / "tripo" / "generated"
PUB_DIR = ROOT / "public" / "models"
OUT_DIR.mkdir(parents=True, exist_ok=True)
PUB_DIR.mkdir(parents=True, exist_ok=True)

STYLE = ("military science fiction, hard-surface game asset, battle-worn painted metal with "
         "chipped edges, lunar-grey and olive-drab with rust accents, PBR materials, clean "
         "readable silhouette, neutral studio background")

ASSETS = [
    ("env_tut_drone",
     f"small hovering drill drone, twin ducted fans, round sensor eye, orange training stripes, {STYLE}"),
    ("env_tut_board_a",
     f"pop-up shooting range silhouette target board of a walking war robot, steel frame, hinged base plate, scorched holes, {STYLE}"),
    ("env_tut_board_b",
     f"pop-up shooting range silhouette target board of a squat tank, steel frame, hinged base plate, painted score rings, {STYLE}"),
    ("env_tut_coolant_bowser",
     f"weathered military coolant tanker truck, cylindrical tank, hoses coiled on rear rack, hazard striping, {STYLE}"),
    ("env_tut_barricade",
     f"vehicle barricade welded from wreck hull plating, sandbag base, chevron warning paint, {STYLE}"),
    ("env_tut_crate",
     f"stackable military supply crate, recessed handles, stencilled markings, {STYLE}"),
    ("env_tut_gantry",
     f"tall lattice range gantry mast with floodlight head and small radar dish, guy wires, {STYLE}"),
    ("env_tut_nav_beacon",
     f"deployable navigation beacon pedestal, tripod legs, glowing amber indicator dome, folding antenna, {STYLE}"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", type=str, default="")
    ap.add_argument("--max-wait", type=int, default=600)
    args = ap.parse_args()

    picked = ASSETS
    if args.ids:
        wanted = set(args.ids.split(","))
        picked = [a for a in ASSETS if a[0] in wanted]
    picked = [a for a in picked if not (OUT_DIR / f"{a[0]}.glb").exists()]
    if not picked:
        print("nothing to do (all selected GLBs already exist)")
        return

    tc = TripoClient()
    print(f"submitting {len(picked)} range assets (model {tc.MODEL_VERSION}, detailed PBR)")

    tasks = {}
    for aid, prompt in picked:
        try:
            tid = tc.text_to_model(prompt)
            tasks[aid] = tid
            print(f"  submitted {aid} -> {tid}")
        except TripoError as e:
            print(f"  SUBMIT FAIL {aid}: {e}")

    done, failed = [], []
    pending = dict(tasks)
    last_note = {}
    deadline = time.time() + args.max_wait
    while pending and time.time() < deadline:
        for aid, tid in list(pending.items()):
            try:
                data = tc.status(tid)
            except TripoError as e:
                print(f"  poll error {aid}: {e}")
                continue
            st = data.get("status")
            note = f"{st} {int(data.get('progress', 0))}%"
            if last_note.get(aid) != note:
                last_note[aid] = note
                print(f"  {aid}: {note}")
            if st == "success":
                dest = OUT_DIR / f"{aid}.glb"
                try:
                    tc.download(data, dest)
                    shutil.copy(dest, PUB_DIR / f"{aid}.glb")
                    print(f"  DONE {aid} ({dest.stat().st_size // 1024} kB)")
                    done.append(aid)
                except (TripoError, OSError) as e:
                    print(f"  DOWNLOAD FAIL {aid}: {e}")
                    failed.append(aid)
                del pending[aid]
            elif st in ("failed", "cancelled", "banned", "unknown"):
                print(f"  FAILED {aid}: status={st}")
                failed.append(aid)
                del pending[aid]
        if pending:
            time.sleep(4)

    for aid in pending:
        print(f"  TIMEOUT {aid} (task {tasks[aid]} still running server-side)")
    print(f"\ndone: {len(done)} generated, {len(failed)} failed, {len(pending)} timed out")
    sys.exit(0 if done and not failed else (0 if done else 1))


if __name__ == "__main__":
    main()
