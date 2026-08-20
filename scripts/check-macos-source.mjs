import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const at = (path) => join(root, path);
const read = (path) => readFileSync(at(path), "utf8");
const fail = (message) => { throw new Error(`macOS source contract failed: ${message}`); };
const requireFile = (path) => { if (!existsSync(at(path))) fail(`missing ${path}`); };
const requireText = (text, marker, label) => {
  if (!text.includes(marker)) fail(`${label} is missing ${JSON.stringify(marker)}`);
};
const forbidText = (text, marker, label) => {
  if (text.includes(marker)) fail(`${label} still contains forbidden ${JSON.stringify(marker)}`);
};

const swiftFiles = [
  "macos/App/DriftAppDelegate.swift",
  "macos/App/DriftMain.swift",
  "macos/App/NativeAacEncoder.swift",
  "macos/App/NativeBridgeHost.swift",
  "macos/App/NativeFileBroker.swift",
  "macos/App/NativeGauntlet.swift",
  "macos/App/NativeModels.swift",
  "macos/App/WebViewSelfTest.swift",
];
const requiredFiles = [
  ...swiftFiles,
  "macos/NativeBridge.js",
  "macos/Info.plist",
  "macos/Drift.entitlements",
  "macos/Probes/CodecProbe.swift",
  "macos/Probes/ExportProbe.swift",
  "scripts/build-macos-app.sh",
  "scripts/verify-macos-app.sh",
  "scripts/package-macos-dmg.sh",
  "scripts/probe-macos-aac.sh",
  "scripts/probe-macos-codecs.sh",
  "scripts/probe-macos-packaged-webview.sh",
  "scripts/run-macos-export-probe.sh",
  "src/lib/macosAacEncoder.ts",
  "src/lib/nativeMac.ts",
  "tests/macosAacEncoder.test.ts",
  "tests/macosExportProbe.ts",
  "tests/nativeMac.test.ts",
  ".github/workflows/macos.yml",
  ".github/workflows/macos-runtime.yml",
  "docs/MACOS_APP.md",
  "docs/MACOS_PRODUCT_CONTRACT.md",
  "docs/MACOS_USER_GUIDE.md",
  "docs/MACOS_QA.md",
  "docs/MACOS_THREAT_MODEL.md",
  "docs/MACOS_RELEASE_CHECKLIST.md",
];
requiredFiles.forEach(requireFile);

for (const path of [
  ".github/workflows/macos-app.yml",
  "macos/DriftAppDelegate.swift",
  "macos/DriftMain.swift",
  "macos/DriftMenus.swift",
  "macos/DriftWebKit.swift",
  "macos/NativeBridgeHost.swift",
  "macos/NativeFileBroker.swift",
  "macos/NativeSupport.swift",
  "macos/NativeBridge-0.inc.js",
  "macos/NativeBridge-1.inc.js",
  "macos/NativeBridge-2.inc.js",
]) {
  if (existsSync(at(path))) fail(`stale competing implementation remains at ${path}`);
}
const rootSwift = readdirSync(at("macos")).filter((name) => name.endsWith(".swift"));
if (rootSwift.length) fail(`Swift source must live only in macos/App; found ${rootSwift.join(", ")}`);

const swift = swiftFiles.map(read).join("\n");
const bridge = read("macos/NativeBridge.js");
const app = read("src/App.tsx");
const mediaLibrary = read("src/components/MediaLibrary.tsx");
const nativeMac = read("src/lib/nativeMac.ts");
const nativeAacSwift = read("macos/App/NativeAacEncoder.swift");
const nativeAac = read("src/lib/macosAacEncoder.ts");
const nativeAacTests = read("tests/macosAacEncoder.test.ts");
const exportProbe = read("tests/macosExportProbe.ts");
const exportProbeHost = read("macos/Probes/ExportProbe.swift");
const build = read("scripts/build-macos-app.sh");
const verify = read("scripts/verify-macos-app.sh");
const packageDmg = read("scripts/package-macos-dmg.sh");
const probeAac = read("scripts/probe-macos-aac.sh");
const probeCodecs = read("scripts/probe-macos-codecs.sh");
const probePackaged = read("scripts/probe-macos-packaged-webview.sh");
const probeExport = read("scripts/run-macos-export-probe.sh");
const vite = read("vite.config.ts");
const info = read("macos/Info.plist");
const entitlements = read("macos/Drift.entitlements");
const macWorkflow = read(".github/workflows/macos.yml");
const runtimeWorkflow = read(".github/workflows/macos-runtime.yml");

