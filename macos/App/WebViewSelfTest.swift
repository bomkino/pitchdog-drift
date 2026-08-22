import AppKit
import CryptoKit
import Darwin
import Foundation
import WebKit

final class WebViewSelfTest: NSObject, WKNavigationDelegate {
    private enum Phase: String {
        case initialBoot
        case importingNativeFile
        case recoveringDocument
        case complete
    }

    private struct ProcessStartIdentity: Equatable {
        let seconds: UInt64
        let microseconds: UInt64
    }

    private struct ExternalTerminationBinding {
        let receiptName: String
        let runNonce: String
        let bundleIdentifier: String
        let bundleVersion: String
        let sourceRevision: String
        let appExecutablePath: String
        let appPID: Int
        let appStart: ProcessStartIdentity
        let phase: String
        let sequence: Int
        let documentEpoch: UInt64
        let authorityGenerationDigest: String
        let networkPolicyIdentifier: String
        let requestDigest: String
    }

    private let receiptName: String?
    private let networkProbeURL: URL?
    private let runNonce: String?
    private var window: NSWindow?
    private var webView: WKWebView?
    private var bridge: NativeBridgeHost?
    private var activeDocumentTicket: NativeDocumentTicket?
    private var finished = false
    private var failure: String?
    private var startedNavigation = false
    private var committedNavigation = false
    private var finishedNavigation = false
    private var documentAuthorityDelivered = false
    private var contentProcessTerminationCount = 0
    private var webKitFileInputVerified = false
    private var nativeImportCompletionVerified = false
    private var nativeDocumentActiveAtCompletion = false
    private var recoveryDelegateSeamSimulated = false
    private var recoveryDelegateSeamInvocationCount = 0
    private let externalProcessKilled = false
    private let publicAPIOwnershipClaimed = false
    private let processTerminationClaimed = false
    private var staleDocumentRejected = false
    private var recoveredCommandVerified = false
    private var persistedAssetVerified = false
    private var isolatedDatabaseCleanupVerified = false
    private var runtimeBuildIdentityVerified = false
    private var lastProbe = "no probe completed"
    private var bootDiagnostics = "none"
    private let isolatedDatabaseName = "drift-project-self-test-\(UUID().uuidString.lowercased())"
    private let probeAssetName = "drift-native-production-path-probe.png"
    private var phase = Phase.initialBoot
    private var staleDocumentNonce: String?
    private var probeAssetURL: URL?
    private var releaseCountBeforeImport = 0
    private var navigationIdentity = NavigationIdentityTracker()
    private var networkPolicyInstalled = false
    private var outboundProbeAttempted = false
    private var outboundProbeCompleted = false
    private var outboundProbeResult = "not attempted"
    private var webRTCCapabilityLockdownVerified = false
    private var webRTCProbeToken: String?
    private var pendingTerminationBinding: ExternalTerminationBinding?
    private var terminationAcknowledgementValidated = false
    private var terminationDocumentEpoch: UInt64?
    private var recoveredDocumentEpoch: UInt64?
    private var terminationRequestDigest: String?
    private var recoveredDocumentVerificationStarted = false

    private init(receiptName: String?, networkProbeURL: URL?, runNonce: String?) {
        self.receiptName = receiptName
        self.networkProbeURL = networkProbeURL
        self.runNonce = runNonce
        super.init()
    }

    static func run(
        receiptName: String? = nil,
        networkProbeURL: URL? = nil,
        runNonce: String? = nil
    ) -> Int32 {
        let application = NSApplication.shared
        // A WKWebView media/GPU process is not faithfully exercised under the
        // prohibited activation policy used by command-line-only tools. The
        // real app is regular; accessory gives the self-test a real WindowServer
        // lifecycle without adding a second Dock application.
        application.setActivationPolicy(.accessory)
        application.finishLaunching()
        let harness = WebViewSelfTest(
            receiptName: receiptName,
            networkProbeURL: networkProbeURL,
            runNonce: runNonce
        )
        return harness.execute()
    }

    static func runTerminationProtocolSelfTest() throws {
        let receiptName = "matrix-protocol-self-test.json"
        let runNonce = String(repeating: "ab", count: 32)
        let bundleIdentifier = "dog.pitch.drift"
        let bundleVersion = "42"
        let sourceRevision = "684855acbebc633fef4ba25227ad2711d7d444f6"
        let appExecutablePath = "/Applications/Drift.app/Contents/MacOS/Drift"
        let appPID = 4_242
        let appStart = ProcessStartIdentity(seconds: 1_700_000_000, microseconds: 123_456)
        let document = NativeDocumentTicket(
            nonce: UUID(uuidString: "12345678-1234-5678-1234-567812345678")!,
            epoch: 7
        )
        let authorityDigest = authorityGenerationDigest(
            receiptName: receiptName,
            runNonce: runNonce,
            bundleIdentifier: bundleIdentifier,
            bundleVersion: bundleVersion,
            sourceRevision: sourceRevision,
            appExecutablePath: appExecutablePath,
            appPID: appPID,
            appStart: appStart,
            document: document
        )
        guard authorityDigest == "fba4843b0d216b9c617a3828af1576ef63ad00076aef24f751c9e7b3d54e6b41" else {
            throw BridgeFailure("DataError", "Authority-generation canonical digest changed.")
        }
        let unsigned = ExternalTerminationBinding(
            receiptName: receiptName,
            runNonce: runNonce,
            bundleIdentifier: bundleIdentifier,
            bundleVersion: bundleVersion,
            sourceRevision: sourceRevision,
            appExecutablePath: appExecutablePath,
            appPID: appPID,
            appStart: appStart,
            phase: "awaiting-webcontent-termination",
            sequence: 1,
            documentEpoch: document.epoch,
            authorityGenerationDigest: authorityDigest,
            networkPolicyIdentifier: TrustedWebRuntime.networkPolicyIdentifier,
            requestDigest: ""
        )
        let binding = ExternalTerminationBinding(
            receiptName: unsigned.receiptName,
            runNonce: unsigned.runNonce,
            bundleIdentifier: unsigned.bundleIdentifier,
            bundleVersion: unsigned.bundleVersion,
            sourceRevision: unsigned.sourceRevision,
            appExecutablePath: unsigned.appExecutablePath,
            appPID: unsigned.appPID,
            appStart: unsigned.appStart,
            phase: unsigned.phase,
            sequence: unsigned.sequence,
            documentEpoch: unsigned.documentEpoch,
            authorityGenerationDigest: unsigned.authorityGenerationDigest,
            networkPolicyIdentifier: unsigned.networkPolicyIdentifier,
            requestDigest: requestDigest(for: unsigned)
        )
        guard binding.requestDigest == "0fc7af30e7d12a38bc80fa19237fbb54b0b43c9fd021d52964076cb85db8c469",
              isCryptographicRunNonce(runNonce),
              !isCryptographicRunNonce(String(repeating: "g", count: 64)) else {
            throw BridgeFailure("DataError", "Termination-request canonical digest or run-nonce validation changed.")
        }
        var acknowledgementObject: [String: Any] = [
            "schemaVersion": 2,
            "receiptName": binding.receiptName,
            "runNonce": binding.runNonce,
            "bundleIdentifier": binding.bundleIdentifier,
            "bundleVersion": binding.bundleVersion,
            "sourceRevision": binding.sourceRevision,
            "appExecutablePath": binding.appExecutablePath,
            "appPID": binding.appPID,
            "appStartSeconds": Int(binding.appStart.seconds),
            "appStartMicroseconds": Int(binding.appStart.microseconds),
            "phase": binding.phase,
            "sequence": binding.sequence,
            "documentEpoch": Int(binding.documentEpoch),
            "authorityGenerationDigest": binding.authorityGenerationDigest,
            "networkPolicyIdentifier": binding.networkPolicyIdentifier,
            "requestDigest": binding.requestDigest,
            "recoveryMode": "simulated-public-delegate-seam",
            "externalProcessKilled": false,
            "signalSentToWebContent": false,
            "publicAPIOwnershipClaimed": false,
            "processTerminationClaimed": false,
        ]
        guard Self.simulatedRecoveryAcknowledgement(acknowledgementObject, exactlyEchoes: binding) else {
            throw BridgeFailure("DataError", "An exact simulated-recovery acknowledgement was rejected.")
        }
        acknowledgementObject["sequence"] = 2
        guard !Self.simulatedRecoveryAcknowledgement(acknowledgementObject, exactlyEchoes: binding) else {
            throw BridgeFailure("DataError", "A tampered simulated-recovery acknowledgement was accepted.")
        }
        _ = try currentProcessStartIdentity()
        print("Drift recovery-protocol self-test passed: canonical digests, exact acknowledgement echoes, no external process signal or PID claim, nonce validation, and public libproc app identity.")
    }

