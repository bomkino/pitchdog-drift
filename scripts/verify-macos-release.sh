#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RECEIPT="$ROOT/build/native-release/MacReleaseReceipt.json"
[[ "$(plutil -extract signing raw -o - "$RECEIPT")" == 'Developer ID' && "$(plutil -extract notarized raw -o - "$RECEIPT")" == true ]]
VERSION=$(plutil -extract version raw -o - "$RECEIPT")
bash "$ROOT/scripts/verify-macos-dmg.sh" "$ROOT/build/native-release/Drift-$VERSION-macOS-arm64.dmg" "$ROOT/build/native-release/Drift-$VERSION-macOS-arm64.dmg.sha256"
