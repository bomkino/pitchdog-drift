import AppKit
import SwiftUI

/// Headless verification: `App --snapshot out.png [--scheme dark|light]
/// [--size 1440x900] [--scene id] [--format reel] [--empty] [--time 3.5]
/// [--tab motion|title|colour|sound|finish] [--preview-scene id]` opens the
/// real document window, renders it
/// to a PNG and quits. The live Metal stage shows the exact frame the exporter
/// would write, because Metal layers do not appear in view caches.
@MainActor
public enum StudioSnapshot {
    public static var isRequested: Bool {
        CommandLine.arguments.contains("--snapshot") || CommandLine.arguments.contains("--still")
            || CommandLine.arguments.contains("--export") || CommandLine.arguments.contains("--probe-preview")
    }

    /// One headless run per process, however many windows come up.
    static var started = false

    public static func arg(_ name: String) -> String? {
        let a = CommandLine.arguments
        guard let i = a.firstIndex(of: name), i + 1 < a.count else { return nil }
        return a[i + 1]
    }

    static var size: CGSize {
        let parts = (arg("--size") ?? "1440x900").split(separator: "x").compactMap { Double($0) }
        return CGSize(width: parts.first ?? 1440, height: parts.last ?? 900)
    }

    static var dark: Bool { (arg("--scheme") ?? "dark") != "light" }

