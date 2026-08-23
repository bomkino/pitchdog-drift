#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_BUNDLE="${1:-${DRIFT_MACOS_OUTPUT_DIR:-${ROOT_DIR}/build/macos}/Drift.app}"
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

for command in codesign lipo node open otool plutil python3; do
  command -v "${command}" >/dev/null 2>&1 || fail "missing required command ${command}."
done

[[ -f "${INFO_PLIST}" ]] || fail "missing app-bundle file ${INFO_PLIST}."
EXECUTABLE_NAME="$(plutil -extract CFBundleExecutable raw -o - "${INFO_PLIST}")"
EXECUTABLE="${APP_BUNDLE}/Contents/MacOS/${EXECUTABLE_NAME}"
BUNDLE_IDENTIFIER="$(plutil -extract CFBundleIdentifier raw -o - "${INFO_PLIST}")"
APP_DISPLAY_NAME="$(plutil -extract CFBundleDisplayName raw -o - "${INFO_PLIST}")"
APP_BUNDLE_NAME="$(plutil -extract CFBundleName raw -o - "${INFO_PLIST}")"
BUILD_CHANNEL="$(plutil -extract DriftBuildChannel raw -o - "${INFO_PLIST}")"
CACHE_NAMESPACE="$(plutil -extract DriftCacheNamespace raw -o - "${INFO_PLIST}")"
STORAGE_NAMESPACE="$(plutil -extract DriftStorageNamespace raw -o - "${INFO_PLIST}")"
WEBSITE_DATA_STORE_IDENTIFIER="$(plutil -extract DriftWebsiteDataStoreIdentifier raw -o - "${INFO_PLIST}")"
OWNS_PORTABLE_PROJECTS="$(plutil -extract DriftOwnsPortableProjects raw -o - "${INFO_PLIST}")"

case "${BUILD_CHANNEL}" in
  release)
    EXPECTED_APP_BUNDLE_NAME="Drift.app"
    EXPECTED_APP_DISPLAY_NAME="Drift"
    EXPECTED_EXECUTABLE_NAME="Drift"
    EXPECTED_BUNDLE_IDENTIFIER="dog.pitch.drift"
    EXPECTED_CACHE_NAMESPACE="Drift"
    EXPECTED_STORAGE_NAMESPACE="pitchdog-drift"
    EXPECTED_WEBSITE_DATA_STORE_IDENTIFIER="default"
    EXPECTED_PORTABLE_PROJECT_OWNERSHIP="true"
    ;;
  v2-dev)
    EXPECTED_APP_BUNDLE_NAME="Drift V2 Dev.app"
    EXPECTED_APP_DISPLAY_NAME="Drift V2 Dev"
    EXPECTED_EXECUTABLE_NAME="DriftV2Dev"
    EXPECTED_BUNDLE_IDENTIFIER="dog.pitch.drift.v2.dev"
    EXPECTED_CACHE_NAMESPACE="DriftV2Dev"
    EXPECTED_STORAGE_NAMESPACE="pitchdog-drift-v2-dev"
    EXPECTED_WEBSITE_DATA_STORE_IDENTIFIER="7A519E77-39A8-4BAF-89A0-314590BF3D24"
    EXPECTED_PORTABLE_PROJECT_OWNERSHIP="false"
    ;;
  *) fail "unsupported build channel ${BUILD_CHANNEL}." ;;
esac

[[ "$(basename "${APP_BUNDLE}")" == "${EXPECTED_APP_BUNDLE_NAME}" ]] \
  || fail "app bundle name does not match its build channel."
[[ "${EXECUTABLE_NAME}" == "${EXPECTED_EXECUTABLE_NAME}" ]] || fail "unexpected executable name."
[[ "${APP_DISPLAY_NAME}" == "${EXPECTED_APP_DISPLAY_NAME}" ]] || fail "unexpected display name."
[[ "${APP_BUNDLE_NAME}" == "${EXPECTED_APP_DISPLAY_NAME}" ]] || fail "unexpected bundle name."
[[ "${BUNDLE_IDENTIFIER}" == "${EXPECTED_BUNDLE_IDENTIFIER}" ]] || fail "unexpected bundle identifier."
[[ "${CACHE_NAMESPACE}" == "${EXPECTED_CACHE_NAMESPACE}" ]] || fail "unexpected cache namespace."
[[ "${STORAGE_NAMESPACE}" == "${EXPECTED_STORAGE_NAMESPACE}" ]] || fail "unexpected storage namespace."
[[ "${WEBSITE_DATA_STORE_IDENTIFIER}" == "${EXPECTED_WEBSITE_DATA_STORE_IDENTIFIER}" ]] \
  || fail "unexpected website data-store identifier."
