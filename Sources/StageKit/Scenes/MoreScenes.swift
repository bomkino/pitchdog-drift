import Foundation
import RenderCore
import simd

// Formations shared by Drift and Galileo: a wall, a presenter, a stack,
// a contact sheet and a before/after comparison.

// MARK: - Wall

/// The whole set on a tilted wall, the camera travelling slowly across it.
public struct WallScene: StageScene {
    public let id: String
    public let name: String
    public let summary: String
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.spacing, "Spacing"), (.angle, "Tilt"), (.depth, "Depth")] }
    public var defaults = SceneDials(pace: 0.4, size: 0.5, spacing: 0.4, depth: 0.5, angle: 0.5)

    public init(id: String = "wall", name: String = "Wall", summary: String = "Everything on one tilted wall, the camera travelling slowly across it.") {
        self.id = id
        self.name = name
        self.summary = summary
    }

    func cell(_ ctx: SceneContext) -> SIMD2<Float> {
        let meanAspect = ctx.items.map(\.aspect).reduce(0, +) / Float(max(ctx.items.count, 1))
        let h = mix(0.2, 0.42, ctx.dials.size)
        let gap = h * mix(0.06, 0.35, ctx.dials.spacing)
        return SIMD2(h * max(0.6, min(meanAspect, 2.0)) + gap, h + gap)
    }

    public func loopDuration(_ ctx: SceneContext) -> Double {
        // One horizontal period of the tiling per loop.
        let n = max(ctx.items.count, 1)
        return Double(n) * 2.2 * GalleryKit.paceScale(ctx.dials.pace)
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let c = cell(ctx)
        let phase = Float(wrap(t / loopDuration(ctx), 1))
        // A wide frame travels across the wall; a tall one travels down it, the
        // wall leaning back rather than turned aside.
        let tall = ctx.aspect < 0.9
        let offset = tall ? SIMD2<Float>(0.03 * sinf(phase * 2 * .pi), phase * c.y * Float(n))
                          : SIMD2<Float>(phase * c.x * Float(n), 0.04 * sinf(phase * 2 * .pi))
        let tilt = mix(0.1, 0.9, ctx.dials.angle)
        let yaw = GalleryKit.deg(tall ? -9 : -26) * tilt
        let pitch = GalleryKit.deg(tall ? 24 : 14) * tilt
        let roll = GalleryKit.deg(tall ? -4 : -7) * tilt
        let R = Matrix.rotationEuler(SIMD3(pitch, yaw, roll))
        let groundZ: Float = -0.6
        let range = Int(ceil(2.2 / min(c.x, c.y))) + 2
        // Rows run across the wall; a tall frame walks the rows, a wide one the columns.
        let startI = tall ? -range : Int(floor(offset.x / c.x)) - range
        // A tall wall scrolls up the screen, like a feed.
        let startJ = tall ? Int(floor(-offset.y / c.y)) - range : -range
        for j in startJ...(startJ + 2 * range + (tall ? 1 : 0)) {
            for i in startI...(startI + 2 * range + 1) {
                // Down the wall each column runs through the whole set, so the loop closes after n rows.
                let index = tall ? ((j + i * 3) % n + n) % n : ((i + j * 3) % n + n) % n
                let item = ctx.items[index]
                let local = tall
                    ? SIMD4<Float>(Float(i) * c.x - offset.x, Float(j) * c.y + offset.y + (i & 1 == 0 ? 0 : c.y * 0.5), 0, 1)
                    : SIMD4<Float>(Float(i) * c.x - offset.x + (j & 1 == 0 ? 0 : c.x * 0.5), Float(j) * c.y - offset.y, 0, 1)
                let world = R * local
                let size = GalleryKit.fit(item.aspect, maxW: c.x * 0.82, maxH: c.y * 0.82)
                let center = SIMD3<Float>(world.x, world.y, world.z * mix(0.3, 1.2, ctx.dials.depth))
                // Cull only what the camera cannot see, shadow included.
                let radius = simd_length(size) * 0.5 + 0.2
                let reach = radius + max(center.z - groundZ, 0) * 1.2 + 0.4
                guard f.camera.sees(center, radius: radius, aspect: ctx.aspect)
                        || f.camera.sees(SIMD3(center.x, center.y, groundZ), radius: reach, aspect: ctx.aspect) else { continue }
                var card = GalleryKit.card(item, center: center, size: size, rotation: SIMD3(pitch, yaw, roll))
                card.corner = 0.03
                card.shadow = 0.7
                f.cards.append(card)
            }
        }
        f.groundZ = groundZ
        return f
    }
}

