#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_BUNDLE="${1:-${DRIFT_MACOS_OUTPUT_DIR:-${ROOT_DIR}/build/macos}/Drift.app}"
EXECUTABLE="${APP_BUNDLE}/Contents/MacOS/Drift"
RESOURCES="${APP_BUNDLE}/Contents/Resources"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/drift-macos-verify.XXXXXX")"
trap 'rm -rf "${TEMP_DIR}"' EXIT

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Drift.app verification requires macOS." >&2
  exit 1
fi

for path in \
  "${APP_BUNDLE}/Contents/Info.plist" \
  "${EXECUTABLE}" \
  "${RESOURCES}/NativeBridge.js" \
  "${RESOURCES}/Web/index.html" \
  "${RESOURCES}/Drift.icns" \
  "${RESOURCES}/Legal/LICENSE" \
  "${RESOURCES}/Legal/THIRD_PARTY_NOTICES.md" \
  "${RESOURCES}/Documentation/MACOS_USER_GUIDE.md"; do
  if [[ ! -f "${path}" ]]; then
    printf 'Missing app-bundle file: %s\n' "${path}" >&2
    exit 1
  fi
done

plutil -lint "${APP_BUNDLE}/Contents/Info.plist"
codesign --verify --deep --strict --all-architectures --verbose=2 "${APP_BUNDLE}"

ENTITLEMENTS="${TEMP_DIR}/entitlements.plist"
if ! codesign -d --entitlements :- "${APP_BUNDLE}" >"${ENTITLEMENTS}" 2>/dev/null || [[ ! -s "${ENTITLEMENTS}" ]]; then
  codesign -d --entitlements :- "${APP_BUNDLE}" 2>"${ENTITLEMENTS}" >/dev/null
fi
plutil -lint "${ENTITLEMENTS}"
[[ "$(plutil -extract com.apple.security.app-sandbox raw -o - "${ENTITLEMENTS}")" == "true" ]]
[[ "$(plutil -extract com.apple.security.files.user-selected.read-write raw -o - "${ENTITLEMENTS}")" == "true" ]]
if plutil -p "${ENTITLEMENTS}" | grep -Eq 'com\.apple\.security\.network\.(client|server)'; then
  echo "Network entitlements are forbidden for Drift’s local-only app." >&2
  exit 1
fi
if plutil -p "${ENTITLEMENTS}" | grep -Eq 'disable-library-validation|allow-unsigned-executable-memory'; then
  echo "The app carries an unnecessary hardened-runtime exception." >&2
  exit 1
fi

ACTUAL_ARCHS="$(lipo -archs "${EXECUTABLE}")"
for architecture in ${DRIFT_EXPECT_ARCHS:-arm64 x86_64}; do
  if [[ " ${ACTUAL_ARCHS} " != *" ${architecture} "* ]]; then
    printf 'Missing expected architecture %s in %s\n' "${architecture}" "${ACTUAL_ARCHS}" >&2
    exit 1
  fi
done

if grep -Eq '(src|href)="/assets/' "${RESOURCES}/Web/index.html"; then
  echo "Bundled HTML contains root-absolute Vite assets." >&2
  exit 1
fi
grep -q 'DRIFT_NATIVE_BRIDGE_VERSION = 2' "${RESOURCES}/NativeBridge.js"
node --check "${RESOURCES}/NativeBridge.js"

if find "${APP_BUNDLE}" -type f -perm -0002 -print -quit | grep -q .; then
  echo "The app bundle contains a world-writable file." >&2
  exit 1
fi

"${EXECUTABLE}" --smoke-test
"${EXECUTABLE}" --native-self-test

printf 'Verified %s\n' "${APP_BUNDLE}"
printf 'Bundle size: %s\n' "$(du -sh "${APP_BUNDLE}" | awk '{print $1}')"
printf 'Architectures: %s\n' "${ACTUAL_ARCHS}"
printf 'Sandbox: enabled; user-selected read/write only; no network entitlement\n'
