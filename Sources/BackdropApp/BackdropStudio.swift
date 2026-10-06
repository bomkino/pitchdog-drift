import AppKit
import ImageIO
import Metal
import StudioKit
import SwiftUI
import UniformTypeIdentifiers

// MARK: - Document

struct BackdropModel: Codable, Hashable {
    var version = 1
    var settings: BackdropSettings = {
        var s = BackdropCatalog.style("softbloom").defaults
        s.palette = Palettes.named("lagoon")
        return s
    }()
    var finish: FinishSettings = {
        var f = FinishSettings()
        f.vignette = 0
        f.grain = 0.2
        return f
    }()
    var loopSeconds: Double = 12
    var format: CanvasFormat = .reel
}

final class BackdropDocument: ReferenceFileDocument, @unchecked Sendable {
    typealias Snapshot = BackdropModel
    static let type = UTType(exportedAs: "dog.pitch.backdrop.look", conformingTo: .json)
    static var readableContentTypes: [UTType] { [type] }

    @Published var model: BackdropModel
    /// True for a document made fresh in this session, not opened from disk.
    var isNew = false

    init() {
        model = BackdropModel()
        isNew = true
    }

    required init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else { throw CocoaError(.fileReadCorruptFile) }
        model = try JSONDecoder().decode(BackdropModel.self, from: data)
    }

    func snapshot(contentType: UTType) throws -> BackdropModel { model }

    func fileWrapper(snapshot: BackdropModel, configuration: WriteConfiguration) throws -> FileWrapper {
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        return FileWrapper(regularFileWithContents: try enc.encode(snapshot))
    }
}

// MARK: - Session

@Observable
@MainActor
final class BackdropSession: StageSource {
    @ObservationIgnored let document: BackdropDocument
    @ObservationIgnored weak var undoManager: UndoManager?
    private(set) var model: BackdropModel
    private(set) var version = 0
    let clock = PlaybackClock()
    var showCard = false { didSet { version += 1 } }
    var showExport = false
    var savedMessage: String?
    /// The look the pointer is resting on, shown on the stage until it moves on.
    private(set) var previewStyle: String?
    @ObservationIgnored private var hoverTask: Task<Void, Never>?
    /// The row the pointer entered last, so a late exit from the row before
    /// doesn't cancel it.
    @ObservationIgnored private var hoverTarget: String?
    /// Whether the person picked the palette themselves, so it should stay
    /// when they switch looks. A new window's starting palette doesn't count.
    @ObservationIgnored private var paletteChosen = false
    /// The value before the step being registered, when that step changed it.
    @ObservationIgnored private var paletteChosenBefore: Bool?
    /// Saved looks, newest first, as the library holds them.
    private(set) var library: [SavedBackdrop] = []
    @ObservationIgnored private var pending: BackdropModel?
    @ObservationIgnored private lazy var cardTexture: MTLTexture? = try? MediaLoader.texture(from: SampleArt.make(index: 1)).texture

    init(document: BackdropDocument) {
        self.document = document
        self.model = document.model
        clock.duration = model.loopSeconds
        paletteChosen = !document.isNew && model.settings.palette != model.settings.styleInfo.defaults.palette
    }

    var fps: Int { 30 }
    var format: CanvasFormat { model.format }
    var loopDuration: Double { model.loopSeconds }
    /// The look, its palette and its loop, so two variations never share a name.
    var exportName: String {
        "Backdrop \(model.settings.styleInfo.name) \(model.settings.palette.name) \(Int(model.loopSeconds.rounded())) s"
    }
    /// The export sheet has the GPU to itself, and a still is the frame on screen.
    var stageSuspended: Bool { showExport }
    /// The background is the picture: nothing to leave out, nothing fast enough to blur.
    var offersTransparency: Bool { false }
    var offersMotionBlur: Bool { false }
    func touch() { version += 1 }

    func composition() -> Composition? { composition(for: model.format) }

