import AppKit
import SwiftUI
import UniformTypeIdentifiers

/// The left panel: the scenes to choose from, or the media in the reel.
public struct LibraryPanel: View {
    @Bindable var session: StudioSession
    @AppStorage("libraryTab") private var tab = Tab.scenes

    enum Tab: String { case scenes, media }

    public init(session: StudioSession) {
        self.session = session
    }

    public var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $tab) {
                Text("Scenes").tag(Tab.scenes)
                Text("\(session.config.itemNoun.capitalized)s  \(session.project.items.count)").tag(Tab.media)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(.horizontal, 14)
            .padding(.top, 8)
            .padding(.bottom, 10)
            switch tab {
            case .scenes: SceneBrowser(session: session)
            case .media: MediaRail(session: session)
            }
        }
        .background(Theme.chrome)
        .onDrop(of: StudioSession.importTypes, isTargeted: nil) { providers in
            loadDropped(providers) { session.importMedia($0) }
            return true
        }
    }
}

/// Reads file URLs from dropped items, then hands them over on the main
/// thread in name order, so slide-2 comes before slide-10 however the files
/// were picked up and however quickly each one resolves.
func loadDropped(_ providers: [NSItemProvider], _ done: @escaping @MainActor ([URL]) -> Void) {
    let group = DispatchGroup()
    var urls = [URL?](repeating: nil, count: providers.count)
    let lock = NSLock()
    for (i, p) in providers.enumerated() {
        group.enter()
        _ = p.loadObject(ofClass: URL.self) { url, _ in
            if let url { lock.lock(); urls[i] = url; lock.unlock() }
            group.leave()
        }
    }
    group.notify(queue: .main) { MainActor.assumeIsolated { done(inNameOrder(urls.compactMap { $0 })) } }
}

/// Files in the order Finder lists them by name.
func inNameOrder(_ urls: [URL]) -> [URL] {
    urls.sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending }
}

/// The media in the reel, in order: drag to reorder, star to feature.
public struct MediaRail: View {
    @Bindable var session: StudioSession

    public init(session: StudioSession) {
        self.session = session
    }

    public var body: some View {
        VStack(spacing: 0) {
            if session.project.items.isEmpty {
                VStack(spacing: 8) {
                    Spacer()
                    Image(systemName: "square.and.arrow.down").font(.system(size: 22, weight: .light)).foregroundStyle(.tertiary)
                    Text("Drop files here").textStyle(.caption).foregroundStyle(.secondary)
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            } else {
                List(selection: $session.selection) {
                    ForEach(Array(session.project.items.enumerated()), id: \.element.id) { index, item in
                        MediaRow(index: index, item: item, thumbnail: session.thumbnails[item.id],
                                 feature: { session.toggleFeatured(item.id) })
                            .tag(item.id)
                            .contextMenu { rowMenu(item) }
                    }
                    .onMove { from, to in session.move(from: from, to: to) }
                    .onDelete { offsets in
                        let ids = Set(offsets.map { session.project.items[$0].id })
                        session.remove(ids)
                    }
                }
                .listStyle(.sidebar)
                .scrollContentBackground(.hidden)
                .onDeleteCommand {
                    if let s = session.selection { session.remove([s]) }
                }
            }
            Hairline()
            HStack(spacing: 8) {
                Button { StudioCommands.addMedia(session) } label: {
                    Label("Add \(session.config.itemNoun.capitalized)s", systemImage: "plus")
                }
                .buttonStyle(QuietButtonStyle())
                Spacer()
                if session.importing > 0 {
                    if session.importBatch > 1 {
                        Text("Loading \(session.importBatch - session.importing + 1) of \(session.importBatch)")
                            .textStyle(.metadata).foregroundStyle(.tertiary).monospacedDigit()
                    }
                    ProgressView().controlSize(.small)
                } else if session.project.items.allSatisfy(\.isSample), !session.project.items.isEmpty {
                    Text("Samples").textStyle(.metadata).foregroundStyle(.tertiary)
                } else {
                    Text("Drag to reorder").textStyle(.metadata).foregroundStyle(.tertiary)
                }
            }
            .padding(.horizontal, 10)
            .frame(height: 40)
        }
    }

    @ViewBuilder
    private func rowMenu(_ item: MediaItem) -> some View {
        Button(item.featured ? "Stop Featuring" : "Feature") { session.toggleFeatured(item.id) }
        Divider()
        Button("Remove", role: .destructive) { session.remove([item.id]) }
    }
}

struct MediaRow: View {
    let index: Int
    let item: MediaItem
    let thumbnail: CGImage?
    let feature: () -> Void
    @State private var hovering = false

    var body: some View {
        HStack(spacing: 10) {
            Text("\(index + 1)").textStyle(.data).foregroundStyle(.tertiary)
                .frame(width: 18, alignment: .trailing)
            ZStack {
                RoundedRectangle(cornerRadius: Theme.Radius.thumb, style: .continuous).fill(Theme.well)
                if let thumbnail {
                    Image(decorative: thumbnail, scale: 2).resizable().aspectRatio(contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.thumb - 1, style: .continuous))
                }
            }
            .frame(width: 72, height: 46)
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.thumb, style: .continuous).strokeBorder(Theme.hairline, lineWidth: 1))
            VStack(alignment: .leading, spacing: 3) {
                Text(item.name).textStyle(.bodyCompact).foregroundStyle(.primary)
                    .lineLimit(1).truncationMode(.middle)
                HStack(spacing: 5) {
                    if item.kind == .pdfPage { Badge("PDF") } else if item.kind == .video { Badge("Clip") }
                    if item.featured { Text("Featured").textStyle(.metadata).foregroundStyle(.secondary) }
                }
            }
            Spacer(minLength: 0)
            Button(action: feature) {
                Image(systemName: item.featured ? "star.fill" : "star")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(item.featured ? Theme.accentInk : Color.secondary)
                    .frame(width: 22, height: 22)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .opacity(item.featured || hovering ? 1 : 0)
            .help(item.featured ? "Stop featuring" : "Feature: comes forward and holds the stage for a beat")
        }
        .padding(.vertical, 3)
        .onHover { hovering = $0 }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(item.name), \(index + 1)\(item.featured ? ", featured" : "")")
    }
}
