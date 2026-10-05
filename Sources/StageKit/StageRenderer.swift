import BackdropKit
import Foundation
import Metal
import RenderCore
import simd

/// Renders stage frames: backdrop, shadows, cards, then (optionally) motion
/// blur accumulation and the finishing pass.
public final class StageRenderer {
    public static let hdrFormat: MTLPixelFormat = .rgba16Float

    private let gpu = GPU.shared
    private let library: MTLLibrary
    public let backdrop: BackdropRenderer
    public let finisher: Finisher
    private let grid: MTLBuffer
    private let gridIndices: MTLBuffer
    private let gridIndexCount: Int

    private lazy var white: MTLTexture = {
        let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: 4, height: 4, mipmapped: false)
        d.usage = [.shaderRead]
        let t = GPU.shared.device.makeTexture(descriptor: d)!
        let bytes = [UInt8](repeating: 255, count: 4 * 4 * 4)
        t.replace(region: MTLRegionMake2D(0, 0, 4, 4), mipmapLevel: 0, withBytes: bytes, bytesPerRow: 16)
        return t
    }()

    private func texture(for card: CardPose, _ textures: [MTLTexture]) -> MTLTexture? {
        if card.solid { return white }
        return card.media < textures.count ? textures[card.media] : nil
    }

    private var sceneTex: MTLTexture?
    private var accumTex: MTLTexture?
    private var backdropTex: MTLTexture?
    private var targetSize: (Int, Int) = (0, 0)
    private var backdropSize: (Int, Int) = (0, 0)

    public init() throws {
        library = try GPU.shared.library(named: "stage", source: StageShaders.library)
        backdrop = try BackdropRenderer()
        finisher = try Finisher()
        // A 48 × 28 grid: enough for smooth curls and folds on large cards.
        let cols = 48, rows = 28
        var verts: [SIMD2<Float>] = []
        verts.reserveCapacity((cols + 1) * (rows + 1))
        for j in 0...rows {
            for i in 0...cols {
                verts.append(SIMD2(Float(i) / Float(cols), Float(j) / Float(rows)))
            }
        }
        var idx: [UInt32] = []
        idx.reserveCapacity(cols * rows * 6)
        for j in 0..<rows {
            for i in 0..<cols {
                let a = UInt32(j * (cols + 1) + i)
                let b = a + 1
                let c = a + UInt32(cols + 1)
                let d = c + 1
                idx += [a, b, c, b, d, c]
            }
        }
        grid = GPU.shared.device.makeBuffer(bytes: verts, length: verts.count * MemoryLayout<SIMD2<Float>>.stride)!
        gridIndices = GPU.shared.device.makeBuffer(bytes: idx, length: idx.count * 4)!
        gridIndexCount = idx.count
    }

    public func warmUp() {
        backdrop.warmUp()
        _ = try? pipelines()
    }

    struct Pipelines {
        let card: MTLRenderPipelineState
        let shadow: MTLRenderPipelineState
        let accumulate: MTLRenderPipelineState
        let copy: MTLRenderPipelineState
    }

    private var cached: Pipelines?

    private func pipelines() throws -> Pipelines {
        if let cached { return cached }
        let fmt = Self.hdrFormat
        let p = Pipelines(
            card: try gpu.renderPipeline(.init(library: "stage", vertex: "card_vertex", fragment: "card_fragment", color: fmt, blend: .over), library: library),
            shadow: try gpu.renderPipeline(.init(library: "stage", vertex: "shadow_vertex", fragment: "shadow_fragment", color: fmt, blend: .darken), library: library),
            accumulate: try gpu.renderPipeline(.init(library: "stage", vertex: "fs_vertex", fragment: "accumulate_fragment", color: fmt, blend: .add), library: library),
            copy: try gpu.renderPipeline(.init(library: "stage", vertex: "fs_vertex", fragment: "copy_fragment", color: fmt), library: library))
        cached = p
        return p
    }

    private func ensureTargets(width: Int, height: Int) {
        if targetSize == (width, height), sceneTex != nil { return }
        sceneTex = gpu.makeTexture(width: width, height: height, format: Self.hdrFormat, label: "stage scene")
        accumTex = gpu.makeTexture(width: width, height: height, format: Self.hdrFormat, label: "stage accum")
        targetSize = (width, height)
    }

    private func ensureBackdrop(width: Int, height: Int) {
        if backdropSize == (width, height), backdropTex != nil { return }
        backdropTex = gpu.makeTexture(width: width, height: height, format: Self.hdrFormat, label: "stage backdrop")
        backdropSize = (width, height)
    }

    // MARK: - Public API

    public struct Request {
        public var width: Int
        public var height: Int
        public var backdrop: BackdropSettings
        public var backdropPhase: Double
        public var look: StageLook
        /// Motion-blur subframes. Each closure call returns the scene at a sub-time offset in −0.5…0.5 of the shutter.
        public var samples: Int
        public var frameIndex: UInt32
        public var keepAlpha: Bool
        /// Draw the background (false leaves transparency behind the cards).
        public var drawBackdrop: Bool
        /// Renders the background at a fraction of the output size (live playback only).
        public var backdropScale: Float = 1

        public init(width: Int, height: Int, backdrop: BackdropSettings, backdropPhase: Double, look: StageLook,
                    samples: Int = 1, frameIndex: UInt32 = 0, keepAlpha: Bool = false, drawBackdrop: Bool = true) {
            self.width = width
            self.height = height
            self.backdrop = backdrop
            self.backdropPhase = backdropPhase
            self.look = look
            self.samples = samples
            self.frameIndex = frameIndex
            self.keepAlpha = keepAlpha
            self.drawBackdrop = drawBackdrop
        }
    }

    /// Encodes a complete frame into `output` (bgra8Unorm, sRGB-encoded values).
    /// - Parameter frameAt: returns the stage frame for a shutter offset in −0.5…0.5.
    public func encode(_ cb: MTLCommandBuffer, output: MTLTexture, request r: Request,
                       textures: [MTLTexture], frameAt: (Float) -> StageFrame) throws {
        ensureTargets(width: r.width, height: r.height)
        let bs = max(0.25, min(1, r.backdropScale))
        ensureBackdrop(width: max(1, Int(Float(r.width) * bs)), height: max(1, Int(Float(r.height) * bs)))
        guard let sceneTex, let accumTex, let backdropTex else { return }
        let p = try pipelines()

        // Background once per frame (its motion is slow; shutter would be invisible).
        if r.drawBackdrop {
            try backdrop.encode(cb, target: backdropTex, settings: r.backdrop, phase: r.backdropPhase)
        }

        let samples = max(1, r.samples)
        if samples == 1 {
            try encodeScene(cb, target: sceneTex, backdropTex: r.drawBackdrop ? backdropTex : nil, frame: frameAt(0),
                            look: r.look, textures: textures, pipelines: p, width: r.width, height: r.height)
            try finisher.encode(cb, input: sceneTex, output: output, settings: r.look.finish,
                                frame: FinishFrame(frameIndex: r.frameIndex, keepAlpha: r.keepAlpha))
            return
        }

        // Clear the accumulator.
        let clear = MTLRenderPassDescriptor()
        clear.colorAttachments[0].texture = accumTex
        clear.colorAttachments[0].loadAction = .clear
        clear.colorAttachments[0].clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
        clear.colorAttachments[0].storeAction = .store
        cb.makeRenderCommandEncoder(descriptor: clear)?.endEncoding()

        for i in 0..<samples {
            // Stratified offsets across the shutter.
            let offset = (Float(i) + 0.5) / Float(samples) - 0.5
            try encodeScene(cb, target: sceneTex, backdropTex: r.drawBackdrop ? backdropTex : nil, frame: frameAt(offset),
                            look: r.look, textures: textures, pipelines: p, width: r.width, height: r.height)
            let pass = MTLRenderPassDescriptor()
            pass.colorAttachments[0].texture = accumTex
            pass.colorAttachments[0].loadAction = .load
            pass.colorAttachments[0].storeAction = .store
            guard let enc = cb.makeRenderCommandEncoder(descriptor: pass) else { continue }
            enc.setRenderPipelineState(p.accumulate)
            var w = SIMD4<Float>(1 / Float(samples), 0, 0, 0)
            enc.setFragmentBytes(&w, length: 16, index: 0)
            enc.setFragmentTexture(sceneTex, index: 0)
            enc.setFragmentSamplerState(gpu.sampler(.nearestClamp), index: 0)
            enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
            enc.endEncoding()
        }
        try finisher.encode(cb, input: accumTex, output: output, settings: r.look.finish,
                            frame: FinishFrame(frameIndex: r.frameIndex, keepAlpha: r.keepAlpha))
    }

    // MARK: - Scene pass

    private func encodeScene(_ cb: MTLCommandBuffer, target: MTLTexture, backdropTex: MTLTexture?, frame: StageFrame,
                             look: StageLook, textures: [MTLTexture], pipelines p: Pipelines,
                             width: Int, height: Int) throws {
        let pass = MTLRenderPassDescriptor()
        pass.colorAttachments[0].texture = target
        pass.colorAttachments[0].storeAction = .store
        if backdropTex == nil {
            pass.colorAttachments[0].loadAction = .clear
            pass.colorAttachments[0].clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
        } else {
            pass.colorAttachments[0].loadAction = .dontCare
        }
        guard let enc = cb.makeRenderCommandEncoder(descriptor: pass) else { return }
        enc.label = "stage scene"
        if let backdropTex {
            enc.setRenderPipelineState(p.copy)
            enc.setFragmentTexture(backdropTex, index: 0)
            enc.setFragmentSamplerState(gpu.sampler(backdropTex.width == width ? .nearestClamp : .linearClamp), index: 0)
            enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        }

        let aspect = Float(width) / Float(max(height, 1))
        var receiving = frame
        // Shadows land on a surface behind every card. Small cards keep it close,
        // so their shadows stay small and tucked; large ones (sheets, ledges) are
        // capped, so they do not push every shadow far back. A card counts only as
        // far as it shows and casts, so the surface never jumps when one fades in
        // or out, or arrives with its shadow still to come.
        if !frame.fixedGround, let deepest = frame.cards.map({ c -> Float in
            let side = max(c.size.x, c.size.y)
            let weight = min(min(max(c.opacity, 0), 1), Ease.smooth(c.shadow / 0.3))
            return c.position.z - min(0.35 * side, 0.15 * side + 0.12) + (1 - weight) * 3
        }).min() {
            receiving.groundZ = min(frame.groundZ, deepest)
        }
        var fu = frameUniforms(frame: receiving, look: look, aspect: aspect, width: width, height: height)
        enc.setVertexBytes(&fu, length: MemoryLayout<FrameUniforms>.stride, index: 1)
        enc.setFragmentBytes(&fu, length: MemoryLayout<FrameUniforms>.stride, index: 1)
        enc.setVertexBuffer(grid, offset: 0, index: 0)
        enc.setCullMode(.none)

        // Back to front by layer, then by depth along the view direction (not
        // straight-line distance, which would sort a large centred sheet in front
        // of cards near the edges). Ties keep scene order.
        let eye = SIMD3<Float>(fu.eye.x, fu.eye.y, fu.eye.z) - frame.camera.sway
        let forward = simd_normalize(frame.camera.target - eye)
        let order = frame.cards.indices.sorted { a, b in
            let la = frame.cards[a].layer, lb = frame.cards[b].layer
            if la != lb { return la < lb }
            let da = simd_dot(frame.cards[a].position - eye, forward)
            let db = simd_dot(frame.cards[b].position - eye, forward)
            if abs(da - db) < 1e-5 { return a < b }
            return da > db
        }

        let sampler = gpu.sampler(.anisotropicClamp)

        // Mirror floor first (reflections sit behind everything else).
        if frame.reflection > 0.001 {
            for i in order {
                let card = frame.cards[i]
                guard let tex = texture(for: card, textures), card.opacity > 0.001 else { continue }
                var cu = cardUniforms(card, look: look, mirror: SIMD4(1, frame.floorY, frame.reflection, 3.2))
                enc.setRenderPipelineState(p.card)
                enc.setVertexBytes(&cu, length: MemoryLayout<CardUniforms>.stride, index: 2)
                enc.setFragmentBytes(&cu, length: MemoryLayout<CardUniforms>.stride, index: 2)
                enc.setFragmentTexture(tex, index: 0)
                enc.setFragmentSamplerState(sampler, index: 0)
                enc.drawIndexedPrimitives(type: .triangle, indexCount: gridIndexCount, indexType: .uint32, indexBuffer: gridIndices, indexBufferOffset: 0)
            }
        }

        let softness = look.shadowSoftness
        // Shadows either land only on the ground (all drawn before any card) or
        // also on the cards behind (each drawn just before its own card).
        let passes: [(shadows: Bool, cards: Bool)] = frame.shadowsOnCards ? [(true, true)] : [(true, false), (false, true)]
        for pass in passes {
        for i in order {
            let card = frame.cards[i]
            guard let tex = texture(for: card, textures), card.opacity > 0.001 else { continue }
            var cu = cardUniforms(card, look: look, mirror: .zero)

            if pass.shadows && look.shadow > 0.001 && card.shadow > 0.001 {
                enc.setRenderPipelineState(p.shadow)
                enc.setVertexBytes(&cu, length: MemoryLayout<CardUniforms>.stride, index: 2)
                enc.setFragmentBytes(&cu, length: MemoryLayout<CardUniforms>.stride, index: 2)
                let minSide = min(card.size.x, card.size.y)
                // Ambient occlusion: wide and soft, straight behind.
                var ambient = SIMD4<Float>(1, minSide * 0.6, minSide * (0.05 + 0.08 * softness), 0.10 + 0.25 * softness)
                enc.setVertexBytes(&ambient, length: 16, index: 3)
                enc.setFragmentBytes(&ambient, length: 16, index: 3)
                enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 6)
                // Key shadow: directional, sharpening as the card nears its surface.
                var key = SIMD4<Float>(0, minSide * 0.5, minSide * (0.012 + 0.03 * softness), 0.04 + 0.22 * softness)
                enc.setVertexBytes(&key, length: 16, index: 3)
                enc.setFragmentBytes(&key, length: 16, index: 3)
                enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 6)
            }

            guard pass.cards else { continue }
            // Thickness in proportion to the card: a hairline on thumbnails.
            let thickness = card.solid ? 0 : 0.012 * min(card.size.x, card.size.y) * look.edge
            if thickness > 0.0003 {
                var eu = cu
                eu.extra.y = 1
                eu.extra.z = thickness
                eu.extra.w = cu.fx.w
                enc.setRenderPipelineState(p.card)
                enc.setVertexBytes(&eu, length: MemoryLayout<CardUniforms>.stride, index: 2)
                enc.setFragmentBytes(&eu, length: MemoryLayout<CardUniforms>.stride, index: 2)
                enc.setFragmentTexture(tex, index: 0)
                enc.setFragmentSamplerState(sampler, index: 0)
                enc.drawIndexedPrimitives(type: .triangle, indexCount: gridIndexCount, indexType: .uint32, indexBuffer: gridIndices, indexBufferOffset: 0)
            }
            enc.setRenderPipelineState(p.card)
            enc.setVertexBytes(&cu, length: MemoryLayout<CardUniforms>.stride, index: 2)
            enc.setFragmentBytes(&cu, length: MemoryLayout<CardUniforms>.stride, index: 2)
            enc.setFragmentTexture(tex, index: 0)
            enc.setFragmentSamplerState(sampler, index: 0)
            enc.drawIndexedPrimitives(type: .triangle, indexCount: gridIndexCount, indexType: .uint32, indexBuffer: gridIndices, indexBufferOffset: 0)
        }
        }
        enc.endEncoding()
    }

    // MARK: - Uniforms

    struct FrameUniforms {
        var viewProj: simd_float4x4
        var eye: SIMD4<Float>
        var viewport: SIMD4<Float>
        var dof: SIMD4<Float>
        var light: SIMD4<Float>
        var shadowP: SIMD4<Float>
    }

    struct CardUniforms {
        var model: simd_float4x4
        var sizeCorner: SIMD4<Float>
        var deform: SIMD4<Float>
        var media: SIMD4<Float>
        var fx: SIMD4<Float>
        var mirror: SIMD4<Float>
        var color: SIMD4<Float>
        var extra: SIMD4<Float>
        var crop: SIMD4<Float>
        var band: SIMD4<Float>
    }

    func frameUniforms(frame: StageFrame, look: StageLook, aspect: Float, width: Int, height: Int) -> FrameUniforms {
        let cam = frame.camera
        let eye = cam.eye
        let target = cam.target
        let viewProj = cam.viewProjection(aspect: aspect)

        let focus = cam.focusDistance ?? simd_length(target - eye)
        // Circle of confusion: pixels per unit of relative defocus.
        let dofStrength = look.depthOfField
        let cocScale = Float(height) * 0.06 * dofStrength
        let maxCoc = Float(height) * 0.018 * max(dofStrength, 0.0001) + 1
        let pxPerUnit = Float(height) / (2 * tanf(cam.fov * .pi / 360) * focus)

        let az = look.lightAzimuth * .pi / 180
        let el = look.lightElevation * .pi / 180
        let lightDir = simd_normalize(SIMD3<Float>(cosf(az) * cosf(el) * 0.9, sinf(az) * cosf(el) * 0.9, sinf(el) + 0.35))

        return FrameUniforms(
            viewProj: viewProj,
            eye: SIMD4(eye, 0),
            viewport: SIMD4(Float(width), Float(height), 1 / Float(width), 1 / Float(height)),
            dof: SIMD4(focus, cocScale, maxCoc, pxPerUnit),
            light: SIMD4(lightDir, look.shadow),
            shadowP: SIMD4(look.shadowSoftness, frame.groundZ, 0.55, 0.45))
    }

    func cardUniforms(_ c: CardPose, look: StageLook, mirror: SIMD4<Float>) -> CardUniforms {
        let model = Matrix.translation(c.position) * Matrix.rotationEuler(c.rotation)
        // Corners belong to the whole card, even when this card is one slice of it.
        let extent = SIMD2(max(c.crop.z - c.crop.x, 1e-5), max(c.crop.w - c.crop.y, 1e-5))
        let parent = c.size / extent
        let minSide = min(parent.x, parent.y)
        let corner = c.corner * (0.4 + 1.6 * look.corners) * minSide
        let bendKind: Float
        switch look.bend {
        case .rigid: bendKind = 0
        case .card: bendKind = 1
        case .paper: bendKind = 2
        case .silk: bendKind = 3
        }
        let surface: Float
        switch look.surface {
        case .original: surface = 0
        case .print: surface = 1
        case .gloss: surface = 2
        case .foil: surface = 3
        case .satin: surface = 4
        }
        return CardUniforms(
            model: model,
            sizeCorner: SIMD4(c.size.x, c.size.y, corner, c.opacity),
            deform: SIMD4(c.curl * look.bendAmount, c.fold * look.bendAmount, c.foldPhase, bendKind),
            media: SIMD4(c.fit == .fill ? 0 : 1, c.focal.x, c.focal.y, c.solid ? parent.x / max(parent.y, 0.0001) : c.mediaAspect),
            fx: SIMD4(c.glow, c.blur, c.shadow, c.solid ? 0 : surface),
            mirror: mirror,
            color: c.color,
            extra: SIMD4(c.reveal, 0, 0, 0),
            crop: c.crop,
            band: c.band)
    }
}

