import AVFoundation
import CoreGraphics
import CoreVideo
import Foundation
import ImageIO
import Metal
import UniformTypeIdentifiers

// MARK: - Pixel buffers shared with Metal

/// Hands out BGRA pixel buffers that Metal can render into directly, so video
/// export never copies frames through the CPU.
public final class PixelBufferTarget {
    public let width: Int
    public let height: Int
    private var pool: CVPixelBufferPool?
    private var cache: CVMetalTextureCache?

    public init(width: Int, height: Int) {
        self.width = width
        self.height = height
        let attrs: [CFString: Any] = [
            kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey: width,
            kCVPixelBufferHeightKey: height,
            kCVPixelBufferMetalCompatibilityKey: true,
            kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary,
        ]
        CVPixelBufferPoolCreate(kCFAllocatorDefault, [kCVPixelBufferPoolMinimumBufferCountKey: 3] as CFDictionary, attrs as CFDictionary, &pool)
        CVMetalTextureCacheCreate(kCFAllocatorDefault, nil, GPU.shared.device, nil, &cache)
    }

    /// A fresh pixel buffer plus a Metal texture view of it. Keep the
    /// `CVMetalTexture` alive until the GPU has finished writing.
    public func next() throws -> (CVPixelBuffer, MTLTexture, CVMetalTexture) {
        guard let pool, let cache else { throw RenderError.io("Pixel buffer pool unavailable.") }
        var pb: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pb)
        guard let buffer = pb else { throw RenderError.io("Could not allocate a video frame.") }
        CVBufferSetAttachment(buffer, kCVImageBufferColorPrimariesKey, kCVImageBufferColorPrimaries_ITU_R_709_2, .shouldPropagate)
        CVBufferSetAttachment(buffer, kCVImageBufferTransferFunctionKey, kCVImageBufferTransferFunction_ITU_R_709_2, .shouldPropagate)
        CVBufferSetAttachment(buffer, kCVImageBufferYCbCrMatrixKey, kCVImageBufferYCbCrMatrix_ITU_R_709_2, .shouldPropagate)
        var cvTex: CVMetalTexture?
        CVMetalTextureCacheCreateTextureFromImage(kCFAllocatorDefault, cache, buffer, nil, .bgra8Unorm, width, height, 0, &cvTex)
        guard let cvTex, let texture = CVMetalTextureGetTexture(cvTex) else {
            throw RenderError.io("Could not map a video frame for Metal.")
        }
        return (buffer, texture, cvTex)
    }
}

// MARK: - Still images

public enum ImageOutput {
    /// Reads a BGRA8 texture (any storage mode) into a CGImage.
    public static func cgImage(from texture: MTLTexture, premultipliedAlpha: Bool = true) -> CGImage? {
        let gpu = GPU.shared
        var readable = texture
        if texture.storageMode == .private {
            let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: texture.pixelFormat, width: texture.width, height: texture.height, mipmapped: false)
            d.storageMode = .shared
            d.usage = [.shaderRead]
            guard let shared = gpu.device.makeTexture(descriptor: d),
                  let cb = gpu.queue.makeCommandBuffer(),
                  let blit = cb.makeBlitCommandEncoder() else { return nil }
            blit.copy(from: texture, to: shared)
            blit.endEncoding()
            cb.commit()
            cb.waitUntilCompleted()
            readable = shared
        }
        let w = readable.width, h = readable.height
        let rowBytes = w * 4
        var data = [UInt8](repeating: 0, count: rowBytes * h)
        readable.getBytes(&data, bytesPerRow: rowBytes, from: MTLRegionMake2D(0, 0, w, h), mipmapLevel: 0)
        return cgImage(bgra: data, width: w, height: h, premultipliedAlpha: premultipliedAlpha)
    }

    public static func cgImage(bgra data: [UInt8], width: Int, height: Int, premultipliedAlpha: Bool = true) -> CGImage? {
        let cs = CGColorSpace(name: CGColorSpace.sRGB)!
        let info = CGBitmapInfo(rawValue: CGBitmapInfo.byteOrder32Little.rawValue |
            (premultipliedAlpha ? CGImageAlphaInfo.premultipliedFirst.rawValue : CGImageAlphaInfo.noneSkipFirst.rawValue))
        guard let provider = CGDataProvider(data: Data(data) as CFData) else { return nil }
        return CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
                       space: cs, bitmapInfo: info, provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }

    public static func cgImage(pixelBuffer pb: CVPixelBuffer, keepAlpha: Bool) -> CGImage? {
        CVPixelBufferLockBaseAddress(pb, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
        let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb)
        let rb = CVPixelBufferGetBytesPerRow(pb)
        guard let base = CVPixelBufferGetBaseAddress(pb) else { return nil }
        var data = [UInt8](repeating: 0, count: w * h * 4)
        for y in 0..<h {
            memcpy(&data[y * w * 4], base.advanced(by: y * rb), w * 4)
        }
        return cgImage(bgra: data, width: w, height: h, premultipliedAlpha: keepAlpha)
    }

    public static func writePNG(_ image: CGImage, to url: URL) throws {
        guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
            throw RenderError.io("Could not create \(url.lastPathComponent).")
        }
        CGImageDestinationAddImage(dest, image, nil)
        if !CGImageDestinationFinalize(dest) { throw RenderError.io("Could not write \(url.lastPathComponent).") }
    }

    public static func writeJPEG(_ image: CGImage, to url: URL, quality: Double = 0.92) throws {
        guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
            throw RenderError.io("Could not create \(url.lastPathComponent).")
        }
        CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        if !CGImageDestinationFinalize(dest) { throw RenderError.io("Could not write \(url.lastPathComponent).") }
    }
}

