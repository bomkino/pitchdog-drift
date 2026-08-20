#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_PATH="${1:-$ROOT/build/macos/Drift.app}"
DMG_PATH="${2:-$ROOT/build/release/Drift-macOS.dmg}"
MANIFEST_PATH="${3:-$ROOT/build/release/ReleaseManifest.json}"
ARCHIVE_PATH="${4:-$ROOT/build/release/Drift-macOS.zip}"
CHECKSUM_PATH="${5:-$(dirname "$MANIFEST_PATH")/SHA256SUMS.txt}"

fail() {
  echo "verify-release(mac): $*" >&2
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "verification must run on macOS"
for command in codesign hdiutil lipo node plutil python3 readlink shasum spctl xcrun; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done
[[ -d "$APP_PATH" ]] || fail "app is missing: $APP_PATH"
[[ -f "$DMG_PATH" ]] || fail "DMG is missing: $DMG_PATH"
[[ -f "$MANIFEST_PATH" ]] || fail "release manifest is missing: $MANIFEST_PATH"
[[ -f "$ARCHIVE_PATH" ]] || fail "notarization submission archive is missing: $ARCHIVE_PATH"
[[ -f "$CHECKSUM_PATH" ]] || fail "release checksum file is missing: $CHECKSUM_PATH"

EXECUTABLE="$APP_PATH/Contents/MacOS/Drift"
INFO_PLIST="$APP_PATH/Contents/Info.plist"
WEB_ROOT="$APP_PATH/Contents/Resources/Web"
LEGAL_ROOT="$APP_PATH/Contents/Resources/Legal"
BUILD_RECEIPT="$APP_PATH/Contents/Resources/BuildReceipt.txt"

[[ -x "$EXECUTABLE" ]] || fail "app executable is missing or not executable"
[[ -f "$INFO_PLIST" ]] || fail "Info.plist is missing"
[[ -d "$WEB_ROOT" ]] || fail "packaged web bundle is missing"
[[ -d "$LEGAL_ROOT" ]] || fail "packaged legal evidence is missing"
[[ -f "$BUILD_RECEIPT" ]] || fail "build receipt is missing"

DRIFT_EXPECT_ARCHS="arm64 x86_64" "$ROOT/scripts/verify-macos-app.sh" "$APP_PATH"

SIGNATURE_DETAIL="$(codesign -dv --verbose=4 "$APP_PATH" 2>&1)"
grep -Eq 'flags=.*runtime' <<<"$SIGNATURE_DETAIL" || fail "hardened runtime flag is absent"
grep -Eq '^Authority=Developer ID Application:' <<<"$SIGNATURE_DETAIL" || fail "app is not Developer ID Application signed"
SIGNING_TEAM="$(awk -F= '/^TeamIdentifier=/{print $2; exit}' <<<"$SIGNATURE_DETAIL")"
[[ -n "$SIGNING_TEAM" && "$SIGNING_TEAM" != "not set" ]] || fail "Developer ID signature has no TeamIdentifier"

ARCHS="$(lipo -archs "$EXECUTABLE")"
for arch in arm64 x86_64; do
  grep -qw "$arch" <<<"$ARCHS" || fail "universal executable is missing $arch"
done

for legal in LICENSE NOTICE ASSET-LICENSE.md THIRD_PARTY_NOTICES.md TRADEMARKS.md SBOM.cdx.json; do
  [[ -s "$LEGAL_ROOT/$legal" ]] || fail "legal evidence is missing or empty: $legal"
done

grep -Fx 'codec_policy=system-frameworks-only' "$BUILD_RECEIPT" >/dev/null \
  || fail "build receipt does not freeze the system-framework codec policy"
grep -Fx 'video_codec=WKWebView-H264-capability-gated' "$BUILD_RECEIPT" >/dev/null \
  || fail "build receipt misstates the H.264 path"
grep -Fx 'audio_codec=AudioToolbox-Apple-software-AAC-LC' "$BUILD_RECEIPT" >/dev/null \
  || fail "build receipt misstates the presenter-audio path"

if find "$WEB_ROOT" -type f \( -name '*.map' -o -name '*.wasm' \) -print -quit | grep -q .; then
  find "$WEB_ROOT" -type f \( -name '*.map' -o -name '*.wasm' \) -print >&2
  fail "release web bundle contains source maps or WebAssembly"
fi
if grep -RIlE '@mediabunny/aac-encoder|libavcodec|ffmpeg[^a-zA-Z]' "$WEB_ROOT" >/dev/null 2>&1; then
  fail "release web bundle contains the excluded software AAC/FFmpeg path"
fi

codesign --verify --verbose=2 "$DMG_PATH"
hdiutil verify "$DMG_PATH"

(
  cd "$(dirname "$CHECKSUM_PATH")"
  shasum -a 256 -c "$(basename "$CHECKSUM_PATH")"
)

NOTARIZED="$(node - "$MANIFEST_PATH" "$APP_PATH" "$ARCHIVE_PATH" "$DMG_PATH" "$SIGNING_TEAM" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

const [manifestPath, appPath, archivePath, dmgPath, signingTeam] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const fail = (message) => { console.error(`verify-release(mac): ${message}`); process.exit(1); };
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const plist = (key) => childProcess.execFileSync('/usr/libexec/PlistBuddy', [
  '-c', `Print :${key}`, path.join(appPath, 'Contents/Info.plist'),
], { encoding: 'utf8' }).trim();

if (manifest.schemaVersion !== 2 || manifest.product !== 'Drift') fail('release manifest identity is invalid');
if (!manifest.hardenedRuntime) fail('release manifest does not assert hardened runtime');
if (manifest.published !== false) fail('release manifest must state that publication has not occurred');
if (manifest.teamIdentifier !== signingTeam) fail('release manifest TeamIdentifier differs from the signature');
if (manifest.version !== plist('CFBundleShortVersionString')) fail('release manifest version differs from Info.plist');
if (manifest.build !== plist('CFBundleVersion')) fail('release manifest build differs from Info.plist');
if (manifest.commit !== plist('DriftSourceRevision')) fail('release manifest commit differs from Info.plist');
if (manifest.minimumSystemVersion !== plist('LSMinimumSystemVersion')) fail('minimum macOS differs from Info.plist');
if (!Array.isArray(manifest.architectures) || !manifest.architectures.includes('arm64') || !manifest.architectures.includes('x86_64')) {
  fail('release manifest does not describe a universal binary');
}
if (manifest.codecs?.video !== 'WKWebView-H264-capability-gated') fail('release manifest misstates the video codec path');
if (manifest.codecs?.presenterAudio !== 'AudioToolbox-Apple-software-AAC-LC') fail('release manifest misstates the audio codec path');

const archive = manifest.artifacts?.notarizationSubmissionArchive;
if (archive?.sha256 !== sha256(archivePath)) fail('submission archive SHA-256 differs from the release manifest');
if (archive?.bytes !== fs.statSync(archivePath).size) fail('submission archive size differs from the release manifest');
if (archive?.file !== path.basename(archivePath)) fail('submission archive filename differs from the release manifest');
if (archive?.distributable !== false) fail('notarization submission archive must not be labelled distributable');

const dmg = manifest.artifacts?.diskImage;
if (dmg?.sha256 !== sha256(dmgPath)) fail('DMG SHA-256 differs from the release manifest');
if (dmg?.bytes !== fs.statSync(dmgPath).size) fail('DMG size differs from the release manifest');
if (dmg?.file !== path.basename(dmgPath)) fail('DMG filename differs from the release manifest');
for (const key of [
  'sourceMapsAbsent',
  'webAssemblyAbsent',
  'softwareAacFfmpegAbsent',
  'resourceManifestRegeneratedAfterSbom',
]) {
  if (manifest.evidence?.[key] !== true) fail(`release evidence is missing ${key}`);
}
if (!fs.existsSync(path.join(appPath, 'Contents/Resources/Legal/SBOM.cdx.json'))) fail('source SBOM is missing from the app');

if (manifest.notarized === true) {
  if (typeof manifest.notarization?.appSubmissionId !== 'string' || manifest.notarization.appSubmissionId.length === 0) {
    fail('notarized manifest has no app submission ID');
  }
  if (typeof manifest.notarization?.dmgSubmissionId !== 'string' || manifest.notarization.dmgSubmissionId.length === 0) {
    fail('notarized manifest has no DMG submission ID');
  }
} else if (manifest.notarization?.appSubmissionId !== null || manifest.notarization?.dmgSubmissionId !== null) {
  fail('non-notarized manifest unexpectedly carries notarization IDs');
}
process.stdout.write(String(manifest.notarized === true));
NODE
)"

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
grep -q 'AudioToolbox' "$MOUNT_ROOT/Read Me.txt" || fail "DMG read-me omits the native AAC path"
grep -q 'WKWebView' "$MOUNT_ROOT/Read Me.txt" || fail "DMG read-me omits the H.264 capability boundary"
grep -q 'not automatically' "$MOUNT_ROOT/Read Me.txt" || fail "DMG read-me omits the publication boundary"

