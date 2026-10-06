import Foundation
import simd

/// The shape a train of cards follows through space.
///
/// Formulas carried forward from Drift 0.5.1 (`FramePlan.point`), re-expressed
/// in canvas units. `u` is the position along the travel axis, normalised so
/// ±1 is the edge of the frame; results are (lateral, depth) offsets.
public enum TrainPath: String, Codable, CaseIterable, Sendable, Identifiable {
    case straight, arc, ribbon, cylinder, tunnel, helix, orbit, cascade, figureEight, switchback, wave

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .straight: return "Straight"
        case .arc: return "Arc"
        case .ribbon: return "Ribbon"
        case .cylinder: return "Cylinder"
        case .tunnel: return "Tunnel"
        case .helix: return "Helix"
        case .orbit: return "Orbit"
        case .cascade: return "Cascade"
        case .figureEight: return "Figure Eight"
        case .switchback: return "Switchback"
        case .wave: return "Wave"
        }
    }

    /// (lateral, depth) for normalised position u, with curvature c and depth d in 0…1.
    func point(_ u: Float, c: Float, d: Float, phase: Float) -> SIMD2<Float> {
        let s = c * 0.34
        let dd = d * 0.9
        // A smooth |u|: a sharp one kinks the path at the centre, which flips the
        // card's yaw and spikes its curl for a frame or two as it passes.
        let an = (u * u + 0.0144).squareRoot() - 0.12
        switch self {
        case .straight:
            return SIMD2(0, -0.22 * dd * u * u)
        case .arc:
            return SIMD2(-0.56 * s * u * u, -0.86 * dd * u * u)
        case .ribbon:
            return SIMD2(0.74 * s * sinf(0.92 * .pi * u), -dd * (0.18 * an + 0.82 * u * u))
        case .cylinder:
            let th = u * (0.9 + 1.55 * c)
            return SIMD2(s * sinf(th) * 0.3, -1.12 * dd * (1 - cosf(th)))
        case .tunnel:
            return SIMD2(0.32 * s * sinf(1.18 * .pi * u), -dd * powf(an, 1.35) * 1.6)
        case .helix:
            let th = u * .pi * (1.25 + 2.4 * c)
            return SIMD2(0.88 * s * sinf(th), -dd * (0.32 * an + 0.34 * (1 - cosf(th))))
        case .orbit:
            let th = u * .pi * (0.82 + 0.92 * c)
            return SIMD2(1.08 * s * sinf(th), -0.92 * dd * (1 - cosf(th)))
        case .cascade:
            return SIMD2((sinf(1.45 * .pi * u) + 0.28 * sinf(4.35 * .pi * u)) * 0.62 * s,
                         -dd * (powf(an, 1.16) + 0.12 * powf(sinf(1.8 * .pi * u), 2)))
        case .figureEight:
            let th = u * .pi * (0.86 + 0.48 * c)
            let cs = cosf(th)
            return SIMD2(1.28 * s * sinf(th) / (1 + cs * cs), -dd * (0.42 * (1 - cosf(2 * th)) + 0.2 * an))
        case .switchback:
            return SIMD2((sinf(1.62 * .pi * u) + 0.27 * sinf(4.86 * .pi * u)) * 0.76 * s,
                         -dd * (powf(an, 1.12) + 0.1 * (1 - cosf(3.1 * .pi * u))))
        case .wave:
            // A travelling rigid wave: the path itself ripples through time.
            return SIMD2(0.9 * s * sinf(1.6 * .pi * u - phase), -dd * (0.25 * u * u + 0.35 * (1 - cosf(1.6 * .pi * u - phase))))
        }
    }
}

/// A procession of cards gliding along a path: Drift's signature scene.
public struct TrainScene: StageScene {
    public var id: String
    public var name: String
    public var summary: String
    public var path: TrainPath
    /// Seconds per slide at pace 0.5.
    public var baseSecondsPerItem: Float = 2.6
    /// 0 = continuous glide, 1 = long reading holds.
    public var hold: Float = 0
    public var curvature: Float = 0.4
    /// Degrees of bank authority.
    public var bank: Float = 4
    /// Extra size for the card at the centre.
    public var focusScale: Float = 0.06
    /// Fade at the far ends of the path.
    public var edgeFade: Float = 0.25
    /// Camera tilt in degrees at angle 0.5.
    public var tilt: Float = 0
    /// Forces the travel axis; nil follows the canvas (horizontal on landscape, vertical on portrait).
    public var vertical: Bool? = nil
    /// Travel direction: +1 or −1.
    public var direction: Float = -1
    /// Pose cadence in frames per second (0 = continuous). 12 gives a handled, stop-motion reel.
    public var poseRate: Double = 0

