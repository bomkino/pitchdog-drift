import Foundation
import RenderCore
import simd

/// Reads each slide. Made for wide decks (2576 × 1080) in a tall frame, where a
/// slide fitted to the width is too small to read: here each slide is shown
/// tall enough to read, its left edge at the frame's margin, and the camera
/// travels along it to its right edge; then the column rises and the next
/// slide arrives, already at its start. The neighbours above and below stay in
/// view, dimmed, so the deck still reads as a sequence. Slides that fit the
/// frame simply hold. Travel time follows each slide's width, so a wider slide
/// is read for longer, at the same pace.
public struct ScanScene: StageScene {
    public let id: String
    public let name: String
    public let summary: String
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.spacing, "Gap"), (.life, "Neighbours")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.35, spacing: 0.35, life: 0.5)

    public init(id: String = "scan", name: String = "Scan",
                summary: String = "Each slide large enough to read, the camera travelling along it, then on to the next.") {
        self.id = id
        self.name = name
        self.summary = summary
    }

    struct Layout {
        var sizes: [SIMD2<Float>]
        var travel: [Float]        // how far the camera travels along each slide, 0 when it fits
        var offsets: [Float]       // each slide's centre down the column
        var column: Float          // the column's length, so it repeats seamlessly
        var gap: Float
        var starts: [Double]       // when each slide's segment begins
        var reads: [Double]        // how long the camera travels along each slide
        var loop: Double
        var arrive: Double
        var settle: Double
    }

    func layout(_ ctx: SceneContext) -> Layout {
        let tall = ctx.aspect < 0.9
        let h: Float = tall ? mix(0.3, 0.5, ctx.dials.size) : mix(0.6, 0.86, ctx.dials.size)
        let room = ctx.aspect * 0.92
        let sizes = ctx.items.map { item -> SIMD2<Float> in
            let a = max(item.aspect, 0.1)
            // Wide slides are shown at reading height and travelled along;
            // those that fit at that height are shown as large as the frame allows.
            if h * a > room { return SIMD2(h * a, h) }
            return GalleryKit.fit(a, maxW: room, maxH: tall ? mix(0.42, 0.62, ctx.dials.size) : h)
        }
        let travel = sizes.map { max(0, $0.x - room) }
        let gap = h * mix(0.12, 0.6, ctx.dials.spacing)
        var offsets: [Float] = []
        var at: Float = 0
        for (i, s) in sizes.enumerated() {
            if i > 0 { at += (sizes[i - 1].y + s.y) / 2 + gap }
            offsets.append(at)
        }
        let column = at + ((sizes.last?.y ?? h) + (sizes.first?.y ?? h)) / 2 + gap
        let k = GalleryKit.paceScale(ctx.dials.pace)
        let arrive = 0.95 * k, settle = 0.4 * k, rest = 0.55 * k
        // Reading speed in frame heights per second.
        let speed = 0.2 / k
        var starts: [Double] = []
        var reads: [Double] = []
        var time = 0.0
        for p in travel {
            starts.append(time)
            let read = p > 0.001 ? max(Double(p) / speed, 0.6 * k) : 0.9 * k
            reads.append(read)
            time += arrive + settle + read + rest
        }
        return Layout(sizes: sizes, travel: travel, offsets: offsets, column: column, gap: gap,
                      starts: starts, reads: reads, loop: max(time, 0.1), arrive: arrive, settle: settle)
    }

    public func loopDuration(_ ctx: SceneContext) -> Double {
        ctx.items.isEmpty ? 4 : layout(ctx).loop
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let l = layout(ctx)
        let u = wrap(t, l.loop)
        // The slide being read, and how far into its segment.
        var k = 0
        while k + 1 < n, u >= l.starts[k + 1] { k += 1 }
        let within = u - l.starts[k]
        func position(_ j: Int) -> Float {
            let laps = Int(floor(Double(j) / Double(n)))
            return l.offsets[((j % n) + n) % n] + Float(laps) * l.column
        }
        // The column rises from the previous slide to this one, then rests.
        let rise = Ease.place(Float(min(within / l.arrive, 1)))
        let camera = mix(position(k - 1), position(k), rise)
        // How far along slide k the camera is: 0 shows its left edge, 1 its right.
        let read = Self.glide(Float((within - l.arrive - l.settle) / max(l.reads[k], 1e-3)))
        let neighbours = mix(0.25, 0.75, ctx.dials.life)
        // The height the brightness falls off over follows the column as it rises,
        // so it never changes in a single frame between slides of different heights.
        let current = mix(l.sizes[((k - 1) % n + n) % n].y, l.sizes[k].y, rise)
        for j in (k - 3)...(k + 3) {
            let i = ((j % n) + n) % n
            let size = l.sizes[i]
            let y = camera - position(j)
            guard abs(y) - size.y / 2 < 0.62 else { continue }
            // Slides already read wait at their end, slides to come at their start.
            let along: Float = j < k ? 1 : (j > k ? 0 : read)
            let x = l.travel[i] / 2 * (1 - 2 * along)
            var card = GalleryKit.card(ctx.items[i], center: SIMD3(x, y, 0), size: size)
            card.corner = 0.012
            card.shadow = 0.55
            // The slide being read is bright; the others fall back.
            let near = min(abs(y) / ((size.y + current) / 2 + l.gap), 1)
            let light = 1 - (1 - neighbours) * near
            card.color = SIMD4(light, light, light, 1)
            f.cards.append(card)
        }
        f.groundZ = -0.06
        f.fixedGround = true
        f.shadowsOnCards = false
        return f
    }

    /// Eases in and out of the read, without the hard stops of a step.
    static func glide(_ x: Float) -> Float {
        let t = min(max(x, 0), 1)
        return t * t * (3 - 2 * t)
    }

    /// A passage as each slide arrives, and a soft landing as it settles.
    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        guard !ctx.items.isEmpty else { return [] }
        let l = layout(ctx)
        return l.starts.flatMap { s in
            [SoundEvent(time: s + 0.05, cue: .passage, intensity: 0.3),
             SoundEvent(time: s + l.arrive * 0.9, cue: .contact, intensity: 0.22)]
        }
    }
}