// MARK: - Presenter

/// One piece at a time, large and still, with a composed swing between them.
public struct PresenterScene: StageScene {
    public let id: String
    public let name: String
    public let summary: String
    public var dials: [(DialKey, String)] { [(.pace, "Hold"), (.size, "Size"), (.angle, "Swing"), (.life, "Push")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.55, angle: 0.5, life: 0.4)

    public init(id: String = "presenter", name: String = "Presenter", summary: String = "One slide at a time, large and readable, with a composed swing between them.") {
        self.id = id
        self.name = name
        self.summary = summary
    }

    func hold(_ item: SceneItem, _ ctx: SceneContext) -> Double {
        3.0 * GalleryKit.paceScale(ctx.dials.pace) * (item.featured ? 1.8 : 1)
    }

    static let exchange = 0.95

    public func loopDuration(_ ctx: SceneContext) -> Double {
        ctx.items.reduce(0) { $0 + hold($1, ctx) + Self.exchange }
    }

    /// Each swing out, and the next slide settling in.
    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        var out: [SoundEvent] = []
        var t = 0.0
        for item in ctx.items {
            t += hold(item, ctx)
            out.append(SoundEvent(time: t + 0.05, cue: .passage, intensity: 0.6))
            out.append(SoundEvent(time: t + Self.exchange * 0.9, cue: .contact, intensity: 0.5))
            t += Self.exchange
        }
        return out
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        var local = wrap(t, loopDuration(ctx))
        var k = 0
        while k < n - 1, local >= hold(ctx.items[k], ctx) + Self.exchange {
            local -= hold(ctx.items[k], ctx) + Self.exchange
            k += 1
        }
        let h = hold(ctx.items[k], ctx)
        let swing = mix(0.3, 1.4, ctx.dials.angle)
        let maxH = mix(0.5, 0.78, ctx.dials.size)
        if ctx.aspect < 0.9 {
            return feed(local: local, current: k, hold: h, swing: swing, maxH: maxH, ctx)
        }

        func size(_ item: SceneItem) -> SIMD2<Float> { GalleryKit.fit(item.aspect, maxW: ctx.aspect * 0.86, maxH: maxH) }
        // Far enough that a slide and its shadow are both out of frame.
        func travel(_ item: SceneItem) -> Float { max(ctx.aspect * 0.95, ctx.aspect / 2 + size(item).x / 2 + 0.3) }

        func place(_ item: SceneItem, progress: Float, x: Float, z: Float, yaw: Float, shade: Float) {
            let push = 1 + 0.045 * ctx.dials.life * progress
            var c = GalleryKit.card(item, center: SIMD3(x, 0, z), size: size(item) * push, rotation: SIMD3(0, yaw, 0))
            c.corner = 0.025
            c.shadow = shade
            c.curl = yaw * 0.4
            f.cards.append(c)
        }

        let item = ctx.items[k]
        if local < h {
            place(item, progress: Float(local / h), x: 0, z: 0, yaw: 0, shade: 1)
        } else {
            let q = Ease.smoother(Float((local - h) / Self.exchange))
            let next = ctx.items[(k + 1) % n]
            place(item, progress: 1, x: -travel(item) * q, z: -0.25 * sinf(.pi * q), yaw: GalleryKit.deg(38) * q * swing,
                  shade: 1 - Ease.smooth((q - 0.7) / 0.3))
            place(next, progress: 0, x: travel(next) * (1 - q), z: -0.25 * sinf(.pi * q), yaw: -GalleryKit.deg(38) * (1 - q) * swing,
                  shade: Ease.smooth(q / 0.3))
        }
        f.groundZ = -0.3
        return f
    }

