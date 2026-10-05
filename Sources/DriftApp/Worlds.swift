import StudioKit
import UniformTypeIdentifiers

/// Drift's Worlds: each one is a complete look — path, pace, surface, light,
/// backdrop and film finish. Identity copy carried forward from Drift 0.5.1.
enum Worlds {
    struct Spec {
        var id: String
        var name: String
        var eyebrow: String
        var summary: String
        var path: TrainPath
        var dials: SceneDials
        var hold: Float = 0
        var curvature: Float = 0.4
        var bank: Float = 4
        var edgeFade: Float = 0.25
        var poseRate: Double = 0
        var secondsPerItem: Float = 2.6
        var backdrop: String
        var palette: String
        var backdropTweak: (inout BackdropSettings) -> Void = { _ in }
        var look: (inout StageLook) -> Void
    }

    static let specs: [Spec] = [
        Spec(id: "editorial", name: "Editorial", eyebrow: "Long breath · ink · warm paper",
             summary: "Warm paper and ink on a long, calm ribbon.",
             path: .ribbon, dials: SceneDials(pace: 0.42, size: 0.52, spacing: 0.45, depth: 0.45, angle: 0.5, life: 0.35),
             curvature: 0.36, bank: 4.5, backdrop: "studio", palette: "champagne",
             backdropTweak: { b in b.accent = 0.3; b.detail = 0.6; b.vignette = 0.4; b.brightness = 0.9 },
             look: { l in l.mood = 0.25; l.surface = .print; l.bend = .paper; l.bendAmount = 0.55; l.shadow = 0.6; l.depthOfField = 0.3
                 l.finish.grain = 0.28; l.finish.bloom = 0.16; l.finish.warmth = 0.12 }),
        Spec(id: "noir", name: "Noir", eyebrow: "Hard evidence · silver · black",
             summary: "Silver and black on a straight line, with a beat on every slide.",
             path: .straight, dials: SceneDials(pace: 0.5, size: 0.5, spacing: 0.3, depth: 0.2, angle: 0.5, life: 0.1),
             hold: 0.4, curvature: 0, bank: 0.8, edgeFade: 0.22, secondsPerItem: 2.4, backdrop: "dotgrid", palette: "graphite",
             backdropTweak: { b in b.vignette = 0.45 },
             look: { l in l.surface = .original; l.bend = .rigid; l.corners = 0.08; l.shadow = 0.75; l.shadowSoftness = 0.3
                 l.depthOfField = 0.12; l.finish.grain = 0.38; l.finish.contrast = 0.14; l.finish.saturation = -0.25; l.finish.bloom = 0.08 }),
        Spec(id: "sunstruck", name: "Sunstruck", eyebrow: "Travel · heat · bleached latitude",
             summary: "Bleached light and faded colour on a long, easy arc.",
             path: .arc, dials: SceneDials(pace: 0.42, size: 0.5, spacing: 0.5, depth: 0.5, angle: 0.55, life: 0.4),
             curvature: 0.46, bank: 2.2, backdrop: "leak", palette: "saffron",
             backdropTweak: { b in b.accent = 0.35; b.vignette = 0.3 },
             look: { l in l.surface = .print; l.bend = .paper; l.shadow = 0.5; l.depthOfField = 0.28
                 l.finish.grain = 0.3; l.finish.bloom = 0.3; l.finish.warmth = 0.35; l.finish.contrast = -0.08; l.finish.saturation = -0.1 }),
        Spec(id: "dread", name: "Dread", eyebrow: "Upward unease · crimson · void",
             summary: "Crimson dark; the slides turn slowly through a tunnel.",
             path: .tunnel, dials: SceneDials(pace: 0.3, size: 0.46, spacing: 0.55, depth: 0.7, angle: 0.5, life: 0.3),
             hold: 0.3, curvature: 0.72, bank: 8.5, edgeFade: 0.46, backdrop: "halo", palette: "oxblood",
             backdropTweak: { b in b.brightness = 0.7; b.vignette = 0.6; b.scale = 0.35 },
             look: { l in l.surface = .original; l.bend = .card; l.shadow = 0.7; l.depthOfField = 0.55
                 l.finish.grain = 0.34; l.finish.contrast = 0.16; l.finish.bloom = 0.22; l.finish.aberration = 0.25 }),
        Spec(id: "tender", name: "Tender", eyebrow: "Close air · rose · human",
             summary: "Soft warm light; the slides circle close to the camera.",
             path: .orbit, dials: SceneDials(pace: 0.38, size: 0.56, spacing: 0.4, depth: 0.5, angle: 0.5, life: 0.45),
             curvature: 0.64, bank: 8, backdrop: "softbloom", palette: "rosewood",
             backdropTweak: { b in b.accent = 0.15; b.softness = 0.75 },
             look: { l in l.surface = .print; l.bend = .silk; l.bendAmount = 0.5; l.shadow = 0.45; l.shadowSoftness = 0.75
                 l.depthOfField = 0.38; l.finish.grain = 0.2; l.finish.bloom = 0.3; l.finish.warmth = 0.14 }),
        Spec(id: "velvet", name: "Velvet", eyebrow: "Fashion · saturated fold · close camera",
             summary: "Rich colour and silky folds along a slow helix.",
             path: .helix, dials: SceneDials(pace: 0.45, size: 0.58, spacing: 0.35, depth: 0.38, angle: 0.5, life: 0.5),
             curvature: 0.48, bank: 7, backdrop: "silk", palette: "orchid",
             backdropTweak: { b in b.accent = 0.6 },
             look: { l in l.surface = .gloss; l.bend = .silk; l.bendAmount = 0.65; l.shadow = 0.55; l.depthOfField = 0.35
                 l.finish.grain = 0.22; l.finish.bloom = 0.32; l.finish.saturation = 0.12; l.finish.contrast = 0.06 }),
        Spec(id: "celluloid", name: "Celluloid", eyebrow: "History · projector dust · handled reel",
             summary: "Film grain and faded emulsion; the slides step like frames.",
             path: .straight, dials: SceneDials(pace: 0.45, size: 0.5, spacing: 0.35, depth: 0.25, angle: 0.5, life: 0.6),
             curvature: 0, bank: 0.8, poseRate: 15, backdrop: "paper", palette: "champagne",
             backdropTweak: { b in b.accent = 0.7; b.vignette = 0.5; b.brightness = 0.85 },
             look: { l in l.surface = .print; l.bend = .paper; l.shadow = 0.55; l.depthOfField = 0.15
                 l.finish.grain = 0.5; l.finish.grainSize = 0.6; l.finish.contrast = -0.06; l.finish.warmth = 0.22
                 l.finish.saturation = -0.2; l.shutter = 0.2 }),
        Spec(id: "nightrun", name: "Night Run", eyebrow: "Thriller · sodium · wet asphalt",
             summary: "Sodium light and speed around a wet curve.",
             path: .cylinder, dials: SceneDials(pace: 0.72, size: 0.5, spacing: 0.4, depth: 0.55, angle: 0.5, life: 0.4),
             curvature: 0.68, bank: 9, edgeFade: 0.32, backdrop: "bokeh", palette: "saffron",
             backdropTweak: { b in b.accent = 0.55; b.motion = 0.5 },
             look: { l in l.surface = .gloss; l.bend = .card; l.shadow = 0.6; l.depthOfField = 0.45
                 l.finish.grain = 0.3; l.finish.contrast = 0.14; l.finish.bloom = 0.35; l.finish.aberration = 0.35
                 l.finish.warmth = -0.1; l.shutter = 0.9 }),
        Spec(id: "procession", name: "Procession", eyebrow: "Rigid wave · studio · clean",
             summary: "One clean, slow wave through a quiet studio. Fits any deck.",
             path: .wave, dials: SceneDials(pace: 0.45, size: 0.5, spacing: 0.4, depth: 0.45, angle: 0.55, life: 0.2),
             curvature: 0.5, bank: 5, edgeFade: 0.2, backdrop: "studio", palette: "graphite",
             look: { l in l.mood = 0.3; l.surface = .print; l.bend = .card; l.shadow = 0.6; l.shadowSoftness = 0.6; l.depthOfField = 0.25
                 l.finish.grain = 0.18; l.finish.bloom = 0.1 }),
    ]

