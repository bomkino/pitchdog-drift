import Foundation

struct NativeDocumentTicket: Equatable {
    let nonce: UUID
    let epoch: UInt64

    var nonceString: String { nonce.uuidString.lowercased() }
}

struct NativePanelTicket: Equatable {
    let identifier: UUID
    let document: NativeDocumentTicket
}

struct NativeDocumentMutationTicket: Equatable {
    let identifier: UUID
    let document: NativeDocumentTicket
}

/// AppKit owns document authority. Web content can claim only the exact,
/// one-use ticket prepared for the currently committed bundled document.
///
/// Mutation remains a main-thread concern because panel cancellation touches
/// AppKit. Read-only generation checks are lock-protected so queued broker and
/// codec work can reject a stale document before touching native state.
final class NativeDocumentSession {
    private let condition = NSCondition()
    private var nextEpoch: UInt64 = 0
    private var pendingBootstrap: NativeDocumentTicket?
    private var activeDocument: NativeDocumentTicket?
    private var activePanel: NativePanelTicket?
    private var activePanelCancellation: (() -> Void)?
    private var revocationPending = false
    private var activeIrreversibleOperations: [UUID: NativeDocumentTicket] = [:]

    func prepareBootstrap() throws -> NativeDocumentTicket {
        precondition(Thread.isMainThread)
        let cancellation: (() -> Void)?
        let ticket: NativeDocumentTicket
        condition.lock()
        let incremented = nextEpoch.addingReportingOverflow(1)
        guard !incremented.overflow else {
            condition.unlock()
            throw BridgeFailure("InvalidStateError", "Native document generation counter overflowed.")
        }
        beginRevocationLocked()
        cancellation = clearActivePanelLocked()
        nextEpoch = incremented.partialValue
        ticket = NativeDocumentTicket(nonce: UUID(), epoch: nextEpoch)
        pendingBootstrap = ticket
        activeDocument = nil
        revocationPending = false
        condition.broadcast()
        condition.unlock()
        cancellation?()
        return ticket
    }

    func claimBootstrap(rawNonce: String) throws -> NativeDocumentTicket {
        precondition(Thread.isMainThread)
        let nonce = try parseNonce(rawNonce)
        condition.lock()
        defer { condition.unlock() }
        guard !revocationPending else {
            throw BridgeFailure("SecurityError", "Document authority is being revoked.")
        }
        if let activeDocument, activeDocument.nonce == nonce {
            throw BridgeFailure(
                "InvalidStateError",
                "A Drift document may bootstrap the native bridge only once."
            )
        }
        guard let pendingBootstrap, pendingBootstrap.nonce == nonce else {
            throw BridgeFailure(
                "SecurityError",
                "That bootstrap token was not issued to the currently committed Drift document."
            )
        }
        self.pendingBootstrap = nil
        activeDocument = pendingBootstrap
        return pendingBootstrap
    }

    func validateMessage(rawNonce: String) throws -> NativeDocumentTicket {
        let nonce = try parseNonce(rawNonce)
        condition.lock()
        defer { condition.unlock() }
        guard !revocationPending,
              let activeDocument,
              activeDocument.nonce == nonce else {
            throw BridgeFailure(
                "SecurityError",
                "That native message belongs to a stale Drift document."
            )
        }
        return activeDocument
    }

    func currentTicket() throws -> NativeDocumentTicket {
        condition.lock()
        defer { condition.unlock() }
        guard !revocationPending, let activeDocument else {
            throw BridgeFailure(
                "InvalidStateError",
                "Drift's local studio document has not finished bootstrapping."
            )
        }
        return activeDocument
    }

    func beginPanel(
        for document: NativeDocumentTicket,
        cancellation: @escaping () -> Void
    ) throws -> NativePanelTicket {
        precondition(Thread.isMainThread)
        condition.lock()
        defer { condition.unlock() }
        guard !revocationPending, activeDocument == document else {
            throw BridgeFailure("SecurityError", "A stale Drift document cannot open a native panel.")
        }
        guard activePanel == nil else {
            throw BridgeFailure(
                "InvalidStateError",
                "Finish or cancel the open native chooser before starting another one."
            )
        }
        let panel = NativePanelTicket(identifier: UUID(), document: document)
        activePanel = panel
        activePanelCancellation = cancellation
        return panel
    }

    @discardableResult
    func finishPanel(_ panel: NativePanelTicket) -> Bool {
        precondition(Thread.isMainThread)
        condition.lock()
        defer { condition.unlock() }
        guard activePanel == panel else { return false }
        activePanel = nil
        activePanelCancellation = nil
        return activeDocument == panel.document
    }

    func isCurrent(_ document: NativeDocumentTicket) -> Bool {
        condition.lock()
        defer { condition.unlock() }
        // This is an authority check, not an ownership hint. Revocation closes
        // every admission lane immediately, including ordinary broker and AAC
        // work queued behind an irreversible operation that is still draining.
        return !revocationPending && activeDocument == document
    }

