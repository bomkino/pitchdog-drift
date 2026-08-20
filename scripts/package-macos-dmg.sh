#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_BUNDLE="${DRIFT_MACOS_OUTPUT_DIR:-${ROOT_DIR}/build/macos}/Drift.app"
DMG_OUTPUT="${DRIFT_DMG_OUTPUT:-${ROOT_DIR}/build/macos/Drift.dmg}"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/drift-dmg.XXXXXX")"
STAGE_DIR="${TEMP_DIR}/Drift"
trap 'rm -rf "${TEMP_DIR}"' EXIT

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "The Drift disk image must be packaged on macOS." >&2
  exit 1
fi

if [[ "${DRIFT_SKIP_APP_BUILD:-0}" != "1" ]]; then
  npm run build:mac
fi
bash "${ROOT_DIR}/scripts/verify-macos-app.sh" "${APP_BUNDLE}"

mkdir -p "${STAGE_DIR}" "$(dirname "${DMG_OUTPUT}")"
cp -R "${APP_BUNDLE}" "${STAGE_DIR}/Drift.app"
ln -s /Applications "${STAGE_DIR}/Applications"
rm -f "${DMG_OUTPUT}"
hdiutil create \
  -volname "Drift" \
  -srcfolder "${STAGE_DIR}" \
  -format UDZO \
  -imagekey zlib-level=9 \
  -ov \
  "${DMG_OUTPUT}"
hdiutil verify "${DMG_OUTPUT}"

printf 'Packaged %s\n' "${DMG_OUTPUT}"
printf 'This local disk image is not a notarized public release.\n'
