import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const at = (path) => join(root, path);
const fail = (message) => { throw new Error(`macOS hardening contract failed: ${message}`); };
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

const broker = requireMarkers("macos/App/NativeFileBroker.swift", [
  "private let driftRenameExclusiveFlag: UInt32 = 0x00000004",
  "private struct FileIdentity: Equatable",
  "let size: UInt64",
  "let modificationSeconds: Int64",
  "let modificationNanoseconds: Int64",
  "let changeSeconds: Int64",
  "let changeNanoseconds: Int64",
  "var committedEntries: [String: FileIdentity] = [:]",
  "releaseAfterFullRead: Bool",
  "enum WriteDisposition",
  "case createOnly",
  "writeDisposition: .createOnly",
  "Darwin.renamex_np(sourcePath, destinationPath, driftRenameExclusiveFlag)",
  "directory.committedEntries[session.destinationURL.lastPathComponent] = try identity(at: session.destinationURL)",
  "guard !exists else { throw frameCollision(name) }",
  "Existing PNG sequence files are never overwritten.",
  "Drift only removes numbered frames committed by this export. An unowned file was preserved.",
  "The numbered frame changed after Drift committed it. The replacement file was preserved.",
  "Darwin.lstat(path, &metadata)",
  "if grant.releaseAfterFullRead && end >= totalSize",
  "create:true leaked an empty sequence frame before commit",
  "Commit-time frame collision unexpectedly overwrote a file",
  "Rollback deleted an unowned commit-time collision",
  "Rollback deleted a frame replaced after Drift committed it",
  "Rollback deleted an in-place modified committed frame",
  "In-place modified frame bytes changed during rollback",
  "A fully read sequence-frame grant remained live",
  "Owned sequence-frame cleanup did not remove its exact committed identity",
  "Aborted sequence write left a final frame behind",
  "fileGrants.removeAll()",
  "directoryGrants.removeAll()",
  "abortAll left a stale file capability usable",
]);
if ((broker.match(/Darwin\.renamex_np/g) ?? []).length !== 1) {
  fail("create-only sequence commit must have exactly one exclusive rename path");
}
if ((broker.match(/Darwin\.lstat/g) ?? []).length !== 1) {
  fail("rollback ownership must be based on exactly one lstat identity implementation");
}
forbidMarkers("macos/App/NativeFileBroker.swift", [
  "if !exists && create && !fileManager.createFile(atPath: fileURL.path",
  "return try registerFile(fileURL, mode: .readWrite)\n    }\n\n    func removeDirectoryEntry",
  "try fileManager.removeItem(at: fileURL)\n        fileGrants = fileGrants.filter",
]);

const host = requireMarkers("macos/App/NativeBridgeHost.swift", [
  "case \"runtime-info\":\n            resetCapabilitiesForDocumentBoot()",
  "private func resetCapabilitiesForDocumentBoot()",
  "broker.abortAll()",
  "aacBroker.closeAll()",
  "inputIntent = nil",
  "clientState = ClientState()",
  "only React may unlock the",
  "This covers manual reload",
  "clientState.reserveExternalProjectImport()",
  "releaseExternalProjectReservationIfNeeded",
  "Project is still busy",
  "Project could not be delivered",
  "completion: ((Error?) -> Void)? = nil",
  "let descriptorToken = descriptor[\"token\"] as? String",
  "releaseFileGrant(descriptorToken)",
  "private func releaseFileGrant(_ token: String?)",
  "var descriptors: [JSONDictionary] = []",
  "for descriptor in descriptors",
  "self.broker.releaseFile([\"token\": token])",
]);
forbidMarkers("macos/App/NativeBridgeHost.swift", [
  "let descriptors = try urls.map { try self.broker.registerFile($0, mode: .readOnly) }",
]);
const resetStart = host.indexOf("private func resetCapabilitiesForDocumentBoot()");
const resetEnd = host.indexOf("private func runtimeInfo()", resetStart);
const resetBody = host.slice(resetStart, resetEnd);
for (const marker of ["exportActivityGuard.end()", "broker.abortAll()", "aacBroker.closeAll()", "inputIntent = nil", "clientState = ClientState()"]) {
  if (!resetBody.includes(marker)) fail(`document-boot reset lost ${JSON.stringify(marker)}`);
}
if (resetBody.includes("clientStateDidChange")) {
  fail("document-boot reset must not impersonate an authoritative React state report");
}

requireMarkers("macos/App/NativeModels.swift", [
  "mutating func reserveExternalProjectImport() -> Bool",
  "guard !hasProtectedWork else { return false }",
  "mutating func releaseExternalProjectImportReservation()",
  "runExternalProjectImportAdmissionSelfTest",
  "A second external project import bypassed the active reservation",
  "Protected work admitted an external project replacement",
]);
requireMarkers("macos/Probes/NativeGauntletMain.swift", [
  "external Finder project admission",
  "ClientState.runExternalProjectImportAdmissionSelfTest()",
]);

