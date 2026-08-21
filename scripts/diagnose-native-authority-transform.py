from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CHECKS: list[tuple[str, str, str]] = [
    (
        "macos/NativeBridge.js",
        "bridge-state-anchor",
        """  let statusHost = null;
  let appBridge = null;
  let appBridgeGeneration = 0;
  const queuedImports = [];
""",
    ),
    (
        "macos/NativeBridge.js",
        "call-native-anchor",
        """  async function callNative(command, payload = {}) {
    let envelope;
    try {
      envelope = await handler.postMessage({ command, payload });
    } catch (error) {
      throw error instanceof Error ? error : new DOMException(String(error), \"InvalidStateError\");
    }
    if (envelope?.ok) return envelope.value;
    throw nativeError(envelope?.error);
  }
""",
    ),
    (
        "macos/NativeBridge.js",
        "global-authorizer-anchor",
        """      __driftNativeReportClientState: { configurable: false, writable: false, value: reportClientState },
      __DRIFT_NATIVE_MAC__: {
""",
    ),
    (
        "macos/NativeBridge.js",
        "runtime-marker-anchor",
        """          systemCodecsOnly: true,
        }),
""",
    ),
    (
        "macos/NativeBridge.js",
        "runtime-boot-anchor",
        """    void callNative(\"runtime-info\").then((runtime) => {
      window.dispatchEvent(new CustomEvent(\"drift-native-ready\", { detail: runtime }));
    }).catch((error) => {
""",
    ),
    (
        "macos/App/NativeBridgeHost.swift",
        "host-brokers-anchor",
        """    private let broker = NativeFileBroker()
    private let aacBroker = NativeAacEncoderBroker()
""",
    ),
    (
        "macos/App/NativeBridgeHost.swift",
        "host-message-anchor",
        """        let payload = body[\"payload\"] as? JSONDictionary ?? [:]

        switch command {
""",
    ),
    (
        "macos/App/NativeBridgeHost.swift",
        "host-lifecycle-anchor",
        """    func abortAllWrites() {
        exportActivityGuard.end()
        brokerQueue.sync {
            broker.abortAll()
            aacBroker.closeAll()
        }
    }

    func revealLastExportInFinder() {
""",
    ),
    (
        "macos/App/NativeBridgeHost.swift",
        "host-runtime-anchor",
        """            \"nativeAac\": true,
            \"nativeAacProvider\": \"AudioToolbox\",
""",
    ),
    (
        "macos/App/DriftAppDelegate.swift",
        "delegate-state-anchor",
        """    private var webRuntimeReady = false
    private var receivedAuthoritativeClientState = false
""",
    ),
    (
        "macos/App/DriftAppDelegate.swift",
        "delegate-pending-project-anchor",
        """        guard webRuntimeReady,
              let bridge = nativeBridge,
""",
    ),
    (
        "macos/App/DriftAppDelegate.swift",
        "delegate-navigation-anchor",
        """    // MARK: - WebKit navigation and recovery

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard TrustedWebRuntime.acceptsMainFrameURL(webView.url, trustedIndexURL: trustedIndexURL) else {
            webRuntimeReady = false
            invalidateRecoveryStabilityWindow()
            return
        }
        webRuntimeReady = true
        deliverPendingProjectsIfPossible()
        scheduleRecoveryBudgetResetIfNeeded()
    }
""",
    ),
    (
        "macos/App/DriftAppDelegate.swift",
        "delegate-menu-anchor",
        """            return webRuntimeReady && !protected
        case #selector(togglePlayback(_:)), #selector(previousSlide(_:)), #selector(nextSlide(_:)), #selector(toggleFocus(_:)):
            return webRuntimeReady && !protected
        case #selector(cancelExport(_:)):
            return webRuntimeReady && exporting
""",
    ),
    (
        "macos/App/DriftAppDelegate.swift",
        "delegate-command-anchor",
        """    private func dispatchNativeCommand(_ command: String) {
        guard let webView else { return }
""",
    ),
    (
        "macos/App/DriftAppDelegate.swift",
        "delegate-diagnostics-anchor",
        """        Native bridge: \\(driftBridgeVersion)
        System codecs only: yes
""",
    ),
    (
        "macos/App/WebViewSelfTest.swift",
        "self-test-state-anchor",
        """    private var contentProcessTerminationCount = 0
    private var webKitFileInputVerified = false
""",
    ),
    (
        "macos/App/WebViewSelfTest.swift",
        "self-test-commit-anchor",
        """    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        committedNavigation = true
    }
""",
    ),
    (
        "macos/App/DriftMain.swift",
        "main-self-test-anchor",
        """            do {
                try NativeFileBroker.runSelfTest()
""",
    ),
    (
        "macos/Probes/NativeGauntletMain.swift",
        "probe-authority-anchor",
        """            activePhase = \"export power-activity lifecycle\"
            try ExportActivityGuard.runSelfTest()
""",
    ),
    (
        ".github/workflows/macos.yml",
        "workflow-probe-source-anchor",
        """            macos/App/NativeModels.swift \\
            macos/App/NativeFileBroker.swift \\
""",
    ),
]

results: list[dict[str, object]] = []
for path, label, marker in CHECKS:
    source = (ROOT / path).read_text(encoding="utf-8")
    results.append(
        {
            "path": path,
            "label": label,
            "count": source.count(marker),
            "markerPreview": marker.splitlines()[0],
        }
    )

payload = {
    "schemaVersion": 1,
    "checks": results,
    "firstMismatch": next((result for result in results if result["count"] != 1), None),
}
print(json.dumps(payload, indent=2, sort_keys=True))
Path("docs/.native-authority-transform-diagnosis.json").write_text(
    json.dumps(payload, indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
)
