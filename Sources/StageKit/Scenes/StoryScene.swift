import Foundation
import RenderCore
import simd

/// Deck Story: the whole set moves through formations by identity —
/// contact grid, fanned hand, the deck laid in a row, each piece featured in
/// turn, then home to the grid so the loop closes. Every card travels on a lifted arc with a small
/// stagger, so the morphs read as one choreography rather than cuts.
public struct StoryScene: StageScene {
    public let id: String
    public let name: String
    public let summary: String
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.spacing, "Spread"), (.life, "Arc")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.5, spacing: 0.5, life: 0.5)

    public init(id: String = "story", name: String = "Deck Story",
                summary: String = "The whole deck on a sheet, fanned into a hand, each slide featured in turn, then home again.") {
        self.id = id
        self.name = name
        self.summary = summary
    }

    struct Pose {
        var p: SIMD3<Float>
        var r: SIMD3<Float>
        var s: SIMD2<Float>
        /// Brightness; waiting cards dim instead of turning translucent.
        var dim: Float = 1
    }

    enum Formation: Equatable { case grid, fan, row, feature(Int) }

    struct Step {
        var from: Formation
        var to: Formation
        var hold: Double
        var move: Double
    }

    func steps(_ ctx: SceneContext) -> [Step] {
        let k = GalleryKit.paceScale(ctx.dials.pace)
        let n = ctx.items.count
        var out: [Step] = [Step(from: .grid, to: .fan, hold: 2.2 * k, move: 1.4 * k),
                           Step(from: .fan, to: .row, hold: 1.8 * k, move: 1.3 * k),
                           Step(from: .row, to: .feature(0), hold: 0.3 * k, move: 1.0 * k)]
        for i in 0..<n {
            let hold = (ctx.items[i].featured ? 2.8 : 1.7) * k
            out.append(Step(from: .feature(i), to: i == n - 1 ? .grid : .feature(i + 1), hold: hold, move: (i == n - 1 ? 1.5 : 0.95) * k))
        }
        return out
    }

    public func loopDuration(_ ctx: SceneContext) -> Double {
        guard !ctx.items.isEmpty else { return 4 }
        return steps(ctx).reduce(0) { $0 + $1.hold + $1.move }
    }

    // MARK: Formations

    func grid(_ i: Int, _ ctx: SceneContext) -> Pose {
        let n = ctx.items.count
        let cols = max(1, Int(ceil(sqrt(Double(n) * Double(ctx.aspect) / 1.6))))
        let rows = Int(ceil(Double(n) / Double(cols)))
        let w = ctx.aspect * 0.82, h: Float = 0.78
        let cell = SIMD2(w / Float(cols), h / Float(rows))
        let r = i / cols, c = i % cols
        let rowCount = r == rows - 1 ? n - r * cols : cols
        let shift = Float(cols - rowCount) * cell.x / 2
        let x = -w / 2 + cell.x * (Float(c) + 0.5) + shift
        let y = h / 2 - cell.y * (Float(r) + 0.5)
        let size = GalleryKit.fit(ctx.items[i].aspect, maxW: cell.x * 0.86, maxH: cell.y * 0.8)
        return Pose(p: SIMD3(x, y, 0), r: .zero, s: size)
    }

    /// A hand of cards. Each card lies on its left neighbour, so every title shows.
    /// Narrow canvases get a smaller hand, so it still fits the frame.
    func fan(_ i: Int, _ ctx: SceneContext) -> Pose {
        let n = ctx.items.count
        // Narrow canvases and big decks get a smaller hand, so it still fits the frame.
        let crowd: Float = n > 12 ? (12 / Float(n)).squareRoot() : 1
        let fit = min(1, ctx.aspect / 1.3) * crowd
        let spread = GalleryKit.deg(mix(40, 110, ctx.dials.spacing)) * (0.55 + 0.45 * fit)
        let step = n > 1 ? spread / Float(n - 1) : 0
        let theta = (Float(i) - Float(n - 1) / 2) * step
        let pivot = SIMD2<Float>(0, -0.95 * fit - 0.12 * (1 - fit))
        let arm: Float = 0.78 * fit
        let h = 0.36 * mix(0.8, 1.2, ctx.dials.size) * fit
        let size = GalleryKit.fit(ctx.items[i].aspect, maxW: h * 1.8, maxH: h)
        let dir = SIMD2<Float>(sinf(theta), cosf(theta))
        let c = pivot + dir * (arm + size.y / 2)
        return Pose(p: SIMD3(c.x, c.y, Float(i) * 0.004), r: SIMD3(0, 0, -theta), s: size)
    }

    /// Where the deck rests while one slide is featured: one row along the top of
    /// a wide canvas; on a tall one, a small grid above the feature, kept inside
    /// the band that Reels and TikTok leave clear.
    struct DeckLayout {
        var perRow: Int
        var height: Float
        var pitch: Float
        var top: Float
        var rowGap: Float
        var featureY: Float
    }

    func deckLayout(_ ctx: SceneContext) -> DeckLayout {
        let n = max(ctx.items.count, 1)
        if !ctx.isPortrait {
            // One row along the top; a big deck wraps into rows of up to 16.
            let rows = max(1, Int(ceil(Double(n) / 16)))
            let perRow = Int(ceil(Double(n) / Double(rows)))
            let h: Float = 0.12
            let pitch = min(ctx.aspect * 0.9 / Float(perRow), h * 1.95)
            let tall = rows == 1 ? h : min(h, pitch * 0.86 / 1.3)
            let top: Float = rows == 1 ? 0.43 : 0.45
            let bottom = top - Float(rows - 1) * tall * 1.3 - tall
            return DeckLayout(perRow: perRow, height: tall, pitch: pitch, top: top, rowGap: tall * 1.3, featureY: bottom - 0.05)
        }
        let perRow = min(n, n > 12 ? 6 : 4)
        let rows = Int(ceil(Double(n) / Double(perRow)))
        let pitch = ctx.aspect * 0.92 / Float(perRow)
        let h = min(pitch * 0.86 / 1.78, 0.3 / Float(rows) / 1.3)
        let rowGap = h * 1.3
        // Low enough that deck and feature sit centred in the band a reel's
        // header and captions leave clear.
        let top: Float = 0.32
        let bottom = top - Float(rows - 1) * rowGap - h
        return DeckLayout(perRow: perRow, height: h, pitch: pitch, top: top, rowGap: rowGap, featureY: bottom - 0.07)
    }

    /// The deck laid out in its resting place, every slide in its slot.
    /// The featured slide leaves a gap where it belongs.
    func row(_ i: Int, _ ctx: SceneContext) -> Pose {
        let d = deckLayout(ctx)
        let n = ctx.items.count
        let r = i / d.perRow, c = i % d.perRow
        let inRow = min(d.perRow, n - r * d.perRow)
        let x = (Float(c) - Float(inRow - 1) / 2) * d.pitch
        let y = d.top - d.height / 2 - Float(r) * d.rowGap
        let size = GalleryKit.fit(ctx.items[i].aspect, maxW: d.pitch * 0.86, maxH: d.height)
        // Resting close to the ground keeps the small shadows tucked under the cards.
        return Pose(p: SIMD3(x, y, -0.05), r: SIMD3(GalleryKit.deg(-8), 0, 0), s: size, dim: 0.58)
    }

    func feature(_ i: Int, _ k: Int, _ ctx: SceneContext) -> Pose {
        guard i == k else { return row(i, ctx) }
        let d = deckLayout(ctx)
        if ctx.isPortrait {
            let size = GalleryKit.fit(ctx.items[i].aspect, maxW: ctx.aspect * 0.9, maxH: 0.56 * mix(0.85, 1.12, ctx.dials.size))
            return Pose(p: SIMD3(0, d.featureY - size.y / 2, 0.12), r: .zero, s: size)
        }
        // Below the deck, never overlapping it, as close to the middle as it fits.
        let room = d.featureY + 0.46
        let size = GalleryKit.fit(ctx.items[i].aspect, maxW: ctx.aspect * 0.78, maxH: min(0.56 * mix(0.85, 1.12, ctx.dials.size), room))
        return Pose(p: SIMD3(0, min(-0.07, d.featureY - size.y / 2), 0.12), r: .zero, s: size)
    }

    func pose(_ i: Int, _ f: Formation, _ ctx: SceneContext) -> Pose {
        switch f {
        case .grid: return grid(i, ctx)
        case .fan: return fan(i, ctx)
        case .row: return row(i, ctx)
        case let .feature(k): return feature(i, k, ctx)
        }
    }

    /// Start, length, lift and stacking layer for card `i` during a move.
    ///
    /// Stacking is decided here rather than by depth, so no card ever changes
    /// places with another while they overlap: the hand is built bottom card
    /// first and dealt from the top, and an incoming feature always passes in
    /// front of the outgoing one.
    func motion(_ i: Int, _ step: Step, _ n: Int) -> (delay: Float, span: Float, lift: Float, layer: Float) {
        let rank = n > 1 ? Float(i) / Float(n - 1) : 0
        switch (step.from, step.to) {
        case (.grid, .fan):
            return (rank * 0.22, 0.78, 1, Float(i))
        case (.fan, .row):
            return ((1 - rank) * 0.3, 0.7, 0.6, Float(i))
        case let (.row, .feature(k)):
            return i == k ? (0, 1, 1, Float(n)) : (0, 1, 0, 0)
        case let (.feature(k), .feature(j)):
            if i == j { return (0, 0.9, 1, Float(n + 1)) }
            if i == k { return (0.1, 0.9, -0.5, Float(n)) }
            return (0, 1, 0, 0)
        case let (.feature(k), .grid):
            return i == k ? (0.15, 0.85, 0.5, Float(n)) : (rank * 0.15, 0.85, 0.6, Float(i))
        default:
            return (rank * 0.22, 0.78, 1, 0)
        }
    }

    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        let n = ctx.items.count
        guard n > 0 else { return [] }
        var out: [SoundEvent] = []
        var t = 0.0
        for step in steps(ctx) {
            let start = t + step.hold
            switch (step.from, step.to) {
            case (.grid, .fan):
                out.append(SoundEvent(time: start, cue: .air, intensity: 0.45))
                out.append(SoundEvent(time: start + step.move * 0.85, cue: .passage, intensity: 0.7))
            case (.fan, .row):
                // Dealt from the top: one soft slide per card, placed where it goes.
                for i in 0..<n {
                    let m = motion(i, step, n)
                    let x = row(i, ctx).p.x / max(ctx.aspect * 0.5, 0.1)
                    out.append(SoundEvent(time: start + Double(m.delay + m.span * 0.15) * step.move, cue: .passage,
                                          intensity: 0.3, pan: x * 0.5))
                }
            case (.row, .feature(_)):
                out.append(SoundEvent(time: start, cue: .air, intensity: 0.45))
                out.append(SoundEvent(time: start + step.move * 0.9, cue: .contact, intensity: 0.7))
            case (.feature(_), .feature(_)):
                out.append(SoundEvent(time: start + step.move * 0.1, cue: .passage, intensity: 0.55))
                out.append(SoundEvent(time: start + step.move * 0.9, cue: .contact, intensity: 0.6))
            case (.feature(_), .grid):
                out.append(SoundEvent(time: start + step.move * 0.1, cue: .passage, intensity: 0.6))
                out.append(SoundEvent(time: start + step.move * 0.95, cue: .settle, intensity: 0.8))
            default:
                break
            }
            t = start + step.move
        }
        return out
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var frame = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return frame }
        let all = steps(ctx)
        var local = wrap(t, loopDuration(ctx))
        var current = all[0]
        for s in all {
            if local < s.hold + s.move { current = s; break }
            local -= s.hold + s.move
        }
        let moving = local > current.hold
        let progress = moving ? Float((local - current.hold) / current.move) : 0
        let arc = mix(0.02, 0.22, ctx.dials.life)
        for i in 0..<n {
            let a = pose(i, current.from, ctx)
            var p = a
            var layer: Float = 0
            if moving {
                let b = pose(i, current.to, ctx)
                let m = motion(i, current, n)
                let q = Ease.inOutCubic((progress - m.delay) / m.span)
                p.p = a.p + (b.p - a.p) * q
                p.p.z += arc * m.lift * sinf(.pi * q)
                p.r = a.r + (b.r - a.r) * q
                p.s = a.s + (b.s - a.s) * q
                p.dim = a.dim + (b.dim - a.dim) * q
                layer = m.layer
            }
            var c = GalleryKit.card(ctx.items[i], center: p.p, size: p.s, rotation: p.r)
            c.color = SIMD4(p.dim, p.dim, p.dim, 1)
            c.layer = layer
            c.corner = 0.03
            c.shadow = 0.9 * p.dim
            frame.cards.append(c)
        }
        frame.groundZ = -0.08
        return frame
    }
}
