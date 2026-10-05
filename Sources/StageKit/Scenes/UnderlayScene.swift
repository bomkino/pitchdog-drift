import Foundation
import simd

/// A backdrop on its own, optionally with one card on top to judge it as an underlay.
public struct UnderlayScene: StageScene {
    public let id = "underlay"
    public let name = "Backdrop"
    public let summary = "The background alone."
    public var dials: [(DialKey, String)] { [] }
    public var defaults = SceneDials()
    public var loop: Double
    public var showCard: Bool

    public init(loop: Double, showCard: Bool) {
        self.loop = loop
        self.showCard = showCard
    }

    public func loopDuration(_ ctx: SceneContext) -> Double { loop }

    public func frame(at t: Double, _ ctx: SceneContext) -> StageFrame {
        var f = StageFrame()
        guard showCard, let item = ctx.items.first else { return f }
        let h: Float = ctx.isPortrait ? 0.24 : 0.46
        let size = SIMD2(h * item.aspect, h)
        let fit = size.x > ctx.aspect * 0.7 ? size * (ctx.aspect * 0.7 / size.x) : size
        var c = CardPose(media: item.media, occurrence: 0, position: SIMD3(0, 0, 0.06), size: fit)
        c.mediaAspect = item.aspect
        c.corner = 0.03
        f.cards = [c]
        f.groundZ = -0.1
        return f
    }
}