    /// A tall frame reads one slide at a time as a feed: the column rests on a
    /// slide, then scrolls up to the next, with the slides before and after
    /// smaller and dimmer above and below it.
    func feed(local: Double, current k: Int, hold h: Double, swing: Float, maxH: Float, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        let moving = local >= h
        let q = moving ? Ease.smoother(Float((local - h) / Self.exchange)) : 0
        let focus = Float(k) + q
        func size(_ item: SceneItem) -> SIMD2<Float> { GalleryKit.fit(item.aspect, maxW: ctx.aspect * 0.86, maxH: maxH) }
        // Rows are spaced by the focused slides' heights, so neighbours peek in;
        // the spacing follows the scroll, so it never jumps between slides of
        // different heights.
        func rowAt(_ j: Int) -> Float { (size(ctx.items[j % n]).y + size(ctx.items[(j + 1) % n]).y) / 2 * 1.2 }
        let row = mix(rowAt(k), rowAt(k + 1), q)
        // The resting slide eases forward through its hold and back as it leaves,
        // so no slide changes size in a single frame.
        let push = 1 + 0.045 * ctx.dials.life * (moving ? (1 - q) : Float(local / h))
        // The column repeats, so a short deck still fills it and the loop closes.
        for j in (k - 5)...(k + 6) {
            let i = ((j % n) + n) % n
            let d = Float(j) - focus
            // Everything that reaches into the frame, however short the slides.
            guard abs(d) * row - size(ctx.items[i]).y / 2 < 0.7 else { continue }
            let near = min(abs(d), 1)
            let scale = (1 - 0.2 * near) * (j == k ? push : 1)
            let dim = 1 - 0.42 * near
            // A slight lean back while the column scrolls.
            let lean = -GalleryKit.deg(9) * sinf(.pi * q) * swing
            var c = GalleryKit.card(ctx.items[i], center: SIMD3(0, -d * row, -0.14 * min(abs(d), 1.5)),
                                    size: size(ctx.items[i]) * scale, rotation: SIMD3(lean, 0, 0))
            c.color = SIMD4(dim, dim, dim, 1)
            c.corner = 0.025
            c.shadow = 0.6 + 0.4 * (1 - near)
            f.cards.append(c)
        }
        f.groundZ = -0.4
        f.shadowsOnCards = false
        return f
    }
}

// MARK: - Stack

