from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(
            f"{path}: expected exactly one replacement target, found {count}: {old.splitlines()[0]!r}"
        )
    write(path, text.replace(old, new, 1))


# NativeBridge.js: the page cannot mint authority. AppKit supplies one token
# only to the currently committed main frame.
replace_once(
    "macos/NativeBridge.js",
    """  let statusHost = null;
  let appBridge = null;
  let appBridgeGeneration = 0;
  const queuedImports = [];
""",
    """  const DOCUMENT_NONCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  let statusHost = null;
  let appBridge = null;
  let appBridgeGeneration = 0;
  let documentNonce = null;
  let resolveDocumentAuthorization;
  let rejectDocumentAuthorization;
  let resolveDocumentRuntime;
  let rejectDocumentRuntime;
  const documentAuthorization = new Promise((resolve, reject) => {
    resolveDocumentAuthorization = resolve;
    rejectDocumentAuthorization = reject;
  });
  const documentRuntime = new Promise((resolve, reject) => {
    resolveDocumentRuntime = resolve;
    rejectDocumentRuntime = reject;
  });
  void documentAuthorization.catch(() => undefined);
  void documentRuntime.catch(() => undefined);
  const queuedImports = [];
""",
)
replace_once(
    "macos/NativeBridge.js",
    """  async function callNative(command, payload = {}) {
    let envelope;
    try {
      envelope = await handler.postMessage({ command, payload });
    } catch (error) {
      throw error instanceof Error ? error : new DOMException(String(error), "InvalidStateError");
    }
    if (envelope?.ok) return envelope.value;
    throw nativeError(envelope?.error);
  }
""",
    """  async function postNative(command, payload, nonce) {
    let envelope;
    try {
      envelope = await handler.postMessage({ command, payload, documentNonce: nonce });
    } catch (error) {
      throw error instanceof Error ? error : new DOMException(String(error), "InvalidStateError");
    }
    if (envelope?.ok) return envelope.value;
    throw nativeError(envelope?.error);
  }

  async function authorizeDocument(rawNonce) {
    if (documentNonce !== null) return false;
    if (typeof rawNonce !== "string" || !DOCUMENT_NONCE_PATTERN.test(rawNonce)) {
      throw new DOMException("AppKit supplied an invalid local document token.", "SecurityError");
    }
    documentNonce = rawNonce;
    try {
      const runtime = await postNative("runtime-info", {}, rawNonce);
      resolveDocumentAuthorization(rawNonce);
      resolveDocumentRuntime(runtime);
      return true;
    } catch (error) {
      rejectDocumentAuthorization(error);
      rejectDocumentRuntime(error);
      throw error;
    }
  }

  async function callNative(command, payload = {}) {
    const nonce = await documentAuthorization;
    return postNative(command, payload, nonce);
  }
""",
)
replace_once(
    "macos/NativeBridge.js",
    """      __driftNativeReportClientState: { configurable: false, writable: false, value: reportClientState },
      __DRIFT_NATIVE_MAC__: {
""",
    """      __driftNativeReportClientState: { configurable: false, writable: false, value: reportClientState },
      __driftNativeAuthorizeDocument: { configurable: false, writable: false, value: authorizeDocument },
      __DRIFT_NATIVE_MAC__: {
""",
)
replace_once(
    "macos/NativeBridge.js",
    """          systemCodecsOnly: true,
        }),
""",
    """          systemCodecsOnly: true,
          documentAuthority: "native-issued",
        }),
""",
)
replace_once(
    "macos/NativeBridge.js",
    """    void callNative("runtime-info").then((runtime) => {
      window.dispatchEvent(new CustomEvent("drift-native-ready", { detail: runtime }));
    }).catch((error) => {
""",
    """    void documentRuntime.then((runtime) => {
      window.dispatchEvent(new CustomEvent("drift-native-ready", { detail: runtime }));
    }).catch((error) => {
""",
)

