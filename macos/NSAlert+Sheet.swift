import AppKit
import Darwin
import Foundation
extension NSAlert {
    func runModal(for window: NSWindow) -> NSApplication.ModalResponse {
        var response = NSApplication.ModalResponse.abort
        let semaphore = DispatchSemaphore(value: 0)
        beginSheetModal(for: window) { result in
            response = result
            semaphore.signal()
        }
        while semaphore.wait(timeout: .now()) != .success {
            RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.01))
        }
        return response
    }
}
