import AppKit
import SwiftUI
import UniformTypeIdentifiers

// MARK: - Focused session for menu commands

public struct StudioSessionKey: FocusedValueKey {
    public typealias Value = StudioSession
}

extension FocusedValues {
    public var studioSession: StudioSession? {
        get { self[StudioSessionKey.self] }
        set { self[StudioSessionKey.self] = newValue }
    }
}

public enum StudioCommands {
    @MainActor
    public static func addMedia(_ session: StudioSession) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.allowedContentTypes = StudioSession.importTypes
        panel.message = "Choose images, PDFs or clips."
        panel.prompt = "Add"
        panel.begin { response in
            guard response == .OK else { return }
            let urls = panel.urls
            MainActor.assumeIsolated { session.importMedia(urls) }
        }
    }
}

public struct StudioMenuCommands: Commands {
    @FocusedValue(\.studioSession) private var session
    @AppStorage("appearance") private var appearance = AppearanceChoice.dark.rawValue
    @AppStorage("showSafeAreas") private var showSafeAreas = false

    public init() {}

    public var body: some Commands {
        CommandGroup(after: .importExport) {
            Button("Add Media…") { if let session { StudioCommands.addMedia(session) } }
                .keyboardShortcut("i", modifiers: .command)
                .disabled(session == nil)
            Button("Export…") { session?.showExport = true }
                .keyboardShortcut("e", modifiers: .command)
                .disabled(session?.project.items.isEmpty ?? true)
        }
        CommandMenu("Playback") {
            Button((session?.clock.playing ?? false) ? "Pause" : "Play") {
                session?.clock.playing.toggle()
                session?.touch()
            }
            .keyboardShortcut("p", modifiers: .command)
            Button("Go to Start") { session?.clock.time = 0; session?.touch() }
                .keyboardShortcut(.leftArrow, modifiers: [.command])
            Button("Previous Moment") { session?.jumpToMoment(-1) }
                .keyboardShortcut("[", modifiers: [.command])
                .disabled(session?.beats.isEmpty ?? true)
            Button("Next Moment") { session?.jumpToMoment(1) }
                .keyboardShortcut("]", modifiers: [.command])
                .disabled(session?.beats.isEmpty ?? true)
            Divider()
            Button("New Variation") { session?.shuffle() }
                .keyboardShortcut("r", modifiers: [.command, .shift])
        }
        CommandGroup(after: .toolbar) {
            Picker("Appearance", selection: $appearance) {
                ForEach(AppearanceChoice.allCases) { c in Text(c.title).tag(c.rawValue) }
            }
            Toggle("Show Safe Areas", isOn: $showSafeAreas)
                .keyboardShortcut("g", modifiers: [.command, .shift])
        }
    }
}

// MARK: - Window

/// Environment flag used by headless snapshots: the stage shows a rendered still.
public struct SnapshotStageKey: EnvironmentKey {
    public static let defaultValue: CGImage? = nil
}

extension EnvironmentValues {
    public var snapshotStage: CGImage? {
        get { self[SnapshotStageKey.self] }
        set { self[SnapshotStageKey.self] = newValue }
    }
}

public struct StudioRoot: View {
    @State private var session: StudioSession
    @Environment(\.undoManager) private var undoManager
    @AppStorage("appearance") private var appearance = AppearanceChoice.dark.rawValue

    public init(document: StudioDocument, config: StudioConfiguration) {
        _session = State(initialValue: StudioSession(config: config, document: document))
    }

    public var body: some View {
        StudioWindow(session: session)
            .modifier(SnapshotHost(session: session))
            .onAppear {
                LaunchProbe.mark("window")
                session.undoManager = undoManager
                session.loadAllMedia()
                if session.document.isNew {
                    session.document.isNew = false
                    if !StudioSnapshot.isRequested { session.addStarterSamples() }
                }
            }
            .onChange(of: undoManager) { _, um in session.undoManager = um }
            .focusedSceneValue(\.studioSession, session)
            .preferredColorScheme(AppearanceChoice(rawValue: appearance)?.colorScheme)
    }
}

