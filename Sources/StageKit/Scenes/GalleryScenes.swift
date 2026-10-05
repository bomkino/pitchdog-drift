import Foundation
import RenderCore
import simd

// Galileo's scenes, rebuilt from the scene-atelier designs ("Scene DNA").
// World units: canvas height 1, width = aspect, origin at the centre, y up.

enum GalleryKit {
    static let mat = RGB(hex: "#F4EEE4")
    static let placard = RGB(hex: "#EFE9DD")
    static let wood = RGB(hex: "#7E5F43")
    static let woodTop = RGB(hex: "#9A7757")
    static let wire = RGB(hex: "#2A2723")

    /// Fits an aspect ratio inside a box.
    static func fit(_ aspect: Float, maxW: Float, maxH: Float) -> SIMD2<Float> {
        let a = max(aspect, 0.05)
        let h = min(maxH, maxW / a)
        return SIMD2(h * a, h)
    }

    /// A print on a paper mat: returns [mat, art]. Both share the pose.
    static func matted(_ item: SceneItem, center: SIMD3<Float>, art: SIMD2<Float>, pad: Float,
                       rotation: SIMD3<Float> = .zero, opacity: Float = 1, lift: Float = 0) -> [CardPose] {
        var m = CardPose.solid(mat, position: center, size: art + SIMD2(repeating: pad * 2), rotation: rotation, corner: 0.012)
        m.opacity = opacity
        m.shadow = 1 + lift * 2
        var a = CardPose(media: item.media, occurrence: item.occurrence, position: center + SIMD3(0, 0, 0.002),
                         rotation: rotation, size: art, opacity: opacity)
        a.mediaAspect = item.aspect
        a.corner = 0.004
        a.shadow = 0.12
        return [m, a]
    }

    static func card(_ item: SceneItem, center: SIMD3<Float>, size: SIMD2<Float>, rotation: SIMD3<Float> = .zero,
                     opacity: Float = 1) -> CardPose {
        var c = CardPose(media: item.media, occurrence: item.occurrence, position: center, rotation: rotation, size: size, opacity: opacity)
        c.mediaAspect = item.aspect
        return c
    }

    /// Stepped travel with holds: integer part advances, the fraction holds for `hold` then eases.
    static func stepped(_ tau: Double, hold: Float) -> Double {
        let k = floor(tau)
        let f = Float(tau - k)
        let move = max(0.08, 1 - hold)
        return k + Double(Ease.smoother((f - hold) / move))
    }

    static func paceScale(_ pace: Float) -> Double { pow(2.2, Double(1 - 2 * pace)) }
    static func deg(_ d: Float) -> Float { d * .pi / 180 }
}

// MARK: - Drift (Quiet Carousel)

public struct GalleryDriftScene: StageScene {
    public let id = "drift"
    public let name = "Drift"
    public let summary = "A calm track drifting through the frame. Neighbours stay close; nothing stops."
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.spacing, "Spacing"), (.depth, "Depth")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.5, spacing: 0.4, depth: 0.5)
    public init() {}

    struct Layout { var lengths: [Float]; var cross: Float; var gap: Float; var track: Float; var repeats: Int; var vertical: Bool; var stage: Float }

    func layout(_ ctx: SceneContext) -> Layout {
        let vertical = ctx.isPortrait
        let crossExtent: Float = vertical ? ctx.aspect : 1
        // Up a tall frame the works take most of the width, like a feed.
        let cross = crossExtent * (vertical ? mix(0.5, 0.88, ctx.dials.size) : mix(0.34, 0.72, ctx.dials.size))
        let gap = cross * mix(0.03, 0.3, ctx.dials.spacing)
        let lengths = ctx.items.map { item -> Float in
            let len = vertical ? cross / max(item.aspect, 0.05) : cross * item.aspect
            return min(len, cross * 2.4)
        }
        let track = lengths.reduce(0) { $0 + $1 + gap }
        let stage: Float = vertical ? 1 : ctx.aspect
        let maxLen = lengths.max() ?? cross
        let repeats = max(1, Int(ceil((stage + 2 * maxLen) / max(track, 0.001))))
        return Layout(lengths: lengths, cross: cross, gap: gap, track: track, repeats: repeats, vertical: vertical, stage: stage)
    }

    public func loopDuration(_ ctx: SceneContext) -> Double {
        let l = layout(ctx)
        let mean = l.lengths.reduce(0, +) / Float(max(l.lengths.count, 1))
        let speed = Double(mean + l.gap) / (1.35 * GalleryKit.paceScale(ctx.dials.pace))
        return Double(l.track) * Double(l.repeats) / max(speed, 0.001)
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        guard !ctx.items.isEmpty else { return f }
        let l = layout(ctx)
        let extent = l.track * Float(l.repeats)
        let phase = Float(wrap(t / loopDuration(ctx), 1))
        let s = phase * extent
        var anchor: Float = 0
        var anchors: [Float] = []
        for len in l.lengths {
            anchors.append(anchor + len / 2)
            anchor += len + l.gap
        }
        for r in 0..<l.repeats {
            for (i, item) in ctx.items.enumerated() {
                var pos = anchors[i] + Float(r) * l.track - s
                pos = Float(wrap(Double(pos + extent / 2), Double(extent))) - extent / 2
                let len = l.lengths[i]
                // Drop a card only once its shadow has left the frame too.
                guard abs(pos) < l.stage / 2 + len + 0.4 else { continue }
                let dist = min(1, abs(pos) / (0.56 * l.stage))
                let scale = 1 - 0.12 * Ease.smooth(dist) * (0.4 + 1.2 * ctx.dials.depth)
                let z = -dist * 0.12 * ctx.dials.depth
                let size = (l.vertical ? SIMD2(l.cross, len) : SIMD2(len, l.cross)) * scale
                let center: SIMD3<Float> = l.vertical ? SIMD3(0, -pos, z) : SIMD3(pos, 0.01, z)
                var c = GalleryKit.card(item, center: center, size: size)
                c.corner = 0.02
                c.shadow = 0.9
                f.cards.append(c)
            }
        }
        f.groundZ = -0.22
        f.shadowsOnCards = false
        return f
    }
}

