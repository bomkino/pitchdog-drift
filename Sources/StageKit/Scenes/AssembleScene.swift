import Foundation
import RenderCore
import simd

/// Radial assembly into a contact sheet (carousel research §1.3 and §6 #9):
/// the works fly in from depth, the centre ones first, each tilted away from
/// the middle by where it is headed; they land in place, turn square, the
/// gutters close a little and a paper sheet settles under them. After a hold
/// the sheet comes apart the same way, back into depth.
public struct AssembleScene: StageScene {
    public let id: String
    public let name: String
    public let summary: String
    public var dials: [(DialKey, String)] { [(.pace, "Pace"), (.spacing, "Margin"), (.depth, "Depth"), (.life, "Spread")] }
    public var defaults = SceneDials(pace: 0.45, spacing: 0.4, depth: 0.5, life: 0.5)

    public init(id: String = "assemble", name: String = "Assemble",
                summary: String = "The works fly in from depth, centre first, and settle into a contact sheet.") {
        self.id = id
        self.name = name
        self.summary = summary
    }

    static let sheet = RGB(hex: "#F1EDE2")

    func beats(_ ctx: SceneContext) -> (assemble: Double, hold: Double, apart: Double, rest: Double) {
        let k = GalleryKit.paceScale(ctx.dials.pace)
        return (2.9 * k, 3.4 * k, 1.8 * k, 0.4 * k)
    }

    public func loopDuration(_ ctx: SceneContext) -> Double {
        let b = beats(ctx)
        return b.assemble + b.hold + b.apart + b.rest
    }

    /// The sheet's grid: columns and rows that keep cells near 3:2 and few empty.
    func slots(_ ctx: SceneContext) -> (centres: [SIMD2<Float>], cell: SIMD2<Float>, sheet: SIMD2<Float>) {
        let n = max(ctx.items.count, 1)
        let sheetW = ctx.aspect * 0.86, sheetH: Float = ctx.aspect < 0.9 ? 0.74 : 0.86
        var best = (cols: 1, score: Float.infinity)
        for cols in 1...8 {
            let rows = Int(ceil(Double(n) / Double(cols)))
            let ratio = (sheetW / Float(cols)) / (sheetH / Float(rows))
            let empty = Float(cols * rows - n) / Float(n)
            let score = abs(logf(ratio / 1.5)) + empty * 0.3 + (rows > 7 ? 0.4 : 0)
            if score < best.score { best = (cols, score) }
        }
        let cols = best.cols, rows = Int(ceil(Double(n) / Double(cols)))
        let margin = mix(0.02, 0.07, ctx.dials.spacing)
        let cell = SIMD2((sheetW - 2 * margin) / Float(cols), (sheetH - 2 * margin) / Float(rows))
        let origin = SIMD2(-sheetW / 2 + margin + cell.x / 2, sheetH / 2 - margin - cell.y / 2)
        var centres: [SIMD2<Float>] = []
        for i in 0..<n {
            let r = i / cols, c = i % cols
            let inRow = r == rows - 1 ? n - r * cols : cols
            let shift = Float(cols - inRow) * cell.x / 2
            centres.append(SIMD2(origin.x + Float(c) * cell.x + shift, origin.y - Float(r) * cell.y))
        }
        return (centres, cell, SIMD2(sheetW, sheetH))
    }

    /// How assembled the sheet is at time t, 0 (apart, in depth) … 1 (settled).
    func progress(_ t: Double, _ ctx: SceneContext) -> Float {
        let b = beats(ctx)
        let u = wrap(t, loopDuration(ctx))
        if u < b.assemble { return Float(u / b.assemble) }
        if u < b.assemble + b.hold { return 1 }
        if u < b.assemble + b.hold + b.apart { return 1 - Float((u - b.assemble - b.hold) / b.apart) }
        return 0
    }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        let n = ctx.items.count
        guard n > 0 else { return f }
        let g = slots(ctx)
        let p = progress(t, ctx)
        let reach = g.centres.map { simd_length($0) }.max() ?? 1
        let stagger: Float = 0.25
        let spread = mix(1.0, 1.8, ctx.dials.life)
        let deep = mix(0.5, 1.2, ctx.dials.depth)

        // The sheet settles under the works once they are nearly home.
        let sheetIn = Ease.smooth((p - 0.8) / 0.15)
        if sheetIn > 0.001 {
            var sheet = CardPose.solid(Self.sheet, position: SIMD3(0, 0, -0.012), size: g.sheet, corner: 0.004, shadow: 0.8)
            sheet.opacity = sheetIn
            // Always under the works, even those still arriving from behind it.
            sheet.layer = -1
            f.cards.append(sheet)
        }
        for (i, item) in ctx.items.enumerated() {
            let home = g.centres[i]
            let away = reach > 0.001 ? home / reach : .zero
            let r = Hash.unit(i, 61)
            // Centre out: the nearest works start first.
            let start = stagger * simd_length(away)
            let q = min(max((p - start) / (1 - stagger), 0), 1)
            guard q > 0.0005 else { continue }
            let appear = Ease.smooth(q / 0.15)
            let travel = Ease.register((q - 0.1) / 0.55)
            let settle = Ease.place((q - 0.4) / 0.45)
            // Gutters a little open until the very end.
            let gutter = 1 + 0.35 * (1 - Ease.smooth((q - 0.78) / 0.14))
            let target = home * gutter
            let from = home + home * spread * 1.4
            let xy = from + (target - from) * travel
            let z = -(0.8 + 0.6 * r) * deep * (1 - settle)
            let tilt = GalleryKit.deg(48) * (1 - settle)
            let rotation = SIMD3(-tilt * away.y, tilt * away.x, GalleryKit.deg(8) * (r - 0.5) * (1 - settle))
            let size = GalleryKit.fit(item.aspect, maxW: g.cell.x * 0.84, maxH: g.cell.y * 0.8)
            var card = GalleryKit.card(item, center: SIMD3(xy.x, xy.y, z), size: size, rotation: rotation, opacity: appear)
            card.corner = 0.004
            // Only cards that have landed cast onto the sheet; none casts while it
            // is still behind the surface its shadow falls on.
            card.shadow = 0.3 * settle * settle * Ease.smooth((z + 0.05) / 0.04)
            f.cards.append(card)
        }
        f.groundZ = -0.05
        f.fixedGround = true
        return f
    }

    /// Air as the works fly in, a soft landing as each settles, air again as they part.
    public func soundEvents(_ ctx: SceneContext) -> [SoundEvent] {
        let n = ctx.items.count
        guard n > 0 else { return [] }
        let b = beats(ctx)
        let g = slots(ctx)
        let reach = g.centres.map { simd_length($0) }.max() ?? 1
        var out = [SoundEvent(time: 0.05, cue: .air, intensity: 0.35)]
        for i in 0..<n {
            let start = 0.25 * simd_length(reach > 0.001 ? g.centres[i] / reach : .zero)
            // Lands when its travel completes: q = 0.65.
            let p = start + 0.65 * (1 - 0.25)
            out.append(SoundEvent(time: Double(p) * b.assemble, cue: .contact, intensity: 0.18))
        }
        out.append(SoundEvent(time: b.assemble + b.hold + 0.1, cue: .air, intensity: 0.3))
        return out
    }
}
