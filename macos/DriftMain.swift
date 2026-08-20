import AppKit
import Darwin
import Foundation
import UniformTypeIdentifiers
import WebKit

@main
struct DriftMain {
    static func main() {
        if CommandLine.arguments.contains("--smoke-test") {
            Darwin.exit(runSmokeTest())
        }
        if CommandLine.arguments.contains("--native-self-test") {
            Darwin.exit(runNativeSelfTest())
        }

        let application = NSApplication.shared
        let delegate = DriftAppDelegate()
        application.delegate = delegate
        application.setActivationPolicy(.regular)
        application.run()
    }

    private static func runSmokeTest() -> Int32 {
        guard let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web"),
              FileManager.default.fileExists(atPath: indexURL.path) else {
            fputs("Drift smoke test failed: Web/index.html is missing or unreadable.\n", stderr)
            return 1
        }
        guard let bridgeURL = Bundle.main.url(forResource: "NativeBridge", withExtension: "js"),
              let bridgeSource = try? String(contentsOf: bridgeURL, encoding: .utf8),
              bridgeSource.contains("DRIFT_NATIVE_BRIDGE_VERSION = \(bridgeVersion)") else {
            fputs("Drift smoke test failed: the native bridge is missing or has the wrong version.\n", stderr)
            return 1
        }
        guard Bundle.main.object(forInfoDictionaryKey: "DriftNativeBridgeVersion") as? Int == bridgeVersion else {
            fputs("Drift smoke test failed: bridge version metadata does not match.\n", stderr)
            return 1
        }
        guard Bundle.main.url(forResource: "LICENSE", withExtension: nil, subdirectory: "Legal") != nil,
              Bundle.main.url(forResource: "THIRD_PARTY_NOTICES", withExtension: "md", subdirectory: "Legal") != nil else {
            fputs("Drift smoke test failed: legal resources are missing from the bundle.\n", stderr)
            return 1
        }

        print("Drift macOS smoke test passed: bundle, web runtime, bridge, and legal resources are present.")
        return 0
    }

    private static func runNativeSelfTest() -> Int32 {
        let fileManager = FileManager.default
        let root = fileManager.temporaryDirectory.appendingPathComponent("drift-native-self-test-\(UUID().uuidString)", isDirectory: true)
        defer { try? fileManager.removeItem(at: root) }

        do {
            try fileManager.createDirectory(at: root, withIntermediateDirectories: true)
            let broker = NativeFileBroker()
            defer { broker.invalidateAll() }

            let destination = root.appendingPathComponent("master.bin")
            try Data("old".utf8).write(to: destination)
            let fileToken = try broker.grantFileForTesting(destination, writable: true)

            let opened = try dictionary(broker.handle(command: "write-open", payload: [
                "token": fileToken,
                "keepExistingData": false,
            ]))
            let session = try string(opened, key: "session")
            _ = try broker.handle(command: "write-chunk", payload: [
                "session": session,
                "position": 0,
                "data": Data("replacement".utf8).base64EncodedString(),
            ])
            _ = try broker.handle(command: "write-close", payload: ["session": session])
            guard try String(contentsOf: destination, encoding: .utf8) == "replacement" else {
                throw BridgeFailure(name: "DataError", message: "Atomic commit did not replace the destination.")
            }

            let abortOpened = try dictionary(broker.handle(command: "write-open", payload: [
                "token": fileToken,
                "keepExistingData": false,
            ]))
            let abortSession = try string(abortOpened, key: "session")
            _ = try broker.handle(command: "write-chunk", payload: [
                "session": abortSession,
                "position": 0,
                "data": Data("partial".utf8).base64EncodedString(),
            ])
            _ = try broker.handle(command: "write-abort", payload: ["session": abortSession])
            guard try String(contentsOf: destination, encoding: .utf8) == "replacement" else {
                throw BridgeFailure(name: "DataError", message: "Aborted write changed the committed destination.")
            }

            let truncateOpened = try dictionary(broker.handle(command: "write-open", payload: [
                "token": fileToken,
                "keepExistingData": true,
            ]))
            let truncateSession = try string(truncateOpened, key: "session")
            _ = try broker.handle(command: "write-truncate", payload: [
                "session": truncateSession,
                "size": 4,
            ])
            _ = try broker.handle(command: "write-close", payload: ["session": truncateSession])
            guard try String(contentsOf: destination, encoding: .utf8) == "repl" else {
                throw BridgeFailure(name: "DataError", message: "Truncate did not commit the expected bytes.")
            }

            let read = try dictionary(broker.handle(command: "file-read", payload: [
                "token": fileToken,
                "offset": 0,
                "length": 4,
            ]))
            guard Data(base64Encoded: try string(read, key: "data")) == Data("repl".utf8) else {
                throw BridgeFailure(name: "DataError", message: "Persisted-file readback did not match committed bytes.")
            }

            let exportDirectory = root.appendingPathComponent("frames", isDirectory: true)
            try fileManager.createDirectory(at: exportDirectory, withIntermediateDirectories: true)
            let directoryToken = try broker.grantDirectoryForTesting(exportDirectory)
            let child = try dictionary(broker.handle(command: "directory-get-file", payload: [
                "token": directoryToken,
                "name": "drift_000001.png",
                "create": true,
            ]))
            let childToken = try string(child, key: "token")
            let childOpened = try dictionary(broker.handle(command: "write-open", payload: [
                "token": childToken,
                "keepExistingData": false,
            ]))
            let childSession = try string(childOpened, key: "session")
            _ = try broker.handle(command: "write-chunk", payload: [
                "session": childSession,
                "position": 0,
                "data": Data([0x89, 0x50, 0x4e, 0x47]).base64EncodedString(),
            ])
            _ = try broker.handle(command: "write-close", payload: ["session": childSession])
            _ = try broker.handle(command: "directory-remove-entry", payload: [
                "token": directoryToken,
                "name": "drift_000001.png",
            ])
            guard !fileManager.fileExists(atPath: exportDirectory.appendingPathComponent("drift_000001.png").path) else {
                throw BridgeFailure(name: "DataError", message: "Directory cleanup did not remove the frame.")
            }

            do {
                _ = try broker.handle(command: "directory-get-file", payload: [
                    "token": directoryToken,
                    "name": "../escape",
                    "create": true,
                ])
                throw BridgeFailure(name: "SelfTestFailure", message: "Directory traversal was accepted.")
            } catch let failure as BridgeFailure where failure.name == "TypeError" || failure.name == "SecurityError" {
                // Expected rejection.
            }

            let symlink = exportDirectory.appendingPathComponent("link.png")
            try fileManager.createSymbolicLink(at: symlink, withDestinationURL: destination)
            do {
                _ = try broker.handle(command: "directory-get-file", payload: [
                    "token": directoryToken,
                    "name": "link.png",
                    "create": false,
                ])
                throw BridgeFailure(name: "SelfTestFailure", message: "A symbolic-link child was accepted.")
            } catch let failure as BridgeFailure where failure.name == "SecurityError" {
                // Expected rejection.
            }

            print("Drift native self-test passed: atomic commit, abort preservation, truncate, readback, directory cleanup, traversal, and symlink gates hold.")
            return 0
        } catch {
            fputs("Drift native self-test failed: \(error.localizedDescription)\n", stderr)
            return 1
        }
    }
}