// MARK: - Corridor (Deck River)

public struct CorridorScene: StageScene {
    public let id = "corridor"
    public let name = "Corridor"
    public let summary = "A fixed camera down a two-lane gallery: work approaches on one side and recedes on the other."
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.spacing, "Lanes"), (.depth, "Depth")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.5, spacing: 0.5, depth: 0.5)
    public init() {}

    /// Places along the loop; small sets repeat so the corridor never looks empty.
    /// Ten keep about two units between works on a wall, so the near ones stand apart.
    func slots(_ ctx: SceneContext) -> Int { max(ctx.items.count, 10) }

    public func loopDuration(_ ctx: SceneContext) -> Double {
        min(48, Double(slots(ctx)) * 1.7 * GalleryKit.paceScale(ctx.dials.pace))
    }

    /// Each lane takes this share of the loop; the crossings between them happen out of sight.
    static let laneShare: Float = 0.46

    struct Geometry { var far: Float; var near: Float; var lane: Float; var height: Float }

    func geometry(_ ctx: SceneContext) -> Geometry {
        if ctx.aspect < 0.9 {
            // A tall frame sees little to either side, so the corridor narrows and
            // the works hang larger, staying in view until they are close.
            return Geometry(far: -8.5 * mix(0.8, 1.25, ctx.dials.depth), near: 0.9,
                            lane: 0.25 * mix(0.8, 1.2, ctx.dials.spacing),
                            height: 0.34 * mix(0.75, 1.3, ctx.dials.size))
        }
        return Geometry(far: -8.5 * mix(0.8, 1.25, ctx.dials.depth), near: 0.9,
                        lane: (0.5 * ctx.aspect + 0.12) * mix(0.8, 1.2, ctx.dials.spacing),
                        height: 0.42 * min(1, ctx.aspect * 1.25) * mix(0.75, 1.3, ctx.dials.size))
    }

    /// A soft passage as each work sweeps past the camera on the near lane.
    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        let g = geometry(ctx)
        let loop = loopDuration(ctx)
        let count = slots(ctx)
        let passing = Double(Self.laneShare * (0.1 - g.far) / (g.near - g.far))
        return (0..<count).map { k in
            SoundEvent(time: wrap((passing - Double(k) / Double(count)) * loop, loop), cue: .passage, intensity: 0.32, pan: -0.55)
        }
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let g = geometry(ctx)
        let count = slots(ctx)
        let phase = Float(wrap(t / loopDuration(ctx), 1))
        let share = Self.laneShare
        let y: Float = -0.02
        for k in 0..<count {
            let item = ctx.items[k % n]
            let s = Float(wrap(Double(Float(k) / Float(count) + phase), 1))
            let z: Float, side: Float
            if s < share {
                side = -1  // approaching on the left
                z = g.far + (g.near - g.far) * (s / share)
            } else if s >= 0.5, s < 0.5 + share {
                side = 1  // receding on the right
                z = g.near + (g.far - g.near) * ((s - 0.5) / share)
            } else {
                continue
            }
            // Out of the haze at the far end; gone past the frame's edge at the near end.
            let opacity = Ease.smooth((z - g.far) / 2.2) * (1 - Ease.smooth((z - 0.25) / (g.near - 0.25)))
            guard opacity > 0.002 else { continue }
            let size = GalleryKit.fit(item.aspect, maxW: g.height * 1.35, maxH: g.height)
            // Hung at eye level on the corridor's walls, turned partly toward the camera.
            var c = GalleryKit.card(item, center: SIMD3(side * g.lane, y, z), size: size,
                                    rotation: SIMD3(0, -side * GalleryKit.deg(44), 0), opacity: opacity)
            let depth = min(1, max(0, (0.3 - z) / (0.3 - g.far)))
            c.blur = depth * depth * 4
            c.corner = 0.02
            c.shadow = 0
            f.cards.append(c)
        }
        // A longer lens from further back: the corridor compresses and the works read larger.
        // A tall frame looks down the corridor from higher up, so its far end sits
        // near the top and works come down the frame as they approach.
        f.camera.fov = 28
        if ctx.aspect < 0.9 {
            f.camera.fov = 32
            f.camera.offset = SIMD3(0, 0.34, 0)
            f.camera.target = SIMD3(0, -0.1, -2.4)
        } else {
            f.camera.offset = SIMD3(0, 0.14, 0)
            f.camera.target = SIMD3(0, -0.08, -2)
        }
        f.reflection = 0.3
        f.floorY = y - g.height / 2 - 0.08
        f.groundZ = g.far - 2
        f.shadowsOnCards = false
        return f
    }
}

// MARK: - Vitrine

