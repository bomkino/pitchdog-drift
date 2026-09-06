import XCTest
@testable import DriftCore

final class DirectingTests: XCTestCase {
    func testExactPairsAndDimensionsNeverRoundToNearbyRatio() throws {
        let expected = try ExactRatio(322, 135)
        for input in ["2576x1080", "2576 × 1080", "2576:1080", "25.76:10.80"] {
            XCTAssertEqual(try ExactRatio(pair: input), expected)
        }
        XCTAssertNotEqual(try ExactRatio(pair: "25.67:10.80"), expected)
        XCTAssertNotEqual(try ExactRatio(pair: "26:11"), expected)
        XCTAssertEqual(try CanvasSize(pair: "2576 × 1080"), .wideDeck)
        XCTAssertThrowsError(try CanvasSize(pair: "25.76:10.80"))
        for input in ["0:1", "-1:9", "1e2:3", "NaN:2", "2:", "1.2.3:4", "1,000:2", "999999999999999999999999:1"] {
            XCTAssertThrowsError(try ExactRatio(pair: input), input)
        }
        let odd = try CanvasSize(width: 2575, height: 1080)
        XCTAssertThrowsError(try odd.validateH264())
        XCTAssertEqual(odd.width, 2575)
        XCTAssertThrowsError(try JSONDecoder().decode(CanvasSize.self, from: Data("{\"width\":0,\"height\":1080}".utf8)))
        XCTAssertThrowsError(try JSONDecoder().decode(ExactRatio.self, from: Data("{\"numerator\":3,\"denominator\":0}".utf8)))
    }

    func testThreePassesWithSpotlightAndOneClosingHave1122Frames() throws {
        let rate = try OutputRate()
        let spotlight = try CueTiming(id: "s", slideID: "slide-a", baseFrame: 150)
        let closing = try CueTiming(id: "end", slideID: "slide-b", baseFrame: 899)
        let plan = try PresentationSchedule(rate: rate, baseFrameCount: 900, spotlights: [spotlight], closing: closing)
        XCTAssertEqual(plan.totalFrames, 1122)
        XCTAssertEqual(rate.seconds(frame: plan.totalFrames), 37.4)
        XCTAssertEqual(plan.cues.filter(\.closing).count, 1)
        let cue = try XCTUnwrap(plan.cues.first)
        XCTAssertEqual(cue.endFrame - cue.startFrame, 118)
        XCTAssertEqual(try plan.sample(frame: cue.startFrame).cueWeight, 0)
        XCTAssertEqual(try plan.sample(frame: cue.holdStartFrame - 1).cueWeight, 1)
        XCTAssertEqual(try plan.sample(frame: cue.holdEndFrame - 1).baseFrame, 150)
        XCTAssertEqual(try plan.sample(frame: cue.endFrame - 1).cueWeight, 0)
        XCTAssertEqual(try plan.sample(frame: cue.endFrame).baseFrame, 150)
        XCTAssertEqual(try plan.sample(frame: cue.endFrame + 1).baseFrame, 151)
        let end = try XCTUnwrap(plan.cues.last)
        XCTAssertEqual(end.startFrame, 1018)
        XCTAssertEqual(try plan.sample(frame: end.startFrame).baseFrame, 899)
        XCTAssertEqual(try plan.sample(frame: 1121).cueWeight, 1)
        XCTAssertThrowsError(try plan.sample(frame: 1122))
        var last: Int64 = -1
        for frame in 0..<plan.totalFrames {
            let sample = try plan.sample(frame: frame)
            XCTAssertGreaterThanOrEqual(sample.baseFrame, last)
            XCTAssertLessThan(sample.baseFrame, 900)
            last = sample.baseFrame
        }
    }

    func testLoopRetainsOnlyNonterminalCuesAndTieOrderIsDeterministic() throws {
        let a = try CueTiming(id: "a", slideID: "a", baseFrame: 0)
        let b = try CueTiming(id: "b", slideID: "b", baseFrame: 0)
        let end = try CueTiming(id: "end", slideID: "z", baseFrame: 299)
        let p = try PresentationSchedule(rate: OutputRate(), baseFrameCount: 300, spotlights: [b,a], closing: end, loop: true)
        XCTAssertEqual(p.cues.map(\.id), ["a", "b"])
        XCTAssertEqual(p.totalFrames, 536)
        XCTAssertEqual(try p.sample(frame: p.cues[1].endFrame).baseFrame, 0)
        XCTAssertEqual(try p.sample(frame: p.totalFrames - 1).baseFrame, 299)
        XCTAssertThrowsError(try PresentationSchedule(rate: OutputRate(), baseFrameCount: 1, spotlights: [end]))
        XCTAssertThrowsError(try PresentationSchedule(rate: OutputRate(), baseFrameCount: 300, spotlights: [a,a]))
    }

    func testFractionalRateCeilingAndOverflowRejection() throws {
        let r = try OutputRate(24000, 1001)
        XCTAssertEqual(try r.frames(milliseconds: 450), 11)
        XCTAssertEqual(try r.frames(milliseconds: 3000), 72)
        XCTAssertThrowsError(try r.frames(milliseconds: Int64.max))
        XCTAssertThrowsError(try r.frames(milliseconds: -1))
    }
}
