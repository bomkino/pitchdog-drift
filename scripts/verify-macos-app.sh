#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_BUNDLE="${1:-${DRIFT_MACOS_OUTPUT_DIR:-${ROOT_DIR}/build/macos}/Drift.app}"
EXECUTABLE="${APP_BUNDLE}/Contents/MacOS/Drift"
INFO_PLIST="${APP_BUNDLE}/Contents/Info.plist"
RESOURCES="${APP_BUNDLE}/Contents/Resources"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/drift-macos-verify.XXXXXX")"
trap 'rm -rf "${TEMP_DIR}"' EXIT

fail() {
  echo "Drift.app verification failed: $*" >&2
  exit 1
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "bundle verification requires macOS."
fi

for command in codesign iconutil lipo node open otool plutil python3; do
  command -v "${command}" >/dev/null 2>&1 || fail "missing required command ${command}."
done

for path in \
  "${INFO_PLIST}" \
  "${EXECUTABLE}" \
  "${RESOURCES}/NativeBridge.js" \
  "${RESOURCES}/Web/index.html" \
  "${RESOURCES}/Drift.icns" \
  "${RESOURCES}/DriftDocument.icns" \
  "${RESOURCES}/BuildReceipt.txt" \
  "${RESOURCES}/BuildManifest.txt" \
  "${RESOURCES}/Legal/LICENSE" \
  "${RESOURCES}/Legal/NOTICE" \
  "${RESOURCES}/Legal/ASSET-LICENSE.md" \
  "${RESOURCES}/Legal/THIRD_PARTY_NOTICES.md" \
  "${RESOURCES}/Legal/TRADEMARKS.md" \
  "${RESOURCES}/Documentation/MACOS_APP.md" \
  "${RESOURCES}/Documentation/MACOS_PRODUCT_CONTRACT.md" \
  "${RESOURCES}/Documentation/MACOS_USER_GUIDE.md" \
  "${RESOURCES}/Documentation/MACOS_QA.md" \
  "${RESOURCES}/Documentation/MACOS_THREAT_MODEL.md" \
  "${RESOURCES}/Documentation/MACOS_RELEASE.md" \
  "${RESOURCES}/Documentation/MACOS_RELEASE_CHECKLIST.md"; do
  [[ -f "${path}" ]] || fail "missing app-bundle file ${path}."
done
[[ -x "${EXECUTABLE}" ]] || fail "the main executable is not executable."
[[ -s "${RESOURCES}/DriftDocument.icns" ]] || fail "the .pitched document icon is empty."

plutil -lint "${INFO_PLIST}" >/dev/null
[[ "$(plutil -extract CFBundleIdentifier raw -o - "${INFO_PLIST}")" == "dog.pitch.drift" ]] \
  || fail "unexpected bundle identifier."
[[ "$(plutil -extract DriftNativeBridgeVersion raw -o - "${INFO_PLIST}")" == "2" ]] \
  || fail "Info.plist and bridge version disagree."
[[ "$(plutil -extract LSMinimumSystemVersion raw -o - "${INFO_PLIST}")" == "13.3" ]] \
  || fail "the packaged minimum macOS version is not 13.3."
INFO_DUMP="$(plutil -p "${INFO_PLIST}")"
grep -F 'dog.pitch.pitched-project' <<<"${INFO_DUMP}" >/dev/null \
  || fail "the .pitched document type is missing."
grep -F 'UTExportedTypeDeclarations' <<<"${INFO_DUMP}" >/dev/null \
  || fail "the app does not export its .pitched type declaration."
python3 - "${INFO_PLIST}" <<'PY'
from __future__ import annotations

import plistlib
import sys
from pathlib import Path

path = Path(sys.argv[1])
with path.open("rb") as stream:
    info = plistlib.load(stream)

document_types = info.get("CFBundleDocumentTypes")
if not isinstance(document_types, list):
    raise SystemExit("Drift.app verification failed: CFBundleDocumentTypes is missing or malformed.")
matching_documents = [
    item for item in document_types
    if isinstance(item, dict)
    and "dog.pitch.pitched-project" in item.get("LSItemContentTypes", [])
]
if len(matching_documents) != 1:
    raise SystemExit("Drift.app verification failed: .pitched must have exactly one document declaration.")
if matching_documents[0].get("CFBundleTypeIconFile") != "DriftDocument":
    raise SystemExit("Drift.app verification failed: .pitched document declaration does not use DriftDocument.icns.")

exported_types = info.get("UTExportedTypeDeclarations")
if not isinstance(exported_types, list):
    raise SystemExit("Drift.app verification failed: UTExportedTypeDeclarations is missing or malformed.")
matching_utis = [
    item for item in exported_types
    if isinstance(item, dict)
    and item.get("UTTypeIdentifier") == "dog.pitch.pitched-project"
]
if len(matching_utis) != 1 or matching_utis[0].get("UTTypeIconFile") != "DriftDocument":
    raise SystemExit("Drift.app verification failed: exported .pitched UTI does not use DriftDocument.icns.")
PY

DOCUMENT_ICONSET="${TEMP_DIR}/DriftDocument.iconset"
iconutil -c iconset "${RESOURCES}/DriftDocument.icns" -o "${DOCUMENT_ICONSET}"
python3 - "${DOCUMENT_ICONSET}" <<'PY'
from __future__ import annotations

import struct
import sys
from pathlib import Path

root = Path(sys.argv[1])
required = {
    "icon_16x16.png": 16,
    "icon_16x16@2x.png": 32,
    "icon_32x32.png": 32,
    "icon_32x32@2x.png": 64,
    "icon_128x128.png": 128,
    "icon_128x128@2x.png": 256,
    "icon_256x256.png": 256,
    "icon_256x256@2x.png": 512,
    "icon_512x512.png": 512,
    "icon_512x512@2x.png": 1024,
}
for name, expected_size in required.items():
    path = root / name
    if not path.is_file():
        raise SystemExit(f"Drift.app verification failed: document iconset is missing {name}.")
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise SystemExit(f"Drift.app verification failed: {name} is not a readable PNG.")
    width, height, bit_depth, color_type = struct.unpack(">IIBB", data[16:26])
    if (width, height) != (expected_size, expected_size):
        raise SystemExit(
            f"Drift.app verification failed: {name} is {width}x{height}, expected {expected_size}x{expected_size}."
        )
    if bit_depth != 8 or color_type != 6:
        raise SystemExit(
            f"Drift.app verification failed: {name} must be 8-bit RGBA, got bit depth {bit_depth}, color type {color_type}."
        )
PY

codesign --verify --deep --strict --all-architectures --verbose=2 "${APP_BUNDLE}"
SIGNATURE="${TEMP_DIR}/signature.txt"
codesign -dv --verbose=4 "${APP_BUNDLE}" 2>"${SIGNATURE}"
grep -Eq 'flags=.*runtime' "${SIGNATURE}" || fail "hardened runtime is not present in the signature."

ENTITLEMENTS="${TEMP_DIR}/entitlements.plist"
ENTITLEMENTS_DIAGNOSTICS="${TEMP_DIR}/entitlements.stderr"
if ! codesign -d --entitlements :- "${APP_BUNDLE}" >"${ENTITLEMENTS}" 2>"${ENTITLEMENTS_DIAGNOSTICS}"; then
  cat "${ENTITLEMENTS_DIAGNOSTICS}" >&2
  fail "codesign could not extract the app entitlements."
fi
plutil -lint "${ENTITLEMENTS}" >/dev/null || {
  cat "${ENTITLEMENTS_DIAGNOSTICS}" >&2
  fail "codesign returned an unreadable entitlement plist."
}
python3 - "${ENTITLEMENTS}" <<'PY'
from __future__ import annotations

import plistlib
import sys
from pathlib import Path

path = Path(sys.argv[1])
with path.open("rb") as stream:
    entitlements = plistlib.load(stream)

required = {
    "com.apple.security.app-sandbox": True,
    "com.apple.security.files.user-selected.read-write": True,
}
for key, expected in required.items():
    if entitlements.get(key) is not expected:
        raise SystemExit(f"Drift.app verification failed: signed entitlement {key!r} is missing or not true.")

for key in entitlements:
    if key.startswith("com.apple.security.network."):
        raise SystemExit(f"Drift.app verification failed: network entitlement {key!r} is forbidden.")

for key in (
    "com.apple.security.cs.disable-library-validation",
    "com.apple.security.cs.allow-unsigned-executable-memory",
    "com.apple.security.cs.allow-jit",
    "com.apple.security.cs.allow-dyld-environment-variables",
):
    if entitlements.get(key):
        raise SystemExit(f"Drift.app verification failed: dangerous hardened-runtime exception {key!r} is enabled.")
PY

actual_archs="$(lipo -archs "${EXECUTABLE}" | tr ' ' '\n' | sed '/^$/d' | sort | tr '\n' ' ' | sed 's/ $//')"
expected_archs="$(printf '%s\n' ${DRIFT_EXPECT_ARCHS:-arm64 x86_64} | sort | tr '\n' ' ' | sed 's/ $//')"
[[ "${actual_archs}" == "${expected_archs}" ]] \
  || fail "architectures are ${actual_archs}; expected ${expected_archs}."

# Universal binaries produce one unindented header per architecture. Only
# indented rows are dependencies; parsing every first field mistakes the second
# architecture header for a dylib path.
LINKED_LIBRARIES="${TEMP_DIR}/linked-libraries.txt"
otool -L "${EXECUTABLE}" | awk '/^[[:space:]]/ {print $1}' | sort -u >"${LINKED_LIBRARIES}"
while IFS= read -r library; do
  case "${library}" in
    /System/Library/*|/usr/lib/*) ;;
    *) fail "non-system dynamic library linked into Drift: ${library}" ;;
  esac
done <"${LINKED_LIBRARIES}"
grep -F '/System/Library/Frameworks/AudioToolbox.framework/' "${LINKED_LIBRARIES}" >/dev/null \
  || fail "native AAC source is present but AudioToolbox is not linked into the executable."
grep -F '/System/Library/Frameworks/WebKit.framework/' "${LINKED_LIBRARIES}" >/dev/null \
  || fail "the packaged application is not linked against WebKit."

if grep -Eq '(src|href)="/assets/' "${RESOURCES}/Web/index.html"; then
  fail "bundled HTML contains root-absolute Vite assets."
fi
grep -F 'DRIFT_NATIVE_BRIDGE_VERSION = 2' "${RESOURCES}/NativeBridge.js" >/dev/null \
  || fail "native bridge version marker is missing."
node --check "${RESOURCES}/NativeBridge.js"
if [[ -n "$(find "${RESOURCES}/Web" -type f \( -name '*.wasm' -o -name '*.map' \) -print -quit)" ]]; then
  fail "the standalone web bundle contains a WASM binary or source map."
fi
web_codec_markers="$(grep -RIlE 'libavcodec|ffmpeg-core|@mediabunny/aac-encoder' "${RESOURCES}/Web" --include='*.js' || true)"
if [[ -n "${web_codec_markers}" ]]; then
  fail "the standalone web bundle still contains a software AAC/FFmpeg marker: ${web_codec_markers}"
fi

python3 - "${RESOURCES}" <<'PY'
from __future__ import annotations

import hashlib
import sys
from pathlib import Path, PurePosixPath

root = Path(sys.argv[1]).resolve()
manifest = root / "BuildManifest.txt"
observed: dict[str, str] = {}
for line_number, line in enumerate(manifest.read_text(encoding="utf-8").splitlines(), start=1):
    try:
        digest, relative = line.split("  ", 1)
    except ValueError as error:
        raise SystemExit(f"malformed resource manifest line {line_number}") from error
    path = PurePosixPath(relative)
    if path.is_absolute() or ".." in path.parts or relative in observed:
        raise SystemExit(f"unsafe or duplicate manifest path: {relative}")
    observed[relative] = digest

actual = {
    path.relative_to(root).as_posix()
    for path in root.rglob("*")
    if path.is_file() and path != manifest
}
if set(observed) != actual:
    missing = sorted(actual - set(observed))
    unexpected = sorted(set(observed) - actual)
    raise SystemExit(f"resource manifest set mismatch; missing={missing}, unexpected={unexpected}")

for relative, expected in observed.items():
    path = root / relative
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != expected:
        raise SystemExit(f"resource digest mismatch: {relative}")
PY

grep -Fx "app_name=Drift" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has no app identity."
grep -Fx "minimum_macos=13.3" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has the wrong deployment target."
grep -Fx "codec_policy=system-frameworks-only" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has the wrong codec policy."
grep -Fx "video_codec=WKWebView-H264-capability-gated" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt misstates the video path."
grep -Fx "audio_codec=AudioToolbox-Apple-software-AAC-LC" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt misstates the presenter-audio path."
grep -Fx "document_icon=DriftDocument.icns" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt omits the .pitched document icon."
grep -Fx "network_entitlement=none" "${RESOURCES}/BuildReceipt.txt" >/dev/null || fail "build receipt has the wrong network policy."

if [[ -n "$(find "${APP_BUNDLE}" -type f -perm -0002 -print -quit)" ]]; then
  fail "the app bundle contains a world-writable file."
fi

"${EXECUTABLE}" --smoke-test
"${EXECUTABLE}" --native-self-test

# A sandboxed GUI application is not faithfully exercised by invoking its Mach-O
# directly from a shell. LaunchServices supplies the application/container/
# WindowServer bootstrap that users actually receive. The app writes a bounded
# receipt inside its own container; this verifier treats that receipt—not the
# `open` command's exit code—as the authoritative result.
RECEIPT_NAME="webview-self-test-$(date +%s)-${PPID}-${RANDOM}.json"
python3 - "${APP_BUNDLE}" "${RECEIPT_NAME}" <<'PY'
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

app = Path(sys.argv[1]).resolve()
receipt_name = sys.argv[2]
home = Path.home()
roots = [
    home / "Library" / "Containers" / "dog.pitch.drift" / "Data" / "Library" / "Caches" / "Drift" / "SelfTests",
    home / "Library" / "Caches" / "Drift" / "SelfTests",
]
for root in roots:
    candidate = root / receipt_name
    try:
        candidate.unlink()
    except FileNotFoundError:
        pass

command = [
    "open",
    "-W",
    "-n",
    str(app),
    "--args",
    "--webview-self-test",
    f"--webview-self-test-report-name={receipt_name}",
]
try:
    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=90,
    )
except subprocess.TimeoutExpired as error:
    raise SystemExit(f"Drift.app verification failed: LaunchServices WebView self-test timed out: {error}") from error

# The app may terminate with a failing self-test while `open -W` still returns
# zero. Conversely, LaunchServices diagnostics are useful when no receipt was
# written. Poll only for filesystem propagation, never to hide a process crash.
deadline = time.monotonic() + 8
receipt_path: Path | None = None
while time.monotonic() < deadline and receipt_path is None:
    for root in roots:
        candidate = root / receipt_name
        if candidate.is_file():
            receipt_path = candidate
            break
    if receipt_path is None:
        time.sleep(0.1)

if receipt_path is None:
    container = home / "Library" / "Containers" / "dog.pitch.drift"
    if container.is_dir():
        matches = list(container.rglob(receipt_name))
        if len(matches) == 1:
            receipt_path = matches[0]

if receipt_path is None:
    raise SystemExit(
        "Drift.app verification failed: LaunchServices produced no WebView receipt; "
        f"open exit={completed.returncode}; stdout={completed.stdout!r}; stderr={completed.stderr!r}"
    )

try:
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
finally:
    receipt_path.unlink(missing_ok=True)

failures: list[str] = []
def expect(condition: bool, message: str) -> None:
    if not condition:
        failures.append(message)

expect(receipt.get("schemaVersion") == 1, "unknown receipt schema")
expect(receipt.get("ok") is True, str(receipt.get("message") or "packaged WebView self-test failed"))
expect(receipt.get("bundleIdentifier") == "dog.pitch.drift", "receipt has the wrong bundle identifier")
expect(receipt.get("startedNavigation") is True, "packaged WebView never started navigation")
expect(receipt.get("committedNavigation") is True, "packaged WebView never committed navigation")
expect(receipt.get("finishedNavigation") is True, "packaged WebView never finished navigation")
expect(int(receipt.get("contentProcessTerminationCount", 99)) <= 1, "WebKit content process terminated more than once")
expect(receipt.get("saveState") == "saved", "React project state never settled to saved")
expect(receipt.get("projectBusy") is False, "React project operation remained busy")
expect(receipt.get("exportInProgress") is False, "React export remained in progress")

if failures:
    details = "; ".join(failures)
    raise SystemExit(
        "Drift.app verification failed: packaged LaunchServices/WebKit receipt did not hold: "
        f"{details}; receipt={json.dumps(receipt, sort_keys=True)}"
    )

print("Drift packaged WebView self-test passed through LaunchServices.")
PY

printf 'Verified %s\n' "${APP_BUNDLE}"
printf 'Bundle size: %s\n' "$(du -sh "${APP_BUNDLE}" | awk '{print $1}')"
printf 'Architectures: %s\n' "${actual_archs}"
printf 'Document identity: DriftDocument.icns is bound to dog.pitch.pitched-project\n'
printf 'Sandbox: enabled; user-selected read/write only; no network entitlement\n'
printf 'Video: WKWebView H.264, capability-gated and output-verified\n'
printf 'Audio: Apple software AAC-LC through AudioToolbox; no FFmpeg WASM\n'