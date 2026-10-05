import AppKit
import SwiftUI

/// Planes, ink, spacing, radii and motion. The interface stays neutral grey so
/// the work on the stage carries all the colour; the one emphasis is the
/// interface's own ink, white in dark windows and near-black in light ones.
/// Text uses system semantic styles so vibrancy, Increase Contrast and
/// inactive windows keep working.
public enum Theme {
    // MARK: Planes

    /// Around the output frame. Neutral by rule (R = G = B) so artwork colour reads true.
    public static let surround = Color(nsColor: .studio(light: 0xE2E2E4, dark: 0x0C0C0D))
    /// Sidebar, inspector and transport.
    public static let chrome = Color(nsColor: .studio(light: 0xF5F5F6, dark: 0x161617))
    /// Popovers, tiles and cards.
    public static let raised = Color(nsColor: .studio(light: 0xFFFFFF, dark: 0x202022))
    /// Recessed wells such as slider tracks and fields.
    public static let well = Color(nsColor: .studio(light: 0xE6E6E9, dark: 0x2A2A2D))
    /// The selected segment in a choice row: lifts off its track in both appearances.
    public static let segmentOn = Color(nsColor: .studio(light: 0xFFFFFF, dark: 0x45454A))
    public static let hairline = Color(nsColor: .studioAlpha(light: 0x000000, lightAlpha: 0.09, dark: 0xFFFFFF, darkAlpha: 0.08))

    // MARK: Emphasis

    /// Selection rings, slider fills, the playhead and the one prominent button.
    public static let accent = Color(nsColor: .studio(light: 0x1C1C1E, dark: 0xF4F4F5))
    /// Emphasised text and glyphs.
    public static let accentInk = Color(nsColor: .studio(light: 0x1C1C1E, dark: 0xFFFFFF))
    public static let accentSoft = Color(nsColor: .studioAlpha(light: 0x000000, lightAlpha: 0.06, dark: 0xFFFFFF, darkAlpha: 0.09))
    /// Text and glyphs set on `accent`.
    public static let onAccent = Color(nsColor: .studio(light: 0xFFFFFF, dark: 0x111112))

    // MARK: Text

    public static let textPrimary = Color.primary
    public static let textSecondary = Color.secondary
    public static let textTertiary = Color(nsColor: .tertiaryLabelColor)

    // MARK: Space (4 pt grid)

    public enum Space {
        public static let xxs: CGFloat = 2
        public static let xs: CGFloat = 4
        public static let s: CGFloat = 8
        public static let m: CGFloat = 12
        public static let l: CGFloat = 16
        public static let xl: CGFloat = 20
        public static let xxl: CGFloat = 24
        public static let xxxl: CGFloat = 32
    }

    /// Compact pointer density: 28 pt controls, 36 pt rows, 8 pt gaps.
    public enum Density {
        public static let control: CGFloat = 28
        public static let row: CGFloat = 36
        public static let gap: CGFloat = 8
    }

    // MARK: Radii

    public enum Radius {
        public static let thumb: CGFloat = 5
        public static let control: CGFloat = 7
        public static let tile: CGFloat = 10
        public static let stage: CGFloat = 6
        public static let capsule: CGFloat = 14
    }

    // MARK: Motion

    public static let spring = Animation.spring(response: 0.28, dampingFraction: 1)
    public static let quick = Animation.easeOut(duration: 0.12)
    public static let reorder = Animation.spring(response: 0.22, dampingFraction: 0.9)
}

extension NSColor {
    public convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
    }

    static func isDark(_ appearance: NSAppearance) -> Bool {
        appearance.bestMatch(from: [.aqua, .darkAqua, .accessibilityHighContrastAqua, .accessibilityHighContrastDarkAqua])
            .map { $0 == .darkAqua || $0 == .accessibilityHighContrastDarkAqua } ?? false
    }

    public static func studio(light: UInt32, dark: UInt32) -> NSColor {
        NSColor(name: nil) { appearance in NSColor(hex: isDark(appearance) ? dark : light) }
    }

    public static func studioAlpha(light: UInt32, lightAlpha: CGFloat, dark: UInt32, darkAlpha: CGFloat) -> NSColor {
        NSColor(name: nil) { appearance in
            isDark(appearance) ? NSColor(hex: dark, alpha: darkAlpha) : NSColor(hex: light, alpha: lightAlpha)
        }
    }
}

/// The user's appearance preference. Studio apps open in the dark
/// "screening room" unless asked otherwise.
public enum AppearanceChoice: String, CaseIterable, Identifiable {
    case dark, light, system
    public var id: String { rawValue }
    public var title: String {
        switch self {
        case .dark: return "Dark"
        case .light: return "Light"
        case .system: return "Match System"
        }
    }
    public var colorScheme: ColorScheme? {
        switch self {
        case .dark: return .dark
        case .light: return .light
        case .system: return nil
        }
    }
}
