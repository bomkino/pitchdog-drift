import Darwin
import Foundation

private let driftRenameExclusiveFlag: UInt32 = 0x00000004 // RENAME_EXCL
private let driftRenameSwapFlag: UInt32 = 0x00000002 // RENAME_SWAP

private struct FileIdentity: Equatable {
    let device: UInt64
    let inode: UInt64
    let size: UInt64
    let modificationSeconds: Int64
    let modificationNanoseconds: Int64
    let changeSeconds: Int64
    let changeNanoseconds: Int64

    func matchesAfterRename(_ other: FileIdentity) -> Bool {
        device == other.device
            && inode == other.inode
            && size == other.size
            && modificationSeconds == other.modificationSeconds
            && modificationNanoseconds == other.modificationNanoseconds
    }
}

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

private final class StableReadAccess {
    let handle: FileHandle
    let maximumBytes: UInt64
    var admittedIdentity: FileIdentity

    init(handle: FileHandle, maximumBytes: UInt64, admittedIdentity: FileIdentity) {
        self.handle = handle
        self.maximumBytes = maximumBytes
        self.admittedIdentity = admittedIdentity
    }

    deinit {
        try? handle.close()
    }
}

private struct DirectoryIdentity: Equatable {
    let device: UInt64
    let inode: UInt64
}

private final class StableDirectoryAccess {
    let handle: FileHandle
    let admittedIdentity: DirectoryIdentity

    init(handle: FileHandle, admittedIdentity: DirectoryIdentity) {
        self.handle = handle
        self.admittedIdentity = admittedIdentity
    }

    deinit {
        try? handle.close()
    }
}

private final class FileGrant {
    let token: String
    let url: URL
    let mimeType: String
    let mode: GrantMode
    let writeDisposition: WriteDisposition
    let directoryToken: String?
    let releaseAfterFullRead: Bool
    let scope: SecurityScope
    let maximumReadBytes: UInt64
    var stableReadAccess: StableReadAccess?
    let writeParentAccess: StableDirectoryAccess?
    let createdAt = Date()

    init(
        token: String,
        url: URL,
        mimeType: String,
        mode: GrantMode,
        writeDisposition: WriteDisposition,
        directoryToken: String?,
        releaseAfterFullRead: Bool,
        scope: SecurityScope,
        maximumReadBytes: UInt64,
        stableReadAccess: StableReadAccess?,
        writeParentAccess: StableDirectoryAccess?
    ) {
        self.token = token
        self.url = url
        self.mimeType = mimeType
        self.mode = mode
        self.writeDisposition = writeDisposition
        self.directoryToken = directoryToken
        self.releaseAfterFullRead = releaseAfterFullRead
        self.scope = scope
        self.maximumReadBytes = maximumReadBytes
        self.stableReadAccess = stableReadAccess
        self.writeParentAccess = writeParentAccess
    }
}

private final class DirectoryGrant {
    let token: String
    let url: URL
    let scope: SecurityScope
    let stableAccess: StableDirectoryAccess
    let createdAt = Date()
    var committedEntries: [String: FileIdentity] = [:]

    init(token: String, url: URL, scope: SecurityScope, stableAccess: StableDirectoryAccess) {
        self.token = token
        self.url = url
        self.scope = scope
        self.stableAccess = stableAccess
    }
}

private final class WriteSession {
    let token: String
    let fileToken: String
    let stagingURL: URL
    let destinationURL: URL
    let replacementDirectory: URL
    let writeDisposition: WriteDisposition
    let directoryToken: String?
    let parentAccess: StableDirectoryAccess
    let expectedDestinationIdentity: FileIdentity?
    var handle: FileHandle?

    init(
        token: String,
        fileToken: String,
        stagingURL: URL,
        destinationURL: URL,
        replacementDirectory: URL,
        writeDisposition: WriteDisposition,
        directoryToken: String?,
        parentAccess: StableDirectoryAccess,
        expectedDestinationIdentity: FileIdentity?,
        handle: FileHandle
    ) {
        self.token = token
        self.fileToken = fileToken
        self.stagingURL = stagingURL
        self.destinationURL = destinationURL
        self.replacementDirectory = replacementDirectory
        self.writeDisposition = writeDisposition
        self.directoryToken = directoryToken
        self.parentAccess = parentAccess
        self.expectedDestinationIdentity = expectedDestinationIdentity
        self.handle = handle
    }
}

final class NativeFileBroker {
    private let fileManager: FileManager
    private let maximumGrantCount: Int
    private let beforeOwnedEntryQuarantineForTesting: ((URL) throws -> Void)?
    private let beforeReplaceCommitForTesting: ((URL) throws -> Void)?
    private var fileGrants: [String: FileGrant] = [:]
    private var directoryGrants: [String: DirectoryGrant] = [:]
    private var writeSessions: [String: WriteSession] = [:]

    var didCommitFile: ((URL) -> Void)?

