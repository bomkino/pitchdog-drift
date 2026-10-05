import AppKit
import CoreText
import Foundation

/// Drift's sample deck: eight slides for a fictional company, set in Avenir
/// Next, so a fresh window shows what a real deck looks like in each scene.
/// The company, people and figures are invented.
enum SampleDeck {
    static let count = 8
    static let titles = ["Fieldnote", "The problem", "What we built", "How it works", "Traction", "The team", "Roadmap", "The ask"]

    // Colours, sRGB.
    static let night = CGColor(srgbRed: 0.063, green: 0.078, blue: 0.157, alpha: 1)
    static let cobalt = CGColor(srgbRed: 0.192, green: 0.373, blue: 1.0, alpha: 1)
    static let sky = CGColor(srgbRed: 0.745, green: 0.812, blue: 1.0, alpha: 1)
    static let paper = CGColor(srgbRed: 0.953, green: 0.941, blue: 0.918, alpha: 1)
    static let ink = CGColor(srgbRed: 0.055, green: 0.063, blue: 0.078, alpha: 1)
    static let amber = CGColor(srgbRed: 1.0, green: 0.706, blue: 0.247, alpha: 1)
    static let slate = CGColor(srgbRed: 0.357, green: 0.392, blue: 0.459, alpha: 1)
    static let teal = CGColor(srgbRed: 0.141, green: 0.553, blue: 0.533, alpha: 1)

    static func alpha(_ c: CGColor, _ a: CGFloat) -> CGColor { c.copy(alpha: a) ?? c }

    static func head(_ size: CGFloat, _ weight: Double = 700) -> CTFont { Faces.avenir(size, weight) }
    static func body(_ size: CGFloat, _ weight: Double = 400) -> CTFont { Faces.avenir(size, weight) }
    static func eyebrow(_ size: CGFloat, _ weight: Double = 600) -> CTFont { Faces.avenir(size, weight) }

