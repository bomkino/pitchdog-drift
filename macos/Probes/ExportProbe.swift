import AppKit
import Foundation
import WebKit

private let environment = ProcessInfo.processInfo.environment
private let htmlPath = environment["DRIFT_EXPORT_PROBE_HTML"] ?? ""
private let bundleRootPath = environment["DRIFT_EXPORT_PROBE_ROOT"] ?? ""
private let reportPath = environment["DRIFT_EXPORT_PROBE_REPORT"]
private let timeoutSeconds = Double(environment["DRIFT_EXPORT_PROBE_TIMEOUT"] ?? "240") ?? 240
private let bootstrapTimeoutSeconds = 12.0

private final class ExportProbe: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var timeoutTimer: Timer?
    private var bootstrapTimer: Timer?
    private var completed = false
    private var startedNavigation = false
    private var committedNavigation = false
    private var finishedNavigation = false
    private var contentProcessTerminationCount = 0
    private var progressEventCount = 0
    private var latestProgress: [String: Any]?
    private var htmlURL: URL?
    private var readAccessRootURL: URL?
    private let launchedAt = Date()

    func run() throws {
        guard !htmlPath.isEmpty else {
            throw NSError(domain: "DriftExportProbe", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "DRIFT_EXPORT_PROBE_HTML is missing.",
            ])
        }
        guard !bundleRootPath.isEmpty else {
            throw NSError(domain: "DriftExportProbe", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "DRIFT_EXPORT_PROBE_ROOT is missing.",
            ])
        }

        let rootURL = URL(fileURLWithPath: bundleRootPath, isDirectory: true)
            .standardizedFileURL
            .resolvingSymlinksInPath()
        let candidateHTML = URL(fileURLWithPath: htmlPath)
            .standardizedFileURL
            .resolvingSymlinksInPath()
        var rootIsDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: rootURL.path, isDirectory: &rootIsDirectory),
              rootIsDirectory.boolValue else {
            throw NSError(domain: "DriftExportProbe", code: 3, userInfo: [
                NSLocalizedDescriptionKey: "Probe bundle root does not exist at \(rootURL.path).",
            ])
        }
        let rootPrefix = rootURL.path.hasSuffix("/") ? rootURL.path : rootURL.path + "/"
        guard candidateHTML.path.hasPrefix(rootPrefix) else {
            throw NSError(domain: "DriftExportProbe", code: 4, userInfo: [
                NSLocalizedDescriptionKey: "Probe HTML escaped its verified bundle root.",
            ])
        }
        guard FileManager.default.fileExists(atPath: candidateHTML.path) else {
            throw NSError(domain: "DriftExportProbe", code: 5, userInfo: [
                NSLocalizedDescriptionKey: "Probe HTML does not exist at \(candidateHTML.path).",
            ])
        }
        htmlURL = candidateHTML
        readAccessRootURL = rootURL

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.suppressesIncrementalRendering = false
        configuration.userContentController.add(self, name: "driftExportProbe")

        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 640, height: 900), configuration: configuration)
        webView.navigationDelegate = self
        webView.underPageBackgroundColor = NSColor(calibratedWhite: 0.025, alpha: 1)

        // VideoEncoder and the WebKit GPU process are lifecycle-sensitive on
        // hosted Macs. A hidden or far-off-screen window can keep the compositor
        // dormant even when one-frame codec probes pass. Exercise the visible
        // lifecycle a real Drift user receives.
        window = NSWindow(
            contentRect: NSRect(x: 90, y: 70, width: 640, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.isReleasedWhenClosed = false
        window.title = "Drift deterministic export verification"
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)

        // Vite emits the HTML in tests/ and executable modules in sibling
        // assets/. Grant the verified bundle root—not merely the HTML parent—so
        // every receipt-checked module can load while unrelated files stay out.
        webView.loadFileURL(candidateHTML, allowingReadAccessTo: rootURL)
        timeoutTimer = Timer.scheduledTimer(withTimeInterval: timeoutSeconds, repeats: false) { [weak self] _ in
            guard let self else { return }
            self.finish(self.failureReport(
                phase: "timeout",
                name: "TimeoutError",
                message: "WKWebView exporter probe timed out after \(timeoutSeconds) seconds."
            ), exitCode: 2)
        }
        RunLoop.current.add(timeoutTimer!, forMode: .common)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "driftExportProbe", let dictionary = message.body as? [String: Any] else {
            finish(failureReport(
                phase: "bridge",
                name: "DataError",
                message: "Exporter probe returned unreadable data."
            ), exitCode: 2)
            return
        }

        if dictionary["kind"] as? String == "progress" {
            progressEventCount += 1
            latestProgress = dictionary
            bootstrapTimer?.invalidate()
            bootstrapTimer = nil
            emitProgress(dictionary)
            return
        }

        guard dictionary["ok"] is Bool else {
            finish(failureReport(
                phase: "bridge",
                name: "DataError",
                message: "Exporter probe sent neither progress nor a final result."
            ), exitCode: 2)
            return
        }

        var final = dictionary
        final["nativeHarness"] = harnessDiagnostics()
        finish(final, exitCode: dictionary["ok"] as? Bool == true ? 0 : 1)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        startedNavigation = true
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        committedNavigation = true
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        finishedNavigation = true
        scheduleJavaScriptBootstrapCheck()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        failNavigation("navigation", error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        failNavigation("provisional-navigation", error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        contentProcessTerminationCount += 1
        finish(failureReport(
            phase: "web-content-process",
            name: "AbortError",
            message: "WKWebView content process terminated during deterministic export."
        ), exitCode: 2)
    }

    private func scheduleJavaScriptBootstrapCheck() {
        bootstrapTimer?.invalidate()
        bootstrapTimer = Timer.scheduledTimer(withTimeInterval: bootstrapTimeoutSeconds, repeats: false) { [weak self] _ in
            self?.inspectJavaScriptBootstrap()
        }
        if let bootstrapTimer { RunLoop.current.add(bootstrapTimer, forMode: .common) }
    }

    private func inspectJavaScriptBootstrap() {
        guard !completed, progressEventCount == 0 else { return }
        let inspection = """
        (() => ({
          title: document.title,
          readyState: document.readyState,
          bodyText: (document.body?.innerText || '').slice(0, 500),
          scripts: Array.from(document.scripts).map((script) => ({
            src: script.src,
            type: script.type,
            noModule: script.noModule
          }))
        }))()
        """
        webView.evaluateJavaScript(inspection) { [weak self] value, error in
            guard let self, !self.completed, self.progressEventCount == 0 else { return }
            var details = value as? [String: Any] ?? [:]
            if let error { details["evaluationError"] = error.localizedDescription }
            details["readAccessRoot"] = self.readAccessRootURL?.path ?? NSNull()
            details["html"] = self.htmlURL?.path ?? NSNull()
            let title = details["title"] as? String ?? ""
            let moduleAppearsStarted = title.hasPrefix("Drift export probe ·")
            let message = moduleAppearsStarted
                ? "The export module started but could not reach its native progress bridge."
                : "The probe HTML loaded, but its bundled JavaScript module did not start. Verify the receipt-checked asset graph and WebKit read-access root."
            self.finish(self.failureReport(
                phase: "javascript-bootstrap",
                name: "InvalidStateError",
                message: message,
                details: details
            ), exitCode: 2)
        }
    }

    private func failNavigation(_ phase: String, _ error: Error) {
        finish(failureReport(
            phase: phase,
            name: "NavigationError",
            message: error.localizedDescription
        ), exitCode: 2)
    }

    private func failureReport(
        phase: String,
        name: String,
        message: String,
        details: [String: Any] = [:]
    ) -> [String: Any] {
        var error: [String: Any] = ["name": name, "message": message]
        if !details.isEmpty { error["details"] = details }
        return [
            "schemaVersion": 1,
            "ok": false,
            "phase": phase,
            "error": error,
            "nativeHarness": harnessDiagnostics(),
        ]
    }

    private func harnessDiagnostics() -> [String: Any] {
        [
            "elapsedSeconds": Date().timeIntervalSince(launchedAt),
            "startedNavigation": startedNavigation,
            "committedNavigation": committedNavigation,
            "finishedNavigation": finishedNavigation,
            "contentProcessTerminationCount": contentProcessTerminationCount,
            "progressEventCount": progressEventCount,
            "latestProgress": latestProgress ?? NSNull(),
            "isLoading": webView?.isLoading ?? false,
            "estimatedProgress": webView?.estimatedProgress ?? 0,
            "title": webView?.title ?? NSNull(),
            "url": webView?.url?.absoluteString ?? NSNull(),
            "html": htmlURL?.path ?? NSNull(),
            "readAccessRoot": readAccessRootURL?.path ?? NSNull(),
            "windowVisible": window?.isVisible ?? false,
            "activationPolicy": NSApplication.shared.activationPolicy().rawValue,
        ]
    }

    private func emitProgress(_ dictionary: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: dictionary, options: [.sortedKeys]),
              let line = String(data: data, encoding: .utf8) else { return }
        FileHandle.standardOutput.write(Data("DRIFT_EXPORT_PROGRESS \(line)\n".utf8))
    }

    private func finish(_ dictionary: [String: Any], exitCode: Int32) {
        guard !completed else { return }
        completed = true
        timeoutTimer?.invalidate()
        timeoutTimer = nil
        bootstrapTimer?.invalidate()
        bootstrapTimer = nil
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "driftExportProbe")

        do {
            let data = try JSONSerialization.data(withJSONObject: dictionary, options: [.prettyPrinted, .sortedKeys])
            if let reportPath {
                let reportURL = URL(fileURLWithPath: reportPath)
                try FileManager.default.createDirectory(
                    at: reportURL.deletingLastPathComponent(),
                    withIntermediateDirectories: true
                )
                try data.write(to: reportURL, options: .atomic)
            }
            FileHandle.standardOutput.write(data)
            FileHandle.standardOutput.write(Data("\n".utf8))
        } catch {
            FileHandle.standardError.write(Data("Could not serialize export-probe report: \(error)\n".utf8))
            Darwin.exit(2)
        }

        window?.orderOut(nil)
        window?.close()
        webView?.stopLoading()
        webView?.navigationDelegate = nil
        DispatchQueue.main.async {
            NSApplication.shared.terminate(nil)
            Darwin.exit(exitCode)
        }
    }
}

let application = NSApplication.shared
application.setActivationPolicy(.accessory)
application.finishLaunching()
private let probe = ExportProbe()
do {
    try probe.run()
    application.run()
} catch {
    FileHandle.standardError.write(Data("Drift exporter probe could not start: \(error.localizedDescription)\n".utf8))
    Darwin.exit(2)
}
