import Foundation
import RenderCore
import simd

// MARK: - World conventions
//
// World units: the output canvas is 1 unit tall and `aspect` units wide,
// centred on the origin, lying in the z = 0 plane. +x right, +y up, +z towards
// the camera. The default camera sits on +z at the distance where z = 0 maps
// exactly onto the canvas, so a card at z = 0 with height 0.5 fills half the
// frame height.

/// How media fills its card.
public enum Fit: String, Codable, Sendable, CaseIterable {
    /// Fill the card, cropping the overflow around the focal point.
    case fill
    /// Show all of the media, letterboxed inside the card.
    case fit
}

/// One card to draw this frame.
public struct CardPose: Sendable {
    /// Index into the frame's texture list.
    public var media: Int
    /// Stable identity of the occurrence this card presents.
    public var occurrence: Int
    public var position: SIMD3<Float>
    /// Euler rotation in radians, applied yaw (y), then pitch (x), then roll (z).
    public var rotation: SIMD3<Float>
    /// Width and height in world units.
    public var size: SIMD2<Float>
    public var opacity: Float = 1
    /// Cylindrical curl, −1…1 (positive curls the side edges towards the camera).
    public var curl: Float = 0
    /// Travelling fold amplitude, 0…1.
    public var fold: Float = 0
    /// Phase of the travelling folds. Advance it by whole turns over a loop
    /// (2π times an integer), or the folds jump where the loop joins.
    public var foldPhase: Float = 0
    /// Corner radius as a fraction of the shorter side.
    public var corner: Float = 0.045
    /// Multiplies the shadow this card casts.
    public var shadow: Float = 1
    /// Additional brightness (e.g. focus emphasis), 0 = none.
    public var glow: Float = 0
    /// Extra defocus for this card, in addition to depth of field.
    public var blur: Float = 0
    public var fit: Fit = .fill
    public var focal: SIMD2<Float> = SIMD2(0.5, 0.5)
    /// Media aspect (w / h), used for fill/fit mapping.
    public var mediaAspect: Float = 16.0 / 9.0
    /// Multiplies the card's colour and alpha (linear RGB).
    public var color: SIMD4<Float> = SIMD4(1, 1, 1, 1)
    /// Draws a plain surface in `color` instead of media (mats, ledges, wires).
    public var solid: Bool = false
    /// Horizontal reveal, 0…1: only the part left of this fraction is drawn (wipes).
    public var reveal: Float = 1
    /// The part of a parent card this card shows, as (u0, v0, u1, v1) in the
    /// parent's 0…1 coordinates (v down). A card cut into bands or strips draws
    /// each piece as its own card with the slice it covers: the media mapping,
    /// rounded corners and shadow stay those of the whole card.
    public var crop: SIMD4<Float> = SIMD4(0, 0, 1, 1)
    /// A loose thread of a card (core 0…1, amount 0…1, side shade, core glint):
    /// with amount above 0 the band narrows towards its core with soft edges,
    /// across its shorter side. Zero amount draws it whole, so bands that tile
    /// a card stay gapless until they come apart.
    public var band: SIMD4<Float> = SIMD4(1, 0, 0, 0)
    /// Stacking group. Higher layers draw over lower ones regardless of depth, so a
    /// scene can decide who passes in front. Change it only while the card overlaps
    /// nothing, or the change shows as a pop.
    public var layer: Float = 0

    /// A plain surface such as a mat, ledge or wire. Colour is sRGB.
    public static func solid(_ rgb: RGB, position: SIMD3<Float>, size: SIMD2<Float>, rotation: SIMD3<Float> = .zero,
                             corner: Float = 0.02, shadow: Float = 1) -> CardPose {
        var c = CardPose(media: 0, occurrence: -1, position: position, rotation: rotation, size: size)
        c.solid = true
        c.color = SIMD4(rgb.linear, 1)
        c.corner = corner
        c.shadow = shadow
        return c
    }

    public init(media: Int, occurrence: Int, position: SIMD3<Float>, rotation: SIMD3<Float> = .zero,
                size: SIMD2<Float>, opacity: Float = 1) {
        self.media = media
        self.occurrence = occurrence
        self.position = position
        self.rotation = rotation
        self.size = size
        self.opacity = opacity
    }
}

