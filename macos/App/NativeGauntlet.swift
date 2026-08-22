import Darwin
import Foundation

enum NativeGauntlet {
    static func run() throws {
        let sourceRevision = String(repeating: "a", count: 40)
        try require(
            driftCompleteSourceURL(for: sourceRevision).absoluteString
                == "https://github.com/bomkino/pitchdog-drift/tree/\(sourceRevision)",
            "complete-source Help URL did not bind to the exact recorded revision"
        )
        for invalidRevision in [
            nil,
            "",
            String(repeating: "A", count: 40),
            String(repeating: "g", count: 40),
            "../../releases/latest",
        ] as [String?] {
            try require(
                driftCompleteSourceURL(for: invalidRevision).absoluteString
                    == "https://github.com/bomkino/pitchdog-drift",
                "malformed source revision escaped the repository-root fallback"
            )
        }

        // Exactly one renderer-process recovery may be consumed during one
        // studio-window lifetime. A second termination must stop the loop; a
        // genuinely new window starts with a fresh policy.
        var recoveryPolicy = WebContentRecoveryPolicy()
        try require(recoveryPolicy.hasRemainingAttempt, "fresh WebKit recovery policy had no attempt")
        try require(recoveryPolicy.consumeAttempt(), "first WebKit termination was denied its one recovery attempt")
        try require(!recoveryPolicy.hasRemainingAttempt, "consumed WebKit recovery attempt remained available")
        try require(!recoveryPolicy.consumeAttempt(), "second WebKit termination reopened an automatic recovery loop")
        recoveryPolicy.reset()
        try require(recoveryPolicy.consumeAttempt(), "new studio-window lifetime did not restore one recovery attempt")

        // Renderer notices can contain confidential project names. The native
        // process needs a state signal, not the notice body.
        var diagnosticState = ClientState()
        diagnosticState.update(from: [
            "lastNotice": "/Users/example/Clients/Unannounced Film/Secret Deck.pitched could not open",
        ])
        try require(
            diagnosticState.lastNotice == "present (content withheld)",
            "native client state retained confidential renderer notice text"
        )
        diagnosticState.update(from: ["lastNotice": "   "])
        try require(diagnosticState.lastNotice == nil, "blank renderer notice was not cleared")

        let manager = FileManager.default
        let root = manager.temporaryDirectory.appendingPathComponent(
            "drift-native-gauntlet-\(UUID().uuidString)",
            isDirectory: true
        )
        try manager.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? manager.removeItem(at: root) }

        let broker = NativeFileBroker(fileManager: manager)
        let destination = root.appendingPathComponent("keep-existing.dat")
        let original = Data("abcdefghijklmnopqrstuvwxyz".utf8)
        try original.write(to: destination)
        let descriptor = try broker.registerFile(destination, mode: .readWrite)
        var fileToken = try token(from: descriptor)

        // File System Access keepExistingData must copy committed bytes into the
        // staging file rather than exposing the destination to partial writes.
        let opened = try broker.openWriteSession(["token": fileToken, "keepExistingData": true])
        let session = try sessionToken(from: opened)
        try expectFailure("InvalidStateError", label: "duplicate writable stream") {
            _ = try broker.openWriteSession(["token": fileToken, "keepExistingData": false])
        }
        _ = try broker.writeChunk([
            "session": session,
            "position": 5,
            "data": Data("XYZ".utf8).base64EncodedString(),
        ])
        _ = try broker.truncateWriteSession(["session": session, "size": 12])
        _ = try broker.closeWriteSession(["session": session])

        let edited = Data("abcdeXYZijkl".utf8)
        try require(try Data(contentsOf: destination) == edited, "keepExistingData changed the wrong byte range")
        let readback = try broker.readFile(["token": fileToken, "offset": 0, "length": edited.count])
        guard let encoded = readback["data"] as? String, Data(base64Encoded: encoded) == edited else {
            throw BridgeFailure("DataError", "Chunked native readback did not match the committed file.")
        }