DRIFT_EXPECT_ARCHS="arm64 x86_64" "$ROOT/scripts/verify-macos-app.sh" "$MOUNT_ROOT/Drift.app"

# Compare every regular file, not merely the executable. The DMG must contain
# the exact frozen app that passed signature, manifest, and runtime checks.
python3 - "$APP_PATH" "$MOUNT_ROOT/Drift.app" <<'PY'
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

source = Path(sys.argv[1]).resolve()
mounted = Path(sys.argv[2]).resolve()

def inventory(root: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for candidate in sorted(root.rglob("*")):
        if not candidate.is_file():
            continue
        relative = candidate.relative_to(root).as_posix()
        result[relative] = hashlib.sha256(candidate.read_bytes()).hexdigest()
    return result

source_inventory = inventory(source)
mounted_inventory = inventory(mounted)
if source_inventory != mounted_inventory:
    source_names = set(source_inventory)
    mounted_names = set(mounted_inventory)
    missing = sorted(source_names - mounted_names)
    unexpected = sorted(mounted_names - source_names)
    changed = sorted(
        name for name in source_names & mounted_names
        if source_inventory[name] != mounted_inventory[name]
    )
    raise SystemExit(
        "verify-release(mac): mounted app differs from frozen source app; "
        f"missing={missing}, unexpected={unexpected}, changed={changed}"
    )
PY

if [[ "$NOTARIZED" == "true" ]]; then
  xcrun stapler validate -v "$APP_PATH"
  xcrun stapler validate -v "$DMG_PATH"
  spctl --assess --type execute --verbose=4 "$APP_PATH"
  spctl --assess --type execute --verbose=4 "$MOUNT_ROOT/Drift.app"
  spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG_PATH"
fi

printf 'Release candidate verification passed.\n'
printf '  App: %s\n' "$APP_PATH"
printf '  Notary submission archive: %s\n' "$ARCHIVE_PATH"
printf '  DMG: %s\n' "$DMG_PATH"
printf '  Architectures: %s\n' "$ARCHS"
printf '  Presenter audio: Apple software AAC-LC through AudioToolbox\n'
printf '  Video: WKWebView H.264, capability-gated\n'
printf '  Notarized: %s\n' "$NOTARIZED"
printf '  Published: no\n'
