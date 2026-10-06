import Foundation
import Metal
import CoreGraphics
import StudioKit

// studio-lab — headless renders for visual review.
//
//   studio-lab backdrops <outdir> [WxH] [phase]

func parseSize(_ s: String) -> (Int, Int) {
    let parts = s.split(separator: "x").compactMap { Int($0) }
    return parts.count == 2 ? (parts[0], parts[1]) : (640, 360)
}

func renderBackdrop(_ renderer: BackdropRenderer, _ finisher: Finisher, settings: BackdropSettings,
                    width: Int, height: Int, phase: Double, frame: UInt32, finish: FinishSettings) throws -> CGImage {
    let gpu = GPU.shared
    let hdr = gpu.makeTexture(width: width, height: height, format: .rgba16Float)
    let out = gpu.makeTexture(width: width, height: height, format: .bgra8Unorm, usage: [.renderTarget, .shaderRead])
    let cb = gpu.queue.makeCommandBuffer()!
    try renderer.encode(cb, target: hdr, settings: settings, phase: phase)
    try finisher.encode(cb, input: hdr, output: out, settings: finish, frame: FinishFrame(frameIndex: frame))
    cb.commit()
    cb.waitUntilCompleted()
    if let e = cb.error { throw RenderError.io("GPU error: \(e)") }
    guard let img = ImageOutput.cgImage(from: out, premultipliedAlpha: false) else { throw RenderError.io("readback failed") }
    return img
}

let args = CommandLine.arguments
guard args.count >= 3 else {
    print("usage: studio-lab backdrops <outdir> [WxH] [phase]")
    exit(2)
}
let command = args[1]
let outDir = URL(fileURLWithPath: args[2])
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

