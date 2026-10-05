import Foundation
import Metal
import simd

/// The final look applied to every frame: bloom, grade, vignette, grain,
/// dither and encoding. Shared by the background studio and the two
/// card apps so a look reads the same everywhere.
public struct FinishSettings: Codable, Hashable, Sendable {
    /// Exposure in stops.
    public var exposure: Float = 0
    /// −1…1, applied as an S-curve on perceptual lightness.
    public var contrast: Float = 0
    /// −1…1, scales OKLab chroma.
    public var saturation: Float = 0
    /// −1 (cool) … 1 (warm).
    public var warmth: Float = 0
    /// 0…1 glow around bright areas.
    public var bloom: Float = 0.18
    /// 0…1 darkening towards the edges.
    public var vignette: Float = 0.28
    /// 0…1 animated film grain.
    public var grain: Float = 0.22
    /// 0…1 grain particle size.
    public var grainSize: Float = 0.35
    /// 0…1 lens colour fringing at the edges.
    public var aberration: Float = 0

    public init() {}

    public static let clean: FinishSettings = {
        var f = FinishSettings()
        f.bloom = 0
        f.vignette = 0
        f.grain = 0
        return f
    }()

    public static let film: FinishSettings = {
        var f = FinishSettings()
        f.bloom = 0.25
        f.vignette = 0.35
        f.grain = 0.35
        f.grainSize = 0.45
        f.contrast = 0.08
        return f
    }()
}

/// Per-frame parameters for the finishing pass.
public struct FinishFrame: Sendable {
    public var frameIndex: UInt32
    /// True when the output keeps transparency (PNG / ProRes 4444).
    public var keepAlpha: Bool
    /// True when the destination stores sRGB-encoded values in a UNORM format.
    public var encodeSRGB: Bool

    public init(frameIndex: UInt32, keepAlpha: Bool = false, encodeSRGB: Bool = true) {
        self.frameIndex = frameIndex
        self.keepAlpha = keepAlpha
        self.encodeSRGB = encodeSRGB
    }
}

public final class Finisher {
    private let gpu = GPU.shared
    private let library: MTLLibrary
    private var chain: [MTLTexture] = []
    private var chainSize: (Int, Int) = (0, 0)

    public init() throws {
        library = try GPU.shared.library(named: "finish", source: ShaderPrelude.source + Finisher.source)
    }

    private func pipeline(_ fragment: String, _ format: MTLPixelFormat, blend: GPU.Blend = .opaque) throws -> MTLRenderPipelineState {
        try gpu.renderPipeline(.init(library: "finish", vertex: "fs_vertex", fragment: fragment, color: format, blend: blend), library: library)
    }

    private func ensureChain(width: Int, height: Int) {
        if chainSize == (width, height), !chain.isEmpty { return }
        chain.removeAll()
        var w = max(1, width / 2), h = max(1, height / 2)
        for i in 0..<6 {
            chain.append(gpu.makeTexture(width: w, height: h, format: .rgba16Float, label: "bloom\(i)"))
            w = max(1, w / 2)
            h = max(1, h / 2)
            if w < 4 || h < 4 { break }
        }
        chainSize = (width, height)
    }

    /// Encodes bloom and the composite pass. `input` holds premultiplied linear
    /// colour (rgba16Float); `output` receives the finished frame.
    public func encode(_ cb: MTLCommandBuffer, input: MTLTexture, output: MTLTexture,
                       settings: FinishSettings, frame: FinishFrame) throws {
        let linear = gpu.sampler(.linearClamp)
        let useBloom = settings.bloom > 0.001
        if useBloom {
            ensureChain(width: input.width, height: input.height)
            // Prefilter + downsample
            var source = input
            for (i, target) in chain.enumerated() {
                let pass = MTLRenderPassDescriptor()
                pass.colorAttachments[0].texture = target
                pass.colorAttachments[0].loadAction = .dontCare
                pass.colorAttachments[0].storeAction = .store
                guard let enc = cb.makeRenderCommandEncoder(descriptor: pass) else { continue }
                enc.label = "bloom down \(i)"
                enc.setRenderPipelineState(try pipeline(i == 0 ? "bloom_prefilter" : "bloom_down", .rgba16Float))
                var texel = SIMD4<Float>(1 / Float(source.width), 1 / Float(source.height), 1.02, 0.35)
                enc.setFragmentBytes(&texel, length: MemoryLayout<SIMD4<Float>>.stride, index: 0)
                enc.setFragmentTexture(source, index: 0)
                enc.setFragmentSamplerState(linear, index: 0)
                enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
                enc.endEncoding()
                source = target
            }
            // Upsample + accumulate (additive into the next-larger level)
            if chain.count > 1 {
                for i in stride(from: chain.count - 1, to: 0, by: -1) {
                    let src = chain[i], dst = chain[i - 1]
                    let pass = MTLRenderPassDescriptor()
                    pass.colorAttachments[0].texture = dst
                    pass.colorAttachments[0].loadAction = .load
                    pass.colorAttachments[0].storeAction = .store
                    guard let enc = cb.makeRenderCommandEncoder(descriptor: pass) else { continue }
                    enc.label = "bloom up \(i)"
                    enc.setRenderPipelineState(try pipeline("bloom_up", .rgba16Float, blend: .add))
                    var texel = SIMD4<Float>(1 / Float(src.width), 1 / Float(src.height), 1.0, 0)
                    enc.setFragmentBytes(&texel, length: MemoryLayout<SIMD4<Float>>.stride, index: 0)
                    enc.setFragmentTexture(src, index: 0)
                    enc.setFragmentSamplerState(linear, index: 0)
                    enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
                    enc.endEncoding()
                }
            }
        }

        let pass = MTLRenderPassDescriptor()
        pass.colorAttachments[0].texture = output
        pass.colorAttachments[0].loadAction = .dontCare
        pass.colorAttachments[0].storeAction = .store
        guard let enc = cb.makeRenderCommandEncoder(descriptor: pass) else { return }
        enc.label = "finish"
        enc.setRenderPipelineState(try pipeline("finish_composite", output.pixelFormat))
        var u = FinishUniforms(
            width: Float(output.width), height: Float(output.height),
            exposure: settings.exposure, contrast: settings.contrast,
            saturation: settings.saturation, warmth: settings.warmth,
            bloom: useBloom ? settings.bloom : 0, vignette: settings.vignette,
            grain: settings.grain, grainSize: settings.grainSize,
            aberration: settings.aberration, frame: Float(frame.frameIndex % 100_000),
            keepAlpha: frame.keepAlpha ? 1 : 0, encodeSRGB: frame.encodeSRGB ? 1 : 0,
            pad0: 0, pad1: 0)
        enc.setFragmentBytes(&u, length: MemoryLayout<FinishUniforms>.stride, index: 0)
        enc.setFragmentTexture(input, index: 0)
        enc.setFragmentTexture(useBloom ? chain[0] : input, index: 1)
        enc.setFragmentSamplerState(linear, index: 0)
        enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        enc.endEncoding()
    }

