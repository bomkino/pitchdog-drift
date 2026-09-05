import AppKit
import Foundation
import WebKit

struct NativeWebViewGenerationTracker {
    private var activeIdentity: ObjectIdentifier?
    private(set) var generation: UInt64 = 0

    @discardableResult
    mutating func install(_ webView: AnyObject) -> UInt64 {
        generation &+= 1
        activeIdentity = ObjectIdentifier(webView)
        return generation
    }

    mutating func retire() {
        generation &+= 1
        activeIdentity = nil
    }

    func accepts(_ webView: AnyObject, generation expectedGeneration: UInt64? = nil) -> Bool {
        guard activeIdentity == ObjectIdentifier(webView) else { return false }
        if let expectedGeneration, generation != expectedGeneration { return false }
        return true
    }

    static func runSelfTest() throws {
        let first = NSObject()
        let replacement = NSObject()
        var tracker = NativeWebViewGenerationTracker()
        let firstGeneration = tracker.install(first)
        guard tracker.accepts(first, generation: firstGeneration) else {
            throw BridgeFailure("InvalidStateError", "The installed WebView generation was not accepted.")
        }
        let replacementGeneration = tracker.install(replacement)
        guard !tracker.accepts(first),
              !tracker.accepts(first, generation: firstGeneration),
              !tracker.accepts(replacement, generation: firstGeneration),
              tracker.accepts(replacement, generation: replacementGeneration) else {
            throw BridgeFailure(
                "InvalidStateError",
                "A callback from a retired WebView generation could reach its replacement."
            )
        }
        tracker.retire()
        guard !tracker.accepts(first), !tracker.accepts(replacement) else {
            throw BridgeFailure("InvalidStateError", "Retiring a WebView left its callback identity active.")
        }
        print("Drift WebView-generation self-test passed: retired and replaced views cannot mutate the active native runtime.")
    }
}

private let driftSourceRepositoryRootURL = URL(string: "https://github.com/bomkino/pitchdog-drift")!

func driftCompleteSourceURL(for sourceRevision: String?) -> URL {
    guard let sourceRevision,
          sourceRevision.utf8.count == 40,
          sourceRevision.utf8.allSatisfy({ byte in
              (48...57).contains(byte) || (97...102).contains(byte)
          }) else {
        return driftSourceRepositoryRootURL
    }
    return driftSourceRepositoryRootURL
        .appendingPathComponent("tree", isDirectory: true)
        .appendingPathComponent(sourceRevision, isDirectory: false)
}

/// AppDelegate retains this token from Finder admission through React's final
/// import acknowledgement. Teardown may fail it first; any late native/WebKit
/// completion then becomes a no-op instead of replying twice.
final class NativeFinderOpenReplyOnce {
    let identifier: UUID
    private let lock = NSLock()
    private var reply: ((NSApplication.DelegateReply) -> Void)?

    init(
        identifier: UUID = UUID(),
        reply: @escaping (NSApplication.DelegateReply) -> Void
    ) {
        self.identifier = identifier
        self.reply = reply
    }

    func finish(_ value: NSApplication.DelegateReply) {
        lock.lock()
        let activeReply = reply
        reply = nil
        lock.unlock()
        activeReply?(value)
    }

    static func runSelfTest() throws {
        try NativeWebViewGenerationTracker.runSelfTest()
        var firstResults: [NSApplication.DelegateReply] = []
        let first = NativeFinderOpenReplyOnce { firstResults.append($0) }
        first.finish(.failure)
        first.finish(.success)

        var replacementResults: [NSApplication.DelegateReply] = []
        let replacement = NativeFinderOpenReplyOnce { replacementResults.append($0) }
        first.finish(.success)
        replacement.finish(.success)
        replacement.finish(.failure)

        guard firstResults.count == 1,
              firstResults.first == .failure,
              replacementResults.count == 1,
              replacementResults.first == .success else {
            throw BridgeFailure(
                "InvalidStateError",
                "Finder open replies were not isolated and settled exactly once across replacement."
            )
        }
        print("Drift Finder reply self-test passed: queued, in-flight, teardown, late-callback, and replacement replies share one exactly-once token contract.")
    }
}