    /// Prepares a freshly opened session the way the flags ask.
    static func prepare(_ session: StudioSession, still: @escaping (CGImage?) -> Void) {
        if let sceneID = arg("--scene") { session.chooseScene(sceneID) }
        if let fmt = arg("--format"), let f = CanvasFormat.presets.first(where: { $0.id == fmt }) {
            session.update("Canvas") { $0.format = f }
        }
        if let media = arg("--media") {
            if CommandLine.arguments.contains("--with-samples") { session.addSamples() }
            session.importMedia(media.split(separator: ",").map { URL(fileURLWithPath: String($0)) })
        } else if !CommandLine.arguments.contains("--empty") && session.project.items.isEmpty {
            session.addSamples()
        }
        if let name = arg("--sound"), let palette = SoundPalette(rawValue: name) {
            session.update("Sound") { $0.sound = ReelSound(palette: palette) }
        }
        if let text = arg("--title") {
            session.update("Title") { p in
                p.title = ReelTitle(text: text, kicker: arg("--kicker") ?? "",
                                    placement: ReelTitle.Placement(rawValue: arg("--title-place") ?? "") ?? .corner,
                                    timing: ReelTitle.Timing(rawValue: arg("--title-time") ?? "") ?? .throughout,
                                    ink: ReelTitle.Ink(rawValue: arg("--title-ink") ?? "") ?? .auto)
            }
        }
        if let name = arg("--grade"), let grade = Grade(rawValue: name) {
            var fresh = session.project
            session.config.entry(fresh.scene).apply(&fresh)
            let natural = fresh.look.finish
            session.update("Grade") { grade.apply(&$0.look.finish, natural: natural) }
        }
        // Material checks: a surface and a bend for the scene's look.
        if let name = arg("--surface"), let surface = SurfaceKind(rawValue: name) {
            session.update("Surface") { $0.look.surface = surface }
        }
        if let name = arg("--bend"), let bend = BendKind(rawValue: name) {
            session.update("Bend") { $0.look.bend = bend }
        }
        if let f = arg("--feature"), let i = Int(f), i < session.project.items.count {
            session.toggleFeatured(session.project.items[i].id)
        }
        session.clock.playing = false
        session.clock.time = Double(arg("--time") ?? "") ?? 3.2
        if let id = arg("--preview-scene") {
            // What resting the pointer on a scene in the browser shows.
            session.preview(id)
            session.clock.playing = false
            session.clock.time = Double(arg("--time") ?? "") ?? 3.2
        }
        if CommandLine.arguments.contains("--show-export") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { session.showExport = true }
        }
        let deadline = Date().addingTimeInterval(10)
        func poll() {
            if session.importing > 0 && Date() < deadline {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { poll() }
                return
            }
            if let fit = arg("--fit-loop"), let seconds = Double(fit) {
                session.fitLoop(to: seconds)
                print(String(format: "loop %.2f s at pace %.3f (range %.1f to %.1f s)", session.loopDuration, session.project.dials.pace,
                             session.loopDuration(pace: 1), session.loopDuration(pace: 0)))
            }
            if CommandLine.arguments.contains("--palette-from-media"), let p = session.mediaPalette {
                session.update("Palette") { $0.backdrop.palette = p }
                print("palette \(p.name): \(p.colors.map(\.hex).joined(separator: " "))")
            }
            var image: CGImage?
            if let comp = session.stageComposition() {
                let aspect = session.project.format.aspect
                let h = 1100.0
                image = try? Exporter().still(comp, at: session.clock.time, width: Int(h * aspect), height: Int(h),
                                              samples: Int(arg("--samples") ?? "") ?? 6)
            }
            if arg("--undo-test") != nil {
                let um = session.undoManager
                let original = session.project.scene
                let other = session.config.scenes.first { $0.id != original }!.id
                session.chooseScene(other)
                let changed = session.project.scene == other
                um?.undo()
                let undone = session.project.scene == original
                um?.redo()
                let redone = session.project.scene == other
                session.beginEdit()
                session.live { $0.dials.pace = 0.9 }
                session.live { $0.dials.pace = 0.95 }
                session.commitEdit("Pace")
                um?.undo()
                let gestureUndone = abs(session.project.dials.pace - session.config.entry(other).make(session.project).defaults.pace) < 0.001
                    || session.project.dials.pace < 0.9
                print("undo-test manager:\(um != nil) changed:\(changed) undone:\(undone) redone:\(redone) gesture-one-step:\(gestureUndone)")
                exit(changed && undone && redone && gestureUndone ? 0 : 1)
            }
            if arg("--undo-title-test") != nil {
                // Typing a title, a pause, then a click elsewhere while the field keeps
                // focus: two undo steps, in order. By hand each event gets its own undo
                // group; here the groups are opened and closed explicitly instead.
                guard let um = session.undoManager else { print("undo-title-test no manager"); exit(1) }
                um.groupsByEvent = false
                um.beginUndoGrouping()
                session.beginEdit("Title")
                session.live { $0.title = ReelTitle(text: "Hello") }
                session.commitEdit(ifOpen: "Title")   // what the field's pause does
                um.endUndoGrouping()
                um.beginUndoGrouping()
                session.beginEdit("Title")            // focus stays; a keystroke reopens the step…
                session.update("Title Placement") { $0.title?.placement = .centre }   // …and a click closes it
                session.commitEdit(ifOpen: "Title")
                um.endUndoGrouping()
                let named = um.undoActionName == "Title Placement"
                um.undo()
                let first = named && session.project.title?.text == "Hello" && session.project.title?.placement == .corner
                um.undo()
                let second = session.project.title == nil
                // A change arriving in the middle of a slider drag: the rest of the
                // drag still undoes as its own step.
                um.beginUndoGrouping()
                session.beginEdit()
                session.live { $0.dials.pace = 0.9 }
                um.endUndoGrouping()
                um.beginUndoGrouping()
                session.update("New Variation") { $0.seed = $0.seed &+ 97 }
                um.endUndoGrouping()
                um.beginUndoGrouping()
                session.live { $0.dials.pace = 0.95 }
                session.commitEdit("Pace")
                um.endUndoGrouping()
                um.undo()
                let dragRest = abs(session.project.dials.pace - 0.9) < 0.001
                print("undo-title-test placement-first:\(first) typing-second:\(second) drag-rest:\(dragRest)")
                exit(first && second && dragRest ? 0 : 1)
            }
            if arg("--undo-clip-test") != nil {
                // Undo and redo an import of a clip that finished loading after the
                // import was recorded: the clip must keep its length.
                guard let um = session.undoManager, let first = session.project.items.first, first.kind == .video else {
                    print("undo-clip-test needs --media with a clip first"); exit(1)
                }
                let before = session.project.items.first?.duration
                um.undo()
                um.redo()
                let after = session.project.items.first(where: { $0.id == first.id })?.duration
                print("undo-clip-test before:\(before.map { String(format: "%.2f", $0) } ?? "nil") after:\(after.map { String(format: "%.2f", $0) } ?? "nil")")
                exit(after != nil ? 0 : 1)
            }
            if arg("--drop-media") != nil, let item = session.project.items.first {
                // Simulates a working copy lost to a full disk or a cache cleaner.
                try? FileManager.default.removeItem(at: session.document.media.url(for: item.file))
            }
            if let savePath = arg("--save-to") {
                guard let doc = NSDocumentController.shared.documents.first else { print("save: no document"); exit(1) }
                let url = URL(fileURLWithPath: savePath)
                doc.save(to: url, ofType: session.config.documentType.identifier, for: .saveAsOperation) { error in
                    if let error { print("save failed: \(error)") } else { print("saved \(savePath) items \(session.project.items.count)") }
                    exit(error == nil ? 0 : 1)
                }
                return
            }
            if let exportPath = arg("--export"), let ids = arg("--formats") {
                // A batch, the way the export sheet writes one: a file per format in a folder.
                let formats = ids.split(separator: ",").compactMap { id in CanvasFormat.presets.first { $0.id == String(id) } }
                let kind = ExportKind(rawValue: arg("--kind") ?? "h264") ?? .h264
                let options = ExportPlan.Options(kind: kind, fps: session.project.fps, samples: Int(arg("--samples") ?? "") ?? 8,
                                                 transparent: arg("--transparent") != nil)
                let folder = URL(fileURLWithPath: exportPath)
                try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                let destination = formats.count == 1 ? folder.appendingPathComponent(ExportPlan.name(session.exportName, formats[0], kind)) : folder
                let jobs = ExportPlan.jobs(session, formats: formats, options: options, destination: destination)
                let started = Date()
                Task.detached {
                    do {
                        try await ExportPlan.run(jobs)
                        for job in jobs {
                            print("exported \(job.url.lastPathComponent) \(job.settings.width)x\(job.settings.height) frames \(job.settings.frameCount) audio \(job.settings.audio != nil)")
                        }
                        print(String(format: "batch of %d in %.1f s", jobs.count, Date().timeIntervalSince(started)))
                    } catch {
                        print("export failed: \(error)")
                    }
                    exit(0)
                }
                return
            }
            if let exportPath = arg("--export"), let comp = session.composition() {
                let f = session.project.format
                let transparent = arg("--transparent") != nil
                let format: ExportFormat = exportPath.hasSuffix(".png") ? .still
                    : .video(exportPath.hasSuffix(".mov") ? (transparent ? .prores4444 : .prores422) : (exportPath.hasSuffix(".hevc.mp4") ? .hevc : .h264))
                let duration = Double(arg("--seconds") ?? "") ?? session.loopDuration
                var audio: AudioTrack?
                if case .video = format { audio = session.exportAudio(duration: duration) }
                let settings = ExportSettings(width: f.width, height: f.height, fps: session.project.fps,
                                              duration: duration, format: format, samples: Int(arg("--samples") ?? "") ?? 8,
                                              transparent: transparent, audio: audio)
                let started = Date()
                Task.detached {
                    do {
                        try await Exporter().export(comp, settings: settings, to: URL(fileURLWithPath: exportPath))
                        print(String(format: "exported %@ frames %d in %.1f s", exportPath, settings.frameCount, Date().timeIntervalSince(started)))
                    } catch {
                        print("export failed: \(error)")
                    }
                    exit(0)
                }
                return
            }
            if let stillPath = arg("--still") {
                if let image { try? ImageOutput.writePNG(image, to: URL(fileURLWithPath: stillPath)) }
                print("still \(stillPath) scene \(session.project.scene) group \(session.group.id) styles \(session.group.members.count) preview \(session.previewID ?? "none") items \(session.project.items.count) samples \(session.project.items.filter(\.isSample).count) title \(session.project.title?.text ?? "none") loop \(String(format: "%.2f", session.loopDuration)) transport \(String(format: "%.2f", session.clock.duration)) sessions \(StudioSession.made) windows \(NSDocumentController.shared.documents.map { $0.fileURL?.lastPathComponent ?? "untitled" })")
                exit(0)
            }
            if arg("--probe-preview") != nil {
                // Live path: leave the real Metal stage in place and play.
                session.clock.playing = true
                session.touch()
                return
            }
            still(image)
            DispatchQueue.main.asyncAfter(deadline: .now() + (Double(arg("--settle") ?? "") ?? 4)) { captureWindow() }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { poll() }
    }

