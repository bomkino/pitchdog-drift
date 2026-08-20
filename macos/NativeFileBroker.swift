import Foundation
import UniformTypeIdentifiers

private final class FileGrant {
    let url: URL
    let mimeType: String
    let mode: GrantMode
    private let securityScopeStarted: Bool

    init(url: URL, mimeType: String, mode: GrantMode) {
        self.url = url
        self.mimeType = mimeType
        self.mode = mode
        self.securityScopeStarted = url.startAccessingSecurityScopedResource()
    }

    deinit {
        if securityScopeStarted {
            url.stopAccessingSecurityScopedResource()
        }
    }
}

private final class DirectoryGrant {
    let url: URL
    private let securityScopeStarted: Bool

    init(url: URL) {
        self.url = url
        self.securityScopeStarted = url.startAccessingSecurityScopedResource()
    }

    deinit {
        if securityScopeStarted {
            url.stopAccessingSecurityScopedResource()
        }
    }
}

private final class WriteSession {
    let fileToken: String
    let replacementDirectory: URL
    let stagingURL: URL
    let destinationURL: URL
    var handle: FileHandle?

    init(
        fileToken: String,
        replacementDirectory: URL,
        stagingURL: URL,
        destinationURL: URL,
        handle: FileHandle
    ) {
        self.fileToken = fileToken
        self.replacementDirectory = replacementDirectory
        self.stagingURL = stagingURL
        self.destinationURL = destinationURL
        self.handle = handle
    }

    func closeHandle() throws {
        guard let handle else { return }
        try handle.synchronize()
        try handle.close()
        self.handle = nil
    }

    func abandonHandle() {
        guard let handle else { return }
        try? handle.close()
        self.handle = nil
    }
}

final class NativeFileBroker {
    private let fileManager = FileManager.default
    private var fileGrants: [String: FileGrant] = [:]
    private var directoryGrants: [String: DirectoryGrant] = [:]
    private var writeSessions: [String: WriteSession] = [:]

