import AppKit
import Foundation
import WebKit

final class WebViewSelfTest: NSObject, WKNavigationDelegate {
    private var window: NSWindow?
    private var webView: WKWebView?
    private var bridge: NativeBridgeHost?
    private var finished = false
    private var failure: String?
    private var startedNavigation = false
    private var committedNavigation = false
    private var finishedNavigation = false
    private var lastProbe = "no probe completed"

    static func run() -> Int32 {
        let application = NSApplication.shared
        application.setActivationPolicy(.prohibited)
        application.finishLaunching()
        let harness = WebViewSelfTest()
        return harness.execute()
    }

    private func execute() -> Int32 {
        guard let bridgeURL = Bundle.main.url(forResource: "NativeBridge", withExtension: "js"),
              let bridgeSource = try? String(contentsOf: bridgeURL, encoding: .utf8),
              let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") else {
            fputs("Drift WebView self-test failed: bundled runtime is missing.\n", stderr)
            return 1
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

        // WKWebView may defer process and compositor startup when it is never
        // attached to a window. Use a genuine, nearly invisible off-screen
        // window so the test exercises the same lifecycle as Drift.app without
        // flashing UI on the runner.
        let window = NSWindow(
            contentRect: NSRect(x: -12_000, y: -12_000, width: 1200, height: 800),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        window.isReleasedWhenClosed = false
        window.alphaValue = 0.01
        window.ignoresMouseEvents = true
        window.contentView = webView
        window.orderFrontRegardless()
        self.window = window

        webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())

        let deadline = Date().addingTimeInterval(45)
        while !finished && Date() < deadline {
            RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.05))
        }

        webView.stopLoading()
        webView.navigationDelegate = nil
        window.orderOut(nil)
        window.close()
        configuration.userContentController.removeScriptMessageHandler(
            forName: driftBridgeName,
            contentWorld: .page
        )
        bridge.abortAllWrites()

        if let failure {
            fputs("Drift WebView self-test failed: \(failure)\n", stderr)
            return 1
        }
        guard finished else {
            let state = bridge.clientState
            let diagnostic = "timed out after 45 seconds; started=\(startedNavigation), committed=\(committedNavigation), finishedNavigation=\(finishedNavigation), isLoading=\(webView.isLoading), url=\(webView.url?.absoluteString ?? "nil"), saveState=\(state.saveState), projectBusy=\(state.projectBusy), exportInProgress=\(state.exportInProgress), lastProbe=\(lastProbe)"
            fputs("Drift WebView self-test failed: \(diagnostic)\n", stderr)
            return 1
        }

        print("Drift WebView self-test passed: relative bundle assets, React studio, installed typed app contract, authoritative state, native-menu command dispatch, direct native save, and file-system polyfills loaded.")
        return 0
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
        failure = "the WebKit content process terminated during the packaged-runtime test"
        finished = true
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
        webView.evaluateJavaScript(probe) { [weak self, weak webView] result, error in
            guard let self else { return }
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

            guard attemptsRemaining > 0, let webView else {
                self.failure = "The bundled page loaded but never reached a ready typed contract and settled authoritative state. Last probe: \(self.lastProbe); native state: saveState=\(state.saveState), projectBusy=\(state.projectBusy), exportInProgress=\(state.exportInProgress), lastNotice=\(state.lastNotice ?? "nil")"
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
            guard let self else { return }
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
        webView.evaluateJavaScript("document.querySelector('main.app')?.dataset.focus === 'true'") { [weak self, weak webView] result, error in
            guard let self else { return }
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
            guard attemptsRemaining > 0, let webView else {
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
