import Foundation

enum NativePortableProjectPhase: String, Equatable {
    case idle
    case opening
    case saving
    case reverting
    case conflict
    case recovery
}

struct NativePortableProjectReadbackReceipt: Equatable {
    let archiveDigest: String
    let readbackDigest: String
    let fileVersion: String
    let byteCount: UInt64
}

struct NativePortableProjectSaveReceipt: Equatable {
    let generatedDigest: String
    let stagedReadbackDigest: String
    let committedReadbackDigest: String
    let fileVersion: String
    let byteCount: UInt64
}

struct NativePortableProjectBinding: Equatable {
    let url: URL
    let archiveDigest: String
    let fileVersion: String
    let byteCount: UInt64
    let savedRevision: UInt64
}

struct NativePortableProjectOpenTicket: Equatable {
    let sequence: UInt64
    let candidateURL: URL
}

struct NativePortableProjectSaveTicket: Equatable {
    let sequence: UInt64
    let revision: UInt64
    let destinationURL: URL
    let expectedFileVersion: String?
    let isSaveAs: Bool
}

struct NativePortableProjectRevertTicket: Equatable {
    let sequence: UInt64
    let binding: NativePortableProjectBinding
}

struct NativePortableProjectConflict: Equatable {
    let destinationURL: URL
    let expectedFileVersion: String?
    let observedFileVersion: String?
    let operationSequence: UInt64
}

/// AppKit-owned portable-project lifecycle state.
///
/// This state is deliberately independent from `NativeDocumentSession`, which
/// authorizes one WK document generation. A WebContent replacement must revoke
/// renderer capabilities and abort an incomplete save without forgetting the
/// last native-verified `.pitched` binding.
final class NativePortableProjectSession {
    private enum PendingOperation: Equatable {
        case opening(NativePortableProjectOpenTicket)
        case saving(NativePortableProjectSaveTicket)
        case reverting(NativePortableProjectRevertTicket)
    }

    private(set) var currentRevision: UInt64
    private(set) var savedRevision: UInt64
    private(set) var binding: NativePortableProjectBinding?
    private(set) var conflict: NativePortableProjectConflict?
    private var pendingOperation: PendingOperation?
    private var recovering = false
    private var nextSequence: UInt64 = 0

    init(initialRevision: UInt64 = 0) {
        currentRevision = initialRevision
        savedRevision = initialRevision
    }

    var phase: NativePortableProjectPhase {
        if recovering { return .recovery }
        switch pendingOperation {
        case .opening: return .opening
        case .saving: return .saving
        case .reverting: return .reverting
        case nil: return conflict == nil ? .idle : .conflict
        }
    }

    var isUntitled: Bool { binding == nil }
    var isDirty: Bool { currentRevision != savedRevision }
    var canRevert: Bool {
        binding != nil && isDirty && pendingOperation == nil && !recovering && conflict == nil
    }
    var hasInFlightSave: Bool {
        if case .saving = pendingOperation { return true }
        return false
    }

    func recordMutation() throws {
        precondition(Thread.isMainThread)
        guard !recovering else {
            throw BridgeFailure("InvalidStateError", "Project edits are unavailable during WebContent recovery.")
        }
        if case .opening = pendingOperation {
            throw BridgeFailure("InvalidStateError", "Project edits are unavailable while another project is opening.")
        }
        if case .reverting = pendingOperation {
            throw BridgeFailure("InvalidStateError", "Project edits are unavailable while reverting to the saved project.")
        }
        let incremented = currentRevision.addingReportingOverflow(1)
        guard !incremented.overflow else {
            throw BridgeFailure("InvalidStateError", "Portable-project revision counter overflowed.")
        }
        currentRevision = incremented.partialValue
    }

    func beginOpen(at rawURL: URL) throws -> NativePortableProjectOpenTicket {
        precondition(Thread.isMainThread)
        try requireNoPendingOperation(allowConflict: true)
        let ticket = NativePortableProjectOpenTicket(
            sequence: try issueSequence(),
            candidateURL: try normalizedProjectURL(rawURL)
        )
        pendingOperation = .opening(ticket)
        return ticket
    }