# NativeBridgeHost.swift: every message claims or validates the AppKit-issued
# generation before any capability or native operation is touched.
replace_once(
    "macos/App/NativeBridgeHost.swift",
    """    private let broker = NativeFileBroker()
    private let aacBroker = NativeAacEncoderBroker()
""",
    """    private let broker = NativeFileBroker()
    private let aacBroker = NativeAacEncoderBroker()
    private let documentSession = NativeDocumentSession()
""",
)
replace_once(
    "macos/App/NativeBridgeHost.swift",
    """        let payload = body["payload"] as? JSONDictionary ?? [:]

        switch command {
""",
    """        let payload = body["payload"] as? JSONDictionary ?? [:]
        let rawNonce = optionalString(body, "documentNonce") ?? ""
        do {
            _ = command == "runtime-info"
                ? try documentSession.claimBootstrap(rawNonce: rawNonce)
                : try documentSession.validateMessage(rawNonce: rawNonce)
        } catch {
            replyHandler(failureEnvelope(error), nil)
            return
        }

        switch command {
""",
)
replace_once(
    "macos/App/NativeBridgeHost.swift",
    """    func abortAllWrites() {
        exportActivityGuard.end()
        brokerQueue.sync {
            broker.abortAll()
            aacBroker.closeAll()
        }
    }

    func revealLastExportInFinder() {
""",
    """    func prepareDocumentAuthority() throws -> NativeDocumentTicket {
        precondition(Thread.isMainThread)
        let ticket = try documentSession.prepareBootstrap()
        resetCapabilitiesForDocumentBoot()
        return ticket
    }

    func isCurrentDocument(_ document: NativeDocumentTicket) -> Bool {
        precondition(Thread.isMainThread)
        return documentSession.isPreparedOrCurrent(document)
    }

    var hasActiveDocumentAuthority: Bool {
        precondition(Thread.isMainThread)
        return documentSession.hasActiveDocument
    }

    func invalidateDocument() {
        precondition(Thread.isMainThread)
        documentSession.invalidate()
        resetCapabilitiesForDocumentBoot()
    }

    func abortAllWrites() {
        exportActivityGuard.end()
        brokerQueue.sync {
            broker.abortAll()
            aacBroker.closeAll()
        }
    }

    func revealLastExportInFinder() {
""",
)
replace_once(
    "macos/App/NativeBridgeHost.swift",
    """            "nativeAac": true,
            "nativeAacProvider": "AudioToolbox",
""",
    """            "nativeAac": true,
            "nativeAacProvider": "AudioToolbox",
            "documentAuthority": "native-issued",
""",
)

