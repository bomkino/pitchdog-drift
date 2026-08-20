import Foundation
import WebKit

final class NativeBridgeHost: NSObject, WKScriptMessageHandlerWithReply {
    weak var webView: WKWebView?

    private let broker: NativeFileBroker
    private let onClientState: (ClientState) -> Void

    init(broker: NativeFileBroker, onClientState: @escaping (ClientState) -> Void) {
        self.broker = broker
        self.onClientState = onClientState
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard message.name == bridgeName,
              message.frameInfo.isMainFrame,
              let body = message.body as? JSONDictionary,
              let command = body["command"] as? String else {
            replyHandler([
                "ok": false,
                "error": ["name": "SecurityError", "message": "Native messages are accepted only from Drift’s main frame."],
            ], nil)
            return
        }
        let payload = body["payload"] as? JSONDictionary ?? [:]

        do {
            let value: Any
            if command == "client-state" {
                let state = ClientState(
                    ready: payload["ready"] as? Bool ?? false,
                    exporting: payload["exporting"] as? Bool ?? false,
                    saving: payload["saving"] as? Bool ?? false
                )
                onClientState(state)
                value = ["accepted": true]
            } else if command == "runtime-info" {
                value = [
                    "bridgeVersion": bridgeVersion,
                    "platform": "macOS",
                    "operatingSystem": ProcessInfo.processInfo.operatingSystemVersionString,
                    "architecture": currentArchitecture(),
                    "applicationVersion": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown",
                    "sandboxed": ProcessInfo.processInfo.environment["APP_SANDBOX_CONTAINER_ID"] != nil,
                ]
            } else {
                value = try broker.handle(command: command, payload: payload)
            }
            replyHandler(["ok": true, "value": value], nil)
        } catch let failure as BridgeFailure {
            replyHandler([
                "ok": false,
                "error": ["name": failure.name, "message": failure.message],
            ], nil)
        } catch {
            let nsError = error as NSError
            replyHandler([
                "ok": false,
                "error": [
                    "name": domErrorName(for: nsError),
                    "message": nsError.localizedDescription,
                ],
            ], nil)
        }
    }
}
