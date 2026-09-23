from pathlib import Path
R=Path('.')
def edit(path,old,new):
 p=R/path;s=p.read_text();assert old in s,(path,old[:100]);p.write_text(s.replace(old,new,1))
app='macos/NativeCore/Sources/DriftApplication/'
edit(app+'SlideInspector.swift','''if let value=selected.first?.aspect{ratio="\\(value.numerator):\\(value.denominator)"}''','''if let value=selected.first?.aspect{ratio=value==CanvasSize.wideDeck.ratio ? "2576:1080":"\\(value.numerator):\\(value.denominator)"}''')
edit(app+'SlideInspector.swift','''TextField("Width × height, pixels",text:$pair).driftType(.input).textFieldStyle(DriftFieldStyle()).onSubmit(apply)''','''TextField("Width × height, pixels",text:$pair).driftType(.input).textFieldStyle(DriftFieldStyle()).onSubmit(apply).accessibilityIdentifier("drift.canvas-pixels")''')
edit(app+'SlideInspector.swift','''Button("Apply",action:apply).keyboardShortcut(.defaultAction)''','''Button("Apply",action:apply).keyboardShortcut(.defaultAction).accessibilityIdentifier("drift.apply-canvas")''')
edit(app+'EditorAcceptance.swift','''        try NativeApplicationProof.require(editor.issue==nil,"focused editor operations complete without an issue")
        return''','''        try NativeApplicationProof.require(editor.issue==nil,"focused editor operations complete without an issue")
        editor.selection=[ids[0]]
        editor.change("Legacy framing fixture"){$0.slides[0].framePolicy = .matchCanvas;$0.slides[0].aspect=nil}
        try step("geometry-custom")
        try await NativeApplicationProof.wait("real Custom slide frame selection"){
            editor.project.slides[0].framePolicy == .ratio && editor.project.slides[0].aspect==CanvasSize.wideDeck.ratio
        }
        try step("geometry-ratio")
        let custom=try ExactRatio(16,9)
        try await NativeApplicationProof.wait("real custom ratio Set"){editor.project.slides[0].aspect==custom}
        try step("geometry-invalid")
        try await NativeApplicationProof.wait("invalid ratio is reported without closing app"){editor.issue != nil}
        try NativeApplicationProof.require(editor.project.slides[0].aspect==custom,"invalid ratio preserves accepted dimensions")
        editor.issue=nil
        let slideFrames=editor.project.slides,card=editor.project.creative.card
        try step("geometry-canvas")
        let resized=try CanvasSize(width:720,height:1280)
        try await NativeApplicationProof.wait("real output-only canvas resize"){editor.project.canvas==resized}
        try NativeApplicationProof.require(editor.project.slides==slideFrames && editor.project.creative.card==card,"output size does not mutate slide frames or cached creative aspect")
        let beforeTrain=try editor.project.contentIdentity()
        try step("geometry-train")
        try await NativeApplicationProof.wait("real Instagram train preset"){
            editor.project.canvas == .portrait && editor.project.slides.allSatisfy{$0.aspect==CanvasSize.wideDeck.ratio}
        }
        try NativeApplicationProof.require(editor.project.creative.motion.transport.axis=="vertical" && editor.project.creative.motion.path.gap==0.06,"train uses close vertical geometry")
        let poses=editor.snapshot.plan.movingPoses(baseSeconds:0)
        if let a=poses.first(where:{$0.slot==0}),let b=poses.first(where:{$0.slot==1}){
            try NativeApplicationProof.require(abs(abs(a.y-b.y)-(a.height+b.height)*0.53)<0.0001,"actual document plan has six-percent edge gap")
        }else{throw NativeFailure.message("Train preview did not produce adjacent frames.")}
        try step("geometry-train-undo")
        try await NativeApplicationProof.wait("one real Undo of Instagram train"){
            (try? editor.project.contentIdentity())==beforeTrain
        }
        try NativeApplicationProof.require(editor.issue==nil,"custom dimensions and output edits remain usable")
        return''')