    static func scene(_ spec: Spec) -> TrainScene {
        var s = TrainScene(id: spec.id, name: spec.name, summary: spec.summary, path: spec.path, defaults: spec.dials,
                           hold: spec.hold, curvature: spec.curvature, bank: spec.bank, edgeFade: spec.edgeFade,
                           secondsPerItem: spec.secondsPerItem)
        s.poseRate = spec.poseRate
        return s
    }

    /// Worlds built on formations other than the train.
    /// `pace` sets a reel-length loop (about 20 to 25 s with eight slides)
    /// where the scene's own default runs long.
    static func formation(_ scene: any StageScene, id: String, name: String, eyebrow: String, summary: String,
                          backdrop: String, palette: String, tweak: @escaping @Sendable (inout BackdropSettings) -> Void = { _ in },
                          pace: Float? = nil, look: @escaping @Sendable (inout StageLook) -> Void) -> SceneEntry {
        SceneEntry(id: id, name: name, eyebrow: eyebrow, summary: summary,
                   make: { _ in scene },
                   apply: { p in
                       p.dials = scene.defaults
                       if let pace { p.dials.pace = pace }
                       var b = BackdropCatalog.style(backdrop).defaults
                       b.palette = Palettes.named(palette)
                       tweak(&b)
                       b.seed = p.backdrop.seed
                       p.backdrop = b
                       var l = StageLook()
                       look(&l)
                       if l.drift == nil { l.cameraDrift = cameraDrift[id] ?? 0.3 }
                       p.look = l
                   })
    }

