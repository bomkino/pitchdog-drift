import AppKit
import AVFoundation
import Foundation
import Metal
import Observation
import QuartzCore
import SwiftUI
import UniformTypeIdentifiers

/// One entry in an app's signature gallery: a Drift World or a Galileo Scene.
public struct SceneEntry: Identifiable, @unchecked Sendable {
    public let id: String
    public let name: String
    /// Short uppercase eyebrow, e.g. "LONG BREATH · INK · WARM PAPER".
    public let eyebrow: String
    public let summary: String
    /// Builds the scene for a project (it may depend on the canvas).
    public let make: @Sendable (ReelProject) -> any StageScene
    /// Applies the entry's full look to a project when chosen.
    public let apply: @Sendable (inout ReelProject) -> Void

    public init(id: String, name: String, eyebrow: String, summary: String,
                make: @escaping @Sendable (ReelProject) -> any StageScene,
                apply: @escaping @Sendable (inout ReelProject) -> Void) {
        self.id = id
        self.name = name
        self.eyebrow = eyebrow
        self.summary = summary
        self.make = make
        self.apply = apply
    }
}

/// A scene in the browser: one movement, offered as a single look or in
/// several styles that share the movement and differ in mood.
public struct SceneGroup: Identifiable, @unchecked Sendable {
    public let id: String
    public let name: String
    /// What happens, in plain words, in a tall frame and in a wide one.
    public let summary: String
    public let wideSummary: String
    /// SF Symbols that show the movement in a tall frame and in a wide one.
    public let symbol: String
    public let wideSymbol: String
    /// The browser section it sits in, or nil for none.
    public let section: String?
    /// The looks it offers: one, or several styles.
    public let members: [SceneEntry]

    public init(id: String, name: String, summary: String, wideSummary: String? = nil, symbol: String, wideSymbol: String? = nil,
                section: String? = nil, members: [SceneEntry]) {
        self.id = id
        self.name = name
        self.summary = summary
        self.wideSummary = wideSummary ?? summary
        self.symbol = symbol
        self.wideSymbol = wideSymbol ?? symbol
        self.section = section
        self.members = members
    }

    /// A group of one scene, named and described by the scene itself.
    public init(single entry: SceneEntry, summary: String, wideSummary: String? = nil, symbol: String, wideSymbol: String? = nil,
                section: String? = nil) {
        self.init(id: entry.id, name: entry.name, summary: summary, wideSummary: wideSummary, symbol: symbol, wideSymbol: wideSymbol,
                  section: section, members: [entry])
    }

    public var hasStyles: Bool { members.count > 1 }

    public func summary(tall: Bool) -> String { tall ? summary : wideSummary }
    public func symbol(tall: Bool) -> String { tall ? symbol : wideSymbol }
}

/// Everything that makes Drift Drift and Galileo Galileo.
public struct StudioConfiguration: @unchecked Sendable {
    public var appID: String
    public var appName: String
    public var documentType: UTType
    public var galleryTitle: String
    public var gallerySymbol: String
    /// The browser's scenes, in order.
    public var groups: [SceneGroup]
    /// Every look the app offers, styles included.
    public var scenes: [SceneEntry]
    public var defaultScene: String
    public var emptyTitle: String
    public var emptyDetail: String
    public var itemNoun: String
    public var defaultFormat: CanvasFormat
    public var sampleCount: Int

    public init(appID: String, appName: String, documentType: UTType, galleryTitle: String, gallerySymbol: String,
                groups: [SceneGroup], defaultScene: String, emptyTitle: String, emptyDetail: String,
                itemNoun: String, defaultFormat: CanvasFormat, sampleCount: Int = 8) {
        self.appID = appID
        self.appName = appName
        self.documentType = documentType
        self.galleryTitle = galleryTitle
        self.gallerySymbol = gallerySymbol
        self.groups = groups
        self.scenes = groups.flatMap(\.members)
        self.defaultScene = defaultScene
        self.emptyTitle = emptyTitle
        self.emptyDetail = emptyDetail
        self.itemNoun = itemNoun
        self.defaultFormat = defaultFormat
        self.sampleCount = sampleCount
    }

    public func entry(_ id: String) -> SceneEntry {
        scenes.first { $0.id == id } ?? scenes[0]
    }

    /// The browser scene a look belongs to.
    public func group(of id: String) -> SceneGroup {
        groups.first { g in g.members.contains { $0.id == id } } ?? groups[0]
    }

