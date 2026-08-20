import AppKit
import Foundation
import UniformTypeIdentifiers
import WebKit

private struct InputIntent {
    let kind: DriftImportKind
    let accepts: [String]
    let multiple: Bool
    let recordedAt: Date
}

final class NativeBridgeHost: NSObject, WKScriptMessageHandlerWithReply {
    weak var webView: WKWebView?
    var clientStateDidChange: ((ClientState) -> Void)?
    var lastCommittedFileDidChange: ((URL) -> Void)?

    private let broker = NativeFileBroker()
    private let aacBroker = NativeAacEncoderBroker()
    private let brokerQueue = DispatchQueue(label: "dog.pitch.drift.file-broker", qos: .userInitiated)
    private let trustedIndexURL = TrustedWebRuntime.bundledIndexURL()
    private let exportActivityGuard = ExportActivityGuard()
    private(set) var clientState = ClientState()
    private var inputIntent: InputIntent?
    private var lastCommittedURL: URL?

    override init() {
        super.init()
        broker.didCommitFile = { [weak self] url in
            DispatchQueue.main.async {
                self?.lastCommittedURL = url
                self?.lastCommittedFileDidChange?(url)
            }
        }
    }

    deinit {
        exportActivityGuard.end()
        brokerQueue.sync {
            broker.abortAll()
            aacBroker.closeAll()
        }
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard message.name == driftBridgeName,
              message.frameInfo.isMainFrame,
              TrustedWebRuntime.acceptsMainFrameURL(
                  message.frameInfo.request.url,
                  trustedIndexURL: trustedIndexURL
              ) else {
            replyHandler(
                failureEnvelope(BridgeFailure(
                    "SecurityError",
                    "Native messages are accepted only from Drift’s signed local studio document."
                )),
                nil
            )
            return
        }
        guard let body = message.body as? JSONDictionary,
              let command = body["command"] as? String else {
            replyHandler(failureEnvelope(BridgeFailure("TypeError", "Native message is malformed.")), nil)
            return
        }
        let payload = body["payload"] as? JSONDictionary ?? [:]

        switch command {
        case "runtime-info":
            resetCapabilitiesForDocumentBoot()
            replyHandler(successEnvelope(runtimeInfo()), nil)
        case "client-state":
            clientState.update(from: payload)
            exportActivityGuard.update(isExporting: clientState.exportInProgress)
            clientStateDidChange?(clientState)
            replyHandler(successEnvelope(["accepted": true]), nil)
        case "input-intent":
            recordInputIntent(payload)
            replyHandler(successEnvelope(["accepted": true]), nil)
        case "pick-save":
            presentSavePanel(payload, replyHandler: replyHandler)
        case "pick-directory":
            presentDirectoryPanel(replyHandler: replyHandler)
        case "pick-open-files":
            presentOpenPanel(payload, replyHandler: replyHandler)
        case "reveal-last-export":
            revealLastExport(replyHandler: replyHandler)
        case "write-open", "write-chunk", "write-truncate", "write-close", "write-abort",
             "file-info", "file-read", "file-release", "directory-get-file",
             "directory-remove-entry", "directory-release":
            performBrokerCommand(command, payload: payload, replyHandler: replyHandler)
        case "aac-create", "aac-append", "aac-finish", "aac-close":
            performAacCommand(command, payload: payload, replyHandler: replyHandler)
        default:
            replyHandler(failureEnvelope(BridgeFailure("NotSupportedError", "Unknown native command: \(command)")), nil)
        }
    }

    func currentInputIntent(defaultMultiple: Bool) -> (kind: DriftImportKind, accepts: [String], multiple: Bool) {
        defer { inputIntent = nil }
        guard let intent = inputIntent, Date().timeIntervalSince(intent.recordedAt) <= 8 else {
            return (defaultMultiple ? .slides : .project, [], defaultMultiple)
        }
        return (intent.kind, intent.accepts, intent.multiple)
    }

