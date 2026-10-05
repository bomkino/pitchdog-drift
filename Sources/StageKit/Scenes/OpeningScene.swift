import Foundation
import RenderCore
import simd

/// Opening: a title sequence after the atelier's Opening Reel. A strip of work
/// enters and travels to each highlight; the highlight straightens and grows
/// while its neighbours make room. The finale takes the stage as the rest are
/// flung aside, then rises out of frame and leaves the stage empty, which is
/// where the loop begins again.
///
/// Highlights are the featured items; with none featured, every item has one.
/// A tall frame runs the strip up the screen instead of across it.
public struct OpeningScene: StageScene {
    public let id: String
    public let name: String
    public let summary: String
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.spacing, "Spacing"), (.life, "Lean")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.5, spacing: 0.4, life: 0.5)

    public init(id: String = "opening", name: String = "Opening",
                summary: String = "A title sequence. The strip travels to each highlight, which grows while its neighbours make room; the finale takes the stage, then clears it.") {
        self.id = id
        self.name = name
        self.summary = summary
    }

    // MARK: Layout

    struct Strip {
        var x: [Float]        // centre of each card along the strip
        var width: [Float]
        var heights: [Float]  // each card keeps its own aspect
        var height: Float     // the tallest a card may be
        var pitch: Float      // mean centre-to-centre distance
        var tall: Bool        // the strip runs up the screen

        /// Each card's extent along the strip.
        func extent(_ i: Int) -> Float { tall ? heights[i] : width[i] }
    }

    static func isTall(_ ctx: SceneContext) -> Bool { ctx.aspect < 0.9 }

    /// Half the frame along the strip's axis.
    static func halfSpan(_ ctx: SceneContext) -> Float { isTall(ctx) ? 0.5 : ctx.aspect / 2 }

    func strip(_ ctx: SceneContext) -> Strip {
        let tall = Self.isTall(ctx)
        let fit = tall ? 1 : min(1, ctx.aspect * 1.25)
        let h = 0.42 * mix(0.8, 1.2, ctx.dials.size) * fit
        let gap = mix(0.05, 0.16, ctx.dials.spacing) * (tall ? 1 : max(ctx.aspect, 1))
        var xs: [Float] = [], ws: [Float] = [], hs: [Float] = []
        var cursor: Float = 0
        for (i, item) in ctx.items.enumerated() {
            // Across a tall frame a card may take most of the width; along a wide
            // one, at most about a third of it.
            let w = tall ? min(h * item.aspect, ctx.aspect * 0.8) : min(h * item.aspect, h * 1.9, ctx.aspect * 0.62)
            let hi = min(h, w / max(item.aspect, 0.05))
            let along = tall ? hi : w
            if i > 0 { cursor += (tall ? hs[i - 1] : ws[i - 1]) / 2 + gap + along / 2 }
            xs.append(cursor)
            ws.append(w)
            hs.append(hi)
        }
        let pitch = xs.count > 1 ? (xs.last! - xs.first!) / Float(xs.count - 1) : h
        return Strip(x: xs, width: ws, heights: hs, height: h, pitch: max(pitch, 0.05), tall: tall)
    }

    /// Featured items; with none featured, every item up to eight, and beyond
    /// that six evenly spaced ones from the first to the last, so a big set
    /// still reads as a title sequence rather than a slideshow.
    func cues(_ ctx: SceneContext) -> [Int] {
        let n = ctx.items.count
        let featured = ctx.items.indices.filter { ctx.items[$0].featured }
        if !featured.isEmpty { return featured }
        if n <= 8 { return Array(0..<n) }
        return (0..<6).map { Int(Double($0) / 5 * Double(n - 1) + 0.5) }
    }

    // MARK: Timeline

    enum Phase {
        /// The strip travels from `from` to `to` (strip positions).
        case travel(from: Float, to: Float)
        /// A highlight grows, holds and returns.
        case spotlight(item: Int)
        /// The finale grows as the others are flung aside, holds, then rises out.
        case finale(item: Int)
        /// The empty stage before the loop begins again.
        case rest
    }

    struct Beat {
        var phase: Phase
        var start: Double
        var duration: Double
    }

    struct Timing {
        var grow = 0.34, hold = 0.62, back = 0.30
        var finaleGrow = 0.5, finaleHold = 0.9, exit = 0.85
        var rest = 0.4
    }

    func timing(_ ctx: SceneContext) -> (Timing, Double) {
        (Timing(), GalleryKit.paceScale(ctx.dials.pace) * 1.6)
    }

    func beats(_ ctx: SceneContext) -> [Beat] {
        let n = ctx.items.count
        guard n > 0 else { return [] }
        let s = strip(ctx)
        let (tm, k) = timing(ctx)
        let order = cues(ctx)
        var out: [Beat] = []
        var t = 0.0
        func add(_ p: Phase, _ d: Double) {
            out.append(Beat(phase: p, start: t, duration: d))
            t += d
        }
        // The atelier's legs, but never faster on average than about a frame
        // a second along the strip, so long runs between far-apart highlights still glide.
        let frameSpan = Double(Self.halfSpan(ctx) * 2)
        func travelTime(_ d: Float) -> Double {
            let legs = max(0.42, 0.52 + 0.15 * Double(abs(d) / s.pitch)) * k
            return max(legs, Double(abs(d)) / (1.1 * max(frameSpan, 1)))
        }
        // Enter from the right (or from below): start with the whole strip beyond that edge.
        let entry = s.x[0] - s.extent(0) / 2 - Self.halfSpan(ctx) - 0.45
        var at = entry
        for (j, c) in order.enumerated() {
            add(.travel(from: at, to: s.x[c]), travelTime(s.x[c] - at))
            at = s.x[c]
            if j < order.count - 1 {
                add(.spotlight(item: c), (tm.grow + tm.hold + tm.back) * k)
            } else {
                add(.finale(item: c), (tm.finaleGrow + tm.finaleHold + tm.exit) * k)
            }
        }
        add(.rest, tm.rest * k)
        return out
    }

    public func loopDuration(_ ctx: SceneContext) -> Double {
        beats(ctx).reduce(0) { $0 + $1.duration }
    }

    /// Strip position under the centre of the frame at time `t`.
    func focus(_ t: Double, _ beats: [Beat]) -> Float {
        var last: Float = 0
        for b in beats {
            if case let .travel(from, to) = b.phase {
                if t < b.start { return from }
                if t <= b.start + b.duration {
                    let u = Ease.smoother(Float((t - b.start) / b.duration))
                    return from + (to - from) * u
                }
                last = to
            }
        }
        return last
    }

    // MARK: Frame

    public func frame(at time: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let all = beats(ctx)
        let loop = all.reduce(0) { $0 + $1.duration }
        let t = wrap(time, loop)
        let s = strip(ctx)
        let (tm, k) = timing(ctx)
        let F = focus(t, all)
        let tall = s.tall
        // Strip velocity for the lean, in frames per second along the strip.
        let dt = 1.0 / 120
        let v = (focus(t + dt, all) - focus(t - dt, all)) / Float(2 * dt) / max(Self.halfSpan(ctx) * 2, 0.5)

        // Emphasis of a highlight or the finale, and the finale's fling and exit.
        var emphasis = [Float](repeating: 0, count: n)
        var fling: Float = 0, exit: Float = 0
        var finaleItem = -1
        if let b = all.first(where: { t >= $0.start && t < $0.start + $0.duration }) {
            let u = (t - b.start) / k
            switch b.phase {
            case let .spotlight(item):
                let e: Double
                if u < tm.grow { e = u / tm.grow } else if u < tm.grow + tm.hold { e = 1 } else { e = 1 - (u - tm.grow - tm.hold) / tm.back }
                emphasis[item] = Ease.smoother(Float(e))
            case let .finale(item):
                finaleItem = item
                emphasis[item] = Ease.smoother(Float(u / tm.finaleGrow))
                fling = Ease.smoother(Float(u / tm.finaleGrow))
                // The finale rises away unhurried: a long, gently eased lift, not a snatch.
                exit = Ease.smoother(Float((u - tm.finaleGrow - tm.finaleHold) / tm.exit))
            case .travel, .rest:
                break
            }
            if case .rest = b.phase { finaleItem = -2 }
        }

        let lean = ctx.dials.life
        for i in 0..<n {
            let item = ctx.items[i]
            // After the finale has risen out, the stage stays empty until the loop turns.
            if finaleItem == -2 { break }
            // Along the strip (x) and across it (y), mapped to the screen at the end.
            var x = s.x[i] - F
            var y: Float = tall ? 0 : 0.02
            // Hand-placed feel: small per-item lanes that a highlight straightens out.
            let laneY = (Hash.unit(i, 71) - 0.5) * 0.055 * s.height * 2 * lean * (tall ? 0.6 : 1)
            let laneRoll = (Hash.unit(i, 73) - 0.5) * GalleryKit.deg(3.6) * lean
            var e: Float = 0
            var scale: Float = 1
            var dim: Float = 1
            var layer: Float = 0
            // Neighbours yield around a highlight.
            for c in 0..<n where emphasis[c] > 0 && c != i && finaleItem < 0 {
                let d = Float(i - c)
                x += (d > 0 ? 1 : -1) * 0.075 * (tall ? 1 : max(ctx.aspect, 1)) * emphasis[c] / max(1, abs(d))
                dim = min(dim, 1 - 0.3 * emphasis[c])
            }
            if emphasis[i] > 0 {
                e = emphasis[i]
                // Grow, but never past the edges of the frame.
                let most = min(i == finaleItem ? 1.62 : 1.38, ctx.aspect * 0.94 / s.width[i], 0.9 / s.heights[i])
                scale = 1 + (max(most, 1) - 1) * e
                layer = 1
            }
            var rise: Float = 0
            if finaleItem >= 0 {
                if i == finaleItem {
                    x *= 1 - fling
                    rise = exit * (0.5 + s.heights[i] * scale / 2 + 0.3)
                } else {
                    // Each side slides away as one block, like curtains parting, far
                    // enough to clear the frame and its shadows.
                    let side: Float = i < finaleItem ? -1 : 1
                    let clear = Self.halfSpan(ctx) + (tall ? (s.heights.max() ?? 0) : (s.width.max() ?? 0)) + 0.45
                    x += side * clear * fling
                    dim = 1 - 0.3 * fling
                }
            }
            y += laneY * (1 - e)
            let roll = laneRoll * (1 - e)
            // Lean into the travel: turned across a wide frame, tipped back up a tall one.
            let leanAngle = -max(-1, min(1, v * 1.6)) * GalleryKit.deg(7) * lean * (1 - e)
            let size = SIMD2(s.width[i], s.heights[i]) * scale
            // A tall strip runs up the screen: along becomes down, across becomes sideways.
            let center = tall ? SIMD3(y, -x + rise, 0.08 * e) : SIMD3(x, y + rise, 0.08 * e)
            let rotation = tall ? SIMD3(leanAngle, 0, roll) : SIMD3(0, leanAngle, roll)
            var c = GalleryKit.card(item, center: center, size: size, rotation: rotation)
            c.color = SIMD4(dim, dim, dim, 1)
            c.layer = layer
            c.corner = 0.02
            c.shadow = 0.8 + 0.4 * e
            f.cards.append(c)
        }
        f.groundZ = -0.1
        f.shadowsOnCards = false
        return f
    }

    // MARK: Sound

    /// A passage for each run of the strip, a landing as each highlight settles,
    /// and the finale's rise.
    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        let (tm, k) = timing(ctx)
        var out: [SoundEvent] = []
        for b in beats(ctx) {
            switch b.phase {
            case .travel:
                out.append(SoundEvent(time: b.start + b.duration * 0.15, cue: .passage, intensity: 0.5, pan: 0.3))
            case .spotlight:
                out.append(SoundEvent(time: b.start + tm.grow * k * 0.8, cue: .contact, intensity: 0.5))
            case .finale:
                out.append(SoundEvent(time: b.start + tm.finaleGrow * k * 0.6, cue: .settle, intensity: 0.8))
                out.append(SoundEvent(time: b.start + (tm.finaleGrow + tm.finaleHold) * k, cue: .air, intensity: 0.6))
            case .rest:
                break
            }
        }
        return out
    }
}