# DriftAppDelegate.swift: AppKit creates and delivers the generation token at
# the trusted didCommit edge. Navigation, authority and React state are distinct
# readiness gates.
delegate_path = "macos/App/DriftAppDelegate.swift"
delegate = read(delegate_path)
delegate = delegate.replace("nativeBridge?.abortAllWrites()", "nativeBridge?.invalidateDocument()")
delegate = delegate.replace("bridge.abortAllWrites()", "bridge.invalidateDocument()")
write(delegate_path, delegate)
replace_once(
    delegate_path,
    """    private var webRuntimeReady = false
    private var receivedAuthoritativeClientState = false
""",
    """    private var webRuntimeReady = false
    private var navigationFinished = false
    private var documentAuthorityReady = false
    private var receivedAuthoritativeClientState = false
""",
)
delegate = read(delegate_path).replace(
    """        webRuntimeReady = false
        receivedAuthoritativeClientState = false
""",
    """        webRuntimeReady = false
        navigationFinished = false
        documentAuthorityReady = false
        receivedAuthoritativeClientState = false
""",
)
write(delegate_path, delegate)
replace_once(
    delegate_path,
    """        guard webRuntimeReady,
              let bridge = nativeBridge,
""",
    """        guard webRuntimeReady,
              receivedAuthoritativeClientState,
              let bridge = nativeBridge,
""",
)
replace_once(
    delegate_path,
    """    // MARK: - WebKit navigation and recovery

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard TrustedWebRuntime.acceptsMainFrameURL(webView.url, trustedIndexURL: trustedIndexURL) else {
            webRuntimeReady = false
            invalidateRecoveryStabilityWindow()
            return
        }
        webRuntimeReady = true
        deliverPendingProjectsIfPossible()
        scheduleRecoveryBudgetResetIfNeeded()
    }
""",
    """    // MARK: - WebKit navigation and recovery

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        guard TrustedWebRuntime.acceptsMainFrameURL(webView.url, trustedIndexURL: trustedIndexURL),
              let bridge = nativeBridge else {
            invalidateDocumentReadiness()
            return
        }

        webRuntimeReady = false
        navigationFinished = false
        documentAuthorityReady = false
        receivedAuthoritativeClientState = false
        invalidateRecoveryStabilityWindow()

        let ticket: NativeDocumentTicket
        do {
            ticket = try bridge.prepareDocumentAuthority()
        } catch {
            presentWarning(
                title: "Drift could not authorize its local document",
                message: (error as? BridgeFailure)?.message ?? error.localizedDescription
            )
            return
        }

        webView.callAsyncJavaScript(
            "return await window.__driftNativeAuthorizeDocument?.(nonce) === true;",
            arguments: ["nonce": ticket.nonceString],
            in: nil,
            contentWorld: .page
        ) { [weak self, weak webView, weak bridge] result in
            DispatchQueue.main.async {
                guard let self, let webView, let bridge, self.webView === webView else { return }
                guard bridge.isCurrentDocument(ticket) else { return }
                switch result {
                case .success(let value) where value as? Bool == true:
                    self.documentAuthorityReady = true
                    self.refreshWebRuntimeReadiness()
                case .success:
                    bridge.invalidateDocument()
                    self.presentWarning(
                        title: "Drift’s local document was not authorized",
                        message: "The signed WebKit document did not accept AppKit’s one-time generation token."
                    )
                case .failure(let error):
                    bridge.invalidateDocument()
                    self.presentWarning(
                        title: "Drift’s local document could not start",
                        message: error.localizedDescription
                    )
                }
            }
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard TrustedWebRuntime.acceptsMainFrameURL(webView.url, trustedIndexURL: trustedIndexURL) else {
            invalidateDocumentReadiness()
            return
        }
        navigationFinished = true
        refreshWebRuntimeReadiness()
    }

    private func refreshWebRuntimeReadiness() {
        let ready = navigationFinished
            && documentAuthorityReady
            && nativeBridge?.hasActiveDocumentAuthority == true
        webRuntimeReady = ready
        guard ready else { return }
        deliverPendingProjectsIfPossible()
        scheduleRecoveryBudgetResetIfNeeded()
        refreshMenuState()
    }

    private func invalidateDocumentReadiness() {
        nativeBridge?.invalidateDocument()
        webRuntimeReady = false
        navigationFinished = false
        documentAuthorityReady = false
        receivedAuthoritativeClientState = false
        invalidateRecoveryStabilityWindow()
        refreshMenuState()
    }
""",
)
replace_once(
    delegate_path,
    """            return webRuntimeReady && !protected
        case #selector(togglePlayback(_:)), #selector(previousSlide(_:)), #selector(nextSlide(_:)), #selector(toggleFocus(_:)):
            return webRuntimeReady && !protected
        case #selector(cancelExport(_:)):
            return webRuntimeReady && exporting
""",
    """            return webRuntimeReady && receivedAuthoritativeClientState && !protected
        case #selector(togglePlayback(_:)), #selector(previousSlide(_:)), #selector(nextSlide(_:)), #selector(toggleFocus(_:)):
            return webRuntimeReady && receivedAuthoritativeClientState && !protected
        case #selector(cancelExport(_:)):
            return webRuntimeReady && receivedAuthoritativeClientState && exporting
""",
)
replace_once(
    delegate_path,
    """    private func dispatchNativeCommand(_ command: String) {
        guard let webView else { return }
""",
    """    private func dispatchNativeCommand(_ command: String) {
        guard webRuntimeReady, receivedAuthoritativeClientState, let webView else { return }
""",
)
replace_once(
    delegate_path,
    """        Native bridge: \\(driftBridgeVersion)
        System codecs only: yes
""",
    """        Native bridge: \\(driftBridgeVersion)
        Native document authority: native-issued (\\(nativeBridge?.hasActiveDocumentAuthority == true ? "active" : "inactive"))
        System codecs only: yes
""",
)

