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
    @MainActor private func selectInspector(_ title:String,in window:XCUIElement)throws {
        let radio=window.radioButtons[title]
        if radio.exists { radio.click();return }
        let button=window.buttons[title]
        XCTAssertEqual(window.buttons.matching(identifier:title).count,1,"Inspector choice must be unambiguous")
        XCTAssertTrue(button.waitForExistence(timeout:3),"Missing inspector choice \(title)")
        button.click()
    }

    @MainActor func testArchivedNativeJourney()throws{
        continueAfterFailure=false
        let bundle=Bundle(for:Self.self)
        let path=try XCTUnwrap(bundle.object(forInfoDictionaryKey:"DriftApplicationPath") as? String)
        let source=try XCTUnwrap(bundle.object(forInfoDictionaryKey:"DriftSourceRevision") as? String)
        let runID=try XCTUnwrap(bundle.object(forInfoDictionaryKey:"DriftProofRunID") as? String)
        let root=URL(fileURLWithPath:try XCTUnwrap(bundle.object(forInfoDictionaryKey:"DriftProofRootPath") as? String),isDirectory:true)
        print("DRIFT_UI_PROOF_ROOT \(root.path)")
        let app=XCUIApplication(url:URL(fileURLWithPath:path))
        app.launchArguments=["--native-self-test","--native-ui-driver","-AppleLanguages","(en)","-AppleLocale","en_US"]
        app.launchEnvironment=["DRIFT_PROOF_RUN_ID":runID]
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
                XCTAssertTrue(window.buttons["Export…"].isHittable,"Export must remain on screen")
                let screenshot=window.screenshot()
                let attachment=XCTAttachment(screenshot:screenshot);attachment.name="Native \(appearance) appearance";attachment.lifetime = .keepAlways;add(attachment)
                let nextFrame=window.buttons["drift.next-frame"]
                XCTAssertTrue(nextFrame.waitForExistence(timeout:15))
                XCTAssertTrue(nextFrame.isEnabled)
                nextFrame.click()
            }
            for choice in ["edit-enter","edit-blur","edit-escape","edit-undo","edit-undo-enter","edit-reorder","edit-undo-reorder","edit-redo-reorder","edit-undo-redo","look-start","look-original","look-preview","look-cancel","look-restart","look-seek","look-apply","look-undo"]{
                try awaitValue(choice){self.json(root.appendingPathComponent("UI_STEP.json"))?["choice"] as? String==choice || self.json(root.appendingPathComponent("RESULT.json")) != nil || app.state == .notRunning}
                XCTAssertNil(json(root.appendingPathComponent("RESULT.json")),"Application failed before \(choice)")
                let step=try XCTUnwrap(json(root.appendingPathComponent("UI_STEP.json")))
                let window=app.windows[try XCTUnwrap(step["window"] as? String)]
                let media=window.descendants(matching:.any).matching(identifier:"drift.media-list").firstMatch
                func click(_ identifier:String)throws{
                    let control=window.descendants(matching:.any).matching(identifier:identifier).firstMatch
                    XCTAssertTrue(control.waitForExistence(timeout:10),"Missing \(identifier): \(window.debugDescription)")
                    XCTAssertTrue(control.isHittable);control.click()
                }
                func replace(_ field:XCUIElement,_ text:String){
                    XCTAssertTrue(field.waitForExistence(timeout:10));field.click();field.typeKey("a",modifierFlags:.command);field.typeText(text)
                }
                switch choice{
                case "edit-enter":
                    try selectInspector("Slide",in:window)
                    let field=window.textFields["Focal X"];replace(field,"0.25");field.typeKey(.return,modifierFlags:[])
                case "edit-blur":
                    replace(window.textFields["Focal X"],"0.4")
                    media.staticTexts[try XCTUnwrap(step["nextMedia"] as? String)].firstMatch.click()
                case "edit-escape":
                    let field=window.textFields["Focal X"];replace(field,"0.9");field.typeKey(.escape,modifierFlags:[])
                    window.buttons["drift.next-frame"].click()
                case "edit-undo","look-undo":window.buttons["Undo"].click()
                case "edit-undo-enter","edit-undo-redo":app.typeKey("z",modifierFlags:.command)
                case "edit-redo-reorder":app.typeKey("z",modifierFlags:[.command,.shift])
                case "edit-undo-reorder":
                    app.menuBars.menuBarItems["Edit"].click();app.menuItems["Undo"].click()
                case "edit-reorder":
                    // The inspector repeats the selected filename. Scope to the
                    // sidebar so this drags the row, not selectable inspector text.
                    XCTAssertTrue(media.waitForExistence(timeout:10))
                    let source=media.staticTexts[try XCTUnwrap(step["sourceMedia"] as? String)].firstMatch
                    let target=media.staticTexts[try XCTUnwrap(step["targetMedia"] as? String)].firstMatch
                    let start=source.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5))
                    let before=target.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0)).withOffset(CGVector(dx:0,dy:-5))
                    start.press(forDuration:1,thenDragTo:before)
                case "look-start","look-restart":
                    if choice=="look-start"{try selectInspector("Look",in:window);try click("drift.look-audition")}
                    try click("drift.world")
                    app.menuItems[try XCTUnwrap(step["world"] as? String)].firstMatch.click()
                case "look-original","look-preview":try click("drift.look-original")
                case "look-cancel":window.buttons["Cancel"].click()
                case "look-seek":
                    let field=window.textFields["Frame"];replace(field,"7");field.typeKey(.return,modifierFlags:[])
                case "look-apply":window.buttons["Apply Look"].click()
                default:XCTFail("Unexpected editor proof step")
                }
            }
            try awaitValue("native document/media/output result",timeout:480){self.json(root.appendingPathComponent("RESULT.json")) != nil || app.state == .notRunning}
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