public struct VitrineScene: StageScene {
    public let id = "vitrine"
    public let name = "Vitrine"
    public let summary = "One work at a time, still and matted in a warm room, then a composed exchange."
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.depth, "Swing")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.5, depth: 0.5)
    public init() {}

    func perWork(_ ctx: SceneContext) -> Double { 5.5 * GalleryKit.paceScale(ctx.dials.pace) }
    public func loopDuration(_ ctx: SceneContext) -> Double { perWork(ctx) * Double(max(ctx.items.count, 1)) }

    /// The composed exchange, and the next work coming to rest.
    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        let w = perWork(ctx)
        return (0..<ctx.items.count).flatMap { k -> [SoundEvent] in
            [SoundEvent(time: (Double(k) + 0.66) * w, cue: .passage, intensity: 0.45, pan: -0.2),
             SoundEvent(time: (Double(k) + 0.97) * w, cue: .contact, intensity: 0.5, pan: 0.1)]
        }
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let tau = wrap(t, loopDuration(ctx)) / perWork(ctx)
        let k = Int(floor(tau)) % n
        let local = Float(tau - floor(tau))
        // The exchange glides: a long, singly eased move, so the peak speed
        // stays near half a frame width a second.
        let hold: Float = 0.6
        let q = Ease.smoother((local - hold) / (1 - hold))
        let swing = mix(0.3, 1.6, ctx.dials.depth)

        // A tall frame exchanges works up the wall: the current one rises out of the
        // top as the next comes up from below.
        let tall = ctx.aspect < 0.9
        let maxH = mix(0.46, 0.7, ctx.dials.size)
        func art(_ item: SceneItem) -> SIMD2<Float> { GalleryKit.fit(item.aspect, maxW: ctx.aspect * (tall ? 0.84 : 0.72), maxH: maxH) }

        func place(_ item: SceneItem, x: Float, q: Float, incoming: Bool, arrival: Float) {
            let art = art(item)
            let depth = -0.18 * sinf(.pi * q) * swing
            let scale = 1 + 0.30 * depth
            let dip = -abs(depth) * 0.09
            let turn = GalleryKit.deg(incoming ? -5 : 5) * sinf(.pi * q) * swing
            let rot = tall ? SIMD3<Float>(GalleryKit.deg(8) * abs(depth) - turn, 0, 0)
                           : SIMD3<Float>(GalleryKit.deg(8) * abs(depth), turn, 0)
            // `x` is the position along the exchange; up the wall in a tall frame.
            let center = tall ? SIMD3<Float>(0, 0.03 + dip - x, depth * 0.6) : SIMD3<Float>(x, 0.03 + dip, depth * 0.6)
            let pad = min(art.x, art.y) * 0.075
            // Shadows fade while a work is out at the edge, so none is left behind when it goes.
            let shade = incoming ? Ease.smooth(q / 0.3) : 1 - Ease.smooth((q - 0.7) / 0.3)
            f.cards += GalleryKit.matted(item, center: center, art: art * scale, pad: pad * scale, rotation: rot).map {
                var c = $0
                c.shadow *= shade
                return c
            }
            // Placard: fades in once the work has settled, out as the exchange begins.
            var plac = CardPose.solid(GalleryKit.placard, position: SIMD3(center.x + art.x * 0.5 * scale - 0.07,
                                                                          center.y - dip - art.y * 0.5 * scale - pad - 0.07, 0.0),
                                      size: SIMD2(0.14, 0.036), corner: 0.08, shadow: 0.5)
            plac.opacity = arrival * (1 - Ease.smooth(q * 3))
            if plac.opacity > 0.001 {
                f.cards.append(plac)
                // Two lines of greeked type, so it reads as a label from across the room.
                let left = plac.position.x - 0.07 + 0.012
                let lines: [(width: Float, height: Float, dy: Float, ink: Float)] = [
                    (0.05 + 0.03 * Hash.unit(item.media, 31), 0.0042, 0.0065, 0.85),
                    (0.03 + 0.025 * Hash.unit(item.media, 37), 0.0028, -0.0045, 0.45),
                ]
                for line in lines {
                    var bar = CardPose.solid(GalleryKit.wire, position: SIMD3(left + line.width / 2, plac.position.y + line.dy, 0.001),
                                             size: SIMD2(line.width, line.height), corner: 0.5, shadow: 0)
                    bar.opacity = plac.opacity * line.ink
                    f.cards.append(bar)
                }
            }
        }

        // Each work travels by its own size, so a big work never starts inside the frame.
        func travel(_ item: SceneItem) -> Float {
            let a = art(item)
            return tall ? 0.5 + a.y / 2 + min(a.x, a.y) * 0.075 + 0.16 : ctx.aspect / 2 + a.x / 2 + min(a.x, a.y) * 0.075 + 0.12
        }
        let cur = ctx.items[k]
        let arrival = Ease.smooth(local / 0.12)
        if q <= 0.0001 {
            place(cur, x: 0, q: 0, incoming: false, arrival: arrival)
        } else {
            let next = ctx.items[(k + 1) % n]
            place(cur, x: -travel(cur) * q, q: q, incoming: false, arrival: arrival)
            place(next, x: travel(next) * (1 - q), q: q, incoming: true, arrival: 0)
        }
        // The works hang on one wall: its depth never depends on which works are in the room.
        f.groundZ = -0.19
        f.fixedGround = true
        return f
    }
}

// MARK: - Shelf

