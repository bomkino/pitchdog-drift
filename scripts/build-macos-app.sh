#!/usr/bin/env bash
set -euo pipefail
umask 022

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${DRIFT_MACOS_OUTPUT_DIR:-${ROOT_DIR}/build/macos}"
APP_VARIANT="${DRIFT_MACOS_APP_VARIANT:-release}"

case "${APP_VARIANT}" in
  release)
    APP_BUNDLE_NAME="Drift"
    APP_DISPLAY_NAME="Drift"
    APP_EXECUTABLE_NAME="Drift"
    BUNDLE_IDENTIFIER="dog.pitch.drift"
    BUILD_CHANNEL="release"
    CACHE_NAMESPACE="Drift"
    STORAGE_NAMESPACE="pitchdog-drift"
    WEBSITE_DATA_STORE_IDENTIFIER="default"
    OWNS_PORTABLE_PROJECTS="1"
    PORTABLE_PROJECT_OWNERSHIP="registered"
    USER_GUIDE_SOURCE="${ROOT_DIR}/docs/MACOS_USER_GUIDE.md"
    ;;
  v2-dev)
    APP_BUNDLE_NAME="Drift V2 Dev"
    APP_DISPLAY_NAME="Drift V2 Dev"
    APP_EXECUTABLE_NAME="DriftV2Dev"
    BUNDLE_IDENTIFIER="dog.pitch.drift.v2.dev"
    BUILD_CHANNEL="v2-dev"
    CACHE_NAMESPACE="DriftV2Dev"
    STORAGE_NAMESPACE="pitchdog-drift-v2-dev"
    WEBSITE_DATA_STORE_IDENTIFIER="7A519E77-39A8-4BAF-89A0-314590BF3D24"
    OWNS_PORTABLE_PROJECTS="0"
    PORTABLE_PROJECT_OWNERSHIP="absent"
    USER_GUIDE_SOURCE="${ROOT_DIR}/docs/v2/MACOS_V2_DEV_USER_GUIDE.md"
    ;;
  *)
    echo "Unsupported DRIFT_MACOS_APP_VARIANT: ${APP_VARIANT}" >&2
    exit 1
    ;;
esac

APP_NAME="${APP_EXECUTABLE_NAME}"
APP_BUNDLE="${OUTPUT_DIR}/${APP_BUNDLE_NAME}.app"
CONTENTS_DIR="${APP_BUNDLE}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"
WEB_DIR="${RESOURCES_DIR}/Web"
LEGAL_DIR="${RESOURCES_DIR}/Legal"
THIRD_PARTY_LICENSE_DIR="${LEGAL_DIR}/ThirdPartyLicenses"
DOCS_DIR="${RESOURCES_DIR}/Documentation"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/drift-macos.XXXXXX")"
MINIMUM_MACOS="${DRIFT_MACOS_DEPLOYMENT_TARGET:-13.3}"
ARCHITECTURES="${DRIFT_MACOS_ARCHS:-arm64 x86_64}"
SIGNING_IDENTITY="${DRIFT_CODESIGN_IDENTITY:--}"
ENTITLEMENTS="${ROOT_DIR}/macos/Drift.entitlements"

cleanup() {
  rm -rf "${TEMP_DIR}"
}
trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "The standalone Drift app must be built on macOS." >&2
  exit 1
fi

for command in git node npm python3 xcrun lipo iconutil plutil codesign xattr; do
  require_command "${command}"
done

