import StudioKit
import SwiftUI

@main
struct BackdropApp: App {
    @NSApplicationDelegateAdaptor(StudioAppDelegate.self) private var delegate

    init() {
        UserDefaults.standard.register(defaults: ["appearance": AppearanceChoice.dark.rawValue])
        DispatchQueue.global(qos: .utility).async {
            if let r = try? StageRenderer() { r.warmUp() }
        }
    }

    var body: some Scene {
        DocumentGroup(newDocument: { BackdropDocument() }) { file in
            BackdropRoot(document: file.document)
                // Revert hands over a new document object; the window follows it.
                .id(ObjectIdentifier(file.document))
        }
        .commands {
            CommandGroup(after: .toolbar) {
                AppearanceMenu()
            }
        }
        .defaultSize(width: 1400, height: 880)
    }
}

struct AppearanceMenu: View {
    @AppStorage("appearance") private var appearance = AppearanceChoice.dark.rawValue
    var body: some View {
        Picker("Appearance", selection: $appearance) {
            ForEach(AppearanceChoice.allCases) { c in Text(c.title).tag(c.rawValue) }
        }
    }
}
