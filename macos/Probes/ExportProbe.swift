import AppKit
import Foundation
import WebKit

private let environment = ProcessInfo.processInfo.environment
private let htmlPath = environment["DRIFT_EXPORT_PROBE_HTML"] ?? ""
private let reportPath = environment["DRIFT_EXPORT_PROBE_REPORT"]
private let timeoutSeconds = Double(environment["DRIFT_EXPORT_PROBE_TIMEOUT"] ?? "240") ?? 240

private final class ExportProbe: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var timeoutTimer: Timer?
    private var completed = false
    private var startedNavigation = false
    private var committedNavigation = false
    private var finishedNavigation = false
    private var contentProcessTerminationCount = 0
    private var progressEventCount = 0
    private var latestProgress: [String: Any]?
    private let launchedAt = Date()

    func run() throws {
        guard !htmlPath.isEmpty else {
            throw NSError(domain: "DriftExportProbe", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "DRIFT_EXPORT_PROBE_HTML is missing.",
            ])
        }
        let htmlURL = URL(fileURLWithPath: htmlPath).standardizedFileURL
        guard FileManager.default.fileExists(atPath: htmlURL.path) else {
            throw NSError(domain: "DriftExportProbe", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Probe HTML does not exist at \(htmlURL.path).",
            ])
        }

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
        // hosted Macs. A prohibited, hidden, 10,000-point-off-screen window made
        // the old test wait forever even though the same runtime encoded AVC in
        // the visible codec probe. Use the compositor lifecycle users actually
        // receive; CI has no human viewer to disturb.
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

        webView.loadFileURL(htmlURL, allowingReadAccessTo: htmlURL.deletingLastPathComponent())
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

    private func failNavigation(_ phase: String, _ error: Error) {
        finish(failureReport(
            phase: phase,
            name: "NavigationError",
            message: error.localizedDescription
        ), exitCode: 2)
    }

    private func failureReport(phase: String, name: String, message: String) -> [String: Any] {
        [
            "schemaVersion": 1,
            "ok": false,
            "phase": phase,
            "error": ["name": name, "message": message],
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
            "url": webView?.url?.absoluteString ?? NSNull(),
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
