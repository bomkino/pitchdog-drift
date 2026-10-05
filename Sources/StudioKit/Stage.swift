import AppKit
import Metal
import MetalKit
import QuartzCore
import SwiftUI

/// Draws a composition live. While playing it renders one sample per frame;
/// when paused it renders the exact export frame, motion blur included.
public final class StagePreviewCoordinator: NSObject, MTKViewDelegate {
    let exporter: Exporter
    let pool = VideoPool()
    var source: () -> (Composition?, Int)
    var clock: PlaybackClock
    var versionProvider: () -> Int
    var soundClock: (Bool, Double) -> Double? = { _, _ in nil }
    var quality: CGFloat = 1
    private var lastTime = CACurrentMediaTime()
    private var lastVersion = -1
    /// Shutter samples while playing, adapted to measured GPU time so the live
    /// preview shows motion blur like the export whenever the Mac has room.
    private var liveSamples = 4
    private var gpuMs: Double = 0
    private var lastDrawnTime: Double = -1
    private var frameCounter: UInt32 = 0
    // Probe: reads back the live drawable to prove the on-screen path renders.
    private var probeFrames = 0
    private var probeStart: CFTimeInterval = 0
    private var probeGPU: [Double] = []

    init(source: @escaping () -> (Composition?, Int), clock: PlaybackClock, version: @escaping () -> Int) {
        self.exporter = try! Exporter()
        self.source = source
        self.clock = clock
        self.versionProvider = version
    }

    public func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {
        lastVersion = -1
    }

    public func draw(in view: MTKView) {
        let now = CACurrentMediaTime()
        let dt = min(now - lastTime, 0.1)
        lastTime = now
        // While sound plays it keeps the time; otherwise the display does.
        if let heard = soundClock(clock.playing, clock.time) {
            clock.time = heard
        } else if clock.playing {
            clock.time = wrap(clock.time + dt, max(clock.duration, 0.1))
        }
        let version = versionProvider()
        let needs = clock.playing || version != lastVersion || clock.time != lastDrawnTime
        guard needs else { return }
        guard let drawable = view.currentDrawable else { return }
        let (compOpt, fps) = source()
        guard let cb = GPU.shared.queue.makeCommandBuffer() else { return }
        if let comp = compOpt {
            let samples = clock.playing ? liveSamples : 6
            frameCounter &+= 1
            let frameIndex = UInt32(clock.time * Double(fps))
            // Heavy looks render their background smaller while playing; paused frames are exact.
            let cost = comp.backdrop.styleInfo.cost
            let scale: Float = clock.playing ? (cost >= 3 ? 0.5 : (cost == 2 ? 0.75 : 1)) : 1
            try? exporter.encode(cb, comp, at: clock.time, output: drawable.texture, samples: samples, fps: fps,
                                 frameIndex: frameIndex, transparent: false, pool: pool, backdropScale: scale)
        } else {
            let pass = MTLRenderPassDescriptor()
            pass.colorAttachments[0].texture = drawable.texture
            pass.colorAttachments[0].loadAction = .clear
            pass.colorAttachments[0].clearColor = MTLClearColor(red: 0.08, green: 0.08, blue: 0.08, alpha: 1)
            pass.colorAttachments[0].storeAction = .store
            cb.makeRenderCommandEncoder(descriptor: pass)?.endEncoding()
        }
        if let probePath = MainActor.assumeIsolated({ StudioSnapshot.arg("--probe-preview") }), compOpt != nil {
            probe(cb, drawable: drawable, path: probePath)
        }
        if clock.playing {
            let used = compOpt?.look.shutter ?? 0 > 0.01 ? liveSamples : 1
            cb.addCompletedHandler { [weak self] buffer in
                let ms = (buffer.gpuEndTime - buffer.gpuStartTime) * 1000
                DispatchQueue.main.async { self?.adapt(gpuMs: ms, samples: used) }
            }
        }
        cb.present(drawable)
        cb.commit()
        lastVersion = version
        lastDrawnTime = clock.time
    }

    /// Four samples read as blur; two show as double edges, so it is four,
    /// three or none, whichever keeps a frame near 10 ms of GPU time.
    private func adapt(gpuMs ms: Double, samples: Int) {
        guard ms > 0, ms < 200 else { return }
        gpuMs = gpuMs == 0 ? ms : gpuMs * 0.9 + ms * 0.1
        let perSample = gpuMs / Double(max(samples, 1))
        let want = perSample * 4 <= 10 ? 4 : (perSample * 3 <= 10 ? 3 : 1)
        if want != liveSamples { liveSamples = want; gpuMs = 0 }
    }