public struct StudioWindow: View {
    @Bindable var session: StudioSession
    @State private var showInspector = true
    @Environment(\.snapshotStage) private var snapshotStage

    public init(session: StudioSession) {
        self.session = session
    }

    public var body: some View {
        NavigationSplitView {
            LibraryPanel(session: session)
                .navigationSplitViewColumnWidth(min: 250, ideal: 286, max: 380)
        } detail: {
            StageArea(session: session, still: snapshotStage)
                .background(Theme.surround)
                .inspector(isPresented: $showInspector) {
                    LookInspector(session: session)
                        .inspectorColumnWidth(min: 280, ideal: 300, max: 400)
                }
        }
        .navigationSubtitle("\(session.project.format.width) × \(session.project.format.height) · \(session.project.fps) fps")
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                FormatPicker(current: session.project.format) { f in session.update("Canvas") { $0.format = f } }
                Button { StudioCommands.addMedia(session) } label: {
                    Label("Add \(session.config.itemNoun.capitalized)s", systemImage: "plus")
                }
                .help("Add images, PDFs or clips")
                Button { session.showExport = true } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "square.and.arrow.up").font(.system(size: 12, weight: .semibold))
                        Text("Export")
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(session.project.items.isEmpty)
                .opacity(session.project.items.isEmpty ? 0.45 : 1)
                .help("Export a video or stills")
                Button { showInspector.toggle() } label: {
                    Label("Inspector", systemImage: "sidebar.right")
                }
                .help("Show or hide the inspector")
            }
        }
        .sheet(isPresented: $session.showExport) {
            ExportSheet(source: session)
        }
        .alert("Couldn't add those files", isPresented: Binding(get: { session.message != nil }, set: { if !$0 { session.message = nil } })) {
            Button("OK") { session.message = nil }
        } message: {
            Text(session.message ?? "")
        }
        .frame(minWidth: 980, minHeight: 640)
    }
}

/// The canvas shapes most work goes to, one click apart, with the rest in a menu.
public struct FormatPicker: View {
    let current: CanvasFormat
    let choose: (CanvasFormat) -> Void
    static let common: [CanvasFormat] = [.reel, .portrait, .square, .landscape]

    public init(current: CanvasFormat, choose: @escaping (CanvasFormat) -> Void) {
        self.current = current
        self.choose = choose
    }

    public var body: some View {
        Picker("Canvas", selection: Binding(
            get: { Self.common.contains(current) ? current.id : "" },
            set: { id in
                if let f = Self.common.first(where: { $0.id == id }), f != current { choose(f) }
            })) {
            ForEach(Self.common) { f in
                Text(f.ratioLabel).tag(f.id).help("\(f.name): \(f.detail)")
            }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .fixedSize()
        .help("Canvas shape")
        Menu {
            ForEach(CanvasFormat.presets) { f in
                Button { if f != current { choose(f) } } label: {
                    Text("\(f.name)  \(f.ratioLabel)  —  \(f.detail)")
                }
            }
        } label: {
            Label(Self.common.contains(current) ? "More Shapes" : "\(current.name) \(current.ratioLabel)", systemImage: "aspectratio")
        }
        .help("All canvas shapes")
    }
}

// MARK: - App bootstrap

public enum StudioApp {
    /// Call once from the app's `init()`.
    @MainActor
    public static func configure(_ config: StudioConfiguration) {
        StudioDocument.documentType = config.documentType
        StudioDocument.makeDefaultProject = { config.newProject() }
        UserDefaults.standard.register(defaults: [
            "appearance": AppearanceChoice.dark.rawValue,
            // Open on a new window, ready to go, rather than on the Open panel.
            "NSShowAppCentricOpenPanelInsteadOfUntitledFile": false,
        ])
        DispatchQueue.global(qos: .utility).async {
            // Compile every shader before the user needs it.
            if let r = try? StageRenderer() { r.warmUp() }
        }
    }
}
