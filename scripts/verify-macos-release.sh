#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_PATH="${1:-$ROOT/build/macos/Drift.app}"
DMG_PATH="${2:-$ROOT/build/release/Drift-macOS.dmg}"
MANIFEST_PATH="${3:-$ROOT/build/release/ReleaseManifest.json}"

fail() {
  echo "verify-release(mac): $*" >&2
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "verification must run on macOS"
[[ -d "$APP_PATH" ]] || fail "app is missing: $APP_PATH"
[[ -f "$DMG_PATH" ]] || fail "DMG is missing: $DMG_PATH"
[[ -f "$MANIFEST_PATH" ]] || fail "release manifest is missing: $MANIFEST_PATH"

EXECUTABLE="$APP_PATH/Contents/MacOS/Drift"
INFO_PLIST="$APP_PATH/Contents/Info.plist"
WEB_ROOT="$APP_PATH/Contents/Resources/Web"
LEGAL_ROOT="$APP_PATH/Contents/Resources/Legal"

[[ -x "$EXECUTABLE" ]] || fail "app executable is missing or not executable"
[[ -f "$INFO_PLIST" ]] || fail "Info.plist is missing"
[[ -d "$WEB_ROOT" ]] || fail "packaged web bundle is missing"
[[ -d "$LEGAL_ROOT" ]] || fail "packaged legal evidence is missing"

codesign --verify --deep --strict --verbose=2 "$APP_PATH"
SIGNATURE_DETAIL="$(codesign -dv --verbose=4 "$APP_PATH" 2>&1)"
grep -Eq 'flags=.*runtime' <<<"$SIGNATURE_DETAIL" || fail "hardened runtime flag is absent"
grep -Eq '^Authority=Developer ID Application:' <<<"$SIGNATURE_DETAIL" || fail "app is not Developer ID signed"

ENTITLEMENTS="$(codesign -d --entitlements :- "$APP_PATH" 2>/dev/null)"
grep -q '<key>com.apple.security.app-sandbox</key>' <<<"$ENTITLEMENTS" || fail "App Sandbox entitlement is absent"
grep -A1 '<key>com.apple.security.app-sandbox</key>' <<<"$ENTITLEMENTS" | grep -q '<true/>' || fail "App Sandbox is not enabled"
if grep -q '<key>com.apple.security.network.client</key>' <<<"$ENTITLEMENTS"; then
  fail "release app unexpectedly has outbound network entitlement"
fi
if grep -q '<key>com.apple.security.network.server</key>' <<<"$ENTITLEMENTS"; then
  fail "release app unexpectedly has inbound network entitlement"
fi

ARCHS="$(lipo -archs "$EXECUTABLE")"
for arch in arm64 x86_64; do
  grep -qw "$arch" <<<"$ARCHS" || fail "universal executable is missing $arch"
done

for legal in LICENSE NOTICE ASSET-LICENSE.md THIRD_PARTY_NOTICES.md TRADEMARKS.md SBOM.cdx.json; do
  [[ -s "$LEGAL_ROOT/$legal" ]] || fail "legal evidence is missing or empty: $legal"
done

if find "$WEB_ROOT" -type f \( -name '*.map' -o -name '*.wasm' \) -print -quit | grep -q .; then
  find "$WEB_ROOT" -type f \( -name '*.map' -o -name '*.wasm' \) -print >&2
  fail "release web bundle contains source maps or WebAssembly"
fi
if grep -RIlE '@mediabunny/aac-encoder|libavcodec|ffmpeg[^a-zA-Z]' "$WEB_ROOT" >/dev/null 2>&1; then
  fail "release web bundle contains the excluded software AAC/FFmpeg path"
fi

codesign --verify --verbose=2 "$DMG_PATH"
hdiutil verify "$DMG_PATH"

node - "$MANIFEST_PATH" "$APP_PATH" "$DMG_PATH" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const [manifestPath, appPath, dmgPath] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const fail = (message) => { console.error(`verify-release(mac): ${message}`); process.exit(1); };
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

if (manifest.schemaVersion !== 1 || manifest.product !== 'Drift') fail('release manifest identity is invalid');
if (!manifest.hardenedRuntime) fail('release manifest does not assert hardened runtime');
if (!Array.isArray(manifest.architectures) || !manifest.architectures.includes('arm64') || !manifest.architectures.includes('x86_64')) {
  fail('release manifest does not describe a universal binary');
}
if (manifest.artifacts?.diskImage?.sha256 !== sha256(dmgPath)) fail('DMG SHA-256 differs from the release manifest');
if (manifest.artifacts?.diskImage?.bytes !== fs.statSync(dmgPath).size) fail('DMG size differs from the release manifest');
if (manifest.artifacts?.diskImage?.file !== path.basename(dmgPath)) fail('DMG filename differs from the release manifest');
for (const key of ['sourceMapsAbsent', 'webAssemblyAbsent', 'softwareAacFfmpegAbsent']) {
  if (manifest.evidence?.[key] !== true) fail(`release evidence is missing ${key}`);
}
if (!fs.existsSync(path.join(appPath, 'Contents/Resources/Legal/SBOM.cdx.json'))) fail('source SBOM is missing from the app');
NODE

MOUNT_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/drift-release-verify.XXXXXX")"
DEVICE=""
cleanup() {
  if [[ -n "$DEVICE" ]]; then
    hdiutil detach "$DEVICE" -quiet || hdiutil detach "$DEVICE" -force -quiet || true
  fi
  rm -rf "$MOUNT_ROOT"
}
trap cleanup EXIT

ATTACH_OUTPUT="$(hdiutil attach "$DMG_PATH" -readonly -nobrowse -mountpoint "$MOUNT_ROOT")"
DEVICE="$(awk '/^\/dev\// {print $1; exit}' <<<"$ATTACH_OUTPUT")"
[[ -n "$DEVICE" ]] || fail "DMG mounted without a readable device identifier"
[[ -d "$MOUNT_ROOT/Drift.app" ]] || fail "DMG does not contain Drift.app"
[[ -L "$MOUNT_ROOT/Applications" ]] || fail "DMG does not contain the Applications shortcut"
[[ "$(readlink "$MOUNT_ROOT/Applications")" == "/Applications" ]] || fail "Applications shortcut points somewhere unexpected"
[[ -s "$MOUNT_ROOT/Read Me.txt" ]] || fail "DMG read-me is missing"

codesign --verify --deep --strict --verbose=2 "$MOUNT_ROOT/Drift.app"
MOUNTED_ARCHS="$(lipo -archs "$MOUNT_ROOT/Drift.app/Contents/MacOS/Drift")"
[[ "$MOUNTED_ARCHS" == "$ARCHS" ]] || fail "mounted app architectures differ from the source app"

SOURCE_EXECUTABLE_SHA="$(shasum -a 256 "$EXECUTABLE" | awk '{print $1}')"
MOUNTED_EXECUTABLE_SHA="$(shasum -a 256 "$MOUNT_ROOT/Drift.app/Contents/MacOS/Drift" | awk '{print $1}')"
[[ "$SOURCE_EXECUTABLE_SHA" == "$MOUNTED_EXECUTABLE_SHA" ]] || fail "DMG changed the app executable"

NOTARIZED="$(node -p "Boolean(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).notarized)" "$MANIFEST_PATH")"
if [[ "$NOTARIZED" == "true" ]]; then
  xcrun stapler validate -v "$APP_PATH"
  xcrun stapler validate -v "$DMG_PATH"
  spctl --assess --type execute --verbose=4 "$APP_PATH"
  spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG_PATH"
fi

printf 'Release verification passed.\n'
printf '  App: %s\n' "$APP_PATH"
printf '  DMG: %s\n' "$DMG_PATH"
printf '  Architectures: %s\n' "$ARCHS"
printf '  Notarized: %s\n' "$NOTARIZED"
