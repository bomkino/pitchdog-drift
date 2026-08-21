import AppKit
import Foundation
import WebKit

final class WebViewSelfTest: NSObject, WKNavigationDelegate {
    private let receiptName: String?
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
    private var lastProbe = "no probe completed"
    private var bootDiagnostics = "none"

    private init(receiptName: String?) {
        self.receiptName = receiptName
        super.init()
    }

    static func run(receiptName: String? = nil) -> Int32 {
        let application = NSApplication.shared
        application.setActivationPolicy(.accessory)
        application.finishLaunching()
        return WebViewSelfTest(receiptName: receiptName).execute()
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

        // Capture boot failures before the signed application script runs. The
        // receipt is deliberately bounded and contains no project or file data.
        configuration.userContentController.addUserScript(WKUserScript(
            source: Self.bootDiagnosticSource,
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

        let deadline = Date().addingTimeInterval(70)
        while !finished && Date() < deadline {
            _ = RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.05))
        }

        let state = bridge.clientState
        let diagnostic = diagnosticMessage(webView: webView, state: state)
        cleanup(configuration: configuration, webView: webView, window: window, bridge: bridge)

        if let failure {
            return failReceipt("\(failure); \(diagnostic)", state: state)
        }
        guard finished else {
            return failReceipt("timed out after 70 seconds; \(diagnostic)", state: state)
        }
        guard webKitFileInputVerified else {
            return failReceipt("the packaged WebKit input round-trip never completed; \(diagnostic)", state: state)
        }

        let message = "relative classic-IIFE bundle, native-issued document authority, React studio, installed typed app contract, authoritative state, native-menu command dispatch, WebKit DataTransfer file ingestion, direct native save, and file-system polyfills loaded"
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
        bridge.invalidateDocument()
        webView.stopLoading()
        webView.navigationDelegate = nil
        window.orderOut(nil)
        window.close()
        configuration.userContentController.removeScriptMessageHandler(
            forName: driftBridgeName,
            contentWorld: .page
        )
    }