// MARK: - Video

public enum VideoCodec: String, Codable, CaseIterable, Identifiable, Sendable {
    case h264
    case hevc
    case prores422
    case prores4444

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .h264: return "H.264"
        case .hevc: return "HEVC"
        case .prores422: return "ProRes 422 HQ"
        case .prores4444: return "ProRes 4444"
        }
    }

    public var detail: String {
        switch self {
        case .h264: return "Plays everywhere"
        case .hevc: return "Smaller files, same quality"
        case .prores422: return "For editing"
        case .prores4444: return "Keeps transparency"
        }
    }

    public var supportsAlpha: Bool { self == .prores4444 }
    public var fileExtension: String { self == .h264 || self == .hevc ? "mp4" : "mov" }
    public var fileType: AVFileType { self == .h264 || self == .hevc ? .mp4 : .mov }

    var avCodec: AVVideoCodecType {
        switch self {
        case .h264: return .h264
        case .hevc: return .hevc
        case .prores422: return .proRes422HQ
        case .prores4444: return .proRes4444
        }
    }
}

// MARK: - Audio

/// Interleaved stereo float samples at 48 kHz, −1…1.
public struct AudioTrack: Sendable {
    public static let sampleRate = 48_000
    public var samples: [Float]

    public init(samples: [Float]) { self.samples = samples }

    public var frames: Int { samples.count / 2 }
    public var duration: Double { Double(frames) / Double(Self.sampleRate) }

    /// The track repeated end to end to fill `n` frames. A loop mix wraps at its
    /// own end, so the repeats join without a seam.
    public func repeated(toFrames n: Int) -> AudioTrack {
        guard frames > 0, n > 0 else { return AudioTrack(samples: []) }
        var out = [Float](repeating: 0, count: n * 2)
        out.withUnsafeMutableBufferPointer { dst in
            samples.withUnsafeBufferPointer { src in
                var written = 0
                while written < n {
                    let count = min(frames, n - written)
                    dst.baseAddress!.advanced(by: written * 2).update(from: src.baseAddress!, count: count * 2)
                    written += count
                }
            }
        }
        return AudioTrack(samples: out)
    }
}

/// Wraps AVAssetWriter for frame-exact offline rendering, with an optional
/// sound track written in step with the frames.
public final class VideoWriter {
    public let url: URL
    public let width: Int
    public let height: Int
    public let fps: Int
    public let codec: VideoCodec

    private let writer: AVAssetWriter
    private let input: AVAssetWriterInput
    private let adaptor: AVAssetWriterInputPixelBufferAdaptor
    private var frameCount: Int64 = 0
    private let audio: AudioTrack?
    private var audioInput: AVAssetWriterInput?
    private var audioFormat: CMAudioFormatDescription?
    private var audioFramesWritten = 0
    private var audioFinished = false

