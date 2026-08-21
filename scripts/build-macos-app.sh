#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${DRIFT_MACOS_OUTPUT_DIR:-${ROOT_DIR}/build/macos}"
APP_NAME="Drift"
APP_BUNDLE="${OUTPUT_DIR}/${APP_NAME}.app"
CONTENTS_DIR="${APP_BUNDLE}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"
WEB_DIR="${RESOURCES_DIR}/Web"
LEGAL_DIR="${RESOURCES_DIR}/Legal"
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

for command in node npm python3 xcrun lipo iconutil plutil codesign xattr; do
  require_command "${command}"
done

cd "${ROOT_DIR}"

if [[ "${DRIFT_SKIP_WEB_CHECKS:-0}" == "1" ]]; then
  npm run check:mac-source
else
  npm run check
fi

# Always replace the ordinary browser bundle with the system-framework Mac
# build. Skipping checks may save CI time; skipping this rebuild is forbidden.
rm -rf dist
npm exec -- vite build --mode macos

if [[ ! -f dist/index.html ]]; then
  echo "dist/index.html is missing after the macOS Vite build." >&2
  exit 1
fi
if grep -Eq '(src|href)="/assets/' dist/index.html; then
  echo "The Vite bundle contains root-absolute assets and cannot run inside Drift.app." >&2
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
mkdir -p "${MACOS_DIR}" "${WEB_DIR}" "${LEGAL_DIR}" "${DOCS_DIR}"
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
cp \
  docs/MACOS_APP.md \
  docs/MACOS_PRODUCT_CONTRACT.md \
  docs/MACOS_USER_GUIDE.md \
  docs/MACOS_QA.md \
  docs/MACOS_THREAT_MODEL.md \
  docs/MACOS_RELEASE.md \
  docs/MACOS_RELEASE_CHECKLIST.md \
  "${DOCS_DIR}/"

PACKAGE_VERSION="$(node -p "require('./package.json').version")"
BUILD_NUMBER="${DRIFT_BUILD_NUMBER:-$(git rev-list --count HEAD 2>/dev/null || printf '1')}"
SOURCE_REVISION="${DRIFT_SOURCE_REVISION:-$(git rev-parse --verify HEAD 2>/dev/null || printf 'unknown')}"
plutil -replace CFBundleShortVersionString -string "${PACKAGE_VERSION}" "${CONTENTS_DIR}/Info.plist"
plutil -replace CFBundleVersion -string "${BUILD_NUMBER}" "${CONTENTS_DIR}/Info.plist"
plutil -replace LSMinimumSystemVersion -string "${MINIMUM_MACOS}" "${CONTENTS_DIR}/Info.plist"
plutil -replace DriftSourceRevision -string "${SOURCE_REVISION}" "${CONTENTS_DIR}/Info.plist"
plutil -lint "${CONTENTS_DIR}/Info.plist" "${ENTITLEMENTS}"

ICONSET_DIR="${TEMP_DIR}/${APP_NAME}.iconset"
DOCUMENT_ICONSET_DIR="${TEMP_DIR}/${APP_NAME}Document.iconset"
python3 scripts/generate-macos-icon.py "${ICONSET_DIR}"
python3 scripts/generate-macos-document-icon.py "${DOCUMENT_ICONSET_DIR}"
iconutil -c icns "${ICONSET_DIR}" -o "${RESOURCES_DIR}/${APP_NAME}.icns"
iconutil -c icns "${DOCUMENT_ICONSET_DIR}" -o "${RESOURCES_DIR}/${APP_NAME}Document.icns"

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
    -framework Foundation \
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
app_name=Drift
version=${PACKAGE_VERSION}
build_number=${BUILD_NUMBER}
source_revision=${SOURCE_REVISION}
minimum_macos=${MINIMUM_MACOS}
architectures=${ARCHITECTURES}
renderer=WKWebView+Three.js
codec_policy=system-frameworks-only
video_codec=WKWebView-H264-capability-gated
audio_codec=AudioToolbox-Apple-software-AAC-LC
document_icon=DriftDocument.icns
sandbox=user-selected-read-write
network_entitlement=none
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
printf 'Document icon: DriftDocument.icns for .pitched projects\n'
printf 'Audio: Apple software AAC-LC through AudioToolbox\n'
printf 'Video: WKWebView H.264, capability-gated and output-verified\n'
printf 'Open with: open %q\n' "${APP_BUNDLE}"