        // MP4 semantic verification must inspect the private stage before the
        // selected path changes. A rejected stage preserves an existing file
        // byte-for-byte, and a rejected first save leaves no destination.
        let transactionBroker = NativeFileBroker(fileManager: manager)
        let transactionalURL = root.appendingPathComponent("transactional-master.mp4", isDirectory: false)
        let transactionalOriginal = Data("irreplaceable-old-master".utf8)
        let transactionalOutput = Data("verified-new-master".utf8)
        try transactionalOriginal.write(to: transactionalURL)
        let transactionalGrant = try transactionBroker.registerSavePanelFile(transactionalURL)
        let transactionalToken = try token(from: transactionalGrant)
        let rejectedSession = try stagedWriteSession(
            broker: transactionBroker,
            token: transactionalToken,
            data: transactionalOutput
        )
        _ = try transactionBroker.closeWriteSession(["session": rejectedSession, "commit": false])
        try require(
            try Data(contentsOf: transactionalURL) == transactionalOriginal,
            "sealing a staged MP4 changed its existing destination before semantic verification"
        )
        let stagedInfo = try transactionBroker.fileInfo(["session": rejectedSession])
        try require(
            (stagedInfo["size"] as? Int) == transactionalOutput.count,
            "staged MP4 metadata did not describe the private verification bytes"
        )
        let stagedReadback = try transactionBroker.readFile([
            "session": rejectedSession,
            "offset": 0,
            "length": transactionalOutput.count,
        ])
        guard let stagedEncoded = stagedReadback["data"] as? String,
              Data(base64Encoded: stagedEncoded) == transactionalOutput else {
            throw BridgeFailure("DataError", "Staged MP4 readback did not match the private verification bytes.")
        }
        _ = try transactionBroker.abortWriteSession(["session": rejectedSession])
        try require(
            try Data(contentsOf: transactionalURL) == transactionalOriginal,
            "aborting a semantically rejected MP4 changed its existing destination"
        )

        let acceptedSession = try stagedWriteSession(
            broker: transactionBroker,
            token: transactionalToken,
            data: transactionalOutput
        )
        _ = try transactionBroker.closeWriteSession(["session": acceptedSession, "commit": false])
        try require(
            try Data(contentsOf: transactionalURL) == transactionalOriginal,
            "verified MP4 staging changed its destination before explicit commit"
        )
        _ = try transactionBroker.closeWriteSession(["session": acceptedSession, "commit": true])
        try require(
            try Data(contentsOf: transactionalURL) == transactionalOutput,
            "explicit commit did not publish the verified MP4 stage"
        )

        let firstSaveURL = root.appendingPathComponent("transactional-first-save.mp4", isDirectory: false)
        let firstSaveGrant = try transactionBroker.registerSavePanelFile(firstSaveURL)
        let firstSaveToken = try token(from: firstSaveGrant)
        let firstSaveSession = try stagedWriteSession(
            broker: transactionBroker,
            token: firstSaveToken,
            data: transactionalOutput
        )
        _ = try transactionBroker.closeWriteSession(["session": firstSaveSession, "commit": false])
        try require(
            !manager.fileExists(atPath: firstSaveURL.path),
            "sealing a first-save MP4 leaked a destination before semantic verification"
        )
        _ = try transactionBroker.abortWriteSession(["session": firstSaveSession])
        try require(
            !manager.fileExists(atPath: firstSaveURL.path),
            "aborting a rejected first-save MP4 left a destination artifact"
        )

        // A native close can fail after bytes have been staged—for example when
        // the selected destination changes type before commit. Failure must
        // remove the write session and revoke stale destination identity. A
        // later retry requires a fresh native selection/grant.
        let closeFailureOpen = try broker.openWriteSession(["token": fileToken, "keepExistingData": true])
        let closeFailureSession = try sessionToken(from: closeFailureOpen)
        _ = try broker.writeChunk([
            "session": closeFailureSession,
            "position": 0,
            "data": Data("staged-but-never-committed".utf8).base64EncodedString(),
        ])
        try manager.removeItem(at: destination)
        try manager.createDirectory(at: destination, withIntermediateDirectories: false)
        try expectFailure("TypeMismatchError", label: "commit destination changed to a directory") {
            _ = try broker.closeWriteSession(["session": closeFailureSession])
        }
        _ = try broker.abortWriteSession(["session": closeFailureSession])
        try manager.removeItem(at: destination)
        try edited.write(to: destination)
        try expectFailure("NotAllowedError", label: "stale save grant after destination replacement") {
            _ = try broker.openWriteSession(["token": fileToken, "keepExistingData": true])
        }
        let retryDescriptor = try broker.registerFile(destination, mode: .readWrite)
        fileToken = try token(from: retryDescriptor)
        let retryOpen = try broker.openWriteSession(["token": fileToken, "keepExistingData": true])
        _ = try broker.abortWriteSession(["session": try sessionToken(from: retryOpen)])
        try require(try Data(contentsOf: destination) == edited, "failed close or idempotent abort changed the restored destination")

