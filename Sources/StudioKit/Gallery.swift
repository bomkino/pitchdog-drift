import AppKit
import Metal
import QuartzCore
import SwiftUI

/// Renders gallery thumbnails off the main thread with its own renderer.
public final class TileRenderer: @unchecked Sendable {
    public static let shared = TileRenderer()

    private let queue = DispatchQueue(label: "dog.pitch.studio.tiles", qos: .userInitiated)
    private var exporter: Exporter?
    private var backdrop: BackdropRenderer?
    private var finisher: Finisher?
    private let lock = NSLock()
    private var cache: [String: CGImage] = [:]
    private var order: [String] = []

    private func cached(_ key: String) -> CGImage? {
        lock.lock(); defer { lock.unlock() }
        return cache[key]
    }

    private func store(_ key: String, _ image: CGImage) {
        lock.lock(); defer { lock.unlock() }
        cache[key] = image
        order.append(key)
        if order.count > 600 {
            let drop = order.removeFirst()
            cache[drop] = nil
        }
    }

    /// A still of a composition at `time`.
    public func still(key: String, comp: Composition, time: Double, size: CGSize, samples: Int = 1,
                      completion: @escaping @MainActor (CGImage?) -> Void) {
        if let c = cached(key) { Task { @MainActor in completion(c) }; return }
        queue.async {
            let started = CACurrentMediaTime()
            if self.exporter == nil { self.exporter = try? Exporter() }
            let img = try? self.exporter?.still(comp, at: time, width: Int(size.width), height: Int(size.height), samples: samples)
            if let img { self.store(key, img) }
            if LaunchProbe.enabled {
                print(String(format: "launch-probe tile %dx%d in %.0f ms, done at %.0f ms", Int(size.width), Int(size.height),
                             (CACurrentMediaTime() - started) * 1000, LaunchProbe.elapsed() * 1000))
            }
            Task { @MainActor in completion(img) }
        }
    }

    /// A background-only still.
    public func backdrop(key: String, settings: BackdropSettings, phase: Double, size: CGSize,
                         completion: @escaping @MainActor (CGImage?) -> Void) {
        if let c = cached(key) { Task { @MainActor in completion(c) }; return }
        queue.async {
            if self.backdrop == nil { self.backdrop = try? BackdropRenderer() }
            if self.finisher == nil { self.finisher = try? Finisher() }
            guard let br = self.backdrop, let fin = self.finisher else { Task { @MainActor in completion(nil) }; return }
            let gpu = GPU.shared
            let w = Int(size.width), h = Int(size.height)
            let hdr = gpu.makeTexture(width: w, height: h, format: .rgba16Float)
            let out = gpu.makeTexture(width: w, height: h, format: .bgra8Unorm, usage: [.renderTarget, .shaderRead])
            guard let cb = gpu.queue.makeCommandBuffer() else { return }
            var finish = FinishSettings()
            finish.grain = 0.12
            try? br.encode(cb, target: hdr, settings: settings, phase: phase)
            try? fin.encode(cb, input: hdr, output: out, settings: finish, frame: FinishFrame(frameIndex: 1))
            cb.commit()
            cb.waitUntilCompleted()
            let img = ImageOutput.cgImage(from: out, premultipliedAlpha: false)
            if let img { self.store(key, img) }
            Task { @MainActor in completion(img) }
        }
    }
}

/// Stable content key for a project's visible state.
func contentKey(_ p: ReelProject, scene: String? = nil) -> String {
    var h = Hasher()
    h.combine(p.items.map(\.id))
    h.combine(p.items.map(\.featured))
    h.combine(p.format.id)
    h.combine(p.dials)
    h.combine(p.backdrop)
    h.combine(p.look)
    h.combine(p.seed)
    return "\(scene ?? p.scene)|\(h.finalize())"
}

// MARK: - Hover preview

/// Rests on a look for a moment before the stage previews it, and waits a
/// moment before bringing the project back, so moving across the browser
/// goes from preview to preview without flashing back in between. Each
/// window has its own, so one window's pointer never holds another's preview.
@MainActor
public final class PreviewHover {
    private weak var session: StudioSession?
    private var pending: Task<Void, Never>?

    init(_ session: StudioSession) {
        self.session = session
    }

    func enter(_ id: String) {
        guard let session else { return }
        pending?.cancel()
        // Already previewing: move on quickly; otherwise wait for the pointer to rest.
        let wait = session.previewID != nil ? 90 : 260
        pending = Task { @MainActor [weak session] in
            try? await Task.sleep(for: .milliseconds(wait))
            if !Task.isCancelled { session?.preview(id) }
        }
    }

    func exit() {
        pending?.cancel()
        pending = Task { @MainActor [weak session] in
            try? await Task.sleep(for: .milliseconds(140))
            if !Task.isCancelled { session?.endPreview() }
        }
    }

    func cancel() {
        pending?.cancel()
        pending = nil
    }
}

// MARK: - Scene browser

