#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_ROOT="${DRIFT_MACOS_BUILD_ROOT:-$ROOT/build/macos}"
APP_PATH="${DRIFT_MACOS_APP_PATH:-$BUILD_ROOT/Drift.app}"
DIST_ROOT="${DRIFT_MACOS_DIST_ROOT:-$ROOT/build/release}"
ARCHIVE_PATH="$DIST_ROOT/Drift-macOS.zip"
DMG_PATH="$DIST_ROOT/Drift-macOS.dmg"
APP_NOTARY_REPORT="$DIST_ROOT/notary-app.json"
DMG_NOTARY_REPORT="$DIST_ROOT/notary-dmg.json"
CHECKSUM_PATH="$DIST_ROOT/SHA256SUMS.txt"
RELEASE_MANIFEST="$DIST_ROOT/ReleaseManifest.json"
SIGN_IDENTITY="${DRIFT_MACOS_SIGN_IDENTITY:-}"
NOTARIZE=false
SKIP_TESTS=false

usage() {
  cat <<'EOF'
Build a release-grade, signed Drift.app and DMG without publishing them.

Usage:
  scripts/release-macos-app.sh [--notarize] [--skip-tests]

Required:
  DRIFT_MACOS_SIGN_IDENTITY   Developer ID Application identity name or SHA-1.

Notarisation credentials, choose one route:
  APPLE_NOTARY_PROFILE       notarytool keychain profile name.

or:
  APPLE_NOTARY_KEY_PATH      App Store Connect API private key (.p8).
  APPLE_NOTARY_KEY_ID        API key ID.
  APPLE_NOTARY_ISSUER_ID     API issuer ID.

The script creates local artifacts only. It never uploads a GitHub release,
changes a tag, or sends analytics from the application.
EOF
}

while (($#)); do
  case "$1" in
    --notarize) NOTARIZE=true ;;
    --skip-tests) SKIP_TESTS=true ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 64 ;;
  esac
  shift
done

fail() {
  echo "release(mac): $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command is unavailable: $1"
}

[[ "$(uname -s)" == "Darwin" ]] || fail "release packaging must run on macOS"
[[ -n "$SIGN_IDENTITY" && "$SIGN_IDENTITY" != "-" ]] || fail \
  "DRIFT_MACOS_SIGN_IDENTITY must name a real Developer ID Application certificate"

for command in node npm xcrun xcodebuild swiftc lipo codesign ditto hdiutil shasum security; do
  require_command "$command"
done

if [[ "$NOTARIZE" == true ]]; then
  if [[ -n "${APPLE_NOTARY_PROFILE:-}" ]]; then
    :
  elif [[ -n "${APPLE_NOTARY_KEY_PATH:-}" && -n "${APPLE_NOTARY_KEY_ID:-}" && -n "${APPLE_NOTARY_ISSUER_ID:-}" ]]; then
    [[ -f "$APPLE_NOTARY_KEY_PATH" ]] || fail "APPLE_NOTARY_KEY_PATH does not exist"
  else
    fail "--notarize requires APPLE_NOTARY_PROFILE or the three APPLE_NOTARY_KEY_* variables"
  fi
fi

rm -rf "$DIST_ROOT"
mkdir -p "$DIST_ROOT"

if [[ "$SKIP_TESTS" != true ]]; then
  npm --prefix "$ROOT" ci
  npm --prefix "$ROOT" run check
  npm --prefix "$ROOT" run check:mac-source
fi

DRIFT_MACOS_SIGN_IDENTITY="$SIGN_IDENTITY" \
DRIFT_MACOS_ARCHS="${DRIFT_MACOS_ARCHS:-arm64 x86_64}" \
  "$ROOT/scripts/build-macos-app.sh"

[[ -d "$APP_PATH" ]] || fail "builder did not create $APP_PATH"

LEGAL_ROOT="$APP_PATH/Contents/Resources/Legal"
mkdir -p "$LEGAL_ROOT"
for legal in LICENSE NOTICE ASSET-LICENSE.md THIRD_PARTY_NOTICES.md TRADEMARKS.md; do
  [[ -f "$ROOT/$legal" ]] || fail "required legal file is missing: $legal"
  cp "$ROOT/$legal" "$LEGAL_ROOT/$legal"
done

# This is a dependency inventory for the source used to build the app. The
# release boundary below separately proves that the software AAC/FFmpeg WASM
# extension is not present in the packaged Mac runtime.
npm --prefix "$ROOT" sbom --omit=dev --sbom-format=cyclonedx > "$LEGAL_ROOT/SBOM.cdx.json"

WEB_ROOT="$APP_PATH/Contents/Resources/Web"
[[ -d "$WEB_ROOT" ]] || fail "packaged web bundle is missing"
if find "$WEB_ROOT" -type f \( -name '*.map' -o -name '*.wasm' \) -print -quit | grep -q .; then
  find "$WEB_ROOT" -type f \( -name '*.map' -o -name '*.wasm' \) -print >&2
  fail "release web bundle contains source maps or WebAssembly"
fi
if grep -RIlE '@mediabunny/aac-encoder|libavcodec|ffmpeg[^a-zA-Z]' "$WEB_ROOT" >/dev/null 2>&1; then
  grep -RIlE '@mediabunny/aac-encoder|libavcodec|ffmpeg[^a-zA-Z]' "$WEB_ROOT" >&2 || true
  fail "release web bundle contains the excluded software AAC/FFmpeg path"
fi

# Adding legal evidence changes signed resources. Sign once, after the complete
# bundle is frozen, with hardened runtime and a trusted timestamp.
codesign --force \
  --sign "$SIGN_IDENTITY" \
  --options runtime \
  --timestamp \
  --entitlements "$ROOT/macos/Drift.entitlements" \
  "$APP_PATH"

