#!/usr/bin/env bash
set -euo pipefail
umask 022

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${DRIFT_MACOS_OUTPUT_DIR:-${ROOT_DIR}/build/macos}"
APP_BUNDLE="${OUTPUT_DIR}/Drift.app"
PACKAGE_VERSION="$(node -p "require('${ROOT_DIR}/package.json').version")"
DMG_OUTPUT="${DRIFT_DMG_OUTPUT:-${OUTPUT_DIR}/Drift-${PACKAGE_VERSION}-macOS-arm64.dmg}"
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
for command in ditto git hdiutil node plutil python3 shasum; do
  command -v "${command}" >/dev/null 2>&1 || {
    echo "Missing required command: ${command}" >&2
    exit 1
  }
done

for target in "${OUTPUT_DIR}" "${DMG_OUTPUT}" "${CHECKSUM_OUTPUT}"; do
  if [[ "${target}" != /* ]]; then
    echo "Mac package paths must be absolute: ${target}" >&2
    exit 1
  fi
done

python3 - \
  "${ROOT_DIR}/build" \
  "${APP_BUNDLE}" \
  "${DMG_OUTPUT}" \
  "${CHECKSUM_OUTPUT}" <<'PY'
from pathlib import Path
import sys

allowed = Path(sys.argv[1]).resolve()
raw_app, raw_dmg, raw_checksum = sys.argv[2:]
targets = [Path(raw).resolve() for raw in (raw_app, raw_dmg, raw_checksum)]
for label, target in zip(("app", "disk image", "checksum"), targets):
    try:
        relative = target.relative_to(allowed)
    except ValueError:
        raise SystemExit(f"Refusing unsafe {label} path outside the repository build root: {target}")
    if not relative.parts:
        raise SystemExit(f"Refusing unsafe {label} path equal to the repository build root: {target}")
app, dmg, checksum = targets
if Path(raw_app).name != "Drift.app":
    raise SystemExit(f"Refusing unexpected app bundle name: {raw_app}")
if Path(raw_dmg).suffix != ".dmg":
    raise SystemExit(f"Refusing disk image without an exact .dmg suffix: {raw_dmg}")
if raw_checksum != f"{raw_dmg}.sha256":
    raise SystemExit("Refusing checksum path that is not exactly the disk-image path plus .sha256")

def overlaps(left: Path, right: Path) -> bool:
    return left == right or left in right.parents or right in left.parents

if overlaps(app, dmg) or overlaps(app, checksum) or overlaps(dmg, checksum):
    raise SystemExit("Refusing overlapping app, disk-image, and checksum paths")
PY

cd "${ROOT_DIR}"
if [[ "${DRIFT_SKIP_APP_BUILD:-0}" != "1" ]]; then
  DRIFT_MACOS_APP_VARIANT=release npm run build:mac
fi

# A prebuilt input is useful only when it is the exact clean checkout being
# packaged. Internal bundle consistency alone cannot distinguish a stale app.
GIT_HEAD="$(git rev-parse --verify HEAD)"
SOURCE_STATUS="$(git status --porcelain=v1 --untracked-files=all)"
if [[ -n "${SOURCE_STATUS}" ]]; then
  echo "The DMG must be packaged from a clean, committed worktree:" >&2
  printf '%s\n' "${SOURCE_STATUS}" >&2
  exit 1
fi
[[ -f "${APP_BUNDLE}/Contents/Info.plist" ]] || {
  echo "The app bundle has no Info.plist: ${APP_BUNDLE}" >&2
  exit 1
}
APP_SOURCE_REVISION="$(plutil -extract DriftSourceRevision raw -o - "${APP_BUNDLE}/Contents/Info.plist")"
if [[ ! "${APP_SOURCE_REVISION}" =~ ^[0-9a-f]{40}$ || "${APP_SOURCE_REVISION}" != "${GIT_HEAD}" ]]; then
  echo "The app source revision does not match the exact checked-out commit." >&2
  exit 1
fi
bash scripts/verify-macos-app.sh "${APP_BUNDLE}"

mkdir -p "${STAGE_DIR}" "${MOUNT_DIR}" "$(dirname "${DMG_OUTPUT}")"
ditto "${APP_BUNDLE}" "${STAGE_DIR}/Drift.app"
ln -s /Applications "${STAGE_DIR}/Applications"
cat > "${STAGE_DIR}/Install Drift.txt" <<EOF
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

Licence, privacy, architecture, user, and release documentation are embedded
inside Drift.app/Contents/Resources/. Corresponding source for this exact app:
https://github.com/bomkino/pitchdog-drift/tree/${APP_SOURCE_REVISION}
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
