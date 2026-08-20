import AppKit
import Darwin
import Foundation
import UniformTypeIdentifiers
import WebKit

final class DriftAppDelegate: NSObject,
    NSApplicationDelegate,
    NSWindowDelegate,
    NSMenuItemValidation,
    WKNavigationDelegate,
    WKUIDelegate,
    WKDownloadDelegate
{
    let broker = NativeFileBroker()
    var window: NSWindow?
    var webView: WKWebView?
    var nativeBridge: NativeBridgeHost?
    var webRoot: URL?
    var clientState = ClientState()
    var pendingProjectDescriptors: [JSONDictionary] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        installMenus()
        configureRuntime()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            window?.makeKeyAndOrderFront(nil)
        }
        return true
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls where url.pathExtension.lowercased() == "pitched" {
            do {
                pendingProjectDescriptors.append(try broker.grantReadableFileDescriptor(url))
            } catch {
                presentWarning(title: "Project could not be opened", message: error.localizedDescription)
            }
        }
        deliverPendingProjectsIfPossible()
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard !clientState.busy else {
            presentBusyWarning(action: "quit")
            return .terminateCancel
        }
        broker.invalidateAll()
        return .terminateNow
    }

    func applicationWillTerminate(_ notification: Notification) {
        webView?.configuration.userContentController.removeScriptMessageHandler(
            forName: bridgeName,
            contentWorld: .page
        )
        broker.invalidateAll()
    }

    func configureRuntime() {
        guard let bridgeURL = Bundle.main.url(forResource: "NativeBridge", withExtension: "js"),
              let bridgeSource = try? String(contentsOf: bridgeURL, encoding: .utf8) else {
            presentFatalError("The native bridge could not be loaded from the application bundle.")
            return
        }

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let controller = configuration.userContentController
        controller.addUserScript(WKUserScript(
            source: bridgeSource,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true,
            in: .page
        ))

        let bridge = NativeBridgeHost(broker: broker) { [weak self] state in
            guard let self else { return }
            self.clientState = state
            NSApp.mainMenu?.update()
            self.deliverPendingProjectsIfPossible()
        }
        nativeBridge = bridge
        controller.addScriptMessageHandler(bridge, contentWorld: .page, name: bridgeName)

        let networkRules = """
        [
          {"trigger":{"url-filter":"^https?://.*"},"action":{"type":"block"}},
          {"trigger":{"url-filter":"^wss?://.*"},"action":{"type":"block"}},
          {"trigger":{"url-filter":"^ftp://.*"},"action":{"type":"block"}}
        ]
        """

        WKContentRuleListStore.default().compileContentRuleList(
            forIdentifier: "dog.pitch.drift.network-lock.v2",
            encodedContentRuleList: networkRules
        ) { [weak self] ruleList, error in
            DispatchQueue.main.async {
                guard let self else { return }
                guard let ruleList else {
                    self.presentFatalError(
                        "The local-only network boundary could not be installed. "
                        + (error?.localizedDescription ?? "Unknown WebKit error.")
                    )
                    return
                }
                controller.add(ruleList)
                self.openWindow(configuration: configuration)
            }
        }
    }

    func openWindow(configuration: WKWebViewConfiguration) {
        guard let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") else {
            presentFatalError("The bundled Drift web application is missing Web/index.html.")
            return
        }
        let webRoot = indexURL.deletingLastPathComponent().standardizedFileURL
        self.webRoot = webRoot

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsMagnification = true
        webView.underPageBackgroundColor = .black
        if #available(macOS 13.3, *) {
            webView.isInspectable = false
        }
        nativeBridge?.webView = webView
        self.webView = webView

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 920),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Drift — pitch.dog"
        window.minSize = NSSize(width: 960, height: 640)
        window.collectionBehavior.insert(.fullScreenPrimary)
        window.tabbingMode = .disallowed
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.contentView = webView
        window.setFrameAutosaveName("DriftMainWindow")
        if !window.setFrameUsingName("DriftMainWindow") {
            window.center()
        }
        window.makeKeyAndOrderFront(nil)
        self.window = window

        webView.loadFileURL(indexURL, allowingReadAccessTo: webRoot)
        NSApp.activate(ignoringOtherApps: true)
    }

    func reloadApplication() {
        guard !clientState.busy,
              let webView,
              let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web"),
              let webRoot else {
            NSSound.beep()
            return
        }
        clientState = ClientState()
        webView.loadFileURL(indexURL, allowingReadAccessTo: webRoot)
    }

    func deliverPendingProjectsIfPossible() {
        guard clientState.ready,
              !clientState.busy,
              !pendingProjectDescriptors.isEmpty,
              let webView,
              JSONSerialization.isValidJSONObject(pendingProjectDescriptors),
              let data = try? JSONSerialization.data(withJSONObject: pendingProjectDescriptors),
              let json = String(data: data, encoding: .utf8) else {
            return
        }
        pendingProjectDescriptors.removeAll()
        webView.evaluateJavaScript("void window.__driftNativeImportGranted?.('project', \(json));")
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        guard !clientState.busy else {
            presentBusyWarning(action: "close the window")
            return false
        }
        return true
    }

    func presentBusyWarning(action: String) {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = clientState.exporting ? "An export is still running" : "Drift is still saving"
        alert.informativeText = "Finish or cancel the current operation before you \(action). This protects the destination file and the local project."
        alert.addButton(withTitle: "Keep Working")
        if clientState.exporting {
            alert.addButton(withTitle: "Cancel Export")
        }
        let response = window.map { alert.runModal(for: $0) } ?? alert.runModal()
        if clientState.exporting && response == .alertSecondButtonReturn {
            performClientCommand("cancel-export", allowWhileBusy: true)
        }
    }

    func presentFatalError(_ message: String) {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "Drift could not start"
        alert.informativeText = message
        alert.addButton(withTitle: "Quit")
        alert.runModal()
        NSApp.terminate(nil)
    }

    func presentWarning(title: String, message: String) {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = title
        alert.informativeText = message
        if let window {
            alert.beginSheetModal(for: window)
        } else {
            alert.runModal()
        }
    }

}