    func isPreparedOrCurrent(_ document: NativeDocumentTicket) -> Bool {
        condition.lock()
        defer { condition.unlock() }
        return !revocationPending && (pendingBootstrap == document || activeDocument == document)
    }

    func isCurrent(_ panel: NativePanelTicket) -> Bool {
        condition.lock()
        defer { condition.unlock() }
        return !revocationPending && activeDocument == panel.document && activePanel == panel
    }

    var hasActiveDocument: Bool {
        condition.lock()
        defer { condition.unlock() }
        return !revocationPending && activeDocument != nil
    }

    /// Admits an irreversible file-system operation only while its document is
    /// authoritative. Revocation closes admission, drains admitted operations,
    /// then clears authority. This makes commit/delete and invalidation ordered.
    func beginIrreversibleOperation(
        for document: NativeDocumentTicket
    ) throws -> NativeDocumentMutationTicket {
        condition.lock()
        defer { condition.unlock() }
        guard !revocationPending, activeDocument == document else {
            throw BridgeFailure(
                "SecurityError",
                "A stale Drift document cannot mutate an exported file."
            )
        }
        let ticket = NativeDocumentMutationTicket(identifier: UUID(), document: document)
        activeIrreversibleOperations[ticket.identifier] = document
        return ticket
    }

    func finishIrreversibleOperation(_ ticket: NativeDocumentMutationTicket) {
        condition.lock()
        if activeIrreversibleOperations[ticket.identifier] == ticket.document {
            activeIrreversibleOperations.removeValue(forKey: ticket.identifier)
            condition.broadcast()
        }
        condition.unlock()
    }

    func performIrreversibleOperation<T>(
        for document: NativeDocumentTicket,
        operation: () throws -> T
    ) throws -> T {
        let ticket = try beginIrreversibleOperation(for: document)
        defer { finishIrreversibleOperation(ticket) }
        return try operation()
    }

    func invalidate() {
        precondition(Thread.isMainThread)
        let cancellation: (() -> Void)?
        condition.lock()
        beginRevocationLocked()
        cancellation = clearActivePanelLocked()
        pendingBootstrap = nil
        activeDocument = nil
        revocationPending = false
        condition.broadcast()
        condition.unlock()
        cancellation?()
    }

    private func beginRevocationLocked() {
        revocationPending = true
        condition.broadcast()
        while !activeIrreversibleOperations.isEmpty {
            condition.wait()
        }
    }

    private func waitUntilRevocationBeginsForSelfTest() {
        condition.lock()
        while !revocationPending {
            condition.wait()
        }
        condition.unlock()
    }

    private func clearActivePanelLocked() -> (() -> Void)? {
        let cancellation = activePanelCancellation
        activePanel = nil
        activePanelCancellation = nil
        return cancellation
    }

    private func parseNonce(_ rawNonce: String) throws -> UUID {
        guard rawNonce.utf8.count == 36,
              let nonce = UUID(uuidString: rawNonce),
              nonce.uuidString.lowercased() == rawNonce else {
            throw BridgeFailure(
                "SecurityError",
                "Native messages require the exact lower-case UUID issued to this document."
            )
        }
        return nonce
    }

