import Foundation
import SwiftUI
import UniformTypeIdentifiers

/// Output canvas presets. Names describe where the video goes.
public struct CanvasFormat: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public var detail: String
    public var width: Int
    public var height: Int

    public var aspect: Double { Double(width) / Double(max(height, 1)) }
    public var ratioLabel: String {
        switch id {
        case "reel": return "9:16"
        case "portrait": return "4:5"
        case "square": return "1:1"
        case "landscape", "uhd": return "16:9"
        case "cinema": return "2.39:1"
        case "wide": return "2.4:1"
        default: return String(format: "%.2f:1", aspect)
        }
    }

    public static let reel = CanvasFormat(id: "reel", name: "Reel", detail: "Instagram, TikTok, Shorts", width: 1080, height: 1920)
    public static let portrait = CanvasFormat(id: "portrait", name: "Portrait", detail: "Instagram feed", width: 1080, height: 1350)
    public static let square = CanvasFormat(id: "square", name: "Square", detail: "Feeds and carousels", width: 1080, height: 1080)
    public static let landscape = CanvasFormat(id: "landscape", name: "Landscape", detail: "YouTube, web, decks", width: 1920, height: 1080)
    public static let cinema = CanvasFormat(id: "cinema", name: "Cinema", detail: "Wide website heroes", width: 2560, height: 1072)
    public static let uhd = CanvasFormat(id: "uhd", name: "4K", detail: "Big screens", width: 3840, height: 2160)

    public static let presets: [CanvasFormat] = [.reel, .portrait, .square, .landscape, .cinema, .uhd]
}

/// One piece of media in the sequence.
public struct MediaItem: Codable, Hashable, Identifiable, Sendable {
    /// Stored names of the sample media an empty window can offer.
    public static let samplePrefix = "sample-"
    /// Sample media, which the first real import replaces.
    public var isSample: Bool { file.hasPrefix(Self.samplePrefix) }

    public var id: UUID
    public var name: String
    /// File name inside the package's Media folder.
    public var file: String
    public var kind: MediaKind
    public var page: Int
    public var aspect: Float
    /// Featured items hold the stage for a beat.
    public var featured: Bool
    public var focal: SIMD2<Float>
    /// Clip length in seconds, for video items.
    public var duration: Double?

    public init(id: UUID = UUID(), name: String, file: String, kind: MediaKind, page: Int = 0, aspect: Float,
                featured: Bool = false, focal: SIMD2<Float> = SIMD2(0.5, 0.5)) {
        self.id = id
        self.name = name
        self.file = file
        self.kind = kind
        self.page = page
        self.aspect = aspect
        self.featured = featured
        self.focal = focal
    }
}

/// A Drift or Galileo project. Each app saves its own document type.
public struct ReelProject: Codable, Hashable, Sendable {
    public var version: Int = 1
    public var app: String
    public var items: [MediaItem] = []
    public var scene: String
    public var dials: SceneDials
    public var backdrop: BackdropSettings
    public var look: StageLook
    public var format: CanvasFormat
    public var fps: Int = 30
    public var seed: UInt32 = 1
    /// Seconds for one loop; nil uses the scene's natural length.
    public var loopOverride: Double?
    /// The length chosen under Length (10, 15, 30 or 60 s). Pace is refitted to
    /// it when the scene, the items or the frame change; nil once Pace is moved
    /// away from it by hand.
    public var length: Double?
    /// Tactile sound; nil is silent.
    public var sound: ReelSound?
    /// Words over the finished frame; nil or empty shows none.
    public var title: ReelTitle?
    /// True when exports leave the background out (ProRes 4444, HEVC and PNG
    /// can); the stage then shows a checkerboard in its place. Nil is a backdrop.
    public var transparent: Bool?

    public init(app: String, scene: String, dials: SceneDials, backdrop: BackdropSettings, look: StageLook, format: CanvasFormat) {
        self.app = app
        self.scene = scene
        self.dials = dials
        self.backdrop = backdrop
        self.look = look
        self.format = format
    }
}

/// Package layout: `<name>.<ext>/project.json` plus `Media/<file>`.
public enum ProjectPackage {
    public static let projectFile = "project.json"
    public static let mediaFolder = "Media"

    public static func encode(_ project: ReelProject) throws -> Data {
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try enc.encode(project)
    }

