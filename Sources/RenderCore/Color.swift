import Foundation
import simd

/// An sRGB-encoded colour with components in 0…1.
public struct RGB: Codable, Hashable, Sendable {
    public var r: Float
    public var g: Float
    public var b: Float

    public init(_ r: Float, _ g: Float, _ b: Float) {
        self.r = r
        self.g = g
        self.b = b
    }

    /// "#RRGGBB" or "RRGGBB".
    public init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        let v = UInt32(s, radix: 16) ?? 0
        self.init(Float((v >> 16) & 0xFF) / 255, Float((v >> 8) & 0xFF) / 255, Float(v & 0xFF) / 255)
    }

    public var hex: String {
        func c(_ x: Float) -> Int { Int((max(0, min(1, x)) * 255).rounded()) }
        return String(format: "#%02X%02X%02X", c(r), c(g), c(b))
    }

    public var simd: SIMD3<Float> { SIMD3(r, g, b) }

    public var linear: SIMD3<Float> {
        SIMD3(ColorMath.srgbToLinear(r), ColorMath.srgbToLinear(g), ColorMath.srgbToLinear(b))
    }

    public init(linear c: SIMD3<Float>) {
        self.init(ColorMath.linearToSrgb(c.x), ColorMath.linearToSrgb(c.y), ColorMath.linearToSrgb(c.z))
    }

    public var oklab: SIMD3<Float> { ColorMath.linearToOklab(linear) }

    /// Perceptual lightness (OKLab L), 0…1.
    public var lightness: Float { oklab.x }

    public static let black = RGB(0, 0, 0)
    public static let white = RGB(1, 1, 1)
}

public enum ColorMath {
    public static func srgbToLinear(_ c: Float) -> Float {
        c <= 0.04045 ? c / 12.92 : powf((c + 0.055) / 1.055, 2.4)
    }

    public static func linearToSrgb(_ c: Float) -> Float {
        let v = max(0, c)
        return v <= 0.0031308 ? v * 12.92 : 1.055 * powf(v, 1 / 2.4) - 0.055
    }

    public static func linearToOklab(_ c: SIMD3<Float>) -> SIMD3<Float> {
        let l = 0.4122214708 * c.x + 0.5363325363 * c.y + 0.0514459929 * c.z
        let m = 0.2119034982 * c.x + 0.6806995451 * c.y + 0.1073969566 * c.z
        let s = 0.0883024619 * c.x + 0.2817188376 * c.y + 0.6299787005 * c.z
        let l_ = cbrtf(l), m_ = cbrtf(m), s_ = cbrtf(s)
        return SIMD3(
            0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
            1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
            0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
        )
    }

    public static func oklabToLinear(_ c: SIMD3<Float>) -> SIMD3<Float> {
        let l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z
        let m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z
        let s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z
        let l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_
        return SIMD3(
            4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
        )
    }

    /// OKLCH → sRGB, clamped. Hue in degrees.
    public static func oklch(_ l: Float, _ c: Float, _ h: Float) -> RGB {
        let a = c * cosf(h * .pi / 180), b = c * sinf(h * .pi / 180)
        let lin = oklabToLinear(SIMD3(l, a, b))
        return RGB(linear: simd_clamp(lin, SIMD3(repeating: 0), SIMD3(repeating: 1)))
    }

    public static func mix(_ a: RGB, _ b: RGB, _ t: Float) -> RGB {
        let la = a.oklab, lb = b.oklab
        return RGB(linear: simd_max(oklabToLinear(la + (lb - la) * t), SIMD3(repeating: 0)))
    }
}