/// A neat pile. The top card is thrown in an arc and tucked back underneath.
public struct StackScene: StageScene {
    public let id: String
    public let name: String
    public let summary: String
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.angle, "Throw"), (.life, "Looseness")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.55, angle: 0.5, life: 0.5)

    public init(id: String = "stack", name: String = "Stack", summary: String = "A neat pile. The top card is thrown in an arc and tucked back underneath.") {
        self.id = id
        self.name = name
        self.summary = summary
    }

    func cycle(_ ctx: SceneContext) -> Double { 1.9 * GalleryKit.paceScale(ctx.dials.pace) }
    public func loopDuration(_ ctx: SceneContext) -> Double { cycle(ctx) * Double(max(ctx.items.count, 1)) }

    /// The throw, and the card tucked back under the pile.
    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        let c = cycle(ctx)
        return (0..<ctx.items.count).flatMap { k -> [SoundEvent] in
            let t0 = Double(k) * c
            return [SoundEvent(time: t0 + 0.09 * c, cue: .passage, intensity: 0.75, pan: 0.3),
                    SoundEvent(time: t0 + 0.86 * c, cue: .contact, intensity: 0.5, pan: 0.1)]
        }
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let tau = wrap(t, loopDuration(ctx)) / cycle(ctx)
        let top = Int(floor(tau)) % n
        let u = Float(tau - floor(tau))
        let deepest = Float(min(n, 5) - 1)
        let maxH = mix(0.4, 0.62, ctx.dials.size)
        // A tall frame is narrow, so the pile takes more of its width.
        let maxW = ctx.aspect * (ctx.aspect < 0.9 ? 0.8 : 0.7)
        let loose = ctx.dials.life
        let advance = Ease.smoother((u - 0.35) / 0.4)

        // Slot `s` in the pile, 0 = top. Cards below the visible pile wait a little
        // smaller, exactly beneath the bottom card, so they arrive without popping.
        func slotPose(_ s: Float, _ key: Int) -> (pos: SIMD3<Float>, roll: Float, scale: Float, shadow: Float) {
            let sign: Float = key % 2 == 0 ? 1 : -1
            let d = min(s, deepest)
            let hidden = min(max(s - deepest, 0), 1)
            let pos = SIMD3<Float>(d * 0.018 * ctx.aspect, -d * 0.018, -s * 0.012)
            let roll = GalleryKit.deg(sign * (0.5 + 1.8 * loose) * min(s, 3)) + GalleryKit.deg((Hash.unit(key, 3) - 0.5) * 3 * loose)
            return (pos, roll, (1 - 0.02 * d) * (1 - 0.12 * hidden), 1 - hidden)
        }

        // The pile beneath the top card, advancing one slot as the top leaves.
        for d in stride(from: n - 1, through: 1, by: -1) {
            let key = (top + d) % n
            let item = ctx.items[key]
            let slot = slotPose(Float(d) - advance, key)
            let size = GalleryKit.fit(item.aspect, maxW: maxW, maxH: maxH) * slot.scale
            var c = GalleryKit.card(item, center: slot.pos, size: size, rotation: SIMD3(0, 0, slot.roll))
            c.corner = 0.03
            c.shadow = slot.shadow
            f.cards.append(c)
        }

        // The top card: flick, throw clear of the pile, then tuck in underneath.
        let item = ctx.items[top]
        let base = GalleryKit.fit(item.aspect, maxW: maxW, maxH: maxH)
        let home = slotPose(0, top)
        let bottom = slotPose(Float(n - 1), top)
        var p = home.pos
        var roll = home.roll
        var scale: Float = 1
        var shadow: Float = 1
        var layer: Float = 0
        // Far enough that the card has left the pile before it comes back under.
        // A wide frame throws it to the side; a tall one tosses it up.
        let tall = ctx.aspect < 0.9
        let throwX = tall ? max(mix(0.2, 0.38, ctx.dials.angle), base.y * 1.18 + 0.1)
                          : max(ctx.aspect * mix(0.35, 0.7, ctx.dials.angle), base.x * 1.18 + 0.1)
        let away = tall ? SIMD3<Float>(0, 1, 0) : SIMD3<Float>(1, 0, 0)
        let arc = tall ? SIMD3<Float>(-0.6, 0, 0) : SIMD3<Float>(0, 1, 0)
        let spin = GalleryKit.deg(tall ? 9 : 16)
        if u < 0.08 {
            let a = Ease.smooth(u / 0.08)
            p -= away * 0.02 * a
            roll += GalleryKit.deg(2) * a
        } else if u < 0.45 {
            let a = Ease.outCubic(Ease.launch((u - 0.08) / 0.37, ramp: 0.22))
            p += away * (throwX * a - 0.02 * (1 - a))
            p += arc * 0.14 * sinf(.pi * a)
            p.z += 0.08 * a
            roll = home.roll + GalleryKit.deg(2) + (spin - GalleryKit.deg(2)) * a
            shadow = 1 + 0.2 * a
        } else {
            let a = Ease.place((u - 0.45) / 0.45)
            let from = home.pos + away * throwX + SIMD3(0, 0, 0.08)
            p = from + (bottom.pos - from) * a
            roll = home.roll + spin + (bottom.roll - home.roll - spin) * a
            scale = 1 + (bottom.scale - 1) * a
            shadow = 1.2 + (bottom.shadow - 1.2) * a
            layer = -1
        }
        var c = GalleryKit.card(item, center: p, size: base * scale, rotation: SIMD3(0, 0, roll))
        c.corner = 0.03
        c.shadow = shadow
        c.layer = layer
        f.cards.append(c)
        f.groundZ = -0.12
        return f
    }
}