        // A rejected truncate is non-destructive and remains abortable.
        let oversizedTruncate = try broker.openWriteSession(["token": fileToken, "keepExistingData": true])
        let oversizedTruncateSession = try sessionToken(from: oversizedTruncate)
        try expectFailure("QuotaExceededError", label: "oversized truncate") {
            _ = try broker.truncateWriteSession([
                "session": oversizedTruncateSession,
                "size": Int(driftMaximumNativeOutputBytes + 1),
            ])
        }
        _ = try broker.abortWriteSession(["session": oversizedTruncateSession])
        try require(try Data(contentsOf: destination) == edited, "rejected truncate changed the destination")

        // Message-size and destination-size caps are independent. Neither may
        // leave a convincing partial replacement behind.
        let oversizedChunkOpen = try broker.openWriteSession(["token": fileToken, "keepExistingData": false])
        let oversizedChunkSession = try sessionToken(from: oversizedChunkOpen)
        let oversizedChunk = Data(repeating: 0x41, count: driftMaximumWriteChunkBytes + 1)
        try expectFailure("QuotaExceededError", label: "oversized bridge chunk") {
            _ = try broker.writeChunk([
                "session": oversizedChunkSession,
                "position": 0,
                "data": oversizedChunk.base64EncodedString(),
            ])
        }
        _ = try broker.abortWriteSession(["session": oversizedChunkSession])
        try require(try Data(contentsOf: destination) == edited, "rejected bridge chunk changed the destination")

        let outputCapOpen = try broker.openWriteSession(["token": fileToken, "keepExistingData": false])
        let outputCapSession = try sessionToken(from: outputCapOpen)
        try expectFailure("QuotaExceededError", label: "native output cap") {
            _ = try broker.writeChunk([
                "session": outputCapSession,
                "position": Int(driftMaximumNativeOutputBytes),
                "data": Data([0x7F]).base64EncodedString(),
            ])
        }
        _ = try broker.abortWriteSession(["session": outputCapSession])
        try require(try Data(contentsOf: destination) == edited, "rejected output-cap write changed the destination")

        let directoryDescriptor = try broker.registerDirectory(root)
        let directoryToken = try token(from: directoryDescriptor)
        try expectFailure("NotFoundError", label: "missing directory entry") {
            _ = try broker.directoryFile([
                "token": directoryToken,
                "name": "missing.png",
                "create": false,
            ])
        }
        for unsafeName in [".", "..", "../escape.png", "folder/frame.png", "folder\\frame.png"] {
            try expectFailure("TypeError", label: "unsafe child name \(unsafeName)") {
                _ = try broker.directoryFile([
                    "token": directoryToken,
                    "name": unsafeName,
                    "create": true,
                ])
            }
        }
        try require(!manager.fileExists(atPath: root.deletingLastPathComponent().appendingPathComponent("escape.png").path), "traversal created a file outside the selected directory")

        let nestedDirectory = root.appendingPathComponent("not-a-frame.png", isDirectory: true)
        try manager.createDirectory(at: nestedDirectory, withIntermediateDirectories: false)
        try expectFailure("TypeMismatchError", label: "directory masquerading as a frame") {
            _ = try broker.directoryFile([
                "token": directoryToken,
                "name": "not-a-frame.png",
                "create": false,
            ])
        }

        // Opaque grants are bounded. Old inactive file grants may be evicted;
        // the selected directory and newest file must remain useful.
        var oldestToken: String?
        var newestToken: String?
        for index in 0..<(driftMaximumGrantCount + 12) {
            let url = root.appendingPathComponent("grant-\(index).dat")
            try Data([UInt8(index & 0xFF)]).write(to: url)
            let grant = try broker.registerFile(url, mode: .readOnly)
            let token = try self.token(from: grant)
            oldestToken = oldestToken ?? token
            newestToken = token
        }
        if let oldestToken {
            try expectFailure("NotAllowedError", label: "old grant eviction") {
                _ = try broker.fileInfo(["token": oldestToken])
            }
        }
        if let newestToken {
            let newest = try broker.fileInfo(["token": newestToken])
            try require((newest["size"] as? Int) == 1, "newest native grant was evicted instead of an old inactive grant")
        }

