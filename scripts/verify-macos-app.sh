#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_BUNDLE="${1:-${DRIFT_MACOS_OUTPUT_DIR:-${ROOT_DIR}/build/macos}/Drift.app}"
EXECUTABLE="${APP_BUNDLE}/Contents/MacOS/Drift"
INFO_PLIST="${APP_BUNDLE}/Contents/Info.plist"
RESOURCES="${APP_BUNDLE}/Contents/Resources"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/drift-macos-verify.XXXXXX")"
trap 'rm -rf "${TEMP_DIR}"' EXIT

fail() {
  echo "Drift.app verification failed: $*" >&2
  exit 1
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "bundle verification requires macOS."
fi

for command in codesign lipo node otool plutil python3; do
  command -v "${command}" >/dev/null 2>&1 || fail "missing required command ${command}."
done

for path in \
  "${INFO_PLIST}" \
  "${EXECUTABLE}" \
  "${RESOURCES}/NativeBridge.js" \
  "${RESOURCES}/Web/index.html" \
  "${RESOURCES}/Drift.icns" \
  "${RESOURCES}/BuildReceipt.txt" \
  "${RESOURCES}/BuildManifest.txt" \
  "${RESOURCES}/Legal/LICENSE" \
  "${RESOURCES}/Legal/THIRD_PARTY_NOTICES.md" \
  "${RESOURCES}/Documentation/MACOS_APP.md" \
  "${RESOURCES}/Documentation/MACOS_PRODUCT_CONTRACT.md" \
  "${RESOURCES}/Documentation/MACOS_USER_GUIDE.md" \
  "${RESOURCES}/Documentation/MACOS_QA.md" \
  "${RESOURCES}/Documentation/MACOS_THREAT_MODEL.md" \
  "${RESOURCES}/Documentation/MACOS_RELEASE_CHECKLIST.md"; do
  [[ -f "${path}" ]] || fail "missing app-bundle file ${path}."
done
[[ -x "${EXECUTABLE}" ]] || fail "the main executable is not executable."

plutil -lint "${INFO_PLIST}" >/dev/null
[[ "$(plutil -extract CFBundleIdentifier raw -o - "${INFO_PLIST}")" == "dog.pitch.drift" ]] \
  || fail "unexpected bundle identifier."
[[ "$(plutil -extract DriftNativeBridgeVersion raw -o - "${INFO_PLIST}")" == "2" ]] \
  || fail "Info.plist and bridge version disagree."
[[ "$(plutil -extract LSMinimumSystemVersion raw -o - "${INFO_PLIST}")" == "13.3" ]] \
  || fail "the packaged minimum macOS version is not 13.3."
INFO_DUMP="$(plutil -p "${INFO_PLIST}")"
grep -F 'dog.pitch.pitched-project' <<<"${INFO_DUMP}" >/dev/null \
  || fail "the .pitched document type is missing."
grep -F 'UTExportedTypeDeclarations' <<<"${INFO_DUMP}" >/dev/null \
  || fail "the app does not export its .pitched type declaration."

codesign --verify --deep --strict --all-architectures --verbose=2 "${APP_BUNDLE}"
SIGNATURE="${TEMP_DIR}/signature.txt"
codesign -dv --verbose=4 "${APP_BUNDLE}" 2>"${SIGNATURE}"
grep -Eq 'flags=.*runtime' "${SIGNATURE}" || fail "hardened runtime is not present in the signature."

ENTITLEMENTS="${TEMP_DIR}/entitlements.plist"
ENTITLEMENTS_DIAGNOSTICS="${TEMP_DIR}/entitlements.stderr"
if ! codesign -d --entitlements :- "${APP_BUNDLE}" >"${ENTITLEMENTS}" 2>"${ENTITLEMENTS_DIAGNOSTICS}"; then
  cat "${ENTITLEMENTS_DIAGNOSTICS}" >&2
  fail "codesign could not extract the app entitlements."
fi
plutil -lint "${ENTITLEMENTS}" >/dev/null || {
  cat "${ENTITLEMENTS_DIAGNOSTICS}" >&2
  fail "codesign returned an unreadable entitlement plist."
}
python3 - "${ENTITLEMENTS}" <<'PY'
from __future__ import annotations

import plistlib
import sys
from pathlib import Path

path = Path(sys.argv[1])
with path.open("rb") as stream:
    entitlements = plistlib.load(stream)

required = {
    "com.apple.security.app-sandbox": True,
    "com.apple.security.files.user-selected.read-write": True,
}
for key, expected in required.items():
    if entitlements.get(key) is not expected:
        raise SystemExit(f"Drift.app verification failed: signed entitlement {key!r} is missing or not true.")

for key in entitlements:
    if key.startswith("com.apple.security.network."):
        raise SystemExit(f"Drift.app verification failed: network entitlement {key!r} is forbidden.")

for key in (
    "com.apple.security.cs.disable-library-validation",
    "com.apple.security.cs.allow-unsigned-executable-memory",
    "com.apple.security.cs.allow-jit",
    "com.apple.security.cs.allow-dyld-environment-variables",
):
    if entitlements.get(key):
        raise SystemExit(f"Drift.app verification failed: dangerous hardened-runtime exception {key!r} is enabled.")
PY

actual_archs="$(lipo -archs "${EXECUTABLE}" | tr ' ' '\n' | sed '/^$/d' | sort | tr '\n' ' ' | sed 's/ $//')"
expected_archs="$(printf '%s\n' ${DRIFT_EXPECT_ARCHS:-arm64 x86_64} | sort | tr '\n' ' ' | sed 's/ $//')"
[[ "${actual_archs}" == "${expected_archs}" ]] \
  || fail "architectures are ${actual_archs}; expected ${expected_archs}."

while IFS= read -r library; do
  case "${library}" in
    /System/Library/*|/usr/lib/*) ;;
    *) fail "non-system dynamic library linked into Drift: ${library}" ;;
  esac
done < <(otool -L "${EXECUTABLE}" | tail -n +2 | awk '{print $1}')

if grep -Eq '(src|href)="/assets/' "${RESOURCES}/Web/index.html"; then
  fail "bundled HTML contains root-absolute Vite assets."
fi
grep -F 'DRIFT_NATIVE_BRIDGE_VERSION = 2' "${RESOURCES}/NativeBridge.js" >/dev/null \
  || fail "native bridge version marker is missing."
node --check "${RESOURCES}/NativeBridge.js"
if [[ -n "$(find "${RESOURCES}/Web" -type f \( -name '*.wasm' -o -name '*.map' \) -print -quit)" ]]; then
  fail "the standalone web bundle contains a WASM binary or source map."
fi
web_codec_markers="$(grep -RIlE 'libavcodec|ffmpeg-core|@mediabunny/aac-encoder' "${RESOURCES}/Web" --include='*.js' || true)"
if [[ -n "${web_codec_markers}" ]]; then
  fail "the standalone web bundle still contains a software AAC/FFmpeg marker: ${web_codec_markers}"
fi

python3 - "${RESOURCES}" <<'PY'
from __future__ import annotations

import hashlib
import sys
from pathlib import Path, PurePosixPath

root = Path(sys.argv[1]).resolve()
manifest = root / "BuildManifest.txt"
observed: dict[str, str] = {}
for line_number, line in enumerate(manifest.read_text(encoding="utf-8").splitlines(), start=1):
    try:
        digest, relative = line.split("  ", 1)
    except ValueError as error:
        raise SystemExit(f"malformed resource manifest line {line_number}") from error
    path = PurePosixPath(relative)
    if path.is_absolute() or ".." in path.parts or relative in observed:
        raise SystemExit(f"unsafe or duplicate manifest path: {relative}")
    observed[relative] = digest

actual = {
    path.relative_to(root).as_posix()
    for path in root.rglob("*")
    if path.is_file() and path != manifest
}
if set(observed) != actual:
    missing = sorted(actual - set(observed))
    unexpected = sorted(set(observed) - actual)
    raise SystemExit(f"resource manifest set mismatch; missing={missing}, unexpected={unexpected}")

for relative, expected in observed.items():
    path = root / relative
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != expected:
        raise SystemExit(f"resource digest mismatch: {relative}")
PY

grep -Fx "app_name=Drift" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has no app identity."
grep -Fx "minimum_macos=13.3" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has the wrong deployment target."
grep -Fx "codec_policy=system-codecs-only" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has the wrong codec policy."
grep -Fx "network_entitlement=none" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has the wrong network policy."

if [[ -n "$(find "${APP_BUNDLE}" -type f -perm -0002 -print -quit)" ]]; then
  fail "the app bundle contains a world-writable file."
fi

"${EXECUTABLE}" --smoke-test
"${EXECUTABLE}" --native-self-test
"${EXECUTABLE}" --webview-self-test

printf 'Verified %s\n' "${APP_BUNDLE}"
printf 'Bundle size: %s\n' "$(du -sh "${APP_BUNDLE}" | awk '{print $1}')"
printf 'Architectures: %s\n' "${actual_archs}"
printf 'Sandbox: enabled; user-selected read/write only; no network entitlement\n'
printf 'Codecs: system-only Mac bundle; no FFmpeg WASM or source maps\n'
