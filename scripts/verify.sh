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
length=$("$DRIFT" --still /dev/null --length-test 1 2>/dev/null | grep 'length-test' || true)
[[ "$length" == *"kept:true released:true"* ]] && pass "length kept" "$length" || fail "length kept" "$length"
order=$("$DRIFT" --still /dev/null --name-order-test 1 2>/dev/null | grep 'name-order-test' || true)
[[ "$order" == *"ok:true"* ]] && pass "drop order" || fail "drop order" "$order"

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

# Transparent exports: ProRes 4444 holds straight alpha that matches the PNG
# still (with and without a title over it), and the shadows reach the alpha.
for variant in plain titled; do
  extra=()
  [[ $variant == titled ]] && extra=(--title "Fieldnote" --kicker "SERIES A" --title-place corner --title-time throughout)
  "$DRIFT" --export "$OUT/clear-$variant.png" --scene editorial --format reel --transparent 1 "${extra[@]}" >/dev/null 2>&1
  "$DRIFT" --export "$OUT/clear-$variant.mov" --scene editorial --format reel --transparent 1 --samples 1 --seconds 0.2 "${extra[@]}" >/dev/null 2>&1
  ffmpeg -v error -y -i "$OUT/clear-$variant.mov" -frames:v 1 -pix_fmt rgba "$OUT/clear-$variant-mov.png"
  alpha=$(python3 -c "
import sys; import numpy as np; from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert('RGBA')).astype(float); b = np.asarray(Image.open(sys.argv[2]).convert('RGBA')).astype(float)
al = a[..., 3] / 255; semi = (al > 0.05) & (al < 0.95)
err = np.abs(a[..., :3][semi] - b[..., :3][semi]).mean()
shadow = ((al > 0.05) & (al < 0.6) & (a[..., :3].max(axis=2) < 40)).mean()
print('straight-error %.2f shadow-share %.3f clear-share %.3f' % (err, shadow, (al == 0).mean()))" "$OUT/clear-$variant.png" "$OUT/clear-$variant-mov.png" 2>&1)
  python3 -c "import sys; v = sys.argv[1].split(); sys.exit(0 if float(v[1]) < 3 and float(v[3]) > 0.01 and float(v[5]) > 0.005 else 1)" "$alpha" \
    && pass "transparent ($variant)" "$alpha" || fail "transparent ($variant)" "$alpha"
done

# Scenes rebuilt in round two, in landscape and reel.

# Drift's samples are 2576 × 1080, the owners' deck shape; these scenes show
# one wide slide at a time in a tall reel.
for scene in scan spotlight story; do
  "$DRIFT" --export "$OUT/drift-reel-$scene.mp4" --scene "$scene" --format reel --samples 1 >/dev/null 2>&1
  audit=$(python3 scripts/motion-audit.py "$OUT/drift-reel-$scene.mp4")
  [[ "$audit" == *" 0 flags"* ]] && pass "$scene (reel)" || fail "$scene (reel)" "$audit"
done

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
# The sample slide on Backdrop's stage never reaches an export.
"$BACKDROP" --export-frame "$OUT/backdrop-plain.png" --scene softbloom >/dev/null 2>&1
"$BACKDROP" --export-frame "$OUT/backdrop-card.png" --scene softbloom --card 1 >/dev/null 2>&1
"$BACKDROP" --still "$OUT/backdrop-stage-card.png" --scene softbloom --card 1 >/dev/null 2>&1
same=$(python3 -c "
import sys; from PIL import Image, ImageChops
a, b, c = (Image.open(sys.argv[i]).convert('RGB') for i in (1, 2, 3))
print(ImageChops.difference(a, b).getbbox() is None and ImageChops.difference(a, c).getbbox() is not None)" \
  "$OUT/backdrop-plain.png" "$OUT/backdrop-card.png" "$OUT/backdrop-stage-card.png" 2>&1)
[[ "$same" == "True" ]] && pass "backdrop export no slide" || fail "backdrop export no slide" "$same"

echo
if [[ $failures -eq 0 ]]; then echo "All checks passed. Output in $OUT"; else echo "$failures check(s) failed. Output in $OUT"; fi
exit $failures
