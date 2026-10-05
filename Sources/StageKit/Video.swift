import AVFoundation
import CoreVideo
import Foundation
import Metal
import RenderCore

/// A clip placed in a composition.
public struct VideoClip: Sendable, Hashable {
    public let url: URL
    public let duration: Double

    public init(url: URL, duration: Double) {
        self.url = url
        self.duration = duration
    }
}

/// Decodes one clip forward in time, reusing its reader while time moves
/// forward and restarting it on seeks or loops. Frames arrive oriented
/// (the track's preferred transform is applied) and sRGB-tagged for Metal.
public final class VideoDecoder {
    public let clip: VideoClip
    private let asset: AVURLAsset
    private var reader: AVAssetReader?
    private var output: AVAssetReaderVideoCompositionOutput?
    private var cache: CVMetalTextureCache?
    private var videoComposition: AVVideoComposition?

    private struct Frame {
        var time: Double
        var texture: MTLTexture
        var hold: CVMetalTexture
    }

    private var current: Frame?
    private var pending: Frame?

    public init(clip: VideoClip) {
        self.clip = clip
        asset = AVURLAsset(url: clip.url)
        CVMetalTextureCacheCreate(kCFAllocatorDefault, nil, GPU.shared.device, nil, &cache)
        videoComposition = AVVideoComposition(propertiesOf: asset)
    }

    private func start(at time: Double) {
        reader?.cancelReading()
        current = nil
        pending = nil
        guard let track = asset.tracks(withMediaType: .video).first,
              let r = try? AVAssetReader(asset: asset) else { reader = nil; return }
        let from = max(0, time - 0.06)
        r.timeRange = CMTimeRange(start: CMTime(seconds: from, preferredTimescale: 6000), duration: .positiveInfinity)
        let out = AVAssetReaderVideoCompositionOutput(videoTracks: [track], videoSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferMetalCompatibilityKey as String: true,
        ])
        out.videoComposition = videoComposition
        out.alwaysCopiesSampleData = false
        guard r.canAdd(out) else { reader = nil; return }
        r.add(out)
        r.startReading()
        reader = r
        output = out
    }

    private func read() -> Frame? {
        guard let output, let cache, let sb = output.copyNextSampleBuffer(), let pb = CMSampleBufferGetImageBuffer(sb) else { return nil }
        let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb)
        var cv: CVMetalTexture?
        CVMetalTextureCacheCreateTextureFromImage(kCFAllocatorDefault, cache, pb, nil, .bgra8Unorm_srgb, w, h, 0, &cv)
        guard let cv, let tex = CVMetalTextureGetTexture(cv) else { return nil }
        return Frame(time: CMSampleBufferGetPresentationTimeStamp(sb).seconds, texture: tex, hold: cv)
    }

    /// The frame on screen at composition time `t`.
    public func texture(at t: Double) -> MTLTexture? {
        let duration = max(clip.duration, 0.04)
        let target = wrap(t, duration)
        if reader == nil || current == nil || target + 0.0005 < (current?.time ?? 0) || target > (current?.time ?? 0) + 1.0 {
            start(at: target)
        }
        var guardCount = 0
        while guardCount < 240 {
            guardCount += 1
            if pending == nil { pending = read() }
            guard let p = pending else { break }
            if p.time <= target + 0.0005 || current == nil {
                current = p
                pending = nil
            } else {
                break
            }
        }
        return current?.texture
    }
}

/// Decoders owned by one consumer (the live stage or one export).
public final class VideoPool {
    /// Two readers per clip: one plays it, the other reads its closing
    /// moments while a play dissolves back into its opening.
    private var decoders: [String: VideoDecoder] = [:]
    private var blends: [URL: MTLTexture] = [:]
    private var library: MTLLibrary?

    public init() {}

    private func decoder(_ clip: VideoClip, lane: Int) -> VideoDecoder {
        let key = "\(lane)|\(clip.url.absoluteString)"
        if let d = decoders[key] { return d }
        let d = VideoDecoder(clip: clip)
        decoders[key] = d
        return d
    }

