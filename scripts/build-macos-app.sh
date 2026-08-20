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
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/drift-macos.XXXXXX")"
MINIMUM_MACOS="${DRIFT_MACOS_DEPLOYMENT_TARGET:-13.0}"
ARCHITECTURES="${DRIFT_MACOS_ARCHS:-arm64 x86_64}"
SIGNING_IDENTITY="${DRIFT_CODESIGN_IDENTITY:--}"

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

for command in node npm python3 xcrun lipo iconutil plutil codesign; do
  require_command "${command}"
done

cd "${ROOT_DIR}"
node --check macos/NativeBridge.js
python3 -m py_compile scripts/generate-macos-icon.py
bash -n scripts/build-macos-app.sh

if [[ "${DRIFT_SKIP_WEB_BUILD:-0}" != "1" ]]; then
  npm run build
fi

if [[ ! -f dist/index.html ]]; then
  echo "dist/index.html is missing. Run the web build before packaging Drift." >&2
  exit 1
fi
if grep -Eq '(src|href)="/assets/' dist/index.html; then
  echo "The Vite bundle contains root-absolute assets and cannot run inside Drift.app." >&2
  exit 1
fi

rm -rf "${APP_BUNDLE}"
mkdir -p "${MACOS_DIR}" "${WEB_DIR}"
cp macos/Info.plist "${CONTENTS_DIR}/Info.plist"
cp macos/NativeBridge.js "${RESOURCES_DIR}/NativeBridge.js"
cp -R dist/. "${WEB_DIR}/"

PACKAGE_VERSION="$(node -p "require('./package.json').version")"
BUILD_NUMBER="${DRIFT_BUILD_NUMBER:-1}"
plutil -replace CFBundleShortVersionString -string "${PACKAGE_VERSION}" "${CONTENTS_DIR}/Info.plist"
plutil -replace CFBundleVersion -string "${BUILD_NUMBER}" "${CONTENTS_DIR}/Info.plist"
plutil -replace LSMinimumSystemVersion -string "${MINIMUM_MACOS}" "${CONTENTS_DIR}/Info.plist"
plutil -lint "${CONTENTS_DIR}/Info.plist"

ICONSET_DIR="${TEMP_DIR}/${APP_NAME}.iconset"
python3 scripts/generate-macos-icon.py "${ICONSET_DIR}"
iconutil -c icns "${ICONSET_DIR}" -o "${RESOURCES_DIR}/${APP_NAME}.icns"

SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
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
    -framework Foundation \
    -framework UniformTypeIdentifiers \
    -framework WebKit \
    macos/DriftApp.swift \
    -o "${binary}"
  BINARIES+=("${binary}")
done

if [[ ${#BINARIES[@]} -eq 1 ]]; then
  cp "${BINARIES[0]}" "${MACOS_DIR}/${APP_NAME}"
else
  lipo -create "${BINARIES[@]}" -output "${MACOS_DIR}/${APP_NAME}"
fi
chmod 0755 "${MACOS_DIR}/${APP_NAME}"

xattr -cr "${APP_BUNDLE}" 2>/dev/null || true
if [[ "${SIGNING_IDENTITY}" == "-" ]]; then
  codesign --force --sign - --timestamp=none "${APP_BUNDLE}"
else
  codesign --force --options runtime --sign "${SIGNING_IDENTITY}" --timestamp "${APP_BUNDLE}"
fi
codesign --verify --deep --strict "${APP_BUNDLE}"

"${MACOS_DIR}/${APP_NAME}" --smoke-test

printf '\nBuilt %s\n' "${APP_BUNDLE}"
printf 'Architectures: %s\n' "$(lipo -archs "${MACOS_DIR}/${APP_NAME}")"
printf 'Open with: open %q\n' "${APP_BUNDLE}"
