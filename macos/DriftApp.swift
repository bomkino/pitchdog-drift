import AppKit
import Darwin
import Foundation
import UniformTypeIdentifiers
import WebKit

private let bridgeName = "driftNative"
private let bridgeVersion = 1
private typealias JSONDictionary = [String: Any]

private struct BridgeFailure: Error {
    let name: String
    let message: String
}

private struct FileGrant {
    let url: URL
    let mimeType: String
}

private struct DirectoryGrant {
    let url: URL
}

private struct WriteSession {
    let fileToken: String
    let stagingURL: URL
    let destinationURL: URL
}

@main
struct DriftMain {
    static func main() {
        if CommandLine.arguments.contains("--smoke-test") {
            Darwin.exit(runSmokeTest())
        }

        let application = NSApplication.shared
        let delegate = DriftAppDelegate()
        application.delegate = delegate
        application.setActivationPolicy(.regular)
        application.run()
    }

    private static func runSmokeTest() -> Int32 {
        guard let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") else {
            fputs("Drift smoke test failed: Web/index.html is missing.\n", stderr)
            return 1
        }
        guard FileManager.default.fileExists(atPath: indexURL.path) else {
            fputs("Drift smoke test failed: Web/index.html is unreadable.\n", stderr)
            return 1
        }
        guard let bridgeURL = Bundle.main.url(forResource: "NativeBridge", withExtension: "js"),
              let bridgeSource = try? String(contentsOf: bridgeURL, encoding: .utf8),
              bridgeSource.contains("DRIFT_NATIVE_BRIDGE_VERSION") else {
            fputs("Drift smoke test failed: the native bridge is missing or malformed.\n", stderr)
            return 1
        }
        guard Bundle.main.object(forInfoDictionaryKey: "DriftNativeBridgeVersion") as? Int == bridgeVersion else {
            fputs("Drift smoke test failed: bridge version metadata does not match.\n", stderr)
            return 1
        }

        print("Drift macOS smoke test passed: bundle, web runtime, and bridge are present.")
        return 0
    }
}