[[ "${OWNS_PORTABLE_PROJECTS}" == "${EXPECTED_PORTABLE_PROJECT_OWNERSHIP}" ]] \
  || fail "portable-project ownership disagrees with the build channel."
[[ "$(plutil -extract DriftExpectedBundleIdentifier raw -o - "${INFO_PLIST}")" == "${BUNDLE_IDENTIFIER}" ]] \
  || fail "runtime and packaged bundle identifiers disagree."

for path in \
  "${INFO_PLIST}" \
  "${EXECUTABLE}" \
  "${RESOURCES}/NativeBridge.js" \
  "${RESOURCES}/Web/index.html" \
  "${RESOURCES}/Drift.icns" \
  "${RESOURCES}/BuildReceipt.txt" \
  "${RESOURCES}/BuildManifest.txt" \
  "${RESOURCES}/Legal/LICENSE" \
  "${RESOURCES}/Legal/NOTICE" \
  "${RESOURCES}/Legal/ASSET-LICENSE.md" \
  "${RESOURCES}/Legal/THIRD_PARTY_NOTICES.md" \
  "${RESOURCES}/Legal/TRADEMARKS.md" \
  "${RESOURCES}/Legal/ThirdPartyLicenses/MANIFEST.json" \
  "${RESOURCES}/Legal/ThirdPartyLicenses/RUNTIME_COMPONENTS.md" \
  "${RESOURCES}/Documentation/MACOS_APP.md" \
  "${RESOURCES}/Documentation/MACOS_PRODUCT_CONTRACT.md" \
  "${RESOURCES}/Documentation/MACOS_USER_GUIDE.md" \
  "${RESOURCES}/Documentation/MACOS_QA.md" \
  "${RESOURCES}/Documentation/MACOS_THREAT_MODEL.md" \
  "${RESOURCES}/Documentation/MACOS_RELEASE.md" \
  "${RESOURCES}/Documentation/MACOS_RELEASE_CHECKLIST.md"; do
  [[ -f "${path}" ]] || fail "missing app-bundle file ${path}."
done
[[ -x "${EXECUTABLE}" ]] || fail "the main executable is not executable."
node "${ROOT_DIR}/scripts/verify-macos-user-guide.mjs" \
  "${BUILD_CHANNEL}" \
  "${RESOURCES}/Documentation/MACOS_USER_GUIDE.md"
node "${ROOT_DIR}/scripts/stage-macos-runtime-licenses.mjs" verify \
  "${RESOURCES}/Legal/ThirdPartyLicenses"

plutil -lint "${INFO_PLIST}" >/dev/null
[[ "$(plutil -extract DriftNativeBridgeVersion raw -o - "${INFO_PLIST}")" == "2" ]] \
  || fail "Info.plist and bridge version disagree."
[[ "$(plutil -extract LSMinimumSystemVersion raw -o - "${INFO_PLIST}")" == "13.3" ]] \
  || fail "the packaged minimum macOS version is not 13.3."
INFO_DUMP="$(plutil -p "${INFO_PLIST}")"
if [[ "${BUILD_CHANNEL}" == "release" ]]; then
  grep -F 'dog.pitch.pitched-project' <<<"${INFO_DUMP}" >/dev/null \
    || fail "the .pitched document type is missing."
  grep -F 'UTExportedTypeDeclarations' <<<"${INFO_DUMP}" >/dev/null \
    || fail "the app does not export its .pitched type declaration."
else
  if grep -F 'dog.pitch.pitched-project' <<<"${INFO_DUMP}" >/dev/null \
    || grep -F 'CFBundleDocumentTypes' <<<"${INFO_DUMP}" >/dev/null \
    || grep -F 'UTExportedTypeDeclarations' <<<"${INFO_DUMP}" >/dev/null; then
    fail "the development app claims production .pitched document ownership."
  fi
fi

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
    # WKWebView launches a system networking helper even for a bundled local
    # file document. Drift's own traffic remains blocked by its signed WebKit
    # content rules, navigation policy, and absence of native network commands.
    "com.apple.security.network.client": True,
}
for key, expected in required.items():
    if entitlements.get(key) is not expected:
        raise SystemExit(f"Drift.app verification failed: signed entitlement {key!r} is missing or not true.")

