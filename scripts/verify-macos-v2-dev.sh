#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_BUNDLE="${ROOT_DIR}/build/macos/v2-dev/Drift V2 Dev.app"

exec bash "${ROOT_DIR}/scripts/verify-macos-app.sh" "${APP_BUNDLE}"
