import Darwin
import Foundation

@main
struct NativeGauntletMain {
    static func main() {
        var activePhase = "startup"
        do {
            activePhase = "trusted WebKit main-frame boundary"
            try TrustedWebRuntime.runSelfTest()

            activePhase = "export power-activity lifecycle"
            try ExportActivityGuard.runSelfTest()

            activePhase = "native file-broker core"
            try NativeFileBroker.runSelfTest()

            activePhase = "native rollback, grant-pressure, and recovery contracts"
            try NativeGauntlet.run()

            activePhase = "native AAC encoder"
            try NativeAacEncoderBroker.runSelfTest()

            print("Drift trusted-WebKit, export-activity, native file, rollback, grant, and AAC gauntlets passed.")
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