new Script(bridge, { filename: "macos/NativeBridge.js" });
requireText(bridge, "DRIFT_NATIVE_BRIDGE_VERSION = 2", "JavaScript bridge version");
requireText(swift, "let driftBridgeVersion = 2", "Swift bridge version");
requireText(info, "<integer>2</integer>", "Info.plist bridge version");

for (const command of [
  "runtime-info", "client-state", "input-intent", "pick-save", "pick-directory",
  "pick-open-files", "write-open", "write-chunk", "write-truncate", "write-close",
  "write-abort", "file-info", "file-read", "file-release", "directory-get-file",
  "directory-remove-entry", "directory-release",
]) {
  requireText(bridge, `"${command}"`, `JavaScript bridge command ${command}`);
  requireText(swift, `"${command}"`, `Swift bridge command ${command}`);
}
for (const command of ["aac-create", "aac-append", "aac-finish", "aac-close"]) {
  requireText(swift, `"${command}"`, `Swift AAC command ${command}`);
  requireText(nativeAac, `"${command}"`, `TypeScript AAC command ${command}`);
}
for (const command of [
  "open-project", "add-slides", "add-presenter", "save-project", "export-mp4",
  "export-still", "export-frames", "toggle-playback", "previous-slide", "next-slide",
  "toggle-focus", "cancel-export",
]) {
  requireText(bridge, `"${command}"`, `JavaScript app command ${command}`);
  requireText(swift, `"${command}"`, `Swift app command ${command}`);
  requireText(nativeMac, `"${command}"`, `typed app command ${command}`);
  requireText(app, `"${command}"`, `React app command ${command}`);
}

for (const marker of [
  "__driftNativeInstallAppBridge", "__driftNativeReportClientState",
  "__driftNativeSaveBlob", "driftNativeAppBridge = \"ready\"",
]) requireText(bridge, marker, `JavaScript native contract ${marker}`);
for (const marker of [
  "installNativeMacAppBridge", "reportNativeMacClientState", "saveNativeMacBlob",
  "nativeCommandRef", "nativeImportRef", "await downloadBlob",
  "imageInputRef={imageInputRef}", "presenterInputRef={presenterInputRef}",
]) requireText(app, marker, `React native contract ${marker}`);
requireText(mediaLibrary, "imageInputRef: RefObject", "external slide input ref");
requireText(mediaLibrary, "presenterInputRef: RefObject", "external presenter input ref");
for (const forbidden of [
  "function clickByText", "function readClientState", "querySelectorAll(\"button\")",
  ".header-status span", ".export-overlay", "MutationObserver", "queuedCommands",
]) forbidText(bridge, forbidden, "typed native app contract");

for (const marker of [
  "NativeGauntlet.run()", "NativeAacEncoderBroker.runSelfTest()", "--webview-self-test",
  "fileManager.createFile(atPath: fileURL.path", "driftMaximumNativeOutputBytes: UInt64 = 512 * 1024 * 1024",
  "Cancel Export", "candidate.path.hasPrefix(rootPath)",
]) requireText(swift, marker, `Swift invariant ${marker}`);
requireText(bridge, "MAX_READBACK_BYTES = 512 * 1024 * 1024", "JavaScript readback ceiling");

for (const marker of [
  "import AudioToolbox", "AudioConverterNewSpecific", "nativeAacAppleManufacturer",
  "kAudioCodecBitRateControlMode_LongTermAverage", "kAudioConverterQuality_High",
  "representedFrames == leadingFrames + inputFrames + trailingFrames",
  "Apple’s software AAC-LC encoder",
]) requireText(nativeAacSwift, marker, `AudioToolbox AAC invariant ${marker}`);
for (const marker of [
  "class NativeMacAacEncoder extends CustomAudioEncoder", "registerEncoder(NativeMacAacEncoder)",
  "validateNativeAacReceipt", "buildNativeAacPacketTimeline",
  "firstTimestamp - leadingFrames / sampleRate", "AAC_AUDIO_SPECIFIC_CONFIG",
]) requireText(nativeAac, marker, `native AAC adapter ${marker}`);
for (const marker of [
  "accepts an exact AAC-LC 48 kHz stereo frame equation",
  "rejects a receipt that hides priming or padding drift",
  "represents encoder priming with a negative first timestamp",
]) requireText(nativeAacTests, marker, `native AAC test ${marker}`);
forbidText(nativeAacSwift, "FFmpeg", "AudioToolbox implementation");

