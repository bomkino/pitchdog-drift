import AppKit
import CoreText
import Foundation

extension ReelTitle.Face {
    /// PostScript names of the title, then the line above it.
    var fontNames: (title: String, kicker: String) {
        switch self {
        case .modern: return ("AvenirNext-Bold", "AvenirNext-DemiBold")
        case .grotesk: return ("HelveticaNeue-Bold", "HelveticaNeue-Medium")
        case .editorial: return ("Didot", "AvenirNext-DemiBold")
        case .poster: return ("Futura-CondensedExtraBold", "Futura-Medium")
        }
    }

    /// Line height and tracking (in em) the title is set with.
    var titleSetting: (lineHeight: CGFloat, tracking: CGFloat) {
        switch self {
        case .modern: return (1.04, -0.018)
        case .grotesk: return (1.02, -0.024)
        case .editorial: return (1.06, -0.012)
        case .poster: return (0.96, 0.004)
        }
    }

    /// How large the title runs against the others at the same setting, so each
    /// face reads at about the same weight on the frame.
    var scale: CGFloat {
        switch self {
        case .modern, .grotesk: return 1
        case .editorial: return 1.14
        case .poster: return 1.2
        }
    }
}

/// Sets a reel title into a transparent frame: the line above in small
/// tracked capitals, the title beneath it, each sized to the frame.
enum TitleArt {
    static let paper = CGColor(srgbRed: 0.97, green: 0.965, blue: 0.955, alpha: 1)
    static let ink = CGColor(srgbRed: 0.075, green: 0.078, blue: 0.086, alpha: 1)

    /// The most words a title takes before it reads as a paragraph.
    static func maxWords(_ placement: ReelTitle.Placement) -> Int { placement == .centre ? 10 : 14 }

    /// Lines of one block, broken to a width.
    struct Block {
        var lines: [CTLine]
        var lineHeight: CGFloat
        var cap: CGFloat
        var descent: CGFloat

        /// From the top of the first line's capitals to the bottom of the last line's descenders.
        var height: CGFloat { cap + lineHeight * CGFloat(lines.count - 1) + descent }

        func width(_ line: CTLine) -> CGFloat {
            CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil)) - CGFloat(CTLineGetTrailingWhitespaceWidth(line))
        }
    }

    static func block(_ text: String, font: CTFont, tracking: CGFloat, lineHeight: CGFloat, maxLines: Int,
                      color: CGColor, maxWidth: CGFloat) -> Block? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let size = CTFontGetSize(font)
        guard !trimmed.isEmpty, size > 1 else { return nil }
        let attrs: [NSAttributedString.Key: Any] = [
            NSAttributedString.Key(kCTFontAttributeName as String): font,
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): color,
            NSAttributedString.Key(kCTKernAttributeName as String): tracking * size,
        ]
        let string = NSAttributedString(string: trimmed, attributes: attrs)
        let typesetter = CTTypesetterCreateWithAttributedString(string)
        let length = string.length
        var lines: [CTLine] = []
        var start = 0
        while start < length {
            if lines.count == max(maxLines, 1) - 1 {
                // The last line allowed takes the rest, cut short with an ellipsis if need be.
                let rest = CTTypesetterCreateLine(typesetter, CFRange(location: start, length: length - start))
                let ellipsis = CTLineCreateWithAttributedString(NSAttributedString(string: "…", attributes: attrs))
                lines.append(CTLineCreateTruncatedLine(rest, Double(maxWidth), .end, ellipsis) ?? rest)
                break
            }
            let count = max(1, CTTypesetterSuggestLineBreak(typesetter, start, Double(maxWidth)))
            lines.append(CTTypesetterCreateLine(typesetter, CFRange(location: start, length: count)))
            start += count
        }
        return Block(lines: lines, lineHeight: lineHeight * size, cap: CTFontGetCapHeight(font), descent: CTFontGetDescent(font))
    }

    /// Where platform interface covers the frame, as the stage's safe-area guides show it.
    static func insets(_ w: CGFloat, _ h: CGFloat) -> (top: CGFloat, bottom: CGFloat, right: CGFloat) {
        let aspect = w / max(h, 1)
        if aspect < 0.62 { return (h * 0.10, h * 0.22, w * 0.18) }  // reel
        if aspect < 0.9 { return (h * 0.06, h * 0.12, 0) }          // portrait
        return (0, 0, 0)
    }

    /// Title size in pixels: a share of the frame's width or height, whichever is smaller.
    static func titleSize(card: Bool, _ w: CGFloat, _ h: CGFloat) -> CGFloat {
        card ? min(0.104 * w, 0.086 * h) : min(0.066 * w, 0.054 * h)
    }

    static func kickerSize(_ w: CGFloat, _ h: CGFloat) -> CGFloat { min(0.027 * w, 0.022 * h) }

    /// The title over a transparent frame of this pixel size.
    static func image(_ title: ReelTitle, light: Bool, width: Int, height: Int) -> CGImage? {
        guard width > 8, height > 8,
              let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return nil }
        let W = CGFloat(width), H = CGFloat(height)
        let card = title.placement == .centre
        let inset = insets(W, H)
        let margin = 0.055 * min(W, H)
        let color = light ? paper : ink
        let face = title.face
        let titlePt = titleSize(card: card, W, H) * face.scale
        let kickerPt = kickerSize(W, H)
        let names = face.fontNames
        let setting = face.titleSetting

        // Measure: a caption stays in its corner's column; a title card stays
        // clear of a reel's side controls on both sides, so it stays centred.
        let side = card ? max(inset.right, margin * 1.6) : margin
        let maxWidth = card ? W - 2 * side : min(W * 0.62, W - 2 * margin - inset.right)
        let kicker = block(title.kicker.uppercased(), font: Faces.font(names.kicker, size: kickerPt), tracking: 0.16, lineHeight: 1.25,
                           maxLines: 2, color: color.copy(alpha: 0.82) ?? color, maxWidth: maxWidth)
        let main = block(title.text, font: Faces.font(names.title, size: titlePt), tracking: setting.tracking,
                         lineHeight: setting.lineHeight, maxLines: 4, color: color, maxWidth: maxWidth)
        let gap = kickerPt * 1.0 + titlePt * 0.16
        let stack: [(Block, CGFloat)] = [kicker.map { ($0, kickerPt) }, main.map { ($0, titlePt) }].compactMap { $0 }
        guard !stack.isEmpty else { return nil }
        let total = stack.map(\.0.height).reduce(0, +) + (stack.count > 1 ? gap : 0)

        // Place: y measured down from the top of the frame.
        var top: CGFloat
        if card {
            let upper = inset.top, lower = H - inset.bottom
            top = upper + (lower - upper - total) / 2
        } else if inset.bottom > H * 0.15 {
            // A reel's captions and buttons cover its foot, so its caption hangs from the top.
            top = inset.top + margin
        } else {
            top = H - inset.bottom - margin - total
        }

        ctx.textMatrix = .identity
        for (b, size) in stack {
            if light {
                // A soft shadow keeps light words legible over bright passages.
                ctx.setShadow(offset: CGSize(width: 0, height: -0.03 * size), blur: 0.45 * size,
                              color: CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 0.34))
            }
            var baseline = top + b.cap
            for line in b.lines {
                let x = card ? (W - b.width(line)) / 2 : margin
                ctx.textPosition = CGPoint(x: x, y: H - baseline)
                CTLineDraw(line, ctx)
                baseline += b.lineHeight
            }
            top += b.height + gap
        }
        return ctx.makeImage()
    }
}
