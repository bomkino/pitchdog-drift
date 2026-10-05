import Foundation
import RenderCore
import simd

/// One presented item. Two occurrences may share the same media.
public struct SceneItem: Sendable, Hashable {
    /// Index into the texture list for this frame.
    public var media: Int
    /// Stable occurrence identity.
    public var occurrence: Int
    /// Width / height of the media.
    public var aspect: Float
    /// A featured item holds the stage for a beat when it arrives.
    public var featured: Bool

    public init(media: Int, occurrence: Int, aspect: Float, featured: Bool = false) {
        self.media = media
        self.occurrence = occurrence
        self.aspect = aspect
        self.featured = featured
    }
}

/// Six human dials shared by every scene. Each scene names the ones it uses.
public struct SceneDials: Codable, Hashable, Sendable {
    public var pace: Float = 0.5
    public var size: Float = 0.5
    public var spacing: Float = 0.5
    public var depth: Float = 0.5
    public var angle: Float = 0.5
    public var life: Float = 0.5

    public init(pace: Float = 0.5, size: Float = 0.5, spacing: Float = 0.5, depth: Float = 0.5, angle: Float = 0.5, life: Float = 0.5) {
        self.pace = pace
        self.size = size
        self.spacing = spacing
        self.depth = depth
        self.angle = angle
        self.life = life
    }

    public subscript(_ key: DialKey) -> Float {
        get {
            switch key {
            case .pace: return pace
            case .size: return size
            case .spacing: return spacing
            case .depth: return depth
            case .angle: return angle
            case .life: return life
            }
        }
        set {
            switch key {
            case .pace: pace = newValue
            case .size: size = newValue
            case .spacing: spacing = newValue
            case .depth: depth = newValue
            case .angle: angle = newValue
            case .life: life = newValue
            }
        }
    }
}

public enum DialKey: String, CaseIterable, Codable, Sendable {
    case pace, size, spacing, depth, angle, life
}

public struct SceneContext: Sendable {
    public var items: [SceneItem]
    /// Canvas width / height.
    public var aspect: Float
    public var dials: SceneDials
    public var seed: UInt32

    public init(items: [SceneItem], aspect: Float, dials: SceneDials, seed: UInt32 = 1) {
        self.items = items
        self.aspect = aspect
        self.dials = dials
        self.seed = seed
    }

    public var isPortrait: Bool { aspect < 0.95 }
}

/// A scene is a pure function from time to a stage frame. Pure functions give
/// exact scrubbing, seamless loops, and preview that always matches export.
public protocol StageScene: Sendable {
    var id: String { get }
    var name: String { get }
    var summary: String { get }
    /// Dial names shown to the user, in display order.
    var dials: [(DialKey, String)] { get }
    var defaults: SceneDials { get }
    /// The natural loop length in seconds for this context.
    func loopDuration(_ ctx: SceneContext) -> Double
    func frame(at t: Double, _ ctx: SceneContext) -> StageFrame
    /// The moments in one loop that make a sound: where cards pass, lift and land.
    func soundEvents(_ ctx: SceneContext) -> [SoundEvent]
    /// False for stepped motion: a shutter spanning two poses would show both.
    var allowsMotionBlur: Bool { get }
}

public extension StageScene {
    var allowsMotionBlur: Bool { true }

    /// A soft passage per item, for scenes whose motion has no sharper moments.
    func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        let n = ctx.items.count
        guard n > 0 else { return [] }
        let loop = loopDuration(ctx)
        return (0..<n).map { SoundEvent(time: loop * Double($0) / Double(n), cue: .passage, intensity: 0.4) }
    }
}

// MARK: - Shared motion helpers

public enum Ease {
    public static func smooth(_ x: Float) -> Float { let t = min(max(x, 0), 1); return t * t * (3 - 2 * t) }
    public static func smoother(_ x: Float) -> Float { let t = min(max(x, 0), 1); return t * t * t * (t * (t * 6 - 15) + 10) }
    public static func outCubic(_ x: Float) -> Float { let t = 1 - min(max(x, 0), 1); return 1 - t * t * t }
    /// Time warp that starts from rest and reaches full speed after `ramp`, so a
    /// fast ease-out (a throw) does not jump from standstill to top speed.
    public static func launch(_ x: Float, ramp: Float) -> Float {
        let t = min(max(x, 0), 1), k = max(ramp, 1e-4)
        let scale = 1 - k / 2
        return t < k ? t * t / (2 * k) / scale : (t - k / 2) / scale
    }
    public static func inOutCubic(_ x: Float) -> Float {
        let t = min(max(x, 0), 1)
        return t < 0.5 ? 4 * t * t * t : 1 - powf(-2 * t + 2, 3) / 2
    }
    /// The "register" curve: cubic-bezier(0.22, 1, 0.36, 1).
    public static func register(_ x: Float) -> Float { bezier(x, 0.22, 1, 0.36, 1) }
    /// The "place" curve: cubic-bezier(0.65, 0, 0.35, 1).
    public static func place(_ x: Float) -> Float { bezier(x, 0.65, 0, 0.35, 1) }

    /// CSS-style cubic bezier, solved by Newton iteration.
    public static func bezier(_ x: Float, _ x1: Float, _ y1: Float, _ x2: Float, _ y2: Float) -> Float {
        let x = min(max(x, 0), 1)
        func bx(_ t: Float) -> Float { 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t }
        func by(_ t: Float) -> Float { 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t }
        func dbx(_ t: Float) -> Float { 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2) }
        var t = x
        for _ in 0..<8 {
            let err = bx(t) - x
            let d = dbx(t)
            if abs(err) < 1e-5 || abs(d) < 1e-6 { break }
            t -= err / d
            t = min(max(t, 0), 1)
        }
        return by(t)
    }
}

/// Deterministic per-index randomness.
public enum Hash {
    public static func unit(_ i: Int, _ salt: UInt32 = 0) -> Float {
        var x = UInt32(truncatingIfNeeded: i) &* 747796405 &+ 2891336453 &+ salt &* 2654435761
        x = ((x >> ((x >> 28) &+ 4)) ^ x) &* 277803737
        x = (x >> 22) ^ x
        return Float(x) / Float(UInt32.max)
    }

    public static func signed(_ i: Int, _ salt: UInt32 = 0) -> Float { unit(i, salt) * 2 - 1 }
}

public func mix(_ a: Float, _ b: Float, _ t: Float) -> Float { a + (b - a) * t }

/// Positive modulo.
public func wrap(_ x: Double, _ m: Double) -> Double {
    guard m > 0 else { return 0 }
    let r = x.truncatingRemainder(dividingBy: m)
    return r < 0 ? r + m : r
}
