import StudioKit
import UniformTypeIdentifiers

/// Galileo's scenes: physical spaces and arrangements for artwork, grouped by
/// how the work is met — one at a time, walked past, in motion or on a table.
enum GalleryCatalog {
    struct Spec {
        var scene: any StageScene
        var eyebrow: String
        var backdrop: String
        var palette: String
        var backdropTweak: (inout BackdropSettings) -> Void = { _ in }
        var look: (inout StageLook) -> Void
        /// Pace for a reel-length loop (about 20 to 30 s with seven works), where
        /// the scene's own default runs long.
        var pace: Float? = nil
    }

    static let specs: [Spec] = [
        Spec(scene: GalleryDriftScene(), eyebrow: "Calm · continuous · faithful", backdrop: "studio", palette: "graphite",
             backdropTweak: { b in b.scale = 0.4; b.vignette = 0.35 },
             look: { l in l.mood = 0.3; l.surface = .original; l.bend = .rigid; l.shadow = 0.55; l.depthOfField = 0.15; l.finish.grain = 0.16 }),
        Spec(scene: CorridorScene(), eyebrow: "Spatial · two lanes · fixed camera", backdrop: "studio", palette: "steel",
             backdropTweak: { b in b.scale = 0.62; b.accent = 0.5; b.vignette = 0.45 },
             look: { l in l.surface = .original; l.bend = .rigid; l.shadow = 0.5; l.depthOfField = 0.0; l.finish.grain = 0.2; l.finish.bloom = 0.12 }),
        Spec(scene: VitrineScene(), eyebrow: "One work · still · museum room", backdrop: "studio", palette: "gallery",
             backdropTweak: { b in b.scale = 0.3; b.detail = 0.7; b.accent = 0.2; b.vignette = 0.25 },
             look: { l in l.mood = 0.45; l.surface = .print; l.bend = .rigid; l.shadow = 0.55; l.shadowSoftness = 0.7; l.depthOfField = 0.0; l.finish.grain = 0.14; l.finish.bloom = 0.05 },
             pace: 0.7),
        Spec(scene: ShelfScene(), eyebrow: "Editions · ledge · walking", backdrop: "paper", palette: "gallery",
             backdropTweak: { b in b.accent = 0.35; b.vignette = 0.3; b.motion = 0.2 },
             look: { l in l.surface = .print; l.bend = .rigid; l.shadow = 0.6; l.shadowSoftness = 0.45; l.lightAzimuth = 125; l.depthOfField = 0.0; l.finish.grain = 0.16 }),
        Spec(scene: OrbitScene(), eyebrow: "Ring · front gate · pause", backdrop: "halo", palette: "nocturne",
             backdropTweak: { b in b.scale = 0.7; b.brightness = 0.75; b.vignette = 0.4 },
             look: { l in l.mood = 0.4; l.surface = .gloss; l.bend = .rigid; l.shadow = 0.4; l.depthOfField = 0.25; l.finish.grain = 0.18; l.finish.bloom = 0.2 }),
        Spec(scene: HandScene(), eyebrow: "Dealt · crown · traversal", backdrop: "softbloom", palette: "kelp",
             backdropTweak: { b in b.accent = 0; b.softness = 0.7 },
             look: { l in l.surface = .print; l.bend = .card; l.shadow = 0.7; l.depthOfField = 0.1; l.finish.grain = 0.2; l.finish.bloom = 0.15 }),
        Spec(scene: ScatterScene(), eyebrow: "Prints · arrivals · negative space", backdrop: "paper", palette: "linen",
             backdropTweak: { b in b.accent = 0.2; b.vignette = 0.3 },
             look: { l in l.surface = .print; l.bend = .paper; l.bendAmount = 0.3; l.shadow = 0.65; l.shadowSoftness = 0.5; l.depthOfField = 0.0; l.finish.grain = 0.18 }),
        Spec(scene: StoryScene(id: "story", name: "Story", summary: "The whole set on a sheet, fanned into a hand, each work featured in turn, then home again."),
             eyebrow: "Sheet · hand · feature · home", backdrop: "softbloom", palette: "nocturne",
             backdropTweak: { b in b.accent = 0; b.brightness = 0.85 },
             look: { l in l.mood = 0.3; l.surface = .print; l.bend = .card; l.shadow = 0.75; l.depthOfField = 0.15; l.finish.grain = 0.18; l.finish.bloom = 0.12 }),
        Spec(scene: WallScene(), eyebrow: "Everything · tilted wall · slow pan", backdrop: "studio", palette: "graphite",
             backdropTweak: { b in b.vignette = 0.45 },
             look: { l in l.surface = .print; l.bend = .rigid; l.shadow = 0.7; l.depthOfField = 0.55; l.finish.grain = 0.18 }),
        Spec(scene: CascadeScene(summary: "Each work arrives turned away and peels flat, edge to edge, as it rises."),
             eyebrow: "Turn · peel · settle", backdrop: "studio", palette: "graphite",
             backdropTweak: { b in b.scale = 0.45; b.vignette = 0.4 },
             look: { l in l.mood = 0.4; l.surface = .print; l.bend = .rigid; l.shadow = 0.6; l.depthOfField = 0.1; l.finish.grain = 0.16 }),
        Spec(scene: UnrollScene(summary: "The works as a sheet unroll into a strip, curl into a ring that turns once, and fold back."),
             eyebrow: "Sheet · ring · sheet", backdrop: "studio", palette: "graphite",
             backdropTweak: { b in b.vignette = 0.45; b.brightness = 0.9 },
             look: { l in l.mood = 0.35; l.surface = .print; l.bend = .rigid; l.shadow = 0.45; l.depthOfField = 0.2; l.finish.grain = 0.16 }),
        Spec(scene: AssembleScene(summary: "The works fly in from depth, centre first, and settle into a contact sheet."),
             eyebrow: "Depth · converge · sheet", backdrop: "paper", palette: "sumi",
             backdropTweak: { b in b.accent = 0.85; b.vignette = 0.4 },
             look: { l in l.surface = .original; l.bend = .rigid; l.shadow = 0.55; l.depthOfField = 0.25; l.finish.grain = 0.2 }),
        Spec(scene: FocusScene(summary: "A strip of the works glides along, then zooms in on one at a time and back out."),
             eyebrow: "Strip · zoom · detail", backdrop: "paper", palette: "linen",
             backdropTweak: { b in b.accent = 0.2; b.vignette = 0.3 },
             look: { l in l.mood = 0.45; l.surface = .print; l.bend = .rigid; l.shadow = 0.45; l.depthOfField = 0; l.finish.grain = 0.15 }),
        Spec(scene: RailScene(summary: "One work at a time, flat at the centre, its neighbours tilting away above and below."),
             eyebrow: "Centre · tilt · depth", backdrop: "studio", palette: "gallery",
             backdropTweak: { b in b.scale = 0.35; b.vignette = 0.3 },
             look: { l in l.mood = 0.5; l.surface = .print; l.bend = .rigid; l.shadow = 0.6; l.depthOfField = 0.15; l.finish.grain = 0.14 }),
        Spec(scene: VortexScene(summary: "One work holds the centre while rings of the others orbit around it."),
             eyebrow: "Anchor · orbits · abundance", backdrop: "halo", palette: "ivory-ink",
             backdropTweak: { b in b.scale = 0.65; b.brightness = 0.7; b.vignette = 0.5 },
             look: { l in l.mood = 0.6; l.surface = .gloss; l.bend = .rigid; l.shadow = 0.5; l.depthOfField = 0.45; l.finish.grain = 0.16; l.finish.bloom = 0.2 }),
        Spec(scene: LanesScene(summary: "Three lanes of work rise at different speeds, each riding its own slow wave."),
             eyebrow: "Three lanes · waves · parallax", backdrop: "studio", palette: "graphite",
             backdropTweak: { b in b.scale = 0.5; b.vignette = 0.45 },
             look: { l in l.surface = .print; l.bend = .rigid; l.shadow = 0.6; l.depthOfField = 0.15; l.finish.grain = 0.16 }),
        Spec(scene: StackScene(id: "deck", name: "Deck", summary: "A neat pile. The top work is thrown in an arc and tucked back underneath."),
             eyebrow: "Pile · throw · tuck", backdrop: "mesh", palette: "glacier",
             backdropTweak: { b in b.accent = 0.2 },
             look: { l in l.surface = .print; l.bend = .paper; l.bendAmount = 0.3; l.shadow = 0.75; l.depthOfField = 0.1; l.finish.grain = 0.18 }),
        Spec(scene: ContactSheetScene(), eyebrow: "Overview · proof · registration", backdrop: "paper", palette: "sumi",
             backdropTweak: { b in b.accent = 0.85; b.vignette = 0.4 },
             look: { l in l.surface = .original; l.bend = .rigid; l.shadow = 0.5; l.depthOfField = 0; l.shutter = 0.3; l.finish.grain = 0.2 }),
        Spec(scene: CompareScene(), eyebrow: "Before · after · registered", backdrop: "studio", palette: "graphite",
             backdropTweak: { b in b.scale = 0.35 },
             look: { l in l.mood = 0.3; l.surface = .original; l.bend = .rigid; l.shadow = 0.6; l.depthOfField = 0; l.shutter = 0.3; l.finish.grain = 0.14 }),
        Spec(scene: OpeningScene(), eyebrow: "Title sequence · highlights · finale", backdrop: "rays", palette: "graphite",
             backdropTweak: { b in b.accent = 0.4; b.vignette = 0.45 },
             look: { l in l.mood = 0.35; l.surface = .print; l.bend = .card; l.shadow = 0.6; l.depthOfField = 0.2; l.finish.grain = 0.18; l.finish.bloom = 0.16 },
             pace: 0.56),
        Spec(scene: LoomScene(summary: "Works weave together from threads as they rise, and come apart into threads at the top."),
             eyebrow: "Threads · weave · unravel", backdrop: "paper", palette: "linen",
             backdropTweak: { b in b.accent = 0.3; b.vignette = 0.3 },
             look: { l in l.surface = .print; l.bend = .rigid; l.shadow = 0.3; l.depthOfField = 0; l.finish.grain = 0.15; l.finish.bloom = 0.05 }),
        Spec(scene: HangScene(), eyebrow: "Wires · pendulums · settle", backdrop: "studio", palette: "linen",
             backdropTweak: { b in b.scale = 0.25; b.detail = 0.5; b.vignette = 0.25 },
             look: { l in l.mood = 0.3; l.surface = .print; l.bend = .rigid; l.shadow = 0.6; l.shadowSoftness = 0.55; l.depthOfField = 0.0; l.finish.grain = 0.15 },
             pace: 0.54),
    ]