        // `create: true` deliberately grants an absent frame path. It must not
        // leak an empty, convincing PNG before bytes are ready. After grant
        // pressure, prove that the retained directory can still create,
        // atomically commit, inspect, and remove one real child file.
        let createdName = "after-eviction.png"
        let createdURL = root.appendingPathComponent(createdName, isDirectory: false)
        let createdAfterEviction = try broker.directoryFile([
            "token": directoryToken,
            "name": createdName,
            "create": true,
        ])
        let createdToken = try token(from: createdAfterEviction)
        try require(
            !manager.fileExists(atPath: createdURL.path),
            "create:true leaked an empty sequence frame after grant pressure"
        )
        let createdOpen = try broker.openWriteSession([
            "token": createdToken,
            "keepExistingData": false,
        ])
        let createdSession = try sessionToken(from: createdOpen)
        let committedBytes = Data([0xA5])
        _ = try broker.writeChunk([
            "session": createdSession,
            "position": 0,
            "data": committedBytes.base64EncodedString(),
        ])
        _ = try broker.closeWriteSession(["session": createdSession])
        let createdInfo = try broker.fileInfo(["token": createdToken])
        try require(
            (createdInfo["size"] as? Int) == committedBytes.count,
            "selected directory grant committed the wrong child size after file-grant pressure"
        )
        try require(
            try Data(contentsOf: createdURL) == committedBytes,
            "selected directory grant committed the wrong child bytes after file-grant pressure"
        )
        _ = try broker.removeDirectoryEntry(["token": directoryToken, "name": createdName])
        try require(
            !manager.fileExists(atPath: createdURL.path),
            "directory entry removal left a committed test frame behind"
        )

        // Use a deliberately tiny grant table to make full-capacity behaviour
        // deterministic. One active create-only write owns exactly two grants:
        // its file capability and its parent directory capability. No admission
        // may evict either authority or silently grow beyond the configured cap.
        let pressureRoot = root.appendingPathComponent("protected-grant-pressure", isDirectory: true)
        try manager.createDirectory(at: pressureRoot, withIntermediateDirectories: false)
        let pressureBroker = NativeFileBroker(fileManager: manager, maximumGrantCount: 2)
        let pressureDirectory = try pressureBroker.registerDirectory(pressureRoot)
        let pressureDirectoryToken = try token(from: pressureDirectory)
        let pressureFrameName = "owned-frame.png"
        let pressureFrameURL = pressureRoot.appendingPathComponent(pressureFrameName, isDirectory: false)
        let pressureFrame = try pressureBroker.directoryFile([
            "token": pressureDirectoryToken,
            "name": pressureFrameName,
            "create": true,
        ])
        let pressureFrameToken = try token(from: pressureFrame)
        let pressureOpen = try pressureBroker.openWriteSession([
            "token": pressureFrameToken,
            "keepExistingData": false,
        ])
        let pressureSession = try sessionToken(from: pressureOpen)
        let pressureBytes = Data("owned-under-pressure".utf8)
        _ = try pressureBroker.writeChunk([
            "session": pressureSession,
            "position": 0,
            "data": pressureBytes.base64EncodedString(),
        ])

        let unrelatedURL = pressureRoot.appendingPathComponent("unrelated.txt", isDirectory: false)
        let unrelatedBytes = Data("preserve-me".utf8)
        try unrelatedBytes.write(to: unrelatedURL)
        try expectFailure("QuotaExceededError", label: "fully protected grant admission") {
            _ = try pressureBroker.registerFile(unrelatedURL, mode: .readOnly)
        }
        try require(
            try Data(contentsOf: unrelatedURL) == unrelatedBytes,
            "rejected grant admission changed an unrelated file"
        )

        _ = try pressureBroker.closeWriteSession(["session": pressureSession])
        try require(
            try Data(contentsOf: pressureFrameURL) == pressureBytes,
            "protected frame commit changed bytes after grant pressure"
        )
        _ = try pressureBroker.removeDirectoryEntry([
            "token": pressureDirectoryToken,
            "name": pressureFrameName,
        ])
        try require(
            !manager.fileExists(atPath: pressureFrameURL.path),
            "ownership-aware rollback did not remove the exact committed frame"
        )
        try require(
            try Data(contentsOf: unrelatedURL) == unrelatedBytes,
            "ownership-aware rollback removed or changed an unrelated file"
        )

        // A capacity smaller than one directory plus one child must reject the
        // child admission without evicting the parent authority it depends on.
        let oneSlotRoot = root.appendingPathComponent("one-slot-grant-pressure", isDirectory: true)
        try manager.createDirectory(at: oneSlotRoot, withIntermediateDirectories: false)
        let oneSlotBroker = NativeFileBroker(fileManager: manager, maximumGrantCount: 1)
        let oneSlotDirectory = try oneSlotBroker.registerDirectory(oneSlotRoot)
        let oneSlotDirectoryToken = try token(from: oneSlotDirectory)
        try expectFailure("QuotaExceededError", label: "dependent child admission at one-slot capacity") {
            _ = try oneSlotBroker.directoryFile([
                "token": oneSlotDirectoryToken,
                "name": "cannot-fit.png",
                "create": true,
            ])
        }
        try expectFailure("NotFoundError", label: "parent authority after rejected child admission") {
            _ = try oneSlotBroker.directoryFile([
                "token": oneSlotDirectoryToken,
                "name": "still-authorized-but-missing.png",
                "create": false,
            ])
        }