    public static func captureWindow() {
        guard let path = arg("--snapshot") else { exit(1) }
        let candidates = NSApp.windows.filter { $0.isVisible && !$0.isSheet && $0.contentView != nil && $0.frame.width > 400 }
        let documentWindow = candidates.first { ($0.windowController?.document as? NSDocument)?.fileURL != nil }
        guard let window = documentWindow ?? candidates.first else {
            print("snapshot: no window")
            exit(1)
        }
        func render(_ w: NSWindow) -> NSBitmapImageRep? {
            let view = w.contentView?.superview ?? w.contentView!
            guard let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return nil }
            view.cacheDisplay(in: view.bounds, to: rep)
            return rep
        }
        guard let base = render(window) else { exit(1) }
        var output = base
        if let sheet = window.attachedSheet, let sheetRep = render(sheet) {
            // Composite the sheet where it sits over its window.
            let size = NSSize(width: base.pixelsWide, height: base.pixelsHigh)
            let scale = CGFloat(base.pixelsWide) / window.frame.width
            let image = NSImage(size: size)
            image.lockFocus()
            base.draw(in: NSRect(origin: .zero, size: size))
            let origin = NSPoint(x: (sheet.frame.minX - window.frame.minX) * scale, y: (sheet.frame.minY - window.frame.minY) * scale)
            sheetRep.draw(in: NSRect(x: origin.x, y: origin.y, width: sheet.frame.width * scale, height: sheet.frame.height * scale))
            image.unlockFocus()
            if let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) { output = rep }
        }
        if let data = output.representation(using: .png, properties: [:]) {
            try? data.write(to: URL(fileURLWithPath: path))
            print("snapshot \(path) \(output.pixelsWide)x\(output.pixelsHigh) type:\(StudioType.status)")
        }
        exit(0)
    }

    static func sizeWindow() {
        for w in NSApp.windows where w.isVisible && w.frame.width > 400 {
            w.setContentSize(size)
            w.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
            w.setFrameOrigin(NSPoint(x: 30, y: 30))
        }
    }
}