final class DriftAppDelegate: NSObject,
    NSApplicationDelegate,
    NSWindowDelegate,
    NSMenuItemValidation,
    WKNavigationDelegate,
    WKUIDelegate {

    private var window: NSWindow?
    private var webView: WKWebView?
    private var webRootURL: URL?
    private var trustedIndexURL: URL?
    private var nativeBridge: NativeBridgeHost?
    private var activeDocumentTicket: NativeDocumentTicket?
    private var contentRuleList: WKContentRuleList?
    private var preparingRuntime = false
    private var webRuntimeReady = false
    private var webNavigationFinished = false
    private var documentAuthorityDelivered = false
    private var receivedAuthoritativeClientState = false
    private var recoveryResetScheduled = false
    private var recoveryStabilityGeneration = 0
    private var pendingProjectURLs: [URL] = []
    private var pendingProjectReply: NativeFinderOpenReplyOnce?
    private var inFlightProjectReplyIdentifier: UUID?
    private var webViewGeneration = NativeWebViewGenerationTracker()
    private var approvedClose = false
    private var exitDecisionInProgress = false
    private var revealLastSavedFileItem: NSMenuItem?
    private var webContentRecoveryPolicy = WebContentRecoveryPolicy()
    private var navigationIdentity = NavigationIdentityTracker()
    private let launchLifecycleSelfTest: Bool

    init(launchLifecycleSelfTest: Bool = false) {
        self.launchLifecycleSelfTest = launchLifecycleSelfTest
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard driftBuildIdentityIsValid() else {
            presentFatalError("The signed application identity is internally inconsistent. Rebuild Drift from a supported product profile.")
            return
        }
        NSApp.appearance = nil
        installMenus()
        prepareLocalRuntime()
    }

    func applicationWillTerminate(_ notification: Notification) {
        invalidateRecoveryStabilityWindow()
        navigationIdentity.invalidate()
        retireCurrentWebView()
        nativeBridge?.shutdown()
        resetDocumentReadiness()
        failPendingProjectOpen()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showMainWindowIfNeeded()
        return true
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard !approvedClose, hasProtectedWork else {
            return .terminateNow
        }
        guard !exitDecisionInProgress else { return .terminateCancel }
        DispatchQueue.main.async { [weak self] in
            guard let self else { sender.reply(toApplicationShouldTerminate: false); return }
            self.requestDocumentExit(verb: "Quit") { approved in
                if approved {
                    self.approvedClose = true
                    self.invalidateDocumentAuthority()
                }
                sender.reply(toApplicationShouldTerminate: approved)
            }
        }
        return .terminateLater
    }

    func application(_ application: NSApplication, openFiles filenames: [String]) {
        guard driftAllowsExternalPortableProjects else {
            application.reply(toOpenOrPrint: .failure)
            presentWarning(
                title: "Drift V2 Dev protects production projects",
                message: "This development build opens copied fixtures only through its verification harness. Use Drift for real .pitched projects."
            )
            return
        }
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
        guard pendingProjectReply == nil,
              inFlightProjectReplyIdentifier == nil,
              pendingProjectURLs.isEmpty else {
            application.reply(toOpenOrPrint: .failure)
            presentWarning(
                title: "A project is already waiting to open",
                message: "Drift accepts one Finder project request through verification and local storage. Let the current request settle before opening another."
            )
            return
        }
        if receivedAuthoritativeClientState,
           let state = nativeBridge?.clientState,
           state.hasProtectedWork {
            application.reply(toOpenOrPrint: .failure)
            presentWarning(
                title: "Finish the current studio operation first",
                message: "\(state.protectionReason) Drift did not queue this project to replace your work later. Open it again after the current operation finishes."
            )
            return
        }
        pendingProjectURLs = [project]
        pendingProjectReply = NativeFinderOpenReplyOnce { reply in
            application.reply(toOpenOrPrint: reply)
        }
        showMainWindowIfNeeded()
        deliverPendingProjectsIfPossible()
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        guard sender === window else { return true }
        guard !approvedClose, hasProtectedWork else {
            return true
        }
        guard !exitDecisionInProgress else { return false }
        requestDocumentExit(verb: "Close") { [weak self, weak sender] approved in
            guard let self, let sender, approved else { return }
            self.approvedClose = true
            sender.performClose(nil)
        }
        return false
    }

    func windowWillClose(_ notification: Notification) {
        guard let closingWindow = notification.object as? NSWindow,
              closingWindow === window else { return }
        invalidateRecoveryStabilityWindow()
        navigationIdentity.invalidate()
        retireCurrentWebView()
        nativeBridge?.shutdown()
        resetDocumentReadiness()
        failPendingProjectOpen()
        pendingProjectURLs.removeAll()
        webRootURL = nil
        trustedIndexURL = nil
        webView = nil
        nativeBridge = nil
        window = nil
        approvedClose = false
        webContentRecoveryPolicy.reset()
    }

    private func removeNativeMessageHandler(from webView: WKWebView) {
        webView.configuration.userContentController.removeScriptMessageHandler(
            forName: driftBridgeName,
            contentWorld: .page
        )
    }

    private func retireCurrentWebView() {
        webViewGeneration.retire()
        guard let webView else { return }
        removeNativeMessageHandler(from: webView)
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
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
        WKContentRuleListStore.default().compileContentRuleList(
            forIdentifier: TrustedWebRuntime.networkPolicyIdentifier,
            encodedContentRuleList: TrustedWebRuntime.networkPolicyJSON
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
        trustedIndexURL = indexURL.standardizedFileURL
        resetDocumentReadiness()
        invalidateRecoveryStabilityWindow()

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = driftWebsiteDataStore()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let controller = configuration.userContentController
        controller.add(ruleList)
        controller.addUserScript(WKUserScript(
            source: TrustedWebRuntime.webRTCCapabilityLockdownJavaScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false,
            in: .page
        ))
        controller.addUserScript(WKUserScript(
            source: bridgeSource,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true,
            in: .page
        ))

        let bridge = NativeBridgeHost()
        bridge.clientStateDidChange = { [weak self, weak bridge] _ in
            guard let self, let bridge,
                  self.nativeBridge === bridge,
                  bridge.hasActiveDocument else { return }
            self.receivedAuthoritativeClientState = true
            self.updateWindowDocumentState(bridge.clientState)
            self.updateWebRuntimeReadiness()
            self.refreshMenuState()
            self.deliverPendingProjectsIfPossible()
            self.scheduleRecoveryBudgetResetIfNeeded()
        }
        bridge.lastCommittedFileDidChange = { [weak self, weak bridge] _ in
            guard let self, let bridge, self.nativeBridge === bridge else { return }
            self.revealLastSavedFileItem?.isEnabled = true
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
        webViewGeneration.install(webView)
        self.webView = webView

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 920),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.delegate = self
        window.title = "\(driftApplicationDisplayName) — pitch.dog"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = true
        window.minSize = NSSize(width: 960, height: 620)
        window.collectionBehavior.insert(.fullScreenPrimary)
        window.tabbingMode = .disallowed
        window.contentView = webView
        let frameAutosaveName = "\(driftApplicationDisplayName.replacingOccurrences(of: " ", with: ""))MainWindow"
        window.setFrameAutosaveName(frameAutosaveName)
        if !window.setFrameUsingName(frameAutosaveName) { window.center() }
        window.makeKeyAndOrderFront(nil)
        self.window = window
        updateWindowDocumentState(bridge.clientState)

        if launchLifecycleSelfTest {
            // Exercise the real NSApplicationDelegate path without loading or
            // mutating a user's saved Web runtime. One run-loop turn proves
            // that the delegate and its visible main window both survived.
            DispatchQueue.main.async { [weak self, weak window] in
                guard let self,
                      let window,
                      self.window === window,
                      window.isVisible,
                      NSApp.activationPolicy() == .regular else {
                    fputs("Drift app lifecycle self-test failed: the retained delegate did not own a visible regular-app window.\n", stderr)
                    fflush(stderr)
                    Darwin.exit(1)
                }
                print("Drift app lifecycle self-test passed: delegate retained and main window visible.")
                fflush(stdout)
                Darwin.exit(0)
            }
            return
        }

        webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
        NSApp.activate(ignoringOtherApps: true)
    }

    /// Saving is asynchronous: the window stays alive until a verified save
    /// receipt succeeds. Cancel or failed writes never approve destruction.
    private func requestDocumentExit(verb: String, completion: @escaping (Bool) -> Void) {
        guard !exitDecisionInProgress else { completion(false); return }
        exitDecisionInProgress = true
        let finish: (Bool) -> Void = { [weak self] approved in
            self?.exitDecisionInProgress = false
            completion(approved)
        }
        guard webRuntimeReady,
              let window,
              let state = nativeBridge?.clientState,
              !state.hasProtectedWork,
              state.hasUnsavedDocument else {
            finish(confirmProtectedExit(verb: verb))
            return
        }
        let alert = NSAlert()
        alert.messageText = "Save changes before you \(verb.lowercased())?"
        alert.informativeText = "Save updates your .pitched document. Don’t Save leaves its existing file unchanged; the latest local recovery copy remains available."
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Cancel")
        alert.addButton(withTitle: "Don’t Save")
        alert.beginSheetModal(for: window) { [weak self] response in
            guard let self else { finish(false); return }
            if response == .alertFirstButtonReturn {
                self.dispatchNativeCommand("save-project", completion: finish)
            } else {
                finish(response == .alertThirdButtonReturn)
            }
        }
    }

    private func confirmProtectedExit(verb: String) -> Bool {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "\(verb) Drift while work is protected?"
        alert.informativeText = "\(protectionReason) Closing now may discard the unfinished operation. Completed local projects remain in Drift’s app container."
        alert.addButton(withTitle: "Keep Working")
        alert.addButton(withTitle: nativeBridge?.clientState.exportInProgress == true ? "Cancel Export and \(verb)" : "\(verb) Anyway")
        return alert.runModal() == .alertSecondButtonReturn
    }

    private var hasProtectedWork: Bool {
        pendingProjectReply != nil
            || inFlightProjectReplyIdentifier != nil
            || nativeBridge?.clientState.hasProtectedWork == true
            || nativeBridge?.clientState.hasUnsavedDocument == true
    }

    private var protectionReason: String {
        if pendingProjectReply != nil || inFlightProjectReplyIdentifier != nil {
            return "A Finder project is still being verified and copied into Drift’s local project store."
        }
        if nativeBridge?.clientState.documentConflict == true {
            return "The bound .pitched file changed outside Drift; Save As preserves both versions."
        }
        if nativeBridge?.clientState.documentDirty == true {
            return "The current project has changes that are not in its bound .pitched document."
        }
        return nativeBridge?.clientState.protectionReason ?? "Drift still has protected work."
    }

    private func updateWindowDocumentState(_ state: ClientState) {
        guard let window else { return }
        window.isDocumentEdited = state.documentDirty
        let documentLabel = state.documentBound ? "Project" : "Untitled"
        window.title = "\(driftApplicationDisplayName) — \(documentLabel)"
        window.titleVisibility = .hidden
    }

    private func presentFatalError(_ message: String) {
        failPendingProjectOpen()
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

    private func resetDocumentReadiness() {
        webRuntimeReady = false
        webNavigationFinished = false
        documentAuthorityDelivered = false
        receivedAuthoritativeClientState = false
        activeDocumentTicket = nil
        refreshMenuState()
    }

    private func ownsWebRuntime(
        _ candidate: WKWebView,
        bridge: NativeBridgeHost? = nil,
        generation: UInt64? = nil
    ) -> Bool {
        guard webView === candidate else { return false }
        if let bridge, nativeBridge !== bridge { return false }
        return webViewGeneration.accepts(candidate, generation: generation)
    }

    private func invalidateDocumentAuthority() {
        nativeBridge?.invalidateDocument()
        resetDocumentReadiness()
    }

    private func updateWebRuntimeReadiness() {
        let ticketCurrent = activeDocumentTicket.map {
            nativeBridge?.isCurrentDocument($0) == true
        } ?? false
        webRuntimeReady = webNavigationFinished
            && documentAuthorityDelivered
            && receivedAuthoritativeClientState
            && ticketCurrent
    }

    private func deliverPendingProjectsIfPossible() {
        guard webRuntimeReady,
              let bridge = nativeBridge,
              !bridge.clientState.exportInProgress,
              !bridge.clientState.projectBusy,
              let pending = pendingProjectURLs.first,
              let reply = pendingProjectReply,
              inFlightProjectReplyIdentifier == nil else { return }
        pendingProjectURLs.removeAll()
        inFlightProjectReplyIdentifier = reply.identifier
        bridge.importExternalFile(pending, kind: .project) { [weak self] error in
            guard let self else {
                reply.finish(.failure)
                return
            }
            guard self.inFlightProjectReplyIdentifier == reply.identifier,
                  self.pendingProjectReply === reply else {
                reply.finish(error == nil ? .success : .failure)
                return
            }
            self.inFlightProjectReplyIdentifier = nil
            self.pendingProjectReply = nil
            reply.finish(error == nil ? .success : .failure)
        }
    }

    private func failPendingProjectOpen() {
        pendingProjectURLs.removeAll()
        let reply = pendingProjectReply
        pendingProjectReply = nil
        inFlightProjectReplyIdentifier = nil
        reply?.finish(.failure)
    }

    private func refreshMenuState() {
        NSApp.mainMenu?.update()
    }

    private func scheduleRecoveryBudgetResetIfNeeded() {
        guard webRuntimeReady,
              receivedAuthoritativeClientState,
              !webContentRecoveryPolicy.hasRemainingAttempt,
              !recoveryResetScheduled else { return }

        recoveryResetScheduled = true
        recoveryStabilityGeneration += 1
        let generation = recoveryStabilityGeneration
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in
            guard let self else { return }
            guard generation == self.recoveryStabilityGeneration else { return }
            self.recoveryResetScheduled = false
            guard self.webRuntimeReady,
                  self.receivedAuthoritativeClientState,
                  !self.webContentRecoveryPolicy.hasRemainingAttempt else { return }
            self.webContentRecoveryPolicy.reset()
        }
    }

    private func invalidateRecoveryStabilityWindow() {
        recoveryStabilityGeneration += 1
        recoveryResetScheduled = false
    }

    // MARK: - WebKit navigation and recovery

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        guard ownsWebRuntime(webView) else { return }
        if inFlightProjectReplyIdentifier != nil {
            failPendingProjectOpen()
        }
        navigationIdentity.start(navigation)
        invalidateRecoveryStabilityWindow()
        invalidateDocumentAuthority()
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        guard ownsWebRuntime(webView),
              navigationIdentity.accepts(navigation),
              TrustedWebRuntime.acceptsMainFrameURL(webView.url, trustedIndexURL: trustedIndexURL),
              let bridge = nativeBridge else {
            if ownsWebRuntime(webView), navigationIdentity.accepts(navigation) {
                failPendingProjectOpen()
                invalidateDocumentAuthority()
            }
            return
        }
        let committedWebViewGeneration = webViewGeneration.generation

        let ticket: NativeDocumentTicket
        do {
            ticket = try bridge.prepareDocumentBootstrap()
        } catch {
            failPendingProjectOpen()
            invalidateDocumentAuthority()
            presentWarning(title: "Drift could not authorize the studio", message: error.localizedDescription)
            return
        }
        activeDocumentTicket = ticket

        bridge.deliverDocumentAuthority(
            ticket,
            to: webView,
            while: { [weak self, weak bridge, weak webView] in
                guard let self, let bridge, let webView else { return false }
                return self.ownsWebRuntime(
                    webView,
                    bridge: bridge,
                    generation: committedWebViewGeneration
                )
                    && self.navigationIdentity.accepts(navigation)
                    && self.activeDocumentTicket == ticket
                    && bridge.isPreparedOrCurrentDocument(ticket)
            },
            completion: { [weak self, weak bridge, weak webView] result in
                guard let self, let bridge, let webView,
                      self.ownsWebRuntime(
                          webView,
                          bridge: bridge,
                          generation: committedWebViewGeneration
                      ),
                      self.navigationIdentity.accepts(navigation),
                      self.activeDocumentTicket == ticket,
                      bridge.isPreparedOrCurrentDocument(ticket) else { return }
                switch result {
                case .success(true):
                    self.documentAuthorityDelivered = true
                    self.updateWebRuntimeReadiness()
                case .success(false):
                    self.failPendingProjectOpen()
                    self.invalidateDocumentAuthority()
                    self.presentWarning(
                        title: "Drift could not authorize the studio",
                        message: "The signed local document did not accept its AppKit-issued generation."
                    )
                case .failure(let error):
                    self.failPendingProjectOpen()
                    self.invalidateDocumentAuthority()
                    self.presentWarning(title: "Drift could not authorize the studio", message: error.localizedDescription)
                }
            }
        )
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard ownsWebRuntime(webView), navigationIdentity.accepts(navigation) else { return }
        guard TrustedWebRuntime.acceptsMainFrameURL(webView.url, trustedIndexURL: trustedIndexURL),
              let ticket = activeDocumentTicket,
              nativeBridge?.isPreparedOrCurrentDocument(ticket) == true else {
            failPendingProjectOpen()
            invalidateDocumentAuthority()
            invalidateRecoveryStabilityWindow()
            return
        }
        webNavigationFinished = true
        updateWebRuntimeReadiness()
        deliverPendingProjectsIfPossible()
        scheduleRecoveryBudgetResetIfNeeded()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard ownsWebRuntime(webView), navigationIdentity.accepts(navigation) else { return }
        failPendingProjectOpen()
        navigationIdentity.invalidate()
        invalidateDocumentAuthority()
        invalidateRecoveryStabilityWindow()
        presentWarning(title: "Drift could not finish loading", message: error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard ownsWebRuntime(webView), navigationIdentity.accepts(navigation) else { return }
        failPendingProjectOpen()
        navigationIdentity.invalidate()
        invalidateDocumentAuthority()
        invalidateRecoveryStabilityWindow()
        presentWarning(title: "Drift could not begin loading", message: error.localizedDescription)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard ownsWebRuntime(webView) else { return }
        let terminatedWebViewGeneration = webViewGeneration.generation
        failPendingProjectOpen()
        invalidateRecoveryStabilityWindow()
        navigationIdentity.invalidate()
        invalidateDocumentAuthority()

        let mayOfferRecovery = webContentRecoveryPolicy.consumeAttempt()
        let alert = NSAlert()
        alert.alertStyle = .critical
        if !mayOfferRecovery {
            alert.messageText = "The visual engine stopped twice"
            alert.informativeText = "Drift stopped this recovery loop. Incomplete native writes were rolled back. Quit, reopen the app, and use the autosaved project or a portable .pitched backup."
            alert.addButton(withTitle: "Quit Drift")
            alert.runModal()
            guard ownsWebRuntime(webView, generation: terminatedWebViewGeneration) else { return }
            approvedClose = true
            NSApp.terminate(nil)
            return
        }

        alert.messageText = "The visual engine stopped unexpectedly"
        alert.informativeText = "Any incomplete native export was rolled back. Drift can make one recovery attempt from the locally saved project in its app container. A studio that remains healthy for 30 seconds regains one future recovery attempt."
        alert.addButton(withTitle: "Reload Drift")
        alert.addButton(withTitle: "Quit")
        let response = alert.runModal()
        guard ownsWebRuntime(webView, generation: terminatedWebViewGeneration) else { return }
        if response == .alertFirstButtonReturn {
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
        guard ownsWebRuntime(webView) else {
            decisionHandler(.cancel)
            return
        }
        let decision = TrustedNavigationPolicy.action(
            url: navigationAction.request.url,
            isMainFrame: navigationAction.targetFrame?.isMainFrame == true,
            isActivatedLink: navigationAction.navigationType == .linkActivated,
            shouldPerformDownload: navigationAction.shouldPerformDownload,
            trustedIndexURL: trustedIndexURL,
            webRootURL: webRootURL
        )
        switch decision {
        case .allow:
            decisionHandler(.allow)
        case .cancel:
            decisionHandler(.cancel)
        case .openExternally(let url):
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        guard ownsWebRuntime(webView) else {
            decisionHandler(.cancel)
            return
        }
        guard TrustedNavigationPolicy.response(
            url: navigationResponse.response.url,
            canShowMIMEType: navigationResponse.canShowMIMEType
        ) == .allow else {
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard ownsWebRuntime(webView) else { return nil }
        if case .openExternally(let url) = TrustedNavigationPolicy.action(
            url: navigationAction.request.url,
            isMainFrame: false,
            isActivatedLink: navigationAction.navigationType == .linkActivated
                && navigationAction.sourceFrame.isMainFrame,
            shouldPerformDownload: navigationAction.shouldPerformDownload,
            trustedIndexURL: trustedIndexURL,
            webRootURL: webRootURL
        ) {
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
        guard ownsWebRuntime(webView) else {
            completionHandler(nil)
            return
        }
        // Browser-owned file panels do not carry Drift's document generation
        // through their delayed callback. NativeBridge.js intercepts file-input
        // activation and uses the typed, generation-bound broker instead.
        completionHandler(nil)
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
        let saveProject = menu.addItem(withTitle: "Save Project", action: #selector(savePortableProject(_:)), keyEquivalent: "s")
        saveProject.target = self
        let saveProjectAs = menu.addItem(withTitle: "Save Project As…", action: #selector(savePortableProjectAs(_:)), keyEquivalent: "s")
        saveProjectAs.keyEquivalentModifierMask = [.command, .shift]
        saveProjectAs.target = self
        let revertProject = menu.addItem(withTitle: "Revert to Saved", action: #selector(revertPortableProject(_:)), keyEquivalent: "")
        revertProject.target = self
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
        let undo = menu.addItem(withTitle: "Undo", action: #selector(undoDocumentEdit(_:)), keyEquivalent: "z")
        undo.target = self
        let redo = menu.addItem(withTitle: "Redo", action: #selector(redoDocumentEdit(_:)), keyEquivalent: "z")
        redo.target = self
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
        case #selector(openProject(_:)), #selector(savePortableProject(_:)), #selector(savePortableProjectAs(_:)):
            return driftAllowsExternalPortableProjects && webRuntimeReady && !protected
        case #selector(revertPortableProject(_:)):
            return driftAllowsExternalPortableProjects
                && webRuntimeReady
                && !protected
                && nativeBridge?.clientState.documentRevertible == true
        case #selector(undoDocumentEdit(_:)), #selector(redoDocumentEdit(_:)),
             #selector(addSlides(_:)), #selector(addPresenter(_:)),
             #selector(exportMP4(_:)), #selector(exportStill(_:)),
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

    @objc private func openProject(_ sender: Any?) {
        guard driftAllowsExternalPortableProjects else {
            presentDevelopmentProjectBoundary()
            return
        }
        dispatchNativeCommand("open-project")
    }
    @objc private func undoDocumentEdit(_ sender: Any?) { dispatchNativeCommand("undo-edit") }
    @objc private func redoDocumentEdit(_ sender: Any?) { dispatchNativeCommand("redo-edit") }
    @objc private func addSlides(_ sender: Any?) { dispatchNativeCommand("add-slides") }
    @objc private func addPresenter(_ sender: Any?) { dispatchNativeCommand("add-presenter") }
    @objc private func savePortableProject(_ sender: Any?) {
        guard driftAllowsExternalPortableProjects else {
            presentDevelopmentProjectBoundary()
            return
        }
        dispatchNativeCommand("save-project")
    }
    @objc private func savePortableProjectAs(_ sender: Any?) {
        guard driftAllowsExternalPortableProjects else {
            presentDevelopmentProjectBoundary()
            return
        }
        dispatchNativeCommand("save-project-as")
    }
    @objc private func revertPortableProject(_ sender: Any?) {
        guard driftAllowsExternalPortableProjects else {
            presentDevelopmentProjectBoundary()
            return
        }
        dispatchNativeCommand("revert-project")
    }
    @objc private func exportMP4(_ sender: Any?) { dispatchNativeCommand("export-mp4") }
    @objc private func exportStill(_ sender: Any?) { dispatchNativeCommand("export-still") }
    @objc private func exportFrames(_ sender: Any?) { dispatchNativeCommand("export-frames") }
    @objc private func togglePlayback(_ sender: Any?) { dispatchNativeCommand("toggle-playback") }
    @objc private func previousSlide(_ sender: Any?) { dispatchNativeCommand("previous-slide") }
    @objc private func nextSlide(_ sender: Any?) { dispatchNativeCommand("next-slide") }
    @objc private func toggleFocus(_ sender: Any?) { dispatchNativeCommand("toggle-focus") }
    @objc private func cancelExport(_ sender: Any?) { dispatchNativeCommand("cancel-export") }

    private func presentDevelopmentProjectBoundary() {
        presentWarning(
            title: "Portable projects are unavailable",
            message: "This build cannot open or save .pitched documents."
        )
    }

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
        invalidateRecoveryStabilityWindow()
        failPendingProjectOpen()
        invalidateDocumentAuthority()
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
        let sourceRevision = Bundle.main.object(forInfoDictionaryKey: "DriftSourceRevision") as? String
        NSWorkspace.shared.open(driftCompleteSourceURL(for: sourceRevision))
    }

    @objc private func copyDiagnostics(_ sender: Any?) {
        let state = nativeBridge?.clientState ?? ClientState()
        let security = NativeRuntimeSecurityFacts.current()
        let diagnostics = """
        Drift \(appVersionString())
        macOS: \(ProcessInfo.processInfo.operatingSystemVersionString)
        Architecture: \(currentArchitecture())
        Native bridge: \(driftBridgeVersion)
        Native document authority: \(nativeBridge?.hasActiveDocument == true ? "active" : "inactive")
        Trusted navigation finished: \(webNavigationFinished)
        Authoritative React state received: \(receivedAuthoritativeClientState)
        System codecs only: yes
        App Sandbox entitlement: \(security.sandboxed ? "present" : "absent")
        Network client entitlement: \(security.networkClientEntitled ? "present" : "absent")
        WebKit outbound policy: blocked (v3)
        Native network client surface: none shipped
        Network boundary: app-entitled-webkit-blocked
        Export active: \(state.exportInProgress)
        Project operation active: \(state.projectBusy)
        Local save state: \(state.saveState)
        Native project bound: \(state.documentBound)
        Native project dirty: \(state.documentDirty)
        Native project revertible: \(state.documentRevertible)
        Native project conflict: \(state.documentConflict)
        Recent notice signal: \(state.lastNotice ?? "none")
        Web content recovery remaining: \(webContentRecoveryPolicy.hasRemainingAttempt)
        Recovery stability countdown active: \(recoveryResetScheduled)
        """
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(diagnostics, forType: .string)
    }

    private func dispatchNativeCommand(_ command: String, completion: ((Bool) -> Void)? = nil) {
        guard webRuntimeReady,
              let bridge = nativeBridge,
              let ticket = activeDocumentTicket,
              bridge.isCurrentDocument(ticket),
              let webView else { completion?(false); return }
        let commandWebViewGeneration = webViewGeneration.generation
        webView.callAsyncJavaScript(
            "return await window.__driftNativeCommand(documentNonce, command);",
            arguments: ["documentNonce": ticket.nonceString, "command": command],
            in: nil,
            in: .page,
            completionHandler: { [weak self, weak bridge, weak webView] result in
                guard let self, let bridge, let webView,
                      self.ownsWebRuntime(
                          webView,
                          bridge: bridge,
                          generation: commandWebViewGeneration
                      ),
                      bridge.isCurrentDocument(ticket) else { completion?(false); return }
                switch result {
                case .failure(let error):
                    NSLog("Drift menu command failed: %@", error.localizedDescription)
                    completion?(false)
                case .success(let value):
                    completion?((value as? Bool) == true)
                }
            }
        )
    }
}