        // Read grants bind one open descriptor, its full admitted identity, and
        // the native import limit. Every metadata/read call verifies both the
        // descriptor and current path before returning any bytes, then verifies
        // again after a chunk. A mismatch revokes the capability immediately.
        let stableReadBroker = NativeFileBroker(fileManager: manager)
        let overLimitURL = root.appendingPathComponent("read-cap.bin", isDirectory: false)
        try Data(repeating: 0xCA, count: 9).write(to: overLimitURL)
        try expectFailure("QuotaExceededError", label: "per-kind stable read cap") {
            _ = try stableReadBroker.registerFile(
                overLimitURL,
                mode: .readOnly,
                maximumReadBytes: 8
            )
        }

        let replacedReadURL = root.appendingPathComponent("read-replaced.bin", isDirectory: false)
        let replacedOriginal = Data("admitted-inode".utf8)
        try replacedOriginal.write(to: replacedReadURL)
        let replacedReadGrant = try stableReadBroker.registerFile(
            replacedReadURL,
            mode: .readOnly,
            maximumReadBytes: UInt64(replacedOriginal.count)
        )
        let replacedReadToken = try token(from: replacedReadGrant)
        let replacementSource = root.appendingPathComponent("read-replacement-source.bin", isDirectory: false)
        let replacementContent = Data("replacement!!!".utf8)
        try replacementContent.write(to: replacementSource)
        let replacementResult = replacementSource.path.withCString { sourcePath in
            replacedReadURL.path.withCString { destinationPath in
                Darwin.rename(sourcePath, destinationPath)
            }
        }
        try require(replacementResult == 0, "could not establish deterministic inode replacement")
        try expectFailure("InvalidModificationError", label: "read grant inode replacement") {
            _ = try stableReadBroker.fileInfo(["token": replacedReadToken])
        }
        try expectFailure("NotAllowedError", label: "replaced read grant revocation") {
            _ = try stableReadBroker.readFile([
                "token": replacedReadToken,
                "offset": 0,
                "length": replacementContent.count,
            ])
        }
        try require(
            try Data(contentsOf: replacedReadURL) == replacementContent,
            "read-grant revocation changed the replacement file"
        )

        let rewrittenReadURL = root.appendingPathComponent("read-rewritten.bin", isDirectory: false)
        let rewrittenOriginal = Data("same-size-A".utf8)
        let rewrittenContent = Data("same-size-B".utf8)
        try rewrittenOriginal.write(to: rewrittenReadURL)
        let originalModifiedDate = try requireModificationDate(rewrittenReadURL, manager: manager)
        let rewrittenGrant = try stableReadBroker.registerFile(
            rewrittenReadURL,
            mode: .readOnly,
            maximumReadBytes: UInt64(rewrittenOriginal.count)
        )
        let rewrittenToken = try token(from: rewrittenGrant)
        let rewriteHandle = try FileHandle(forWritingTo: rewrittenReadURL)
        try rewriteHandle.seek(toOffset: 0)
        try rewriteHandle.write(contentsOf: rewrittenContent)
        try rewriteHandle.synchronize()
        try rewriteHandle.close()
        try manager.setAttributes([.modificationDate: originalModifiedDate], ofItemAtPath: rewrittenReadURL.path)
        try expectFailure("InvalidModificationError", label: "same-size in-place read rewrite") {
            _ = try stableReadBroker.readFile([
                "token": rewrittenToken,
                "offset": 0,
                "length": rewrittenContent.count,
            ])
        }
        try expectFailure("NotAllowedError", label: "rewritten read grant revocation") {
            _ = try stableReadBroker.fileInfo(["token": rewrittenToken])
        }
        try require(
            try Data(contentsOf: rewrittenReadURL) == rewrittenContent,
            "same-size read-grant rejection changed external bytes"
        )

