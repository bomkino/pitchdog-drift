import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Script } from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const at = (path) => join(root, path);
const read = (path) => readFileSync(at(path), "utf8");
const fail = (message) => {
  throw new Error(`macOS source contract failed: ${message}`);
};
const requireFile = (path) => {
  if (!existsSync(at(path))) fail(`missing ${path}`);
};
const requireText = (text, marker, label) => {
  if (!text.includes(marker)) fail(`${label} is missing ${JSON.stringify(marker)}`);
};
const forbidText = (text, marker, label) => {
  if (text.includes(marker)) fail(`${label} still contains forbidden ${JSON.stringify(marker)}`);
};

const canonicalSwift = [
  "macos/App/DriftAppDelegate.swift",
  "macos/App/DriftMain.swift",
  "macos/App/NativeBridgeHost.swift",
  "macos/App/NativeFileBroker.swift",
  "macos/App/NativeGauntlet.swift",
  "macos/App/NativeModels.swift",
  "macos/App/WebViewSelfTest.swift",
];
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
  "macos/NativeBridge-0.inc.js",
  "macos/NativeBridge-1.inc.js",
  "macos/NativeBridge-2.inc.js",
  "tmp-probe.txt",
];
const requiredFiles = [
  ...canonicalSwift,
  "macos/NativeBridge.js",
  "macos/Info.plist",
  "macos/Drift.entitlements",
  "scripts/build-macos-app.sh",
  "scripts/verify-macos-app.sh",
  "scripts/package-macos-dmg.sh",
  "scripts/generate-macos-icon.py",
  "src/lib/macosAacEncoder.ts",
  "src/lib/nativeMac.ts",
  "tests/nativeMac.test.ts",
  ".github/workflows/macos.yml",
  "docs/MACOS_APP.md",
  "docs/MACOS_PRODUCT_CONTRACT.md",
  "docs/MACOS_USER_GUIDE.md",
  "docs/MACOS_QA.md",
  "docs/MACOS_THREAT_MODEL.md",
  "docs/MACOS_RELEASE_CHECKLIST.md",
];
requiredFiles.forEach(requireFile);
stalePaths.forEach((path) => {
  if (existsSync(at(path))) fail(`stale competing implementation remains at ${path}`);
});

const unexpectedRootSwift = readdirSync(at("macos"))
  .filter((name) => name.endsWith(".swift"));
if (unexpectedRootSwift.length) {
  fail(`Swift source must live only in macos/App; found ${unexpectedRootSwift.join(", ")}`);
}

const swift = canonicalSwift.map(read).join("\n");
const bridge = read("macos/NativeBridge.js");
const app = read("src/App.tsx");
const mediaLibrary = read("src/components/MediaLibrary.tsx");
const nativeMac = read("src/lib/nativeMac.ts");
const nativeMacTests = read("tests/nativeMac.test.ts");
const build = read("scripts/build-macos-app.sh");
const verify = read("scripts/verify-macos-app.sh");
const packageDmg = read("scripts/package-macos-dmg.sh");
const vite = read("vite.config.ts");
const packageJson = read("package.json");
const info = read("macos/Info.plist");
const entitlements = read("macos/Drift.entitlements");
const macWorkflow = read(".github/workflows/macos.yml");
const macDocs = read("docs/MACOS_APP.md");
const aacShim = read("src/lib/macosAacEncoder.ts");

new Script(bridge, { filename: "macos/NativeBridge.js" });
requireText(bridge, "DRIFT_NATIVE_BRIDGE_VERSION = 2", "native bridge");
requireText(swift, "let driftBridgeVersion = 2", "Swift bridge model");
requireText(info, "<integer>2</integer>", "Info.plist bridge metadata");

for (const command of [
  "runtime-info",
  "client-state",
  "input-intent",
  "pick-save",
  "pick-directory",
  "pick-open-files",
  "write-open",
  "write-chunk",
  "write-truncate",
  "write-close",
  "write-abort",
  "file-info",
  "file-read",
  "file-release",
  "directory-get-file",
  "directory-remove-entry",
  "directory-release",
]) {
  requireText(bridge, `"${command}"`, `JavaScript bridge command ${command}`);
  requireText(swift, `"${command}"`, `Swift bridge command ${command}`);
}

for (const command of [
  "open-project",
  "add-slides",
  "add-presenter",
  "save-project",
  "export-mp4",
  "export-still",
  "export-frames",
  "toggle-playback",
  "previous-slide",
  "next-slide",
  "toggle-focus",
  "cancel-export",
]) {
  requireText(bridge, `"${command}"`, `JavaScript menu command ${command}`);
  requireText(swift, `"${command}"`, `Swift menu command ${command}`);
  requireText(nativeMac, `"${command}"`, `typed app command ${command}`);
  requireText(app, `"${command}"`, `React app command ${command}`);
}

