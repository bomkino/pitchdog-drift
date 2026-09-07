import XCTest
import Foundation
import Darwin
import DriftCore
@testable import DriftNative

final class LargeProjectTests:XCTestCase {
    func testFourGiBOriginalsStreamThroughZIP64WithBoundedMemory()throws{
        guard ProcessInfo.processInfo.environment["DRIFT_LARGE_PROJECT"]=="1" else{throw XCTSkip("Set DRIFT_LARGE_PROJECT=1 for the mandatory CI capacity boundary.")}
        let workspace=try MediaWorkspace()
        let available=try workspace.root.resourceValues(forKeys:[.volumeAvailableCapacityKey]).volumeAvailableCapacity ?? 0
        XCTAssertGreaterThan(available,9*1024*1024*1024,"The full round trip needs 9 GiB of temporary disk space.")
        guard available>9*1024*1024*1024 else{return}
        var project=try DriftProject(creative:CreativeCatalog.load().defaults)
        // Valid tiny PNGs with distinct trailing padding exercise exact original
        // bytes at the supported per-file limit. No giant decoded image is needed.
        let png=try Data(contentsOf:NativeBoundaryTests.image(workspace))
        for index in 0..<8{
            let source=workspace.root.appendingPathComponent("Padded-\(index).png")
            let handle=try OwnedFiles.create(source)
            try handle.write(contentsOf:png)
            try handle.truncate(atOffset:UInt64(MediaLimits.maximumOriginalBytes))
            try handle.seek(toOffset:UInt64(MediaLimits.maximumOriginalBytes-1))
            try handle.write(contentsOf:Data([UInt8(index)]));try handle.close()
            let hash=try OwnedFiles.fingerprint(source)
            let original=try Original(name:source.lastPathComponent,sha256:hash,byteLength:MediaLimits.maximumOriginalBytes,kind:.image,subtype:"png",width:320,height:180,hasAlpha:true)
            try FileManager.default.moveItem(at:source,to:workspace.url(original))
            project.assets[original.id]=original;project.slides.append(Slide(assetID:original.id))
        }
        XCTAssertEqual(project.assets.count,8)
        let snapshot=try RenderSnapshot(project:project,workspace:workspace),file=workspace.root.appendingPathComponent("Capacity.pitched")
        var before=rusage();getrusage(RUSAGE_SELF,&before)
        let started=ProcessInfo.processInfo.systemUptime
        try ProjectIO.write(snapshot,to:file)
        let bytes=try XCTUnwrap(try FileIdentity.read(file)).size
        XCTAssertGreaterThan(bytes,Int64(UInt32.max),"The archive must actually cross the ZIP32 offset boundary.")
        let (restored,opened)=try ProjectIO.read(file)
        XCTAssertEqual(restored,project)
        for original in project.assets.values{try opened.verify(original)}
        var after=rusage();getrusage(RUSAGE_SELF,&after)
        let peakGrowth=max(0,after.ru_maxrss-before.ru_maxrss)
        XCTAssertLessThan(peakGrowth,512*1024*1024,"Portable data must stream; it cannot become a whole-archive allocation.")
        print("DRIFT_ZIP64_CAPACITY originalBytes=\(MediaLimits.maximumProjectBytes) archiveBytes=\(bytes) peakRSSGrowthBytes=\(peakGrowth) elapsedSeconds=\(ProcessInfo.processInfo.systemUptime-started) originalsVerified=8")
    }
}
