#!/bin/bash
# Verify native bundle identity and runtime closure; UI proof is a separate gate.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-$ROOT/build/native-roundtrip/Drift.app}"
SOURCE="${DRIFT_SOURCE_REVISION:-$(git -C "$ROOT" rev-parse HEAD)}"
[[ -d "$APP" && ! -L "$APP" && -x "$APP/Contents/MacOS/Drift" ]]
codesign --verify --deep --strict "$APP"
[[ "$(lipo -archs "$APP/Contents/MacOS/Drift")" == arm64 ]]
if otool -L "$APP/Contents/MacOS/Drift" | grep -E 'WebKit|JavaScriptCore|/opt/homebrew|/usr/local'; then
  echo 'Unexpected runtime dependency.' >&2; exit 1
fi
APP="$APP" SOURCE="$SOURCE" python3 - <<'PY'
import json, os, pathlib, plistlib
app = pathlib.Path(os.environ['APP']); resources = app / 'Contents/Resources'
info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
identity = json.loads((resources / 'BuildIdentity.json').read_text())
assert info['CFBundleIdentifier'] == 'dog.pitch.drift'
assert info['DriftRuntime'] == identity['runtime'] == 'native'
assert info['DriftSourceRevision'] == identity['source'] == os.environ['SOURCE']
assert info['CFBundleShortVersionString'] == identity['version']
assert info['CFBundleVersion'] == identity['build']
assert info['LSMinimumSystemVersion'] == identity['minimumMacOS'] == '13.3'
for name in ('Drift.icns','Drift.metallib','ShaderSchema.json','CreativeCatalog.json','Sound','ThirdPartyNotices','LICENSE','NOTICE','ASSET-LICENSE.md','docs/MACOS_USER_GUIDE.md'):
    assert (resources / name).exists(), name
for path in app.rglob('*'):
    assert path.suffix.lower() not in ('.js','.html','.wasm'), 'Unexpected web runtime resource: ' + str(path)
print('Verified native app:', identity['version'], identity['build'], identity['source'])
PY