public struct ShelfScene: StageScene {
    public let id = "shelf"
    public let name = "Shelf"
    public let summary = "Matted prints standing on a wooden ledge, walking slowly past. Featured work straightens and lifts."
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.spacing, "Spacing"), (.life, "Lean")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.5, spacing: 0.45, life: 0.5)
    public init() {}

    struct Layout { var widths: [Float]; var height: Float; var pad: Float; var gap: Float; var track: Float }

    func layout(_ ctx: SceneContext) -> Layout {
        let h = 0.36 * mix(0.75, 1.25, ctx.dials.size)
        let pad = h * 0.07
        let widths = ctx.items.map { min(h * $0.aspect, h * 1.9) }
        let gap = h * mix(0.12, 0.5, ctx.dials.spacing)
        let natural = widths.reduce(0) { $0 + $1 + 2 * pad + gap }
        let minimum = ctx.aspect + 2 * ((widths.max() ?? h) + 2 * pad) + 0.1
        return Layout(widths: widths, height: h, pad: pad, gap: gap, track: max(natural, minimum))
    }

    public func loopDuration(_ ctx: SceneContext) -> Double {
        max(8, min(48, 1.65 * Double(ctx.items.count) + 4)) * GalleryKit.paceScale(ctx.dials.pace)
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        if ctx.aspect < 0.9 { return bookcase(at: t, ctx) }
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let l = layout(ctx)
        let ledgeY: Float = -0.26
        let phase = Float(wrap(t / loopDuration(ctx), 1))
        // Repeat the set if the natural row is shorter than the track.
        let natural = l.widths.reduce(0) { $0 + $1 + 2 * l.pad + l.gap }
        let copies = max(1, Int(ceil(l.track / max(natural, 0.001))))
        let track = natural * Float(copies)
        var cursor: Float = 0
        for copy in 0..<copies {
            for (i, item) in ctx.items.enumerated() {
                let w = l.widths[i] + 2 * l.pad
                let anchor = cursor + w / 2
                cursor += w + l.gap
                var x = anchor - phase * track
                x = Float(wrap(Double(x + track / 2), Double(track))) - track / 2
                // Drop a print only once its shadow has left the frame too.
                guard abs(x) < ctx.aspect / 2 + w + 0.4 else { continue }
                let key = i + copy * 131
                let leanDeg = (0.45 + 2.05 * Hash.unit(key, 7)) * (Hash.unit(key, 9) > 0.5 ? 1 : -1) * ctx.dials.life * 1.6
                let centerness = max(0, 1 - abs(x) / (w * 0.9))
                let lift = item.featured ? Ease.smoother(centerness) : 0
                let lean = GalleryKit.deg(leanDeg) * (1 - lift)
                let h = l.height + 2 * l.pad
                // Rotate about the bottom-centre so the frame rests on the ledge.
                let bottom = SIMD2<Float>(x, ledgeY + lift * 0.08)
                let center = bottom + SIMD2(-sinf(lean) * h / 2, cosf(lean) * h / 2)
                let art = SIMD2(l.widths[i], l.height)
                f.cards += GalleryKit.matted(item, center: SIMD3(center.x, center.y, -0.02 + 0.01 * lift), art: art,
                                             pad: l.pad, rotation: SIMD3(GalleryKit.deg(-4), 0, lean), lift: lift)
            }
        }
        // The ledge: a lip facing us and a top catching light.
        var lip = CardPose.solid(GalleryKit.wood, position: SIMD3(0, ledgeY - 0.018, 0.035), size: SIMD2(ctx.aspect * 1.3, 0.036), corner: 0.1, shadow: 0.9)
        lip.color.w = 1
        f.cards.append(lip)
        let top = CardPose.solid(GalleryKit.woodTop, position: SIMD3(0, ledgeY, 0.005), size: SIMD2(ctx.aspect * 1.3, 0.06),
                                 rotation: SIMD3(GalleryKit.deg(-84), 0, 0), corner: 0.05, shadow: 0)
        f.cards.append(top)
        f.groundZ = -0.08
        f.camera.offset = SIMD3(0, 0.1, 0)
        f.camera.target = SIMD3(0, -0.02, 0)
        return f
    }

    /// A tall frame turns the ledge into a bookcase: shelves of prints, as many
    /// to a shelf as fit across, rising slowly up the frame.
    func bookcase(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let h = 0.26 * mix(0.75, 1.25, ctx.dials.size)
        let pad = h * 0.07
        let gap = h * mix(0.12, 0.4, ctx.dials.spacing)
        let across = ctx.aspect * 0.9
        // Fill shelves in order, starting a new one when the next print would not fit.
        var shelves: [[(index: Int, width: Float)]] = [[]]
        var used: Float = 0
        for (i, item) in ctx.items.enumerated() {
            let w = min(h * item.aspect, across - 2 * pad, h * 1.9) + 2 * pad
            if !shelves[shelves.count - 1].isEmpty, used + gap + w > across {
                shelves.append([])
                used = 0
            }
            used += (shelves[shelves.count - 1].isEmpty ? 0 : gap) + w
            shelves[shelves.count - 1].append((i, w))
        }
        let pitch = h + 2 * pad + h * 0.5
        let natural = pitch * Float(shelves.count)
        // Repeat the case until it is taller than the frame and a shelf, so it never runs short.
        let copies = max(1, Int(ceil((1 + 2 * pitch) / natural)))
        let total = natural * Float(copies)
        let phase = Float(wrap(t / loopDuration(ctx), 1))
        let lip = GalleryKit.wood, top = GalleryKit.woodTop
        for copy in 0..<copies {
            for (s, shelf) in shelves.enumerated() {
                // Shelves rise: the case scrolls up by its own height each loop.
                var ledgeY = -Float(copy * shelves.count + s) * pitch + phase * total
                ledgeY = Float(wrap(Double(ledgeY + total / 2), Double(total))) - total / 2 - h / 2
                guard abs(ledgeY + h / 2) < 0.5 + pitch + 0.3 else { continue }
                let width = shelf.reduce(0) { $0 + $1.width } + gap * Float(shelf.count - 1)
                var x = -width / 2
                for entry in shelf {
                    let item = ctx.items[entry.index]
                    let cx = x + entry.width / 2
                    x += entry.width + gap
                    let key = entry.index + copy * 131
                    let leanDeg = (0.45 + 2.05 * Hash.unit(key, 7)) * (Hash.unit(key, 9) > 0.5 ? 1 : -1) * ctx.dials.life * 1.6
                    let centerness = max(0, 1 - abs(ledgeY + h / 2) / (pitch * 0.9))
                    let lift = item.featured ? Ease.smoother(centerness) : 0
                    let lean = GalleryKit.deg(leanDeg) * (1 - lift)
                    let fh = h + 2 * pad
                    let bottom = SIMD2<Float>(cx, ledgeY + lift * 0.06)
                    let center = bottom + SIMD2(-sinf(lean) * fh / 2, cosf(lean) * fh / 2)
                    let art = SIMD2(entry.width - 2 * pad, h)
                    f.cards += GalleryKit.matted(item, center: SIMD3(center.x, center.y, -0.02 + 0.01 * lift), art: art,
                                                 pad: pad, rotation: SIMD3(GalleryKit.deg(-4), 0, lean), lift: lift)
                }
                var ledge = CardPose.solid(lip, position: SIMD3(0, ledgeY - 0.014, 0.03), size: SIMD2(ctx.aspect * 1.3, 0.028), corner: 0.1, shadow: 0.9)
                ledge.color.w = 1
                f.cards.append(ledge)
                f.cards.append(CardPose.solid(top, position: SIMD3(0, ledgeY, 0.004), size: SIMD2(ctx.aspect * 1.3, 0.05),
                                              rotation: SIMD3(GalleryKit.deg(-84), 0, 0), corner: 0.05, shadow: 0))
            }
        }
        f.groundZ = -0.08
        f.fixedGround = true
        return f
    }
}

