import Foundation

struct NativeDocumentTicket: Equatable {
    let nonce: UUID
    let epoch: UInt64

    var nonceString: String { nonce.uuidString.lowercased() }
}

private struct NativePanelTicket: Equatable {
    let identifier: UUID
    let document: NativeDocumentTicket
}

final class NativeDocumentSession {
    private var nextEpoch: UInt64 = 0
    private var activeDocument: NativeDocumentTicket?
    private var activePanel: NativePanelTicket?
    private var activePanelCancellation: (() -> Void)?

    func claimBootstrap(rawNonce: String) throws -> NativeDocumentTicket {
        precondition(Thread.isMainThread)
        let nonce = try parseNonce(rawNonce)
        if let activeDocument, activeDocument.nonce == nonce {
            throw BridgeFailure(
                "InvalidStateError",
                "A Drift document may bootstrap the native bridge only once."
            )
        }

        cancelActivePanel()
        let incremented = nextEpoch.addingReportingOverflow(1)
        guard !incremented.overflow else {
            throw BridgeFailure("InvalidStateError", "Native document generation counter overflowed.")
        }
        nextEpoch = incremented.partialValue
        let ticket = NativeDocumentTicket(nonce: nonce, epoch: nextEpoch)
        activeDocument = ticket
        return ticket
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

    func isCurrent(_ panel: NativePanelTicket) -> Bool {
        precondition(Thread.isMainThread)
        return activeDocument == panel.document && activePanel == panel
    }

    func invalidate() {
        precondition(Thread.isMainThread)
        cancelActivePanel()
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
              nonce.uuidString.caseInsensitiveCompare(rawNonce) == .orderedSame else {
            throw BridgeFailure(
                "SecurityError",
                "Native messages require one canonical per-document UUID nonce."
            )
        }
        return nonce
    }

    static func runSelfTest() throws {
        let session = NativeDocumentSession()
        let firstNonce = UUID().uuidString.lowercased()
        let first = try session.claimBootstrap(rawNonce: firstNonce)
        guard try session.validateMessage(rawNonce: firstNonce) == first else {
            throw BridgeFailure("DataError", "Document bootstrap did not establish authority.")
        }

        do {
            _ = try session.claimBootstrap(rawNonce: firstNonce)
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

        let secondNonce = UUID().uuidString.lowercased()
        let second = try session.claimBootstrap(rawNonce: secondNonce)
        guard cancelledPanels == 1 else {
            throw BridgeFailure("DataError", "A replacement document did not cancel the previous panel.")
        }
        guard !session.finishPanel(firstPanel) else {
            throw BridgeFailure("DataError", "A stale panel completion remained authoritative.")
        }
        do {
            _ = try session.validateMessage(rawNonce: firstNonce)
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

        session.invalidate()
        do {
            _ = try session.currentTicket()
            throw BridgeFailure("DataError", "Invalidation left native document authority active.")
        } catch let failure as BridgeFailure where failure.name == "InvalidStateError" {
            // Expected.
        }
        do {
            _ = try session.claimBootstrap(rawNonce: "not-a-canonical-uuid")
            throw BridgeFailure("DataError", "Malformed document nonce unexpectedly bootstrapped.")
        } catch let failure as BridgeFailure where failure.name == "SecurityError" {
            // Expected.
        }

        print("Drift native document-session self-test passed: one bootstrap, one panel, stale completion rejection, panel cancellation, and invalidation hold.")
    }
}
