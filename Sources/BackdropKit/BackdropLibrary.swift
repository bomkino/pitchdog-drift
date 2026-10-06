import Foundation
import RenderCore

/// Backdrops saved from the Backdrop app, shared with Drift and Galileo.
public struct SavedBackdrop: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var name: String
    public var settings: BackdropSettings
    public var created: Date
    /// The film finish and loop length it was saved with (Backdrop 2.0 on).
    /// Optional, so libraries written by earlier versions still read, and
    /// earlier versions simply skip them.
    public var finish: FinishSettings?
    public var loopSeconds: Double?

    enum CodingKeys: String, CodingKey { case id, name, settings, created, finish, loopSeconds }

    /// The finish and loop are read leniently: a library written by a later
    /// version with a richer finish still loads, without it.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        settings = try c.decode(BackdropSettings.self, forKey: .settings)
        created = try c.decode(Date.self, forKey: .created)
        finish = try? c.decodeIfPresent(FinishSettings.self, forKey: .finish)
        loopSeconds = try? c.decodeIfPresent(Double.self, forKey: .loopSeconds)
    }

    public init(id: UUID = UUID(), name: String, settings: BackdropSettings, created: Date = Date(),
                finish: FinishSettings? = nil, loopSeconds: Double? = nil) {
        self.id = id
        self.name = name
        self.settings = settings
        self.created = created
        self.finish = finish
        self.loopSeconds = loopSeconds
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
    public static func save(name: String, settings: BackdropSettings, finish: FinishSettings? = nil,
                            loopSeconds: Double? = nil) throws -> SavedBackdrop {
        let item = SavedBackdrop(name: name, settings: settings, finish: finish, loopSeconds: loopSeconds)
        try write(item)
        return item
    }

    /// Gives a saved look a new name, in place.
    public static func rename(_ item: SavedBackdrop, to name: String) throws {
        var renamed = item
        renamed.name = name
        try write(renamed)
    }

    /// Moves a saved look to the Trash, so it can still be put back.
    public static func trash(_ id: UUID) throws {
        try FileManager.default.trashItem(at: url(id), resultingItemURL: nil)
    }

    public static func delete(_ id: UUID) {
        try? FileManager.default.removeItem(at: url(id))
    }

    static func url(_ id: UUID) -> URL { folder.appendingPathComponent(id.uuidString + ".json") }

    static func write(_ item: SavedBackdrop) throws {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        try enc.encode(item).write(to: url(item.id), options: .atomic)
    }
}