// MARK: - Orbit (Calm Ring)

public struct OrbitScene: StageScene {
    public let id = "orbit"
    public let name = "Orbit"
    public let summary = "A calm, nearly edge-on ring. Each work turns to the front gate and pauses there."
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.angle, "Tilt"), (.life, "Pause")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.5, angle: 0.4, life: 0.5)
    public init() {}

    func spi(_ ctx: SceneContext) -> Double { 1.9 * GalleryKit.paceScale(ctx.dials.pace) }
    public func loopDuration(_ ctx: SceneContext) -> Double { spi(ctx) * Double(max(ctx.items.count, 1)) }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let short = min(ctx.aspect, 1)
        // A tall frame stands the ring on its edge, seen from the side like a
        // paternoster: works rise up the front lane through the gate, then
        // sink down the back lane, dimmer and set apart.
        let tall = ctx.aspect < 0.9
        // Up to 14 works share one ring. A bigger set winds into a slow helix:
        // each work comes down from above, turns through the front gate and
        // carries on below, so no card is ever crowded or replaced in view.
        let turns = n <= 14 ? 1 : max(2, Int(ceil(Double(n) / 14)))
        let helix = turns > 1
        let slots = helix ? n : max(n, 7)
        let perTurn = Float(slots) / Float(turns)
        let rise: Float = tall ? 0.85 * ctx.aspect : 0.85
        let R = (tall ? 0.4 : min(0.34 * ctx.aspect, 0.62)) * mix(0.85, 1.15, ctx.dials.size) * (1 + 0.03 * max(0, perTurn - 9))
        let cardW = (tall ? 0.36 * ctx.aspect : 0.25 * short) * mix(0.8, 1.2, ctx.dials.size)
        let tilt = GalleryKit.deg(mix(4, 26, ctx.dials.angle))
        let focus = GalleryKit.stepped(wrap(t, loopDuration(ctx)) / spi(ctx), hold: mix(0.0, 0.6, ctx.dials.life))
        for k in 0..<slots {
            let item = ctx.items[k % n]
            // Ring positions carry `slots` occurrences; the focus walks item by item.
            var d = Float(Double(k) - focus * Double(slots) / Double(n))
            // On a helix, each work sits at its nearest turn; the wrap happens a
            // whole turn or more out of frame.
            if helix { d = Float(wrap(Double(d) + Double(slots) / 2, Double(slots))) - Float(slots) / 2 }
            let lift = helix ? rise * d / perTurn : 0
            if abs(lift) > (tall ? 0.75 : 1.3) { continue }
            let phi = 2 * Float.pi * d / perTurn + .pi / 2
            let around = R * cosf(phi)
            let depth = R * sinf(phi)
            let lean = -0.04 - sinf(phi) * R * sinf(tilt) * 0.8
            // Around the ring runs across a wide frame and up a tall one.
            let x = tall ? -sinf(phi) * 0.36 * ctx.aspect * mix(0.75, 1.1, ctx.dials.angle) + lift : around
            let y = tall ? -around : lean + lift
            // Squash depth so the perspective stays calm (DNA clamps scale to 0.76…1.14).
            let z = depth * cosf(tilt) * 0.42
            let size = GalleryKit.fit(item.aspect, maxW: cardW, maxH: cardW * 1.25)
            let front = (sinf(phi) + 1) / 2
            // The far side of the ring falls into the dark of the room rather
            // than turning see-through, which showed cards through one another.
            let light = tall ? 0.28 + 0.72 * powf(front, 1.6) : 0.42 + 0.58 * powf(front, 1.4)
            let turn = max(-GalleryKit.deg(7), min(GalleryKit.deg(7), -around / R * GalleryKit.deg(7)))
            var c = GalleryKit.card(item, center: SIMD3(x, y, z), size: size, rotation: tall ? SIMD3(turn, 0, 0) : SIMD3(0, turn, 0))
            c.color = SIMD4(light, light, light, 1)
            c.corner = 0.03
            c.shadow = 0.6 * front + 0.2
            f.cards.append(c)
        }
        f.groundZ = -R * 0.42 - 0.3
        // A helix passes below the floor line, so it has no mirror floor.
        f.reflection = helix ? 0 : 0.16
        f.floorY = tall ? -R - cardW * 0.7 - 0.04 : -0.04 - R * sinf(tilt) * 0.8 - cardW * 0.62
        f.shadowsOnCards = false
        return f
    }
}

// MARK: - Hand (Dealer's Pick)

