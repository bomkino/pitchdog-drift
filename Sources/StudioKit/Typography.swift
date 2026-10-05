import AppKit
import CoreText
import SwiftUI

/// Interface text roles, set in the system font so the apps read as native
/// Mac apps: sizes follow the macOS inspector scale, numbers use tabular
/// figures, and nothing depends on bundled fonts.
public enum TextRole: String, CaseIterable, Sendable {
    case display, pageTitle, sectionTitle, panelTitle, body, bodyCompact, label, action, input, caption, badge, metadata, data, code
}

public struct TextRoleSpec: Sendable {
    public var size: CGFloat
    public var weight: Font.Weight
    public var design: Font.Design = .default
    public var tracking: CGFloat = 0  // in points
    public var uppercase = false
    public var monospacedDigits = false
}

public enum StudioType {
    /// Reported by headless runs, so a check can see which type the interface uses.
    public static let status = "system type, \(TextRole.allCases.count) roles, \(ReelTitle.Face.allCases.count) title faces"

    public static func spec(_ role: TextRole) -> TextRoleSpec {
        switch role {
        case .display: return TextRoleSpec(size: 26, weight: .semibold, tracking: -0.4)
        case .pageTitle: return TextRoleSpec(size: 20, weight: .semibold, tracking: -0.2)
        case .sectionTitle: return TextRoleSpec(size: 15, weight: .semibold)
        case .panelTitle: return TextRoleSpec(size: 17, weight: .semibold, tracking: -0.2)
        case .body: return TextRoleSpec(size: 13, weight: .regular)
        case .bodyCompact: return TextRoleSpec(size: 12, weight: .regular)
        case .label: return TextRoleSpec(size: 12, weight: .semibold)
        case .action: return TextRoleSpec(size: 13, weight: .medium)
        case .input: return TextRoleSpec(size: 13, weight: .regular)
        case .caption: return TextRoleSpec(size: 11.5, weight: .regular)
        case .badge: return TextRoleSpec(size: 9.5, weight: .semibold, tracking: 0.4, uppercase: true)
        case .metadata: return TextRoleSpec(size: 11, weight: .regular)
        case .data: return TextRoleSpec(size: 11.5, weight: .medium, monospacedDigits: true)
        case .code: return TextRoleSpec(size: 11, weight: .regular, design: .monospaced)
        }
    }

    public static func font(_ role: TextRole, size: CGFloat? = nil) -> Font {
        let s = spec(role)
        let f = Font.system(size: size ?? s.size, weight: s.weight, design: s.design)
        return s.monospacedDigits ? f.monospacedDigit() : f
    }

    public static func nsFont(_ role: TextRole, size: CGFloat? = nil) -> NSFont {
        let s = spec(role)
        let weight: NSFont.Weight
        switch s.weight {
        case .semibold: weight = .semibold
        case .medium: weight = .medium
        case .bold: weight = .bold
        default: weight = .regular
        }
        return s.design == .monospaced
            ? NSFont.monospacedSystemFont(ofSize: size ?? s.size, weight: weight)
            : NSFont.systemFont(ofSize: size ?? s.size, weight: weight)
    }
}

public struct StudioTextStyle: ViewModifier {
    let role: TextRole
    let size: CGFloat?

    public func body(content: Content) -> some View {
        let s = StudioType.spec(role)
        return content
            .font(StudioType.font(role, size: size))
            .tracking(s.tracking)
            .textCase(s.uppercase ? .uppercase : nil)
    }
}

extension View {
    /// Applies an interface text role.
    public func textStyle(_ role: TextRole, size: CGFloat? = nil) -> some View {
        modifier(StudioTextStyle(role: role, size: size))
    }
}

// MARK: - Faces for words set into the picture

public enum Faces {
    /// A face by PostScript name, falling back to a licensed sans if missing.
    public static func font(_ name: String, size: CGFloat) -> CTFont {
        let f = CTFontCreateWithName(name as CFString, size, nil)
        let got = CTFontCopyPostScriptName(f) as String
        if got == name { return f }
        return CTFontCreateWithName("HelveticaNeue-Medium" as CFString, size, nil)
    }

    /// Avenir Next at a weight, for sample slides and other rendered content.
    public static func avenir(_ size: CGFloat, _ weight: Double = 400) -> CTFont {
        let name: String
        switch weight {
        case ..<450: name = "AvenirNext-Regular"
        case ..<550: name = "AvenirNext-Medium"
        case ..<650: name = "AvenirNext-DemiBold"
        case ..<750: name = "AvenirNext-Bold"
        default: name = "AvenirNext-Heavy"
        }
        return font(name, size: size)
    }
}

/// Finds bundled resources in an app bundle, or in the source tree during development.
public enum StudioResources {
    nonisolated(unsafe) private static var cache: [String: URL] = [:]

    public static func url(_ name: String) -> URL? {
        if let c = cache[name] { return c }
        let fm = FileManager.default
        if let r = Bundle.main.resourceURL?.appendingPathComponent(name), fm.fileExists(atPath: r.path) {
            cache[name] = r
            return r
        }
        if let env = ProcessInfo.processInfo.environment["STUDIO_RESOURCES"] {
            let r = URL(fileURLWithPath: env).appendingPathComponent(name)
            if fm.fileExists(atPath: r.path) { cache[name] = r; return r }
        }
        var dir = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath().deletingLastPathComponent()
        for _ in 0..<8 {
            let candidate = dir.appendingPathComponent("Resources").appendingPathComponent(name)
            if fm.fileExists(atPath: candidate.path) { cache[name] = candidate; return candidate }
            dir = dir.deletingLastPathComponent()
        }
        return nil
    }
}