    struct FinishUniforms {
        var width: Float, height: Float
        var exposure: Float, contrast: Float, saturation: Float, warmth: Float
        var bloom: Float, vignette: Float, grain: Float, grainSize: Float
        var aberration: Float, frame: Float
        var keepAlpha: Float, encodeSRGB: Float
        var pad0: Float, pad1: Float
    }

    static let source = #"""
struct FinishU {
    float width, height;
    float exposure, contrast, saturation, warmth;
    float bloom, vignette, grain, grainSize;
    float aberration, frame;
    float keepAlpha, encodeSRGB;
    float pad0, pad1;
};

inline float3 down13(texture2d<float> t, sampler s, float2 uv, float2 tx) {
    float3 a = t.sample(s, uv + tx * float2(-2, -2)).rgb;
    float3 b = t.sample(s, uv + tx * float2( 0, -2)).rgb;
    float3 c = t.sample(s, uv + tx * float2( 2, -2)).rgb;
    float3 d = t.sample(s, uv + tx * float2(-2,  0)).rgb;
    float3 e = t.sample(s, uv).rgb;
    float3 f = t.sample(s, uv + tx * float2( 2,  0)).rgb;
    float3 g = t.sample(s, uv + tx * float2(-2,  2)).rgb;
    float3 h = t.sample(s, uv + tx * float2( 0,  2)).rgb;
    float3 i = t.sample(s, uv + tx * float2( 2,  2)).rgb;
    float3 j = t.sample(s, uv + tx * float2(-1, -1)).rgb;
    float3 k = t.sample(s, uv + tx * float2( 1, -1)).rgb;
    float3 l = t.sample(s, uv + tx * float2(-1,  1)).rgb;
    float3 m = t.sample(s, uv + tx * float2( 1,  1)).rgb;
    return e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
}

fragment float4 bloom_prefilter(FSOut in [[stage_in]], constant float4 &p [[buffer(0)]],
                                texture2d<float> src [[texture(0)]], sampler s [[sampler(0)]]) {
    float3 c = min(down13(src, s, in.uv, p.xy), float3(24.0));
    float threshold = p.z, knee = p.w * threshold;
    float br = max(c.r, max(c.g, c.b));
    float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-5);
    float contrib = max(soft, br - threshold) / max(br, 1e-5);
    return float4(c * contrib, 1.0);
}

fragment float4 bloom_down(FSOut in [[stage_in]], constant float4 &p [[buffer(0)]],
                           texture2d<float> src [[texture(0)]], sampler s [[sampler(0)]]) {
    return float4(down13(src, s, in.uv, p.xy), 1.0);
}

fragment float4 bloom_up(FSOut in [[stage_in]], constant float4 &p [[buffer(0)]],
                         texture2d<float> src [[texture(0)]], sampler s [[sampler(0)]]) {
    float2 tx = p.xy * p.z;
    float3 c = src.sample(s, in.uv + float2(-tx.x, -tx.y)).rgb
             + src.sample(s, in.uv + float2(0.0, -tx.y)).rgb * 2.0
             + src.sample(s, in.uv + float2(tx.x, -tx.y)).rgb
             + src.sample(s, in.uv + float2(-tx.x, 0.0)).rgb * 2.0
             + src.sample(s, in.uv).rgb * 4.0
             + src.sample(s, in.uv + float2(tx.x, 0.0)).rgb * 2.0
             + src.sample(s, in.uv + float2(-tx.x, tx.y)).rgb
             + src.sample(s, in.uv + float2(0.0, tx.y)).rgb * 2.0
             + src.sample(s, in.uv + float2(tx.x, tx.y)).rgb;
    return float4(c / 16.0, 0.0);
}