    private func probe(_ cb: MTLCommandBuffer, drawable: CAMetalDrawable, path: String) {
        if probeFrames == 0 { probeStart = CACurrentMediaTime() }
        probeFrames += 1
        cb.addCompletedHandler { [weak self] b in
            let ms = (b.gpuEndTime - b.gpuStartTime) * 1000
            DispatchQueue.main.async { self?.probeGPU.append(ms) }
        }
        guard probeFrames == 180 else { return }
        let tex = drawable.texture
        let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: tex.pixelFormat, width: tex.width, height: tex.height, mipmapped: false)
        d.storageMode = .shared
        guard let copy = GPU.shared.device.makeTexture(descriptor: d), let blit = cb.makeBlitCommandEncoder() else { return }
        blit.copy(from: tex, to: copy)
        blit.endEncoding()
        let elapsed = CACurrentMediaTime() - probeStart
        cb.addCompletedHandler { [weak self] _ in
            DispatchQueue.main.async {
                guard let self else { return }
                if let img = ImageOutput.cgImage(from: copy, premultipliedAlpha: false) {
                    try? ImageOutput.writePNG(img, to: URL(fileURLWithPath: path))
                }
                let sorted = self.probeGPU.sorted()
                let median = sorted.isEmpty ? 0 : sorted[sorted.count / 2]
                let p95 = sorted.isEmpty ? 0 : sorted[min(sorted.count - 1, Int(Double(sorted.count) * 0.95))]
                print(String(format: "probe %@ %dx%d frames:%d in %.2f s = %.1f fps, gpu median %.2f ms p95 %.2f ms",
                             path, tex.width, tex.height, self.probeFrames, elapsed, Double(self.probeFrames) / elapsed, median, p95))
                exit(0)
            }
        }
    }
}

public struct StagePreview: NSViewRepresentable {
    let source: any StageSource
    let pixelSize: CGSize

    public init(source: any StageSource, pixelSize: CGSize) {
        self.source = source
        self.pixelSize = pixelSize
    }

    public func makeCoordinator() -> StagePreviewCoordinator {
        let src = source
        let coordinator = StagePreviewCoordinator(
            source: { [weak src] in
                MainActor.assumeIsolated { (src?.stageComposition(), src?.fps ?? 30) }
            },
            clock: src.clock,
            version: { [weak src] in MainActor.assumeIsolated { src?.version ?? 0 } })
        coordinator.soundClock = { [weak src] playing, time in
            MainActor.assumeIsolated { src?.soundClock(playing: playing, time: time) }
        }
        return coordinator
    }

    public func makeNSView(context: Context) -> MTKView {
        let v = MTKView(frame: .zero, device: GPU.shared.device)
        v.colorPixelFormat = .bgra8Unorm
        v.framebufferOnly = MainActor.assumeIsolated { StudioSnapshot.arg("--probe-preview") == nil }
        v.autoResizeDrawable = false
        v.preferredFramesPerSecond = 60
        v.delegate = context.coordinator
        v.layer?.isOpaque = true
        (v.layer as? CAMetalLayer)?.colorspace = CGColorSpace(name: CGColorSpace.sRGB)
        v.drawableSize = pixelSize
        return v
    }

    public func updateNSView(_ v: MTKView, context: Context) {
        if v.drawableSize != pixelSize, pixelSize.width > 1, pixelSize.height > 1 {
            v.drawableSize = pixelSize
        }
    }
}

/// The output frame sitting on the neutral surround, with transport below.
/// Headless snapshots pass a still to stand in for the live Metal view,
/// which window caches cannot see.
public struct StageArea: View {
    @Bindable var session: StudioSession
    var still: CGImage?
    @AppStorage("previewQuality") private var previewQuality = 1.0
    @AppStorage("showSafeAreas") private var showSafeAreas = false
    @Environment(\.colorScheme) private var scheme

    public init(session: StudioSession, still: CGImage? = nil) {
        self.session = session
        self.still = still
    }

