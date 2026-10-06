import AVFoundation
import CoreGraphics
import Foundation
import ImageIO
import Metal
import MetalKit
import PDFKit
import RenderCore
import UniformTypeIdentifiers

/// What a media item is.
public enum MediaKind: String, Codable, Sendable {
    case image
    case pdfPage
    case video
}

/// Decoded media ready for the GPU.
public final class MediaTexture: @unchecked Sendable {
    public let texture: MTLTexture
    public let aspect: Float
    public let pixelSize: CGSize
    public init(texture: MTLTexture, aspect: Float, pixelSize: CGSize) {
        self.texture = texture
        self.aspect = aspect
        self.pixelSize = pixelSize
    }
}

public enum MediaLoader {
    /// Longest side of textures uploaded to the GPU. Cards rarely exceed this on screen.
    public static var maxTextureSide = 2560

    /// Longest side for each of `count` items, so a whole set stays within a
    /// memory budget. Every frame can show every card, and on an 8 GB Mac a
    /// 48-slide deck at full size (about 940 MB with mipmaps) pushed the GPU
    /// into paging. Small sets keep the full size; large ones scale down.
    public static func textureSide(forItems count: Int, budgetMB: Double = 360) -> Int {
        let perItem = budgetMB * 1_048_576 / Double(max(count, 1))
        // RGBA8 with a full mip chain is about 5.33 bytes a pixel; assume 16:9.
        let side = (perItem / 5.33 * (16.0 / 9.0)).squareRoot()
        // Never below 512 px: a card that small on screen still looks sharp, and a
        // 300-page PDF stays within the budget instead of paging the GPU.
        return Int(min(Double(maxTextureSide), max(512, side)))
    }

    public static let imageTypes: [UTType] = [.png, .jpeg, .heic, .tiff, .gif, .webP, .bmp, .image]
    public static let movieTypes: [UTType] = [.movie, .mpeg4Movie, .quickTimeMovie]

    /// Expands a dropped file into media entries: PDFs become one entry per page.
    /// Each carries its aspect where the file says so cheaply (page boxes, image
    /// headers), so cards have their real shape before anything is decoded.
    public static func inspect(_ url: URL) -> [(kind: MediaKind, page: Int, aspect: Float?)] {
        let type = UTType(filenameExtension: url.pathExtension.lowercased())
        if type?.conforms(to: .pdf) == true, let doc = CGPDFDocument(url as CFURL) {
            return (0..<doc.numberOfPages).map { i in (.pdfPage, i, doc.page(at: i + 1).flatMap(aspect(of:))) }
        }
        // Sound alone is not something to show.
        if let type, type.conforms(to: .movie) || (type.conforms(to: .audiovisualContent) && !type.conforms(to: .audio)) {
            return [(.video, 0, nil)]
        }
        if let type, type.conforms(to: .image) { return [(.image, 0, imageAspect(url))] }
        return []
    }

    /// A PDF page's shape as it displays, rotation included.
    static func aspect(of page: CGPDFPage) -> Float? {
        let box = page.getBoxRect(.cropBox)
        let rotated = ((page.rotationAngle % 360) + 360) % 180 != 0
        let w = rotated ? box.height : box.width, h = rotated ? box.width : box.height
        return w > 0 && h > 0 ? Float(w / h) : nil
    }