    /// Names that read better in the browser than the scene's own.
    static let names: [String: String] = ["drift": "Calm", "wall": "Tilted", "contact": "Marks"]

    static var entries: [SceneEntry] {
        specs.map { spec in
            let scene = spec.scene
            return SceneEntry(id: scene.id, name: names[scene.id] ?? scene.name, eyebrow: spec.eyebrow, summary: scene.summary,
                              make: { _ in scene },
                              apply: { p in
                                  p.dials = scene.defaults
                                  if let pace = spec.pace { p.dials.pace = pace }
                                  var b = BackdropCatalog.style(spec.backdrop).defaults
                                  b.palette = Palettes.named(spec.palette)
                                  spec.backdropTweak(&b)
                                  b.seed = p.backdrop.seed
                                  p.backdrop = b
                                  var look = StageLook()
                                  spec.look(&look)
                                  if look.drift == nil { look.cameraDrift = cameraDrift[scene.id] ?? 0.3 }
                                  p.look = look
                              })
        }
    }

    /// The browser, in sections.
    static var groups: [SceneGroup] {
        let e = Dictionary(uniqueKeysWithValues: entries.map { ($0.id, $0) })
        let one = "One at a time", walk = "Walk-through", moving = "In motion", table = "On the table"
        return [
            SceneGroup(single: e["vitrine"]!,
                       summary: "One work at a time, matted on a warm wall. The next rises into place.",
                       wideSummary: "One work at a time, matted in a warm room, then a calm exchange.",
                       symbol: "photo.artframe", section: one),
            SceneGroup(single: e["hang"]!,
                       summary: "Framed works on wires, one high, one low. Each swing settles.",
                       wideSummary: "Framed works on wires. A nudge runs along the row; each swing settles.",
                       symbol: "lanyardcard", section: one),
            SceneGroup(single: e["rail"]!,
                       summary: "One work at a time, flat at the centre, its neighbours tilting away above and below.",
                       wideSummary: "One work at a time, flat at the centre, its neighbours tilting away on either side.",
                       symbol: "rectangle.stack.badge.play", section: one),
            SceneGroup(single: e["focus"]!,
                       summary: "A strip of the works glides up, then zooms in on one at a time and back out.",
                       wideSummary: "A strip of the works glides along, then zooms in on one at a time and back out.",
                       symbol: "plus.magnifyingglass", section: one),
            SceneGroup(single: e["compare"]!,
                       summary: "Before and after in one frame, a divider sweeping between them.",
                       symbol: "rectangle.split.2x1", section: one),
            SceneGroup(single: e["corridor"]!,
                       summary: "Down a two-lane gallery: work comes in on one side, leaves on the other.",
                       symbol: "figure.walk", section: walk),
            SceneGroup(single: e["shelf"]!,
                       summary: "Matted prints on the ledges of a bookcase rising slowly past.",
                       wideSummary: "Matted prints on a wooden ledge, walking slowly past.",
                       symbol: "books.vertical", section: walk),
            SceneGroup(id: "wall", name: "Wall",
                       summary: "Everything as a wall: tilted and scrolling, or rising in three waving lanes.",
                       symbol: "square.grid.3x3", section: walk, members: [e["wall"]!, e["lanes"]!]),
            SceneGroup(id: "drift", name: "Flow",
                       summary: "A column of work rising up the screen: calm and continuous, or each work peeling flat as it arrives.",
                       wideSummary: "A line of work drifting across: calm and continuous, or each work peeling flat as it arrives.",
                       symbol: "arrow.up", wideSymbol: "arrow.right", section: moving, members: [e["drift"]!, e["cascade"]!]),
            SceneGroup(single: e["orbit"]!,
                       summary: "Works ride a turning wheel, pausing at the front one by one.",
                       wideSummary: "Works ride a turning ring, pausing at the front one by one.",
                       symbol: "arrow.clockwise", section: moving),
            SceneGroup(single: e["vortex"]!,
                       summary: "One work holds the centre while rings of the others orbit around it.",
                       symbol: "tornado", section: moving),
            SceneGroup(single: e["loom"]!,
                       summary: "Works weave together from threads as they rise, and come apart at the top.",
                       wideSummary: "Works weave together from threads as they cross, and come apart at the far edge.",
                       symbol: "line.3.horizontal.decrease", section: moving),
            SceneGroup(single: e["opening"]!,
                       summary: "A title sequence. Each highlight grows as the strip rises.",
                       wideSummary: "A title sequence. Each highlight grows as the strip runs.",
                       symbol: "play.rectangle", section: moving),
            SceneGroup(single: e["scatter"]!,
                       summary: "Prints arrive from every edge, lift one by one, then leave.",
                       symbol: "rectangle.3.offgrid", section: table),
            SceneGroup(single: e["hand"]!,
                       summary: "A dealt hand. Each work in turn is drawn up and shown.",
                       symbol: "suit.spade", section: table),
            SceneGroup(single: e["deck"]!,
                       summary: "A neat pile. The top work is tossed up and tucked back under.",
                       wideSummary: "A neat pile. The top work is thrown in an arc and tucked back under.",
                       symbol: "rectangle.stack", section: table),
            SceneGroup(single: e["story"]!,
                       summary: "The set on a sheet, fanned into a hand, each work shown, then home.",
                       symbol: "book", section: table),
            SceneGroup(id: "contact", name: "Contact",
                       summary: "Every work on one sheet: crop marks visit each, the sheet assembles from depth, or it unrolls into a turning ring.",
                       symbol: "viewfinder", section: table, members: [e["contact"]!, e["assemble"]!, e["unroll"]!]),
        ]
    }

