import Foundation
import Metal
import RenderCore

/// Renders a `BackdropSettings` into a linear rgba16Float texture.
///
/// Stateless: the same settings and phase always give the same pixels, which
/// is what makes loops seamless, scrubbing exact, and export match preview.
public final class BackdropRenderer {
    public static let format: MTLPixelFormat = .rgba16Float

    private let gpu = GPU.shared
    private let library: MTLLibrary

    public init() throws {
        library = try GPU.shared.library(named: "backdrop", source: BackdropShaders.library)
    }

    /// Compiles every look up front so the first swipe through the gallery is smooth.
    public func warmUp() {
        for id in BackdropShaders.styleIds {
            _ = try? pipeline(for: id)
        }
    }

    private func pipeline(for style: String) throws -> MTLRenderPipelineState {
        let id = BackdropShaders.styleIds.contains(style) ? style : "studio"
        return try gpu.renderPipeline(.init(library: "backdrop", vertex: "fs_vertex", fragment: "bdf_\(id)", color: Self.format),
                                      library: library)
    }

    /// Encodes the background into `target`, replacing its contents.
    /// - Parameters:
    ///   - phase: position in the loop, 0…1. Phase 0 and phase 1 are identical.
    ///   - loopSeconds: loop length, only informational for looks that care.
    public func encode(_ cb: MTLCommandBuffer, target: MTLTexture, settings: BackdropSettings,
                       phase: Double, loopSeconds: Double = 12) throws {
        let pass = MTLRenderPassDescriptor()
        pass.colorAttachments[0].texture = target
        pass.colorAttachments[0].loadAction = .dontCare
        pass.colorAttachments[0].storeAction = .store
        guard let enc = cb.makeRenderCommandEncoder(descriptor: pass) else { return }
        enc.label = "backdrop \(settings.style)"
        enc.setRenderPipelineState(try pipeline(for: settings.style))
        var u = Self.uniforms(settings: settings, width: target.width, height: target.height, phase: phase, loopSeconds: loopSeconds)
        enc.setFragmentBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 0)
        var pal = settings.palette.gpuEntries
        enc.setFragmentBytes(&pal, length: MemoryLayout<SIMD4<Float>>.stride * pal.count, index: 1)
        enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        enc.endEncoding()
    }

    struct Uniforms {
        var width: Float, height: Float, aspect: Float, phase: Float
        var time: Float, seed: Float, scale: Float, motion: Float
        var detail: Float, softness: Float, accent: Float, loopSeconds: Float
        var colorCount: Float, transparent: Float, vignette: Float, brightness: Float
    }

    static func uniforms(settings s: BackdropSettings, width: Int, height: Int, phase: Double, loopSeconds: Double) -> Uniforms {
        let wrapped = phase - floor(phase)
        return Uniforms(width: Float(width), height: Float(height), aspect: Float(width) / Float(max(height, 1)),
                        phase: Float(wrapped), time: Float(wrapped * loopSeconds), seed: Float(s.seed % 997),
                        scale: s.scale, motion: s.motion, detail: s.detail, softness: s.softness, accent: s.accent,
                        loopSeconds: Float(loopSeconds), colorCount: Float(s.palette.gpuCount), transparent: 0,
                        vignette: s.vignette, brightness: s.brightness)
    }
}
