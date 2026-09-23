import XCTest
import DriftCore
@testable import DriftNative

final class CustomFrameTransactionTests:XCTestCase {
    @MainActor func testCustomFrameMayReadProjectDuringEditAndUndoRedo()async throws {
        var p=try DriftProject(creative:CreativeCatalog.load().defaults)
        let a=try Original(name:"Slide.png",sha256:String(repeating:"a",count:64),byteLength:100,kind:.image,subtype:"png",width:2576,height:1080)
        p.assets[a.id]=a;p.slides=[Slide(assetID:a.id)]
        let session=try EditorSession(project:p,workspace:MediaWorkspace(),saved:true)
        defer{session.close(discardRecovery:true)}
        session.change("Custom frame"){candidate in
            candidate.slides[0].framePolicy = .ratio
            candidate.slides[0].aspect=session.project.canvas.ratio
        }
        XCTAssertNil(session.issue);XCTAssertEqual(session.project.slides[0].aspect,CanvasSize.portrait.ratio)
        XCTAssertEqual(session.snapshot.project.slides,session.project.slides)
        XCTAssertEqual(session.journal.past.count,1)
        session.undo();XCTAssertEqual(session.project.slides,p.slides);XCTAssertFalse(session.dirty)
        session.redo();XCTAssertEqual(session.project.slides[0].aspect,CanvasSize.portrait.ratio)
        let before=try session.project.contentIdentity(),history=session.journal.past.count
        session.change("Invalid custom frame"){$0.slides[0].aspect=try ExactRatio(Int64.max,1)}
        XCTAssertNotNil(session.issue);XCTAssertEqual(try session.project.contentIdentity(),before)
        XCTAssertEqual(session.journal.past.count,history)
        XCTAssertEqual(session.snapshot.project.slides,session.project.slides)
    }
}
