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

/// Owns a WebKit reply until exactly one terminal value wins. The native host
/// retains every live reply and fails it during teardown; late panel, broker,
/// and codec callbacks become harmless no-ops instead of orphaned promises.
final class NativeReplyOnce {
    let identifier: UUID
    private let lock = NSLock()
    private var handler: ((Any?, String?) -> Void)?
    private let didFinish: (UUID) -> Void

    init(
        identifier: UUID = UUID(),
        handler: @escaping (Any?, String?) -> Void,
        didFinish: @escaping (UUID) -> Void = { _ in }
    ) {
        self.identifier = identifier
        self.handler = handler
        self.didFinish = didFinish
    }

    func send(_ value: Any?, _ error: String?) {
        lock.lock()
        let activeHandler = handler
        handler = nil
        lock.unlock()
        guard let activeHandler else { return }
        didFinish(identifier)
        activeHandler(value, error)
    }
}

private final class NativeErrorCompletionOnce {
    let identifier: UUID
    private let lock = NSLock()
    private var completion: ((Error?) -> Void)?
    private let didFinish: (UUID) -> Void

    init(
        identifier: UUID = UUID(),
        completion: @escaping (Error?) -> Void,
        didFinish: @escaping (UUID) -> Void = { _ in }
    ) {
        self.identifier = identifier
        self.completion = completion
        self.didFinish = didFinish
    }

    func finish(_ error: Error?) {
        lock.lock()
        let activeCompletion = completion
        completion = nil
        lock.unlock()
        guard let activeCompletion else { return }
        didFinish(identifier)
        activeCompletion(error)
    }
}

final class NativeBridgeHost: NSObject, WKScriptMessageHandlerWithReply {
    weak var webView: WKWebView?
    var clientStateDidChange: ((ClientState) -> Void)?
    var lastCommittedFileDidChange: ((URL) -> Void)?

    private let broker = NativeFileBroker()
    private let aacBroker = NativeAacEncoderBroker()
    private let documentSession = NativeDocumentSession()
    private let metricsLock = NSLock()
    private let replyLock = NSLock()
    private let brokerQueue = DispatchQueue(label: "dog.pitch.drift.file-broker", qos: .userInitiated)
    private let brokerQueueSpecificKey = DispatchSpecificKey<UInt8>()
    private let brokerQueueSpecificValue: UInt8 = 1
    private let trustedIndexURL = TrustedWebRuntime.bundledIndexURL()
    private let exportActivityGuard = ExportActivityGuard()
    private(set) var clientState = ClientState()
    private var inputIntent: InputIntent?
    private var lastCommittedURL: URL?
    // Accessed only on brokerQueue. It binds the broker's synchronous commit
    // callback to the command's originating document generation.
    private var brokerOperationDocument: NativeDocumentTicket?
    private var releasedFileGrantCountStorage = 0
    private var pendingReplies: [UUID: NativeReplyOnce] = [:]
    private var pendingExternalImportCompletions: [UUID: NativeErrorCompletionOnce] = [:]
    private var shuttingDown = false

    override init() {
        super.init()
        brokerQueue.setSpecific(key: brokerQueueSpecificKey, value: brokerQueueSpecificValue)
        broker.didCommitFile = { [weak self] url in
            guard let self,
                  let document = self.brokerOperationDocument,
                  self.documentSession.isCurrent(document) else { return }
            // Invalidation may be waiting for this broker operation. Never
            // synchronously enter main from this callback.
            DispatchQueue.main.async {
                guard self.documentSession.isCurrent(document) else { return }
                self.lastCommittedURL = url
                self.lastCommittedFileDidChange?(url)
            }
        }
    }

