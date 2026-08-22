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
  "private let driftRenameSwapFlag: UInt32 = 0x00000002",
  "private struct FileIdentity: Equatable",
  "let size: UInt64",
  "let modificationSeconds: Int64",
  "let modificationNanoseconds: Int64",
  "let changeSeconds: Int64",
  "let changeNanoseconds: Int64",
  "var committedEntries: [String: FileIdentity] = [:]",
  "private final class StableReadAccess",
  "private final class StableDirectoryAccess",
  "O_RDONLY | O_CLOEXEC | O_NOFOLLOW",
  "O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW",
  "releaseAfterFullRead: Bool",
  "enum WriteDisposition",
  "case createOnly",
  "writeDisposition: .createOnly",
  "Darwin.renameatx_np(",
  "Darwin.unlinkat(parentDescriptor",
  "quarantineEntryName(",
  "restoreQuarantinedEntryName(",
  "expectedDestinationIdentity",
  "requireStableDirectoryAccess(",
  "directory.committedEntries[session.destinationURL.lastPathComponent] = committedReadAccess.admittedIdentity",
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
const commitStart = broker.indexOf("private func commitStagedWrite(");
const quarantineStart = broker.indexOf("private func quarantineEntryName(", commitStart);
const commitBody = broker.slice(commitStart, quarantineStart);
if (commitStart < 0 || !commitBody.includes("renameStagingExclusively") || !commitBody.includes("expectedDestinationIdentity")) {
  fail("staged commits lost conditional, anchored destination admission");
}
const removeStart = broker.indexOf("func removeDirectoryEntry(");
const abortStart = broker.indexOf("func abortAll()", removeStart);
const removeBody = broker.slice(removeStart, abortStart);
if (!removeBody.includes("quarantineEntryName") || !removeBody.includes("Darwin.unlinkat")) {
  fail("owned entry deletion no longer quarantines and verifies before unlink");
}
forbidMarkers("macos/App/NativeFileBroker.swift", [
  "if !exists && create && !fileManager.createFile(atPath: fileURL.path",
  "return try registerFile(fileURL, mode: .readWrite)\n    }\n\n    func removeDirectoryEntry",
  "try fileManager.removeItem(at: fileURL)\n        fileGrants = fileGrants.filter",
]);