    public static func decode(_ data: Data) throws -> ReelProject {
        try JSONDecoder().decode(ReelProject.self, from: data)
    }
}

/// Where a session keeps media files while editing.
public final class MediaStore: @unchecked Sendable {
    public let directory: URL

    public init() {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("pitch.dog Studio", isDirectory: true)
            .appendingPathComponent("Sessions", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        directory = base
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
    }

    public func url(for file: String) -> URL { directory.appendingPathComponent(file) }

    public func contains(_ file: String) -> Bool { FileManager.default.fileExists(atPath: url(for: file).path) }

    /// Copies an original into the store; returns the stored file name.
    public func importFile(_ source: URL) throws -> String {
        let ext = source.pathExtension.lowercased()
        let name = UUID().uuidString + (ext.isEmpty ? "" : ".\(ext)")
        try FileManager.default.copyItem(at: source, to: url(for: name))
        return name
    }

    public func write(_ data: Data, as file: String) throws {
        try data.write(to: url(for: file), options: .atomic)
    }

    deinit {
        try? FileManager.default.removeItem(at: directory)
    }
}

/// The SwiftUI document for Drift and Galileo projects.
public final class StudioDocument: ReferenceFileDocument, @unchecked Sendable {
    public typealias Snapshot = ReelProject

    nonisolated(unsafe) public static var documentType: UTType = .data
    nonisolated(unsafe) public static var makeDefaultProject: () -> ReelProject = {
        ReelProject(app: "studio", scene: "", dials: SceneDials(), backdrop: BackdropCatalog.defaultSettings, look: StageLook(), format: .landscape)
    }

    public static var readableContentTypes: [UTType] { [documentType] }
    public static var writableContentTypes: [UTType] { [documentType] }

    @Published public var project: ReelProject
    public let media = MediaStore()
    /// True for a document made with File > New, until its window first opens.
    public var isNew = false

    public init() {
        project = StudioDocument.makeDefaultProject()
        isNew = true
    }

    /// A new document for File > New.
    public init(project: ReelProject) {
        self.project = project
        isNew = true
    }

    public required init(configuration: ReadConfiguration) throws {
        let root = configuration.file
        guard let wrappers = root.fileWrappers,
              let json = wrappers[ProjectPackage.projectFile]?.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        project = try ProjectPackage.decode(json)
        if let mediaDir = wrappers[ProjectPackage.mediaFolder]?.fileWrappers {
            for (name, wrapper) in mediaDir {
                if let data = wrapper.regularFileContents {
                    try? media.write(data, as: name)
                }
            }
        }
    }

    public func snapshot(contentType: UTType) throws -> ReelProject { project }

    public func fileWrapper(snapshot: ReelProject, configuration: WriteConfiguration) throws -> FileWrapper {
        let data = try ProjectPackage.encode(snapshot)
        var mediaWrappers: [String: FileWrapper] = [:]
        let needed = Set(snapshot.items.map(\.file))
        let saved = configuration.existingFile?.fileWrappers?[ProjectPackage.mediaFolder]?.fileWrappers
        for file in needed {
            // A stored name never changes its contents, so the package's own copy is
            // always good; the working copy only has to cover media added since.
            if let existing = saved?[file] {
                mediaWrappers[file] = existing
            } else if media.contains(file), let w = try? FileWrapper(url: media.url(for: file), options: []) {
                w.preferredFilename = file
                mediaWrappers[file] = w
            } else {
                // Refuse to save rather than write a package that has lost media.
                throw CocoaError(.fileWriteUnknown, userInfo: [
                    NSLocalizedDescriptionKey: "A media file is missing, so the document was not saved.",
                    NSLocalizedRecoverySuggestionErrorKey: "Remove the grey item from the sequence, or reopen the document, then save again.",
                ])
            }
        }
        let mediaDir = FileWrapper(directoryWithFileWrappers: mediaWrappers)
        mediaDir.preferredFilename = ProjectPackage.mediaFolder
        let projectWrapper = FileWrapper(regularFileWithContents: data)
        projectWrapper.preferredFilename = ProjectPackage.projectFile
        return FileWrapper(directoryWithFileWrappers: [
            ProjectPackage.projectFile: projectWrapper,
            ProjectPackage.mediaFolder: mediaDir,
        ])
    }
}
