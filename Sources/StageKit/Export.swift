import BackdropKit
import CoreGraphics
import CoreVideo
import Foundation
import Metal
import RenderCore

/// Everything needed to render a composition at any time.
public struct Composition: @unchecked Sendable {
    public var scene: any StageScene
    public var context: SceneContext
    public var textures: [MTLTexture]
    public var backdrop: BackdropSettings
    public var look: StageLook
    /// Loop length for the background; defaults to the scene loop.
    public var backdropLoop: Double?
    public var drawBackdrop: Bool = true
    /// The project leaves its background out of exports; previews show a
    /// checkerboard in its place.
    public var transparent = false
    /// Texture indices that play video, decoded per frame by a `VideoPool`.
    public var videos: [Int: VideoClip] = [:]
    /// Words over the finished frame.
    public var overlay: TitleOverlay?
    /// Each texture's own palette, for a backdrop that follows the work (`look.mood`).
    public var itemPalettes: [Palette?] = []

    public init(scene: any StageScene, context: SceneContext, textures: [MTLTexture], backdrop: BackdropSettings,
                look: StageLook, backdropLoop: Double? = nil, drawBackdrop: Bool = true, videos: [Int: VideoClip] = [:],
                overlay: TitleOverlay? = nil) {
        self.scene = scene
        self.context = context
        self.textures = textures
        self.backdrop = backdrop
        self.look = look
        self.backdropLoop = backdropLoop
        self.drawBackdrop = drawBackdrop
        self.videos = videos
        self.overlay = overlay
    }

    public var loopDuration: Double { max(scene.loopDuration(context), 0.5) }

    /// The background completes a whole number of its own cycles per scene loop,
    /// so the finished video loops seamlessly.
    public func backdropPhase(at t: Double) -> Double {
        let loop = loopDuration
        let preferred = backdropLoop ?? 14
        let cycles = max(1, (loop / preferred).rounded())
        return wrap(t / loop * cycles, 1)
    }
}

public enum ExportFormat: Codable, Hashable, Sendable {
    case video(VideoCodec)
    case pngSequence
    case still
}

public struct ExportSettings: Sendable {
    public var width: Int
    public var height: Int
    public var fps: Int
    public var duration: Double
    public var format: ExportFormat
    /// Motion-blur samples per frame (1 = off).
    public var samples: Int
    public var transparent: Bool
    /// Sound for the whole export, or nil for silence. Only video formats carry it.
    public var audio: AudioTrack?
    /// The moment a still export shows.
    public var stillTime: Double = 0

    public init(width: Int, height: Int, fps: Int = 30, duration: Double, format: ExportFormat, samples: Int = 8, transparent: Bool = false,
                audio: AudioTrack? = nil) {
        self.width = width
        self.height = height
        self.fps = fps
        self.duration = duration
        self.format = format
        self.samples = samples
        self.transparent = transparent
        self.audio = audio
    }

    public var frameCount: Int { max(1, Int((duration * Double(fps)).rounded())) }

    /// When frame `i` is taken. Frames divide the length evenly, so the step
    /// from the last frame back to the first is a frame like any other even
    /// when the loop is not a whole number of frames long.
    public func time(ofFrame i: Int) -> Double { Double(i) * duration / Double(frameCount) }
}

/// Renders compositions offline, frame-exact, with motion blur.
public final class Exporter: @unchecked Sendable {
    public let renderer: StageRenderer
    let titles: TitleCompositor
    /// A premultiplied frame awaiting its title, for straight-alpha exports.
    private var straightScratch: MTLTexture?

    public init(renderer: StageRenderer? = nil) throws {
        self.renderer = try renderer ?? StageRenderer()
        titles = try TitleCompositor()
    }

    /// Renders one frame at time `t` into a CGImage.
    public func still(_ comp: Composition, at t: Double, width: Int, height: Int, samples: Int = 1, fps: Int = 30,
                      transparent: Bool = false, checker: Bool = false) throws -> CGImage {
        let gpu = GPU.shared
        let out = gpu.makeTexture(width: width, height: height, format: .bgra8Unorm, usage: [.renderTarget, .shaderRead])
        guard let cb = gpu.queue.makeCommandBuffer() else { throw RenderError.io("GPU unavailable.") }
        try encode(cb, comp, at: t, output: out, samples: samples, fps: fps, frameIndex: UInt32(max(0, t * Double(fps))), transparent: transparent,
                   checker: checker)
        cb.commit()
        cb.waitUntilCompleted()
        if let e = cb.error { throw RenderError.io("GPU error: \(e.localizedDescription)") }
        guard let img = ImageOutput.cgImage(from: out, premultipliedAlpha: transparent && !checker) else { throw RenderError.io("Could not read the frame.") }
        return img
    }