edit(app+'EditorAcceptance.swift','''return "Real focused Enter/blur/Escape''','''return "Real Custom frame selection, ratio Set, invalid-input rejection, independent output resizing and Instagram train/Undo; focused Enter/blur/Escape''')
edit('macos/AcceptanceUI/NativeJourneyUITests.swift','''"look-apply","look-undo"]''','''"look-apply","look-undo","geometry-custom","geometry-ratio","geometry-invalid","geometry-canvas","geometry-train","geometry-train-undo"]''')
edit('macos/AcceptanceUI/NativeJourneyUITests.swift','''                case "look-apply":window.buttons["Apply Look"].click()
                default:''','''                case "look-apply":window.buttons["Apply Look"].click()
                case "geometry-custom":
                    try selectInspector("Slide",in:window);try click("drift.slide-frame")
                    let item=app.menuItems["Custom"].firstMatch
                    XCTAssertTrue(item.waitForExistence(timeout:10));item.click()
                case "geometry-ratio","geometry-invalid":
                    let field=window.textFields["drift.slide-ratio"]
                    replace(field,choice=="geometry-ratio" ? "16:9":"0:1920")
                    try click("drift.set-slide-ratio")
                case "geometry-canvas":
                    try click("drift.canvas-size")
                    replace(window.textFields["drift.canvas-pixels"],"720 × 1280")
                    try click("drift.apply-canvas")
                case "geometry-train":
                    try click("drift.canvas-size");try click("drift.instagram-train")
                case "geometry-train-undo":
                    let shot=XCTAttachment(screenshot:window.screenshot());shot.name="Portrait output with wide vertical train";shot.lifetime = .keepAlways;add(shot)
                    window.buttons["Undo"].click()
                default:''')
p=R/'.github/workflows/source-release.yml';s=p.read_text()
s=s.replace('''on:
  workflow_dispatch:''','''on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]
  workflow_dispatch:''')
s=s.replace('''  publish:
    runs-on:''','''  publish:
    # User-authorized hotfix only. All other releases still need explicit dispatch.
    if: >-
      github.event_name == 'workflow_dispatch' ||
      (github.event.workflow_run.conclusion == 'success' &&
       github.event.workflow_run.event == 'push' &&
       github.event.workflow_run.head_repository.full_name == github.repository &&
       contains(github.event.workflow_run.head_commit.message, '[release-0.5.1]'))
    runs-on:''')
s=s.replace('''RELEASE_SHA: ${{ inputs.source_commit }}''','''RELEASE_SHA: ${{ github.event.workflow_run.head_sha || inputs.source_commit }}''')
s=s.replace('''BUILD_RUN: ${{ inputs.build_run }}''','''BUILD_RUN: ${{ github.event.workflow_run.id || inputs.build_run }}''')
s=s.replace('''RELEASE_PRERELEASE: ${{ inputs.prerelease }}''','''RELEASE_PRERELEASE: ${{ github.event_name == 'workflow_run' && 'false' || format('{0}', inputs.prerelease) }}''')
s=s.replace('''ref: ${{ inputs.source_commit }}''','''ref: ${{ env.RELEASE_SHA }}''')
s=s.replace('''      - name: Verify exact successful CI authority''','''      - name: Restrict automatic publication to the approved hotfix version
        if: github.event_name == 'workflow_run'
        run: python3 -c 'import json; assert json.load(open("package.json"))["version"] == "0.5.1"'
      - name: Verify exact successful CI authority''')
p.write_text(s)
for file in ['package.json','package-lock.json']:
 p=R/file;s=p.read_text();s=s.replace('"version": "0.5.0"','"version": "0.5.1"');p.write_text(s)
