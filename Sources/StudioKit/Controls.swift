import AppKit
import SwiftUI

// MARK: - Inspector structure

/// A titled inspector section with an optional trailing accessory.
public struct InspectorSection<Content: View, Accessory: View>: View {
    let title: String
    let accessory: Accessory
    let content: Content

    public init(_ title: String, @ViewBuilder accessory: () -> Accessory, @ViewBuilder content: () -> Content) {
        self.title = title
        self.accessory = accessory()
        self.content = content()
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).textStyle(.label).foregroundStyle(.primary)
                Spacer(minLength: 8)
                accessory
            }
            content
        }
        .padding(.horizontal, Theme.Space.l)
        .padding(.vertical, 14)
    }
}

extension InspectorSection where Accessory == EmptyView {
    public init(_ title: String, @ViewBuilder content: () -> Content) {
        self.init(title, accessory: { EmptyView() }, content: content)
    }
}

public struct Hairline: View {
    public init() {}
    public var body: some View {
        Rectangle().fill(Theme.hairline).frame(height: 1)
    }
}

// MARK: - Value slider

/// One row: the label, a slim track, and the value. Drag anywhere on the
/// track, double-click to reset, arrow keys to nudge.
public struct ValueSlider: View {
    let label: String
    @Binding var value: Float
    var range: ClosedRange<Float> = 0...1
    var defaultValue: Float?
    var format: (Float) -> String
    var onBegin: () -> Void
    var onCommit: () -> Void

    @State private var dragging = false
    @State private var hovering = false
    @FocusState private var focused: Bool

    public init(_ label: String, value: Binding<Float>, range: ClosedRange<Float> = 0...1, defaultValue: Float? = nil,
                format: @escaping (Float) -> String = { String(Int(($0 * 100).rounded())) },
                onBegin: @escaping () -> Void = {}, onCommit: @escaping () -> Void = {}) {
        self.label = label
        self._value = value
        self.range = range
        self.defaultValue = defaultValue
        self.format = format
        self.onBegin = onBegin
        self.onCommit = onCommit
    }

    private var fraction: CGFloat {
        CGFloat((value - range.lowerBound) / max(range.upperBound - range.lowerBound, 1e-6))
    }

    /// Where the fill starts: the left end, or the middle for a range around zero.
    private var origin: CGFloat {
        range.lowerBound < 0 && range.upperBound > 0 ? CGFloat(-range.lowerBound / (range.upperBound - range.lowerBound)) : 0
    }

    public var body: some View {
        HStack(spacing: 10) {
            Text(label).textStyle(.bodyCompact).foregroundStyle(.secondary)
                .lineLimit(1).minimumScaleFactor(0.85)
                .frame(width: 86, alignment: .leading)
            GeometryReader { geo in
                let w = geo.size.width
                let x = max(0, min(w, fraction * w))
                let o = origin * w
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.well).frame(height: 4)
                    Capsule().fill(Theme.accent.opacity(dragging || hovering ? 0.95 : 0.8))
                        .frame(width: abs(x - o), height: 4)
                        .offset(x: min(x, o))
                    Circle()
                        .fill(Color.white)
                        .shadow(color: .black.opacity(0.35), radius: 1.5, y: 0.5)
                        .overlay(Circle().strokeBorder(Color.black.opacity(0.1), lineWidth: 0.5))
                        .frame(width: dragging ? 14 : 12, height: dragging ? 14 : 12)
                        .offset(x: x - (dragging ? 7 : 6))
                        .animation(Theme.quick, value: dragging)
                }
                .frame(height: 24)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { g in
                            if !dragging { dragging = true; onBegin() }
                            let f = Float(max(0, min(1, g.location.x / max(w, 1))))
                            value = range.lowerBound + f * (range.upperBound - range.lowerBound)
                        }
                        .onEnded { _ in dragging = false; onCommit() }
                )
                .onTapGesture(count: 2) {
                    if let d = defaultValue { onBegin(); value = d; onCommit() }
                }
            }
            .frame(height: 24)
            Text(format(value)).textStyle(.data).foregroundStyle(dragging || hovering ? .primary : .secondary)
                .monospacedDigit()
                .lineLimit(1)
                .frame(width: 36, alignment: .trailing)
        }
        .frame(height: 30)
        .onHover { hovering = $0 }
        .focusable()
        .focused($focused)
        .focusEffectDisabled()
        .onKeyPress(.leftArrow) { nudge(-0.02); return .handled }
        .onKeyPress(.rightArrow) { nudge(0.02); return .handled }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue(format(value))
        .accessibilityAdjustableAction { dir in
            switch dir {
            case .increment: nudge(0.05)
            case .decrement: nudge(-0.05)
            @unknown default: break
            }
        }
        .help(defaultValue != nil ? "\(label). Double-click the track to reset." : label)
    }

    private func nudge(_ amount: Float) {
        onBegin()
        let span = range.upperBound - range.lowerBound
        value = min(range.upperBound, max(range.lowerBound, value + amount * span))
        onCommit()
    }
}

// MARK: - Palette chips

public struct PaletteChip: View {
    let palette: Palette
    var selected: Bool
    var size: CGSize = CGSize(width: 44, height: 22)

    public init(palette: Palette, selected: Bool, size: CGSize = CGSize(width: 44, height: 22)) {
        self.palette = palette
        self.selected = selected
        self.size = size
    }

