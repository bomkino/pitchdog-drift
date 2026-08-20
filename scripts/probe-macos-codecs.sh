#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/macos/Probes/CodecProbe.swift"
REPORT="${DRIFT_CODEC_REPORT:-$ROOT/build/macos/codec-capabilities.json}"
REQUIRE_MP4="${DRIFT_REQUIRE_NATIVE_MP4:-1}"
TIMEOUT_SECONDS="${DRIFT_CODEC_TIMEOUT:-75}"

fail() {
  echo "probe-codecs(mac): $*" >&2
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "WKWebView capability probing must run on macOS"
[[ -f "$SOURCE" ]] || fail "probe source is missing: $SOURCE"
command -v xcrun >/dev/null 2>&1 || fail "xcrun is unavailable"
command -v node >/dev/null 2>&1 || fail "Node.js is unavailable"

mkdir -p "$(dirname "$REPORT")"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/drift-codec-probe.XXXXXX")"
cleanup() { rm -rf "$TEMP_ROOT"; }
trap cleanup EXIT

# Keep platform imports explicit in the compilation unit. The source itself is
# readable as a WebKit probe; this generated prefix supplies Darwin.exit without
# tying the checked-in file to non-macOS typechecking.
{
  printf 'import Darwin\n'
  cat "$SOURCE"
} > "$TEMP_ROOT/CodecProbe.swift"

xcrun swiftc \
  -parse-as-library \
  -O \
  -framework AppKit \
  -framework WebKit \
  "$TEMP_ROOT/CodecProbe.swift" \
  -o "$TEMP_ROOT/DriftCodecProbe"

rm -f "$REPORT"
set +e
DRIFT_CODEC_REPORT="$REPORT" \
DRIFT_REQUIRE_NATIVE_MP4="$REQUIRE_MP4" \
DRIFT_CODEC_TIMEOUT="$TIMEOUT_SECONDS" \
  "$TEMP_ROOT/DriftCodecProbe"
PROBE_STATUS=$?
set -e

[[ -s "$REPORT" ]] || fail "probe exited with $PROBE_STATUS and produced no JSON report"

node - "$REPORT" "$REQUIRE_MP4" "$PROBE_STATUS" <<'NODE'
const fs = require('node:fs');
const [reportPath, requireMp4Raw, exitRaw] = process.argv.slice(2);
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const requireMp4 = requireMp4Raw === '1';
const exitCode = Number(exitRaw);
const failures = [];

if (report.schemaVersion !== 1) failures.push('unknown report schema');
if (report.webgl2?.available !== true || report.webgl2?.noError !== true) failures.push('WebGL2 render/readback failed');
if (report.png?.available !== true || report.png?.signatureValid !== true || !(report.png?.bytes > 0)) failures.push('PNG canvas encode failed');
if (requireMp4 && report.avc?.encoded !== true) failures.push('actual H.264/AVC frame encode failed');
if (report.ok !== (failures.length === 0)) failures.push('report ok flag contradicts observed evidence');
if ((exitCode === 0) !== (failures.length === 0)) failures.push(`probe exit ${exitCode} contradicts observed evidence`);

console.log('Drift WKWebView capability receipt');
console.log(`  WebGL2: ${report.webgl2?.available === true ? 'yes' : 'no'}`);
console.log(`  PNG: ${report.png?.signatureValid === true ? `yes (${report.png.bytes} bytes)` : 'no'}`);
console.log(`  H.264 API: ${report.avc?.available === true ? 'yes' : 'no'}`);
console.log(`  H.264 actual encode: ${report.avc?.encoded === true ? 'yes' : 'no'}`);
console.log(`  AAC API: ${report.aac?.available === true ? 'yes' : 'no'}`);
console.log(`  AAC actual encode: ${report.aac?.encoded === true ? 'yes' : 'no'}`);
console.log(`  Runtime: ${report.userAgent ?? 'unknown'}`);
console.log(`  Report: ${reportPath}`);

if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
NODE

printf 'WKWebView codec gauntlet passed.\n'