/// Every scene, previewed with the person's own media at the canvas shape.
/// Rest the pointer on one to watch it on the stage; click to use it; the
/// arrow keys step through them.
public struct SceneBrowser: View {
    @Bindable var session: StudioSession
    @FocusState private var focused: Bool

    public init(session: StudioSession) {
        self.session = session
    }

    private var tall: Bool { session.project.format.aspect < 0.9 }
    private var columnCount: Int { session.project.format.aspect > 1.25 ? 1 : 2 }

    /// The groups in their sections, in order.
    private var sections: [(title: String?, groups: [SceneGroup])] {
        var out: [(title: String?, groups: [SceneGroup])] = []
        for g in session.config.groups {
            if let last = out.last, last.title == g.section {
                out[out.count - 1].groups.append(g)
            } else {
                out.append((g.section, [g]))
            }
        }
        return out
    }

    public var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    ForEach(Array(sections.enumerated()), id: \.offset) { _, section in
                        VStack(alignment: .leading, spacing: 10) {
                            if let title = section.title {
                                Text(title).textStyle(.label).foregroundStyle(.secondary)
                                    .padding(.leading, 2)
                            }
                            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .top), count: columnCount),
                                      alignment: .leading, spacing: 16) {
                                ForEach(section.groups) { group in
                                    SceneCard(session: session, group: group, tall: tall) { focused = true }
                                        .id(group.id)
                                }
                            }
                        }
                    }
                    Text("Rest on a scene to preview it. Arrow keys step through.")
                        .textStyle(.caption).foregroundStyle(.tertiary)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 2)
                }
                .padding(.horizontal, 14)
                .padding(.top, 6)
                .padding(.bottom, 18)
            }
            .onAppear { proxy.scrollTo(session.group.id, anchor: .center) }
            .onChange(of: session.group.id) { _, id in
                withAnimation(Theme.spring) { proxy.scrollTo(id) }
            }
        }
        .focusable()
        .focusEffectDisabled()
        .focused($focused)
        .onKeyPress(.leftArrow) { step(-1) }
        .onKeyPress(.rightArrow) { step(1) }
        .onKeyPress(.upArrow) { stepRow(-1) }
        .onKeyPress(.downArrow) { stepRow(1) }
        .onDisappear {
            session.hover.cancel()
            session.endPreview()
        }
    }

    private func step(_ delta: Int) -> KeyPress.Result {
        session.hover.cancel()
        session.endPreview()
        session.stepScene(delta)
        return .handled
    }

    /// Up or down a row, keeping the column; across a section break it lands
    /// in the nearest card of the next section's first (or last) row.
    private func stepRow(_ delta: Int) -> KeyPress.Result {
        let all = sections.map(\.groups)
        guard let s = all.firstIndex(where: { $0.contains { $0.id == session.group.id } }),
              let i = all[s].firstIndex(where: { $0.id == session.group.id }) else { return .ignored }
        let cols = columnCount
        let col = i % cols
        var target: SceneGroup?
        if delta > 0 {
            if i + cols < all[s].count {
                target = all[s][i + cols]
            } else if i / cols < (all[s].count - 1) / cols {
                target = all[s].last  // a shorter last row
            } else if s + 1 < all.count {
                target = all[s + 1][min(col, all[s + 1].count - 1)]
            }
        } else {
            if i - cols >= 0 {
                target = all[s][i - cols]
            } else if s > 0 {
                let above = all[s - 1]
                let lastRow = (above.count - 1) / cols * cols
                target = above[min(lastRow + col, above.count - 1)]
            }
        }
        guard let target else { return .handled }
        session.hover.cancel()
        session.endPreview()
        session.chooseScene(target.members[0].id)
        return .handled
    }
}

/// One scene: a still at the canvas shape with a glyph for its movement,
/// its name, what happens in it, and how many styles it comes in.
struct SceneCard: View {
    let session: StudioSession
    let group: SceneGroup
    let tall: Bool
    var onChoose: () -> Void = {}
    @State private var hovering = false

    private var selected: Bool { group.members.contains { $0.id == session.project.scene } }
    private var previewing: Bool { group.members.contains { $0.id == session.previewID } }

    /// The member the card shows: the one in use, or the group's first.
    private var shown: SceneEntry {
        group.members.first { $0.id == session.project.scene } ?? group.members[0]
    }

