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

final class NativeDocumentSession {
    private var nextEpoch: UInt64 = 0
    private var pendingBootstrap: NativeDocumentTicket?
    private var activeDocument: NativeDocumentTicket?
    private var activePanel: NativePanelTicket?
    private var activePanelCancellation: (() -> Void)?

    func prepareBootstrap() throws -> NativeDocumentTicket {
        precondition(Thread.isMainThread)
        let incremented = nextEpoch.addingReportingOverflow(1)
        guard !incremented.overflow else {
            throw BridgeFailure("InvalidStateError", "Native document generation counter overflowed.")
        }

        let ticket = NativeDocumentTicket(nonce: UUID(), epoch: incremented.partialValue)
        cancelActivePanel()
        nextEpoch = incremented.partialValue
        pendingBootstrap = ticket
        activeDocument = nil
        return ticket
    }

    func claimBootstrap(rawNonce: String) throws -> NativeDocumentTicket {
        precondition(Thread.isMainThread)
        let nonce = try parseNonce(rawNonce)
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
        precondition(Thread.isMainThread)
        let nonce = try parseNonce(rawNonce)
        guard let activeDocument, activeDocument.nonce == nonce else {
            throw BridgeFailure(
                "SecurityError",
                "That native message belongs to a stale Drift document."
            )
        }
        return activeDocument
    }

    func currentTicket() throws -> NativeDocumentTicket {
        precondition(Thread.isMainThread)
        guard let activeDocument else {
            throw BridgeFailure(
                "InvalidStateError",
                "Drift’s local studio document has not finished bootstrapping."
            )
        }
        return activeDocument
    }

    func beginPanel(
        for document: NativeDocumentTicket,
        cancellation: @escaping () -> Void
    ) throws -> NativePanelTicket {
        precondition(Thread.isMainThread)
        guard activeDocument == document else {
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
        guard activePanel == panel else { return false }
        activePanel = nil
        activePanelCancellation = nil
        return activeDocument == panel.document
    }

    func isCurrent(_ document: NativeDocumentTicket) -> Bool {
        precondition(Thread.isMainThread)
        return activeDocument == document
    }

    func isPreparedOrCurrent(_ document: NativeDocumentTicket) -> Bool {
        precondition(Thread.isMainThread)
        return pendingBootstrap == document || activeDocument == document
    }

    func isCurrent(_ panel: NativePanelTicket) -> Bool {
        precondition(Thread.isMainThread)
        return activeDocument == panel.document && activePanel == panel
    }

    var hasActiveDocument: Bool {
        precondition(Thread.isMainThread)
        return activeDocument != nil
    }

    func invalidate() {
        precondition(Thread.isMainThread)
        cancelActivePanel()
        pendingBootstrap = nil
        activeDocument = nil
    }

    private func cancelActivePanel() {
        let cancellation = activePanelCancellation
        activePanel = nil
        activePanelCancellation = nil
        cancellation?()
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
        let firstExpected = try session.prepareBootstrap()

        let unissued = UUID().uuidString.lowercased()
        do {
            _ = try session.claimBootstrap(rawNonce: unissued)
            throw BridgeFailure("DataError", "An unissued document token unexpectedly bootstrapped.")
        } catch let failure as BridgeFailure where failure.name == "SecurityError" {
            // Expected. An invalid claim must not consume the prepared ticket.
        }
        let first = try session.claimBootstrap(rawNonce: firstExpected.nonceString)
        let firstValidated = try session.validateMessage(rawNonce: first.nonceString)
        guard first == firstExpected, firstValidated == first else {
            throw BridgeFailure("DataError", "Native-issued bootstrap did not establish authority.")
        }

        do {
            _ = try session.claimBootstrap(rawNonce: first.nonceString)
            throw BridgeFailure("DataError", "Duplicate bootstrap unexpectedly remained authoritative.")
        } catch let failure as BridgeFailure where failure.name == "InvalidStateError" {
            // Expected.
        }

        var cancelledPanels = 0
        let firstPanel = try session.beginPanel(for: first) { cancelledPanels += 1 }
        do {
            _ = try session.beginPanel(for: first) { cancelledPanels += 100 }
            throw BridgeFailure("DataError", "Overlapping native panels unexpectedly succeeded.")
        } catch let failure as BridgeFailure where failure.name == "InvalidStateError" {
            // Expected.
        }

        let secondExpected = try session.prepareBootstrap()
        guard cancelledPanels == 1 else {
            throw BridgeFailure("DataError", "A replacement document did not cancel the previous panel.")
        }
        guard !session.finishPanel(firstPanel) else {
            throw BridgeFailure("DataError", "A stale panel completion remained authoritative.")
        }
        do {
            _ = try session.claimBootstrap(rawNonce: first.nonceString)
            throw BridgeFailure("DataError", "A stale document reclaimed authority after replacement.")
        } catch let failure as BridgeFailure where failure.name == "SecurityError" {
            // Expected. The current native-issued ticket must remain claimable.
        }
        let second = try session.claimBootstrap(rawNonce: secondExpected.nonceString)
        guard second == secondExpected else {
            throw BridgeFailure("DataError", "The current native-issued ticket was not claimed.")
        }
        do {
            _ = try session.validateMessage(rawNonce: first.nonceString)
            throw BridgeFailure("DataError", "A replaced document retained native authority.")
        } catch let failure as BridgeFailure where failure.name == "SecurityError" {
            // Expected.
        }

        let secondPanel = try session.beginPanel(for: second) { cancelledPanels += 1 }
        guard session.isCurrent(secondPanel) else {
            throw BridgeFailure("DataError", "Current native panel was not recognized.")
        }
        guard session.finishPanel(secondPanel) else {
            throw BridgeFailure("DataError", "Current native panel failed to finish authoritatively.")
        }

        let thirdExpected = try session.prepareBootstrap()
        do {
            _ = try session.claimBootstrap(rawNonce: "not-a-canonical-uuid")
            throw BridgeFailure("DataError", "Malformed document nonce unexpectedly bootstrapped.")
        } catch let failure as BridgeFailure where failure.name == "SecurityError" {
            // Expected. Parse failure must not revoke the prepared ticket.
        }
        _ = try session.claimBootstrap(rawNonce: thirdExpected.nonceString)

        session.invalidate()
        do {
            _ = try session.currentTicket()
            throw BridgeFailure("DataError", "Invalidation left native document authority active.")
        } catch let failure as BridgeFailure where failure.name == "InvalidStateError" {
            // Expected.
        }

        print("Drift native document-session self-test passed: native-issued bootstrap, stale reclaim rejection, panel cancellation, exact-token validation, and invalidation hold.")
    }
}
