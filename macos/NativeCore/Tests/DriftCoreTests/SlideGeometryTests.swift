import XCTest
@testable import DriftCore

final class SlideGeometryTests:XCTestCase {
    private func fixture(_ count:Int=3)throws->DriftProject {
        var p=try DriftProject(creative:CreativeCatalog.load().defaults)
        let source=try Original(name:"Deck.png",sha256:String(repeating:"b",count:64),byteLength:1024,kind:.image,subtype:"png",width:2576,height:1080,durationNanoseconds:0,hasAlpha:false)
        p.assets[source.id]=source
        p.slides=(0..<count).map{Slide(assetID:source.id,id:"geometry-\($0)")}
        p.direction.entry.enabled=false;p.direction.exit.enabled=false
        p.creative.motion.path.id="straight";p.creative.motion.path.depth=0
        p.creative.motion.path.focusScale=0;p.creative.motion.path.gap=0
        p.creative.motion.performance.imperfection=0
        return p
    }
    func testNewProjectSeparatesPortraitOutputFromWideSlides()throws {
        let p=try fixture(),source=try p.original(for:p.slides[0])
        XCTAssertEqual(p.canvas,.instagramPortrait)
        XCTAssertEqual(p.creative.motion.transport.axis,"vertical")
        XCTAssertEqual(p.slides[0].framePolicy,.ratio)
        XCTAssertEqual(p.slides[0].aspectRatio(canvas:p.canvas,original:source),2576.0/1080,accuracy:1e-12)
        XCTAssertEqual(try CreativeCatalog.load().defaults.motion.path.gap,0.04)
    }
    func testDefaultWorldRecutUsesPortraitArrangement()throws {
        var p=try fixture();let catalog=try CreativeCatalog.load()
        let world=try XCTUnwrap(catalog.worlds.first{$0.worldID==p.worldID && $0.pressure==p.worldPressure && $0.scene==p.worldScene})
        p.applyWorld(world,catalog:catalog,recut:1)
        XCTAssertEqual(p.canvas,.instagramPortrait)
        XCTAssertEqual(p.creative.motion.transport.axis,"vertical")
        XCTAssertTrue(p.slides.allSatisfy{$0.aspect==CanvasSize.wideDeck.ratio})
    }
    func testSavedFramingAndAxisAreNotMigratedByNewDefaults()throws {
        var p=try fixture();p.canvas = .wideDeck;p.creative.motion.transport.axis="horizontal"
        p.slides[0].framePolicy = .matchCanvas;p.slides[0].aspect=nil
        XCTAssertEqual(try DriftProject.decode(p.encoded()),p)
    }
    func testZeroGapUsesActualEdgesForMixedRatiosAndScaleOffsets()throws {
        for axis in ["vertical","horizontal"] {
            var p=try fixture();p.creative.motion.transport.axis=axis
            p.slides[1].aspect=try ExactRatio(1,1);p.slides[1].scaleOffset=0.25
            p.slides[2].framePolicy = .source;p.slides[2].scaleOffset = -0.2
            let plan=try FramePlan(project:p)
            for distance in [0.0,0.25,1.0,-0.5,2.75] {
                let cards=plan.movingPoses(baseSeconds:0,interaction:distance)
                let coordinates=cards.map { card in
                    (axis=="vertical" ? -card.y:card.x,axis=="vertical" ? card.height:card.width)
                }.sorted{$0.0<$1.0}
                XCTAssertGreaterThan(coordinates.count,2)
                for pair in zip(coordinates,coordinates.dropFirst()) {
                    XCTAssertEqual(pair.1.0-pair.0.0,(pair.0.1+pair.1.1)*0.5,accuracy:1e-7)
                }
            }
        }
    }
    func testGapUsesMeanAdjacentExtentIncludingCycleSeam()throws {
        var p=try fixture();p.slides[1].aspect=try ExactRatio(1,1);p.creative.motion.path.gap=0.1
        let track=SlideTrack(project:p,slides:p.movingSlides)
        for i in track.footprints.indices {
            let next=(i+1)%track.footprints.count
            XCTAssertEqual(track.steps[i],(track.footprints[i].extent+track.footprints[next].extent)*0.55,accuracy:1e-9)
        }
        XCTAssertEqual(track.position(at:3,copies:3),track.length,accuracy:1e-9)
        XCTAssertEqual(track.position(at:-0.5,copies:3),track.length*3-track.steps.last!*0.5,accuracy:1e-9)
    }
    func testCustomRatioAndCanvasEditsRebuildGeometryWithoutStaleStride()throws {
        var p=try fixture();let before=SlideTrack(project:p,slides:p.movingSlides)
        p.slides[0].aspect=try ExactRatio(9,16)
        let changed=SlideTrack(project:p,slides:p.movingSlides)
        XCTAssertNotEqual(before.steps[0],changed.steps[0])
        p.canvas = .wideDeck
        let resized=SlideTrack(project:p,slides:p.movingSlides)
        XCTAssertEqual(resized.steps[0]/changed.steps[0],2576.0/1080,accuracy:1e-9)
        // The obsolete shared card ratio must have no effect on slide spacing.
        p.creative.card.aspectWidth=9;p.creative.card.aspectHeight=16
        XCTAssertEqual(SlideTrack(project:p,slides:p.movingSlides).steps,resized.steps)
    }
    func testTinyRatioCopyCountAndInvalidInteractionAreBounded()throws {
        var p=try fixture(1);p.slides[0].aspect=try ExactRatio(Int64.max,1)
        let plan=try FramePlan(project:p)
        XCTAssertLessThanOrEqual(plan.movingPoses(baseSeconds:0).count,24)
        XCTAssertTrue(plan.movingPoses(baseSeconds:0,interaction:.nan).isEmpty)
        XCTAssertTrue(plan.movingPoses(baseSeconds:.infinity).isEmpty)
    }
    func testOneSlideAndReverseRepeatHaveEquivalentGeometry()throws {
        let p=try fixture(1),plan=try FramePlan(project:p)
        func positions(_ d:Double)->[Double]{plan.movingPoses(baseSeconds:0,interaction:d).map(\.y).sorted()}
        let a=positions(0),b=positions(1),c=positions(-1)
        XCTAssertEqual(a.count,b.count);XCTAssertEqual(a.count,c.count)
        for (x,y) in zip(a,b){XCTAssertEqual(x,y,accuracy:1e-8)}
        for (x,y) in zip(a,c){XCTAssertEqual(x,y,accuracy:1e-8)}
    }
}