switch command {
case "backdrops":
    let (w, h) = args.count > 3 ? parseSize(args[3]) : (640, 360)
    let phase = args.count > 4 ? Double(args[4]) ?? 0.25 : 0.25
    let renderer = try BackdropRenderer()
    let finisher = try Finisher()
    var finish = FinishSettings()
    finish.vignette = 0
    for style in BackdropCatalog.styles {
        let t0 = Date()
        let img = try renderBackdrop(renderer, finisher, settings: style.defaults, width: w, height: h, phase: phase, frame: 1, finish: finish)
        try ImageOutput.writePNG(img, to: outDir.appendingPathComponent("\(style.family.rawValue)-\(style.id).png"))
        print(String(format: "%-10@ %-10@ %.0f ms", style.family.rawValue as NSString, style.id as NSString, Date().timeIntervalSince(t0) * 1000))
    }
case "stage":
    let (w, h) = args.count > 3 ? parseSize(args[3]) : (960, 540)
    let t = args.count > 4 ? Double(args[4]) ?? 3.0 : 3.0
    let textures = (0..<8).map { try! MediaLoader.texture(from: SampleArt.make(index: $0)) }
    let items = textures.enumerated().map { SceneItem(media: $0.offset, occurrence: $0.offset, aspect: $0.element.aspect) }
    let exporter = try Exporter()
    var look = StageLook()
    look.surface = .print
    let styleName = args.count > 5 ? args[5] : "studio"
    let paletteName = args.count > 6 ? args[6] : ""
    var backdrop = BackdropCatalog.style(styleName).defaults
    if !paletteName.isEmpty { backdrop.palette = Palettes.named(paletteName) }
    for path in TrainPath.allCases {
        let scene = TrainScene(id: path.rawValue, name: path.title, summary: "", path: path)
        let ctx = SceneContext(items: items, aspect: Float(w) / Float(h), dials: SceneDials())
        let comp = Composition(scene: scene, context: ctx, textures: textures.map(\.texture),
                               backdrop: backdrop, look: look)
        let t0 = Date()
        let img = try exporter.still(comp, at: t, width: w, height: h, samples: 8)
        try ImageOutput.writePNG(img, to: outDir.appendingPathComponent("train-\(path.rawValue).png"))
        print(String(format: "%-12@ %.0f ms", path.rawValue as NSString, Date().timeIntervalSince(t0) * 1000))
    }
case "video":
    let (w, h) = args.count > 3 ? parseSize(args[3]) : (1280, 720)
    let pathName = args.count > 4 ? args[4] : "ribbon"
    let styleName = args.count > 5 ? args[5] : "studio"
    let textures = (0..<8).map { try! MediaLoader.texture(from: SampleArt.make(index: $0)) }
    let items = textures.enumerated().map { SceneItem(media: $0.offset, occurrence: $0.offset, aspect: $0.element.aspect) }
    let exporter = try Exporter()
    var look = StageLook()
    look.surface = .print
    let scene = TrainScene(id: pathName, name: pathName, summary: "", path: TrainPath(rawValue: pathName) ?? .ribbon)
    let ctx = SceneContext(items: items, aspect: Float(w) / Float(h), dials: SceneDials())
    let comp = Composition(scene: scene, context: ctx, textures: textures.map(\.texture),
                           backdrop: BackdropCatalog.style(styleName).defaults, look: look)
    let settings = ExportSettings(width: w, height: h, fps: 30, duration: min(comp.loopDuration, 12), format: .video(.h264), samples: 8)
    let url = outDir.appendingPathComponent("\(pathName)-\(styleName).mp4")
    let t0 = Date()
    try await exporter.export(comp, settings: settings, to: url, progress: { p in
        if p.frame % 60 == 0 { print("frame \(p.frame)/\(p.total)") }
    })
    print(String(format: "wrote %@ in %.1f s", url.path, Date().timeIntervalSince(t0)))
case "overlap":
    struct TwoCards: StageScene {
        let id = "t", name = "t", summary = ""
        var dials: [(DialKey, String)] { [] }
        var defaults = SceneDials()
        var rotB: Float = 0
        func loopDuration(_ ctx: SceneContext) -> Double { 4 }
        func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
            var f = StageFrame()
            var a = CardPose(media: 0, occurrence: 0, position: SIMD3(-0.15, 0.05, 0), size: SIMD2(0.8, 0.45))
            a.mediaAspect = ctx.items[0].aspect
            var b = CardPose(media: 1, occurrence: 1, position: SIMD3(0.15, -0.1, 0.05), rotation: SIMD3(0, 0, rotB), size: SIMD2(0.8, 0.45))
            b.mediaAspect = ctx.items[1].aspect
            f.cards = [a, b]
            return f
        }
    }
    let textures = [try MediaLoader.texture(from: SampleArt.make(index: 1)), try MediaLoader.texture(from: SampleArt.make(index: 2))]
    let items = textures.enumerated().map { SceneItem(media: $0.offset, occurrence: $0.offset, aspect: $0.element.aspect) }
    let exporter = try Exporter()
    for (name, rot, surface) in [("flat", Float(0), SurfaceKind.original), ("rot", Float(0.3), SurfaceKind.original), ("print-rot", Float(0.3), SurfaceKind.print)] {
        var look = StageLook()
        look.surface = surface
        let comp = Composition(scene: TwoCards(rotB: rot), context: SceneContext(items: items, aspect: 16.0/9.0, dials: SceneDials()),
                               textures: textures.map(\.texture), backdrop: BackdropCatalog.style("studio").defaults, look: look)
        let img = try exporter.still(comp, at: 0, width: 960, height: 540, samples: 1)
        try ImageOutput.writePNG(img, to: outDir.appendingPathComponent("overlap-\(name).png"))
    }
    print("ok")
case "sizetest":
    // Which codecs write which frame sizes: two frames each, on the Studio backdrop.
    let comp = Composition(scene: UnderlayScene(loop: 2, showCard: false), context: SceneContext(items: [], aspect: 16.0 / 9.0, dials: SceneDials()),
                           textures: [], backdrop: BackdropCatalog.style("softbloom").defaults, look: StageLook())
    let exporter = try Exporter()
    for (w, h) in [(3840, 2160), (4096, 2304), (5120, 2144), (5120, 2880), (7680, 4320), (2160, 3840), (2160, 3840 * 2)] {
        for (name, codec) in [("h264", VideoCodec.h264), ("hevc", VideoCodec.hevc), ("prores", VideoCodec.prores422)] {
            let url = outDir.appendingPathComponent("size-\(w)x\(h)-\(name).\(codec == .h264 || codec == .hevc ? "mp4" : "mov")")
            try? FileManager.default.removeItem(at: url)
            let settings = ExportSettings(width: w, height: h, fps: 30, duration: 2.0 / 30, format: .video(codec), samples: 1)
            do {
                try await exporter.export(comp, settings: settings, to: url)
                print("\(w)x\(h) \(name): ok")
            } catch {
                print("\(w)x\(h) \(name): FAILED \(error)")
            }
        }
    }
case "decode":
    // Reads a saved project.json the way a document opens, and prints what came back.
    let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[3]))
    let project = try ProjectPackage.decode(data)
    print("items \(project.items.count) scene \(project.scene) format \(project.format.id) title \(project.title.map { "\($0.text) / \($0.kicker) / \($0.placement.rawValue) / \($0.timing.rawValue)" } ?? "none")")
