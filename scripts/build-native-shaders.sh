#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo 'An Apple silicon Mac build host is required.' >&2; exit 1; }
command -v glslangValidator >/dev/null && command -v spirv-cross >/dev/null || { echo 'Build tools missing: glslang and spirv-cross.' >&2; exit 1; }
mkdir -p build/native-shaders
find build/native-shaders -maxdepth 1 -type f \( -name '*.air' -o -name '*.metal' -o -name '*.metallib' \) -delete
node scripts/generate-native-shaders.mjs
for SOURCE in build/native-shaders/*.metal; do xcrun -sdk macosx metal -std=metal2.1 -mmacosx-version-min=13.3 -c "$SOURCE" -o "$SOURCE.air"; done
xcrun -sdk macosx metallib build/native-shaders/*.air -o build/native-shaders/Drift.metallib
shasum -a 256 build/native-shaders/Drift.metallib > build/native-shaders/SHA256.txt