    init(
        fileManager: FileManager = .default,
        maximumGrantCount: Int = driftMaximumGrantCount,
        beforeOwnedEntryQuarantineForTesting: ((URL) throws -> Void)? = nil,
        beforeReplaceCommitForTesting: ((URL) throws -> Void)? = nil
    ) {
        precondition(maximumGrantCount > 0, "Native grant limit must be positive.")
        self.fileManager = fileManager
        self.maximumGrantCount = maximumGrantCount
        self.beforeOwnedEntryQuarantineForTesting = beforeOwnedEntryQuarantineForTesting
        self.beforeReplaceCommitForTesting = beforeReplaceCommitForTesting
    }

    deinit {
        abortAll()
    }

    func registerFile(
        _ rawURL: URL,
        mode: GrantMode,
        suppliedMimeType: String? = nil,
        maximumReadBytes: UInt64 = driftMaximumProjectArchiveBytes
    ) throws -> JSONDictionary {
        try registerFile(
            rawURL,
            mode: mode,
            suppliedMimeType: suppliedMimeType,
            writeDisposition: .replaceOrCreate,
            directoryToken: nil,
            releaseAfterFullRead: false,
            maximumReadBytes: maximumReadBytes
        )
    }

    private func registerFile(
        _ rawURL: URL,
        mode: GrantMode,
        suppliedMimeType: String? = nil,
        writeDisposition: WriteDisposition,
        directoryToken: String?,
        releaseAfterFullRead: Bool,
        maximumReadBytes: UInt64
    ) throws -> JSONDictionary {
        let url = try ensureLocalFileURL(rawURL)
        let scope = SecurityScope(url: url)
        let anchoredDirectory: DirectoryGrant?
        if let directoryToken {
            guard let directory = directoryGrants[directoryToken],
                  url.deletingLastPathComponent().standardizedFileURL == directory.url.standardizedFileURL else {
                throw BridgeFailure("NotAllowedError", "The selected directory authority is no longer valid.")
            }
            try requireStableDirectoryAccess(directory.stableAccess, at: directory.url)
            anchoredDirectory = directory
        } else {
            anchoredDirectory = nil
        }
        let exists = fileManager.fileExists(atPath: url.path)
        try rejectSymlink(url, allowMissing: mode == .readWrite)
        try rejectDirectory(url, allowMissing: mode == .readWrite)
        if !exists {
            guard mode == .readWrite else {
                throw BridgeFailure("NotFoundError", "The selected file no longer exists.")
            }
            try requireDirectory(url.deletingLastPathComponent())
        }
        let admittedMaximum = mode == .readWrite
            ? driftMaximumNativeOutputBytes
            : maximumReadBytes
        guard admittedMaximum > 0,
              Double(admittedMaximum) <= driftJavaScriptSafeInteger else {
            throw BridgeFailure("QuotaExceededError", "The native read limit is invalid or unsafe for JavaScript.")
        }
        let stableReadAccess = exists
            ? try openStableReadAccess(at: url, maximumBytes: admittedMaximum)
            : nil
        if let anchoredDirectory {
            try requireStableDirectoryAccess(anchoredDirectory.stableAccess, at: anchoredDirectory.url)
        }
        let writeParentAccess: StableDirectoryAccess?
        if mode == .readWrite {
            if let anchoredDirectory {
                writeParentAccess = anchoredDirectory.stableAccess
            } else {
                writeParentAccess = try openStableDirectoryAccess(at: url.deletingLastPathComponent())
            }
        } else {
            writeParentAccess = nil
        }
        // A child file capability is only meaningful while its admitted
        // directory authority survives. Protect that parent during admission;
        // a table too small to hold both capabilities must reject atomically.
        try admitGrant(protectingDirectoryToken: directoryToken)

        let token = UUID().uuidString
        let grant = FileGrant(
            token: token,
            url: url,
            mimeType: suppliedMimeType ?? mimeType(for: url),
            mode: mode,
            writeDisposition: writeDisposition,
            directoryToken: directoryToken,
            releaseAfterFullRead: releaseAfterFullRead,
            scope: scope,
            maximumReadBytes: admittedMaximum,
            stableReadAccess: stableReadAccess,
            writeParentAccess: writeParentAccess
        )
        fileGrants[token] = grant
        return try descriptor(for: grant)
    }