case "deck":
    // The sample deck as PNGs at a given size: studio-lab deck <outdir> [2576x1080]
    let (w, h) = parseSize(args.count > 3 ? args[3] : "2576x1080")
    for (i, img) in sampleDeckSlides(width: w, height: h).enumerated() {
        try ImageOutput.writePNG(img, to: outDir.appendingPathComponent(String(format: "slide-%02d.png", i + 1)))
    }
    print("deck \(w)x\(h) → \(outDir.path)")
case "sceneprobe":
    // Prints what a scene draws at a moment: card count and positions.
    let scene: any StageScene = HangScene()
    for aspect: Float in [16.0 / 9.0, 1, 9.0 / 16.0] {
        let items = (0..<10).map { SceneItem(media: $0, occurrence: $0, aspect: ([0.8, 1.5, 1.8, 0.8, 1, 0.8, 1.5, 1, 0.8, 1.5] as [Float])[$0]) }
        let ctx = SceneContext(items: items, aspect: aspect, dials: scene.defaults)
        let f = scene.frame(at: 4, ctx)
        let media = f.cards.filter { $0.media >= 0 }
        print("aspect \(aspect) loop \(String(format: "%.1f", scene.loopDuration(ctx))) cards \(f.cards.count) media \(media.count) x \(media.map { String(format: "%.2f", $0.position.x) })")
    }
case "handtest":
    let textures = (0..<7).map { try! MediaLoader.texture(from: SampleArt.make(index: $0 + 3, width: 1600, height: $0 % 3 == 1 ? 2000 : 900)) }
    let items = textures.enumerated().map { SceneItem(media: $0.offset, occurrence: $0.offset, aspect: $0.element.aspect) }
    let exporter = try Exporter()
    let variants: [(String, (inout StageLook) -> Void)] = [
        ("default", { _ in }),
        ("rigid", { l in l.bend = .rigid }),
        ("noshadow", { l in l.shadow = 0 }),
        ("nodof", { l in l.depthOfField = 0 }),
        ("all-off", { l in l.bend = .rigid; l.shadow = 0; l.depthOfField = 0 }),
    ]
    for (name, tweak) in variants {
        var look = StageLook()
        tweak(&look)
        let comp = Composition(scene: HandScene(), context: SceneContext(items: items, aspect: 16.0/9.0, dials: HandScene().defaults),
                               textures: textures.map(\.texture), backdrop: BackdropCatalog.style("studio").defaults, look: look)
        let img = try exporter.still(comp, at: 3.7, width: 960, height: 540, samples: 1)
        try ImageOutput.writePNG(img, to: outDir.appendingPathComponent("hand-\(name).png"))
    }
    print("ok")
case "bench":
    let (w, h) = args.count > 3 ? parseSize(args[3]) : (2400, 1350)
    let renderer = try BackdropRenderer()
    let finisher = try Finisher()
    renderer.warmUp()
    let gpu = GPU.shared
    let hdr = gpu.makeTexture(width: w, height: h, format: .rgba16Float)
    let out = gpu.makeTexture(width: w, height: h, format: .bgra8Unorm, usage: [.renderTarget, .shaderRead])
    for style in BackdropCatalog.styles {
        var times: [Double] = []
        for i in 0..<8 {
            let cb = gpu.queue.makeCommandBuffer()!
            try renderer.encode(cb, target: hdr, settings: style.defaults, phase: Double(i) / 8)
            try finisher.encode(cb, input: hdr, output: out, settings: FinishSettings(), frame: FinishFrame(frameIndex: UInt32(i)))
            cb.commit(); cb.waitUntilCompleted()
            times.append((cb.gpuEndTime - cb.gpuStartTime) * 1000)
        }
        times.sort()
        print(String(format: "%-11@ %6.2f ms (median GPU)", style.id as NSString, times[4]))
    }
case "iconcands":
    let renderer = try BackdropRenderer()
    let finisher = try Finisher()
    for style in ["dunes", "silk", "linefield", "halo", "aurora", "ridgelines", "contours", "fluted"] {
        var b = BackdropCatalog.style(style).defaults
        b.palette = Palettes.named("cobalt")
        var fin = FinishSettings(); fin.grain = 0.08; fin.vignette = 0
        let img = try renderBackdrop(renderer, finisher, settings: b, width: 512, height: 512, phase: 0.3, frame: 1, finish: fin)
        try ImageOutput.writePNG(img, to: outDir.appendingPathComponent("\(style).png"))
    }