/// The virtual camera. Defaults frame the canvas exactly.
public struct StageCamera: Sendable {
    /// Vertical field of view in degrees.
    public var fov: Float = 35
    /// Offset of the eye from its default position.
    public var offset: SIMD3<Float> = .zero
    /// A small extra eye offset from a drifting camera. It moves the view but
    /// not the drawing order, so cards level with each other never swap as it
    /// drifts (a swap would move a shadow onto a neighbour in one frame).
    public var sway: SIMD3<Float> = .zero
    /// Point looked at.
    public var target: SIMD3<Float> = .zero
    /// Roll around the view axis, radians.
    public var roll: Float = 0
    /// Distance (from the eye) that is perfectly sharp, in world units.
    /// `nil` focuses on the target.
    public var focusDistance: Float? = nil

    public init() {}

    public static func distance(fov: Float) -> Float {
        0.5 / tanf(fov * .pi / 360)
    }
}

/// Everything a scene decides for one instant.
public struct StageFrame: Sendable {
    public var camera = StageCamera()
    public var cards: [CardPose] = []
    /// Depth of the surface that receives shadows (world z).
    public var groundZ: Float = -0.35
    /// True when that surface is a wall that stays put, such as a gallery's;
    /// otherwise it follows the deepest card, so no shadow lands in front of one.
    public var fixedGround = false
    /// Which works set the backdrop's mood, and how strongly, when the scene
    /// knows better than the cards on screen (a work turning over in place).
    /// Nil leaves it to the cards nearest the centre.
    public var moodHints: [MoodHint]? = nil
    /// Strength of a mirror floor under the cards (0 = none).
    public var reflection: Float = 0
    /// World y of the reflecting floor.
    public var floorY: Float = -0.5
    /// Whether a card's shadow may fall on the cards behind it. Right for piles,
    /// whose stacking never changes; scenes whose cards pass one another in depth
    /// turn it off, or a shadow jumps between cards when they trade places.
    public var shadowsOnCards = true

    public init() {}
}

// MARK: - Look

/// How card faces respond to light. `original` never touches the artwork.
public enum SurfaceKind: String, Codable, Sendable, CaseIterable, Identifiable {
    case original
    case print
    case gloss
    case satin
    case foil

    public var id: String { rawValue }
    public var title: String {
        switch self {
        case .original: return "Original"
        case .print: return "Print"
        case .gloss: return "Gloss"
        case .satin: return "Satin"
        case .foil: return "Foil"
        }
    }
    public var summary: String {
        switch self {
        case .original: return "Artwork exactly as supplied."
        case .print: return "Matte stock catching soft light."
        case .gloss: return "A glossy print with a travelling highlight."
        case .satin: return "Woven cloth: a sheen across the weave, shade in the folds."
        case .foil: return "A thin film over the light parts of the print, its colour shifting as the card tilts."
        }
    }
}

/// How cards bend as they travel.
public enum BendKind: String, Codable, Sendable, CaseIterable, Identifiable {
    case rigid
    case card
    case paper
    case silk

    public var id: String { rawValue }
    public var title: String {
        switch self {
        case .rigid: return "Rigid"
        case .card: return "Card"
        case .paper: return "Paper"
        case .silk: return "Silk"
        }
    }
}

/// The finishing look shared by every scene in an app.
public struct StageLook: Codable, Hashable, Sendable {
    public var surface: SurfaceKind = .original
    public var bend: BendKind = .card
    /// 0…1 multiplies the scene's bending.
    public var bendAmount: Float = 0.6
    /// Light direction: azimuth degrees (0 = from the right, 90 = from above).
    public var lightAzimuth: Float = 115
    /// Elevation of the key light, degrees above the canvas plane.
    public var lightElevation: Float = 55
    /// 0…1 strength of cast shadows.
    public var shadow: Float = 0.55
    /// 0…1 softness of cast shadows.
    public var shadowSoftness: Float = 0.55
    /// 0…1 corner rounding (scaled per card).
    public var corners: Float = 0.35
    /// 0…1 depth-of-field strength (0 = everything sharp).
    public var depthOfField: Float = 0.25
    /// Motion blur shutter as a fraction of the frame interval (0 = off, 0.5 = 180°).
    public var shutter: Float = 0.5
    /// Film finishing.
    public var finish = FinishSettings()
    /// Card thickness, 0…1; stored optionally so older documents still open.
    public var edges: Float?
    public var edge: Float {
        get { edges ?? 1 }
        set { edges = newValue }
    }
    /// A slow camera drift, 0…1, periodic with the loop; stored optionally.
    public var drift: Float?
    public var cameraDrift: Float {
        get { drift ?? 0 }
        set { drift = newValue }
    }
    /// How far the backdrop's colours lean towards the work at the centre, 0…1;
    /// stored optionally so older documents still open.
    public var moodAmount: Float?
    public var mood: Float {
        get { moodAmount ?? 0 }
        set { moodAmount = newValue }
    }

    public init() {}
}
