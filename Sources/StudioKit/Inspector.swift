import AppKit
import SwiftUI

/// The right-hand panel: the scene in use and its styles, then one page at a
/// time for Motion, Title, Colour, Sound and Finish. A handful of controls
/// per page; nothing named after code.
public struct LookInspector: View {
    @Bindable var session: StudioSession
    @State private var page: Page = .motion

    enum Page: String, CaseIterable, Identifiable {
        case motion, title, colour, sound, finish
        var id: String { rawValue }

        var title: String {
            switch self {
            case .motion: return "Motion"
            case .title: return "Title"
            case .colour: return "Colour"
            case .sound: return "Sound"
            case .finish: return "Finish"
            }
        }

        var symbol: String {
            switch self {
            case .motion: return "slider.horizontal.3"
            case .title: return "textformat"
            case .colour: return "paintpalette"
            case .sound: return "waveform"
            case .finish: return "camera.filters"
            }
        }
    }

    public init(session: StudioSession) {
        self.session = session
        if let tab = StudioSnapshot.arg("--tab") {
            let aliases = ["backdrop": "colour", "color": "colour"]
            if let p = Page(rawValue: aliases[tab] ?? tab) { _page = State(initialValue: p) }
        }
    }

    public var body: some View {
        VStack(spacing: 0) {
            SceneHeader(session: session)
            PageTabs(page: $page)
                .padding(.horizontal, 14)
                .padding(.bottom, 10)
            Hairline()
            ScrollView {
                VStack(spacing: 0) {
                    switch page {
                    case .motion: MotionSection(session: session)
                    case .title: TitleSection(session: session)
                    case .colour: BackdropSection(session: session)
                    case .sound: SoundSection(session: session)
                    case .finish: FinishSection(session: session)
                    }
                }
                .padding(.bottom, 24)
            }
            .frame(minHeight: 0, maxHeight: .infinity)
        }
        .frame(minHeight: 0, maxHeight: .infinity)
        .background(Theme.chrome)
    }
}

/// Icon tabs for the inspector's pages.
struct PageTabs: View {
    @Binding var page: LookInspector.Page

    var body: some View {
        HStack(spacing: 2) {
            ForEach(LookInspector.Page.allCases) { p in
                let on = p == page
                Button { page = p } label: {
                    VStack(spacing: 3) {
                        Image(systemName: p.symbol).font(.system(size: 13, weight: on ? .semibold : .regular))
                        Text(p.title).textStyle(.metadata, size: 10.5)
                    }
                    .foregroundStyle(on ? Color.primary : Color.secondary)
                    .frame(maxWidth: .infinity)
                    .frame(height: 42)
                    .background(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(on ? Theme.segmentOn : Color.clear)
                            .shadow(color: .black.opacity(on ? 0.16 : 0), radius: 1, y: 0.5)
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help(p.title)
                .accessibilityLabel(p.title)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(2)
        .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Theme.well.opacity(0.7)))
    }
}

/// What the scene in use is, what happens in it, and its styles.
struct SceneHeader: View {
    @Bindable var session: StudioSession

    var body: some View {
        let group = session.group
        let tall = session.project.format.aspect < 0.9
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Image(systemName: group.symbol(tall: tall))
                    .font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
                Text(group.name).textStyle(.panelTitle)
                if group.hasStyles {
                    Text(session.entry.name).textStyle(.panelTitle).foregroundStyle(.secondary)
                }
                Spacer(minLength: 4)
                Button {
                    session.update("Reset \(group.name)") { p in session.config.entry(p.scene).apply(&p) }
                } label: {
                    Image(systemName: "arrow.counterclockwise").font(.system(size: 11, weight: .semibold))
                }
                .buttonStyle(.plain).foregroundStyle(.secondary)
                .help("Reset this look: movement, colour and finish")
            }
            Text(group.hasStyles ? session.entry.summary : group.summary(tall: tall))
                .textStyle(.caption).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if group.hasStyles {
                StylePicker(session: session, group: group)
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 14)
    }
}

/// The styles a scene comes in, each shown with the person's media.
struct StylePicker: View {
    @Bindable var session: StudioSession
    let group: SceneGroup

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 3), spacing: 6) {
            ForEach(group.members) { member in
                StyleChip(session: session, entry: member, selected: member.id == session.project.scene)
            }
        }
    }
}

