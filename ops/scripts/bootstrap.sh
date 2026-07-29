#!/usr/bin/env bash
# Veyra Prime — the only supported way to start work.
# docs/PLATFORM_STANDARD.md §3.2
#
# Splits the Drive mount (source of record) from the build directory (disposable):
#   $MW_ROOT  — synced, versioned, backed up. Masters and human-facing folders.
#   $MW_BUILD — local, fast, disposable. The active git working tree and node_modules.
#
# Run once per machine. Idempotent.

set -euo pipefail

: "${MW_ROOT:?set MW_ROOT (quote it — the path contains spaces and an @)}"
: "${MW_BUILD:=$HOME/mw-build}"

MIRROR="$MW_ROOT/.git-mirror/mw.git"
TREE="$MW_BUILD/mw"

# ── 1. one-time: create the bare mirror from the current Drive contents ───────
if [ ! -d "$MIRROR" ]; then
  echo "==> No mirror yet. Creating the first repository from $MW_ROOT"
  echo "    This is the ONE TIME the Drive mount is used as a working tree."

  if [ ! -f "$MW_ROOT/.gitignore" ]; then
    echo "!!  $MW_ROOT/.gitignore is missing. Refusing to init — you would commit 3.4 GB."
    exit 1
  fi

  git -C "$MW_ROOT" init -q
  git -C "$MW_ROOT" add -A
  git -C "$MW_ROOT" -c user.name="bootstrap" -c user.email="bootstrap@local" \
      commit -q -m "Import Veyra Prime at convergence (see docs/CONVERGENCE_PLAN.md)"

  mkdir -p "$(dirname "$MIRROR")"
  git clone -q --bare "$MW_ROOT" "$MIRROR"

  # The Drive mount must NOT remain a working tree — that is what §3.2 forbids.
  rm -rf "$MW_ROOT/.git"
  echo "==> Mirror created at $MIRROR; Drive working tree removed."
fi

# ── 2. clone the working tree OUT of the Drive mount ─────────────────────────
mkdir -p "$MW_BUILD"
[ -d "$TREE" ] || git clone -q "$MIRROR" "$TREE"
# `git clone` names its source "origin". Here the source is the Drive mirror, which
# would leave the name that belongs to the real git host already taken — and
# `git remote add origin <host>` then fails with "remote origin already exists".
# Rename it up front so "origin" stays free for a real host and pushes to the Drive
# are spelled explicitly.
if git -C "$TREE" remote | grep -qx origin && \
   [ "$(git -C "$TREE" remote get-url origin)" = "$MIRROR" ]; then
  git -C "$TREE" remote rename origin mirror
fi

# ── 3. dependencies — NEVER inside the Drive mount ───────────────────────────
cd "$TREE"
npm ci 2>/dev/null || npm install

# ── 4. binary asset trees stay on the Drive; link them into the tree ─────────
# Only the gitignored binary trees are linked. public/ itself is PARTIALLY tracked
# (.assetsignore and fonts/ are in git), so linking the whole directory would nest
# a symlink inside the real one — link the ignored subdirectories individually.
link_master() {
  local src="$MW_ROOT/$1" dst="$TREE/$1"
  [ -e "$src" ] || { echo "    skip $1 (not present on the Drive)"; return 0; }
  if [ -e "$dst" ] && [ ! -L "$dst" ]; then
    echo "!!  $dst exists and is NOT a symlink — refusing to replace real data."
    echo "    Move it aside and re-run."
    return 1
  fi
  mkdir -p "$(dirname "$dst")"
  ln -sfn "$src" "$dst"
  echo "    linked $1"
}

mkdir -p "$TREE/public"
for p in assets masters public/models public/audio public/textures public/site; do
  link_master "$p"
done

# ── 5. secrets ───────────────────────────────────────────────────────────────
if [ ! -f "$TREE/.env" ]; then
  cp "$MW_ROOT/.env.example" "$TREE/.env"
  echo "==> Created $TREE/.env from the template. Fill it in. It is gitignored and"
  echo "    must never be copied back to the Drive."
fi

cat <<EOF

ready.
  working tree : $TREE          <- work here, run npm here
  masters      : "$MW_ROOT"     <- read-only, synced, backed up
  mirror       : $MIRROR

Remotes: the Drive mirror is "mirror". "origin" is deliberately left free for a real
git host — the Drive is a backup, not an off-site remote, and it is the one copy that
dies with this laptop.

  git -C "$TREE" remote add origin <real-git-host>      # add this, it is not optional
  git -C "$TREE" push -u origin main
  git -C "$TREE" push mirror main                       # after each push to origin

Never run npm install inside "$MW_ROOT".
Never open the same folder from two machines at once.
EOF
