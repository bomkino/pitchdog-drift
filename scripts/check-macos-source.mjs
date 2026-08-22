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
  "README.md",
  "SECURITY.md",
  "docs/REPOSITORY_MAP.md",
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
  "function authorizeDocument(rawNonce, expectedDocumentChallenge)",
  "const documentInstanceBytes = new Uint8Array(16)",
  "const documentInstanceChallenge = Array.from(",
  "expectedDocumentChallenge !== documentInstanceChallenge",
  "__driftNativeDocumentInstanceChallenge",
  "function claimNativeRuntime()",
  "await claimNativeRuntime()",
  "documentNonce",
  "__driftNativeCall",
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
  "crypto.randomUUID()",
]);
const bridgeRandomCalls = bridge.match(/crypto\.getRandomValues\(/g) ?? [];
if (bridgeRandomCalls.length !== 1) {
  fail(`NativeBridge.js must use Web Crypto exactly once for the non-authority page-instance challenge; found ${bridgeRandomCalls.length}`);
}
if (bridge.includes("documentNonce = crypto") || bridge.includes("documentNonce = documentInstanceChallenge")) {
  fail("NativeBridge.js lets web content mint document authority");
}

const swift = appSwift.map(read).join("\n");
if (!swift.includes("let driftBridgeVersion = 2")) fail("Swift bridge version is not 2");
if (!read("macos/Info.plist").includes("<integer>2</integer>")) fail("Info.plist bridge version is not 2");
for (const marker of [
  "URLSession", "NSURLSession", "import Network", "NWConnection(",
  "Darwin.socket(", "CFStreamCreatePairWithSocket", "GCDAsyncSocket",
]) {
  if (swift.includes(marker)) fail(`native app graph ships forbidden network client surface ${JSON.stringify(marker)}`);
}

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
  "openPortableProjectFile = useCallback(async (file: File, propagateFailure = false)",
  "if (propagateFailure) throw error",
  "openPortableProjectFile(file, true)",
]);
requireMarkers("src/components/MediaLibrary.tsx", ["imageInputRef: RefObject", "presenterInputRef: RefObject"]);
requireMarkers("src/lib/nativeMac.ts", [
  'lastNotice: state.lastNotice ? "present" : null',
  "dispatchNativeMacFiles",
  "installedAppBridge",
  'documentAuthority: "appkit-issued-per-document"',
  'webKitOutboundPolicyVersion: 3',
  'nativeNetworkClientSurface: "none-shipped"',
  'networkBoundary: "app-entitled-webkit-blocked"',
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
  "struct NavigationIdentityTracker",
  "A delayed callback from the replaced navigation remained current.",
  "struct NativeRuntimeSecurityFacts",
  'entitlement("com.apple.security.app-sandbox")',
  'entitlement("com.apple.security.network.client")',
  "mutating func consumeAttempt() -> Bool",
  "present (content withheld)",
  "enum TrustedWebRuntime",
  'networkPolicyIdentifier = "dog.pitch.drift.network-lock.v3"',
  'webRTCCapabilityBoundary = "page-world-document-start-lockdown"',
  "webRTCCapabilityLockdownJavaScript",
  "'RTCPeerConnection', 'webkitRTCPeerConnection'",
  "configurable: false",
  "writable: false",
  'url-filter":"^https?://.*',
  'url-filter":"^wss?://.*',
  'url-filter":"^ftp://.*',
  "acceptsMainFrameURL",
  "resolvingSymlinksInPath()",
  "data document",
  "sibling document",
  "enum TrustedNavigationPolicy",
  "shouldPerformDownload",
  "remote attachments cannot create a WKDownload",
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
  "private let documentSession = NativeDocumentSession()",
  "func prepareDocumentBootstrap() throws -> NativeDocumentTicket",
  "func invalidateDocument()",
  'body["documentNonce"] as? String',
  'command == "runtime-info"',
  "documentSession.claimBootstrap(rawNonce: documentNonce)",
  "documentSession.validateMessage(rawNonce: documentNonce)",
  "documentSession.isCurrent(document)",
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
  '"documentAuthority": "appkit-issued-per-document"',
  '"networkClientEntitled": security.networkClientEntitled',
  '"webKitOutboundPolicyInstalled": true',
  '"webKitOutboundPolicyVersion": 3',
  '"nativeNetworkClientSurface": "none-shipped"',
  '"networkBoundary": "app-entitled-webkit-blocked"',
  'function: "__driftNativeImportGranted"',
  "func deliverDocumentAuthority(",
  "__driftNativeDocumentInstanceChallenge",
  '"documentChallenge": challenge',
  "static func runReplyLifecycleSelfTest() throws",
  "Host teardown did not settle panel, broker, and AAC replies exactly once.",
  "private var pendingExternalImportCompletions: [UUID: NativeErrorCompletionOnce]",
  "trackExternalImportCompletion(completionOnMain)",
  "failPendingExternalImportsForTeardown()",
  "Host teardown did not fail an external import exactly once before its late callback.",
  "return await callable(...functionArguments)",
]);
forbidMarkers("macos/App/NativeBridgeHost.swift", [
  '"networkEntitlements": false',
  "resetCapabilitiesForDocumentBoot",
]);
requireMarkers("macos/App/NativeDocumentSession.swift", [
  "final class NativeDocumentSession",
  "func prepareBootstrap() throws -> NativeDocumentTicket",
  "func claimBootstrap(rawNonce: String) throws -> NativeDocumentTicket",
  "private var pendingBootstrap: NativeDocumentTicket?",
  "nonce.uuidString.lowercased() == rawNonce",
  "func beginPanel(",
  "clearActivePanelLocked()",
  "func invalidate()",
  "static func runSelfTest() throws",
  "A stale panel completion remained authoritative.",
  "claim before prepare",
  "uppercase claim",
  "stale reclaim",
  "return !revocationPending && activeDocument == document",
  "revocation-closed ordinary admission",
]);
requireMarkers("macos/App/DriftAppDelegate.swift", [
  "private var trustedIndexURL: URL?",
  "private var navigationIdentity = NavigationIdentityTracker()",
  "TrustedNavigationPolicy.action(",
  "TrustedNavigationPolicy.response(",
  "TrustedWebRuntime.acceptsMainFrameURL(webView.url, trustedIndexURL: trustedIndexURL)",
  "navigationIdentity.accepts(navigation)",
  "TrustedWebRuntime.networkPolicyIdentifier",
  "TrustedWebRuntime.networkPolicyJSON",
  "TrustedWebRuntime.webRTCCapabilityLockdownJavaScript",
  "func webView(_ webView: WKWebView, didCommit navigation:",
  "ticket = try bridge.prepareDocumentBootstrap()",
  "bridge.deliverDocumentAuthority(",
  "bridge.isPreparedOrCurrentDocument(ticket)",
  "documentAuthorityDelivered",
  "receivedAuthoritativeClientState",
  "scheduleRecoveryBudgetResetIfNeeded()",
  ".now() + 30",
  "didFailProvisionalNavigation",
  "webContentRecoveryPolicy.consumeAttempt()",
  "webContentRecoveryPolicy.reset()",
  "The visual engine stopped twice",
  "Recovery stability countdown active",
  "Reveal Last Saved File in Finder",
  "Browser-owned file panels do not carry Drift's document generation",
  "App Sandbox entitlement:",
  "WebKit outbound policy: blocked (v3)",
  "Native network client surface: none shipped",
  "Network boundary: app-entitled-webkit-blocked",
  "nativeBridge?.shutdown()",
  "final class NativeFinderOpenReplyOnce",
  "private var pendingProjectReply: NativeFinderOpenReplyOnce?",
  "private var inFlightProjectReplyIdentifier: UUID?",
  "inFlightProjectReplyIdentifier = reply.identifier",
  "reply.finish(error == nil ? .success : .failure)",
  "struct NativeWebViewGenerationTracker",
  "private var webViewGeneration = NativeWebViewGenerationTracker()",
  "A callback from a retired WebView generation could reach its replacement.",
  "private func ownsWebRuntime(",
  "private func retireCurrentWebView()",
  "webViewGeneration.retire()",
  "removeNativeMessageHandler(from: webView)",
  "webView.stopLoading()",
  "webView.navigationDelegate = nil",
  "webView.uiDelegate = nil",
  "generation: committedWebViewGeneration",
  "return await window.__driftNativeCommand(documentNonce, command);",
]);
forbidMarkers("macos/App/DriftAppDelegate.swift", [
  "WKDownloadDelegate",
  "WKDownload",
  "decisionHandler(.download)",
  "App network entitlement: none",
]);
const appDelegate = read("macos/App/DriftAppDelegate.swift");
const documentSession = read("macos/App/NativeDocumentSession.swift");
const isCurrentStart = documentSession.indexOf("func isCurrent(_ document: NativeDocumentTicket) -> Bool");
const isCurrentEnd = documentSession.indexOf("func isPreparedOrCurrent", isCurrentStart);
const isCurrentBody = documentSession.slice(isCurrentStart, isCurrentEnd);
if (!isCurrentBody.includes("!revocationPending && activeDocument == document")) {
  fail("public document-current admission must close as soon as revocation begins");
}
const commitStart = appDelegate.indexOf("func webView(_ webView: WKWebView, didCommit navigation:");
const finishStart = appDelegate.indexOf("func webView(_ webView: WKWebView, didFinish navigation:");
const commitBody = appDelegate.slice(commitStart, finishStart);
if (
  commitStart < 0
  || commitBody.indexOf("prepareDocumentBootstrap()") < 0
  || commitBody.indexOf("prepareDocumentBootstrap()") > commitBody.indexOf("deliverDocumentAuthority(")
) fail("AppKit must prepare document authority before delivering it to the committed page");
if (!commitBody.includes("ownsWebRuntime(") || !commitBody.includes("generation: committedWebViewGeneration")) {
  fail("document authority continuation is not bound to the exact WebView generation");
}
const deliverPendingStart = appDelegate.indexOf("private func deliverPendingProjectsIfPossible()");
const failPendingStart = appDelegate.indexOf("private func failPendingProjectOpen()", deliverPendingStart);
const deliverPendingBody = appDelegate.slice(deliverPendingStart, failPendingStart);
const externalImportStart = deliverPendingBody.indexOf("bridge.importExternalFile(");
if (
  externalImportStart < 0
  || !deliverPendingBody.includes("inFlightProjectReplyIdentifier = reply.identifier")
  || (
    deliverPendingBody.indexOf("pendingProjectReply = nil") >= 0
    && deliverPendingBody.indexOf("pendingProjectReply = nil") < externalImportStart
  )
) fail("Finder reply must remain AppDelegate-owned until the in-flight import settles");
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
    fail(`${method} is not gated to the current WebView instance`);
  }
}
const nativeModels = read("macos/App/NativeModels.swift");
const actionPolicyStart = nativeModels.indexOf("static func action(");
const responsePolicyStart = nativeModels.indexOf("static func response(", actionPolicyStart);
const actionPolicy = nativeModels.slice(actionPolicyStart, responsePolicyStart);
if (
  actionPolicy.indexOf("url.scheme?.lowercased()") < 0
  || actionPolicy.indexOf("url.scheme?.lowercased()") > actionPolicy.indexOf("if shouldPerformDownload")
) fail("navigation policy must resolve the source URL before considering a download action");