/// Shared app delegate.
public final class StudioAppDelegate: NSObject, NSApplicationDelegate {
    nonisolated(unsafe) public static var config: StudioConfiguration?

    public func applicationWillFinishLaunching(_ notification: Notification) {
        // Headless runs start clean: no windows restored from earlier runs.
        if StudioSnapshot.isRequested {
            // Registered, not stored, so the app's own windows still restore next time.
            UserDefaults.standard.register(defaults: ["ApplePersistenceIgnoreState": true])
        }
    }

    public func applicationDidFinishLaunching(_ notification: Notification) {
        if StudioSnapshot.isRequested {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                MainActor.assumeIsolated { StudioSnapshot.sizeWindow() }
            }
        }
    }
}

/// Wraps the root view so snapshot runs can stage content and swap the live stage for a still.
struct SnapshotHost: ViewModifier {
    let session: StudioSession
    @State private var still: CGImage?
    @State private var started = false

    func body(content: Content) -> some View {
        content
            .environment(\.snapshotStage, still)
            .onAppear {
                guard StudioSnapshot.isRequested, !started, !StudioSnapshot.started else { return }
                started = true
                StudioSnapshot.started = true
                StudioSnapshot.prepare(session) { img in still = img }
            }
    }
}

/// Launch timing, for measuring how soon a new window is ready: set
/// STUDIO_LAUNCH_PROBE=1 and launch normally. Prints milestones in
/// milliseconds since the process started, then quits once media is loaded.
enum LaunchProbe {
    static let enabled = ProcessInfo.processInfo.environment["STUDIO_LAUNCH_PROBE"] != nil
    nonisolated(unsafe) private static var done = false

    /// Seconds since this process started.
    static func elapsed() -> Double {
        var info = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
        guard sysctl(&mib, 4, &info, &size, nil, 0) == 0 else { return 0 }
        let t = info.kp_proc.p_starttime
        return Date().timeIntervalSince1970 - (Double(t.tv_sec) + Double(t.tv_usec) / 1e6)
    }

    static func mark(_ what: String, finish: Bool = false) {
        guard enabled, !done else { return }
        print(String(format: "launch-probe %@ %.0f ms", what, elapsed() * 1000))
        fflush(stdout)
        if finish {
            done = true
            // STUDIO_LAUNCH_PROBE=2 stays a few seconds longer, to time the thumbnails too.
            let linger = ProcessInfo.processInfo.environment["STUDIO_LAUNCH_PROBE"] == "2" ? 6.0 : 0.3
            DispatchQueue.main.asyncAfter(deadline: .now() + linger) { exit(0) }
        }
    }
}