        let grownReadURL = root.appendingPathComponent("read-grown.bin", isDirectory: false)
        let grownOriginal = Data("abcdefgh".utf8)
        try grownOriginal.write(to: grownReadURL)
        let grownGrant = try stableReadBroker.registerFile(
            grownReadURL,
            mode: .readOnly,
            maximumReadBytes: 16
        )
        let grownToken = try token(from: grownGrant)
        let firstChunk = try stableReadBroker.readFile([
            "token": grownToken,
            "offset": 0,
            "length": 4,
        ])
        try require(
            Data(base64Encoded: firstChunk["data"] as? String ?? "") == Data("abcd".utf8),
            "stable read grant changed its admitted first chunk"
        )
        let growthHandle = try FileHandle(forWritingTo: grownReadURL)
        try growthHandle.seekToEnd()
        try growthHandle.write(contentsOf: Data("ij".utf8))
        try growthHandle.synchronize()
        try growthHandle.close()
        try expectFailure("InvalidModificationError", label: "read growth between chunks") {
            _ = try stableReadBroker.readFile([
                "token": grownToken,
                "offset": 4,
                "length": 4,
            ])
        }
        try expectFailure("NotAllowedError", label: "grown read grant revocation") {
            _ = try stableReadBroker.fileInfo(["token": grownToken])
        }
        try require(
            try Data(contentsOf: grownReadURL) == Data("abcdefghij".utf8),
            "growth rejection changed the externally grown file"
        )

        // Force the exact former check-to-unlink interleaving. The hook runs
        // after committed identity verification but before atomic quarantine.
        // Cleanup must move, inspect, and restore the replacement—not delete it.
        let deletionRaceRoot = root.appendingPathComponent("deletion-race", isDirectory: true)
        try manager.createDirectory(at: deletionRaceRoot, withIntermediateDirectories: false)
        let deletionReplacement = Data("unowned-replacement-must-survive".utf8)
        let deletionRaceBroker = NativeFileBroker(
            fileManager: manager,
            beforeOwnedEntryQuarantineForTesting: { fileURL in
                try manager.removeItem(at: fileURL)
                try deletionReplacement.write(to: fileURL)
            }
        )
        let deletionDirectory = try deletionRaceBroker.registerDirectory(deletionRaceRoot)
        let deletionDirectoryToken = try token(from: deletionDirectory)
        let deletionName = "drift_000001.png"
        let deletionURL = deletionRaceRoot.appendingPathComponent(deletionName, isDirectory: false)
        let deletionFrame = try deletionRaceBroker.directoryFile([
            "token": deletionDirectoryToken,
            "name": deletionName,
            "create": true,
        ])
        let deletionFrameToken = try token(from: deletionFrame)
        let deletionOpen = try deletionRaceBroker.openWriteSession([
            "token": deletionFrameToken,
            "keepExistingData": false,
        ])
        let deletionSession = try sessionToken(from: deletionOpen)
        _ = try deletionRaceBroker.writeChunk([
            "session": deletionSession,
            "position": 0,
            "data": Data("owned-frame".utf8).base64EncodedString(),
        ])
        _ = try deletionRaceBroker.closeWriteSession(["session": deletionSession])
        try expectFailure("InvalidModificationError", label: "replacement during owned-entry deletion") {
            _ = try deletionRaceBroker.removeDirectoryEntry([
                "token": deletionDirectoryToken,
                "name": deletionName,
            ])
        }
        try require(
            try Data(contentsOf: deletionURL) == deletionReplacement,
            "ownership-preserving deletion removed or changed the interleaved replacement"
        )
        try expectFailure("NotAllowedError", label: "interleaved replacement grant revocation") {
            _ = try deletionRaceBroker.fileInfo(["token": deletionFrameToken])
        }
        try expectFailure("NotAllowedError", label: "interleaved replacement ownership revocation") {
            _ = try deletionRaceBroker.removeDirectoryEntry([
                "token": deletionDirectoryToken,
                "name": deletionName,
            ])
        }
        let deletionRaceEntries = try manager.contentsOfDirectory(atPath: deletionRaceRoot.path)
        try require(
            deletionRaceEntries == [deletionName],
            "ownership-preserving deletion stranded a quarantine artifact"
        )

        let existingSaveURL = root.appendingPathComponent("conditional-existing-save.bin", isDirectory: false)
        let existingSaveOriginal = Data("selected-original".utf8)
        let existingSaveIntruder = Data("replacement-wins".utf8)
        try existingSaveOriginal.write(to: existingSaveURL)
        let existingSaveBroker = NativeFileBroker(
            fileManager: manager,
            beforeReplaceCommitForTesting: { destinationURL in
                try manager.removeItem(at: destinationURL)
                try existingSaveIntruder.write(to: destinationURL)
            }
        )
        let existingSaveGrant = try existingSaveBroker.registerSavePanelFile(existingSaveURL)
        let existingSaveToken = try token(from: existingSaveGrant)
        let existingSaveSession = try stagedWriteSession(
            broker: existingSaveBroker,
            token: existingSaveToken,
            data: Data("drift-output".utf8)
        )
        _ = try existingSaveBroker.closeWriteSession([
            "session": existingSaveSession,
            "commit": false,
        ])
        try expectFailure("InvalidModificationError", label: "selected existing save replaced during export") {
            _ = try existingSaveBroker.closeWriteSession([
                "session": existingSaveSession,
                "commit": true,
            ])
        }
        try require(
            try Data(contentsOf: existingSaveURL) == existingSaveIntruder,
            "conditional replacement commit overwrote the interleaved existing-file replacement"
        )
        try expectFailure("NotAllowedError", label: "replaced save grant revocation") {
            _ = try existingSaveBroker.fileInfo(["token": existingSaveToken])
        }

