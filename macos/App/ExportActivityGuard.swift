import Foundation

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
