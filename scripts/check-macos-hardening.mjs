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

const session = requireMarkers("macos/App/NativeDocumentSession.swift", [
  "private var pendingBootstrap: NativeDocumentTicket?",
  "func prepareBootstrap() throws -> NativeDocumentTicket",
  "func claimBootstrap(rawNonce: String) throws -> NativeDocumentTicket",
  "That bootstrap token was not issued to the currently committed Drift document.",
  "func validateMessage(rawNonce: String) throws -> NativeDocumentTicket",
  "func beginPanel(",
  "cancelActivePanel()",
  "func isPreparedOrCurrent(",
  "func invalidate()",
  "An unissued document token unexpectedly bootstrapped.",
  "A stale document reclaimed authority after replacement.",
]);
if ((session.match(/UUID\(\)/g) ?? []).length < 4) {
  fail("document authority self-test and runtime must both exercise fresh native UUID generations");
}
forbidMarkers("macos/App/NativeDocumentSession.swift", [
  "func claimBootstrap(rawNonce: String) throws -> NativeDocumentTicket {\n        precondition(Thread.isMainThread)\n        let nonce = try parseNonce(rawNonce)\n        cancelActivePanel()",
]);

const host = requireMarkers("macos/App/NativeBridgeHost.swift", [
  "private let documentSession = NativeDocumentSession()",
  "let nonce = body[\"nonce\"] as? String",
  "command == \"runtime-info\"",
  "try documentSession.claimBootstrap(rawNonce: nonce)",
  "try documentSession.validateMessage(rawNonce: nonce)",
  "func prepareDocumentBootstrap() throws -> NativeDocumentTicket",
  "resetCapabilitiesForDocumentBoot()",
  "documentSession.prepareBootstrap()",
  "func invalidateDocument()",
  "documentSession.invalidate()",
  "broker.abortAll()",
  "aacBroker.closeAll()",
  "inputIntent = nil",
  "clientState = ClientState()",
  "documentAuthority\": \"native-issued",
  "beginAuthorizedPanel(",
  "documentSession.beginPanel(for: document)",
  "documentSession.finishPanel(ticket)",
  "guard self.documentSession.isCurrent(document) else",
  "self.releaseFileDescriptors(descriptors)",
  "self.releaseDirectoryGrant(token)",
  "clientState.reserveExternalProjectImport()",
  "releaseExternalProjectReservationIfNeeded",
  "Project is still busy",
  "Project could not be delivered",
  "document: NativeDocumentTicket",
  "The native callback completed after its Drift document was replaced.",
]);
forbidMarkers("macos/App/NativeBridgeHost.swift", [
  "case \"runtime-info\":\n            resetCapabilitiesForDocumentBoot()",
  "let descriptors = try urls.map { try self.broker.registerFile($0, mode: .readOnly) }",
]);
const resetStart = host.indexOf("private func resetCapabilitiesForDocumentBoot()");
const resetEnd = host.indexOf("private func runtimeInfo", resetStart);
const resetBody = host.slice(resetStart, resetEnd);
for (const marker of ["exportActivityGuard.end()", "broker.abortAll()", "aacBroker.closeAll()", "inputIntent = nil", "clientState = ClientState()"]) {
  if (!resetBody.includes(marker)) fail(`document-boot reset lost ${JSON.stringify(marker)}`);
}
if (resetBody.includes("clientStateDidChange")) {
  fail("document-boot reset must not impersonate an authoritative React state report");
}