    func completeOpen(
        _ ticket: NativePortableProjectOpenTicket,
        importedRevision: UInt64,
        receipt: NativePortableProjectReadbackReceipt
    ) throws {
        precondition(Thread.isMainThread)
        try requirePending(.opening(ticket))
        do {
            try validate(receipt)
        } catch {
            pendingOperation = nil
            throw error
        }
        let verifiedBinding = NativePortableProjectBinding(
            url: ticket.candidateURL,
            archiveDigest: receipt.archiveDigest,
            fileVersion: receipt.fileVersion,
            byteCount: receipt.byteCount,
            savedRevision: importedRevision
        )
        binding = verifiedBinding
        currentRevision = importedRevision
        savedRevision = importedRevision
        conflict = nil
        pendingOperation = nil
    }

    func cancelOpen(_ ticket: NativePortableProjectOpenTicket) throws {
        precondition(Thread.isMainThread)
        try requirePending(.opening(ticket))
        pendingOperation = nil
    }

    func failOpen(_ ticket: NativePortableProjectOpenTicket) throws {
        try cancelOpen(ticket)
    }

    func beginSave() throws -> NativePortableProjectSaveTicket {
        precondition(Thread.isMainThread)
        guard let binding else {
            throw BridgeFailure("InvalidStateError", "An untitled project requires Save As before Save.")
        }
        guard conflict == nil else {
            throw BridgeFailure("InvalidModificationError", "The bound project changed externally; Save As or explicitly reopen it.")
        }
        return try beginSave(
            destinationURL: binding.url,
            expectedFileVersion: binding.fileVersion,
            isSaveAs: false,
            allowConflict: false
        )
    }

    func beginSaveAs(to rawURL: URL) throws -> NativePortableProjectSaveTicket {
        precondition(Thread.isMainThread)
        return try beginSave(
            destinationURL: normalizedProjectURL(rawURL),
            expectedFileVersion: nil,
            isSaveAs: true,
            allowConflict: true
        )
    }

    func completeSave(
        _ ticket: NativePortableProjectSaveTicket,
        receipt: NativePortableProjectSaveReceipt
    ) throws {
        precondition(Thread.isMainThread)
        try requirePending(.saving(ticket))
        do {
            try validate(receipt)
        } catch {
            pendingOperation = nil
            throw error
        }
        binding = NativePortableProjectBinding(
            url: ticket.destinationURL,
            archiveDigest: receipt.committedReadbackDigest,
            fileVersion: receipt.fileVersion,
            byteCount: receipt.byteCount,
            savedRevision: ticket.revision
        )
        savedRevision = ticket.revision
        conflict = nil
        pendingOperation = nil
    }

    func cancelSave(_ ticket: NativePortableProjectSaveTicket) throws {
        precondition(Thread.isMainThread)
        try requirePending(.saving(ticket))
        pendingOperation = nil
    }

    func failSave(_ ticket: NativePortableProjectSaveTicket) throws {
        try cancelSave(ticket)
    }

    func reportExternalConflict(
        _ ticket: NativePortableProjectSaveTicket,
        observedFileVersion: String?
    ) throws {
        precondition(Thread.isMainThread)
        try requirePending(.saving(ticket))
        pendingOperation = nil
        conflict = NativePortableProjectConflict(
            destinationURL: ticket.destinationURL,
            expectedFileVersion: ticket.expectedFileVersion,
            observedFileVersion: observedFileVersion,
            operationSequence: ticket.sequence
        )
    }

    func beginRevert() throws -> NativePortableProjectRevertTicket {
        precondition(Thread.isMainThread)
        guard canRevert, let binding else {
            throw BridgeFailure("InvalidStateError", "Only a dirty, bound, conflict-free project can revert to saved bytes.")
        }
        let ticket = NativePortableProjectRevertTicket(
            sequence: try issueSequence(),
            binding: binding
        )
        pendingOperation = .reverting(ticket)
        return ticket
    }

    func completeRevert(
        _ ticket: NativePortableProjectRevertTicket,
        receipt: NativePortableProjectReadbackReceipt
    ) throws {
        precondition(Thread.isMainThread)
        try requirePending(.reverting(ticket))
        do {
            try validate(receipt)
            guard receipt.archiveDigest == ticket.binding.archiveDigest,
                  receipt.fileVersion == ticket.binding.fileVersion else {
                throw BridgeFailure(
                    "InvalidModificationError",
                    "The bound project changed externally before Revert could verify its saved bytes."
                )
            }
        } catch {
            pendingOperation = nil
            if let failure = error as? BridgeFailure,
               failure.name == "InvalidModificationError" {
                conflict = NativePortableProjectConflict(
                    destinationURL: ticket.binding.url,
                    expectedFileVersion: ticket.binding.fileVersion,
                    observedFileVersion: receipt.fileVersion,
                    operationSequence: ticket.sequence
                )
            }
            throw error
        }
        currentRevision = ticket.binding.savedRevision
        savedRevision = ticket.binding.savedRevision
        conflict = nil
        pendingOperation = nil
    }

