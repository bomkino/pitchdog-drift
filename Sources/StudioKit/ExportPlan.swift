import CoreGraphics
import Foundation

/// One file of an export.
struct ExportJob: @unchecked Sendable {
    var format: CanvasFormat
    var url: URL
    var composition: Composition
    var settings: ExportSettings

    /// Rough rendering cost, for sharing progress fairly across a batch.
    var weight: Double {
        let frames = settings.format == .still ? 1 : settings.frameCount
        return Double(frames) * Double(settings.width * settings.height) * Double(max(settings.samples, 1))
    }
}

/// The files an export writes: one file for a single format, or one per format
/// in a chosen folder, each laid out, timed and mixed for its own frame.
@MainActor
enum ExportPlan {
    struct Options {
        var kind: ExportKind = .h264
        var scale: Double = 1
        var fps = 30
        var loops = 1
        var samples = 8
        var transparent = false
    }

    /// Pixel size of `format` at `scale`, kept even for the encoders.
    static func size(_ format: CanvasFormat, scale: Double) -> (Int, Int) {
        (Int((Double(format.width) * scale / 2).rounded()) * 2, Int((Double(format.height) * scale / 2).rounded()) * 2)
    }

    /// The file name for one format of a several-format export.
    static func name(_ base: String, _ format: CanvasFormat, _ kind: ExportKind) -> String {
        let stem = "\(base) \(format.name)"
        return kind == .png ? stem + " frames" : stem + "." + kind.fileExtension
    }

    /// Jobs for `formats`. With one format, `destination` is the file itself;
    /// with several, it is the folder they go in. A still shows the playhead's
    /// moment, at the same point of each format's loop.
    static func jobs(_ source: any StageSource, formats: [CanvasFormat], options o: Options, destination: URL) -> [ExportJob] {
        let playhead = source.loopDuration > 0 ? wrap(source.clock.time, source.loopDuration) / source.loopDuration : 0
        var taken: Set<String> = []
        return formats.compactMap { format in
            guard let comp = source.composition(for: format) else { return nil }
            let loop = source.loopDuration(for: format)
            let duration = loop * Double(o.kind == .still ? 1 : o.loops)
            let (w, h) = size(format, scale: o.scale)
            var audio: AudioTrack?
            if case .video = o.kind.format { audio = source.exportAudio(for: format, duration: duration) }
            var settings = ExportSettings(width: w, height: h, fps: o.fps, duration: duration, format: o.kind.format,
                                          samples: o.samples, transparent: o.transparent && o.kind.supportsTransparency, audio: audio)
            settings.stillTime = playhead * loop
            let url = formats.count == 1 ? destination
                : unique(destination.appendingPathComponent(name(source.exportName, format, o.kind)), taken: &taken)
            return ExportJob(format: format, url: url, composition: comp, settings: settings)
        }
    }

    /// `url`, or the same name with a number, so a batch never replaces earlier work.
    static func unique(_ url: URL, taken: inout Set<String>) -> URL {
        let fm = FileManager.default
        let folder = url.deletingLastPathComponent()
        let ext = url.pathExtension
        let stem = ext.isEmpty ? url.lastPathComponent : url.deletingPathExtension().lastPathComponent
        var candidate = url
        var n = 2
        while fm.fileExists(atPath: candidate.path) || taken.contains(candidate.lastPathComponent) {
            let name = "\(stem) \(n)"
            candidate = folder.appendingPathComponent(ext.isEmpty ? name : name + "." + ext)
            n += 1
        }
        taken.insert(candidate.lastPathComponent)
        return candidate
    }

    /// Writes the jobs one after another. `progress` gets the job's index and
    /// its own progress. Each file is written beside its target under a hidden
    /// name and swapped in only once it is complete, so a cancelled or failed
    /// export leaves whatever was there before, and a folder of frames never
    /// mixes two runs.
    nonisolated static func run(_ jobs: [ExportJob], isCancelled: @escaping @Sendable () -> Bool = { false },
                                progress: @escaping @Sendable (Int, Exporter.Progress) -> Void = { _, _ in },
                                preview: (@Sendable (CGImage) -> Void)? = nil) async throws {
        let exporter = try Exporter()
        let fm = FileManager.default
        for (i, job) in jobs.enumerated() {
            let ext = job.url.pathExtension
            let hidden = "." + job.url.deletingPathExtension().lastPathComponent + "-" + UUID().uuidString.prefix(8) + (ext.isEmpty ? "" : "." + ext)
            let temp = job.url.deletingLastPathComponent().appendingPathComponent(hidden)
            do {
                try await exporter.export(job.composition, settings: job.settings, to: temp, isCancelled: isCancelled,
                                          progress: { progress(i, $0) }, preview: preview)
                if fm.fileExists(atPath: job.url.path) {
                    _ = try fm.replaceItemAt(job.url, withItemAt: temp)
                } else {
                    try fm.moveItem(at: temp, to: job.url)
                }
            } catch {
                try? fm.removeItem(at: temp)
                throw error
            }
        }
    }
}
