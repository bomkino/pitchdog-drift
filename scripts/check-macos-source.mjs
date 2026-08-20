import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Script } from "node:vm";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const fail = (message) => {
  throw new Error(`macOS source contract failed: ${message}`);
};
const requireText = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${JSON.stringify(needle)}`);
};
const forbidText = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} contains forbidden ${JSON.stringify(needle)}`);
};

const packageJson = JSON.parse(read("package.json"));
const vite = read("vite.config.ts");
const swift = [
  "macos/DriftMain.swift",
  "macos/DriftAppDelegate.swift",
  "macos/DriftMenus.swift",
  "macos/DriftWebKit.swift",
  "macos/NSAlert+Sheet.swift",
  "macos/NativeSupport.swift",
  "macos/NativeFileBroker.swift",
  "macos/NativeBridgeHost.swift",
].map(read).join("\n");
const bridgeParts = [
  "macos/NativeBridge-0.inc.js",
  "macos/NativeBridge-1.inc.js",
  "macos/NativeBridge-2.inc.js",
];
const bridge = bridgeParts.map(read).join("");
new Script(bridge, { filename: "NativeBridge.js" });
const info = read("macos/Info.plist");
const entitlements = read("macos/Drift.entitlements");
const build = read("scripts/build-macos-app.sh");
const verify = read("scripts/verify-macos-app.sh");
const dmg = read("scripts/package-macos-dmg.sh");
const docs = read("docs/MACOS_APP.md");

if (packageJson.scripts?.["build:mac"] !== "bash scripts/build-macos-app.sh") {
  fail("package.json must expose build:mac through the reviewed builder");
}
if (packageJson.scripts?.["verify:mac"] !== "bash scripts/verify-macos-app.sh") {
  fail("package.json must expose verify:mac through the reviewed verifier");
}
if (packageJson.scripts?.["package:mac"] !== "bash scripts/package-macos-dmg.sh") {
  fail("package.json must expose package:mac through the reviewed DMG packager");
}

requireText(vite, 'base: "./"', "vite.config.ts");
requireText(swift, "WKScriptMessageHandlerWithReply", "DriftApp.swift");
requireText(swift, "forMainFrameOnly: true", "DriftApp.swift");
requireText(swift, "message.frameInfo.isMainFrame", "DriftApp.swift");
requireText(swift, "runOpenPanelWith parameters", "DriftApp.swift");
requireText(swift, ".itemReplacementDirectory", "DriftApp.swift");
requireText(swift, "replaceItemAt", "DriftApp.swift");
requireText(swift, "--native-self-test", "DriftApp.swift");
requireText(swift, "applicationShouldHandleReopen", "DriftApp.swift");
requireText(swift, "setFrameAutosaveName", "DriftApp.swift");
requireText(swift, "webViewWebContentProcessDidTerminate", "DriftApp.swift");
forbidText(swift, "Process(", "DriftApp.swift");
forbidText(swift, "NSTask", "DriftApp.swift");

requireText(bridge, "DRIFT_NATIVE_BRIDGE_VERSION = 2", "NativeBridge.js");
requireText(bridge, 'callNative("pick-open-files"', "NativeBridge.js");
requireText(bridge, "MAX_READBACK_BYTES", "NativeBridge.js");
requireText(bridge, "__driftNativeImportGranted", "NativeBridge.js");
requireText(bridge, "MutationObserver", "NativeBridge.js");
forbidText(bridge, "eval(", "NativeBridge.js");
forbidText(bridge, "new Function", "NativeBridge.js");

requireText(info, "<integer>2</integer>", "Info.plist");
requireText(info, "dog.pitch.pitched-project", "Info.plist");
requireText(info, "AGPL-3.0-or-later", "Info.plist");
forbidText(info, "AGPL-3.0-only", "Info.plist");

requireText(entitlements, "com.apple.security.app-sandbox", "Drift.entitlements");
requireText(entitlements, "com.apple.security.files.user-selected.read-write", "Drift.entitlements");
forbidText(entitlements, "com.apple.security.network.client", "Drift.entitlements");
forbidText(entitlements, "com.apple.security.network.server", "Drift.entitlements");
forbidText(entitlements, "com.apple.security.files.user-selected.read-only", "Drift.entitlements");
forbidText(entitlements, "com.apple.security.cs.disable-library-validation", "Drift.entitlements");
forbidText(entitlements, "com.apple.security.cs.allow-unsigned-executable-memory", "Drift.entitlements");

requireText(build, "--entitlements", "build-macos-app.sh");
requireText(build, "--options runtime", "build-macos-app.sh");
requireText(build, "verify-macos-app.sh", "build-macos-app.sh");
requireText(build, "THIRD_PARTY_NOTICES.md", "build-macos-app.sh");
requireText(verify, "com.apple.security.app-sandbox", "verify-macos-app.sh");
requireText(verify, "--native-self-test", "verify-macos-app.sh");
requireText(dmg, "hdiutil", "package-macos-dmg.sh");
requireText(docs, "App Sandbox", "docs/MACOS_APP.md");
requireText(docs, "Compiled-distribution boundary", "docs/MACOS_APP.md");

console.log("macOS source contract passed: integration, bridge, sandbox, atomic writes, self-test, packaging, and documentation are wired.");
