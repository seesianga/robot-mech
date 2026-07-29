#!/usr/bin/env bash
# Veyra Prime — Drive-mount hygiene sweep. docs/PLATFORM_STANDARD.md §3.2
#
# Run nightly, and ALWAYS after any session where two machines may have touched
# the folder. Reports by default; --fix removes litter.
#
#   ops/scripts/drive-hygiene.sh          # report only
#   ops/scripts/drive-hygiene.sh --fix    # remove litter (never touches source)

set -euo pipefail
: "${MW_ROOT:?set MW_ROOT (quote it)}"

FIX=0
[ "${1:-}" = "--fix" ] && FIX=1
status=0

echo "=== Drive hygiene: $MW_ROOT"

# ── 1. conflict duplicates — the dangerous one ───────────────────────────────
# Drive resolves a two-machine conflict by writing "file (1).ts". A duplicated
# .ts that still compiles is a silent bug factory.
echo "--- conflict duplicates"
dupes=$(find "$MW_ROOT" -regex '.*([0-9])\..*' -not -path "*/node_modules/*" 2>/dev/null || true)
if [ -n "$dupes" ]; then
  echo "!!  CONFLICT DUPLICATES FOUND. Do not delete blindly — diff each against its"
  echo "!!  original first. One of them contains work someone did."
  echo "$dupes"
  status=1
else
  echo "    none"
fi

# ── 2. litter ────────────────────────────────────────────────────────────────
echo "--- litter (.DS_Store, Icon, ~\$*, *.tmp)"
litter=$(find "$MW_ROOT" \( -name '.DS_Store' -o -name 'Icon?' -o -name '~$*' -o -name '*.tmp' \) \
         -not -path "*/node_modules/*" 2>/dev/null || true)
n=$(printf '%s' "$litter" | grep -c . || true)
echo "    $n file(s)"
if [ "$n" -gt 0 ] && [ "$FIX" = 1 ]; then
  printf '%s\n' "$litter" | while IFS= read -r f; do [ -n "$f" ] && rm -f "$f"; done
  echo "    removed"
fi

# ── 3. build artefacts that must not live on the mount ───────────────────────
echo "--- build artefacts inside the Drive mount"
for d in node_modules dist .vite .turbo .wrangler; do
  if [ -e "$MW_ROOT/$d" ]; then
    echo "!!  $d/ is inside the Drive mount ($(du -sh "$MW_ROOT/$d" 2>/dev/null | cut -f1))."
    echo "    §3.2 requires it in \$MW_BUILD. Run ops/scripts/bootstrap.sh."
    status=1
  fi
done

# ── 4. case-only collisions (macOS is case-insensitive, Linux CI is not) ─────
echo "--- case-only filename collisions"
coll=$(find "$MW_ROOT" -type f -not -path "*/node_modules/*" 2>/dev/null \
       | tr 'A-Z' 'a-z' | sort | uniq -d || true)
if [ -n "$coll" ]; then
  echo "!!  these paths collide when lowercased — Linux CI will fail:"
  echo "$coll"
  status=1
else
  echo "    none"
fi

# ── 5. unquoted $MW_ROOT in scripts ─────────────────────────────────────────
# Only real code counts. Strip the grep "file:line:" prefix before deciding whether
# the hit is a comment, and skip this script (it necessarily contains the pattern).
echo "--- unquoted \$MW_ROOT (the path has spaces AND an @)"
bad=$(grep -rn '\$MW_ROOT[^"/]' "$MW_ROOT/ops" "$MW_ROOT/scripts" 2>/dev/null \
      | grep -v 'drive-hygiene\.sh:' \
      | awk -F: '{ code=$0; sub(/^[^:]*:[0-9]+:/, "", code);
                   sub(/^[ \t]+/, "", code);
                   if (code !~ /^#/) print }' || true)
if [ -n "$bad" ]; then
  echo "$bad"
  echo "!!  unquoted expansion above — this splits on spaces and deletes things."
  status=1
else
  echo "    none"
fi

# ── 6. secrets that must never be on the Drive ──────────────────────────────
echo "--- secrets on the mount"
if find "$MW_ROOT" -maxdepth 2 -name '.env' -not -name '.env.example' 2>/dev/null | grep -q .; then
  echo "!!  a real .env is on the Drive mount. It belongs only in \$MW_BUILD/mw/.env."
  status=1
else
  echo "    none"
fi

echo "=== done (exit $status)"
exit $status