    /// Takes a palette from a picture: its main colours, dark to light.
    @discardableResult
    func borrowColours(from url: URL) -> Bool {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                                                          kCGImageSourceThumbnailMaxPixelSize: 256] as CFDictionary),
              let palette = Palette.extract(from: [image], id: "from-picture", name: url.deletingPathExtension().lastPathComponent)
        else { return false }
        choosePalette(palette)
        return true
    }

    /// What exports: the background alone, whether or not a slide is shown on the stage.
    func composition(for format: CanvasFormat) -> Composition? { composition(for: format, card: false) }

    private func composition(for format: CanvasFormat, card showCard: Bool) -> Composition? {
        let items = showCard ? [SceneItem(media: 0, occurrence: 0, aspect: 16.0 / 9.0)] : []
        let ctx = SceneContext(items: items, aspect: Float(format.aspect), dials: SceneDials())
        var look = StageLook()
        look.finish = model.finish
        look.shadow = 0.6
        look.depthOfField = 0
        look.shutter = 0
        return Composition(scene: UnderlayScene(loop: model.loopSeconds, showCard: showCard), context: ctx,
                           textures: cardTexture.map { [$0] } ?? [], backdrop: model.settings, look: look,
                           backdropLoop: model.loopSeconds)
    }

    /// The live stage shows the look being auditioned, and the sample slide; exports never do.
    func stageComposition() -> Composition? {
        guard var comp = composition(for: model.format, card: showCard) else { return nil }
        if let id = previewStyle { comp.backdrop = settings(choosing: BackdropCatalog.style(id)) }
        return comp
    }

    private func set(_ m: BackdropModel) {
        model = m
        document.model = m
        clock.duration = m.loopSeconds
        if clock.time > m.loopSeconds { clock.time = wrap(clock.time, m.loopSeconds) }
        version += 1
    }

    func update(_ name: String, _ change: (inout BackdropModel) -> Void) {
        let before = model
        var after = model
        change(&after)
        guard after != before else { return }
        set(after)
        registerUndo(before, name)
    }

    func begin() { if pending == nil { pending = model } }
    func live(_ change: (inout BackdropModel) -> Void) { var m = model; change(&m); if m != model { set(m) } }
    func commit(_ name: String) {
        guard let p = pending else { return }
        pending = nil
        if p != model { registerUndo(p, name) }
    }

    private func registerUndo(_ old: BackdropModel, _ name: String) {
        guard let um = undoManager else { return }
        let current = model
        // Whether the palette counts as chosen goes back and forth with the step.
        let chosenNow = paletteChosen, chosenBefore = paletteChosenBefore ?? paletteChosen
        um.registerUndo(withTarget: document) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.set(old)
                self.paletteChosen = chosenBefore
                self.paletteChosenBefore = chosenNow
                self.registerUndo(current, name)
                self.paletteChosenBefore = nil
            }
        }
        um.setActionName(name)
    }

    /// What choosing a look gives: its own defaults and the current seed, and
    /// the palette too unless the person picked one themselves, which stays.
    func settings(choosing style: BackdropStyle) -> BackdropSettings {
        var s = style.defaults
        let current = model.settings
        s.seed = current.seed
        if paletteChosen { s.palette = current.palette }
        return s
    }

    func choosePalette(_ palette: Palette) {
        markPaletteChosen()
        update("Palette") { $0.settings.palette = palette }
        paletteChosenBefore = nil
    }

    /// Tries a variation; one with another palette counts as choosing it.
    func useVariation(_ settings: BackdropSettings) {
        if settings.palette != model.settings.palette { markPaletteChosen() }
        update("Variation") { $0.settings = settings }
        paletteChosenBefore = nil
    }

    private func markPaletteChosen() {
        paletteChosenBefore = paletteChosen
        paletteChosen = true
    }

    /// A new seed for the look: another arrangement of the same idea.
    func newVariation() { update("New Variation") { $0.settings.seed = $0.settings.seed &+ 97 } }

    func choose(_ style: BackdropStyle) {
        hoverTask?.cancel()
        if previewStyle != nil { previewStyle = nil; version += 1 }
        let chosen = settings(choosing: style)
        update("Choose \(style.name)") { $0.settings = chosen }
    }

    /// Rests on a look before the stage plays it, and waits a moment before
    /// bringing the document back, so moving down the list goes from look to
    /// look without flashing back in between.
    func hoverEnter(_ style: BackdropStyle) {
        hoverTarget = style.id
        hoverTask?.cancel()
        let wait = previewStyle != nil ? 90 : 260
        hoverTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(wait))
            guard let self, !Task.isCancelled else { return }
            let next: String? = style.id == self.model.settings.style ? nil : style.id
            if next != self.previewStyle { self.previewStyle = next; self.version += 1 }
        }
    }

    /// Shows a look on the stage at once, as resting on it would (headless checks).
    func previewNow(_ id: String) {
        hoverTask?.cancel()
        previewStyle = id == model.settings.style ? nil : id
        version += 1
    }

    func hoverExit(_ style: BackdropStyle) {
        guard style.id == hoverTarget else { return }
        hoverTarget = nil
        hoverTask?.cancel()
        hoverTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(140))
            guard let self, !Task.isCancelled, self.previewStyle != nil else { return }
            self.previewStyle = nil
            self.version += 1
        }
    }

    func saveToLibrary() {
        let name = "\(model.settings.styleInfo.name) · \(model.settings.palette.name)"
        do {
            try BackdropLibrary.save(name: name, settings: model.settings, finish: model.finish, loopSeconds: model.loopSeconds)
            savedMessage = "Saved “\(name)” to your library. Drift and Galileo can use it now."
            reloadLibrary()
        } catch {
            savedMessage = "Could not save to the library: \(error.localizedDescription)"
        }
    }

    func reloadLibrary() { library = BackdropLibrary.all() }

    /// Brings a saved look back, with its film finish and loop length when it has them.
    func use(_ item: SavedBackdrop) {
        markPaletteChosen()
        update("Use \(item.name)") { m in
            m.settings = item.settings
            if let finish = item.finish { m.finish = finish }
            if let loop = item.loopSeconds { m.loopSeconds = loop }
        }
        paletteChosenBefore = nil
    }

    func rename(_ item: SavedBackdrop, to name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != item.name else { return }
        do { try BackdropLibrary.rename(item, to: trimmed) } catch {
            savedMessage = "Could not rename “\(item.name)”: \(error.localizedDescription)"
        }
        reloadLibrary()
    }

    func trash(_ item: SavedBackdrop) {
        do { try BackdropLibrary.trash(item.id) } catch {
            savedMessage = "Could not move “\(item.name)” to the Trash: \(error.localizedDescription)"
        }
        reloadLibrary()
    }
}

