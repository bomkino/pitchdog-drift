import AppKit
import Darwin
import Foundation

@main
struct DriftMain {
    static func main() {
        let argumentList = Array(CommandLine.arguments.dropFirst())
        let arguments = Set(argumentList)

        if arguments.contains("--smoke-test") {
            Darwin.exit(runSmokeTest())
        }
        if arguments.contains("--native-self-test") {
            do {
                try NativeFileBroker.runSelfTest()
                try NativeGauntlet.run()
                Darwin.exit(0)
            } catch {
                fputs("Drift native self-test failed: \(error.localizedDescription)\n", stderr)
                Darwin.exit(1)
            }
        }
        if arguments.contains("--webview-self-test") {
            let prefix = "--webview-self-test-report-name="
            let receiptName = argumentList
                .first(where: { $0.hasPrefix(prefix) })
                .map { String($0.dropFirst(prefix.count)) }
            Darwin.exit(WebViewSelfTest.run(receiptName: receiptName))
        }

        let application = NSApplication.shared
        let delegate = DriftAppDelegate()
        application.delegate = delegate
        application.setActivationPolicy(.regular)
        application.run()
    }

    private static func runSmokeTest() -> Int32 {
        let requiredResources: [(String, String?, String?)] = [
            ("index", "html", "Web"),
            ("NativeBridge", "js", nil),
            ("LICENSE", nil, "Legal"),
            ("THIRD_PARTY_NOTICES", "md", "Legal"),
            ("MACOS_USER_GUIDE", "md", "Documentation"),
            ("MACOS_THREAT_MODEL", "md", "Documentation"),
            ("BuildReceipt", "txt", nil),
            ("BuildManifest", "txt", nil),
        ]

        for (name, extensionName, subdirectory) in requiredResources {
            guard let url = Bundle.main.url(
                forResource: name,
                withExtension: extensionName,
                subdirectory: subdirectory
            ), FileManager.default.fileExists(atPath: url.path) else {
                fputs("Drift smoke test failed: missing resource \(name).\n", stderr)
                return 1
            }
        }

        guard let bridgeURL = Bundle.main.url(forResource: "NativeBridge", withExtension: "js"),
              let bridgeSource = try? String(contentsOf: bridgeURL, encoding: .utf8),
              bridgeSource.contains("DRIFT_NATIVE_BRIDGE_VERSION = \(driftBridgeVersion)") else {
            fputs("Drift smoke test failed: bridge version marker is missing.\n", stderr)
            return 1
        }

        guard Bundle.main.object(forInfoDictionaryKey: "DriftNativeBridgeVersion") as? Int == driftBridgeVersion else {
            fputs("Drift smoke test failed: Info.plist bridge version does not match Swift.\n", stderr)
            return 1
        }

        guard Bundle.main.bundleIdentifier == driftBundleIdentifier else {
            fputs("Drift smoke test failed: unexpected bundle identifier.\n", stderr)
            return 1
        }

        print("Drift macOS smoke test passed: bundle, receipt, manifest, legal resources, web runtime, and bridge agree.")
        return 0
    }
}