    public var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(palette.sorted.enumerated()), id: \.offset) { _, c in
                Rectangle().fill(Color(.sRGB, red: Double(c.r), green: Double(c.g), blue: Double(c.b)))
            }
        }
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .strokeBorder(Color.white.opacity(0.10), lineWidth: 0.5)
        )
        .padding(2.5)
        .overlay(
            RoundedRectangle(cornerRadius: 7.5, style: .continuous)
                .strokeBorder(selected ? Theme.accent : Color.clear, lineWidth: 1.5)
        )
        .help(palette.name)
    }
}

/// A wrapping row of palette chips with the current one ringed.
public struct PalettePicker: View {
    let selected: String
    let choose: (Palette) -> Void
    var palettes: [Palette] = Palettes.all

    public init(selected: String, palettes: [Palette] = Palettes.all, choose: @escaping (Palette) -> Void) {
        self.selected = selected
        self.palettes = palettes
        self.choose = choose
    }

    public var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 46, maximum: 60), spacing: 4)], alignment: .leading, spacing: 4) {
            ForEach(palettes) { p in
                Button { choose(p) } label: { PaletteChip(palette: p, selected: p.id == selected) }
                    .buttonStyle(.plain)
                    .accessibilityLabel(p.name)
            }
        }
    }
}

// MARK: - Buttons

/// The one prominent action per surface, in the interface's own ink.
public struct PrimaryButtonStyle: ButtonStyle {
    public init() {}
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Theme.onAccent)
            .padding(.horizontal, 14)
            .frame(height: 28)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Theme.accent)
                    .opacity(configuration.isPressed ? 0.82 : 1)
            )
            .contentShape(Rectangle())
    }
}

/// Quiet secondary action: no outline at rest, a soft fill on hover.
public struct QuietButtonStyle: ButtonStyle {
    public init() {}
    public func makeBody(configuration: Configuration) -> some View {
        QuietButtonBody(configuration: configuration)
    }

    struct QuietButtonBody: View {
        let configuration: ButtonStyleConfiguration
        @State private var hover = false
        var body: some View {
            configuration.label
                .textStyle(.action)
                .padding(.horizontal, 10)
                .frame(height: 26)
                .background(
                    RoundedRectangle(cornerRadius: Theme.Radius.control, style: .continuous)
                        .fill(Color.primary.opacity(configuration.isPressed ? 0.12 : (hover ? 0.07 : 0)))
                )
                .contentShape(Rectangle())
                .onHover { hover = $0 }
                .animation(Theme.quick, value: hover)
        }
    }
}

/// A round icon button used in the transport and headers.
public struct IconButton: View {
    let symbol: String
    let label: String
    var size: CGFloat = 13
    var action: () -> Void
    @State private var hover = false

    public init(_ symbol: String, label: String, size: CGFloat = 13, action: @escaping () -> Void) {
        self.symbol = symbol
        self.label = label
        self.size = size
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: size, weight: .semibold))
                .frame(width: 28, height: 28)
                .background(Circle().fill(Color.primary.opacity(hover ? 0.08 : 0)))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
        .help(label)
        .accessibilityLabel(label)
    }
}

/// Small uppercase status chip.
public struct Badge: View {
    let text: String
    var tint: Color = .secondary
    public init(_ text: String, tint: Color = .secondary) {
        self.text = text
        self.tint = tint
    }
    public var body: some View {
        Text(text).textStyle(.badge)
            .foregroundStyle(tint)
            .padding(.horizontal, 5)
            .padding(.vertical, 2.5)
            .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(tint.opacity(0.14)))
    }
}

// MARK: - Choice row

/// A compact segmented choice.
public struct ChoiceRow<T: Hashable>: View {
    let options: [(T, String)]
    @Binding var selection: T

    public init(_ options: [(T, String)], selection: Binding<T>) {
        self.options = options
        self._selection = selection
    }

    public var body: some View {
        HStack(spacing: 2) {
            ForEach(Array(options.enumerated()), id: \.offset) { _, option in
                let on = option.0 == selection
                Button { selection = option.0 } label: {
                    Text(option.1)
                        .textStyle(.caption)
                        .foregroundStyle(on ? Color.primary : Color.secondary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 24)
                        .background(
                            RoundedRectangle(cornerRadius: 5, style: .continuous)
                                .fill(on ? Theme.segmentOn : Color.clear)
                                .shadow(color: .black.opacity(on ? 0.18 : 0), radius: 1, y: 0.5)
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(2)
        .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(Theme.well.opacity(0.7)))
    }
}

/// A segmented row where several options can be on at once; the last one on
/// stays on, so there is always a choice.
public struct MultiChoiceRow<T: Hashable>: View {
    let options: [(T, String)]
    @Binding var selection: Set<T>

    public init(_ options: [(T, String)], selection: Binding<Set<T>>) {
        self.options = options
        self._selection = selection
    }

    public var body: some View {
        HStack(spacing: 2) {
            ForEach(Array(options.enumerated()), id: \.offset) { _, option in
                let on = selection.contains(option.0)
                Button {
                    if on { if selection.count > 1 { selection.remove(option.0) } } else { selection.insert(option.0) }
                } label: {
                    Text(option.1)
                        .textStyle(.caption)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                        .foregroundStyle(on ? Color.primary : Color.secondary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 24)
                        .background(
                            RoundedRectangle(cornerRadius: 5, style: .continuous)
                                .fill(on ? Theme.segmentOn : Color.clear)
                                .shadow(color: .black.opacity(on ? 0.18 : 0), radius: 1, y: 0.5)
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(2)
        .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(Theme.well.opacity(0.7)))
    }
}