// MARK: - Window

struct BackdropRoot: View {
    @State private var session: BackdropSession
    @Environment(\.undoManager) private var undoManager
    @AppStorage("appearance") private var appearance = AppearanceChoice.dark.rawValue

    init(document: BackdropDocument) {
        _session = State(initialValue: BackdropSession(document: document))
    }

    var body: some View {
        BackdropWindow(session: session)
            .onAppear { session.undoManager = undoManager }
            .focusedSceneValue(\.backdropSession, session)
            .onChange(of: undoManager) { _, um in session.undoManager = um }
            .preferredColorScheme(AppearanceChoice(rawValue: appearance)?.colorScheme)
            .modifier(BackdropSnapshotHost(session: session))
    }
}

struct BackdropWindow: View {
    @Bindable var session: BackdropSession
    @State private var showInspector = true
    @Environment(\.snapshotStage) private var snapshotStage

    var body: some View {
        NavigationSplitView {
            LookBrowser(session: session)
                .navigationSplitViewColumnWidth(min: 220, ideal: 244, max: 320)
        } detail: {
            Group {
                if session.model.format.aspect < 0.9 {
                    // A tall frame leaves room beside it, so the variations sit there.
                    HStack(spacing: 0) {
                        BackdropStage(session: session, still: snapshotStage)
                        VariationColumn(session: session)
                            .frame(width: 236)
                    }
                } else {
                    VStack(spacing: 0) {
                        BackdropStage(session: session, still: snapshotStage)
                        Hairline()
                        VariationStrip(session: session)
                    }
                }
            }
            .background(Theme.surround)
            .inspector(isPresented: $showInspector) {
                BackdropInspector(session: session)
                    .inspectorColumnWidth(min: 290, ideal: 316, max: 400)
            }
        }
        .navigationSubtitle("\(session.model.format.width) × \(session.model.format.height) · \(String(format: "%.0f", session.model.loopSeconds)) s loop")
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                FormatPicker(current: session.model.format) { f in session.update("Canvas") { $0.format = f } }
                Toggle(isOn: $session.showCard) {
                    Label("Preview a slide", systemImage: "rectangle.on.rectangle")
                }
                .help("Preview a slide on top")
                Button { session.saveToLibrary() } label: {
                    Label("Save to Library", systemImage: "square.and.arrow.down.on.square")
                }
                .help("Save this look for Drift and Galileo")
                LibraryButton(session: session)
                Button { session.showExport = true } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "square.and.arrow.up").font(.system(size: 12, weight: .semibold))
                        Text("Export")
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                Button { showInspector.toggle() } label: { Label("Inspector", systemImage: "sidebar.right") }
            }
        }
        .sheet(isPresented: $session.showExport) { ExportSheet(source: session) }
        .alert("Library", isPresented: Binding(get: { session.savedMessage != nil }, set: { if !$0 { session.savedMessage = nil } })) {
            Button("OK") { session.savedMessage = nil }
        } message: { Text(session.savedMessage ?? "") }
        .frame(minWidth: 980, minHeight: 640)
    }
}