case "icons":
    // Drift: slides rising up a blue room. Galileo: one matted work under a
    // warm light. Backdrop: dunes in deep teal. No brand colours.
    func iconSlide(_ variant: Int) -> CGImage {
        let W = 1200, H = 760
        let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        func c(_ hex: String, _ a: CGFloat = 1) -> CGColor { let r = RGB(hex: hex); return CGColor(red: CGFloat(r.r), green: CGFloat(r.g), blue: CGFloat(r.b), alpha: a) }
        func rect(_ x: Int, _ top: Int, _ w: Int, _ h: Int) -> CGRect { CGRect(x: x, y: H - top - h, width: w, height: h) }
        switch variant % 3 {
        case 0:
            ctx.setFillColor(c("#F3F0EA")); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
            ctx.setFillColor(c("#315FFF")); ctx.fill(rect(90, 150, 470, 64))
            ctx.setFillColor(c("#0E1014", 0.5)); ctx.fill(rect(90, 260, 380, 30)); ctx.fill(rect(90, 316, 300, 30))
            ctx.setFillColor(c("#315FFF")); ctx.fillEllipse(in: rect(720, 170, 360, 360))
        case 1:
            ctx.setFillColor(c("#315FFF")); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
            ctx.setFillColor(c("#FFFFFF")); ctx.fill(rect(90, 150, 430, 64))
            ctx.setFillColor(c("#FFFFFF", 0.6)); ctx.fill(rect(90, 260, 340, 30)); ctx.fill(rect(90, 316, 260, 30))
            for i in 0..<4 { ctx.setFillColor(c(i == 3 ? "#FFB43F" : "#FFFFFF", i == 3 ? 1 : 0.85)); ctx.fill(rect(680 + i * 110, 620 - (130 + i * 95), 70, 130 + i * 95)) }
        default:
            ctx.setFillColor(c("#10142A")); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
            ctx.setFillColor(c("#FFB43F")); ctx.fill(rect(90, 150, 120, 12))
            ctx.setFillColor(c("#F3F0EA")); ctx.fill(rect(90, 200, 560, 80))
            ctx.setFillColor(c("#BECFFF", 0.7)); ctx.fill(rect(90, 320, 360, 30))
            ctx.setFillColor(c("#315FFF")); ctx.fillEllipse(in: rect(760, 300, 420, 420))
        }
        return ctx.makeImage()!
    }
    struct IconScene: StageScene {
        let id = "icon", name = "icon", summary = ""
        var dials: [(DialKey, String)] { [] }
        var defaults = SceneDials()
        var kind: String
        func loopDuration(_ ctx: SceneContext) -> Double { 10 }
        func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
            var f = StageFrame()
            func card(_ m: Int, _ p: SIMD3<Float>, _ r: SIMD3<Float>, _ h: Float) -> CardPose {
                var c = CardPose(media: m, occurrence: m, position: p, rotation: r, size: SIMD2(h * 1.58, h))
                c.mediaAspect = 1.58; c.corner = 0.05; c.curl = 0.18; return c
            }
            switch kind {
            case "drift":
                // A stream of slides rising up the frame, nearest at the foot.
                f.cards = [card(2, SIMD3(0.07, 0.27, -0.34), SIMD3(-0.5, 0.1, 0.05), 0.22),
                           card(1, SIMD3(-0.05, 0.04, -0.14), SIMD3(-0.42, 0.2, -0.05), 0.27),
                           card(0, SIMD3(0.04, -0.22, 0.08), SIMD3(-0.34, 0.3, 0.04), 0.32)]
            case "galileo":
                // One work, matted, with its placard.
                let art = SIMD2<Float>(0.34, 0.425)
                f.cards = [CardPose.solid(RGB(hex: "#F4F0E8"), position: SIMD3(0, 0.04, 0), size: art + SIMD2(0.1, 0.1), corner: 0.012, shadow: 1.1)]
                var work = CardPose(media: 3, occurrence: 3, position: SIMD3(0, 0.04, 0.003), size: art)
                work.mediaAspect = 0.8; work.corner = 0.004; work.shadow = 0
                f.cards.append(work)
                f.cards.append(CardPose.solid(RGB(hex: "#F4F0E8"), position: SIMD3(0.17, -0.33, 0), size: SIMD2(0.11, 0.032), corner: 0.04, shadow: 0.6))
                f.groundZ = -0.05
                f.shadowsOnCards = false
                return f
            default:
                f.cards = []
            }
            f.groundZ = -0.5
            return f
        }
    }
    var images = (0..<3).map { iconSlide($0) }
    images.append(SampleArt.painting(index: 0) ?? iconSlide(0))
    let textures = images.map { try! MediaLoader.texture(from: $0) }
    let items = textures.enumerated().map { SceneItem(media: $0.offset, occurrence: $0.offset, aspect: $0.element.aspect) }
    let exporter = try Exporter()
    for (name, style, palette, tweak) in [
        ("Drift", "softbloom", "nocturne", { (b: inout BackdropSettings) in b.accent = 0; b.scale = 0.8; b.brightness = 1.05; b.seed = 11 }),
        ("Galileo", "halo", "champagne", { (b: inout BackdropSettings) in b.scale = 0.75; b.brightness = 1.0; b.seed = 3 }),
        ("Backdrop", "dunes", "lagoon", { (b: inout BackdropSettings) in b.scale = 0.62; b.detail = 0.42; b.accent = 0.75; b.softness = 0.15; b.seed = 29 }),
    ] {
        var b = BackdropCatalog.style(style).defaults
        b.palette = Palettes.named(palette)
        b.vignette = 0.25
        tweak(&b)
        var look = StageLook()
        look.surface = name == "Galileo" ? .print : .gloss
        look.shadow = 0.8
        look.shadowSoftness = 0.6
        look.depthOfField = name == "Drift" ? 0.25 : 0
        look.finish.grain = 0.06
        look.finish.bloom = 0.18
        let comp = Composition(scene: IconScene(kind: name.lowercased()), context: SceneContext(items: items, aspect: 1, dials: SceneDials()),
                               textures: textures.map(\.texture), backdrop: b, look: look)
        let art = try exporter.still(comp, at: 2.0, width: 1024, height: 1024, samples: 4)
        // Mask into the macOS icon shape.
        let size = 1024, inset: CGFloat = 100, r: CGFloat = 185
        let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        let rect = CGRect(x: inset, y: inset, width: CGFloat(size) - inset * 2, height: CGFloat(size) - inset * 2)
        let path = CGPath(roundedRect: rect, cornerWidth: r, cornerHeight: r, transform: nil)
        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: 0, height: -12), blur: 28, color: CGColor(gray: 0, alpha: 0.38))
        ctx.addPath(path); ctx.setFillColor(CGColor(gray: 0.1, alpha: 1)); ctx.fillPath()
        ctx.restoreGState()
        ctx.saveGState()
        ctx.addPath(path); ctx.clip()
        ctx.draw(art, in: rect)
        ctx.restoreGState()
        ctx.addPath(CGPath(roundedRect: rect.insetBy(dx: 1, dy: 1), cornerWidth: r - 1, cornerHeight: r - 1, transform: nil))
        ctx.setStrokeColor(CGColor(gray: 1, alpha: 0.14)); ctx.setLineWidth(2); ctx.strokePath()
        try ImageOutput.writePNG(ctx.makeImage()!, to: outDir.appendingPathComponent("\(name)-1024.png"))
        print("icon \(name)")
    }
