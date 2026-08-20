import AppKit
import Foundation
import WebKit

final class WebViewSelfTest: NSObject, WKNavigationDelegate {
    private var webView: WKWebView?
    private var bridge: NativeBridgeHost?
    private var finished = false
    private var failure: String?

    static func run() -> Int32 {
        let application = NSApplication.shared
        application.setActivationPolicy(.prohibited)
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

        let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1200, height: 800), configuration: configuration)
        webView.navigationDelegate = self
        bridge.webView = webView
        self.webView = webView
        webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())

        let deadline = Date().addingTimeInterval(30)
        while !finished && Date() < deadline {
            RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
        }

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
            fputs("Drift WebView self-test failed: timed out before React and the native bridge became ready.\n", stderr)
            return 1
        }

        print("Drift WebView self-test passed: relative bundle assets, React studio, installed typed app contract, authoritative state, direct native save, and file-system polyfills loaded.")
        return 0
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pollRuntime(in: webView, attemptsRemaining: 120)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        failure = error.localizedDescription
        finished = true
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        failure = error.localizedDescription
        finished = true
    }

    private func pollRuntime(in webView: WKWebView, attemptsRemaining: Int) {
        let probe = """
        (() => ({
          hasApp: Boolean(document.querySelector('main.app')),
          hasNativeMarker: window.__DRIFT_NATIVE_MAC__?.bridgeVersion === 2,
          hasSavePicker: typeof window.showSaveFilePicker === 'function',
          hasDirectoryPicker: typeof window.showDirectoryPicker === 'function',
          hasNativeSave: typeof window.__driftNativeSaveBlob === 'function',
          hasAppBridgeInstaller: typeof window.__driftNativeInstallAppBridge === 'function',
          hasStateReporter: typeof window.__driftNativeReportClientState === 'function',
          hasInstalledAppBridge: document.documentElement.dataset.driftNativeAppBridge === 'ready',
          isFileRuntime: location.protocol === 'file:',
          title: document.title
        }))()
        """
        webView.evaluateJavaScript(probe) { [weak self, weak webView] result, error in
            guard let self else { return }
            if let error {
                self.failure = error.localizedDescription
                self.finished = true
                return
            }
            if let values = result as? [String: Any],
               values["hasApp"] as? Bool == true,
               values["hasNativeMarker"] as? Bool == true,
               values["hasSavePicker"] as? Bool == true,
               values["hasDirectoryPicker"] as? Bool == true,
               values["hasNativeSave"] as? Bool == true,
               values["hasAppBridgeInstaller"] as? Bool == true,
               values["hasStateReporter"] as? Bool == true,
               values["hasInstalledAppBridge"] as? Bool == true,
               values["isFileRuntime"] as? Bool == true,
               self.bridge?.clientState.lastNotice != nil {
                self.finished = true
                return
            }
            guard attemptsRemaining > 0, let webView else {
                self.failure = "The bundled page loaded, but React did not install the typed native contract, expose direct native saves, or report authoritative state."
                self.finished = true
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                self.pollRuntime(in: webView, attemptsRemaining: attemptsRemaining - 1)
            }
        }
    }
}
