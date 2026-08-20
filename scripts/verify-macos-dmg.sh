#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${DRIFT_MACOS_OUTPUT_DIR:-$ROOT/build/macos}"
PACKAGE_VERSION="$(node -p "require('$ROOT/package.json').version")"
APP_PATH="${DRIFT_MACOS_APP_PATH:-$OUTPUT_DIR/Drift.app}"
DMG_PATH="${1:-${DRIFT_DMG_OUTPUT:-$OUTPUT_DIR/Drift-${PACKAGE_VERSION}-macOS-universal.dmg}}"
CHECKSUM_PATH="${2:-${DMG_PATH}.sha256}"
MOUNT_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/drift-local-dmg-verify.XXXXXX")"
DEVICE=""

fail() {
  echo "verify-dmg(mac): $*" >&2
  exit 1
}

cleanup() {
  if [[ -n "$DEVICE" ]]; then
    hdiutil detach "$DEVICE" -quiet || hdiutil detach "$DEVICE" -force -quiet || true
  fi
  rm -rf "$MOUNT_ROOT"
}
trap cleanup EXIT

[[ "$(uname -s)" == "Darwin" ]] || fail "local DMG verification must run on macOS"
for command in hdiutil shasum node readlink; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done
[[ -f "$DMG_PATH" ]] || fail "disk image is missing: $DMG_PATH"
[[ -f "$CHECKSUM_PATH" ]] || fail "disk-image checksum is missing: $CHECKSUM_PATH"

(
  cd "$(dirname "$DMG_PATH")"
  shasum -a 256 -c "$(basename "$CHECKSUM_PATH")"
)
hdiutil verify "$DMG_PATH"

ATTACH_OUTPUT="$(hdiutil attach "$DMG_PATH" -readonly -nobrowse -mountpoint "$MOUNT_ROOT")"
DEVICE="$(awk '/^\/dev\// {print $1; exit}' <<<"$ATTACH_OUTPUT")"
[[ -n "$DEVICE" ]] || fail "disk image mounted without a readable device identifier"
[[ -d "$MOUNT_ROOT/Drift.app" ]] || fail "disk image does not contain Drift.app"
[[ -L "$MOUNT_ROOT/Applications" ]] || fail "disk image does not contain the Applications alias"
[[ "$(readlink "$MOUNT_ROOT/Applications")" == "/Applications" ]] || fail "Applications alias points somewhere unexpected"
[[ -s "$MOUNT_ROOT/Install Drift.txt" ]] || fail "install/privacy note is missing"

grep -q 'not a notarized public release' "$MOUNT_ROOT/Install Drift.txt" \
  || fail "local-only distribution boundary is absent from the install note"
grep -q 'AudioToolbox' "$MOUNT_ROOT/Install Drift.txt" \
  || fail "install note does not describe the native AudioToolbox AAC path"
grep -q 'WKWebView' "$MOUNT_ROOT/Install Drift.txt" \
  || fail "install note does not describe the H.264 capability boundary"
if grep -q 'WebKit runtime exposes a compatible system AAC encoder' "$MOUNT_ROOT/Install Drift.txt"; then
  fail "install note still describes the deleted WebKit AAC design"
fi

"$ROOT/scripts/verify-macos-app.sh" "$MOUNT_ROOT/Drift.app"

if [[ -d "$APP_PATH" ]]; then
  SOURCE_EXECUTABLE="$APP_PATH/Contents/MacOS/Drift"
  MOUNTED_EXECUTABLE="$MOUNT_ROOT/Drift.app/Contents/MacOS/Drift"
  [[ -x "$SOURCE_EXECUTABLE" && -x "$MOUNTED_EXECUTABLE" ]] || fail "source or mounted executable is missing"
  SOURCE_SHA="$(shasum -a 256 "$SOURCE_EXECUTABLE" | awk '{print $1}')"
  MOUNTED_SHA="$(shasum -a 256 "$MOUNTED_EXECUTABLE" | awk '{print $1}')"
  [[ "$SOURCE_SHA" == "$MOUNTED_SHA" ]] || fail "disk image changed the app executable"
fi

printf 'Local Drift DMG verification passed.\n'
printf '  DMG: %s\n' "$DMG_PATH"
printf '  Checksum: %s\n' "$CHECKSUM_PATH"
printf '  Boundary: verified local evidence; not notarized or published.\n'
