import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const at = (path) => join(root, path);
const read = (path) => readFileSync(at(path), "utf8");
const fail = (message) => { throw new Error(`macOS source contract failed: ${message}`); };
const requireFile = (path) => { if (!existsSync(at(path))) fail(`missing ${path}`); };
const requireAll = (text, markers, label) => {
  for (const marker of markers) {
    if (!text.includes(marker)) fail(`${label} is missing ${JSON.stringify(marker)}`);
  }
};
const forbidAll = (text, markers, label) => {
  for (const marker of markers) {
    if (text.includes(marker)) fail(`${label} still contains forbidden ${JSON.stringify(marker)}`);
  }
};

const appSwift = [
  "macos/App/DriftAppDelegate.swift",
  "macos/App/DriftMain.swift",
  "macos/App/NativeAacEncoder.swift",
  "macos/App/NativeBridgeHost+Finder.swift",
  "macos/App/NativeBridgeHost.swift",
  "macos/App/NativeFileBroker.swift",
  "macos/App/NativeGauntlet.swift",
  "macos/App/NativeModels.swift",
  "macos/App/WebViewSelfTest.swift",
];
const probes = [
  "macos/Probes/CodecProbe.swift",
  "macos/Probes/ExportProbe.swift",
  "macos/Probes/NativeGauntletMain.swift",
];
const scripts = [
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
  "scripts/verify-macos-dmg.sh",
  "scripts/verify-macos-release.sh",
];
const docs = [
  "docs/MACOS_APP.md",
  "docs/MACOS_PRODUCT_CONTRACT.md",
  "docs/MACOS_USER_GUIDE.md",
  "docs/MACOS_QA.md",
  "docs/MACOS_THREAT_MODEL.md",
  "docs/MACOS_RELEASE.md",
  "docs/MACOS_RELEASE_CHECKLIST.md",
];
const required = [
  ...appSwift,
  ...probes,
  ...scripts,
  ...docs,
  "macos/NativeBridge.js",
  "macos/Info.plist",
  "macos/Drift.entitlements",
  "src/lib/macosAacEncoder.ts",
  "src/lib/nativeMac.ts",
  "tests/macosAacEncoder.test.ts",
  "tests/macosExportProbe.ts",
  "tests/nativeMac.test.ts",
  ".github/workflows/macos.yml",
  ".github/workflows/macos-runtime.yml",
  ".github/workflows/macos-release.yml",
  "THIRD_PARTY_NOTICES.md",
  "package.json",
  "vite.config.ts",
];
required.forEach(requireFile);

const stalePaths = [
  ".github/workflows/macos-app.yml",
  "macos/DriftAppDelegate.swift",
  "macos/DriftMain.swift",
  "macos/DriftMenus.swift",
  "macos/DriftWebKit.swift",
  "macos/NSAlert+Sheet.swift",
  "macos/NativeBridgeHost.swift",
  "macos/NativeFileBroker.swift",
  "macos/NativeSupport.swift",
  "macos/NativeGauntletMain.swift",
  "macos/NativeBridge-0.inc.js",
  "macos/NativeBridge-1.inc.js",
  "macos/NativeBridge-2.inc.js",
];
for (const path of stalePaths) {
  if (existsSync(at(path))) fail(`stale competing implementation remains at ${path}`);
}
const rootSwift = readdirSync(at("macos")).filter((name) => name.endsWith(".swift"));
if (rootSwift.length) fail(`Swift source belongs in macos/App or macos/Probes; found ${rootSwift.join(", ")}`);
const discoveredAppSwift = readdirSync(at("macos/App"))
  .filter((name) => name.endsWith(".swift"))
  .map((name) => `macos/App/${name}`)
  .sort();
if (JSON.stringify(discoveredAppSwift) !== JSON.stringify([...appSwift].sort())) {
  fail(`canonical Swift graph changed: ${discoveredAppSwift.join(", ")}`);
}

