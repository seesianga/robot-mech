#!/usr/bin/env python3
"""
Tripo3D mech generation from the loadout-accurate appearance bible.

Prompt source is docs/mech-appearance-prompts.md — NOT assets/tripo/manifest.json.
Prompts are keyed on `<!-- tripo:<asset-id> -->` markers immediately preceding a
fenced code block.

Configuration is pinned to match the 20 GLBs already in assets/tripo/generated/:
model v3.1-20260211, texture_quality=detailed (measured 4096x4096 Color/ORM/NormalGL),
pbr on, no face cap, auto real-world scale.  Verified by reading the embedded JPEG
dimensions out of the shipped GLBs — see docs/mech-appearance-prompts.md §6.

Usage:
  python3 scripts/gen_tripo_appearance.py --dry-run     # parse + validate, no API calls
  python3 scripts/gen_tripo_appearance.py               # generate every missing mech
  python3 scripts/gen_tripo_appearance.py --ids mech-halite,mech-craton
  python3 scripts/gen_tripo_appearance.py --force       # regenerate even if GLB exists
Idempotent: a mech whose GLB already exists is skipped unless --force.
"""
import argparse
import json
import pathlib
import re
import shutil
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
CLIENT_DIR = pathlib.Path(
    "/Users/angseesiang/Library/CloudStorage/GoogleDrive-ang.see.siang@gmail.com"
    "/My Drive/macbook/API Information/tripo")

DOC = ROOT / "docs" / "mech-appearance-prompts.md"
OUT_DIR = ROOT / "assets" / "tripo" / "generated"
PUB_DIR = ROOT / "public" / "models"
MANIFEST = ROOT / "assets" / "tripo" / "manifest.json"

PROMPT_MAX = 1024          # Tripo API hard cap on the prompt field
MARKER = re.compile(r"<!--\s*tripo:([a-z0-9\-]+)\s*-->\s*\n```\n(.*?)\n```", re.S)

# The mandatory art-direction + originality clause. Every prompt must end with it.
SUFFIX_TAIL = ("Fully original design — do not imitate robots from any existing game, "
               "anime, or film franchise.")
REQUIRED_FRAGMENTS = [
    "industrial military walking tank",
    "no text, no logos",
    "PBR materials",
    "plain background",
]


def parse_prompts():
    """Extract {asset_id: prompt} from the appearance bible."""
    if not DOC.exists():
        sys.exit(f"prompt source missing: {DOC}")
    text = DOC.read_text()
    found = MARKER.findall(text)
    if not found:
        sys.exit(f"no <!-- tripo:… --> markers found in {DOC.name}")
    prompts = {}
    for aid, body in found:
        body = body.strip()
        if aid in prompts and prompts[aid] != body:
            sys.exit(f"duplicate conflicting prompt for {aid}")
        prompts[aid] = body
    return prompts


def validate(prompts):
    """Fail loudly before spending a single credit."""
    errors = []
    for aid, p in sorted(prompts.items()):
        if len(p) > PROMPT_MAX:
            errors.append(f"{aid}: {len(p)} chars exceeds the {PROMPT_MAX} API cap "
                          f"(trim {len(p) - PROMPT_MAX})")
        if not p.endswith(SUFFIX_TAIL):
            errors.append(f"{aid}: missing the originality clause at the end")
        for frag in REQUIRED_FRAGMENTS:
            if frag not in p:
                errors.append(f"{aid}: style suffix incomplete — missing {frag!r}")
    return errors


