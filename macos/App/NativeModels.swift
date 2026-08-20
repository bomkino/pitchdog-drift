import Foundation
import UniformTypeIdentifiers

let driftBridgeName = "driftNative"
let driftBridgeVersion = 2
let driftBundleIdentifier = "dog.pitch.drift"
let driftMaximumReadChunkBytes = 1 * 1024 * 1024
let driftMaximumWriteChunkBytes = 512 * 1024
let driftMaximumNativeOutputBytes: UInt64 = 1 * 1024 * 1024 * 1024
let driftMaximumImportFileBytes: UInt64 = 96 * 1024 * 1024
let driftMaximumImageBatchBytes: UInt64 = 80 * 1024 * 1024
let driftMaximumGrantCount = 512
let driftJavaScriptSafeInteger = 9_007_199_254_740_991.0

typealias JSONDictionary = [String: Any]

struct BridgeFailure: Error {
    let name: String
    let message: String

    init(_ name: String, _ message: String) {
        self.name = name
        self.message = message
    }
}

enum DriftImportKind: String {
    case slides
    case presenter
    case project
}

enum GrantMode {
    case readOnly
    case readWrite
}

struct ClientState {
    var exportInProgress = false
    var projectBusy = false
    var saveState = "loading"
    var lastNotice: String?

    var hasProtectedWork: Bool {
        exportInProgress || projectBusy || saveState == "saving" || saveState == "failed" || saveState == "recovery"
    }

    var protectionReason: String {
        if exportInProgress { return "An export is still running." }
        if projectBusy { return "Drift is still opening, hashing, or saving project media." }
        if saveState == "saving" { return "Local project changes are still being saved." }
        if saveState == "failed" { return "The latest local save failed." }
        if saveState == "recovery" { return "A saved project is in recovery lock." }
        return "Drift still has protected work."
    }

    mutating func update(from payload: JSONDictionary) {
        if let value = payload["exportInProgress"] as? Bool { exportInProgress = value }
        if let value = payload["projectBusy"] as? Bool { projectBusy = value }
        if let value = payload["saveState"] as? String { saveState = value }
        if let value = payload["lastNotice"] as? String { lastNotice = String(value.prefix(2_000)) }
    }
}

func successEnvelope(_ value: Any = [:]) -> JSONDictionary {
    ["ok": true, "value": value]
}

func failureEnvelope(_ failure: BridgeFailure) -> JSONDictionary {
    [
        "ok": false,
        "error": ["name": failure.name, "message": failure.message],
    ]
}

func failureEnvelope(_ error: Error) -> JSONDictionary {
    let nsError = error as NSError
    return failureEnvelope(BridgeFailure(domErrorName(for: nsError), nsError.localizedDescription))
}

func requiredString(_ payload: JSONDictionary, _ key: String) throws -> String {
    guard let value = payload[key] as? String, !value.isEmpty else {
        throw BridgeFailure("TypeError", "Native command field ‘\(key)’ must be a non-empty string.")
    }
    return value
}

func optionalString(_ payload: JSONDictionary, _ key: String) -> String? {
    guard let value = payload[key] as? String, !value.isEmpty else { return nil }
    return value
}

func requiredOffset(_ payload: JSONDictionary, _ key: String) throws -> UInt64 {
    guard let number = payload[key] as? NSNumber else {
        throw BridgeFailure("TypeError", "Native command field ‘\(key)’ must be a number.")
    }
    let value = number.doubleValue
    guard value.isFinite,
          value >= 0,
          value.rounded(.towardZero) == value,
          value <= driftJavaScriptSafeInteger else {
        throw BridgeFailure("TypeError", "Native command field ‘\(key)’ must be a non-negative safe integer.")
    }
    return UInt64(value)
}

func stringArray(_ payload: JSONDictionary, _ key: String, maximum: Int = 64) -> [String] {
    guard let values = payload[key] as? [Any] else { return [] }
    return values.prefix(maximum).compactMap { value in
        guard let string = value as? String, !string.isEmpty else { return nil }
        return String(string.prefix(512))
    }
}

func safeLeafName(_ value: String?, fallback: String) -> String {
    guard let value else { return fallback }
    let scalars = value.unicodeScalars.filter { scalar in
        scalar != "/" && scalar != "\\" && !CharacterSet.controlCharacters.contains(scalar)
    }
    let cleaned = String(String.UnicodeScalarView(scalars))
        .trimmingCharacters(in: .whitespacesAndNewlines)
    guard !cleaned.isEmpty, cleaned != ".", cleaned != ".." else { return fallback }
    return String(cleaned.prefix(240))
}

func validatedChildName(_ value: String) throws -> String {
    let cleaned = safeLeafName(value, fallback: "")
    guard !cleaned.isEmpty, cleaned == value else {
        throw BridgeFailure("TypeError", "File names may not contain path separators, control characters, or traversal segments.")
    }
    return cleaned
}

func mimeType(for url: URL) -> String {
    UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
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
    guard error.domain == NSCocoaErrorDomain || error.domain == NSPOSIXErrorDomain else {
        return "InvalidStateError"
    }

    switch error.code {
    case NSFileNoSuchFileError, NSFileReadNoSuchFileError, Int(ENOENT):
        return "NotFoundError"
    case NSFileReadNoPermissionError, NSFileWriteNoPermissionError, Int(EACCES), Int(EPERM):
        return "NotAllowedError"
    case NSFileWriteFileExistsError, Int(EEXIST):
        return "InvalidModificationError"
    case NSFileWriteOutOfSpaceError, Int(ENOSPC):
        return "QuotaExceededError"
    default:
        return "InvalidStateError"
    }
}

func fileSize(at url: URL, fileManager: FileManager = .default) throws -> UInt64 {
    let attributes = try fileManager.attributesOfItem(atPath: url.path)
    return (attributes[.size] as? NSNumber)?.uint64Value ?? 0
}

func ensureLocalFileURL(_ url: URL) throws -> URL {
    guard url.isFileURL else {
        throw BridgeFailure("SecurityError", "Drift only accepts local files selected through macOS.")
    }
    return url.standardizedFileURL
}

func isSymbolicLink(_ url: URL) -> Bool {
    (try? url.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) == true
}

func appVersionString() -> String {
    let short = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
    return "\(short) (\(build))"
}
