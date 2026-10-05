import Foundation
import RenderCore
import simd

/// Unwoven (carousel research §1.1 and §6 #3): cards travel up a tall frame
/// (across a wide one). Near an edge each card comes apart into threads that
/// comb out along the travel at their own speeds, drift from their rows and
/// flutter; inside the frame they weave back into a whole, sharp card.
///
/// Each card is cut into bands along the travel, and each band into a few
/// segments whose ends follow the tear field, so a loosening thread stretches
/// rather than breaks. A card with no tear at either end is drawn whole.
/// Every time term is a whole number of cycles per loop, so the loop closes.
public struct LoomScene: StageScene {
    public let id: String
    public let name: String
    public let summary: String
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.spacing, "Spacing"), (.life, "Unravel")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.5, spacing: 0.35, life: 0.55)

    public init(id: String = "loom", name: String = "Loom",
                summary: String = "Cards weave together from threads as they rise, and come apart into threads at the top.") {
        self.id = id
        self.name = name
        self.summary = summary
    }

    /// Threads per card, and segments per thread.
    static let bands = 22
    static let segments = 3

    struct Layout {
        var vertical: Bool
        var extents: [Float]   // along the travel
        var crosses: [Float]   // across it
        var gap: Float
        var track: Float       // one pass of the set
        var repeats: Int
        var span: Float        // the frame along the travel
        var zone: Float        // how far in from each edge cards come apart
        var thread: Float      // reference length for how far threads run
    }

    func layout(_ ctx: SceneContext) -> Layout {
        let vertical = ctx.aspect < 0.9
        let k = mix(0.82, 1.14, ctx.dials.size)
        var extents: [Float] = [], crosses: [Float] = []
        for item in ctx.items {
            // Small enough that a card sits whole inside the intact middle of the frame.
            let s = vertical ? GalleryKit.fit(item.aspect, maxW: ctx.aspect * 0.8 * k, maxH: 0.36 * k)
                             : GalleryKit.fit(item.aspect, maxW: ctx.aspect * 0.4 * k, maxH: 0.56 * k)
            extents.append(vertical ? s.y : s.x)
            crosses.append(vertical ? s.x : s.y)
        }
        let mean = extents.reduce(0, +) / Float(max(extents.count, 1))
        let gap = mean * mix(0.06, 0.4, ctx.dials.spacing)
        let track = extents.reduce(0) { $0 + $1 + gap }
        let span: Float = vertical ? 1 : ctx.aspect
        let maxExt = extents.max() ?? mean
        // Threads run up to about one card beyond the frame, so the set wraps out of sight.
        let repeats = max(1, Int(ceil((span + 2 * maxExt + 2.6 * mean) / max(track, 0.001))))
        let zone = min(0.27 * span, 0.9 * mean)
        return Layout(vertical: vertical, extents: extents, crosses: crosses, gap: gap, track: track, repeats: repeats,
                      span: span, zone: zone, thread: mean)
    }

    public func loopDuration(_ ctx: SceneContext) -> Double {
        guard !ctx.items.isEmpty else { return 4 }
        let l = layout(ctx)
        let mean = l.track / Float(max(ctx.items.count, 1))
        let speed = Double(mean) / (1.7 * GalleryKit.paceScale(ctx.dials.pace))
        return Double(l.track) * Double(l.repeats) / max(speed, 0.001)
    }

    /// How far a point at `a` along the travel has come apart, 0 (woven) … 1 (loose).
    func tear(_ a: Float, _ l: Layout) -> Float {
        let half = l.span / 2
        let low = 1 - Ease.smooth((a + half) / l.zone)
        let high = Ease.smooth((a - (half - l.zone)) / l.zone)
        return max(low, high)
    }

    /// A whole number of cycles per loop, as near to `perSecond` as it rounds.
    static func harmonic(_ perSecond: Float, loop: Double) -> Float {
        let cycles = max(1, (Double(perSecond) * loop / (2 * .pi)).rounded())
        return Float(2 * .pi * cycles / loop)
    }

    /// Centres of every card occurrence along the travel at time t, with its item index.
    func centres(at t: Double, _ l: Layout, loop: Double, count: Int) -> [(item: Int, salt: Int, a: Float)] {
        let extent = l.track * Float(l.repeats)
        let s = Float(wrap(t / loop, 1)) * extent
        var out: [(Int, Int, Float)] = []
        var anchor: Float = 0
        var anchors: [Float] = []
        for e in l.extents {
            anchors.append(anchor + e / 2)
            anchor += e + l.gap
        }
        for r in 0..<l.repeats {
            for i in 0..<count {
                var pos = anchors[i] + Float(r) * l.track - s
                pos = Float(wrap(Double(pos + extent / 2), Double(extent))) - extent / 2
                // Up a tall frame; leftwards across a wide one.
                out.append((i, r * count + i, l.vertical ? -pos : pos))
            }
        }
        return out
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let l = layout(ctx)
        let loop = loopDuration(ctx)
        let runScale = mix(0.55, 1.35, ctx.dials.life)
        let wobble = mix(0.35, 1.4, ctx.dials.life)
        let time = Float(t)
        let B = Self.bands, S = Self.segments
        for (i, salt, c) in centres(at: t, l, loop: loop, count: n) {
            let item = ctx.items[i]
            let ext = l.extents[i], cross = l.crosses[i]
            guard abs(c) < l.span / 2 + ext / 2 + l.thread * 1.6 else { continue }
            let lowEnd = c - ext / 2, highEnd = c + ext / 2
            if tear(lowEnd, l) < 0.0005, tear(highEnd, l) < 0.0005 {
                // Woven: the card itself.
                let size = l.vertical ? SIMD2(cross, ext) : SIMD2(ext, cross)
                var card = GalleryKit.card(item, center: l.vertical ? SIMD3(0, c, 0) : SIMD3(c, 0, 0), size: size)
                card.corner = 0.03
                card.shadow = 0
                f.cards.append(card)
                continue
            }
            for b in 0..<B {
                let rA = Hash.unit(b * 131 + salt * 7919, 11)
                let rB = Hash.unit(b * 37 + salt * 104_729, 23)
                let rC = Hash.unit(b * 53 + salt * 1_299_709, 31)
                let w1 = Self.harmonic(1 + 2 * rB, loop: loop)
                let w2 = Self.harmonic(1.6 + 2.2 * rA, loop: loop)
                let breathe = 0.85 + 0.15 * sinf(w1 * time + 2 * .pi * rA)
                // Where along the travel a point of this thread ends up.
                func moved(_ a: Float) -> (a: Float, t: Float) {
                    let tt = powf(tear(a, l), 1.4)
                    let run = tt * (0.133 + 0.929 * rA) * l.thread * runScale * breathe
                    return (a + (a < 0 ? -1 : 1) * run, tt)
                }
                let across = (Float(b) + 0.5) / Float(B) * cross - cross / 2
                for k in 0..<S {
                    let f0 = Float(k) / Float(S), f1 = Float(k + 1) / Float(S)
                    let a0 = lowEnd + f0 * ext, a1 = lowEnd + f1 * ext
                    let m0 = moved(a0), m1 = moved(a1)
                    let mid = (a0 + a1) / 2
                    let tauMid = tear(mid, l)
                    let tt = powf(tauMid, 1.4)
                    // Threads drift out of their rows, and flutter.
                    var drift = (rA - 0.5) * 0.376 * l.thread * tt * tt
                    drift += sinf(9.04 * mid / l.thread + w2 * time + 2 * .pi * rA) * (0.011 + 0.029 * rA) * l.thread * tt * wobble
                    let centre = (m0.a + m1.a) / 2
                    let length = max(abs(m1.a - m0.a), 0.0005)
                    let width = cross / Float(B)
                    var piece = CardPose(media: item.media, occurrence: item.occurrence,
                                         position: l.vertical ? SIMD3(across + drift, centre, 0.0015 * rA * tt)
                                                              : SIMD3(centre, -across + drift, 0.0015 * rA * tt),
                                         size: l.vertical ? SIMD2(width, length) : SIMD2(length, width))
                    piece.mediaAspect = item.aspect
                    piece.corner = 0.03
                    piece.shadow = 0
                    // The slice of the card this piece carries (v runs down the card).
                    let u0 = Float(b) / Float(B), u1 = Float(b + 1) / Float(B)
                    piece.crop = l.vertical ? SIMD4(u0, 1 - f1, u1, 1 - f0) : SIMD4(f0, u0, f1, u1)
                    let core = mix(0.8, 0.16 + rC * 0.12, Ease.smooth(tauMid / 0.85))
                    let amount = Ease.smooth((tauMid - 0.03) / 0.27)
                    piece.band = SIMD4(core, amount, tauMid * 0.4, tauMid * 0.18)
                    piece.opacity = 1 - Ease.smooth((tauMid - 0.75) / 0.25) * 0.65
                    f.cards.append(piece)
                }
            }
        }
        f.groundZ = -0.2
        f.shadowsOnCards = false
        return f
    }

    /// A breath of cloth as each card finishes weaving, a softer one as it starts to come apart.
    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        let n = ctx.items.count
        guard n > 0 else { return [] }
        let l = layout(ctx)
        let loop = loopDuration(ctx)
        let extent = l.track * Float(l.repeats)
        let speed = Double(extent) / loop
        var out: [SoundEvent] = []
        for (i, _, c0) in centres(at: 0, l, loop: loop, count: n) {
            let ext = l.extents[i]
            let woven = -l.span / 2 + l.zone + ext / 2     // trailing end leaves the zone it entered by
            let loosening = l.span / 2 - l.zone - ext / 2  // leading end reaches the zone it leaves by
            // Measured along the way the cards travel: up a tall frame, leftwards across a wide one.
            let p0 = l.vertical ? c0 : -c0
            let pan: Float = 0
            out.append(SoundEvent(time: wrap(Double(woven - p0) / speed, Double(extent) / speed), cue: .air, intensity: 0.34, pan: pan))
            out.append(SoundEvent(time: wrap(Double(loosening - p0) / speed, Double(extent) / speed), cue: .passage, intensity: 0.22, pan: pan))
        }
        return out
    }
}
