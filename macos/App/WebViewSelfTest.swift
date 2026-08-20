import AppKit
import Foundation
import WebKit

final class WebViewSelfTest: NSObject, WKNavigationDelegate {
    private let receiptName: String?
    private var window: NSWindow?
    private var webView: WKWebView?
    private var bridge: NativeBridgeHost?
    private var finished = false
    private var failure: String?
    private var startedNavigation = false
    private var committedNavigation = false
    private var finishedNavigation = false
    private var contentProcessTerminationCount = 0
    private var lastProbe = "no probe completed"

    private init(receiptName: String?) {
        self.receiptName = receiptName
        super.init()
    }

    static func run(receiptName: String? = nil) -> Int32 {
        let application = NSApplication.shared
        // A WKWebView media/GPU process is not faithfully exercised under the
        // prohibited activation policy used by command-line-only tools. The
        // real app is regular; accessory gives the self-test a real WindowServer
        // lifecycle without adding a second Dock application.
        application.setActivationPolicy(.accessory)
        application.finishLaunching()
        let harness = WebViewSelfTest(receiptName: receiptName)
        return harness.execute()
    }

    private func execute() -> Int32 {
        guard let bridgeURL = Bundle.main.url(forResource: "NativeBridge", withExtension: "js"),
              let bridgeSource = try? String(contentsOf: bridgeURL, encoding: .utf8),
              let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") else {
            return failReceipt("bundled runtime is missing")
        }

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.suppressesIncrementalRendering = false
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

        // Keep the compositor honest. The previous test placed a 1%-opaque
        // borderless window 12,000 points off-screen. Hosted WebKit terminated
        // that content process even though the same bundle, signature, native
        // bridge, and file broker had already passed. CI has no human viewer;
        // use a normal visible window and test the lifecycle users actually get.
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

