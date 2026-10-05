#!/bin/bash
# Builds the three apps, then checks the essentials headlessly, the same way
# the review was checked: the interface type, scene styles and previews,
# undo, saving, a title card that loops cleanly, a three-format export with
# sound in every file, and a handful of scenes through the motion audit.
# About ten minutes on an M2.
#
#   bash scripts/verify.sh [parent-folder]
#
# Writes into a studio-verify folder inside the parent (the temporary folder by
# default), replacing only that folder. Needs ffmpeg, ffprobe and python3 with
# numpy for the motion audit.
set -uo pipefail
PARENT="${1:-${TMPDIR:-/tmp}}"
mkdir -p "$PARENT" || exit 1
PARENT="$(cd "$PARENT" && pwd)"
cd "$(dirname "$0")/.."
OUT="$PARENT/studio-verify"
rm -rf "$OUT"
mkdir -p "$OUT"

bash scripts/build-apps.sh release > "$OUT/build.log" 2>&1 || { echo "build: FAILED (see $OUT/build.log)"; exit 1; }
DRIFT="../dist/Drift 2.app/Contents/MacOS/Drift"
GALILEO="../dist/Galileo 2.app/Contents/MacOS/Galileo"
BACKDROP="../dist/Backdrop.app/Contents/MacOS/Backdrop"

failures=0
pass() { printf '%-26s ok   %s\n' "$1" "${2:-}"; }
fail() { printf '%-26s FAIL %s\n' "$1" "${2:-}"; failures=$((failures + 1)); }

# Interface type: system roles, and the title faces that ship with macOS.
status=$("$DRIFT" --snapshot "$OUT/drift.png" --settle 2 2>/dev/null | grep -o 'type:.*' || true)
[[ "$status" == *"system type, 14 roles, 4 title faces"* ]] && pass "interface type" "$status" || fail "interface type" "$status"

# Drift's Stream comes in nine styles; resting on a scene previews it without changing the project.
styles=$("$DRIFT" --still /dev/null --scene noir 2>/dev/null | grep '^still' || true)
[[ "$styles" == *"scene noir group stream styles 9"* ]] && pass "scene styles" || fail "scene styles" "$styles"
preview=$("$DRIFT" --still "$OUT/preview.png" --preview-scene shuffle 2>/dev/null | grep '^still' || true)
[[ "$preview" == *"scene editorial group stream"*"preview shuffle"* && -s "$OUT/preview.png" ]] && pass "scene preview" || fail "scene preview" "$preview"

# Undo: a scene change undoes and redoes; a slider drag is one step.
undo=$("$DRIFT" --still /dev/null --undo-test 1 2>/dev/null | grep 'undo-test' || true)
[[ "$undo" == *"gesture-one-step:true"* && "$undo" == *"redone:true"* ]] && pass "undo" || fail "undo" "$undo"
# Typing a title, then another change while the field keeps focus: two steps, in order.
undo=$("$DRIFT" --still /dev/null --undo-title-test 1 2>/dev/null | grep 'undo-title-test' || true)
[[ "$undo" == *"placement-first:true typing-second:true drag-rest:true"* ]] && pass "title undo" || fail "title undo" "$undo"

# Saving: a normal save writes the package; with a media file lost from the
# working copy (and no saved package to take it from) the save must refuse.
saved=$("$DRIFT" --still /dev/null --save-to "$OUT/saved.drift" 2>/dev/null | grep -E '^saved|save failed' || true)
[[ "$saved" == saved* && -f "$OUT/saved.drift/project.json" ]] && pass "save" || fail "save" "$saved"
refused=$("$DRIFT" --still /dev/null --drop-media 1 --save-to "$OUT/lost.drift" 2>/dev/null | grep -E '^saved|save failed' || true)
[[ "$refused" == "save failed"* && ! -e "$OUT/lost.drift" ]] && pass "save refuses lost media" || fail "save refuses lost media" "$refused"

# A clip keeps its length through undo and redo of its import.
ffmpeg -v error -f lavfi -i testsrc=duration=3:size=640x360:rate=30 -pix_fmt yuv420p "$OUT/clip.mp4"
clip=$("$GALILEO" --still /dev/null --media "$OUT/clip.mp4" --undo-clip-test 1 2>/dev/null | grep 'undo-clip-test' || true)
[[ "$clip" == *"after:3.00"* ]] && pass "clip undo" "$clip" || fail "clip undo" "$clip"

# A title card over Editorial Drift: the loop must close with no pops.
"$DRIFT" --export "$OUT/title-card.mp4" --scene editorial --format landscape --title "Fieldnote" --kicker "SERIES A" \
  --title-place centre --title-time opening --samples 1 >/dev/null 2>&1
audit=$(python3 scripts/motion-audit.py "$OUT/title-card.mp4")
[[ "$audit" == *" 0 flags"* ]] && pass "title card loop" || fail "title card loop" "$audit"

# Three formats in one run, each with its own sound track.
"$DRIFT" --export "$OUT/batch" --formats reel,square,landscape --scene opening --sound editorial --samples 1 >/dev/null 2>&1
files=0; with_sound=0
for f in "$OUT"/batch/*.mp4; do
  [[ -e "$f" ]] || continue
  files=$((files + 1))
  ffprobe -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 "$f" | grep -q aac && with_sound=$((with_sound + 1))
done
[[ $files -eq 3 && $with_sound -eq 3 ]] && pass "three formats" "$files files, $with_sound with sound" || fail "three formats" "$files files, $with_sound with sound"

# Scenes rebuilt in round two, in landscape and reel.
for scene in corridor hang vitrine scatter; do
  for fmt in landscape reel; do
    "$GALILEO" --export "$OUT/galileo-$fmt-$scene.mp4" --scene "$scene" --format "$fmt" --samples 1 >/dev/null 2>&1
    audit=$(python3 scripts/motion-audit.py "$OUT/galileo-$fmt-$scene.mp4")
    [[ "$audit" == *" 0 flags"* ]] && pass "$scene ($fmt)" || fail "$scene ($fmt)" "$audit"
  done
done

# Backdrop renders a still.
"$BACKDROP" --still "$OUT/backdrop.png" --scene softbloom >/dev/null 2>&1
[[ -s "$OUT/backdrop.png" ]] && pass "backdrop still" || fail "backdrop still"

echo
if [[ $failures -eq 0 ]]; then echo "All checks passed. Output in $OUT"; else echo "$failures check(s) failed. Output in $OUT"; fi
exit $failures