    public init(url: URL, width: Int, height: Int, fps: Int, codec: VideoCodec, quality: Float = 0.9, audio: AudioTrack? = nil) throws {
        self.url = url
        self.width = width
        self.height = height
        self.fps = fps
        self.codec = codec
        try? FileManager.default.removeItem(at: url)
        writer = try AVAssetWriter(outputURL: url, fileType: codec.fileType)

        var settings: [String: Any] = [
            AVVideoCodecKey: codec.avCodec,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoColorPropertiesKey: [
                AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
            ],
        ]
        if codec == .h264 || codec == .hevc {
            // Generous bitrates: gradients and grain need them.
            let pixels = Double(width * height)
            let bitsPerPixel: Double = codec == .h264 ? 0.22 : 0.14
            let bitrate = Int(pixels * Double(fps) * bitsPerPixel * Double(0.6 + quality * 0.8))
            var compression: [String: Any] = [
                AVVideoAverageBitRateKey: bitrate,
                AVVideoExpectedSourceFrameRateKey: fps,
                AVVideoMaxKeyFrameIntervalKey: fps * 2,
                AVVideoAllowFrameReorderingKey: true,
            ]
            if codec == .h264 {
                compression[AVVideoProfileLevelKey] = AVVideoProfileLevelH264HighAutoLevel
                compression[AVVideoH264EntropyModeKey] = AVVideoH264EntropyModeCABAC
            }
            settings[AVVideoCompressionPropertiesKey] = compression
        }
        input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        input.expectsMediaDataInRealTime = false
        adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height,
        ])
        guard writer.canAdd(input) else { throw RenderError.io("This Mac cannot write \(codec.title) video.") }
        writer.add(input)

        self.audio = audio
        if let audio, audio.frames > 0 {
            var layout = AudioChannelLayout()
            layout.mChannelLayoutTag = kAudioChannelLayoutTag_Stereo
            let layoutData = Data(bytes: &layout, count: MemoryLayout<AudioChannelLayout>.size)
            // AAC beside H.264 and HEVC; uncompressed 24-bit beside ProRes, for editing.
            let settings: [String: Any] = codec.fileType == .mp4
                ? [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: AudioTrack.sampleRate, AVNumberOfChannelsKey: 2,
                   AVEncoderBitRateKey: 256_000, AVChannelLayoutKey: layoutData]
                : [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: AudioTrack.sampleRate, AVNumberOfChannelsKey: 2,
                   AVLinearPCMBitDepthKey: 24, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false,
                   AVLinearPCMIsNonInterleaved: false, AVChannelLayoutKey: layoutData]
            let audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: settings)
            audioInput.expectsMediaDataInRealTime = false
            guard writer.canAdd(audioInput) else { throw RenderError.io("This Mac cannot add sound to \(codec.title) video.") }
            writer.add(audioInput)
            self.audioInput = audioInput
            var asbd = AudioStreamBasicDescription(
                mSampleRate: Double(AudioTrack.sampleRate), mFormatID: kAudioFormatLinearPCM,
                mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked,
                mBytesPerPacket: 8, mFramesPerPacket: 1, mBytesPerFrame: 8, mChannelsPerFrame: 2, mBitsPerChannel: 32, mReserved: 0)
            let status = CMAudioFormatDescriptionCreate(
                allocator: kCFAllocatorDefault, asbd: &asbd, layoutSize: MemoryLayout<AudioChannelLayout>.size, layout: &layout,
                magicCookieSize: 0, magicCookie: nil, extensions: nil, formatDescriptionOut: &audioFormat)
            guard status == noErr else { throw RenderError.io("Could not prepare the sound track.") }
        }

        guard writer.startWriting() else {
            throw RenderError.io(writer.error?.localizedDescription ?? "Could not start writing video.")
        }
        writer.startSession(atSourceTime: .zero)
    }

    /// Appends one finished frame. Blocks briefly when the encoder is busy.
    public func append(_ buffer: CVPixelBuffer) throws {
        var spins = 0
        let heard = Int(frameCount * Int64(AudioTrack.sampleRate) / Int64(fps))
        while !input.isReadyForMoreMediaData {
            // The writer may be waiting for sound to interleave; give it some.
            if try pumpAudio(upTo: heard + 2 * AudioTrack.sampleRate) { continue }
            Thread.sleep(forTimeInterval: 0.002)
            spins += 1
            if spins == 2_000, ProcessInfo.processInfo.environment["STUDIO_DEBUG_WRITER"] != nil {
                FileHandle.standardError.write(Data("writer stall: frame \(frameCount) status \(writer.status.rawValue) video ready \(input.isReadyForMoreMediaData) audio ready \(audioInput?.isReadyForMoreMediaData ?? false) audio written \(audioFramesWritten)/\(audio?.frames ?? 0) error \(String(describing: writer.error))\n".utf8))
            }
            if spins > 15_000 { throw RenderError.io("The video encoder stopped responding.") }
            if writer.status == .failed { throw RenderError.io(writer.error?.localizedDescription ?? "Video encoding failed.") }
        }
        let time = CMTime(value: frameCount, timescale: CMTimeScale(fps))
        if !adaptor.append(buffer, withPresentationTime: time) {
            throw RenderError.io(writer.error?.localizedDescription ?? "Could not append a video frame.")
        }
        frameCount += 1
        // Keep the sound a little ahead of the pictures so the writer can interleave them.
        _ = try pumpAudio(upTo: Int(frameCount * Int64(AudioTrack.sampleRate) / Int64(fps)) + AudioTrack.sampleRate / 2)
    }

    /// Feeds sound up to `limit` frames for as long as the writer takes it; never
    /// waits. Returns whether anything was written.
    private func pumpAudio(upTo limit: Int) throws -> Bool {
        guard let audioInput, let audio, let audioFormat else { return false }
        let end = min(limit, audio.frames)
        var wrote = false
        while audioFramesWritten < end && audioInput.isReadyForMoreMediaData {
            let count = min(end - audioFramesWritten, 4_800)
            let sample = try Self.sampleBuffer(audio, from: audioFramesWritten, count: count, format: audioFormat)
            if !audioInput.append(sample) {
                throw RenderError.io(writer.error?.localizedDescription ?? "Could not append sound.")
            }
            audioFramesWritten += count
            wrote = true
        }
        // The writer holds the pictures back until it has sound to interleave with
        // them, so say as soon as the sound is complete.
        if audioFramesWritten >= audio.frames && !audioFinished {
            audioInput.markAsFinished()
            audioFinished = true
        }
        return wrote
    }

    private static func sampleBuffer(_ audio: AudioTrack, from start: Int, count: Int, format: CMAudioFormatDescription) throws -> CMSampleBuffer {
        let bytes = count * 8
        var block: CMBlockBuffer?
        var status = CMBlockBufferCreateWithMemoryBlock(
            allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: bytes, blockAllocator: kCFAllocatorDefault,
            customBlockSource: nil, offsetToData: 0, dataLength: bytes, flags: 0, blockBufferOut: &block)
        guard status == noErr, let block else { throw RenderError.io("Could not allocate sound.") }
        status = audio.samples.withUnsafeBytes { raw in
            CMBlockBufferReplaceDataBytes(with: raw.baseAddress!.advanced(by: start * 8), blockBuffer: block,
                                          offsetIntoDestination: 0, dataLength: bytes)
        }
        guard status == noErr else { throw RenderError.io("Could not copy sound.") }
        var sample: CMSampleBuffer?
        status = CMAudioSampleBufferCreateReadyWithPacketDescriptions(
            allocator: kCFAllocatorDefault, dataBuffer: block, formatDescription: format, sampleCount: count,
            presentationTimeStamp: CMTime(value: CMTimeValue(start), timescale: CMTimeScale(AudioTrack.sampleRate)),
            packetDescriptions: nil, sampleBufferOut: &sample)
        guard status == noErr, let sample else { throw RenderError.io("Could not package sound.") }
        return sample
    }

    public func finish() async throws {
        input.markAsFinished()
        // Whatever sound is left belongs to the last frames.
        if let audio {
            var spins = 0
            while audioFramesWritten < audio.frames {
                if try pumpAudio(upTo: audio.frames) { continue }
                try await Task.sleep(nanoseconds: 2_000_000)
                spins += 1
                if spins > 15_000 { throw RenderError.io("The sound encoder stopped responding.") }
                if writer.status == .failed { throw RenderError.io(writer.error?.localizedDescription ?? "Sound encoding failed.") }
            }
        }
        if !audioFinished { audioInput?.markAsFinished() }
        await writer.finishWriting()
        if writer.status != .completed {
            throw RenderError.io(writer.error?.localizedDescription ?? "Video did not finish writing.")
        }
    }

    public func cancel() {
        writer.cancelWriting()
        try? FileManager.default.removeItem(at: url)
    }
}