// Value-noise film grain; size in output pixels, re-seeded every frame.
inline float grainValue(float2 pix, uint frame, float size) {
    float2 p = pix / max(size, 0.75);
    int2 i = int2(floor(p));
    float2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash1(i, frame), b = hash1(i + int2(1, 0), frame);
    float c = hash1(i + int2(0, 1), frame), d = hash1(i + int2(1, 1), frame);
    float n1 = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    uint fr2 = frame * 1664525u + 97u;
    float e = hash1(i, fr2), g = hash1(i + int2(1, 0), fr2);
    float h = hash1(i + int2(0, 1), fr2), k = hash1(i + int2(1, 1), fr2);
    float n2 = mix(mix(e, g, f.x), mix(h, k, f.x), f.y);
    return (n1 + n2 - 1.0) * 1.6;
}

// Hue-preserving shoulder: identity below `k`, smooth roll-off above.
inline float3 shoulder(float3 c) {
    const float k = 0.82;
    float m = max(c.r, max(c.g, c.b));
    if (m <= k) return c;
    float t = k + (1.0 - k) * (1.0 - exp(-(m - k) / (1.0 - k)));
    return c * (t / m);
}

fragment float4 finish_composite(FSOut in [[stage_in]], constant FinishU &u [[buffer(0)]],
                                 texture2d<float> src [[texture(0)]],
                                 texture2d<float> bloomTex [[texture(1)]],
                                 sampler s [[sampler(0)]]) {
    float2 uv = in.uv;
    float4 c;
    if (u.aberration > 0.001) {
        float2 d = uv - 0.5;
        float k = u.aberration * 0.006 * dot(d, d) * 4.0;
        float4 g = src.sample(s, uv);
        float r = src.sample(s, uv - d * k).r;
        float b = src.sample(s, uv + d * k).b;
        c = float4(r, g.g, b, g.a);
    } else {
        c = src.sample(s, uv);
    }
    if (u.bloom > 0.0) {
        float3 bl = bloomTex.sample(s, uv).rgb * (u.bloom * 0.9);
        c.rgb += bl;
        if (u.keepAlpha > 0.5) c.a = clamp(c.a + luma(bl), 0.0, 1.0);
    }
    float a = u.keepAlpha > 0.5 ? c.a : 1.0;
    float3 rgb = u.keepAlpha > 0.5 ? (a > 1e-5 ? c.rgb / a : float3(0.0)) : c.rgb;

    // Exposure and white balance in linear light.
    rgb *= exp2(u.exposure);
    rgb *= float3(1.0 + 0.10 * u.warmth, 1.0 + 0.015 * u.warmth, 1.0 - 0.12 * u.warmth);

    // Contrast + saturation in OKLab, hue preserving.
    if (abs(u.contrast) > 0.001 || abs(u.saturation) > 0.001) {
        float3 lab = linear_to_oklab(max(rgb, float3(0.0)));
        float L = clamp(lab.x, 0.0, 1.0);
        float k = 1.0 + u.contrast * 1.4;
        float Lc = (L < 0.5) ? 0.5 * pow(2.0 * L, k) : 1.0 - 0.5 * pow(2.0 * (1.0 - L), k);
        lab.x = mix(lab.x, Lc, step(0.0, lab.x) * step(lab.x, 1.0));
        lab.yz *= max(0.0, 1.0 + u.saturation);
        rgb = max(oklab_to_linear(lab), float3(0.0));
    }

    rgb = shoulder(rgb);

    // Vignette (aspect aware, gentle).
    if (u.vignette > 0.001) {
        float2 d = (uv - 0.5) * float2(u.width / u.height, 1.0);
        float r = length(d) / length(float2(u.width / u.height, 1.0) * 0.5);
        float v = 1.0 - u.vignette * 0.75 * smoothstep(0.25, 1.15, r);
        rgb *= v;
    }

    float3 outc = u.encodeSRGB > 0.5 ? linear_to_srgb(rgb) : rgb;

    uint2 pix = uint2(in.position.xy);
    uint frame = uint(u.frame);
    if (u.grain > 0.001) {
        float size = mix(1.0, 3.2, u.grainSize) * max(u.height / 1080.0, 0.35);
        float n = grainValue(in.position.xy, frame + 1u, size);
        float L = clamp(luma(outc), 0.0, 1.0);
        float w = 0.30 + 2.2 * L * (1.0 - L);
        outc += n * u.grain * 0.085 * w;
    }
    if (u.encodeSRGB > 0.5) {
        outc += ditherTri(pix, frame);
    }
    outc = clamp(outc, 0.0, 1.0);
    return float4(outc * a, a);
}
"""#
}
