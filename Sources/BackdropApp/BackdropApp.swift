import StudioKit
import SwiftUI

@main
struct BackdropApp: App {
    @NSApplicationDelegateAdaptor(StudioAppDelegate.self) private var delegate

    init() {
        UserDefaults.standard.register(defaults: [
            "appearance": AppearanceChoice.dark.rawValue,
            // Open on a new window, ready to go, rather than on the Open panel.
            "NSShowAppCentricOpenPanelInsteadOfUntitledFile": false,
        ])
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
            BackdropCommands()
            CommandGroup(after: .toolbar) {
                AppearanceMenu()
            }
        }
        .defaultSize(width: 1400, height: 880)
    }
}

struct BackdropSessionKey: FocusedValueKey {
    typealias Value = BackdropSession
}

extension FocusedValues {
    var backdropSession: BackdropSession? {
        get { self[BackdropSessionKey.self] }
        set { self[BackdropSessionKey.self] = newValue }
    }
}

/// Export, playback and a new variation from the keyboard, as in Drift and Galileo.
struct BackdropCommands: Commands {
    @FocusedValue(\.backdropSession) private var session

    var body: some Commands {
        CommandGroup(after: .importExport) {
            Button("Export…") { session?.showExport = true }
                .keyboardShortcut("e", modifiers: .command)
                .disabled(session == nil)
        }
        CommandMenu("Playback") {
            Button((session?.clock.playing ?? false) ? "Pause" : "Play") {
                session?.clock.playing.toggle()
                session?.touch()
            }
            .keyboardShortcut("p", modifiers: .command)
            Button("Go to Start") { session?.clock.time = 0; session?.touch() }
                .keyboardShortcut(.leftArrow, modifiers: [.command])
            Divider()
            Button("New Variation") { session?.newVariation() }
                .keyboardShortcut("r", modifiers: [.command, .shift])
                .disabled(session == nil)
        }
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