    /// How much each Scene's camera drifts. None where it must hold still:
    /// Corridor's fixed camera, the Wall's own pan, Compare's registration.
    static let cameraDrift: [String: Float] = [
        "drift": 0.4, "corridor": 0, "vitrine": 0.5, "shelf": 0.3, "orbit": 0.35, "hand": 0.3, "scatter": 0.35, "story": 0.3,
        "wall": 0, "deck": 0.3, "contact": 0.25, "compare": 0, "opening": 0.25, "hang": 0.4, "loom": 0.15, "lanes": 0.2, "cascade": 0.2, "vortex": 0.3, "rail": 0.25, "assemble": 0.2, "focus": 0, "unroll": 0.15,
    ]

    static let documentType = UTType(exportedAs: "dog.pitch.galileo2.gallery", conformingTo: .package)

    static var configuration: StudioConfiguration {
        StudioConfiguration(appID: "galileo", appName: "Galileo", documentType: documentType,
                            galleryTitle: "Scene", gallerySymbol: "square.stack.3d.up",
                            groups: groups, defaultScene: "vitrine",
                            emptyTitle: "Drop your work",
                            emptyDetail: "Images, clips or a PDF. Galileo stages them in a moving gallery you can loop anywhere.",
                            itemNoun: "work", defaultFormat: .reel, sampleCount: 7)
    }
}
