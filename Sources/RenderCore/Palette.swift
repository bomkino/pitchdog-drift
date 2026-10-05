import CoreGraphics
import Foundation
import simd

/// A named set of two to eight colours.
///
/// Shaders receive the colours sorted from dark to light (by OKLab lightness),
/// both as linear RGB and as OKLab, so ramps interpolate perceptually.
public struct Palette: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public var colors: [RGB]

    public init(id: String, name: String, colors: [RGB]) {
        self.id = id
        self.name = name
        self.colors = Array(colors.prefix(8))
    }

    public init(_ name: String, _ hexes: [String]) {
        self.init(id: name.lowercased().replacingOccurrences(of: " ", with: "-"), name: name, colors: hexes.map { RGB(hex: $0) })
    }

    public var sorted: [RGB] { colors.sorted { $0.lightness < $1.lightness } }

    public var darkest: RGB { sorted.first ?? .black }
    public var lightest: RGB { sorted.last ?? .white }

    /// Mean lightness, used to pick legible overlay colours.
    public var meanLightness: Float {
        guard !colors.isEmpty else { return 0 }
        return colors.map(\.lightness).reduce(0, +) / Float(colors.count)
    }

    /// 16 float4 entries: 8 linear colours then 8 OKLab colours, dark → light.
    public var gpuEntries: [SIMD4<Float>] {
        var s = sorted
        if s.isEmpty { s = [.black, .white] }
        if s.count == 1 { s.append(s[0]) }
        var out = [SIMD4<Float>](repeating: .zero, count: 16)
        for i in 0..<8 {
            let c = s[min(i, s.count - 1)]
            let lin = c.linear
            let lab = c.oklab
            out[i] = SIMD4(lin, 1)
            out[8 + i] = SIMD4(lab, 1)
        }
        return out
    }

    public var gpuCount: UInt32 { UInt32(max(2, min(8, colors.count))) }

    /// Rotates which colour leads without changing the set.
    public func shifted(by n: Int) -> Palette {
        guard !colors.isEmpty else { return self }
        let k = ((n % colors.count) + colors.count) % colors.count
        return Palette(id: id, name: name, colors: Array(colors[k...] + colors[..<k]))
    }
}

/// The curated palette library. Every palette is ordered to read well as a
/// dark-to-light ramp and has been chosen to sit behind slides without
/// fighting them.
public enum Palettes {
    public static let all: [Palette] = [
        Palette("Nocturne", ["#070B14", "#0F1B33", "#1E3A6B", "#4F7BC0", "#BFD4F2"]),
        Palette("Ember", ["#0E0605", "#3A0F08", "#8C2A0E", "#E0662A", "#FFD2A1"]),
        Palette("Verdigris", ["#0B1512", "#16362F", "#2D6B5C", "#7FB5A0", "#E3E6D5"]),
        Palette("Paper Moon", ["#2B2722", "#6E655A", "#B9AE9C", "#E4DCCB", "#F6F1E7"]),
        Palette("Dusk", ["#120B1F", "#3A1C4A", "#8A3563", "#E4705A", "#FBC687"]),
        Palette("Lagoon", ["#031A1F", "#06414A", "#0B7C85", "#3CC3C0", "#C9F4EE"]),
        Palette("Graphite", ["#0A0A0B", "#1B1C1F", "#3A3C42", "#7A7D86", "#D6D8DD"]),
        Palette("Sorbet", ["#3B2A4F", "#D46A8C", "#F29E7E", "#F9D38C", "#FFF4E6"]),
        Palette("Aurora", ["#030712", "#0B2A3A", "#0F7C6B", "#6BE0A0", "#D8F7C4"]),
        Palette("Ivory Ink", ["#111111", "#3A3530", "#8C8475", "#D8D0BF", "#F3EEE3"]),
        Palette("Cobalt", ["#02061A", "#0A1D66", "#1440C7", "#4D8BFF", "#CFE0FF"]),
        Palette("Rosewood", ["#1A0B0E", "#4A1621", "#8E3346", "#D98A8F", "#F6DADA"]),
        Palette("Terracotta", ["#1F0E08", "#5A2414", "#A9502C", "#D98E5F", "#F3D9C4"]),
        Palette("Glacier", ["#0D1620", "#2E4A5E", "#6F92A8", "#B9D2DE", "#EEF6F9"]),
        Palette("Orchid", ["#12051E", "#3D0F5C", "#7B2FA8", "#C27BE0", "#F1DDFB"]),
        Palette("Moss", ["#0C120A", "#26361D", "#4F6B38", "#9DB26F", "#E4EACB"]),
        Palette("Solar", ["#1A0500", "#7A1A00", "#FF4A00", "#FF9E1B", "#FFE8A3"]),
        Palette("Candy", ["#1B0F3A", "#5B2BD9", "#FF4FA3", "#FFB347", "#FFF0C2"]),
        Palette("Champagne", ["#221C14", "#5C4B35", "#A88A62", "#DCC7A5", "#F7EEDD"]),
        Palette("Oxblood", ["#0F0304", "#3B090D", "#7A1219", "#B8332D", "#E8A58C"]),
        Palette("Lilac Haze", ["#1D1A2E", "#4B4470", "#8C84B8", "#C8C2E6", "#F2EFFB"]),
        Palette("Tropic", ["#04160F", "#0B4D2C", "#129A55", "#F2A541", "#FFE7B8"]),
        Palette("Saffron", ["#1C1003", "#6B3B05", "#C77A0A", "#F2B544", "#FDEBC8"]),
        Palette("Sumi", ["#0B0C0E", "#24272B", "#555A61", "#A3A8AE", "#EDEEEF"]),
        Palette("Mint Cream", ["#0E2420", "#2F5E52", "#7FB8A4", "#C8E8D8", "#F4FBF6"]),
        Palette("Steel", ["#0E141B", "#26384A", "#4D6F8C", "#8FB1CC", "#DCE8F2"]),
        Palette("Citrus", ["#1E2A12", "#4E6B12", "#A8C512", "#F2D429", "#FFF6C7"]),
        Palette("Blush Noir", ["#0B0708", "#2B1519", "#6B3440", "#C7808C", "#F5D6DB"]),
        Palette("Indigo", ["#1C2B4A", "#3E5C86", "#8FA9C4", "#D8C3A0", "#F4EFE6"]),
        Palette("Gallery", ["#A89A85", "#CDBFAA", "#E3D9C8", "#F1EBE0", "#FAF7F0"]),
        Palette("Linen", ["#6F6A62", "#A39D92", "#CFC9BE", "#E7E2D8", "#F6F3EE"]),
        Palette("Kelp", ["#0F1A17", "#1F3B35", "#3C6E62", "#C9A66B", "#F1E9DA"]),
    ]