    static var formations: [SceneEntry] {
        [
            formation(StoryScene(),
                      id: "story", name: "Story", eyebrow: "Sheet · hand · feature · home",
                      summary: "The whole deck on a sheet, fanned into a hand, each slide featured in turn, then home again.",
                      backdrop: "softbloom", palette: "steel", tweak: { b in b.accent = 0; b.brightness = 0.8; b.vignette = 0.35 },
                      look: { l in l.mood = 0.3; l.surface = .print; l.bend = .card; l.shadow = 0.75; l.depthOfField = 0.15; l.finish.grain = 0.18; l.finish.bloom = 0.14 }),
            formation(WallScene(id: "wall", name: "Tilted", summary: "The whole deck on one tilted wall, the camera travelling slowly across it."),
                      id: "wall", name: "Tilted", eyebrow: "Whole deck · tilted wall · slow pan",
                      summary: "The whole deck on one tilted wall, scrolling slowly.",
                      backdrop: "studio", palette: "graphite", tweak: { b in b.vignette = 0.45 },
                      look: { l in l.surface = .print; l.bend = .rigid; l.shadow = 0.7; l.depthOfField = 0.55; l.finish.grain = 0.18 }),
            formation(PresenterScene(id: "spotlight", name: "Feed", summary: "One slide at a time, large and readable, with a composed swing between them."),
                      id: "spotlight", name: "Feed", eyebrow: "One at a time · readable · composed",
                      summary: "One slide at a time, large and readable, with a composed swing between them.",
                      backdrop: "softbloom", palette: "nocturne", tweak: { b in b.accent = 0; b.brightness = 0.85 }, pace: 0.72,
                      look: { l in l.mood = 0.45; l.surface = .print; l.bend = .card; l.shadow = 0.7; l.depthOfField = 0.2; l.finish.grain = 0.18; l.finish.bloom = 0.12 }),
            formation(StackScene(id: "shuffle", name: "Shuffle", summary: "A neat pile of slides. The top one is thrown in an arc and tucked back underneath."),
                      id: "shuffle", name: "Shuffle", eyebrow: "Deck · throw · tuck",
                      summary: "A neat pile of slides. The top one is thrown in an arc and tucked back underneath.",
                      backdrop: "mesh", palette: "terracotta", tweak: { b in b.accent = 0.1 },
                      look: { l in l.surface = .print; l.bend = .paper; l.bendAmount = 0.35; l.shadow = 0.75; l.depthOfField = 0.1; l.finish.grain = 0.2 }),
            formation(OpeningScene(id: "opening", name: "Opening",
                                   summary: "A deck opener. The strip travels to each highlight, which grows while its neighbours make room; the last takes the stage, then clears it."),
                      id: "opening", name: "Opening", eyebrow: "Deck opener · highlights · finale",
                      summary: "A deck opener. The strip travels to each highlight, which grows while its neighbours make room; the last takes the stage, then clears it.",
                      backdrop: "leak", palette: "champagne", tweak: { b in b.vignette = 0.4 }, pace: 0.64,
                      look: { l in l.mood = 0.35; l.surface = .print; l.bend = .card; l.shadow = 0.6; l.depthOfField = 0.2
                          l.finish.grain = 0.2; l.finish.bloom = 0.18; l.finish.warmth = 0.1 }),
            formation(RailScene(summary: "One slide at a time, flat at the centre, its neighbours tilting away above and below."),
                      id: "rail", name: "Rail", eyebrow: "Centre · tilt · depth",
                      summary: "One slide at a time, flat at the centre, its neighbours tilting away above and below.",
                      backdrop: "softbloom", palette: "steel", tweak: { b in b.accent = 0; b.brightness = 0.8; b.vignette = 0.45 },
                      look: { l in l.mood = 0.5; l.surface = .gloss; l.bend = .rigid; l.shadow = 0.6; l.depthOfField = 0.2; l.finish.grain = 0.15; l.finish.bloom = 0.14 }),
            formation(CascadeScene(summary: "Each slide arrives turned away and peels flat, edge to edge, as it rises."),
                      id: "cascade", name: "Cascade", eyebrow: "Turn · peel · settle",
                      summary: "Each slide arrives turned away and peels flat, edge to edge, as it rises.",
                      backdrop: "softbloom", palette: "nocturne", tweak: { b in b.accent = 0; b.brightness = 0.8; b.vignette = 0.4 },
                      look: { l in l.mood = 0.4; l.surface = .print; l.bend = .rigid; l.shadow = 0.6; l.depthOfField = 0.15; l.finish.grain = 0.16; l.finish.bloom = 0.12 }),
            formation(LanesScene(summary: "Three lanes of slides rise at different speeds, each riding its own slow wave."),
                      id: "lanes", name: "Lanes", eyebrow: "Three lanes · waves · parallax",
                      summary: "Three lanes rise at different speeds, each riding its own slow wave.",
                      backdrop: "studio", palette: "graphite", tweak: { b in b.vignette = 0.5; b.brightness = 0.85 },
                      look: { l in l.surface = .print; l.bend = .rigid; l.shadow = 0.65; l.depthOfField = 0.2; l.finish.grain = 0.16; l.finish.bloom = 0.1 }),
            formation(VortexScene(summary: "One slide holds the centre while rings of the others orbit around it."),
                      id: "vortex", name: "Vortex", eyebrow: "Anchor · orbits · abundance",
                      summary: "One slide holds the centre while rings of the others orbit around it.",
                      backdrop: "halo", palette: "graphite", tweak: { b in b.scale = 0.6; b.brightness = 0.85; b.vignette = 0.5 },
                      look: { l in l.mood = 0.6; l.surface = .gloss; l.bend = .rigid; l.shadow = 0.5; l.depthOfField = 0.45; l.finish.grain = 0.16; l.finish.bloom = 0.22 }),
            formation(LoomScene(summary: "Slides weave together from threads as they rise, and come apart into threads at the top."),
                      id: "loom", name: "Loom", eyebrow: "Threads · weave · unravel",
                      summary: "Slides weave together from threads as they rise, and come apart into threads at the top.",
                      backdrop: "paper", palette: "paper-moon", tweak: { b in b.accent = 0.4; b.vignette = 0.3; b.brightness = 0.95 },
                      look: { l in l.surface = .print; l.bend = .rigid; l.shadow = 0.3; l.depthOfField = 0; l.finish.grain = 0.16; l.finish.bloom = 0.06 }),
            formation(AssembleScene(summary: "The slides fly in from depth, centre first, and settle into a contact sheet."),
                      id: "assemble", name: "Assemble", eyebrow: "Depth · converge · sheet",
                      summary: "The slides fly in from depth, centre first, and settle into a contact sheet.",
                      backdrop: "paper", palette: "sumi", tweak: { b in b.accent = 0.85; b.vignette = 0.4 },
                      look: { l in l.surface = .original; l.bend = .rigid; l.shadow = 0.55; l.depthOfField = 0.25; l.finish.grain = 0.2 }),
            formation(UnrollScene(summary: "The deck as a sheet unrolls into a strip, curls into a ring that turns once, and folds back."),
                      id: "unroll", name: "Unroll", eyebrow: "Sheet · ring · sheet",
                      summary: "The deck as a sheet unrolls into a strip, curls into a ring that turns once, and folds back.",
                      backdrop: "studio", palette: "graphite", tweak: { b in b.vignette = 0.45; b.brightness = 0.9 },
                      look: { l in l.mood = 0.3; l.surface = .print; l.bend = .rigid; l.shadow = 0.45; l.depthOfField = 0.2; l.finish.grain = 0.16 }),
            formation(FocusScene(summary: "A strip of slides glides along, then zooms in on one at a time and back out."),
                      id: "focus", name: "Focus", eyebrow: "Strip · zoom · detail",
                      summary: "A strip of slides glides along, then zooms in on one at a time and back out.",
                      backdrop: "studio", palette: "ivory-ink", tweak: { b in b.vignette = 0.4; b.brightness = 0.9 },
                      look: { l in l.mood = 0.45; l.surface = .print; l.bend = .rigid; l.shadow = 0.5; l.depthOfField = 0; l.finish.grain = 0.15 }),
            formation(ContactSheetScene(),
                      id: "contact", name: "Marks", eyebrow: "Whole deck · proof · registration",
                      summary: "Every slide on one sheet. Registration marks travel from slide to slide, then frame the lot.",
                      backdrop: "paper", palette: "sumi", tweak: { b in b.accent = 0.85; b.vignette = 0.4 },
                      look: { l in l.surface = .original; l.bend = .rigid; l.shadow = 0.5; l.depthOfField = 0; l.shutter = 0.3; l.finish.grain = 0.2 }),
        ]
    }

