import Combine
import Foundation
import Sparkle
import SwiftUI

/// In-app updates from the app's GitHub releases, through Sparkle.
///
/// Each release carries an `appcast.xml` beside its disk image; the app reads
/// the one on the latest release (`SUFeedURL` in Info.plist), and installs an
/// update only when its EdDSA signature matches the public key built into the
/// app (`SUPublicEDKey`). Apple code signing is not needed for that check.
@MainActor
public final class AppUpdates: NSObject, ObservableObject {
    private var controller: SPUStandardUpdaterController?
    private let delegate = Delegate()
    @Published public private(set) var canCheck = false

    /// `start: false` keeps the updater off, for headless checks and exports.
    public init(start: Bool) {
        super.init()
        guard start, Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") != nil else { return }
        let c = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: delegate, userDriverDelegate: nil)
        controller = c
        c.updater.publisher(for: \.canCheckForUpdates).receive(on: RunLoop.main).assign(to: &$canCheck)
        if ProcessInfo.processInfo.environment["STUDIO_UPDATE_TEST"] != nil {
            // Release testing: look now, and install as soon as an update is ready.
            c.updater.automaticallyDownloadsUpdates = true
            c.updater.checkForUpdatesInBackground()
        }
    }

    public func checkForUpdates() { controller?.checkForUpdates(nil) }

    final class Delegate: NSObject, SPUUpdaterDelegate {
        /// A test feed (a local server) in place of the published one, for release testing only.
        func feedURLString(for updater: SPUUpdater) -> String? {
            ProcessInfo.processInfo.environment["STUDIO_UPDATE_FEED"]
        }

        func updater(_ updater: SPUUpdater, willInstallUpdateOnQuit item: SUAppcastItem,
                     immediateInstallationBlock immediateInstallHandler: @escaping () -> Void) -> Bool {
            guard ProcessInfo.processInfo.environment["STUDIO_UPDATE_TEST"] != nil else { return false }
            immediateInstallHandler()
            return true
        }
    }
}

/// "Check for Updates…" for the app menu.
public struct CheckForUpdatesCommand: Commands {
    @ObservedObject var updates: AppUpdates

    public init(updates: AppUpdates) {
        self.updates = updates
    }

    public var body: some Commands {
        CommandGroup(after: .appInfo) {
            Button("Check for Updates…") { updates.checkForUpdates() }
                .disabled(!updates.canCheck)
        }
    }
}