    func cancelRevert(_ ticket: NativePortableProjectRevertTicket) throws {
        precondition(Thread.isMainThread)
        try requirePending(.reverting(ticket))
        pendingOperation = nil
    }

    /// Begins one WebContent recovery generation. Any renderer-owned operation
    /// is abandoned, but the last committed native binding remains authoritative.
    @discardableResult
    func beginWebContentRecovery() -> NativePortableProjectSaveTicket? {
        precondition(Thread.isMainThread)
        let interruptedSave: NativePortableProjectSaveTicket?
        if case .saving(let ticket) = pendingOperation {
            interruptedSave = ticket
        } else {
            interruptedSave = nil
        }
        pendingOperation = nil
        recovering = true
        return interruptedSave
    }

    func completeWebContentRecovery(restoredRevision: UInt64) throws {
        precondition(Thread.isMainThread)
        guard recovering else {
            throw BridgeFailure("InvalidStateError", "No WebContent recovery is active.")
        }
        guard restoredRevision == currentRevision else {
            throw BridgeFailure(
                "DataError",
                "Recovered renderer revision did not match the native-owned project revision."
            )
        }
        recovering = false
    }

    private func beginSave(
        destinationURL: URL,
        expectedFileVersion: String?,
        isSaveAs: Bool,
        allowConflict: Bool
    ) throws -> NativePortableProjectSaveTicket {
        try requireNoPendingOperation(allowConflict: allowConflict)
        let ticket = NativePortableProjectSaveTicket(
            sequence: try issueSequence(),
            revision: currentRevision,
            destinationURL: destinationURL,
            expectedFileVersion: expectedFileVersion,
            isSaveAs: isSaveAs
        )
        pendingOperation = .saving(ticket)
        return ticket
    }

    private func requireNoPendingOperation(allowConflict: Bool) throws {
        guard pendingOperation == nil, !recovering else {
            throw BridgeFailure("InvalidStateError", "Finish the current portable-project operation first.")
        }
        guard allowConflict || conflict == nil else {
            throw BridgeFailure("InvalidModificationError", "Resolve the external project conflict first.")
        }
    }

    private func requirePending(_ expected: PendingOperation) throws {
        guard pendingOperation == expected else {
            throw BridgeFailure("InvalidStateError", "That portable-project operation ticket is stale.")
        }
    }

    private func issueSequence() throws -> UInt64 {
        let incremented = nextSequence.addingReportingOverflow(1)
        guard !incremented.overflow else {
            throw BridgeFailure("InvalidStateError", "Portable-project operation counter overflowed.")
        }
        nextSequence = incremented.partialValue
        return nextSequence
    }

    private func normalizedProjectURL(_ rawURL: URL) throws -> URL {
        guard rawURL.isFileURL,
              rawURL.pathExtension.lowercased() == "pitched" else {
            throw BridgeFailure("TypeMismatchError", "Portable projects require one local .pitched destination.")
        }
        return rawURL.standardizedFileURL
    }

    private func validate(_ receipt: NativePortableProjectReadbackReceipt) throws {
        try validateReceiptFacts(
            digests: [receipt.archiveDigest, receipt.readbackDigest],
            fileVersion: receipt.fileVersion,
            byteCount: receipt.byteCount
        )
        guard receipt.archiveDigest == receipt.readbackDigest else {
            throw BridgeFailure("DataError", "Portable-project native readback did not match the admitted archive digest.")
        }
    }

    private func validate(_ receipt: NativePortableProjectSaveReceipt) throws {
        try validateReceiptFacts(
            digests: [
                receipt.generatedDigest,
                receipt.stagedReadbackDigest,
                receipt.committedReadbackDigest,
            ],
            fileVersion: receipt.fileVersion,
            byteCount: receipt.byteCount
        )
        guard receipt.generatedDigest == receipt.stagedReadbackDigest,
              receipt.generatedDigest == receipt.committedReadbackDigest else {
            throw BridgeFailure("DataError", "Portable-project staged or committed readback did not match generated bytes.")
        }
    }

