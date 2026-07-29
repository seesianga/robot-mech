#!/usr/bin/env python3
"""
Landing-page key art via gpt-image-2, at NATIVE 4K.

Why native and not upscaled: gpt-image-2 accepts a longest edge up to 3840 px, so
16:9 hero plates come back as a true 3840x2160 render. This is a real change from
scripts/gen_ground_texture.py, which was written against a model that topped out
near 1024 and had to Lanczos its way to 4096. Do not copy the upscale step here —
asking for 3840 directly gives detail an upscale cannot invent.

Source of truth: content/site-art-plan.json (written by the art-direction pass).
Masters land in assets/site/raw/ and are NOT served. Web deliverables go to
public/site/ as a responsive ladder — AVIF first, WebP as the fallback, both at
several widths so a phone never pulls a 4K plate.

Idempotent: an id whose master already exists is skipped unless --force. Each
image is a slow call (4K high quality runs 2-6 minutes), so run this detached and
poll the log rather than waiting on it.

Flags: --only id,id   --force   --plan <path>   --no-derivatives
"""
# The system python here is 3.9, where `bytes | None` in an annotation is
# evaluated at def time and raises. Deferring annotations keeps the modern
# syntax readable without pinning a newer interpreter.
from __future__ import annotations

import argparse
import base64
import concurrent.futures as futures
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENV = ROOT.parent / "API Information" / ".env"
RAW = ROOT / "assets" / "site" / "raw"
OUT = ROOT / "public" / "site"
PLAN = ROOT / "content" / "site-art-plan.json"
PROV = ROOT / "content" / "site-art-provenance.json"

# gpt-image-2 caps the longest edge at 3840. These are the only three shapes the
# page uses; each is native, none is upscaled.
SIZES = {
    "landscape": "3840x2160",
    "portrait": "2160x3840",
    "square": "3840x3840",
}

# Appended to every prompt. Text is the big failure mode: image models render
# letterforms as garbage and nothing reads cheaper on a premium page.
STYLE = (
    "Photorealistic cinematic still, filmic color grading, high dynamic range, "
    "physically accurate lighting and materials, fine surface detail, "
    "volumetric atmosphere, shot on a full-frame cinema camera with anamorphic "
    "primes. Absolutely no text, no letters, no numbers, no logos, no signage, "
    "no watermarks, no user interface, no captions anywhere in the frame."
)


def load_env() -> dict:
    env = {}
    if ENV.exists():
        for line in ENV.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def edit(prompt: str, base: pathlib.Path, size: str, key: str, tries: int = 3) -> bytes:
    """
    Grade pass: hand gpt-image-2 a real render and ask it to finish the frame.

    This is the honest way to make a hero plate. The subject is the actual
    shipped GLB, rendered on the actual showroom lighting rig, so the machine on
    the poster and the machine the visitor can spin are the same object — a
    from-scratch generation would invent a different mech wearing the same name.

    The render is captured with a transparent background on purpose: the alpha
    channel is the editable region, so the model builds the commissioning hall
    around a subject it is not free to redesign.
    """
    import requests  # local: only the edit path needs multipart

    last = None
    for attempt in range(1, tries + 1):
        try:
            with base.open("rb") as fh:
                r = requests.post(
                    "https://api.openai.com/v1/images/edits",
                    headers={"Authorization": f"Bearer {key}"},
                    files={"image": (base.name, fh, "image/png")},
                    data={"model": "gpt-image-2", "prompt": prompt,
                          "size": size, "quality": "high", "n": "1"},
                    timeout=900,
                )
            if r.status_code == 200:
                return base64.b64decode(r.json()["data"][0]["b64_json"])
            last = f"HTTP {r.status_code}: {r.text[:300]}"
            if r.status_code != 429 and 400 <= r.status_code < 500:
                raise RuntimeError(last)
        except RuntimeError:
            raise
        except Exception as e:  # noqa: BLE001
            last = repr(e)
        if attempt < tries:
            time.sleep(15 * attempt)
    raise RuntimeError(f"exhausted retries: {last}")