# WebViewSelfTest.swift: exercise the same AppKit-issued didCommit path in the
# copied, signed, packaged Web resources.
self_test_path = "macos/App/WebViewSelfTest.swift"
replace_once(
    self_test_path,
    """    private var contentProcessTerminationCount = 0
    private var webKitFileInputVerified = false
""",
    """    private var contentProcessTerminationCount = 0
    private var documentAuthorityVerified = false
    private var webKitFileInputVerified = false
""",
)
self_test = read(self_test_path).replace("bridge.abortAllWrites()", "bridge.invalidateDocument()")
self_test = self_test.replace("bridge?.abortAllWrites()", "bridge?.invalidateDocument()")
write(self_test_path, self_test)
replace_once(
    self_test_path,
    "contentProcessTerminations=\\(contentProcessTerminationCount), webKitFileInputVerified=\\(webKitFileInputVerified),",
    "contentProcessTerminations=\\(contentProcessTerminationCount), documentAuthorityVerified=\\(documentAuthorityVerified), webKitFileInputVerified=\\(webKitFileInputVerified),",
)
replace_once(
    self_test_path,
    """                "contentProcessTerminationCount": contentProcessTerminationCount,
                "webKitFileInputVerified": webKitFileInputVerified,
""",
    """                "contentProcessTerminationCount": contentProcessTerminationCount,
                "documentAuthorityVerified": documentAuthorityVerified,
                "webKitFileInputVerified": webKitFileInputVerified,
""",
)
replace_once(
    self_test_path,
    """    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        committedNavigation = true
    }
""",
    """    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        committedNavigation = true
        documentAuthorityVerified = false
        guard let bridge else {
            failure = "the native bridge disappeared before document authorization"
            finished = true
            return
        }

        let ticket: NativeDocumentTicket
        do {
            ticket = try bridge.prepareDocumentAuthority()
        } catch {
            failure = "native document authority preparation failed: \\(error.localizedDescription)"
            finished = true
            return
        }

        webView.callAsyncJavaScript(
            "return await window.__driftNativeAuthorizeDocument?.(nonce) === true;",
            arguments: ["nonce": ticket.nonceString],
            in: nil,
            contentWorld: .page
        ) { [weak self, weak bridge] result in
            DispatchQueue.main.async {
                guard let self, !self.finished, let bridge else { return }
                guard bridge.isCurrentDocument(ticket) else {
                    self.failure = "the committed document lost authority before bootstrap completed"
                    self.finished = true
                    return
                }
                switch result {
                case .success(let value) where value as? Bool == true:
                    self.documentAuthorityVerified = true
                case .success:
                    self.failure = "the packaged document rejected AppKit’s generation token"
                    self.finished = true
                case .failure(let error):
                    self.failure = "native document authorization failed: \\(error.localizedDescription)"
                    self.finished = true
                }
            }
        }
    }
""",
)
replace_once(
    self_test_path,
    """        webKitFileInputVerified = false
        lastProbe = "content process terminated once; testing reload recovery"
""",
    """        documentAuthorityVerified = false
        webKitFileInputVerified = false
        lastProbe = "content process terminated once; testing reload recovery"
""",
)
replace_once(
    self_test_path,
    """          hasNativeMarker: window.__DRIFT_NATIVE_MAC__?.bridgeVersion === 2,
""",
    """          hasNativeMarker: window.__DRIFT_NATIVE_MAC__?.bridgeVersion === 2,
          hasNativeIssuedAuthority: window.__DRIFT_NATIVE_MAC__?.documentAuthority === 'native-issued',
""",
)
replace_once(
    self_test_path,
    """                && values["hasNativeMarker"] as? Bool == true
""",
    """                && values["hasNativeMarker"] as? Bool == true
                && values["hasNativeIssuedAuthority"] as? Bool == true
                && self.documentAuthorityVerified
""",
)

