import Darwin
import Foundation

private let driftRenameExclusiveFlag: UInt32 = 0x00000004 // RENAME_EXCL

private final class SecurityScope {
    let url: URL
    private let active: Bool

    init(url: URL) {
        self.url = url
        self.active = url.startAccessingSecurityScopedResource()
    }

    deinit {
        if active { url.stopAccessingSecurityScopedResource() }
    }
}

private enum WriteDisposition: Equatable {
    /// A save-panel destination may replace an existing file after verified staging.
    case replaceOrCreate
    /// A sequence-frame destination must remain absent until its atomic commit.
    case createOnly
}

private final class FileGrant {
    let token: String
    let url: URL
    let mimeType: String
    let mode: GrantMode
    let writeDisposition: WriteDisposition
    let scope: SecurityScope
    let createdAt = Date()

    init(
        token: String,
        url: URL,
        mimeType: String,
        mode: GrantMode,
        writeDisposition: WriteDisposition
    ) {
        self.token = token
        self.url = url
        self.mimeType = mimeType
        self.mode = mode
        self.writeDisposition = writeDisposition
        self.scope = SecurityScope(url: url)
    }
}

private final class DirectoryGrant {
    let token: String
    let url: URL
    let scope: SecurityScope
    let createdAt = Date()

    init(token: String, url: URL) {
        self.token = token
        self.url = url
        self.scope = SecurityScope(url: url)
    }
}

private final class WriteSession {
    let token: String
    let fileToken: String
    let stagingURL: URL
    let destinationURL: URL
    let replacementDirectory: URL
    let writeDisposition: WriteDisposition
    var handle: FileHandle?

    init(
        token: String,
        fileToken: String,
        stagingURL: URL,
        destinationURL: URL,
        replacementDirectory: URL,
        writeDisposition: WriteDisposition,
        handle: FileHandle
    ) {
        self.token = token
        self.fileToken = fileToken
        self.stagingURL = stagingURL
        self.destinationURL = destinationURL
        self.replacementDirectory = replacementDirectory
        self.writeDisposition = writeDisposition
        self.handle = handle
    }
}

final class NativeFileBroker {
    private let fileManager: FileManager
    private var fileGrants: [String: FileGrant] = [:]
    private var directoryGrants: [String: DirectoryGrant] = [:]
    private var writeSessions: [String: WriteSession] = [:]

