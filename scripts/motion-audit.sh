#!/bin/bash
# Exports every Drift World and Galileo Scene without motion blur, in landscape
# and reel, then runs motion-audit.py on each. Build the apps first. Set DRIFT
# and GALILEO to audit copies of the apps, so a rebuild cannot swap them mid-run.
#
#   bash scripts/motion-audit.sh <out-dir> <deck.pdf>
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:?output folder}"
DECK="${2:?a PDF deck for Drift}"
mkdir -p "$OUT"
DRIFT="${DRIFT:-../dist/Drift 2.app/Contents/MacOS/Drift}"
GALILEO="${GALILEO:-../dist/Galileo 2.app/Contents/MacOS/Galileo}"
WORLDS="editorial noir sunstruck dread tender velvet celluloid nightrun procession story wall spotlight shuffle opening contact"
SCENES="drift corridor vitrine shelf orbit hand scatter story wall deck contact compare opening hang"
for fmt in landscape reel; do
  for w in $WORLDS; do
    "$DRIFT" --export "$OUT/drift-$fmt-$w.mp4" --scene "$w" --media "$DECK" --format "$fmt" --samples 1 >/dev/null 2>&1
    python3 scripts/motion-audit.py "$OUT/drift-$fmt-$w.mp4"
  done
  for s in $SCENES; do
    "$GALILEO" --export "$OUT/galileo-$fmt-$s.mp4" --scene "$s" --format "$fmt" --samples 1 >/dev/null 2>&1
    python3 scripts/motion-audit.py "$OUT/galileo-$fmt-$s.mp4"
  done
done