const hostAuthorityClaim = read("macos/App/NativeBridgeHost.swift");
const hostSwitch = hostAuthorityClaim.indexOf("switch command");
if (
  hostAuthorityClaim.indexOf("documentSession.claimBootstrap") < 0
  || hostAuthorityClaim.indexOf("documentSession.claimBootstrap") > hostSwitch
  || hostAuthorityClaim.indexOf("documentSession.validateMessage") > hostSwitch
) fail("native host must validate document authority before dispatching any command");

const runtimeClaimStart = bridge.indexOf("function claimNativeRuntime()");
const publicCallStart = bridge.indexOf("async function callNative", runtimeClaimStart);
const runtimeClaimBody = bridge.slice(runtimeClaimStart, publicCallStart);
if (!runtimeClaimBody.includes('postAuthorizedNative("runtime-info")')) {
  fail("NativeBridge.js runtime claim is not the one internal first native message");
}
const publicCallBody = bridge.slice(publicCallStart, bridge.indexOf("function clampFilename", publicCallStart));
if (publicCallBody.indexOf("await claimNativeRuntime()") > publicCallBody.indexOf("postAuthorizedNative(command")) {
  fail("NativeBridge.js can post a privileged command before runtime authority is claimed");
}
requireMarkers("macos/App/NativeGauntlet.swift", [
  "second WebKit termination reopened an automatic recovery loop",
  "commit destination changed to a directory",
  "confidential renderer notice text",
  "fully protected grant admission",
  "ownership-aware rollback",
]);
requireMarkers("macos/Probes/NativeGauntletMain.swift", [
  "NavigationIdentityTracker.runSelfTest()",
  "TrustedWebRuntime.runSelfTest()",
  "TrustedNavigationPolicy.runSelfTest()",
  "NativeBridgeHost.runReplyLifecycleSelfTest()",
  "ExportActivityGuard.runSelfTest()",
  "NativeFileBroker.runSelfTest()",
  "NativeGauntlet.run()",
  "NativeAacEncoderBroker.runSelfTest()",
  "NativeDocumentSession.runSelfTest()",
]);
requireMarkers("macos/App/NativeFileBroker.swift", [
  "StableReadAccess",
  "O_NOFOLLOW",
  "O_DIRECTORY",
  "Darwin.renameatx_np",
  "Darwin.unlinkat",
  "quarantineEntryName",
  "expectedDestinationIdentity",
  "requireStableDirectoryAccess",
  "let replacementDirectory = try fileManager.url(",
  "writeSessions.removeValue(forKey: sessionToken)",
  "try? fileManager.removeItem(at: session.stagingURL)",
  "var protectedDirectoryTokens",
  "try admitGrant()",
  '"QuotaExceededError"',
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
  "authorizedNativeCall",
  "window.__driftNativeCall",
]);
forbidMarkers("src/lib/macosAacEncoder.ts", [
  "messageHandlers?.driftNative",
  "handler.postMessage",
]);

