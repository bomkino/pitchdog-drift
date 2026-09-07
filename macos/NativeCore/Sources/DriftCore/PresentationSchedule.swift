import Foundation

public struct OutputRate: Equatable, Hashable, Codable, Sendable {
    public let numerator: Int64
    public let denominator: Int64
    public init(_ numerator: Int64 = 30, _ denominator: Int64 = 1) throws {
        let ratio = try ExactRatio(numerator, denominator)
        guard ratio.value >= 1, ratio.value <= 120,
              ratio.numerator <= 120_000, ratio.denominator <= 1001 else {
            throw DriftCoreError.invalid("The frame rate is unsupported.")
        }
        self.numerator = ratio.numerator; self.denominator = ratio.denominator
    }
    public func seconds(frame: Int64) -> Double { Double(frame) * Double(denominator) / Double(numerator) }
    public func frames(milliseconds: Int64) throws -> Int64 {
        guard milliseconds >= 0 else { throw DriftCoreError.invalid("Time must not be negative.") }
        let divisor = try checkedMultiply(1000, denominator)
        let scaled = try checkedMultiply(milliseconds, numerator)
        // Ceiling without adding divisor - 1 to a potentially large integer.
        return try checkedAdd(scaled / divisor, scaled % divisor == 0 ? 0 : 1)
    }
    private enum CodingKeys: String, CodingKey { case numerator, denominator }
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(c.decode(Int64.self, forKey: .numerator), c.decode(Int64.self, forKey: .denominator))
    }
}

public struct CueTiming: Equatable, Sendable {
    public let id: String
    public let slideID: String
    public let baseFrame: Int64
    public let holdMilliseconds: Int64
    public let transitionMilliseconds: Int64
    public init(id: String, slideID: String, baseFrame: Int64,
                holdMilliseconds: Int64 = 3000, transitionMilliseconds: Int64 = 450) throws {
        guard !id.isEmpty, id.count <= 200, !slideID.isEmpty, slideID.count <= 200,
              baseFrame >= 0, (250...60_000).contains(holdMilliseconds),
              (100...5000).contains(transitionMilliseconds) else {
            throw DriftCoreError.invalid("The cue identity, anchor or duration is invalid.")
        }
        self.id = id; self.slideID = slideID; self.baseFrame = baseFrame
        self.holdMilliseconds = holdMilliseconds; self.transitionMilliseconds = transitionMilliseconds
    }
}

public struct ScheduledCue: Equatable, Sendable {
    public let id: String
    public let slideID: String
    public let baseFrame: Int64
    public let startFrame: Int64
    public let transitionFrames: Int64
    public let holdFrames: Int64
    public let closing: Bool
    public var holdStartFrame: Int64 { startFrame + transitionFrames }
    public var holdEndFrame: Int64 { holdStartFrame + holdFrames }
    public var endFrame: Int64 { holdEndFrame + (closing ? 0 : transitionFrames) }
    public func weight(at frame: Int64) -> Double {
        let offset = frame - startFrame
        let t: Double
        if offset < transitionFrames { t = Double(max(0, offset)) / Double(transitionFrames - 1) }
        else if offset < transitionFrames + holdFrames || closing { t = 1 }
        else { t = 1 - Double(offset - transitionFrames - holdFrames) / Double(transitionFrames - 1) }
        let x = min(1, max(0, t))
        return x*x*x*(x*(x*6 - 15) + 10)
    }
}

public struct PresentationSample: Equatable, Sendable {
    public let outputFrame: Int64
    public let baseFrame: Int64
    public let cue: ScheduledCue?
    public let cueWeight: Double
}

/// Inserts cues into a previously evaluated base route; never changes that route's
/// timing or generates a cue for each rendered mesh. Closing is global, not cyclic.
public struct PresentationSchedule: Sendable {
    public let rate: OutputRate
    public let baseFrameCount: Int64
    public let totalFrames: Int64
    public let cues: [ScheduledCue]
    public init(rate: OutputRate, baseFrameCount: Int64, spotlights: [CueTiming],
                closing: CueTiming? = nil, loop: Bool = false, closingOnly:Bool = false) throws {
        guard baseFrameCount >= 1, baseFrameCount <= 10_000_000, spotlights.count <= 512,
              Set(spotlights.map(\.id)).count == spotlights.count,
              spotlights.allSatisfy({ $0.baseFrame < baseFrameCount }),
              closing == nil || !spotlights.contains(where: { $0.id == closing?.id }) else {
            throw DriftCoreError.invalid("The base route or cue anchors are invalid.")
        }
        self.rate = rate; self.baseFrameCount = baseFrameCount
        if closingOnly {
            guard let closing,!loop,spotlights.isEmpty else{throw DriftCoreError.invalid("A Closing-only presentation cannot contain a hidden route or Spotlight.")}
            let hold=try rate.frames(milliseconds:closing.holdMilliseconds)
            self.cues=[ScheduledCue(id:closing.id,slideID:closing.slideID,baseFrame:0,startFrame:0,transitionFrames:0,holdFrames:hold,closing:true)]
            self.totalFrames=hold;return
        }
        var scheduled: [ScheduledCue] = [], inserted: Int64 = 0
        for cue in spotlights.sorted(by: { $0.baseFrame == $1.baseFrame ? $0.id < $1.id : $0.baseFrame < $1.baseFrame }) {
            let entry = max(2, try rate.frames(milliseconds: cue.transitionMilliseconds))
            let hold = try rate.frames(milliseconds: cue.holdMilliseconds)
            let start = try checkedAdd(cue.baseFrame, inserted)
            scheduled.append(ScheduledCue(id: cue.id, slideID: cue.slideID, baseFrame: cue.baseFrame,
                startFrame: start, transitionFrames: entry, holdFrames: hold, closing: false))
            inserted = try checkedAdd(inserted, checkedAdd(checkedMultiply(entry, 2), hold))
        }
        var total = try checkedAdd(baseFrameCount, inserted)
        if let cue = closing, !loop {
            let entry = max(2, try rate.frames(milliseconds: cue.transitionMilliseconds))
            let hold = try rate.frames(milliseconds: cue.holdMilliseconds)
            scheduled.append(ScheduledCue(id: cue.id, slideID: cue.slideID, baseFrame: baseFrameCount - 1,
                startFrame: total, transitionFrames: entry, holdFrames: hold, closing: true))
            total = try checkedAdd(total, checkedAdd(entry, hold))
        }
        guard total <= 10_000_000 else { throw DriftCoreError.invalid("The presentation exceeds the frame budget.") }
        self.totalFrames = total; self.cues = scheduled
    }
    public func sample(frame: Int64) throws -> PresentationSample {
        guard frame >= 0, frame < totalFrames else { throw DriftCoreError.invalid("Frame is outside the presentation.") }
        // Sorted immutable intervals; no scan of media or wall-clock dependencies.
        var low = 0, high = cues.count
        while low < high {
            let mid = (low + high) / 2
            if cues[mid].startFrame <= frame { low = mid + 1 } else { high = mid }
        }
        if low > 0 {
            let cue = cues[low - 1]
            if frame < cue.endFrame {
                return PresentationSample(outputFrame: frame, baseFrame: cue.baseFrame, cue: cue, cueWeight: cue.weight(at: frame))
            }
            let inserted = cue.endFrame - cue.baseFrame
            return PresentationSample(outputFrame: frame, baseFrame: frame - inserted, cue: nil, cueWeight: 0)
        }
        return PresentationSample(outputFrame: frame, baseFrame: frame, cue: nil, cueWeight: 0)
    }
}