if [[ "${OUTPUT_DIR}" != /* ]]; then
  echo "DRIFT_MACOS_OUTPUT_DIR must be an absolute path." >&2
  exit 1
fi

python3 - "${ROOT_DIR}/build" "${APP_BUNDLE}" "${APP_BUNDLE_NAME}.app" <<'PY'
from pathlib import Path
import sys

allowed = Path(sys.argv[1]).resolve()
target = Path(sys.argv[2]).resolve()
expected_name = sys.argv[3]
try:
    relative = target.relative_to(allowed)
except ValueError:
    raise SystemExit(f"Refusing unsafe Mac app output outside the repository build root: {target}")
if not relative.parts or target.name != expected_name:
    raise SystemExit(f"Refusing unsafe Mac app output target: {target}")
PY

cd "${ROOT_DIR}"

if [[ "${DRIFT_SKIP_WEB_CHECKS:-0}" == "1" ]]; then
  npm run check:mac-source
else
  npm run check
fi

# Every packaged source revision must name the literal bytes being compiled.
# Ignored build/evidence directories are harmless; any unignored tracked or
# untracked change could otherwise produce an app that falsely names HEAD.
GIT_HEAD="$(git rev-parse --verify HEAD)"
SOURCE_STATUS="$(git status --porcelain=v1 --untracked-files=all)"
if [[ -n "${SOURCE_STATUS}" ]]; then
  echo "The Mac app must be built from a clean, committed worktree:" >&2
  printf '%s\n' "${SOURCE_STATUS}" >&2
  exit 1
fi
if [[ -n "${DRIFT_SOURCE_REVISION:-}" && "${DRIFT_SOURCE_REVISION}" != "${GIT_HEAD}" ]]; then
  echo "DRIFT_SOURCE_REVISION does not match the checked-out commit." >&2
  exit 1
fi

# This replaces the old `vite build --mode macos` ES-module graph. Drift.app
# ships one classic IIFE entry so signed file:// production boot is the same
# topology already proven by the deterministic WKWebView export harness.
rm -rf dist
DRIFT_BUILD_CHANNEL="${BUILD_CHANNEL}" npm run build:mac:web

if [[ ! -f dist/index.html ]]; then
  echo "dist/index.html is missing after the macOS web build." >&2
  exit 1
fi
if [[ ! -f dist/MacWebBundleReceipt.json ]]; then
  echo "The macOS web bundle has no topology and byte receipt." >&2
  exit 1
fi
if grep -Eq '(src|href)="/assets/' dist/index.html; then
  echo "The Mac bundle contains root-absolute assets and cannot run inside Drift.app." >&2
  exit 1
fi
if grep -q 'type="module"' dist/index.html; then
  echo "The Mac application bootstrap unexpectedly uses an ES-module script." >&2
  exit 1
fi
if ! grep -q 'data-drift-bootstrap="classic-iife-single-entry"' dist/index.html; then
  echo "The Mac application bootstrap topology marker is missing." >&2
  exit 1
fi
javascript_count="$(find dist -type f -name '*.js' | wc -l | tr -d '[:space:]')"
if [[ "${javascript_count}" != "1" ]]; then
  echo "The Mac application must contain exactly one JavaScript entry; found ${javascript_count}." >&2
  exit 1
fi
if [[ -n "$(find dist -type f \( -name '*.wasm' -o -name '*.map' \) -print -quit)" ]]; then
  echo "The standalone Mac web bundle contains a forbidden WASM binary or source map." >&2
  exit 1
fi
codec_markers="$(grep -RIlE 'libavcodec|ffmpeg-core|@mediabunny/aac-encoder' dist --include='*.js' || true)"
if [[ -n "${codec_markers}" ]]; then
  echo "The standalone Mac web bundle still contains a software AAC/FFmpeg marker:" >&2
  printf '%s\n' "${codec_markers}" >&2
  exit 1
fi

rm -rf "${APP_BUNDLE}"
mkdir -p "${MACOS_DIR}" "${WEB_DIR}" "${LEGAL_DIR}" "${THIRD_PARTY_LICENSE_DIR}" "${DOCS_DIR}"
cp macos/Info.plist "${CONTENTS_DIR}/Info.plist"
cp macos/NativeBridge.js "${RESOURCES_DIR}/NativeBridge.js"
cp -R dist/. "${WEB_DIR}/"
cp \
  LICENSE \
  NOTICE \
  ASSET-LICENSE.md \
  THIRD_PARTY_NOTICES.md \
  TRADEMARKS.md \
  "${LEGAL_DIR}/"
node scripts/stage-macos-runtime-licenses.mjs stage "${THIRD_PARTY_LICENSE_DIR}"
cp \
  docs/MACOS_APP.md \
  docs/MACOS_PRODUCT_CONTRACT.md \
  docs/MACOS_QA.md \
  docs/MACOS_THREAT_MODEL.md \
  docs/MACOS_RELEASE.md \
  docs/MACOS_RELEASE_CHECKLIST.md \
  "${DOCS_DIR}/"
cp "${USER_GUIDE_SOURCE}" "${DOCS_DIR}/MACOS_USER_GUIDE.md"
node scripts/verify-macos-user-guide.mjs "${BUILD_CHANNEL}" "${DOCS_DIR}/MACOS_USER_GUIDE.md"

PACKAGE_VERSION="$(node -p "require('./package.json').version")"
BUILD_NUMBER="${DRIFT_BUILD_NUMBER:-$(git rev-list --count HEAD 2>/dev/null || printf '1')}"
SOURCE_REVISION="${DRIFT_SOURCE_REVISION:-${GIT_HEAD}}"
plutil -replace CFBundleShortVersionString -string "${PACKAGE_VERSION}" "${CONTENTS_DIR}/Info.plist"
plutil -replace CFBundleVersion -string "${BUILD_NUMBER}" "${CONTENTS_DIR}/Info.plist"
plutil -replace CFBundleDisplayName -string "${APP_DISPLAY_NAME}" "${CONTENTS_DIR}/Info.plist"
plutil -replace CFBundleName -string "${APP_DISPLAY_NAME}" "${CONTENTS_DIR}/Info.plist"
plutil -replace CFBundleExecutable -string "${APP_EXECUTABLE_NAME}" "${CONTENTS_DIR}/Info.plist"
plutil -replace CFBundleIdentifier -string "${BUNDLE_IDENTIFIER}" "${CONTENTS_DIR}/Info.plist"
plutil -replace DriftBuildChannel -string "${BUILD_CHANNEL}" "${CONTENTS_DIR}/Info.plist"
plutil -replace DriftCacheNamespace -string "${CACHE_NAMESPACE}" "${CONTENTS_DIR}/Info.plist"
plutil -replace DriftExpectedBundleIdentifier -string "${BUNDLE_IDENTIFIER}" "${CONTENTS_DIR}/Info.plist"
plutil -replace DriftStorageNamespace -string "${STORAGE_NAMESPACE}" "${CONTENTS_DIR}/Info.plist"
plutil -replace DriftWebsiteDataStoreIdentifier -string "${WEBSITE_DATA_STORE_IDENTIFIER}" "${CONTENTS_DIR}/Info.plist"
if [[ "${OWNS_PORTABLE_PROJECTS}" == "1" ]]; then
  plutil -replace DriftOwnsPortableProjects -bool true "${CONTENTS_DIR}/Info.plist"
else
  plutil -replace DriftOwnsPortableProjects -bool false "${CONTENTS_DIR}/Info.plist"
  plutil -remove CFBundleDocumentTypes "${CONTENTS_DIR}/Info.plist"
  plutil -remove UTExportedTypeDeclarations "${CONTENTS_DIR}/Info.plist"
fi
plutil -replace LSMinimumSystemVersion -string "${MINIMUM_MACOS}" "${CONTENTS_DIR}/Info.plist"
plutil -replace DriftSourceRevision -string "${SOURCE_REVISION}" "${CONTENTS_DIR}/Info.plist"
plutil -lint "${CONTENTS_DIR}/Info.plist" "${ENTITLEMENTS}"

ICONSET_DIR="${TEMP_DIR}/Drift.iconset"
python3 scripts/generate-macos-icon.py "${ICONSET_DIR}" "${APP_VARIANT}"
iconutil -c icns "${ICONSET_DIR}" -o "${RESOURCES_DIR}/Drift.icns"

SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
SOURCE_FILES=(macos/App/*.swift)
if [[ ${#SOURCE_FILES[@]} -eq 0 ]]; then
  echo "No canonical Swift source was found in macos/App/." >&2
  exit 1
fi

BINARIES=()
for architecture in ${ARCHITECTURES}; do
  case "${architecture}" in
    arm64|x86_64) ;;
    *)
      echo "Unsupported architecture: ${architecture}" >&2
      exit 1
      ;;
  esac

  binary="${TEMP_DIR}/${APP_NAME}-${architecture}"
  xcrun --sdk macosx swiftc \
    -parse-as-library \
    -O \
    -whole-module-optimization \
    -sdk "${SDK_PATH}" \
    -target "${architecture}-apple-macos${MINIMUM_MACOS}" \
    -framework AppKit \
    -framework AudioToolbox \
    -framework CryptoKit \
    -framework Foundation \
    -framework Security \
    -framework UniformTypeIdentifiers \
    -framework WebKit \
    -Xlinker -dead_strip \
    "${SOURCE_FILES[@]}" \
    -o "${binary}"
  BINARIES+=("${binary}")
done

if [[ ${#BINARIES[@]} -eq 1 ]]; then
  cp "${BINARIES[0]}" "${MACOS_DIR}/${APP_NAME}"
else
  lipo -create "${BINARIES[@]}" -output "${MACOS_DIR}/${APP_NAME}"
fi
chmod 0755 "${MACOS_DIR}/${APP_NAME}"
find "${RESOURCES_DIR}" -type f -exec chmod 0644 {} +

cat > "${RESOURCES_DIR}/BuildReceipt.txt" <<EOF
app_name=${APP_DISPLAY_NAME}
app_variant=${APP_VARIANT}
executable_name=${APP_EXECUTABLE_NAME}
bundle_identifier=${BUNDLE_IDENTIFIER}
build_channel=${BUILD_CHANNEL}
cache_namespace=${CACHE_NAMESPACE}
storage_namespace=${STORAGE_NAMESPACE}
website_data_store_identifier=${WEBSITE_DATA_STORE_IDENTIFIER}
portable_project_ownership=${PORTABLE_PROJECT_OWNERSHIP}
user_guide_profile=${APP_VARIANT}
version=${PACKAGE_VERSION}
build_number=${BUILD_NUMBER}
source_revision=${SOURCE_REVISION}
minimum_macos=${MINIMUM_MACOS}
architectures=${ARCHITECTURES}
renderer=WKWebView+Three.js
web_bootstrap=classic-iife-single-entry
codec_policy=system-frameworks-only
video_codec=WKWebView-H264-capability-gated
audio_codec=AudioToolbox-Apple-software-AAC-LC
sandbox=user-selected-read-write
network_client_entitlement=present-in-sandbox-signature
webview_outbound_policy=v3-block-http-ws-ftp
webrtc_page_capability=page-world-document-start-lockdown
navigation_download_policy=remote-denied-before-destination
native_network_client_surface=none-shipped
network_boundary=app-entitled-webkit-blocked
EOF

# The resource manifest is generated before signing. Code signing subsequently
# seals these bytes; verification checks both the manifest and the signature.
python3 - "${RESOURCES_DIR}" <<'PY'
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
manifest = root / "BuildManifest.txt"
entries: list[str] = []
for path in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()):
    if not path.is_file() or path == manifest:
        continue
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    entries.append(f"{digest}  {path.relative_to(root).as_posix()}")
manifest.write_text("\n".join(entries) + "\n", encoding="utf-8")
PY
chmod 0644 "${RESOURCES_DIR}/BuildReceipt.txt" "${RESOURCES_DIR}/BuildManifest.txt"

# A bundle installed in /Applications must be traversable and readable by
# every local account. Freeze modes before signing so permissions are part of
# the exact artifact that verification and packaging consume.
find "${APP_BUNDLE}" -type d -exec chmod 0755 {} +
find "${APP_BUNDLE}" -type f -exec chmod 0644 {} +
chmod 0755 "${MACOS_DIR}/${APP_NAME}"

xattr -cr "${APP_BUNDLE}"
if [[ "${SIGNING_IDENTITY}" == "-" ]]; then
  codesign \
    --force \
    --options runtime \
    --entitlements "${ENTITLEMENTS}" \
    --sign - \
    --timestamp=none \
    "${APP_BUNDLE}"
else
  codesign \
    --force \
    --options runtime \
    --entitlements "${ENTITLEMENTS}" \
    --sign "${SIGNING_IDENTITY}" \
    --timestamp \
    "${APP_BUNDLE}"
fi

DRIFT_EXPECT_ARCHS="${ARCHITECTURES}" bash scripts/verify-macos-app.sh "${APP_BUNDLE}"

printf '\nBuilt %s\n' "${APP_BUNDLE}"
printf 'Architectures: %s\n' "$(lipo -archs "${MACOS_DIR}/${APP_NAME}")"
printf 'Audio: Apple software AAC-LC through AudioToolbox\n'
printf 'Video: WKWebView H.264, capability-gated and output-verified\n'
printf 'Network: app-wide client entitlement present; packaged WebKit outbound policy tested; no native client shipped\n'
printf 'Web bootstrap: classic IIFE, single boot-critical entry\n'
printf 'Open with: open %q\n' "${APP_BUNDLE}"