    /// The browser: one Stream in nine styles, then the formations.
    static var groups: [SceneGroup] {
        let f = Dictionary(uniqueKeysWithValues: formations.map { ($0.id, $0) })
        return [
            SceneGroup(id: "stream", name: "Stream",
                       summary: "Slides ride a path up the screen, one after another.",
                       wideSummary: "Slides ride a path across the screen, one after another.",
                       symbol: "arrow.up", wideSymbol: "arrow.right", members: trainEntries),
            SceneGroup(id: "spotlight", name: "Spotlight",
                       summary: "One slide at a time, big and readable: a feed, a tilting rail, a peeling cascade, or a strip that zooms in.",
                       symbol: "rectangle.center.inset.filled", members: [f["spotlight"]!, f["rail"]!, f["cascade"]!, f["focus"]!]),
            SceneGroup(single: f["opening"]!,
                       summary: "An opener. Each highlight grows as the strip rises; the last takes the stage.",
                       wideSummary: "An opener. Each highlight grows as the strip runs; the last takes the stage.",
                       symbol: "play.rectangle"),
            SceneGroup(single: f["story"]!,
                       summary: "The deck on a sheet, fanned into a hand, each slide shown, then home.",
                       symbol: "book"),
            SceneGroup(single: f["shuffle"]!,
                       summary: "A neat pile. The top slide is tossed up and tucked back under.",
                       wideSummary: "A neat pile. The top slide is thrown in an arc and tucked back under.",
                       symbol: "rectangle.stack"),
            SceneGroup(id: "wall", name: "Wall",
                       summary: "The whole deck as a wall: tilted and scrolling, or rising in three waving lanes.",
                       symbol: "square.grid.3x3", members: [f["wall"]!, f["lanes"]!]),
            SceneGroup(single: f["vortex"]!,
                       summary: "One slide holds the centre while rings of the others orbit around it.",
                       symbol: "tornado"),
            SceneGroup(single: f["loom"]!,
                       summary: "Slides weave together from threads as they rise, and come apart at the top.",
                       wideSummary: "Slides weave together from threads as they cross, and come apart at the far edge.",
                       symbol: "line.3.horizontal.decrease", wideSymbol: "line.3.horizontal.decrease"),
            SceneGroup(id: "contact", name: "Contact",
                       summary: "Every slide on one sheet: crop marks visit each, the sheet assembles from depth, or it unrolls into a turning ring.",
                       symbol: "viewfinder", members: [f["contact"]!, f["assemble"]!, f["unroll"]!]),
        ]
    }

