import Foundation
import RenderCore
import simd

/// Editorial strip with focus pulls (carousel research §1.1, §2.1 and §6 #11,
/// after Josh Puckett's carousel study): the works sit on one strip in a few
/// display sizes, sharing an edge (a column down a tall frame, a baseline
/// across a wide one). The strip glides to a work, then the whole strip
/// scales around it until it fills the frame, its neighbours left as slivers
/// at the edges in their order; it holds, eases back to the overview and
/// glides on. Context first, then detail, never a cut.
public struct FocusScene: StageScene {
    public let id: String
    public let name: String
    public let summary: String
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.spacing, "Spacing"), (.depth, "Zoom")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.5, spacing: 0.35, depth: 0.6)

    public init(id: String = "focus", name: String = "Focus",
                summary: String = "A strip of the works glides along, then zooms in on one at a time and back out.") {
        self.id = id
        self.name = name
        self.summary = summary
    }

    func beats(_ ctx: SceneContext) -> (glide: Double, zoom: Double, hold: Double) {
        let k = GalleryKit.paceScale(ctx.dials.pace)
        return (1.1 * k, 0.75 * k, 1.5 * k)
    }

    public func loopDuration(_ ctx: SceneContext) -> Double {
        let b = beats(ctx)
        return Double(max(ctx.items.count, 1)) * (b.glide + 2 * b.zoom + b.hold)
    }

    struct Strip {
        var tall: Bool
        var sizes: [SIMD2<Float>]
        var centres: [Float]   // along the strip, from its start
        var length: Float      // one pass of the set, gaps included
        var gap: Float
    }

    /// The overview strip: three display sizes on a grid, seeded per work.
    func strip(_ ctx: SceneContext) -> Strip {
        let tall = ctx.aspect < 0.9
        let k = mix(0.82, 1.15, ctx.dials.size)
        let steps: [Float] = [0.6, 0.8, 1.0]
        var sizes: [SIMD2<Float>] = []
        for (i, item) in ctx.items.enumerated() {
            let pick = steps[Int(Hash.unit(i, 71) * 2.999)]
            if tall {
                let w = ctx.aspect * 0.5 * k * pick
                sizes.append(GalleryKit.fit(item.aspect, maxW: w, maxH: w * 1.5))
            } else {
                let h = 0.36 * k * pick
                sizes.append(GalleryKit.fit(item.aspect, maxW: h * 2.2, maxH: h))
            }
        }
        let unit = (tall ? ctx.aspect * 0.5 : 0.36) * k
        let gap = unit * mix(0.06, 0.24, ctx.dials.spacing)
        var centres: [Float] = []
        var at: Float = 0
        for s in sizes {
            let len = tall ? s.y : s.x
            centres.append(at + len / 2)
            at += len + gap
        }
        return Strip(tall: tall, sizes: sizes, centres: centres, length: at, gap: gap)
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let s = strip(ctx)
        let b = beats(ctx)
        let cycle = b.glide + 2 * b.zoom + b.hold
        let local = wrap(t, loopDuration(ctx))
        let k = min(Int(local / cycle), n - 1)
        let u = local - Double(k) * cycle
        // Where the strip is centred (in strip units), and how far it is zoomed.
        let prev = k == 0 ? s.centres[n - 1] - s.length : s.centres[k - 1]
        let glide = Ease.place(Float(u / b.glide))
        let focusAt = prev + (s.centres[k] - prev) * glide
        var zoom: Float = 0
        if u > b.glide {
            let v = u - b.glide
            if v < b.zoom { zoom = Ease.place(Float(v / b.zoom)) }
            else if v < b.zoom + b.hold { zoom = 1 }
            else { zoom = 1 - Ease.place(Float((v - b.zoom - b.hold) / b.zoom)) }
        }
        // The scale that makes the focused work fill the frame, its neighbours slivers.
        let target = s.sizes[k]
        let fill = s.tall ? min(ctx.aspect * 0.88 / target.x, 0.8 / target.y) : min(ctx.aspect * 0.8 / target.x, 0.88 / target.y)
        let strength = mix(0.55, 1, ctx.dials.depth)
        let scale = 1 + (max(fill, 1) - 1) * zoom * strength
        // Draw the strip and as many copies either side as it takes to fill the
        // frame and its margin, so a short set never leaves a gap at the wrap.
        let frameHalf: Float = s.tall ? 0.5 : ctx.aspect / 2
        let longest = s.sizes.map { s.tall ? $0.y : $0.x }.max() ?? 0
        let reps = Int(ceil((frameHalf + 0.25 + 0.85 * longest) / max(s.length, 0.001))) + 1
        for r in -reps...reps {
            for (i, item) in ctx.items.enumerated() {
                let along = (s.centres[i] + Float(r) * s.length - focusAt) * scale
                let size = s.sizes[i] * scale
                let len = s.tall ? size.y : size.x
                // Kept until its shadow, which grows with the zoom, has left the frame too.
                guard abs(along) < frameHalf + len / 2 + 0.25 + 0.35 * len else { continue }
                // The strip runs down a tall frame (so gliding to the next work moves
                // it up) and along a shared baseline across a wide one, where the
                // focused work also rises to the middle as the strip scales around it.
                let centre: SIMD3<Float>
                if s.tall {
                    centre = SIMD3(0, -along, 0)
                } else {
                    let base: Float = -0.2
                    let yi = base + s.sizes[i].y / 2, yk = base + target.y / 2
                    centre = SIMD3(along, (yi - yk) * scale + yk * (1 - zoom), 0)
                }
                var c = GalleryKit.card(item, center: centre, size: size)
                c.corner = 0.012
                c.shadow = 0.5
                f.cards.append(c)
            }
        }
        f.groundZ = -0.08
        f.shadowsOnCards = false
        return f
    }

    /// A slide along as the strip glides, air as it zooms in.
    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        let n = ctx.items.count
        guard n > 0 else { return [] }
        let b = beats(ctx)
        let cycle = b.glide + 2 * b.zoom + b.hold
        return (0..<n).flatMap { k -> [SoundEvent] in
            let at = Double(k) * cycle
            return [SoundEvent(time: at + b.glide * 0.15, cue: .passage, intensity: 0.22),
                    SoundEvent(time: at + b.glide + b.zoom * 0.2, cue: .air, intensity: 0.28)]
        }
    }
}
