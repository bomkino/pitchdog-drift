#!/bin/bash
# Preserve executable modes, resources and signing metadata before Actions upload.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo 'Package on an Apple silicon Mac.' >&2; exit 1; }
APP="$ROOT/build/native/Drift.app"
ARCHIVE="$ROOT/build/native/Drift-native-arm64.zip"
ROUNDTRIP="$ROOT/build/native-roundtrip"
test -x "$APP/Contents/MacOS/Drift"
python3 scripts/verify-studio-ui-distribution.py "$APP/Contents/Resources/BuildIdentity.json"
codesign --verify --deep --strict "$APP"
# This is generated build staging, never an installed application or user project.
rm -rf "$ROUNDTRIP"
mkdir -p "$ROUNDTRIP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ARCHIVE"
unzip -tq "$ARCHIVE"
ditto -x -k "$ARCHIVE" "$ROUNDTRIP"
RESTORED="$ROUNDTRIP/Drift.app"
test -x "$RESTORED/Contents/MacOS/Drift"
[[ "$(lipo -archs "$RESTORED/Contents/MacOS/Drift")" == arm64 ]]
codesign --verify --deep --strict "$RESTORED"
# Verify every ordinary bundle file, not just the executable or plist.
diff -qr "$APP" "$RESTORED"
APP="$RESTORED" ARCHIVE="$ARCHIVE" python3 - <<'PY'
import hashlib, json, os, pathlib, plistlib
app = pathlib.Path(os.environ['APP'])
archive = pathlib.Path(os.environ['ARCHIVE'])
info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
identity = json.loads((app / 'Contents/Resources/BuildIdentity.json').read_text())
assert info['CFBundleIdentifier'] == 'dog.pitch.drift'
assert info['DriftRuntime'] == identity['runtime'] == 'native'
assert info['DriftSourceRevision'] == identity['source'] == os.environ['DRIFT_SOURCE_REVISION']
assert info['CFBundleShortVersionString'] == identity['version']
assert info['CFBundleVersion'] == identity['build']
assert info['LSMinimumSystemVersion'] == identity['minimumMacOS'] == '13.3'
for name in ('Drift.icns', 'Drift.metallib', 'ShaderSchema.json', 'CreativeCatalog.json', 'Sound', 'ThirdPartyNotices'):
    assert (app / 'Contents/Resources' / name).exists(), name
with archive.open('rb') as f:
    digest = hashlib.file_digest(f, 'sha256').hexdigest()
receipt = dict(identity, archive=archive.name, bytes=archive.stat().st_size, sha256=digest,
               archiveRoundTrip='verified', applicationJourney='separate required gate')
(archive.parent / 'NativeArchiveReceipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
(archive.parent / (archive.name + '.sha256')).write_text(digest + '  ' + archive.name + '\n')
print(json.dumps(receipt, indent=2))
PY
