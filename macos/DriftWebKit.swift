import AppKit
import Foundation
import WebKit

extension DriftAppDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url,
              let scheme = url.scheme?.lowercased() else {
            decisionHandler(.cancel)
            return
        }

        if ["http", "https", "mailto"].contains(scheme) {
            if navigationAction.navigationType == .linkActivated {
                NSWorkspace.shared.open(url)
            } else {
                NSSound.beep()
            }
            decisionHandler(.cancel)
            return
        }

        let allowed: Bool
        switch scheme {
        case "file":
            allowed = isBundledWebURL(url)
        case "blob", "data", "about":
            allowed = true
        default:
            allowed = false
        }
        guard allowed else {
            NSSound.beep()
            decisionHandler(.cancel)
            return
        }
        decisionHandler(navigationAction.shouldPerformDownload ? .download : .allow)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        guard let url = navigationResponse.response.url,
              let scheme = url.scheme?.lowercased(),
              ["file", "blob", "data", "about"].contains(scheme) else {
            decisionHandler(.cancel)
            return
        }
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping ([URL]?) -> Void
    ) {
        guard frame.isMainFrame else {
            completionHandler(nil)
            return
        }
        let panel = NSOpenPanel()
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = !parameters.allowsDirectories
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canCreateDirectories = false
        panel.resolvesAliases = true
        panel.treatsFilePackagesAsDirectories = false

        if let window {
            panel.beginSheetModal(for: window) { result in
                completionHandler(result == .OK ? panel.urls : nil)
            }
        } else {
            completionHandler(panel.runModal() == .OK ? panel.urls : nil)
        }
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        broker.abortActiveWrites()
        clientState = ClientState()

        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "Drift’s renderer stopped unexpectedly"
        alert.informativeText = "Any in-progress destination was rolled back. Your last completed local save remains intact. Reload the studio to reopen it."
        alert.addButton(withTitle: "Reload Drift")
        alert.addButton(withTitle: "Quit")
        let response = window.map { alert.runModal(for: $0) } ?? alert.runModal()
        if response == .alertFirstButtonReturn {
            reloadApplication()
        } else {
            NSApp.terminate(nil)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        presentWarning(title: "Drift could not finish loading", message: error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        presentWarning(title: "Drift could not load", message: error.localizedDescription)
    }

    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping (URL?) -> Void
    ) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = safeLeafName(suggestedFilename, fallback: "Drift Export")
        panel.canCreateDirectories = true
        panel.isExtensionHidden = false

        if let window {
            panel.beginSheetModal(for: window) { result in
                completionHandler(result == .OK ? panel.url : nil)
            }
        } else {
            completionHandler(panel.runModal() == .OK ? panel.url : nil)
        }
    }

    func downloadDidFinish(_ download: WKDownload) {}

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        presentWarning(title: "The download could not be saved", message: error.localizedDescription)
    }

    private func isBundledWebURL(_ url: URL) -> Bool {
        guard let webRoot else { return false }
        let candidate = url.standardizedFileURL.resolvingSymlinksInPath()
        let root = webRoot.standardizedFileURL.resolvingSymlinksInPath()
        return candidate.path == root.path || candidate.path.hasPrefix(root.path + "/")
    }

}
