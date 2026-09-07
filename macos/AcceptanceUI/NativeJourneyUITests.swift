import XCTest
import Foundation

/// Drive the archived application, not a separately compiled host or mocked
/// document. XCUITest can address AppKit's remote Save-panel view service.
final class NativeJourneyUITests:XCTestCase {
    private func json(_ url:URL)->[String:Any]?{
        guard let data=try? Data(contentsOf:url) else{return nil}
        return (try? JSONSerialization.jsonObject(with:data)) as? [String:Any]
    }
    private func awaitValue(_ description:String,timeout:TimeInterval=90,_ predicate:@escaping()->Bool)throws{
        let expectation=XCTNSPredicateExpectation(predicate:NSPredicate{_,_ in predicate()},object:nil)
        guard XCTWaiter.wait(for:[expectation],timeout:timeout) == .completed else{
            XCTFail("Timed out: \(description)");throw NSError(domain:"DriftAcceptance",code:1,userInfo:[NSLocalizedDescriptionKey:description])
        }
    }
    @MainActor func testArchivedNativeJourney()throws{
        continueAfterFailure=false
        let bundle=Bundle(for:Self.self)
        let path=try XCTUnwrap(bundle.object(forInfoDictionaryKey:"DriftApplicationPath") as? String)
        let source=try XCTUnwrap(bundle.object(forInfoDictionaryKey:"DriftSourceRevision") as? String)
        let runID=try XCTUnwrap(bundle.object(forInfoDictionaryKey:"DriftProofRunID") as? String)
        let root=URL(fileURLWithPath:try XCTUnwrap(bundle.object(forInfoDictionaryKey:"DriftProofRootPath") as? String),isDirectory:true)
        let exchange=URL(fileURLWithPath:try XCTUnwrap(bundle.object(forInfoDictionaryKey:"DriftProofExchangePath") as? String),isDirectory:true)
        print("DRIFT_UI_PROOF_ROOT \(root.path)")
        let app=XCUIApplication(url:URL(fileURLWithPath:path))
        app.launchArguments=["--native-self-test","--native-ui-driver","-AppleLanguages","(en)","-AppleLocale","en_US"]
        app.launchEnvironment=["DRIFT_PROOF_RUN_ID":runID,"DRIFT_PROOF_EXCHANGE_PATH":exchange.path]
        app.launch()
        defer{if app.state != .notRunning{app.terminate()}}
        do{
            for choice in ["discard","cancel"]{
                try awaitValue("synthetic \(choice) prompt"){
                    self.json(root.appendingPathComponent("UI_STEP.json"))?["choice"] as? String==choice || self.json(root.appendingPathComponent("RESULT.json")) != nil
                }
                if let failed=json(root.appendingPathComponent("RESULT.json")){
                    XCTFail("Application failed before \(choice): \(failed)");return
                }
                let step=try XCTUnwrap(json(root.appendingPathComponent("UI_STEP.json")))
                let title=try XCTUnwrap(step["window"] as? String)
                let sheet=app.windows[title].sheets.firstMatch
                XCTAssertTrue(sheet.waitForExistence(timeout:15),"The real \(title) sheet must exist.")
                // The captured macOS accessibility hierarchy exposes the action
                // as an identifier; its visible text is a title, not a label.
                // Untitled recovery uses NSSavePanel; the named dirty document uses
                // NSAlert. Both identifiers are from captured accessibility trees.
                let identifier=choice=="cancel" ? "action-button-3":"DontSaveButton"
                let control=sheet.buttons[identifier]
                XCTAssertTrue(control.waitForExistence(timeout:15),"No real \(choice) button: \(sheet.debugDescription)")
                XCTAssertTrue(control.isEnabled)
                control.click()
            }
            for appearance in ["Light","Dark"]{
                let choice="appearance-\(appearance)"
                try awaitValue("\(appearance) appearance",timeout:180){
                    self.json(root.appendingPathComponent("UI_STEP.json"))?["choice"] as? String==choice || self.json(root.appendingPathComponent("RESULT.json")) != nil
                }
                XCTAssertNil(json(root.appendingPathComponent("RESULT.json")),"Application failed before appearance capture")
                let title=try XCTUnwrap(json(root.appendingPathComponent("UI_STEP.json"))?["window"] as? String)
                let window=app.windows[title]
                XCTAssertTrue(window.exists)
                let screenshot=window.screenshot()
                try screenshot.pngRepresentation.write(to:exchange.appendingPathComponent("Appearance-\(appearance).png"))
                let attachment=XCTAttachment(screenshot:screenshot);attachment.name="Native \(appearance) appearance";attachment.lifetime = .keepAlways;add(attachment)
                try JSONSerialization.data(withJSONObject:["choice":choice]).write(to:exchange.appendingPathComponent("UI_ACK.json"),options:.atomic)
            }
            try awaitValue("native document/media/output result",timeout:480){self.json(root.appendingPathComponent("RESULT.json")) != nil}
            let result=try XCTUnwrap(json(root.appendingPathComponent("RESULT.json")))
            XCTAssertEqual(result["result"] as? String,"passed","\(result)")
            XCTAssertEqual(result["source"] as? String,source)
        }catch{
            let tree=XCTAttachment(string:app.debugDescription);tree.name="Synthetic native accessibility tree";tree.lifetime = .keepAlways;add(tree)
            if app.state != .notRunning{let image=XCTAttachment(screenshot:app.screenshot());image.name="Synthetic native window";image.lifetime = .keepAlways;add(image)}
            throw error
        }
    }
}