for (const marker of [
  "macos/App/*.swift", "cp macos/NativeBridge.js", "vite build --mode macos",
  "BuildReceipt.txt", "BuildManifest.txt", "DRIFT_SKIP_APP_VERIFY",
]) requireText(build, marker, `Mac builder ${marker}`);
for (const marker of ["*.wasm", "@mediabunny/aac-encoder", "libavcodec"]) {
  requireText(build, marker, `Mac builder rejection ${marker}`);
  requireText(verify, marker, `Mac verifier rejection ${marker}`);
}
for (const marker of [
  "--smoke-test", "--native-self-test", "--webview-self-test", "BuildManifest.txt",
  "system-codecs-only", "otool -L", "flags=.*runtime", "open", "LaunchServices",
]) requireText(verify, marker, `Mac verifier ${marker}`);
for (const marker of ["Install Drift.txt", "-readonly", "verify-macos-app.sh", ".sha256"]) {
  requireText(packageDmg, marker, `DMG contract ${marker}`);
}

for (const marker of [
  'mode === "macos"', '"@mediabunny/aac-encoder": macosAacShim', 'sourcemap: mode !== "macos"',
]) requireText(vite, marker, `Vite Mac build ${marker}`);
for (const marker of ["AudioToolbox AAC receipt", "appleSoftwareEncoder", "frameEquationHolds", "magicCookieBytes"]) {
  requireText(probeAac, marker, `AudioToolbox probe ${marker}`);
}
for (const marker of ["DRIFT_REQUIRE_NATIVE_MP4", "H.264 actual encode", "WebGL2", "PNG"]) {
  requireText(probeCodecs, marker, `WKWebView codec probe ${marker}`);
}
for (const marker of [
  "sandbox-adhoc", "unsandboxed-adhoc", "sandbox-self-signed",
  "productionVariantPassed", "Drift CI Runtime",
]) requireText(probePackaged, marker, `packaged WebKit matrix ${marker}`);
for (const marker of [
  "DRIFT_EXPORT_PROBE_ROOT", "allowingReadAccessTo: rootURL", "javascript-bootstrap",
  "DRIFT_EXPORT_PROGRESS", "latestProgress", "setActivationPolicy(.accessory)",
]) requireText(exportProbeHost, marker, `export-probe host ${marker}`);
for (const marker of ["compositor-ready", "reportEncoderProgress", "heartbeat:", "mp4:returned"]) {
  requireText(exportProbe, marker, `deterministic export probe ${marker}`);
}
for (const marker of [
  "ProbeBundleReceipt.json", "sha256", "DRIFT_EXPORT_PROBE_ROOT",
  "progressEventCount", "WKWebView deterministic-export receipt",
]) requireText(probeExport, marker, `deterministic export runner ${marker}`);

requireText(info, "<string>13.3</string>", "minimum macOS version");
requireText(info, "UTExportedTypeDeclarations", ".pitched type declaration");
requireText(info, "LSMultipleInstancesProhibited", "single-editor policy");
requireText(entitlements, "com.apple.security.app-sandbox", "App Sandbox entitlement");
requireText(entitlements, "com.apple.security.files.user-selected.read-write", "user-selected file entitlement");
forbidText(entitlements, "com.apple.security.network", "network entitlement policy");

for (const marker of [
  "Build and falsify universal signed app", "probe-macos-packaged-webview.sh",
  "drift-packaged-webview-evidence", "Require the production sandboxed lifecycle",
  "Prove release guard rejects non-Developer-ID signing",
]) requireText(macWorkflow, marker, `standalone Mac workflow ${marker}`);
for (const marker of [
  "Prove WebGL, PNG, and AVC inside WKWebView",
  "Prove Apple software AAC-LC through AudioToolbox",
  "Reconcile WebKit and native audio capabilities",
  "Render and verify real deterministic outputs inside WKWebView",
  "drift-wkwebview-runtime",
]) requireText(runtimeWorkflow, marker, `Mac runtime workflow ${marker}`);

console.log(
  `macOS source contract passed: one typed React↔AppKit bridge, direct awaited saves, ${swiftFiles.length} canonical Swift files, native AudioToolbox AAC, receipt-verified WKWebView exports, a three-identity signing matrix, and a 512 MiB output ceiling.`,
);