    func validateOpenPanelSelection(_ urls: [URL], kind: DriftImportKind) throws -> [URL] {
        guard !urls.isEmpty else { return [] }
        switch kind {
        case .slides:
            guard urls.count <= 200 else {
                throw BridgeFailure("QuotaExceededError", "Drift supports at most 200 moving slides.")
            }
            var total: UInt64 = 0
            for url in urls {
                try validateRegularImport(url)
                let type = UTType(filenameExtension: url.pathExtension)
                guard type?.conforms(to: .image) == true else {
                    throw BridgeFailure("TypeMismatchError", "Slides must be PNG, JPEG, WebP, or AVIF images.")
                }
                let size = try fileSize(at: url)
                guard size <= driftMaximumProjectAssetBytes else {
                    throw BridgeFailure("QuotaExceededError", "One selected slide exceeds Drift’s 64 MiB portable-project asset limit.")
                }
                total += size
                guard total <= driftMaximumProjectTotalAssetBytes else {
                    throw BridgeFailure("QuotaExceededError", "The selected slide batch exceeds Drift’s 80 MiB portable-project media budget.")
                }
            }
        case .presenter:
            guard urls.count == 1, let url = urls.first else {
                throw BridgeFailure("TypeMismatchError", "Choose exactly one presenter video.")
            }
            try validateRegularImport(url)
            let type = UTType(filenameExtension: url.pathExtension)
            guard type?.conforms(to: .movie) == true || ["mp4", "webm", "mov"].contains(url.pathExtension.lowercased()) else {
                throw BridgeFailure("TypeMismatchError", "Presenter media must be MP4, WebM, or MOV video.")
            }
            guard try fileSize(at: url) <= driftMaximumProjectAssetBytes else {
                throw BridgeFailure("QuotaExceededError", "Presenter video exceeds Drift’s 64 MiB portable-project asset limit.")
            }
        case .project:
            guard urls.count == 1, let url = urls.first else {
                throw BridgeFailure("TypeMismatchError", "Choose exactly one .pitched project.")
            }
            try validateRegularImport(url)
            guard url.pathExtension.lowercased() == "pitched" else {
                throw BridgeFailure("TypeMismatchError", "Drift projects use the .pitched extension.")
            }
            guard try fileSize(at: url) <= driftMaximumProjectArchiveBytes else {
                throw BridgeFailure("QuotaExceededError", "Project archive exceeds Drift’s 96 MiB verified archive limit.")
            }
        }
        return urls.map(\.standardizedFileURL)
    }

    func importExternalFile(_ url: URL, kind: DriftImportKind) {
        brokerQueue.async { [weak self] in
            guard let self else { return }
            do {
                let validated = try self.validateOpenPanelSelection([url], kind: kind)
                guard let selected = validated.first else { return }
                let descriptor = try self.broker.registerFile(selected, mode: .readOnly)
                DispatchQueue.main.async {
                    self.invokeJavaScript(
                        function: "window.__driftNativeImportGranted",
                        arguments: [descriptor, kind.rawValue]
                    )
                }
            } catch {
                DispatchQueue.main.async { self.presentError(error, title: "Project could not be opened") }
            }
        }
    }

    func abortAllWrites() {
        exportActivityGuard.end()
        brokerQueue.sync {
            broker.abortAll()
            aacBroker.closeAll()
        }
    }

    func revealLastExportInFinder() {
        guard let url = lastCommittedURL else {
            NSSound.beep()
            return
        }
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }

    private func resetCapabilitiesForDocumentBoot() {
        // NativeBridge.js calls runtime-info once for each new local document.
        // Tear down capabilities from the previous WebContent process before
        // acknowledging the replacement document. This covers manual reload,
        // not only quit and process-termination callbacks. Do not emit the
        // authoritative client-state callback here; only React may unlock the
        // recovery budget and menus after its project store has settled.
        exportActivityGuard.end()
        brokerQueue.sync {
            broker.abortAll()
            aacBroker.closeAll()
        }
        inputIntent = nil
        clientState = ClientState()
    }

    private func runtimeInfo() -> JSONDictionary {
        [
            "bridgeVersion": driftBridgeVersion,
            "platform": "macOS",
            "appVersion": appVersionString(),
            "operatingSystem": ProcessInfo.processInfo.operatingSystemVersionString,
            "architecture": currentArchitecture(),
            "sandboxed": ProcessInfo.processInfo.environment["APP_SANDBOX_CONTAINER_ID"] != nil,
            "systemCodecsOnly": true,
            "nativeAac": true,
            "nativeAacProvider": "AudioToolbox",
            "networkEntitlements": false,
            "exportPowerAssertionActive": exportActivityGuard.isActive,
            "projectAssetLimitBytes": driftMaximumProjectAssetBytes,
            "projectTotalMediaLimitBytes": driftMaximumProjectTotalAssetBytes,
            "projectArchiveLimitBytes": driftMaximumProjectArchiveBytes,
        ]
    }

    private func recordInputIntent(_ payload: JSONDictionary) {
        let rawKind = optionalString(payload, "kind") ?? "project"
        let kind = DriftImportKind(rawValue: rawKind) ?? .project
        inputIntent = InputIntent(
            kind: kind,
            accepts: stringArray(payload, "accepts"),
            multiple: (payload["multiple"] as? Bool) == true,
            recordedAt: Date()
        )
    }

