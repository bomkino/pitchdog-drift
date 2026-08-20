import Foundation
import UniformTypeIdentifiers

let driftBridgeName = "driftNative"
let driftBridgeVersion = 2
let driftBundleIdentifier = "dog.pitch.drift"
let driftMaximumReadChunkBytes = 1 * 1024 * 1024
let driftMaximumWriteChunkBytes = 512 * 1024
// MP4 verification currently reopens the completed native file as one Blob.
// Refuse a destination larger than the same readback ceiling before a user
// spends minutes rendering an artifact Drift would have to neutralize later.
let driftMaximumNativeOutputBytes: UInt64 = 512 * 1024 * 1024
// These three limits mirror DEFAULT_PROJECT_BUNDLE_LIMITS in projectStore.ts.
// A native picker must never admit media that the verified portable-project
// format cannot autosave, export, and reopen.
let driftMaximumProjectArchiveBytes: UInt64 = 96 * 1024 * 1024
let driftMaximumProjectAssetBytes: UInt64 = 64 * 1024 * 1024
let driftMaximumProjectTotalAssetBytes: UInt64 = 80 * 1024 * 1024
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

struct WebContentRecoveryPolicy {
    private(set) var consumedAttempts = 0

    var hasRemainingAttempt: Bool {
        consumedAttempts == 0
    }

    mutating func consumeAttempt() -> Bool {
        guard hasRemainingAttempt else { return false }
        consumedAttempts = 1
        return true
    }

    mutating func reset() {
        consumedAttempts = 0
    }
}

struct ClientState {
    var exportInProgress = false
    // Native menus and protected-exit logic must remain locked until React has
    // emitted its first authoritative state snapshot. A finished HTML
    // navigation is not evidence that the studio, project store, or typed app
    // bridge is ready.
    var projectBusy = true
    var saveState = "loading"
    // Renderer notices can contain confidential project or media filenames.
    // Native diagnostics need only know whether one exists; never carry the
    // notice text across the privileged boundary.
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
        if let value = payload["saveState"] as? String,
           ["loading", "saving", "saved", "failed", "recovery"].contains(value) {
            saveState = value
        }
        if let value = payload["lastNotice"] as? String {
            lastNotice = value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? nil
                : "present (content withheld)"
        } else if payload.keys.contains("lastNotice") {
            lastNotice = nil
        }
    }

    mutating func reserveExternalProjectImport() -> Bool {
        guard !hasProtectedWork else { return false }
        projectBusy = true
        return true
    }

    mutating func releaseExternalProjectImportReservation() {
        projectBusy = false
    }

    static func runExternalProjectImportAdmissionSelfTest() throws {
        var idle = ClientState(
            exportInProgress: false,
            projectBusy: false,
            saveState: "saved",
            lastNotice: nil
        )
        guard idle.reserveExternalProjectImport(), idle.projectBusy else {
            throw BridgeFailure("DataError", "An idle studio could not reserve one external project import.")
        }
        guard !idle.reserveExternalProjectImport() else {
            throw BridgeFailure("DataError", "A second external project import bypassed the active reservation.")
        }
        idle.releaseExternalProjectImportReservation()
        guard !idle.projectBusy else {
            throw BridgeFailure("DataError", "A failed external project import did not release its reservation.")
        }

        for protected in [
            ClientState(exportInProgress: true, projectBusy: false, saveState: "saved", lastNotice: nil),
            ClientState(exportInProgress: false, projectBusy: true, saveState: "saved", lastNotice: nil),
            ClientState(exportInProgress: false, projectBusy: false, saveState: "saving", lastNotice: nil),
            ClientState(exportInProgress: false, projectBusy: false, saveState: "failed", lastNotice: nil),
            ClientState(exportInProgress: false, projectBusy: false, saveState: "recovery", lastNotice: nil),
        ] {
            var candidate = protected
            guard !candidate.reserveExternalProjectImport() else {
                throw BridgeFailure("DataError", "Protected work admitted an external project replacement.")
            }
        }

        print("Drift external-project admission self-test passed: one idle reservation, no concurrent replacement, failure release, and protected-state rejection hold.")
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
    guard let value = payload[key] as? String,
          !value.isEmpty,
          value.utf8.count <= 4_096 else {
        throw BridgeFailure(
            "TypeError",
            "Native command field ‘\(key)’ must be a bounded, non-empty string."
        )
    }
    return value
}

func optionalString(_ payload: JSONDictionary, _ key: String) -> String? {
    guard let value = payload[key] as? String,
          !value.isEmpty,
          value.utf8.count <= 4_096 else { return nil }
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
        throw BridgeFailure(
            "TypeError",
            "File names may not contain path separators, control characters, or traversal segments."
        )
    }
    return cleaned
}