    func registerDirectory(_ rawURL: URL) throws -> JSONDictionary {
        let url = try ensureLocalFileURL(rawURL)
        let scope = SecurityScope(url: url)
        try requireDirectory(url)
        let stableAccess = try openStableDirectoryAccess(at: url)
        try admitGrant()

        let token = UUID().uuidString
        directoryGrants[token] = DirectoryGrant(
            token: token,
            url: url,
            scope: scope,
            stableAccess: stableAccess
        )
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
        guard !writeSessions.values.contains(where: { $0.directoryToken == token }) else {
            throw BridgeFailure("InvalidStateError", "That directory still has an active frame write.")
        }
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
        guard let parentAccess = grant.writeParentAccess else {
            throw BridgeFailure("InvalidStateError", "The selected export parent authority is unavailable.")
        }
        try rejectSymlink(destinationURL, allowMissing: true)
        try rejectDirectory(destinationURL, allowMissing: true)
        let parent = destinationURL.deletingLastPathComponent().standardizedFileURL
        try requireStableDirectoryAccess(parentAccess, at: parent)
        let expectedDestinationIdentity: FileIdentity?
        if grant.stableReadAccess != nil {
            expectedDestinationIdentity = try verifiedStableReadAccess(for: grant).admittedIdentity
        } else {
            guard !fileManager.fileExists(atPath: destinationURL.path) else {
                fileGrants.removeValue(forKey: grant.token)
                throw BridgeFailure(
                    "InvalidModificationError",
                    "The selected empty save destination appeared before writing began."
                )
            }
            expectedDestinationIdentity = nil
        }

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
                directoryToken: grant.directoryToken,
                parentAccess: parentAccess,
                expectedDestinationIdentity: expectedDestinationIdentity,
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
            // Hold the exact staged inode open before rename. After commit its
            // descriptor becomes the grant's stable read authority; later path
            // replacement or in-place mutation is detected before bytes return.
            let committedReadAccess = try openStableReadAccess(
                at: session.stagingURL,
                maximumBytes: driftMaximumNativeOutputBytes
            )
            let parent = session.destinationURL.deletingLastPathComponent().standardizedFileURL
            try requireStableDirectoryAccess(session.parentAccess, at: parent)
            try rejectSymlink(session.destinationURL, allowMissing: true)
            try rejectDirectory(session.destinationURL, allowMissing: true)
            try commitStagedWrite(session)
            try requireStableDirectoryAccess(session.parentAccess, at: parent)

            committedReadAccess.admittedIdentity = try identity(
                fileDescriptor: committedReadAccess.handle.fileDescriptor
            )
            try requireStablePathIdentity(
                committedReadAccess,
                at: session.destinationURL
            )

            if session.writeDisposition == .createOnly,
               let directoryToken = session.directoryToken {
                let directory = try verifiedDirectoryGrant(directoryToken)
                directory.committedEntries[session.destinationURL.lastPathComponent] = committedReadAccess.admittedIdentity
            }

            // Best-effort directory sync narrows the crash window after the
            // atomic rename. A valid committed file remains usable if a volume
            // refuses directory fsync.
            _ = Darwin.fsync(session.parentAccess.handle.fileDescriptor)

            writeSessions.removeValue(forKey: sessionToken)
            try? fileManager.removeItem(at: session.replacementDirectory)
            fileGrants[session.fileToken]?.stableReadAccess = committedReadAccess
            didCommitFile?(session.destinationURL)
            return [
                "name": session.destinationURL.lastPathComponent,
                "size": Int(committedReadAccess.admittedIdentity.size),
            ]
        } catch {
            if let failure = error as? BridgeFailure,
               ["InvalidModificationError", "TypeMismatchError", "SecurityError", "NotFoundError"]
                .contains(failure.name) {
                fileGrants.removeValue(forKey: session.fileToken)
            }
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
        guard !writeSessions.values.contains(where: { $0.fileToken == token }) else {
            throw BridgeFailure("InvalidStateError", "That file is still being written.")
        }
        let access = try verifiedStableReadAccess(for: grant)
        return readMetadata(for: grant, access: access)
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
        guard !writeSessions.values.contains(where: { $0.fileToken == token }) else {
            throw BridgeFailure("InvalidStateError", "That file is still being written.")
        }
        let access = try verifiedStableReadAccess(for: grant)
        let totalSize = access.admittedIdentity.size
        guard offset <= totalSize else {
            throw BridgeFailure("DataError", "Native read offset is beyond the end of the file.")
        }
        let safeLength = min(requestedLength, totalSize - offset)

        try access.handle.seek(toOffset: offset)
        let data = try access.handle.read(upToCount: Int(safeLength)) ?? Data()
        _ = try verifiedStableReadAccess(for: grant)
        let end = offset + UInt64(data.count)
        if grant.releaseAfterFullRead && end >= totalSize {
            fileGrants.removeValue(forKey: token)
        }
        return ["data": data.base64EncodedString(), "length": data.count]
    }

    func directoryFile(_ payload: JSONDictionary) throws -> JSONDictionary {
        let directoryToken = try requiredString(payload, "token")
        let directory = try verifiedDirectoryGrant(directoryToken)
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

        if create {
            guard !exists else { throw frameCollision(name) }
            // Do not create an empty destination here. The returned capability
            // points at an absent path; bytes remain in same-volume staging
            // until an exclusive atomic commit. A renderer crash therefore
            // cannot leave plausible or empty numbered frames behind.
            return try registerFile(
                fileURL,
                mode: .readWrite,
                writeDisposition: .createOnly,
                directoryToken: directoryToken,
                releaseAfterFullRead: true,
                maximumReadBytes: driftMaximumNativeOutputBytes
            )
        }

        guard exists else {
            throw BridgeFailure("NotFoundError", "The requested file does not exist.")
        }
        // Existing sequence entries may be inspected for collision/readback,
        // but a directory grant never turns them into replacement targets.
        return try registerFile(
            fileURL,
            mode: .readOnly,
            writeDisposition: .replaceOrCreate,
            directoryToken: directoryToken,
            releaseAfterFullRead: true,
            maximumReadBytes: driftMaximumNativeOutputBytes
        )
    }