    private func validateReceiptFacts(
        digests: [String],
        fileVersion: String,
        byteCount: UInt64
    ) throws {
        guard digests.allSatisfy({ digest in
            digest.range(of: #"^[a-f0-9]{64}$"#, options: .regularExpression) != nil
        }) else {
            throw BridgeFailure("DataError", "Portable-project verification requires canonical SHA-256 digests.")
        }
        guard !fileVersion.isEmpty,
              fileVersion.utf8.count <= 512,
              fileVersion.rangeOfCharacter(from: .controlCharacters) == nil else {
            throw BridgeFailure("DataError", "Portable-project verification requires one bounded native file version.")
        }
        guard byteCount > 0, byteCount <= driftMaximumProjectArchiveBytes else {
            throw BridgeFailure("QuotaExceededError", "Verified portable-project bytes exceed the native archive budget.")
        }
    }

    static func runSelfTest() throws {
        let digestA = String(repeating: "a", count: 64)
        let digestB = String(repeating: "b", count: 64)
        let digestC = String(repeating: "c", count: 64)
        let oldURL = URL(fileURLWithPath: "/tmp/drift-native-project-old.pitched")
        let newURL = URL(fileURLWithPath: "/tmp/drift-native-project-new.pitched")
        let failedURL = URL(fileURLWithPath: "/tmp/drift-native-project-failed.pitched")

        let untitled = NativePortableProjectSession()
        try require(untitled.isUntitled && !untitled.isDirty && !untitled.canRevert, "fresh untitled state was not clean")
        try untitled.recordMutation()
        try require(untitled.isDirty && !untitled.canRevert, "untitled edits incorrectly became revertible")
        try expectFailure("InvalidStateError", "untitled Save") { _ = try untitled.beginSave() }

        let openSession = NativePortableProjectSession()
        let rejectedOpen = try openSession.beginOpen(at: oldURL)
        try require(openSession.binding == nil && openSession.phase == .opening, "Open bound a project before verified import")
        try expectFailure("DataError", "mismatched Open readback") {
            try openSession.completeOpen(
                rejectedOpen,
                importedRevision: 7,
                receipt: NativePortableProjectReadbackReceipt(
                    archiveDigest: digestA,
                    readbackDigest: digestB,
                    fileVersion: "old-v1",
                    byteCount: 1_024
                )
            )
        }
        try require(openSession.binding == nil && openSession.phase == .idle, "rejected Open changed the native binding")

        let acceptedOpen = try openSession.beginOpen(at: oldURL)
        try openSession.completeOpen(
            acceptedOpen,
            importedRevision: 7,
            receipt: readReceipt(digest: digestA, fileVersion: "old-v1")
        )
        let openedBinding = try requireBinding(openSession)
        try require(!openSession.isUntitled && !openSession.isDirty, "verified Open did not create one clean binding")
        try require(openedBinding.archiveDigest == digestA && openedBinding.savedRevision == 7, "verified Open lost digest or revision truth")

        try openSession.recordMutation()
        let save = try openSession.beginSave()
        try require(save.revision == 8 && openSession.hasInFlightSave, "Save ticket did not capture the exact dirty revision")
        try openSession.recordMutation()
        try openSession.completeSave(
            save,
            receipt: saveReceipt(digest: digestB, fileVersion: "old-v2")
        )
        try require(openSession.savedRevision == 8 && openSession.currentRevision == 9, "Save completion cleaned an edit made during Save")
        try require(openSession.isDirty && openSession.binding?.archiveDigest == digestB, "verified Save lost committed digest or dirty state")

        let bindingBeforeCancelledSaveAs = try requireBinding(openSession)
        let cancelledSaveAs = try openSession.beginSaveAs(to: newURL)
        try openSession.cancelSave(cancelledSaveAs)
        try require(openSession.binding == bindingBeforeCancelledSaveAs && openSession.isDirty, "Save As cancellation changed the old binding")
        let failedSaveAs = try openSession.beginSaveAs(to: failedURL)
        try openSession.failSave(failedSaveAs)
        try require(openSession.binding == bindingBeforeCancelledSaveAs && openSession.isDirty, "Save As failure changed the old binding")

        let unverifiedSaveAs = try openSession.beginSaveAs(to: newURL)
        try expectFailure("DataError", "mismatched staged Save As readback") {
            try openSession.completeSave(
                unverifiedSaveAs,
                receipt: NativePortableProjectSaveReceipt(
                    generatedDigest: digestC,
                    stagedReadbackDigest: digestB,
                    committedReadbackDigest: digestC,
                    fileVersion: "new-v1",
                    byteCount: 2_048
                )
            )
        }
        try require(openSession.binding == bindingBeforeCancelledSaveAs && openSession.isDirty, "unverified Save As replaced the old binding")

        try require(openSession.canRevert, "dirty bound project was not revertible")
        let revert = try openSession.beginRevert()
        try openSession.completeRevert(
            revert,
            receipt: readReceipt(digest: digestB, fileVersion: "old-v2")
        )
        try require(!openSession.isDirty && !openSession.canRevert, "verified Revert did not restore the saved revision")

        try openSession.recordMutation()
        let conflictingSave = try openSession.beginSave()
        try openSession.reportExternalConflict(conflictingSave, observedFileVersion: "external-v3")
        try require(openSession.phase == .conflict && openSession.isDirty, "external conflict did not preserve dirty work")
        try require(openSession.binding?.fileVersion == "old-v2", "external conflict replaced the last committed binding")

        let conflictResolvingSaveAs = try openSession.beginSaveAs(to: newURL)
        try require(openSession.phase == .saving, "conflict-resolving Save As did not become the active operation")
        try openSession.completeSave(
            conflictResolvingSaveAs,
            receipt: saveReceipt(digest: digestC, fileVersion: "new-v1")
        )
        try require(openSession.phase == .idle && !openSession.isDirty, "verified Save As did not resolve external conflict")
        try require(openSession.binding?.url == newURL.standardizedFileURL, "Save As did not bind its verified destination")

        try openSession.recordMutation()
        let recoveryBinding = try requireBinding(openSession)
        let interruptedSave = try openSession.beginSave()
        let aborted = openSession.beginWebContentRecovery()
        try require(aborted == interruptedSave && !openSession.hasInFlightSave, "WebContent recovery did not abort the in-flight Save")
        try require(openSession.phase == .recovery && openSession.binding == recoveryBinding, "WebContent recovery forgot the last committed binding")
        try require(openSession.isDirty, "WebContent recovery falsely cleaned uncommitted work")
        try openSession.completeWebContentRecovery(restoredRevision: openSession.currentRevision)
        try require(openSession.phase == .idle && openSession.binding == recoveryBinding, "completed recovery changed native-owned committed truth")

        print("Drift portable-project lifecycle self-test passed: untitled, verified Open, revisioned Save, Save As preservation, Revert, conflict, exact readback, and WebContent recovery contracts hold.")
    }

    private static func readReceipt(
        digest: String,
        fileVersion: String
    ) -> NativePortableProjectReadbackReceipt {
        NativePortableProjectReadbackReceipt(
            archiveDigest: digest,
            readbackDigest: digest,
            fileVersion: fileVersion,
            byteCount: 2_048
        )
    }

    private static func saveReceipt(
        digest: String,
        fileVersion: String
    ) -> NativePortableProjectSaveReceipt {
        NativePortableProjectSaveReceipt(
            generatedDigest: digest,
            stagedReadbackDigest: digest,
            committedReadbackDigest: digest,
            fileVersion: fileVersion,
            byteCount: 2_048
        )
    }

    private static func requireBinding(
        _ session: NativePortableProjectSession
    ) throws -> NativePortableProjectBinding {
        guard let binding = session.binding else {
            throw BridgeFailure("DataError", "Portable-project self-test expected one native binding.")
        }
        return binding
    }

    private static func require(
        _ condition: @autoclosure () -> Bool,
        _ message: String
    ) throws {
        guard condition() else { throw BridgeFailure("DataError", message) }
    }

    private static func expectFailure(
        _ expectedName: String,
        _ label: String,
        operation: () throws -> Void
    ) throws {
        do {
            try operation()
        } catch let failure as BridgeFailure {
            guard failure.name == expectedName else {
                throw BridgeFailure(
                    "DataError",
                    "Portable-project self-test \(label) failed as \(failure.name), expected \(expectedName)."
                )
            }
            return
        }
        throw BridgeFailure("DataError", "Portable-project self-test expected \(label) to fail.")
    }
}