    public func newProject() -> ReelProject {
        var p = ReelProject(app: appID, scene: defaultScene, dials: SceneDials(), backdrop: BackdropCatalog.defaultSettings,
                            look: StageLook(), format: defaultFormat)
        entry(defaultScene).apply(&p)
        return p
    }
}

/// Anything the live stage, transport and export sheet can play.
@MainActor
public protocol StageSource: AnyObject {
    var clock: PlaybackClock { get }
    var version: Int { get }
    var fps: Int { get }
    var format: CanvasFormat { get }
    var loopDuration: Double { get }
    var exportName: String { get }
    func composition() -> Composition?
    /// What the live stage draws: the composition, or a look being previewed.
    func stageComposition() -> Composition?
    /// The composition laid out for another canvas format.
    func composition(for format: CanvasFormat) -> Composition?
    /// The loop length on another canvas format, which some scenes pace to.
    func loopDuration(for format: CanvasFormat) -> Double
    func touch()
    /// Keeps preview sound in step with playback. Returns the clock time the
    /// sound has reached while it plays, or nil when there is no sound.
    func soundClock(playing: Bool, time: Double) -> Double?
    /// The sound for an export of this length, or nil for silence.
    func exportAudio(duration: Double) -> AudioTrack?
    /// The sound for an export of this length on another canvas format.
    func exportAudio(for format: CanvasFormat, duration: Double) -> AudioTrack?
    /// A short name for the sound in the export summary, or nil for silence.
    var soundTitle: String? { get }
    /// Seconds into the loop where the choreography lands a moment, for the transport.
    var beats: [Double] { get }
}

public extension StageSource {
    func soundClock(playing: Bool, time: Double) -> Double? { nil }
    func exportAudio(duration: Double) -> AudioTrack? { nil }
    func exportAudio(for format: CanvasFormat, duration: Double) -> AudioTrack? { exportAudio(duration: duration) }
    func composition(for format: CanvasFormat) -> Composition? { composition() }
    func stageComposition() -> Composition? { composition() }
    func loopDuration(for format: CanvasFormat) -> Double { loopDuration }
    var soundTitle: String? { nil }
    var beats: [Double] { [] }
}

/// Playback position. Only the transport observes it every frame.
@Observable
public final class PlaybackClock {
    public var time: Double = 0
    public var playing: Bool = true
    public var duration: Double = 10
    /// True while the person types in a text field; single-key shortcuts stand down.
    public var typing = false
    public init() {}
}

/// Editor state for one window.
@Observable
@MainActor
public final class StudioSession: StageSource {
    public let config: StudioConfiguration
    @ObservationIgnored public let document: StudioDocument
    @ObservationIgnored public weak var undoManager: UndoManager?

    public private(set) var project: ReelProject
    public var selection: UUID?
    public var textures: [UUID: MediaTexture] = [:]
    public var thumbnails: [UUID: CGImage] = [:]
    public var importing = 0
    public var showExport = false {
        didSet { if showExport { endPreview() } }
    }
    public var message: String?
    /// Increments whenever anything visible changes; the stage redraws on change.
    public private(set) var version = 0
    public let clock = PlaybackClock()

    @ObservationIgnored private var pendingEditStart: ReelProject?
    /// Times the stage's previews from the pointer resting in this window's browser.
    @ObservationIgnored public private(set) var hover: PreviewHover!
    /// Clip lengths read from the files, so undo and redo never bring back a
    /// snapshot taken before a clip had finished loading.
    @ObservationIgnored private var knownDurations: [UUID: Double] = [:]
    /// Names the open gesture, so a different one closes it as its own undo step.
    @ObservationIgnored private var pendingEditName: String?

    /// How many sessions have been made in this process (the harness reports it).
    nonisolated(unsafe) public static var made = 0

    public init(config: StudioConfiguration, document: StudioDocument) {
        Self.made += 1
        self.config = config
        self.document = document
        var p = document.project
        if p.scene.isEmpty || p.app != config.appID {
            p = config.newProject()
            document.project = p
        }
        self.project = p
        // Media loads when the window appears (StudioRoot): SwiftUI may build and
        // discard sessions whenever it rebuilds the view.
        clock.duration = loopDuration
        hover = PreviewHover(self)
    }

    // MARK: Editing with undo