    var body: some View {
        let aspect = CGFloat(session.project.format.aspect)
        Button {
            session.hover.cancel()
            onChoose()
            session.chooseScene(shown.id)
        } label: {
            VStack(alignment: .leading, spacing: 7) {
                LookThumbnail(session: session, sceneID: shown.id, aspect: aspect, targetWidth: tall ? 128 : 240)
                    .aspectRatio(aspect, contentMode: .fit)
                    .overlay(alignment: .topLeading) { glyph.padding(6) }
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.tile, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.tile, style: .continuous)
                            .strokeBorder(selected ? Theme.accent : (previewing || hovering ? Theme.accent.opacity(0.45) : Theme.hairline),
                                          lineWidth: selected ? 2 : 1)
                    )
                    .shadow(color: .black.opacity(hovering ? 0.28 : 0.14), radius: hovering ? 10 : 4, y: hovering ? 4 : 2)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(alignment: .firstTextBaseline, spacing: 5) {
                        Text(group.name).textStyle(.label)
                            .foregroundStyle(selected ? Theme.accentInk : .primary)
                        if group.hasStyles {
                            Text(selected ? shown.name : "\(group.members.count) styles")
                                .textStyle(.metadata).foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    Text(group.summary(tall: tall))
                        .textStyle(.caption, size: 11).foregroundStyle(.secondary)
                        .lineLimit(4)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 2)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .scaleEffect(hovering && !selected ? 1.015 : 1)
        .animation(Theme.spring, value: hovering)
        .onHover { inside in
            hovering = inside
            if inside { session.hover.enter(shown.id) } else { session.hover.exit() }
        }
        .onDisappear {
            if hovering {
                hovering = false
                session.hover.exit()
            }
        }
        .help(group.summary(tall: tall))
        .accessibilityLabel("\(group.name). \(group.summary(tall: tall))")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var glyph: some View {
        Image(systemName: group.symbol(tall: tall))
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: 22, height: 22)
            .background(Circle().fill(.black.opacity(0.45)))
            .overlay(Circle().strokeBorder(.white.opacity(0.18), lineWidth: 0.5))
    }
}

/// A still of one look with the session's media, rendered at the canvas
/// shape and refreshed when the project changes.
struct LookThumbnail: View {
    let session: StudioSession
    let sceneID: String
    let aspect: CGFloat
    /// About how wide it shows, in points, so it renders sharp but no larger.
    let targetWidth: CGFloat
    @State private var image: CGImage?
    @State private var requestedKey = ""
    @State private var pending: Task<Void, Never>?

    var body: some View {
        ZStack {
            Theme.well
            if let image {
                Image(decorative: image, scale: 2).resizable().aspectRatio(contentMode: .fill)
                    .transition(.opacity)
            }
        }
        .onAppear(perform: load)
        .onChange(of: session.version) { _, _ in load() }
        .onChange(of: sceneID) { _, _ in load() }
    }

    private var renderSize: CGSize {
        let w = (targetWidth * 2).rounded()
        return CGSize(width: w, height: (w / max(aspect, 0.1)).rounded())
    }

    private var lookProject: ReelProject {
        var p = session.project
        if p.scene != sceneID {
            p.scene = sceneID
            session.config.entry(sceneID).apply(&p)
        }
        return p
    }

    private func load() {
        // Wait for media to finish loading, so thumbnails never show placeholder cards.
        guard session.mediaSettled, !session.preparingSamples else { return }
        let p = lookProject
        let key = contentKey(p, scene: sceneID) + "|\(session.textures.count)|\(Int(renderSize.width))"
        guard key != requestedKey else { return }
        // The first still comes at once; later ones wait for a slider to come to rest.
        let wait = image == nil ? 0 : 300
        requestedKey = key
        pending?.cancel()
        let size = renderSize
        pending = Task { @MainActor in
            if wait > 0 {
                try? await Task.sleep(for: .milliseconds(wait))
                if Task.isCancelled { return }
            }
            guard let comp = p.items.isEmpty ? session.placeholderComposition(of: p) : session.composition(of: p, format: p.format, title: false) else {
                image = nil
                return
            }
            // A fifth of the way in shows the look at work, after any opening has settled.
            TileRenderer.shared.still(key: key, comp: comp, time: comp.loopDuration * 0.21, size: size, samples: 3) { img in
                guard let img, key == requestedKey else { return }
                withAnimation(.easeOut(duration: 0.18)) { image = img }
            }
        }
    }
}

// MARK: - Backdrop tiles

public struct BackdropTile: View {
    let settings: BackdropSettings
    let title: String
    let selected: Bool
    let size: CGSize
    let action: () -> Void
    @State private var image: CGImage?
    @State private var hovering = false

    public init(settings: BackdropSettings, title: String, selected: Bool, size: CGSize, action: @escaping () -> Void) {
        self.settings = settings
        self.title = title
        self.selected = selected
        self.size = size
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 4) {
                ZStack {
                    Theme.well
                    if let image {
                        Image(decorative: image, scale: 2).resizable().aspectRatio(contentMode: .fill)
                    }
                }
                .frame(width: size.width, height: size.height)
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .strokeBorder(selected ? Theme.accent : (hovering ? Theme.accent.opacity(0.4) : Theme.hairline),
                                      lineWidth: selected ? 2 : 1)
                )
                Text(title).textStyle(.metadata).foregroundStyle(selected ? Theme.accentInk : .secondary).lineLimit(1)
            }
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .onAppear(perform: load)
        .onChange(of: settings) { _, _ in load() }
    }

    private func load() {
        var h = Hasher()
        h.combine(settings)
        let key = "bd|\(h.finalize())|\(Int(size.width))x\(Int(size.height))"
        TileRenderer.shared.backdrop(key: key, settings: settings, phase: 0.2,
                                     size: CGSize(width: size.width * 2, height: size.height * 2)) { img in
            if let img { image = img }
        }
    }
}
