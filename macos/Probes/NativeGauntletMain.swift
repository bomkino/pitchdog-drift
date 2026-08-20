import Darwin
import Foundation

@main
struct NativeGauntletMain {
    static func main() {
        do {
            try NativeFileBroker.runSelfTest()
            try NativeGauntlet.run()
            try NativeAacEncoderBroker.runSelfTest()
            print("Drift native file, rollback, grant, and AAC gauntlets passed.")
            Darwin.exit(0)
        } catch {
            fputs("Drift native gauntlet failed: \(error.localizedDescription)\n", stderr)
            Darwin.exit(1)
        }
    }
}