allowed_network_entitlements = {"com.apple.security.network.client"}
for key in entitlements:
    if key.startswith("com.apple.security.network.") and key not in allowed_network_entitlements:
        raise SystemExit(f"Drift.app verification failed: unexpected network entitlement {key!r} is present.")

for key in (
    "com.apple.security.files.downloads.read-only",
    "com.apple.security.files.downloads.read-write",
    "com.apple.security.files.documents.read-only",
    "com.apple.security.files.documents.read-write",
    "com.apple.security.files.user-selected.read-only",
    "com.apple.security.cs.disable-library-validation",
    "com.apple.security.cs.allow-unsigned-executable-memory",
    "com.apple.security.cs.allow-jit",
    "com.apple.security.cs.allow-dyld-environment-variables",
):
    if entitlements.get(key):
        raise SystemExit(f"Drift.app verification failed: forbidden entitlement {key!r} is enabled.")
PY

actual_archs="$(lipo -archs "${EXECUTABLE}" | tr ' ' '\n' | sed '/^$/d' | sort | tr '\n' ' ' | sed 's/ $//')"
expected_archs="$(printf '%s\n' ${DRIFT_EXPECT_ARCHS:-arm64 x86_64} | sort | tr '\n' ' ' | sed 's/ $//')"
[[ "${actual_archs}" == "${expected_archs}" ]] \
  || fail "architectures are ${actual_archs}; expected ${expected_archs}."

python3 - "${INFO_PLIST}" "${RESOURCES}/BuildReceipt.txt" "${RESOURCES}/Web/MacWebBundleReceipt.json" "${actual_archs}" <<'PY'
from __future__ import annotations

import json
import plistlib
import re
import sys
from pathlib import Path

info_path = Path(sys.argv[1])
receipt_path = Path(sys.argv[2])
web_receipt_path = Path(sys.argv[3])
actual_architectures = set(sys.argv[4].split())
with info_path.open("rb") as stream:
    info = plistlib.load(stream)

receipt: dict[str, str] = {}
for line_number, line in enumerate(receipt_path.read_text(encoding="utf-8").splitlines(), start=1):
    if "=" not in line:
        raise SystemExit(f"Drift.app verification failed: malformed build receipt line {line_number}.")
    key, value = line.split("=", 1)
    if not key or key in receipt:
        raise SystemExit(f"Drift.app verification failed: duplicate or empty build receipt key {key!r}.")
    receipt[key] = value

expected = {
    "app_name": str(info.get("CFBundleDisplayName", "")),
    "app_variant": str(info.get("DriftBuildChannel", "")),
    "executable_name": str(info.get("CFBundleExecutable", "")),
    "bundle_identifier": str(info.get("CFBundleIdentifier", "")),
    "build_channel": str(info.get("DriftBuildChannel", "")),
    "cache_namespace": str(info.get("DriftCacheNamespace", "")),
    "storage_namespace": str(info.get("DriftStorageNamespace", "")),
    "website_data_store_identifier": str(info.get("DriftWebsiteDataStoreIdentifier", "")),
    "portable_project_ownership": "registered" if info.get("DriftOwnsPortableProjects") is True else "absent",
    "user_guide_profile": str(info.get("DriftBuildChannel", "")),
    "version": str(info.get("CFBundleShortVersionString", "")),
    "build_number": str(info.get("CFBundleVersion", "")),
    "source_revision": str(info.get("DriftSourceRevision", "")),
}
for key, value in expected.items():
    if not value or receipt.get(key) != value:
        raise SystemExit(
            f"Drift.app verification failed: build receipt {key} does not match Info.plist."
        )
if re.fullmatch(r"[0-9a-f]{40}", expected["source_revision"]) is None:
    raise SystemExit("Drift.app verification failed: source revision is not one full Git SHA-1.")
if set(receipt.get("architectures", "").split()) != actual_architectures:
    raise SystemExit("Drift.app verification failed: build receipt architectures do not match the executable.")

web_receipt = json.loads(web_receipt_path.read_text(encoding="utf-8"))
if web_receipt.get("buildChannel") != expected["build_channel"]:
    raise SystemExit("Drift.app verification failed: signed Web runtime and native build channel disagree.")
PY

