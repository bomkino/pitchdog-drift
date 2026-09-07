import XCTest
import DriftCore
@testable import DriftNative

final class TransportContinuityTests:XCTestCase {
    private func project()throws->DriftProject{
        var p=try DriftProject(creative:CreativeCatalog.load().defaults)
        p.direction.contentPaced=false;p.direction.bodyMilliseconds=10000
        p.direction.entry.enabled=false;p.direction.exit.enabled=false
        return p
    }
    @MainActor func testAppearanceUpdatesDoNotPauseResetEpochOrLoseFractionalFrames()async throws{
        var p=try project();let transport=Transport(plan:try FramePlan(project:p))
        transport.seek(30);let epoch=transport.seekEpoch
        var interrupted=false;transport.didTick={_,playing in if !playing{interrupted=true}}
        transport.play();defer{transport.pause()}
        for i in 0..<12{
            p.creative.atmosphere.grain=Double(i)/20
            transport.update(try FramePlan(project:p))
            XCTAssertTrue(transport.playing);XCTAssertEqual(transport.seekEpoch,epoch)
            try await Task.sleep(nanoseconds:10_000_000)
        }
        XCTAssertFalse(interrupted)
        XCTAssertGreaterThanOrEqual(transport.frame,32,"Frequent appearance edits must not starve the clock of partial frames.")
    }
    @MainActor func testRateChangePreservesInspectedTimeAndPausedState()async throws{
        var p=try project();let transport=Transport(plan:try FramePlan(project:p))
        transport.seek(74);let seconds=transport.seconds,epoch=transport.seekEpoch
        p.output.rate=try OutputRate(60);transport.update(try FramePlan(project:p))
        XCTAssertFalse(transport.playing);XCTAssertEqual(transport.frame,148)
        XCTAssertEqual(transport.seconds,seconds,accuracy:0.000001)
        XCTAssertEqual(transport.seekEpoch,epoch+1)
        p.output.rate=try OutputRate(24000,1001);transport.update(try FramePlan(project:p))
        XCTAssertLessThanOrEqual(abs(transport.seconds-seconds),1001.0/24000)
    }
    @MainActor func testDifferentDocumentCannotInheritPlaybackOrInspectedFrame()async throws{
        let transport=Transport(plan:try FramePlan(project:project()))
        transport.seek(15);transport.play()
        transport.update(try FramePlan(project:project()))
        XCTAssertFalse(transport.playing);XCTAssertEqual(transport.frame,0)
    }
}
