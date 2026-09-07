#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)";cd "$ROOT"
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo 'Build on an Apple silicon Mac.' >&2; exit 1; }
VERSION="${DRIFT_VERSION:-$(node -p 'JSON.parse(require("fs").readFileSync("package.json")).version')}"
SIGNING="${DRIFT_MACOS_SIGN_IDENTITY:--}"
[[ "$SIGNING" == - || "$SIGNING" == "Developer ID Application:"* ]] || { echo "Only ad-hoc or Developer ID Application signing is supported." >&2; exit 1; }
BUILD="${DRIFT_BUILD_NUMBER:-1}"
SOURCE="${DRIFT_SOURCE_REVISION:-$(git rev-parse HEAD)}"
export MACOSX_DEPLOYMENT_TARGET=13.3
node scripts/generate-native-catalog.mjs
node scripts/generate-native-sound.mjs
scripts/build-native-codecs.sh
scripts/build-native-archive.sh
scripts/build-native-shaders.sh
DRIFT_BUILD_APP=1 xcrun swift build --package-path macos/NativeCore -c release --product Drift
BIN="$(DRIFT_BUILD_APP=1 xcrun swift build --package-path macos/NativeCore -c release --show-bin-path)"
APP="$ROOT/build/native/Drift.app"
rm -rf "$APP";mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN/Drift" "$APP/Contents/MacOS/Drift"
cp build/native-shaders/Drift.metallib build/native-shaders/ShaderSchema.json "$APP/Contents/Resources/"
cp macos/NativeCore/Sources/DriftCore/Resources/CreativeCatalog.json "$APP/Contents/Resources/"
ditto build/native-sound "$APP/Contents/Resources/Sound"
ditto build/native-codecs/licenses "$APP/Contents/Resources/ThirdPartyNotices"
cp LICENSE NOTICE ASSET-LICENSE.md THIRD_PARTY_NOTICES.md TRADEMARKS.md "$APP/Contents/Resources/"
mkdir -p "$APP/Contents/Resources/docs"
cp docs/MACOS_USER_GUIDE.md docs/MACOS_RELEASE.md docs/ARCHITECTURE.md "$APP/Contents/Resources/docs/"
if [[ -d build/native-fixtures ]];then ditto build/native-fixtures "$APP/Contents/Resources/Fixtures";fi
ICONSET="$ROOT/build/native/Drift.iconset"
python3 scripts/generate-macos-icon.py "$ICONSET"
xcrun iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/Drift.icns"
test -f "$APP/Contents/Resources/Drift.icns"
APP="$APP" VERSION="$VERSION" BUILD="$BUILD" SOURCE="$SOURCE" SIGNING="$SIGNING" python3 - <<'PY'
import os,plistlib,pathlib
app=pathlib.Path(os.environ['APP']);version=os.environ['VERSION'];build=os.environ['BUILD'];source=os.environ['SOURCE']
info={'CFBundleIdentifier':'dog.pitch.drift','CFBundleName':'Drift','CFBundleDisplayName':'Drift','CFBundleExecutable':'Drift','CFBundlePackageType':'APPL','CFBundleShortVersionString':version,'CFBundleVersion':build,'CFBundleIconFile':'Drift','LSMinimumSystemVersion':'13.3','NSHighResolutionCapable':True,'NSSupportsAutomaticGraphicsSwitching':True,'NSPrincipalClass':'NSApplication','NSHumanReadableCopyright':'Copyright © pitch.dog. AGPL-3.0-or-later; third-party notices included.','DriftSourceRevision':source,'DriftRuntime':'native','CFBundleDocumentTypes':[{'CFBundleTypeName':'Drift Project','CFBundleTypeRole':'Editor','LSHandlerRank':'Owner','LSItemContentTypes':['dog.pitch.drift.native-document'],'NSDocumentClass':'DriftNativeDocument','CFBundleTypeExtensions':['pitched']}],'UTExportedTypeDeclarations':[{'UTTypeIdentifier':'dog.pitch.drift.native-document','UTTypeDescription':'Drift Project','UTTypeConformsTo':['public.data','public.archive'],'UTTypeTagSpecification':{'public.filename-extension':['pitched'],'public.mime-type':['application/vnd.pitchdog.pitched+zip']}}]}
(app/'Contents/Info.plist').write_bytes(plistlib.dumps(info,sort_keys=True))
(app/'Contents/Resources/BuildIdentity.json').write_text(__import__('json').dumps({'source':source,'version':version,'build':build,'architecture':'arm64','minimumMacOS':'13.3','runtime':'native','signed':'ad-hoc' if os.environ['SIGNING']=='-' else 'Developer ID','notarization':'verify distributed app staple'},indent=2)+'\n')
PY
codesign --force --deep --options runtime --sign "$SIGNING" "$APP"
codesign --verify --deep --strict "$APP"
[[ "$(lipo -archs "$APP/Contents/MacOS/Drift")" == arm64 ]]
if otool -L "$APP/Contents/MacOS/Drift" | grep -E 'WebKit|JavaScriptCore|/opt/homebrew|/usr/local';then echo 'Unexpected runtime dependency' >&2;exit 1;fi
if find "$APP" -type f \( -name '*.js' -o -name '*.html' -o -name '*.wasm' \) -print | grep -q .; then echo 'Unexpected web runtime resource' >&2; exit 1; fi
printf 'Native app built: %s\n' "$APP"
