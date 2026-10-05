import Foundation
import RenderCore
import simd

/// A work a scene names as setting the mood, with how much it counts.
public struct MoodHint: Sendable {
    public var media: Int
    public var weight: Float
    public init(media: Int, weight: Float) {
        self.media = media
        self.weight = weight
    }
}

/// Palette-linked atmosphere (carousel research §1.7 and §6 L1): the backdrop's
/// colours lean towards the works nearest the centre of the frame, so the room
/// takes on the mood of what is being shown. Only hue and chroma move, blended
/// in OKLab; every colour keeps the backdrop's own lightness, so the
/// background never brightens past the work. Each card counts by its visible
/// area (a card cut into bands counts once; a card seen edge-on not at all),
/// and by a Gaussian of its distance from the centre, so the colour changes
/// as smoothly as the cards move. A scene can name the works itself with
/// `StageFrame.moodHints`, for a work that changes in place.
public enum Mood {
    public static func palette(base: Palette, frame: StageFrame, itemPalettes: [Palette?], amount: Float) -> Palette {
        guard amount > 0.001, !itemPalettes.isEmpty else { return base }
        let slots = base.sorted
        guard slots.count >= 2 else { return base }
        let sigma: Float = 0.33
        var sums = [SIMD2<Float>](repeating: .zero, count: slots.count)
        var total: Float = 0
        func add(_ media: Int, _ w: Float) {
            guard w > 1e-6, media >= 0, media < itemPalettes.count, let p = itemPalettes[media] else { return }
            let mine = p.sorted
            guard !mine.isEmpty else { return }
            for j in 0..<slots.count {
                let k = Int((Float(j) / Float(slots.count - 1) * Float(mine.count - 1)).rounded())
                let lab = mine[k].oklab
                sums[j] += SIMD2(lab.y, lab.z) * w
            }
            total += w
        }
        var presence: Float = 1
        if let hints = frame.moodHints {
            for h in hints { add(h.media, h.weight) }
            // A named work without a palette (a missing file, a mostly clear
            // picture) still holds its share, so the lean eases in and out.
            let named = hints.reduce(0) { $0 + max($1.weight, 0) }
            presence = named > 1e-6 ? min(1, total / named) : 0
        } else {
            for card in frame.cards where !card.solid && card.opacity > 0.02 {
                let d = simd_length(SIMD2(card.position.x, card.position.y))
                // Only a face turned towards the eye counts: the back of a ring, or a
                // card turned away, shows no work.
                let facing = max(0, cosf(card.rotation.x) * cosf(card.rotation.y))
                add(card.media, expf(-(d / sigma) * (d / sigma)) * card.opacity * card.size.x * card.size.y * facing)
            }
            // How far the room leans also follows how much work is near the centre.
            presence = min(1, total / 0.06)
        }
        guard total > 1e-6 else { return base }
        let t = amount * presence
        let colors = slots.enumerated().map { j, c -> RGB in
            let lab = c.oklab
            let target = sums[j] / total
            let ab = SIMD2(lab.y, lab.z) + (target - SIMD2(lab.y, lab.z)) * t
            return RGB(linear: simd_max(ColorMath.oklabToLinear(SIMD3(lab.x, ab.x, ab.y)), SIMD3(repeating: 0)))
        }
        return Palette(id: base.id, name: base.name, colors: colors)
    }
}
