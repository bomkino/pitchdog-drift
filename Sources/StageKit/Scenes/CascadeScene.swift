import Foundation
import RenderCore
import simd

/// Progressive turn cascade (carousel research §1.1 and §6 #10): cards travel
/// up a tall frame (across a wide one). Each one arrives turned away from the
/// camera and peels flat progressively, from its leading edge to its trailing
/// one, with the donor's quintic ease; it is whole and flat through the middle
/// of the frame, then turns away the same way as it leaves.
///
/// A card is drawn as a chain of strips hinged edge to edge, so the turn bends
/// the surface rather than tearing it; turned strips darken as they face away.
public struct CascadeScene: StageScene {
    public let id: String
    public let name: String
    public let summary: String
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.spacing, "Spacing"), (.life, "Turn")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.5, spacing: 0.4, life: 0.5)

    public init(id: String = "cascade", name: String = "Cascade",
                summary: String = "Each card arrives turned away and peels flat, edge to edge, as it rises.") {
        self.id = id
        self.name = name
        self.summary = summary
    }

    /// Strips per card along the turn.
    static let strips = 18

    struct Layout {
        var vertical: Bool
        var lengths: [Float]   // along the travel
        var cross: Float
        var gap: Float
        var track: Float
        var repeats: Int
        var span: Float
        var zone: Float        // how far in from each edge a card turns
    }

    func layout(_ ctx: SceneContext) -> Layout {
        let vertical = ctx.aspect < 0.9
        let crossSpan: Float = vertical ? ctx.aspect : 1
        let cross = crossSpan * (vertical ? 0.76 : 0.6) * mix(0.82, 1.14, ctx.dials.size)
        let lengths = ctx.items.map { item -> Float in
            min(vertical ? cross / max(item.aspect, 0.05) : cross * item.aspect, cross * 1.6)
        }
        let mean = lengths.reduce(0, +) / Float(max(lengths.count, 1))
        let gap = mean * mix(0.06, 0.4, ctx.dials.spacing)
        let track = lengths.reduce(0) { $0 + $1 + gap }
        let span: Float = vertical ? 1 : ctx.aspect
        let maxLen = lengths.max() ?? mean
        let repeats = max(1, Int(ceil((span + 2 * maxLen + 0.2) / max(track, 0.001))))
        return Layout(vertical: vertical, lengths: lengths, cross: cross, gap: gap, track: track, repeats: repeats,
                      span: span, zone: min(0.3 * span, max(0.2, 0.9 * mean)))
    }

    public func loopDuration(_ ctx: SceneContext) -> Double {
        guard !ctx.items.isEmpty else { return 4 }
        let l = layout(ctx)
        let mean = l.track / Float(max(ctx.items.count, 1))
        let speed = Double(mean) / (2.1 * GalleryKit.paceScale(ctx.dials.pace))
        return Double(l.track) * Double(l.repeats) / max(speed, 0.001)
    }

    /// How far in from the edge of the frame a card of this length settles.
    static func zone(_ l: Layout, _ len: Float) -> Float {
        min(l.zone, max(0.02, l.span / 2 - len / 2))
    }

    static func quintic(_ x: Float) -> Float {
        let t = min(max(x, 0), 1)
        return t < 0.5 ? 16 * t * t * t * t * t : 1 - powf(-2 * t + 2, 5) / 2
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let l = layout(ctx)
        let extent = l.track * Float(l.repeats)
        let s = Float(wrap(t / loopDuration(ctx), 1)) * extent
        let alphaMax = GalleryKit.deg(mix(38, 78, ctx.dials.life))
        let spread: Float = 0.7
        let half = l.span / 2
        var anchors: [Float] = []
        var anchor: Float = 0
        for len in l.lengths {
            anchors.append(anchor + len / 2)
            anchor += len + l.gap
        }
        let M = Self.strips
        for r in 0..<l.repeats {
            for (i, item) in ctx.items.enumerated() {
                var pos = anchors[i] + Float(r) * l.track - s
                pos = Float(wrap(Double(pos + extent / 2), Double(extent))) - extent / 2
                let len = l.lengths[i]
                guard abs(pos) < half + len + 0.1 else { continue }
                // Position along the travel: up a tall frame, leftwards across a wide one.
                let a = l.vertical ? -pos : pos
                let lead = l.vertical ? a + len / 2 : a - len / 2      // the edge that goes first
                let trail = l.vertical ? a - len / 2 : a + len / 2
                // Entering: 0 at the near edge of the frame, 1 once settled. Leaving: the reverse.
                // A long card turns over a shorter zone, so it always lies flat before
                // the middle, where the hinge passes from its leading edge to its trailing one.
                let zone = Self.zone(l, len)
                let entry = l.vertical ? (trail + half) / zone : (half - trail) / zone
                let exit = l.vertical ? (half - lead) / zone : (lead + half) / zone
                let entering = entry < exit
                let settled = min(entry, exit)
                let P = min(max(settled, 0), 1)
                if P >= 1 {
                    let size = l.vertical ? SIMD2(l.cross, len) : SIMD2(len, l.cross)
                    var c = GalleryKit.card(item, center: l.vertical ? SIMD3(0, a, 0) : SIMD3(a, 0, 0), size: size)
                    c.corner = 0.025
                    // The shadow gathers once the card is flat, so it never appears at once.
                    c.shadow = 0.85 * Ease.smooth((settled - 1) / 0.5)
                    f.cards.append(c)
                    continue
                }
                // Entering, the leading edge settles first and the chain hangs back from it;
                // leaving, the leading edge turns away first, hinged on the trailing edge.
                let stripLen = len / Float(M)
                var hinge: Float = entering ? lead : trail
                var depth: Float = 0
                for step in 0..<M {
                    // Strip k counted from the hinge end: entering, the leading edge is the
                    // hinge and flattens first; leaving, the trailing edge is, so the
                    // leading edge, farthest from it, turns away first.
                    let k = step
                    let fromHinge = (Float(k) + 0.5) / Float(M)
                    let phi = min(max(P * (1 + spread) - fromHinge * spread, 0), 1)
                    let turn = (1 - Self.quintic(phi)) * alphaMax
                    // Direction from the hinge along the chain, tipping back into depth.
                    let along = (entering ? -1 : 1) * (l.vertical ? 1 : -1) * cosf(turn) * stripLen
                    let back = -sinf(turn) * stripLen
                    let centreA = hinge + along / 2
                    let centreZ = depth + back / 2
                    hinge += along
                    depth += back
                    // Which slice of the card this strip carries (v runs down the card, u across it).
                    let u0 = Float(k) / Float(M), u1 = Float(k + 1) / Float(M)
                    let crop: SIMD4<Float>
                    if l.vertical {
                        // Entering, strip 0 is the top; leaving, strip 0 is the bottom.
                        crop = entering ? SIMD4(0, u0, 1, u1) : SIMD4(0, 1 - u1, 1, 1 - u0)
                    } else {
                        // Moving left the leading edge is the left one.
                        crop = entering ? SIMD4(u0, 0, u1, 1) : SIMD4(1 - u1, 0, 1 - u0, 1)
                    }
                    let tip = (entering ? 1 : -1) * turn
                    let rotation: SIMD3<Float> = l.vertical ? SIMD3(tip, 0, 0) : SIMD3(0, tip, 0)
                    let size = l.vertical ? SIMD2(l.cross, stripLen) : SIMD2(stripLen, l.cross)
                    var piece = CardPose(media: item.media, occurrence: item.occurrence,
                                         position: l.vertical ? SIMD3(0, centreA, centreZ) : SIMD3(centreA, 0, centreZ),
                                         rotation: rotation, size: size)
                    piece.mediaAspect = item.aspect
                    piece.corner = 0.025
                    piece.crop = crop
                    piece.shadow = 0
                    // Turned parts face away from the light.
                    let shade = 1 - 0.35 * sinf(turn)
                    piece.color = SIMD4(shade, shade, shade, 1)
                    f.cards.append(piece)
                }
            }
        }
        f.groundZ = -0.3
        f.shadowsOnCards = false
        return f
    }

    /// A soft landing as each card settles flat.
    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        let n = ctx.items.count
        guard n > 0 else { return [] }
        let l = layout(ctx)
        let loop = loopDuration(ctx)
        let extent = l.track * Float(l.repeats)
        let speed = Double(extent) / loop
        var out: [SoundEvent] = []
        var anchor: Float = 0
        for r in 0..<l.repeats {
            anchor = Float(r) * l.track
            for len in l.lengths {
                let centre = anchor + len / 2
                // Settled once the trailing edge is a zone in from the entering edge.
                let settleA = -l.span / 2 + Self.zone(l, len) + len / 2
                // a(t) = s(t) − centre (wrapped), s rising at `speed`.
                let time = wrap(Double(settleA + centre) / speed, loop)
                out.append(SoundEvent(time: time, cue: .contact, intensity: 0.28))
                anchor += len + l.gap
            }
        }
        return out
    }
}
