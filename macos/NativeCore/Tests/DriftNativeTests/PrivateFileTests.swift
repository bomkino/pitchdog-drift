import XCTest
import Darwin
@testable import DriftNative

final class PrivateFileTests:XCTestCase {
    private func mode(_ url:URL)throws->mode_t{
        var value=stat()
        XCTAssertEqual(url.path.withCString{lstat($0,&value)},0)
        XCTAssertEqual(value.st_uid,getuid(),"The fixture must belong to the test user.")
        return value.st_mode & 0o7777
    }

    func testPrivateWorkspaceTraversesAndPrivateFileRoundTrips()throws{
        XCTAssertNotEqual(geteuid(),0,"Run the permissions regression as an ordinary user.")
        let root=FileManager.default.temporaryDirectory.appendingPathComponent("Drift-private-test-\(UUID().uuidString)",isDirectory:true)
        do {
            let workspace=try MediaWorkspace(root:root)
            XCTAssertEqual(try mode(root),0o700)
            XCTAssertEqual(try mode(workspace.assets),0o700)
            let file=workspace.assets.appendingPathComponent("child")
            let expected=Data("owner can write, traverse, reopen and read".utf8)
            let writer=try OwnedFiles.create(file)
            try writer.write(contentsOf:expected);try writer.synchronize();try writer.close()
            XCTAssertEqual(try mode(file),0o600)
            let reader=try OwnedFiles.openRead(file)
            XCTAssertEqual(try reader.readToEnd(),expected);try reader.close()
            let replacement=Data("private atomic replacement".utf8)
            try OwnedFiles.writeAtomic(replacement,to:file)
            XCTAssertEqual(try mode(file),0o600)
            XCTAssertEqual(try Data(contentsOf:file),replacement)
            withExtendedLifetime(workspace){}
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath:root.path),"Only this fixture's owned workspace is collected.")
    }
}