case "mips":
    let t = try MediaLoader.texture(from: SampleArt.make(index: 0))
    print("levels", t.texture.mipmapLevelCount, t.texture.pixelFormat.rawValue, t.texture.storageMode.rawValue)
    for level in [0, 1, 2, 3] {
        let w = max(1, t.texture.width >> level), h = max(1, t.texture.height >> level)
        let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: t.texture.pixelFormat, width: w, height: h, mipmapped: false)
        d.storageMode = .shared
        let dst = GPU.shared.device.makeTexture(descriptor: d)!
        let cb = GPU.shared.queue.makeCommandBuffer()!
        let blit = cb.makeBlitCommandEncoder()!
        blit.copy(from: t.texture, sourceSlice: 0, sourceLevel: level, sourceOrigin: MTLOrigin(x: 0, y: 0, z: 0),
                  sourceSize: MTLSize(width: w, height: h, depth: 1), to: dst, destinationSlice: 0, destinationLevel: 0,
                  destinationOrigin: MTLOrigin(x: 0, y: 0, z: 0))
        blit.endEncoding(); cb.commit(); cb.waitUntilCompleted()
        var px = [UInt8](repeating: 0, count: 4)
        dst.getBytes(&px, bytesPerRow: 4 * w, from: MTLRegionMake2D(w / 3, h / 2, 1, 1), mipmapLevel: 0)
        print("level", level, w, h, px)
    }
default:
    print("unknown command \(command)")
    exit(2)
}