    func removeDirectoryEntry(_ payload: JSONDictionary) throws -> JSONDictionary {
        let directoryToken = try requiredString(payload, "token")
        let directory = try verifiedDirectoryGrant(directoryToken)
        let name = try validatedChildName(requiredString(payload, "name"))
        let fileURL = directory.url.appendingPathComponent(name, isDirectory: false).standardizedFileURL
        guard fileURL.deletingLastPathComponent() == directory.url.standardizedFileURL else {
            throw BridgeFailure("SecurityError", "Directory traversal is not permitted.")
        }
        guard !writeSessions.values.contains(where: { $0.destinationURL == fileURL }) else {
            throw BridgeFailure("InvalidStateError", "That directory file is still being written.")
        }
        guard let committedIdentity = directory.committedEntries[name] else {
            throw BridgeFailure(
                "NotAllowedError",
                "Drift only removes numbered frames committed by this export. An unowned file was preserved."
            )
        }
        guard fileManager.fileExists(atPath: fileURL.path) else {
            directory.committedEntries.removeValue(forKey: name)
            throw BridgeFailure("NotFoundError", "The requested file no longer exists.")
        }
        try rejectSymlink(fileURL, allowMissing: false)
        try rejectDirectory(fileURL, allowMissing: false)
        let currentIdentity = try identity(at: fileURL)
        guard currentIdentity == committedIdentity else {
            revokeDirectoryEntryAuthority(directory: directory, name: name, fileURL: fileURL)
            throw BridgeFailure(
                "InvalidModificationError",
                "The numbered frame changed after Drift committed it. The replacement file was preserved."
            )
        }

        // Never unlink the selected path after a separate identity check. Move
        // whatever occupies that path to an unpredictable same-directory name
        // atomically, then inspect the moved inode. A replacement that wins the
        // check-to-rename race is restored rather than deleted.
        try beforeOwnedEntryQuarantineForTesting?(fileURL)
        try requireStableDirectoryAccess(directory.stableAccess, at: directory.url)
        let parentDescriptor = directory.stableAccess.handle.fileDescriptor
        let quarantineName = try quarantineEntryName(name, parentDescriptor: parentDescriptor)
        let quarantinedIdentity = try identity(atName: quarantineName, relativeTo: parentDescriptor)
        guard quarantinedIdentity.matchesAfterRename(committedIdentity) else {
            let restored = restoreQuarantinedEntryName(
                quarantineName,
                destinationName: name,
                parentDescriptor: parentDescriptor
            )
            revokeDirectoryEntryAuthority(directory: directory, name: name, fileURL: fileURL)
            let preservation = restored
                ? "at its original path"
                : "as \(quarantineName) because another file now occupies the original path"
            throw BridgeFailure(
                "InvalidModificationError",
                "The numbered frame was replaced during cleanup. The unowned file was preserved \(preservation)."
            )
        }

        // Recheck the randomized quarantine path immediately before unlink. It
        // is never exposed to WebContent or returned as a capability.
        guard try identity(
            atName: quarantineName,
            relativeTo: parentDescriptor
        ).matchesAfterRename(committedIdentity) else {
            let restored = restoreQuarantinedEntryName(
                quarantineName,
                destinationName: name,
                parentDescriptor: parentDescriptor
            )
            revokeDirectoryEntryAuthority(directory: directory, name: name, fileURL: fileURL)
            let preservation = restored ? "at its original path" : "under its quarantine name"
            throw BridgeFailure(
                "InvalidModificationError",
                "The quarantined frame changed before deletion. The changed file was preserved \(preservation)."
            )
        }
        let unlinkResult = quarantineName.withCString { Darwin.unlinkat(parentDescriptor, $0, 0) }
        guard unlinkResult == 0 else {
            let code = errno
            revokeDirectoryEntryAuthority(directory: directory, name: name, fileURL: fileURL)
            throw BridgeFailure(
                "InvalidStateError",
                "The owned frame could not be removed from quarantine and was preserved: \(String(cString: strerror(code)))."
            )
        }
        revokeDirectoryEntryAuthority(directory: directory, name: name, fileURL: fileURL)
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
        var descriptor: JSONDictionary
        if let access = grant.stableReadAccess {
            _ = try verifiedStableReadAccess(for: grant)
            descriptor = readMetadata(for: grant, access: access)
        } else {
            guard grant.mode == .readWrite,
                  !fileManager.fileExists(atPath: grant.url.path) else {
                fileGrants.removeValue(forKey: grant.token)
                throw BridgeFailure(
                    "InvalidModificationError",
                    "The selected file changed while its native permission was being admitted."
                )
            }
            descriptor = [
                "name": grant.url.lastPathComponent,
                "size": 0,
                "mimeType": grant.mimeType,
                "lastModified": Int64(Date().timeIntervalSince1970 * 1_000),
            ]
        }
        descriptor["token"] = grant.token
        descriptor["writable"] = grant.mode == .readWrite
        return descriptor
    }

    private func requiredSession(_ payload: JSONDictionary) throws -> WriteSession {
        let token = try requiredString(payload, "session")
        guard let session = writeSessions[token] else {
            throw BridgeFailure("InvalidStateError", "The writable stream is no longer open.")
        }
        return session
    }

