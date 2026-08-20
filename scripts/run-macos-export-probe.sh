#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE_ROOT="$ROOT/build/macos/export-probe"
REPORT="${DRIFT_EXPORT_PROBE_REPORT:-$ROOT/build/macos/export-probe-result.json}"
TIMEOUT_SECONDS="${DRIFT_EXPORT_PROBE_TIMEOUT:-240}"

fail() {
  echo "export-probe(mac): $*" >&2
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "WKWebView export probing must run on macOS"
command -v xcrun >/dev/null 2>&1 || fail "xcrun is unavailable"
command -v node >/dev/null 2>&1 || fail "Node.js is unavailable"

node "$ROOT/scripts/build-macos-export-probe.mjs"
RECEIPT="$BUNDLE_ROOT/ProbeBundleReceipt.json"
[[ -s "$RECEIPT" ]] || fail "probe bundle receipt is missing"

HTML_RELATIVE="$(node - "$RECEIPT" "$BUNDLE_ROOT" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const [receiptPath, rootPath] = process.argv.slice(2);
const fail = (message) => {
  console.error(`export-probe(bundle): ${message}`);
  process.exit(1);
};

let receipt;
try {
  receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
} catch (error) {
  fail(`receipt is unreadable: ${error instanceof Error ? error.message : String(error)}`);
}
if (receipt.schemaVersion !== 1 || !Array.isArray(receipt.files)) {
  fail('receipt schema is not supported');
}
if (typeof receipt.html !== 'string' || receipt.html.length === 0) {
  fail('receipt has no HTML entry');
}

const root = fs.realpathSync(rootPath);
const rootPrefix = `${root}${path.sep}`;
const isWithinRoot = (candidate) => candidate === root || candidate.startsWith(rootPrefix);
const seen = new Set();

for (const [index, entry] of receipt.files.entries()) {
  if (!entry || typeof entry !== 'object') fail(`file entry ${index + 1} is malformed`);
  const relativePath = entry.path;
  if (
    typeof relativePath !== 'string'
    || relativePath.length === 0
    || path.isAbsolute(relativePath)
    || relativePath.split(/[\\/]+/).includes('..')
    || seen.has(relativePath)
  ) {
    fail(`file entry ${index + 1} has an unsafe or duplicate path`);
  }
  seen.add(relativePath);
  const candidate = path.resolve(root, relativePath);
  if (!isWithinRoot(candidate)) fail(`${relativePath} escapes the bundle root`);
  let realCandidate;
  try {
    realCandidate = fs.realpathSync(candidate);
  } catch {
    fail(`${relativePath} is missing`);
  }
  if (!isWithinRoot(realCandidate)) fail(`${relativePath} resolves outside the bundle root`);
  const metadata = fs.statSync(realCandidate);
  if (!metadata.isFile()) fail(`${relativePath} is not a regular file`);
  if (!Number.isSafeInteger(entry.bytes) || metadata.size !== entry.bytes) {
    fail(`${relativePath} changed size after its receipt was written`);
  }
  if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
    fail(`${relativePath} has no valid SHA-256 receipt`);
  }
  const observed = crypto.createHash('sha256').update(fs.readFileSync(realCandidate)).digest('hex');
  if (observed !== entry.sha256) fail(`${relativePath} changed bytes after its receipt was written`);
}

if (!seen.has(receipt.html)) fail('HTML entry is not covered by the file receipt');
process.stdout.write(receipt.html);
NODE
)"
HTML_PATH="$BUNDLE_ROOT/$HTML_RELATIVE"
[[ -s "$HTML_PATH" ]] || fail "probe HTML is missing: $HTML_PATH"

TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/drift-export-probe.XXXXXX")"
cleanup() { rm -rf "$TEMP_ROOT"; }
trap cleanup EXIT

{
  printf 'import Darwin\n'
  sed 's/^let probe = ExportProbe()/private let probe = ExportProbe()/' "$ROOT/macos/Probes/ExportProbe.swift"
} > "$TEMP_ROOT/main.swift"

xcrun swiftc \
  -O \
  -framework AppKit \
  -framework WebKit \
  "$TEMP_ROOT/main.swift" \
  -o "$TEMP_ROOT/DriftExportProbe"