    static var trainEntries: [SceneEntry] {
        specs.map { spec in
            SceneEntry(id: spec.id, name: spec.name, eyebrow: spec.eyebrow, summary: spec.summary,
                       make: { _ in scene(spec) },
                       apply: { p in
                           p.dials = spec.dials
                           var b = BackdropCatalog.style(spec.backdrop).defaults
                           b.palette = Palettes.named(spec.palette)
                           spec.backdropTweak(&b)
                           b.seed = p.backdrop.seed
                           p.backdrop = b
                           var look = StageLook()
                           spec.look(&look)
                           if look.drift == nil { look.cameraDrift = cameraDrift[spec.id] ?? 0.3 }
                           p.look = look
                       })
        }
    }

    /// How much each World's camera drifts. None where the camera must hold
    /// still: the Wall already pans, Celluloid steps its poses.
    static let cameraDrift: [String: Float] = [
        "editorial": 0.5, "noir": 0.25, "sunstruck": 0.5, "dread": 0.4, "tender": 0.6, "velvet": 0.4, "celluloid": 0,
        "nightrun": 0.3, "procession": 0.35, "story": 0.3, "wall": 0, "spotlight": 0.45, "shuffle": 0.3, "opening": 0.25, "contact": 0.25,
        "loom": 0.15, "lanes": 0.2, "cascade": 0.2, "vortex": 0.3, "rail": 0.3, "assemble": 0.2, "focus": 0, "unroll": 0.15,
    ]

    static let documentType = UTType(exportedAs: "dog.pitch.drift2.reel", conformingTo: .package)

    static var configuration: StudioConfiguration {
        StudioConfiguration(appID: "drift", appName: "Drift", documentType: documentType,
                            galleryTitle: "World", gallerySymbol: "camera.filters",
                            groups: groups, defaultScene: "editorial",
                            emptyTitle: "Drop your slides",
                            emptyDetail: "A PDF, slide images or short clips. Drift turns them into a moving reel to post or present.",
                            itemNoun: "slide", defaultFormat: .reel, sampleCount: 8)
    }
}