for (const field of ["exportInProgress", "projectBusy", "saveState", "lastNotice"]) {
  requireText(bridge, field, `JavaScript client-state field ${field}`);
  requireText(swift, field, `Swift client-state field ${field}`);
  requireText(nativeMac, field, `typed client-state field ${field}`);
  requireText(app, field, `React client-state field ${field}`);
}
for (const kind of ["slides", "presenter", "project"]) {
  requireText(bridge, `"${kind}"`, `JavaScript import kind ${kind}`);
  requireText(swift, `case ${kind}`, `Swift import kind ${kind}`);
  requireText(nativeMac, `"${kind}"`, `typed import kind ${kind}`);
}

requireText(bridge, "__driftNativeInstallAppBridge", "native app bridge installer");
requireText(bridge, "__driftNativeReportClientState", "authoritative native state reporter");
requireText(app, "installNativeMacAppBridge", "React bridge installation");
requireText(app, "reportNativeMacClientState", "React authoritative state report");
requireText(app, "imageInputRef={imageInputRef}", "direct native slide action");
requireText(app, "presenterInputRef={presenterInputRef}", "direct native presenter action");
requireText(mediaLibrary, "imageInputRef: RefObject", "external slide input ref");
requireText(mediaLibrary, "presenterInputRef: RefObject", "external presenter input ref");
requireText(nativeMacTests, "instead of scraping rendered copy", "native contract falsification test");
for (const forbidden of [
  "function clickByText",
  "function readClientState",
  "querySelectorAll(\"button\")",
  ".header-status span",
  ".export-overlay",
]) {
  forbidText(bridge, forbidden, "native app contract");
}

requireText(swift, "NativeGauntlet.run()", "executable native gauntlet");
requireText(swift, "--webview-self-test", "packaged WebView self-test");
requireText(swift, "fileManager.createFile(atPath: fileURL.path", "directory create semantics");
requireText(swift, "driftMaximumNativeOutputBytes: UInt64 = 512 * 1024 * 1024", "verified output ceiling");
requireText(swift, "Cancel Export", "native cancel-export menu");
requireText(swift, "candidate.path.hasPrefix(rootPath)", "bundled-file navigation boundary");
requireText(bridge, "MAX_READBACK_BYTES = 512 * 1024 * 1024", "JavaScript readback ceiling");

requireText(build, "macos/App/*.swift", "Mac builder canonical source glob");
requireText(build, "cp macos/NativeBridge.js", "Mac builder single bridge source");
requireText(build, "vite build --mode macos", "Mac system-codec Vite build");
requireText(build, "BuildReceipt.txt", "Mac build receipt");
requireText(build, "BuildManifest.txt", "Mac resource manifest");
for (const marker of ["*.wasm", "@mediabunny/aac-encoder", "libavcodec"]) {
  requireText(build, marker, `Mac builder rejection ${marker}`);
  requireText(verify, marker, `Mac verifier rejection ${marker}`);
}

for (const marker of [
  "--smoke-test",
  "--native-self-test",
  "--webview-self-test",
  "BuildManifest.txt",
  "system-codecs-only",
  "otool -L",
  "flags=.*runtime",
]) {
  requireText(verify, marker, `Mac verifier ${marker}`);
}
requireText(packageDmg, "Install Drift.txt", "DMG user-facing install note");
requireText(packageDmg, "-readonly", "read-only mounted DMG verification");
requireText(packageDmg, "verify-macos-app.sh", "mounted app verification");
requireText(packageDmg, ".sha256", "DMG checksum");

requireText(vite, 'mode === "macos"', "Vite Mac build mode");
requireText(vite, '"@mediabunny/aac-encoder": macosAacShim', "Vite system AAC alias");
requireText(vite, 'sourcemap: mode !== "macos"', "Mac source-map exclusion");
requireText(aacShim, "Intentionally empty", "system AAC shim");
forbidText(aacShim, "registerAacEncoder();", "system AAC shim");

requireText(info, "<string>13.3</string>", "minimum macOS version");
requireText(info, "UTExportedTypeDeclarations", ".pitched exported type");
requireText(info, "LSMultipleInstancesProhibited", "single-editor app policy");
requireText(entitlements, "com.apple.security.app-sandbox", "App Sandbox entitlement");
requireText(entitlements, "com.apple.security.files.user-selected.read-write", "user-selected file entitlement");
forbidText(entitlements, "com.apple.security.network", "network entitlement policy");

requireText(packageJson, '"package:mac:dmg"', "package script");
requireText(packageJson, '"verify:mac"', "verification script");
requireText(macWorkflow, "Universal signed app and mounted DMG", "canonical macOS workflow");
requireText(macWorkflow, "DRIFT_SKIP_WEB_CHECKS", "non-duplicated Mac CI checks");
requireText(macWorkflow, "shasum -a 256 -c", "DMG checksum verification");
requireText(macDocs, "## Compiled-distribution boundary", "compiled-distribution documentation");

console.log(
  "macOS source contract passed: one typed React↔AppKit contract, seven canonical Swift files, one bridge, one workflow, and one verified 512 MiB output ceiling.",
);
