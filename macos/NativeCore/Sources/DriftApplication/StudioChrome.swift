import AppKit
import SwiftUI
#if canImport(PitchdogStudioUI)
import PitchdogStudioUI
#endif

/// Application-local adapter. A visual pilot must not mutate a document or audio state.
struct DriftChrome: ViewModifier {
    #if canImport(PitchdogStudioUI)
    @Environment(\.colorScheme) private var scheme
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.controlActiveState) private var active
    @State private var colorRevision = 0
    private var theme: StudioTheme {
        _ = colorRevision
        let color = NSColor.controlAccentColor.usingColorSpace(.sRGB) ?? NSColor.systemBlue
        func channel(_ v: CGFloat) -> UInt32 { UInt32((min(1, max(0, v)) * 255).rounded()) }
        let rgb = channel(color.redComponent) << 16 | channel(color.greenComponent) << 8 | channel(color.blueComponent)
        return StudioTheme(appearance: scheme == .dark ? .dark : .light, accent: StudioRGB(hex: rgb),
                           increasedContrast: contrast == .increased, reduceMotion: reduceMotion, isActive: active != .inactive)
    }
    #endif
    func body(content: Content) -> some View {
        #if canImport(PitchdogStudioUI)
        content.studioTheme(theme).buttonStyle(StudioButtonStyle()).textFieldStyle(DriftFieldStyle()).studioType(.bodyCompact).studioTypography(DriftType.typography)
            .onReceive(NotificationCenter.default.publisher(for: NSColor.systemColorsDidChangeNotification)) { _ in colorRevision += 1 }
        #else
        content
        #endif
    }
}

enum DriftSurfaceRole { case window, panel, surround }
struct DriftSurface: ViewModifier {
    let role: DriftSurfaceRole
    #if canImport(PitchdogStudioUI)
    @Environment(\.studioTheme) private var theme
    #endif
    func body(content: Content) -> some View {
        #if canImport(PitchdogStudioUI)
        content.background((role == .panel ? theme.panel : role == .surround ? theme.surround : theme.window).color)
        #else
        content.background(Color(nsColor: role == .surround ? .underPageBackgroundColor : .windowBackgroundColor))
        #endif
    }
}

/// Field decoration only; NumberEdit still owns its captured commit, draft and Escape policy.
struct DriftFieldStyle: TextFieldStyle {
    var focused = false
    var invalid = false
    func _body(configuration: TextField<Self._Label>) -> some View {
        #if canImport(PitchdogStudioUI)
        configuration.textFieldStyle(StudioTextFieldStyle(focused: focused, invalid: invalid))
        #else
        configuration.textFieldStyle(.roundedBorder)
        #endif
    }
}
struct DriftInspectorTabs: View {
    @Binding var selection: String
    var body: some View {
        #if canImport(PitchdogStudioUI)
        StudioChoiceBar("Inspector",selection:$selection,choices:[.init("Look","Look"),.init("Motion","Motion"),.init("Slide","Slide")])
        #else
        Picker("Inspector",selection:$selection) {Text("Look").tag("Look");Text("Motion").tag("Motion");Text("Slide").tag("Slide")}.pickerStyle(.segmented)
        #endif
    }
}
struct DriftChoicePicker<Value:Hashable,Options:View>:View {
    let title:String
    @Binding var selection:Value
    let displayValue:String
    @ViewBuilder let options:()->Options
    var body:some View {
        #if canImport(PitchdogStudioUI)
        StudioPicker(title,selection:$selection,valueLabel:displayValue,content:options)
        #else
        Picker(title,selection:$selection,content:options)
        #endif
    }
}

struct DriftListSurface: ViewModifier {
    func body(content: Content) -> some View {
        #if canImport(PitchdogStudioUI)
        content.scrollContentBackground(.hidden)
        #else
        content
        #endif
    }
}

#if canImport(PitchdogStudioUI)
typealias DriftTextRole = StudioTextRole
#else
enum DriftTextRole { case display, pageTitle, sectionTitle, panelTitle, body, bodyCompact, label, action, input, caption, badge, metadata, data, code }
#endif
extension View {
    @ViewBuilder func driftType(_ role: DriftTextRole) -> some View {
        #if canImport(PitchdogStudioUI)
        self.studioType(role)
        #else
        self.font(role.systemFont)
        #endif
    }
}
#if !canImport(PitchdogStudioUI)
private extension DriftTextRole {
    var systemFont: Font {
        switch self {
        case .display, .pageTitle, .sectionTitle: return .title2.weight(.semibold)
        case .panelTitle: return .headline
        case .label, .badge: return .caption.weight(.semibold)
        case .caption, .metadata, .data, .code: return .caption
        default: return .system(size: 13)
        }
    }
}
#endif
@MainActor enum DriftType {
    #if canImport(PitchdogStudioUI)
    private(set) static var typography = StudioTypography.systemFallback
    #endif
    static func load() throws {
        #if canImport(PitchdogStudioUI)
        guard let resources = Bundle.main.resourceURL else { throw CocoaError(.fileReadNoSuchFile) }
        typography = try StudioTypography(fontDirectory: resources.appendingPathComponent("StudioFonts"))
        #endif
    }
}
