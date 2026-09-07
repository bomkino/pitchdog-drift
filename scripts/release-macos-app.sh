#!/bin/bash
# Build and verify Developer ID evidence without publishing any GitHub release.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
[[ "${1:-}" == --notarize && $# == 1 ]] || { echo 'Use --notarize; signed-release checks cannot be skipped.' >&2; exit 1; }
[[ "${DRIFT_MACOS_SIGN_IDENTITY:-}" == 'Developer ID Application:'* ]] || { echo 'A real Developer ID Application identity is required.' >&2; exit 1; }
[[ -z "$(git status --porcelain --untracked-files=all)" ]]
[[ ! -e build/release && ! -e build/native-release ]]
mkdir -p build/release
npm ci
npm run check
python3 scripts/generate-native-fixtures.py
export DRIFT_SOURCE_REVISION="$(git rev-parse HEAD)"
bash scripts/build-native-app.sh
xcrun swift test --package-path macos/NativeCore
ditto -c -k --sequesterRsrc --keepParent build/native/Drift.app build/release/Drift-notary.zip
bash scripts/notarize-native.sh build/release/Drift-notary.zip build/release/notary-app.json
xcrun stapler staple build/native/Drift.app
xcrun stapler validate build/native/Drift.app
spctl --assess --type execute build/native/Drift.app
bash scripts/package-native-app.sh
python3 scripts/run-native-ui-proof.py build/native-roundtrip/Drift.app
bash scripts/package-macos-dmg.sh
cp build/native-release/MacReleaseReceipt.json build/release/ReleaseManifest.json
cp build/native-release/*.sha256 build/release/SHA256SUMS.txt
printf 'Verified Developer ID native installer; not published.\n'