// MARK: - Contact sheet

/// The whole set on one sheet; registration marks travel from work to work.
public struct ContactSheetScene: StageScene {
    public let id = "contact"
    public let name = "Contact Sheet"
    public let summary = "The whole set on one sheet. Registration marks travel from work to work, then frame everything."
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.spacing, "Margin")] }
    public var defaults = SceneDials(pace: 0.45, spacing: 0.4)
    public init() {}

    static let mark = RGB(hex: "#9F322C")
    static let sheet = RGB(hex: "#F1EDE2")

    func step(_ ctx: SceneContext) -> Double { 1.05 * GalleryKit.paceScale(ctx.dials.pace) }
    public func loopDuration(_ ctx: SceneContext) -> Double { step(ctx) * Double(max(ctx.items.count, 1)) + 2.4 }

    func grid(_ ctx: SceneContext) -> (cols: Int, rows: Int, cell: SIMD2<Float>, origin: SIMD2<Float>, sheet: SIMD2<Float>) {
        let n = max(ctx.items.count, 1)
        let sheetW = ctx.aspect * 0.86, sheetH: Float = 0.86
        var best = (cols: 1, score: Float.infinity)
        for cols in 1...8 {
            let rows = Int(ceil(Double(n) / Double(cols)))
            let cellRatio = (sheetW / Float(cols)) / (sheetH / Float(rows))
            let empty = Float(cols * rows - n) / Float(n)
            let score = abs(logf(cellRatio / 1.5)) + empty * 0.3 + (rows > 7 ? 0.4 : 0)
            if score < best.score { best = (cols, score) }
        }
        let cols = best.cols
        let rows = Int(ceil(Double(n) / Double(cols)))
        let margin = mix(0.02, 0.07, ctx.dials.spacing)
        let cell = SIMD2((sheetW - 2 * margin) / Float(cols), (sheetH - 2 * margin) / Float(rows))
        let origin = SIMD2(-sheetW / 2 + margin + cell.x / 2, sheetH / 2 - margin - cell.y / 2)
        return (cols, rows, cell, origin, SIMD2(sheetW, sheetH))
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let g = grid(ctx)
        f.cards.append(CardPose.solid(Self.sheet, position: SIMD3(0, 0, -0.01), size: g.sheet, corner: 0.004, shadow: 0.8))
        var centers: [SIMD2<Float>] = []
        for (i, item) in ctx.items.enumerated() {
            let r = i / g.cols, c = i % g.cols
            let rowCount = r == g.rows - 1 ? n - r * g.cols : g.cols
            let rowShift = Float(g.cols - rowCount) * g.cell.x / 2
            let center = SIMD2(g.origin.x + Float(c) * g.cell.x + rowShift, g.origin.y - Float(r) * g.cell.y)
            centers.append(center)
            let size = GalleryKit.fit(item.aspect, maxW: g.cell.x * 0.84, maxH: g.cell.y * 0.8)
            var card = GalleryKit.card(item, center: SIMD3(center.x, center.y, 0), size: size)
            card.corner = 0.004
            card.shadow = 0.12
            f.cards.append(card)
        }
        // Bracket rectangle: hop, then open to frame the sheet.
        let local = wrap(t, loopDuration(ctx))
        let s = step(ctx)
        var rect: (SIMD2<Float>, SIMD2<Float>)
        func cellRect(_ i: Int) -> (SIMD2<Float>, SIMD2<Float>) { (centers[i], g.cell * SIMD2(0.94, 0.9)) }
        if local < s * Double(n) {
            let k = Int(local / s)
            let u = Float((local - Double(k) * s) / s)
            let move = Ease.smoother((u - 0.58) / 0.42)
            let a = cellRect(k), b = cellRect(min(k + 1, n - 1))
            rect = (a.0 + (b.0 - a.0) * move, a.1 + (b.1 - a.1) * move)
        } else {
            let u = Float((local - s * Double(n)) / 2.4)
            let open = Ease.smoother(u / 0.3) * (1 - Ease.smoother((u - 0.75) / 0.25))
            let last = cellRect(n - 1), first = cellRect(0)
            let whole = (SIMD2<Float>(0, 0), g.sheet * 0.97)
            let back = Ease.smoother((u - 0.75) / 0.25)
            let from = (last.0 + (first.0 - last.0) * back, last.1 + (first.1 - last.1) * back)
            rect = (from.0 + (whole.0 - from.0) * open, from.1 + (whole.1 - from.1) * open)
        }
        let arm = min(rect.1.x, rect.1.y) * 0.16
        let thick: Float = 0.0045
        for sx in [Float(-1), 1] {
            for sy in [Float(-1), 1] {
                let corner = rect.0 + SIMD2(sx, sy) * rect.1 / 2
                let hx = CardPose.solid(Self.mark, position: SIMD3(corner.x - sx * arm / 2, corner.y, 0.01), size: SIMD2(arm, thick), corner: 0.2, shadow: 0)
                let hy = CardPose.solid(Self.mark, position: SIMD3(corner.x, corner.y - sy * arm / 2, 0.01), size: SIMD2(thick, arm), corner: 0.2, shadow: 0)
                f.cards.append(hx)
                f.cards.append(hy)
            }
        }
        f.groundZ = -0.05
        return f
    }
}