# Universal binaries produce one unindented header per architecture. Only
# indented rows are dependencies; parsing every first field mistakes the second
# architecture header for a dylib path.
LINKED_LIBRARIES="${TEMP_DIR}/linked-libraries.txt"
otool -L "${EXECUTABLE}" | awk '/^[[:space:]]/ {print $1}' | sort -u >"${LINKED_LIBRARIES}"
while IFS= read -r library; do
  case "${library}" in
    /System/Library/*|/usr/lib/*) ;;
    *) fail "non-system dynamic library linked into Drift: ${library}" ;;
  esac
done <"${LINKED_LIBRARIES}"
grep -F '/System/Library/Frameworks/AudioToolbox.framework/' "${LINKED_LIBRARIES}" >/dev/null \
  || fail "native AAC source is present but AudioToolbox is not linked into the executable."
grep -F '/System/Library/Frameworks/WebKit.framework/' "${LINKED_LIBRARIES}" >/dev/null \
  || fail "the packaged application is not linked against WebKit."

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

grep -Fx "app_name=${APP_DISPLAY_NAME}" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has no app identity."
grep -Fx "bundle_identifier=${BUNDLE_IDENTIFIER}" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has the wrong bundle identity."
grep -Fx "build_channel=${BUILD_CHANNEL}" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has the wrong build channel."
grep -Fx "cache_namespace=${CACHE_NAMESPACE}" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has the wrong cache namespace."
grep -Fx "storage_namespace=${STORAGE_NAMESPACE}" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has the wrong storage namespace."
grep -Fx "minimum_macos=13.3" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has the wrong deployment target."
grep -Fx "codec_policy=system-frameworks-only" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has the wrong codec policy."
grep -Fx "video_codec=WKWebView-H264-capability-gated" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt misstates the video path."
grep -Fx "audio_codec=AudioToolbox-Apple-software-AAC-LC" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt misstates the presenter-audio path."
grep -Fx "network_client_entitlement=present-in-sandbox-signature" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has the wrong signed network-client entitlement contract."
grep -Fx "webview_outbound_policy=v3-block-http-ws-ftp" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has the wrong WebKit outbound policy."
grep -Fx "webrtc_page_capability=page-world-document-start-lockdown" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has the wrong WebRTC page-capability boundary."
grep -Fx "navigation_download_policy=remote-denied-before-destination" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has the wrong remote navigation/download policy."
grep -Fx "native_network_client_surface=none-shipped" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has an unexpected native network client surface."
grep -Fx "network_boundary=app-entitled-webkit-blocked" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has a misleading network boundary."

if [[ -n "$(find "${APP_BUNDLE}" -type f \( -perm -0020 -o -perm -0002 -o ! -perm -0444 \) -print -quit)" ]]; then
  fail "the app bundle contains a group/world-writable or not-all-user-readable file."
fi
if [[ -n "$(find "${APP_BUNDLE}" -type d \( -perm -0020 -o -perm -0002 -o ! -perm -0555 \) -print -quit)" ]]; then
  fail "the app bundle contains a group/world-writable or not-all-user-traversable directory."
fi
if [[ -z "$(find "${EXECUTABLE}" -type f -perm -0555 -print -quit)" ]]; then
  fail "the app executable is not readable and executable by every local account."
fi

"${EXECUTABLE}" --smoke-test
"${EXECUTABLE}" --native-self-test

run_packaged_webview_self_test() {
  # One coordinator owns exact-process selection, external WebContent
  # termination, loopback denial, receipts, and cleanup. Keeping a second
  # launcher here previously let local verification drift from CI.
  local matrix_dir="${ROOT_DIR}/build/macos/verify-packaged-webview"
  if [[ "${BUILD_CHANNEL}" == "v2-dev" ]]; then
    matrix_dir="${ROOT_DIR}/build/macos/v2-dev/verify-packaged-webview"
  fi
  DRIFT_WEBVIEW_MATRIX_DIR="${matrix_dir}" \
    bash "${ROOT_DIR}/scripts/probe-macos-packaged-webview.sh" "${APP_BUNDLE}"
}

if [[ "${DRIFT_SKIP_PACKAGED_WEBVIEW_SELF_TEST:-0}" == "1" ]]; then
  echo "Deferred packaged LaunchServices/WebKit self-test to the explicit runtime matrix."
else
  run_packaged_webview_self_test
fi

printf 'Verified %s\n' "${APP_BUNDLE}"
printf 'Bundle size: %s\n' "$(du -sh "${APP_BUNDLE}" | awk '{print $1}')"
printf 'Architectures: %s\n' "${actual_archs}"
printf 'Sandbox: enabled; user-selected read/write; app network-client entitlement present\n'
printf 'WebKit outbound policy v3 blocked; no native network client shipped\n'
printf 'Video: WKWebView H.264, capability-gated and output-verified\n'
printf 'Audio: Apple software AAC-LC through AudioToolbox; no FFmpeg WASM\n'