const source = Object.fromEntries(required.map((path) => [path, read(path)]));
const swift = appSwift.map((path) => source[path]).join("\n");
const bridge = source["macos/NativeBridge.js"];
const app = source["src/App.tsx"];
const mediaLibrary = source["src/components/MediaLibrary.tsx"] ?? read("src/components/MediaLibrary.tsx");
const nativeMac = source["src/lib/nativeMac.ts"];
const nativeMacTests = source["tests/nativeMac.test.ts"];
const appDelegate = source["macos/App/DriftAppDelegate.swift"];
const nativeModels = source["macos/App/NativeModels.swift"];
const broker = source["macos/App/NativeFileBroker.swift"];
const gauntlet = source["macos/App/NativeGauntlet.swift"];
const gauntletMain = source["macos/Probes/NativeGauntletMain.swift"];
const finder = source["macos/App/NativeBridgeHost+Finder.swift"];
const aacSwift = source["macos/App/NativeAacEncoder.swift"];
const aacWeb = source["src/lib/macosAacEncoder.ts"];
const aacTests = source["tests/macosAacEncoder.test.ts"];
const exportProbeHost = source["macos/Probes/ExportProbe.swift"];
const exportProbe = source["tests/macosExportProbe.ts"];
const build = source["scripts/build-macos-app.sh"];
const verify = source["scripts/verify-macos-app.sh"];
const packageDmg = source["scripts/package-macos-dmg.sh"];
const verifyDmg = source["scripts/verify-macos-dmg.sh"];
const release = source["scripts/release-macos-app.sh"];
const verifyRelease = source["scripts/verify-macos-release.sh"];
const exportRunner = source["scripts/run-macos-export-probe.sh"];
const codecProbe = source["scripts/probe-macos-codecs.sh"];
const aacProbe = source["scripts/probe-macos-aac.sh"];
const packagedProbe = source["scripts/probe-macos-packaged-webview.sh"];
const vite = source["vite.config.ts"];
const info = source["macos/Info.plist"];
const entitlements = source["macos/Drift.entitlements"];
const macWorkflow = source[".github/workflows/macos.yml"];
const runtimeWorkflow = source[".github/workflows/macos-runtime.yml"];
const releaseWorkflow = source[".github/workflows/macos-release.yml"];
const packageJson = JSON.parse(source["package.json"]);

new Script(bridge, { filename: "macos/NativeBridge.js" });
requireAll(bridge, [
  "DRIFT_NATIVE_BRIDGE_VERSION = 2",
  "__driftNativeInstallAppBridge",
  "__driftNativeSaveBlob",
  "function assertSafeLeafName",
  "await abortNativeSession(error)",
  "state.status = \"closed\"",
  "MAX_READBACK_BYTES = 512 * 1024 * 1024",
], "typed JavaScript bridge");
forbidAll(bridge, [
  "function clickByText",
  "function readClientState",
  "querySelectorAll(\"button\")",
  ".header-status span",
  ".export-overlay",
  "MutationObserver",
  "queuedCommands",
  'name: clampFilename(name, "frame.png")',
], "typed JavaScript bridge");
requireAll(swift, ["let driftBridgeVersion = 2"], "Swift bridge");
requireAll(info, ["<integer>2</integer>"], "Info.plist bridge version");

const fileCommands = [
  "runtime-info", "client-state", "input-intent", "pick-save", "pick-directory",
  "pick-open-files", "write-open", "write-chunk", "write-truncate", "write-close",
  "write-abort", "file-info", "file-read", "file-release", "directory-get-file",
  "directory-remove-entry", "directory-release",
];
const appCommands = [
  "open-project", "add-slides", "add-presenter", "save-project", "export-mp4",
  "export-still", "export-frames", "toggle-playback", "previous-slide", "next-slide",
  "toggle-focus", "cancel-export",
];
for (const command of fileCommands) {
  requireAll(bridge, [`"${command}"`], `JavaScript command ${command}`);
  requireAll(swift, [`"${command}"`], `Swift command ${command}`);
}
for (const command of appCommands) {
  requireAll(bridge, [`"${command}"`], `JavaScript app command ${command}`);
  requireAll(swift, [`"${command}"`], `Swift app command ${command}`);
  requireAll(nativeMac, [`"${command}"`], `TypeScript app command ${command}`);
  requireAll(app, [`"${command}"`], `React app command ${command}`);
}
for (const command of ["aac-create", "aac-append", "aac-finish", "aac-close"]) {
  requireAll(swift, [`"${command}"`], `Swift AAC command ${command}`);
  requireAll(aacWeb, [`"${command}"`], `TypeScript AAC command ${command}`);
}

requireAll(app, [
  "installNativeMacAppBridge",
  "reportNativeMacClientState",
  "saveNativeMacBlob",
  "nativeCommandRef",
  "nativeImportRef",
  "await downloadBlob",
  "imageInputRef={imageInputRef}",
  "presenterInputRef={presenterInputRef}",
], "React native integration");
requireAll(mediaLibrary, ["imageInputRef: RefObject", "presenterInputRef: RefObject"], "media input integration");
requireAll(nativeMac, ['lastNotice: state.lastNotice ? "present" : null'], "web-side diagnostic redaction");
requireAll(nativeMacTests, [
  "without carrying confidential notice text into AppKit",
  "Secret Deck",
  "not.toContain(\"/Users/\")",
], "diagnostic privacy tests");