    public var body: some View {
        VStack(spacing: 0) {
            GeometryReader { geo in
                let side: CGFloat = 32, top: CGFloat = 46, bottom: CGFloat = 22
                let avail = CGSize(width: max(40, geo.size.width - side * 2), height: max(40, geo.size.height - top - bottom))
                let aspect = CGFloat(session.project.format.aspect)
                let fitted = avail.width / avail.height > aspect
                    ? CGSize(width: avail.height * aspect, height: avail.height)
                    : CGSize(width: avail.width, height: avail.width / aspect)
                let scale = (NSScreen.main?.backingScaleFactor ?? 2) * CGFloat(previewQuality)
                let longSide = max(fitted.width, fitted.height) * scale
                let cap: CGFloat = 2400
                let k = longSide > cap ? cap / longSide : 1
                let px = CGSize(width: (fitted.width * scale * k).rounded(), height: (fitted.height * scale * k).rounded())
                ZStack {
                    Theme.surround
                    if session.project.items.isEmpty {
                        if session.preparingSamples {
                            ProgressView().controlSize(.small)
                        } else {
                            EmptyStage(session: session)
                        }
                    } else {
                        VStack(spacing: 0) {
                            StageStatus(session: session)
                                .frame(height: top)
                            Group {
                                if let still {
                                    Image(decorative: still, scale: 1).resizable()
                                } else {
                                    StagePreview(source: session, pixelSize: px)
                                }
                            }
                            .frame(width: fitted.width, height: fitted.height)
                            .overlay { if showSafeAreas { SafeAreaGuides(format: session.project.format) } }
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.stage, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.stage, style: .continuous)
                                .strokeBorder(session.previewID != nil ? Theme.accent.opacity(0.55) : Theme.hairline, lineWidth: 1))
                            .shadow(color: .black.opacity(scheme == .dark ? 0.55 : 0.18), radius: scheme == .dark ? 28 : 14, y: 4)
                            Spacer(minLength: 0)
                        }
                    }
                }
                .frame(width: geo.size.width, height: geo.size.height)
            }
            .onDrop(of: StudioSession.importTypes, isTargeted: nil) { providers in
                loadDropped(providers) { session.importMedia($0) }
                return true
            }
            if !session.project.items.isEmpty {
                TransportBar(source: session, clock: session.clock)
            }
        }
    }
}

/// One quiet line above the stage: what is being previewed, or that the
/// media are samples waiting to be replaced.
struct StageStatus: View {
    @Bindable var session: StudioSession

    var body: some View {
        HStack(spacing: 8) {
            if let id = session.previewID {
                let entry = session.config.entry(id)
                let group = session.config.group(of: id)
                Circle().fill(Theme.accent).frame(width: 6, height: 6)
                Text("Previewing \(group.hasStyles ? group.name + " · " + entry.name : group.name)")
                    .textStyle(.label).foregroundStyle(.primary)
                Text("Click to use it").textStyle(.caption).foregroundStyle(.secondary)
            } else if session.project.items.allSatisfy(\.isSample) {
                Text("Sample \(session.config.itemNoun)s").textStyle(.label).foregroundStyle(.primary)
                Text("Drop your own anywhere to replace them").textStyle(.caption).foregroundStyle(.secondary)
                Button("Add…") { StudioCommands.addMedia(session) }
                    .buttonStyle(QuietButtonStyle())
            }
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity)
        .animation(Theme.quick, value: session.previewID)
    }
}

struct EmptyStage: View {
    let session: StudioSession
    @State private var targeted = false

    var body: some View {
        VStack(spacing: 16) {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [6, 5]))
                    .foregroundStyle(.tertiary)
                Image(systemName: "arrow.down.to.line")
                    .font(.system(size: 26, weight: .light))
                    .foregroundStyle(.secondary)
            }
            .frame(width: 92, height: 92 / max(CGFloat(session.project.format.aspect), 0.5))
            .frame(maxHeight: 164)
            .padding(.bottom, 6)
            Text(session.config.emptyTitle).textStyle(.display).foregroundStyle(.primary)
            Text(session.config.emptyDetail).textStyle(.body).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 380)
            HStack(spacing: 10) {
                Button("Add \(session.config.itemNoun.capitalized)s…") { StudioCommands.addMedia(session) }
                    .buttonStyle(PrimaryButtonStyle())
                Button("Try Samples") { session.addSamples() }
                    .buttonStyle(QuietButtonStyle())
            }
            .padding(.top, 6)
        }
        .padding(40)
    }
}

// MARK: - Transport

public struct TransportBar: View {
    let source: any StageSource
    @Bindable var clock: PlaybackClock

    public init(source: any StageSource, clock: PlaybackClock) {
        self.source = source
        self.clock = clock
    }
    @State private var scrubbing = false
    @State private var wasPlaying = false

