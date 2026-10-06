import Foundation
import RenderCore

/// The eight families of the Backdrop catalogue.
public enum BackdropFamily: String, Codable, CaseIterable, Identifiable, Sendable {
    case ground, paper, ink, light, glass, lines, flow, cells

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .ground: return "Ground"
        case .paper: return "Paper"
        case .ink: return "Ink & Wash"
        case .light: return "Light"
        case .glass: return "Glass"
        case .lines: return "Lines & Waves"
        case .flow: return "Flow"
        case .cells: return "Cells & Dots"
        }
    }

    public var symbol: String {
        switch self {
        case .ground: return "circle.lefthalf.filled"
        case .paper: return "doc.plaintext"
        case .ink: return "drop"
        case .light: return "sun.max"
        case .glass: return "rectangle.split.3x1"
        case .lines: return "water.waves"
        case .flow: return "tornado"
        case .cells: return "circle.grid.3x3"
        }
    }
}

/// Names for the five shared controls, per look. `nil` hides a control.
public struct ControlLabels: Hashable, Sendable {
    public var scale: String?
    public var motion: String?
    public var detail: String?
    public var softness: String?
    public var accent: String?

    public init(scale: String? = "Scale", motion: String? = "Motion", detail: String? = "Detail",
                softness: String? = "Softness", accent: String? = nil) {
        self.scale = scale
        self.motion = motion
        self.detail = detail
        self.softness = softness
        self.accent = accent
    }
}

/// Everything needed to reproduce a background exactly.
public struct BackdropSettings: Codable, Hashable, Sendable {
    public var style: String
    public var palette: Palette
    public var seed: UInt32
    public var scale: Float
    public var motion: Float
    public var detail: Float
    public var softness: Float
    public var accent: Float
    /// Darkens the edges of the background only. Slides and media are never vignetted.
    public var vignette: Float
    /// Overall brightness multiplier, applied in linear light.
    public var brightness: Float

    public init(style: String, palette: Palette, seed: UInt32 = 7, scale: Float = 0.5, motion: Float = 0.4,
                detail: Float = 0.5, softness: Float = 0.5, accent: Float = 0.5, vignette: Float = 0.25,
                brightness: Float = 1) {
        self.style = style
        self.palette = palette
        self.seed = seed
        self.scale = scale
        self.motion = motion
        self.detail = detail
        self.softness = softness
        self.accent = accent
        self.vignette = vignette
        self.brightness = brightness
    }

    public var styleInfo: BackdropStyle { BackdropCatalog.style(style) }
}

public struct BackdropStyle: Identifiable, Hashable, Sendable {
    public let id: String
    public let family: BackdropFamily
    public let name: String
    public let summary: String
    public let labels: ControlLabels
    public let defaults: BackdropSettings
    /// Heavier looks render previews at reduced resolution.
    public let cost: Int

    public static func == (a: BackdropStyle, b: BackdropStyle) -> Bool { a.id == b.id }
    public func hash(into h: inout Hasher) { h.combine(id) }
}

public enum BackdropCatalog {
    private static func s(_ id: String, _ family: BackdropFamily, _ name: String, _ summary: String,
                          palette: String, labels: ControlLabels = ControlLabels(), cost: Int = 1,
                          scale: Float = 0.5, motion: Float = 0.4, detail: Float = 0.5, softness: Float = 0.5,
                          accent: Float = 0.5, vignette: Float = 0.25, seed: UInt32 = 7) -> BackdropStyle {
        BackdropStyle(id: id, family: family, name: name, summary: summary, labels: labels,
                      defaults: BackdropSettings(style: id, palette: Palettes.named(palette), seed: seed, scale: scale,
                                                 motion: motion, detail: detail, softness: softness, accent: accent,
                                                 vignette: vignette),
                      cost: cost)
    }