    private func openStableDirectoryAccess(at url: URL) throws -> StableDirectoryAccess {
        let descriptor = url.path.withCString { path in
            Darwin.open(path, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW)
        }
        guard descriptor >= 0 else {
            let code = errno
            throw BridgeFailure(
                code == ELOOP ? "SecurityError" : (code == ENOENT ? "NotFoundError" : "NotAllowedError"),
                "Drift could not anchor the selected folder: \(String(cString: strerror(code)))."
            )
        }
        var closeDescriptor = true
        defer {
            if closeDescriptor { _ = Darwin.close(descriptor) }
        }
        let admittedIdentity = try directoryIdentity(fileDescriptor: descriptor)
        guard try directoryIdentity(at: url) == admittedIdentity else {
            throw BridgeFailure(
                "InvalidModificationError",
                "The selected folder changed while native authority was being admitted."
            )
        }
        let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        closeDescriptor = false
        return StableDirectoryAccess(handle: handle, admittedIdentity: admittedIdentity)
    }

    private func requireStableDirectoryAccess(_ access: StableDirectoryAccess, at url: URL) throws {
        guard try directoryIdentity(fileDescriptor: access.handle.fileDescriptor) == access.admittedIdentity,
              try directoryIdentity(at: url) == access.admittedIdentity else {
            throw BridgeFailure("InvalidModificationError", "The selected folder identity changed.")
        }
    }

    private func verifiedDirectoryGrant(_ token: String) throws -> DirectoryGrant {
        guard let directory = directoryGrants[token] else {
            throw BridgeFailure("NotAllowedError", "That directory permission is no longer valid.")
        }
        do {
            try requireStableDirectoryAccess(directory.stableAccess, at: directory.url)
            return directory
        } catch {
            revokeDirectoryGrant(token)
            throw BridgeFailure(
                "InvalidModificationError",
                "The selected folder was replaced or redirected. Its permission was revoked."
            )
        }
    }

    private func revokeDirectoryGrant(_ token: String) {
        let sessions = writeSessions.values.filter { $0.directoryToken == token }
        for session in sessions {
            writeSessions.removeValue(forKey: session.token)
            cleanupStaging(session)
        }
        fileGrants = fileGrants.filter { $0.value.directoryToken != token }
        directoryGrants.removeValue(forKey: token)
    }

    private func openStableReadAccess(
        at url: URL,
        maximumBytes: UInt64
    ) throws -> StableReadAccess {
        let descriptor = url.path.withCString { path in
            Darwin.open(path, O_RDONLY | O_CLOEXEC | O_NOFOLLOW)
        }
        guard descriptor >= 0 else {
            let code = errno
            throw BridgeFailure(
                code == ELOOP ? "SecurityError" : (code == ENOENT ? "NotFoundError" : "NotAllowedError"),
                "Drift could not open the selected file safely: \(String(cString: strerror(code)))."
            )
        }
        var closeDescriptor = true
        defer {
            if closeDescriptor { _ = Darwin.close(descriptor) }
        }

        var metadata = stat()
        guard Darwin.fstat(descriptor, &metadata) == 0 else {
            let code = errno
            throw BridgeFailure(
                "InvalidStateError",
                "Drift could not inspect the selected file descriptor: \(String(cString: strerror(code)))."
            )
        }
        guard (metadata.st_mode & S_IFMT) == S_IFREG else {
            throw BridgeFailure("TypeMismatchError", "The selected native input is not a regular file.")
        }
        let admittedIdentity = fileIdentity(from: metadata)
        guard admittedIdentity.size <= maximumBytes else {
            throw BridgeFailure(
                "QuotaExceededError",
                "The selected file exceeds its \(maximumBytes)-byte native import limit."
            )
        }
        guard try identity(at: url) == admittedIdentity else {
            throw BridgeFailure(
                "InvalidModificationError",
                "The selected file changed while its stable native permission was being admitted."
            )
        }

        let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        closeDescriptor = false
        return StableReadAccess(
            handle: handle,
            maximumBytes: maximumBytes,
            admittedIdentity: admittedIdentity
        )
    }

    private func verifiedStableReadAccess(for grant: FileGrant) throws -> StableReadAccess {
        guard let access = grant.stableReadAccess else {
            if grant.mode == .readWrite,
               !fileManager.fileExists(atPath: grant.url.path) {
                throw BridgeFailure("NotFoundError", "The selected export file has not been committed yet.")
            }
            fileGrants.removeValue(forKey: grant.token)
            throw BridgeFailure(
                "InvalidModificationError",
                "The selected file changed before stable native reading began. Its permission was revoked."
            )
        }
        do {
            try requireStablePathIdentity(access, at: grant.url)
            guard access.admittedIdentity.size <= access.maximumBytes,
                  access.maximumBytes == grant.maximumReadBytes else {
                throw BridgeFailure("InvalidModificationError", "The admitted native read limit changed.")
            }
            return access
        } catch {
            fileGrants.removeValue(forKey: grant.token)
            throw BridgeFailure(
                "InvalidModificationError",
                "The selected file was replaced, rewritten, or resized after admission. Its permission was revoked."
            )
        }
    }

    private func requireStablePathIdentity(_ access: StableReadAccess, at url: URL) throws {
        let descriptorIdentity = try identity(fileDescriptor: access.handle.fileDescriptor)
        let pathIdentity = try identity(at: url)
        guard descriptorIdentity == access.admittedIdentity,
              pathIdentity == access.admittedIdentity else {
            throw BridgeFailure("InvalidModificationError", "The admitted file identity changed.")
        }
    }

