import AppKit
import Foundation
import WebKit

final class DriftAppDelegate: NSObject,
    NSApplicationDelegate,
    NSWindowDelegate,
    NSMenuItemValidation,
    WKNavigationDelegate,
    WKUIDelegate,
    WKDownloadDelegate {

    private var window: NSWindow?
    private var webView: WKWebView?
    private var webRootURL: URL?
    private var nativeBridge: NativeBridgeHost?
    private var contentRuleList: WKContentRuleList?
    private var preparingRuntime = false
    private var webRuntimeReady = false
    private var pendingProjectURLs: [URL] = []
    private var approvedClose = false
    private var revealLastSavedFileItem: NSMenuItem?
    private var webContentRecoveryPolicy = WebContentRecoveryPolicy()

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.appearance = nil
        installMenus()
        prepareLocalRuntime()
    }

    func applicationWillTerminate(_ notification: Notification) {
        nativeBridge?.abortAllWrites()
        removeNativeMessageHandler()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showMainWindowIfNeeded()
        return true
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard !approvedClose, let bridge = nativeBridge, bridge.clientState.hasProtectedWork else {
            return .terminateNow
        }
        if confirmProtectedExit(verb: "Quit") {
            approvedClose = true
            bridge.abortAllWrites()
            return .terminateNow
        }
        return .terminateCancel
    }

    func application(_ application: NSApplication, openFiles filenames: [String]) {
        let urls = filenames.map { URL(fileURLWithPath: $0).standardizedFileURL }
        let projects = urls.filter { $0.pathExtension.lowercased() == "pitched" }
        guard projects.count == urls.count, !projects.isEmpty else {
            application.reply(toOpenOrPrint: .failure)
            presentWarning(
                title: "Drift opens .pitched projects",
                message: "Slides and presenter media are added from inside the studio. Finder document opening is reserved for verified .pitched project bundles."
            )
            return
        }
        guard projects.count == 1, let project = projects.first else {
            application.reply(toOpenOrPrint: .failure)
            presentWarning(
                title: "Open one project at a time",
                message: "Drift has one current project. Open a single .pitched file, let it verify and settle, then open another if needed."
            )
            return
        }

        pendingProjectURLs.append(project)
        showMainWindowIfNeeded()
        deliverPendingProjectsIfPossible()
        application.reply(toOpenOrPrint: .success)
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        guard !approvedClose, let bridge = nativeBridge, bridge.clientState.hasProtectedWork else {
            return true
        }
        if confirmProtectedExit(verb: "Close") {
            approvedClose = true
            bridge.abortAllWrites()
            return true
        }
        return false
    }

    func windowWillClose(_ notification: Notification) {
        nativeBridge?.abortAllWrites()
        removeNativeMessageHandler()
        webRuntimeReady = false
        webRootURL = nil
        webView = nil
        nativeBridge = nil
        window = nil
        approvedClose = false
        webContentRecoveryPolicy.reset()
    }

    private func removeNativeMessageHandler() {
        webView?.configuration.userContentController.removeScriptMessageHandler(
            forName: driftBridgeName,
            contentWorld: .page
        )
    }

    private func showMainWindowIfNeeded() {
        if let window {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        if let ruleList = contentRuleList {
            openWindow(ruleList: ruleList)
        } else {
            prepareLocalRuntime()
        }
    }

    private func prepareLocalRuntime() {
        guard window == nil, !preparingRuntime else { return }
        preparingRuntime = true
        let networkRules = """
        [
          {"trigger":{"url-filter":"^https?://.*","resource-type":["document","image","style-sheet","script","font","media","raw","svg-document","popup"]},"action":{"type":"block"}},
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
                self.preparingRuntime = false
                guard let ruleList else {
                    self.presentFatalError(
                        "The local-only network boundary could not be installed. \(error?.localizedDescription ?? "Unknown WebKit error.")"
                    )
                    return
                }
                self.contentRuleList = ruleList
                self.openWindow(ruleList: ruleList)
            }
        }
    }

    private func openWindow(ruleList: WKContentRuleList) {
        guard window == nil else {
            window?.makeKeyAndOrderFront(nil)
            return
        }
        guard let bridgeURL = Bundle.main.url(forResource: "NativeBridge", withExtension: "js"),
              let bridgeSource = try? String(contentsOf: bridgeURL, encoding: .utf8),
              let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") else {
            presentFatalError("The application bundle is missing its web runtime or native bridge.")
            return
        }
        webRootURL = indexURL.deletingLastPathComponent().standardizedFileURL

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let controller = configuration.userContentController
        controller.add(ruleList)
        controller.addUserScript(WKUserScript(
            source: bridgeSource,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true,
            in: .page
        ))

        let bridge = NativeBridgeHost()
        bridge.clientStateDidChange = { [weak self] _ in
            self?.refreshMenuState()
            self?.deliverPendingProjectsIfPossible()
        }
        bridge.lastCommittedFileDidChange = { [weak self] _ in
            self?.revealLastSavedFileItem?.isEnabled = true
        }
        controller.addScriptMessageHandler(bridge, contentWorld: .page, name: driftBridgeName)
        nativeBridge = bridge

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsMagnification = true
        webView.allowsBackForwardNavigationGestures = false
        webView.underPageBackgroundColor = NSColor(calibratedWhite: 0.035, alpha: 1)
        bridge.webView = webView
        self.webView = webView

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 920),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.delegate = self
        window.title = "Drift — pitch.dog"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = true
        window.minSize = NSSize(width: 960, height: 620)
        window.collectionBehavior.insert(.fullScreenPrimary)
        window.tabbingMode = .disallowed
        window.contentView = webView
        window.setFrameAutosaveName("DriftMainWindow")
        if !window.setFrameUsingName("DriftMainWindow") { window.center() }
        window.makeKeyAndOrderFront(nil)
        self.window = window

        webRuntimeReady = false
        webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
        NSApp.activate(ignoringOtherApps: true)
    }

    private func confirmProtectedExit(verb: String) -> Bool {
        guard let state = nativeBridge?.clientState else { return true }
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "\(verb) Drift while work is protected?"
        alert.informativeText = "\(state.protectionReason) Closing now may discard the unfinished operation. Completed local projects remain in Drift’s app container."
        alert.addButton(withTitle: "Keep Working")
        alert.addButton(withTitle: state.exportInProgress ? "Cancel Export and \(verb)" : "\(verb) Anyway")
        return alert.runModal() == .alertSecondButtonReturn
    }

    private func presentFatalError(_ message: String) {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "Drift could not start"
        alert.informativeText = message
        alert.addButton(withTitle: "Quit")
        alert.runModal()
        NSApp.terminate(nil)
    }

    private func presentWarning(title: String, message: String) {
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

    private func deliverPendingProjectsIfPossible() {
        guard webRuntimeReady,
              let bridge = nativeBridge,
              !bridge.clientState.exportInProgress,
              !bridge.clientState.projectBusy else { return }
        let pending = pendingProjectURLs
        pendingProjectURLs.removeAll()
        for url in pending { bridge.importExternalFile(url, kind: .project) }
    }

    private func refreshMenuState() {
        NSApp.mainMenu?.update()
    }

    // MARK: - WebKit navigation and recovery

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webRuntimeReady = true
        deliverPendingProjectsIfPossible()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        presentWarning(title: "Drift could not finish loading", message: error.localizedDescription)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        nativeBridge?.abortAllWrites()
        webRuntimeReady = false

        let mayOfferRecovery = webContentRecoveryPolicy.consumeAttempt()
        let alert = NSAlert()
        alert.alertStyle = .critical
        if !mayOfferRecovery {
            alert.messageText = "The visual engine stopped twice"
            alert.informativeText = "Drift stopped the recovery loop. Incomplete native writes were rolled back. Quit, reopen the app, and use the autosaved project or a portable .pitched backup."
            alert.addButton(withTitle: "Quit Drift")
            alert.runModal()
            approvedClose = true
            NSApp.terminate(nil)
            return
        }

        alert.messageText = "The visual engine stopped unexpectedly"
        alert.informativeText = "Any incomplete native export was rolled back. Drift can make one recovery attempt from the locally saved project in its app container."
        alert.addButton(withTitle: "Reload Drift")
        alert.addButton(withTitle: "Quit")
        if alert.runModal() == .alertFirstButtonReturn {
            webView.reload()
        } else {
            approvedClose = true
            NSApp.terminate(nil)
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        guard let url = navigationAction.request.url,
              let scheme = url.scheme?.lowercased() else {
            decisionHandler(.cancel)
            return
        }

        if scheme == "file" {
            guard let webRootURL else {
                decisionHandler(.cancel)
                return
            }
            let candidate = url.standardizedFileURL
            let rootPath = webRootURL.path.hasSuffix("/") ? webRootURL.path : webRootURL.path + "/"
            if candidate == webRootURL || candidate.path.hasPrefix(rootPath) {
                decisionHandler(.allow)
            } else {
                NSSound.beep()
                decisionHandler(.cancel)
            }
            return
        }
        if ["blob", "data", "about"].contains(scheme) {
            decisionHandler(.allow)
            return
        }
        if ["http", "https"].contains(scheme), navigationAction.navigationType == .linkActivated {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        NSSound.beep()
        decisionHandler(.cancel)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url,
           let scheme = url.scheme?.lowercased(),
           ["http", "https"].contains(scheme) {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping ([URL]?) -> Void
    ) {
        guard frame.isMainFrame, let bridge = nativeBridge else {
            completionHandler(nil)
            return
        }
        let intent = bridge.currentInputIntent(defaultMultiple: parameters.allowsMultipleSelection)
        let panel = bridge.configuredOpenPanel(
            kind: intent.kind,
            multiple: parameters.allowsMultipleSelection && intent.multiple
        )
        panel.canChooseDirectories = parameters.allowsDirectories

        let finish: (NSApplication.ModalResponse) -> Void = { [weak self, weak bridge] result in
            guard let self, let bridge else {
                completionHandler(nil)
                return
            }
            guard result == .OK else {
                completionHandler(nil)
                return
            }
            do {
                let urls = try bridge.validateOpenPanelSelection(panel.urls, kind: intent.kind)
                bridge.rememberOpenPanelDirectory(urls)
                completionHandler(urls)
            } catch {
                self.presentWarning(
                    title: "Those files could not be added",
                    message: (error as? BridgeFailure)?.message ?? error.localizedDescription
                )
                completionHandler(nil)
            }
        }

        if let window {
            panel.beginSheetModal(for: window, completionHandler: finish)
        } else {
            finish(panel.runModal())
        }
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
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
        let finish: (NSApplication.ModalResponse) -> Void = { result in
            completionHandler(result == .OK ? panel.url : nil)
        }
        if let window {
            panel.beginSheetModal(for: window, completionHandler: finish)
        } else {
            finish(panel.runModal())
        }
    }

    func downloadDidFinish(_ download: WKDownload) {}

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        presentWarning(title: "The file could not be saved", message: error.localizedDescription)
    }

    // MARK: - Menus

    private func installMenus() {
        let mainMenu = NSMenu()
        mainMenu.addItem(appMenu())
        mainMenu.addItem(fileMenu())
        mainMenu.addItem(editMenu())
        mainMenu.addItem(playbackMenu())
        mainMenu.addItem(viewMenu())
        mainMenu.addItem(windowMenu())
        mainMenu.addItem(helpMenu())
        NSApp.mainMenu = mainMenu
    }

    private func appMenu() -> NSMenuItem {
        let item = NSMenuItem()
        let menu = NSMenu(title: "Drift")
        item.submenu = menu
        menu.addItem(withTitle: "About Drift", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "Copy Diagnostics", action: #selector(copyDiagnostics(_:)), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "Hide Drift", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = menu.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        menu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit Drift", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        return item
    }

    private func fileMenu() -> NSMenuItem {
        let item = NSMenuItem()
        let menu = NSMenu(title: "File")
        item.submenu = menu
        let openProject = menu.addItem(withTitle: "Open Project…", action: #selector(openProject(_:)), keyEquivalent: "o")
        openProject.target = self
        let addSlides = menu.addItem(withTitle: "Add Slides…", action: #selector(addSlides(_:)), keyEquivalent: "o")
        addSlides.keyEquivalentModifierMask = [.command, .shift]
        addSlides.target = self
        let addPresenter = menu.addItem(withTitle: "Add Presenter Video…", action: #selector(addPresenter(_:)), keyEquivalent: "o")
        addPresenter.keyEquivalentModifierMask = [.command, .option]
        addPresenter.target = self
        menu.addItem(.separator())
        let saveProject = menu.addItem(withTitle: "Save Portable Project…", action: #selector(savePortableProject(_:)), keyEquivalent: "s")
        saveProject.target = self
        menu.addItem(.separator())
        let exportMP4 = menu.addItem(withTitle: "Export MP4 Master…", action: #selector(exportMP4(_:)), keyEquivalent: "e")
        exportMP4.target = self
        let exportStill = menu.addItem(withTitle: "Export PNG Still…", action: #selector(exportStill(_:)), keyEquivalent: "e")
        exportStill.keyEquivalentModifierMask = [.command, .shift]
        exportStill.target = self
        let exportFrames = menu.addItem(withTitle: "Export PNG Sequence…", action: #selector(exportFrames(_:)), keyEquivalent: "e")
        exportFrames.keyEquivalentModifierMask = [.command, .option]
        exportFrames.target = self
        menu.addItem(.separator())
        let reveal = menu.addItem(withTitle: "Reveal Last Saved File in Finder", action: #selector(revealLastSavedFile(_:)), keyEquivalent: "")
        reveal.target = self
        reveal.isEnabled = false
        revealLastSavedFileItem = reveal
        menu.addItem(.separator())
        menu.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        return item
    }

    private func editMenu() -> NSMenuItem {
        let item = NSMenuItem()
        let menu = NSMenu(title: "Edit")
        item.submenu = menu
        menu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = menu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        menu.addItem(.separator())
        menu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        menu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        menu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        menu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        return item
    }

    private func playbackMenu() -> NSMenuItem {
        let item = NSMenuItem()
        let menu = NSMenu(title: "Playback")
        item.submenu = menu
        let toggle = menu.addItem(withTitle: "Play / Pause", action: #selector(togglePlayback(_:)), keyEquivalent: " ")
        toggle.target = self
        let previous = menu.addItem(withTitle: "Previous Slide", action: #selector(previousSlide(_:)), keyEquivalent: "[")
        previous.target = self
        let next = menu.addItem(withTitle: "Next Slide", action: #selector(nextSlide(_:)), keyEquivalent: "]")
        next.target = self
        menu.addItem(.separator())
        let cancel = menu.addItem(withTitle: "Cancel Export", action: #selector(cancelExport(_:)), keyEquivalent: ".")
        cancel.target = self
        return item
    }

    private func viewMenu() -> NSMenuItem {
        let item = NSMenuItem()
        let menu = NSMenu(title: "View")
        item.submenu = menu
        let focus = menu.addItem(withTitle: "Toggle Full Frame", action: #selector(toggleFocus(_:)), keyEquivalent: "f")
        focus.target = self
        menu.addItem(.separator())
        let actual = menu.addItem(withTitle: "Actual Size", action: #selector(actualSize(_:)), keyEquivalent: "0")
        actual.target = self
        let zoomIn = menu.addItem(withTitle: "Zoom In", action: #selector(zoomIn(_:)), keyEquivalent: "+")
        zoomIn.target = self
        let zoomOut = menu.addItem(withTitle: "Zoom Out", action: #selector(zoomOut(_:)), keyEquivalent: "-")
        zoomOut.target = self
        menu.addItem(.separator())
        let reload = menu.addItem(withTitle: "Reload Studio", action: #selector(reload(_:)), keyEquivalent: "r")
        reload.target = self
        menu.addItem(.separator())
        let fullScreen = menu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fullScreen.keyEquivalentModifierMask = [.command, .control]
        return item
    }

    private func windowMenu() -> NSMenuItem {
        let item = NSMenuItem()
        let menu = NSMenu(title: "Window")
        item.submenu = menu
        menu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        menu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")
        NSApp.windowsMenu = menu
        return item
    }

    private func helpMenu() -> NSMenuItem {
        let item = NSMenuItem()
        let menu = NSMenu(title: "Help")
        item.submenu = menu
        let guide = menu.addItem(withTitle: "Drift User Guide", action: #selector(openUserGuide(_:)), keyEquivalent: "?")
        guide.target = self
        let source = menu.addItem(withTitle: "View Complete Source", action: #selector(openSource(_:)), keyEquivalent: "")
        source.target = self
        NSApp.helpMenu = menu
        return item
    }

    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        let exporting = nativeBridge?.clientState.exportInProgress == true
        let protected = nativeBridge?.clientState.hasProtectedWork == true
        switch menuItem.action {
        case #selector(openProject(_:)), #selector(addSlides(_:)), #selector(addPresenter(_:)),
             #selector(savePortableProject(_:)), #selector(exportMP4(_:)), #selector(exportStill(_:)),
             #selector(exportFrames(_:)), #selector(reload(_:)):
            return webRuntimeReady && !protected
        case #selector(togglePlayback(_:)), #selector(previousSlide(_:)), #selector(nextSlide(_:)), #selector(toggleFocus(_:)):
            return webRuntimeReady && !protected
        case #selector(cancelExport(_:)):
            return webRuntimeReady && exporting
        case #selector(revealLastSavedFile(_:)):
            return revealLastSavedFileItem?.isEnabled == true
        default:
            return true
        }
    }

    @objc private func openProject(_ sender: Any?) { dispatchNativeCommand("open-project") }
    @objc private func addSlides(_ sender: Any?) { dispatchNativeCommand("add-slides") }
    @objc private func addPresenter(_ sender: Any?) { dispatchNativeCommand("add-presenter") }
    @objc private func savePortableProject(_ sender: Any?) { dispatchNativeCommand("save-project") }
    @objc private func exportMP4(_ sender: Any?) { dispatchNativeCommand("export-mp4") }
    @objc private func exportStill(_ sender: Any?) { dispatchNativeCommand("export-still") }
    @objc private func exportFrames(_ sender: Any?) { dispatchNativeCommand("export-frames") }
    @objc private func togglePlayback(_ sender: Any?) { dispatchNativeCommand("toggle-playback") }
    @objc private func previousSlide(_ sender: Any?) { dispatchNativeCommand("previous-slide") }
    @objc private func nextSlide(_ sender: Any?) { dispatchNativeCommand("next-slide") }
    @objc private func toggleFocus(_ sender: Any?) { dispatchNativeCommand("toggle-focus") }
    @objc private func cancelExport(_ sender: Any?) { dispatchNativeCommand("cancel-export") }

    @objc private func revealLastSavedFile(_ sender: Any?) {
        nativeBridge?.revealLastCommittedFileInFinder()
    }

    @objc private func actualSize(_ sender: Any?) {
        webView?.setMagnification(1, centeredAt: .zero)
    }

    @objc private func zoomIn(_ sender: Any?) {
        guard let webView else { return }
        webView.setMagnification(min(webView.magnification + 0.1, 2), centeredAt: .zero)
    }

    @objc private func zoomOut(_ sender: Any?) {
        guard let webView else { return }
        webView.setMagnification(max(webView.magnification - 0.1, 0.5), centeredAt: .zero)
    }

    @objc private func reload(_ sender: Any?) {
        if let state = nativeBridge?.clientState, state.hasProtectedWork {
            presentWarning(
                title: "Drift cannot reload while work is protected",
                message: "\(state.protectionReason) Finish or cancel that operation before reloading the studio."
            )
            return
        }
        webRuntimeReady = false
        webView?.reload()
    }

    @objc private func openUserGuide(_ sender: Any?) {
        guard let url = Bundle.main.url(forResource: "MACOS_USER_GUIDE", withExtension: "md", subdirectory: "Documentation") else {
            NSSound.beep()
            return
        }
        NSWorkspace.shared.open(url)
    }

    @objc private func openSource(_ sender: Any?) {
        guard let url = URL(string: "https://github.com/bomkino/pitchdog-drift") else { return }
        NSWorkspace.shared.open(url)
    }

    @objc private func copyDiagnostics(_ sender: Any?) {
        let state = nativeBridge?.clientState ?? ClientState()
        let diagnostics = """
        Drift \(appVersionString())
        macOS: \(ProcessInfo.processInfo.operatingSystemVersionString)
        Architecture: \(currentArchitecture())
        Native bridge: \(driftBridgeVersion)
        System codecs only: yes
        App network entitlement: none
        Export active: \(state.exportInProgress)
        Project operation active: \(state.projectBusy)
        Local save state: \(state.saveState)
        Recent notice signal: \(state.lastNotice ?? "none")
        Web content recovery remaining: \(webContentRecoveryPolicy.hasRemainingAttempt)
        """
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(diagnostics, forType: .string)
    }

    private func dispatchNativeCommand(_ command: String) {
        guard let webView else { return }
        let escaped = command.replacingOccurrences(of: "'", with: "\\'")
        webView.evaluateJavaScript("window.__driftNativeCommand?.('\(escaped)');") { _, error in
            if let error { NSLog("Drift menu command failed: %@", error.localizedDescription) }
        }
    }
}