    public static let styles: [BackdropStyle] = [
        // Ground
        s("studio", .ground, "Studio", "A soft photographic sweep with a pool of light. Made for floating work.",
          palette: "graphite", labels: .init(scale: "Horizon", motion: "Drift", detail: "Light", softness: "Softness", accent: "Glow"),
          scale: 0.45, motion: 0.3, detail: 0.55, softness: 0.6, accent: 0.35, vignette: 0.35),
        s("softbloom", .ground, "Soft Bloom", "Five pools of colour drifting on slow orbits.",
          palette: "dusk", labels: .init(scale: "Scale", motion: "Travel", detail: "Lights", softness: "Softness", accent: "Ground"),
          scale: 0.45, motion: 0.5, detail: 0.6, softness: 0.55, accent: 0.0, vignette: 0.15),
        s("mesh", .ground, "Mesh", "Colour pools that breathe into one another.",
          palette: "dusk", labels: .init(scale: "Scale", motion: "Motion", detail: "Warp", softness: "Blend", accent: "Ground"),
          scale: 0.55, motion: 0.4, detail: 0.45, softness: 0.55, accent: 0.2),
        s("fade", .ground, "Fade", "A calm, grained gradient.",
          palette: "nocturne", labels: .init(scale: "Waviness", motion: "Motion", detail: "Drift", softness: "Softness", accent: "Angle"),
          scale: 0.4, motion: 0.3, detail: 0.3, softness: 0.6, accent: 0.5, vignette: 0.2),
        s("solid", .ground, "Solid", "One colour from the palette, with a slow breath of light.",
          palette: "graphite", labels: .init(scale: nil, motion: "Breath", detail: "Grain", softness: nil, accent: "Tone"),
          scale: 0.5, motion: 0.4, detail: 0.3, softness: 0.5, accent: 0.3, vignette: 0.2),
        s("linear", .ground, "Linear", "A clean gradient across the palette, at any angle.",
          palette: "nocturne", labels: .init(scale: "Spread", motion: "Sway", detail: "Grain", softness: "Softness", accent: "Angle"),
          scale: 0.5, motion: 0.3, detail: 0.35, softness: 0.6, accent: 0.5, vignette: 0.1),
        s("radial", .ground, "Radial", "Colour spreading from a point that drifts on a small orbit.",
          palette: "dusk", labels: .init(scale: "Spread", motion: "Drift", detail: "Grain", softness: "Softness", accent: "Height"),
          scale: 0.55, motion: 0.35, detail: 0.35, softness: 0.6, accent: 0.55, vignette: 0.15),
        s("conic", .ground, "Conic", "Colour swept round a point, swaying slowly.",
          palette: "orchid", labels: .init(scale: "Lobes", motion: "Sway", detail: "Grain", softness: "Softness", accent: "Height"),
          scale: 0.0, motion: 0.35, detail: 0.35, softness: 0.55, accent: 0.5, vignette: 0.2),
        // Paper
        s("paper", .paper, "Paper", "Fibre, tooth and a slow travelling light.",
          palette: "paper-moon", labels: .init(scale: "Tooth", motion: "Light", detail: "Fibre", softness: "Mottle", accent: "Tone"),
          scale: 0.5, motion: 0.3, detail: 0.5, softness: 0.4, accent: 0.2, vignette: 0.2),
        s("riso", .paper, "Riso", "Two inks, stochastic dots, gentle misregistration.",
          palette: "sorbet", labels: .init(scale: "Scale", motion: "Motion", detail: "Dot", softness: "Softness"),
          scale: 0.45, motion: 0.3, detail: 0.35, softness: 0.25, vignette: 0.1),
        // Ink & Wash
        s("wash", .ink, "Wash", "Watercolour pools with dark, drying edges.",
          palette: "indigo", labels: .init(scale: "Scale", motion: "Bleed", detail: "Flow", softness: "Wetness", accent: "Coverage"),
          cost: 3, scale: 0.45, motion: 0.3, detail: 0.5, softness: 0.4, accent: 0.45, vignette: 0.15),
        s("ink", .ink, "Ink", "Tendrils of ink feathering through white paper.",
          palette: "sumi", labels: .init(scale: "Scale", motion: "Motion", detail: "Curl", softness: "Filament", accent: "Spread"),
          cost: 3, scale: 0.4, motion: 0.3, detail: 0.35, softness: 0.3, accent: 0.45, vignette: 0.12),
        // Light
        s("halo", .light, "Halo", "A luminous stage halo behind your work.",
          palette: "dusk", labels: .init(scale: "Size", motion: "Breath", detail: "Wobble", softness: "Softness", accent: "Ring"),
          scale: 0.5, motion: 0.4, detail: 0.45, softness: 0.55, accent: 0.5, vignette: 0.12),
        s("aurora", .light, "Aurora", "Curtains of light over a deep night sky.",
          palette: "aurora", labels: .init(scale: "Height", motion: "Motion", detail: "Rays", softness: "Softness", accent: "Intensity"),
          cost: 3, scale: 0.5, motion: 0.4, detail: 0.6, softness: 0.5, accent: 0.55, vignette: 0.25),
        s("bloom", .light, "Bloom", "Soft orbs of light drifting in the dark.",
          palette: "ember", labels: .init(scale: "Size", motion: "Drift", detail: "Lights", softness: "Softness", accent: "Intensity"),
          scale: 0.55, motion: 0.35, detail: 0.5, softness: 0.55, accent: 0.45, vignette: 0.3),
        s("leak", .light, "Light Leak", "Warm film flares that wander in from the edges.",
          palette: "solar", labels: .init(scale: "Spread", motion: "Wander", detail: "Streak", softness: "Softness", accent: "Heat"),
          scale: 0.5, motion: 0.4, detail: 0.3, softness: 0.55, accent: 0.45, vignette: 0.35),
        s("bokeh", .light, "Bokeh", "Out-of-focus lights rising slowly.",
          palette: "nocturne", labels: .init(scale: "Size", motion: "Rise", detail: "Density", softness: "Edge", accent: "Glow"),
          cost: 2, scale: 0.5, motion: 0.3, detail: 0.45, softness: 0.4, accent: 0.4, vignette: 0.35),
        s("rays", .light, "Rays", "Light falling through haze and dust.",
          palette: "champagne", labels: .init(scale: "Reach", motion: "Shimmer", detail: "Beams", softness: "Softness", accent: "Source"),
          scale: 0.45, motion: 0.35, detail: 0.5, softness: 0.5, accent: 0.4, vignette: 0.3),
        s("caustics", .light, "Caustics", "Sunlight through moving water, dancing on a pool floor.",
          palette: "lagoon", labels: .init(scale: "Scale", motion: "Swell", detail: "Light", softness: "Softness", accent: "Sparkle"),
          cost: 2, scale: 0.55, motion: 0.45, detail: 0.5, softness: 0.4, accent: 0.5, vignette: 0.25),
        // Glass
        s("fluted", .glass, "Fluted Glass", "Colour seen through reeded glass.",
          palette: "lagoon", labels: .init(scale: "Reed", motion: "Motion", detail: "Refraction", softness: "Blur", accent: "Ground"),
          scale: 0.45, motion: 0.35, detail: 0.5, softness: 0.5, accent: 0.3),
        s("frost", .glass, "Frost", "Frosted glass with a scatter of droplets.",
          palette: "glacier", labels: .init(scale: "Scale", motion: "Motion", detail: "Droplets", softness: "Blend", accent: "Ground"),
          cost: 2, scale: 0.5, motion: 0.35, detail: 0.35, softness: 0.5, accent: 0.3),
        s("iris", .glass, "Iridescence", "A thin film on a slowly folding sheet, its colours shifting like soap or oil.",
          palette: "lilac-haze", labels: .init(scale: "Scale", motion: "Motion", detail: "Film", softness: "Smoothness", accent: "Colour"),
          cost: 2, scale: 0.45, motion: 0.35, detail: 0.5, softness: 0.5, accent: 0.35, vignette: 0.2),
        // Lines & Waves
        s("contours", .lines, "Contours", "Topographic lines over a moving landscape.",
          palette: "verdigris", labels: .init(scale: "Scale", motion: "Motion", detail: "Lines", softness: "Weight", accent: "Fill"),
          cost: 2, scale: 0.45, motion: 0.3, detail: 0.45, softness: 0.3, accent: 0.5),
        s("silk", .lines, "Silk", "Threads of light in a slow swell.",
          palette: "orchid", labels: .init(scale: "Swell", motion: "Motion", detail: "Threads", softness: "Weight", accent: "Glow"),
          cost: 2, scale: 0.5, motion: 0.4, detail: 0.55, softness: 0.4, accent: 0.5),
        s("linefield", .lines, "Line Field", "A swell of fine lines that frames the work.",
          palette: "steel", labels: .init(scale: "Swell", motion: "Motion", detail: "Density", softness: "Weight", accent: "Angle"),
          scale: 0.45, motion: 0.4, detail: 0.5, softness: 0.3, accent: 0.5, vignette: 0.2),
        s("ridgelines", .lines, "Ridgelines", "Stacked landscape profiles, monumental and calm.",
          palette: "graphite", labels: .init(scale: "Width", motion: "Motion", detail: "Lines", softness: "Weight", accent: "Height"),
          cost: 1, scale: 0.5, motion: 0.35, detail: 0.55, softness: 0.35, accent: 0.5, vignette: 0.15),
        s("dunes", .lines, "Dunes", "Layered paper hills, cut and shadowed.",
          palette: "terracotta", labels: .init(scale: "Height", motion: nil, detail: "Layers", softness: "Edge", accent: "Shadow"),
          scale: 0.5, motion: 0.35, detail: 0.5, softness: 0.2, accent: 0.6, vignette: 0.15),
        // Flow
        s("smoke", .flow, "Smoke", "Slow smoke and silk, low contrast.",
          palette: "lilac-haze", labels: .init(scale: "Scale", motion: "Motion", detail: "Warp", softness: "Range", accent: "Depth"),
          cost: 3, scale: 0.45, motion: 0.35, detail: 0.5, softness: 0.4, accent: 0.25, vignette: 0.2),
        s("marble", .flow, "Marble", "Folded colour, like marbled endpapers.",
          palette: "rosewood", labels: .init(scale: "Scale", motion: "Motion", detail: "Fold", softness: "Softness", accent: "Veins"),
          cost: 3, scale: 0.45, motion: 0.3, detail: 0.5, softness: 0.5, accent: 0.4),
        s("chrome", .flow, "Liquid", "A polished liquid surface catching the light.",
          palette: "steel", labels: .init(scale: "Scale", motion: "Motion", detail: "Ripple", softness: "Gloss", accent: "Shine"),
          cost: 3, scale: 0.45, motion: 0.3, detail: 0.45, softness: 0.45, accent: 0.4),
        s("lava", .flow, "Lava", "Slow blobs that merge and part.",
          palette: "dusk", labels: .init(scale: "Size", motion: "Motion", detail: "Blobs", softness: "Edge", accent: "Glow"),
          scale: 0.55, motion: 0.35, detail: 0.45, softness: 0.55, accent: 0.4),
        // Cells & Dots
        s("cells", .cells, "Cells", "Soft panes of colour set in dark leading.",
          palette: "lagoon", labels: .init(scale: "Size", motion: "Motion", detail: "Depth", softness: "Leading", accent: "Glint"),
          scale: 0.6, motion: 0.3, detail: 0.5, softness: 0.45, accent: 0.5, vignette: 0.35),
        s("halftone", .cells, "Halftone", "Printed dots following a drifting field.",
          palette: "ivory-ink", labels: .init(scale: "Field", motion: "Motion", detail: "Screen", softness: "Softness", accent: "Ink"),
          scale: 0.45, motion: 0.3, detail: 0.35, softness: 0.1, accent: 0.2, vignette: 0.1),
        s("dotgrid", .cells, "Dot Grid", "Engineering dots with a slow light passing over.",
          palette: "graphite", labels: .init(scale: "Dot", motion: nil, detail: "Density", softness: "Beam", accent: "Direction"),
          scale: 0.45, motion: 0.4, detail: 0.45, softness: 0.5, accent: 0.3, vignette: 0.3),
        s("matrix", .cells, "Dot Matrix", "A field of lit points carrying a wave.",
          palette: "cobalt", labels: .init(scale: "Wave", motion: "Motion", detail: "Density", softness: "Softness", accent: "Glow"),
          scale: 0.45, motion: 0.4, detail: 0.4, softness: 0.4, accent: 0.45, vignette: 0.3),
    ]

    public static func style(_ id: String) -> BackdropStyle {
        styles.first { $0.id == id } ?? styles[0]
    }

    public static func styles(in family: BackdropFamily) -> [BackdropStyle] {
        styles.filter { $0.family == family }
    }

    public static var defaultSettings: BackdropSettings { style("studio").defaults }
}