    private func readMetadata(for grant: FileGrant, access: StableReadAccess) -> JSONDictionary {
        let identity = access.admittedIdentity
        let scaledSeconds = identity.modificationSeconds.multipliedReportingOverflow(by: 1_000)
        let fractionalMilliseconds = identity.modificationNanoseconds / 1_000_000
        let combined = scaledSeconds.partialValue.addingReportingOverflow(fractionalMilliseconds)
        let modifiedMilliseconds: Int64
        if scaledSeconds.overflow || combined.overflow {
            modifiedMilliseconds = identity.modificationSeconds >= 0 ? .max : .min
        } else {
            modifiedMilliseconds = combined.partialValue
        }
        return [
            "name": grant.url.lastPathComponent,
            "size": Int(identity.size),
            "mimeType": grant.mimeType,
            "lastModified": modifiedMilliseconds,
        ]
    }

    private func commitStagedWrite(_ session: WriteSession) throws {
        let parentDescriptor = session.parentAccess.handle.fileDescriptor
        let destinationName = session.destinationURL.lastPathComponent

        switch session.writeDisposition {
        case .createOnly:
            let result = renameStagingExclusively(
                session.stagingURL,
                destinationName: destinationName,
                parentDescriptor: parentDescriptor
            )
            guard result == 0 else {
                let code = errno
                if code == EEXIST { throw frameCollision(destinationName) }
                throw stagedCommitFailure(code)
            }

        case .replaceOrCreate:
            try beforeReplaceCommitForTesting?(session.destinationURL)
            try requireStableDirectoryAccess(
                session.parentAccess,
                at: session.destinationURL.deletingLastPathComponent().standardizedFileURL
            )

            guard let expectedIdentity = session.expectedDestinationIdentity else {
                let result = renameStagingExclusively(
                    session.stagingURL,
                    destinationName: destinationName,
                    parentDescriptor: parentDescriptor
                )
                guard result == 0 else {
                    let code = errno
                    if code == EEXIST {
                        throw BridgeFailure(
                            "InvalidModificationError",
                            "The selected empty save destination appeared during export. The new file was preserved."
                        )
                    }
                    throw stagedCommitFailure(code)
                }
                return
            }

            let quarantineName = try quarantineEntryName(
                destinationName,
                parentDescriptor: parentDescriptor
            )
            let movedIdentity = try identity(
                atName: quarantineName,
                relativeTo: parentDescriptor
            )
            guard movedIdentity.matchesAfterRename(expectedIdentity) else {
                _ = restoreQuarantinedEntryName(
                    quarantineName,
                    destinationName: destinationName,
                    parentDescriptor: parentDescriptor
                )
                throw BridgeFailure(
                    "InvalidModificationError",
                    "The selected save destination was replaced during export. The replacement was preserved."
                )
            }

            let result = renameStagingExclusively(
                session.stagingURL,
                destinationName: destinationName,
                parentDescriptor: parentDescriptor
            )
            guard result == 0 else {
                let code = errno
                _ = restoreQuarantinedEntryName(
                    quarantineName,
                    destinationName: destinationName,
                    parentDescriptor: parentDescriptor
                )
                if code == EEXIST {
                    throw BridgeFailure(
                        "InvalidModificationError",
                        "Another file appeared at the save destination during commit. Both files were preserved."
                    )
                }
                throw stagedCommitFailure(code)
            }

            if let quarantinedIdentity = try? identity(
                atName: quarantineName,
                relativeTo: parentDescriptor
            ), quarantinedIdentity.matchesAfterRename(expectedIdentity) {
                _ = quarantineName.withCString { Darwin.unlinkat(parentDescriptor, $0, 0) }
            }
        }
    }

    private func renameStagingExclusively(
        _ stagingURL: URL,
        destinationName: String,
        parentDescriptor: Int32
    ) -> Int32 {
        stagingURL.path.withCString { sourcePath in
            destinationName.withCString { destinationPath in
                Darwin.renameatx_np(
                    AT_FDCWD,
                    sourcePath,
                    parentDescriptor,
                    destinationPath,
                    driftRenameExclusiveFlag
                )
            }
        }
    }

    private func quarantineEntryName(
        _ sourceName: String,
        parentDescriptor: Int32
    ) throws -> String {
        for _ in 0..<8 {
            let quarantineName = ".drift-quarantine-\(UUID().uuidString.lowercased())"
            let result = sourceName.withCString { sourcePath in
                quarantineName.withCString { destinationPath in
                    Darwin.renameatx_np(
                        parentDescriptor,
                        sourcePath,
                        parentDescriptor,
                        destinationPath,
                        driftRenameExclusiveFlag
                    )
                }
            }
            if result == 0 { return quarantineName }
            let code = errno
            if code == EEXIST { continue }
            throw stagedCommitFailure(code)
        }
        throw BridgeFailure("InvalidStateError", "Drift could not allocate a collision-free quarantine name.")
    }

