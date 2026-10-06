import CoreGraphics
import Foundation
import Metal
import RenderCore

/// Words set over the finished frame: a title with an optional short line
/// above it. The app sets the type; the exporter places it in time.
public struct ReelTitle: Codable, Hashable, Sendable {
    public enum Placement: String, Codable, CaseIterable, Sendable {
        /// Small, in a corner clear of platform controls, like a caption.
        case corner
        /// Large and centred over a dimmed stage, like a title card.
        case centre

        public var title: String { self == .corner ? "Caption" : "Title card" }
    }

    public enum Timing: String, Codable, CaseIterable, Sendable {
        case throughout, opening, closing

        public var title: String {
            switch self {
            case .throughout: return "Throughout"
            case .opening: return "Opening"
            case .closing: return "Closing"
            }
        }
    }

    public enum Ink: String, Codable, CaseIterable, Sendable {
        case auto, light, dark

        public var title: String { rawValue.capitalized }
    }

    /// The typeface the words are set in.
    public enum Face: String, Codable, CaseIterable, Sendable {
        case modern, grotesk, editorial, poster

        public var title: String {
            switch self {
            case .modern: return "Modern"
            case .grotesk: return "Grotesk"
            case .editorial: return "Editorial"
            case .poster: return "Poster"
            }
        }
    }

    public var text: String
    /// The short line above the title, such as a date or a client.
    public var kicker: String
    public var placement: Placement
    public var timing: Timing
    public var ink: Ink
    public var face: Face

    public init(text: String = "", kicker: String = "", placement: Placement = .corner, timing: Timing = .throughout, ink: Ink = .auto,
                face: Face = .modern) {
        self.text = text
        self.kicker = kicker
        self.placement = placement
        self.timing = timing
        self.ink = ink
        self.face = face
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        text = try c.decodeIfPresent(String.self, forKey: .text) ?? ""
        kicker = try c.decodeIfPresent(String.self, forKey: .kicker) ?? ""
        placement = try c.decodeIfPresent(Placement.self, forKey: .placement) ?? .corner
        timing = try c.decodeIfPresent(Timing.self, forKey: .timing) ?? .throughout
        ink = try c.decodeIfPresent(Ink.self, forKey: .ink) ?? .auto
        face = try c.decodeIfPresent(Face.self, forKey: .face) ?? .modern
    }

