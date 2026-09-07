#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DMG="${1:?Pass the frozen DMG}"; CHECKSUM="${2:?Pass its mandatory checksum}"
[[ "$CHECKSUM" == "$DMG.sha256" && -f "$CHECKSUM" && ! -L "$DMG" && ! -L "$CHECKSUM" ]]
DIRECTORY="$(cd "$(dirname "$DMG")" && pwd)"; DMG="$DIRECTORY/$(basename "$DMG")"
python3 "$ROOT/scripts/freeze-macos-artifact.py" --verify "$DIRECTORY" "${DRIFT_SOURCE_REVISION:-$(git -C "$ROOT" rev-parse HEAD)}"
hdiutil verify "$DMG"
WORK=$(mktemp -d "${TMPDIR:-/tmp}/drift-verify-dmg-XXXXXXXX"); MOUNTED=0
cleanup() { local result=$?; trap - EXIT; if [[ "$MOUNTED" == 1 ]]; then hdiutil detach "$WORK" -quiet || true; fi; rmdir "$WORK" || true; exit "$result"; }
trap cleanup EXIT
hdiutil attach -readonly -nobrowse -mountpoint "$WORK" "$DMG" >/dev/null; MOUNTED=1
bash "$ROOT/scripts/verify-macos-app.sh" "$WORK/Drift.app"
# Share the installer verifier, but never invoke its installation entry point.
source "$ROOT/scripts/install-drift.sh"
verify_bundle "$WORK/Drift.app" "$DIRECTORY/MacReleaseReceipt.json"
cmp "$DIRECTORY/Install-Drift.command" "$WORK/Install-Drift.command"
hdiutil detach "$WORK" -quiet; MOUNTED=0
printf 'Verified frozen DMG and contained bundle.\n'
