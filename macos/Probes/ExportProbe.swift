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
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.userContentController.add(self, name: "driftExportProbe")

        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 640, height: 900), configuration: configuration)
        webView.navigationDelegate = self
        window = NSWindow(
            contentRect: NSRect(x: -10_000, y: -10_000, width: 640, height: 900),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        window.contentView = webView
        window.orderOut(nil)

        webView.loadFileURL(htmlURL, allowingReadAccessTo: htmlURL.deletingLastPathComponent())
        timeoutTimer = Timer.scheduledTimer(withTimeInterval: timeoutSeconds, repeats: false) { [weak self] _ in
            self?.finish([
                "schemaVersion": 1,
                "ok": false,
                "phase": "timeout",
                "error": [
                    "name": "TimeoutError",
                    "message": "WKWebView exporter probe timed out after \(timeoutSeconds) seconds.",
                ],
            ], exitCode: 2)
        }
        RunLoop.current.add(timeoutTimer!, forMode: .common)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "driftExportProbe", let dictionary = message.body as? [String: Any] else {
            finish([
                "schemaVersion": 1,
                "ok": false,
                "phase": "bridge",
                "error": ["name": "DataError", "message": "Exporter probe returned unreadable data."],
            ], exitCode: 2)
            return
        }
        finish(dictionary, exitCode: dictionary["ok"] as? Bool == true ? 0 : 1)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        failNavigation("navigation", error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        failNavigation("provisional-navigation", error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        finish([
            "schemaVersion": 1,
            "ok": false,
            "phase": "web-content-process",
            "error": ["name": "AbortError", "message": "WKWebView content process terminated during export."],
        ], exitCode: 2)
    }

    private func failNavigation(_ phase: String, _ error: Error) {
        finish([
            "schemaVersion": 1,
            "ok": false,
            "phase": phase,
            "error": ["name": "NavigationError", "message": error.localizedDescription],
        ], exitCode: 2)
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
        webView?.stopLoading()
        DispatchQueue.main.async {
            NSApplication.shared.terminate(nil)
            Darwin.exit(exitCode)
        }
    }
}

let application = NSApplication.shared
application.setActivationPolicy(.prohibited)
let probe = ExportProbe()
do {
    try probe.run()
    application.run()
} catch {
    FileHandle.standardError.write(Data("Drift exporter probe could not start: \(error.localizedDescription)\n".utf8))
    Darwin.exit(2)
}