    static func runSelfTest() throws {
        let session = NativeDocumentSession()
        let unissued = UUID().uuidString.lowercased()
        try expectFailure("SecurityError", "claim before prepare") {
            _ = try session.claimBootstrap(rawNonce: unissued)
        }

        let firstExpected = try session.prepareBootstrap()
        try expectFailure("SecurityError", "wrong claim") {
            _ = try session.claimBootstrap(rawNonce: unissued)
        }
        try expectFailure("SecurityError", "malformed claim") {
            _ = try session.claimBootstrap(rawNonce: "not-a-canonical-uuid")
        }
        try expectFailure("SecurityError", "uppercase claim") {
            _ = try session.claimBootstrap(rawNonce: firstExpected.nonce.uuidString.uppercased())
        }
        guard session.isPreparedOrCurrent(firstExpected) else {
            throw BridgeFailure("DataError", "An invalid claim consumed the prepared document ticket.")
        }

        let first = try session.claimBootstrap(rawNonce: firstExpected.nonceString)
        let validatedFirst = try session.validateMessage(rawNonce: first.nonceString)
        guard first == firstExpected, validatedFirst == first, session.hasActiveDocument else {
            throw BridgeFailure("DataError", "Native-issued bootstrap did not establish authority.")
        }
        try expectFailure("InvalidStateError", "duplicate claim") {
            _ = try session.claimBootstrap(rawNonce: first.nonceString)
        }

        var cancelledPanels = 0
        let firstPanel = try session.beginPanel(for: first) { cancelledPanels += 1 }
        try expectFailure("InvalidStateError", "overlapping panel") {
            _ = try session.beginPanel(for: first) { cancelledPanels += 100 }
        }

        let secondExpected = try session.prepareBootstrap()
        guard secondExpected.epoch == first.epoch + 1, cancelledPanels == 1 else {
            throw BridgeFailure("DataError", "Replacement bootstrap did not advance generation and cancel its panel.")
        }
        guard !session.finishPanel(firstPanel) else {
            throw BridgeFailure("DataError", "A stale panel completion remained authoritative.")
        }
        try expectFailure("SecurityError", "stale reclaim") {
            _ = try session.claimBootstrap(rawNonce: first.nonceString)
        }
        guard session.isPreparedOrCurrent(secondExpected) else {
            throw BridgeFailure("DataError", "A stale reclaim consumed the replacement ticket.")
        }

        let second = try session.claimBootstrap(rawNonce: secondExpected.nonceString)
        try expectFailure("SecurityError", "stale message") {
            _ = try session.validateMessage(rawNonce: first.nonceString)
        }
        let secondPanel = try session.beginPanel(for: second) { cancelledPanels += 1 }
        guard session.isCurrent(secondPanel), session.finishPanel(secondPanel) else {
            throw BridgeFailure("DataError", "The current panel did not finish authoritatively.")
        }

        let pending = try session.prepareBootstrap()
        session.invalidate()
        guard !session.hasActiveDocument else {
            throw BridgeFailure("DataError", "Pending invalidation left document authority active.")
        }
        try expectFailure("SecurityError", "claim after pending invalidation") {
            _ = try session.claimBootstrap(rawNonce: pending.nonceString)
        }

        let thirdExpected = try session.prepareBootstrap()
        _ = try session.claimBootstrap(rawNonce: thirdExpected.nonceString)
        session.invalidate()
        try expectFailure("InvalidStateError", "current ticket after active invalidation") {
            _ = try session.currentTicket()
        }
        try expectFailure("SecurityError", "message after active invalidation") {
            _ = try session.validateMessage(rawNonce: thirdExpected.nonceString)
        }

        let barrierSession = NativeDocumentSession()
        let barrierExpected = try barrierSession.prepareBootstrap()
        let barrierDocument = try barrierSession.claimBootstrap(rawNonce: barrierExpected.nonceString)
        let operationStarted = DispatchSemaphore(value: 0)
        let allowOperationFinish = DispatchSemaphore(value: 0)
        let operationFinished = DispatchSemaphore(value: 0)
        let operationFailed = DispatchSemaphore(value: 0)
        let rejectedDuringRevocation = DispatchSemaphore(value: 0)
        let admittedDuringRevocation = DispatchSemaphore(value: 0)
        let wrongRejection = DispatchSemaphore(value: 0)
        let currentRejectedDuringRevocation = DispatchSemaphore(value: 0)
        let currentAcceptedDuringRevocation = DispatchSemaphore(value: 0)

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let operation = try barrierSession.beginIrreversibleOperation(for: barrierDocument)
                operationStarted.signal()
                guard allowOperationFinish.wait(timeout: .now() + 5) == .success else {
                    operationFailed.signal()
                    barrierSession.finishIrreversibleOperation(operation)
                    operationFinished.signal()
                    return
                }
                barrierSession.finishIrreversibleOperation(operation)
            } catch {
                operationFailed.signal()
                operationStarted.signal()
            }
            operationFinished.signal()
        }

        guard operationStarted.wait(timeout: .now() + 5) == .success,
              operationFailed.wait(timeout: .now()) == .timedOut else {
            throw BridgeFailure("DataError", "Irreversible-operation barrier could not establish its admitted operation.")
        }

        DispatchQueue.global(qos: .userInitiated).async {
            barrierSession.waitUntilRevocationBeginsForSelfTest()
            if barrierSession.isCurrent(barrierDocument) {
                currentAcceptedDuringRevocation.signal()
            } else {
                currentRejectedDuringRevocation.signal()
            }
            do {
                let unexpected = try barrierSession.beginIrreversibleOperation(for: barrierDocument)
                barrierSession.finishIrreversibleOperation(unexpected)
                admittedDuringRevocation.signal()
            } catch let failure as BridgeFailure where failure.name == "SecurityError" {
                rejectedDuringRevocation.signal()
            } catch {
                wrongRejection.signal()
            }
            allowOperationFinish.signal()
        }

        barrierSession.invalidate()
        guard operationFinished.wait(timeout: .now()) == .success,
              operationFailed.wait(timeout: .now()) == .timedOut,
              rejectedDuringRevocation.wait(timeout: .now()) == .success,
              admittedDuringRevocation.wait(timeout: .now()) == .timedOut,
              wrongRejection.wait(timeout: .now()) == .timedOut,
              currentRejectedDuringRevocation.wait(timeout: .now()) == .success,
              currentAcceptedDuringRevocation.wait(timeout: .now()) == .timedOut else {
            throw BridgeFailure(
                "DataError",
                "Document invalidation did not drain admitted mutation and reject later admission in exact order."
            )
        }
        try expectFailure("SecurityError", "irreversible operation after invalidation") {
            _ = try barrierSession.beginIrreversibleOperation(for: barrierDocument)
        }

        print("Drift native document-session self-test passed: AppKit-issued one-use authority, exact nonce parsing, monotonic generations, panel serialization, stale rejection, revocation-closed ordinary admission, and linearizable irreversible-operation invalidation.")
    }

    private static func expectFailure(
        _ expectedName: String,
        _ label: String,
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