// MARK: - Library

/// The saved looks: use one, rename it, or move it to the Trash. Drift and
/// Galileo list the same looks on their Colour pages.
struct LibraryButton: View {
    let session: BackdropSession
    @State private var open = false

    var body: some View {
        Button { session.reloadLibrary(); open.toggle() } label: {
            Label("Library", systemImage: "books.vertical")
        }
        .help("Your saved looks")
        .popover(isPresented: $open, arrowEdge: .bottom) { LibraryList(session: session) }
    }
}

struct LibraryList: View {
    let session: BackdropSession
    @State private var renaming: SavedBackdrop?
    @State private var newName = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Library").textStyle(.label).foregroundStyle(.secondary)
                .padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 6)
            if session.library.isEmpty {
                Text("Looks you save appear here, and in Drift and Galileo.")
                    .textStyle(.caption).foregroundStyle(.secondary)
                    .frame(width: 260, alignment: .leading)
                    .padding(.horizontal, 14).padding(.bottom, 14)
            } else {
                ScrollView {
                    VStack(spacing: 2) {
                        ForEach(session.library) { item in
                            HStack(spacing: 10) {
                                BackdropThumb(settings: item.settings, size: CGSize(width: 52, height: 34))
                                Text(item.name).textStyle(.bodyCompact).lineLimit(1)
                                Spacer(minLength: 8)
                                Button("Use") { session.use(item) }.buttonStyle(QuietButtonStyle())
                                Menu {
                                    Button("Rename…") { newName = item.name; renaming = item }
                                    Button("Move to Trash", role: .destructive) { session.trash(item) }
                                } label: { Image(systemName: "ellipsis") }
                                .menuStyle(.borderlessButton)
                                .menuIndicator(.hidden)
                                .fixedSize()
                            }
                            .padding(.horizontal, 12).padding(.vertical, 4)
                        }
                    }
                }
                .frame(width: 340)
                .frame(maxHeight: 380)
                .padding(.bottom, 8)
            }
        }
        .alert("Rename", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Name", text: $newName)
            Button("Rename") { if let item = renaming { session.rename(item, to: newName) }; renaming = nil }
            Button("Cancel", role: .cancel) { renaming = nil }
        }
    }
}

// MARK: - Browser

struct LookBrowser: View {
    @Bindable var session: BackdropSession

