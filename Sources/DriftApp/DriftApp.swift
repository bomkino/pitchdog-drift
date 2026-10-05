import StudioKit
import SwiftUI

@main
struct DriftApp: App {
    @NSApplicationDelegateAdaptor(StudioAppDelegate.self) private var delegate
    private let config = Worlds.configuration

    init() {
        StudioAppDelegate.config = Worlds.configuration
        StudioApp.configure(Worlds.configuration)
    }

    var body: some Scene {
        DocumentGroup(newDocument: { StudioDocument(project: Worlds.configuration.newProject()) }) { file in
            StudioRoot(document: file.document, config: config)
                // Revert hands over a new document object; the window follows it.
                .id(ObjectIdentifier(file.document))
        }
        .commands { StudioMenuCommands() }
        .defaultSize(width: 1440, height: 900)
    }
}