# Compile and execute the session model in both application and focused native
# gauntlets. The hosted workflow must include the source explicitly.
replace_once(
    "macos/App/DriftMain.swift",
    """            do {
                try NativeFileBroker.runSelfTest()
""",
    """            do {
                try NativeDocumentSession.runSelfTest()
                try NativeFileBroker.runSelfTest()
""",
)
replace_once(
    "macos/Probes/NativeGauntletMain.swift",
    """            activePhase = "export power-activity lifecycle"
            try ExportActivityGuard.runSelfTest()
""",
    """            activePhase = "native document authority"
            try NativeDocumentSession.runSelfTest()

            activePhase = "export power-activity lifecycle"
            try ExportActivityGuard.runSelfTest()
""",
)
probe = read("macos/Probes/NativeGauntletMain.swift").replace(
    "trusted-WebKit, export-activity",
    "trusted-WebKit, native-document-authority, export-activity",
)
write("macos/Probes/NativeGauntletMain.swift", probe)
replace_once(
    ".github/workflows/macos.yml",
    """            macos/App/NativeModels.swift \\
            macos/App/NativeFileBroker.swift \\
""",
    """            macos/App/NativeModels.swift \\
            macos/App/NativeDocumentSession.swift \\
            macos/App/NativeFileBroker.swift \\
""",
)

# Executable source contract.
checker = r'''import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const at = (name) => join(root, name);
const fail = (message) => { throw new Error(`native authority core failed: ${message}`); };
const read = (name) => {
  if (!existsSync(at(name))) fail(`missing ${name}`);
  return readFileSync(at(name), "utf8");
};
const requireMarkers = (name, markers) => {
  const source = read(name);
  for (const marker of markers) if (!source.includes(marker)) fail(`${name} lost ${JSON.stringify(marker)}`);
  return source;
};
const forbidMarkers = (name, markers) => {
  const source = read(name);
  for (const marker of markers) if (source.includes(marker)) fail(`${name} contains stale ${JSON.stringify(marker)}`);
};

const bridge = requireMarkers("macos/NativeBridge.js", [
  "DOCUMENT_NONCE_PATTERN",
  "const documentAuthorization = new Promise",
  "async function authorizeDocument(rawNonce)",
  'postNative("runtime-info", {}, rawNonce)',
  "documentNonce: nonce",
  "__driftNativeAuthorizeDocument",
  'documentAuthority: "native-issued"',
  "void documentRuntime.then",
]);
if ((bridge.match(/postNative\("runtime-info"/g) ?? []).length !== 1) fail("runtime-info must have one native-authorized call site");
forbidMarkers("macos/NativeBridge.js", ["crypto.getRandomValues", 'callNative("runtime-info")']);

requireMarkers("macos/App/NativeDocumentSession.swift", [
  "private var pendingBootstrap",
  "func prepareBootstrap() throws -> NativeDocumentTicket",
  "That bootstrap token was not issued",
  "func isPreparedOrCurrent",
  "nonce.uuidString.lowercased() == rawNonce",
  "A stale document reclaimed authority after replacement.",
]);
requireMarkers("macos/App/NativeBridgeHost.swift", [
  "private let documentSession = NativeDocumentSession()",
  'optionalString(body, "documentNonce")',
  "documentSession.claimBootstrap",
  "documentSession.validateMessage",
  "func prepareDocumentAuthority() throws -> NativeDocumentTicket",
  "documentSession.prepareBootstrap()",
  "func invalidateDocument()",
  "documentSession.invalidate()",
  '"documentAuthority": "native-issued"',
]);
requireMarkers("macos/App/DriftAppDelegate.swift", [
  "func webView(_ webView: WKWebView, didCommit navigation:",
  "try bridge.prepareDocumentAuthority()",
  "window.__driftNativeAuthorizeDocument?.(nonce)",
  "bridge.isCurrentDocument(ticket)",
  "documentAuthorityReady = true",
  "private func refreshWebRuntimeReadiness()",
  "receivedAuthoritativeClientState,",
  "nativeBridge?.invalidateDocument()",
  "Native document authority: native-issued",
]);
forbidMarkers("macos/App/DriftAppDelegate.swift", ["nativeBridge?.abortAllWrites()", "bridge.abortAllWrites()"]);
requireMarkers("macos/App/WebViewSelfTest.swift", [
  "private var documentAuthorityVerified = false",
  "try bridge.prepareDocumentAuthority()",
  "window.__driftNativeAuthorizeDocument?.(nonce)",
  "hasNativeIssuedAuthority",
  "self.documentAuthorityVerified",
  "bridge.invalidateDocument()",
]);
requireMarkers("macos/App/DriftMain.swift", ["NativeDocumentSession.runSelfTest()"]);
requireMarkers("macos/Probes/NativeGauntletMain.swift", ["NativeDocumentSession.runSelfTest()"]);
requireMarkers(".github/workflows/macos.yml", ["macos/App/NativeDocumentSession.swift"]);

console.log("Native authority core passed: AppKit issues the only accepted document token at didCommit, stale documents cannot self-bootstrap, every message is authenticated, and packaged WebKit exercises the same path.");
'''
write("scripts/check-native-document-authority.mjs", checker)