        let deadline = Date().addingTimeInterval(55)
        while !finished && Date() < deadline {
            RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.05))
        }

        let state = bridge.clientState
        let diagnostic = diagnosticMessage(webView: webView, state: state)
        cleanup(configuration: configuration, webView: webView, window: window, bridge: bridge)

        if let failure {
            return failReceipt("\(failure); \(diagnostic)", state: state)
        }
        guard finished else {
            return failReceipt("timed out after 55 seconds; \(diagnostic)", state: state)
        }

        let message = "relative bundle assets, React studio, installed typed app contract, authoritative state, native-menu command dispatch, direct native save, and file-system polyfills loaded"
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
        webView.stopLoading()
        webView.navigationDelegate = nil
        window.orderOut(nil)
        window.close()
        configuration.userContentController.removeScriptMessageHandler(
            forName: driftBridgeName,
            contentWorld: .page
        )
        bridge.abortAllWrites()
    }

    private func diagnosticMessage(webView: WKWebView, state: ClientState) -> String {
        "started=\(startedNavigation), committed=\(committedNavigation), finishedNavigation=\(finishedNavigation), contentProcessTerminations=\(contentProcessTerminationCount), isLoading=\(webView.isLoading), url=\(webView.url?.absoluteString ?? "nil"), saveState=\(state.saveState), projectBusy=\(state.projectBusy), exportInProgress=\(state.exportInProgress), lastProbe=\(lastProbe)"
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
            guard let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
                throw NSError(domain: "DriftWebViewSelfTest", code: 1, userInfo: [
                    NSLocalizedDescriptionKey: "the application caches directory is unavailable",
                ])
            }
            let directory = caches
                .appendingPathComponent("Drift", isDirectory: true)
                .appendingPathComponent("SelfTests", isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let url = directory.appendingPathComponent(receiptName, isDirectory: false)
            let receipt: [String: Any] = [
                "schemaVersion": 1,
                "ok": ok,
                "message": message,
                "bundleIdentifier": Bundle.main.bundleIdentifier ?? NSNull(),
                "bundleVersion": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") ?? NSNull(),
                "sourceRevision": Bundle.main.object(forInfoDictionaryKey: "DriftSourceRevision") ?? NSNull(),
                "startedNavigation": startedNavigation,
                "committedNavigation": committedNavigation,
                "finishedNavigation": finishedNavigation,
                "contentProcessTerminationCount": contentProcessTerminationCount,
                "saveState": state.saveState,
                "projectBusy": state.projectBusy,
                "exportInProgress": state.exportInProgress,
                "lastNotice": state.lastNotice ?? NSNull(),
                "lastProbe": lastProbe,
            ]
            let data = try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: url, options: .atomic)
        } catch {
            fputs("Drift WebView self-test receipt failed: \(error.localizedDescription)\n", stderr)
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        startedNavigation = true
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        committedNavigation = true
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        finishedNavigation = true
        pollRuntime(in: webView, attemptsRemaining: 300)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        failure = "navigation failed: \(error.localizedDescription)"
        finished = true
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        failure = "provisional navigation failed: \(error.localizedDescription)"
        finished = true
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        contentProcessTerminationCount += 1
        guard contentProcessTerminationCount == 1 else {
            failure = "the WebKit content process terminated twice during the packaged-runtime test"
            finished = true
            return
        }

        // The production app exposes an explicit reload recovery after a WebKit
        // process loss. Exercise that promise once. A second termination is a
        // hard failure rather than an infinite green-by-retry loop.
        startedNavigation = false
        committedNavigation = false
        finishedNavigation = false
        lastProbe = "content process terminated once; testing reload recovery"
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            webView.reload()
        }
    }

    private func pollRuntime(in webView: WKWebView, attemptsRemaining: Int) {
        let probe = """
        (() => ({
          hasApp: Boolean(document.querySelector('main.app')),
          hasCanvas: Boolean(document.querySelector('canvas')),
          hasNativeMarker: window.__DRIFT_NATIVE_MAC__?.bridgeVersion === 2,
          hasSavePicker: typeof window.showSaveFilePicker === 'function',
          hasDirectoryPicker: typeof window.showDirectoryPicker === 'function',
          hasOpenPicker: typeof window.showOpenFilePicker === 'function',
          hasNativeSave: typeof window.__driftNativeSaveBlob === 'function',
          hasNativeCommand: typeof window.__driftNativeCommand === 'function',
          hasAppBridgeInstaller: typeof window.__driftNativeInstallAppBridge === 'function',
          hasStateReporter: typeof window.__driftNativeReportClientState === 'function',
          hasInstalledAppBridge: document.documentElement.dataset.driftNativeAppBridge === 'ready',
          focusState: document.querySelector('main.app')?.dataset.focus ?? null,
          isFileRuntime: location.protocol === 'file:',
          title: document.title,
          readyState: document.readyState
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
            self.lastProbe = String(describing: values)
            let state = self.bridge?.clientState ?? ClientState()
            let structureReady =
                values["hasApp"] as? Bool == true
                && values["hasCanvas"] as? Bool == true
                && values["hasNativeMarker"] as? Bool == true
                && values["hasSavePicker"] as? Bool == true
                && values["hasDirectoryPicker"] as? Bool == true
                && values["hasOpenPicker"] as? Bool == true
                && values["hasNativeSave"] as? Bool == true
                && values["hasNativeCommand"] as? Bool == true
                && values["hasAppBridgeInstaller"] as? Bool == true
                && values["hasStateReporter"] as? Bool == true
                && values["hasInstalledAppBridge"] as? Bool == true
                && values["isFileRuntime"] as? Bool == true
            let stateReady = state.saveState == "saved"
                && !state.projectBusy
                && !state.exportInProgress

            if structureReady && stateReady {
                self.testNativeCommandRoundTrip(in: webView, attemptsRemaining: 80)
                return
            }

            guard attemptsRemaining > 0 else {
                self.failure = "the bundled page loaded but never reached a ready typed contract and settled authoritative state; lastProbe=\(self.lastProbe), saveState=\(state.saveState), projectBusy=\(state.projectBusy), exportInProgress=\(state.exportInProgress), lastNotice=\(state.lastNotice ?? "nil")"
                self.finished = true
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                self.pollRuntime(in: webView, attemptsRemaining: attemptsRemaining - 1)
            }
        }
    }

    private func testNativeCommandRoundTrip(in webView: WKWebView, attemptsRemaining: Int) {
        webView.evaluateJavaScript("window.__driftNativeCommand?.('toggle-focus')") { [weak self, weak webView] _, error in
            guard let self, !self.finished else { return }
            if let error {
                self.failure = "native command dispatch failed: \(error.localizedDescription)"
                self.finished = true
                return
            }
            guard let webView else {
                self.failure = "the WebView disappeared during native command verification"
                self.finished = true
                return
            }
            self.pollFocusState(in: webView, attemptsRemaining: attemptsRemaining)
        }
    }

    private func pollFocusState(in webView: WKWebView, attemptsRemaining: Int) {
        webView.evaluateJavaScript("document.querySelector('main.app')?.dataset.focus === 'true'") { [weak self] result, error in
            guard let self, !self.finished else { return }
            if let error {
                self.failure = "focus-state probe failed: \(error.localizedDescription)"
                self.finished = true
                return
            }
            if result as? Bool == true {
                // Restore the default editor state before disposing the harness.
                webView.evaluateJavaScript("window.__driftNativeCommand?.('toggle-focus')") { [weak self] _, restoreError in
                    guard let self else { return }
                    if let restoreError {
                        self.failure = "native command restore failed: \(restoreError.localizedDescription)"
                    }
                    self.finished = true
                }
                return
            }
            guard attemptsRemaining > 0 else {
                self.failure = "the typed native toggle-focus command never reached React"
                self.finished = true
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                self.pollFocusState(in: webView, attemptsRemaining: attemptsRemaining - 1)
            }
        }
    }
}