    /// Applies a change as one undoable step. A gesture still open (typing a
    /// title, say) is closed first as its own step, so undo never merges them.
    public func update(_ actionName: String, _ change: (inout ReelProject) -> Void) {
        let openGesture = pendingEditStart != nil ? pendingEditName : nil
        let wasOpen = pendingEditStart != nil
        if wasOpen { commitEdit(pendingEditName ?? "Edit") }
        defer {
            // The gesture carries on from here, so the rest of a drag still undoes.
            if wasOpen {
                pendingEditStart = project
                pendingEditName = openGesture
            }
        }
        let before = project
        var after = project
        change(&after)
        guard after != before else { return }
        set(after)
        registerUndo(from: before, name: actionName)
    }

    /// Call at the start of a continuous gesture (slider drag, typing). A
    /// different gesture still open is closed first as its own step.
    public func beginEdit(_ name: String? = nil) {
        if pendingEditStart != nil, pendingEditName != name { commitEdit(pendingEditName ?? "Edit") }
        if pendingEditStart == nil {
            pendingEditStart = project
            pendingEditName = name
        }
    }

    /// Live change during a gesture: no undo registration until commit.
    public func live(_ change: (inout ReelProject) -> Void) {
        var p = project
        change(&p)
        guard p != project else { return }
        set(p)
    }

    /// Closes the open gesture only if it is the named one, for a view that
    /// cannot tell whether another gesture has since taken over.
    public func commitEdit(ifOpen name: String) {
        if pendingEditStart != nil, pendingEditName == name { commitEdit(name) }
    }

    public func commitEdit(_ actionName: String) {
        guard let start = pendingEditStart else { return }
        pendingEditStart = nil
        pendingEditName = nil
        if start != project { registerUndo(from: start, name: actionName) }
    }

    private func set(_ p: ReelProject) {
        if previewID != nil { endPreview() }
        var p = p
        for i in p.items.indices where p.items[i].kind == .video && p.items[i].duration == nil {
            p.items[i].duration = knownDurations[p.items[i].id]
        }
        project = p
        document.project = p
        version += 1
        // Any change can move the loop's length (a scene paces to its frame, its
        // items and its dials), so the transport follows whenever it does.
        let d = loopDuration
        if abs(clock.duration - d) > 1e-6 {
            clock.duration = d
            if clock.time > d { clock.time = wrap(clock.time, d) }
        }
    }