requireAll(nativeModels, [
  "struct WebContentRecoveryPolicy",
  "mutating func consumeAttempt() -> Bool",
  "present (content withheld)",
  "driftMaximumNativeOutputBytes: UInt64 = 512 * 1024 * 1024",
], "native trust model");
requireAll(appDelegate, [
  "Open one project at a time",
  "hasProtectedWork",
  "webContentRecoveryPolicy.consumeAttempt()",
  "webContentRecoveryPolicy.reset()",
  "The visual engine stopped twice",
  "Web content recovery remaining",
  "Reveal Last Saved File in Finder",
  "Recent notice signal",
], "AppKit lifecycle");
requireAll(gauntlet, [
  "second WebKit termination reopened an automatic recovery loop",
  "commit destination changed to a directory",
  "idempotent abort",
  "confidential renderer notice text",
], "native adversarial gauntlet");
requireAll(gauntletMain, [
  "NativeFileBroker.runSelfTest()",
  "NativeGauntlet.run()",
  "NativeAacEncoderBroker.runSelfTest()",
], "native gauntlet executable");
requireAll(broker, [
  "itemReplacementDirectory",
  "Darwin.rename",
  "writeSessions.removeValue(forKey: session.id)",
  "cleanupFailedWriteSession(session)",
], "rollback-aware native broker");
requireAll(finder, [
  "revealLastCommittedFileInFinder",
  "revealLastExportInFinder()",
  "never staging bytes",
], "Finder committed-file boundary");

requireAll(aacSwift, [
  "import AudioToolbox",
  "AudioConverterNewSpecific",
  "nativeAacAppleManufacturer",
  "kAudioCodecBitRateControlMode_LongTermAverage",
  "kAudioConverterQuality_High",
  "representedFrames == leadingFrames + inputFrames + trailingFrames",
], "native AudioToolbox AAC");
forbidAll(aacSwift, ["FFmpeg"], "native AudioToolbox AAC");
requireAll(aacWeb, [
  "class NativeMacAacEncoder extends CustomAudioEncoder",
  "registerEncoder(NativeMacAacEncoder)",
  "validateNativeAacReceipt",
  "buildNativeAacPacketTimeline",
  "firstTimestamp - leadingFrames / sampleRate",
  "AAC_AUDIO_SPECIFIC_CONFIG",
], "Mediabunny native AAC adapter");
requireAll(aacTests, [
  "accepts an exact AAC-LC 48 kHz stereo frame equation",
  "rejects a receipt that hides priming or padding drift",
  "represents encoder priming with a negative first timestamp",
], "native AAC unit tests");

const expectedScripts = {
  "check:mac-source": "node scripts/check-macos-source.mjs",
  "build:mac": "bash scripts/build-macos-app.sh",
  "verify:mac": "bash scripts/verify-macos-app.sh",
  "package:mac:dmg": "bash scripts/package-macos-dmg.sh",
  "verify:mac:dmg": "bash scripts/verify-macos-dmg.sh",
  "verify:mac-release": "bash scripts/verify-macos-release.sh",
  "release:mac": "bash scripts/release-macos-app.sh",
};
for (const [name, command] of Object.entries(expectedScripts)) {
  if (packageJson.scripts?.[name] !== command) {
    fail(`package script ${name} must be exactly ${JSON.stringify(command)}`);
  }
}
requireAll(build, [
  "DRIFT_SKIP_WEB_CHECKS",
  "npm run check",
  "vite build --mode macos",
  "macos/App/*.swift",
  "cp macos/NativeBridge.js",
  "BuildReceipt.txt",
  "BuildManifest.txt",
  "--options runtime",
  "verify-macos-app.sh",
], "Mac app builder");
for (const marker of ["*.wasm", "@mediabunny/aac-encoder", "libavcodec"]) {
  requireAll(build, [marker], `builder exclusion ${marker}`);
  requireAll(verify, [marker], `verifier exclusion ${marker}`);
}
requireAll(verify, [
  "--smoke-test",
  "--native-self-test",
  "--webview-self-test",
  "BuildManifest.txt",
  "Video: WKWebView H.264, capability-gated and output-verified",
  "Audio: Apple software AAC-LC through AudioToolbox; no FFmpeg WASM",
  "otool -L",
  "flags=.*runtime",
  "LaunchServices",
], "signed app verifier");
requireAll(packageDmg, [
  "Install Drift.txt",
  "-readonly",
  "verify-macos-app.sh",
  "verify-macos-dmg.sh",
  ".sha256",
  "AudioToolbox",
  "WKWebView",
], "local DMG packager");
requireAll(verifyDmg, [
  "shasum -a 256 -c",
  "hdiutil verify",
  "AudioToolbox",
  "WKWebView",
  "verify-macos-app.sh",
  "not notarized or published",
], "detached local DMG verifier");
requireAll(release, ["Developer ID Application", "notarytool", "stapler", "verify-macos-release.sh"], "release builder");
requireAll(verifyRelease, ["spctl", "stapler", "Developer ID Application"], "release verifier");
requireAll(vite, [
  'mode === "macos"',
  '"@mediabunny/aac-encoder": macosAacShim',
  'sourcemap: mode !== "macos"',
], "Mac Vite mode");