rm -f "$REPORT"
set +e
DRIFT_EXPORT_PROBE_HTML="$HTML_PATH" \
DRIFT_EXPORT_PROBE_ROOT="$BUNDLE_ROOT" \
DRIFT_EXPORT_PROBE_REPORT="$REPORT" \
DRIFT_EXPORT_PROBE_TIMEOUT="$TIMEOUT_SECONDS" \
  "$TEMP_ROOT/DriftExportProbe"
PROBE_STATUS=$?
set -e

[[ -s "$REPORT" ]] || fail "export probe exited with $PROBE_STATUS and produced no JSON report"

node - "$REPORT" "$PROBE_STATUS" <<'NODE'
const fs = require('node:fs');
const [reportPath, exitRaw] = process.argv.slice(2);
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const exitCode = Number(exitRaw);

if (report.schemaVersion !== 1 || report.ok !== true || exitCode !== 0) {
  console.error(
    `WKWebView deterministic export failed in ${report.phase ?? 'unknown phase'}: `
    + `${report.error?.message ?? `process exited with ${exitCode}`}`,
  );
  console.error(JSON.stringify({
    phase: report.phase ?? null,
    error: report.error ?? null,
    nativeHarness: report.nativeHarness ?? null,
  }, null, 2));
  process.exit(1);
}

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(report.nativeHarness?.finishedNavigation === true, 'WKWebView never finished the probe navigation');
expect(report.nativeHarness?.progressEventCount > 0, 'probe emitted no native progress events');
expect(typeof report.nativeHarness?.readAccessRoot === 'string', 'probe did not record its WebKit read-access root');

expect(report.mp4?.bytes > 1_000, 'MP4 is empty or implausibly small');
const mp4Prefix = report.mp4?.prefix ?? [];
expect(String.fromCharCode(...mp4Prefix.slice(4, 8)) === 'ftyp', 'MP4 has no ftyp signature');
expect(report.mp4?.width === 320 && report.mp4?.height === 568, 'MP4 dimensions changed');
expect(report.mp4?.fps === 30, 'MP4 frame rate changed');
expect(report.mp4?.frameCount === 90, 'MP4 frame count changed');
expect(Math.abs((report.mp4?.duration ?? 0) - 3) < 0.001, 'MP4 duration left the fixed timeline');
expect(report.mp4?.videoCodec === 'avc', 'MP4 codec is not AVC');
expect(report.mp4?.audio === null, 'muted exporter probe unexpectedly created audio');
expect(report.mp4?.verification?.verified === true, 'MP4 readback did not verify');
expect(report.mp4?.verification?.container === 'mp4', 'MP4 readback found the wrong container');
expect(report.mp4?.verification?.videoCodec === 'avc', 'MP4 readback found the wrong codec');
expect(report.mp4?.verification?.frameCount === 90, 'MP4 readback found the wrong frame count');
expect(report.mp4?.verification?.decodedProbeFrames === 3, 'MP4 did not decode first/middle/final probes');
expect(report.mp4?.verification?.opaque === true, 'H.264 output unexpectedly claims alpha');
expect(report.mp4?.verification?.audio === null, 'verified muted output unexpectedly contains audio');

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
expect(report.png?.bytes > 100, 'PNG is empty or implausibly small');
expect(pngSignature.every((value, index) => report.png?.prefix?.[index] === value), 'PNG signature is invalid');
expect(report.png?.width === 320 && report.png?.height === 568, 'PNG dimensions changed');
expect(report.png?.hasAlphaChannel === true, 'PNG has no alpha-capable channel');
expect(report.png?.hasTransparentPixels === true, 'PNG contains no usable transparent pixels');

console.log('Drift WKWebView deterministic-export receipt');
console.log(`  MP4: ${report.mp4?.bytes ?? 0} bytes, ${report.mp4?.frameCount ?? 0} frames`);
console.log(`  MP4 decode probes: ${report.mp4?.verification?.decodedProbeFrames ?? 0}`);
console.log(`  PNG: ${report.png?.bytes ?? 0} bytes, alpha=${report.png?.hasTransparentPixels === true}`);
console.log(`  Native progress events: ${report.nativeHarness?.progressEventCount ?? 0}`);
console.log(`  Runtime: ${report.userAgent ?? 'unknown'}`);
console.log(`  Elapsed: ${report.elapsedMs ?? 'unknown'} ms`);
console.log(`  Report: ${reportPath}`);

if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
NODE

printf 'WKWebView deterministic-export gauntlet passed.\n'
