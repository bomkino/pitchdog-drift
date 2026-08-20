import Foundation

extension ClientState {
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
