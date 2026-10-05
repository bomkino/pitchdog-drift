import StudioKit
import SwiftUI

@main
struct GalileoApp: App {
    @NSApplicationDelegateAdaptor(StudioAppDelegate.self) private var delegate
    private let config = GalleryCatalog.configuration

    init() {
        StudioAppDelegate.config = GalleryCatalog.configuration
        StudioApp.configure(GalleryCatalog.configuration)
    }

    var body: some Scene {
        DocumentGroup(newDocument: { StudioDocument(project: GalleryCatalog.configuration.newProject()) }) { file in
            StudioRoot(document: file.document, config: config)
                // Revert hands over a new document object; the window follows it.
                .id(ObjectIdentifier(file.document))
        }
        .commands { StudioMenuCommands() }
        .defaultSize(width: 1440, height: 900)
    }
}