    /// Stepped poses stay sharp, like stop motion; blur would double them.
    public var allowsMotionBlur: Bool { poseRate <= 0 }
    public var defaults: SceneDials

    public init(id: String, name: String, summary: String, path: TrainPath, defaults: SceneDials = SceneDials(),
                hold: Float = 0, curvature: Float = 0.4, bank: Float = 4, focusScale: Float = 0.06,
                edgeFade: Float = 0.25, tilt: Float = 0, secondsPerItem: Float = 2.6) {
        self.id = id
        self.name = name
        self.summary = summary
        self.path = path
        self.defaults = defaults
        self.hold = hold
        self.curvature = curvature
        self.bank = bank
        self.focusScale = focusScale
        self.edgeFade = edgeFade
        self.tilt = tilt
        self.baseSecondsPerItem = secondsPerItem
    }

    public var dials: [(DialKey, String)] {
        [(.pace, "Pace"), (.size, "Size"), (.spacing, "Spacing"), (.depth, "Depth"), (.angle, "Angle"), (.life, "Life")]
    }

    func secondsPerItem(_ ctx: SceneContext) -> Double {
        // Pace 0 → 2.4× slower, pace 1 → 2.4× faster, exponential feel.
        Double(baseSecondsPerItem) * pow(2.4, Double(1 - 2 * ctx.dials.pace))
    }

    /// Seconds a featured slide holds the stage.
    public var featureHold: Double = 2.4

    struct Segment {
        var start: Double
        var hold: Double
        var move: Double
        var fromRest: Bool
        var toRest: Bool
        var duration: Double { hold + move }
    }

    /// One segment per item: hold on item k (if featured or reading), then travel k → k+1.
    /// Easing keeps velocity continuous wherever the train does not stop.
    func segments(_ ctx: SceneContext) -> [Segment] {
        let n = max(ctx.items.count, 1)
        let spi = secondsPerItem(ctx)
        let cadence = hold > 0.001
        var out: [Segment] = []
        var t = 0.0
        for k in 0..<n {
            let featured = k < ctx.items.count && ctx.items[k].featured
            let nextFeatured = ctx.items.isEmpty ? false : ctx.items[(k + 1) % ctx.items.count].featured
            let fromRest = cadence || featured
            let toRest = cadence || nextFeatured
            var holdTime = 0.0
            if cadence { holdTime += spi * Double(1 - max(0.12, 1 - hold)) }
            if featured { holdTime += featureHold }
            let move: Double
            switch (fromRest, toRest) {
            case (false, false): move = spi
            case (true, true): move = cadence ? spi * Double(max(0.12, 1 - hold)) : spi * 1.6
            default: move = spi * 2
            }
            out.append(Segment(start: t, hold: holdTime, move: move, fromRest: fromRest, toRest: toRest))
            t += holdTime + move
        }
        return out
    }

    public func loopDuration(_ ctx: SceneContext) -> Double {
        segments(ctx).reduce(0) { $0 + $1.duration }
    }

    /// Train position in item units (item k is centred at s = k).
    func travel(_ t: Double, _ ctx: SceneContext) -> Double {
        let segs = segments(ctx)
        let total = segs.reduce(0) { $0 + $1.duration }
        guard total > 0 else { return 0 }
        let cycles = floor(t / total)
        let local = t - cycles * total
        let base = cycles * Double(segs.count)
        for (k, seg) in segs.enumerated() where local < seg.start + seg.duration || k == segs.count - 1 {
            let u = local - seg.start
            if u < seg.hold { return base + Double(k) }
            let x = Float(min(1, max(0, (u - seg.hold) / max(seg.move, 1e-6))))
            let e: Float
            switch (seg.fromRest, seg.toRest) {
            case (false, false): e = x
            case (true, false): e = x * x
            case (false, true): e = 1 - (1 - x) * (1 - x)
            case (true, true): e = Ease.smoother(x)
            }
            return base + Double(k) + Double(e)
        }
        return base
    }

