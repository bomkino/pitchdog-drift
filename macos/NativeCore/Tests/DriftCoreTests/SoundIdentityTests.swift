import XCTest
@testable import DriftCore

final class SoundIdentityTests:XCTestCase {
    func testAppearanceAndOutputDialogDoNotRebuildAuthoredSound()throws{
        var p=try DriftProject(creative:CreativeCatalog.load().defaults)
        let first=SoundRenderIdentity(try FramePlan(project:p))
        p.creative.card.radius+=1;p.creative.atmosphere.grain+=0.01
        p.creative.lighting.azimuth+=10;p.creative.lens.focus+=0.01
        p.creative.sound.previewEnabled.toggle();p.creative.sound.exportEnabled.toggle()
        p.output.format = .png;p.output.bitrate+=1000000
        XCTAssertEqual(first,SoundRenderIdentity(try FramePlan(project:p)))
        p.creative.sound.texture+=0.01
        XCTAssertNotEqual(first,SoundRenderIdentity(try FramePlan(project:p)))
    }
    func testTimebaseAndDocumentChangesInvalidateSound()throws{
        var p=try DriftProject(creative:CreativeCatalog.load().defaults)
        let first=SoundRenderIdentity(try FramePlan(project:p))
        p.output.rate=try OutputRate(60)
        XCTAssertNotEqual(first,SoundRenderIdentity(try FramePlan(project:p)))
        p.output.rate=try OutputRate(30);p.id=UUID().uuidString
        XCTAssertNotEqual(first,SoundRenderIdentity(try FramePlan(project:p)))
    }
}