struct StyleChip: View {
    let session: StudioSession
    let entry: SceneEntry
    let selected: Bool
    @State private var hovering = false

    var body: some View {
        Button {
            session.hover.cancel()
            session.chooseScene(entry.id)
        } label: {
            LookThumbnail(session: session, sceneID: entry.id, aspect: CGFloat(session.project.format.aspect), targetWidth: 84)
                .frame(height: 46)
                .frame(maxWidth: .infinity)
                .clipped()
                .overlay(LinearGradient(colors: [.clear, .black.opacity(0.55)], startPoint: .center, endPoint: .bottom).allowsHitTesting(false))
                .overlay(alignment: .bottomLeading) {
                    Text(entry.name)
                        .font(.system(size: 10.5, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1).minimumScaleFactor(0.8)
                        .shadow(color: .black.opacity(0.5), radius: 2, y: 1)
                        .padding(.horizontal, 6).padding(.bottom, 4)
                }
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .strokeBorder(selected ? Theme.accent : (hovering ? Theme.accent.opacity(0.45) : Theme.hairline),
                                      lineWidth: selected ? 2 : 1)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { inside in
            hovering = inside
            if inside { session.hover.enter(entry.id) } else { session.hover.exit() }
        }
        .onDisappear {
            // A chip can vanish under the pointer (an undo to another scene);
            // its preview must not start, or outlive it.
            if hovering {
                hovering = false
                session.hover.exit()
            }
        }
        .help(entry.summary)
        .accessibilityLabel("\(entry.name). \(entry.summary)")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

// MARK: - Motion

struct MotionSection: View {
    @Bindable var session: StudioSession

    var body: some View {
        let scene = session.scene
        // The look's own settings, which a double-click on a track returns to.
        let preset: SceneDials = {
            var q = session.project
            session.entry.apply(&q)
            return q.dials
        }()
        InspectorSection("Length", accessory: {
            Text(String(format: "%.1f s", session.loopDuration)).textStyle(.data).foregroundStyle(.primary)
        }) {
            // Common lengths for posting, reached by setting Pace.
            let targets: [Double] = [10, 15, 30, 60]
            ChoiceRow(targets.map { (Optional($0), "\(Int($0)) s") }, selection: Binding<Double?>(
                get: { targets.first { abs($0 - session.loopDuration) < 0.35 } },
                set: { t in if let t { session.fitLoop(to: t) } }))
            Text(fitNote)
                .textStyle(.caption).foregroundStyle(.tertiary).fixedSize(horizontal: false, vertical: true)
        }
        Hairline().padding(.horizontal, 16)
        InspectorSection("Movement", accessory: {
            Button {
                session.update("Reset Movement") { p in
                    let fresh = session.config.entry(p.scene)
                    var q = p
                    fresh.apply(&q)
                    p.dials = q.dials
                }
            } label: {
                Image(systemName: "arrow.counterclockwise").font(.system(size: 11, weight: .semibold))
            }
            .buttonStyle(.plain).foregroundStyle(.secondary).help("Reset movement")
        }) {
            VStack(spacing: 2) {
                ForEach(scene.dials, id: \.0) { key, label in
                    ValueSlider(label, value: Binding(
                        get: { session.project.dials[key] },
                        set: { v in session.live { $0.dials[key] = v } }),
                        defaultValue: preset[key],
                        onBegin: { session.beginEdit() },
                        onCommit: { session.commitEdit(label) })
                }
            }
            Button {
                session.shuffle()
            } label: {
                Label("New variation", systemImage: "dice")
            }
            .buttonStyle(QuietButtonStyle())
            .padding(.leading, -10)
            .help("Reshuffle the order of moments and the backdrop's pattern")
        }
    }
}

// MARK: - Sound

struct SoundSection: View {
    @Bindable var session: StudioSession

    var body: some View {
        InspectorSection("Sound") {
            ChoiceRow([(SoundPalette?.none, "Off")] + SoundPalette.allCases.map { (Optional($0), $0.title) }, selection: Binding(
                get: { session.project.sound?.palette },
                set: { v in
                    session.update("Sound") { p in
                        p.sound = v.map { ReelSound(palette: $0, level: p.sound?.level ?? 0.7) }
                    }
                }))
            if let sound = session.project.sound {
                Text(sound.palette.summary + " Placed on the moments the cards move, so it loops with the picture.")
                    .textStyle(.caption).foregroundStyle(.tertiary).fixedSize(horizontal: false, vertical: true)
                ValueSlider("Level", value: Binding(
                    get: { session.project.sound?.level ?? 0.7 },
                    set: { v in session.live { $0.sound?.level = v } }),
                    range: 0...1, defaultValue: 0.7,
                    onBegin: { session.beginEdit() }, onCommit: { session.commitEdit("Sound Level") })
            } else {
                Text("Silent. Recorded foley can follow the motion: \(session.config.itemNoun)s passing, lifting and landing.")
                    .textStyle(.caption).foregroundStyle(.tertiary).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - Grade

/// One-click film grades over the look's own: its designed grade, warmer,
/// cooler, a faded matte print, or black and white.
public enum Grade: String, CaseIterable, Hashable, Sendable {
    case natural, warm, cool, faded, mono

    public var title: String {
        switch self {
        case .natural: return "Natural"
        case .warm: return "Warm"
        case .cool: return "Cool"
        case .faded: return "Faded"
        case .mono: return "Mono"
        }
    }

    private func values(_ n: FinishSettings) -> (contrast: Float, saturation: Float, warmth: Float) {
        switch self {
        case .natural: return (n.contrast, n.saturation, n.warmth)
        case .warm: return (n.contrast + 0.05, n.saturation + 0.06, 0.4)
        case .cool: return (n.contrast + 0.05, n.saturation - 0.05, -0.4)
        case .faded: return (-0.28, -0.3, n.warmth + 0.1)
        case .mono: return (n.contrast + 0.12, -1, 0)
        }
    }

    public func apply(_ f: inout FinishSettings, natural: FinishSettings) {
        let v = values(natural)
        f.contrast = v.contrast
        f.saturation = v.saturation
        f.warmth = v.warmth
    }

    public func matches(_ f: FinishSettings, natural: FinishSettings) -> Bool {
        let v = values(natural)
        return abs(f.contrast - v.contrast) < 0.002 && abs(f.saturation - v.saturation) < 0.002 && abs(f.warmth - v.warmth) < 0.002
    }
}

extension MotionSection {
    /// Says when a length is out of the scene's reach at this many items.
    var fitNote: String {
        let shortest = session.loopDuration(pace: 1), longest = session.loopDuration(pace: 0)
        return String(format: "Every look loops seamlessly. Pace sets the length: %.0f to %.0f s here.", shortest, longest)
    }
}

// MARK: - Title

/// Words over the finished frame, typed straight in. The choices appear once
/// there are words; typing is one undo step per visit to the fields.
struct TitleSection: View {
    @Bindable var session: StudioSession
    @FocusState private var field: Field?
    /// Closes the typing step after a pause, so each burst of typing undoes on its own.
    @State private var pause: Task<Void, Never>?

    enum Field: Hashable { case text, kicker }

    var body: some View {
        let title = session.project.title ?? ReelTitle()
        InspectorSection("Title") {
            VStack(spacing: 6) {
                input("Add a title", \.text, .text)
                input("Line above, optional", \.kicker, .kicker)
            }
            if title.isEmpty {
                Text("Set over the finished frame, clear of each platform's buttons, and sized for every format.")
                    .textStyle(.caption).foregroundStyle(.tertiary).fixedSize(horizontal: false, vertical: true)
            } else {
                ChoiceRow(ReelTitle.Face.allCases.map { ($0, $0.title) }, selection: choice(\.face, "Title Typeface"))
                    .padding(.top, 4)
                ChoiceRow(ReelTitle.Placement.allCases.map { ($0, $0.title) }, selection: Binding(
                    get: { title.placement },
                    set: { v in
                        session.update("Title Placement") { p in
                            var t = p.title ?? ReelTitle()
                            // A title card opens the reel; it rarely wants to cover the whole loop.
                            if v == .centre, t.placement != .centre, t.timing == .throughout { t.timing = .opening }
                            t.placement = v
                            p.title = t
                        }
                        revealIfHidden()
                    }))
                ChoiceRow(ReelTitle.Timing.allCases.map { ($0, $0.title) }, selection: choice(\.timing, "Title Timing"))
                HStack(spacing: 10) {
                    Text("Ink").textStyle(.bodyCompact).foregroundStyle(.secondary)
                    ChoiceRow(ReelTitle.Ink.allCases.map { ($0, $0.title) }, selection: choice(\.ink, "Title Ink"))
                }
                Text(note(title)).textStyle(.caption).foregroundStyle(.tertiary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .onChange(of: field) { old, new in
            session.clock.typing = new != nil
            if old == nil, new != nil { session.beginEdit("Title") }
            if old != nil, new == nil { session.commitEdit(ifOpen: "Title") }
        }
        .onDisappear {
            pause?.cancel()
            session.commitEdit(ifOpen: "Title")
            session.clock.typing = false
        }
    }

    private func input(_ placeholder: String, _ key: WritableKeyPath<ReelTitle, String>, _ which: Field) -> some View {
        TextField(placeholder, text: Binding(
            get: { session.project.title?[keyPath: key] ?? "" },
            set: { v in
                // Reopens the typing step if a pause or a click elsewhere closed it.
                session.beginEdit("Title")
                session.live { p in
                    var t = p.title ?? ReelTitle()
                    t[keyPath: key] = v
                    p.title = t
                }
                pause?.cancel()
                pause = Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(800))
                    if !Task.isCancelled { session.commitEdit(ifOpen: "Title") }
                }
                revealIfHidden()
            }))
            .textFieldStyle(.plain)
            .textStyle(.input)
            .focused($field, equals: which)
            .onSubmit { field = nil }
            .padding(.horizontal, 10)
            .frame(height: 30)
            .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(Theme.well.opacity(0.7)))
            .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous)
                .strokeBorder(field == which ? Theme.accent : Theme.hairline, lineWidth: field == which ? 1.5 : 1))
    }

    private func choice<T: Hashable>(_ key: WritableKeyPath<ReelTitle, T>, _ name: String) -> Binding<T> {
        Binding(
            get: { (session.project.title ?? ReelTitle())[keyPath: key] },
            set: { v in
                session.update(name) { p in
                    var t = p.title ?? ReelTitle()
                    t[keyPath: key] = v
                    p.title = t
                }
                revealIfHidden()
            })
    }

    /// An opening or closing title is gone for most of the loop; while paused,
    /// bring the playhead to where it shows, so the words being set are in view.
    private func revealIfHidden() {
        guard let title = session.project.title, title.timing != .throughout, !title.isEmpty, !session.clock.playing else { return }
        let loop = session.loopDuration
        let probe = TitleOverlay(key: 0, timing: title.timing, scrim: 0) { _, _ in nil }
        guard probe.presence(at: session.clock.time, loop: loop).alpha < 0.6 else { return }
        // The middle of the title's visible stretch.
        let times = stride(from: 0.0, to: loop, by: loop / 200).filter { probe.presence(at: $0, loop: loop).alpha > 0.99 }
        if let first = times.first, let last = times.last {
            session.clock.time = (first + last) / 2
            session.touch()
        }
    }

    private func note(_ title: ReelTitle) -> String {
        var parts = [title.placement == .corner
            ? "Set small in a corner, clear of each platform's controls."
            : "Set large and centred over a dimmed stage."]
        switch title.timing {
        case .opening: parts.append("It rises in as the loop begins and clears after a few seconds.")
        case .closing: parts.append("It rises in a few seconds before the end, like an end card, and clears as the loop turns.")
        case .throughout: break
        }
        let words = title.text.split(whereSeparator: { $0.isWhitespace }).count
        let most = TitleArt.maxWords(title.placement)
        if words > most { parts.append("Titles read best in \(most) words or fewer.") }
        return parts.joined(separator: " ")
    }
}

// MARK: - Backdrop

struct BackdropSection: View {
    @Bindable var session: StudioSession
    @State private var family: BackdropFamily? = nil
    @State private var library: [SavedBackdrop] = []

    var body: some View {
        Group { content }
            .onAppear { library = BackdropLibrary.all() }
    }

    @ViewBuilder
    private var content: some View {
        let current = session.project.backdrop
        let info = current.styleInfo
        if let yours = session.mediaPalette {
            // The work's own colours, one click away, above the long list of looks.
            let inUse = current.palette.id == yours.id && current.palette.colors == yours.colors
            InspectorSection("Your colours") {
                HStack(spacing: 10) {
                    PaletteChip(palette: yours, selected: inUse, size: CGSize(width: 84, height: 24))
                    Text(inUse ? "In use" : yours.name)
                        .textStyle(.caption).foregroundStyle(.secondary)
                        .lineLimit(1).layoutPriority(1)
                    Spacer(minLength: 0)
                    if !inUse {
                        Button("Use") { session.update("Palette") { $0.backdrop.palette = yours } }
                            .buttonStyle(QuietButtonStyle())
                            .fixedSize()
                    }
                }
            }
            Hairline().padding(.horizontal, 16)
        }
        if !library.isEmpty {
            InspectorSection("Your library", accessory: {
                Text("From Backdrop").textStyle(.metadata).foregroundStyle(.tertiary)
            }) {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 10) {
                    ForEach(library) { saved in
                        BackdropTile(settings: saved.settings, title: saved.name, selected: saved.settings == current,
                                     size: CGSize(width: 82, height: 52)) {
                            session.update("Backdrop") { $0.backdrop = saved.settings }
                        }
                    }
                }
            }
            Hairline().padding(.horizontal, 16)
        }
        InspectorSection("Look", accessory: {
            Menu {
                Button("All") { family = nil }
                Divider()
                ForEach(BackdropFamily.allCases) { f in Button(f.title) { family = f } }
            } label: {
                Text(family?.title ?? "All").textStyle(.caption)
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
        }) {
            let styles = family.map { BackdropCatalog.styles(in: $0) } ?? BackdropCatalog.styles
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 10) {
                ForEach(styles) { style in
                    let s = previewSettings(style, current)
                    BackdropTile(settings: s, title: style.name, selected: style.id == current.style,
                                 size: CGSize(width: 82, height: 52)) {
                        session.update("Backdrop") { p in
                            let keepPalette = p.backdrop.palette
                            p.backdrop = style.defaults
                            p.backdrop.palette = keepPalette
                            p.backdrop.seed = current.seed
                        }
                    }
                }
            }
        }
        Hairline().padding(.horizontal, 16)
        InspectorSection("Palette", accessory: {
            Text(current.palette.name).textStyle(.metadata).foregroundStyle(.secondary)
        }) {
            PalettePicker(selected: current.palette.id, palettes: (session.mediaPalette.map { [$0] } ?? []) + Palettes.all) { pal in
                session.update("Palette") { $0.backdrop.palette = pal }
            }
        }
        Hairline().padding(.horizontal, 16)
        InspectorSection(info.name, accessory: {
            Button {
                session.update("Shuffle Backdrop") { $0.backdrop.seed = $0.backdrop.seed &+ 97 }
            } label: {
                Image(systemName: "shuffle").font(.system(size: 11, weight: .semibold))
            }
            .buttonStyle(.plain).foregroundStyle(.secondary).help("Shuffle")
        }) {
            VStack(spacing: 4) {
                ForEach(backdropDials(info), id: \.0) { key, label in
                    ValueSlider(label, value: Binding(
                        get: { value(key, current) },
                        set: { v in session.live { p in setValue(key, v, &p.backdrop) } }),
                        defaultValue: value(key, info.defaults),
                        onBegin: { session.beginEdit() },
                        onCommit: { session.commitEdit(label) })
                }
                ValueSlider("Edges", value: Binding(
                    get: { current.vignette },
                    set: { v in session.live { $0.backdrop.vignette = v } }),
                    defaultValue: info.defaults.vignette,
                    onBegin: { session.beginEdit() }, onCommit: { session.commitEdit("Edges") })
                ValueSlider("Brightness", value: Binding(
                    get: { current.brightness },
                    set: { v in session.live { $0.backdrop.brightness = v } }),
                    range: 0.3...1.6, defaultValue: 1,
                    format: { String(format: "%.2f", $0) },
                    onBegin: { session.beginEdit() }, onCommit: { session.commitEdit("Brightness") })
            }
        }
    }

    private func previewSettings(_ style: BackdropStyle, _ current: BackdropSettings) -> BackdropSettings {
        var s = style.defaults
        s.palette = current.palette
        return s
    }

    private func backdropDials(_ info: BackdropStyle) -> [(String, String)] {
        var out: [(String, String)] = []
        if let l = info.labels.scale { out.append(("scale", l)) }
        if let l = info.labels.motion { out.append(("motion", l)) }
        if let l = info.labels.detail { out.append(("detail", l)) }
        if let l = info.labels.softness { out.append(("softness", l)) }
        if let l = info.labels.accent { out.append(("accent", l)) }
        return out
    }

    private func value(_ key: String, _ s: BackdropSettings) -> Float {
        switch key {
        case "scale": return s.scale
        case "motion": return s.motion
        case "detail": return s.detail
        case "softness": return s.softness
        default: return s.accent
        }
    }

    private func setValue(_ key: String, _ v: Float, _ s: inout BackdropSettings) {
        switch key {
        case "scale": s.scale = v
        case "motion": s.motion = v
        case "detail": s.detail = v
        case "softness": s.softness = v
        default: s.accent = v
        }
    }
}

// MARK: - Finish

struct FinishSection: View {
    @Bindable var session: StudioSession

    var body: some View {
        let look = session.project.look
        InspectorSection("Surface") {
            ChoiceRow(SurfaceKind.allCases.map { ($0, $0.title) }, selection: Binding(
                get: { session.project.look.surface },
                set: { v in session.update("Surface") { $0.look.surface = v } }))
            Text(look.surface.summary).textStyle(.caption).foregroundStyle(.tertiary)
            ChoiceRow(BendKind.allCases.map { ($0, $0.title) }, selection: Binding(
                get: { session.project.look.bend },
                set: { v in session.update("Bend") { $0.look.bend = v } }))
                .padding(.top, 4)
            slider("Bend", \.bendAmount, 0.6)
            slider("Corners", \.corners, 0.35)
            slider("Thickness", \.edge, 1)
        }
        Hairline().padding(.horizontal, 16)
        InspectorSection("Light") {
            slider("Shadow", \.shadow, 0.55)
            slider("Softness", \.shadowSoftness, 0.55)
            ValueSlider("Direction", value: Binding(
                get: { session.project.look.lightAzimuth },
                set: { v in session.live { $0.look.lightAzimuth = v } }),
                range: 0...180, defaultValue: 115, format: { "\(Int($0))°" },
                onBegin: { session.beginEdit() }, onCommit: { session.commitEdit("Light Direction") })
            slider("Depth of field", \.depthOfField, 0.25)
            slider("Camera drift", \.cameraDrift, 0)
        }
        Hairline().padding(.horizontal, 16)
        InspectorSection("Film") {
            let natural = naturalFinish
            ChoiceRow(Grade.allCases.map { (Optional($0), $0.title) }, selection: Binding<Grade?>(
                get: { Grade.allCases.first { $0.matches(session.project.look.finish, natural: natural) } },
                set: { g in
                    guard let g else { return }
                    session.update("Grade") { g.apply(&$0.look.finish, natural: natural) }
                }))
            finishSlider("Grain", \.grain, 0.22)
            finishSlider("Glow", \.bloom, 0.18)
            finishSlider("Contrast", \.contrast, 0, range: -0.5...0.5)
            finishSlider("Colour", \.saturation, 0, range: -1...1)
            finishSlider("Warmth", \.warmth, 0, range: -1...1)
            ValueSlider("Motion blur", value: Binding(
                get: { session.project.look.shutter },
                set: { v in session.live { $0.look.shutter = v } }),
                range: 0...1, defaultValue: 0.5, format: { $0 < 0.01 ? "Off" : "\(Int($0 * 360))°" },
                onBegin: { session.beginEdit() }, onCommit: { session.commitEdit("Motion Blur") })
        }
    }

    /// The film grade the World or Scene was designed with.
    private var naturalFinish: FinishSettings {
        var fresh = session.project
        session.config.entry(fresh.scene).apply(&fresh)
        return fresh.look.finish
    }

    private func slider(_ label: String, _ path: WritableKeyPath<StageLook, Float>, _ def: Float, range: ClosedRange<Float> = 0...1) -> some View {
        ValueSlider(label, value: Binding(
            get: { session.project.look[keyPath: path] },
            set: { v in session.live { $0.look[keyPath: path] = v } }),
            range: range, defaultValue: def,
            onBegin: { session.beginEdit() }, onCommit: { session.commitEdit(label) })
    }

    private func finishSlider(_ label: String, _ path: WritableKeyPath<FinishSettings, Float>, _ def: Float, range: ClosedRange<Float> = 0...1) -> some View {
        ValueSlider(label, value: Binding(
            get: { session.project.look.finish[keyPath: path] },
            set: { v in session.live { $0.look.finish[keyPath: path] = v } }),
            range: range, defaultValue: def,
            format: { range.lowerBound < 0 ? String(format: "%+d", Int(($0 * 100).rounded())) : String(Int(($0 * 100).rounded())) },
            onBegin: { session.beginEdit() }, onCommit: { session.commitEdit(label) })
    }
}