    private func execute() -> Int32 {
        guard let runNonce, Self.isCryptographicRunNonce(runNonce) else {
            return failReceipt("the launcher supplied no valid 256-bit packaged-test run nonce")
        }
        guard let bridgeURL = Bundle.main.url(forResource: "NativeBridge", withExtension: "js"),
              let bridgeSource = try? String(contentsOf: bridgeURL, encoding: .utf8),
              let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") else {
            return failReceipt("bundled runtime is missing")
        }
        guard let networkRuleList = compileProductionNetworkPolicy() else {
            return failReceipt(failure ?? "the production local-only network policy did not compile")
        }

        let configuration = WKWebViewConfiguration()
        // This is the production persistent store. A document-start database
        // namespace keeps test records isolated without using WebKit's
        // semantically different non-persistent Blob/File implementation.
        configuration.websiteDataStore = driftWebsiteDataStore()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.suppressesIncrementalRendering = false
        configuration.userContentController.add(networkRuleList)
        configuration.userContentController.addUserScript(WKUserScript(
            source: TrustedWebRuntime.webRTCCapabilityLockdownJavaScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false,
            in: .page
        ))
        configuration.userContentController.addUserScript(WKUserScript(
            source: Self.bootDiagnosticSource,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true,
            in: .page
        ))
        configuration.userContentController.addUserScript(WKUserScript(
            source: "Object.defineProperty(window, '__DRIFT_NATIVE_SELF_TEST_DB__', { configurable: false, writable: false, value: '\(isolatedDatabaseName)' });",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true,
            in: .page
        ))
        configuration.userContentController.addUserScript(WKUserScript(
            source: bridgeSource,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true,
            in: .page
        ))

        let bridge = NativeBridgeHost()
        configuration.userContentController.addScriptMessageHandler(
            bridge,
            contentWorld: .page,
            name: driftBridgeName
        )
        self.bridge = bridge

        let webView = WKWebView(
            frame: NSRect(x: 0, y: 0, width: 1200, height: 800),
            configuration: configuration
        )
        webView.navigationDelegate = self
        webView.underPageBackgroundColor = NSColor(calibratedWhite: 0.035, alpha: 1)
        bridge.webView = webView
        self.webView = webView

