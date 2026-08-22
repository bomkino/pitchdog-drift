import Darwin
import Foundation

@main
struct NativeGauntletMain {
    static func main() {
        var activePhase = "startup"
        do {
            activePhase = "main-frame navigation identity"
            try NavigationIdentityTracker.runSelfTest()

            activePhase = "trusted WebKit main-frame boundary"
            try TrustedWebRuntime.runSelfTest()

            activePhase = "trusted navigation and download policy"
            try TrustedNavigationPolicy.runSelfTest()

            activePhase = "export power-activity lifecycle"
            try ExportActivityGuard.runSelfTest()

            activePhase = "external Finder project admission"
            try ClientState.runExternalProjectImportAdmissionSelfTest()

            activePhase = "native document authority lifecycle"
            try NativeDocumentSession.runSelfTest()

            activePhase = "native reply and teardown lifecycle"
            try NativeBridgeHost.runReplyLifecycleSelfTest()

            activePhase = "native file-broker core"
            try NativeFileBroker.runSelfTest()

            activePhase = "native rollback, grant-pressure, and recovery contracts"
            try NativeGauntlet.run()

            activePhase = "native AAC encoder"
            try NativeAacEncoderBroker.runSelfTest()

            print("Drift trusted-WebKit, export-activity, project-admission, document-authority, native file, rollback, grant, and AAC gauntlets passed.")
            Darwin.exit(0)
        } catch let failure as BridgeFailure {
            fputs(
                "Drift native gauntlet failed during \(activePhase): \(failure.name): \(failure.message)\n",
                stderr
            )
            Darwin.exit(1)
        } catch {
            fputs(
                "Drift native gauntlet failed during \(activePhase): \(String(reflecting: error))\n",
                stderr
            )
            Darwin.exit(1)
        }
    }
}