    /// Draws `text` in a box whose top-left corner is (x, top), measured from
    /// the top of the slide. Returns the height used.
    @discardableResult
    static func text(_ ctx: CGContext, _ text: String, _ font: CTFont, _ color: CGColor, x: CGFloat, top: CGFloat, width: CGFloat,
                     height H: CGFloat, tracking: CGFloat = 0, lineHeight: CGFloat = 1.1, align: CTTextAlignment = .left) -> CGFloat {
        var alignment = align
        var multiple = lineHeight
        let settings = [
            CTParagraphStyleSetting(spec: .alignment, valueSize: MemoryLayout<CTTextAlignment>.size, value: &alignment),
            CTParagraphStyleSetting(spec: .lineHeightMultiple, valueSize: MemoryLayout<CGFloat>.size, value: &multiple),
        ]
        let para = CTParagraphStyleCreate(settings, settings.count)
        let attrs: [NSAttributedString.Key: Any] = [
            NSAttributedString.Key(kCTFontAttributeName as String): font,
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): color,
            NSAttributedString.Key(kCTKernAttributeName as String): tracking * CTFontGetSize(font),
            NSAttributedString.Key(kCTParagraphStyleAttributeName as String): para,
        ]
        let string = NSAttributedString(string: text, attributes: attrs)
        let setter = CTFramesetterCreateWithAttributedString(string)
        let fit = CTFramesetterSuggestFrameSizeWithConstraints(setter, CFRange(location: 0, length: 0), nil,
                                                               CGSize(width: width, height: .greatestFiniteMagnitude), nil)
        let rect = CGRect(x: x, y: H - top - ceil(fit.height), width: width, height: ceil(fit.height))
        let frame = CTFramesetterCreateFrame(setter, CFRange(location: 0, length: 0), CGPath(rect: rect, transform: nil), nil)
        CTFrameDraw(frame, ctx)
        return ceil(fit.height)
    }

    static func slide(index: Int, width: Int = 1920, height: Int = 1080) -> CGImage {
        let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        let W = CGFloat(width), H = CGFloat(height)
        let s = W / 1920
        let m = 140 * s
        func fill(_ c: CGColor, _ r: CGRect) { ctx.setFillColor(c); ctx.fill(r) }
        // y from the top, like a layout.
        func box(_ x: CGFloat, _ top: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect { CGRect(x: x, y: H - top - h, width: w, height: h) }
        func label(_ t: String, _ c: CGColor, top: CGFloat) { text(ctx, t, eyebrow(26 * s), c, x: m, top: top, width: W - 2 * m, height: H, tracking: 0.16) }
        func footer(_ n: Int, _ c: CGColor) {
            text(ctx, "Fieldnote", body(24 * s, 600), c, x: m, top: H - 96 * s, width: 400 * s, height: H)
            text(ctx, String(format: "%02d", n), eyebrow(24 * s), c, x: W - m - 200 * s, top: H - 96 * s, width: 200 * s, height: H, align: .right)
        }

        switch index % count {
        case 0:
            fill(night, CGRect(x: 0, y: 0, width: W, height: H))
            let glow = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: [alpha(cobalt, 0.95), alpha(cobalt, 0)] as CFArray, locations: [0, 1])!
            ctx.drawRadialGradient(glow, startCenter: CGPoint(x: W - 260 * s, y: 180 * s), startRadius: 0,
                                   endCenter: CGPoint(x: W - 260 * s, y: 180 * s), endRadius: 760 * s, options: [])
            ctx.setFillColor(cobalt)
            ctx.fillEllipse(in: CGRect(x: W - 520 * s, y: -80 * s, width: 520 * s, height: 520 * s))
            fill(amber, box(m, 330 * s, 120 * s, 8 * s))
            label("SERIES A · 2026", sky, top: 260 * s)
            text(ctx, "Fieldnote", head(210 * s), paper, x: m - 8 * s, top: 380 * s, width: W - 2 * m, height: H, tracking: -0.035, lineHeight: 0.9)
            text(ctx, "Research notes that write themselves.", body(48 * s), sky, x: m, top: 650 * s, width: 1100 * s, height: H)
        case 1:
            fill(paper, CGRect(x: 0, y: 0, width: W, height: H))
            label("01 · THE PROBLEM", cobalt, top: 150 * s)
            text(ctx, "Insight gets lost between tools.", head(96 * s), ink, x: m, top: 220 * s, width: 900 * s, height: H, tracking: -0.03, lineHeight: 0.98)
            text(ctx, "73%", head(300 * s), cobalt, x: 1040 * s, top: 300 * s, width: 760 * s, height: H, tracking: -0.05, lineHeight: 0.9)
            text(ctx, "of customer research never reaches the people making decisions.", body(36 * s), alpha(ink, 0.7),
                 x: 1060 * s, top: 640 * s, width: 700 * s, height: H, lineHeight: 1.3)
            footer(2, alpha(ink, 0.45))
        case 2:
            fill(cobalt, CGRect(x: 0, y: 0, width: W, height: H))
            label("02 · WHAT WE BUILT", sky, top: 150 * s)
            text(ctx, "One page for every conversation.", head(92 * s), paper, x: m, top: 220 * s, width: 720 * s, height: H, tracking: -0.03, lineHeight: 0.98)
            // A calm product window.
            let win = box(960 * s, 170 * s, 820 * s, 700 * s)
            ctx.setFillColor(alpha(night, 0.3))
            ctx.addPath(CGPath(roundedRect: win.offsetBy(dx: 0, dy: -18 * s), cornerWidth: 28 * s, cornerHeight: 28 * s, transform: nil)); ctx.fillPath()
            ctx.setFillColor(paper)
            ctx.addPath(CGPath(roundedRect: win, cornerWidth: 28 * s, cornerHeight: 28 * s, transform: nil)); ctx.fillPath()
            for (i, c) in [amber, sky, alpha(ink, 0.15)].enumerated() {
                ctx.setFillColor(c); ctx.fillEllipse(in: box(1000 * s + CGFloat(i) * 36 * s, 206 * s, 18 * s, 18 * s))
            }
            fill(alpha(ink, 0.85), box(1010 * s, 290 * s, 360 * s, 26 * s))
            for i in 0..<7 {
                let w: CGFloat = [640, 600, 660, 420, 620, 560, 300][i]
                fill(alpha(ink, 0.18), box(1010 * s, (360 + CGFloat(i) * 52) * s, w * s, 16 * s))
            }
            fill(cobalt, box(1010 * s, 740 * s, 220 * s, 64 * s))
            footer(3, alpha(paper, 0.7))
        case 3:
            fill(paper, CGRect(x: 0, y: 0, width: W, height: H))
            label("03 · HOW IT WORKS", cobalt, top: 150 * s)
            text(ctx, "Three steps, no busywork.", head(92 * s), ink, x: m, top: 220 * s, width: 1400 * s, height: H, tracking: -0.03)
            let steps = [("Record", "Join the call or drop in a recording."),
                         ("Distil", "Themes, quotes and decisions, sorted."),
                         ("Share", "One link your whole team will read.")]
            for (i, st) in steps.enumerated() {
                let x = m + CGFloat(i) * 560 * s
                ctx.setStrokeColor(cobalt); ctx.setLineWidth(4 * s)
                ctx.strokeEllipse(in: box(x, 480 * s, 110 * s, 110 * s))
                text(ctx, "\(i + 1)", eyebrow(46 * s, 600), cobalt, x: x, top: 510 * s, width: 110 * s, height: H, align: .center)
                text(ctx, st.0, body(44 * s, 600), ink, x: x, top: 640 * s, width: 480 * s, height: H)
                text(ctx, st.1, body(32 * s), alpha(ink, 0.65), x: x, top: 710 * s, width: 440 * s, height: H, lineHeight: 1.3)
            }
            footer(4, alpha(ink, 0.45))
        case 4:
            fill(night, CGRect(x: 0, y: 0, width: W, height: H))
            label("04 · TRACTION", sky, top: 150 * s)
            text(ctx, "Growing 3.2× a year.", head(92 * s), paper, x: m, top: 220 * s, width: 900 * s, height: H, tracking: -0.03)
            let values: [CGFloat] = [0.18, 0.27, 0.36, 0.5, 0.68, 0.92]
            let base = 900 * s, barW = 150 * s, gap = 46 * s
            for (i, v) in values.enumerated() {
                let x = 780 * s + CGFloat(i) * (barW + gap)
                let h = v * 560 * s
                ctx.setFillColor(i == values.count - 1 ? amber : alpha(cobalt, 0.5 + 0.09 * CGFloat(i)))
                ctx.addPath(CGPath(roundedRect: box(x, base - h, barW, h), cornerWidth: 10 * s, cornerHeight: 10 * s, transform: nil)); ctx.fillPath()
                text(ctx, "Q\(i + 1)", eyebrow(24 * s), alpha(paper, 0.6), x: x, top: base + 22 * s, width: barW, height: H, align: .center)
            }
            fill(alpha(paper, 0.25), box(760 * s, base, 1030 * s, 2 * s))
            text(ctx, "1,240 teams", body(40 * s, 600), paper, x: m, top: 520 * s, width: 560 * s, height: H)
            text(ctx, "paying, up from 380 a year ago", body(32 * s), alpha(paper, 0.65), x: m, top: 580 * s, width: 520 * s, height: H, lineHeight: 1.3)
            footer(5, alpha(paper, 0.5))
        case 5:
            fill(paper, CGRect(x: 0, y: 0, width: W, height: H))
            label("05 · THE TEAM", cobalt, top: 150 * s)
            text(ctx, "Built by people who ran research.", head(84 * s), ink, x: m, top: 220 * s, width: 1500 * s, height: H, tracking: -0.03)
            let people = [("Ada Moreno", "CEO · ex-research lead", cobalt, night),
                          ("Kofi Mensah", "CTO · search and ML", teal, ink),
                          ("Lin Zhao", "Design · product systems", amber, slate),
                          ("Sara Holm", "Growth · B2B teams", sky, cobalt)]
            for (i, p) in people.enumerated() {
                let x = m + CGFloat(i) * 420 * s
                let r = box(x, 440 * s, 220 * s, 220 * s)
                ctx.saveGState()
                ctx.addEllipse(in: r); ctx.clip()
                let grad = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: [p.2, p.3] as CFArray, locations: [0, 1])!
                ctx.drawLinearGradient(grad, start: CGPoint(x: r.minX, y: r.maxY), end: CGPoint(x: r.maxX, y: r.minY), options: [])
                ctx.restoreGState()
                text(ctx, p.0, body(38 * s, 600), ink, x: x, top: 700 * s, width: 380 * s, height: H)
                text(ctx, p.1, body(28 * s), alpha(ink, 0.6), x: x, top: 752 * s, width: 380 * s, height: H)
            }
            footer(6, alpha(ink, 0.45))
        case 6:
            fill(ink, CGRect(x: 0, y: 0, width: W, height: H))
            label("06 · ROADMAP", sky, top: 150 * s)
            text(ctx, "Where the next year goes.", head(92 * s), paper, x: m, top: 220 * s, width: 1500 * s, height: H, tracking: -0.03)
            let stops = [("Q1", "Live notes"), ("Q2", "Team spaces"), ("Q3", "Open API"), ("Q4", "Everywhere")]
            let lineY = 600 * s
            fill(alpha(paper, 0.3), box(m, lineY, W - 2 * m, 3 * s))
            for (i, st) in stops.enumerated() {
                let x = m + CGFloat(i) * (W - 2 * m - 60 * s) / 3
                ctx.setFillColor(i == 0 ? amber : paper)
                ctx.fillEllipse(in: box(x, lineY - 17 * s, 36 * s, 36 * s))
                text(ctx, st.0, eyebrow(28 * s, 600), i == 0 ? amber : sky, x: x, top: lineY + 60 * s, width: 300 * s, height: H, tracking: 0.08)
                text(ctx, st.1, body(40 * s, 600), paper, x: x, top: lineY + 106 * s, width: 360 * s, height: H)
            }
            footer(7, alpha(paper, 0.5))
        default:
            let grad = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: [cobalt, night] as CFArray, locations: [0, 1])!
            ctx.drawLinearGradient(grad, start: CGPoint(x: 0, y: H), end: CGPoint(x: W, y: 0), options: [])
            label("THE ASK", sky, top: 260 * s)
            text(ctx, "$8M to reach 10,000 teams.", head(150 * s), paper, x: m - 6 * s, top: 330 * s, width: 1500 * s, height: H, tracking: -0.04, lineHeight: 0.92)
            text(ctx, "hello@fieldnote.example", eyebrow(30 * s), sky, x: m, top: 800 * s, width: 900 * s, height: H, tracking: 0.04)
        }
        return ctx.makeImage()!
    }
}