requireMarkers("macos/App/WebViewSelfTest.swift", [
  "import CryptoKit",
  "activeDocumentTicket",
  "documentAuthorityDelivered",
  "bridge.prepareDocumentBootstrap()",
  "bridge.deliverDocumentAuthority(",
  "bridge.isPreparedOrCurrentDocument(ticket)",
  '"nativeDocumentActive": nativeDocumentActiveAtCompletion',
  "compileProductionNetworkPolicy()",
  "testWebKitOutboundDenial(",
  '"webKitOutboundPolicyInstalled": networkPolicyInstalled',
  "webRTCCapabilityLockdownVerified",
  "arbitraryRendererCompromiseContainmentClaimed",
  "termination-request.json",
  "termination-ack.json",
  "runTerminationProtocolSelfTest()",
  "currentProcessStartIdentity()",
  "authorityGenerationDigest(",
  "requestDigest(for:",
  "isExactControlledHarnessAssociation(",
  "A stale pre-signal uniqueness claim was accepted.",
  '"terminationAcknowledgementValidated": terminationAcknowledgementValidated',
  '"terminationRequestDigest": terminationRequestDigest',
  '"recoveredDocumentEpoch": recoveredDocumentEpoch',
  '"terminationInduced": terminationInduced',
  '"staleDocumentRejected": staleDocumentRejected',
  '"persistedAssetVerified": persistedAssetVerified',
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
if (packageJson.scripts?.["check:mac-source"]?.includes("py_compile")) {
  fail("check:mac-source recreates an ignored Python bytecode cache");
}
if (!packageJson.scripts?.["check:mac-source"]?.includes("ast.parse")) {
  fail("check:mac-source no longer parses the icon generator without writing bytecode");
}

requireMarkers("vite.config.ts", [
  'mode === "macos"',
  '"@mediabunny/aac-encoder": macosAacShim',
  'sourcemap: mode !== "macos"',
]);
requireMarkers("scripts/build-macos-app.sh", [
  "umask 022",
  "vite build --mode macos",
  "macos/App/*.swift",
  "BuildManifest.txt",
  "verify-macos-app.sh",
  "git status --porcelain=v1 --untracked-files=all",
  "DRIFT_SOURCE_REVISION does not match the checked-out commit",
  "Refusing unsafe Mac app output outside the repository build root",
  "DRIFT_MACOS_OUTPUT_DIR must be an absolute path",
  "-framework CryptoKit",
  'find "${APP_BUNDLE}" -type d -exec chmod 0755',
  "network_client_entitlement=present-in-sandbox-signature",
  "webview_outbound_policy=v3-block-http-ws-ftp",
  "webrtc_page_capability=page-world-document-start-lockdown",
  "navigation_download_policy=remote-denied-before-destination",
  "native_network_client_surface=none-shipped",
  "network_boundary=app-entitled-webkit-blocked",
]);
requireMarkers("scripts/verify-macos-app.sh", [
  "--smoke-test",
  "--native-self-test",
  "probe-macos-packaged-webview.sh",
  "webrtc_page_capability=page-world-document-start-lockdown",
  "navigation_download_policy=remote-denied-before-destination",
  "Video: WKWebView H.264, capability-gated and output-verified",
  "Audio: Apple software AAC-LC through AudioToolbox; no FFmpeg WASM",
  "WebKit outbound policy v3 blocked; no native network client shipped",
  "source revision is not one full Git SHA-1",
  "not-all-user-readable file",
  "not-all-user-traversable directory",
  "not readable and executable by every local account",
]);
requireMarkers("scripts/package-macos-dmg.sh", [
  "umask 022",
  "Refusing unsafe {label} path outside the repository build root",
  "Refusing unexpected app bundle name",
  "Mac package paths must be absolute",
  "Refusing disk image without an exact .dmg suffix",
  "Refusing checksum path that is not exactly the disk-image path plus .sha256",
  "Refusing overlapping app, disk-image, and checksum paths",
  "The DMG must be packaged from a clean, committed worktree",
  "The app source revision does not match the exact checked-out commit",
  'ditto "${APP_BUNDLE}" "${STAGE_DIR}/Drift.app"',
  "https://github.com/bomkino/pitchdog-drift/tree/${APP_SOURCE_REVISION}",
]);
forbidMarkers("scripts/package-macos-dmg.sh", ["Source, licence, privacy"]);
requireMarkers("scripts/verify-macos-dmg.sh", [
  "checksum file must contain exactly one entry",
  "checksum entry does not name the requested disk image",
  "install note does not link the exact packaged source revision",
  "mounted disk image app differs from the frozen source app",
]);
requireMarkers("scripts/release-macos-app.sh", [
  "umask 022",
  "release verification may not inherit DRIFT_SKIP_PACKAGED_WEBVIEW_SELF_TEST",
  "release construction may not inherit DRIFT_SKIP_WEB_CHECKS",
  "Refusing unsafe {label} outside the repository build root",
  "Refusing overlapping release app and output paths",
  "release app and output paths must be absolute",
  'DRIFT_MACOS_OUTPUT_DIR="$(dirname "$APP_PATH")"',
]);
requireMarkers("scripts/verify-macos-release.sh", [
  "DRIFT_SKIP_PACKAGED_WEBVIEW_SELF_TEST=0",
  "checksum set does not name exactly the archive, DMG, and manifest",
]);
forbidMarkers("scripts/build-macos-app.sh", ["application traffic blocked"]);
for (const marker of ["*.wasm", "@mediabunny/aac-encoder", "libavcodec"]) {
  requireMarkers("scripts/build-macos-app.sh", [marker]);
  requireMarkers("scripts/verify-macos-app.sh", [marker]);
}
requireMarkers("SECURITY.md", [
  "app-wide network-client entitlement",
  "no shipped native `URLSession`, Network.framework, socket",
  "remote response/download cancellation",
  "arbitrary WebKit/macOS compromise remains a residual risk",
]);
requireMarkers("docs/REPOSITORY_MAP.md", [
  "The canonical native Swift graph is `macos/App/*.swift`",
  "Protected local material",
  "Ignored does not mean disposable",
  "installed",
  "The construction workflows do not merge, tag, create a GitHub Release",
]);
requireMarkers("docs/mega-main/CURRENT_STATUS.md", [
  "Mega Main historical status snapshot",
  "Preserved from 2026-08-21",
]);
requireMarkers("README.md", [
  "signed network-client entitlement remains app-wide",
  "remote downloads never receive destination authority",
  "arbitrary WebKit or macOS compromise",
  "text-only Actions evidence suitable for a public repository",
]);
forbidMarkers("README.md", ["uploads private evidence only"]);
requireMarkers("docs/MACOS_APP.md", [
  "text-only Actions evidence suitable for a public repository",
]);
forbidMarkers("docs/MACOS_APP.md", ["creates private evidence only"]);
requireMarkers("docs/MACOS_RELEASE.md", [
  "publication-safe text receipts as an ordinary Actions artifact",
  "not a confidentiality boundary",
]);
forbidMarkers("docs/MACOS_RELEASE.md", ["private workflow artifact"]);

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

requireMarkers("scripts/probe-macos-packaged-webview.sh", [
  "unsafe evidence path outside the repository Mac build root",
  ".drift-packaged-webview-evidence-v1",
  "baseline_app_identities = matching_identities(expected_app_executable)",
  "baseline_web_content_identities = matching_identities(expected_web_content_executable)",
  "PROC_PIDTBSDINFO = 3",
  "proc_pidinfo",
  "process_start_identity",
  "run_nonce = secrets.token_hex(32)",
  "--webview-self-test-run-nonce=",
  "signal.SIGSTOP",
  "signal.SIGKILL",
  "pre_kill_web_content_identities != {termination_target_identity}",
  '"lastPreSignalCandidateSetExact": pre_kill_web_content_identities == {termination_target_identity}',
  '"targetExitObserved": True',
  '"replacementWebContentIdentityObserved"',
  '"replacementFirstObservedAtMonotonicSeconds"',
  '"controlledHarnessUniqueNewExactExecutable": True',
  '"publicAPIOwnershipClaimed": False',
  '"productionContentRuleOpenDiagnostic"',
  '"productionContentRuleDiagnosticOnly": True',
  "termination-request.json",
  "termination-ack.json",
  "probe_tcp_connections.append(connection_record)",
  "run_tcp_detector_self_test()",
  "the loopback TCP detector missed a fragmented request",
  "networkProbeAcceptedConnections",
  "networkProbeAcceptedRequests",
  "networkProbeTCPConnections",
  "webRTCUDPZeroHit",
  "webRTCUDPSTUNDatagramCount",
  "WebKit outbound policy accepted loopback TCP connections",
]);
forbidMarkers("scripts/probe-macos-packaged-webview.sh", [
  "pkill -x Drift",
  "process_start_fingerprint",
  "lstart=",
  "add-trusted-cert",
  'rm -rf "$EVIDENCE"',
]);

requireMarkers(".github/workflows/macos.yml", [
  "mm/native-foundation-gate",
  'for SOURCE in macos/App/*.swift',
  '-framework CryptoKit',
  '-framework Security',
  '-framework WebKit',
  "macos/Probes/NativeGauntletMain.swift",
  "probe-macos-packaged-webview.sh",
  "verify:mac:dmg",
  'DRIFT_SKIP_APP_BUILD: "1"',
]);
requireMarkers(".github/workflows/macos-runtime.yml", [
  "mm/native-foundation-gate",
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
requireMarkers(".github/workflows/ci.yml", [
  "mm/native-foundation-gate",
  "source_head_sha=$DRIFT_SOURCE_HEAD_SHA",
  "tested_commit_sha=$TESTED_COMMIT_SHA",
]);

console.log(
  `macOS source contract passed: ${appSwift.length} canonical Swift files, signed-index bridge and AppKit-issued generation authority, exactly-once teardown, stable anchored file capabilities, truthful Finder replies, portable-project budget parity, shared remote navigation/download denial, app-wide entitlement truth, WebRTC plus TCP/UDP outbound falsification, codec boundaries, exact-process evidence safety, and a non-publishing release lane.`,
);