requireAll(aacProbe, ["AudioToolbox AAC receipt", "appleSoftwareEncoder", "frameEquationHolds", "magicCookieBytes"], "native AAC probe");
requireAll(codecProbe, ["DRIFT_REQUIRE_NATIVE_MP4", "H.264 actual encode", "WebGL2", "PNG"], "WKWebView codec probe");
requireAll(packagedProbe, [
  "sandbox-adhoc",
  "unsandboxed-adhoc",
  "sandbox-self-signed",
  "productionVariantPassed",
  "Drift CI Runtime",
], "packaged WebKit identity matrix");
requireAll(exportProbeHost, [
  "DRIFT_EXPORT_PROBE_ROOT",
  "allowingReadAccessTo: rootURL",
  "javascript-bootstrap",
  "DRIFT_EXPORT_PROGRESS",
  "latestProgress",
  "setActivationPolicy(.accessory)",
], "deterministic exporter host");
requireAll(exportProbe, ["compositor-ready", "reportEncoderProgress", "heartbeat:", "mp4:returned"], "deterministic exporter source");
requireAll(exportRunner, [
  "ProbeBundleReceipt.json",
  "sha256",
  "DRIFT_EXPORT_PROBE_ROOT",
  "progressEventCount",
  "WKWebView deterministic-export receipt",
], "deterministic exporter runner");

requireAll(info, ["<string>13.3</string>", "UTExportedTypeDeclarations", "LSMultipleInstancesProhibited"], "Info.plist");
requireAll(entitlements, ["com.apple.security.app-sandbox", "com.apple.security.files.user-selected.read-write"], "App Sandbox entitlements");
forbidAll(entitlements, ["com.apple.security.network"], "network entitlement policy");
requireAll(macWorkflow, [
  "Build and falsify universal signed app",
  "probe-macos-packaged-webview.sh",
  "drift-packaged-webview-evidence",
  "Require the production sandboxed lifecycle",
  "Prove release guard rejects non-Developer-ID signing",
  "macos/Probes/NativeGauntletMain.swift",
  "verify:mac:dmg",
], "standalone Mac workflow");
requireAll(runtimeWorkflow, [
  "Prove WebGL, PNG, and AVC inside WKWebView",
  "Prove Apple software AAC-LC through AudioToolbox",
  "Reconcile WebKit and native audio capabilities",
  "Render and verify real deterministic outputs inside WKWebView",
  "drift-wkwebview-runtime",
], "Mac runtime workflow");
requireAll(releaseWorkflow, [
  "workflow_dispatch",
  "source_commit",
  "git merge-base --is-ancestor",
  "environment:",
  "name: macos-release",
  "Retain text receipts only",
  "binary_uploaded=no",
  "github_release_created=no",
  "Remove signing material and every compiled binary",
  "drift-macos-signed-receipts",
], "privileged release-evidence workflow");
forbidAll(releaseWorkflow, [
  "build/release/Drift-macOS.zip\n            build/release/Drift-macOS.dmg",
  "ref: ${{ inputs.source_ref }}",
], "release publication boundary");

console.log(
  `macOS source contract passed: ${appSwift.length} canonical Swift files, typed bridge parity, exact file capabilities, rollback after failed close, privacy-redacted diagnostics, one-attempt crash recovery, native AudioToolbox AAC, receipt-verified WKWebView exports, detached DMG verification, and a text-receipt-only release lane.`,
);
