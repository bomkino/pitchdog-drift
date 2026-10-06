import AppKit
import SwiftUI
import UniformTypeIdentifiers

public enum ExportKind: String, CaseIterable, Identifiable, Sendable {
    case h264, hevc, prores, prores4444, png, still

    public var id: String { rawValue }
    public var title: String {
        switch self {
        case .h264: return "MP4"
        case .hevc: return "HEVC"
        case .prores: return "ProRes"
        case .prores4444: return "ProRes 4444"
        case .png: return "PNG frames"
        case .still: return "Still"
        }
    }
    public var detail: String {
        switch self {
        case .h264: return "Plays everywhere"
        case .hevc: return "Small, can be transparent"
        case .prores: return "422 HQ, for editing"
        case .prores4444: return "Transparent, for editing"
        case .png: return "Numbered frames"
        case .still: return "This frame as PNG"
        }
    }
    public var symbol: String {
        switch self {
        case .h264: return "play.rectangle"
        case .hevc: return "play.rectangle.on.rectangle"
        case .prores: return "film"
        case .prores4444: return "square.on.square.dashed"
        case .png: return "photo.stack"
        case .still: return "photo"
        }
    }
    var format: ExportFormat { format(transparent: false) }

    /// HEVC keeps transparency in a QuickTime movie when asked to.
    func format(transparent: Bool) -> ExportFormat {
        switch self {
        case .h264: return .video(.h264)
        case .hevc: return .video(transparent ? .hevcAlpha : .hevc)
        case .prores: return .video(.prores422)
        case .prores4444: return .video(.prores4444)
        case .png: return .pngSequence
        case .still: return .still
        }
    }
    var fileExtension: String { fileExtension(transparent: false) }

    func fileExtension(transparent: Bool) -> String {
        switch self {
        case .h264: return "mp4"
        case .hevc: return transparent ? "mov" : "mp4"
        case .prores, .prores4444: return "mov"
        case .png: return ""
        case .still: return "png"
        }
    }
    var supportsTransparency: Bool { self == .prores4444 || self == .hevc || self == .png || self == .still }
}

@Observable
@MainActor
final class ExportModel {
    enum Phase { case settings, running, done([URL]), failed(String) }
    var phase: Phase = .settings
    var progress: Double = 0
    var frame = 0
    var total = 0
    /// Which file of the batch is being written, and its format's name.
    var index = 0
    var count = 1
    var current = ""
    var preview: CGImage?
    var started = Date()
    @ObservationIgnored var cancelFlag = CancelFlag()

    final class CancelFlag: @unchecked Sendable {
        private let lock = NSLock()
        private var value = false
        func set() { lock.lock(); value = true; lock.unlock() }
        var isSet: Bool { lock.lock(); defer { lock.unlock() }; return value }
    }

    var remaining: String {
        guard progress > 0.02 else { return "Estimating…" }
        let elapsed = Date().timeIntervalSince(started)
        let left = elapsed / progress - elapsed
        if left < 60 { return "About \(max(1, Int(left))) s left" }
        return "About \(Int(left / 60)) min left"
    }
}

public struct ExportSheet: View {
    let source: any StageSource
    @Environment(\.dismiss) private var dismiss
    // The last export's settings come back next time. Transparency belongs to
    // the document (Colour › Background), so the stage shows it too.
    @AppStorage("export.kind") private var kind: ExportKind = .h264
    @AppStorage("export.scale") private var scale: Double = 1
    @AppStorage("export.fps") private var fps: Int = 30
    @AppStorage("export.loops") private var loops: Int = 1
    @AppStorage("export.quality") private var quality: Int = 8
    @AppStorage("export.formats") private var lastFormats = ""
    @State private var formatIDs: Set<String>
    @State private var model = ExportModel()

    public init(source: any StageSource) {
        self.source = source
        // The canvas's own format, plus the others from a last export of several.
        let requested = StudioSnapshot.arg("--formats")?.split(separator: ",").map(String.init)
        let remembered = (UserDefaults.standard.string(forKey: "export.formats") ?? "").split(separator: ",").map(String.init)
        _formatIDs = State(initialValue: Set(requested ?? (remembered.count > 1 ? remembered + [source.format.id] : [source.format.id])))
        // Headless captures of the finished state: --export-done a.mp4,b.mp4
        if let done = StudioSnapshot.arg("--export-done") {
            let model = ExportModel()
            model.phase = .done(done.split(separator: ",").map { URL(fileURLWithPath: String($0)) })
            _model = State(initialValue: model)
        }
    }

    /// Every format on offer; the canvas's own first if it is not a preset.
    private var allFormats: [CanvasFormat] {
        CanvasFormat.presets.contains(source.format) ? CanvasFormat.presets : [source.format] + CanvasFormat.presets
    }

    private var chosen: [CanvasFormat] {
        let picked = allFormats.filter { formatIDs.contains($0.id) }
        return picked.isEmpty ? [source.format] : picked
    }