    deinit {
        if Thread.isMainThread {
            shutdownWithoutMainThreadPrecondition()
        } else {
            // Normal AppKit/window teardown calls `shutdown()` on main first.
            // A defensive off-main deinit must not trip the document session's
            // AppKit-thread precondition; object destruction itself revokes the
            // session while native resources and promises still settle here.
            exportActivityGuard.end()
            closeAllBrokerResourcesSynchronously()
            failPendingExternalImportsForTeardown()
            failPendingRepliesForTeardown()
        }
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler rawReplyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let trackedReply = trackReply(rawReplyHandler) else {
            rawReplyHandler(
                failureEnvelope(BridgeFailure("AbortError", "The native host is shutting down.")),
                nil
            )
            return
        }
        let replyHandler: (Any?, String?) -> Void = { value, error in
            trackedReply.send(value, error)
        }
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
              let command = body["command"] as? String,
              let documentNonce = body["documentNonce"] as? String else {
            replyHandler(
                failureEnvelope(BridgeFailure(
                    "TypeError",
                    "Native messages require a command, payload, and AppKit-issued document authority."
                )),
                nil
            )
            return
        }
        let payload = body["payload"] as? JSONDictionary ?? [:]

        let document: NativeDocumentTicket
        do {
            document = command == "runtime-info"
                ? try documentSession.claimBootstrap(rawNonce: documentNonce)
                : try documentSession.validateMessage(rawNonce: documentNonce)
        } catch {
            replyHandler(failureEnvelope(error), nil)
            return
        }

        switch command {
        case "runtime-info":
            replyHandler(successEnvelope(runtimeInfo(document: document)), nil)
        case "client-state":
            clientState.update(from: payload)
            exportActivityGuard.update(isExporting: clientState.exportInProgress)
            clientStateDidChange?(clientState)
            replyHandler(successEnvelope(["accepted": true]), nil)
        case "input-intent":
            recordInputIntent(payload)
            replyHandler(successEnvelope(["accepted": true]), nil)
        case "pick-save":
            presentSavePanel(payload, document: document, replyHandler: replyHandler)
        case "pick-directory":
            presentDirectoryPanel(document: document, replyHandler: replyHandler)
        case "pick-open-files":
            presentOpenPanel(payload, document: document, replyHandler: replyHandler)
        case "reveal-last-export":
            revealLastExport(replyHandler: replyHandler)
        case "write-open", "write-chunk", "write-truncate", "write-close", "write-abort",
             "file-info", "file-read", "file-release", "directory-get-file",
             "directory-remove-entry", "directory-release":
            performBrokerCommand(command, payload: payload, document: document, replyHandler: replyHandler)
        case "aac-create", "aac-append", "aac-finish", "aac-close":
            performAacCommand(command, payload: payload, document: document, replyHandler: replyHandler)
        default:
            replyHandler(failureEnvelope(BridgeFailure("NotSupportedError", "Unknown native command: \(command)")), nil)
        }
    }

    func prepareDocumentBootstrap() throws -> NativeDocumentTicket {
        precondition(Thread.isMainThread)
        invalidateDocument()
        return try documentSession.prepareBootstrap()
    }

    /// Delivers authority only to the exact JavaScript document observed at
    /// commit. The page's random challenge is not authority; it prevents a
    /// delayed AppKit evaluation for document A from authorizing replacement B.
    func deliverDocumentAuthority(
        _ document: NativeDocumentTicket,
        to webView: WKWebView,
        while stillCurrent: @escaping () -> Bool,
        completion: @escaping (Result<Bool, Error>) -> Void
    ) {
        precondition(Thread.isMainThread)
        guard documentSession.isPreparedOrCurrent(document), stillCurrent() else {
            completion(.failure(BridgeFailure(
                "SecurityError",
                "The committed Drift document was replaced before AppKit could bind authority."
            )))
            return
        }
        webView.callAsyncJavaScript(
            "return window.__driftNativeDocumentInstanceChallenge();",
            arguments: [:],
            in: nil,
            in: .page,
            completionHandler: { [weak self, weak webView] challengeResult in
                DispatchQueue.main.async {
                    guard let self, let webView else {
                        completion(.failure(BridgeFailure(
                            "AbortError",
                            "The native host closed before document authority was delivered."
                        )))
                        return
                    }
                    guard self.documentSession.isPreparedOrCurrent(document), stillCurrent() else {
                        completion(.failure(BridgeFailure(
                            "SecurityError",
                            "The committed Drift document changed before authority delivery."
                        )))
                        return
                    }
                    let challenge: String
                    switch challengeResult {
                    case .success(let value):
                        guard let candidate = value as? String,
                              candidate.range(of: #"^[a-f0-9]{32}$"#, options: .regularExpression) != nil else {
                            completion(.failure(BridgeFailure(
                                "SecurityError",
                                "The committed Drift document supplied no bounded instance challenge."
                            )))
                            return
                        }
                        challenge = candidate
                    case .failure(let error):
                        completion(.failure(error))
                        return
                    }

                    webView.callAsyncJavaScript(
                        "return window.__driftNativeAuthorizeDocument(documentNonce, documentChallenge);",
                        arguments: [
                            "documentNonce": document.nonceString,
                            "documentChallenge": challenge,
                        ],
                        in: nil,
                        in: .page,
                        completionHandler: { [weak self] authorizationResult in
                            DispatchQueue.main.async {
                                guard let self else {
                                    completion(.failure(BridgeFailure(
                                        "AbortError",
                                        "The native host closed during document authority delivery."
                                    )))
                                    return
                                }
                                guard self.documentSession.isPreparedOrCurrent(document), stillCurrent() else {
                                    completion(.failure(BridgeFailure(
                                        "SecurityError",
                                        "Authority delivery completed in a replacement Drift document."
                                    )))
                                    return
                                }
                                switch authorizationResult {
                                case .success(let value):
                                    let accepted = (value as? Bool) ?? (value as? NSNumber)?.boolValue
                                    completion(.success(accepted == true))
                                case .failure(let error):
                                    completion(.failure(error))
                                }
                            }
                        }
                    )
                }
            }
        )
    }