    private func presentSavePanel(
        _ payload: JSONDictionary,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        let panel = NSSavePanel()
        panel.canCreateDirectories = true
        panel.isExtensionHidden = false
        panel.allowsOtherFileTypes = false
        panel.nameFieldStringValue = safeLeafName(payload["suggestedName"] as? String, fallback: "Drift Export")
        panel.prompt = "Save"

        let extensions = stringArray(payload, "extensions", maximum: 24)
            .map { $0.trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased() }
            .filter { !$0.isEmpty }
        let types = extensions.compactMap { extensionName -> UTType? in
            UTType(filenameExtension: extensionName) ?? UTType(importedAs: "dog.pitch.drift.\(extensionName)")
        }
        if !types.isEmpty { panel.allowedContentTypes = types }
        restorePanelDirectory(panel, key: "lastSaveDirectory")

        begin(panel: panel) { [weak self] result in
            guard let self else { return }
            guard result == .OK, let url = panel.url else {
                replyHandler(successEnvelope(["cancelled": true]), nil)
                return
            }
            self.rememberPanelDirectory(url.deletingLastPathComponent(), key: "lastSaveDirectory")
            self.brokerQueue.async {
                do {
                    let suppliedMime = stringArray(payload, "mimeTypes", maximum: 24).first
                    let descriptor = try self.broker.registerFile(url, mode: .readWrite, suppliedMimeType: suppliedMime)
                    var value = descriptor
                    value["cancelled"] = false
                    DispatchQueue.main.async { replyHandler(successEnvelope(value), nil) }
                } catch {
                    DispatchQueue.main.async { replyHandler(failureEnvelope(error), nil) }
                }
            }
        }
    }

    private func presentDirectoryPanel(replyHandler: @escaping (Any?, String?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = true
        panel.prompt = "Choose"
        panel.message = "Choose an empty folder for numbered PNG frames. Existing files are never overwritten."
        restorePanelDirectory(panel, key: "lastDirectoryExport")

        begin(panel: panel) { [weak self] result in
            guard let self else { return }
            guard result == .OK, let url = panel.url else {
                replyHandler(successEnvelope(["cancelled": true]), nil)
                return
            }
            self.rememberPanelDirectory(url, key: "lastDirectoryExport")
            self.brokerQueue.async {
                do {
                    var value = try self.broker.registerDirectory(url)
                    value["cancelled"] = false
                    DispatchQueue.main.async { replyHandler(successEnvelope(value), nil) }
                } catch {
                    DispatchQueue.main.async { replyHandler(failureEnvelope(error), nil) }
                }
            }
        }
    }

    private func presentOpenPanel(
        _ payload: JSONDictionary,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        let kind = DriftImportKind(rawValue: optionalString(payload, "kind") ?? "project") ?? .project
        let panel = configuredOpenPanel(kind: kind, multiple: (payload["multiple"] as? Bool) == true)
        begin(panel: panel) { [weak self] result in
            guard let self else { return }
            guard result == .OK else {
                replyHandler(successEnvelope(["cancelled": true, "files": []]), nil)
                return
            }
            self.brokerQueue.async {
                do {
                    let urls = try self.validateOpenPanelSelection(panel.urls, kind: kind)
                    let descriptors = try urls.map { try self.broker.registerFile($0, mode: .readOnly) }
                    DispatchQueue.main.async {
                        replyHandler(successEnvelope(["cancelled": false, "files": descriptors]), nil)
                    }
                } catch {
                    DispatchQueue.main.async { replyHandler(failureEnvelope(error), nil) }
                }
            }
        }
    }

    func configuredOpenPanel(kind: DriftImportKind, multiple: Bool) -> NSOpenPanel {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = kind == .slides && multiple
        panel.resolvesAliases = false
        panel.prompt = kind == .project ? "Open" : "Add"
        switch kind {
        case .slides:
            panel.allowedContentTypes = ["png", "jpg", "jpeg", "webp", "avif"]
                .compactMap { UTType(filenameExtension: $0) }
            panel.message = "Choose up to 200 pitch-deck images. Original project media is limited to 64 MiB per file and 80 MiB total."
        case .presenter:
            panel.allowedContentTypes = [.mpeg4Movie, .quickTimeMovie, .movie]
            panel.message = "Choose one presenter video up to 64 MiB. Audio support is checked before export."
        case .project:
            panel.allowedContentTypes = [UTType(filenameExtension: "pitched") ?? UTType(importedAs: "dog.pitch.pitched-project")]
            panel.message = "Open a verified .pitched project bundle up to 96 MiB."
        }
        restorePanelDirectory(panel, key: "lastOpenDirectory")
        return panel
    }

    func rememberOpenPanelDirectory(_ urls: [URL]) {
        guard let first = urls.first else { return }
        rememberPanelDirectory(first.deletingLastPathComponent(), key: "lastOpenDirectory")
    }

    private func performBrokerCommand(
        _ command: String,
        payload: JSONDictionary,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        brokerQueue.async { [weak self] in
            guard let self else { return }
            do {
                let value: Any
                switch command {
                case "write-open": value = try self.broker.openWriteSession(payload)
                case "write-chunk": value = try self.broker.writeChunk(payload)
                case "write-truncate": value = try self.broker.truncateWriteSession(payload)
                case "write-close": value = try self.broker.closeWriteSession(payload)
                case "write-abort": value = try self.broker.abortWriteSession(payload)
                case "file-info": value = try self.broker.fileInfo(payload)
                case "file-read": value = try self.broker.readFile(payload)
                case "file-release": value = try self.broker.releaseFile(payload)
                case "directory-get-file": value = try self.broker.directoryFile(payload)
                case "directory-remove-entry": value = try self.broker.removeDirectoryEntry(payload)
                case "directory-release": value = try self.broker.releaseDirectory(payload)
                default: throw BridgeFailure("NotSupportedError", "Unknown file-broker command.")
                }
                DispatchQueue.main.async { replyHandler(successEnvelope(value), nil) }
            } catch {
                DispatchQueue.main.async { replyHandler(failureEnvelope(error), nil) }
            }
        }
    }

    private func performAacCommand(
        _ command: String,
        payload: JSONDictionary,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        brokerQueue.async { [weak self] in
            guard let self else { return }
            do {
                let value: Any
                switch command {
                case "aac-create": value = try self.aacBroker.create(payload)
                case "aac-append": value = try self.aacBroker.append(payload)
                case "aac-finish": value = try self.aacBroker.finish(payload)
                case "aac-close": value = try self.aacBroker.close(payload)
                default: throw BridgeFailure("NotSupportedError", "Unknown native AAC command.")
                }
                DispatchQueue.main.async { replyHandler(successEnvelope(value), nil) }
            } catch {
                DispatchQueue.main.async { replyHandler(failureEnvelope(error), nil) }
            }
        }
    }

    private func revealLastExport(replyHandler: @escaping (Any?, String?) -> Void) {
        guard let url = lastCommittedURL else {
            replyHandler(failureEnvelope(BridgeFailure("NotFoundError", "No completed native export is available yet.")), nil)
            return
        }
        NSWorkspace.shared.activateFileViewerSelecting([url])
        replyHandler(successEnvelope(["revealed": true]), nil)
    }

    private func validateRegularImport(_ rawURL: URL) throws {
        let url = try ensureLocalFileURL(rawURL)
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory), !isDirectory.boolValue else {
            throw BridgeFailure("NotFoundError", "A selected import file no longer exists.")
        }
        if isSymbolicLink(url) {
            throw BridgeFailure("SecurityError", "Symbolic links are not accepted as import files.")
        }
    }

