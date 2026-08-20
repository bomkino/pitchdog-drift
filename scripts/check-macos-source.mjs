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
const requireEvery = (text, markers, label) => {
  for (const marker of markers) requireText(text, marker, `${label} ${marker}`);
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
  "scripts/build-macos-export-probe.mjs",
  "scripts/check-macos-source.mjs",
  "scripts/generate-macos-icon.py",
  "scripts/package-macos-dmg.sh",
  "scripts/probe-macos-aac.sh",
  "scripts/probe-macos-codecs.sh",
  "scripts/probe-macos-packaged-webview.sh",
  "scripts/release-macos-app.sh",
  "scripts/run-macos-export-probe.sh",
  "scripts/verify-macos-app.sh",
  "scripts/verify-macos-release.sh",
  "src/lib/macosAacEncoder.ts",
  "src/lib/nativeMac.ts",
  "tests/macos-export-probe.html",
  "tests/macosAacEncoder.test.ts",
  "tests/macosExportProbe.ts",
  "tests/nativeMac.test.ts",
  ".github/workflows/macos.yml",
  ".github/workflows/macos-runtime.yml",
  ".github/workflows/macos-release.yml",
  "docs/MACOS_APP.md",
  "docs/MACOS_PRODUCT_CONTRACT.md",
  "docs/MACOS_USER_GUIDE.md",
  "docs/MACOS_QA.md",
  "docs/MACOS_THREAT_MODEL.md",
  "docs/MACOS_RELEASE.md",
  "docs/MACOS_RELEASE_CHECKLIST.md",
];
requiredFiles.forEach(requireFile);