    public var isEmpty: Bool {
        text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && kicker.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

/// A title ready to draw over a composition.
public struct TitleOverlay: @unchecked Sendable {
    /// Identity of the words, their setting and ink, for caching the drawing.
    public var key: Int
    public var timing: ReelTitle.Timing
    /// How far the stage dims behind the words, 0…1.
    public var scrim: Float
    /// Draws the words over a transparent frame of this pixel size, premultiplied.
    public var draw: @Sendable (Int, Int) -> CGImage?

    public init(key: Int, timing: ReelTitle.Timing, scrim: Float, draw: @escaping @Sendable (Int, Int) -> CGImage?) {
        self.key = key
        self.timing = timing
        self.scrim = scrim
        self.draw = draw
    }

    /// Opacity, and how far below its place the title sits (a share of the
    /// frame height), at time `t`. An opening title rises in after the loop
    /// begins and clears a few seconds later; a closing one rises in a few
    /// seconds before the end and clears just before the loop turns. Either
    /// way the loop's first and last frames have no title, so it still closes.
    public func presence(at t: Double, loop: Double) -> (alpha: Float, drop: Float) {
        guard let w = window(loop: loop) else { return (1, 0) }
        let u = wrap(t, loop)
        let inT = Float(max(0, min(1, (u - w.start) / w.fadeIn)))
        let outT = Float(max(0, min(1, (u - w.end) / w.fadeOut)))
        let alpha = Ease.smoother(inT) * (1 - Ease.smoother(outT))
        let settle = 1 - inT
        return (alpha, 0.014 * settle * settle * settle)
    }

    /// When an opening or closing title starts to rise in and starts to clear,
    /// and how long each fade takes; nil for a title shown throughout.
    public func window(loop: Double) -> (start: Double, fadeIn: Double, end: Double, fadeOut: Double)? {
        guard timing != .throughout else { return nil }
        let margin = min(0.35, loop * 0.04)
        let fadeIn = min(0.8, loop * 0.1)
        let fadeOut = min(0.7, loop * 0.08)
        // How long the title holds at full strength.
        let hold = max(1.4, min(3.9, loop * 0.42) - margin - fadeIn)
        let start = timing == .opening ? margin : max(loop * 0.3, loop - margin - fadeOut - hold - fadeIn)
        let end = min(start + fadeIn + hold, loop - fadeOut - margin)
        return (start, fadeIn, end, fadeOut)
    }

    /// A soft rush of air as the title rises in, for the sound mix.
    public func soundEvents(loop: Double) -> [SoundEvent] {
        guard let w = window(loop: loop) else { return [] }
        return [SoundEvent(time: w.start + w.fadeIn * 0.15, cue: .air, intensity: 0.4)]
    }
}

/// Draws a title over the finished frame: the dimming behind a title card,
/// then the words, in one premultiplied pass.
final class TitleCompositor {
    private let library: MTLLibrary
    private var cached: (key: Int, width: Int, height: Int, texture: MTLTexture)?
    private let lock = NSLock()

    init() throws {
        library = try GPU.shared.library(named: "title", source: ShaderPrelude.source + Self.source)
    }

    func encode(_ cb: MTLCommandBuffer, _ overlay: TitleOverlay, at t: Double, loop: Double, output: MTLTexture) throws {
        let (alpha, drop) = overlay.presence(at: t, loop: loop)
        guard alpha > 0.002, let words = texture(overlay, output.width, output.height) else { return }
        let gpu = GPU.shared
        let pass = MTLRenderPassDescriptor()
        pass.colorAttachments[0].texture = output
        pass.colorAttachments[0].loadAction = .load
        pass.colorAttachments[0].storeAction = .store
        guard let enc = cb.makeRenderCommandEncoder(descriptor: pass) else { return }
        enc.label = "title"
        enc.setRenderPipelineState(try gpu.renderPipeline(.init(library: "title", vertex: "fs_vertex", fragment: "title_fragment",
                                                                color: output.pixelFormat, blend: .over), library: library))
        var p = SIMD4<Float>(alpha, drop, overlay.scrim * alpha, 0)
        enc.setFragmentBytes(&p, length: MemoryLayout<SIMD4<Float>>.stride, index: 0)
        enc.setFragmentTexture(words, index: 0)
        enc.setFragmentSamplerState(gpu.sampler(.linearClamp), index: 0)
        enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        enc.endEncoding()
    }

    /// Copies a premultiplied frame into `output` as straight colour, for
    /// ProRes 4444: the words are laid over the frame first, premultiplied,
    /// so their fades and edges composite like everything else.
    func straighten(_ cb: MTLCommandBuffer, from input: MTLTexture, to output: MTLTexture) throws {
        let pass = MTLRenderPassDescriptor()
        pass.colorAttachments[0].texture = output
        pass.colorAttachments[0].loadAction = .dontCare
        pass.colorAttachments[0].storeAction = .store
        guard let enc = cb.makeRenderCommandEncoder(descriptor: pass) else { return }
        enc.label = "straight alpha"
        enc.setRenderPipelineState(try GPU.shared.renderPipeline(.init(library: "title", vertex: "fs_vertex", fragment: "unpremultiply_fragment",
                                                                       color: output.pixelFormat, blend: .opaque), library: library))
        enc.setFragmentTexture(input, index: 0)
        enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        enc.endEncoding()
    }

    /// The drawn words at this size, kept until the words or the size change.
    private func texture(_ overlay: TitleOverlay, _ width: Int, _ height: Int) -> MTLTexture? {
        lock.lock()
        defer { lock.unlock() }
        if let c = cached, c.key == overlay.key, c.width == width, c.height == height { return c.texture }
        guard let image = overlay.draw(width, height) else { return nil }
        let tex = GPU.shared.makeTexture(width: width, height: height, format: .rgba8Unorm, usage: [.shaderRead], storage: .shared)
        let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        guard let ctx else { return nil }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        guard let data = ctx.data else { return nil }
        tex.replace(region: MTLRegionMake2D(0, 0, width, height), mipmapLevel: 0, withBytes: data, bytesPerRow: width * 4)
        cached = (overlay.key, width, height, tex)
        return tex
    }

    static let source = #"""
// Premultiplied in, straight out.
fragment float4 unpremultiply_fragment(FSOut in [[stage_in]], texture2d<float> src [[texture(0)]]) {
    float4 c = src.read(uint2(in.position.xy));
    return c.a > 1e-5 ? float4(clamp(c.rgb / c.a, 0.0, 1.0), c.a) : float4(0.0);
}

// The words, dropped `p.y` of the frame below their place, faded by `p.x`,
// over a black dimming of `p.z`.
fragment float4 title_fragment(FSOut in [[stage_in]], texture2d<float> words [[texture(0)]], sampler s [[sampler(0)]],
                               constant float4 &p [[buffer(0)]]) {
    float2 uv = in.uv - float2(0.0, p.y);
    float4 w = uv.y >= 0.0 ? words.sample(s, uv) * p.x : float4(0.0);
    return float4(w.rgb, w.a + p.z * (1.0 - w.a));
}
"""#
}
