import Foundation
import RenderCore
import simd

/// Ring and sheet (carousel research R6 F197, F198 and F205): the works start
/// as a contact sheet, flat and readable. Its lines slide end to end and merge
/// into one strip, the strip curls into a ring that turns round to where it
/// began, and the ring unrolls and folds back into the sheet. Every card stays
/// the same card, in its order, all the way round: anticipation in the ring,
/// inspection in the sheet.
///
/// A wide frame stands the ring on a vertical axis and folds the sheet into
/// rows; a tall frame turns it into a wheel on a horizontal axis, like a reel
/// of film, and folds the sheet into columns. Lines move across first and
/// then along on the way back (along, then across, on the way out), so no
/// two cards ever overlap while they share a depth, and in
/// the ring the drawing order follows the arc, which never changes under a
/// visible card.
public struct UnrollScene: StageScene {
    public let id: String
    public let name: String
    public let summary: String
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.size, "Size"), (.spacing, "Gutter"), (.depth, "Depth"), (.life, "Ripple")] }
    public var defaults = SceneDials(pace: 0.45, size: 0.5, spacing: 0.4, depth: 0.5, life: 0.35)

    public init(id: String = "unroll", name: String = "Unroll",
                summary: String = "The sheet unrolls into a strip, curls into a ring that turns once, and folds back.") {
        self.id = id
        self.name = name
        self.summary = summary
    }

    // MARK: Timing

    struct Beats {
        var slide, merge, wrap, turn, unwrap, split, place, register, hold: Double
        var total: Double { slide + merge + wrap + turn + unwrap + split + place + register + hold }
    }

    func beats(_ ctx: SceneContext) -> Beats {
        let k = GalleryKit.paceScale(ctx.dials.pace)
        // Lines that set off one after another need a little longer to arrive,
        // and a long slide takes longer than a short one (with the square root of
        // the distance, carousel research GSAP F076), so a wide deck never whips past.
        let ripple = 1 + 0.6 * Double(Self.ripple(ctx))
        let l = layout(ctx)
        let travel = zip(l.strip, l.sheet).map { abs($0 - $1) }.max() ?? 0
        let reach = min(max(sqrt(Double(travel) / 0.45), 1), 3.5)
        return Beats(slide: 0.7 * k * ripple * reach, merge: 0.5 * k * ripple, wrap: 1.8 * k, turn: 4.8 * k, unwrap: 1.8 * k,
                     split: 0.5 * k * ripple, place: 0.7 * k * ripple * reach, register: 0.3 * k, hold: 2.4 * k)
    }

    /// How far apart the lines set off, as a share of each move.
    static func ripple(_ ctx: SceneContext) -> Float { 0.4 * ctx.dials.life }

    public func loopDuration(_ ctx: SceneContext) -> Double { beats(ctx).total }

    // MARK: Layout

    struct Layout {
        var tall: Bool
        var sizes: [SIMD2<Float>]
        var lens: [Float]          // each card's length along the strip
        var gap: Float             // between neighbours along a line, and between lines
        var lineOf: [Int]          // which line of the sheet each card sits in
        var cross: [Float]         // its line's offset across the sheet
        var sheet: [Float]         // its centre along its line, the line centred
        var strip: [Float]         // its centre along the strip, the strip centred
        var ringGap: Float         // the gap the strip opens to as it closes into a ring
    }

    /// Centres along the strip with this gap between neighbours, the strip centred,
    /// and the length of the ring it closes into (one more gap at the seam).
    static func strip(_ lens: [Float], gap: Float) -> (centres: [Float], ring: Float) {
        let length = lens.reduce(0, +) + gap * Float(max(lens.count - 1, 0))
        var at = -length / 2
        var centres: [Float] = []
        for len in lens {
            centres.append(at + len / 2)
            at += len + gap
        }
        return (centres, length + gap)
    }

    func layout(_ ctx: SceneContext) -> Layout {
        let n = ctx.items.count
        let tall = ctx.aspect < 0.9
        // Lengths along a line for a line one unit across: rows in a wide frame,
        // columns in a tall one.
        let unit = ctx.items.map { item -> Float in
            let a = min(max(item.aspect, 0.4), 2.5)
            return tall ? 1 / a : a
        }
        let gf = mix(0.05, 0.2, ctx.dials.spacing)
        let fill = mix(0.8, 0.94, ctx.dials.size)
        let alongRoom = (tall ? 1 : ctx.aspect) * fill
        let crossRoom = (tall ? ctx.aspect : 1) * fill * (tall ? 1 : 0.92)
        // The number of lines that gives the biggest cards, each line filled in
        // order to about an even share of the set.
        var best: (across: Float, lines: [[Int]]) = (0, [Array(0..<n)])
        for count in 1...max(1, min(n, 8)) {
            let total = unit.reduce(0, +)
            var lines: [[Int]] = [[]]
            var run: Float = 0
            for i in 0..<n {
                let share = total * Float(lines.count) / Float(count)
                if !lines[lines.count - 1].isEmpty, lines.count < count, run + unit[i] / 2 > share {
                    lines.append([])
                }
                lines[lines.count - 1].append(i)
                run += unit[i]
            }
            let longest = lines.map { l in l.reduce(0) { $0 + unit[$1] } + gf * Float(max(l.count - 1, 0)) }.max() ?? 1
            let k = Float(lines.count)
            let across = min(alongRoom / max(longest, 1e-3), crossRoom / (k + gf * (k - 1)))
            if across > best.across * 1.0001 { best = (across, lines) }
        }
        let c = best.across
        let gap = c * gf
        let lens = unit.map { $0 * c }
        let sizes = lens.map { tall ? SIMD2(c, $0) : SIMD2($0, c) }
        var lineOf = [Int](repeating: 0, count: n)
        var cross = [Float](repeating: 0, count: n)
        var sheet = [Float](repeating: 0, count: n)
        let count = Float(best.lines.count)
        for (k, line) in best.lines.enumerated() {
            let length = line.reduce(0) { $0 + lens[$1] } + gap * Float(max(line.count - 1, 0))
            var at = -length / 2
            // Rows from the top down; columns from the left.
            let offset = (Float(k) - (count - 1) / 2) * (c + gap)
            for i in line {
                lineOf[i] = k
                cross[i] = tall ? offset : -offset
                sheet[i] = at + lens[i] / 2
                at += lens[i] + gap
            }
        }
        // A small set spreads out round the ring, so the ring always has room for
        // about eleven cards (nine round a wide drum) and never turns into a
        // chunky polygon.
        let mean = lens.reduce(0, +) / Float(max(n, 1))
        let slots = min(tall ? 11 : 9, Float(n + 4))
        let ringGap = max(gap, (slots * (mean + gap) - lens.reduce(0, +)) / Float(max(n, 1)))
        return Layout(tall: tall, sizes: sizes, lens: lens, gap: gap, lineOf: lineOf, cross: cross,
                      sheet: sheet, strip: Self.strip(lens, gap: gap).centres, ringGap: ringGap)
    }

    // MARK: Frame

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let l = layout(ctx)
        let b = beats(ctx)
        var u = wrap(t, loopDuration(ctx))

        // Where each phase stands: 0 before it starts, 1 once it is done.
        func phase(_ d: Double) -> Float {
            defer { u -= d }
            return Float(min(max(u / d, 0), 1))
        }
        let slideAt = phase(b.slide)
        let mergeAt = phase(b.merge)
        let wrapIn = Self.inOut3(phase(b.wrap))
        let turn = Self.inOut2(phase(b.turn))
        let unwrap = Self.inOut3(phase(b.unwrap))
        let splitAt = phase(b.split)
        let placeAt = phase(b.place)
        let register = Ease.register(phase(b.register))
        // Each line of the sheet sets off a little after the one before it.
        let ripple = Self.ripple(ctx)
        let lineCount = (l.lineOf.max() ?? 0) + 1
        func line(_ p: Float, _ k: Int) -> Float {
            let delay = lineCount > 1 ? ripple * Float(k) / Float(lineCount - 1) : 0
            return Ease.place((p - delay) / max(1 - ripple, 1e-3))
        }
        // The sheet lands a little spread and closes up.
        let spread: Float = 1 + 0.04 * Ease.place(placeAt) * (1 - register)
        // How far the strip is curled: 0 flat, 1 a closed ring. The cards draw
        // apart along it as it curls, to the spacing the ring needs.
        let curl = wrapIn * (1 - unwrap)
        let curled = Self.strip(l.lens, gap: l.gap + (l.ringGap - l.gap) * curl)
        let C = curled.ring
        let kappa = curl * 2 * .pi / C
        let spin = C * turn
        // The ring is brought up to fill the frame while it turns.
        let radius = Self.strip(l.lens, gap: l.ringGap).ring / (2 * .pi)
        // A wide drum may run a little past the frame, where its cards are edge-on.
        let room = (l.tall ? 0.94 : ctx.aspect * 1.05) * mix(0.9, 1.12, ctx.dials.size)
        // Never so close that the front card outgrows the frame.
        let crossSize = l.tall ? (l.sizes.map(\.x).max() ?? 0.3) : (l.sizes.map(\.y).max() ?? 0.3)
        let fit = min((l.tall ? ctx.aspect : 1) * 0.92 / max(crossSize, 1e-3),
                      (l.tall ? 1 : ctx.aspect) * 0.92 / max(l.lens.max() ?? 0.3, 1e-3))
        let push = min(max(room / (2 * radius), 0.6), 1.5, fit)
        let zoom = 1 + (push - 1) * curl
        // The camera rises (a wide ring) or steps aside (a tall wheel) to show the far side.
        let lift = GalleryKit.deg(mix(0, 14, ctx.dials.depth)) * curl
        let D = StageCamera.distance(fov: f.camera.fov)
        f.camera.offset = l.tall ? SIMD3(D * sinf(lift), 0, D * cosf(lift) - D) : SIMD3(0, D * sinf(lift), D * cosf(lift) - D)
        let dark = mix(0.1, 0.4, ctx.dials.depth)
        // How far behind the cards the sheet's shadows fall, from its largest card.
        let side = l.sizes.map { max($0.x, $0.y) }.max() ?? 0.3
        let ground = min(0.35 * side, 0.15 * side + 0.12)

        for (i, item) in ctx.items.enumerated() {
            // Along the line: the sheet until the lines slide end to end, the
            // strip until they slide back.
            let k = l.lineOf[i]
            let toStrip = line(slideAt, k) * (1 - line(placeAt, k))
            let toLine = line(mergeAt, k) * (1 - line(splitAt, k))
            // Along the strip, wrapped round the ring while it turns.
            var s = curled.centres[i] + spin
            s -= C * (s / C).rounded()
            let flatAlong = l.sheet[i] * spread + (l.strip[i] - l.sheet[i] * spread) * toStrip
            let crossAt = l.cross[i] * spread * (1 - toLine)
            var along = flatAlong, depth: Float = 0, angle: Float = 0
            if kappa > 1e-5 {
                // Curled: the strip bends round a circle, its middle staying put.
                angle = kappa * s
                along = sinf(angle) / kappa
                let half = sinf(angle / 2)
                depth = -2 * half * half / kappa
            } else if curl > 0 {
                along = s
            }
            let pos: SIMD3<Float> = l.tall ? SIMD3(crossAt, -along, depth) : SIMD3(along, crossAt, depth)
            let rotation: SIMD3<Float> = l.tall ? SIMD3(angle, 0, 0) : SIMD3(0, angle, 0)
            var card = GalleryKit.card(item, center: pos * zoom, size: l.sizes[i] * zoom, rotation: rotation)
            card.corner = 0.03
            // The far side of the ring falls into shade; flat, every card is as supplied.
            let light = 1 - dark * (1 - cosf(angle)) / 2
            card.color = SIMD4(light, light, light, 1)
            // A card casts only in front of the sheet's ground, so no shadow lands
            // ahead of a card curling away behind it.
            card.shadow = 0.5 * (1 - curl) * (1 - curl) * Ease.smooth(1 + card.position.z / ground)
            f.cards.append(card)
        }
        // The ground stays where the sheet's shadows fall, so it never snaps
        // back as the strip curls.
        f.groundZ = -ground
        f.fixedGround = true
        f.shadowsOnCards = false
        return f
    }

    static func inOut3(_ x: Float) -> Float { Ease.inOutCubic(x) }
    static func inOut2(_ x: Float) -> Float {
        let t = min(max(x, 0), 1)
        return t < 0.5 ? 2 * t * t : 1 - powf(-2 * t + 2, 2) / 2
    }

    /// Slides as the lines move, air as the strip curls and as it lets go, a
    /// passage at the height of the turn, and a landing as the sheet settles.
    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        guard !ctx.items.isEmpty else { return [] }
        let b = beats(ctx)
        var at = 0.0
        var out: [SoundEvent] = []
        out.append(SoundEvent(time: at + 0.05, cue: .passage, intensity: 0.24)); at += b.slide
        out.append(SoundEvent(time: at + 0.05, cue: .passage, intensity: 0.18)); at += b.merge
        out.append(SoundEvent(time: at + b.wrap * 0.2, cue: .air, intensity: 0.36)); at += b.wrap
        out.append(SoundEvent(time: at + b.turn * 0.5, cue: .passage, intensity: 0.3)); at += b.turn
        out.append(SoundEvent(time: at + b.unwrap * 0.3, cue: .air, intensity: 0.3)); at += b.unwrap
        out.append(SoundEvent(time: at + 0.05, cue: .passage, intensity: 0.18)); at += b.split
        out.append(SoundEvent(time: at + 0.05, cue: .passage, intensity: 0.22)); at += b.place
        out.append(SoundEvent(time: at + b.register * 0.5, cue: .contact, intensity: 0.3)); at += b.register
        out.append(SoundEvent(time: at + 0.1, cue: .settle, intensity: 0.2))
        return out
    }
}