for (const path of [
  ".github/workflows/macos-app.yml",
  "macos/DriftAppDelegate.swift",
  "macos/DriftMain.swift",
  "macos/DriftMenus.swift",
  "macos/DriftWebKit.swift",
  "macos/NSAlert+Sheet.swift",
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
if (rootSwift.length) fail(`Swift source must live in macos/App or macos/Probes; found root files ${rootSwift.join(", ")}`);

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
const release = read("scripts/release-macos-app.sh");
const verifyRelease = read("scripts/verify-macos-release.sh");
const vite = read("vite.config.ts");
const info = read("macos/Info.plist");
const entitlements = read("macos/Drift.entitlements");
const macWorkflow = read(".github/workflows/macos.yml");
const runtimeWorkflow = read(".github/workflows/macos-runtime.yml");
const releaseWorkflow = read(".github/workflows/macos-release.yml");
const packageJson = JSON.parse(read("package.json"));

new Script(bridge, { filename: "macos/NativeBridge.js" });
requireEvery(bridge, ["DRIFT_NATIVE_BRIDGE_VERSION = 2", "__driftNativeInstallAppBridge", "__driftNativeSaveBlob"], "JavaScript bridge");
requireText(swift, "let driftBridgeVersion = 2", "Swift bridge version");
requireText(info, "<integer>2</integer>", "Info.plist bridge version");

const fileCommands = [
  "runtime-info", "client-state", "input-intent", "pick-save", "pick-directory",
  "pick-open-files", "write-open", "write-chunk", "write-truncate", "write-close",
  "write-abort", "file-info", "file-read", "file-release", "directory-get-file",
  "directory-remove-entry", "directory-release",
];
for (const command of fileCommands) {
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

requireEvery(app, [
  "installNativeMacAppBridge", "reportNativeMacClientState", "saveNativeMacBlob",
  "nativeCommandRef", "nativeImportRef", "await downloadBlob",
  "imageInputRef={imageInputRef}", "presenterInputRef={presenterInputRef}",
], "React native contract");
requireEvery(mediaLibrary, ["imageInputRef: RefObject", "presenterInputRef: RefObject"], "external media input refs");
for (const forbidden of [
  "function clickByText", "function readClientState", "querySelectorAll(\"button\")",
  ".header-status span", ".export-overlay", "MutationObserver", "queuedCommands",
]) forbidText(bridge, forbidden, "typed native app contract");

requireEvery(swift, [
  "NativeGauntlet.run()", "NativeAacEncoderBroker.runSelfTest()", "--webview-self-test",
  "itemReplacementDirectory", "Darwin.rename", "driftMaximumNativeOutputBytes: UInt64 = 512 * 1024 * 1024",
  "Cancel Export", "candidate.path.hasPrefix(rootPath)",
], "Swift safety invariant");
requireText(bridge, "MAX_READBACK_BYTES = 512 * 1024 * 1024", "JavaScript readback ceiling");

requireEvery(nativeAacSwift, [
  "import AudioToolbox", "AudioConverterNewSpecific", "nativeAacAppleManufacturer",
  "kAudioCodecBitRateControlMode_LongTermAverage", "kAudioConverterQuality_High",
  "representedFrames == leadingFrames + inputFrames + trailingFrames",
], "AudioToolbox AAC implementation");
requireEvery(nativeAac, [
  "class NativeMacAacEncoder extends CustomAudioEncoder", "registerEncoder(NativeMacAacEncoder)",
  "validateNativeAacReceipt", "buildNativeAacPacketTimeline",
  "firstTimestamp - leadingFrames / sampleRate", "AAC_AUDIO_SPECIFIC_CONFIG",
], "native AAC adapter");
requireEvery(nativeAacTests, [
  "accepts an exact AAC-LC 48 kHz stereo frame equation",
  "rejects a receipt that hides priming or padding drift",
  "represents encoder priming with a negative first timestamp",
], "native AAC tests");
forbidText(nativeAacSwift, "FFmpeg", "AudioToolbox implementation");

const expectedScripts = {
  "check:mac-source": "node scripts/check-macos-source.mjs",
  "build:mac": "bash scripts/build-macos-app.sh",
  "verify:mac": "bash scripts/verify-macos-app.sh",
  "package:mac:dmg": "bash scripts/package-macos-dmg.sh",
};
for (const [name, command] of Object.entries(expectedScripts)) {
  requireText(packageJson.scripts?.[name] ?? "", command, `package script ${name}`);
}
requireEvery(build, [
  "DRIFT_SKIP_WEB_CHECKS", "npm run check", "vite build --mode macos",
  "macos/App/*.swift", "cp macos/NativeBridge.js", "BuildReceipt.txt", "BuildManifest.txt",
  "--options runtime", "verify-macos-app.sh",
], "Mac builder");
for (const marker of ["*.wasm", "@mediabunny/aac-encoder", "libavcodec"]) {
  requireText(build, marker, `Mac builder rejection ${marker}`);
  requireText(verify, marker, `Mac verifier rejection ${marker}`);
}
requireEvery(verify, [
  "--smoke-test", "--native-self-test", "--webview-self-test", "BuildManifest.txt",
  "system-codecs-only", "otool -L", "flags=.*runtime", "LaunchServices",
], "Mac verifier");
requireEvery(packageDmg, ["Install Drift.txt", "-readonly", "verify-macos-app.sh", ".sha256"], "DMG packager");
requireEvery(release, ["Developer ID Application", "notarytool", "stapler", "verify-macos-release.sh"], "release builder");
requireEvery(verifyRelease, ["spctl", "stapler", "Developer ID Application"], "release verifier");

requireEvery(vite, ['mode === "macos"', '"@mediabunny/aac-encoder": macosAacShim', 'sourcemap: mode !== "macos"'], "Vite Mac build");
requireEvery(probeAac, ["AudioToolbox AAC receipt", "appleSoftwareEncoder", "frameEquationHolds", "magicCookieBytes"], "AudioToolbox probe");
requireEvery(probeCodecs, ["DRIFT_REQUIRE_NATIVE_MP4", "H.264 actual encode", "WebGL2", "PNG"], "WKWebView codec probe");
requireEvery(probePackaged, [
  "sandbox-adhoc", "unsandboxed-adhoc", "sandbox-self-signed",
  "productionVariantPassed", "Drift CI Runtime",
], "packaged WebKit matrix");
requireEvery(exportProbeHost, [
  "DRIFT_EXPORT_PROBE_ROOT", "allowingReadAccessTo: rootURL", "javascript-bootstrap",
  "DRIFT_EXPORT_PROGRESS", "latestProgress", "setActivationPolicy(.accessory)",
], "export-probe host");
requireEvery(exportProbe, ["compositor-ready", "reportEncoderProgress", "heartbeat:", "mp4:returned"], "deterministic export probe");
requireEvery(probeExport, [
  "ProbeBundleReceipt.json", "sha256", "DRIFT_EXPORT_PROBE_ROOT",
  "progressEventCount", "WKWebView deterministic-export receipt",
], "deterministic export runner");

requireEvery(info, ["<string>13.3</string>", "UTExportedTypeDeclarations", "LSMultipleInstancesProhibited"], "Info.plist");
requireEvery(entitlements, ["com.apple.security.app-sandbox", "com.apple.security.files.user-selected.read-write"], "App Sandbox entitlements");
forbidText(entitlements, "com.apple.security.network", "network entitlement policy");

requireEvery(macWorkflow, [
  "Build and falsify universal signed app", "probe-macos-packaged-webview.sh",
  "drift-packaged-webview-evidence", "Require the production sandboxed lifecycle",
  "Prove release guard rejects non-Developer-ID signing",
], "standalone Mac workflow");
requireEvery(runtimeWorkflow, [
  "Prove WebGL, PNG, and AVC inside WKWebView",
  "Prove Apple software AAC-LC through AudioToolbox",
  "Reconcile WebKit and native audio capabilities",
  "Render and verify real deterministic outputs inside WKWebView",
  "drift-wkwebview-runtime",
], "Mac runtime workflow");
requireEvery(releaseWorkflow, ["workflow_dispatch", "macos-release-candidate"], "Mac release workflow");

console.log(
  `macOS source contract passed: ${swiftFiles.length} canonical Swift files, one typed React↔AppKit bridge, staged native writes, AudioToolbox AAC, receipt-verified WKWebView exports, and explicit unsigned/release gates.`,
);