    private func diagnosticMessage(webView: WKWebView, state: ClientState) -> String {
        "started=\(startedNavigation), committed=\(committedNavigation), finishedNavigation=\(finishedNavigation), documentAuthorityDelivered=\(documentAuthorityDelivered), nativeDocumentActive=\(bridge?.hasActiveDocument == true), contentProcessTerminations=\(contentProcessTerminationCount), webKitFileInputVerified=\(webKitFileInputVerified), isLoading=\(webView.isLoading), url=\(webView.url?.absoluteString ?? "nil"), saveState=\(state.saveState), projectBusy=\(state.projectBusy), exportInProgress=\(state.exportInProgress), bootDiagnostics=\(bootDiagnostics), lastProbe=\(lastProbe)"
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
                "schemaVersion": 2,
                "ok": ok,
                "message": message,
                "bundleIdentifier": Bundle.main.bundleIdentifier ?? NSNull(),
                "bundleVersion": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") ?? NSNull(),
                "sourceRevision": Bundle.main.object(forInfoDictionaryKey: "DriftSourceRevision") ?? NSNull(),
                "startedNavigation": startedNavigation,
                "committedNavigation": committedNavigation,
                "finishedNavigation": finishedNavigation,
                "documentAuthorityDelivered": documentAuthorityDelivered,
                "nativeDocumentActive": bridge?.hasActiveDocument == true,
                "contentProcessTerminationCount": contentProcessTerminationCount,
                "webKitFileInputVerified": webKitFileInputVerified,
                "saveState": state.saveState,
                "projectBusy": state.projectBusy,
                "exportInProgress": state.exportInProgress,
                "lastNotice": state.lastNotice ?? NSNull(),
                "bootDiagnostics": bootDiagnostics,
                "lastProbe": lastProbe,
            ]
            let data = try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: url, options: .atomic)
        } catch {
            fputs("Drift WebView self-test receipt failed: \(error.localizedDescription)\n", stderr)
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        bridge?.invalidateDocument()
        activeDocumentTicket = nil
        documentAuthorityDelivered = false
        startedNavigation = true
        committedNavigation = false
        finishedNavigation = false
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
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

        webView.callAsyncJavaScript(
            "return window.__driftNativeAuthorizeDocument(documentNonce);",
            arguments: ["documentNonce": ticket.nonceString],
            in: nil,
            contentWorld: .page
        ) { [weak self, weak bridge] result in
            DispatchQueue.main.async {
                guard let self, !self.finished, let bridge,
                      self.activeDocumentTicket == ticket,
                      bridge.isPreparedOrCurrentDocument(ticket) else { return }
                switch result {
                case .success(let value):
                    let accepted = (value as? Bool) ?? (value as? NSNumber)?.boolValue
                    guard accepted == true else {
                        self.failure = "the signed document rejected its native-issued generation token"
                        self.finished = true
                        return
                    }
                    self.documentAuthorityDelivered = true
                    if self.finishedNavigation {
                        self.pollRuntime(in: webView, attemptsRemaining: 300)
                    }
                case .failure(let error):
                    self.failure = "native document authorization failed: \(error.localizedDescription)"
                    self.finished = true
                }
            }
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        finishedNavigation = true
        if documentAuthorityDelivered {
            pollRuntime(in: webView, attemptsRemaining: 300)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        bridge?.invalidateDocument()
        failure = "navigation failed: \(error.localizedDescription)"
        finished = true
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        bridge?.invalidateDocument()
        failure = "provisional navigation failed: \(error.localizedDescription)"
        finished = true
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        contentProcessTerminationCount += 1
        bridge?.invalidateDocument()
        activeDocumentTicket = nil
        documentAuthorityDelivered = false
        guard contentProcessTerminationCount == 1 else {
            failure = "the WebKit content process terminated twice during the packaged-runtime test"
            finished = true
            return
        }

        startedNavigation = false
        committedNavigation = false
        finishedNavigation = false
        webKitFileInputVerified = false
        lastProbe = "content process terminated once; testing reload recovery"
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            webView.reload()
        }
    }

    private func pollRuntime(in webView: WKWebView, attemptsRemaining: Int) {
        guard documentAuthorityDelivered,
              let ticket = activeDocumentTicket,
              bridge?.isPreparedOrCurrentDocument(ticket) == true else { return }
        let probe = """
        (() => ({
          hasApp: Boolean(document.querySelector('main.app')),
          hasCanvas: Boolean(document.querySelector('canvas')),
          hasNativeMarker: window.__DRIFT_NATIVE_MAC__?.bridgeVersion === 2,
          hasNativeDocumentAuthority: window.__DRIFT_NATIVE_MAC__?.documentAuthority === 'native-issued',
          hasAuthorizeFunction: typeof window.__driftNativeAuthorizeDocument === 'function',
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
          bootstrap: document.documentElement.dataset.driftBootstrap ?? null,
          scripts: Array.from(document.scripts).map((script) => ({
            src: script.src ? script.src.split('/').pop() : 'inline',
            type: script.type || 'classic'
          })).slice(0, 8),
          bootDiagnostics: window.__driftBootDiagnostics ?? null,
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
            if let diagnostics = values["bootDiagnostics"] {
                self.bootDiagnostics = Self.boundedDescription(diagnostics, maximum: 4_096)
            }
            self.lastProbe = Self.boundedDescription(values, maximum: 8_192)
            let state = self.bridge?.clientState ?? ClientState()
            let structureReady =
                values["hasApp"] as? Bool == true
                && values["hasCanvas"] as? Bool == true
                && values["hasNativeMarker"] as? Bool == true
                && values["hasNativeDocumentAuthority"] as? Bool == true
                && values["hasAuthorizeFunction"] as? Bool == true
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
                && self.bridge?.isCurrentDocument(ticket) == true
            let stateReady = state.saveState == "saved"
                && !state.projectBusy
                && !state.exportInProgress

            if structureReady && stateReady {
                self.testNativeCommandRoundTrip(in: webView, document: ticket, attemptsRemaining: 80)
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
                self.pollRuntime(in: webView, attemptsRemaining: attemptsRemaining - 1)
            }
        }
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
        webView.evaluateJavaScript("window.__driftNativeCommand?.('toggle-focus')") { [weak self, weak webView] _, error in
            guard let self, !self.finished else { return }
            guard self.bridge?.isCurrentDocument(document) == true else {
                self.failure = "document authority expired during native command verification"
                self.finished = true
                return
            }
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
        webView.evaluateJavaScript("document.querySelector('main.app')?.dataset.focus === 'true'") { [weak self] result, error in
            guard let self, !self.finished else { return }
            if let error {
                self.failure = "focus-state probe failed: \(error.localizedDescription)"
                self.finished = true
                return
            }
            if result as? Bool == true {
                webView.evaluateJavaScript("window.__driftNativeCommand?.('toggle-focus')") { [weak self, weak webView] _, restoreError in
                    guard let self, let webView else { return }
                    guard self.bridge?.isCurrentDocument(document) == true else {
                        self.failure = "document authority expired while restoring focus state"
                        self.finished = true
                        return
                    }
                    if let restoreError {
                        self.failure = "native command restore failed: \(restoreError.localizedDescription)"
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
                self.pollFocusState(in: webView, document: document, attemptsRemaining: attemptsRemaining - 1)
            }
        }
    }

    private func testWebKitFileInputRoundTrip(in webView: WKWebView, document: NativeDocumentTicket) {
        guard bridge?.isCurrentDocument(document) == true else {
            failure = "document authority expired before file-input verification"
            finished = true
            return
        }
        let script = """
        (() => {
          const input = Array.from(document.querySelectorAll('input[type="file"]'))
            .find((candidate) => candidate.multiple && candidate.accept.toLowerCase().includes('image/'));
          if (!(input instanceof HTMLInputElement)) return { ok: false, reason: 'slide input missing' };
          if (typeof DataTransfer !== 'function' || typeof File !== 'function') {
            return { ok: false, reason: 'DataTransfer or File unavailable' };
          }
          const before = document.querySelectorAll('.asset-list li').length;
          const binary = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X1R1WQAAAABJRU5ErkJggg==');
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
          const transfer = new DataTransfer();
          transfer.items.add(new File([bytes], 'wkwebview-input-probe.png', {
            type: 'image/png',
            lastModified: 1700000000000
          }));
          input.files = transfer.files;
          const dispatched = input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          return { ok: true, before, dispatched, transferCount: transfer.files.length };
        })()
        """
        webView.evaluateJavaScript(script) { [weak self, weak webView] result, error in
            guard let self, !self.finished else { return }
            guard self.bridge?.isCurrentDocument(document) == true else {
                self.failure = "document authority expired during file-input verification"
                self.finished = true
                return
            }
            if let error {
                self.failure = "WKWebView file-input injection failed: \(error.localizedDescription)"
                self.finished = true
                return
            }
            guard let webView,
                  let values = result as? [String: Any],
                  values["ok"] as? Bool == true,
                  let before = values["before"] as? Int,
                  values["transferCount"] as? Int == 1 else {
                self.failure = "WKWebView rejected the native File-menu input contract: \(String(describing: result))"
                self.finished = true
                return
            }
            self.lastProbe = "WKWebView DataTransfer dispatched from asset count \(before): \(String(describing: values))"
            self.pollWebKitFileInputResult(
                in: webView,
                document: document,
                expectedCount: before + 1,
                attemptsRemaining: 200
            )
        }
    }

    private func pollWebKitFileInputResult(
        in webView: WKWebView,
        document: NativeDocumentTicket,
        expectedCount: Int,
        attemptsRemaining: Int
    ) {
        guard bridge?.isCurrentDocument(document) == true else {
            failure = "document authority expired during file-input result verification"
            finished = true
            return
        }
        let probe = """
        (() => ({
          count: document.querySelectorAll('.asset-list li').length,
          found: Array.from(document.querySelectorAll('.asset-list li'))
            .some((entry) => entry.textContent?.includes('wkwebview-input-probe.png')),
          error: document.querySelector('.notice[data-kind="error"]')?.textContent?.trim() ?? null
        }))()
        """
        webView.evaluateJavaScript(probe) { [weak self] result, error in
            guard let self, !self.finished else { return }
            if let error {
                self.failure = "WKWebView file-input result probe failed: \(error.localizedDescription)"
                self.finished = true
                return
            }
            let values = result as? [String: Any] ?? [:]
            let state = self.bridge?.clientState ?? ClientState()
            self.lastProbe = "WKWebView file input: \(String(describing: values)); saveState=\(state.saveState); projectBusy=\(state.projectBusy)"
            let count = values["count"] as? Int ?? -1
            let found = values["found"] as? Bool == true
            let settled = state.saveState == "saved" && !state.projectBusy && !state.exportInProgress
            if count == expectedCount && found && settled {
                self.webKitFileInputVerified = true
                self.finished = true
                return
            }
            if let userError = values["error"] as? String, !userError.isEmpty {
                self.failure = "WKWebView surfaced an error during native File-menu input verification: \(userError)"
                self.finished = true
                return
            }
            guard attemptsRemaining > 0 else {
                self.failure = "WKWebView DataTransfer reached the hidden input but never produced one settled React asset; expectedCount=\(expectedCount), lastProbe=\(self.lastProbe)"
                self.finished = true
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                self.pollWebKitFileInputResult(
                    in: webView,
                    document: document,
                    expectedCount: expectedCount,
                    attemptsRemaining: attemptsRemaining - 1
                )
            }
        }
    }

    private static let bootDiagnosticSource = """
    (() => {
      const clamp = (value, maximum = 600) => String(value ?? '').slice(0, maximum);
      const diagnostics = {
        errors: [],
        rejections: [],
        consoleErrors: [],
        startedAt: Date.now()
      };
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
        let description = String(describing: value)
        return String(description.prefix(maximum))
    }

    private static func hasBootFailure(_ value: Any?) -> Bool {
        guard let diagnostics = value as? [String: Any] else { return false }
        let errors = diagnostics["errors"] as? [Any] ?? []
        let rejections = diagnostics["rejections"] as? [Any] ?? []
        let consoleErrors = diagnostics["consoleErrors"] as? [Any] ?? []
        return !errors.isEmpty || !rejections.isEmpty || !consoleErrors.isEmpty
    }
}