    /// Substitutes live video frames into the composition's texture list. With a
    /// command buffer, a play's last moments dissolve into its opening frames.
    public func textures(for comp: Composition, at t: Double, commandBuffer cb: MTLCommandBuffer? = nil) -> [MTLTexture] {
        var textures = comp.textures
        let loop = comp.loopDuration
        for (index, clip) in comp.videos where index < textures.count {
            let read = Self.clipTimes(t, clip: clip.duration, loop: loop)
            guard let head = decoder(clip, lane: 0).texture(at: read.head) else { continue }
            textures[index] = head
            if let tailTime = read.tail, let cb, let tail = decoder(clip, lane: 1).texture(at: tailTime),
               let mixed = blend(tail, into: head, weight: read.weight, clip: clip.url, cb) {
                textures[index] = mixed
            }
        }
        return textures
    }

    /// Where to read a clip at composition time `t`. The clip plays a whole
    /// number of times per loop, at the nearest speed that fits (a 6 s clip in
    /// a 20 s loop runs about three times at 1.1×), and each play ends by
    /// dissolving into its own opening, so the loop closes and a clip that does
    /// not loop by itself never cuts. A clip far longer than the loop keeps its
    /// own speed: its first part plays and dissolves back to its start.
    /// `tail` is the frame to dissolve from, and `weight` how far the opening has come in.
    public static func clipTimes(_ t: Double, clip: Double, loop: Double) -> (head: Double, tail: Double?, weight: Float) {
        let D = max(clip, 0.04)
        let local = wrap(t, loop)
        var fade = min(0.5, D * 0.2)
        var play = max(D - fade, 0.04)
        let x = loop / play
        // The whole number of plays nearest x in ratio, at least one.
        let lower: Double = floor(x), upper: Double = ceil(x)
        let offLower: Double = abs(log(lower / x)), offUpper: Double = abs(log(upper / x))
        var n: Double = 1
        if lower >= 1 {
            n = offLower <= offUpper ? lower : upper
        } else if upper >= 1 {
            n = upper
        }
        // Rather than rush a clip, play it one time fewer, a little slower.
        if n / x > 1.34, x >= 1 { n = floor(x) }
        var rate = n / x
        if rate > 1.34 {
            // Only a clip far longer than the loop gets here.
            fade = min(0.5, loop * 0.1)
            play = loop
            rate = 1
        }
        let tau = wrap(local * rate, play)
        guard tau < fade, fade > 0.01 else { return (tau, nil, 1) }
        return (tau, min(tau + play, D - 0.001), Ease.smooth(Float(tau / fade)))
    }

    /// Mixes the closing frame into the opening one, in linear light.
    private func blend(_ tail: MTLTexture, into head: MTLTexture, weight: Float, clip: URL, _ cb: MTLCommandBuffer) -> MTLTexture? {
        let gpu = GPU.shared
        if library == nil { library = try? gpu.library(named: "video-blend", source: ShaderPrelude.source + Self.source) }
        guard let library else { return nil }
        var out = blends[clip]
        if out == nil || out!.width != head.width || out!.height != head.height {
            out = gpu.makeTexture(width: head.width, height: head.height, format: .bgra8Unorm_srgb, usage: [.renderTarget, .shaderRead])
            blends[clip] = out
        }
        guard let out, let pipeline = try? gpu.renderPipeline(.init(library: "video-blend", vertex: "fs_vertex", fragment: "video_blend",
                                                                    color: out.pixelFormat), library: library) else { return nil }
        let pass = MTLRenderPassDescriptor()
        pass.colorAttachments[0].texture = out
        pass.colorAttachments[0].loadAction = .dontCare
        pass.colorAttachments[0].storeAction = .store
        guard let enc = cb.makeRenderCommandEncoder(descriptor: pass) else { return nil }
        enc.label = "clip dissolve"
        enc.setRenderPipelineState(pipeline)
        enc.setFragmentTexture(tail, index: 0)
        enc.setFragmentTexture(head, index: 1)
        enc.setFragmentSamplerState(gpu.sampler(.linearClamp), index: 0)
        var w = weight
        enc.setFragmentBytes(&w, length: MemoryLayout<Float>.stride, index: 0)
        enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        enc.endEncoding()
        return out
    }

    static let source = #"""
fragment float4 video_blend(FSOut in [[stage_in]], texture2d<float> tail [[texture(0)]], texture2d<float> head [[texture(1)]],
                            sampler s [[sampler(0)]], constant float &w [[buffer(0)]]) {
    return mix(tail.sample(s, in.uv), head.sample(s, in.uv), w);
}
"""#
}