    /// An image's shape from its header, orientation included.
    static func imageAspect(_ url: URL) -> Float? {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
              let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any],
              let w = (props[kCGImagePropertyPixelWidth] as? NSNumber)?.floatValue,
              let h = (props[kCGImagePropertyPixelHeight] as? NSNumber)?.floatValue, w > 0, h > 0 else { return nil }
        // EXIF orientations 5 to 8 turn the image a quarter.
        let turned = ((props[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1) >= 5
        return turned ? h / w : w / h
    }

    public static func cgImage(url: URL, kind: MediaKind, page: Int = 0, maxSide: Int = maxTextureSide, at time: Double = 0) -> CGImage? {
        switch kind {
        case .image:
            guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
            let opts: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: maxSide,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceShouldCacheImmediately: true,
            ]
            return CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary)
        case .pdfPage:
            guard let doc = CGPDFDocument(url as CFURL), let pdfPage = doc.page(at: page + 1) else { return nil }
            return render(pdfPage: pdfPage, maxSide: maxSide)
        case .video:
            let asset = AVURLAsset(url: url)
            let gen = AVAssetImageGenerator(asset: asset)
            gen.appliesPreferredTrackTransform = true
            gen.maximumSize = CGSize(width: maxSide, height: maxSide)
            gen.requestedTimeToleranceBefore = .zero
            gen.requestedTimeToleranceAfter = .zero
            return try? gen.copyCGImage(at: CMTime(seconds: time, preferredTimescale: 600), actualTime: nil)
        }
    }

    public static func render(pdfPage: CGPDFPage, maxSide: Int) -> CGImage? {
        let box = pdfPage.getBoxRect(.cropBox)
        let rotation = ((pdfPage.rotationAngle % 360) + 360) % 360
        let rotated = rotation % 180 != 0
        let w = rotated ? box.height : box.width
        let h = rotated ? box.width : box.height
        guard w > 0, h > 0 else { return nil }
        // Scale explicitly: CGPDFPage's drawing transform never scales up.
        let scale = CGFloat(maxSide) / max(w, h)
        let pw = max(1, Int((w * scale).rounded())), ph = max(1, Int((h * scale).rounded()))
        guard let ctx = CGContext(data: nil, width: pw, height: ph, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 0, width: pw, height: ph))
        ctx.interpolationQuality = .high
        ctx.setShouldAntialias(true)
        switch rotation {
        case 90:
            ctx.translateBy(x: 0, y: CGFloat(ph))
            ctx.rotate(by: -.pi / 2)
        case 180:
            ctx.translateBy(x: CGFloat(pw), y: CGFloat(ph))
            ctx.rotate(by: .pi)
        case 270:
            ctx.translateBy(x: CGFloat(pw), y: 0)
            ctx.rotate(by: .pi / 2)
        default:
            break
        }
        ctx.scaleBy(x: scale, y: scale)
        ctx.translateBy(x: -box.minX, y: -box.minY)
        ctx.clip(to: box)
        ctx.drawPDFPage(pdfPage)
        return ctx.makeImage()
    }

    /// Redraws any decoded image (16-bit, CMYK, grey, P3, BGRA…) into sRGB RGBA8,
    /// premultiplied, so the GPU always sees one known layout and colour space.
    public static func normalized(_ image: CGImage) -> (data: [UInt8], width: Int, height: Int)? {
        let w = image.width, h = image.height
        guard w > 0, h > 0 else { return nil }
        var data = [UInt8](repeating: 0, count: w * h * 4)
        let ok: Bool = data.withUnsafeMutableBytes { buf in
            guard let ctx = CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)
            else { return false }
            ctx.interpolationQuality = .high
            ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        return ok ? (data, w, h) : nil
    }

    /// Uploads an image with a full mip chain (needed for smooth minification and defocus).
    public static func texture(from image: CGImage) throws -> MediaTexture {
        guard let n = normalized(image) else { throw RenderError.io("Could not decode the image.") }
        let gpu = GPU.shared
        let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm_srgb, width: n.width, height: n.height, mipmapped: true)
        d.usage = [.shaderRead]
        d.storageMode = .shared
        guard let tex = gpu.device.makeTexture(descriptor: d) else { throw RenderError.io("Out of GPU memory.") }
        n.data.withUnsafeBytes { buf in
            tex.replace(region: MTLRegionMake2D(0, 0, n.width, n.height), mipmapLevel: 0,
                        withBytes: buf.baseAddress!, bytesPerRow: n.width * 4)
        }
        if tex.mipmapLevelCount > 1, let cb = (uploads ?? gpu.queue).makeCommandBuffer(), let blit = cb.makeBlitCommandEncoder() {
            blit.generateMipmaps(for: tex)
            blit.endEncoding()
            cb.commit()
            cb.waitUntilCompleted()
        }
        return MediaTexture(texture: tex, aspect: Float(n.width) / Float(max(n.height, 1)),
                            pixelSize: CGSize(width: n.width, height: n.height))
    }

    /// The texture and a thumbnail from one decode, so a PDF page is rendered once.
    public static func loadWithThumbnail(url: URL, kind: MediaKind, page: Int = 0, maxSide: Int = maxTextureSide,
                                         thumbnailSide: Int) -> (MediaTexture?, CGImage?) {
        guard let img = cgImage(url: url, kind: kind, page: page, maxSide: maxSide) else { return (nil, nil) }
        return (try? texture(from: img), scaled(img, maxSide: thumbnailSide))
    }

    /// `image` no larger than `maxSide` on its longer side.
    public static func scaled(_ image: CGImage, maxSide: Int) -> CGImage? {
        let w = image.width, h = image.height
        let s = Double(maxSide) / Double(max(w, h, 1))
        if s >= 1 { return image }
        let tw = max(1, Int((Double(w) * s).rounded())), th = max(1, Int((Double(h) * s).rounded()))
        guard let ctx = CGContext(data: nil, width: tw, height: th, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.interpolationQuality = .high
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: tw, height: th))
        return ctx.makeImage()
    }

    /// Mipmaps are made on a queue of their own, so a load never waits behind
    /// the stage's or an export's frames.
    nonisolated(unsafe) static let uploads: MTLCommandQueue? = GPU.shared.device.makeCommandQueue()

    public static func load(url: URL, kind: MediaKind, page: Int = 0, maxSide: Int = maxTextureSide) throws -> MediaTexture {
        guard let img = cgImage(url: url, kind: kind, page: page, maxSide: maxSide) else {
            throw RenderError.io("Could not read \(url.lastPathComponent).")
        }
        return try texture(from: img)
    }

    /// The neutral card shown while media loads or when a file is missing,
    /// made once: every composition uses it.
    public static let blank = placeholder()

    /// A tiny neutral texture used while media loads or when a file is missing.
    public static func placeholder(aspect: Float = 16.0 / 9.0) -> MediaTexture {
        let w = 64, h = max(1, Int(64 / aspect))
        let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.setFillColor(CGColor(red: 0.16, green: 0.16, blue: 0.17, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
        return try! texture(from: ctx.makeImage()!)
    }
}

/// Deterministic sample artwork, so the apps and tests have something
/// beautiful to show before the user brings their own.
public enum SampleArt {
    public static func make(index: Int, width: Int = 1600, height: Int = 900) -> CGImage {
        let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        let palettes = Palettes.all
        let pal = palettes[(index * 7 + 3) % palettes.count]
        let cols = pal.sorted
        let bg = cols[(index % 2 == 0) ? 0 : cols.count - 1]
        let ink = cols[(index % 2 == 0) ? cols.count - 1 : 0]
        let accent = cols[min(2, cols.count - 1)]
        func cg(_ c: RGB, _ a: CGFloat = 1) -> CGColor { CGColor(red: CGFloat(c.r), green: CGFloat(c.g), blue: CGFloat(c.b), alpha: a) }
        let W = CGFloat(width), H = CGFloat(height)
        ctx.setFillColor(cg(bg))
        ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
        switch index % 6 {
        case 0:
            ctx.setFillColor(cg(accent))
            ctx.fillEllipse(in: CGRect(x: W * 0.52, y: H * 0.18, width: H * 0.64, height: H * 0.64))
        case 1:
            for i in 0..<6 {
                ctx.setFillColor(cg(cols[i % cols.count], 0.9))
                ctx.fill(CGRect(x: W * 0.08 + CGFloat(i) * W * 0.14, y: H * 0.2, width: W * 0.1, height: H * (0.2 + 0.1 * CGFloat(i))))
            }
        case 2:
            ctx.setFillColor(cg(accent))
            ctx.fill(CGRect(x: 0, y: 0, width: W * 0.42, height: H))
        case 3:
            ctx.setStrokeColor(cg(accent))
            ctx.setLineWidth(H * 0.012)
            for i in 0..<9 {
                let y = H * (0.15 + 0.08 * CGFloat(i))
                ctx.move(to: CGPoint(x: W * 0.08, y: y))
                ctx.addCurve(to: CGPoint(x: W * 0.92, y: y + H * 0.05), control1: CGPoint(x: W * 0.4, y: y + H * 0.2), control2: CGPoint(x: W * 0.6, y: y - H * 0.2))
            }
            ctx.strokePath()
        case 4:
            ctx.setFillColor(cg(accent, 0.85))
            ctx.fillEllipse(in: CGRect(x: W * 0.1, y: H * 0.1, width: H * 0.5, height: H * 0.5))
            ctx.setFillColor(cg(cols[min(3, cols.count - 1)], 0.85))
            ctx.fillEllipse(in: CGRect(x: W * 0.25, y: H * 0.35, width: H * 0.5, height: H * 0.5))
        default:
            let grad = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: [cg(cols[1]), cg(cols[cols.count - 2])] as CFArray, locations: [0, 1])!
            ctx.drawLinearGradient(grad, start: .zero, end: CGPoint(x: W, y: H), options: [])
        }
        // Title bars — stand-ins for slide typography.
        ctx.setFillColor(cg(ink, 0.92))
        ctx.fill(CGRect(x: W * 0.07, y: H * 0.78, width: W * 0.36, height: H * 0.055))
        ctx.setFillColor(cg(ink, 0.55))
        ctx.fill(CGRect(x: W * 0.07, y: H * 0.70, width: W * 0.24, height: H * 0.025))
        ctx.fill(CGRect(x: W * 0.07, y: H * 0.66, width: W * 0.2, height: H * 0.025))
        ctx.setFillColor(cg(ink, 0.8))
        ctx.fill(CGRect(x: W * 0.07, y: H * 0.08, width: W * 0.05, height: H * 0.02))
        return ctx.makeImage()!
    }
}