changelog='''## [0.5.1] — 2026-09-23

**Portrait train hotfix — stable native release.** New documents use a **1080 × 1920 (9:16) output**, independent **2576 × 1080 slide frames**, and a close, straight **vertical** path. The default gap is six percent of adjacent slide size; zero makes unrotated flat slide edges meet.

Fixes the custom-frame crash caused by overlapping Swift access to the document journal. Native edit transactions now evaluate a separate candidate, preserving validation, Save, Undo/Redo and recovery. Invalid and extreme ratios report an error without replacing accepted state. Custom framing no longer resets to the output ratio.

The motion evaluator now derives spacing, loop seams, reveal and culling from the actual per-slide frame geometry, including mixed source/custom sizes and per-slide size offsets. Output resizing no longer rewrites slide geometry. World and Recut retain the directed axis and direction. Preview and export share the corrected frame plan; its layout is cached per snapshot and drawn instances remain bounded.

Existing saved dimensions are preserved, not silently migrated. Open the output-size dialog and choose **Use Instagram train** to set portrait output, all slide frames to 2576 × 1080 and a close vertical path in one undoable edit. Originals, crops, Pin, Spotlight and Closing assignments are kept. The 0.5.0 native studio interface remains included.

Publication requires the complete native integration, real archived-app UI journey (including Custom/Set/invalid ratio/output resize/train/Undo), and mounted-DMG checks for the exact current main commit. Assets are published from those tested bytes without rebuilding. This is **ad-hoc signed and unnotarized**, for Apple silicon / macOS 13.3+. Hosted tests do not certify physical M1 Pro/M2, minimum-OS, VoiceOver, battery, sleep/wake or external-display acceptance. Source-video audio remains silent; legacy hybrid projects are not migrated.

'''
edit('CHANGELOG.md','## [0.5.0]',changelog+'## [0.5.0]')
edit('README.md',"For the 0.5.0 studio UI candidate, use the [prerelease listing](https://github.com/bomkino/pitchdog-drift/releases) and follow its explicit release-directory installation instructions. Running the installer without that option selects the stable release.\n\n",'')
edit('README.md','''The new-document canvas is **2576 × 1080**; changing World or using Recut never changes those dimensions.''','''New documents use a **1080 × 1920 (9:16) output**, independent **2576 × 1080 slide frames**, and a close **vertical** train. Changing output size never changes slide frames. World and Recut keep the output size and motion axis. For an existing document, click the output dimensions and choose **Use Instagram train**; one Undo restores its previous setup.''')
edit('docs/MACOS_USER_GUIDE.md','''Choose **File → New**. The default canvas is **2576 × 1080**. Click the dimensions in the toolbar for exact dimensions or a ratio; `25.76:10.80` represents `322:135`. A World or Recut changes creative decisions, never canvas dimensions.''','''Choose **File → New**. The output is **1080 × 1920 (9:16)**, each new slide frame is **2576 × 1080**, and motion runs **vertically** with close spacing. These are independent: the output is the Instagram frame, and the wide slides travel through it.

Click the output dimensions in the toolbar to enter **integer output pixels**. To change a slide frame, select one or more slides and use **Slide → Slide frame → Custom**, enter `2576:1080` or an exact decimal ratio such as `25.76:10.80`, then press **Set**. Both represent `322:135`. **Source** uses each original's aspect; **Match canvas** deliberately uses the output aspect. Output resizing does not rewrite these choices. World and Recut preserve output dimensions and motion direction.

For an existing project, open the output-size dialog and choose **Use Instagram train**. This explicitly sets portrait output, all slide frames to 2576 × 1080 and a close straight vertical path; one Undo restores the entire previous setup. Media originals, crops and presentation roles stay intact. Nothing is silently converted on opening a saved document.

In **Motion → Path**, Gap is proportional to the adjacent slides' actual dimensions. The train default is `0.06`; `0` makes edges touch on a flat, unrotated path. Depth, focus enlargement, banking and other authored optical treatments can change the visible projected separation.''')
(R/'docs/STATUS.md').write_text('''# Drift — current state

23 September 2026 · `bomkino/pitchdog-drift`

## Portrait train hotfix: 0.5.1

The current source retains the 0.5.0 native studio interface and fixes the custom-frame transaction crash, independent output/slide sizing and per-slide motion geometry. New documents use 1080 × 1920 output, 2576 × 1080 slide frames and close vertical motion. Existing projects keep saved choices; the output-size dialog offers an explicit undoable Instagram train conversion.

The [latest stable release](https://github.com/bomkino/pitchdog-drift/releases/latest), its exact-source `MacReleaseReceipt.json` and the associated successful main CI run are the publication authority. A source commit or this page is not evidence of a published installer. Version 0.5.1 publication is authorized only after its complete exact-main source, native integration, archived-app UI and mounted-installer checks succeed. No rebuild occurs between testing and release.

Native controls still use PitchdogStudioUI at immutable revision `8f296630180ea4dbc77fe65a9c86e88a5b9bb9c0`. The app owns fonts, media, audio, rendering and document state. No web runtime is shipped. See the [user guide](MACOS_USER_GUIDE.md), [architecture](ARCHITECTURE.md), [release procedure](MACOS_RELEASE.md) and [changelog](../CHANGELOG.md).

Hosted checks do not certify minimum macOS 13.3, physical M1 Pro/M2, VoiceOver, battery, sleep/wake or external-display acceptance. The app remains ad-hoc signed and unnotarized; Developer ID/notarization is a separate protected lane. Legacy hybrid projects are not migrated and source-video audio remains silent. Publication does not replace an app already installed on a user's Mac.

Historical tags, handovers and release receipts are retained for rollback and provenance.
''')
print('UI regression, stable release wiring, versions and docs complete')