    private func restoreQuarantinedEntryName(
        _ quarantineName: String,
        destinationName: String,
        parentDescriptor: Int32
    ) -> Bool {
        let exclusive = quarantineName.withCString { sourcePath in
            destinationName.withCString { destinationPath in
                Darwin.renameatx_np(
                    parentDescriptor,
                    sourcePath,
                    parentDescriptor,
                    destinationPath,
                    driftRenameExclusiveFlag
                )
            }
        }
        if exclusive == 0 { return true }
        guard errno == EEXIST else { return false }
        return quarantineName.withCString { quarantinePath in
            destinationName.withCString { destinationPath in
                Darwin.renameatx_np(
                    parentDescriptor,
                    quarantinePath,
                    parentDescriptor,
                    destinationPath,
                    driftRenameSwapFlag
                ) == 0
            }
        }
    }

    private func stagedCommitFailure(_ code: Int32) -> BridgeFailure {
        BridgeFailure(
            code == EACCES || code == EPERM ? "NotAllowedError" : "InvalidModificationError",
            "The staged export could not commit its destination: \(String(cString: strerror(code)))."
        )
    }

    private func revokeDirectoryEntryAuthority(
        directory: DirectoryGrant,
        name: String,
        fileURL: URL
    ) {
        directory.committedEntries.removeValue(forKey: name)
        fileGrants = fileGrants.filter { $0.value.url != fileURL }
    }

    private func frameCollision(_ name: String) -> BridgeFailure {
        BridgeFailure(
            "InvalidModificationError",
            "The selected folder already contains \(name). Existing PNG sequence files are never overwritten."
        )
    }

    private func identity(at url: URL) throws -> FileIdentity {
        var metadata = stat()
        let result = url.path.withCString { path in Darwin.lstat(path, &metadata) }
        guard result == 0 else {
            let code = errno
            throw BridgeFailure(
                code == ENOENT ? "NotFoundError" : "InvalidStateError",
                "Drift could not verify the committed file identity: \(String(cString: strerror(code)))."
            )
        }
        return fileIdentity(from: metadata)
    }

    private func identity(fileDescriptor: Int32) throws -> FileIdentity {
        var metadata = stat()
        guard Darwin.fstat(fileDescriptor, &metadata) == 0 else {
            let code = errno
            throw BridgeFailure(
                "InvalidStateError",
                "Drift could not verify the admitted file descriptor: \(String(cString: strerror(code)))."
            )
        }
        return fileIdentity(from: metadata)
    }

    private func identity(atName name: String, relativeTo directoryDescriptor: Int32) throws -> FileIdentity {
        var metadata = stat()
        let result = name.withCString { path in
            Darwin.fstatat(directoryDescriptor, path, &metadata, AT_SYMLINK_NOFOLLOW)
        }
        guard result == 0 else {
            let code = errno
            throw BridgeFailure(
                code == ENOENT ? "NotFoundError" : "InvalidStateError",
                "Drift could not verify a quarantined file identity: \(String(cString: strerror(code)))."
            )
        }
        return fileIdentity(from: metadata)
    }

    private func directoryIdentity(at url: URL) throws -> DirectoryIdentity {
        var metadata = stat()
        let result = url.path.withCString { path in Darwin.lstat(path, &metadata) }
        guard result == 0 else {
            let code = errno
            throw BridgeFailure(
                code == ENOENT ? "NotFoundError" : "InvalidStateError",
                "Drift could not verify the selected folder identity: \(String(cString: strerror(code)))."
            )
        }
        guard (metadata.st_mode & S_IFMT) == S_IFDIR else {
            throw BridgeFailure("InvalidModificationError", "The selected folder path is no longer a directory.")
        }
        return DirectoryIdentity(device: UInt64(metadata.st_dev), inode: UInt64(metadata.st_ino))
    }

    private func directoryIdentity(fileDescriptor: Int32) throws -> DirectoryIdentity {
        var metadata = stat()
        guard Darwin.fstat(fileDescriptor, &metadata) == 0 else {
            let code = errno
            throw BridgeFailure(
                "InvalidStateError",
                "Drift could not verify the selected folder descriptor: \(String(cString: strerror(code)))."
            )
        }
        guard (metadata.st_mode & S_IFMT) == S_IFDIR else {
            throw BridgeFailure("InvalidModificationError", "The selected folder descriptor is no longer a directory.")
        }
        return DirectoryIdentity(device: UInt64(metadata.st_dev), inode: UInt64(metadata.st_ino))
    }