def generate(prompt: str, size: str, key: str, tries: int = 3) -> bytes:
    """One gpt-image-2 call. Returns PNG bytes."""
    body = json.dumps({
        "model": "gpt-image-2",
        "prompt": prompt,
        "size": size,
        "quality": "high",
        "n": 1,
    }).encode()
    last = None
    for attempt in range(1, tries + 1):
        req = urllib.request.Request(
            "https://api.openai.com/v1/images/generations",
            data=body,
            headers={"Authorization": f"Bearer {key}",
                     "Content-Type": "application/json"},
        )
        try:
            # 4K high-quality renders routinely run past four minutes.
            with urllib.request.urlopen(req, timeout=900) as r:
                payload = json.load(r)
            return base64.b64decode(payload["data"][0]["b64_json"])
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:300]
            last = f"HTTP {e.code}: {detail}"
            # 4xx other than rate-limit is a bad prompt; retrying wastes minutes.
            if e.code != 429 and 400 <= e.code < 500:
                raise RuntimeError(last)
        except Exception as e:  # noqa: BLE001 — network/timeout, worth a retry
            last = repr(e)
        if attempt < tries:
            back = 15 * attempt
            print(f"      retry {attempt}/{tries - 1} in {back}s ({last})", flush=True)
            time.sleep(back)
    raise RuntimeError(f"exhausted retries: {last}")


"""Responsive-ladder encoding is shared with the in-engine gameplay captures —
see scripts/site_derivatives.py. Keeping one implementation means key art and
screenshots can never drift apart in encoder settings or file naming."""
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from site_derivatives import ladder  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=None)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--plan", default=str(PLAN))
    ap.add_argument("--no-derivatives", action="store_true")
    ap.add_argument("--jobs", type=int, default=3,
                    help="concurrent generations; the API is the bottleneck")
    args = ap.parse_args()

    key = load_env().get("OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY", "")
    if not key:
        print(f"no OPENAI_API_KEY in {ENV}", file=sys.stderr)
        return 2

    plan_path = pathlib.Path(args.plan)
    if not plan_path.exists():
        print(f"no art plan at {plan_path}", file=sys.stderr)
        return 2
    items = json.loads(plan_path.read_text())["keyArt"]

    only = set(args.only.split(",")) if args.only else None
    if only:
        items = [i for i in items if i["id"] in only]

    RAW.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    prov = json.loads(PROV.read_text()) if PROV.exists() else {}

    todo, skipped = [], []
    for item in items:
        master = RAW / f"{item['id']}.png"
        if master.exists() and not args.force:
            skipped.append(item)
        else:
            todo.append(item)

    print(f"plan: {len(items)} images — {len(todo)} to generate, "
          f"{len(skipped)} already present", flush=True)

    def one(item: dict) -> tuple[dict, bytes | None, str | None]:
        size = SIZES[item.get("aspect", "landscape")]
        prompt = f"{item['prompt'].strip()} {STYLE}"
        t0 = time.time()
        base_id = item.get("base")
        mode = "edit" if base_id else "generate"
        print(f"  -> {item['id']} @{size} ({mode})", flush=True)
        try:
            if base_id:
                base = RAW / f"{base_id}.png"
                if not base.exists():
                    return item, None, (f"base plate {base.name} missing — run "
                                        f"`npm run plinthshot` first")
                png = edit(prompt, base, size, key)
            else:
                png = generate(prompt, size, key)
        except Exception as e:  # noqa: BLE001
            return item, None, str(e)
        print(f"  ok {item['id']} in {time.time() - t0:.0f}s "
              f"({len(png) // 1024}KB)", flush=True)
        return item, png, None

    failed = []
    if todo:
        with futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
            for item, png, err in pool.map(one, todo):
                if err:
                    print(f"  FAIL {item['id']}: {err}", flush=True)
                    failed.append(item["id"])
                    continue
                master = RAW / f"{item['id']}.png"
                master.write_bytes(png)
                with Image.open(master) as im:
                    dims = f"{im.width}x{im.height}"
                prov[item["id"]] = {
                    "model": "gpt-image-2",
                    "mode": "edit" if item.get("base") else "generate",
                    "base": item.get("base"),
                    "size": SIZES[item.get("aspect", "landscape")],
                    "actual": dims,
                    "quality": "high",
                    "prompt": item["prompt"],
                    "usage": item.get("usage", ""),
                }
                print(f"     master {dims} -> {master.name}", flush=True)

    if not args.no_derivatives:
        for item in items:
            master = RAW / f"{item['id']}.png"
            if not master.exists():
                continue
            entry = ladder(master)
            avif = entry["sources"].get("avif", [])
            print(f"  web {item['id']}: {entry['master']} -> "
                  f"{len(avif)} avif + webp sizes", flush=True)

    PROV.write_text(json.dumps(prov, indent=2) + "\n")

    if failed:
        print(f"\nNOT generated: {', '.join(failed)}", file=sys.stderr)
        return 1
    print("\nall key art present", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