    var body: some View {
        List {
            ForEach(BackdropFamily.allCases) { family in
                Section {
                    ForEach(BackdropCatalog.styles(in: family)) { style in
                        let selected = style.id == session.model.settings.style
                        Button { session.choose(style) } label: {
                            // Choose by seeing: a larger live swatch and the name. The
                            // description lives in the inspector and on hover.
                            HStack(spacing: 12) {
                                BackdropThumb(settings: style.defaults, size: CGSize(width: 80, height: 50))
                                    .overlay(RoundedRectangle(cornerRadius: 5, style: .continuous)
                                        .strokeBorder(selected ? Theme.accent : Theme.hairline, lineWidth: selected ? 2 : 1))
                                Text(style.name).textStyle(.bodyCompact).foregroundStyle(selected ? Theme.accentInk : .primary)
                                Spacer(minLength: 0)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .help(style.summary)
                        .padding(.vertical, 2)
                        .onHover { inside in inside ? session.hoverEnter(style) : session.hoverExit(style) }
                    }
                } header: {
                    HStack(spacing: 6) {
                        Image(systemName: family.symbol).font(.system(size: 10, weight: .semibold))
                        Text(family.title).textStyle(.label)
                    }
                    .foregroundStyle(.secondary)
                }
            }
        }
        .listStyle(.sidebar)
    }
}

/// A small static thumbnail of a backdrop.
struct BackdropThumb: View {
    let settings: BackdropSettings
    let size: CGSize
    @State private var image: CGImage?

    var body: some View {
        ZStack {
            Theme.well
            if let image { Image(decorative: image, scale: 2).resizable().aspectRatio(contentMode: .fill) }
        }
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
        .onAppear(perform: load)
        .onChange(of: settings) { _, _ in load() }
    }

    private func load() {
        var h = Hasher()
        h.combine(settings)
        TileRenderer.shared.backdrop(key: "thumb|\(h.finalize())", settings: settings, phase: 0.2,
                                     size: CGSize(width: size.width * 2, height: size.height * 2)) { img in
            if let img { image = img }
        }
    }
}

// MARK: - Stage

struct BackdropStage: View {
    let session: BackdropSession
    let still: CGImage?
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        VStack(spacing: 0) {
            GeometryReader { geo in
                let pad: CGFloat = 36
                let avail = CGSize(width: max(40, geo.size.width - pad * 2), height: max(40, geo.size.height - pad * 2))
                let aspect = CGFloat(session.model.format.aspect)
                let fitted = avail.width / avail.height > aspect
                    ? CGSize(width: avail.height * aspect, height: avail.height)
                    : CGSize(width: avail.width, height: avail.width / aspect)
                let scale = NSScreen.main?.backingScaleFactor ?? 2
                // Never more pixels than the export has: the stage only shows it.
                let canvas = CGFloat(max(session.model.format.width, session.model.format.height))
                let k = min(1, min(2400, canvas) / max(fitted.width, fitted.height) / scale)
                let px = CGSize(width: (fitted.width * scale * k).rounded(), height: (fitted.height * scale * k).rounded())
                ZStack {
                    Theme.surround
                    Group {
                        if let still {
                            Image(decorative: still, scale: 1).resizable()
                        } else {
                            StagePreview(source: session, pixelSize: px)
                        }
                    }
                    .frame(width: fitted.width, height: fitted.height)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.stage, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Theme.Radius.stage, style: .continuous)
                        .strokeBorder(session.previewStyle != nil ? Theme.accent.opacity(0.55) : Theme.hairline, lineWidth: 1))
                    .shadow(color: .black.opacity(scheme == .dark ? 0.55 : 0.18), radius: scheme == .dark ? 28 : 14, y: 4)
                }
                .frame(width: geo.size.width, height: geo.size.height)
                .overlay(alignment: .top) {
                    if let id = session.previewStyle {
                        HStack(spacing: 8) {
                            Circle().fill(Theme.accent).frame(width: 6, height: 6)
                            Text("Previewing \(BackdropCatalog.style(id).name)").textStyle(.label).foregroundStyle(.primary)
                            Text("Click to use it").textStyle(.caption).foregroundStyle(.secondary)
                        }
                        .padding(.top, 10)
                    }
                }
            }
            TransportBar(source: session, clock: session.clock)
        }
    }
}

// MARK: - Variations

/// Four reshuffles of the look, then four of its palettes, to try with a click.
@MainActor
func backdropVariations(_ base: BackdropSettings) -> [(String, BackdropSettings)] {
    var out: [(String, BackdropSettings)] = []
    for k in 1...4 {
        var v = base
        v.seed = base.seed &+ UInt32(k * 211)
        out.append(("Seed \(k)", v))
    }
    let all = Palettes.all
    let idx = all.firstIndex(where: { $0.id == base.palette.id }) ?? 0
    for k in 1...4 {
        var v = base
        v.palette = all[(idx + k * 3) % all.count]
        out.append((v.palette.name, v))
    }
    return out
}

/// The variations in a column beside a tall stage.
struct VariationColumn: View {
    @Bindable var session: BackdropSession

    var body: some View {
        let aspect = CGFloat(session.model.format.aspect)
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Variations").textStyle(.label)
                Text("Click to try; undo to go back").textStyle(.caption).foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 14)
            .padding(.top, 14)
            ScrollView {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 12) {
                    ForEach(Array(backdropVariations(session.model.settings).enumerated()), id: \.offset) { _, v in
                        BackdropTile(settings: v.1, title: v.0, selected: false, size: CGSize(width: 96, height: 96 / max(aspect, 0.3))) {
                            session.useVariation(v.1)
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 14)
            }
        }
        .background(Theme.chrome)
    }
}

