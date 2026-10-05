import Foundation
import RenderCore
import simd

/// Vortex field with a central anchor (carousel research §1.4 and §6 #7):
/// one work holds the centre, whole and sharp, while rings of the others
/// orbit around it at different heights, speeds and directions, peripheral
/// abundance around one clear subject. Cards passing in front go soft and
/// translucent so the centre stays readable; the far side sinks into fog.
/// The centre turns over to the next work on a beat. Ring speeds are whole
/// numbers of turns per loop, so the field closes with the loop.
public struct VortexScene: StageScene {
    public let id: String
    public let name: String
    public let summary: String
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.spacing, "Density"), (.depth, "Depth")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.5, spacing: 0.5, depth: 0.5)

    public init(id: String = "vortex", name: String = "Vortex",
                summary: String = "One work holds the centre while rings of the others orbit around it.") {
        self.id = id
        self.name = name
        self.summary = summary
    }

    /// Seconds the centre holds each work, and how long it takes to turn over.
    func beats(_ ctx: SceneContext) -> (hold: Double, turn: Double) {
        let k = GalleryKit.paceScale(ctx.dials.pace)
        return (2.4 * k, 0.9 * k)
    }

    public func loopDuration(_ ctx: SceneContext) -> Double {
        let b = beats(ctx)
        return Double(max(ctx.items.count, 1)) * (b.hold + b.turn)
    }

    struct Ring { var y: Float; var count: Int; var turns: Float; var size: Float; var phase: Float }

    func rings(_ ctx: SceneContext) -> (rings: [Ring], radius: SIMD2<Float>) {
        let tall = ctx.aspect < 0.9
        let levels = tall ? 6 : 4
        let span: Float = tall ? 1.3 : 1.05
        let radius = tall ? SIMD2<Float>(ctx.aspect * 0.95, 0.55) * mix(0.85, 1.15, ctx.dials.depth)
                          : SIMD2<Float>(ctx.aspect * 0.42, 0.5) * mix(0.85, 1.15, ctx.dials.depth)
        let base = Int((Float(tall ? 7 : 10) * mix(0.7, 1.3, ctx.dials.spacing)).rounded())
        var out: [Ring] = []
        for l in 0..<levels {
            let u = levels > 1 ? Float(l) / Float(levels - 1) : 0.5
            // Alternating directions, one to three turns per loop.
            let turns = Float(1 + (l * 7 + 3) % 3) * (l % 2 == 0 ? 1 : -1)
            let size = (tall ? 0.14 : 0.19) * mix(0.8, 1.2, ctx.dials.size) * mix(0.85, 1.15, Hash.unit(l, 41))
            out.append(Ring(y: (u - 0.5) * span, count: max(5, base + (l % 2)), turns: turns, size: size,
                            phase: Hash.unit(l, 43)))
        }
        return (out, radius)
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let loop = loopDuration(ctx)
        let b = beats(ctx)
        let local = wrap(t, loop)
        let cycle = b.hold + b.turn
        let k = min(Int(local / cycle), n - 1)
        let within = local - Double(k) * cycle
        let tall = ctx.aspect < 0.9
        let phase = Float(local / loop)

        // The centre's size, which the near side of the field keeps clear of.
        func centreSize(_ item: SceneItem) -> SIMD2<Float> {
            tall ? GalleryKit.fit(item.aspect, maxW: ctx.aspect * 0.8 * mix(0.85, 1.1, ctx.dials.size), maxH: 0.46)
                 : GalleryKit.fit(item.aspect, maxW: 0.56, maxH: 0.52 * mix(0.85, 1.12, ctx.dials.size))
        }
        // Where the centre is in its turn: holding one work, or crossing to the next
        // with its size easing from one to the other, so the clear zone never jumps.
        let next = (k + 1) % n
        // The turn goes briskly away, slows through edge-on and comes briskly in, so
        // the two works trade places where the card is thinnest.
        let raw = within < b.hold ? 0 : Float((within - b.hold) / b.turn)
        let halves = raw < 0.5 ? 0.5 * Ease.smooth(2 * raw) : 0.5 + 0.5 * Ease.smooth(2 * raw - 1)
        let q: Float = 0.8 * halves + 0.2 * Ease.inOutCubic(raw)
        let here = centreSize(ctx.items[k])
        let centreNow = here + (centreSize(ctx.items[next]) - here) * q
        let clear = centreNow.x / 2

        // The orbiting field.
        let field = rings(ctx)
        for (l, ring) in field.rings.enumerated() {
            for j in 0..<ring.count {
                let theta = 2 * .pi * (Float(j) / Float(ring.count) + ring.phase + ring.turns * phase)
                let x = field.radius.x * sinf(theta)
                let z = field.radius.y * cosf(theta)
                // Neighbours in a ring show different works; rings start at different ones.
                let item = ctx.items[(j + l * 3) % n]
                let size = GalleryKit.fit(item.aspect, maxW: ring.size * 1.25, maxH: ring.size)
                // The near side goes soft and gives way over the centre, so the centre
                // stays whole and readable: abundance at the edges, one clear subject.
                let front = max(0, z / field.radius.y)
                let back = max(0, -z / field.radius.y)
                let aside = Ease.smooth((abs(x) - clear * 0.55) / (clear * 0.7))
                // Every card keeps its face to the camera, turning a little with its orbit.
                var c = GalleryKit.card(item, center: SIMD3(x, ring.y, z), size: size, rotation: SIMD3(0, 0.5 * sinf(theta), 0))
                c.corner = 0.03
                c.shadow = 0
                c.opacity = mix(1, aside * 0.85, Ease.smooth(front * 1.6))
                guard c.opacity > 0.01 else { continue }
                c.blur = 2.2 * front * front
                let fog = 1 - 0.55 * back
                c.color = SIMD4(fog, fog, fog, 1)
                // Draw order follows depth alone: no ring card ever crosses the centre's
                // depth while over it, and neighbours never overlap where they pass.
                f.cards.append(c)
            }
        }

        // The centre: one work, turning over to the next on each beat. A face
        // turning away from the light dims, so the two works meet edge-on in shade.
        func centre(_ i: Int, turn: Float) -> CardPose {
            var c = GalleryKit.card(ctx.items[i], center: SIMD3(0, 0, 0.02), size: centreNow, rotation: SIMD3(0, turn, 0))
            c.corner = 0.025
            c.shadow = 0.9
            let face = abs(cosf(turn))
            let light = 0.45 + 0.55 * face
            c.color = SIMD4(light, light, light, 1)
            // Edge-on, a card is all but gone.
            c.opacity = Ease.smooth(face / 0.14)
            return c
        }
        if within < b.hold {
            f.cards.append(centre(k, turn: 0))
            f.moodHints = [MoodHint(media: ctx.items[k].media, weight: 1)]
        } else {
            // Over the edge: the outgoing work turns away, the next turns in, the
            // size easing from one to the other, so a tall work giving way to a
            // wide one never changes shape in a single frame. The room's colour
            // crosses from one work to the next over the whole turn.
            f.moodHints = [MoodHint(media: ctx.items[k].media, weight: 1 - q), MoodHint(media: ctx.items[next].media, weight: q)]
            f.cards.append(q < 0.5 ? centre(k, turn: q * .pi) : centre(next, turn: (q - 1) * .pi))
        }
        f.groundZ = -0.9
        f.shadowsOnCards = false
        f.camera.focusDistance = nil
        return f
    }

    /// A breath of air as the centre turns over to the next work.
    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        let n = ctx.items.count
        guard n > 0 else { return [] }
        let b = beats(ctx)
        return (0..<n).map { i in
            SoundEvent(time: Double(i) * (b.hold + b.turn) + b.hold + b.turn * 0.45, cue: .air, intensity: 0.35)
        }
    }
}
