#!/usr/bin/env python3
"""
Tripo3D asset generation for Veyra Prime, at the max-quality configuration
baked into the shared TripoClient (model v3.1-20260211, detailed PBR textures,
no face cap, auto real-world scale).

Reads assets/tripo/manifest.json, submits every selected asset concurrently,
polls to completion, downloads GLBs to assets/tripo/generated/<id>.glb and
copies them to public/models/ for the in-browser viewer.

Usage:
  python3 scripts/gen_tripo.py                 # priority-1 assets (heroes)
  python3 scripts/gen_tripo.py --priority 2    # priority <= 2
  python3 scripts/gen_tripo.py --ids vp_frame_shared_skarn,veh-hover-skiff
  python3 scripts/gen_tripo.py --all
Idempotent: assets whose GLB already exists are skipped.
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

OUT_DIR = ROOT / "assets" / "tripo" / "generated"
PUB_DIR = ROOT / "public" / "models"
OUT_DIR.mkdir(parents=True, exist_ok=True)
PUB_DIR.mkdir(parents=True, exist_ok=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--priority", type=int, default=1,
                    help="generate assets with priority <= N (default 1)")
    ap.add_argument("--ids", type=str, default="",
                    help="comma-separated asset ids (overrides --priority)")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--max-wait", type=int, default=600)
    args = ap.parse_args()

    manifest = json.loads((ROOT / "assets" / "tripo" / "manifest.json").read_text())
    assets = manifest["assets"]
    if args.ids:
        wanted = set(args.ids.split(","))
        picked = [a for a in assets if a["id"] in wanted]
    elif args.all:
        picked = assets
    else:
        picked = [a for a in assets if a.get("priority", 3) <= args.priority]

    picked = [a for a in picked if not (OUT_DIR / f"{a['id']}.glb").exists()]
    if not picked:
        print("nothing to do (all selected GLBs already exist)")
        return

    tc = TripoClient()
    print(f"submitting {len(picked)} assets at max quality "
          f"(model {tc.MODEL_VERSION}, detailed PBR, no face cap)")

    tasks = {}
    for a in picked:
        try:
            tid = tc.text_to_model(a["prompt"])
            tasks[a["id"]] = tid
            print(f"  submitted {a['id']} -> {tid}")
        except TripoError as e:
            print(f"  SUBMIT FAIL {a['id']}: {e}")

    done, failed = [], []
    deadline = time.time() + args.max_wait
    pending = dict(tasks)
    last_note = {}
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
                    kb = dest.stat().st_size // 1024
                    print(f"  DONE {aid} ({kb} kB) -> {dest.name}")
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
