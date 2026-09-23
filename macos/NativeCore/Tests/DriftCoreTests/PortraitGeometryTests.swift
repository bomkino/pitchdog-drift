import XCTest
@testable import DriftCore

final class PortraitGeometryTests:XCTestCase {
    private func fixture()throws->DriftProject {
        var p=try DriftProject(creative:CreativeCatalog.load().defaults)
        p.direction.entry.enabled=false;p.direction.exit.enabled=false
        p.creative.motion.path.edgeFade=0
        for (i,size) in [(2576,1080),(1080,1920),(1080,1080)].enumerated(){
            let a=try Original(name:"Slide\(i).png",sha256:String(repeating:String(i+1),count:64),byteLength:100,kind:.image,subtype:"png",width:size.0,height:size.1)
            p.assets[a.id]=a;p.slides.append(Slide(assetID:a.id,id:"slide-\(i)"))
        }
        return p
    }
    func testNewDefaultsSeparatePortraitOutputFromWideSlides()throws {
        let p=try fixture()
        XCTAssertEqual(p.canvas,.portrait)
        XCTAssertEqual(p.creative.motion.transport.axis,"vertical")
        XCTAssertEqual(p.creative.motion.path.gap,0.06)
        XCTAssertTrue(p.slides.allSatisfy{$0.framePolicy == .ratio && $0.aspect==CanvasSize.wideDeck.ratio})
        XCTAssertEqual(try DriftProject.decode(p.encoded()),p)
    }
    func testZeroGapIsActualEdgeToEdgeForBothAxesMixedRatiosAndOffsets()throws {
        for axis in ["vertical","horizontal"]{
            var p=try fixture();p.creative.motion.transport.axis=axis;p.creative.motion.path.gap=0
            for i in p.slides.indices{p.slides[i].framePolicy = .source}
            p.slides[1].scaleOffset=0.25;p.slides[2].scaleOffset = -0.3
            let plan=try FramePlan(project:p),layout=SlideTrackLayout(project:p,slides:p.slides)
            let poses=plan.movingPoses(baseSeconds:0)
            let first=try XCTUnwrap(poses.first{$0.slot==0}),second=try XCTUnwrap(poses.first{$0.slot==1})
            let separation=axis=="vertical" ? abs(second.y-first.y):abs(second.x-first.x)
            let halfExtents=axis=="vertical" ? (first.height+second.height)/2:(first.width+second.width)/2
            XCTAssertEqual(separation,halfExtents,accuracy:1e-8)
            // Last-to-first seam uses the two adjacent extents, not a global frame.
            XCTAssertEqual(layout.cycleLength-layout.centers.last!, (layout.extents.last!+layout.extents[0])/2,accuracy:1e-8)
            for i in p.slides.indices{
                XCTAssertEqual(layout.displacement(visits:Double(i),repetitions:16),layout.centers[i],accuracy:1e-8)
            }
        }
    }
    func testPositiveGapAndStaleCreativeAspectDoNotReservePortraitSpace()throws {
        var p=try fixture();p.creative.card.aspectWidth=10.8;p.creative.card.aspectHeight=19.2
        let poses=try FramePlan(project:p).movingPoses(baseSeconds:0)
        let a=try XCTUnwrap(poses.first{$0.slot==0}),b=try XCTUnwrap(poses.first{$0.slot==1})
        XCTAssertEqual(abs(a.y-b.y),(a.height+b.height)/2*1.06,accuracy:1e-8)
        XCTAssertEqual(a.width/a.height,2576.0/1080,accuracy:1e-12)
        XCTAssertGreaterThan(a.opacity,0.99)
        p.slides[0].aspect=try ExactRatio(16,9)
        let edited=try FramePlan(project:p).movingPoses(baseSeconds:0)
        let changed=try XCTUnwrap(edited.first{$0.slot==0}),next=try XCTUnwrap(edited.first{$0.slot==1})
        XCTAssertEqual(abs(changed.y-next.y),(changed.height+next.height)/2*1.06,accuracy:1e-8)
    }
    func testCyclicAndReverseMixedTrackAreContinuous()throws {
        var p=try fixture();for i in p.slides.indices{p.slides[i].framePolicy = .source}
        let t=SlideTrackLayout(project:p,slides:p.slides),epsilon=1e-7,cycles=16
        for i in 1..<p.slides.count {
            let left=t.displacement(visits:Double(i)-epsilon,repetitions:cycles)
            let right=t.displacement(visits:Double(i)+epsilon,repetitions:cycles)
            XCTAssertLessThan(abs(right-left),0.01)
        }
        let before=t.displacement(visits:-epsilon,repetitions:cycles)
        XCTAssertEqual(before,Double(cycles)*t.cycleLength-epsilon*t.advances.last!,accuracy:1e-7)
        let plan=try FramePlan(project:p)
        for phase in [-1000000.25,-3.0,-0.5,0,3,1000000.25] {
            let poses=plan.movingPoses(baseSeconds:0,interaction:phase)
            XCTAssertFalse(poses.isEmpty);XCTAssertLessThanOrEqual(poses.count,24)
            XCTAssertTrue(poses.allSatisfy{$0.x.isFinite && $0.y.isFinite && $0.width>0 && $0.height>0})
        }
    }
    func testAllWorldsKeepOutputAndDirectionAndProduceFiniteFrames()throws {
        let catalog=try CreativeCatalog.load()
        for world in catalog.worlds {
            var p=try fixture();p.creative.motion.transport.direction = -1
            p.applyWorld(world,catalog:catalog,recut:3)
            XCTAssertEqual(p.canvas,.portrait);XCTAssertEqual(p.creative.motion.transport.axis,"vertical")
            XCTAssertEqual(p.creative.motion.transport.direction,-1)
            let poses=try FramePlan(project:p).movingPoses(baseSeconds:0.2)
            XCTAssertFalse(poses.isEmpty)
            XCTAssertTrue(poses.allSatisfy{[$0.x,$0.y,$0.z,$0.width,$0.height,$0.opacity].allSatisfy(\.isFinite)})
        }
    }
    func testExistingProjectsKeepSavedChoicesAndTrainConversionIsUndoable()throws {
        var p=try fixture();p.canvas = .wideDeck;p.creative.motion.transport.axis="horizontal"
        p.slides[0].framePolicy = .matchCanvas;p.slides[0].aspect=nil
        p.slides[1].framePolicy = .source;p.pin=Pin(slideID:p.slides[2].id)
        p.closing=Closing(slideID:p.slides[0].id)
        let old=try DriftProject.decode(p.encoded());XCTAssertEqual(old,p)
        var journal=try DocumentJournal(project:old,saved:true)
        try journal.apply("Instagram train"){$0.useInstagramTrain()}
        XCTAssertEqual(journal.project.canvas,.portrait)
        XCTAssertEqual(journal.project.assets,old.assets);XCTAssertEqual(journal.project.pin,old.pin)
        XCTAssertEqual(journal.project.closing,old.closing)
        XCTAssertTrue(journal.project.slides.allSatisfy{$0.aspect==CanvasSize.wideDeck.ratio})
        try journal.undo();XCTAssertEqual(try journal.project.contentIdentity(),try old.contentIdentity())
    }
    func testExtremeOrInvalidRatiosAreSafeAndFinite()throws {
        var p=try fixture()
        for ratio in [try ExactRatio(1,10000),try ExactRatio(10000,1)]{
            p.slides[0].aspect=ratio
            let poses=try FramePlan(project:p).movingPoses(baseSeconds:0)
            XCTAssertLessThanOrEqual(poses.count,24)
            XCTAssertTrue(poses.allSatisfy{$0.height.isFinite})
        }
        p.slides[0].aspect=try ExactRatio(Int64.max,1)
        XCTAssertThrowsError(try p.validate())
        for input in ["0:1920","-1:9","NaN:1","Infinity:1","1e30:9","9223372036854775808:1"]{
            XCTAssertThrowsError(try ExactRatio(pair:input))
        }
        XCTAssertTrue(try FramePlan(project:fixture()).movingPoses(baseSeconds:.nan).isEmpty)
    }
}