    /// A passage as each card crosses the centre; where the train stops, a landing
    /// as it arrives and a lift as it leaves.
    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        guard !ctx.items.isEmpty else { return [] }
        var out: [SoundEvent] = []
        for (k, seg) in segments(ctx).enumerated() {
            if seg.hold > 0.001 {
                out.append(SoundEvent(time: seg.start, cue: .contact, intensity: ctx.items[k].featured ? 0.9 : 0.6))
                out.append(SoundEvent(time: seg.start + seg.hold, cue: .air, intensity: 0.5))
            } else {
                out.append(SoundEvent(time: seg.start, cue: .passage, intensity: ctx.items[k].featured ? 0.8 : 0.55))
            }
        }
        return out
    }

    /// 0…1: how much the occurrence at slot `k` currently owns the stage.
    func spotlight(_ s: Double, slot k: Int) -> Float {
        Ease.smoother(Float(1 - abs(s - Double(k)) / 0.42))
    }

    public func frame(at time: Double, _ ctx: SceneContext) -> StageFrame {
        // Stepped poses land on a whole number of steps per loop, so the loop still closes.
        let t: Double
        if poseRate > 0 {
            let loop = loopDuration(ctx)
            let steps = max(1, (loop * poseRate).rounded())
            // A hair of tolerance, so a frame that lands exactly on a step never
            // wavers between the two poses.
            t = floor(wrap(time, loop) / loop * steps + 1e-6) / steps * loop
        } else {
            t = time
        }
        var frame = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return frame }
        let d = ctx.dials
        let vertical = self.vertical ?? ctx.isPortrait
        let aspect = ctx.aspect
        // Cross extent: the canvas size perpendicular to travel.
        let cross: Float = vertical ? aspect : 1
        let alongHalf: Float = vertical ? 0.5 : aspect * 0.5
        let cardCross = cross * (vertical ? mix(0.34, 0.96, d.size) : mix(0.22, 0.74, d.size))
        let gap = mix(0.02, 0.5, d.spacing)
        let depth = mix(0.0, 1.0, d.depth)
        let curv = curvature * mix(0.3, 1.7, d.depth)

        // Card sizes follow each item's own aspect. A card thinner along the
        // travel than a 16:9 slide (a 2576 × 1080 slide rising up a tall frame)
        // grows across it towards the area a 16:9 slide would have, so wide
        // decks are not shown smaller than ordinary ones.
        func cardSize(_ item: SceneItem) -> SIMD2<Float> {
            let a = max(item.aspect, 0.05)
            let ratio = vertical ? a / (16.0 / 9.0) : (16.0 / 9.0) / a
            let grown = min(cardCross * min(max(ratio.squareRoot(), 1), 1.4), max(cardCross, cross * 0.94))
            return vertical ? SIMD2(grown, grown / a) : SIMD2(grown * a, grown)
        }
        // Average advance keeps mixed aspect ratios evenly spaced.
        let meanAlong = ctx.items.reduce(Float(0)) { acc, it in
            let s = cardSize(it)
            return acc + (vertical ? s.y : s.x)
        } / Float(n)
        let advance = meanAlong * (1 + gap)

        let s = travel(t, ctx)
        let phase = Float(wrap(t / loopDuration(ctx), 1)) * 2 * .pi
        let center = Int(floor(s))
        let life = d.life

        // Camera: a gentle tilt towards the travel, framing the centre.
        let tiltRad = (tilt + (d.angle - 0.5) * 24) * .pi / 180
        let dist = StageCamera.distance(fov: 35)
        if vertical {
            frame.camera.offset = SIMD3(sinf(tiltRad) * dist * 0.5, 0, 0)
        } else {
            frame.camera.offset = SIMD3(0, sinf(tiltRad) * dist * 0.5, 0)
        }
        frame.camera.target = SIMD3(0, 0, -depth * 0.05)
        let groundZ = -0.28 - depth * 0.4

        // Consider a long stretch of the train, but draw a card only while it (or
        // its shadow) can reach the canvas. Cards then enter and leave out of view,
        // never by popping in the distance.
        let reach = Int(ceil(Double(alongHalf * 8 / advance))) + 2
        for k in (center - reach)...(center + reach) {
            let idx = ((k % n) + n) % n
            let item = ctx.items[idx]
            let offset = Float(Double(k) - s) * direction * -1
            let along = offset * advance
            let u = along / alongHalf
            let size = cardSize(item)

            // Path position and tangent via central difference.
            let p0 = path.point(u, c: curv, d: depth, phase: phase)
            let e: Float = 0.0015
            let pa = path.point(u - e, c: curv, d: depth, phase: phase)
            let pb = path.point(u + e, c: curv, d: depth, phase: phase)
            let dAlong = 2 * e * alongHalf
            let dLat = pb.x - pa.x
            let dZ = pb.y - pa.y

            // Hand-held life: small closed-harmonic wobble per item. Keyed to the
            // item rather than the running index, so the loop closes exactly.
            let hOff = Hash.unit(idx &* 17 &+ 3, ctx.seed) * 2 * .pi
            let harm = Float(2 + (idx & 1))
            let lifeAmt = life * 0.5
            let wobLat = sinf(phase * harm + hOff) * lifeAmt * 0.012
            let wobZ = cosf(2 * phase + 1.31 * hOff) * lifeAmt * 0.02
            let wobRoll = sinf(phase * (harm + 1) - 0.73 * hOff) * lifeAmt * 1.2 * .pi / 180

            let lateral = p0.x * cross + wobLat
            let z = p0.y + wobZ
            let pos: SIMD3<Float> = vertical ? SIMD3(lateral, along, z) : SIMD3(along, lateral, z)

            // Orientation: face along the path; bank into lateral curves.
            let bankLimit = (4 + 1.5 * bank) * .pi / 180
            var rot = SIMD3<Float>.zero
            // Cards face along the path, but never turn fully edge-on: distant
            // pages should still read as pages, not slivers.
            let turnLimit: Float = 55 * .pi / 180
            func soft(_ a: Float) -> Float { turnLimit * tanhf(a / turnLimit) }
            if vertical {
                rot.x = soft(atan2f(dZ, dAlong))
                rot.z = max(-bankLimit, min(bankLimit, -atan2f(dLat * cross, dAlong) * (bank / 12))) + wobRoll
            } else {
                rot.y = soft(atan2f(-dZ, dAlong))
                rot.z = max(-bankLimit, min(bankLimit, atan2f(dLat * cross, dAlong) * (bank / 12))) + wobRoll
            }
            let focus = 1 + focusScale * max(0, 1 - abs(u))
            let spot = item.featured ? spotlight(s, slot: k) : 0
            var pos2 = pos
            pos2.z += 0.14 * spot
            rot *= 1 - spot
            var card = CardPose(media: item.media, occurrence: item.occurrence, position: pos2, rotation: rot,
                                size: size * focus * (1 + 0.16 * spot))
            card.shadow = 1 + 0.6 * spot
            // The train has a finite length: beyond the frame's reach it dissolves
            // into the room, so distant cards neither pile up nor pop.
            let dissolve = 1 - Ease.smooth((abs(u) - 1.15) / 0.6)
            guard dissolve > 0.002 else { continue }
            card.opacity = (1 - edgeFade * Ease.smooth((abs(u) - 0.75) / 0.9)) * dissolve
            card.mediaAspect = item.aspect
            // Bend from path curvature and speed.
            let curvature2 = (path.point(u + 0.02, c: curv, d: depth, phase: phase).y - 2 * p0.y + path.point(u - 0.02, c: curv, d: depth, phase: phase).y) / 0.0004
            card.curl = max(-1, min(1, curvature2 * 0.05))
            card.fold = 0.25 + 0.5 * life
            card.foldPhase = phase * 2 + Float(idx) * 0.9
            // Keep the card while it or its shadow can reach the canvas. The shadow
            // lies on the ground, further back, so it is checked where it falls.
            let height = max(card.position.z - groundZ, 0)
            let radius = simd_length(card.size) * 0.5 + 0.2
            let shadowReach = radius + height * 1.2 + 0.4
            let ground = SIMD3<Float>(card.position.x, card.position.y, groundZ)
            guard frame.camera.sees(card.position, radius: radius, aspect: aspect)
                    || frame.camera.sees(ground, radius: shadowReach, aspect: aspect) else { continue }
            frame.cards.append(card)
        }

        frame.groundZ = groundZ
        frame.shadowsOnCards = false
        return frame
    }
}