    private func registerUndo(from old: ReelProject, name: String) {
        guard let um = undoManager else { return }
        let current = project
        um.registerUndo(withTarget: document) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.set(old)
                // A gesture still open (a focused title field) now starts from here,
                // so its commit never undoes the undo.
                if self.pendingEditStart != nil { self.pendingEditStart = old }
                self.registerUndo(from: current, name: name)
                self.loadAllMedia()
            }
        }
        um.setActionName(name)
    }

    public func touch() { version += 1 }
    public var fps: Int { project.fps }
    public var format: CanvasFormat { project.format }
    public var exportName: String {
        let g = group
        return config.appName + " " + g.name + (g.hasStyles ? " " + entry.name : "")
    }

    // MARK: Scene and composition

    public var entry: SceneEntry { config.entry(project.scene) }
    public var group: SceneGroup { config.group(of: project.scene) }
    public var scene: any StageScene { entry.make(project) }

    public var sceneItems: [SceneItem] {
        project.items.enumerated().map { i, item in
            SceneItem(media: i, occurrence: i, aspect: textures[item.id]?.aspect ?? item.aspect, featured: item.featured)
        }
    }

    public var loopDuration: Double { loopDuration(for: project.format) }

    public func loopDuration(for format: CanvasFormat) -> Double { loopDuration(of: project, format: format) }

    private func loopDuration(of p: ReelProject, format: CanvasFormat) -> Double {
        if let o = p.loopOverride { return o }
        let ctx = SceneContext(items: sceneItems.isEmpty ? samplePlaceholderItems : sceneItems,
                               aspect: Float(format.aspect), dials: p.dials, seed: p.seed)
        return max(0.5, config.entry(p.scene).make(p).loopDuration(ctx))
    }

    /// Loop length at another Pace, other settings as they are.
    public func loopDuration(pace: Float) -> Double {
        var p = project
        p.dials.pace = pace
        return loopDuration(of: p, format: project.format)
    }

    /// Sets Pace so one loop lasts as close to `seconds` as the scene allows;
    /// a quicker pace makes a shorter loop.
    public func fitLoop(to seconds: Double) {
        var slow: Float = 0, quick: Float = 1
        for _ in 0..<18 {
            let mid = (slow + quick) / 2
            if loopDuration(pace: mid) > seconds { slow = mid } else { quick = mid }
        }
        let pace = abs(loopDuration(pace: slow) - seconds) < abs(loopDuration(pace: quick) - seconds) ? slow : quick
        update("Loop Length") { $0.dials.pace = pace }
    }

    private var samplePlaceholderItems: [SceneItem] {
        (0..<6).map { SceneItem(media: $0, occurrence: $0, aspect: 16.0 / 9.0) }
    }

    /// The composition to export, or nil while there is nothing to show.
    public func composition() -> Composition? { composition(for: project.format) }

    public func composition(for format: CanvasFormat) -> Composition? { composition(of: project, format: format) }

    /// What the live stage draws: the look being previewed, if any.
    public func stageComposition() -> Composition? { composition(of: stageProject, format: project.format) }

    /// A composition of `p` laid out for `format`, for previews of other looks.
    /// Thumbnails leave the title out: their cache does not follow its words.
    public func composition(of p: ReelProject, format: CanvasFormat, title: Bool = true) -> Composition? {
        let items = sceneItems
        guard !items.isEmpty else { return nil }
        let placeholder = MediaLoader.placeholder()
        let textures = p.items.map { self.textures[$0.id]?.texture ?? placeholder.texture }
        let ctx = SceneContext(items: items, aspect: Float(format.aspect), dials: p.dials, seed: p.seed)
        var videos: [Int: VideoClip] = [:]
        for (i, item) in p.items.enumerated() where item.kind == .video {
            if let d = item.duration, d > 0 { videos[i] = VideoClip(url: document.media.url(for: item.file), duration: d) }
        }
        return Composition(scene: config.entry(p.scene).make(p), context: ctx, textures: textures, backdrop: p.backdrop, look: p.look,
                           backdropLoop: 14, videos: videos, overlay: title ? titleOverlay(p) : nil)
    }

    /// `p` with blank cards in place of media, to show a look before anything is added.
    public func placeholderComposition(of p: ReelProject) -> Composition? {
        let items = samplePlaceholderItems
        let placeholder = MediaLoader.placeholder()
        let ctx = SceneContext(items: items, aspect: Float(p.format.aspect), dials: p.dials, seed: p.seed)
        return Composition(scene: config.entry(p.scene).make(p), context: ctx, textures: items.map { _ in placeholder.texture },
                           backdrop: p.backdrop, look: p.look, backdropLoop: 14)
    }

    // MARK: Previewing a look

    /// The look on the stage while the pointer rests on it in the browser.
    /// Nothing changes until it is chosen; moving away brings back the
    /// project, where it was in its loop.
    public private(set) var previewID: String?
    @ObservationIgnored private var previewProject: ReelProject?
    @ObservationIgnored private var previewReturn: (time: Double, playing: Bool)?

    /// The project as the stage shows it.
    public var stageProject: ReelProject { previewProject ?? project }

    /// The loop the stage plays: the project's, or the previewed look's.
    public var stageLoopDuration: Double { loopDuration(of: stageProject, format: project.format) }

    /// Shows the look `id` on the stage from the start of its loop, playing,
    /// or ends the preview when `id` is nil or the look already in use.
    public func preview(_ id: String?) {
        guard let id, id != project.scene, config.scenes.contains(where: { $0.id == id }), !project.items.isEmpty, !showExport else {
            endPreview()
            return
        }
        guard previewID != id else { return }
        if previewReturn == nil { previewReturn = (clock.time, clock.playing) }
        var p = project
        p.scene = id
        config.entry(id).apply(&p)
        previewProject = p
        previewID = id
        clock.time = 0
        clock.playing = true
        clock.duration = loopDuration(of: p, format: p.format)
        version += 1
    }

    /// Brings back the project on the stage. With `keepTime`, playback carries
    /// on from the preview's moment, for a look that has just been chosen.
    public func endPreview(keepTime: Bool = false) {
        guard previewID != nil else { return }
        previewID = nil
        previewProject = nil
        if let r = previewReturn, !keepTime {
            clock.time = r.time
            clock.playing = r.playing
        }
        previewReturn = nil
        clock.duration = loopDuration
        // A look chosen from its preview sets the time itself once it is in place.
        if !keepTime, clock.time > clock.duration { clock.time = wrap(clock.time, clock.duration) }
        version += 1
    }

    /// Whether the title is set in light ink: always over a title card's
    /// dimming, otherwise by choice or by how light the backdrop runs.
    public var titleIsLight: Bool { titleIsLight(project) }

    /// The same for `p`, whose backdrop may differ from the project's (a look being previewed).
    public func titleIsLight(_ p: ReelProject) -> Bool {
        guard let title = p.title else { return true }
        switch title.ink {
        case .light: return true
        case .dark: return false
        case .auto: return title.placement == .centre || p.backdrop.palette.meanLightness * min(p.backdrop.brightness, 1.2) < 0.62
        }
    }

    /// The title to draw over the composition, or nil when there is none.
    public func titleOverlay() -> TitleOverlay? { titleOverlay(project) }

    /// The title to draw over a composition of `p`, inked for its backdrop.
    public func titleOverlay(_ p: ReelProject) -> TitleOverlay? {
        guard let title = p.title, !title.isEmpty else { return nil }
        let light = titleIsLight(p)
        var h = Hasher()
        h.combine(title)
        h.combine(light)
        return TitleOverlay(key: h.finalize(), timing: title.timing, scrim: title.placement == .centre ? 0.5 : 0) { w, hgt in
            TitleArt.image(title, light: light, width: w, height: hgt)
        }
    }

    // MARK: Media

    public static let importTypes: [UTType] = [.image, .pdf, .movie, .mpeg4Movie, .quickTimeMovie]

    public func importMedia(_ urls: [URL], at index: Int? = nil) {
        var newItems: [MediaItem] = []
        for url in urls {
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            let entries = MediaLoader.inspect(url)
            guard !entries.isEmpty else { continue }
            guard let stored = try? document.media.importFile(url) else { continue }
            let base = url.deletingPathExtension().lastPathComponent
            for e in entries {
                let name = entries.count > 1 ? "\(base) · \(e.page + 1)" : base
                newItems.append(MediaItem(name: name, file: stored, kind: e.kind, page: e.page, aspect: 16.0 / 9.0))
            }
        }
        guard !newItems.isEmpty else {
            message = "Those files could not be added. Try images, PDFs or movies."
            return
        }
        // The first real media replaces untouched samples, in the same undo step.
        let replacesSamples = !project.items.isEmpty && project.items.allSatisfy(\.isSample)
        update(newItems.count == 1 ? "Add Media" : "Add \(newItems.count) Items") { p in
            if replacesSamples { p.items.removeAll() }
            let at = min(index ?? p.items.count, p.items.count)
            p.items.insert(contentsOf: newItems, at: at)
        }
        if replacesSamples || selection == nil { selection = newItems.first?.id }
        loadAllMedia()
    }

    /// True while sample work is being made for a new window.
    public private(set) var preparingSamples = false

    /// Fills an empty document with sample work: a sample deck in Drift, a set
    /// of works painted by Backdrop's looks in Galileo.
    public func addSamples() {
        update("Add Sample Media") { p in p.items.append(contentsOf: makeSamples()) }
        loadAllMedia()
    }

    /// Opens a new window on sample work, so it shows what the app does at
    /// once. Made off the main thread and added without an undo step, so the
    /// window is not edited until the person changes something; the first
    /// real media replace the samples.
    public func addStarterSamples() {
        guard project.items.isEmpty, !preparingSamples else { return }
        preparingSamples = true
        let galileo = config.appID == "galileo"
        let count = config.sampleCount
        let store = document.media
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let items = Self.renderSamples(galileo: galileo, count: count, store: store)
            DispatchQueue.main.async {
                guard let self else { return }
                self.preparingSamples = false
                guard self.project.items.isEmpty else { return }
                LaunchProbe.mark("samples")
                self.live { p in p.items.append(contentsOf: items) }
                // Steps recorded before the samples arrived hold an empty reel;
                // undoing one would take the samples away, so they go.
                self.undoManager?.removeAllActions(withTarget: self.document)
                if self.pendingEditStart != nil { self.pendingEditStart = self.project }
                self.loadAllMedia()
            }
        }
    }

    private func makeSamples() -> [MediaItem] {
        Self.renderSamples(galileo: config.appID == "galileo", count: config.sampleCount, store: document.media)
    }

    /// Sample work for a new document, drawn once and kept in the caches
    /// folder, so later windows only copy files.
    /// Serialises the sample cache, so two new windows never build it at once.
    nonisolated private static let sampleLock = NSLock()

    nonisolated private static func renderSamples(galileo: Bool, count: Int, store: MediaStore) -> [MediaItem] {
        struct Entry: Codable { var name: String; var file: String; var aspect: Float }
        sampleLock.lock()
        defer { sampleLock.unlock() }
        let fm = FileManager.default
        // Bump the version whenever the sample art changes.
        let cache = fm.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("dog.pitch.studio-samples", isDirectory: true)
            .appendingPathComponent((galileo ? "galileo" : "drift") + "-v3-\(count)", isDirectory: true)
        let manifest = cache.appendingPathComponent("samples.json")
        var entries = (try? Data(contentsOf: manifest)).flatMap { try? JSONDecoder().decode([Entry].self, from: $0) } ?? []
        if entries.count != count || !entries.allSatisfy({ fm.fileExists(atPath: cache.appendingPathComponent($0.file).path) }) {
            try? fm.removeItem(at: cache)
            try? fm.createDirectory(at: cache, withIntermediateDirectories: true)
            entries = (0..<count).map { i in
                let img: CGImage
                let name: String
                if galileo {
                    img = SampleArt.painting(index: i) ?? SampleArt.make(index: i + 3, width: 1600, height: i % 3 == 1 ? 2000 : 900)
                    name = SampleArt.paintingName(index: i)
                } else {
                    img = SampleDeck.slide(index: i)
                    name = SampleDeck.titles[i % SampleDeck.titles.count]
                }
                let file = "\(i).png"
                if let data = pngData(img) { try? data.write(to: cache.appendingPathComponent(file), options: .atomic) }
                return Entry(name: name, file: file, aspect: Float(img.width) / Float(img.height))
            }
            // The manifest goes last, so a cache is only complete once it is there.
            if let data = try? JSONEncoder().encode(entries) { try? data.write(to: manifest, options: .atomic) }
        }
        return entries.compactMap { e in
            guard let data = try? Data(contentsOf: cache.appendingPathComponent(e.file)) else { return nil }
            let file = MediaItem.samplePrefix + UUID().uuidString + ".png"
            try? store.write(data, as: file)
            return MediaItem(name: e.name, file: file, kind: .image, aspect: e.aspect)
        }
    }

    nonisolated private static func pngData(_ image: CGImage) -> Data? {
        let rep = NSBitmapImageRep(cgImage: image)
        return rep.representation(using: .png, properties: [:])
    }

    /// The largest texture size in memory. When the set grows enough that every
    /// texture should be smaller, everything is reloaded at the new size, so a
    /// big deck added to a small one still shares the budget.
    @ObservationIgnored private var loadedSide: Int?

    /// Items whose media has finished loading, or failed to (a lost file, a
    /// clip that will not decode); either way nothing more is coming for them.
    @ObservationIgnored public private(set) var settledMedia: Set<UUID> = []

    /// Whether every item's media has loaded or failed, so thumbnails can render.
    public var mediaSettled: Bool { importing == 0 && project.items.allSatisfy { settledMedia.contains($0.id) } }

    /// Loads what is missing, or everything when the textures should shrink.
    public func loadAllMedia() {
        let side = MediaLoader.textureSide(forItems: project.items.count)
        if let loaded = loadedSide, Double(side) < Double(loaded) * 0.8 {
            load(project.items)
            return
        }
        let missing = project.items.filter { textures[$0.id] == nil }
        if !missing.isEmpty { load(missing) }
    }

    private func load(_ items: [MediaItem]) {
        importing += items.count
        let store = document.media
        let side = MediaLoader.textureSide(forItems: project.items.count)
        loadedSide = items.count >= project.items.count ? side : max(loadedSide ?? side, side)
        for item in items {
            let url = store.url(for: item.file)
            let kind = item.kind, page = item.page, id = item.id
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                let tex = try? MediaLoader.load(url: url, kind: kind, page: page, maxSide: side)
                let thumb = MediaLoader.cgImage(url: url, kind: kind, page: page, maxSide: 360)
                let clipDuration: Double? = kind == .video ? AVURLAsset(url: url).duration.seconds : nil
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.importing = max(0, self.importing - 1)
                    self.settledMedia.insert(id)
                    if let d = clipDuration, d.isFinite { self.knownDurations[id] = d }
                    if let d = clipDuration, d.isFinite, let idx = self.project.items.firstIndex(where: { $0.id == id }),
                       self.project.items[idx].duration != d {
                        var p = self.project
                        p.items[idx].duration = d
                        self.project = p
                        self.document.project = p
                    }
                    if let tex {
                        self.textures[id] = tex
                        if let idx = self.project.items.firstIndex(where: { $0.id == id }),
                           abs(self.project.items[idx].aspect - tex.aspect) > 0.001 {
                            // Record the true aspect without an undo step.
                            var p = self.project
                            p.items[idx].aspect = tex.aspect
                            self.project = p
                            self.document.project = p
                        }
                    }
                    if let thumb { self.thumbnails[id] = thumb }
                    self.version += 1
                    self.clock.duration = self.stageLoopDuration
                    if self.importing == 0 { LaunchProbe.mark("media-ready", finish: true) }
                }
            }
        }
    }

    public func remove(_ ids: Set<UUID>) {
        guard !ids.isEmpty else { return }
        update(ids.count == 1 ? "Remove Item" : "Remove Items") { p in p.items.removeAll { ids.contains($0.id) } }
        if let s = selection, ids.contains(s) { selection = project.items.first?.id }
    }

    public func move(from source: IndexSet, to destination: Int) {
        update("Reorder") { p in p.items.move(fromOffsets: source, toOffset: destination) }
    }

    public func toggleFeatured(_ id: UUID) {
        update("Feature") { p in
            if let i = p.items.firstIndex(where: { $0.id == id }) { p.items[i].featured.toggle() }
        }
    }

    public func chooseScene(_ id: String) {
        guard id != project.scene else { return }
        let previewed = previewID == id
        let time = clock.time
        if previewed { endPreview(keepTime: true) }
        update("Choose \(config.galleryTitle)") { p in
            p.scene = id
            config.entry(id).apply(&p)
        }
        // A look chosen from its preview carries on where the preview was;
        // otherwise it starts from the top, so the opening is seen.
        clock.time = previewed ? min(time, max(clock.duration - 0.001, 0)) : 0
        touch()
    }

    /// Steps through the browser's scenes, or through the current scene's styles.
    public func stepScene(_ delta: Int, styles: Bool = false) {
        if styles {
            let members = group.members
            guard members.count > 1, let i = members.firstIndex(where: { $0.id == project.scene }) else { return }
            chooseScene(members[(i + delta + members.count) % members.count].id)
        } else {
            let groups = config.groups
            guard let i = groups.firstIndex(where: { $0.id == group.id }) else { return }
            let j = max(0, min(groups.count - 1, i + delta))
            guard j != i else { return }
            chooseScene(groups[j].members[0].id)
        }
    }

    public func shuffle() {
        update("New Variation") { p in
            p.seed = p.seed &+ 7919
            p.backdrop.seed = p.backdrop.seed &+ 131
        }
    }

    // MARK: Sound

    @ObservationIgnored private var soundCache: (key: Int, track: AudioTrack)?
    @ObservationIgnored private let soundPreview = SoundPreview()
    @ObservationIgnored private var lastSoundTime: Double?
    /// A change the preview has not caught up with, and when it was first seen.
    @ObservationIgnored private var pendingSound: (key: Int, since: CFTimeInterval)?

    /// Everything the loop's sound depends on.
    private var soundKey: Int {
        var h = Hasher()
        h.combine(project.sound)
        h.combine(project.scene)
        h.combine(project.dials)
        h.combine(project.seed)
        h.combine(project.format.width)
        h.combine(project.format.height)
        h.combine(loopDuration)
        // A title that opens or closes the loop has its own cue.
        h.combine(project.title.flatMap { $0.isEmpty ? nil : $0.timing })
        for item in project.items {
            h.combine(item.featured)
            h.combine(item.aspect)
        }
        return h.finalize()
    }

    /// The loop's sound, rendered when first needed and kept until something it
    /// depends on changes.
    public func soundMix() -> AudioTrack? {
        guard let sound = project.sound, SoundLibrary.shared.isAvailable else { return nil }
        let key = soundKey
        if let cached = soundCache, cached.key == key { return cached.track }
        guard let comp = composition() else { return nil }
        let track = SoundMixer.render(soundEvents(comp, loop: loopDuration), sound: sound, loop: loopDuration, seed: project.seed)
        soundCache = (key, track)
        return track
    }

    public func soundClock(playing: Bool, time: Double) -> Double? {
        guard playing, previewID == nil, !StudioSnapshot.isRequested, project.sound != nil, SoundLibrary.shared.isAvailable else {
            if soundPreview.isPlaying { soundPreview.stop() }
            lastSoundTime = nil
            return nil
        }
        var key = soundKey
        // While a slider moves, keep playing what is there; render the new mix
        // once the change has held still for a moment.
        if let cached = soundCache, cached.key != key, soundPreview.isPlaying {
            let now = CACurrentMediaTime()
            if pendingSound?.key != key { pendingSound = (key, now) }
            if now - (pendingSound?.since ?? now) < 0.25 {
                key = cached.key
            }
        }
        let track: AudioTrack
        if let cached = soundCache, cached.key == key {
            track = cached.track
        } else if let fresh = soundMix() {
            track = fresh
            key = soundKey
            pendingSound = nil
        } else {
            if soundPreview.isPlaying { soundPreview.stop() }
            lastSoundTime = nil
            return nil
        }
        let loop = loopDuration
        // Restart when the sound changed or the playhead was moved by hand.
        let moved = lastSoundTime.map { abs(wrap(time - $0 + loop / 2, loop) - loop / 2) > 0.05 } ?? true
        if !soundPreview.isPlaying || soundPreview.signature != key || moved {
            soundPreview.play(track, signature: key, loop: loop, from: time)
        }
        let t = soundPreview.position() ?? time
        lastSoundTime = t
        return t
    }

    public func exportAudio(duration: Double) -> AudioTrack? {
        soundMix()?.repeated(toFrames: Int((duration * Double(AudioTrack.sampleRate)).rounded()))
    }

    /// Another format paces its scene to its own frame, so its sound is mixed afresh.
    public func exportAudio(for format: CanvasFormat, duration: Double) -> AudioTrack? {
        if format == project.format { return exportAudio(duration: duration) }
        guard let sound = project.sound, SoundLibrary.shared.isAvailable, let comp = composition(for: format) else { return nil }
        let loop = loopDuration(for: format)
        return SoundMixer.render(soundEvents(comp, loop: loop), sound: sound, loop: loop, seed: project.seed)
            .repeated(toFrames: Int((duration * Double(AudioTrack.sampleRate)).rounded()))
    }

    public var soundTitle: String? { project.sound?.palette.title }

    @ObservationIgnored private var beatCache: (key: Int, times: [Double])?

    /// The scene's moments, plus the title rising in when it opens or closes the loop.
    private func soundEvents(_ comp: Composition, loop: Double) -> [SoundEvent] {
        comp.scene.soundEvents(comp.context) + (comp.overlay?.soundEvents(loop: loop) ?? [])
    }
    @ObservationIgnored private var paletteCache: (key: Int, palette: Palette?)?

    /// A backdrop palette drawn from the work's own colours, once there are
    /// thumbnails to read; offered first in the Backdrop tab.
    public var mediaPalette: Palette? {
        var h = Hasher()
        for item in project.items { h.combine(item.id); h.combine(thumbnails[item.id] != nil) }
        let key = h.finalize()
        if let cached = paletteCache, cached.key == key { return cached.palette }
        let images = project.items.compactMap { thumbnails[$0.id] }
        let name = config.appID == "drift" ? "From your slides" : "From your work"
        let palette = images.isEmpty ? nil : Palette.extract(from: images, name: name)
        paletteCache = (key, palette)
        return palette
    }

    /// The moments each scene marks for its sound (landings, lifts, passes),
    /// whether or not sound is on; moments closer than about a frame's worth
    /// of the loop read as one.
    public var beats: [Double] {
        var h = Hasher()
        h.combine(stageProject)
        let key = h.finalize()
        if let cached = beatCache, cached.key == key { return cached.times }
        guard let comp = stageComposition() else { return [] }
        let loop = loopDuration(of: stageProject, format: project.format)
        var merged: [Double] = []
        for t in soundEvents(comp, loop: loop).map({ wrap($0.time, loop) }).sorted()
        where merged.last.map({ t - $0 > loop * 0.012 }) ?? true {
            merged.append(t)
        }
        beatCache = (key, merged)
        return merged
    }
}