    private func fileIdentity(from metadata: stat) -> FileIdentity {
        FileIdentity(
            device: UInt64(metadata.st_dev),
            inode: UInt64(metadata.st_ino),
            size: metadata.st_size >= 0 ? UInt64(metadata.st_size) : 0,
            modificationSeconds: Int64(metadata.st_mtimespec.tv_sec),
            modificationNanoseconds: Int64(metadata.st_mtimespec.tv_nsec),
            changeSeconds: Int64(metadata.st_ctimespec.tv_sec),
            changeNanoseconds: Int64(metadata.st_ctimespec.tv_nsec)
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

    private func admitGrant(protectingDirectoryToken additionalDirectoryToken: String? = nil) throws {
        let protectedFileTokens = Set(writeSessions.values.map(\.fileToken))
        var protectedDirectoryTokens = Set(writeSessions.values.compactMap(\.directoryToken))
        if let additionalDirectoryToken {
            protectedDirectoryTokens.insert(additionalDirectoryToken)
        }
        while fileGrants.count + directoryGrants.count >= maximumGrantCount {
            // Prefer evicting an old inactive file. A selected PNG-sequence
            // directory should not disappear merely because hundreds of child
            // frame handles were created beneath it.
            if let oldestFile = fileGrants.values
                .filter({ !protectedFileTokens.contains($0.token) })
                .min(by: { $0.createdAt < $1.createdAt }) {
                fileGrants.removeValue(forKey: oldestFile.token)
            } else if let oldestDirectory = directoryGrants.values
                .filter({ !protectedDirectoryTokens.contains($0.token) })
                .min(by: { $0.createdAt < $1.createdAt }) {
                directoryGrants.removeValue(forKey: oldestDirectory.token)
            } else {
                throw BridgeFailure(
                    "QuotaExceededError",
                    "Native file-permission capacity is full while every grant is in active use."
                )
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
        do {
            _ = try broker.fileInfo(["token": frameToken])
            throw BridgeFailure("DataError", "A fully read sequence-frame grant remained live.")
        } catch let failure as BridgeFailure where failure.name == "NotAllowedError" {
            // Expected.
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
            _ = try broker.releaseFile(["token": readOnlyFrame["token"] as! String])
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
        do {
            _ = try broker.removeDirectoryEntry(["token": directoryToken, "name": racedURL.lastPathComponent])
            throw BridgeFailure("DataError", "Rollback deleted an unowned commit-time collision.")
        } catch let failure as BridgeFailure where failure.name == "NotAllowedError" {
            guard try Data(contentsOf: racedURL) == intruder else {
                throw BridgeFailure("DataError", "Unowned collision bytes changed during rollback.")
            }
        }

        let replacedURL = root.appendingPathComponent("drift_000004.png")
        let replacedDescriptor = try broker.directoryFile([
            "token": directoryToken,
            "name": replacedURL.lastPathComponent,
            "create": true,
        ])
        let replacedToken = replacedDescriptor["token"] as! String
        let replacedOpen = try broker.openWriteSession(["token": replacedToken, "keepExistingData": false])
        let replacedSession = replacedOpen["session"] as! String
        _ = try broker.writeChunk([
            "session": replacedSession,
            "position": 0,
            "data": Data("owned-frame".utf8).base64EncodedString(),
        ])
        _ = try broker.closeWriteSession(["session": replacedSession])
        try manager.removeItem(at: replacedURL)
        let replacementBytes = Data("replacement-wins".utf8)
        try replacementBytes.write(to: replacedURL)
        do {
            _ = try broker.removeDirectoryEntry(["token": directoryToken, "name": replacedURL.lastPathComponent])
            throw BridgeFailure("DataError", "Rollback deleted a frame replaced after Drift committed it.")
        } catch let failure as BridgeFailure where failure.name == "InvalidModificationError" {
            guard try Data(contentsOf: replacedURL) == replacementBytes else {
                throw BridgeFailure("DataError", "Post-commit replacement bytes changed during rollback.")
            }
        }

        let modifiedURL = root.appendingPathComponent("drift_000005.png")
        let modifiedDescriptor = try broker.directoryFile([
            "token": directoryToken,
            "name": modifiedURL.lastPathComponent,
            "create": true,
        ])
        let modifiedToken = modifiedDescriptor["token"] as! String
        let modifiedOpen = try broker.openWriteSession(["token": modifiedToken, "keepExistingData": false])
        let modifiedSession = modifiedOpen["session"] as! String
        let originalSameSizeBytes = Data(repeating: 0x41, count: 16)
        _ = try broker.writeChunk([
            "session": modifiedSession,
            "position": 0,
            "data": originalSameSizeBytes.base64EncodedString(),
        ])
        _ = try broker.closeWriteSession(["session": modifiedSession])
        let inPlaceMutation = Data(repeating: 0x42, count: originalSameSizeBytes.count)
        let mutationHandle = try FileHandle(forWritingTo: modifiedURL)
        try mutationHandle.seek(toOffset: 0)
        try mutationHandle.write(contentsOf: inPlaceMutation)
        try mutationHandle.synchronize()
        try mutationHandle.close()
        try manager.setAttributes(
            [.modificationDate: Date(timeIntervalSince1970: 1_700_000_123)],
            ofItemAtPath: modifiedURL.path
        )
        do {
            _ = try broker.removeDirectoryEntry(["token": directoryToken, "name": modifiedURL.lastPathComponent])
            throw BridgeFailure("DataError", "Rollback deleted an in-place modified committed frame.")
        } catch let failure as BridgeFailure where failure.name == "InvalidModificationError" {
            guard try Data(contentsOf: modifiedURL) == inPlaceMutation else {
                throw BridgeFailure("DataError", "In-place modified frame bytes changed during rollback.")
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
        guard !manager.fileExists(atPath: frameURL.path) else {
            throw BridgeFailure("DataError", "Owned sequence-frame cleanup did not remove its exact committed identity.")
        }

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

        print("Drift native file broker self-test passed: staged replacement, exclusive sequence commits, full-metadata-owned rollback, collision and mutation preservation, one-shot frame readback grants, abort cleanup, capability revocation, traversal rejection, and readback hold.")
    }
}