private final class DriftAppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private var window: NSWindow?
    private var webView: WKWebView?
    private var nativeBridge: NativeBridgeHost?

    func applicationDidFinishLaunching(_ notification: Notification) {
        installMenus()
        configureRuntime()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: bridgeName)
    }

    private func configureRuntime() {
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
            forMainFrameOnly: false
        ))

        let bridge = NativeBridgeHost()
        nativeBridge = bridge
        controller.add(bridge, name: bridgeName)

        let networkRules = """
        [
          {"trigger":{"url-filter":"^https?://.*"},"action":{"type":"block"}},
          {"trigger":{"url-filter":"^wss?://.*"},"action":{"type":"block"}},
          {"trigger":{"url-filter":"^ftp://.*"},"action":{"type":"block"}}
        ]
        """

        WKContentRuleListStore.default().compileContentRuleList(
            forIdentifier: "dog.pitch.drift.network-lock.v1",
            encodedContentRuleList: networkRules
        ) { [weak self] ruleList, error in
            DispatchQueue.main.async {
                guard let self else { return }
                guard let ruleList else {
                    self.presentFatalError("The local-only network boundary could not be installed. \(error?.localizedDescription ?? "Unknown WebKit error.")")
                    return
                }
                controller.add(ruleList)
                self.openWindow(configuration: configuration)
            }
        }
    }

    private func openWindow(configuration: WKWebViewConfiguration) {
        guard let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") else {
            presentFatalError("The bundled Drift web application is missing Web/index.html.")
            return
        }

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsMagnification = true
        nativeBridge?.webView = webView
        self.webView = webView

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 920),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Drift — pitch.dog"
        window.minSize = NSSize(width: 1040, height: 680)
        window.collectionBehavior.insert(.fullScreenPrimary)
        window.tabbingMode = .disallowed
        window.contentView = webView
        window.center()
        window.makeKeyAndOrderFront(nil)
        self.window = window

        webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
        NSApp.activate(ignoringOtherApps: true)
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

    private func installMenus() {
        let mainMenu = NSMenu()

        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu(title: "Drift")
        appMenuItem.submenu = appMenu
        appMenu.addItem(withTitle: "About Drift", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide Drift", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = appMenu.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Drift", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        let fileMenuItem = NSMenuItem()
        mainMenu.addItem(fileMenuItem)
        let fileMenu = NSMenu(title: "File")
        fileMenuItem.submenu = fileMenu
        fileMenu.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")

        let viewMenuItem = NSMenuItem()
        mainMenu.addItem(viewMenuItem)
        let viewMenu = NSMenu(title: "View")
        viewMenuItem.submenu = viewMenu
        let reloadItem = viewMenu.addItem(withTitle: "Reload", action: #selector(reload(_:)), keyEquivalent: "r")
        reloadItem.target = self
        viewMenu.addItem(.separator())
        viewMenu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")

        let windowMenuItem = NSMenuItem()
        mainMenu.addItem(windowMenuItem)
        let windowMenu = NSMenu(title: "Window")
        windowMenuItem.submenu = windowMenu
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowMenu.addItem(.separator())
        windowMenu.addItem(withTitle: "Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")
        NSApp.windowsMenu = windowMenu

        NSApp.mainMenu = mainMenu
    }

    @objc private func reload(_ sender: Any?) {
        webView?.reload()
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }

        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        let allowedSchemes: Set<String> = ["file", "blob", "data", "about"]
        if let scheme = url.scheme?.lowercased(), allowedSchemes.contains(scheme) {
            decisionHandler(.allow)
        } else {
            NSSound.beep()
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
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
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "The download could not be saved"
        alert.informativeText = error.localizedDescription
        if let window {
            alert.beginSheetModal(for: window)
        }
    }
}

private final class NativeBridgeHost: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?

    private let fileManager = FileManager.default
    private var fileGrants: [String: FileGrant] = [:]
    private var directoryGrants: [String: DirectoryGrant] = [:]
    private var writeSessions: [String: WriteSession] = [:]

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == bridgeName,
              let body = message.body as? JSONDictionary,
              let id = body["id"] as? String,
              let command = body["command"] as? String else {
            return
        }
        let payload = body["payload"] as? JSONDictionary ?? [:]

        do {
            let value = try handle(command: command, payload: payload)
            reply(id: id, envelope: ["ok": true, "value": value])
        } catch let failure as BridgeFailure {
            reply(id: id, envelope: [
                "ok": false,
                "error": ["name": failure.name, "message": failure.message],
            ])
        } catch {
            let nsError = error as NSError
            reply(id: id, envelope: [
                "ok": false,
                "error": [
                    "name": domErrorName(for: nsError),
                    "message": nsError.localizedDescription,
                ],
            ])
        }
    }

    private func handle(command: String, payload: JSONDictionary) throws -> Any {
        switch command {
        case "runtime-info":
            return [
                "bridgeVersion": bridgeVersion,
                "platform": "macOS",
                "operatingSystem": ProcessInfo.processInfo.operatingSystemVersionString,
                "architecture": currentArchitecture(),
            ]
        case "pick-save":
            return try pickSave(payload)
        case "pick-directory":
            return try pickDirectory()
        case "write-open":
            return try openWriteSession(payload)
        case "write-chunk":
            return try writeChunk(payload)
        case "write-truncate":
            return try truncateWriteSession(payload)
        case "write-close":
            return try closeWriteSession(payload)
        case "write-abort":
            return try abortWriteSession(payload)
        case "file-info":
            return try fileInfo(payload)
        case "file-read":
            return try readFile(payload)
        case "directory-get-file":
            return try directoryFile(payload)
        case "directory-remove-entry":
            return try removeDirectoryEntry(payload)
        default:
            throw BridgeFailure(name: "NotSupportedError", message: "Unknown native command: \(command)")
        }
    }

    private func pickSave(_ payload: JSONDictionary) throws -> JSONDictionary {
        let panel = NSSavePanel()
        panel.canCreateDirectories = true
        panel.isExtensionHidden = false
        panel.nameFieldStringValue = safeLeafName(payload["suggestedName"] as? String, fallback: "Drift Export")

        let extensions = payload["extensions"] as? [String] ?? []
        let contentTypes = extensions.compactMap { UTType(filenameExtension: $0) }
        if !contentTypes.isEmpty {
            panel.allowedContentTypes = contentTypes
        }

        guard panel.runModal() == .OK, let destinationURL = panel.url else {
            return ["cancelled": true]
        }
        guard destinationURL.isFileURL else {
            throw BridgeFailure(name: "SecurityError", message: "Drift can only save to a local file URL selected by macOS.")
        }

        removeStalePartials(for: destinationURL)
        let token = UUID().uuidString
        let suppliedMime = (payload["mimeTypes"] as? [String])?.first
        let mimeType = suppliedMime ?? mimeType(for: destinationURL)
        fileGrants[token] = FileGrant(url: destinationURL.standardizedFileURL, mimeType: mimeType)
        return [
            "cancelled": false,
            "token": token,
            "name": destinationURL.lastPathComponent,
            "mimeType": mimeType,
        ]
    }

    private func pickDirectory() throws -> JSONDictionary {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = true
        panel.prompt = "Choose"

        guard panel.runModal() == .OK, let directoryURL = panel.url else {
            return ["cancelled": true]
        }
        guard directoryURL.isFileURL else {
            throw BridgeFailure(name: "SecurityError", message: "Drift can only write to a local folder selected by macOS.")
        }

        let token = UUID().uuidString
        directoryGrants[token] = DirectoryGrant(url: directoryURL.standardizedFileURL)
        return [
            "cancelled": false,
            "token": token,
            "name": directoryURL.lastPathComponent,
        ]
    }

    private func openWriteSession(_ payload: JSONDictionary) throws -> JSONDictionary {
        let fileToken = try requiredString(payload, "token")
        guard let grant = fileGrants[fileToken] else {
            throw BridgeFailure(name: "NotAllowedError", message: "That file permission is no longer valid.")
        }
        if writeSessions.values.contains(where: { $0.fileToken == fileToken }) {
            throw BridgeFailure(name: "InvalidStateError", message: "A writable stream is already open for that file.")
        }

        let keepExistingData = (payload["keepExistingData"] as? Bool) == true
        let destinationURL = grant.url
        let partialName = ".\(destinationURL.lastPathComponent).drift-\(UUID().uuidString).partial"
        let stagingURL = destinationURL.deletingLastPathComponent().appendingPathComponent(partialName, isDirectory: false)

        if fileManager.fileExists(atPath: stagingURL.path) {
            try fileManager.removeItem(at: stagingURL)
        }
        if keepExistingData && fileManager.fileExists(atPath: destinationURL.path) {
            try fileManager.copyItem(at: destinationURL, to: stagingURL)
        } else if !fileManager.createFile(atPath: stagingURL.path, contents: Data()) {
            throw BridgeFailure(name: "NotAllowedError", message: "macOS did not allow Drift to create the temporary export file.")
        }

        let sessionToken = UUID().uuidString
        writeSessions[sessionToken] = WriteSession(
            fileToken: fileToken,
            stagingURL: stagingURL,
            destinationURL: destinationURL
        )
        return [
            "session": sessionToken,
            "size": try fileSize(at: stagingURL),
        ]
    }

    private func writeChunk(_ payload: JSONDictionary) throws -> JSONDictionary {
        let sessionToken = try requiredString(payload, "session")
        guard let session = writeSessions[sessionToken] else {
            throw BridgeFailure(name: "InvalidStateError", message: "The writable stream is no longer open.")
        }
        let position = try requiredOffset(payload, "position")
        let encoded = try requiredString(payload, "data")
        guard let data = Data(base64Encoded: encoded) else {
            throw BridgeFailure(name: "DataError", message: "The renderer sent an invalid binary chunk.")
        }

        let handle = try FileHandle(forWritingTo: session.stagingURL)
        do {
            try handle.seek(toOffset: position)
            try handle.write(contentsOf: data)
            try handle.close()
        } catch {
            try? handle.close()
            throw error
        }
        return ["bytesWritten": data.count]
    }

    private func truncateWriteSession(_ payload: JSONDictionary) throws -> JSONDictionary {
        let sessionToken = try requiredString(payload, "session")
        guard let session = writeSessions[sessionToken] else {
            throw BridgeFailure(name: "InvalidStateError", message: "The writable stream is no longer open.")
        }
        let size = try requiredOffset(payload, "size")
        let handle = try FileHandle(forWritingTo: session.stagingURL)
        do {
            try handle.truncate(atOffset: size)
            try handle.close()
        } catch {
            try? handle.close()
            throw error
        }
        return ["size": size]
    }

    private func closeWriteSession(_ payload: JSONDictionary) throws -> JSONDictionary {
        let sessionToken = try requiredString(payload, "session")
        guard let session = writeSessions[sessionToken] else {
            throw BridgeFailure(name: "InvalidStateError", message: "The writable stream is no longer open.")
        }

        let handle = try FileHandle(forWritingTo: session.stagingURL)
        do {
            try handle.synchronize()
            try handle.close()
        } catch {
            try? handle.close()
            throw error
        }

        let renameResult = session.stagingURL.path.withCString { sourcePath in
            session.destinationURL.path.withCString { destinationPath in
                Darwin.rename(sourcePath, destinationPath)
            }
        }
        if renameResult != 0 {
            let code = errno
            throw BridgeFailure(
                name: code == EACCES || code == EPERM ? "NotAllowedError" : "InvalidModificationError",
                message: "The export could not replace its destination: \(String(cString: strerror(code)))."
            )
        }

        writeSessions.removeValue(forKey: sessionToken)
        return [
            "name": session.destinationURL.lastPathComponent,
            "size": try fileSize(at: session.destinationURL),
        ]
    }

    private func abortWriteSession(_ payload: JSONDictionary) throws -> JSONDictionary {
        let sessionToken = try requiredString(payload, "session")
        guard let session = writeSessions.removeValue(forKey: sessionToken) else {
            return ["aborted": true]
        }
        if fileManager.fileExists(atPath: session.stagingURL.path) {
            try fileManager.removeItem(at: session.stagingURL)
        }
        return ["aborted": true]
    }

    private func fileInfo(_ payload: JSONDictionary) throws -> JSONDictionary {
        let token = try requiredString(payload, "token")
        guard let grant = fileGrants[token] else {
            throw BridgeFailure(name: "NotAllowedError", message: "That file permission is no longer valid.")
        }
        guard fileManager.fileExists(atPath: grant.url.path) else {
            throw BridgeFailure(name: "NotFoundError", message: "The exported file does not exist.")
        }
        let attributes = try fileManager.attributesOfItem(atPath: grant.url.path)
        let modified = (attributes[.modificationDate] as? Date)?.timeIntervalSince1970 ?? Date().timeIntervalSince1970
        return [
            "name": grant.url.lastPathComponent,
            "size": (attributes[.size] as? NSNumber)?.uint64Value ?? 0,
            "mimeType": grant.mimeType,
            "lastModified": Int64(modified * 1000),
        ]
    }

    private func readFile(_ payload: JSONDictionary) throws -> JSONDictionary {
        let token = try requiredString(payload, "token")
        guard let grant = fileGrants[token] else {
            throw BridgeFailure(name: "NotAllowedError", message: "That file permission is no longer valid.")
        }
        let offset = try requiredOffset(payload, "offset")
        let requestedLength = try requiredOffset(payload, "length")
        guard requestedLength <= 1024 * 1024 else {
            throw BridgeFailure(name: "QuotaExceededError", message: "Native read chunks are limited to 1 MiB.")
        }

        let handle = try FileHandle(forReadingFrom: grant.url)
        let data: Data
        do {
            try handle.seek(toOffset: offset)
            data = try handle.read(upToCount: Int(requestedLength)) ?? Data()
            try handle.close()
        } catch {
            try? handle.close()
            throw error
        }
        return ["data": data.base64EncodedString(), "length": data.count]
    }

    private func directoryFile(_ payload: JSONDictionary) throws -> JSONDictionary {
        let directoryToken = try requiredString(payload, "token")
        guard let directory = directoryGrants[directoryToken] else {
            throw BridgeFailure(name: "NotAllowedError", message: "That directory permission is no longer valid.")
        }
        let name = try validatedChildName(requiredString(payload, "name"))
        let create = (payload["create"] as? Bool) == true
        let fileURL = directory.url.appendingPathComponent(name, isDirectory: false).standardizedFileURL
        guard fileURL.deletingLastPathComponent() == directory.url.standardizedFileURL else {
            throw BridgeFailure(name: "SecurityError", message: "Directory traversal is not permitted.")
        }

        var isDirectory: ObjCBool = false
        let exists = fileManager.fileExists(atPath: fileURL.path, isDirectory: &isDirectory)
        if exists && isDirectory.boolValue {
            throw BridgeFailure(name: "TypeMismatchError", message: "The selected name belongs to a directory, not a file.")
        }
        if !exists && !create {
            throw BridgeFailure(name: "NotFoundError", message: "The requested file does not exist.")
        }
        if !exists && create && !fileManager.createFile(atPath: fileURL.path, contents: Data()) {
            throw BridgeFailure(name: "NotAllowedError", message: "macOS did not allow Drift to create \(name).")
        }

        let fileToken = UUID().uuidString
        let mimeType = mimeType(for: fileURL)
        fileGrants[fileToken] = FileGrant(url: fileURL, mimeType: mimeType)
        return ["token": fileToken, "name": name, "mimeType": mimeType]
    }

    private func removeDirectoryEntry(_ payload: JSONDictionary) throws -> JSONDictionary {
        let directoryToken = try requiredString(payload, "token")
        guard let directory = directoryGrants[directoryToken] else {
            throw BridgeFailure(name: "NotAllowedError", message: "That directory permission is no longer valid.")
        }
        let name = try validatedChildName(requiredString(payload, "name"))
        let fileURL = directory.url.appendingPathComponent(name, isDirectory: false).standardizedFileURL
        guard fileURL.deletingLastPathComponent() == directory.url.standardizedFileURL else {
            throw BridgeFailure(name: "SecurityError", message: "Directory traversal is not permitted.")
        }
        guard fileManager.fileExists(atPath: fileURL.path) else {
            throw BridgeFailure(name: "NotFoundError", message: "The requested file does not exist.")
        }
        try fileManager.removeItem(at: fileURL)
        fileGrants = fileGrants.filter { $0.value.url != fileURL }
        return ["removed": true]
    }

    private func reply(id: String, envelope: JSONDictionary) {
        guard JSONSerialization.isValidJSONObject(envelope),
              let envelopeData = try? JSONSerialization.data(withJSONObject: envelope),
              let idData = try? JSONSerialization.data(withJSONObject: id, options: [.fragmentsAllowed]),
              let envelopeJSON = String(data: envelopeData, encoding: .utf8),
              let idJSON = String(data: idData, encoding: .utf8) else {
            return
        }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("window.__driftNativeResolve(\(idJSON), \(envelopeJSON));")
        }
    }

    private func requiredString(_ payload: JSONDictionary, _ key: String) throws -> String {
        guard let value = payload[key] as? String, !value.isEmpty else {
            throw BridgeFailure(name: "TypeError", message: "Native command field ‘\(key)’ must be a non-empty string.")
        }
        return value
    }

    private func requiredOffset(_ payload: JSONDictionary, _ key: String) throws -> UInt64 {
        guard let number = payload[key] as? NSNumber else {
            throw BridgeFailure(name: "TypeError", message: "Native command field ‘\(key)’ must be a number.")
        }
        let value = number.doubleValue
        guard value.isFinite, value >= 0, value.rounded(.towardZero) == value, value <= Double(UInt64.max) else {
            throw BridgeFailure(name: "TypeError", message: "Native command field ‘\(key)’ must be a non-negative integer.")
        }
        return UInt64(value)
    }

    private func validatedChildName(_ value: String) throws -> String {
        let leaf = safeLeafName(value, fallback: "")
        guard !leaf.isEmpty, leaf == value, leaf != ".", leaf != ".." else {
            throw BridgeFailure(name: "TypeError", message: "File names may not contain path separators or control characters.")
        }
        return leaf
    }

    private func fileSize(at url: URL) throws -> UInt64 {
        let attributes = try fileManager.attributesOfItem(atPath: url.path)
        return (attributes[.size] as? NSNumber)?.uint64Value ?? 0
    }

    private func mimeType(for url: URL) -> String {
        UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
    }

    private func removeStalePartials(for destinationURL: URL) {
        let folder = destinationURL.deletingLastPathComponent()
        let prefix = ".\(destinationURL.lastPathComponent).drift-"
        let cutoff = Date().addingTimeInterval(-24 * 60 * 60)
        guard let children = try? fileManager.contentsOfDirectory(
            at: folder,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        ) else { return }

        for child in children where child.lastPathComponent.hasPrefix(prefix) && child.pathExtension == "partial" {
            let modified = try? child.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
            if let modified, modified < cutoff {
                try? fileManager.removeItem(at: child)
            }
        }
    }

    private func domErrorName(for error: NSError) -> String {
        guard error.domain == NSCocoaErrorDomain else { return "InvalidStateError" }
        switch error.code {
        case NSFileNoSuchFileError, NSFileReadNoSuchFileError:
            return "NotFoundError"
        case NSFileReadNoPermissionError, NSFileWriteNoPermissionError:
            return "NotAllowedError"
        case NSFileWriteFileExistsError:
            return "InvalidModificationError"
        default:
            return "InvalidStateError"
        }
    }
}

private func safeLeafName(_ value: String?, fallback: String) -> String {
    guard let value else { return fallback }
    let leaf = value
        .components(separatedBy: CharacterSet(charactersIn: "/\\"))
        .last?
        .unicodeScalars
        .filter { !CharacterSet.controlCharacters.contains($0) }
        .map(String.init)
        .joined()
        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !leaf.isEmpty, leaf != ".", leaf != ".." else { return fallback }
    return String(leaf.prefix(240))
}

private func currentArchitecture() -> String {
    #if arch(arm64)
    return "arm64"
    #elseif arch(x86_64)
    return "x86_64"
    #else
    return "unknown"
    #endif
}
