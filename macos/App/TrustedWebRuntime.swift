import Foundation

/// Defines the only local document that may use Drift's privileged native
/// message handler. `forMainFrameOnly` prevents iframe access; this boundary
/// also prevents a later `data:`, `blob:`, remote, sibling, or traversed main
/// frame from inheriting the file and codec capabilities of the signed studio.
enum TrustedWebRuntime {
    static func bundledIndexURL(bundle: Bundle = .main) -> URL? {
        bundle.url(
            forResource: "index",
            withExtension: "html",
            subdirectory: "Web"
        )?.standardizedFileURL
    }

    static func acceptsMainFrameURL(
        _ candidateURL: URL?,
        trustedIndexURL: URL?
    ) -> Bool {
        guard let candidateURL,
              candidateURL.isFileURL,
              let trustedIndexURL,
              trustedIndexURL.isFileURL else {
            return false
        }

        return resolvedFilePath(candidateURL) == resolvedFilePath(trustedIndexURL)
    }

    static func runSelfTest() throws {
        let manager = FileManager.default
        let root = manager.temporaryDirectory.appendingPathComponent(
            "drift-trusted-web-runtime-\(UUID().uuidString)",
            isDirectory: true
        )
        let webRoot = root.appendingPathComponent("Web", isDirectory: true)
        try manager.createDirectory(at: webRoot, withIntermediateDirectories: true)
        defer { try? manager.removeItem(at: root) }

        let trustedIndex = webRoot.appendingPathComponent("index.html", isDirectory: false)
        let siblingDocument = webRoot.appendingPathComponent("diagnostic.html", isDirectory: false)
        let outsideDocument = root.appendingPathComponent("outside.html", isDirectory: false)
        try Data("trusted".utf8).write(to: trustedIndex)
        try Data("sibling".utf8).write(to: siblingDocument)
        try Data("outside".utf8).write(to: outsideDocument)

        try require(
            acceptsMainFrameURL(trustedIndex, trustedIndexURL: trustedIndex),
            "the signed studio index was rejected"
        )

        var fragmentComponents = URLComponents(
            url: trustedIndex,
            resolvingAgainstBaseURL: false
        )
        fragmentComponents?.fragment = "focus"
        try require(
            acceptsMainFrameURL(fragmentComponents?.url, trustedIndexURL: trustedIndex),
            "a same-document fragment rejected the signed studio index"
        )

        let rejectedCandidates: [(String, URL?)] = [
            ("missing URL", nil),
            ("data document", URL(string: "data:text/html,untrusted")),
            ("blob document", URL(string: "blob:null/untrusted")),
            ("remote document", URL(string: "https://example.invalid/")),
            ("sibling document", siblingDocument),
            ("prefix lookalike", webRoot.appendingPathComponent("index.html.attacker")),
            ("traversed document", webRoot.appendingPathComponent("../outside.html").standardizedFileURL),
        ]
        for (label, candidate) in rejectedCandidates {
            try require(
                !acceptsMainFrameURL(candidate, trustedIndexURL: trustedIndex),
                "\(label) inherited the privileged native bridge"
            )
        }

        print("Drift trusted WebKit main-frame self-test passed.")
    }

    private static func resolvedFilePath(_ url: URL) -> String {
        URL(fileURLWithPath: url.standardizedFileURL.path)
            .resolvingSymlinksInPath()
            .path
    }

    private static func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
        if !condition() { throw BridgeFailure("SecurityError", message) }
    }
}
