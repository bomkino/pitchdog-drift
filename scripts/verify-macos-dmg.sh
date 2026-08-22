#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${DRIFT_MACOS_OUTPUT_DIR:-$ROOT/build/macos}"
PACKAGE_VERSION="$(node -p "require('$ROOT/package.json').version")"
APP_PATH="${DRIFT_MACOS_APP_PATH:-$OUTPUT_DIR/Drift.app}"
DMG_PATH="${1:-${DRIFT_DMG_OUTPUT:-$OUTPUT_DIR/Drift-${PACKAGE_VERSION}-macOS-universal.dmg}}"
CHECKSUM_PATH="${2:-${DMG_PATH}.sha256}"
MOUNT_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/drift-local-dmg-verify.XXXXXX")"
DEVICE=""

fail() {
  echo "verify-dmg(mac): $*" >&2
  exit 1
}

cleanup() {
  if [[ -n "$DEVICE" ]]; then
    hdiutil detach "$DEVICE" -quiet || hdiutil detach "$DEVICE" -force -quiet || true
  fi
  rm -rf "$MOUNT_ROOT"
}
trap cleanup EXIT

[[ "$(uname -s)" == "Darwin" ]] || fail "local DMG verification must run on macOS"
for command in hdiutil node plutil python3 readlink; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done
[[ -f "$DMG_PATH" ]] || fail "disk image is missing: $DMG_PATH"
[[ -f "$CHECKSUM_PATH" ]] || fail "disk-image checksum is missing: $CHECKSUM_PATH"

python3 - "$DMG_PATH" "$CHECKSUM_PATH" <<'PY'
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

dmg = Path(sys.argv[1]).resolve()
checksum = Path(sys.argv[2]).resolve()
lines = checksum.read_text(encoding="utf-8").splitlines()
if len(lines) != 1:
    raise SystemExit("verify-dmg(mac): checksum file must contain exactly one entry")
match = re.fullmatch(r"([0-9a-f]{64})  ([^/]+)", lines[0])
if match is None:
    raise SystemExit("verify-dmg(mac): checksum entry must use lowercase SHA-256 and one plain basename")
expected_digest, filename = match.groups()
if filename != dmg.name or Path(filename).name != filename:
    raise SystemExit("verify-dmg(mac): checksum entry does not name the requested disk image")
digest = hashlib.sha256()
with dmg.open("rb") as stream:
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        digest.update(chunk)
if digest.hexdigest() != expected_digest:
    raise SystemExit("verify-dmg(mac): requested disk-image checksum does not match")
PY
hdiutil verify "$DMG_PATH"

ATTACH_OUTPUT="$(hdiutil attach "$DMG_PATH" -readonly -nobrowse -mountpoint "$MOUNT_ROOT")"
DEVICE="$(awk '/^\/dev\// {print $1; exit}' <<<"$ATTACH_OUTPUT")"
[[ -n "$DEVICE" ]] || fail "disk image mounted without a readable device identifier"
[[ -d "$MOUNT_ROOT/Drift.app" ]] || fail "disk image does not contain Drift.app"
[[ -L "$MOUNT_ROOT/Applications" ]] || fail "disk image does not contain the Applications alias"
[[ "$(readlink "$MOUNT_ROOT/Applications")" == "/Applications" ]] || fail "Applications alias points somewhere unexpected"
[[ -s "$MOUNT_ROOT/Install Drift.txt" ]] || fail "install/privacy note is missing"

grep -q 'not a notarized public release' "$MOUNT_ROOT/Install Drift.txt" \
  || fail "local-only distribution boundary is absent from the install note"
grep -q 'AudioToolbox' "$MOUNT_ROOT/Install Drift.txt" \
  || fail "install note does not describe the native AudioToolbox AAC path"
grep -q 'WKWebView' "$MOUNT_ROOT/Install Drift.txt" \
  || fail "install note does not describe the H.264 capability boundary"
MOUNTED_SOURCE_REVISION="$(plutil -extract DriftSourceRevision raw -o - "$MOUNT_ROOT/Drift.app/Contents/Info.plist")"
grep -Fq "https://github.com/bomkino/pitchdog-drift/tree/${MOUNTED_SOURCE_REVISION}" "$MOUNT_ROOT/Install Drift.txt" \
  || fail "install note does not link the exact packaged source revision"
if grep -q 'WebKit runtime exposes a compatible system AAC encoder' "$MOUNT_ROOT/Install Drift.txt"; then
  fail "install note still describes the deleted WebKit AAC design"
fi

"$ROOT/scripts/verify-macos-app.sh" "$MOUNT_ROOT/Drift.app"

[[ -d "$APP_PATH" ]] || fail "frozen source app is missing for exact DMG comparison: $APP_PATH"
python3 - "$APP_PATH" "$MOUNT_ROOT/Drift.app" <<'PY'
from __future__ import annotations

import hashlib
import os
import stat
import sys
from pathlib import Path

source = Path(sys.argv[1]).resolve()
mounted = Path(sys.argv[2]).resolve()

def inventory(root: Path) -> dict[str, tuple[str, int, str]]:
    result: dict[str, tuple[str, int, str]] = {}
    candidates = [root, *sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix())]
    for candidate in candidates:
        relative = "." if candidate == root else candidate.relative_to(root).as_posix()
        mode = stat.S_IMODE(candidate.lstat().st_mode)
        if candidate.is_symlink():
            result[relative] = ("symlink", mode, os.readlink(candidate))
        elif candidate.is_dir():
            result[relative] = ("directory", mode, "")
        elif candidate.is_file():
            digest = hashlib.sha256()
            with candidate.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
            result[relative] = ("file", mode, digest.hexdigest())
        else:
            raise SystemExit(f"verify-dmg(mac): unsupported app entry: {relative}")
    return result

if inventory(source) != inventory(mounted):
    raise SystemExit("verify-dmg(mac): mounted disk image app differs from the frozen source app")
PY

printf 'Local Drift DMG verification passed.\n'
printf '  DMG: %s\n' "$DMG_PATH"
printf '  Checksum: %s\n' "$CHECKSUM_PATH"
printf '  Boundary: verified local evidence; not notarized or published.\n'