const delegate = requireMarkers("macos/App/DriftAppDelegate.swift", [
  "private var activeDocumentTicket: NativeDocumentTicket?",
  "private var activeWebKitPanelDocument: NativeDocumentTicket?",
  "private var documentAuthorityDelivered = false",
  "func webView(_ webView: WKWebView, didStartProvisionalNavigation",
  "invalidateDocumentAuthority()",
  "func webView(_ webView: WKWebView, didCommit navigation:",
  "try bridge.prepareDocumentBootstrap()",
  "window.__driftNativeAuthorizeDocument(documentNonce)",
  "arguments: [\"documentNonce\": ticket.nonceString]",
  "bridge.isPreparedOrCurrentDocument(ticket)",
  "documentAuthorityDelivered = true",
  "receivedAuthoritativeClientState",
  "ticketCurrent",
  "webRuntimeReady = webNavigationFinished",
  "activeWebKitPanelDocument == document",
  "bridge.isCurrentDocument(document)",
  "Drift did not queue this project to replace your work later.",
  "guard pendingProjectURLs.isEmpty else",
  "pendingProjectURLs = [project]",
  "pendingProjectURLs.removeAll()",
  "let pending = pendingProjectURLs.first",
  "webContentRecoveryPolicy.consumeAttempt()",
  "The visual engine stopped twice",
]);
for (const method of [
  "func webView(_ webView: WKWebView, didFail navigation:",
  "func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation:",
  "func webViewWebContentProcessDidTerminate",
  "@objc private func reload(_ sender: Any?)",
]) {
  const start = delegate.indexOf(method);
  if (start < 0) fail(`missing lifecycle method ${method}`);
  const end = delegate.indexOf("\n    }", start);
  const body = delegate.slice(start, end);
  if (!body.includes("invalidateDocumentAuthority()")) {
    fail(`${method} must invalidate native document authority before recovery or navigation`);
  }
}
forbidMarkers("macos/App/DriftAppDelegate.swift", [
  "crypto.randomUUID",
  "activeDocumentTicket = NativeDocumentTicket(",
]);

const bridge = read("macos/NativeBridge.js");
const runtimeBootCalls = bridge.match(/callNative\("runtime-info"\)/g) ?? [];
if (runtimeBootCalls.length !== 1) {
  fail(`NativeBridge.js must make exactly one runtime-info call per document; found ${runtimeBootCalls.length}`);
}
requireMarkers("macos/NativeBridge.js", [
  "let documentNonce = null",
  "const documentAuthorization = new Promise",
  "function authorizeDocument(rawNonce)",
  "documentNonce = rawNonce",
  "await documentAuthorization",
  "handler.postMessage({ command, payload, nonce: documentNonce })",
  "__driftNativeAuthorizeDocument",
  "documentAuthority: \"native-issued\"",
  "const boot = () => {",
  "runtime?.documentAuthority !== \"native-issued\"",
  "document.addEventListener(\"DOMContentLoaded\", boot, { once: true })",
]);
forbidMarkers("macos/NativeBridge.js", [
  "crypto.randomUUID",
  "documentNonce = crypto",
  "nonce: crypto",
]);

requireMarkers("src/lib/nativeMac.ts", [
  "documentAuthority: \"native-issued\"",
  "window.__DRIFT_NATIVE_MAC__.documentAuthority === \"native-issued\"",
]);
requireMarkers("tests/nativeMac.test.ts", [
  "rejects a macOS marker without native-issued document authority",
  "documentAuthority: \"native-issued\"",
]);

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

requireMarkers("src/components/NativeFileInputBridge.tsx", [
  "nativeImportKindForInput",
  "assignFilesAndDispatchChange",
  "document.documentElement.dataset.driftNativeFileInputBridge = \"ready\"",
  "document.addEventListener(\"click\", onClick, true)",
  "event.preventDefault()",
  "event.stopImmediatePropagation()",
  "pickNativeMacFiles(kind, input.multiple)",
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
  "private var activeDocumentTicket: NativeDocumentTicket?",
  "private var documentAuthorityDelivered = false",
  "bridge?.invalidateDocument()",
  "try bridge.prepareDocumentBootstrap()",
  "window.__driftNativeAuthorizeDocument(documentNonce)",
  "hasNativeDocumentAuthority",
  "window.__DRIFT_NATIVE_MAC__?.documentAuthority === 'native-issued'",
  "private static let bootDiagnosticSource",
  "window.__driftBootDiagnostics",
  "the signed application script failed before React became authoritative",
  "hasNativeFileInputBridge: document.documentElement.dataset.driftNativeFileInputBridge === 'ready'",
  "testWebKitFileInputRoundTrip(in: webView, document: document)",
  "new File([bytes], 'wkwebview-input-probe.png'",
  "pollWebKitFileInputResult(",
  "WKWebView DataTransfer reached the hidden input but never produced one settled React asset",
  "native-issued document authority",
  "\"documentAuthorityDelivered\": documentAuthorityDelivered",
  "\"bootDiagnostics\": bootDiagnostics",
]);
forbidMarkers("macos/App/WebViewSelfTest.swift", [
  "UUID().uuidString.lowercased()",
  "window.crypto.randomUUID",
]);

console.log(
  "macOS hardening contract passed: sequence commits remain exclusive and rollback-owned; native-issued document generations bind messages, panels, broker replies, AAC, Finder imports, menu commands and packaged-runtime evidence; reload, failure and process termination revoke every capability before recovery.",
);