struct VariationStrip: View {
    @Bindable var session: BackdropSession

    private var variations: [(String, BackdropSettings)] {
        backdropVariations(session.model.settings)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Variations").textStyle(.label)
                Spacer()
                Text("Click to try; undo to go back").textStyle(.caption).foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 16)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(Array(variations.enumerated()), id: \.offset) { _, v in
                        BackdropTile(settings: v.1, title: v.0, selected: false, size: CGSize(width: 132, height: 132 / max(0.6, CGFloat(session.model.format.aspect)) > 110 ? 110 : 132 / CGFloat(session.model.format.aspect))) {
                            session.useVariation(v.1)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
        .padding(.vertical, 12)
        .background(Theme.chrome)
    }
}

// MARK: - Inspector

struct BackdropInspector: View {
    @Bindable var session: BackdropSession

    private func borrowColours() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.image]
        panel.message = "Choose a picture to take its colours."
        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }
            MainActor.assumeIsolated { _ = session.borrowColours(from: url) }
        }
    }

    var body: some View {
        let s = session.model.settings
        let info = s.styleInfo
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text(info.family.title).textStyle(.badge).foregroundStyle(Theme.accentInk)
                Text(info.name).textStyle(.panelTitle)
                Text(info.summary).textStyle(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            Hairline()
            ScrollView {
                VStack(spacing: 0) {
                    InspectorSection("Palette", accessory: { Text(s.palette.name).textStyle(.metadata).foregroundStyle(.secondary) }) {
                        // A palette borrowed from a picture sits first while it is in use.
                        let borrowed = Palettes.all.contains { $0.id == s.palette.id } ? [] : [s.palette]
                        PalettePicker(selected: s.palette.id, palettes: borrowed + Palettes.all) { p in
                            session.choosePalette(p)
                        }
                        Button { borrowColours() } label: { Label("From a picture…", systemImage: "eyedropper") }
                            .buttonStyle(QuietButtonStyle())
                            .padding(.leading, -10)
                            .help("Take a palette from a photo or artwork; you can also drop one here")
                    }
                    .dropDestination(for: URL.self) { urls, _ in
                        guard let url = urls.first else { return false }
                        return session.borrowColours(from: url)
                    }
                    Hairline().padding(.horizontal, 16)
                    InspectorSection("Shape", accessory: {
                        Button { session.newVariation() } label: {
                            Image(systemName: "shuffle").font(.system(size: 11, weight: .semibold))
                        }
                        .buttonStyle(.plain).foregroundStyle(.secondary).help("Shuffle")
                    }) {
                        VStack(spacing: 4) {
                            dial(info.labels.scale, \.scale, info.defaults.scale)
                            dial(info.labels.motion, \.motion, info.defaults.motion)
                            dial(info.labels.detail, \.detail, info.defaults.detail)
                            dial(info.labels.softness, \.softness, info.defaults.softness)
                            dial(info.labels.accent, \.accent, info.defaults.accent)
                            dial("Edges", \.vignette, info.defaults.vignette)
                            ValueSlider("Brightness", value: Binding(get: { session.model.settings.brightness },
                                                                      set: { v in session.live { $0.settings.brightness = v } }),
                                        range: 0.3...1.6, defaultValue: 1, format: { String(format: "%.2f", $0) },
                                        onBegin: { session.begin() }, onCommit: { session.commit("Brightness") })
                        }
                    }
                    Hairline().padding(.horizontal, 16)
                    InspectorSection("Film") {
                        let natural = FinishSettings()
                        ChoiceRow(Grade.allCases.map { (Optional($0), $0.title) }, selection: Binding<Grade?>(
                            get: { Grade.allCases.first { $0.matches(session.model.finish, natural: natural) } },
                            set: { g in
                                guard let g else { return }
                                session.update("Grade") { g.apply(&$0.finish, natural: natural) }
                            }))
                        VStack(spacing: 4) {
                            finish("Grain", \.grain, 0.2)
                            finish("Grain size", \.grainSize, 0.35)
                            finish("Glow", \.bloom, 0.18)
                            finish("Contrast", \.contrast, 0, range: -0.5...0.5)
                            finish("Colour", \.saturation, 0, range: -1...1)
                            finish("Warmth", \.warmth, 0, range: -1...1)
                        }
                    }
                    Hairline().padding(.horizontal, 16)
                    InspectorSection("Loop") {
                        ValueSlider("Length", value: Binding(get: { Float(session.model.loopSeconds) },
                                                              set: { v in session.live { $0.loopSeconds = Double(v.rounded()) } }),
                                    range: 4...30, defaultValue: 12, format: { "\(Int($0)) s" },
                                    onBegin: { session.begin() }, onCommit: { session.commit("Loop Length") })
                        Text("The last frame meets the first exactly.").textStyle(.caption).foregroundStyle(.tertiary)
                    }
                }
                .padding(.bottom, 24)
            }
            .frame(minHeight: 0, maxHeight: .infinity)
        }
        .frame(minHeight: 0, maxHeight: .infinity)
        .background(Theme.chrome)
    }

    @ViewBuilder
    private func dial(_ label: String?, _ path: WritableKeyPath<BackdropSettings, Float>, _ def: Float) -> some View {
        if let label {
            ValueSlider(label, value: Binding(get: { session.model.settings[keyPath: path] },
                                              set: { v in session.live { $0.settings[keyPath: path] = v } }),
                        defaultValue: def, onBegin: { session.begin() }, onCommit: { session.commit(label) })
        }
    }

    private func finish(_ label: String, _ path: WritableKeyPath<FinishSettings, Float>, _ def: Float, range: ClosedRange<Float> = 0...1) -> some View {
        ValueSlider(label, value: Binding(get: { session.model.finish[keyPath: path] },
                                          set: { v in session.live { $0.finish[keyPath: path] = v } }),
                    range: range, defaultValue: def,
                    format: { range.lowerBound < 0 ? String(format: "%+d", Int(($0 * 100).rounded())) : String(Int(($0 * 100).rounded())) },
                    onBegin: { session.begin() }, onCommit: { session.commit(label) })
    }
}