codesign --verify --deep --strict --verbose=2 "$APP_PATH"
"$ROOT/scripts/verify-macos-app.sh" "$APP_PATH"

rm -f "$ARCHIVE_PATH"
ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$ARCHIVE_PATH"

notary_args=()
if [[ -n "${APPLE_NOTARY_PROFILE:-}" ]]; then
  notary_args=(--keychain-profile "$APPLE_NOTARY_PROFILE")
elif [[ -n "${APPLE_NOTARY_KEY_PATH:-}" ]]; then
  notary_args=(
    --key "$APPLE_NOTARY_KEY_PATH"
    --key-id "$APPLE_NOTARY_KEY_ID"
    --issuer "$APPLE_NOTARY_ISSUER_ID"
  )
fi

submit_notary() {
  local artifact="$1"
  local report="$2"
  xcrun notarytool submit "$artifact" \
    "${notary_args[@]}" \
    --wait \
    --output-format json | tee "$report"
  node - "$report" <<'NODE'
const fs = require('node:fs');
const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (report.status !== 'Accepted') {
  console.error(`Notarisation was not accepted: ${report.status ?? 'unknown status'}`);
  process.exit(1);
}
NODE
}

if [[ "$NOTARIZE" == true ]]; then
  submit_notary "$ARCHIVE_PATH" "$APP_NOTARY_REPORT"
  xcrun stapler staple -v "$APP_PATH"
  xcrun stapler validate -v "$APP_PATH"
fi

STAGING_ROOT="$(mktemp -d "$DIST_ROOT/.dmg-stage.XXXXXX")"
cleanup() {
  rm -rf "$STAGING_ROOT"
}
trap cleanup EXIT
cp -R "$APP_PATH" "$STAGING_ROOT/Drift.app"
ln -s /Applications "$STAGING_ROOT/Applications"
cat > "$STAGING_ROOT/Read Me.txt" <<'EOF'
Drag Drift to Applications.

Drift is local-first. Imported deck media and saved projects remain on this Mac
unless you deliberately export or move them.
EOF

rm -f "$DMG_PATH"
hdiutil create \
  -volname "Drift" \
  -srcfolder "$STAGING_ROOT" \
  -format UDZO \
  -imagekey zlib-level=9 \
  -ov \
  "$DMG_PATH"

codesign --force --sign "$SIGN_IDENTITY" --timestamp "$DMG_PATH"
codesign --verify --verbose=2 "$DMG_PATH"
hdiutil verify "$DMG_PATH"

if [[ "$NOTARIZE" == true ]]; then
  submit_notary "$DMG_PATH" "$DMG_NOTARY_REPORT"
  xcrun stapler staple -v "$DMG_PATH"
  xcrun stapler validate -v "$DMG_PATH"
  spctl --assess --type execute --verbose=4 "$APP_PATH"
  spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG_PATH"
fi

APP_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_PATH/Contents/Info.plist")"
APP_BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP_PATH/Contents/Info.plist")"
GIT_COMMIT="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || printf unknown)"
SIGNING_TEAM="$(codesign -dv --verbose=4 "$APP_PATH" 2>&1 | awk -F= '/^TeamIdentifier=/{print $2; exit}')"

node - "$RELEASE_MANIFEST" "$APP_PATH" "$ARCHIVE_PATH" "$DMG_PATH" "$APP_VERSION" "$APP_BUILD" "$GIT_COMMIT" "$SIGNING_TEAM" "$NOTARIZE" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

const [manifestPath, appPath, archivePath, dmgPath, version, build, commit, team, notarized] = process.argv.slice(2);
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const command = (program, args) => childProcess.execFileSync(program, args, { encoding: 'utf8' }).trim();
const manifest = {
  schemaVersion: 1,
  product: 'Drift',
  version,
  build,
  commit,
  teamIdentifier: team || null,
  hardenedRuntime: true,
  notarized: notarized === 'true',
  architectures: command('lipo', ['-archs', path.join(appPath, 'Contents/MacOS/Drift')]).split(/\s+/),
  minimumSystemVersion: command('/usr/libexec/PlistBuddy', ['-c', 'Print :LSMinimumSystemVersion', path.join(appPath, 'Contents/Info.plist')]),
  artifacts: {
    appArchive: { file: path.basename(archivePath), bytes: fs.statSync(archivePath).size, sha256: sha256(archivePath) },
    diskImage: { file: path.basename(dmgPath), bytes: fs.statSync(dmgPath).size, sha256: sha256(dmgPath) },
  },
  evidence: {
    sourceMapsAbsent: true,
    webAssemblyAbsent: true,
    softwareAacFfmpegAbsent: true,
    legalBundle: 'Drift.app/Contents/Resources/Legal',
    sourceSbom: 'Drift.app/Contents/Resources/Legal/SBOM.cdx.json',
  },
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
NODE

(
  cd "$DIST_ROOT"
  shasum -a 256 "$(basename "$ARCHIVE_PATH")" "$(basename "$DMG_PATH")" "$(basename "$RELEASE_MANIFEST")" > "$CHECKSUM_PATH"
)

"$ROOT/scripts/verify-macos-release.sh" "$APP_PATH" "$DMG_PATH" "$RELEASE_MANIFEST"

cat <<EOF

Release-grade local artifacts created:
  App:      $APP_PATH
  Archive:  $ARCHIVE_PATH
  DMG:      $DMG_PATH
  Manifest: $RELEASE_MANIFEST
  SHA-256:  $CHECKSUM_PATH

Notarised: $NOTARIZE
Nothing was published or uploaded by this script.
EOF
