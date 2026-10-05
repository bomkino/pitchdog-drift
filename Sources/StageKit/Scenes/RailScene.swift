import Foundation
import RenderCore
import simd

/// Depth-graded rail (carousel research §1.4 and §6 #5): one card at the
/// centre, flat, sharp and full size; its neighbours above and below (left
/// and right in a wide frame) tilt away towards it, recede, shrink, dim and
/// soften with distance. The rail steps one card at a time on a beat.
/// Neighbours are spaced so that no two cards overlap at any moment, so the
/// drawing order never has to change under a visible card.
public struct RailScene: StageScene {
    public let id: String
    public let name: String
    public let summary: String
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.depth, "Tilt"), (.life, "Soften")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.5, depth: 0.5, life: 0.5)

    public init(id: String = "rail", name: String = "Rail",
                summary: String = "One card at a time, flat at the centre, its neighbours tilting away above and below.") {
        self.id = id
        self.name = name
        self.summary = summary
    }

    func beats(_ ctx: SceneContext) -> (hold: Double, move: Double) {
        let k = GalleryKit.paceScale(ctx.dials.pace)
        return (1.5 * k, 0.85 * k)
    }

    public func loopDuration(_ ctx: SceneContext) -> Double {
        let b = beats(ctx)
        return Double(max(ctx.items.count, 1)) * (b.hold + b.move)
    }

    /// The rail's position at time t, in cards: whole numbers while holding.
    func centre(_ t: Double, _ ctx: SceneContext) -> Float {
        let b = beats(ctx)
        let loop = loopDuration(ctx)
        let local = wrap(t, loop)
        let cycle = b.hold + b.move
        let k = floor(local / cycle)
        let within = local - k * cycle
        let q = within < b.hold ? 0 : Ease.place(Float((within - b.hold) / b.move))
        return Float(k) + q
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let tall = ctx.aspect < 0.9
        let c = centre(t, ctx)
        let tilt = GalleryKit.deg(mix(35, 68, ctx.dials.depth))
        let size: (SceneItem) -> SIMD2<Float> = { item in
            tall ? GalleryKit.fit(item.aspect, maxW: ctx.aspect * 0.8 * mix(0.85, 1.1, ctx.dials.size), maxH: 0.42)
                 : GalleryKit.fit(item.aspect, maxW: ctx.aspect * 0.45, maxH: 0.52 * mix(0.85, 1.1, ctx.dials.size))
        }
        // One rhythm for the whole set, from its longest card, so mixed shapes
        // never overlap their neighbours.
        let pitch = ctx.items.map { item -> Float in let s = size(item); return tall ? s.y : s.x }.max() ?? 0.3
        // A rail longer than the set repeats it, so the frame is always full.
        let span = 3
        let first = Int(floor(c)) - span
        for slot in first...(Int(ceil(c)) + span) {
            let i = ((slot % n) + n) % n
            let item = ctx.items[i]
            let d = Float(slot) - c
            let ad = abs(d)
            guard ad < Float(span) + 0.5 else { continue }
            let s = size(item)
            let along = pitch
            // Far enough apart that tilted neighbours never overlap.
            let offset = (0.92 * min(ad, 1) + 0.58 * max(ad - 1, 0)) * along
            let scale = 1 - 0.12 * min(ad, 1) - 0.05 * max(min(ad, 2) - 1, 0)
            let turn = tilt * min(ad, 1)
            let z = -0.35 * along * min(ad, 1) - 0.12 * along * max(ad - 1, 0)
            // The rail runs up a tall frame and leftwards across a wide one.
            let centrePos: SIMD3<Float> = tall ? SIMD3(0, -(d < 0 ? -offset : offset), z) : SIMD3(d < 0 ? -offset : offset, 0, z)
            let rotation: SIMD3<Float> = tall ? SIMD3((d < 0 ? 1 : -1) * turn, 0, 0) : SIMD3(0, (d < 0 ? 1 : -1) * turn, 0)
            var card = GalleryKit.card(item, center: centrePos, size: s * scale, rotation: rotation)
            card.corner = 0.025
            card.shadow = 0.9 - 0.4 * min(ad, 1)
            let light = 1 - 0.16 * min(ad, 1) - 0.1 * max(min(ad, 2) - 1, 0)
            card.color = SIMD4(light, light, light, 1)
            card.blur = mix(0.5, 3.2, ctx.dials.life) * max(ad - 0.5, 0)
            card.opacity = 1 - Ease.smooth(ad - Float(span) + 0.9)
            f.cards.append(card)
        }
        f.groundZ = -0.35
        f.shadowsOnCards = false
        return f
    }

    /// A slide as the rail starts to move, a soft landing as the next card arrives.
    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        let n = ctx.items.count
        guard n > 0 else { return [] }
        let b = beats(ctx)
        return (0..<n).flatMap { i -> [SoundEvent] in
            let start = Double(i) * (b.hold + b.move) + b.hold
            return [SoundEvent(time: start + b.move * 0.1, cue: .passage, intensity: 0.32),
                    SoundEvent(time: start + b.move * 0.92, cue: .contact, intensity: 0.26)]
        }
    }
}
