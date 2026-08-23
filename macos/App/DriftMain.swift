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
                try BridgeFailure.runEnvelopeSelfTest()
                try NavigationIdentityTracker.runSelfTest()
                try TrustedWebRuntime.runSelfTest()
                try TrustedNavigationPolicy.runSelfTest()
                try WebViewSelfTest.runTerminationProtocolSelfTest()
                try NativeBridgeHost.runReplyLifecycleSelfTest()
                try NativeDocumentSession.runSelfTest()
                try NativeFileBroker.runSelfTest()
                try NativeGauntlet.run()
                try NativeAacEncoderBroker.runSelfTest()
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
            let networkPrefix = "--webview-self-test-network-probe-url="
            let networkProbeURL = argumentList
                .first(where: { $0.hasPrefix(networkPrefix) })
                .flatMap { URL(string: String($0.dropFirst(networkPrefix.count))) }
            let runNoncePrefix = "--webview-self-test-run-nonce="
            let runNonce = argumentList
                .first(where: { $0.hasPrefix(runNoncePrefix) })
                .map { String($0.dropFirst(runNoncePrefix.count)) }
            Darwin.exit(WebViewSelfTest.run(
                receiptName: receiptName,
                networkProbeURL: networkProbeURL,
                runNonce: runNonce
            ))
        }

        let application = NSApplication.shared
        let delegate = DriftAppDelegate(
            launchLifecycleSelfTest: arguments.contains("--app-lifecycle-self-test")
        )
        application.delegate = delegate
        application.setActivationPolicy(.regular)
        if arguments.contains("--app-lifecycle-self-test") {
            // Keep the LaunchServices verifier bounded even if a future
            // lifetime regression drops the delegate before its window opens.
            DispatchQueue.main.asyncAfter(deadline: .now() + 15) {
                fputs("Drift app lifecycle self-test failed: LaunchServices did not reach a visible main window within 15 seconds.\n", stderr)
                fflush(stderr)
                Darwin.exit(1)
            }
        }
        // NSApplication's delegate is not an owning reference. Keep the app
        // delegate alive for the entire run loop or a release build may launch
        // successfully with no menus, window, or document lifecycle.
        withExtendedLifetime(delegate) {
            application.run()
        }
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

        guard driftBuildIdentityIsValid() else {
            fputs("Drift smoke test failed: the packaged build identity tuple is invalid.\n", stderr)
            return 1
        }

        guard ["release", "v2-dev"].contains(driftBuildChannel) else {
            fputs("Drift smoke test failed: unsupported build channel.\n", stderr)
            return 1
        }

        let expectedStorageNamespace = driftBuildChannel == "v2-dev"
            ? driftV2DevelopmentStorageNamespace
            : driftReleaseStorageNamespace
        guard driftStorageNamespace == expectedStorageNamespace else {
            fputs("Drift smoke test failed: build channel and storage namespace disagree.\n", stderr)
            return 1
        }

        let expectedCacheNamespace = driftBuildChannel == "v2-dev" ? "DriftV2Dev" : "Drift"
        guard driftCacheNamespace == expectedCacheNamespace else {
            fputs("Drift smoke test failed: build channel and cache namespace disagree.\n", stderr)
            return 1
        }

        print("Drift macOS smoke test passed: bundle, receipt, manifest, legal resources, web runtime, and bridge agree.")
        return 0
    }
}