    func invalidateDocument() {
        precondition(Thread.isMainThread)
        aacBroker.cancelAll()
        documentSession.invalidate()
        failPendingExternalImports(staleDocumentError())
        exportActivityGuard.end()
        inputIntent = nil
        clientState = ClientState()
        brokerQueue.async { [weak self] in
            guard let self else { return }
            self.broker.abortAll()
            self.aacBroker.closeAll()
        }
    }

    /// Final, synchronous teardown used by application/window termination.
    /// Authority is revoked before any broker or codec cleanup begins.
    func shutdown() {
        precondition(Thread.isMainThread)
        shutdownWithoutMainThreadPrecondition()
    }

    private func shutdownWithoutMainThreadPrecondition() {
        replyLock.lock()
        let wasShuttingDown = shuttingDown
        shuttingDown = true
        replyLock.unlock()
        guard !wasShuttingDown else { return }

        documentSession.invalidate()
        failPendingExternalImportsForTeardown()
        exportActivityGuard.end()
        inputIntent = nil
        clientState = ClientState()
        closeAllBrokerResourcesSynchronously()
        failPendingRepliesForTeardown()
    }

    var hasActiveDocument: Bool { documentSession.hasActiveDocument }

    var releasedFileGrantCount: Int {
        metricsLock.lock()
        defer { metricsLock.unlock() }
        return releasedFileGrantCountStorage
    }

    func currentDocumentTicket() throws -> NativeDocumentTicket {
        try documentSession.currentTicket()
    }

    func isCurrentDocument(_ document: NativeDocumentTicket) -> Bool {
        documentSession.isCurrent(document)
    }

    func isPreparedOrCurrentDocument(_ document: NativeDocumentTicket) -> Bool {
        documentSession.isPreparedOrCurrent(document)
    }

    func beginExternalPanel(
        _ panel: NSSavePanel,
        document: NativeDocumentTicket
    ) throws -> NativePanelTicket {
        try documentSession.beginPanel(for: document) { panel.cancel(nil) }
    }