const host = requireMarkers("macos/App/NativeBridgeHost.swift", [
  "private let documentSession = NativeDocumentSession()",
  "func prepareDocumentBootstrap() throws -> NativeDocumentTicket",
  "func invalidateDocument()",
  "documentSession.invalidate()",
  "broker.abortAll()",
  "aacBroker.closeAll()",
  "inputIntent = nil",
  "clientState = ClientState()",
  "documentSession.isCurrent(document)",
  "beginAuthorizedPanel(",
  "documentSession.beginPanel(for: document)",
  "documentSession.finishPanel(ticket)",
  "staleDocumentEnvelope()",
  "discardStaleBrokerValue",
  "discardStaleAacValue",
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
  "broker.releaseFile([\"token\": token])",
  "final class NativeReplyOnce",
  "private var pendingReplies: [UUID: NativeReplyOnce]",
  "private var pendingExternalImportCompletions: [UUID: NativeErrorCompletionOnce]",
  "trackExternalImportCompletion(completionOnMain)",
  "failPendingExternalImportsForTeardown()",
  "func shutdown()",
  "failPendingRepliesForTeardown()",
  "static func runReplyLifecycleSelfTest() throws",
]);
forbidMarkers("macos/App/NativeBridgeHost.swift", [
  "let descriptors = try urls.map { try self.broker.registerFile($0, mode: .readOnly) }",
  "resetCapabilitiesForDocumentBoot",
]);
const invalidationStart = host.indexOf("func invalidateDocument()");
const invalidationEnd = host.indexOf("var hasActiveDocument", invalidationStart);
const invalidationBody = host.slice(invalidationStart, invalidationEnd);
for (const marker of ["documentSession.invalidate()", "exportActivityGuard.end()", "broker.abortAll()", "aacBroker.closeAll()", "inputIntent = nil", "clientState = ClientState()"]) {
  if (!invalidationBody.includes(marker)) fail(`document invalidation lost ${JSON.stringify(marker)}`);
}
if (invalidationBody.includes("clientStateDidChange")) {
  fail("document invalidation must not impersonate an authoritative React state report");
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
  "guard pendingProjectReply == nil",
  "inFlightProjectReplyIdentifier == nil",
  "pendingProjectURLs = [project]",
  "pendingProjectURLs.removeAll()",
  "let pending = pendingProjectURLs.first",
  "invalidateDocumentAuthority()",
  "ticket = try bridge.prepareDocumentBootstrap()",
  "bridge.deliverDocumentAuthority(",
  "nativeBridge?.shutdown()",
  "final class NativeFinderOpenReplyOnce",
  "private var pendingProjectReply: NativeFinderOpenReplyOnce?",
  "inFlightProjectReplyIdentifier = reply.identifier",
  "reply.finish(error == nil ? .success : .failure)",
  "struct NativeWebViewGenerationTracker",
  "private var webViewGeneration = NativeWebViewGenerationTracker()",
  "A callback from a retired WebView generation could reach its replacement.",
  "private func ownsWebRuntime(",
  "private func retireCurrentWebView()",
  "webViewGeneration.retire()",
  "webView.stopLoading()",
  "webView.navigationDelegate = nil",
  "webView.uiDelegate = nil",
  "generation: committedWebViewGeneration",
  "TrustedNavigationPolicy.action(",
  "TrustedNavigationPolicy.response(",
  "bridge.isCurrentDocument(ticket)",
  "func webView(_ webView: WKWebView, didFail navigation:",
  "func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation:",
]);
const documentSession = read("macos/App/NativeDocumentSession.swift");
const currentStart = documentSession.indexOf("func isCurrent(_ document: NativeDocumentTicket) -> Bool");
const currentEnd = documentSession.indexOf("func isPreparedOrCurrent", currentStart);
if (!documentSession.slice(currentStart, currentEnd).includes("!revocationPending && activeDocument == document")) {
  fail("ordinary broker/AAC admission remains open while document revocation drains");
}
const deliverPendingStart = appDelegate.indexOf("private func deliverPendingProjectsIfPossible()");
const failPendingStart = appDelegate.indexOf("private func failPendingProjectOpen()", deliverPendingStart);
const deliverPendingBody = appDelegate.slice(deliverPendingStart, failPendingStart);
const externalImportStart = deliverPendingBody.indexOf("bridge.importExternalFile(");
if (
  !deliverPendingBody.includes("inFlightProjectReplyIdentifier = reply.identifier")
  || externalImportStart < 0
  || (
    deliverPendingBody.indexOf("pendingProjectReply = nil") >= 0
    && deliverPendingBody.indexOf("pendingProjectReply = nil") < externalImportStart
  )
) {
  fail("Finder reply ownership is dropped before the external import reaches a terminal result");
}
for (const method of [
  "func webView(_ webView: WKWebView, didFail navigation:",
  "func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation:",
]) {
  const start = appDelegate.indexOf(method);
  const end = appDelegate.indexOf("\n    }", start);
  const body = appDelegate.slice(start, end);
  if (!body.includes("invalidateDocumentAuthority()")) {
    fail(`${method} must revoke native capabilities before reporting a failed navigation`);
  }
}
for (const method of [
  "func applicationWillTerminate(",
  "func windowWillClose(",
]) {
  const start = appDelegate.indexOf(method);
  const end = appDelegate.indexOf("\n    }", start);
  const body = appDelegate.slice(start, end);
  if (!body.includes("navigationIdentity.invalidate()") || !body.includes("retireCurrentWebView()") || !body.includes("nativeBridge?.shutdown()")) {
    fail(`${method} lost synchronous authority and native-resource teardown`);
  }
  if (body.indexOf("navigationIdentity.invalidate()") > body.indexOf("nativeBridge?.shutdown()")) {
    fail(`${method} must revoke navigation identity before native shutdown`);
  }
  if (body.indexOf("retireCurrentWebView()") > body.indexOf("nativeBridge?.shutdown()")) {
    fail(`${method} must retire the exact WebView generation before native shutdown`);
  }
}
for (const method of [
  "didStartProvisionalNavigation navigation:",
  "didCommit navigation:",
  "didFinish navigation:",
  "didFail navigation:",
  "didFailProvisionalNavigation navigation:",
  "webViewWebContentProcessDidTerminate",
]) {
  const start = appDelegate.indexOf(method);
  const end = appDelegate.indexOf("\n    }", start);
  if (start < 0 || !appDelegate.slice(start, end).includes("ownsWebRuntime(webView")) {
    fail(`${method} can mutate a reopened window from a retired WebView callback`);
  }
}
const reloadStart = appDelegate.indexOf("@objc private func reload(_ sender: Any?)");
const reloadEnd = appDelegate.indexOf("@objc private func openUserGuide", reloadStart);
const reloadBody = appDelegate.slice(reloadStart, reloadEnd);
if (!reloadBody.includes("invalidateDocumentAuthority()") || !reloadBody.includes("webView?.reload()")) {
  fail("manual reload lost its native cleanup or WebKit navigation");
}
if (reloadBody.indexOf("invalidateDocumentAuthority()") > reloadBody.indexOf("webView?.reload()")) {
  fail("manual reload must revoke native capabilities before WebKit navigates");
}
forbidMarkers("macos/App/DriftAppDelegate.swift", [
  "WKDownloadDelegate",
  "decisionHandler(.download)",
  "download.delegate = self",
]);

