import Foundation

/// Backdrops saved from the Backdrop app, shared with Drift and Galileo.
public struct SavedBackdrop: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var name: String
    public var settings: BackdropSettings
    public var created: Date

    public init(id: UUID = UUID(), name: String, settings: BackdropSettings, created: Date = Date()) {
        self.id = id
        self.name = name
        self.settings = settings
        self.created = created
    }
}

public enum BackdropLibrary {
    public static var folder: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("pitch.dog", isDirectory: true).appendingPathComponent("Backdrop Library", isDirectory: true)
    }

    public static func all() -> [SavedBackdrop] {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) else { return [] }
        let decoder = JSONDecoder()
        return files.filter { $0.pathExtension == "json" }
            .compactMap { try? decoder.decode(SavedBackdrop.self, from: Data(contentsOf: $0)) }
            .sorted { $0.created > $1.created }
    }

    @discardableResult
    public static func save(name: String, settings: BackdropSettings) throws -> SavedBackdrop {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let item = SavedBackdrop(name: name, settings: settings)
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        try enc.encode(item).write(to: folder.appendingPathComponent(item.id.uuidString + ".json"), options: .atomic)
        return item
    }

    public static func delete(_ id: UUID) {
        try? FileManager.default.removeItem(at: folder.appendingPathComponent(id.uuidString + ".json"))
    }
}