// MARK: - Compare

/// Pairs of works on one frame; a divider sweeps between before and after.
public struct CompareScene: StageScene {
    public let id = "compare"
    public let name = "Compare"
    public let summary = "Before and after on one frame. A divider sweeps between them, pausing at each side, then the next pair slides in."
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.6)
    public init() {}

    func pairSeconds(_ ctx: SceneContext) -> Double { 6.2 * GalleryKit.paceScale(ctx.dials.pace) }
    func pairCount(_ n: Int) -> Int { max(1, (n + 1) / 2) }
    public func loopDuration(_ ctx: SceneContext) -> Double {
        pairSeconds(ctx) * Double(pairCount(ctx.items.count))
    }

    /// The divider's sweeps, and each pair handing over to the next.
    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        guard !ctx.items.isEmpty else { return [] }
        let ps = pairSeconds(ctx)
        let count = pairCount(ctx.items.count)
        let exchange = count > 1 ? 0.16 : 0
        var out: [SoundEvent] = []
        for p in 0..<count {
            let t0 = Double(p) * ps
            let phrase = ps * (1 - exchange)
            out.append(SoundEvent(time: t0 + phrase * 0.08, cue: .air, intensity: 0.3, pan: 0.3))
            out.append(SoundEvent(time: t0 + phrase * 0.48, cue: .air, intensity: 0.3, pan: -0.3))
            if count > 1 {
                out.append(SoundEvent(time: t0 + phrase + 0.02, cue: .passage, intensity: 0.5, pan: -0.2))
                out.append(SoundEvent(time: t0 + ps * 0.985, cue: .contact, intensity: 0.45))
            }
        }
        return out
    }

    /// The divider position through one pair's phrase, with held stops.
    static func divider(_ u: Float) -> Float {
        let keys: [(Float, Float)] = [(0, 0.18), (0.08, 0.18), (0.35, 0.88), (0.48, 0.88), (0.75, 0.12), (0.86, 0.12), (1, 0.18)]
        for i in 0..<(keys.count - 1) where u <= keys[i + 1].0 {
            let (t0, v0) = keys[i], (t1, v1) = keys[i + 1]
            let x = (u - t0) / max(t1 - t0, 1e-5)
            let e = x * x * x * (10 - 15 * x + 6 * x * x)
            return v0 + (v1 - v0) * e
        }
        return 0.18
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let ps = pairSeconds(ctx)
        let count = pairCount(n)
        let local = wrap(t, loopDuration(ctx))
        let pair = min(Int(local / ps), count - 1)
        let u = Float((local - Double(pair) * ps) / ps)
        // With more than one pair, the end of each phrase hands over to the next pair.
        let exchange: Float = count > 1 ? 0.16 : 0
        let phrase = min(u / (1 - exchange), 1)
        let q = exchange > 0 ? Ease.smoother((u - (1 - exchange)) / exchange) : 0

        func size(_ p: Int) -> SIMD2<Float> {
            GalleryKit.fit(ctx.items[(p * 2) % n].aspect, maxW: ctx.aspect * 0.86, maxH: mix(0.55, 0.82, ctx.dials.size))
        }
        func travel(_ p: Int) -> Float { ctx.aspect / 2 + size(p).x / 2 + 0.12 }

        func draw(_ p: Int, x: Float, split: Float, sway: Float, shade: Float) {
            // An odd set pairs its last work with the first.
            let before = ctx.items[(p * 2) % n]
            let after = ctx.items[(p * 2 + 1) % n]
            let s = size(p)
            // The pair dips back as it travels; it stays square so the divider stays on the seam.
            let rot = SIMD3<Float>.zero
            let z = -0.08 * abs(sway)
            f.cards.append(CardPose.solid(RGB(hex: "#F5F3EC"), position: SIMD3(x, 0, z - 0.004), size: s + SIMD2(0.03, 0.03), rotation: rot, corner: 0.01, shadow: shade))
            var b = GalleryKit.card(before, center: SIMD3(x, 0, z), size: s, rotation: rot)
            b.corner = 0.004
            b.shadow = 0
            b.fit = .fill
            f.cards.append(b)
            var a = GalleryKit.card(after, center: SIMD3(x, 0, z + 0.001), size: s, rotation: rot)
            a.corner = 0.004
            a.shadow = 0
            a.fit = .fill
            a.reveal = split
            f.cards.append(a)
            let lx = x - s.x / 2 + s.x * split
            f.cards.append(CardPose.solid(.white, position: SIMD3(lx, 0, z + 0.004), size: SIMD2(0.004, s.y), rotation: rot, corner: 0.3, shadow: 0.4 * shade))
            var grip = CardPose.solid(.white, position: SIMD3(lx, 0, z + 0.006), size: SIMD2(0.052, 0.052), rotation: rot, corner: 0.5, shadow: 1.4 * shade)
            grip.color = SIMD4(1, 1, 1, 0.96)
            f.cards.append(grip)
        }

        if q <= 0.0001 {
            draw(pair, x: 0, split: Self.divider(phrase), sway: 0, shade: 1)
        } else {
            // Shadows fade at the edges, so a leaving pair leaves nothing behind.
            let next = (pair + 1) % count
            let sway = sinf(.pi * q)
            draw(pair, x: -travel(pair) * q, split: Self.divider(1), sway: sway, shade: 1 - Ease.smooth((q - 0.7) / 0.3))
            draw(next, x: travel(next) * (1 - q), split: Self.divider(0), sway: -sway, shade: Ease.smooth(q / 0.3))
        }
        f.groundZ = -0.06
        return f
    }
}