    @discardableResult
    func finishExternalPanel(_ panel: NativePanelTicket) -> Bool {
        documentSession.finishPanel(panel)
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
                guard type?.conforms(to: .image) == true || type?.conforms(to: .movie) == true || ["mp4", "mov", "webm"].contains(url.pathExtension.lowercased()) else {
                    throw BridgeFailure("TypeMismatchError", "Slides must be images or MP4, MOV, or WebM videos.")
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

    private func maximumImportReadBytes(for kind: DriftImportKind) -> UInt64 {
        switch kind {
        case .slides, .presenter:
            return driftMaximumProjectAssetBytes
        case .project:
            return driftMaximumProjectArchiveBytes
        }
    }

    func importExternalFile(
        _ url: URL,
        kind: DriftImportKind,
        completion: @escaping (Error?) -> Void = { _ in }
    ) {
        precondition(Thread.isMainThread)
        let completionOnMain: (Error?) -> Void = { error in
            if Thread.isMainThread {
                completion(error)
            } else {
                DispatchQueue.main.async { completion(error) }
            }
        }
        guard kind != .project || driftAllowsExternalPortableProjects else {
            completionOnMain(BridgeFailure(
                "NotAllowedError",
                "Drift V2 Dev accepts copied project fixtures only through its verification harness."
            ))
            return
        }
        guard let completionOnce = trackExternalImportCompletion(completionOnMain) else {
            completionOnMain(BridgeFailure(
                "AbortError",
                "The native host is shutting down and cannot admit another external file."
            ))
            return
        }
        let document: NativeDocumentTicket
        do {
            document = try documentSession.currentTicket()
        } catch {
            presentError(error, title: "Project could not be opened")
            completionOnce.finish(error)
            return
        }
        if kind == .project {
            guard clientState.reserveExternalProjectImport() else {
                let error = BridgeFailure(
                    "InvalidStateError",
                    "Finish the protected studio operation before opening another project. \(clientState.protectionReason)"
                )
                presentError(error, title: "Project is still busy")
                completionOnce.finish(error)
                return
            }
            clientStateDidChange?(clientState)
        }

        brokerQueue.async { [weak self] in
            guard let self else {
                completionOnce.finish(BridgeFailure(
                    "AbortError",
                    "The native host closed before the selected file could be admitted."
                ))
                return
            }
            guard self.documentSession.isCurrent(document) else {
                completionOnce.finish(self.staleDocumentError())
                return
            }
            do {
                let validated = try self.validateOpenPanelSelection([url], kind: kind)
                guard let selected = validated.first else {
                    DispatchQueue.main.async {
                        self.releaseExternalProjectReservationIfNeeded(kind, document: document)
                        completionOnce.finish(BridgeFailure(
                            "NotFoundError",
                            "The selected file disappeared before Drift could admit it."
                        ))
                    }
                    return
                }
                let descriptor = try self.broker.registerFile(
                    selected,
                    mode: .readOnly,
                    maximumReadBytes: self.maximumImportReadBytes(for: kind)
                )
                let descriptorToken = descriptor["token"] as? String
                DispatchQueue.main.async { [weak self] in
                    guard let self else {
                        completionOnce.finish(BridgeFailure(
                            "AbortError",
                            "The native host closed before the selected file could be delivered."
                        ))
                        return
                    }
                    guard self.documentSession.isCurrent(document) else {
                        self.releaseFileGrant(descriptorToken)
                        completionOnce.finish(self.staleDocumentError())
                        return
                    }
                    self.invokeJavaScript(
                        function: "__driftNativeImportGranted",
                        arguments: [document.nonceString, descriptor, kind.rawValue],
                        document: document
                    ) { [weak self] error in
                        if let error {
                            self?.releaseFileGrant(descriptorToken)
                            if let self, self.documentSession.isCurrent(document) {
                                self.releaseExternalProjectReservationIfNeeded(kind, document: document)
                                self.presentError(error, title: "Project could not be delivered")
                            }
                        }
                        completionOnce.finish(error)
                    }
                }
            } catch {
                DispatchQueue.main.async {
                    if self.documentSession.isCurrent(document) {
                        self.releaseExternalProjectReservationIfNeeded(kind, document: document)
                        self.presentError(error, title: "Project could not be opened")
                    }
                    completionOnce.finish(error)
                }
            }
        }
    }

    func abortAllWrites() {
        exportActivityGuard.end()
        closeAllBrokerResourcesSynchronously()
    }

    private func closeAllBrokerResourcesSynchronously() {
        aacBroker.cancelAll()
        if DispatchQueue.getSpecific(key: brokerQueueSpecificKey) == brokerQueueSpecificValue {
            broker.abortAll()
            aacBroker.closeAll()
            return
        }
        let broker = broker
        let aacBroker = aacBroker
        brokerQueue.sync {
            broker.abortAll()
            aacBroker.closeAll()
        }
    }

    private func trackReply(
        _ handler: @escaping (Any?, String?) -> Void
    ) -> NativeReplyOnce? {
        let identifier = UUID()
        let reply = NativeReplyOnce(
            identifier: identifier,
            handler: handler,
            didFinish: { [weak self] finishedIdentifier in
                self?.removePendingReply(finishedIdentifier)
            }
        )
        replyLock.lock()
        guard !shuttingDown else {
            replyLock.unlock()
            return nil
        }
        pendingReplies[identifier] = reply
        replyLock.unlock()
        return reply
    }

    private func removePendingReply(_ identifier: UUID) {
        replyLock.lock()
        pendingReplies.removeValue(forKey: identifier)
        replyLock.unlock()
    }

    private func trackExternalImportCompletion(
        _ completion: @escaping (Error?) -> Void
    ) -> NativeErrorCompletionOnce? {
        let identifier = UUID()
        let tracked = NativeErrorCompletionOnce(
            identifier: identifier,
            completion: completion,
            didFinish: { [weak self] finishedIdentifier in
                self?.removePendingExternalImportCompletion(finishedIdentifier)
            }
        )
        replyLock.lock()
        guard !shuttingDown else {
            replyLock.unlock()
            return nil
        }
        pendingExternalImportCompletions[identifier] = tracked
        replyLock.unlock()
        return tracked
    }

    private func removePendingExternalImportCompletion(_ identifier: UUID) {
        replyLock.lock()
        pendingExternalImportCompletions.removeValue(forKey: identifier)
        replyLock.unlock()
    }

    private func failPendingExternalImports(_ error: Error) {
        replyLock.lock()
        let completions = Array(pendingExternalImportCompletions.values)
        pendingExternalImportCompletions.removeAll()
        replyLock.unlock()
        completions.forEach { $0.finish(error) }
    }

    private func failPendingExternalImportsForTeardown() {
        failPendingExternalImports(BridgeFailure(
            "AbortError",
            "The native host closed before the external file import completed."
        ))
    }

    private func failPendingRepliesForTeardown() {
        replyLock.lock()
        let replies = Array(pendingReplies.values)
        pendingReplies.removeAll()
        replyLock.unlock()
        let envelope = failureEnvelope(BridgeFailure(
            "AbortError",
            "The native host closed before the operation completed."
        ))
        replies.forEach { $0.send(envelope, nil) }
    }

    static func runReplyLifecycleSelfTest() throws {
        try NativeFinderOpenReplyOnce.runSelfTest()
        let host = NativeBridgeHost()
        let lock = NSLock()
        var counts: [String: Int] = [:]
        var replies: [NativeReplyOnce] = []
        var externalImportResults: [String] = []

        for lane in ["panel", "broker", "AAC"] {
            guard let reply = host.trackReply({ value, _ in
                lock.lock()
                counts[lane, default: 0] += 1
                lock.unlock()
                guard let envelope = value as? JSONDictionary,
                      envelope["ok"] as? Bool == false,
                      (envelope["error"] as? JSONDictionary)?["name"] as? String == "AbortError" else {
                    return
                }
            }) else {
                throw BridgeFailure("InvalidStateError", "The \(lane) reply was rejected before teardown.")
            }
            replies.append(reply)
        }

        guard let externalImport = host.trackExternalImportCompletion({ error in
            lock.lock()
            externalImportResults.append((error as? BridgeFailure)?.name ?? "success")
            lock.unlock()
        }) else {
            throw BridgeFailure("InvalidStateError", "The external-import completion was rejected before teardown.")
        }

        host.shutdown()
        replies.forEach { $0.send(successEnvelope(["late": true]), nil) }
        externalImport.finish(nil)
        lock.lock()
        let finalCounts = counts
        let finalExternalImportResults = externalImportResults
        lock.unlock()
        guard finalCounts == ["panel": 1, "broker": 1, "AAC": 1] else {
            throw BridgeFailure(
                "InvalidStateError",
                "Host teardown did not settle panel, broker, and AAC replies exactly once."
            )
        }
        guard finalExternalImportResults == ["AbortError"] else {
            throw BridgeFailure(
                "InvalidStateError",
                "Host teardown did not fail an external import exactly once before its late callback."
            )
        }

        let importHost = NativeBridgeHost()
        let preparedImportDocument = try importHost.documentSession.prepareBootstrap()
        _ = try importHost.documentSession.claimBootstrap(
            rawNonce: preparedImportDocument.nonceString
        )
        importHost.clientState = ClientState(
            exportInProgress: false,
            projectBusy: false,
            saveState: "saved",
            lastNotice: nil
        )
        let importFixture = FileManager.default.temporaryDirectory
            .appendingPathComponent("drift-finder-teardown-\(UUID().uuidString).pitched")
        try Data("bounded fixture".utf8).write(to: importFixture, options: .atomic)
        defer { try? FileManager.default.removeItem(at: importFixture) }
        var realImportResults: [String] = []
        importHost.importExternalFile(importFixture, kind: .project) { error in
            realImportResults.append((error as? BridgeFailure)?.name ?? "success")
        }
        importHost.shutdown()
        let lateCallbackDeadline = Date().addingTimeInterval(0.1)
        while Date() < lateCallbackDeadline {
            _ = RunLoop.main.run(mode: .default, before: lateCallbackDeadline)
        }
        guard realImportResults == ["AbortError"] else {
            throw BridgeFailure(
                "InvalidStateError",
                "A real queued external import was not failed exactly once when shutdown won."
            )
        }

        var finderResults: [String] = []
        let failedFinderReply = NativeErrorCompletionOnce(completion: { error in
            finderResults.append((error as? BridgeFailure)?.name ?? "success")
        })
        failedFinderReply.finish(BridgeFailure("DataError", "Malformed project."))
        failedFinderReply.finish(nil)
        let successfulFinderReply = NativeErrorCompletionOnce(completion: { error in
            finderResults.append(error == nil ? "success" : "failure")
        })
        successfulFinderReply.finish(nil)
        successfulFinderReply.finish(BridgeFailure("AbortError", "Late teardown."))
        guard finderResults == ["DataError", "success"] else {
            throw BridgeFailure(
                "InvalidStateError",
                "Finder import completion did not preserve one truthful terminal result."
            )
        }
        print("Drift native reply lifecycle self-test passed: teardown settles panel, broker, AAC, and external-import promises once; Finder import reports one truthful failure or success.")
    }

    func revealLastExportInFinder() {
        guard let url = lastCommittedURL else {
            NSSound.beep()
            return
        }
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }

    private func releaseFileGrant(_ token: String?) {
        guard let token else { return }
        brokerQueue.async { [weak self] in
            _ = try? self?.broker.releaseFile(["token": token])
        }
    }

    private func releaseExternalProjectReservationIfNeeded(
        _ kind: DriftImportKind,
        document: NativeDocumentTicket
    ) {
        guard kind == .project, documentSession.isCurrent(document) else { return }
        clientState.releaseExternalProjectImportReservation()
        clientStateDidChange?(clientState)
    }

    private func runtimeInfo(document: NativeDocumentTicket) -> JSONDictionary {
        let security = NativeRuntimeSecurityFacts.current()
        return [
            "bridgeVersion": driftBridgeVersion,
            "platform": "macOS",
            "appVersion": appVersionString(),
            "operatingSystem": ProcessInfo.processInfo.operatingSystemVersionString,
            "architecture": currentArchitecture(),
            "sandboxed": security.sandboxed,
            "systemCodecsOnly": true,
            "nativeAac": true,
            "nativeAacProvider": "AudioToolbox",
            "documentAuthority": "appkit-issued-per-document",
            "documentEpoch": document.epoch,
            "networkClientEntitled": security.networkClientEntitled,
            "webKitOutboundPolicyInstalled": true,
            "webKitOutboundPolicyVersion": 3,
            "nativeNetworkClientSurface": "none-shipped",
            "networkBoundary": "app-entitled-webkit-blocked",
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
        document: NativeDocumentTicket,
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

        beginAuthorizedPanel(panel, document: document, replyHandler: replyHandler) { [weak self] result in
            guard let self else { return }
            guard result == .OK, let url = panel.url else {
                replyHandler(successEnvelope(["cancelled": true]), nil)
                return
            }
            self.rememberPanelDirectory(url.deletingLastPathComponent(), key: "lastSaveDirectory")
            self.brokerQueue.async {
                guard self.documentSession.isCurrent(document) else {
                    DispatchQueue.main.async { replyHandler(self.staleDocumentEnvelope(), nil) }
                    return
                }
                do {
                    let suppliedMime = stringArray(payload, "mimeTypes", maximum: 24).first
                    let descriptor = try self.broker.registerSavePanelFile(
                        url,
                        suppliedMimeType: suppliedMime
                    )
                    var value = descriptor
                    value["cancelled"] = false
                    DispatchQueue.main.async {
                        guard self.documentSession.isCurrent(document) else {
                            if let token = value["token"] as? String { self.releaseFileGrant(token) }
                            replyHandler(self.staleDocumentEnvelope(), nil)
                            return
                        }
                        replyHandler(successEnvelope(value), nil)
                    }
                } catch {
                    DispatchQueue.main.async {
                        guard self.documentSession.isCurrent(document) else {
                            replyHandler(self.staleDocumentEnvelope(), nil)
                            return
                        }
                        replyHandler(failureEnvelope(error), nil)
                    }
                }
            }
        }
    }

    private func presentDirectoryPanel(
        document: NativeDocumentTicket,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = true
        panel.prompt = "Choose"
        panel.message = "Choose an empty folder for numbered PNG frames. Existing files are never overwritten."
        restorePanelDirectory(panel, key: "lastDirectoryExport")

        beginAuthorizedPanel(panel, document: document, replyHandler: replyHandler) { [weak self] result in
            guard let self else { return }
            guard result == .OK, let url = panel.url else {
                replyHandler(successEnvelope(["cancelled": true]), nil)
                return
            }
            self.rememberPanelDirectory(url, key: "lastDirectoryExport")
            self.brokerQueue.async {
                guard self.documentSession.isCurrent(document) else {
                    DispatchQueue.main.async { replyHandler(self.staleDocumentEnvelope(), nil) }
                    return
                }
                do {
                    var value = try self.broker.registerDirectory(url)
                    value["cancelled"] = false
                    DispatchQueue.main.async {
                        guard self.documentSession.isCurrent(document) else {
                            if let token = value["token"] as? String {
                                self.brokerQueue.async {
                                    _ = try? self.broker.releaseDirectory(["token": token])
                                }
                            }
                            replyHandler(self.staleDocumentEnvelope(), nil)
                            return
                        }
                        replyHandler(successEnvelope(value), nil)
                    }
                } catch {
                    DispatchQueue.main.async {
                        guard self.documentSession.isCurrent(document) else {
                            replyHandler(self.staleDocumentEnvelope(), nil)
                            return
                        }
                        replyHandler(failureEnvelope(error), nil)
                    }
                }
            }
        }
    }

    private func presentOpenPanel(
        _ payload: JSONDictionary,
        document: NativeDocumentTicket,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        let kind = DriftImportKind(rawValue: optionalString(payload, "kind") ?? "project") ?? .project
        guard kind != .project || driftAllowsExternalPortableProjects else {
            replyHandler(failureEnvelope(BridgeFailure(
                "NotAllowedError",
                "Drift V2 Dev does not open production .pitched projects."
            )), nil)
            return
        }
        let panel = configuredOpenPanel(kind: kind, multiple: (payload["multiple"] as? Bool) == true)
        beginAuthorizedPanel(panel, document: document, replyHandler: replyHandler) { [weak self] result in
            guard let self else { return }
            guard result == .OK else {
                replyHandler(successEnvelope(["cancelled": true, "files": []]), nil)
                return
            }
            self.brokerQueue.async {
                guard self.documentSession.isCurrent(document) else {
                    DispatchQueue.main.async { replyHandler(self.staleDocumentEnvelope(), nil) }
                    return
                }
                var descriptors: [JSONDictionary] = []
                var admittedReadBytes: UInt64 = 0
                do {
                    let urls = try self.validateOpenPanelSelection(panel.urls, kind: kind)
                    for url in urls {
                        let descriptor = try self.broker.registerFile(
                            url,
                            mode: .readOnly,
                            maximumReadBytes: self.maximumImportReadBytes(for: kind)
                        )
                        guard let admittedSize = descriptor["size"] as? Int,
                              admittedSize >= 0 else {
                            if let token = descriptor["token"] as? String {
                                _ = try? self.broker.releaseFile(["token": token])
                            }
                            throw BridgeFailure("DataError", "Native file admission returned an invalid stable size.")
                        }
                        let total = admittedReadBytes.addingReportingOverflow(UInt64(admittedSize))
                        guard !total.overflow,
                              kind != .slides || total.partialValue <= driftMaximumProjectTotalAssetBytes else {
                            if let token = descriptor["token"] as? String {
                                _ = try? self.broker.releaseFile(["token": token])
                            }
                            throw BridgeFailure(
                                "QuotaExceededError",
                                "The admitted slide batch exceeds Drift’s 80 MiB portable-project media budget."
                            )
                        }
                        admittedReadBytes = total.partialValue
                        descriptors.append(descriptor)
                    }
                    DispatchQueue.main.async {
                        guard self.documentSession.isCurrent(document) else {
                            self.releaseFileDescriptors(descriptors)
                            replyHandler(self.staleDocumentEnvelope(), nil)
                            return
                        }
                        replyHandler(successEnvelope(["cancelled": false, "files": descriptors]), nil)
                    }
                } catch {
                    self.releaseFileDescriptorsSynchronously(descriptors)
                    DispatchQueue.main.async {
                        guard self.documentSession.isCurrent(document) else {
                            replyHandler(self.staleDocumentEnvelope(), nil)
                            return
                        }
                        replyHandler(failureEnvelope(error), nil)
                    }
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
            panel.allowedContentTypes = ["png", "jpg", "jpeg", "webp", "avif", "mp4", "mov", "webm"]
                .compactMap { UTType(filenameExtension: $0) }
            panel.message = "Choose images or silent video slides. Original media: 64 MiB per file, 80 MiB total."
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
        document: NativeDocumentTicket,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        brokerQueue.async { [weak self] in
            guard let self else { return }
            guard self.documentSession.isCurrent(document) else {
                DispatchQueue.main.async { replyHandler(self.staleDocumentEnvelope(), nil) }
                return
            }
            do {
                let value: Any
                self.brokerOperationDocument = document
                defer { self.brokerOperationDocument = nil }
                switch command {
                case "write-open": value = try self.broker.openWriteSession(payload)
                case "write-chunk": value = try self.broker.writeChunk(payload)
                case "write-truncate": value = try self.broker.truncateWriteSession(payload)
                case "write-close":
                    value = try self.documentSession.performIrreversibleOperation(for: document) {
                        try self.broker.closeWriteSession(payload)
                    }
                case "write-abort": value = try self.broker.abortWriteSession(payload)
                case "file-info": value = try self.broker.fileInfo(payload)
                case "file-read": value = try self.broker.readFile(payload)
                case "file-release": value = try self.broker.releaseFile(payload)
                case "directory-get-file": value = try self.broker.directoryFile(payload)
                case "directory-remove-entry":
                    value = try self.documentSession.performIrreversibleOperation(for: document) {
                        try self.broker.removeDirectoryEntry(payload)
                    }
                case "directory-release": value = try self.broker.releaseDirectory(payload)
                default: throw BridgeFailure("NotSupportedError", "Unknown file-broker command.")
                }
                if command == "file-release" {
                    self.metricsLock.lock()
                    self.releasedFileGrantCountStorage += 1
                    self.metricsLock.unlock()
                }
                guard self.documentSession.isCurrent(document) else {
                    self.discardStaleBrokerValue(command: command, value: value)
                    DispatchQueue.main.async { replyHandler(self.staleDocumentEnvelope(), nil) }
                    return
                }
                DispatchQueue.main.async {
                    guard self.documentSession.isCurrent(document) else {
                        self.brokerQueue.async {
                            self.discardStaleBrokerValue(command: command, value: value)
                        }
                        replyHandler(self.staleDocumentEnvelope(), nil)
                        return
                    }
                    replyHandler(successEnvelope(value), nil)
                }
            } catch {
                DispatchQueue.main.async {
                    guard self.documentSession.isCurrent(document) else {
                        replyHandler(self.staleDocumentEnvelope(), nil)
                        return
                    }
                    replyHandler(failureEnvelope(error), nil)
                }
            }
        }
    }

    private func performAacCommand(
        _ command: String,
        payload: JSONDictionary,
        document: NativeDocumentTicket,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        if command == "aac-close", let token = payload["token"] as? String { aacBroker.cancel(token) }
        brokerQueue.async { [weak self] in
            guard let self else { return }
            guard self.documentSession.isCurrent(document) else {
                DispatchQueue.main.async { replyHandler(self.staleDocumentEnvelope(), nil) }
                return
            }
            do {
                let value: Any
                switch command {
                case "aac-create": value = try self.aacBroker.create(payload)
                case "aac-append": value = try self.aacBroker.append(payload)
                case "aac-finish": value = try self.aacBroker.finish(payload)
                case "aac-close": value = try self.aacBroker.close(payload)
                default: throw BridgeFailure("NotSupportedError", "Unknown native AAC command.")
                }
                guard self.documentSession.isCurrent(document) else {
                    self.discardStaleAacValue(command: command, value: value)
                    DispatchQueue.main.async { replyHandler(self.staleDocumentEnvelope(), nil) }
                    return
                }
                DispatchQueue.main.async {
                    guard self.documentSession.isCurrent(document) else {
                        self.brokerQueue.async {
                            self.discardStaleAacValue(command: command, value: value)
                        }
                        replyHandler(self.staleDocumentEnvelope(), nil)
                        return
                    }
                    replyHandler(successEnvelope(value), nil)
                }
            } catch {
                DispatchQueue.main.async {
                    guard self.documentSession.isCurrent(document) else {
                        replyHandler(self.staleDocumentEnvelope(), nil)
                        return
                    }
                    replyHandler(failureEnvelope(error), nil)
                }
            }
        }
    }

    private func discardStaleBrokerValue(command: String, value: Any) {
        guard let dictionary = value as? JSONDictionary else { return }
        switch command {
        case "write-open":
            if let session = dictionary["session"] as? String {
                _ = try? broker.abortWriteSession(["session": session])
            }
        case "directory-get-file":
            if let token = dictionary["token"] as? String {
                _ = try? broker.releaseFile(["token": token])
            }
        default:
            break
        }
    }

    private func discardStaleAacValue(command: String, value: Any) {
        guard command == "aac-create",
              let dictionary = value as? JSONDictionary,
              let token = dictionary["token"] as? String else { return }
        _ = try? aacBroker.close(["token": token])
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

    private func staleDocumentEnvelope() -> JSONDictionary {
        failureEnvelope(staleDocumentError())
    }

    private func staleDocumentError() -> BridgeFailure {
        BridgeFailure(
            "SecurityError",
            "That native operation belongs to a Drift document that was replaced or reloaded."
        )
    }

    private func beginAuthorizedPanel(
        _ panel: NSSavePanel,
        document: NativeDocumentTicket,
        replyHandler: @escaping (Any?, String?) -> Void,
        completion: @escaping (NSApplication.ModalResponse) -> Void
    ) {
        let ticket: NativePanelTicket
        do {
            ticket = try documentSession.beginPanel(for: document) { panel.cancel(nil) }
        } catch {
            replyHandler(failureEnvelope(error), nil)
            return
        }

        begin(panel: panel) { [weak self] result in
            guard let self else { return }
            guard self.documentSession.finishPanel(ticket) else {
                replyHandler(self.staleDocumentEnvelope(), nil)
                return
            }
            completion(result)
        }
    }

    private func begin(panel: NSSavePanel, completion: @escaping (NSApplication.ModalResponse) -> Void) {
        if let window = webView?.window {
            panel.beginSheetModal(for: window, completionHandler: completion)
        } else {
            completion(panel.runModal())
        }
    }

    private func releaseFileDescriptors(_ descriptors: [JSONDictionary]) {
        brokerQueue.async { [weak self] in
            self?.releaseFileDescriptorsSynchronously(descriptors)
        }
    }

    private func releaseFileDescriptorsSynchronously(_ descriptors: [JSONDictionary]) {
        for descriptor in descriptors {
            if let token = descriptor["token"] as? String {
                _ = try? broker.releaseFile(["token": token])
            }
        }
    }

    private func restorePanelDirectory(_ panel: NSSavePanel, key: String) {
        guard let path = UserDefaults.standard.string(forKey: key) else { return }
        panel.directoryURL = URL(fileURLWithPath: path, isDirectory: true)
    }

    private func rememberPanelDirectory(_ url: URL, key: String) {
        UserDefaults.standard.set(url.standardizedFileURL.path, forKey: key)
    }

    private func invokeJavaScript(
        function: String,
        arguments: [Any],
        document: NativeDocumentTicket,
        completion: ((Error?) -> Void)? = nil
    ) {
        guard documentSession.isCurrent(document), let webView else {
            completion?(BridgeFailure("SecurityError", "The native callback belongs to a stale Drift document."))
            return
        }
        webView.callAsyncJavaScript(
            """
            const callable = window[functionName];
            if (typeof callable !== 'function') {
              throw new DOMException('The typed native callback is unavailable.', 'InvalidStateError');
            }
            return await callable(...functionArguments);
            """,
            arguments: ["functionName": function, "functionArguments": arguments],
            in: nil,
            in: .page,
            completionHandler: { [weak self] result in
                guard let self else {
                    completion?(BridgeFailure("AbortError", "The native host closed before its callback completed."))
                    return
                }
                let completionError: Error?
                if !self.documentSession.isCurrent(document) {
                    completionError = BridgeFailure(
                        "SecurityError",
                        "The native callback completed after its Drift document was replaced."
                    )
                } else {
                    switch result {
                    case .success(let value):
                        let accepted = (value as? Bool) ?? (value as? NSNumber)?.boolValue
                        completionError = accepted == true
                            ? nil
                            : BridgeFailure("InvalidStateError", "The typed native callback did not acknowledge delivery.")
                    case .failure(let error):
                        completionError = error
                    }
                }
                if let completionError {
                    let stableName = (completionError as? BridgeFailure)?.name ?? "Error"
                    NSLog("Drift native JavaScript callback failed [%@]", stableName)
                }
                completion?(completionError)
            }
        )
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