        let absentSaveURL = root.appendingPathComponent("conditional-absent-save.bin", isDirectory: false)
        let absentSaveIntruder = Data("appeared-during-export".utf8)
        let absentSaveBroker = NativeFileBroker(
            fileManager: manager,
            beforeReplaceCommitForTesting: { destinationURL in
                try absentSaveIntruder.write(to: destinationURL)
            }
        )
        let absentSaveGrant = try absentSaveBroker.registerSavePanelFile(absentSaveURL)
        let absentSaveToken = try token(from: absentSaveGrant)
        let absentSaveSession = try stagedWriteSession(
            broker: absentSaveBroker,
            token: absentSaveToken,
            data: Data("drift-output".utf8)
        )
        _ = try absentSaveBroker.closeWriteSession([
            "session": absentSaveSession,
            "commit": false,
        ])
        try expectFailure("InvalidModificationError", label: "selected absent save appeared during export") {
            _ = try absentSaveBroker.closeWriteSession([
                "session": absentSaveSession,
                "commit": true,
            ])
        }
        try require(
            try Data(contentsOf: absentSaveURL) == absentSaveIntruder,
            "exclusive first-save commit overwrote the file that appeared during export"
        )
        try expectFailure("NotAllowedError", label: "appeared save grant revocation") {
            _ = try absentSaveBroker.fileInfo(["token": absentSaveToken])
        }

        let redirectedParentURL = root.appendingPathComponent("selected-save-parent", isDirectory: true)
        let movedParentURL = root.appendingPathComponent("selected-save-parent-moved", isDirectory: true)
        try manager.createDirectory(at: redirectedParentURL, withIntermediateDirectories: false)
        let redirectedSaveURL = redirectedParentURL.appendingPathComponent("movie.mp4", isDirectory: false)
        let redirectedSaveBroker = NativeFileBroker(
            fileManager: manager,
            beforeReplaceCommitForTesting: { _ in
                try manager.moveItem(at: redirectedParentURL, to: movedParentURL)
                try manager.createDirectory(at: redirectedParentURL, withIntermediateDirectories: false)
            }
        )
        let redirectedSaveGrant = try redirectedSaveBroker.registerSavePanelFile(redirectedSaveURL)
        let redirectedSaveToken = try token(from: redirectedSaveGrant)
        let redirectedSaveSession = try stagedWriteSession(
            broker: redirectedSaveBroker,
            token: redirectedSaveToken,
            data: Data("must-not-land".utf8)
        )
        try expectFailure("InvalidModificationError", label: "save parent replaced during export") {
            _ = try redirectedSaveBroker.closeWriteSession(["session": redirectedSaveSession])
        }
        try require(
            !manager.fileExists(atPath: redirectedSaveURL.path)
                && !manager.fileExists(atPath: movedParentURL.appendingPathComponent("movie.mp4").path),
            "parent-anchored save committed into a replaced or detached directory"
        )

        let directoryReplacementURL = root.appendingPathComponent("directory-grant-replaced", isDirectory: true)
        let directoryReplacementMoved = root.appendingPathComponent("directory-grant-replaced-moved", isDirectory: true)
        try manager.createDirectory(at: directoryReplacementURL, withIntermediateDirectories: false)
        let directoryReplacementBroker = NativeFileBroker(fileManager: manager)
        let directoryReplacementGrant = try directoryReplacementBroker.registerDirectory(directoryReplacementURL)
        let directoryReplacementToken = try token(from: directoryReplacementGrant)
        try manager.moveItem(at: directoryReplacementURL, to: directoryReplacementMoved)
        try manager.createDirectory(at: directoryReplacementURL, withIntermediateDirectories: false)
        try expectFailure("InvalidModificationError", label: "selected directory inode replacement") {
            _ = try directoryReplacementBroker.directoryFile([
                "token": directoryReplacementToken,
                "name": "must-not-create.png",
                "create": true,
            ])
        }
        try expectFailure("NotAllowedError", label: "replaced directory grant revocation") {
            _ = try directoryReplacementBroker.directoryFile([
                "token": directoryReplacementToken,
                "name": "must-not-create.png",
                "create": true,
            ])
        }
        let replacementDirectoryStayedEmpty = try manager.contentsOfDirectory(
            atPath: directoryReplacementURL.path
        ).isEmpty
        let movedDirectoryStayedEmpty = try manager.contentsOfDirectory(
            atPath: directoryReplacementMoved.path
        ).isEmpty
        try require(
            replacementDirectoryStayedEmpty && movedDirectoryStayedEmpty,
            "replaced directory grant created a frame in either directory"
        )

