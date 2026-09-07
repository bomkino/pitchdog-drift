import XCTest
@testable import DriftCore

final class ProjectTests:XCTestCase {
    func fixture()throws->DriftProject{
        var p=try DriftProject(creative:CreativeCatalog.load().defaults)
        let a=try Original(name:"Clip.webp",sha256:String(repeating:"a",count:64),byteLength:1024,kind:.animatedImage,subtype:"webp",width:2576,height:1080,durationNanoseconds:2_000_000_000,hasAlpha:true)
        p.assets[a.id]=a;p.slides=[Slide(assetID:a.id,id:"slide-1")];return p
    }
    func testEveryRetainedRecipeDecodesAndValidates()throws{
        let catalog=try CreativeCatalog.load()
        XCTAssertEqual(Set(catalog.worlds.map(\.worldID)).count,8)
        XCTAssertEqual(catalog.worlds.count,72)
        XCTAssertEqual(catalog.defaults.card.aspectWidth/catalog.defaults.card.aspectHeight,2576.0/1080.0,accuracy:1e-12)
        XCTAssertEqual(catalog.defaults.card.defaultFit,"contain")
    }
    func testNewFormatPreservesRolesAndRejectsPresenterAndUnknownVersions()throws{
        var p=try fixture();p.pin=Pin(slideID:"slide-1");var cue=Spotlight(slideID:"slide-1",id:"spot-1");cue.target = .pin
        p.spotlights=[cue];p.closing=Closing(slideID:"slide-1")
        XCTAssertEqual(try DriftProject.decode(p.encoded()),p)
        XCTAssertTrue(p.movingSlides.isEmpty)
        var raw=try XCTUnwrap(JSONSerialization.jsonObject(with:p.encoded()) as? [String:Any]);raw["presenter"]=[:]
        XCTAssertThrowsError(try DriftProject.decode(JSONSerialization.data(withJSONObject:raw)))
        raw.removeValue(forKey:"presenter");raw["schemaVersion"]=0
        XCTAssertThrowsError(try DriftProject.decode(JSONSerialization.data(withJSONObject:raw)))
    }
    func testUndoAndConcurrentSaveUseSavedContentRatherThanMutationCount()throws{
        let p=try fixture();var journal=try DocumentJournal(project:p,saved:true)
        let ticket=journal.ticket();let save=p
        try journal.apply("Rename"){$0.name="Changed"};XCTAssertTrue(journal.isDirty)
        try journal.didSave(save,ticket:ticket);XCTAssertTrue(journal.isDirty)
        try journal.undo();XCTAssertFalse(journal.isDirty)
        try journal.redo();XCTAssertTrue(journal.isDirty)
        try journal.load(p,saved:true)
        XCTAssertThrowsError(try journal.didSave(save,ticket:ticket))
    }
    func testRemovalUndoRestoresSourceAndRoleReferences()throws{
        var p=try fixture();p.pin=Pin(slideID:"slide-1");p.closing=Closing(slideID:"slide-1")
        var journal=try DocumentJournal(project:p,saved:true)
        try journal.apply("Remove"){$0.removeSlides(["slide-1"])}
        XCTAssertTrue(journal.project.assets.isEmpty);XCTAssertNil(journal.project.pin)
        XCTAssertEqual(journal.retainedAssetIDs,Set(p.assets.keys))
        try journal.undo();XCTAssertEqual(journal.project,p);XCTAssertFalse(journal.isDirty)
    }
    func testGestureCancelAndStaleTargetsDoNotChangeAnotherDocument()throws{
        let p=try fixture();var journal=try DocumentJournal(project:p,saved:true)
        try journal.beginGesture("Focal point");try journal.apply("Focal point"){$0.slides[0].focalX=0.2}
        try journal.cancelGesture();XCTAssertFalse(journal.isDirty);XCTAssertFalse(journal.canUndo)
        let ticket=journal.ticket(targets:["slide-1"])
        try journal.load(p,saved:true)
        XCTAssertThrowsError(try journal.apply("Late field",ticket:ticket){$0.name="Wrong"})
        XCTAssertEqual(journal.project,p)
    }
    func testSourceClockKeepsLoopAndTerminalFrameDistinct()throws{
        let p=try fixture(),a=try p.original(for:p.slides[0]);var playback=SourcePlayback()
        playback.trimInNanoseconds=250_000_000;playback.trimOutNanoseconds=1_250_000_000
        XCTAssertEqual(try playback.request(outputSeconds:1.5,original:a),.time(750_000_000))
        playback.loop=false
        XCTAssertEqual(try playback.request(outputSeconds:2,original:a),.lastBefore(1_250_000_000))
        playback.plays=false
        XCTAssertEqual(try playback.request(outputSeconds:20,original:a),.time(250_000_000))
    }
    func testDomainLockOrderIsNotADocumentChange()throws{
        var a=try fixture();a.lockedDomains=["motion","lens"]
        var b=a;b.lockedDomains.reverse()
        XCTAssertEqual(try a.contentIdentity(),try b.contentIdentity())
    }
}
