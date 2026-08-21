import AppKit
import Foundation

func driftSourceRevision(bundle: Bundle = .main) -> String {
    let raw = (bundle.object(forInfoDictionaryKey: "DriftSourceRevision") as? String ?? "unknown")
        .trimmingCharacters(in: .whitespacesAndNewlines)
    guard raw != "unknown" else { return "unknown" }
    guard (7...64).contains(raw.count),
          raw.unicodeScalars.allSatisfy({ CharacterSet(charactersIn: "0123456789abcdefABCDEF").contains($0) }) else {
        return "unknown"
    }
    return raw.lowercased()
}

func driftShortSourceRevision(bundle: Bundle = .main) -> String {
    let revision = driftSourceRevision(bundle: bundle)
    return revision == "unknown" ? revision : String(revision.prefix(12))
}

enum NativePresentationContract {
    static func userGuideURL(bundle: Bundle = .main) -> URL? {
        bundle.url(
            forResource: "MACOS_USER_GUIDE",
            withExtension: "md",
            subdirectory: "Documentation"
        )
    }

    static func renderedUserGuide(bundle: Bundle = .main) throws -> NSAttributedString {
        guard let guideURL = userGuideURL(bundle: bundle) else {
            throw BridgeFailure("NotFoundError", "The bundled Drift user guide is missing.")
        }
        let markdown = try String(contentsOf: guideURL, encoding: .utf8)
        guard markdown.utf8.count >= 1_024,
              markdown.utf8.count <= 512 * 1_024,
              markdown.contains("# Drift for macOS"),
              markdown.contains("## First launch"),
              markdown.contains("## Export finished media") else {
            throw BridgeFailure("DataError", "The bundled Drift user guide is incomplete or unexpectedly large.")
        }
        let rendered = try NSAttributedString(
            markdown: markdown,
            baseURL: guideURL.deletingLastPathComponent()
        )
        guard rendered.length >= 512 else {
            throw BridgeFailure("DataError", "The bundled Drift user guide did not render into readable text.")
        }
        return rendered
    }

    static func runSelfTest(bundle: Bundle = .main) throws {
        _ = try renderedUserGuide(bundle: bundle)
        let revision = driftSourceRevision(bundle: bundle)
        guard revision == "unknown" || (7...64).contains(revision.count) else {
            throw BridgeFailure("DataError", "The packaged source revision is malformed.")
        }
        print("Drift native presentation self-test passed: guide Markdown renders locally and provenance is bounded.")
    }
}

enum NativeAboutPanel {
    static func show(bundle: Bundle = .main) {
        let version = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        let build = bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
        let revision = driftShortSourceRevision(bundle: bundle)
        let provenance = revision == "unknown"
            ? "Source revision unavailable"
            : "Source \(revision)"
        let credits = NSMutableAttributedString(
            string: "A local cinematic carousel studio by pitch.dog.\n\n\(provenance)\nAGPL-3.0-or-later · System codecs only"
        )
        let fullRange = NSRange(location: 0, length: credits.length)
        credits.addAttributes([
            .font: NSFont.systemFont(ofSize: NSFont.smallSystemFontSize),
            .foregroundColor: NSColor.secondaryLabelColor,
        ], range: fullRange)
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        paragraph.lineSpacing = 2
        credits.addAttribute(.paragraphStyle, value: paragraph, range: fullRange)

        NSApp.orderFrontStandardAboutPanel(options: [
            .applicationName: "Drift",
            .applicationIcon: NSApp.applicationIconImage as Any,
            .applicationVersion: "Version \(version) (\(build))",
            .credits: credits,
        ])
        NSApp.activate(ignoringOtherApps: true)
    }
}

final class NativeUserGuideController: NSWindowController {
    private let guideTextView: NSTextView

    init(bundle: Bundle = .main) throws {
        let renderedGuide = try NativePresentationContract.renderedUserGuide(bundle: bundle)

        let textView = NSTextView(frame: .zero)
        textView.isEditable = false
        textView.isSelectable = true
        textView.isRichText = true
        textView.drawsBackground = false
        textView.textContainerInset = NSSize(width: 44, height: 36)
        textView.usesFindBar = true
        textView.isIncrementalSearchingEnabled = true
        textView.isContinuousSpellCheckingEnabled = false
        textView.isGrammarCheckingEnabled = false
        textView.allowsUndo = false
        textView.linkTextAttributes = [
            .foregroundColor: NSColor.linkColor,
            .underlineStyle: NSUnderlineStyle.single.rawValue,
        ]
        textView.textStorage?.setAttributedString(renderedGuide)
        textView.setAccessibilityLabel("Drift User Guide")
        textView.setAccessibilityHelp("Search with Command-F. Links open in the default browser.")

        let scrollView = NSScrollView(frame: .zero)
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder
        scrollView.drawsBackground = false
        scrollView.documentView = textView

        textView.minSize = NSSize(width: 0, height: 0)
        textView.maxSize = NSSize(
            width: CGFloat.greatestFiniteMagnitude,
            height: CGFloat.greatestFiniteMagnitude
        )
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        textView.textContainer?.containerSize = NSSize(
            width: 0,
            height: CGFloat.greatestFiniteMagnitude
        )
        textView.textContainer?.widthTracksTextView = true

        let background = NSVisualEffectView(frame: .zero)
        background.material = .contentBackground
        background.blendingMode = .behindWindow
        background.state = .followsWindowActiveState
        background.addSubview(scrollView)
        NSLayoutConstraint.activate([
            scrollView.leadingAnchor.constraint(equalTo: background.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: background.trailingAnchor),
            scrollView.topAnchor.constraint(equalTo: background.topAnchor),
            scrollView.bottomAnchor.constraint(equalTo: background.bottomAnchor),
        ])

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 780, height: 720),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Drift User Guide"
        window.identifier = NSUserInterfaceItemIdentifier("DriftUserGuideWindow")
        window.contentView = background
        window.minSize = NSSize(width: 580, height: 460)
        window.tabbingMode = .disallowed
        window.collectionBehavior.insert(.fullScreenAuxiliary)
        window.isReleasedWhenClosed = false
        window.isRestorable = false
        window.initialFirstResponder = textView
        window.setFrameAutosaveName("DriftUserGuideWindow")
        if !window.setFrameUsingName("DriftUserGuideWindow") { window.center() }

        guideTextView = textView
        super.init(window: window)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("NativeUserGuideController does not support coder initialization.")
    }

    func present() {
        showWindow(nil)
        window?.makeKeyAndOrderFront(nil)
        guideTextView.scrollRangeToVisible(NSRange(location: 0, length: 0))
        NSApp.activate(ignoringOtherApps: true)
    }
}
