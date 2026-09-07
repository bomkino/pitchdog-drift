#!/bin/bash
# Package the exact already-tested native bundle. Never rebuild or re-sign it.
set -euo pipefail
umask 022
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
APP="$ROOT/build/native-roundtrip/Drift.app"
OUTPUT="$ROOT/build/native-release"
PROOF="$ROOT/build/native-app-evidence/NativeJourneyReceipt.json"
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || { echo 'Packaging requires a clean committed checkout.' >&2; exit 1; }
bash scripts/verify-macos-app.sh "$APP"
VERSION=$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ "$VERSION" == "$(node -p 'JSON.parse(require("fs").readFileSync("package.json")).version')" ]]
DMG="$OUTPUT/Drift-$VERSION-macOS-arm64.dmg"
[[ ! -e "$OUTPUT" ]] || { echo 'Release staging already exists; preserve accepted bytes and choose a fresh checkout.' >&2; exit 1; }
[[ -f "$PROOF" ]]
WORK=$(mktemp -d "${TMPDIR:-/tmp}/drift-dmg-XXXXXXXX"); MOUNTED=0
cleanup() { local result=$?; trap - EXIT; if [[ "$MOUNTED" == 1 ]]; then hdiutil detach "$WORK/mounted" -quiet || true; fi; rm -rf "$WORK"; exit "$result"; }
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
mkdir "$OUTPUT" "$WORK/stage" "$WORK/mounted"
ditto "$APP" "$WORK/stage/Drift.app"
cp scripts/install-drift.sh "$OUTPUT/Install-Drift.command"
chmod 755 "$OUTPUT/Install-Drift.command"
cp "$OUTPUT/Install-Drift.command" "$WORK/stage/Install-Drift.command"
cat > "$WORK/stage/Install Drift.txt" <<EOF
Drift $VERSION — Apple silicon / macOS 13.3+

For a safe replacement, use Install-Drift.command from the verified release.
It verifies source, version, signature and checksums before asking Drift to quit,
respects cancelled Quit, and retains your previous application for rollback.
It does not modify projects or originals. Do not run it with sudo.

The app follows macOS Light/Dark appearance; artwork keeps its own colors.
The native .pitched format is new. Legacy web/hybrid projects are not migrated.

Read the external MacReleaseReceipt.json for signing/notarization status.
Ad-hoc builds are unnotarized. If macOS blocks this
trusted download, use System Settings > Privacy & Security > Open Anyway.
Never disable Gatekeeper or remove quarantine as a workaround.

Source: https://github.com/bomkino/pitchdog-drift/tree/$(git rev-parse HEAD)
Guidance and licenses: Drift.app/Contents/Resources
EOF
hdiutil create -volname Drift -srcfolder "$WORK/stage" -format UDZO -imagekey zlib-level=9 "$DMG"
if codesign -dv --verbose=4 "$APP" 2>&1 | grep -q 'Authority=Developer ID Application:'; then
  [[ "${DRIFT_MACOS_SIGN_IDENTITY:-}" == 'Developer ID Application:'* ]]
  codesign --sign "$DRIFT_MACOS_SIGN_IDENTITY" --timestamp "$DMG"
  bash scripts/notarize-native.sh "$DMG" "$ROOT/build/release/notary-dmg.json"
  xcrun stapler staple "$DMG"
  xcrun stapler validate "$DMG"
fi
hdiutil verify "$DMG"
hdiutil attach -readonly -nobrowse -mountpoint "$WORK/mounted" "$DMG" >/dev/null; MOUNTED=1
bash scripts/verify-macos-app.sh "$WORK/mounted/Drift.app"
diff -qr "$APP" "$WORK/mounted/Drift.app"
cmp "$OUTPUT/Install-Drift.command" "$WORK/mounted/Install-Drift.command"
hdiutil detach "$WORK/mounted" -quiet; MOUNTED=0
(cd "$OUTPUT"; shasum -a 256 "$(basename "$DMG")") > "$DMG.sha256"
python3 scripts/freeze-macos-artifact.py --freeze "$OUTPUT" "$APP" "$PROOF"
bash scripts/verify-macos-dmg.sh "$DMG" "$DMG.sha256"
printf 'Frozen installer: %s\n' "$DMG"
