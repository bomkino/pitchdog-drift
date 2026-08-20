#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${DRIFT_MACOS_OUTPUT_DIR:-${ROOT_DIR}/build/macos}"
APP_BUNDLE="${OUTPUT_DIR}/Drift.app"
PACKAGE_VERSION="$(node -p "require('${ROOT_DIR}/package.json').version")"
DMG_OUTPUT="${DRIFT_DMG_OUTPUT:-${OUTPUT_DIR}/Drift-${PACKAGE_VERSION}-macOS-universal.dmg}"
CHECKSUM_OUTPUT="${DMG_OUTPUT}.sha256"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/drift-dmg.XXXXXX")"
STAGE_DIR="${TEMP_DIR}/Drift"
MOUNT_DIR="${TEMP_DIR}/mounted"
MOUNTED=0

cleanup() {
  if [[ "${MOUNTED}" == "1" ]]; then
    hdiutil detach "${MOUNT_DIR}" -quiet >/dev/null 2>&1 || true
  fi
  rm -rf "${TEMP_DIR}"
}
trap cleanup EXIT

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "The Drift disk image must be packaged on macOS." >&2
  exit 1
fi
for command in hdiutil node shasum; do
  command -v "${command}" >/dev/null 2>&1 || {
    echo "Missing required command: ${command}" >&2
    exit 1
  }
done

cd "${ROOT_DIR}"
if [[ "${DRIFT_SKIP_APP_BUILD:-0}" != "1" ]]; then
  npm run build:mac
fi
bash scripts/verify-macos-app.sh "${APP_BUNDLE}"

mkdir -p "${STAGE_DIR}" "${MOUNT_DIR}" "$(dirname "${DMG_OUTPUT}")"
cp -R "${APP_BUNDLE}" "${STAGE_DIR}/Drift.app"
ln -s /Applications "${STAGE_DIR}/Applications"
cat > "${STAGE_DIR}/Install Drift.txt" <<'EOF'
DRIFT FOR macOS

1. Drag Drift.app to the Applications alias.
2. Open Drift from Applications.
3. Add slide images or open a .pitched project. Your media stays on this Mac.

This local disk image is not a notarized public release. macOS may block it when
it arrives through a quarantining download. Public distribution requires a
Developer ID signature, Apple notarization, stapling, Gatekeeper assessment,
and physical-Mac release QA.

The standalone app contains no FFmpeg WebAssembly encoder. Presenter audio uses
Drift’s bounded native bridge to Apple’s software AAC-LC encoder in AudioToolbox.
H.264 video remains capability-gated through the installed WKWebView runtime.
Either path fails visibly; Drift never silently removes requested audio.

Source, licence, privacy, architecture, and release documentation are embedded
inside Drift.app/Contents/Resources/.
EOF

rm -f "${DMG_OUTPUT}" "${CHECKSUM_OUTPUT}"
hdiutil create \
  -volname "Drift" \
  -srcfolder "${STAGE_DIR}" \
  -format UDZO \
  -imagekey zlib-level=9 \
  -ov \
  "${DMG_OUTPUT}"
hdiutil verify "${DMG_OUTPUT}"

# Mount the exact image and repeat the signed-app gauntlet from read-only media.
hdiutil attach \
  -readonly \
  -nobrowse \
  -mountpoint "${MOUNT_DIR}" \
  "${DMG_OUTPUT}" >/dev/null
MOUNTED=1
[[ -L "${MOUNT_DIR}/Applications" ]] || {
  echo "The disk image has no Applications alias." >&2
  exit 1
}
[[ -f "${MOUNT_DIR}/Install Drift.txt" ]] || {
  echo "The disk image has no install/privacy note." >&2
  exit 1
}
bash scripts/verify-macos-app.sh "${MOUNT_DIR}/Drift.app"
hdiutil detach "${MOUNT_DIR}" -quiet
MOUNTED=0

(
  cd "$(dirname "${DMG_OUTPUT}")"
  shasum -a 256 "$(basename "${DMG_OUTPUT}")"
) > "${CHECKSUM_OUTPUT}"

bash scripts/verify-macos-dmg.sh "${DMG_OUTPUT}" "${CHECKSUM_OUTPUT}"

printf 'Packaged %s\n' "${DMG_OUTPUT}"
printf 'Checksum %s\n' "${CHECKSUM_OUTPUT}"
printf 'This disk image is verified local evidence, not a notarized public release.\n'