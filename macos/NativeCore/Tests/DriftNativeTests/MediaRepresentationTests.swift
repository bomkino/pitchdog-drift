import XCTest
@preconcurrency import AVFoundation
import CoreImage
import DriftCore
@testable import DriftNative

final class MediaRepresentationTests:XCTestCase {
    // Synthetic 16x16 RGBA frames: red 90 ms, green 0 ms, blue 210 ms,
    // yellow 70 ms. The zero-duration frame must compose, never hold.
    private let webp="UklGRuQAAABXRUJQVlA4WAoAAAACAAAADwAADwAAQU5JTQYAAAAAAAAAAABBTk1GKAAAAAAAAAAAAA8AAA8AAFoAAAJWUDhMDwAAAC8PwAMABxD9j/4HIqL/AQBBTk1GKAAAAAAAAAAAAA8AAA8AAAAAAABWUDhMDwAAAC8PwAMAB9D/iP4HIqL/AQBBTk1GKAAAAAAAAAAAAA8AAA8AANIAAABWUDhMDwAAAC8PwAMABxDR//4HIqL/AQBBTk1GKAAAAAAAAAAAAA8AAA8AAEYAAABWUDhMEAAAAC8PwAMAB9D//kf/AxHR/wA="
    // Synthetic H.264 with reordered B-frames, two GOPs, exactly 12 frames.
    private let movie="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"
    private func original(_ bytes:String,_ name:String,in workspace:MediaWorkspace)throws->URL{
        let path=workspace.root.appendingPathComponent(name)
        try XCTUnwrap(Data(base64Encoded:bytes)).write(to:path)
        return path
    }
    func testLargestOccurrenceSetsDecodeDemandIndependentOfDrawOrder(){
        var forward=SourceResolutionDemand(),reverse=SourceResolutionDemand()
        for width in [64.0,1200,160]{forward.include(id:"same-slide",width:width,height:100,scale:1)}
        for width in [160.0,1200,64]{reverse.include(id:"same-slide",width:width,height:100,scale:1)}
        XCTAssertEqual(forward.dimensions,reverse.dimensions)
        XCTAssertEqual(forward.dimensions["same-slide"],1500)
        forward.include(id:"other-slide",width:320,height:256,scale:0.5)
        XCTAssertEqual(forward.dimensions["other-slide"],200)
    }
    func testWebPHoldsReuseImmutablePixelsAndIndexedPositiveIntervals()throws{
        let workspace=try MediaWorkspace(),path=try original(webp,"Variable.webp",in:workspace)
        let source=try WebSource(url:path,cancel:MediaCancellation()),playback=SourcePlayback()
        XCTAssertEqual(source.info.frame_count,4);XCTAssertEqual(source.info.duration,0.37,accuracy:0.000001)
        let first=try source.image(request:.time(0),playback:playback)
        for ns in [1,10_000_000,89_999_999] as [Int64]{
            XCTAssertTrue(try source.image(request:.time(ns),playback:playback) === first)
        }
        XCTAssertEqual(source.pixelCopies,1)
        _=try source.image(request:.time(90_000_000),playback:playback)
        XCTAssertEqual(source.timestamp,0.09,accuracy:0.000001);XCTAssertEqual(source.pixelCopies,2)
        var trim=playback;trim.trimOutNanoseconds=90_000_000
        _=try source.image(request:.lastBefore(90_000_000),playback:trim)
        XCTAssertEqual(source.timestamp,0,accuracy:0.000001)
        trim.trimInNanoseconds=100_000_000;trim.trimOutNanoseconds=300_000_000
        let held=try source.image(request:.lastBefore(300_000_000),playback:trim),copies=source.pixelCopies
        XCTAssertEqual(source.timestamp,0.09,accuracy:0.000001)
        for _ in 0..<100{XCTAssertTrue(try source.image(request:.lastBefore(300_000_000),playback:trim) === held)}
        XCTAssertEqual(source.pixelCopies,copies)
        let imported=try MediaInspector.stage(path,in:workspace,cancel:MediaCancellation())
        XCTAssertEqual(imported.kind,.animatedImage);XCTAssertEqual(imported.durationNanoseconds,370_000_000)
    }
    func testBFrameIndexAndForwardBackwardSourceReads()throws{
        let workspace=try MediaWorkspace(),path=try original(movie,"BFrames.mp4",in:workspace)
        let source=try NativeMovieSource(url:path,cancel:MediaCancellation())
        XCTAssertEqual(source.index.samples.count,12)
        XCTAssertEqual(source.index.origin,0,accuracy:0.000001)
        XCTAssertEqual(source.index.duration,1,accuracy:0.0001)
        for frame in [0,1,4,10,2,11,0]{
            _=try source.image(request:.time(Int64(frame)*1_000_000_000/12))
            // Integer nanoseconds floor to the same or immediately prior frame.
            let expected=source.index.samples[source.index.index(at:Double(Int64(frame)*1_000_000_000/12)/1e9)].start
            XCTAssertEqual(source.currentTime,expected,accuracy:0.000001)
        }
        _=try source.image(request:.lastBefore(1_000_000_000))
        XCTAssertEqual(source.currentTime,11.0/12,accuracy:0.000001)
        let imported=try MediaInspector.stage(path,in:workspace,cancel:MediaCancellation())
        XCTAssertEqual(imported.kind,.video);XCTAssertEqual(imported.durationNanoseconds,1_000_000_000)
    }
}
