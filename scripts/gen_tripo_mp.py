#!/usr/bin/env python3
"""
Tripo3D multiplayer arena assets (env_mp_*) from docs/multiplayer-design.md §4.
Same shared max-quality TripoClient as gen_tripo.py / gen_tripo_range.py.

Competitive-readability rule: objective props must read by silhouette + emissive
color alone at 500 m; cover pieces keep simple honest silhouettes (collision is
authored in-engine as boxes — these are the visual dressing pass).

Usage:
  python3 scripts/gen_tripo_mp.py            # all arena assets
  python3 scripts/gen_tripo_mp.py --ids vp_prop_shared_flag,vp_prop_shared_beacon
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

STYLE = ("military science fiction, hard-surface game asset, battle-worn painted metal, "
         "lunar-grey and olive-drab, PBR materials, clean readable silhouette, "
         "neutral studio background")

ASSETS = [
    ("vp_prop_shared_flag",
     f"tall battle standard pole on a heavy armored base plinth, glowing emissive banner rail, team beacon lamp on top, {STYLE}"),
    ("vp_prop_shared_beacon",
     f"carryable armored beacon case with glowing energy core window, heavy handles, antenna stub, {STYLE}"),
    ("vp_struct_shared_hill-pylon",
     f"control zone emitter pylon, tapered column with glowing ring emitter head, armored cable base, {STYLE}"),
    ("env_mp_spawn_gantry",
     f"tall drop bay gantry structure, open exit arch, overhead crane rail, floodlights, blast-scarred deck plating, {STYLE}"),
    ("env_mp_repair_pad",
     f"octagonal repair and rearm pad, recessed deck with folded service arms, warning chevrons, corner light masts, {STYLE}"),
    ("env_mp_wall",
     f"modular blast wall segment, angled deflection face, bolt seams, worn concrete and steel, neutral grey, {STYLE}"),
    ("env_mp_halfwall",
     f"low half-cover barrier segment, sloped face, sandbag skirt, worn steel, neutral grey, {STYLE}"),
    ("env_mp_bunker",
     f"squat armored pillbox bunker with firing slit and rear door, worn concrete, neutral grey, {STYLE}"),
    ("env_mp_comm_tower",
     f"tall lattice communications tower with holographic scoreboard billboard frame at the top, dish cluster, {STYLE}"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", type=str, default="")
    ap.add_argument("--max-wait", type=int, default=900)
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
    print(f"submitting {len(picked)} arena assets (model {tc.MODEL_VERSION}, detailed PBR)")

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
            time.sleep(5)

    for aid in pending:
        print(f"  TIMEOUT {aid} (task {tasks[aid]} still running server-side)")
    print(f"\ndone: {len(done)} generated, {len(failed)} failed, {len(pending)} timed out")
    sys.exit(0 if done and not failed else (0 if done else 1))


if __name__ == "__main__":
    main()