    public static func named(_ id: String) -> Palette {
        all.first { $0.id == id || $0.name == id } ?? all[0]
    }

    public static let `default` = named("nocturne")
}

public extension Palette {
    /// A palette drawn from images: their main colours by area, from dark to
    /// light, with a deep and a pale anchor made from the leading hue when the
    /// images have neither, so every backdrop look can use it.
    static func extract(from images: [CGImage], id: String = "from-media", name: String) -> Palette? {
        let side = 32
        var samples: [SIMD3<Float>] = []
        for image in images.prefix(24) {
            guard let space = CGColorSpace(name: CGColorSpace.sRGB),
                  let ctx = CGContext(data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: side * 4,
                                      space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { continue }
            ctx.interpolationQuality = .medium
            ctx.draw(image, in: CGRect(x: 0, y: 0, width: side, height: side))
            guard let data = ctx.data else { continue }
            let p = data.bindMemory(to: UInt8.self, capacity: side * side * 4)
            for i in 0..<(side * side) {
                let a = Float(p[i * 4 + 3]) / 255
                guard a > 0.5 else { continue }
                samples.append(RGB(Float(p[i * 4]) / 255 / a, Float(p[i * 4 + 1]) / 255 / a, Float(p[i * 4 + 2]) / 255 / a).oklab)
            }
        }
        guard samples.count > 64 else { return nil }

        // k-means in OKLab, seeded along lightness so the same images give the same palette.
        let k = 6
        let lightness = samples.map(\.x).sorted()
        var centers: [SIMD3<Float>] = (0..<k).map { j in
            let q = lightness[min(lightness.count - 1, (2 * j + 1) * lightness.count / (2 * k))]
            return samples.min { abs($0.x - q) < abs($1.x - q) } ?? SIMD3(q, 0, 0)
        }
        var counts = [Int](repeating: 0, count: k)
        func distance(_ a: SIMD3<Float>, _ b: SIMD3<Float>) -> Float {
            let d = a - b
            return d.x * d.x + 2 * (d.y * d.y + d.z * d.z)
        }
        for _ in 0..<12 {
            var sums = [SIMD3<Float>](repeating: .zero, count: k)
            counts = [Int](repeating: 0, count: k)
            for s in samples {
                var best = 0
                for j in 1..<k where distance(s, centers[j]) < distance(s, centers[best]) { best = j }
                sums[best] += s
                counts[best] += 1
            }
            for j in 0..<k where counts[j] > 0 { centers[j] = sums[j] / Float(counts[j]) }
        }

        // Keep colours that cover a real share of the work, merging near twins.
        var picked: [(color: SIMD3<Float>, weight: Int)] = []
        for j in (0..<k).sorted(by: { counts[$0] > counts[$1] }) where counts[j] * 33 >= samples.count {
            if let m = picked.firstIndex(where: { distance($0.color, centers[j]) < 0.004 }) {
                picked[m].weight += counts[j]
            } else {
                picked.append((centers[j], counts[j]))
            }
        }
        var colors = Array(picked.prefix(5).map(\.color))
        guard !colors.isEmpty else { return nil }

        // The leading hue: the most colourful of the main colours.
        let lead = colors.max { ($0.y * $0.y + $0.z * $0.z) < ($1.y * $1.y + $1.z * $1.z) } ?? colors[0]
        let chroma = sqrtf(lead.y * lead.y + lead.z * lead.z)
        let hue = chroma > 0.001 ? SIMD2(lead.y, lead.z) / chroma : SIMD2<Float>(0, 0)
        if (colors.map(\.x).min() ?? 1) > 0.3 {
            let c = min(0.06, chroma * 0.6)
            colors.append(SIMD3(0.16, hue.x * c, hue.y * c))
        }
        if (colors.map(\.x).max() ?? 0) < 0.82 {
            let c = min(0.025, chroma * 0.3)
            colors.append(SIMD3(0.95, hue.x * c, hue.y * c))
        }
        let rgb = colors.sorted { $0.x < $1.x }.map { lab -> RGB in
            let lin = ColorMath.oklabToLinear(lab)
            return RGB(linear: simd_clamp(lin, SIMD3(repeating: 0), SIMD3(repeating: 1)))
        }
        return Palette(id: id, name: name, colors: Array(rgb.prefix(8)))
    }
}