    public func encode(_ cb: MTLCommandBuffer, _ comp: Composition, at t: Double, output: MTLTexture, samples: Int,
                       fps: Int, frameIndex: UInt32, transparent: Bool, pool: VideoPool? = nil, backdropScale: Float = 1,
                       straightAlpha: Bool = false, checker: Bool = false) throws {
        var comp = comp
        if let pool, !comp.videos.isEmpty { comp.textures = pool.textures(for: comp, at: t, commandBuffer: cb) }
        var ctx = comp.context
        ctx.aspect = Float(output.width) / Float(max(output.height, 1))
        let shutter = Double(comp.look.shutter) / Double(max(fps, 1))
        let effectiveSamples = comp.look.shutter > 0.01 && comp.scene.allowsMotionBlur ? samples : 1
        var backdrop = comp.backdrop
        if comp.look.mood > 0.001, !comp.itemPalettes.isEmpty, comp.drawBackdrop, !transparent {
            backdrop.palette = Mood.palette(base: backdrop.palette, frame: comp.scene.frame(at: t, ctx),
                                            itemPalettes: comp.itemPalettes, amount: comp.look.mood)
        }
        var request = StageRenderer.Request(
            width: output.width, height: output.height, backdrop: backdrop,
            backdropPhase: comp.backdropPhase(at: t), look: comp.look, samples: effectiveSamples,
            frameIndex: frameIndex, keepAlpha: transparent, drawBackdrop: comp.drawBackdrop && !transparent)
        request.backdropScale = backdropScale
        // A title goes over the premultiplied frame; only then is it made straight.
        let straightLater = straightAlpha && comp.overlay != nil
        request.straightAlpha = straightAlpha && !straightLater
        request.checker = checker
        var target = output
        if straightLater {
            if straightScratch?.width != output.width || straightScratch?.height != output.height {
                straightScratch = GPU.shared.makeTexture(width: output.width, height: output.height, format: .rgba16Float,
                                                         label: "premultiplied frame")
            }
            if let s = straightScratch { target = s }
        }
        let scene = comp.scene
        let drift = comp.look.cameraDrift
        let loop = comp.loopDuration
        // A title card pulls focus off the stage while it shows.
        let pull = comp.overlay.map { $0.scrim > 0 ? $0.presence(at: t, loop: loop).alpha : 0 } ?? 0
        let defocus = pull * 0.022 * Float(output.height)
        try renderer.encode(cb, output: target, request: request, textures: comp.textures) { offset in
            var frame = scene.frame(at: t + Double(offset) * shutter, ctx)
            if drift > 0.001 { frame.camera.sway = Self.drift(at: t + Double(offset) * shutter, loop: loop, amount: drift) }
            if defocus > 0.05 { for i in frame.cards.indices { frame.cards[i].blur += defocus } }
            return frame
        }
        if let overlay = comp.overlay { try titles.encode(cb, overlay, at: t, loop: loop, output: target) }
        if target !== output { try titles.straighten(cb, from: target, to: output) }
    }

    /// A slow camera drift: a small orbit and a breath of dolly around the
    /// target, whole cycles per loop so the loop still closes.
    static func drift(at t: Double, loop: Double, amount: Float) -> SIMD3<Float> {
        let p = Float(wrap(t, loop) / loop) * 2 * .pi
        return SIMD3(0.045 * sinf(p), 0.022 * sinf(2 * p + 0.7), 0.035 * sinf(p + 1.9)) * amount
    }

    /// Renders one frame and waits for the GPU.
    public func renderSync(_ comp: Composition, at t: Double, output: MTLTexture, samples: Int, fps: Int,
                           frameIndex: UInt32, transparent: Bool, pool: VideoPool? = nil) throws {
        guard let cb = GPU.shared.queue.makeCommandBuffer() else { throw RenderError.io("GPU unavailable.") }
        try encode(cb, comp, at: t, output: output, samples: samples, fps: fps, frameIndex: frameIndex, transparent: transparent, pool: pool)
        cb.commit()
        cb.waitUntilCompleted()
        if let e = cb.error { throw RenderError.io("GPU error: \(e.localizedDescription)") }
    }

    public struct Progress: Sendable {
        public var frame: Int
        public var total: Int
        public var fraction: Double { total > 0 ? Double(frame) / Double(total) : 0 }
    }

