#!/bin/bash
# Optional Developer ID lane only. Never infer notarization from signing.
set -euo pipefail
TARGET="${1:?Pass the signed archive or DMG}"; REPORT="${2:?Pass a new JSON report path}"
[[ ! -e "$REPORT" ]]
AUTH=()
if [[ -n "${APPLE_NOTARY_PROFILE:-}" ]]; then
  AUTH=(--keychain-profile "$APPLE_NOTARY_PROFILE")
elif [[ -n "${APPLE_NOTARY_KEY_PATH:-}" && -n "${APPLE_NOTARY_KEY_ID:-}" && -n "${APPLE_NOTARY_ISSUER_ID:-}" ]]; then
  AUTH=(--key "$APPLE_NOTARY_KEY_PATH" --key-id "$APPLE_NOTARY_KEY_ID" --issuer "$APPLE_NOTARY_ISSUER_ID")
else
  echo 'Developer ID distribution requires notarization credentials.' >&2; exit 1
fi
xcrun notarytool submit "$TARGET" "${AUTH[@]}" --wait --output-format json > "$REPORT"
[[ "$(plutil -extract status raw -o - "$REPORT")" == Accepted ]]