def known_manifest_ids():
    if not MANIFEST.exists():
        return set()
    data = json.loads(MANIFEST.read_text())
    return {a["id"] for a in data.get("assets", [])}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", type=str, default="",
                    help="comma-separated asset ids (default: all mechs in the doc)")
    ap.add_argument("--dry-run", action="store_true",
                    help="parse and validate only — no API calls, no credits spent")
    ap.add_argument("--force", action="store_true",
                    help="regenerate even when the GLB already exists")
    ap.add_argument("--texture-quality", default="detailed",
                    help="detailed (default, matches existing 4K assets) | standard | extreme")
    ap.add_argument("--geometry-quality", default=None,
                    help="omit (default, matches existing assets) | standard | detailed")
    ap.add_argument("--max-wait", type=int, default=1800)
    args = ap.parse_args()

    prompts = parse_prompts()
    errors = validate(prompts)

    print(f"prompt source : {DOC.relative_to(ROOT)}")
    print(f"parsed        : {len(prompts)} prompts\n")

    manifest_ids = known_manifest_ids()
    for aid, p in sorted(prompts.items()):
        exists = (OUT_DIR / f"{aid}.glb").exists()
        flags = []
        if exists:
            flags.append("generated")
        if manifest_ids and aid not in manifest_ids:
            flags.append("NOT-IN-MANIFEST")
        over = len(p) > PROMPT_MAX
        print(f"  {aid:24s} {len(p):5d}/{PROMPT_MAX} chars "
              f"{'OVER' if over else 'ok  '}  {' '.join(flags)}")

    if errors:
        print("\nVALIDATION FAILED:")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    print("\nvalidation: all prompts within the API cap and carrying the full style suffix")

    if args.ids:
        wanted = {s.strip() for s in args.ids.split(",") if s.strip()}
        unknown = wanted - set(prompts)
        if unknown:
            sys.exit(f"unknown id(s): {', '.join(sorted(unknown))}")
        picked = {k: v for k, v in prompts.items() if k in wanted}
    else:
        picked = dict(prompts)

    if not args.force:
        picked = {k: v for k, v in picked.items()
                  if not (OUT_DIR / f"{k}.glb").exists()}

    print(f"\nto generate   : {len(picked)}")
    for aid in sorted(picked):
        print(f"  - {aid}")
    if not picked:
        print("nothing to do (all selected GLBs already exist)")
        return

    if args.dry_run:
        print("\n--dry-run: stopping before any API call. No credits spent.")
        return

    sys.path.insert(0, str(CLIENT_DIR))
    try:
        from tripo_client import TripoClient, TripoError  # noqa: E402
    except ImportError as e:
        sys.exit(f"cannot import tripo_client from {CLIENT_DIR}: {e}")

    try:
        tc = TripoClient()
    except Exception as e:
        sys.exit(f"\nTripo client init failed: {e}\n"
                 f"Restore TRIPO_API_KEY in the .env at {CLIENT_DIR.parent}")

    overrides = {"texture_quality": args.texture_quality}
    if args.geometry_quality:
        overrides["geometry_quality"] = args.geometry_quality

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PUB_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\nsubmitting {len(picked)} assets — model {tc.MODEL_VERSION}, "
          f"texture_quality={args.texture_quality}"
          f"{', geometry_quality=' + args.geometry_quality if args.geometry_quality else ''}, "
          f"pbr, no face cap")

    tasks = {}
    submit_failed = []
    for aid, prompt in sorted(picked.items()):
        try:
            tid = tc.text_to_model(prompt, **overrides)
            tasks[aid] = tid
            print(f"  submitted {aid} -> {tid}")
        except TripoError as e:
            print(f"  SUBMIT FAIL {aid}: {e}")
            submit_failed.append(aid)

    if not tasks:
        sys.exit("no tasks submitted")

    done, failed = [], list(submit_failed)
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

    print(f"\ndone: {len(done)} generated, {len(failed)} failed "
          f"({len(submit_failed)} at submit), {len(pending)} timed out")
    if failed:
        print(f"  failed: {', '.join(sorted(failed))}")
    missing = sorted(set(picked) - set(done))
    if missing:
        print(f"  NOT generated: {', '.join(missing)}")
    if done:
        print("verify texture resolution with:  python3 scripts/check_tripo_quality.py")
    sys.exit(0 if done and not failed and not pending else 1)


if __name__ == "__main__":
    main()