    public var body: some View {
        HStack(spacing: 14) {
            IconButton(clock.playing ? "pause.fill" : "play.fill", label: clock.playing ? "Pause" : "Play", size: 15) {
                clock.playing.toggle()
                source.touch()
            }
            .keyboardShortcut(clock.typing ? nil : KeyboardShortcut(.space, modifiers: []))
            IconButton("backward.frame.fill", label: "Previous Frame") { step(-1) }
            IconButton("forward.frame.fill", label: "Next Frame") { step(1) }

            GeometryReader { geo in
                let w = geo.size.width
                let f = CGFloat(clock.time / max(clock.duration, 0.001))
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.well).frame(height: 4)
                    Capsule().fill(Theme.accent).frame(width: max(0, min(w, f * w)), height: 4)
                    // The loop's moments, as quiet ticks under the track.
                    let beats = source.beats
                    let duration = max(clock.duration, 0.001)
                    Canvas { ctx, size in
                        for b in beats {
                            let x = CGFloat(b / duration) * size.width
                            ctx.fill(Path(CGRect(x: x - 0.5, y: size.height / 2 + 4, width: 1, height: 4)), with: .color(.secondary.opacity(0.55)))
                        }
                    }
                    .frame(height: 20)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                    Circle().fill(Color.white)
                        .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
                        .frame(width: 12, height: 12)
                        .offset(x: max(0, min(w, f * w)) - 6)
                }
                .frame(height: 20)
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0)
                    .onChanged { g in
                        if !scrubbing { scrubbing = true; wasPlaying = clock.playing; clock.playing = false }
                        let frac = max(0, min(1, g.location.x / max(w, 1)))
                        clock.time = Double(frac) * clock.duration
                    }
                    .onEnded { _ in
                        scrubbing = false
                        clock.playing = wasPlaying
                    })
            }
            .frame(height: 20)
            .accessibilityElement()
            .accessibilityLabel("Playhead")
            .accessibilityValue(String(format: "%.1f of %.1f seconds", clock.time, clock.duration))
            .accessibilityAdjustableAction { direction in
                let step = max(clock.duration / 40, 1.0 / Double(max(source.fps, 1)))
                clock.playing = false
                clock.time = wrap(clock.time + (direction == .increment ? step : -step), clock.duration)
                source.touch()
            }

            HStack(spacing: 4) {
                Text(timecode(clock.time)).textStyle(.data).foregroundStyle(.primary)
                Text("/").textStyle(.data).foregroundStyle(.tertiary)
                Text(timecode(clock.duration)).textStyle(.data).foregroundStyle(.secondary)
            }
            .fixedSize()
            Image(systemName: "repeat").font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary)
                .help("Loops seamlessly")
        }
        .padding(.horizontal, 16)
        .frame(height: 46)
        .frame(maxWidth: 760)
        .frame(maxWidth: .infinity)
        .background(Theme.surround)
    }

    private func step(_ frames: Int) {
        clock.playing = false
        let fps = Double(source.fps)
        let frame = (clock.time * fps).rounded() + Double(frames)
        clock.time = wrap(frame / fps, clock.duration)
        source.touch()
    }

    private func timecode(_ t: Double) -> String {
        let fps = Double(source.fps)
        let total = Int((t * fps).rounded())
        let f = total % Int(fps)
        let s = (total / Int(fps)) % 60
        let m = total / Int(fps) / 60
        return String(format: "%d:%02d.%02d", m, s, f)
    }
}

/// Where platform interface covers a vertical video. Shown on the stage only;
/// never exported. Insets as recorded by Drift's platform guides (checked 23 Aug 2026).
struct SafeAreaGuides: View {
    let format: CanvasFormat

    var body: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            if format.id == "reel" || format.id == "portrait" {
                let reel = format.id == "reel"
                let top = h * (reel ? 0.10 : 0.06)
                let bottom = h * (reel ? 0.22 : 0.12)
                let right = reel ? w * 0.18 : 0
                ZStack(alignment: .topLeading) {
                    band(label: "Profile and header", rect: CGRect(x: 0, y: 0, width: w, height: top))
                    band(label: "Caption and buttons", rect: CGRect(x: 0, y: h - bottom, width: w, height: bottom))
                    if right > 0 {
                        band(label: "", rect: CGRect(x: w - right, y: top, width: right, height: h - top - bottom))
                    }
                }
            }
        }
        .allowsHitTesting(false)
    }

    private func band(label: String, rect: CGRect) -> some View {
        ZStack(alignment: .center) {
            Rectangle().fill(Color.black.opacity(0.28))
            Rectangle().strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4, 3])).foregroundStyle(Color.white.opacity(0.5))
            if !label.isEmpty { Text(label).textStyle(.metadata).foregroundStyle(.white.opacity(0.85)) }
        }
        .frame(width: rect.width, height: rect.height)
        .offset(x: rect.minX, y: rect.minY)
    }
}