        let directorySymlinkURL = root.appendingPathComponent("directory-grant-symlink", isDirectory: true)
        let directorySymlinkMoved = root.appendingPathComponent("directory-grant-symlink-moved", isDirectory: true)
        let directorySymlinkTarget = root.appendingPathComponent("directory-grant-symlink-target", isDirectory: true)
        try manager.createDirectory(at: directorySymlinkURL, withIntermediateDirectories: false)
        try manager.createDirectory(at: directorySymlinkTarget, withIntermediateDirectories: false)
        let directorySymlinkBroker = NativeFileBroker(fileManager: manager)
        let directorySymlinkGrant = try directorySymlinkBroker.registerDirectory(directorySymlinkURL)
        let directorySymlinkToken = try token(from: directorySymlinkGrant)
        try manager.moveItem(at: directorySymlinkURL, to: directorySymlinkMoved)
        try manager.createSymbolicLink(at: directorySymlinkURL, withDestinationURL: directorySymlinkTarget)
        try expectFailure("InvalidModificationError", label: "selected directory symlink redirection") {
            _ = try directorySymlinkBroker.directoryFile([
                "token": directorySymlinkToken,
                "name": "must-not-create.png",
                "create": true,
            ])
        }
        let symlinkTargetStayedEmpty = try manager.contentsOfDirectory(
            atPath: directorySymlinkTarget.path
        ).isEmpty
        let symlinkSourceStayedEmpty = try manager.contentsOfDirectory(
            atPath: directorySymlinkMoved.path
        ).isEmpty
        try require(
            symlinkTargetStayedEmpty && symlinkSourceStayedEmpty,
            "symlink-redirected directory grant created a frame"
        )

        print("Drift stable read-grant gauntlet passed: per-kind cap, inode replacement, same-size rewrite, growth-between-chunks, fail-closed revocation, and external-file preservation.")
        print("Drift ownership-preserving deletion gauntlet passed: deterministic check-to-delete replacement survived and stale ownership was revoked.")
        print("Drift conditional commit and directory-anchor gauntlet passed: existing/absent save collisions, parent replacement, directory replacement, and symlink redirection all preserved external state.")
        print("Drift source-provenance gauntlet passed: exact revision link and malformed-revision fallback.")
        print("Drift extended native gauntlet passed.")
    }

    private static func token(from payload: JSONDictionary) throws -> String {
        guard let token = payload["token"] as? String, !token.isEmpty else {
            throw BridgeFailure("DataError", "Native self-test response did not contain a file token.")
        }
        return token
    }

    private static func sessionToken(from payload: JSONDictionary) throws -> String {
        guard let token = payload["session"] as? String, !token.isEmpty else {
            throw BridgeFailure("DataError", "Native self-test response did not contain a write session token.")
        }
        return token
    }

    private static func requireModificationDate(_ url: URL, manager: FileManager) throws -> Date {
        let attributes = try manager.attributesOfItem(atPath: url.path)
        guard let date = attributes[.modificationDate] as? Date else {
            throw BridgeFailure("DataError", "Native self-test file had no modification date.")
        }
        return date
    }

    private static func stagedWriteSession(
        broker: NativeFileBroker,
        token: String,
        data: Data
    ) throws -> String {
        let opened = try broker.openWriteSession(["token": token, "keepExistingData": false])
        let session = try sessionToken(from: opened)
        _ = try broker.writeChunk([
            "session": session,
            "position": 0,
            "data": data.base64EncodedString(),
        ])
        return session
    }

    private static func require(_ condition: @autoclosure () throws -> Bool, _ message: String) throws {
        if try !condition() { throw BridgeFailure("DataError", message) }
    }

    private static func expectFailure(
        _ expectedName: String,
        label: String,
        operation: () throws -> Void
    ) throws {
        do {
            try operation()
            throw BridgeFailure("DataError", "\(label) unexpectedly succeeded.")
        } catch let failure as BridgeFailure {
            guard failure.name == expectedName else {
                throw BridgeFailure(
                    "DataError",
                    "\(label) failed with \(failure.name), expected \(expectedName): \(failure.message)"
                )
            }
        }
    }
}
