#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT="${DRIFT_NATIVE_AAC_REPORT:-$ROOT/build/macos/native-aac-capabilities.json}"

fail() {
  echo "probe-native-aac(mac): $*" >&2
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "AudioToolbox AAC probing must run on macOS"
command -v xcrun >/dev/null 2>&1 || fail "xcrun is unavailable"
command -v node >/dev/null 2>&1 || fail "Node.js is unavailable"
[[ -f "$ROOT/macos/App/NativeModels.swift" ]] || fail "NativeModels.swift is missing"
[[ -f "$ROOT/macos/App/NativeAacEncoder.swift" ]] || fail "NativeAacEncoder.swift is missing"

mkdir -p "$(dirname "$REPORT")"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/drift-native-aac-probe.XXXXXX")"
cleanup() { rm -rf "$TEMP_ROOT"; }
trap cleanup EXIT

cat > "$TEMP_ROOT/main.swift" <<'SWIFT'
import Darwin
import Foundation

let reportPath = ProcessInfo.processInfo.environment["DRIFT_NATIVE_AAC_REPORT"]

do {
    var receipt = try NativeAacEncoderBroker.probeReceipt(durationSeconds: 0.125)
    receipt["fileBacked"] = try NativeAacEncoderBroker.fileBackedProbeReceipt()
    let data = try JSONSerialization.data(
        withJSONObject: receipt,
        options: [.prettyPrinted, .sortedKeys]
    )
    if let reportPath {
        let url = URL(fileURLWithPath: reportPath)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try data.write(to: url, options: .atomic)
    }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
    Darwin.exit(0)
} catch {
    let failure: [String: Any] = [
        "schemaVersion": 1,
        "encoded": false,
        "provider": "AudioToolbox",
        "error": [
            "type": String(describing: type(of: error)),
            "message": (error as? BridgeFailure)?.message ?? error.localizedDescription,
        ],
    ]
    if let data = try? JSONSerialization.data(
        withJSONObject: failure,
        options: [.prettyPrinted, .sortedKeys]
    ) {
        if let reportPath {
            let url = URL(fileURLWithPath: reportPath)
            try? FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try? data.write(to: url, options: .atomic)
        }
        FileHandle.standardError.write(data)
        FileHandle.standardError.write(Data("\n".utf8))
    }
    Darwin.exit(1)
}
SWIFT

xcrun swiftc \
  -O \
  -framework AudioToolbox \
  -framework UniformTypeIdentifiers \
  "$ROOT/macos/App/NativeModels.swift" \
  "$ROOT/macos/App/NativeAacEncoder.swift" \
  "$TEMP_ROOT/main.swift" \
  -o "$TEMP_ROOT/DriftNativeAacProbe"

rm -f "$REPORT"
set +e
DRIFT_NATIVE_AAC_REPORT="$REPORT" "$TEMP_ROOT/DriftNativeAacProbe"
PROBE_STATUS=$?
set -e

[[ -s "$REPORT" ]] || fail "native AAC probe exited with $PROBE_STATUS and produced no JSON report"

node - "$REPORT" "$PROBE_STATUS" <<'NODE'
const fs = require('node:fs');
const [reportPath, exitRaw] = process.argv.slice(2);
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const exitCode = Number(exitRaw);
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(report.fileBacked?.durationSeconds === 300 && report.fileBacked?.frameEquationHolds === true && report.fileBacked?.cancellationRejectedAppend === true, '300-second file-backed AAC probe failed');
expect(report.schemaVersion === 1, 'unknown native AAC report schema');
expect(report.encoded === true, `AudioToolbox did not encode AAC: ${report.error?.message ?? 'unknown failure'}`);
expect(exitCode === 0, `native AAC probe process exited with ${exitCode}`);
expect(report.provider === 'AudioToolbox', 'native AAC provider is not AudioToolbox');
expect(report.appleSoftwareEncoder === true, 'native AAC did not select the Apple software encoder');
expect(report.codec === 'aac' && report.codecString === 'mp4a.40.2', 'native AAC codec identity changed');
expect(report.sampleRate === 48_000, 'native AAC sample rate changed');
expect(report.numberOfChannels === 2, 'native AAC channel count changed');
expect(report.bitRate === 192_000, 'native AAC bitrate changed');
expect(report.packetFrames === 1_024, 'native AAC packet frame size changed');
expect(report.packetCount > 0, 'native AAC produced no packets');
expect(report.totalPacketBytes > 0, 'native AAC produced no packet bytes');
expect(report.magicCookieBytes > 0, 'native AAC produced no magic cookie');
expect(report.audioSpecificConfigBase64 === 'EZA=', 'native AAC AudioSpecificConfig is not AAC-LC 48 kHz stereo');
expect(report.frameEquationHolds === true, 'native AAC priming/input/padding equation failed');
expect(
  report.representedFrames === report.leadingFrames + report.inputFrames + report.trailingFrames,
  'native AAC frame receipt is internally contradictory',
);
expect(Array.isArray(report.packets) && report.packets.length === report.packetCount, 'native AAC packet list changed');
expect(
  report.packets?.every((packet) =>
    packet.frameCount === 1_024
    && packet.byteCount > 0
    && typeof packet.dataBase64 === 'string'
    && packet.dataBase64.length > 0
  ),
  'native AAC returned a malformed packet',
);

console.log('Drift AudioToolbox AAC receipt');
console.log(`  Codec: ${report.codecString ?? 'unknown'}`);
console.log(`  PCM: ${report.inputFrames ?? 0} frames at ${report.sampleRate ?? 0} Hz stereo`);
console.log(`  Packets: ${report.packetCount ?? 0} (${report.totalPacketBytes ?? 0} bytes)`);
console.log(`  Priming: ${report.leadingFrames ?? 0} frames`);
console.log(`  Padding: ${report.trailingFrames ?? 0} frames`);
console.log(`  Magic cookie: ${report.magicCookieBytes ?? 0} bytes`);
console.log(`  Report: ${reportPath}`);

if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
NODE

printf 'AudioToolbox AAC gauntlet passed.\n'
