import BackdropKit
import CoreGraphics
import Foundation
import Metal
import RenderCore

extension SampleArt {
    /// One of Galileo's sample works: a still from a Backdrop look with its own
    /// palette, seed and proportions, so a fresh window opens on a set that
    /// looks like real work rather than placeholders.
    struct Painting {
        var style: String
        var palette: String
        var width: Int
        var height: Int
        var seed: UInt32
        var phase: Double
        var tweak: (inout BackdropSettings) -> Void = { _ in }
    }

    static let paintings: [Painting] = [
        Painting(style: "marble", palette: "Lagoon", width: 1200, height: 1500, seed: 11, phase: 0.31) { $0.scale = 0.42; $0.detail = 0.62 },
        Painting(style: "dunes", palette: "Terracotta", width: 1800, height: 1200, seed: 4, phase: 0.18),
        Painting(style: "aurora", palette: "Glacier", width: 1920, height: 1080, seed: 9, phase: 0.42) { $0.accent = 0.6 },
        Painting(style: "softbloom", palette: "Saffron", width: 1200, height: 1500, seed: 21, phase: 0.55) { $0.accent = 0.3 },
        Painting(style: "silk", palette: "Indigo", width: 1400, height: 1400, seed: 5, phase: 0.2) { $0.accent = 0.55 },
        Painting(style: "riso", palette: "Tropic", width: 1200, height: 1500, seed: 13, phase: 0.37),
        Painting(style: "ridgelines", palette: "Paper Moon", width: 1800, height: 1200, seed: 7, phase: 0.61),
        Painting(style: "fluted", palette: "Steel", width: 1400, height: 1400, seed: 3, phase: 0.28),
        Painting(style: "contours", palette: "Moss", width: 1800, height: 1200, seed: 17, phase: 0.46),
        Painting(style: "halftone", palette: "Solar", width: 1200, height: 1500, seed: 8, phase: 0.12),
    ]

    public static func paintingName(index: Int) -> String {
        let names = ["Marble", "Dunes", "Aurora", "Soft Bloom", "Silk", "Riso", "Ridgelines", "Fluted Glass", "Contours", "Halftone"]
        return names[index % names.count]
    }

    /// Renders sample work `index`; nil when the GPU is unavailable.
    public static func painting(index: Int) -> CGImage? {
        let p = paintings[index % paintings.count]
        guard let renderer = try? BackdropRenderer(), let finisher = try? Finisher() else { return nil }
        var settings = BackdropCatalog.style(p.style).defaults
        settings.palette = Palettes.named(p.palette)
        settings.seed = p.seed &+ UInt32(index / paintings.count) &* 101
        settings.vignette = 0
        p.tweak(&settings)
        var finish = FinishSettings()
        finish.vignette = 0
        finish.bloom = 0.08
        finish.grain = 0.1
        let gpu = GPU.shared
        let hdr = gpu.makeTexture(width: p.width, height: p.height, format: .rgba16Float)
        let out = gpu.makeTexture(width: p.width, height: p.height, format: .bgra8Unorm, usage: [.renderTarget, .shaderRead])
        guard let cb = gpu.queue.makeCommandBuffer() else { return nil }
        do {
            try renderer.encode(cb, target: hdr, settings: settings, phase: p.phase)
            try finisher.encode(cb, input: hdr, output: out, settings: finish, frame: FinishFrame(frameIndex: UInt32(index)))
        } catch {
            return nil
        }
        cb.commit()
        cb.waitUntilCompleted()
        return ImageOutput.cgImage(from: out, premultipliedAlpha: false)
    }
}