// MARK: - Matrices

public enum Matrix {
    public static func translation(_ t: SIMD3<Float>) -> simd_float4x4 {
        var m = matrix_identity_float4x4
        m.columns.3 = SIMD4(t, 1)
        return m
    }

    public static func scale(_ s: SIMD3<Float>) -> simd_float4x4 {
        simd_float4x4(diagonal: SIMD4(s, 1))
    }

    public static func rotation(axis: SIMD3<Float>, angle: Float) -> simd_float4x4 {
        simd_float4x4(simd_quatf(angle: angle, axis: simd_normalize(axis)))
    }

    /// Yaw (y), then pitch (x), then roll (z).
    public static func rotationEuler(_ r: SIMD3<Float>) -> simd_float4x4 {
        let yaw = rotation(axis: SIMD3(0, 1, 0), angle: r.y)
        let pitch = rotation(axis: SIMD3(1, 0, 0), angle: r.x)
        let roll = rotation(axis: SIMD3(0, 0, 1), angle: r.z)
        return yaw * pitch * roll
    }

    public static func lookAt(eye: SIMD3<Float>, target: SIMD3<Float>, up: SIMD3<Float>) -> simd_float4x4 {
        let f = simd_normalize(target - eye)
        let s = simd_normalize(simd_cross(f, up))
        let u = simd_cross(s, f)
        return simd_float4x4(columns: (
            SIMD4(s.x, u.x, -f.x, 0),
            SIMD4(s.y, u.y, -f.y, 0),
            SIMD4(s.z, u.z, -f.z, 0),
            SIMD4(-simd_dot(s, eye), -simd_dot(u, eye), simd_dot(f, eye), 1)))
    }

