import XCTest
@testable import DriftCore
@testable import DriftNative

final class FinalNativeBoundaryTests:XCTestCase {
    private func project()throws->DriftProject{
        var p=try DriftProject(creative:CreativeCatalog.load().defaults)
        let source=try Original(name:"Synthetic.png",sha256:String(repeating:"a",count:64),byteLength:100,kind:.image,subtype:"png",width:4000,height:2000,durationNanoseconds:0,hasAlpha:false)
        p.assets[source.id]=source;p.slides=[Slide(assetID:source.id)]
        p.direction.contentPaced=false;p.direction.bodyMilliseconds=10000
        p.direction.entry.enabled=false;p.direction.exit.enabled=false
        return p
    }
    @MainActor func testLookAuditionIsRenderOnlyAndApplyIsOneUndoableEdit()async throws{
        var p=try project();p.createdAt="2000-01-01T00:00:00Z";p.modifiedAt=p.createdAt
        let session=try EditorSession(project:p,workspace:MediaWorkspace(),saved:true)
        session.auditionLook("Grain"){$0.creative.atmosphere.grain+=0.1}
        XCTAssertEqual(session.project,p);XCTAssertEqual(session.snapshot.project,p);XCTAssertFalse(session.dirty)
        XCTAssertNotEqual(session.displaySnapshot.project,p)
        session.compareLookOriginal(true);XCTAssertEqual(session.displaySnapshot.project,p)
        session.compareLookOriginal(false);XCTAssertNotEqual(session.displaySnapshot.project,p)
        session.cancelLookAudition();XCTAssertFalse(session.journal.canUndo);XCTAssertEqual(session.displaySnapshot.project,p)
        session.auditionLook("World"){$0.applyWorld(session.catalog.worlds[9],catalog:session.catalog)}
        let accepted=session.lookProject;session.acceptLookAudition()
        XCTAssertEqual(try session.project.contentIdentity(),try accepted.contentIdentity());XCTAssertNil(session.lookAudition)
        XCTAssertNotEqual(session.project.modifiedAt,accepted.modifiedAt,"Committing the audition updates its modification timestamp.")
        session.undo();XCTAssertEqual(session.project,p);XCTAssertFalse(session.dirty)
        session.auditionLook("Older"){$0.creative.atmosphere.grain+=0.1}
        session.change("Newer"){$0.seed+=1};session.acceptLookAudition()
        XCTAssertEqual(session.project.seed,p.seed+1);XCTAssertEqual(session.project.creative,p.creative)
    }
    @MainActor func testNestedCueAuditionRestoresOriginalPausedFrameAndNotifiesCanvas()async throws{
        var p=try project();let id=p.slides[0].id
        p.spotlights=[Spotlight(slideID:id)];p.closing=Closing(slideID:id)
        let transport=Transport(plan:try FramePlan(project:p));transport.seek(21)
        var displayed:Int64 = -1;transport.didTick={frame,_ in displayed=frame}
        transport.previewCue(p.spotlights[0].id);transport.previewCue("closing");transport.cancelAudition()
        XCTAssertEqual(transport.frame,21);XCTAssertFalse(transport.playing);XCTAssertEqual(displayed,21)
        transport.previewCue("closing");transport.seek(25);transport.cancelAudition()
        XCTAssertEqual(transport.frame,25,"A later deliberate seek revokes old audition restoration.")
    }
    func testCropPerspectiveAndLargestOccurrenceControlDecodeQuality()throws{
        let p=try project(),original=try XCTUnwrap(p.assets.values.first)
        var pose=CardPose(id:"test",slideID:p.slides[0].id,slot:0,sourceIndex:0,x:0,y:0,z:0,width:400,height:200,rotationX:0,rotationY:0,rotationZ:0,opacity:1,pathBend:0,focus:1)
        pose.fit = .fill
        var full=SourceResolutionDemand();full.include(pose:pose,original:original,canvas:p.canvas,scale:1)
        XCTAssertEqual(full.dimensions[pose.slideID],500)
        pose.crop.width=0.25;pose.crop.height=0.25
        var crop=SourceResolutionDemand();crop.include(pose:pose,original:original,canvas:p.canvas,scale:1)
        XCTAssertEqual(crop.dimensions[pose.slideID],2000)
        pose.z=Double(p.canvas.height)/(2*tan(35*Double.pi/360))*0.5
        crop.include(pose:pose,original:original,canvas:p.canvas,scale:1)
        XCTAssertEqual(crop.dimensions[pose.slideID],4000)
        pose.z=100000
        crop.include(pose:pose,original:original,canvas:p.canvas,scale:1)
        XCTAssertEqual(crop.dimensions[pose.slideID],8192)
        crop.include(id:pose.slideID,width:64,height:64,scale:1)
        XCTAssertEqual(crop.dimensions[pose.slideID],8192,"Later small occurrences cannot lower a shared frame's representation.")
    }
}