// MARK: - Snapshot support

struct BackdropSnapshotHost: ViewModifier {
    let session: BackdropSession
    @State private var still: CGImage?
    @State private var started = false

    func body(content: Content) -> some View {
        content
            .environment(\.snapshotStage, still)
            .onAppear {
                guard StudioSnapshot.isRequested, !started else { return }
                started = true
                if let id = StudioSnapshot.arg("--scene") { session.choose(BackdropCatalog.style(id)) }
                if let fmt = StudioSnapshot.arg("--format"), let f = CanvasFormat.presets.first(where: { $0.id == fmt }) {
                    session.update("Canvas") { $0.format = f }
                }
                if let id = StudioSnapshot.arg("--preview-look") { session.previewNow(id) }
                if StudioSnapshot.arg("--card") != nil { session.showCard = true }
                if let picture = StudioSnapshot.arg("--palette-from") {
                    let ok = session.borrowColours(from: URL(fileURLWithPath: picture))
                    print("palette \(ok ? session.model.settings.palette.colors.map(\.hex).joined(separator: " ") : "failed")")
                }
                session.clock.playing = false
                session.clock.time = Double(StudioSnapshot.arg("--time") ?? "") ?? 3
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    if let comp = session.stageComposition() {
                        let h = 1000.0
                        still = try? Exporter().still(comp, at: session.clock.time, width: Int(h * session.model.format.aspect), height: Int(h))
                    }
                    if let path = StudioSnapshot.arg("--still"), let still {
                        try? ImageOutput.writePNG(still, to: URL(fileURLWithPath: path))
                        exit(0)
                    }
                    // The frame an export writes, which never shows the sample slide.
                    if let path = StudioSnapshot.arg("--export-frame"), let comp = session.composition() {
                        let h = 1000.0
                        if let frame = try? Exporter().still(comp, at: session.clock.time, width: Int(h * session.model.format.aspect), height: Int(h)) {
                            try? ImageOutput.writePNG(frame, to: URL(fileURLWithPath: path))
                        }
                        exit(0)
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + (Double(StudioSnapshot.arg("--settle") ?? "") ?? 4)) {
                        StudioSnapshot.captureWindow()
                    }
                }
            }
    }
}
