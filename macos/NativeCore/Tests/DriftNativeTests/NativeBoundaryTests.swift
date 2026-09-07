import XCTest
import ImageIO
import CoreGraphics
import UniformTypeIdentifiers
import DriftCore
@testable import DriftNative

final class NativeBoundaryTests:XCTestCase {
    static func image(_ workspace:MediaWorkspace)throws->URL{
        let file=workspace.root.appendingPathComponent("Synthetic.png")
        let bytes=try XCTUnwrap(Data(base64Encoded:"iVBORw0KGgoAAAANSUhEUgAAAUAAAAC0CAYAAADl5PURAAACxklEQVR42u3UQQ0AMAwDsUAcpDLPYFSV/DCEuzQZ2JLXwhoRYoAYIBggBggGiAGCAWKAYIAYIBggBggGiAGCAWKAYIAYIBggBggGiAGCAWKAYIAYIBggBogBihADxADBADFAMEAMEAwQAwQDxADBADFAMEAMEAwQAwQDxADBADFAMEAMEAwQAwQDxADBADFADFCIGCAGCAaIAYIBYoBggBggGCAGCAaIAYIBYoBggBggGCAGCAaIAYIBYoBggBggGCAGCAaIAWKAYIAYIBggBggGiAGCAWKAYIAYIBggBggGiAGCAWKAYIAYIBggBggGiAGCAWKAYIAYIBggBogBggFigGCAGCAYIAYIBogBggFigGCAGCAYIAYIBogBggFigGCAGCAYIAYIBogBggFigGCAGCAGCAaIAYIBYoBggBggGCAGCAaIAYIBYoBggBggGCAGCAaIAYIBYoBggBggGCAGCAaIAYIIMUAMEAwQAwQDxADBADFAMEAMEAwQAwQDxADBADFAMEAMEAwQAwQDxADBADFAMEAMEAwQA8QARYgBYoBggBggGCAGCAaIAYIBYoBggBggGCAGCAaIAYIBYoBggBggGCAGCAaIAYIBYoBggBggBihEDBADBAPEAMEAMUAwQAwQDBADBAPEAMEAMUAwQAwQDBADBAPEAMEAMUAwQAwQDBADBAPEADFAMEAMEAwQAwQDxADBADFAMEAMEAwQAwQDxADBADFAMEAMEAwQAwQDxADBADFAMEAMEAwQA8QAwQAxQDBADBAMEAMEA8QAwQAxQDBADBAMEAMEA8QAwQAxQDBADBAMEAMEA8QAwQAxQDBADBADBAPEAMEAMUAwQAwQDBADBAPEAMEAMUAwQAwQDBADBAPEAMEAMUAwQAwQDBADBAPEAEGEGCAGCAaIAYIBYoBggBggGCAGCAaIAYIBct8HN1KvhjORLf8AAAAASUVORK5CYII="));try bytes.write(to:file);return file
    }
    func testNativeOriginalProjectRoundTripAndIndependentCopies()throws{
        let workspace=try MediaWorkspace(),source=try Self.image(workspace),original=try MediaInspector.stage(source,in:workspace,cancel:MediaCancellation())
        var project=try DriftProject(creative:CreativeCatalog.load().defaults);project.assets[original.id]=original;project.slides=[Slide(assetID:original.id)]
        project.pin=Pin(slideID:project.slides[0].id);project.closing=Closing(slideID:project.slides[0].id)
        let snapshot=try RenderSnapshot(project:project,workspace:workspace),file=workspace.root.appendingPathComponent("Synthetic.pitched")
        try ProjectIO.write(snapshot,to:file);let (restored,read)=try ProjectIO.read(file)
        XCTAssertEqual(project,restored);try read.verify(original)
        try Data("changed outside file".utf8).write(to:source)
        try read.verify(original);try workspace.verify(original)
        let corrupt=workspace.root.appendingPathComponent("Corrupt.pitched");let bytes=try Data(contentsOf:file);try bytes.prefix(40).write(to:corrupt)
        XCTAssertThrowsError(try ProjectIO.read(corrupt));XCTAssertEqual(try ProjectIO.read(file).0,project)
    }
    func testCancellationAndChangedDestinationNeverReplaceAcceptedBytes()throws{
        let workspace=try MediaWorkspace(),source=try Self.image(workspace),cancel=MediaCancellation();cancel.cancel()
        XCTAssertThrowsError(try MediaInspector.stage(source,in:workspace,cancel:cancel))
        let destination=workspace.root.appendingPathComponent("Existing.png"),staged=workspace.root.appendingPathComponent("Stage.png")
        try Data("old".utf8).write(to:destination);let permission=try SafeDestination(destination)
        try Data("new".utf8).write(to:staged);try Data("changed by another process".utf8).write(to:destination)
        XCTAssertThrowsError(try permission.publish(staged));XCTAssertEqual(try String(contentsOf:destination,encoding:.utf8),"changed by another process")
        let valid=try SafeDestination(destination);try valid.publish(staged);XCTAssertEqual(try String(contentsOf:destination,encoding:.utf8),"new")
    }
    func testGenericFileNamesAreClassifiedByContent()throws{
        let workspace=try MediaWorkspace(),source=try Self.image(workspace),unknown=workspace.root.appendingPathComponent("No extension")
        try FileManager.default.copyItem(at:source,to:unknown)
        let original=try MediaInspector.stage(unknown,in:workspace,cancel:MediaCancellation())
        XCTAssertEqual(original.subtype,"png");XCTAssertEqual(original.width,320);XCTAssertEqual(original.height,180)
        let wrong=workspace.root.appendingPathComponent("Pretend.webp");try Data(repeating:1,count:1024).write(to:wrong)
        XCTAssertThrowsError(try MediaInspector.stage(wrong,in:workspace,cancel:MediaCancellation()))
    }
    @MainActor func testImportedSlidesHonorAuthoredCoverAndContainDefaults()async throws{
        for (setting,expected) in [("cover",Fit.fill),("contain",Fit.fit)]{
            let work=try MediaWorkspace(),source=try Self.image(work)
            var project=try DriftProject(creative:CreativeCatalog.load().defaults);project.creative.card.defaultFit=setting
            let session=try EditorSession(project:project,workspace:MediaWorkspace(),saved:true)
            session.importURLs([source],ticket:session.ticket())
            let deadline=ProcessInfo.processInfo.systemUptime+10
            while session.importing && ProcessInfo.processInfo.systemUptime<deadline{try await Task.sleep(nanoseconds:20_000_000)}
            XCTAssertFalse(session.importing);XCTAssertNil(session.pendingBatch)
            XCTAssertNil(session.issue);XCTAssertEqual(session.project.slides.first?.fit,expected)
            session.undo();XCTAssertTrue(session.project.slides.isEmpty)
        }
    }
}