    func handle(command: String, payload: JSONDictionary) throws -> Any {
        switch command {
        case "pick-save":
            return try pickSave(payload)
        case "pick-directory":
            return try pickDirectory()
        case "pick-open-files":
            return try pickOpenFiles(payload)
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

    func abortActiveWrites() {
        for (_, session) in writeSessions {
            session.abandonHandle()
            try? fileManager.removeItem(at: session.replacementDirectory)
        }
        writeSessions.removeAll()
    }

    func invalidateAll() {
        abortActiveWrites()
        fileGrants.removeAll()
        directoryGrants.removeAll()
    }

    func grantReadableFileDescriptor(_ url: URL) throws -> JSONDictionary {
        let token = try registerFile(url, mode: .readOnly)
        return try descriptor(for: token)
    }

    func grantFileForTesting(_ url: URL, writable: Bool) throws -> String {
        try registerFile(url, mode: writable ? .readWrite : .readOnly)
    }

    func grantDirectoryForTesting(_ url: URL) throws -> String {
        try registerDirectory(url)
    }

    private func pickSave(_ payload: JSONDictionary) throws -> JSONDictionary {
        let panel = NSSavePanel()
        panel.canCreateDirectories = true
        panel.isExtensionHidden = false
        panel.nameFieldStringValue = safeLeafName(payload["suggestedName"] as? String, fallback: "Drift Export")
        panel.prompt = "Save"

        let extensions = payload["extensions"] as? [String] ?? []
        let contentTypes = extensions.prefix(16).compactMap { UTType(filenameExtension: $0) }
        if !contentTypes.isEmpty {
            panel.allowedContentTypes = contentTypes
        }

        guard panel.runModal() == .OK, let destinationURL = panel.url else {
            return ["cancelled": true]
        }
        let token = try registerFile(destinationURL, mode: .readWrite)
        let grant = try requiredFileGrant(token)
        return [
            "cancelled": false,
            "token": token,
            "name": grant.url.lastPathComponent,
            "mimeType": grant.mimeType,
        ]
    }

    private func pickDirectory() throws -> JSONDictionary {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = true
        panel.prompt = "Choose"
        panel.resolvesAliases = true

        guard panel.runModal() == .OK, let directoryURL = panel.url else {
            return ["cancelled": true]
        }
        let token = try registerDirectory(directoryURL)
        return [
            "cancelled": false,
            "token": token,
            "name": directoryURL.lastPathComponent,
        ]
    }

    private func pickOpenFiles(_ payload: JSONDictionary) throws -> JSONDictionary {
        let kind = try requiredString(payload, "kind")
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.canCreateDirectories = false
        panel.resolvesAliases = true
        panel.treatsFilePackagesAsDirectories = false

        switch kind {
        case "images":
            panel.allowedContentTypes = [.image]
            panel.allowsMultipleSelection = true
            panel.prompt = "Add Slides"
        case "presenter":
            panel.allowedContentTypes = [.movie]
            panel.allowsMultipleSelection = false
            panel.prompt = "Add Presenter"
        case "project":
            let pitched = UTType(importedAs: "dog.pitch.pitched-project", conformingTo: .zip)
            panel.allowedContentTypes = [pitched, .zip]
            panel.allowsMultipleSelection = false
            panel.prompt = "Open Project"
        default:
            throw BridgeFailure(name: "TypeError", message: "Unknown native import kind: \(kind)")
        }

        guard panel.runModal() == .OK else {
            return ["cancelled": true, "files": []]
        }
        let perFileLimit: UInt64 = kind == "project" ? 96 * 1024 * 1024 : 64 * 1024 * 1024
        let totalLimit: UInt64 = kind == "images" ? 80 * 1024 * 1024 : perFileLimit
        var totalBytes: UInt64 = 0
        let files = try panel.urls.map { url -> JSONDictionary in
            let size = try fileSize(at: url)
            guard size <= perFileLimit else {
                throw BridgeFailure(
                    name: "QuotaExceededError",
                    message: "\(url.lastPathComponent) exceeds Drift’s native import limit of \(perFileLimit / 1024 / 1024) MiB."
                )
            }
            totalBytes += size
            guard totalBytes <= totalLimit else {
                throw BridgeFailure(
                    name: "QuotaExceededError",
                    message: "The selected files exceed Drift’s \(totalLimit / 1024 / 1024) MiB project-media limit."
                )
            }
            let token = try registerFile(url, mode: .readOnly)
            return try descriptor(for: token)
        }
        return ["cancelled": false, "files": files]
    }

    private func openWriteSession(_ payload: JSONDictionary) throws -> JSONDictionary {
        guard writeSessions.count < maximumWriteSessions else {
            throw BridgeFailure(name: "QuotaExceededError", message: "Too many native file writes are open at once.")
        }
        let fileToken = try requiredString(payload, "token")
        let grant = try requiredFileGrant(fileToken)
        guard grant.mode == .readWrite else {
            throw BridgeFailure(name: "NotAllowedError", message: "That file permission is read-only.")
        }
        if writeSessions.values.contains(where: { $0.fileToken == fileToken }) {
            throw BridgeFailure(name: "InvalidStateError", message: "A writable stream is already open for that file.")
        }

        let keepExistingData = payload["keepExistingData"] as? Bool == true
        let destinationURL = grant.url
        try assertSafeDestination(destinationURL)
        let replacementDirectory = try fileManager.url(
            for: .itemReplacementDirectory,
            in: .userDomainMask,
            appropriateFor: destinationURL.deletingLastPathComponent(),
            create: true
        )
        let stagingURL = replacementDirectory.appendingPathComponent(
            "\(UUID().uuidString)-\(safeLeafName(destinationURL.lastPathComponent, fallback: "Drift Export"))",
            isDirectory: false
        )

        do {
            if keepExistingData && fileManager.fileExists(atPath: destinationURL.path) {
                try fileManager.copyItem(at: destinationURL, to: stagingURL)
            } else if !fileManager.createFile(atPath: stagingURL.path, contents: Data()) {
                throw BridgeFailure(name: "NotAllowedError", message: "macOS did not allow Drift to create its staging file.")
            }
            let handle = try FileHandle(forUpdating: stagingURL)
            let sessionToken = UUID().uuidString
            writeSessions[sessionToken] = WriteSession(
                fileToken: fileToken,
                replacementDirectory: replacementDirectory,
                stagingURL: stagingURL,
                destinationURL: destinationURL,
                handle: handle
            )
            return [
                "session": sessionToken,
                "size": try integerFileSize(at: stagingURL),
            ]
        } catch {
            try? fileManager.removeItem(at: replacementDirectory)
            throw error
        }
    }

    private func writeChunk(_ payload: JSONDictionary) throws -> JSONDictionary {
        let session = try requiredWriteSession(payload)
        let position = try requiredOffset(payload, "position")
        let encoded = try requiredString(payload, "data")
        guard let data = Data(base64Encoded: encoded) else {
            throw BridgeFailure(name: "DataError", message: "The renderer sent an invalid binary chunk.")
        }
        guard data.count <= maximumWriteChunkBytes else {
            throw BridgeFailure(name: "QuotaExceededError", message: "Native write chunks are limited to 512 KiB.")
        }
        guard position <= maximumNativeFileBytes,
              UInt64(data.count) <= maximumNativeFileBytes - position else {
            throw BridgeFailure(name: "QuotaExceededError", message: "A native output file may not exceed 1 GiB.")
        }
        guard let handle = session.handle else {
            throw BridgeFailure(name: "InvalidStateError", message: "The writable stream is already closed.")
        }
        try handle.seek(toOffset: position)
        try handle.write(contentsOf: data)
        return ["bytesWritten": data.count]
    }

    private func truncateWriteSession(_ payload: JSONDictionary) throws -> JSONDictionary {
        let session = try requiredWriteSession(payload)
        let size = try requiredOffset(payload, "size")
        guard size <= maximumNativeFileBytes else {
            throw BridgeFailure(name: "QuotaExceededError", message: "A native output file may not exceed 1 GiB.")
        }
        guard let handle = session.handle else {
            throw BridgeFailure(name: "InvalidStateError", message: "The writable stream is already closed.")
        }
        try handle.truncate(atOffset: size)
        return ["size": Int(size)]
    }

    private func closeWriteSession(_ payload: JSONDictionary) throws -> JSONDictionary {
        let sessionToken = try requiredString(payload, "session")
        guard let session = writeSessions[sessionToken] else {
            throw BridgeFailure(name: "InvalidStateError", message: "The writable stream is no longer open.")
        }

        try session.closeHandle()
        guard try fileSize(at: session.stagingURL) <= maximumNativeFileBytes else {
            throw BridgeFailure(name: "QuotaExceededError", message: "The completed native output exceeds 1 GiB.")
        }
        try assertSafeDestination(session.destinationURL)

        if fileManager.fileExists(atPath: session.destinationURL.path) {
            _ = try fileManager.replaceItemAt(
                session.destinationURL,
                withItemAt: session.stagingURL,
                backupItemName: nil,
                options: []
            )
        } else {
            try fileManager.moveItem(at: session.stagingURL, to: session.destinationURL)
        }

        writeSessions.removeValue(forKey: sessionToken)
        try? fileManager.removeItem(at: session.replacementDirectory)
        return [
            "name": session.destinationURL.lastPathComponent,
            "size": try integerFileSize(at: session.destinationURL),
        ]
    }

    private func abortWriteSession(_ payload: JSONDictionary) throws -> JSONDictionary {
        let sessionToken = try requiredString(payload, "session")
        guard let session = writeSessions.removeValue(forKey: sessionToken) else {
            return ["aborted": true]
        }
        session.abandonHandle()
        if fileManager.fileExists(atPath: session.replacementDirectory.path) {
            try fileManager.removeItem(at: session.replacementDirectory)
        }
        return ["aborted": true]
    }

    private func fileInfo(_ payload: JSONDictionary) throws -> JSONDictionary {
        let token = try requiredString(payload, "token")
        let grant = try requiredFileGrant(token)
        try assertRegularReadableFile(grant.url)
        let attributes = try fileManager.attributesOfItem(atPath: grant.url.path)
        let modified = (attributes[.modificationDate] as? Date)?.timeIntervalSince1970 ?? Date().timeIntervalSince1970
        return [
            "name": grant.url.lastPathComponent,
            "size": try integerFileSize(at: grant.url),
            "mimeType": grant.mimeType,
            "lastModified": Int64(modified * 1000),
        ]
    }

    private func readFile(_ payload: JSONDictionary) throws -> JSONDictionary {
        let token = try requiredString(payload, "token")
        let grant = try requiredFileGrant(token)
        try assertRegularReadableFile(grant.url)
        let offset = try requiredOffset(payload, "offset")
        let requestedLength = try requiredOffset(payload, "length")
        guard requestedLength <= maximumReadChunkBytes else {
            throw BridgeFailure(name: "QuotaExceededError", message: "Native read chunks are limited to 1 MiB.")
        }
        let totalSize = try fileSize(at: grant.url)
        guard offset <= totalSize else {
            throw BridgeFailure(name: "DataError", message: "Native read offset is beyond the end of the file.")
        }
        let safeLength = min(requestedLength, totalSize - offset)

        let handle = try FileHandle(forReadingFrom: grant.url)
        defer { try? handle.close() }
        try handle.seek(toOffset: offset)
        let data = try handle.read(upToCount: Int(safeLength)) ?? Data()
        return ["data": data.base64EncodedString(), "length": data.count]
    }

    private func directoryFile(_ payload: JSONDictionary) throws -> JSONDictionary {
        let directoryToken = try requiredString(payload, "token")
        let directory = try requiredDirectoryGrant(directoryToken)
        let name = try validatedChildName(requiredString(payload, "name"))
        let create = payload["create"] as? Bool == true
        let fileURL = try safeChildURL(directory: directory.url, name: name)

        var isDirectory: ObjCBool = false
        let exists = fileManager.fileExists(atPath: fileURL.path, isDirectory: &isDirectory)
        if exists {
            try rejectSymbolicLink(fileURL)
            if isDirectory.boolValue {
                throw BridgeFailure(name: "TypeMismatchError", message: "The selected name belongs to a directory, not a file.")
            }
        } else if !create {
            throw BridgeFailure(name: "NotFoundError", message: "The requested file does not exist.")
        } else if !fileManager.createFile(atPath: fileURL.path, contents: Data()) {
            throw BridgeFailure(name: "NotAllowedError", message: "macOS did not allow Drift to create \(name).")
        }

        let fileToken = try registerFile(fileURL, mode: .readWrite)
        let grant = try requiredFileGrant(fileToken)
        return ["token": fileToken, "name": name, "mimeType": grant.mimeType]
    }

    private func removeDirectoryEntry(_ payload: JSONDictionary) throws -> JSONDictionary {
        let directoryToken = try requiredString(payload, "token")
        let directory = try requiredDirectoryGrant(directoryToken)
        let name = try validatedChildName(requiredString(payload, "name"))
        let fileURL = try safeChildURL(directory: directory.url, name: name)
        guard fileManager.fileExists(atPath: fileURL.path) else {
            throw BridgeFailure(name: "NotFoundError", message: "The requested file does not exist.")
        }
        try rejectSymbolicLink(fileURL)
        var isDirectory: ObjCBool = false
        _ = fileManager.fileExists(atPath: fileURL.path, isDirectory: &isDirectory)
        guard !isDirectory.boolValue else {
            throw BridgeFailure(name: "TypeMismatchError", message: "Recursive directory deletion is not exposed to the renderer.")
        }
        try fileManager.removeItem(at: fileURL)
        fileGrants = fileGrants.filter { $0.value.url != fileURL }
        return ["removed": true]
    }

    private func registerFile(_ rawURL: URL, mode: GrantMode) throws -> String {
        guard rawURL.isFileURL else {
            throw BridgeFailure(name: "SecurityError", message: "Drift accepts only local files selected through macOS.")
        }
        let url = rawURL.standardizedFileURL
        if fileManager.fileExists(atPath: url.path) {
            try assertRegularReadableFile(url)
        } else {
            let parent = url.deletingLastPathComponent()
            var parentDirectory: ObjCBool = false
            guard fileManager.fileExists(atPath: parent.path, isDirectory: &parentDirectory), parentDirectory.boolValue else {
                throw BridgeFailure(name: "NotFoundError", message: "The selected destination folder does not exist.")
            }
            try rejectSymbolicLink(parent)
        }

        while fileGrants.count >= maximumFileGrants, let oldest = fileGrants.keys.first {
            fileGrants.removeValue(forKey: oldest)
        }
        let token = UUID().uuidString
        fileGrants[token] = FileGrant(url: url, mimeType: mimeType(for: url), mode: mode)
        return token
    }

    private func registerDirectory(_ rawURL: URL) throws -> String {
        guard rawURL.isFileURL else {
            throw BridgeFailure(name: "SecurityError", message: "Drift accepts only local folders selected through macOS.")
        }
        let url = rawURL.standardizedFileURL
        var isDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: url.path, isDirectory: &isDirectory), isDirectory.boolValue else {
            throw BridgeFailure(name: "NotFoundError", message: "The selected export folder does not exist.")
        }
        try rejectSymbolicLink(url)

        while directoryGrants.count >= maximumDirectoryGrants, let oldest = directoryGrants.keys.first {
            directoryGrants.removeValue(forKey: oldest)
        }
        let token = UUID().uuidString
        directoryGrants[token] = DirectoryGrant(url: url)
        return token
    }

    private func descriptor(for token: String) throws -> JSONDictionary {
        let grant = try requiredFileGrant(token)
        let attributes = try fileManager.attributesOfItem(atPath: grant.url.path)
        let modified = (attributes[.modificationDate] as? Date)?.timeIntervalSince1970 ?? Date().timeIntervalSince1970
        let size = try fileSize(at: grant.url)
        guard size <= maximumNativeFileBytes else {
            throw BridgeFailure(name: "QuotaExceededError", message: "\(grant.url.lastPathComponent) exceeds Drift’s 1 GiB native safety limit.")
        }
        return [
            "token": token,
            "name": grant.url.lastPathComponent,
            "mimeType": grant.mimeType,
            "size": Int(size),
            "lastModified": Int64(modified * 1000),
        ]
    }

    private func requiredFileGrant(_ token: String) throws -> FileGrant {
        guard let grant = fileGrants[token] else {
            throw BridgeFailure(name: "NotAllowedError", message: "That file permission is no longer valid.")
        }
        return grant
    }

    private func requiredDirectoryGrant(_ token: String) throws -> DirectoryGrant {
        guard let grant = directoryGrants[token] else {
            throw BridgeFailure(name: "NotAllowedError", message: "That directory permission is no longer valid.")
        }
        return grant
    }

    private func requiredWriteSession(_ payload: JSONDictionary) throws -> WriteSession {
        let token = try requiredString(payload, "session")
        guard let session = writeSessions[token] else {
            throw BridgeFailure(name: "InvalidStateError", message: "The writable stream is no longer open.")
        }
        return session
    }

    private func requiredString(_ payload: JSONDictionary, _ key: String) throws -> String {
        guard let value = payload[key] as? String, !value.isEmpty, value.utf8.count <= 4096 else {
            throw BridgeFailure(name: "TypeError", message: "Native command field ‘\(key)’ must be a bounded, non-empty string.")
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

    private func safeChildURL(directory: URL, name: String) throws -> URL {
        let root = directory.standardizedFileURL.resolvingSymlinksInPath()
        let child = directory.appendingPathComponent(name, isDirectory: false).standardizedFileURL
        guard child.deletingLastPathComponent() == directory.standardizedFileURL,
              child.path.hasPrefix(directory.standardizedFileURL.path + "/") else {
            throw BridgeFailure(name: "SecurityError", message: "Directory traversal is not permitted.")
        }
        if fileManager.fileExists(atPath: child.path) {
            let resolved = child.resolvingSymlinksInPath()
            guard resolved.deletingLastPathComponent() == root else {
                throw BridgeFailure(name: "SecurityError", message: "Symbolic links may not escape the selected export folder.")
            }
        }
        return child
    }

    private func assertSafeDestination(_ url: URL) throws {
        if fileManager.fileExists(atPath: url.path) {
            try rejectSymbolicLink(url)
            var isDirectory: ObjCBool = false
            _ = fileManager.fileExists(atPath: url.path, isDirectory: &isDirectory)
            if isDirectory.boolValue {
                throw BridgeFailure(name: "TypeMismatchError", message: "The selected destination is a directory, not a file.")
            }
        }
    }

    private func assertRegularReadableFile(_ url: URL) throws {
        var isDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: url.path, isDirectory: &isDirectory) else {
            throw BridgeFailure(name: "NotFoundError", message: "The selected file no longer exists.")
        }
        try rejectSymbolicLink(url)
        guard !isDirectory.boolValue else {
            throw BridgeFailure(name: "TypeMismatchError", message: "The selected item is a directory, not a file.")
        }
    }

    private func rejectSymbolicLink(_ url: URL) throws {
        let values = try url.resourceValues(forKeys: [.isSymbolicLinkKey])
        if values.isSymbolicLink == true {
            throw BridgeFailure(name: "SecurityError", message: "Symbolic-link destinations are not permitted.")
        }
    }

    private func fileSize(at url: URL) throws -> UInt64 {
        let attributes = try fileManager.attributesOfItem(atPath: url.path)
        return (attributes[.size] as? NSNumber)?.uint64Value ?? 0
    }

    private func integerFileSize(at url: URL) throws -> Int {
        let size = try fileSize(at: url)
        guard size <= UInt64(Int.max) else {
            throw BridgeFailure(name: "QuotaExceededError", message: "The selected file is too large to represent safely.")
        }
        return Int(size)
    }

    private func mimeType(for url: URL) -> String {
        if url.pathExtension.lowercased() == "pitched" {
            return "application/vnd.pitchdog.pitched+zip"
        }
        return UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
    }
}
