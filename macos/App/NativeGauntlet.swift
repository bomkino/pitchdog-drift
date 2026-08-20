import Foundation

enum NativeGauntlet {
    static func run() throws {
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
        let fileToken = try token(from: descriptor)

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

        // A native close can fail after bytes have been staged—for example when
        // the selected destination changes type before commit. Failure must
        // remove the write session so an idempotent abort and a later retry do
        // not inherit stranded staging state.
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
        let createdAfterEviction = try broker.directoryFile([
            "token": directoryToken,
            "name": "after-eviction.png",
            "create": true,
        ])
        let createdToken = try token(from: createdAfterEviction)
        let createdInfo = try broker.fileInfo(["token": createdToken])
        try require((createdInfo["size"] as? Int) == 0, "selected directory grant did not survive file-grant pressure")
        _ = try broker.removeDirectoryEntry(["token": directoryToken, "name": "after-eviction.png"])

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