const appDelegate = requireMarkers("macos/App/DriftAppDelegate.swift", [
  "Drift did not queue this project to replace your work later.",
  "guard pendingProjectURLs.isEmpty else",
  "pendingProjectURLs = [project]",
  "pendingProjectURLs.removeAll()",
  "let pending = pendingProjectURLs.first",
  "nativeBridge?.abortAllWrites()\n        invalidateRecoveryStabilityWindow()",
  "func webView(_ webView: WKWebView, didFail navigation:",
  "func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation:",
]);
for (const method of [
  "func webView(_ webView: WKWebView, didFail navigation:",
  "func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation:",
]) {
  const start = appDelegate.indexOf(method);
  const end = appDelegate.indexOf("\n    }", start);
  const body = appDelegate.slice(start, end);
  if (!body.includes("nativeBridge?.abortAllWrites()")) {
    fail(`${method} must revoke native capabilities before reporting a failed navigation`);
  }
}
const reloadStart = appDelegate.indexOf("@objc private func reload(_ sender: Any?)");
const reloadEnd = appDelegate.indexOf("@objc private func openUserGuide", reloadStart);
const reloadBody = appDelegate.slice(reloadStart, reloadEnd);
if (!reloadBody.includes("nativeBridge?.abortAllWrites()") || !reloadBody.includes("webView?.reload()")) {
  fail("manual reload lost its native cleanup or WebKit navigation");
}
if (reloadBody.indexOf("nativeBridge?.abortAllWrites()") > reloadBody.indexOf("webView?.reload()")) {
  fail("manual reload must revoke native capabilities before WebKit navigates");
}

const bridge = read("macos/NativeBridge.js");
const runtimeBootCalls = bridge.match(/callNative\("runtime-info"\)/g) ?? [];
if (runtimeBootCalls.length !== 1) {
  fail(`NativeBridge.js must make exactly one runtime-info call per document; found ${runtimeBootCalls.length}`);
}
requireMarkers("macos/NativeBridge.js", [
  "const boot = () => {",
  "document.addEventListener(\"DOMContentLoaded\", boot, { once: true })",
]);

requireMarkers("src/lib/nativeMac.ts", [
  "let installedAppBridge: NativeMacAppBridge | null = null",
  "export async function dispatchNativeMacFiles(",
  "for (const file of selected) await bridge.importFile(kind, file)",
  "installedAppBridge === bridge",
]);
requireMarkers("src/components/NativeFileInputBridge.tsx", [
  "nativeImportKindForInput",
  "dispatchNativeMacFiles",
  "document.documentElement.dataset.driftNativeFileInputBridge = \"ready\"",
  "document.addEventListener(\"click\", onClick, true)",
  "event.preventDefault()",
  "event.stopImmediatePropagation()",
  "pickNativeMacFiles(kind, input.multiple)",
  "await dispatchNativeMacFiles(kind, files)",
  "Finish or cancel the open file chooser",
  "role=\"alert\"",
  "aria-live=\"assertive\"",
]);
requireMarkers("src/main.tsx", [
  "import { NativeFileInputBridge }",
  "<NativeFileInputBridge />",
]);
requireMarkers("tests/nativeFileInputBridge.test.ts", [
  "routes portable projects",
  "routes every supported presenter spelling",
  "routes image and unknown file contracts",
]);
requireMarkers("e2e/native-menu-import.e2e.ts", [
  "A real 4 × 4 RGBA PNG",
  "replaces the demo slate through one native picker",
  "first real deck must replace those eight demos",
  "data-drift-native-file-input-bridge",
  "await state.appBridge.command(\"add-slides\")",
  "toHaveCount(1)",
  "callCount: 1",
  "releaseCount: 1",
  "File-menu picker failure remains visible and operable",
  "Dismiss native file error",
]);
forbidMarkers("e2e/native-menu-import.e2e.ts", [
  "const decodablePng",
  "initialCount + 1",
]);
requireMarkers("macos/App/WebViewSelfTest.swift", [
  "private var webKitFileInputVerified = false",
  "hasNativeFileInputBridge: document.documentElement.dataset.driftNativeFileInputBridge === 'ready'",
  "testWebKitFileInputRoundTrip(in: webView)",
  "window.showOpenFilePicker = async () => [handle]",
  "window.__driftSelfTestNativeReleaseCount += 1",
  "pollWebKitFileInputResult(",
  "never produced one settled asset and released grant",
  "typed native file ingestion",
  "\"webKitFileInputVerified\": webKitFileInputVerified",
]);
forbidMarkers("macos/App/WebViewSelfTest.swift", [
  "new DataTransfer()",
  "transfer.items.add",
  "transferCount",
]);

console.log(
  "macOS hardening contract passed: sequence commits are exclusive; rollback is full-metadata-owned and preserves collisions, replacements, or in-place mutation; frame readback grants self-revoke; document boots, reloads, and failed navigations revoke capabilities; Finder projects cannot queue surprise replacement; native import grants are transactional; File-menu imports have static, unit, real-browser, and packaged-WKWebView evidence without synthetic FileList dependence.",
);
