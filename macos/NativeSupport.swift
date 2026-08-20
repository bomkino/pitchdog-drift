import AppKit
import Darwin
import Foundation

let bridgeName = "driftNative"
let bridgeVersion = 2
let maximumNativeFileBytes: UInt64 = 1_073_741_824
let maximumReadChunkBytes: UInt64 = 1_048_576
let maximumWriteChunkBytes = 524_288
let maximumFileGrants = 256
let maximumDirectoryGrants = 32
let maximumWriteSessions = 8
typealias JSONDictionary = [String: Any]

struct BridgeFailure: Error {
    let name: String
    let message: String
}

enum GrantMode {
    case readOnly
    case readWrite
}
struct ClientState {
    var ready = false
    var exporting = false
    var saving = false

    var busy: Bool { exporting || saving }
}

func safeLeafName(_ value: String?, fallback: String) -> String {
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

func currentArchitecture() -> String {
    #if arch(arm64)
    return "arm64"
    #elseif arch(x86_64)
    return "x86_64"
    #else
    return "unknown"
    #endif
}

func domErrorName(for error: NSError) -> String {
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

func dictionary(_ value: Any) throws -> JSONDictionary {
    guard let value = value as? JSONDictionary else {
        throw BridgeFailure(name: "TypeError", message: "Native self-test expected a dictionary result.")
    }
    return value
}

func string(_ dictionary: JSONDictionary, key: String) throws -> String {
    guard let value = dictionary[key] as? String else {
        throw BridgeFailure(name: "TypeError", message: "Native self-test expected string field \(key).")
    }
    return value
}