    /// Right-handed perspective with Metal's 0…1 clip depth.
    public static func perspective(fovY: Float, aspect: Float, near: Float, far: Float) -> simd_float4x4 {
        let y = 1 / tanf(fovY / 2)
        let x = y / aspect
        let z = far / (near - far)
        return simd_float4x4(columns: (
            SIMD4(x, 0, 0, 0),
            SIMD4(0, y, 0, 0),
            SIMD4(0, 0, z, -1),
            SIMD4(0, 0, z * near, 0)))
    }
}

public extension StageCamera {
    var eye: SIMD3<Float> { SIMD3<Float>(0, 0, StageCamera.distance(fov: fov)) + offset + sway }

    /// The view-projection the renderer uses for a canvas of this aspect.
    func viewProjection(aspect: Float) -> simd_float4x4 {
        let eye = self.eye
        var up = SIMD3<Float>(sinf(roll), cosf(roll), 0)
        if abs(simd_dot(simd_normalize(target - eye), up)) > 0.98 { up = SIMD3(0, 0, -1) }
        let view = Matrix.lookAt(eye: eye, target: target, up: up)
        let proj = Matrix.perspective(fovY: fov * .pi / 180, aspect: aspect, near: 0.02, far: 60)
        return proj * view
    }

    /// Whether anything within `radius` of `center` can reach a canvas of this aspect.
    /// Conservative: scenes use it to drop cards only once they are fully out of view.
    func sees(_ center: SIMD3<Float>, radius: Float, aspect: Float) -> Bool {
        let c = viewProjection(aspect: aspect) * SIMD4<Float>(center, 1)
        if c.w < 0.02 { return c.w + radius > 0.02 }
        let r = radius / (c.w * tanf(fov * .pi / 360))
        return abs(c.x / c.w) <= 1 + r / aspect && abs(c.y / c.w) <= 1 + r
    }
}