        // Keep the compositor honest. Hosted WebKit needs a normal visible
        // WindowServer lifecycle to exercise the same topology as Drift.app.
        let window = NSWindow(
            contentRect: NSRect(x: 80, y: 80, width: 1200, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.isReleasedWhenClosed = false
        window.title = "Drift packaged-runtime verification"
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
        self.window = window

        webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())

        let deadline = Date().addingTimeInterval(75)
        while !finished && Date() < deadline {
            RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.05))
        }

        let state = bridge.clientState
        nativeDocumentActiveAtCompletion = bridge.hasActiveDocument
        let diagnostic = diagnosticMessage(webView: webView, state: state)
        cleanup(configuration: configuration, webView: webView, window: window, bridge: bridge)

        if let failure {
            return failReceipt("\(failure); \(diagnostic)", state: state)
        }
        guard finished else {
            return failReceipt("timed out after 75 seconds; \(diagnostic)", state: state)
        }
        guard webKitFileInputVerified else {
            return failReceipt("the packaged WebKit native-file round-trip never completed; \(diagnostic)", state: state)
        }
        guard nativeImportCompletionVerified,
              terminationAcknowledgementValidated,
              recoveryDelegateSeamSimulated,
              recoveryDelegateSeamInvocationCount == 1,
              contentProcessTerminationCount == 0,
              !externalProcessKilled,
              !publicAPIOwnershipClaimed,
              !processTerminationClaimed,
              staleDocumentRejected,
              recoveredCommandVerified,
              persistedAssetVerified,
              outboundProbeAttempted,
              outboundProbeCompleted,
              webRTCCapabilityLockdownVerified,
              let terminationDocumentEpoch,
              let recoveredDocumentEpoch,
              recoveredDocumentEpoch > terminationDocumentEpoch,
              nativeDocumentActiveAtCompletion else {
            return failReceipt("the packaged document-recovery authority contract did not hold; \(diagnostic)", state: state)
        }

        let message = "persistent isolated Blob storage, AppKit-issued document authority, real native broker import, exact saved state, simulated public delegate-seam recovery with no external process signal, stale-generation rejection, rehydrated media, page-world WebRTC capability lockdown, and fresh non-mutating host dispatch authority all held"
        writeReceipt(ok: true, message: message, state: state)
        print("Drift WebView self-test passed: \(message).")
        return 0
    }

    private func cleanup(
        configuration: WKWebViewConfiguration,
        webView: WKWebView,
        window: NSWindow,
        bridge: NativeBridgeHost
    ) {
        deleteIsolatedProjectDatabase(in: webView)
        if !isolatedDatabaseCleanupVerified, failure == nil {
            failure = "the isolated packaged-test project database was not deleted"
        }
        bridge.invalidateDocument()
        navigationIdentity.invalidate()
        webView.stopLoading()
        webView.navigationDelegate = nil
        window.orderOut(nil)
        window.close()
        configuration.userContentController.removeScriptMessageHandler(
            forName: driftBridgeName,
            contentWorld: .page
        )
        if let probeAssetURL {
            try? FileManager.default.removeItem(at: probeAssetURL.deletingLastPathComponent())
        }
        removeExternalTerminationFiles()
    }

    private func diagnosticMessage(webView: WKWebView, state: ClientState) -> String {
        "phase=\(phase.rawValue), started=\(startedNavigation), committed=\(committedNavigation), finishedNavigation=\(finishedNavigation), documentAuthorityDelivered=\(documentAuthorityDelivered), nativeDocumentActive=\(nativeDocumentActiveAtCompletion || bridge?.hasActiveDocument == true), networkPolicyInstalled=\(networkPolicyInstalled), outboundProbeAttempted=\(outboundProbeAttempted), outboundProbeCompleted=\(outboundProbeCompleted), webRTCCapabilityLockdownVerified=\(webRTCCapabilityLockdownVerified), webRTCProbeToken=\(webRTCProbeToken ?? "none"), outboundProbeResult=\(outboundProbeResult), actualContentProcessTerminations=\(contentProcessTerminationCount), recoveryDelegateSeamSimulated=\(recoveryDelegateSeamSimulated), staleDocumentRejected=\(staleDocumentRejected), recoveredCommandVerified=\(recoveredCommandVerified), persistedAssetVerified=\(persistedAssetVerified), webKitFileInputVerified=\(webKitFileInputVerified), nativeImportCompletionVerified=\(nativeImportCompletionVerified), isLoading=\(webView.isLoading), url=\(webView.url?.absoluteString ?? "nil"), saveState=\(state.saveState), projectBusy=\(state.projectBusy), exportInProgress=\(state.exportInProgress), bootDiagnostics=\(bootDiagnostics), lastProbe=\(lastProbe)"
    }

    private func failReceipt(_ message: String, state: ClientState = ClientState()) -> Int32 {
        writeReceipt(ok: false, message: message, state: state)
        fputs("Drift WebView self-test failed: \(message)\n", stderr)
        return 1
    }

    private func writeReceipt(ok: Bool, message: String, state: ClientState) {
        guard let receiptName else { return }
        guard receiptName.range(of: #"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"#, options: .regularExpression) != nil else {
            fputs("Drift WebView self-test could not write an unsafe receipt name.\n", stderr)
            return
        }
        do {
            let directory = try selfTestDirectory()
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let url = directory.appendingPathComponent(receiptName, isDirectory: false)
            let security = NativeRuntimeSecurityFacts.current()
            let receipt: [String: Any] = [
                "schemaVersion": 2,
                "ok": ok,
                "message": message,
                "bundleIdentifier": Bundle.main.bundleIdentifier ?? NSNull(),
                "bundleVersion": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") ?? NSNull(),
                "sourceRevision": Bundle.main.object(forInfoDictionaryKey: "DriftSourceRevision") ?? NSNull(),
                "buildChannel": driftBuildChannel,
                "cacheNamespace": driftCacheNamespace,
                "storageNamespace": driftStorageNamespace,
                "websiteDataStoreIdentifier": Bundle.main.object(forInfoDictionaryKey: "DriftWebsiteDataStoreIdentifier") ?? NSNull(),
                "runtimeBuildIdentityVerified": runtimeBuildIdentityVerified,
                "startedNavigation": startedNavigation,
                "committedNavigation": committedNavigation,
                "finishedNavigation": finishedNavigation,
                "documentAuthorityDelivered": documentAuthorityDelivered,
                "nativeDocumentActive": nativeDocumentActiveAtCompletion,
                "networkPolicyInstalled": networkPolicyInstalled,
                "outboundProbeAttempted": outboundProbeAttempted,
                "outboundProbeCompleted": outboundProbeCompleted,
                "outboundProbeResult": outboundProbeResult,
                "webRTCCapabilityBoundary": TrustedWebRuntime.webRTCCapabilityBoundary,
                "webRTCCapabilityLockdownVerified": webRTCCapabilityLockdownVerified,
                "webRTCProbeToken": webRTCProbeToken ?? NSNull(),
                "arbitraryRendererCompromiseContainmentClaimed": false,
                "networkPolicyVersion": 3,
                "sandboxed": security.sandboxed,
                "networkClientEntitled": security.networkClientEntitled,
                "webKitOutboundPolicyInstalled": networkPolicyInstalled,
                "webKitOutboundPolicyVersion": 3,
                "nativeNetworkClientSurface": "none-shipped",
                "networkBoundary": "app-entitled-webkit-blocked",
                "contentProcessTerminationCount": contentProcessTerminationCount,
                "terminationInduced": false,
                "recoveryMode": "simulated-public-delegate-seam",
                "recoveryDelegateSeamSimulated": recoveryDelegateSeamSimulated,
                "recoveryDelegateSeamInvocationCount": recoveryDelegateSeamInvocationCount,
                "externalProcessKilled": externalProcessKilled,
                "signalSentToWebContent": false,
                "publicAPIOwnershipClaimed": publicAPIOwnershipClaimed,
                "processTerminationClaimed": processTerminationClaimed,
                "staleDocumentRejected": staleDocumentRejected,
                "recoveredCommandVerified": recoveredCommandVerified,
                "persistedAssetVerified": persistedAssetVerified,
                "phase": phase.rawValue,
                "webKitFileInputVerified": webKitFileInputVerified,
                "nativeImportCompletionVerified": nativeImportCompletionVerified,
                "isolatedDatabaseCleanupVerified": isolatedDatabaseCleanupVerified,
                "saveState": state.saveState,
                "projectBusy": state.projectBusy,
                "exportInProgress": state.exportInProgress,
                "lastNotice": state.lastNotice ?? NSNull(),
                "bootDiagnostics": bootDiagnostics,
                "lastProbe": lastProbe,
                "terminationRunNonce": runNonce ?? NSNull(),
                "terminationAcknowledgementValidated": terminationAcknowledgementValidated,
                "terminationRequestDigest": terminationRequestDigest ?? NSNull(),
                "terminationDocumentEpoch": terminationDocumentEpoch ?? NSNull(),
                "recoveredDocumentEpoch": recoveredDocumentEpoch ?? NSNull(),
            ]
            let data = try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: url, options: .atomic)
        } catch {
            fputs("Drift WebView self-test receipt failed: \(error.localizedDescription)\n", stderr)
        }
    }

    private func selfTestDirectory() throws -> URL {
        guard let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
            throw NSError(domain: "DriftWebViewSelfTest", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "the application caches directory is unavailable",
            ])
        }
        return caches
            .appendingPathComponent(driftCacheNamespace, isDirectory: true)
            .appendingPathComponent("SelfTests", isDirectory: true)
    }

    private func compileProductionNetworkPolicy() -> WKContentRuleList? {
        var compiled: WKContentRuleList?
        var compileError: Error?
        var completed = false
        WKContentRuleListStore.default().compileContentRuleList(
            forIdentifier: TrustedWebRuntime.networkPolicyIdentifier,
            encodedContentRuleList: TrustedWebRuntime.networkPolicyJSON
        ) { ruleList, error in
            compiled = ruleList
            compileError = error
            completed = true
        }
        let deadline = Date().addingTimeInterval(12)
        while !completed && Date() < deadline {
            _ = RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.02))
        }
        guard let compiled else {
            failure = "production network policy compilation failed: \(compileError?.localizedDescription ?? "timed out")"
            return nil
        }
        networkPolicyInstalled = true
        return compiled
    }

    private func deleteIsolatedProjectDatabase(in webView: WKWebView) {
        var completed = false
        webView.callAsyncJavaScript(
            """
            const expected = expectedName;
            if (window.__DRIFT_NATIVE_SELF_TEST_DB__ !== expected) return false;
            return await new Promise((resolve) => {
              const request = indexedDB.deleteDatabase(expected);
              request.onsuccess = () => resolve(true);
              request.onerror = () => resolve(false);
              request.onblocked = () => resolve(false);
            });
            """,
            arguments: ["expectedName": isolatedDatabaseName],
            in: nil,
            in: .page,
            completionHandler: { [weak self] result in
                if case .success(let value) = result {
                    self?.isolatedDatabaseCleanupVerified = (value as? Bool)
                        ?? (value as? NSNumber)?.boolValue
                        ?? false
                }
                completed = true
            }
        )
        let deadline = Date().addingTimeInterval(8)
        while !completed && Date() < deadline {
            _ = RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.02))
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        navigationIdentity.start(navigation)
        bridge?.invalidateDocument()
        activeDocumentTicket = nil
        documentAuthorityDelivered = false
        startedNavigation = true
        committedNavigation = false
        finishedNavigation = false
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        guard navigationIdentity.accepts(navigation) else { return }
        committedNavigation = true
        guard let bridge else {
            failure = "native bridge disappeared before document commit"
            finished = true
            return
        }

        let ticket: NativeDocumentTicket
        do {
            ticket = try bridge.prepareDocumentBootstrap()
        } catch {
            failure = "native document bootstrap preparation failed: \(error.localizedDescription)"
            finished = true
            return
        }
        activeDocumentTicket = ticket

        bridge.deliverDocumentAuthority(
            ticket,
            to: webView,
            while: { [weak self, weak bridge] in
                guard let self, let bridge else { return false }
                return !self.finished
                    && self.navigationIdentity.accepts(navigation)
                    && self.activeDocumentTicket == ticket
                    && bridge.isPreparedOrCurrentDocument(ticket)
            },
            completion: { [weak self, weak bridge] result in
                guard let self, !self.finished, let bridge,
                      self.navigationIdentity.accepts(navigation),
                      self.activeDocumentTicket == ticket,
                      bridge.isPreparedOrCurrentDocument(ticket) else { return }
                switch result {
                case .success(true):
                    self.documentAuthorityDelivered = true
                    if self.finishedNavigation {
                        self.pollRuntime(in: webView, document: ticket, attemptsRemaining: 300)
                    }
                case .success(false):
                    self.failure = "the signed document rejected its AppKit-issued generation"
                    self.finished = true
                case .failure(let error):
                    self.failure = "native document authorization failed: \(error.localizedDescription)"
                    self.finished = true
                }
            }
        )
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard navigationIdentity.accepts(navigation) else { return }
        finishedNavigation = true
        if documentAuthorityDelivered, let document = activeDocumentTicket {
            pollRuntime(in: webView, document: document, attemptsRemaining: 300)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard navigationIdentity.accepts(navigation) else { return }
        navigationIdentity.invalidate()
        bridge?.invalidateDocument()
        failure = "navigation failed: \(error.localizedDescription)"
        finished = true
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard navigationIdentity.accepts(navigation) else { return }
        navigationIdentity.invalidate()
        bridge?.invalidateDocument()
        failure = "provisional navigation failed: \(error.localizedDescription)"
        finished = true
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        contentProcessTerminationCount += 1
        handleRecoveryDelegateSeam(webView, simulated: false)
    }

    private func handleRecoveryDelegateSeam(_ webView: WKWebView, simulated: Bool) {
        guard webView === self.webView else {
            failure = "the recovery seam received an unknown WKWebView"
            finished = true
            return
        }
        recoveryDelegateSeamInvocationCount += 1
        navigationIdentity.invalidate()
        bridge?.invalidateDocument()
        activeDocumentTicket = nil
        documentAuthorityDelivered = false
        guard simulated else {
            failure = "the WebContent process terminated unexpectedly; the safe packaged gauntlet never externally signals WebContent"
            finished = true
            return
        }
        guard phase == .recoveringDocument else {
            failure = "the simulated public delegate seam ran outside the recovery phase"
            finished = true
            return
        }
        guard recoveryDelegateSeamInvocationCount == 1,
              terminationAcknowledgementValidated else {
            failure = "the run-bound simulated public delegate seam was not authorized exactly once"
            finished = true
            return
        }

        recoveryDelegateSeamSimulated = true
        // Exercise the same one-attempt recovery policy and document teardown
        // used by the public WKNavigationDelegate callback, without claiming or
        // externally signaling a system WebContent process.
        var policy = WebContentRecoveryPolicy()
        guard policy.consumeAttempt(), !policy.consumeAttempt() else {
            failure = "the shared WebContent recovery policy did not enforce one attempt"
            finished = true
            return
        }
        startedNavigation = false
        committedNavigation = false
        finishedNavigation = false
        lastProbe = "run-bound simulated public delegate seam; testing reload recovery"
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            webView.reload()
        }
    }

    private func pollRuntime(
        in webView: WKWebView,
        document: NativeDocumentTicket,
        attemptsRemaining: Int
    ) {
        guard documentAuthorityDelivered,
              activeDocumentTicket == document,
              bridge?.isPreparedOrCurrentDocument(document) == true else { return }
        let probe = """
        (() => ({
          hasApp: Boolean(document.querySelector('main.app')),
          hasCanvas: Boolean(document.querySelector('canvas')),
          buildChannel: document.documentElement.dataset.driftBuildChannel ?? null,
          storageNamespace: document.documentElement.dataset.driftStorageNamespace ?? null,
          hasNativeMarker: window.__DRIFT_NATIVE_MAC__?.bridgeVersion === 2,
          hasNativeDocumentAuthority: window.__DRIFT_NATIVE_MAC__?.documentAuthority === 'appkit-issued-per-document',
          hasTruthfulNetworkBoundary: window.__DRIFT_NATIVE_MAC__?.webKitOutboundPolicyInstalled === true
            && window.__DRIFT_NATIVE_MAC__?.webKitOutboundPolicyVersion === 3
            && window.__DRIFT_NATIVE_MAC__?.nativeNetworkClientSurface === 'none-shipped'
            && window.__DRIFT_NATIVE_MAC__?.networkBoundary === 'app-entitled-webkit-blocked'
            && window.__DRIFT_NATIVE_MAC__?.networkClientEntitlementRequiredWhenSandboxed === true,
          hasPageWorldWebRTCLockdown: window.__DRIFT_WEBRTC_PAGE_CAPABILITY__?.boundary === '\(TrustedWebRuntime.webRTCCapabilityBoundary)'
            && window.__DRIFT_WEBRTC_PAGE_CAPABILITY__?.locked === true
            && ['RTCPeerConnection', 'webkitRTCPeerConnection'].every((name) => {
              const descriptor = Object.getOwnPropertyDescriptor(window, name);
              return typeof window[name] === 'undefined'
                && descriptor?.configurable === false
                && descriptor?.writable === false
                && descriptor?.value === undefined;
            }),
          hasAuthorizeFunction: typeof window.__driftNativeAuthorizeDocument === 'function',
          hasAuthorizedNativeCall: typeof window.__driftNativeCall === 'function',
          hasSavePicker: typeof window.showSaveFilePicker === 'function',
          hasDirectoryPicker: typeof window.showDirectoryPicker === 'function',
          hasOpenPicker: typeof window.showOpenFilePicker === 'function',
          hasNativeSave: typeof window.__driftNativeSaveBlob === 'function',
          hasNativeCommand: typeof window.__driftNativeCommand === 'function',
          hasAppBridgeInstaller: typeof window.__driftNativeInstallAppBridge === 'function',
          hasStateReporter: typeof window.__driftNativeReportClientState === 'function',
          hasInstalledAppBridge: document.documentElement.dataset.driftNativeAppBridge === 'ready',
          hasNativeFileInputBridge: document.documentElement.dataset.driftNativeFileInputBridge === 'ready',
          focusState: document.querySelector('main.app')?.dataset.focus ?? null,
          isFileRuntime: location.protocol === 'file:',
          title: document.title,
          readyState: document.readyState,
          bootDiagnostics: window.__driftBootDiagnostics ?? null
        }))()
        """
        webView.evaluateJavaScript(probe) { [weak self] result, error in
            guard let self, !self.finished else { return }
            if let error {
                self.failure = "runtime probe failed: \(error.localizedDescription)"
                self.finished = true
                return
            }

            let values = result as? [String: Any] ?? [:]
            if let diagnostics = values["bootDiagnostics"] {
                self.bootDiagnostics = Self.boundedDescription(diagnostics, maximum: 4_096)
            }
            self.lastProbe = Self.boundedDescription(values, maximum: 8_192)
            let state = self.bridge?.clientState ?? ClientState()
            let buildIdentityReady = values["buildChannel"] as? String == driftBuildChannel
                && values["storageNamespace"] as? String == driftStorageNamespace
            self.runtimeBuildIdentityVerified = buildIdentityReady
            let structureReady =
                values["hasApp"] as? Bool == true
                && values["hasCanvas"] as? Bool == true
                && buildIdentityReady
                && values["hasNativeMarker"] as? Bool == true
                && values["hasNativeDocumentAuthority"] as? Bool == true
                && values["hasTruthfulNetworkBoundary"] as? Bool == true
                && values["hasPageWorldWebRTCLockdown"] as? Bool == true
                && values["hasAuthorizeFunction"] as? Bool == true
                && values["hasAuthorizedNativeCall"] as? Bool == true
                && values["hasSavePicker"] as? Bool == true
                && values["hasDirectoryPicker"] as? Bool == true
                && values["hasOpenPicker"] as? Bool == true
                && values["hasNativeSave"] as? Bool == true
                && values["hasNativeCommand"] as? Bool == true
                && values["hasAppBridgeInstaller"] as? Bool == true
                && values["hasStateReporter"] as? Bool == true
                && values["hasInstalledAppBridge"] as? Bool == true
                && values["hasNativeFileInputBridge"] as? Bool == true
                && values["isFileRuntime"] as? Bool == true
                && self.bridge?.isCurrentDocument(document) == true
            let stateReady = state.saveState == "saved"
                && !state.projectBusy
                && !state.exportInProgress

            if structureReady && stateReady {
                switch self.phase {
                case .initialBoot:
                    if self.outboundProbeCompleted {
                        self.testNativeCommandRoundTrip(
                            in: webView,
                            document: document,
                            attemptsRemaining: 80
                        )
                    } else {
                        self.testWebKitOutboundDenial(in: webView, document: document)
                    }
                case .recoveringDocument:
                    self.verifyRecoveredDocument(in: webView, document: document)
                case .importingNativeFile, .complete:
                    self.failure = "runtime readiness reached an impossible self-test phase: \(self.phase.rawValue)"
                    self.finished = true
                }
                return
            }

            if ["failed", "recovery"].contains(state.saveState) {
                self.failure = "the persistent React project entered \(state.saveState) during \(self.phase.rawValue)"
                self.finished = true
                return
            }

            if Self.hasBootFailure(values["bootDiagnostics"]) {
                self.failure = "the signed application script failed before React became authoritative; diagnostics=\(self.bootDiagnostics)"
                self.finished = true
                return
            }

            guard attemptsRemaining > 0 else {
                self.failure = "the bundled page loaded but never reached a ready typed contract and settled authoritative state; lastProbe=\(self.lastProbe), saveState=\(state.saveState), projectBusy=\(state.projectBusy), exportInProgress=\(state.exportInProgress), lastNotice=\(state.lastNotice ?? "nil")"
                self.finished = true
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                self.pollRuntime(
                    in: webView,
                    document: document,
                    attemptsRemaining: attemptsRemaining - 1
                )
            }
        }
    }

    private func testWebKitOutboundDenial(
        in webView: WKWebView,
        document: NativeDocumentTicket
    ) {
        guard !outboundProbeAttempted else { return }
        guard let networkProbeURL,
              networkProbeURL.scheme == "http",
              networkProbeURL.host == "127.0.0.1",
              networkProbeURL.port != nil,
              networkProbeURL.user == nil,
              networkProbeURL.password == nil,
              networkProbeURL.query == nil,
              networkProbeURL.fragment == nil else {
            failure = "the packaged verifier supplied no safe loopback network probe URL"
            finished = true
            return
        }
        let probeToken = networkProbeURL.lastPathComponent
        guard networkProbeURL.path == "/\(probeToken)",
              probeToken.range(
                of: #"^drift-[a-f0-9]{32}$"#,
                options: .regularExpression
              ) != nil else {
            failure = "the packaged verifier supplied no exact WebRTC probe token"
            finished = true
            return
        }
        outboundProbeAttempted = true
        webView.callAsyncJavaScript(
            """
            'use strict';
            const timeout = (milliseconds, value = 'timeout') => new Promise((resolve) => setTimeout(() => resolve(value), milliseconds));
            const constructorNames = ['RTCPeerConnection', 'webkitRTCPeerConnection'];
            const inspectLockdown = (scope) => {
              const constructors = constructorNames.map((name) => {
                const initiallyAbsent = typeof scope[name] === 'undefined';
                let assignmentRejected = false;
                try {
                  scope[name] = function DriftForbiddenWebRTCRestore() {};
                } catch {
                  assignmentRejected = true;
                }
                const absentAfterAssignment = typeof scope[name] === 'undefined';
                let definePropertyRejected = false;
                try {
                  Object.defineProperty(scope, name, {
                    configurable: true,
                    writable: true,
                    value: function DriftForbiddenWebRTCDefine() {}
                  });
                } catch {
                  definePropertyRejected = true;
                }
                const absentAfterDefineProperty = typeof scope[name] === 'undefined';
                const descriptor = Object.getOwnPropertyDescriptor(scope, name);
                return {
                  name,
                  initiallyAbsent,
                  assignmentRejected,
                  absentAfterAssignment,
                  definePropertyRejected,
                  absentAfterDefineProperty,
                  nonConfigurable: descriptor?.configurable === false,
                  nonWritable: descriptor?.writable === false,
                  undefinedValue: descriptor?.value === undefined,
                  locked: initiallyAbsent
                    && absentAfterAssignment
                    && absentAfterDefineProperty
                    && descriptor?.configurable === false
                    && descriptor?.writable === false
                    && descriptor?.value === undefined
                };
              });
              const marker = scope.__DRIFT_WEBRTC_PAGE_CAPABILITY__;
              return {
                locked: constructors.every((entry) => entry.locked)
                  && marker?.boundary === expectedBoundary
                  && marker?.locked === true,
                markerBoundary: marker?.boundary ?? null,
                markerLocked: marker?.locked ?? null,
                constructors
              };
            };

            const mainFrameLockdown = inspectLockdown(globalThis);
            const childFrameLockdown = await Promise.race([
              new Promise((resolve) => {
                const frame = document.createElement('iframe');
                frame.hidden = true;
                frame.addEventListener('load', () => {
                  try {
                    resolve(inspectLockdown(frame.contentWindow));
                  } catch (error) {
                    resolve({ locked: false, error: String(error) });
                  } finally {
                    frame.remove();
                  }
                }, { once: true });
                frame.srcdoc = '<!doctype html><meta charset="utf-8"><title>Drift capability probe</title>';
                document.body.append(frame);
              }),
              timeout(1400, { locked: false, error: 'child-frame-timeout' })
            ]);

            const parsedProbeURL = new URL(probeURL);
            let webRTCNetworkAttempt = 'constructor-unavailable';
            const constructorName = constructorNames.find((name) => typeof globalThis[name] === 'function');
            if (constructorName) {
              webRTCNetworkAttempt = `constructor-visible:${constructorName}`;
              let connection = null;
              try {
                const Constructor = globalThis[constructorName];
                connection = new Constructor({
                  iceServers: [{
                    urls: `turn:${parsedProbeURL.hostname}:${parsedProbeURL.port}?transport=udp`,
                    username: probeToken,
                    credential: probeToken
                  }]
                });
                connection.createDataChannel('drift-webrtc-capability-probe');
                const offer = await Promise.race([
                  connection.createOffer(),
                  timeout(1400, null)
                ]);
                if (offer) {
                  await connection.setLocalDescription(offer);
                  await timeout(1400, null);
                  webRTCNetworkAttempt = `offer-issued:${constructorName}`;
                } else {
                  webRTCNetworkAttempt = `offer-timeout:${constructorName}`;
                }
              } catch (error) {
                webRTCNetworkAttempt = `constructor-failed:${constructorName}:${String(error)}`;
              } finally {
                connection?.close();
              }
            }

            const fetchAttempt = Promise.race([
              fetch(probeURL + '?lane=fetch', { cache: 'no-store' }).then(() => 'resolved', () => 'rejected'),
              timeout(1400)
            ]);
            const imageAttempt = Promise.race([
              new Promise((resolve) => {
                const image = new Image();
                image.onload = () => resolve('loaded');
                image.onerror = () => resolve('rejected');
                image.src = probeURL + '?lane=image';
              }),
              timeout(1400)
            ]);
            let beaconAccepted = null;
            try {
              beaconAccepted = navigator.sendBeacon(probeURL + '?lane=beacon', new Blob(['drift-network-probe']));
            } catch {
              beaconAccepted = false;
            }
            const websocketAttempt = Promise.race([
              new Promise((resolve) => {
                try {
                  const socket = new WebSocket(probeURL.replace(/^http:/, 'ws:') + '?lane=websocket');
                  socket.onopen = () => { socket.close(); resolve('opened'); };
                  socket.onerror = () => resolve('rejected');
                  socket.onclose = () => resolve('closed');
                } catch {
                  resolve('rejected');
                }
              }),
              timeout(1400)
            ]);
            const frameAttempt = Promise.race([
              new Promise((resolve) => {
                const frame = document.createElement('iframe');
                frame.hidden = true;
                frame.onload = () => { frame.remove(); resolve('loaded'); };
                frame.onerror = () => { frame.remove(); resolve('rejected'); };
                frame.src = probeURL + '?lane=attachment';
                document.body.append(frame);
              }),
              timeout(1400)
            ]);
            const [fetchResult, imageResult, websocketResult, frameResult] = await Promise.all([
              fetchAttempt, imageAttempt, websocketAttempt, frameAttempt
            ]);
            return {
              fetchResult,
              imageResult,
              beaconAccepted,
              websocketResult,
              frameResult,
              webRTCCapabilityBoundary: expectedBoundary,
              webRTCLockdownVerified: mainFrameLockdown.locked && childFrameLockdown.locked,
              webRTCProbeToken: probeToken,
              webRTCNetworkAttempt,
              mainFrameLockdown,
              childFrameLockdown,
              arbitraryRendererCompromiseContainmentClaimed: false,
              attempted: true
            };
            """,
            arguments: [
                "probeURL": networkProbeURL.absoluteString,
                "probeToken": probeToken,
                "expectedBoundary": TrustedWebRuntime.webRTCCapabilityBoundary,
            ],
            in: nil,
            in: .page,
            completionHandler: { [weak self, weak webView] result in
                guard let self, !self.finished, let webView else { return }
                guard self.bridge?.isCurrentDocument(document) == true else {
                    self.failure = "document authority expired during the WebKit outbound denial probe"
                    self.finished = true
                    return
                }
                switch result {
                case .success(let value):
                    guard let values = value as? [String: Any], values["attempted"] as? Bool == true else {
                        self.failure = "the WebKit outbound denial probe returned no attempt receipt"
                        self.finished = true
                        return
                    }
                    guard values["webRTCLockdownVerified"] as? Bool == true,
                          values["webRTCCapabilityBoundary"] as? String == TrustedWebRuntime.webRTCCapabilityBoundary,
                          values["webRTCProbeToken"] as? String == probeToken,
                          values["webRTCNetworkAttempt"] as? String == "constructor-unavailable",
                          values["arbitraryRendererCompromiseContainmentClaimed"] as? Bool == false else {
                        self.failure = "the page-world WebRTC capability lockdown was absent, mutable, or overclaimed"
                        self.outboundProbeResult = Self.boundedDescription(values, maximum: 8_192)
                        self.finished = true
                        return
                    }
                    self.outboundProbeResult = Self.boundedDescription(values, maximum: 2_048)
                    self.webRTCCapabilityLockdownVerified = true
                    self.webRTCProbeToken = probeToken
                    self.outboundProbeCompleted = true
                    self.testNativeCommandRoundTrip(
                        in: webView,
                        document: document,
                        attemptsRemaining: 80
                    )
                case .failure(let error):
                    self.failure = "the WebKit outbound denial probe could not issue every lane: \(error.localizedDescription)"
                    self.finished = true
                }
            }
        )
    }

    private func testNativeCommandRoundTrip(
        in webView: WKWebView,
        document: NativeDocumentTicket,
        attemptsRemaining: Int
    ) {
        guard bridge?.isCurrentDocument(document) == true else {
            failure = "document authority expired before native command verification"
            finished = true
            return
        }
        webView.callAsyncJavaScript(
            "return await window.__driftNativeCommand(documentNonce, command);",
            arguments: ["documentNonce": document.nonceString, "command": "toggle-focus"],
            in: nil,
            in: .page
        ) { [weak self, weak webView] result in
            guard let self, !self.finished else { return }
            guard self.bridge?.isCurrentDocument(document) == true else {
                self.failure = "document authority expired during native command verification"
                self.finished = true
                return
            }
            if case .failure(let error) = result {
                self.failure = "native command dispatch failed: \(error.localizedDescription)"
                self.finished = true
                return
            }
            if case .success(let value) = result,
               ((value as? Bool) ?? (value as? NSNumber)?.boolValue) != true {
                self.failure = "the typed native command was not accepted by React"
                self.finished = true
                return
            }
            guard let webView else {
                self.failure = "the WebView disappeared during native command verification"
                self.finished = true
                return
            }
            self.pollFocusState(in: webView, document: document, attemptsRemaining: attemptsRemaining)
        }
    }

    private func pollFocusState(
        in webView: WKWebView,
        document: NativeDocumentTicket,
        attemptsRemaining: Int
    ) {
        guard bridge?.isCurrentDocument(document) == true else {
            failure = "document authority expired during focus-state verification"
            finished = true
            return
        }
        webView.evaluateJavaScript("document.querySelector('main.app')?.dataset.focus === 'true'") { [weak self, weak webView] result, error in
            guard let self, !self.finished, let webView else { return }
            if let error {
                self.failure = "focus-state probe failed: \(error.localizedDescription)"
                self.finished = true
                return
            }
            if result as? Bool == true {
                webView.callAsyncJavaScript(
                    "return await window.__driftNativeCommand(documentNonce, command);",
                    arguments: ["documentNonce": document.nonceString, "command": "toggle-focus"],
                    in: nil,
                    in: .page
                ) { [weak self, weak webView] restoreResult in
                    guard let self, let webView else { return }
                    guard self.bridge?.isCurrentDocument(document) == true else {
                        self.failure = "document authority expired while restoring focus state"
                        self.finished = true
                        return
                    }
                    if case .failure(let restoreError) = restoreResult {
                        self.failure = "native command restore failed: \(restoreError.localizedDescription)"
                        self.finished = true
                        return
                    }
                    if case .success(let value) = restoreResult,
                       ((value as? Bool) ?? (value as? NSNumber)?.boolValue) != true {
                        self.failure = "the typed native command did not restore React focus state"
                        self.finished = true
                        return
                    }
                    self.testWebKitFileInputRoundTrip(in: webView, document: document)
                }
                return
            }
            guard attemptsRemaining > 0 else {
                self.failure = "the typed native toggle-focus command never reached React"
                self.finished = true
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                self.pollFocusState(
                    in: webView,
                    document: document,
                    attemptsRemaining: attemptsRemaining - 1
                )
            }
        }
    }

    private func testWebKitFileInputRoundTrip(
        in webView: WKWebView,
        document: NativeDocumentTicket
    ) {
        guard let bridge, bridge.isCurrentDocument(document) else {
            failure = "document authority expired before the real native import"
            finished = true
            return
        }
        do {
            let root = FileManager.default.temporaryDirectory.appendingPathComponent(
                "drift-webview-self-test-\(UUID().uuidString)",
                isDirectory: true
            )
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false)
            let url = root.appendingPathComponent(probeAssetName, isDirectory: false)
            guard let png = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X1R1WQAAAABJRU5ErkJggg==") else {
                throw BridgeFailure("DataError", "The native production-path probe PNG is malformed.")
            }
            try png.write(to: url, options: .atomic)
            probeAssetURL = url
            releaseCountBeforeImport = bridge.releasedFileGrantCount
            nativeImportCompletionVerified = false
            phase = .importingNativeFile
            bridge.importExternalFile(url, kind: .slides) { [weak self] error in
                guard let self, !self.finished, self.phase == .importingNativeFile else { return }
                if let error {
                    self.failure = "the native import completion rejected before persistence: \(error.localizedDescription)"
                    self.finished = true
                    return
                }
                self.nativeImportCompletionVerified = true
            }
            pollNativeImportResult(in: webView, document: document, attemptsRemaining: 240)
        } catch {
            failure = "the real native import probe could not be prepared: \(error.localizedDescription)"
            finished = true
        }
    }

    private func pollNativeImportResult(
        in webView: WKWebView,
        document: NativeDocumentTicket,
        attemptsRemaining: Int
    ) {
        guard let bridge, bridge.isCurrentDocument(document), phase == .importingNativeFile else {
            failure = "document authority expired during the real native import"
            finished = true
            return
        }
        let probe = """
        (() => ({
          count: document.querySelectorAll('.asset-list li').length,
          found: Array.from(document.querySelectorAll('.asset-list li'))
            .some((entry) => entry.textContent?.includes('\(probeAssetName)')),
          error: document.querySelector('.notice[data-kind="error"]')?.textContent?.trim() ?? null
        }))()
        """
        webView.evaluateJavaScript(probe) { [weak self, weak webView] result, error in
            guard let self, !self.finished, let webView else { return }
            guard let bridge = self.bridge, bridge.isCurrentDocument(document) else {
                self.failure = "document authority expired while observing the real native import"
                self.finished = true
                return
            }
            if let error {
                self.failure = "real native import result probe failed: \(error.localizedDescription)"
                self.finished = true
                return
            }
            let values = result as? [String: Any] ?? [:]
            let state = bridge.clientState
            let released = bridge.releasedFileGrantCount > self.releaseCountBeforeImport
            self.lastProbe = "real native import: \(String(describing: values)); grantReleased=\(released); completionVerified=\(self.nativeImportCompletionVerified); saveState=\(state.saveState); projectBusy=\(state.projectBusy)"
            let count = values["count"] as? Int ?? -1
            let found = values["found"] as? Bool == true
            let idleAndSaved = state.saveState == "saved"
                && !state.projectBusy
                && !state.exportInProgress
            if count == 1, found, released, self.nativeImportCompletionVerified, idleAndSaved {
                self.webKitFileInputVerified = true
                self.induceWebContentTermination(in: webView, document: document)
                return
            }
            if let userError = values["error"] as? String, !userError.isEmpty {
                self.failure = "Drift surfaced an error during the real native import: \(userError)"
                self.finished = true
                return
            }
            if ["failed", "recovery"].contains(state.saveState) {
                self.failure = "the imported native file was not durably saved: \(state.saveState)"
                self.finished = true
                return
            }
            guard attemptsRemaining > 0 else {
                self.failure = "the real native import never reached one saved asset with a released grant: \(self.lastProbe)"
                self.finished = true
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                self.pollNativeImportResult(
                    in: webView,
                    document: document,
                    attemptsRemaining: attemptsRemaining - 1
                )
            }
        }
    }

    private func induceWebContentTermination(
        in webView: WKWebView,
        document: NativeDocumentTicket
    ) {
        guard bridge?.isCurrentDocument(document) == true else {
            failure = "document authority expired before the external WebContent termination gate"
            finished = true
            return
        }
        guard let receiptName,
              let runNonce,
              Self.isCryptographicRunNonce(runNonce),
              let bundleIdentifier = Bundle.main.bundleIdentifier,
              !bundleIdentifier.isEmpty,
              let bundleVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String,
              !bundleVersion.isEmpty,
              let sourceRevision = Bundle.main.object(forInfoDictionaryKey: "DriftSourceRevision") as? String,
              !sourceRevision.isEmpty,
              let executableURL = Bundle.main.executableURL else {
            failure = "the packaged gauntlet could not bind termination to its exact bundle revision"
            finished = true
            return
        }

        let appStart: ProcessStartIdentity
        do {
            appStart = try Self.currentProcessStartIdentity()
        } catch {
            failure = "the packaged gauntlet could not read its public libproc start identity: \(error.localizedDescription)"
            finished = true
            return
        }

        staleDocumentNonce = document.nonceString
        phase = .recoveringDocument
        do {
            let urls = try externalTerminationURLs()
            let appPID = Int(getpid())
            let appExecutablePath = executableURL.resolvingSymlinksInPath().path
            let requestPhase = "awaiting-webcontent-termination"
            let sequence = 1
            let authorityGenerationDigest = Self.authorityGenerationDigest(
                receiptName: receiptName,
                runNonce: runNonce,
                bundleIdentifier: bundleIdentifier,
                bundleVersion: bundleVersion,
                sourceRevision: sourceRevision,
                appExecutablePath: appExecutablePath,
                appPID: appPID,
                appStart: appStart,
                document: document
            )
            let unsignedBinding = ExternalTerminationBinding(
                receiptName: receiptName,
                runNonce: runNonce,
                bundleIdentifier: bundleIdentifier,
                bundleVersion: bundleVersion,
                sourceRevision: sourceRevision,
                appExecutablePath: appExecutablePath,
                appPID: appPID,
                appStart: appStart,
                phase: requestPhase,
                sequence: sequence,
                documentEpoch: document.epoch,
                authorityGenerationDigest: authorityGenerationDigest,
                networkPolicyIdentifier: TrustedWebRuntime.networkPolicyIdentifier,
                requestDigest: ""
            )
            let binding = ExternalTerminationBinding(
                receiptName: unsignedBinding.receiptName,
                runNonce: unsignedBinding.runNonce,
                bundleIdentifier: unsignedBinding.bundleIdentifier,
                bundleVersion: unsignedBinding.bundleVersion,
                sourceRevision: unsignedBinding.sourceRevision,
                appExecutablePath: unsignedBinding.appExecutablePath,
                appPID: unsignedBinding.appPID,
                appStart: unsignedBinding.appStart,
                phase: unsignedBinding.phase,
                sequence: unsignedBinding.sequence,
                documentEpoch: unsignedBinding.documentEpoch,
                authorityGenerationDigest: unsignedBinding.authorityGenerationDigest,
                networkPolicyIdentifier: unsignedBinding.networkPolicyIdentifier,
                requestDigest: Self.requestDigest(for: unsignedBinding)
            )
            let control: [String: Any] = [
                "schemaVersion": 2,
                "receiptName": binding.receiptName,
                "runNonce": binding.runNonce,
                "bundleIdentifier": binding.bundleIdentifier,
                "bundleVersion": binding.bundleVersion,
                "sourceRevision": binding.sourceRevision,
                "appExecutablePath": binding.appExecutablePath,
                "appPID": binding.appPID,
                "appStartSeconds": binding.appStart.seconds,
                "appStartMicroseconds": binding.appStart.microseconds,
                "phase": binding.phase,
                "sequence": binding.sequence,
                "documentEpoch": binding.documentEpoch,
                "authorityGenerationDigest": binding.authorityGenerationDigest,
                "networkPolicyIdentifier": binding.networkPolicyIdentifier,
                "requestDigest": binding.requestDigest,
            ]
            let data = try JSONSerialization.data(withJSONObject: control, options: [.prettyPrinted, .sortedKeys])
            try FileManager.default.createDirectory(
                at: urls.control.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            pendingTerminationBinding = binding
            terminationDocumentEpoch = document.epoch
            terminationRequestDigest = binding.requestDigest
            try data.write(to: urls.control, options: .atomic)
            lastProbe = "native import saved and released; awaiting run-bound simulated delegate-seam acknowledgement"
            verifyExternalTerminationAcknowledgement { [weak self, weak webView] verified in
                guard let self, !self.finished, let webView else { return }
                guard verified else {
                    self.failure = "the safe recovery coordinator supplied no valid simulated delegate-seam acknowledgement"
                    self.finished = true
                    return
                }
                guard self.phase == .recoveringDocument,
                      self.terminationDocumentEpoch == document.epoch,
                      self.activeDocumentTicket == document,
                      self.bridge?.isCurrentDocument(document) == true else {
                    self.failure = "the run-bound recovery acknowledgement arrived after its document authority changed"
                    self.finished = true
                    return
                }
                self.handleRecoveryDelegateSeam(webView, simulated: true)
            }
        } catch {
            pendingTerminationBinding = nil
            terminationDocumentEpoch = nil
            terminationRequestDigest = nil
            failure = "the packaged gauntlet could not publish its bounded termination request: \(error.localizedDescription)"
            finished = true
        }
    }

    private func externalTerminationURLs() throws -> (control: URL, acknowledgement: URL) {
        guard let receiptName,
              receiptName.range(of: #"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"#, options: .regularExpression) != nil else {
            throw BridgeFailure(
                "InvalidStateError",
                "A safe report name is required for run-bound recovery coordination."
            )
        }
        let directory = try selfTestDirectory()
        return (
            directory.appendingPathComponent("\(receiptName).termination-request.json", isDirectory: false),
            directory.appendingPathComponent("\(receiptName).termination-ack.json", isDirectory: false)
        )
    }

    private func verifyExternalTerminationAcknowledgement(
        completion: @escaping (Bool) -> Void
    ) {
        guard let binding = pendingTerminationBinding else {
            completion(false)
            return
        }
        let expected: (control: URL, acknowledgement: URL)
        do {
            expected = try externalTerminationURLs()
        } catch {
            completion(false)
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let deadline = Date().addingTimeInterval(3)
            var verified = false
            while Date() < deadline, !verified {
                if let data = try? Data(contentsOf: expected.acknowledgement),
                   let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   Self.simulatedRecoveryAcknowledgement(object, exactlyEchoes: binding) {
                    verified = true
                    break
                }
                usleep(20_000)
            }
            DispatchQueue.main.async {
                if verified {
                    self.terminationAcknowledgementValidated = true
                    self.pendingTerminationBinding = nil
                    try? FileManager.default.removeItem(at: expected.acknowledgement)
                }
                completion(verified)
            }
        }
    }

    private static func currentProcessStartIdentity() throws -> ProcessStartIdentity {
        var info = proc_bsdinfo()
        let expectedSize = Int32(MemoryLayout<proc_bsdinfo>.size)
        let receivedSize = proc_pidinfo(
            getpid(),
            PROC_PIDTBSDINFO,
            0,
            &info,
            expectedSize
        )
        guard receivedSize == expectedSize,
              info.pbi_start_tvsec > 0,
              info.pbi_start_tvusec < 1_000_000 else {
            throw BridgeFailure(
                "InvalidStateError",
                "The current process has no exact public libproc start identity."
            )
        }
        return ProcessStartIdentity(
            seconds: info.pbi_start_tvsec,
            microseconds: info.pbi_start_tvusec
        )
    }

    private static func authorityGenerationDigest(
        receiptName: String,
        runNonce: String,
        bundleIdentifier: String,
        bundleVersion: String,
        sourceRevision: String,
        appExecutablePath: String,
        appPID: Int,
        appStart: ProcessStartIdentity,
        document: NativeDocumentTicket
    ) -> String {
        let material = [
            "drift-authority-generation-v1",
            "receiptNameHex=\(utf8Hex(receiptName))",
            "runNonceHex=\(utf8Hex(runNonce))",
            "bundleIdentifierHex=\(utf8Hex(bundleIdentifier))",
            "bundleVersionHex=\(utf8Hex(bundleVersion))",
            "sourceRevisionHex=\(utf8Hex(sourceRevision))",
            "appExecutablePathHex=\(utf8Hex(appExecutablePath))",
            "appPID=\(appPID)",
            "appStartSeconds=\(appStart.seconds)",
            "appStartMicroseconds=\(appStart.microseconds)",
            "documentEpoch=\(document.epoch)",
            "documentNonceHex=\(utf8Hex(document.nonceString))",
        ].joined(separator: "\n") + "\n"
        return sha256Hex(material)
    }

    private static func requestDigest(for binding: ExternalTerminationBinding) -> String {
        sha256Hex(canonicalRequestMaterial(for: binding))
    }

    private static func canonicalRequestMaterial(for binding: ExternalTerminationBinding) -> String {
        [
            "drift-webcontent-termination-request-v2",
            "schemaVersion=2",
            "receiptNameHex=\(utf8Hex(binding.receiptName))",
            "runNonceHex=\(utf8Hex(binding.runNonce))",
            "bundleIdentifierHex=\(utf8Hex(binding.bundleIdentifier))",
            "bundleVersionHex=\(utf8Hex(binding.bundleVersion))",
            "sourceRevisionHex=\(utf8Hex(binding.sourceRevision))",
            "appExecutablePathHex=\(utf8Hex(binding.appExecutablePath))",
            "appPID=\(binding.appPID)",
            "appStartSeconds=\(binding.appStart.seconds)",
            "appStartMicroseconds=\(binding.appStart.microseconds)",
            "phaseHex=\(utf8Hex(binding.phase))",
            "sequence=\(binding.sequence)",
            "documentEpoch=\(binding.documentEpoch)",
            "authorityGenerationDigestHex=\(utf8Hex(binding.authorityGenerationDigest))",
            "networkPolicyIdentifierHex=\(utf8Hex(binding.networkPolicyIdentifier))",
        ].joined(separator: "\n") + "\n"
    }

    private static func acknowledgement(
        _ object: [String: Any],
        exactlyEchoes binding: ExternalTerminationBinding
    ) -> Bool {
        guard requestDigest(for: binding) == binding.requestDigest else { return false }
        return object["receiptName"] as? String == binding.receiptName
            && object["runNonce"] as? String == binding.runNonce
            && object["bundleIdentifier"] as? String == binding.bundleIdentifier
            && object["bundleVersion"] as? String == binding.bundleVersion
            && object["sourceRevision"] as? String == binding.sourceRevision
            && object["appExecutablePath"] as? String == binding.appExecutablePath
            && object["appPID"] as? Int == binding.appPID
            && jsonUInt64(object["appStartSeconds"]) == binding.appStart.seconds
            && jsonUInt64(object["appStartMicroseconds"]) == binding.appStart.microseconds
            && object["phase"] as? String == binding.phase
            && object["sequence"] as? Int == binding.sequence
            && jsonUInt64(object["documentEpoch"]) == binding.documentEpoch
            && object["authorityGenerationDigest"] as? String == binding.authorityGenerationDigest
            && object["networkPolicyIdentifier"] as? String == binding.networkPolicyIdentifier
            && object["requestDigest"] as? String == binding.requestDigest
    }

    private static func simulatedRecoveryAcknowledgement(
        _ object: [String: Any],
        exactlyEchoes binding: ExternalTerminationBinding
    ) -> Bool {
        let exactKeys: Set<String> = [
            "schemaVersion", "receiptName", "runNonce", "bundleIdentifier",
            "bundleVersion", "sourceRevision", "appExecutablePath", "appPID",
            "appStartSeconds", "appStartMicroseconds", "phase", "sequence",
            "documentEpoch", "authorityGenerationDigest", "networkPolicyIdentifier",
            "requestDigest", "recoveryMode", "externalProcessKilled",
            "signalSentToWebContent", "publicAPIOwnershipClaimed",
            "processTerminationClaimed",
        ]
        return Set(object.keys) == exactKeys
            && object["schemaVersion"] as? Int == 2
            && acknowledgement(object, exactlyEchoes: binding)
            && object["recoveryMode"] as? String == "simulated-public-delegate-seam"
            && object["externalProcessKilled"] as? Bool == false
            && object["signalSentToWebContent"] as? Bool == false
            && object["publicAPIOwnershipClaimed"] as? Bool == false
            && object["processTerminationClaimed"] as? Bool == false
    }

    private static func jsonUInt64(_ value: Any?) -> UInt64? {
        guard let integer = value as? Int, integer >= 0 else { return nil }
        return UInt64(integer)
    }

    private static func utf8Hex(_ value: String) -> String {
        value.utf8.map { String(format: "%02x", $0) }.joined()
    }

    private static func sha256Hex(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    private static func isCryptographicRunNonce(_ value: String) -> Bool {
        value.range(of: #"^[0-9a-f]{64}$"#, options: .regularExpression) != nil
    }

    private static let webContentExecutablePath = URL(
        fileURLWithPath: "/System/Library/Frameworks/WebKit.framework/Versions/A/XPCServices/com.apple.WebKit.WebContent.xpc/Contents/MacOS/com.apple.WebKit.WebContent"
    ).resolvingSymlinksInPath().path

    private func removeExternalTerminationFiles() {
        guard let urls = try? externalTerminationURLs() else { return }
        try? FileManager.default.removeItem(at: urls.control)
        try? FileManager.default.removeItem(at: urls.acknowledgement)
    }

    private func verifyRecoveredDocument(
        in webView: WKWebView,
        document: NativeDocumentTicket
    ) {
        guard !recoveredDocumentVerificationStarted else { return }
        guard let bridge,
              bridge.isCurrentDocument(document),
              let staleDocumentNonce else {
            failure = "the recovery document has no current and stale authority pair"
            finished = true
            return
        }
        recoveredDocumentVerificationStarted = true
        webView.callAsyncJavaScript(
            """
            const entries = Array.from(document.querySelectorAll('.asset-list li'));
            const stale = await window.webkit.messageHandlers.driftNative.postMessage({
              command: 'drift-recovery-authority-probe',
              payload: {},
              documentNonce: staleNonce
            });
            let freshRejectedAsUnsupported = false;
            try {
              await window.__driftNativeCall('drift-recovery-authority-probe', {});
            } catch (error) {
              freshRejectedAsUnsupported = error?.name === 'NotSupportedError'
                && error?.message === 'Unknown native command: drift-recovery-authority-probe';
            }
            return {
              count: entries.length,
              found: entries.some((entry) => entry.textContent?.includes(assetName)),
              staleRejected: stale?.ok === false && stale?.error?.name === 'SecurityError',
              freshAuthorized: freshRejectedAsUnsupported
            };
            """,
            arguments: [
                "staleNonce": staleDocumentNonce,
                "assetName": probeAssetName,
            ],
            in: nil,
            in: .page,
            completionHandler: { [weak self, weak bridge] result in
                guard let self, !self.finished, let bridge,
                      bridge.isCurrentDocument(document) else { return }
                switch result {
                case .success(let raw):
                    let values = raw as? [String: Any] ?? [:]
                    self.lastProbe = "recovered document: \(String(describing: values))"
                    self.persistedAssetVerified = values["count"] as? Int == 1
                        && values["found"] as? Bool == true
                    self.staleDocumentRejected = values["staleRejected"] as? Bool == true
                    self.recoveredCommandVerified = values["freshAuthorized"] as? Bool == true
                    guard self.persistedAssetVerified,
                          self.staleDocumentRejected,
                          self.recoveredCommandVerified else {
                        self.failure = "the recovered document failed persistence or authority checks: \(self.lastProbe)"
                        self.finished = true
                        return
                    }
                    self.pollRecoveredFinalState(
                        document: document,
                        stableSavedObservationsRemaining: 20,
                        attemptsRemaining: 80
                    )
                case .failure(let error):
                    self.failure = "recovered document verification failed: \(error.localizedDescription)"
                    self.finished = true
                }
            }
        )
    }

    private func pollRecoveredFinalState(
        document: NativeDocumentTicket,
        stableSavedObservationsRemaining: Int,
        attemptsRemaining: Int
    ) {
        guard let bridge, bridge.isCurrentDocument(document), phase == .recoveringDocument else {
            failure = "document authority expired before recovered state settled"
            finished = true
            return
        }
        let state = bridge.clientState
        let savedAndIdle = state.saveState == "saved"
            && !state.projectBusy
            && !state.exportInProgress
        lastProbe = "recovered state settlement: saveState=\(state.saveState), projectBusy=\(state.projectBusy), exportInProgress=\(state.exportInProgress), stableSavedObservationsRemaining=\(stableSavedObservationsRemaining)"

        if savedAndIdle, stableSavedObservationsRemaining <= 1 {
            recoveredDocumentEpoch = document.epoch
            phase = .complete
            finished = true
            return
        }
        if ["failed", "recovery"].contains(state.saveState) {
            failure = "the recovered React project entered \(state.saveState) before final settlement"
            finished = true
            return
        }
        guard attemptsRemaining > 0 else {
            failure = "the recovered React project never held a stable saved and idle final state: \(lastProbe)"
            finished = true
            return
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            guard let self, !self.finished else { return }
            self.pollRecoveredFinalState(
                document: document,
                stableSavedObservationsRemaining: savedAndIdle
                    ? stableSavedObservationsRemaining - 1
                    : 20,
                attemptsRemaining: attemptsRemaining - 1
            )
        }
    }

    private static let bootDiagnosticSource = """
    (() => {
      const clamp = (value, maximum = 600) => String(value ?? '').slice(0, maximum);
      const diagnostics = { errors: [], rejections: [], consoleErrors: [], startedAt: Date.now() };
      Object.defineProperty(window, '__driftBootDiagnostics', {
        configurable: false,
        writable: false,
        value: diagnostics
      });
      addEventListener('error', (event) => {
        if (diagnostics.errors.length >= 8) return;
        diagnostics.errors.push({
          message: clamp(event.message),
          source: clamp(event.filename?.split('/').pop() ?? ''),
          line: Number(event.lineno || 0),
          column: Number(event.colno || 0),
          error: clamp(event.error?.stack || event.error?.message || '')
        });
      }, true);
      addEventListener('unhandledrejection', (event) => {
        if (diagnostics.rejections.length >= 8) return;
        diagnostics.rejections.push(clamp(event.reason?.stack || event.reason?.message || event.reason));
      });
      const originalError = console.error.bind(console);
      console.error = (...values) => {
        if (diagnostics.consoleErrors.length < 8) {
          diagnostics.consoleErrors.push(clamp(values.map((value) => value?.stack || value?.message || value).join(' ')));
        }
        originalError(...values);
      };
    })();
    """

    private static func boundedDescription(_ value: Any, maximum: Int) -> String {
        String(String(describing: value).prefix(maximum))
    }

    private static func hasBootFailure(_ value: Any?) -> Bool {
        guard let diagnostics = value as? [String: Any] else { return false }
        let errors = diagnostics["errors"] as? [Any] ?? []
        let rejections = diagnostics["rejections"] as? [Any] ?? []
        let consoleErrors = diagnostics["consoleErrors"] as? [Any] ?? []
        return !errors.isEmpty || !rejections.isEmpty || !consoleErrors.isEmpty
    }
}