public struct HandScene: StageScene {
    public let id = "hand"
    public let name = "Hand"
    public let summary = "A dealt hand swinging from a pivot below the frame; each work in turn is drawn up out of the hand and shown."
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.spacing, "Spread"), (.life, "Pause")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.5, spacing: 0.5, life: 0.45)
    public init() {}

    func spi(_ ctx: SceneContext) -> Double { 1.5 * GalleryKit.paceScale(ctx.dials.pace) }
    public func loopDuration(_ ctx: SceneContext) -> Double { spi(ctx) * Double(max(ctx.items.count, 1)) }

    /// A card slid back into the hand as the next is drawn up and shown.
    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        let s = spi(ctx)
        let hold = Double(mix(0.1, 0.65, ctx.dials.life))
        return (0..<ctx.items.count).flatMap { k -> [SoundEvent] in
            [SoundEvent(time: (Double(k) + hold + 0.1 * (1 - hold)) * s, cue: .passage, intensity: 0.5),
             SoundEvent(time: (Double(k) + 0.96) * s, cue: .contact, intensity: 0.5)]
        }
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        // The hand keeps one stacking order, each card lying on its left neighbour,
        // so nothing ever swaps places. The crown is drawn up until it clears its
        // neighbours before it grows, which is what lets it sit on top.
        let hc = 0.26 * mix(0.8, 1.2, ctx.dials.size) * (ctx.isPortrait ? 0.75 : 1)
        let pivot = SIMD2<Float>(0, -1.28)
        let arm: Float = 0.88
        let step = GalleryKit.deg(10.5 * mix(0.6, 1.5, ctx.dials.spacing))
        let lift = hc + hc * 0.8 * sinf(step) + 0.035
        let focus = GalleryKit.stepped(wrap(t, loopDuration(ctx)) / spi(ctx), hold: mix(0.1, 0.65, ctx.dials.life))
        // A ring of at least eight places, repeating the set when it is small, so the
        // hand always reaches past the frame edges and the loop still closes.
        let ring = n * Int(ceil(8.0 / Double(n)))
        for slot in 0..<ring {
            var d = Float(Double(slot) - focus)
            d = Float(wrap(Double(d) + Double(ring) / 2, Double(ring))) - Float(ring) / 2
            guard abs(d) <= 4.2 else { continue }
            let item = ctx.items[slot % n]
            let raise = Ease.smoother(1 - min(abs(d), 1))
            // Beyond the neighbours, cards swing away faster and leave below the frame.
            let far = max(abs(d) - 2, 0)
            let theta = (d + (d < 0 ? -1 : 1) * far * far) * step
            let base = GalleryKit.fit(item.aspect, maxW: hc * 1.6, maxH: hc)
            let crown = min(1.8, ctx.aspect * 0.92 / base.x)
            let scale = 1 + (crown - 1) * raise * raise
            let size = base * scale
            let dir = SIMD2<Float>(sinf(theta), cosf(theta))
            let bottom = pivot + dir * (arm + lift * raise)
            let center = bottom + dir * (size.y / 2)
            var c = GalleryKit.card(item, center: SIMD3(center.x, center.y, raise * 0.05), size: size, rotation: SIMD3(0, 0, -theta))
            c.corner = 0.035
            c.shadow = 0.8 + raise * 0.4
            c.curl = max(-0.25, min(0.25, 0.08 * d))
            c.layer = d
            f.cards.append(c)
        }
        f.groundZ = -0.12
        return f
    }
}

// MARK: - Scatter