    var didCommitFile: ((URL) -> Void)?

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
    }

    deinit {
        abortAll()
    }

    func registerFile(
        _ rawURL: URL,
        mode: GrantMode,
        suppliedMimeType: String? = nil
    ) throws -> JSONDictionary {
        try registerFile(
            rawURL,
            mode: mode,
            suppliedMimeType: suppliedMimeType,
            writeDisposition: .replaceOrCreate
        )
    }

    private func registerFile(
        _ rawURL: URL,
        mode: GrantMode,
        suppliedMimeType: String? = nil,
        writeDisposition: WriteDisposition
    ) throws -> JSONDictionary {
        let url = try ensureLocalFileURL(rawURL)
        let exists = fileManager.fileExists(atPath: url.path)
        try rejectSymlink(url, allowMissing: mode == .readWrite)
        try rejectDirectory(url, allowMissing: mode == .readWrite)
        if !exists {
            guard mode == .readWrite else {
                throw BridgeFailure("NotFoundError", "The selected file no longer exists.")
            }
            try requireDirectory(url.deletingLastPathComponent())
        }
        trimGrantsIfNeeded()

        let token = UUID().uuidString
        let grant = FileGrant(
            token: token,
            url: url,
            mimeType: suppliedMimeType ?? mimeType(for: url),
            mode: mode,
            writeDisposition: writeDisposition
        )
        fileGrants[token] = grant
        return try descriptor(for: grant)
    }

    func registerDirectory(_ rawURL: URL) throws -> JSONDictionary {
        let url = try ensureLocalFileURL(rawURL)
        try requireDirectory(url)
        trimGrantsIfNeeded()

        let token = UUID().uuidString
        directoryGrants[token] = DirectoryGrant(token: token, url: url)
        return ["token": token, "name": url.lastPathComponent]
    }

    func descriptor(forToken token: String) throws -> JSONDictionary {
        guard let grant = fileGrants[token] else {
            throw BridgeFailure("NotAllowedError", "That file permission is no longer valid.")
        }
        return try descriptor(for: grant)
    }

    func releaseFile(_ payload: JSONDictionary) throws -> JSONDictionary {
        let token = try requiredString(payload, "token")
        guard !writeSessions.values.contains(where: { $0.fileToken == token }) else {
            throw BridgeFailure("InvalidStateError", "That file is still being written.")
        }
        fileGrants.removeValue(forKey: token)
        return ["released": true]
    }

    func releaseDirectory(_ payload: JSONDictionary) throws -> JSONDictionary {
        let token = try requiredString(payload, "token")
        directoryGrants.removeValue(forKey: token)
        return ["released": true]
    }

    func openWriteSession(_ payload: JSONDictionary) throws -> JSONDictionary {
        guard writeSessions.count < 8 else {
            throw BridgeFailure("QuotaExceededError", "Too many native file writes are open at once.")
        }
        let fileToken = try requiredString(payload, "token")
        guard let grant = fileGrants[fileToken], grant.mode == .readWrite else {
            throw BridgeFailure("NotAllowedError", "That file permission is not writable.")
        }
        guard !writeSessions.values.contains(where: { $0.fileToken == fileToken }) else {
            throw BridgeFailure("InvalidStateError", "A writable stream is already open for that file.")
        }

        let destinationURL = grant.url
        try rejectSymlink(destinationURL, allowMissing: true)
        try rejectDirectory(destinationURL, allowMissing: true)
        let parent = destinationURL.deletingLastPathComponent().standardizedFileURL
        try requireDirectory(parent)

        let keepExistingData = (payload["keepExistingData"] as? Bool) == true
        if grant.writeDisposition == .createOnly {
            guard !keepExistingData else {
                throw BridgeFailure(
                    "InvalidModificationError",
                    "Numbered sequence frames are create-only and cannot preserve or replace existing bytes."
                )
            }
            guard !fileManager.fileExists(atPath: destinationURL.path) else {
                throw frameCollision(destinationURL.lastPathComponent)
            }
        }

        // Foundation derives a same-volume item-replacement directory from an
        // existing item. A new destination has no item, so use its verified
        // parent as the anchor. Both first saves and replacements therefore
        // remain on one staged, same-volume commit path.
        let replacementAnchor = fileManager.fileExists(atPath: destinationURL.path)
            ? destinationURL
            : parent
        let replacementDirectory = try fileManager.url(
            for: .itemReplacementDirectory,
            in: .userDomainMask,
            appropriateFor: replacementAnchor,
            create: true
        )
        var stagingURL = replacementDirectory.appendingPathComponent(UUID().uuidString, isDirectory: false)
        if !destinationURL.pathExtension.isEmpty {
            stagingURL.appendPathExtension(destinationURL.pathExtension)
        }

        do {
            if keepExistingData && fileManager.fileExists(atPath: destinationURL.path) {
                try fileManager.copyItem(at: destinationURL, to: stagingURL)
            } else {
                guard fileManager.createFile(atPath: stagingURL.path, contents: Data()) else {
                    throw BridgeFailure("NotAllowedError", "macOS could not create a staged export file.")
                }
            }
            let handle = try FileHandle(forWritingTo: stagingURL)
            let sessionToken = UUID().uuidString
            writeSessions[sessionToken] = WriteSession(
                token: sessionToken,
                fileToken: fileToken,
                stagingURL: stagingURL,
                destinationURL: destinationURL,
                replacementDirectory: replacementDirectory,
                writeDisposition: grant.writeDisposition,
                handle: handle
            )
            return [
                "session": sessionToken,
                "size": Int(try fileSize(at: stagingURL, fileManager: fileManager)),
            ]
        } catch {
            try? fileManager.removeItem(at: stagingURL)
            try? fileManager.removeItem(at: replacementDirectory)
            throw error
        }
    }

    func writeChunk(_ payload: JSONDictionary) throws -> JSONDictionary {
        let session = try requiredSession(payload)
        let position = try requiredOffset(payload, "position")
        let maximumEncodedBytes = ((driftMaximumWriteChunkBytes + 2) / 3) * 4 + 8
        guard let encoded = payload["data"] as? String,
              !encoded.isEmpty,
              encoded.utf8.count <= maximumEncodedBytes,
              let data = Data(base64Encoded: encoded) else {
            throw BridgeFailure("DataError", "The renderer sent an invalid or oversized binary chunk.")
        }
        guard data.count <= driftMaximumWriteChunkBytes else {
            throw BridgeFailure("QuotaExceededError", "Native write chunks are limited to 512 KiB.")
        }
        let end = position.addingReportingOverflow(UInt64(data.count))
        guard !end.overflow, end.partialValue <= driftMaximumNativeOutputBytes else {
            throw BridgeFailure("QuotaExceededError", "A native export may not exceed 512 MiB.")
        }
        guard let handle = session.handle else {
            throw BridgeFailure("InvalidStateError", "The writable stream is already closed.")
        }

        try handle.seek(toOffset: position)
        try handle.write(contentsOf: data)
        return ["bytesWritten": data.count, "position": Int(end.partialValue)]
    }

    func truncateWriteSession(_ payload: JSONDictionary) throws -> JSONDictionary {
        let session = try requiredSession(payload)
        let size = try requiredOffset(payload, "size")
        guard size <= driftMaximumNativeOutputBytes else {
            throw BridgeFailure("QuotaExceededError", "A native export may not exceed 512 MiB.")
        }
        guard let handle = session.handle else {
            throw BridgeFailure("InvalidStateError", "The writable stream is already closed.")
        }
        try handle.truncate(atOffset: size)
        return ["size": Int(size)]
    }

    func closeWriteSession(_ payload: JSONDictionary) throws -> JSONDictionary {
        let sessionToken = try requiredString(payload, "session")
        guard let session = writeSessions[sessionToken] else {
            throw BridgeFailure("InvalidStateError", "The writable stream is no longer open.")
        }

        do {
            if let handle = session.handle {
                try handle.synchronize()
                try handle.close()
                session.handle = nil
            }
            let finalSize = try fileSize(at: session.stagingURL, fileManager: fileManager)
            guard finalSize <= driftMaximumNativeOutputBytes else {
                throw BridgeFailure("QuotaExceededError", "The completed native export exceeded 512 MiB.")
            }
            try rejectSymlink(session.destinationURL, allowMissing: true)
            try rejectDirectory(session.destinationURL, allowMissing: true)
            let parent = session.destinationURL.deletingLastPathComponent().standardizedFileURL
            try requireDirectory(parent)

            let renameResult: Int32
            switch session.writeDisposition {
            case .replaceOrCreate:
                renameResult = session.stagingURL.path.withCString { sourcePath in
                    session.destinationURL.path.withCString { destinationPath in
                        Darwin.rename(sourcePath, destinationPath)
                    }
                }
            case .createOnly:
                renameResult = session.stagingURL.path.withCString { sourcePath in
                    session.destinationURL.path.withCString { destinationPath in
                        Darwin.renamex_np(sourcePath, destinationPath, driftRenameExclusiveFlag)
                    }
                }
            }
            guard renameResult == 0 else {
                let code = errno
                if session.writeDisposition == .createOnly && code == EEXIST {
                    throw frameCollision(session.destinationURL.lastPathComponent)
                }
                throw BridgeFailure(
                    code == EACCES || code == EPERM ? "NotAllowedError" : "InvalidModificationError",
                    "The staged export could not commit its destination: \(String(cString: strerror(code)))."
                )
            }

            // Best-effort directory sync narrows the crash window after the
            // atomic rename. A valid committed file remains usable if a volume
            // refuses directory fsync.
            let directoryDescriptor = Darwin.open(parent.path, O_RDONLY)
            if directoryDescriptor >= 0 {
                _ = Darwin.fsync(directoryDescriptor)
                _ = Darwin.close(directoryDescriptor)
            }

            writeSessions.removeValue(forKey: sessionToken)
            try? fileManager.removeItem(at: session.replacementDirectory)
            didCommitFile?(session.destinationURL)
            return [
                "name": session.destinationURL.lastPathComponent,
                "size": Int(try fileSize(at: session.destinationURL, fileManager: fileManager)),
            ]
        } catch {
            cleanupFailedWriteSession(sessionToken: sessionToken, session: session)
            throw error
        }
    }

    func abortWriteSession(_ payload: JSONDictionary) throws -> JSONDictionary {
        let sessionToken = try requiredString(payload, "session")
        guard let session = writeSessions.removeValue(forKey: sessionToken) else {
            return ["aborted": true]
        }
        cleanupStaging(session)
        return ["aborted": true]
    }

    func fileInfo(_ payload: JSONDictionary) throws -> JSONDictionary {
        let token = try requiredString(payload, "token")
        guard let grant = fileGrants[token] else {
            throw BridgeFailure("NotAllowedError", "That file permission is no longer valid.")
        }
        try rejectSymlink(grant.url, allowMissing: false)
        try rejectDirectory(grant.url, allowMissing: false)
        let attributes = try fileManager.attributesOfItem(atPath: grant.url.path)
        let size = (attributes[.size] as? NSNumber)?.uint64Value ?? 0
        let modified = (attributes[.modificationDate] as? Date)?.timeIntervalSince1970 ?? Date().timeIntervalSince1970
        return [
            "name": grant.url.lastPathComponent,
            "size": Int(size),
            "mimeType": grant.mimeType,
            "lastModified": Int64(modified * 1_000),
        ]
    }

    func readFile(_ payload: JSONDictionary) throws -> JSONDictionary {
        let token = try requiredString(payload, "token")
        guard let grant = fileGrants[token] else {
            throw BridgeFailure("NotAllowedError", "That file permission is no longer valid.")
        }
        let offset = try requiredOffset(payload, "offset")
        let requestedLength = try requiredOffset(payload, "length")
        guard requestedLength <= UInt64(driftMaximumReadChunkBytes) else {
            throw BridgeFailure("QuotaExceededError", "Native read chunks are limited to 1 MiB.")
        }
        try rejectSymlink(grant.url, allowMissing: false)
        try rejectDirectory(grant.url, allowMissing: false)
        let totalSize = try fileSize(at: grant.url, fileManager: fileManager)
        guard offset <= totalSize else {
            throw BridgeFailure("DataError", "Native read offset is beyond the end of the file.")
        }
        let safeLength = min(requestedLength, totalSize - offset)

        let handle = try FileHandle(forReadingFrom: grant.url)
        defer { try? handle.close() }
        try handle.seek(toOffset: offset)
        let data = try handle.read(upToCount: Int(safeLength)) ?? Data()
        return ["data": data.base64EncodedString(), "length": data.count]
    }

    func directoryFile(_ payload: JSONDictionary) throws -> JSONDictionary {
        let directoryToken = try requiredString(payload, "token")
        guard let directory = directoryGrants[directoryToken] else {
            throw BridgeFailure("NotAllowedError", "That directory permission is no longer valid.")
        }
        let name = try validatedChildName(requiredString(payload, "name"))
        let create = (payload["create"] as? Bool) == true
        try requireDirectory(directory.url)
        let fileURL = directory.url.appendingPathComponent(name, isDirectory: false).standardizedFileURL
        guard fileURL.deletingLastPathComponent() == directory.url.standardizedFileURL else {
            throw BridgeFailure("SecurityError", "Directory traversal is not permitted.")
        }

        var isDirectory: ObjCBool = false
        let exists = fileManager.fileExists(atPath: fileURL.path, isDirectory: &isDirectory)
        if exists && isDirectory.boolValue {
            throw BridgeFailure("TypeMismatchError", "The requested frame name belongs to a directory.")
        }
        if exists { try rejectSymlink(fileURL, allowMissing: false) }

        if create {
            guard !exists else { throw frameCollision(name) }
            // Do not create an empty destination here. The returned capability
            // points at an absent path; bytes remain in same-volume staging
            // until an exclusive atomic commit. A renderer crash therefore
            // cannot leave plausible or empty numbered frames behind.
            return try registerFile(
                fileURL,
                mode: .readWrite,
                writeDisposition: .createOnly
            )
        }

        guard exists else {
            throw BridgeFailure("NotFoundError", "The requested file does not exist.")
        }
        // Existing sequence entries may be inspected for collision/readback,
        // but a directory grant never turns them into replacement targets.
        return try registerFile(fileURL, mode: .readOnly)
    }

    func removeDirectoryEntry(_ payload: JSONDictionary) throws -> JSONDictionary {
        let directoryToken = try requiredString(payload, "token")
        guard let directory = directoryGrants[directoryToken] else {
            throw BridgeFailure("NotAllowedError", "That directory permission is no longer valid.")
        }
        let name = try validatedChildName(requiredString(payload, "name"))
        try requireDirectory(directory.url)
        let fileURL = directory.url.appendingPathComponent(name, isDirectory: false).standardizedFileURL
        guard fileURL.deletingLastPathComponent() == directory.url.standardizedFileURL else {
            throw BridgeFailure("SecurityError", "Directory traversal is not permitted.")
        }
        guard !writeSessions.values.contains(where: { $0.destinationURL == fileURL }) else {
            throw BridgeFailure("InvalidStateError", "That directory file is still being written.")
        }
        guard fileManager.fileExists(atPath: fileURL.path) else {
            throw BridgeFailure("NotFoundError", "The requested file does not exist.")
        }
        try rejectSymlink(fileURL, allowMissing: false)
        try rejectDirectory(fileURL, allowMissing: false)
        try fileManager.removeItem(at: fileURL)
        fileGrants = fileGrants.filter { $0.value.url != fileURL }
        return ["removed": true]
    }

    func abortAll() {
        let sessions = Array(writeSessions.values)
        writeSessions.removeAll()
        for session in sessions { cleanupStaging(session) }
        // A WebContent process termination destroys the only legitimate holder
        // of these opaque tokens. Revoke the native capabilities as well as the
        // writes so stale security-scoped access cannot survive a renderer.
        fileGrants.removeAll()
        directoryGrants.removeAll()
    }

    private func descriptor(for grant: FileGrant) throws -> JSONDictionary {
        let exists = fileManager.fileExists(atPath: grant.url.path)
        let attributes = exists ? try fileManager.attributesOfItem(atPath: grant.url.path) : [:]
        let size = (attributes[.size] as? NSNumber)?.uint64Value ?? 0
        let modified = (attributes[.modificationDate] as? Date)?.timeIntervalSince1970 ?? Date().timeIntervalSince1970
        return [
            "token": grant.token,
            "name": grant.url.lastPathComponent,
            "size": Int(size),
            "mimeType": grant.mimeType,
            "lastModified": Int64(modified * 1_000),
            "writable": grant.mode == .readWrite,
        ]
    }

    private func requiredSession(_ payload: JSONDictionary) throws -> WriteSession {
        let token = try requiredString(payload, "session")
        guard let session = writeSessions[token] else {
            throw BridgeFailure("InvalidStateError", "The writable stream is no longer open.")
        }
        return session
    }

    private func frameCollision(_ name: String) -> BridgeFailure {
        BridgeFailure(
            "InvalidModificationError",
            "The selected folder already contains \(name). Existing PNG sequence files are never overwritten."
        )
    }

    private func cleanupFailedWriteSession(sessionToken: String, session: WriteSession) {
        writeSessions.removeValue(forKey: sessionToken)
        cleanupStaging(session)
    }

    private func cleanupStaging(_ session: WriteSession) {
        try? session.handle?.close()
        session.handle = nil
        try? fileManager.removeItem(at: session.stagingURL)
        try? fileManager.removeItem(at: session.replacementDirectory)
    }

    private func rejectSymlink(_ url: URL, allowMissing: Bool) throws {
        if !fileManager.fileExists(atPath: url.path) {
            if allowMissing { return }
            throw BridgeFailure("NotFoundError", "The selected file no longer exists.")
        }
        if isSymbolicLink(url) {
            throw BridgeFailure("SecurityError", "Symbolic links are not accepted as native import or export targets.")
        }
    }

    private func rejectDirectory(_ url: URL, allowMissing: Bool) throws {
        var isDirectory: ObjCBool = false
        if !fileManager.fileExists(atPath: url.path, isDirectory: &isDirectory) {
            if allowMissing { return }
            throw BridgeFailure("NotFoundError", "The selected file no longer exists.")
        }
        if isDirectory.boolValue {
            throw BridgeFailure("TypeMismatchError", "A file was required, but the selected target is a directory.")
        }
    }

    private func requireDirectory(_ url: URL) throws {
        var isDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: url.path, isDirectory: &isDirectory), isDirectory.boolValue else {
            throw BridgeFailure("NotFoundError", "The selected folder no longer exists.")
        }
        if isSymbolicLink(url) {
            throw BridgeFailure("SecurityError", "Symbol-link folders are not accepted as native targets.")
        }
    }

    private func trimGrantsIfNeeded() {
        let protectedTokens = Set(writeSessions.values.map(\.fileToken))
        while fileGrants.count + directoryGrants.count >= driftMaximumGrantCount {
            // Prefer evicting an old inactive file. A selected PNG-sequence
            // directory should not disappear merely because hundreds of child
            // frame handles were created beneath it.
            if let oldestFile = fileGrants.values
                .filter({ !protectedTokens.contains($0.token) })
                .min(by: { $0.createdAt < $1.createdAt }) {
                fileGrants.removeValue(forKey: oldestFile.token)
            } else if let oldestDirectory = directoryGrants.values.min(by: { $0.createdAt < $1.createdAt }) {
                directoryGrants.removeValue(forKey: oldestDirectory.token)
            } else {
                return
            }
        }
    }

    static func runSelfTest() throws {
        let manager = FileManager.default
        let root = manager.temporaryDirectory.appendingPathComponent(
            "drift-native-self-test-\(UUID().uuidString)",
            isDirectory: true
        )
        try manager.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? manager.removeItem(at: root) }

        let broker = NativeFileBroker(fileManager: manager)
        let destination = root.appendingPathComponent("master.bin")
        try Data("old-master".utf8).write(to: destination)
        let descriptor = try broker.registerFile(destination, mode: .readWrite)
        let token = descriptor["token"] as! String

        let opened = try broker.openWriteSession(["token": token, "keepExistingData": false])
        let session = opened["session"] as! String
        _ = try broker.writeChunk([
            "session": session,
            "position": 0,
            "data": Data("new-master".utf8).base64EncodedString(),
        ])
        _ = try broker.closeWriteSession(["session": session])
        guard try String(contentsOf: destination, encoding: .utf8) == "new-master" else {
            throw BridgeFailure("DataError", "Atomic replacement self-test produced the wrong bytes.")
        }

        let freshDestination = root.appendingPathComponent("first-master.bin")
        let freshDescriptor = try broker.registerFile(freshDestination, mode: .readWrite)
        let freshToken = freshDescriptor["token"] as! String
        let freshOpened = try broker.openWriteSession(["token": freshToken, "keepExistingData": false])
        let freshSession = freshOpened["session"] as! String
        _ = try broker.writeChunk([
            "session": freshSession,
            "position": 0,
            "data": Data("first-master".utf8).base64EncodedString(),
        ])
        _ = try broker.closeWriteSession(["session": freshSession])
        guard try String(contentsOf: freshDestination, encoding: .utf8) == "first-master" else {
            throw BridgeFailure("DataError", "First-write self-test did not commit the selected new destination.")
        }

        let abortOpen = try broker.openWriteSession(["token": token, "keepExistingData": false])
        let abortSession = abortOpen["session"] as! String
        _ = try broker.writeChunk([
            "session": abortSession,
            "position": 0,
            "data": Data("partial".utf8).base64EncodedString(),
        ])
        _ = try broker.abortWriteSession(["session": abortSession])
        guard try String(contentsOf: destination, encoding: .utf8) == "new-master" else {
            throw BridgeFailure("DataError", "Abort self-test changed the committed destination.")
        }
        _ = try broker.abortWriteSession(["session": abortSession])

        let cappedOpen = try broker.openWriteSession(["token": token, "keepExistingData": false])
        let cappedSession = cappedOpen["session"] as! String
        do {
            _ = try broker.truncateWriteSession([
                "session": cappedSession,
                "size": driftMaximumNativeOutputBytes + 1,
            ])
            throw BridgeFailure("DataError", "Output cap self-test unexpectedly succeeded.")
        } catch let failure as BridgeFailure where failure.name == "QuotaExceededError" {
            _ = try broker.abortWriteSession(["session": cappedSession])
        }

        let directoryDescriptor = try broker.registerDirectory(root)
        let directoryToken = directoryDescriptor["token"] as! String
        let frameURL = root.appendingPathComponent("drift_000001.png")
        let frameDescriptor = try broker.directoryFile([
            "token": directoryToken,
            "name": frameURL.lastPathComponent,
            "create": true,
        ])
        guard !manager.fileExists(atPath: frameURL.path) else {
            throw BridgeFailure("DataError", "create:true leaked an empty sequence frame before commit.")
        }
        let frameToken = frameDescriptor["token"] as! String
        let frameOpen = try broker.openWriteSession(["token": frameToken, "keepExistingData": false])
        let frameSession = frameOpen["session"] as! String
        let frameBytes = Data([137, 80, 78, 71, 13, 10, 26, 10])
        _ = try broker.writeChunk([
            "session": frameSession,
            "position": 0,
            "data": frameBytes.base64EncodedString(),
        ])
        _ = try broker.closeWriteSession(["session": frameSession])
        let info = try broker.fileInfo(["token": frameToken])
        guard info["size"] as? Int == frameBytes.count else {
            throw BridgeFailure("DataError", "Directory frame self-test changed the output size.")
        }
        let read = try broker.readFile(["token": frameToken, "offset": 0, "length": frameBytes.count])
        guard Data(base64Encoded: read["data"] as! String) == frameBytes else {
            throw BridgeFailure("DataError", "Native readback self-test changed the output bytes.")
        }

        let priorBytes = try Data(contentsOf: frameURL)
        do {
            _ = try broker.directoryFile([
                "token": directoryToken,
                "name": frameURL.lastPathComponent,
                "create": true,
            ])
            throw BridgeFailure("DataError", "Existing sequence-frame collision unexpectedly succeeded.")
        } catch let failure as BridgeFailure where failure.name == "InvalidModificationError" {
            guard try Data(contentsOf: frameURL) == priorBytes else {
                throw BridgeFailure("DataError", "Collision check changed an existing sequence frame.")
            }
        }

        let readOnlyFrame = try broker.directoryFile([
            "token": directoryToken,
            "name": frameURL.lastPathComponent,
            "create": false,
        ])
        do {
            _ = try broker.openWriteSession([
                "token": readOnlyFrame["token"] as! String,
                "keepExistingData": false,
            ])
            throw BridgeFailure("DataError", "Existing directory entry became writable.")
        } catch let failure as BridgeFailure where failure.name == "NotAllowedError" {
            // Expected.
        }

        let racedURL = root.appendingPathComponent("drift_000002.png")
        let racedDescriptor = try broker.directoryFile([
            "token": directoryToken,
            "name": racedURL.lastPathComponent,
            "create": true,
        ])
        let racedToken = racedDescriptor["token"] as! String
        let racedOpen = try broker.openWriteSession(["token": racedToken, "keepExistingData": false])
        let racedSession = racedOpen["session"] as! String
        _ = try broker.writeChunk([
            "session": racedSession,
            "position": 0,
            "data": Data("generated".utf8).base64EncodedString(),
        ])
        let intruder = Data("existing-wins".utf8)
        try intruder.write(to: racedURL)
        do {
            _ = try broker.closeWriteSession(["session": racedSession])
            throw BridgeFailure("DataError", "Commit-time frame collision unexpectedly overwrote a file.")
        } catch let failure as BridgeFailure where failure.name == "InvalidModificationError" {
            guard try Data(contentsOf: racedURL) == intruder else {
                throw BridgeFailure("DataError", "Exclusive sequence commit changed the colliding file.")
            }
        }

        let abortedFrameURL = root.appendingPathComponent("drift_000003.png")
        let abortedDescriptor = try broker.directoryFile([
            "token": directoryToken,
            "name": abortedFrameURL.lastPathComponent,
            "create": true,
        ])
        let abortedToken = abortedDescriptor["token"] as! String
        let abortedOpen = try broker.openWriteSession(["token": abortedToken, "keepExistingData": false])
        let abortedSession = abortedOpen["session"] as! String
        _ = try broker.writeChunk([
            "session": abortedSession,
            "position": 0,
            "data": Data("partial-frame".utf8).base64EncodedString(),
        ])
        _ = try broker.abortWriteSession(["session": abortedSession])
        guard !manager.fileExists(atPath: abortedFrameURL.path) else {
            throw BridgeFailure("DataError", "Aborted sequence write left a final frame behind.")
        }

        _ = try broker.removeDirectoryEntry(["token": directoryToken, "name": frameURL.lastPathComponent])

        do {
            _ = try broker.readFile(["token": token, "offset": 999, "length": 1])
            throw BridgeFailure("DataError", "Out-of-range read unexpectedly succeeded.")
        } catch let failure as BridgeFailure where failure.name == "DataError" {
            // Expected.
        }

        do {
            _ = try broker.directoryFile(["token": directoryToken, "name": "../escape.png", "create": true])
            throw BridgeFailure("SecurityError", "Traversal self-test unexpectedly succeeded.")
        } catch let failure as BridgeFailure where failure.name == "TypeError" {
            // Expected.
        }

        let symlink = root.appendingPathComponent("link.bin")
        try manager.createSymbolicLink(at: symlink, withDestinationURL: destination)
        do {
            _ = try broker.registerFile(symlink, mode: .readOnly)
            throw BridgeFailure("SecurityError", "Symlink self-test unexpectedly succeeded.")
        } catch let failure as BridgeFailure where failure.name == "SecurityError" {
            // Expected.
        }

        let disposable = root.appendingPathComponent("disposable.bin")
        try Data([0x01]).write(to: disposable)
        let disposableDescriptor = try broker.registerFile(disposable, mode: .readOnly)
        let disposableToken = disposableDescriptor["token"] as! String
        _ = try broker.releaseFile(["token": disposableToken])
        _ = try broker.releaseFile(["token": disposableToken])
        do {
            _ = try broker.fileInfo(["token": disposableToken])
            throw BridgeFailure("DataError", "Released file permission remained usable.")
        } catch let failure as BridgeFailure where failure.name == "NotAllowedError" {
            // Expected.
        }

        let revokeBroker = NativeFileBroker(fileManager: manager)
        let revokeDescriptor = try revokeBroker.registerFile(destination, mode: .readOnly)
        let revokeToken = revokeDescriptor["token"] as! String
        revokeBroker.abortAll()
        do {
            _ = try revokeBroker.fileInfo(["token": revokeToken])
            throw BridgeFailure("DataError", "abortAll left a stale file capability usable.")
        } catch let failure as BridgeFailure where failure.name == "NotAllowedError" {
            // Expected.
        }

        print("Drift native file broker self-test passed: staged replacement, exclusive sequence commits, collision preservation, abort cleanup, capability revocation, traversal rejection, and readback hold.")
    }
}