    private var options: ExportPlan.Options {
        ExportPlan.Options(kind: kind, scale: scale, fps: fps, loops: loops, samples: quality, transparent: transparent)
    }

    private var transparent: Bool { source.offersTransparency && source.transparentBackground }

    /// Transparency as this export will have it: chosen, and possible in the format.
    private var isTransparent: Bool { transparent && kind.supportsTransparency
    }

    private var carriesSound: Bool {
        if case .video = kind.format { return source.soundTitle != nil }
        return false
    }

    private var soundNote: String {
        guard let title = source.soundTitle else { return "" }
        return carriesSound ? " · \(title) sound" : " · no sound in this format"
    }

    private var summary: String {
        let formats = chosen
        let clear = isTransparent ? " · transparent" : ""
        if formats.count == 1, let f = formats.first {
            let (w, h) = ExportPlan.size(f, scale: scale)
            if kind == .still { return "\(w) × \(h) · the frame at the playhead" + clear }
            let seconds = source.loopDuration(for: f) * Double(loops)
            return "\(w) × \(h) · \(fps) fps · \(String(format: "%.1f", seconds)) s" + clear + soundNote
        }
        let names = ListFormatter.localizedString(byJoining: formats.map(\.name))
        if kind == .still { return names + " · the frame at the playhead" + clear }
        return names + " · \(fps) fps · \(loops == 1 ? "one loop" : "\(loops) loops") each" + clear + soundNote
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            switch model.phase {
            case .settings: settings
            case .running: running
            case let .done(urls): done(urls)
            case let .failed(message): failed(message)
            }
        }
        .frame(width: 580)
        .background(Theme.chrome)
    }

    // MARK: Settings

    private var settings: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Export").textStyle(.sectionTitle)
                Text(summary).textStyle(.metadata).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                ForEach(ExportKind.allCases) { k in
                    Button { kind = k } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Image(systemName: k.symbol).font(.system(size: 16, weight: .regular))
                                .foregroundStyle(kind == k ? Theme.accentInk : .secondary)
                            Text(k.title).textStyle(.label)
                            Text(k.detail).textStyle(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: Theme.Radius.tile, style: .continuous)
                            .fill(kind == k ? Theme.accentSoft : Theme.raised.opacity(0.6)))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.tile, style: .continuous)
                            .strokeBorder(kind == k ? Theme.accent : Theme.hairline, lineWidth: kind == k ? 1.5 : 1))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 14, verticalSpacing: 12) {
                GridRow {
                    Text("Formats").textStyle(.bodyCompact).foregroundStyle(.secondary)
                    MultiChoiceRow(allFormats.map { ($0.id, $0.name) }, selection: $formatIDs)
                }
                GridRow {
                    Text("Size").textStyle(.bodyCompact).foregroundStyle(.secondary)
                    ChoiceRow([(0.5, "Half"), (1.0, "Full"), (2.0, "Double")], selection: $scale)
                }
                if kind != .still {
                    GridRow {
                        Text("Frame rate").textStyle(.bodyCompact).foregroundStyle(.secondary)
                        ChoiceRow([(24, "24"), (25, "25"), (30, "30"), (60, "60")], selection: $fps)
                    }
                    GridRow {
                        Text("Length").textStyle(.bodyCompact).foregroundStyle(.secondary)
                        ChoiceRow([(1, "1 loop"), (2, "2 loops"), (3, "3 loops"), (4, "4 loops")], selection: $loops)
                    }
                    if source.offersMotionBlur {
                        GridRow {
                            Text("Motion").textStyle(.bodyCompact).foregroundStyle(.secondary)
                            ChoiceRow([(1, "Crisp"), (8, "Film blur"), (16, "Finest")], selection: $quality)
                        }
                    }
                }
                if kind.supportsTransparency && source.offersTransparency {
                    GridRow {
                        Text("Background").textStyle(.bodyCompact).foregroundStyle(.secondary)
                        ChoiceRow([(false, "Backdrop"), (true, "Transparent")], selection: Binding(
                            get: { source.transparentBackground }, set: { source.setTransparentBackground($0) }))
                    }
                }
            }
            HStack {
                Text(source.exportWaitNote ?? (transparent && !kind.supportsTransparency
                        ? "\(kind.title) cannot be transparent, so the backdrop is drawn in."
                        : chosen.count > 1 ? "Each format is laid out for its own frame." : "Loops meet seamlessly at the cut."))
                    .textStyle(.caption).foregroundStyle(source.exportWaitNote == nil ? .tertiary : .secondary)
                Spacer()
                Button("Cancel") { dismiss() }.buttonStyle(QuietButtonStyle()).keyboardShortcut(.cancelAction)
                Button("Export…") { chooseDestination() }.buttonStyle(PrimaryButtonStyle()).keyboardShortcut(.defaultAction)
                    .disabled(source.exportWaitNote != nil)
                    .opacity(source.exportWaitNote == nil ? 1 : 0.45)
            }
        }
        .padding(20)
    }

    // MARK: Running

    private var running: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(model.count > 1 ? "Exporting \(model.current) · \(model.index + 1) of \(model.count)" : "Exporting")
                .textStyle(.sectionTitle)
            ZStack {
                Theme.surround
                if let img = model.preview {
                    Image(decorative: img, scale: 1).resizable().aspectRatio(contentMode: .fit)
                }
            }
            .frame(height: 240)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.tile, style: .continuous))
            ProgressView(value: model.progress).tint(Theme.accent)
            HStack {
                Text("Frame \(model.frame) of \(model.total)").textStyle(.data).foregroundStyle(.secondary)
                Spacer()
                Text(model.remaining).textStyle(.data).foregroundStyle(.secondary)
            }
            HStack {
                Spacer()
                Button("Cancel") { model.cancelFlag.set() }.buttonStyle(QuietButtonStyle()).keyboardShortcut(.cancelAction)
            }
        }
        .padding(20)
    }

    private func done(_ urls: [URL]) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.accent).font(.system(size: 18))
                Text(urls.count > 1 ? "Exported \(urls.count) files" : "Exported").textStyle(.sectionTitle)
            }
            VStack(alignment: .leading, spacing: 4) {
                ForEach(urls, id: \.self) { url in
                    Text(url.lastPathComponent).textStyle(.code).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
                }
            }
            HStack {
                // Straight on to AirDrop, Messages, Photos or Mail, without a trip to the Finder.
                ShareLink(items: urls) { Label("Share…", systemImage: "square.and.arrow.up") }
                    .buttonStyle(QuietButtonStyle())
                Spacer()
                Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting(urls) }.buttonStyle(QuietButtonStyle())
                Button("Done") { dismiss() }.buttonStyle(PrimaryButtonStyle()).keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
    }

    private func failed(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Export stopped").textStyle(.sectionTitle)
            Text(message).textStyle(.body).foregroundStyle(.secondary)
            HStack {
                Spacer()
                Button("Back") { model.phase = .settings }.buttonStyle(QuietButtonStyle())
                Button("Done") { dismiss() }.buttonStyle(PrimaryButtonStyle())
            }
        }
        .padding(20)
    }

    // MARK: Run

    private func chooseDestination() {
        let formats = chosen
        if formats.count > 1 {
            // Several formats go side by side in one folder, named by format.
            let panel = NSOpenPanel()
            panel.canChooseDirectories = true
            panel.canChooseFiles = false
            panel.canCreateDirectories = true
            panel.prompt = "Export Here"
            panel.message = "Choose a folder for the \(formats.count) files."
            panel.begin { response in
                guard response == .OK, let url = panel.url else { return }
                MainActor.assumeIsolated { run(formats, to: url) }
            }
            return
        }
        let panel = NSSavePanel()
        let base = source.exportName + (formats.first == source.format ? "" : " " + (formats.first?.name ?? ""))
        if kind == .png {
            panel.nameFieldStringValue = base + " frames"
            panel.canCreateDirectories = true
        } else {
            let ext = kind.fileExtension(transparent: isTransparent)
            panel.nameFieldStringValue = base + "." + ext
            panel.allowedContentTypes = [kind == .still ? .png : (ext == "mov" ? .quickTimeMovie : .mpeg4Movie)]
        }
        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }
            MainActor.assumeIsolated { run(formats, to: url) }
        }
    }

    private func run(_ formats: [CanvasFormat], to destination: URL) {
        let jobs = ExportPlan.jobs(source, formats: formats, options: options, destination: destination)
        guard !jobs.isEmpty else { return }
        lastFormats = formats.map(\.id).joined(separator: ",")
        let weights = jobs.map(\.weight)
        let totalWeight = max(weights.reduce(0, +), 1)
        let before = weights.indices.map { i in weights[..<i].reduce(0, +) }
        let names = jobs.map(\.format.name)
        let frames = jobs.map { $0.settings.format == .still ? 1 : $0.settings.frameCount }
        model.count = jobs.count
        model.index = 0
        model.current = names[0]
        model.total = frames[0]
        model.frame = 0
        model.progress = 0
        model.started = Date()
        model.cancelFlag = ExportModel.CancelFlag()
        model.phase = .running
        let flag = model.cancelFlag
        let model = self.model
        let urls = jobs.map(\.url)
        Task.detached(priority: .userInitiated) {
            do {
                try await ExportPlan.run(jobs, isCancelled: { flag.isSet }, progress: { i, p in
                    Task { @MainActor in
                        model.index = i
                        model.current = names[i]
                        model.total = frames[i]
                        model.frame = p.frame
                        model.progress = (before[i] + p.fraction * weights[i]) / totalWeight
                    }
                }, preview: { img in
                    Task { @MainActor in model.preview = img }
                })
                await MainActor.run { model.phase = .done(urls) }
            } catch RenderError.cancelled {
                await MainActor.run { model.phase = .settings }
            } catch {
                await MainActor.run { model.phase = .failed(String(describing: error)) }
            }
        }
    }
}