    /// Writes a video or PNG sequence. `progress` is called on an arbitrary thread.
    /// Throws `RenderError.cancelled` when `isCancelled` returns true.
    public func export(_ comp: Composition, settings s: ExportSettings, to url: URL,
                       isCancelled: @escaping @Sendable () -> Bool = { false },
                       progress: @escaping @Sendable (Progress) -> Void = { _ in },
                       preview: (@Sendable (CGImage) -> Void)? = nil) async throws {
        let gpu = GPU.shared
        let total = s.frameCount
        let pool = VideoPool()
        switch s.format {
        case .still:
            let img = try still(comp, at: s.stillTime, width: s.width, height: s.height, samples: 1, fps: s.fps, transparent: s.transparent)
            try ImageOutput.writePNG(img, to: url)
            progress(Progress(frame: 1, total: 1))

        case .pngSequence:
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            // Read back straight from shared memory, and compress the PNGs on
            // other cores while the GPU renders the next frames.
            let out = gpu.makeTexture(width: s.width, height: s.height, format: .bgra8Unorm, usage: [.renderTarget, .shaderRead],
                                      storage: .shared)
            let writers = OperationQueue()
            writers.maxConcurrentOperationCount = 4
            let slots = DispatchSemaphore(value: 8)
            let failure = PNGFailure()
            defer { writers.waitUntilAllOperationsAreFinished() }
            for i in 0..<total {
                if isCancelled() { throw RenderError.cancelled }
                if let e = failure.error { throw e }
                let t = s.time(ofFrame: i)
                try renderSync(comp, at: t, output: out, samples: s.samples, fps: s.fps, frameIndex: UInt32(i), transparent: s.transparent, pool: pool)
                guard let img = ImageOutput.cgImage(from: out, premultipliedAlpha: s.transparent) else { throw RenderError.io("Could not read frame \(i).") }
                let file = url.appendingPathComponent(String(format: "frame-%05d.png", i))
                slots.wait()
                writers.addOperation {
                    defer { slots.signal() }
                    do { try ImageOutput.writePNG(img, to: file) } catch { failure.record(error) }
                }
                if i % 10 == 0 { preview?(img) }
                progress(Progress(frame: i + 1, total: total))
            }
            writers.waitUntilAllOperationsAreFinished()
            if let e = failure.error { throw e }

        case let .video(codec):
            let keepAlpha = s.transparent && codec.supportsAlpha
            // ProRes 4444 stores straight alpha and says so; HEVC with alpha takes it premultiplied.
            let straight = keepAlpha && codec == .prores4444
            let writer = try VideoWriter(url: url, width: s.width, height: s.height, fps: s.fps, codec: codec, audio: s.audio)
            let target = PixelBufferTarget(width: s.width, height: s.height, alpha: keepAlpha ? (straight ? .straight : .premultiplied) : nil)
            // The next frame is encoded while the GPU renders this one. Clips
            // decode into shared textures, so a composition with clips renders
            // one frame at a time.
            let depth = comp.videos.isEmpty ? 2 : 1
            var inFlight: [(index: Int, buffer: CVPixelBuffer, cvTex: CVMetalTexture, cb: MTLCommandBuffer)] = []
            func finishOldest() throws {
                let f = inFlight.removeFirst()
                f.cb.waitUntilCompleted()
                if let e = f.cb.error { throw RenderError.io("GPU error: \(e.localizedDescription)") }
                _ = f.cvTex
                try writer.append(f.buffer)
                if let preview, f.index % 12 == 0,
                   let img = ImageOutput.cgImage(pixelBuffer: f.buffer, keepAlpha: keepAlpha, straight: straight) { preview(img) }
                progress(Progress(frame: f.index + 1, total: total))
            }
            do {
                for i in 0..<total {
                    if isCancelled() { throw RenderError.cancelled }
                    let (buffer, texture, cvTex) = try target.next()
                    guard let cb = gpu.queue.makeCommandBuffer() else { throw RenderError.io("GPU unavailable.") }
                    try encode(cb, comp, at: s.time(ofFrame: i), output: texture, samples: s.samples, fps: s.fps,
                               frameIndex: UInt32(i), transparent: keepAlpha, pool: pool, straightAlpha: straight)
                    cb.commit()
                    inFlight.append((i, buffer, cvTex, cb))
                    if inFlight.count >= depth { try finishOldest() }
                }
                while !inFlight.isEmpty { try finishOldest() }
                try await writer.finish()
            } catch {
                // Frames still on the GPU write into pixel buffers; let them finish first.
                for f in inFlight { f.cb.waitUntilCompleted() }
                inFlight.removeAll()
                writer.cancel()
                throw error
            }
        }
    }
}

/// The first error from the PNG writers, read from the render loop.
final class PNGFailure: @unchecked Sendable {
    private let lock = NSLock()
    private var first: Error?
    var error: Error? { lock.lock(); defer { lock.unlock() }; return first }
    func record(_ e: Error) { lock.lock(); if first == nil { first = e }; lock.unlock() }
}