    private func begin(panel: NSSavePanel, completion: @escaping (NSApplication.ModalResponse) -> Void) {
        if let window = webView?.window {
            panel.beginSheetModal(for: window, completionHandler: completion)
        } else {
            completion(panel.runModal())
        }
    }

    private func begin(panel: NSOpenPanel, completion: @escaping (NSApplication.ModalResponse) -> Void) {
        if let window = webView?.window {
            panel.beginSheetModal(for: window, completionHandler: completion)
        } else {
            completion(panel.runModal())
        }
    }

    private func restorePanelDirectory(_ panel: NSSavePanel, key: String) {
        guard let path = UserDefaults.standard.string(forKey: key) else { return }
        panel.directoryURL = URL(fileURLWithPath: path, isDirectory: true)
    }

    private func rememberPanelDirectory(_ url: URL, key: String) {
        UserDefaults.standard.set(url.standardizedFileURL.path, forKey: key)
    }

    private func invokeJavaScript(function: String, arguments: [Any]) {
        guard let webView else { return }
        do {
            let data = try JSONSerialization.data(withJSONObject: arguments, options: [.fragmentsAllowed])
            guard let json = String(data: data, encoding: .utf8) else { return }
            webView.evaluateJavaScript("\(function).apply(window, \(json));") { _, error in
                if let error { NSLog("Drift native JavaScript callback failed: %@", error.localizedDescription) }
            }
        } catch {
            NSLog("Drift could not serialize a native JavaScript callback: %@", error.localizedDescription)
        }
    }

    private func presentError(_ error: Error, title: String) {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = title
        alert.informativeText = (error as? BridgeFailure)?.message ?? error.localizedDescription
        if let window = webView?.window {
            alert.beginSheetModal(for: window)
        } else {
            alert.runModal()
        }
    }
}
