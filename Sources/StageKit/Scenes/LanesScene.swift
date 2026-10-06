import Foundation
import RenderCore
import simd

/// Three-lane wave wall (carousel research §1.1 and §6 #4): three lanes of
/// cards travel up a tall frame (across a wide one) at speeds in the ratio
/// 3 : 2 : 1, each riding its own gentle wave. Every card rides the wave
/// whole, tilting with it, so the work stays intact; the lanes differ in
/// frequency and strength, so they read as one coordinated gesture rather
/// than three copies, opening apart towards the ends of the frame.
public struct LanesScene: StageScene {
    public let id: String
    public let name: String
    public let summary: String
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.spacing, "Spacing"), (.life, "Wave")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.5, spacing: 0.35, life: 0.5)

    public init(id: String = "lanes", name: String = "Lanes",
                summary: String = "Three lanes rise at different speeds, each riding its own slow wave.") {
        self.id = id
        self.name = name
        self.summary = summary
    }

    /// Loops per lane, fastest first: whole numbers, so the wall closes.
    static let laps: [Float] = [3, 2, 1]
    static let frequencies: [Float] = [0.9, 1.0, 1.1]
    static let strengths: [Float] = [0.5, 0.4, 0.3]

    struct Layout {
        var vertical: Bool
        var span: Float          // the frame along the lanes
        var crossSpan: Float     // the frame across them
        var width: Float         // card size across the lane
        var lengths: [Float]     // card sizes along it
        var gap: Float
        var track: Float         // one pass of the set
        var repeats: Int
        var pitch: Float         // lane spacing
    }

    func layout(_ ctx: SceneContext) -> Layout {
        let vertical = ctx.aspect < 0.9
        let span: Float = vertical ? 1 : ctx.aspect
        let crossSpan: Float = vertical ? ctx.aspect : 1
        // Three lanes with air between them; the outer ones run slightly past the
        // frame's sides, so the wall reads as larger than the frame.
        // Slides thinner along the lanes than 16:9 (a wide deck rising up a tall
        // frame) get somewhat wider lanes; not much, since the outer lanes move
        // out with them and must stay mostly in the frame.
        let meanAspect = ctx.items.isEmpty ? 16 / 9 : ctx.items.reduce(Float(0)) { $0 + max($1.aspect, 0.05) } / Float(ctx.items.count)
        let grow = vertical ? min(max((meanAspect / (16 / 9)).squareRoot(), 1), 1.1) : 1
        let width = crossSpan * 0.31 * mix(0.82, 1.18, ctx.dials.size) * grow
        let lengths = ctx.items.map { item -> Float in
            let len = vertical ? width / max(item.aspect, 0.05) : width * item.aspect
            return min(len, width * 1.8)
        }
        let mean = lengths.reduce(0, +) / Float(max(lengths.count, 1))
        let gap = mean * mix(0.1, 0.5, ctx.dials.spacing)
        let track = lengths.reduce(0) { $0 + $1 + gap }
        let maxLen = lengths.max() ?? mean
        let repeats = max(1, Int(ceil((span + 2 * maxLen + 0.3) / max(track, 0.001))))
        return Layout(vertical: vertical, span: span, crossSpan: crossSpan, width: width, lengths: lengths, gap: gap,
                      track: track, repeats: repeats, pitch: width * 1.07)
    }

    public func loopDuration(_ ctx: SceneContext) -> Double {
        guard !ctx.items.isEmpty else { return 4 }
        let l = layout(ctx)
        // The slowest lane makes one lap per loop, at a speed relative to the frame;
        // a higher Pace is quicker.
        let slow = Double(mix(0.058, 0.138, ctx.dials.pace) * l.span)
        return Double(l.track * Float(l.repeats)) / slow
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let l = layout(ctx)
        let loop = loopDuration(ctx)
        let phase = Float(wrap(t / loop, 1))
        let extent = l.track * Float(l.repeats)
        var anchors: [Float] = []
        var anchor: Float = 0
        for len in l.lengths {
            anchors.append(anchor + len / 2)
            anchor += len + l.gap
        }
        // Wave frequency across the frame, and how far it bows.
        let baseF = 4.4 / l.span
        let baseA = l.width * mix(0.1, 0.42, ctx.dials.life)
        for lane in 0..<3 {
            let laps = Self.laps[lane]
            let freq = baseF * Self.frequencies[lane]
            let amp = baseA * Self.strengths[lane]
            let crossCentre = (Float(lane) - 1) * l.pitch
            // Each lane starts at its own place in the set, so neighbours differ.
            let offset = Float(lane) * l.track / 3 + Float(lane) * 0.37 * l.gap
            let travel = phase * laps * extent
            for r in 0..<l.repeats {
                for i in 0..<n {
                    var pos = anchors[i] + Float(r) * l.track + offset - travel
                    pos = Float(wrap(Double(pos + extent / 2), Double(extent))) - extent / 2
                    let len = l.lengths[i]
                    guard abs(pos) < l.span / 2 + len + 0.2 else { continue }
                    // Up a tall frame, leftwards across a wide one.
                    let a = l.vertical ? -pos : pos
                    let bow = amp * (cosf(freq * a) - 1)
                    let slope = -amp * freq * sinf(freq * a)
                    let size = l.vertical ? SIMD2(l.width, len) : SIMD2(len, l.width)
                    let centre: SIMD3<Float> = l.vertical
                        ? SIMD3(crossCentre + bow, a, 0.001 * Float(lane))
                        : SIMD3(a, -crossCentre + bow, 0.001 * Float(lane))
                    let tilt = l.vertical ? -atanf(slope) : atanf(slope)
                    var c = GalleryKit.card(ctx.items[i], center: centre, size: size, rotation: SIMD3(0, 0, tilt))
                    c.corner = 0.03
                    c.shadow = 0.7
                    f.cards.append(c)
                }
            }
        }
        f.groundZ = -0.16
        // The ground stays put, so a long card coming into the list off screen
        // never moves every shadow at once.
        f.fixedGround = true
        f.shadowsOnCards = false
        return f
    }

    /// A soft passage as each card of the middle lane crosses the centre of the frame.
    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        let n = ctx.items.count
        guard n > 0 else { return [] }
        let l = layout(ctx)
        let loop = loopDuration(ctx)
        let extent = l.track * Float(l.repeats)
        var anchor: Float = 0
        var out: [SoundEvent] = []
        let laps = Self.laps[1]
        let offset = l.track / 3 + 0.37 * l.gap
        for r in 0..<l.repeats {
            for len in l.lengths {
                let centre = anchor + len / 2 + Float(r) * l.track + offset
                // pos(t) = centre − t/loop·laps·extent crosses 0 laps times per loop.
                for k in 0..<Int(laps) {
                    let u = Double(wrap(Double(centre) / Double(extent), 1) + Double(k)) / Double(laps)
                    out.append(SoundEvent(time: u * loop, cue: .passage, intensity: 0.26))
                }
                anchor += len + l.gap
            }
            anchor = 0
        }
        return out
    }
}