public struct ScatterScene: StageScene {
    public let id = "scatter"
    public let name = "Scatter"
    public let summary = "Prints arrive from every edge, settle around a calm empty space, lift one by one, then leave."
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.life, "Energy")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.5, life: 0.5)
    public init() {}

    static let cohortSize = 9

    func cohortSeconds(_ ctx: SceneContext) -> Double { 10 * GalleryKit.paceScale(ctx.dials.pace) }
    public func loopDuration(_ ctx: SceneContext) -> Double {
        let cohorts = max(1, Int(ceil(Double(ctx.items.count) / Double(Self.cohortSize))))
        return cohortSeconds(ctx) * Double(cohorts)
    }

    /// Each print landing where it lands, each lift, and the table cleared.
    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        let n = ctx.items.count
        guard n > 0 else { return [] }
        let C = cohortSeconds(ctx)
        let cohorts = max(1, Int(ceil(Double(n) / Double(Self.cohortSize))))
        var out: [SoundEvent] = []
        for c in 0..<cohorts {
            let t0 = Double(c) * C
            let m = min(Self.cohortSize, n - c * Self.cohortSize)
            let places = slots(m, ctx, seed: 17)
            let liftSpan = 0.64 / Double(max(m, 1))
            for i in 0..<m {
                let pan = places[i].x / max(ctx.aspect * 0.5, 0.1) * 0.6
                out.append(SoundEvent(time: t0 + (Double(i) * 0.012 + 0.22 * 0.7) * C, cue: .contact, intensity: 0.35, pan: pan))
                out.append(SoundEvent(time: t0 + (0.22 + Double(i) * liftSpan) * C, cue: .air, intensity: 0.25, pan: pan))
            }
            out.append(SoundEvent(time: t0 + 0.88 * C, cue: .passage, intensity: 0.6))
        }
        return out
    }

    /// Print height: smaller in a narrow frame, so a reel holds the set without crowding.
    func printHeight(_ ctx: SceneContext) -> Float {
        0.24 * mix(0.75, 1.25, ctx.dials.size) * min(1, 0.2 + 0.8 * ctx.aspect)
    }

    /// Slots around a quiet ellipse on the right third, with every print inside the frame.
    func slots(_ m: Int, _ ctx: SceneContext, seed: UInt32) -> [SIMD3<Float>] {
        let aspect = ctx.aspect
        let half = max(0.08, min(aspect * 0.43, aspect / 2 - 0.81 * printHeight(ctx) - 0.02))
        var out: [SIMD3<Float>] = []
        // A wide frame keeps its quiet space on the right third; a tall one keeps a
        // band across the middle, with the prints gathered above and below it.
        let tall = aspect < 0.9
        let cols = aspect > 1 ? 4 : (tall ? 2 : 3)
        let quiet = tall ? SIMD2<Float>(0, 0.02) : SIMD2<Float>(aspect * 0.2, 0.0)
        let quietR = tall ? SIMD2<Float>(aspect * 0.6, 0.09) : SIMD2<Float>(aspect * 0.16, 0.2)
        func places(rows: Int) -> [SIMD3<Float>] {
            var found: [SIMD3<Float>] = []
            for r in 0..<rows {
                for c in 0..<cols {
                    let k = r * cols + c
                    let jx = (Hash.unit(k, seed &+ 3) - 0.5) * 0.45
                    let jy = (Hash.unit(k, seed &+ 5) - 0.5) * 0.45
                    let x = ((Float(c) + 0.5 + jx) / Float(cols) - 0.5) * 2 * half
                    let y = ((Float(r) + 0.5 + jy) / Float(rows) - 0.5) * (tall ? 0.74 : 0.8)
                    let e = SIMD2(x, y) - quiet
                    let inside = (e.x * e.x) / (quietR.x * quietR.x) + (e.y * e.y) / (quietR.y * quietR.y)
                    if inside < 1 { continue }
                    let rot = (Hash.unit(k, seed &+ 11) - 0.5) * GalleryKit.deg(14)
                    found.append(SIMD3(x, y, rot))
                }
            }
            return found
        }
        // Add rows until every print has a place of its own: the quiet space can
        // swallow whole rows in a tall frame.
        var rows = Int(ceil(Double(max(m, 1) + 2) / Double(cols)))
        var candidates = places(rows: rows)
        while candidates.count < m, rows < 4 * m + 4 {
            rows += 1
            candidates = places(rows: rows)
        }
        // Take places spread evenly through the rows, so a small set balances
        // around the quiet space instead of filling the rows from the bottom.
        let count = max(candidates.count, 1)
        for i in 0..<m {
            out.append(candidates[m <= count ? (i * count) / max(m, 1) : i % count])
        }
        return out
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let C = cohortSeconds(ctx)
        let local = wrap(t, loopDuration(ctx))
        let cohort = Int(local / C)
        let u = Float((local - Double(cohort) * C) / C)
        let start = cohort * Self.cohortSize
        let members = Array(ctx.items[start..<min(n, start + Self.cohortSize)])
        let places = slots(members.count, ctx, seed: 17)
        let h = printHeight(ctx)
        let energy = ctx.dials.life
        let liftSpan: Float = 0.64 / Float(max(members.count, 1))
        for (i, item) in members.enumerated() {
            let slot = places[i]
            let target = SIMD2(slot.x, slot.y)
            let edge = i % 4
            // Start and finish fully outside the frame, shadow included, at any aspect.
            let clear = h * 1.5 * 0.75 + 0.3
            let far: SIMD2<Float>
            switch edge {
            case 0: far = SIMD2(-(ctx.aspect / 2 + clear), target.y * 0.5 - 0.1)
            case 1: far = SIMD2(target.x * 0.4, 0.5 + clear)
            case 2: far = SIMD2(ctx.aspect / 2 + clear, target.y * 0.5 + 0.1)
            default: far = SIMD2(target.x * 0.6, -(0.5 + clear))
            }
            let bend = SIMD2<Float>(-(target.y - far.y), target.x - far.x) * (Hash.unit(i, 23) > 0.5 ? 0.25 : -0.25)
            let ctrl = (far + target) / 2 + bend
            let delay = Float(i) * 0.012
            var p = target
            var rot = slot.z
            var opacity: Float = 1
            // Stacking follows arrival: each print lands on those before it and keeps
            // that rank at rest and while it lifts. Prints in the air ride above the
            // table in the same order, so no two prints ever swap places.
            let rank = Float(i) * 0.01
            var airborne = false
            if u < 0.22 + delay {
                let a = Ease.register(max(0, (u - delay)) / 0.22)
                let s = 1 - a
                p = s * s * far + 2 * s * a * ctrl + a * a * target
                rot = slot.z + (1 - a) * GalleryKit.deg(18) * (edge % 2 == 0 ? 1 : -1)
                airborne = a < 1
            } else if u > 0.86 {
                let a = Ease.inOutCubic((u - 0.86) / 0.14)
                let s = a
                p = (1 - s) * (1 - s) * target + 2 * (1 - s) * s * ctrl + s * s * far
                rot = slot.z + a * GalleryKit.deg(18) * (edge % 2 == 0 ? -1 : 1)
                opacity = 1 - Ease.smooth((a - 0.85) / 0.15)
                airborne = a > 0
            }
            // Gentle circulation in place.
            let ph = u * 2 * .pi
            let k1 = Float(1 + i % 2), k2 = Float(1 + (i + 1) % 2)
            let amp = 0.026 * energy
            p += SIMD2(sinf(ph * k1 + Float(i)) * amp, cosf(ph * k2 + Float(i) * 1.7) * amp * 0.7)
            // One print at a time lifts.
            let liftIndex = Int((u - 0.22) / liftSpan)
            var lift: Float = 0
            if u > 0.22, u < 0.86, liftIndex == i {
                let lu = (u - 0.22 - Float(i) * liftSpan) / liftSpan
                lift = sinf(.pi * min(max(lu, 0), 1))
            }
            let art = GalleryKit.fit(item.aspect, maxW: h * 1.5, maxH: h) * (1 + 0.06 * lift)
            f.cards += GalleryKit.matted(item, center: SIMD3(p.x, p.y, 0.005 * Float(i) + 0.08 * lift), art: art,
                                         pad: h * 0.06, rotation: SIMD3(0, 0, rot * (1 - 0.5 * lift)), opacity: opacity, lift: lift).map {
                var c = $0
                c.layer = (airborne ? 1 : 0) + rank
                return c
            }
        }
        f.groundZ = -0.1
        return f
    }
}

// MARK: - Hang