package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
current = package["scripts"]["check:mac-source"]
anchor = "node scripts/check-native-import-contract.mjs && "
if anchor not in current:
    raise RuntimeError("package.json authority-check anchor changed")
if "check-native-document-authority" not in current:
    package["scripts"]["check:mac-source"] = current.replace(
        anchor,
        anchor + "node scripts/check-native-document-authority.mjs && ",
        1,
    )
package_path.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")

hardening_path = ROOT / "scripts/check-macos-hardening.mjs"
hardening = hardening_path.read_text(encoding="utf-8")
hardening = hardening.replace("nativeBridge?.abortAllWrites()", "nativeBridge?.invalidateDocument()")
hardening = hardening.replace("bridge.abortAllWrites()", "bridge.invalidateDocument()")
hardening = hardening.replace("must revoke native capabilities", "must invalidate native document authority")
hardening = hardening.replace("manual reload lost its native cleanup", "manual reload lost its native document invalidation")
hardening_path.write_text(hardening, encoding="utf-8")

threat_path = ROOT / "docs/MACOS_THREAT_MODEL.md"
threat = threat_path.read_text(encoding="utf-8").rstrip()
threat += """

## Native-issued document generations

A trusted `file:` URL and main-frame check do not distinguish the document before reload from the document committed after reload. A JavaScript-generated nonce is also insufficient: a late bootstrap from a replaced document could arrive after the new document and reclaim authority.

AppKit therefore creates a fresh lower-case UUID only after WebKit commits the trusted bundled index. It delivers that token directly into the currently committed page with `callAsyncJavaScript`. The injected bridge has no self-authorizing path: `runtime-info` can claim only the token AppKit prepared, and every later message must carry that same token. Reload, failed navigation, WebContent termination, window close, and quit invalidate the generation before native capabilities are reset. Tokens are never persisted, copied into diagnostics, or exposed in error text.
"""
threat_path.write_text(threat.strip() + "\n", encoding="utf-8")

print("Applied native-issued document-authority core.")
