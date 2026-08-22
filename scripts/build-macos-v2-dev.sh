#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DRIFT_MACOS_APP_VARIANT="v2-dev"
export DRIFT_MACOS_OUTPUT_DIR="${ROOT_DIR}/build/macos/v2-dev"

exec bash "${ROOT_DIR}/scripts/build-macos-app.sh"