public struct HangScene: StageScene {
    public let id = "hang"
    public let name = "Hang"
    public let summary = "Framed works on wires of unequal length. One nudge travels along the row; each swing settles."
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.life, "Swing")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.5, life: 0.5)
    public init() {}

    /// Pages of works, as many to a page as hang comfortably across the frame
    /// (four in landscape, two in a square), shared out evenly. A tall frame
    /// hangs two, one high and one low.
    func pages(_ ctx: SceneContext) -> [Range<Int>] {
        let n = ctx.items.count
        let fit = ctx.aspect < 0.9 ? 2 : max(1, min(6, Int((ctx.aspect * 2.4).rounded())))
        let count = max(1, Int(ceil(Double(n) / Double(fit))))
        // Fuller pages first: seven works in pairs hang as 2, 2, 2, 1.
        let base = n / count, extra = n % count
        return (0..<count).map { p in
            let start = p * base + min(p, extra)
            return start..<(start + base + (p < extra ? 1 : 0))
        }
    }

    func cycle(_ ctx: SceneContext) -> Double {
        let most = pages(ctx).map(\.count).max() ?? 1
        return (5.2 + 1.2 * Double(most)) * GalleryKit.paceScale(ctx.dials.pace)
    }

    public func loopDuration(_ ctx: SceneContext) -> Double { cycle(ctx) * Double(pages(ctx).count) }

    /// Seconds for a page to come down, for the nudge to cross the row, and to go back up.
    func beats(_ ctx: SceneContext) -> (descend: Double, ripple: Double, retract: Double) {
        let pace = GalleryKit.paceScale(ctx.dials.pace)
        // A tall frame's works are large against it, so they come and go more gently.
        return ctx.aspect < 0.9 ? (2.3 * pace, 0.8 * pace, 1.9 * pace) : (1.6 * pace, 0.8 * pace, 1.5 * pace)
    }

    /// Each page comes down and lands, the nudge taps along the row, and the page goes up.
    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        let C = cycle(ctx)
        let b = beats(ctx)
        return pages(ctx).enumerated().flatMap { p, range -> [SoundEvent] in
            let base = Double(p) * C
            let m = range.count
            var out = [SoundEvent(time: base + 0.1 * b.descend, cue: .air, intensity: 0.35),
                       SoundEvent(time: base + 0.9 * b.descend, cue: .settle, intensity: 0.45)]
            for i in 0..<m {
                let start = b.descend + (m > 1 ? Double(i) / Double(m - 1) * b.ripple : 0)
                let pan = m > 1 ? Float(i) / Float(m - 1) * 1.2 - 0.6 : 0
                out.append(SoundEvent(time: base + start + 0.05, cue: .contact, intensity: 0.22, pan: pan))
            }
            out.append(SoundEvent(time: base + C - b.retract, cue: .air, intensity: 0.3))
            return out
        }
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let C = cycle(ctx)
        let all = pages(ctx)
        let local = wrap(t, loopDuration(ctx))
        let page = min(Int(local / C), all.count - 1)
        let u = Float((local - Double(page) * C) / C)
        let members = Array(ctx.items[all[page]])
        let m = members.count
        let railY: Float = 0.43
        let width = ctx.aspect * 0.84
        let rail = CardPose.solid(GalleryKit.wire, position: SIMD3(0, railY, -0.01), size: SIMD2(ctx.aspect * 1.2, 0.004), corner: 0.5, shadow: 0.4)
        f.cards.append(rail)
        // Descend, swing, settle, retract, each taking the same time whatever the page's length.
        let b = beats(ctx)
        let dU = Float(b.descend / C), rippleU = Float(b.ripple / C), rU = Float(b.retract / C)
        let descend = 1 - Ease.register(u / dU)
        // Hoisted: slow to start, quickest as it leaves the frame.
        let r = max(0, min(1, (u - (1 - rU)) / rU))
        let retract = r * r * r
        let yShift = (descend + retract) * 1.2
        // Each work gets a slot; the row's outer works stay inside the frame.
        let slot = width / Float(max(m, 1))
        let tall = ctx.aspect < 0.9
        let fw = tall ? 0.25 * mix(0.82, 1.14, ctx.dials.size) : min(0.3 * mix(0.75, 1.3, ctx.dials.size), slot * 0.62)
        for (i, item) in members.enumerated() {
            var px = m == 1 ? 0 : (Float(i) / Float(m - 1) - 0.5) * (width - slot)
            var L = min(0.61, max(0.23, 0.34 + 0.13 * Hash.unit(i + page * 17, 5) + (Hash.unit(i, 9) - 0.5) * 0.1)) * 0.7
            if tall {
                // A salon hang: the first work high on a short wire, the second low on
                // a long one beside it, so the pair fills the tall frame.
                px = m == 1 ? 0 : (i == 0 ? -1 : 1) * ctx.aspect * 0.17
                L = m == 1 ? 0.22 : (i == 0 ? 0.07 : 0.44) + (Hash.unit(i + page * 17, 5) - 0.5) * 0.03
            }
            let osc = 2.15 / max(0.72, sqrtf(L / 0.4))
            let start = dU + (m > 1 ? Float(i) / Float(m - 1) * rippleU : 0)
            var theta: Float = 0
            if u > start {
                let tau = (u - start) * Float(C)
                // A framed work is heavy: a small, unhurried swing that dies away.
                let impulse = 0.16 * mix(0.4, 1.6, ctx.dials.life)
                theta = impulse * expf(-5.93 * 0.35 * tau) * sinf(2 * .pi * osc * 0.42 * tau)
                // The nudge takes a moment to land, so no frame jumps from rest into the swing.
                theta = max(-0.3, min(0.3, theta)) * Ease.smooth(tau / 0.2)
            }
            let pivot = SIMD2<Float>(px, railY + yShift)
            let dir = SIMD2<Float>(sinf(theta), -cosf(theta))
            let art = GalleryKit.fit(item.aspect, maxW: tall ? ctx.aspect * 0.52 : fw * 1.3, maxH: fw)
            let pad = min(art.x, art.y) * 0.1
            let frameH = art.y + 2 * pad
            let top = pivot + dir * L
            let center = top + dir * (frameH / 2)
            var wire = CardPose.solid(GalleryKit.wire, position: SIMD3(pivot.x + dir.x * L / 2, pivot.y + dir.y * L / 2, -0.004),
                                      size: SIMD2(0.0022, L), rotation: SIMD3(0, 0, theta), corner: 0.5, shadow: 0.35)
            wire.opacity = 0.85
            f.cards.append(wire)
            let dot = CardPose.solid(GalleryKit.wire, position: SIMD3(pivot.x, pivot.y, -0.003), size: SIMD2(0.012, 0.012), corner: 0.5, shadow: 0.3)
            f.cards.append(dot)
            f.cards += GalleryKit.matted(item, center: SIMD3(center.x, center.y, 0), art: art, pad: pad,
                                         rotation: SIMD3(0, 0, theta))
        }
        f.groundZ = -0.07
        return f
    }
}
