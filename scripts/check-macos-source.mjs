import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const at = (path) => join(root, path);
const fail = (message) => { throw new Error(`macOS source contract failed: ${message}`); };
const read = (path) => {
  if (!existsSync(at(path))) fail(`missing ${path}`);
  return readFileSync(at(path), "utf8");
};
const requireMarkers = (path, markers) => {
  const text = read(path);
  for (const marker of markers) {
    if (!text.includes(marker)) fail(`${path} is missing ${JSON.stringify(marker)}`);
  }
  return text;
};
const forbidMarkers = (path, markers) => {
  const text = read(path);
  for (const marker of markers) {
    if (text.includes(marker)) fail(`${path} contains forbidden ${JSON.stringify(marker)}`);
  }
};

const appSwift = [
  "macos/App/DriftAppDelegate.swift",
  "macos/App/DriftMain.swift",
  "macos/App/NativeAacEncoder.swift",
  "macos/App/NativeBridgeHost+Finder.swift",
  "macos/App/NativeBridgeHost.swift",
  "macos/App/NativeDocumentSession.swift",
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
const workflows = [
  ".github/workflows/macos.yml",
  ".github/workflows/macos-runtime.yml",
  ".github/workflows/macos-release.yml",
];
const webSources = [
  "macos/NativeBridge.js",
  "src/App.tsx",
  "src/components/MediaLibrary.tsx",
  "src/lib/macosAacEncoder.ts",
  "src/lib/nativeMac.ts",
  "src/lib/projectMediaBudget.ts",
  "tests/macosAacEncoder.test.ts",
  "tests/macosExportProbe.ts",
  "tests/nativeMac.test.ts",
  "tests/projectMediaBudget.test.ts",
];
const required = [
  ...appSwift,
  ...probes,
  ...scripts,
  ...docs,
  ...workflows,
  ...webSources,
  "macos/Info.plist",
  "macos/Drift.entitlements",
  "THIRD_PARTY_NOTICES.md",
  "package.json",
  "vite.config.ts",
];
required.forEach(read);

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
if (rootSwift.length) fail(`root macos/ contains stray Swift files: ${rootSwift.join(", ")}`);
const discoveredAppSwift = readdirSync(at("macos/App"))
  .filter((name) => name.endsWith(".swift"))
  .map((name) => `macos/App/${name}`)
  .sort();
if (JSON.stringify(discoveredAppSwift) !== JSON.stringify([...appSwift].sort())) {
  fail(`canonical Swift graph changed: ${discoveredAppSwift.join(", ")}`);
}

const bridge = read("macos/NativeBridge.js");
new Script(bridge, { filename: "macos/NativeBridge.js" });
requireMarkers("macos/NativeBridge.js", [
  "DRIFT_NATIVE_BRIDGE_VERSION = 2",
  "__driftNativeInstallAppBridge",
  "__driftNativeSaveBlob",
  "function assertSafeLeafName",
  "await abortNativeSession(error)",
]);
forbidMarkers("macos/NativeBridge.js", [
  "function clickByText",
  "querySelectorAll(\"button\")",
  "MutationObserver",
  "queuedCommands",
]);

const swift = appSwift.map(read).join("\n");
if (!swift.includes("let driftBridgeVersion = 2")) fail("Swift bridge version is not 2");
if (!read("macos/Info.plist").includes("<integer>2</integer>")) fail("Info.plist bridge version is not 2");

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
const nativeMac = read("src/lib/nativeMac.ts");
const app = read("src/App.tsx");
for (const command of fileCommands) {
  if (!bridge.includes(`"${command}"`) || !swift.includes(`"${command}"`)) {
    fail(`file command parity failed for ${command}`);
  }
}
for (const command of appCommands) {
  if (
    !bridge.includes(`"${command}"`)
    || !swift.includes(`"${command}"`)
    || !nativeMac.includes(`"${command}"`)
    || !app.includes(`"${command}"`)
  ) fail(`app command parity failed for ${command}`);
}
for (const command of ["aac-create", "aac-append", "aac-finish", "aac-close"]) {
  if (!swift.includes(`"${command}"`) || !read("src/lib/macosAacEncoder.ts").includes(`"${command}"`)) {
    fail(`AAC command parity failed for ${command}`);
  }
}

requireMarkers("src/App.tsx", [
  "installNativeMacAppBridge",
  "reportNativeMacClientState",
  "saveNativeMacBlob",
  "selectProjectMediaWithinBudget(",
  "projectMediaViolation(file.size, existingSlideBytes)",
  "projectAssetBytes(",
  "imageInputRef={imageInputRef}",
  "presenterInputRef={presenterInputRef}",
]);
requireMarkers("src/components/MediaLibrary.tsx", ["imageInputRef: RefObject", "presenterInputRef: RefObject"]);
requireMarkers("src/lib/nativeMac.ts", [
  'lastNotice: state.lastNotice ? "present" : null',
  "dispatchNativeMacFiles",
  "installedAppBridge",
]);
requireMarkers("src/lib/projectStore.ts", [
  "maxArchiveBytes: 96 * 1024 * 1024",
  "maxAssetBytes: 64 * 1024 * 1024",
  "maxTotalAssetBytes: 80 * 1024 * 1024",
]);
requireMarkers("src/lib/projectMediaBudget.ts", [
  "DEFAULT_PROJECT_BUNDLE_LIMITS.maxAssetBytes",
  "DEFAULT_PROJECT_BUNDLE_LIMITS.maxTotalAssetBytes",
  "selectProjectMediaWithinBudget",
  "projectMediaViolation",
]);
requireMarkers("tests/nativeMac.test.ts", [
  "without carrying confidential notice text into AppKit",
  "not.toContain(\"/Users/\")",
]);
requireMarkers("tests/projectMediaBudget.test.ts", [
  "64 MiB",
  "80 MiB",
  "rejectedForBudget",
  "rejectedForCount",
]);

requireMarkers("macos/App/NativeModels.swift", [
  "struct WebContentRecoveryPolicy",
  "mutating func consumeAttempt() -> Bool",
  "present (content withheld)",
  "enum TrustedWebRuntime",
  "acceptsMainFrameURL",
  "resolvingSymlinksInPath()",
  "data document",
  "sibling document",
  "final class ExportActivityGuard",
  "beginActivity(",
  ".idleSystemSleepDisabled",
  ".suddenTerminationDisabled",
  "func end()",
  "runSelfTest()",
  "driftMaximumProjectArchiveBytes: UInt64 = 96 * 1024 * 1024",
  "driftMaximumProjectAssetBytes: UInt64 = 64 * 1024 * 1024",
  "driftMaximumProjectTotalAssetBytes: UInt64 = 80 * 1024 * 1024",
]);
requireMarkers("macos/App/NativeBridgeHost.swift", [
  "private let trustedIndexURL = TrustedWebRuntime.bundledIndexURL()",
  "TrustedWebRuntime.acceptsMainFrameURL(",
  "message.frameInfo.request.url",
  "signed local studio document",
  "exportActivityGuard.update(isExporting: clientState.exportInProgress)",
  "exportActivityGuard.end()",
  "exportPowerAssertionActive",
  "size <= driftMaximumProjectAssetBytes",
  "total <= driftMaximumProjectTotalAssetBytes",
  "fileSize(at: url) <= driftMaximumProjectArchiveBytes",
  "projectAssetLimitBytes",
  "projectTotalMediaLimitBytes",
  "projectArchiveLimitBytes",
]);
requireMarkers("macos/App/NativeDocumentSession.swift", [
  "final class NativeDocumentSession",
  "func claimBootstrap(rawNonce: String) throws -> NativeDocumentTicket",
  "func beginPanel(",
  "cancelActivePanel()",
  "func invalidate()",
  "static func runSelfTest() throws",
  "A stale panel completion remained authoritative.",
]);
requireMarkers("macos/App/DriftAppDelegate.swift", [
  "private var trustedIndexURL: URL?",
  "navigationAction.targetFrame?.isMainFrame == true",
  "guard TrustedWebRuntime.acceptsMainFrameURL(webView.url, trustedIndexURL: trustedIndexURL)",
  "receivedAuthoritativeClientState",
  "scheduleRecoveryBudgetResetIfNeeded()",
  ".now() + 30",
  "didFailProvisionalNavigation",
  "webContentRecoveryPolicy.consumeAttempt()",
  "webContentRecoveryPolicy.reset()",
  "The visual engine stopped twice",
  "Recovery stability countdown active",
  "Reveal Last Saved File in Finder",
  "url-filter\":\"^https?://.*",
  "url-filter\":\"^wss?://.*",
  "url-filter\":\"^ftp://.*",
]);
requireMarkers("macos/App/NativeGauntlet.swift", [
  "second WebKit termination reopened an automatic recovery loop",
  "commit destination changed to a directory",
  "confidential renderer notice text",
]);
requireMarkers("macos/Probes/NativeGauntletMain.swift", [
  "TrustedWebRuntime.runSelfTest()",
  "ExportActivityGuard.runSelfTest()",
  "NativeFileBroker.runSelfTest()",
  "NativeGauntlet.run()",
  "NativeAacEncoderBroker.runSelfTest()",
]);
requireMarkers("macos/App/NativeFileBroker.swift", [
  "let replacementDirectory = try fileManager.url(",
  "Darwin.rename",
  "writeSessions.removeValue(forKey: sessionToken)",
  "try? fileManager.removeItem(at: session.stagingURL)",
]);

requireMarkers("macos/App/NativeAacEncoder.swift", [
  "import AudioToolbox",
  "AudioConverterNewSpecific",
  "representedFrames == leadingFrames + inputFrames + trailingFrames",
]);
forbidMarkers("macos/App/NativeAacEncoder.swift", ["FFmpeg"]);
requireMarkers("src/lib/macosAacEncoder.ts", [
  "class NativeMacAacEncoder extends CustomAudioEncoder",
  "registerEncoder(NativeMacAacEncoder)",
  "validateNativeAacReceipt",
  "buildNativeAacPacketTimeline",
]);

const packageJson = JSON.parse(read("package.json"));
const exactScripts = {
  "build:mac": "bash scripts/build-macos-app.sh",
  "verify:mac": "bash scripts/verify-macos-app.sh",
  "package:mac:dmg": "bash scripts/package-macos-dmg.sh",
  "verify:mac:dmg": "bash scripts/verify-macos-dmg.sh",
  "verify:mac-release": "bash scripts/verify-macos-release.sh",
  "release:mac": "bash scripts/release-macos-app.sh",
};
for (const [name, command] of Object.entries(exactScripts)) {
  if (packageJson.scripts?.[name] !== command) fail(`package script ${name} changed`);
}
if (!packageJson.scripts?.["check:mac-source"]?.startsWith("node scripts/check-macos-source.mjs")) {
  fail("check:mac-source no longer starts with the structural checker");
}

requireMarkers("vite.config.ts", [
  'mode === "macos"',
  '"@mediabunny/aac-encoder": macosAacShim',
  'sourcemap: mode !== "macos"',
]);
requireMarkers("scripts/build-macos-app.sh", [
  "vite build --mode macos",
  "macos/App/*.swift",
  "BuildManifest.txt",
  "verify-macos-app.sh",
  "network_entitlement=webkit-client-only",
]);
requireMarkers("scripts/verify-macos-app.sh", [
  "--smoke-test",
  "--native-self-test",
  "--webview-self-test",
  "Video: WKWebView H.264, capability-gated and output-verified",
  "Audio: Apple software AAC-LC through AudioToolbox; no FFmpeg WASM",
  "WebKit client entitlement present; application traffic blocked",
]);
for (const marker of ["*.wasm", "@mediabunny/aac-encoder", "libavcodec"]) {
  requireMarkers("scripts/build-macos-app.sh", [marker]);
  requireMarkers("scripts/verify-macos-app.sh", [marker]);
}

requireMarkers("macos/Info.plist", ["<string>13.3</string>", "UTExportedTypeDeclarations", "LSMultipleInstancesProhibited"]);
requireMarkers("macos/Drift.entitlements", [
  "com.apple.security.app-sandbox",
  "com.apple.security.files.user-selected.read-write",
  "com.apple.security.network.client",
]);
forbidMarkers("macos/Drift.entitlements", [
  "com.apple.security.network.server",
  "com.apple.security.files.downloads",
  "com.apple.security.files.user-selected.read-only",
]);

requireMarkers(".github/workflows/macos.yml", [
  "macos/Probes/NativeGauntletMain.swift",
  "probe-macos-packaged-webview.sh",
  "verify:mac:dmg",
]);
requireMarkers(".github/workflows/macos-runtime.yml", [
  "probe-macos-codecs.sh",
  "probe-macos-aac.sh",
  "run-macos-export-probe.sh",
]);
requireMarkers(".github/workflows/macos-release.yml", [
  "workflow_dispatch",
  "source_commit",
  "name: macos-release",
  "Retain text receipts only",
  "binary_uploaded=no",
  "github_release_created=no",
]);
forbidMarkers(".github/workflows/macos-release.yml", ["ref: ${{ inputs.source_ref }}"]);

console.log(
  `macOS source contract passed: ${appSwift.length} canonical Swift files, signed-index bridge and document-session authority, export power activity, stable-incident recovery, portable-project media budget parity, command parity, sandboxed WebKit client viability with application traffic blocked, codec boundaries, explicit native probes, and a non-publishing release-evidence lane.`,
);