const bridge = read("macos/NativeBridge.js");
const runtimeBootPosts = bridge.match(/postAuthorizedNative\("runtime-info"\)/g) ?? [];
if (runtimeBootPosts.length !== 1) {
  fail(`NativeBridge.js must make exactly one internal runtime-info post per document; found ${runtimeBootPosts.length}`);
}
requireMarkers("macos/NativeBridge.js", [
  "const boot = () => {",
  "function authorizeDocument(rawNonce, expectedDocumentChallenge)",
  "__driftNativeDocumentInstanceChallenge",
  "function claimNativeRuntime()",
  "await claimNativeRuntime()",
  "documentNonce",
  "document.addEventListener(\"DOMContentLoaded\", boot, { once: true })",
]);
forbidMarkers("macos/NativeBridge.js", ["crypto.randomUUID()"]);
if ((bridge.match(/crypto\.getRandomValues\(/g) ?? []).length !== 1) {
  fail("the page-instance challenge must use exactly one Web Crypto draw");
}
if (bridge.includes("documentNonce = crypto") || bridge.includes("documentNonce = documentInstanceChallenge")) {
  fail("web content can mint native document authority");
}

requireMarkers("src/lib/nativeMac.ts", [
  "let installedAppBridge: NativeMacAppBridge | null = null",
  "export async function dispatchNativeMacFiles(",
  "for (const file of selected) await bridge.importFile(kind, file)",
  "installedAppBridge === bridge",
]);
requireMarkers("src/App.tsx", [
  "openPortableProjectFile = useCallback(async (file: File, propagateFailure = false)",
  "if (propagateFailure) throw error",
  "openPortableProjectFile(file, true)",
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
  "durably reloads one ordered native batch",
  "first real deck must replace those eight demos",
  "data-drift-native-file-input-bridge",
  "await state.appBridge.command(\"add-slides\")",
  "toHaveCount(2)",
  "menu-import-1.png",
  "menu-import-2.png",
  "callCount: 1",
  "releaseCount: 2",
  "File-menu picker failure remains visible and operable",
  "Dismiss native file error",
  "Finder-style project delivery rejects malformed archives instead of acknowledging a false open",
  "await state.appBridge.importFile(",
]);
forbidMarkers("e2e/native-menu-import.e2e.ts", [
  "const decodablePng",
  "initialCount + 1",
]);
requireMarkers("macos/App/WebViewSelfTest.swift", [
  "import CryptoKit",
  "private var webKitFileInputVerified = false",
  "hasNativeFileInputBridge: document.documentElement.dataset.driftNativeFileInputBridge === 'ready'",
  "testWebKitFileInputRoundTrip(",
  "document: NativeDocumentTicket",
  "bridge.importExternalFile(url, kind: .slides)",
  "releaseCountBeforeImport = bridge.releasedFileGrantCount",
  "pollNativeImportResult(",
  "let count = values[\"count\"] as? Int ?? -1",
  "count == 1, found, released, self.nativeImportCompletionVerified, idleAndSaved",
  "real native import never reached one saved asset with a released grant",
  "termination-request.json",
  "runTerminationProtocolSelfTest()",
  "currentProcessStartIdentity()",
  "authorityGenerationDigest(",
  "requestDigest(for:",
  "simulatedRecoveryAcknowledgement(",
  '"recoveryMode": "simulated-public-delegate-seam"',
  '"externalProcessKilled": externalProcessKilled',
  '"publicAPIOwnershipClaimed": publicAPIOwnershipClaimed',
  "terminationAcknowledgementValidated",
  "recoveredDocumentEpoch > terminationDocumentEpoch",
  "webRTCCapabilityLockdownVerified",
  "arbitraryRendererCompromiseContainmentClaimed",
  "real native broker import",
  "\"webKitFileInputVerified\": webKitFileInputVerified",
  "\"nativeImportCompletionVerified\": nativeImportCompletionVerified",
]);
forbidMarkers("macos/App/WebViewSelfTest.swift", [
  "new DataTransfer()",
  "transfer.items.add",
  "transferCount",
]);
requireMarkers("scripts/probe-macos-packaged-webview.sh", [
  "PROC_PIDTBSDINFO = 3",
  "process_start_identity",
  "run_nonce = secrets.token_hex(32)",
  "--webview-self-test-run-nonce=",
  '"recoveryMode": "simulated-public-delegate-seam"',
  '"externalProcessKilled": False',
  '"signalSentToWebContent": False',
  '"publicAPIOwnershipClaimed": False',
  '"processTerminationClaimed": False',
  "probe_tcp_connections.append(connection_record)",
  "run_tcp_detector_self_test()",
  "networkProbeAcceptedConnections",
  "resolve_existing_executable_binding",
  '"requestAppExecutableBinding"',
  '"harness-binding-failure"',
  '"identity-setup-failure"',
]);
forbidMarkers("scripts/probe-macos-packaged-webview.sh", [
  "pkill -x Drift",
  "process_start_fingerprint",
  "lstart=",
  "add-trusted-cert",
  "signal.SIGSTOP",
  "os.kill(termination_target_identity.pid",
  '"killSucceeded": True',
  '"targetExitObserved": True',
  '"controlledHarnessUniqueNewExactExecutable": True',
  '"replacementWebContentIdentityObserved"',
  "more than one distinct replacement WebContent identity appeared",
  "expected_web_content_executable",
  "baseline_web_content_identities",
  "observe_post_exit_exact_identities",
  "termination_target_identity",
]);

console.log(
  "macOS hardening contract passed: stable descriptor-backed reads; anchored conditional commits; ownership-preserving quarantine deletion; generation-linearized mutation; exactly-once teardown replies; truthful Finder open failure propagation; shared remote navigation/download denial; and real browser plus packaged-WKWebView import evidence.",
);