func mimeType(for url: URL) -> String {
    if url.pathExtension.lowercased() == "pitched" {
        return "application/vnd.pitchdog.pitched+zip"
    }
    return UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
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

/// Defines the only local document that may use Drift's privileged native
/// message handler. `forMainFrameOnly` prevents iframe access; this boundary
/// also prevents a later `data:`, `blob:`, remote, sibling, or traversed main
/// frame from inheriting the file and codec capabilities of the signed studio.
enum TrustedWebRuntime {
    static func bundledIndexURL(bundle: Bundle = .main) -> URL? {
        bundle.url(
            forResource: "index",
            withExtension: "html",
            subdirectory: "Web"
        )?.standardizedFileURL
    }

    static func acceptsMainFrameURL(
        _ candidateURL: URL?,
        trustedIndexURL: URL?
    ) -> Bool {
        guard let candidateURL,
              candidateURL.isFileURL,
              let trustedIndexURL,
              trustedIndexURL.isFileURL else {
            return false
        }

        return resolvedFilePath(candidateURL) == resolvedFilePath(trustedIndexURL)
    }

    static func runSelfTest() throws {
        let manager = FileManager.default
        let root = manager.temporaryDirectory.appendingPathComponent(
            "drift-trusted-web-runtime-\(UUID().uuidString)",
            isDirectory: true
        )
        let webRoot = root.appendingPathComponent("Web", isDirectory: true)
        try manager.createDirectory(at: webRoot, withIntermediateDirectories: true)
        defer { try? manager.removeItem(at: root) }

        let trustedIndex = webRoot.appendingPathComponent("index.html", isDirectory: false)
        let siblingDocument = webRoot.appendingPathComponent("diagnostic.html", isDirectory: false)
        let outsideDocument = root.appendingPathComponent("outside.html", isDirectory: false)
        try Data("trusted".utf8).write(to: trustedIndex)
        try Data("sibling".utf8).write(to: siblingDocument)
        try Data("outside".utf8).write(to: outsideDocument)

        try require(
            acceptsMainFrameURL(trustedIndex, trustedIndexURL: trustedIndex),
            "the signed studio index was rejected"
        )

        var fragmentComponents = URLComponents(
            url: trustedIndex,
            resolvingAgainstBaseURL: false
        )
        fragmentComponents?.fragment = "focus"
        try require(
            acceptsMainFrameURL(fragmentComponents?.url, trustedIndexURL: trustedIndex),
            "a same-document fragment rejected the signed studio index"
        )

        let rejectedCandidates: [(String, URL?)] = [
            ("missing URL", nil),
            ("data document", URL(string: "data:text/html,untrusted")),
            ("blob document", URL(string: "blob:null/untrusted")),
            ("remote document", URL(string: "https://example.invalid/")),
            ("sibling document", siblingDocument),
            ("prefix lookalike", webRoot.appendingPathComponent("index.html.attacker")),
            ("traversed document", webRoot.appendingPathComponent("../outside.html").standardizedFileURL),
        ]
        for (label, candidate) in rejectedCandidates {
            try require(
                !acceptsMainFrameURL(candidate, trustedIndexURL: trustedIndex),
                "\(label) inherited the privileged native bridge"
            )
        }

        print("Drift trusted WebKit main-frame self-test passed.")
    }

    private static func resolvedFilePath(_ url: URL) -> String {
        URL(fileURLWithPath: url.standardizedFileURL.path)
            .resolvingSymlinksInPath()
            .path
    }

    private static func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
        if !condition() { throw BridgeFailure("SecurityError", message) }
    }
}

/// Brackets only the user-requested export window. This keeps WebKit rendering
/// out of App Nap and prevents idle system sleep without forcing the display to
/// remain lit. Every terminal path calls `end()`; deinitialisation is the final
/// safety net against a stranded power assertion.
final class ExportActivityGuard {
    private let processInfo: ProcessInfo
    private var activity: NSObjectProtocol?
    private(set) var isActive = false

    init(processInfo: ProcessInfo = .processInfo) {
        self.processInfo = processInfo
    }

    deinit {
        end()
    }

    func update(isExporting: Bool) {
        if isExporting {
            beginIfNeeded()
        } else {
            end()
        }
    }

    func end() {
        guard let activity else {
            isActive = false
            return
        }
        processInfo.endActivity(activity)
        self.activity = nil
        isActive = false
    }

    static func runSelfTest() throws {
        let activityGuard = ExportActivityGuard()
        try require(!activityGuard.isActive, "export activity started before an export")

        activityGuard.update(isExporting: true)
        try require(activityGuard.isActive, "export activity did not start")
        activityGuard.update(isExporting: true)
        try require(activityGuard.isActive, "duplicate export state ended the activity")

        activityGuard.update(isExporting: false)
        try require(!activityGuard.isActive, "export activity survived completion")
        activityGuard.update(isExporting: false)
        try require(!activityGuard.isActive, "idempotent export cleanup restarted the activity")

        print("Drift export power-activity self-test passed.")
    }

    private func beginIfNeeded() {
        guard activity == nil else {
            isActive = true
            return
        }
        activity = processInfo.beginActivity(
            options: [
                .userInitiated,
                .idleSystemSleepDisabled,
                .suddenTerminationDisabled,
                .automaticTerminationDisabled,
            ],
            reason: "Drift is rendering a user-requested export."
        )
        isActive = true
    }

    private static func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
        if !condition() { throw BridgeFailure("InvalidStateError", message) }
    }
}
