import XCTest
@testable import DriftNative

final class DestinationTransactionTests:XCTestCase {
    private struct Injected:Error {}
    private func fixture()throws->(MediaWorkspace,URL,URL,SafeDestination){
        let workspace=try MediaWorkspace(),destination=workspace.root.appendingPathComponent("Accepted"),stage=workspace.root.appendingPathComponent("Staged")
        try Data("accepted original".utf8).write(to:destination)
        try Data("completed output".utf8).write(to:stage)
        return(workspace,destination,stage,try SafeDestination(destination))
    }
    private func bytes(_ path:URL)throws->String{try String(contentsOf:path,encoding:.utf8)}

    func testThrownPostSwapInspectionRestoresOriginalBeforeCleanup()throws{
        let (workspace,destination,stage,permission)=try fixture()
        var files=DestinationFileOperations.live,stageReads=0,preserved=false
        files.identity={path in
            if path==stage{stageReads+=1;if stageReads==2{throw Injected()}}
            return try FileIdentity.read(path)
        }
        XCTAssertThrowsError(try permission.publish(stage,preserveStage:{preserved=true},using:files))
        XCTAssertTrue(preserved,"Caller cleanup is disarmed before any rollback step can throw.")
        XCTAssertEqual(try bytes(destination),"accepted original")
        XCTAssertFalse(FileManager.default.fileExists(atPath:stage.path))
        withExtendedLifetime(workspace){}
    }

    func testFailedRollbackRetainsDisplacedOriginal()throws{
        let (workspace,destination,stage,permission)=try fixture()
        let live=DestinationFileOperations.live
        var files=live,stageReads=0,swaps=0,preserved=false
        files.identity={path in
            if path==stage{stageReads+=1;if stageReads==2{throw Injected()}}
            return try FileIdentity.read(path)
        }
        files.swap={from,to in swaps+=1;return swaps==1 ? live.swap(from,to):-1}
        XCTAssertThrowsError(try permission.publish(stage,preserveStage:{preserved=true},using:files))
        XCTAssertTrue(preserved);XCTAssertEqual(swaps,2)
        XCTAssertEqual(try bytes(stage),"accepted original")
        XCTAssertEqual(try bytes(destination),"completed output")
        withExtendedLifetime(workspace){}
    }

    func testConcurrentNewDestinationIsNotOverwrittenByRollback()throws{
        let (workspace,destination,stage,permission)=try fixture()
        let live=DestinationFileOperations.live
        var files=live,swaps=0,preserved=false
        files.swap={from,to in
            swaps+=1;let result=live.swap(from,to)
            if result==0{try! Data("newer external file".utf8).write(to:to,options:.atomic)}
            return result
        }
        XCTAssertThrowsError(try permission.publish(stage,preserveStage:{preserved=true},using:files))
        XCTAssertTrue(preserved);XCTAssertEqual(swaps,1)
        XCTAssertEqual(try bytes(destination),"newer external file")
        XCTAssertEqual(try bytes(stage),"accepted original")
        withExtendedLifetime(workspace){}
    }

    func testRaceBeforeSwapRestoresActualDisplacedFile()throws{
        let (workspace,destination,stage,permission)=try fixture()
        let live=DestinationFileOperations.live
        var files=live,swaps=0,preserved=false
        files.swap={from,to in
            swaps+=1
            if swaps==1{try! Data("external file before swap".utf8).write(to:to,options:.atomic)}
            return live.swap(from,to)
        }
        XCTAssertThrowsError(try permission.publish(stage,preserveStage:{preserved=true},using:files))
        XCTAssertTrue(preserved);XCTAssertEqual(swaps,2)
        XCTAssertEqual(try bytes(destination),"external file before swap")
        XCTAssertFalse(FileManager.default.fileExists(atPath:stage.path))
        withExtendedLifetime(workspace){}
    }

    func testCleanupFailureIsCommittedSuccessWithRecoverableBackup()throws{
        let (workspace,destination,stage,permission)=try fixture()
        var files=DestinationFileOperations.live,preserved=false
        files.remove={_ in throw Injected()}
        try permission.publish(stage,preserveStage:{preserved=true},using:files)
        XCTAssertTrue(preserved)
        XCTAssertEqual(try bytes(destination),"completed output")
        XCTAssertEqual(try bytes(stage),"accepted original")
        withExtendedLifetime(workspace){}
    }

    func testStageCannotBeDestinationOrItsHardLink()throws{
        let (workspace,destination,_,permission)=try fixture()
        XCTAssertThrowsError(try permission.publish(destination))
        let link=workspace.root.appendingPathComponent("Hard link")
        try FileManager.default.linkItem(at:destination,to:link)
        XCTAssertThrowsError(try permission.publish(link))
        XCTAssertEqual(try bytes(destination),"accepted original")
        withExtendedLifetime(workspace){}
    }
}
