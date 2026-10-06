import Foundation
import Metal
import MetalKit

/// One Metal device, one queue, and caches for compiled libraries and pipelines.
///
/// Shaders ship as source strings and compile at runtime, so the apps build with
/// the Command Line Tools alone. Compilation is cached by source text.
public final class GPU: @unchecked Sendable {
    public static let shared = GPU()

    public let device: MTLDevice
    public let queue: MTLCommandQueue
    public let textureLoader: MTKTextureLoader

    private let lock = NSLock()
    private var libraries: [String: MTLLibrary] = [:]
    private var renderPipelines: [String: MTLRenderPipelineState] = [:]
    private var computePipelines: [String: MTLComputePipelineState] = [:]
    private var samplers: [String: MTLSamplerState] = [:]
    private var compiling: [String: NSLock] = [:]

    private init() {
        guard let device = MTLCreateSystemDefaultDevice() else {
            fatalError("This Mac has no Metal device.")
        }
        self.device = device
        self.queue = device.makeCommandQueue(maxCommandBufferCount: 64)!
        self.queue.label = "pitch.dog studio"
        self.textureLoader = MTKTextureLoader(device: device)
    }

    // MARK: Libraries

    /// Compiles (or returns the cached) library for a source string.
    public func library(named name: String, source: String) throws -> MTLLibrary {
        let key = name + "#" + String(source.hashValue)
        lock.lock()
        if let cached = libraries[key] { lock.unlock(); return cached }
        // One compile per library: a second caller (the warm-up, the stage, the
        // tiles at launch) waits for the first rather than compiling it again,
        // so every caller shares one library and its cached pipelines.
        let gate = compiling[key] ?? NSLock()
        compiling[key] = gate
        lock.unlock()
        gate.lock()
        defer { gate.unlock() }
        lock.lock()
        if let cached = libraries[key] { lock.unlock(); return cached }
        lock.unlock()

        let options = MTLCompileOptions()
        if #available(macOS 15.0, *) {
            options.mathMode = .fast
        } else {
            options.fastMathEnabled = true
        }
        options.languageVersion = .version3_1
        let library: MTLLibrary
        do {
            library = try device.makeLibrary(source: source, options: options)
        } catch {
            throw RenderError.shaderCompile(name: name, message: String(describing: error))
        }
        lock.lock()
        libraries[key] = library
        lock.unlock()
        return library
    }

    // MARK: Pipelines

    public enum Blend: String, Sendable {
        case opaque
        /// Premultiplied "over": src + dst * (1 - srcA)
        case over
        /// Additive light: src + dst
        case add
        /// Multiply colour into destination, used for shadows: dst * (1 - srcA)
        case darken
    }

    public struct PipelineKey: Hashable {
        public var library: String
        public var vertex: String
        public var fragment: String
        public var color: MTLPixelFormat
        public var blend: Blend
        public var depth: MTLPixelFormat
        public var samples: Int
        public var extraColor: [MTLPixelFormat]

        public init(library: String, vertex: String, fragment: String, color: MTLPixelFormat,
                    blend: Blend = .opaque, depth: MTLPixelFormat = .invalid, samples: Int = 1,
                    extraColor: [MTLPixelFormat] = []) {
            self.library = library
            self.vertex = vertex
            self.fragment = fragment
            self.color = color
            self.blend = blend
            self.depth = depth
            self.samples = samples
            self.extraColor = extraColor
        }

        var cacheKey: String {
            "\(library)|\(vertex)|\(fragment)|\(color.rawValue)|\(blend.rawValue)|\(depth.rawValue)|\(samples)|\(extraColor.map { String($0.rawValue) }.joined(separator: ","))"
        }
    }

    public func renderPipeline(_ key: PipelineKey, library: MTLLibrary) throws -> MTLRenderPipelineState {
        let cacheKey = key.cacheKey + "#" + String(ObjectIdentifier(library).hashValue)
        lock.lock()
        if let cached = renderPipelines[cacheKey] { lock.unlock(); return cached }
        lock.unlock()

        guard let vfn = library.makeFunction(name: key.vertex) else {
            throw RenderError.missingFunction(key.vertex)
        }
        guard let ffn = library.makeFunction(name: key.fragment) else {
            throw RenderError.missingFunction(key.fragment)
        }
        let d = MTLRenderPipelineDescriptor()
        d.label = key.fragment
        d.vertexFunction = vfn
        d.fragmentFunction = ffn
        d.rasterSampleCount = key.samples
        d.colorAttachments[0].pixelFormat = key.color
        GPU.configure(d.colorAttachments[0], blend: key.blend)
        for (i, format) in key.extraColor.enumerated() {
            d.colorAttachments[i + 1].pixelFormat = format
            GPU.configure(d.colorAttachments[i + 1], blend: .opaque)
        }
        if key.depth != .invalid {
            d.depthAttachmentPixelFormat = key.depth
        }
        let state = try device.makeRenderPipelineState(descriptor: d)
        lock.lock()
        renderPipelines[cacheKey] = state
        lock.unlock()
        return state
    }

    static func configure(_ a: MTLRenderPipelineColorAttachmentDescriptor, blend: Blend) {
        switch blend {
        case .opaque:
            a.isBlendingEnabled = false
        case .over:
            a.isBlendingEnabled = true
            a.rgbBlendOperation = .add
            a.alphaBlendOperation = .add
            a.sourceRGBBlendFactor = .one
            a.sourceAlphaBlendFactor = .one
            a.destinationRGBBlendFactor = .oneMinusSourceAlpha
            a.destinationAlphaBlendFactor = .oneMinusSourceAlpha
        case .add:
            a.isBlendingEnabled = true
            a.rgbBlendOperation = .add
            a.alphaBlendOperation = .add
            a.sourceRGBBlendFactor = .one
            a.sourceAlphaBlendFactor = .one
            a.destinationRGBBlendFactor = .one
            a.destinationAlphaBlendFactor = .one
        case .darken:
            a.isBlendingEnabled = true
            a.rgbBlendOperation = .add
            a.alphaBlendOperation = .add
            a.sourceRGBBlendFactor = .zero
            a.sourceAlphaBlendFactor = .zero
            a.destinationRGBBlendFactor = .oneMinusSourceAlpha
            a.destinationAlphaBlendFactor = .one
        }
    }

    public func computePipeline(library: MTLLibrary, function: String) throws -> MTLComputePipelineState {
        let cacheKey = function + "#" + String(ObjectIdentifier(library).hashValue)
        lock.lock()
        if let cached = computePipelines[cacheKey] { lock.unlock(); return cached }
        lock.unlock()
        guard let fn = library.makeFunction(name: function) else { throw RenderError.missingFunction(function) }
        let state = try device.makeComputePipelineState(function: fn)
        lock.lock()
        computePipelines[cacheKey] = state
        lock.unlock()
        return state
    }

    // MARK: Samplers

    public enum SamplerKind: String { case linearClamp, linearRepeat, nearestClamp, trilinearClamp, anisotropicClamp }

    public func sampler(_ kind: SamplerKind) -> MTLSamplerState {
        lock.lock()
        defer { lock.unlock() }
        if let s = samplers[kind.rawValue] { return s }
        let d = MTLSamplerDescriptor()
        switch kind {
        case .linearClamp, .linearRepeat, .trilinearClamp, .anisotropicClamp:
            d.minFilter = .linear
            d.magFilter = .linear
        case .nearestClamp:
            d.minFilter = .nearest
            d.magFilter = .nearest
        }
        switch kind {
        case .trilinearClamp, .anisotropicClamp: d.mipFilter = .linear
        default: d.mipFilter = .notMipmapped
        }
        if kind == .anisotropicClamp { d.maxAnisotropy = 8 }
        let mode: MTLSamplerAddressMode = kind == .linearRepeat ? .repeat : .clampToEdge
        d.sAddressMode = mode
        d.tAddressMode = mode
        let s = device.makeSamplerState(descriptor: d)!
        samplers[kind.rawValue] = s
        return s
    }

    // MARK: Textures

    public func makeTexture(width: Int, height: Int, format: MTLPixelFormat,
                            usage: MTLTextureUsage = [.renderTarget, .shaderRead],
                            mipmapped: Bool = false, samples: Int = 1,
                            storage: MTLStorageMode = .private, label: String? = nil) -> MTLTexture {
        let d: MTLTextureDescriptor
        if samples > 1 {
            d = MTLTextureDescriptor()
            d.textureType = .type2DMultisample
            d.pixelFormat = format
            d.width = max(1, width)
            d.height = max(1, height)
            d.sampleCount = samples
        } else {
            d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: format, width: max(1, width), height: max(1, height), mipmapped: mipmapped)
        }
        d.usage = usage
        d.storageMode = storage
        let t = device.makeTexture(descriptor: d)!
        t.label = label
        return t
    }
}

public enum RenderError: Error, CustomStringConvertible {
    case shaderCompile(name: String, message: String)
    case missingFunction(String)
    case io(String)
    case cancelled

    public var description: String {
        switch self {
        case let .shaderCompile(name, message): return "Shader \(name) failed to compile:\n\(message)"
        case let .missingFunction(name): return "Shader function \(name) is missing."
        case let .io(message): return message
        case .cancelled: return "Cancelled."
        }
    }
}
