import XCTest
@testable import DriftCore

final class FinalBoundaryTests:XCTestCase {
    private func project()throws->DriftProject{
        var p=try DriftProject(creative:CreativeCatalog.load().defaults)
        let source=try Original(name:"Synthetic.png",sha256:String(repeating:"a",count:64),byteLength:100,kind:.image,subtype:"png",width:320,height:256,durationNanoseconds:0,hasAlpha:false)
        p.assets[source.id]=source;p.slides=[Slide(assetID:source.id)]
        return p
    }
    func testClosingOnlyStartsFullyPresentedAndContainsOnlyItsHold()throws{
        var p=try project();p.slides[0].inSequence=false
        p.direction.mode = .repeatCount;p.direction.repeats=3
        p.closing=Closing(slideID:p.slides[0].id);p.closing?.holdMilliseconds=1000
        let plan=try FramePlan(project:p)
        XCTAssertEqual(plan.schedule.totalFrames,30)
        XCTAssertEqual(plan.schedule.cues.count,1)
        for frame in [Int64(0),29]{
            let value=try plan.evaluate(frame:frame)
            XCTAssertEqual(value.cards.count,1);let pose=try XCTUnwrap(value.cards.first)
            XCTAssertEqual(pose.opacity,1);XCTAssertEqual(pose.x,0);XCTAssertEqual(pose.y,0)
            XCTAssertEqual(pose.projectionMix,1)
        }
        p.direction.mode = .loop
        XCTAssertTrue(try FramePlan(project:p).schedule.cues.isEmpty)
        XCTAssertNotNil(p.closing,"Loop retains the authored finite Closing.")
    }
    func testAuthoredProfilesKeepEndpointsMonotoneAndConsumeTheirControls()throws{
        let p=try project();var performance=p.creative.motion.performance,character=p.creative.motion.character
        performance.runway=1;performance.weight=0.8;performance.release=0.6;character.amount=1
        var middle:[Double]=[]
        for kind in ["direct","weighted","spring","drift"]{
            character.id=kind;var previous = -1.0
            for i in 0...1000{
                let v=AuthoredMotion.profile(Double(i)/1000,performance:performance,character:character,seamless:false)
                XCTAssertGreaterThanOrEqual(v.distance+1e-12,previous);XCTAssertGreaterThanOrEqual(v.velocity,-1e-10)
                XCTAssertTrue(v.acceleration.isFinite);previous=v.distance
                if i==0{XCTAssertEqual(v.distance,0,accuracy:1e-12)}
                if i==1000{XCTAssertEqual(v.distance,1,accuracy:1e-12)}
            }
            middle.append(AuthoredMotion.profile(0.2,performance:performance,character:character,seamless:false).distance)
        }
        XCTAssertEqual(Set(middle).count,4)
        character.id="direct"
        let before=AuthoredMotion.profile(0.1,performance:performance,character:character,seamless:false)
        performance.weight=0
        XCTAssertNotEqual(before,AuthoredMotion.profile(0.1,performance:performance,character:character,seamless:false))
        for kind in ["direct","weighted","spring","drift"]{
            character.id=kind
            let first=AuthoredMotion.profile(0,performance:performance,character:character,seamless:true)
            let last=AuthoredMotion.profile(1,performance:performance,character:character,seamless:true)
            XCTAssertEqual(first.velocity,last.velocity,accuracy:1e-12);XCTAssertEqual(first.acceleration,last.acceleration,accuracy:1e-12)
        }
    }
}
