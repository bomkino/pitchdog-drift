import Darwin
import Foundation

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

private final class FileGrant {
    let token: String
    let url: URL
    let mimeType: String
    let mode: GrantMode
    let scope: SecurityScope
    let createdAt = Date()

    init(token: String, url: URL, mimeType: String, mode: GrantMode) {
        self.token = token
        self.url = url
        self.mimeType = mimeType
        self.mode = mode
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
    var handle: FileHandle?

    init(
        token: String,
        fileToken: String,
        stagingURL: URL,
        destinationURL: URL,
        replacementDirectory: URL,
        handle: FileHandle
    ) {
        self.token = token
        self.fileToken = fileToken
        self.stagingURL = stagingURL
        self.destinationURL = destinationURL
        self.replacementDirectory = replacementDirectory
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
        let url = try ensureLocalFileURL(rawURL)
        try rejectSymlink(url, allowMissing: mode == .readWrite)
        try rejectDirectory(url, allowMissing: mode == .readWrite)
        trimGrantsIfNeeded()

        let token = UUID().uuidString
        let grant = FileGrant(
            token: token,
            url: url,
            mimeType: suppliedMimeType ?? mimeType(for: url),
            mode: mode
        )
        fileGrants[token] = grant
        return try descriptor(for: grant)
    }

    func registerDirectory(_ rawURL: URL) throws -> JSONDictionary {
        let url = try ensureLocalFileURL(rawURL)
        var isDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: url.path, isDirectory: &isDirectory), isDirectory.boolValue else {
            throw BridgeFailure("NotFoundError", "The selected export folder no longer exists.")
        }
        try rejectSymlink(url, allowMissing: false)
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
        try rejectSymlink(parent, allowMissing: false)

        let replacementDirectory = try fileManager.url(
            for: .itemReplacementDirectory,
            in: .userDomainMask,
            appropriateFor: destinationURL,
            create: true
        )
        let stagingURL = replacementDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: false)
            .appendingPathExtension(destinationURL.pathExtension)
        let keepExistingData = (payload["keepExistingData"] as? Bool) == true

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
                handle: handle
            )
            return ["session": sessionToken, "size": Int(try fileSize(at: stagingURL, fileManager: fileManager))]
        } catch {
            try? fileManager.removeItem(at: stagingURL)
            try? fileManager.removeItem(at: replacementDirectory)
            throw error
        }
    }

    func writeChunk(_ payload: JSONDictionary) throws -> JSONDictionary {
        let session = try requiredSession(payload)
        let position = try requiredOffset(payload, "position")
        let encoded = try requiredString(payload, "data")
        guard let data = Data(base64Encoded: encoded) else {
            throw BridgeFailure("DataError", "The renderer sent an invalid binary chunk.")
        }
        guard data.count <= driftMaximumWriteChunkBytes else {
            throw BridgeFailure("QuotaExceededError", "Native write chunks are limited to 512 KiB.")
        }
        let end = position.addingReportingOverflow(UInt64(data.count))
        guard !end.overflow, end.partialValue <= driftMaximumNativeOutputBytes else {
            throw BridgeFailure("QuotaExceededError", "A native export may not exceed 1 GiB.")
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
            throw BridgeFailure("QuotaExceededError", "A native export may not exceed 1 GiB.")
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
                throw BridgeFailure("QuotaExceededError", "The completed native export exceeded 1 GiB.")
            }
            try rejectSymlink(session.destinationURL, allowMissing: true)
            try rejectDirectory(session.destinationURL, allowMissing: true)

            let renameResult = session.stagingURL.path.withCString { sourcePath in
                session.destinationURL.path.withCString { destinationPath in
                    Darwin.rename(sourcePath, destinationPath)
                }
            }
            guard renameResult == 0 else {
                let code = errno
                throw BridgeFailure(
                    code == EACCES || code == EPERM ? "NotAllowedError" : "InvalidModificationError",
                    "The staged export could not replace its destination: \(String(cString: strerror(code)))."
                )
            }

            writeSessions.removeValue(forKey: sessionToken)
            try? fileManager.removeItem(at: session.replacementDirectory)
            didCommitFile?(session.destinationURL)
            return [
                "name": session.destinationURL.lastPathComponent,
                "size": Int(try fileSize(at: session.destinationURL, fileManager: fileManager)),
            ]
        } catch {
            session.handle = nil
            writeSessions.removeValue(forKey: sessionToken)
            try? fileManager.removeItem(at: session.stagingURL)
            try? fileManager.removeItem(at: session.replacementDirectory)
            throw error
        }
    }

    func abortWriteSession(_ payload: JSONDictionary) throws -> JSONDictionary {
        let sessionToken = try requiredString(payload, "session")
        guard let session = writeSessions.removeValue(forKey: sessionToken) else {
            return ["aborted": true]
        }
        try? session.handle?.close()
        session.handle = nil
        if fileManager.fileExists(atPath: session.stagingURL.path) {
            try fileManager.removeItem(at: session.stagingURL)
        }
        try? fileManager.removeItem(at: session.replacementDirectory)
        return ["aborted": true]
    }

    func fileInfo(_ payload: JSONDictionary) throws -> JSONDictionary {
        let token = try requiredString(payload, "token")
        guard let grant = fileGrants[token] else {
            throw BridgeFailure("NotAllowedError", "That file permission is no longer valid.")
        }
        try rejectSymlink(grant.url, allowMissing: false)
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

        let handle = try FileHandle(forReadingFrom: grant.url)
        defer { try? handle.close() }
        try handle.seek(toOffset: offset)
        let data = try handle.read(upToCount: Int(requestedLength)) ?? Data()
        return ["data": data.base64EncodedString(), "length": data.count]
    }

    func directoryFile(_ payload: JSONDictionary) throws -> JSONDictionary {
        let directoryToken = try requiredString(payload, "token")
        guard let directory = directoryGrants[directoryToken] else {
            throw BridgeFailure("NotAllowedError", "That directory permission is no longer valid.")
        }
        let name = try validatedChildName(requiredString(payload, "name"))
        let create = (payload["create"] as? Bool) == true
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
        if !exists && !create {
            throw BridgeFailure("NotFoundError", "The requested file does not exist.")
        }

        return try registerFile(fileURL, mode: .readWrite)
    }

    func removeDirectoryEntry(_ payload: JSONDictionary) throws -> JSONDictionary {
        let directoryToken = try requiredString(payload, "token")
        guard let directory = directoryGrants[directoryToken] else {
            throw BridgeFailure("NotAllowedError", "That directory permission is no longer valid.")
        }
        let name = try validatedChildName(requiredString(payload, "name"))
        let fileURL = directory.url.appendingPathComponent(name, isDirectory: false).standardizedFileURL
        guard fileURL.deletingLastPathComponent() == directory.url.standardizedFileURL else {
            throw BridgeFailure("SecurityError", "Directory traversal is not permitted.")
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
        for session in sessions {
            try? session.handle?.close()
            session.handle = nil
            try? fileManager.removeItem(at: session.stagingURL)
            try? fileManager.removeItem(at: session.replacementDirectory)
        }
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

    private func trimGrantsIfNeeded() {
        let protectedTokens = Set(writeSessions.values.map(\.fileToken))
        while fileGrants.count + directoryGrants.count >= driftMaximumGrantCount {
            let oldestFile = fileGrants.values
                .filter { !protectedTokens.contains($0.token) }
                .min(by: { $0.createdAt < $1.createdAt })
            let oldestDirectory = directoryGrants.values.min(by: { $0.createdAt < $1.createdAt })

            if let file = oldestFile,
               oldestDirectory == nil || file.createdAt <= oldestDirectory!.createdAt {
                fileGrants.removeValue(forKey: file.token)
            } else if let directory = oldestDirectory {
                directoryGrants.removeValue(forKey: directory.token)
            } else {
                return
            }
        }
    }

    static func runSelfTest() throws {
        let manager = FileManager.default
        let root = manager.temporaryDirectory.appendingPathComponent("drift-native-self-test-\(UUID().uuidString)", isDirectory: true)
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

        let directoryDescriptor = try broker.registerDirectory(root)
        let directoryToken = directoryDescriptor["token"] as! String
        let frameDescriptor = try broker.directoryFile([
            "token": directoryToken,
            "name": "drift_000001.png",
            "create": true,
        ])
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
        _ = try broker.removeDirectoryEntry(["token": directoryToken, "name": "drift_000001.png"])

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

        print("Drift native file broker self-test passed.")
    }
}
