import AppKit
import Darwin
import DriftCore
import DriftNative

/// The external XCTest driver operates the real focused controls. Assertions
/// here read the owning document, so a plausible-looking field is not proof.
@MainActor enum EditorAcceptance {
    static func run(document:DriftDocument,root:URL)async throws->String{
        guard let editor=document.editor,let transport=document.transport,let window=document.windowControllers.first?.window else{throw NativeFailure.message("Editor acceptance needs its native document.")}
        let original=editor.project,workspace=editor.workspace,wasDirty=editor.dirty
        let frame=transport.frame
        defer{transport.pause();try? editor.load(original,workspace:workspace,saved:!wasDirty);transport.seek(frame)}
        let ids=original.slides.map(\.id)
        try NativeApplicationProof.require(ids.count>=2,"editor acceptance has independent targets")
        transport.pause();editor.selection=[ids[0]]
        let initial=editor.journal.past.count
        func step(_ choice:String,_ extra:[String:String]=[:])throws{
            var value=extra;value["choice"]=choice;value["window"]=window.title
            try JSONSerialization.data(withJSONObject:value).write(to:root.appendingPathComponent("UI_STEP.json"),options:.atomic)
        }
        try step("edit-enter")
        try await NativeApplicationProof.wait("real numeric Enter"){editor.project.slides[0].focalX==0.25}
        try NativeApplicationProof.require(editor.journal.past.count==initial+1,"Enter creates one authored edit")
        try step("edit-blur",["nextMedia":editor.project.assets[editor.project.slides[1].assetID]!.name])
        try await NativeApplicationProof.wait("numeric blur onto another selection"){editor.selection==[ids[1]] && editor.project.slides[0].focalX==0.4}
        try NativeApplicationProof.require(editor.project.slides[1].focalX==original.slides[1].focalX,"blur retains its focused target")
        let beforeEscape=try editor.project.contentIdentity(),epoch=transport.seekEpoch
        try step("edit-escape")
        try await NativeApplicationProof.wait("Escape and real frame acknowledgement"){transport.seekEpoch>epoch}
        try NativeApplicationProof.require(try editor.project.contentIdentity()==beforeEscape,"Escape discards numeric draft")
        try step("edit-undo")
        try await NativeApplicationProof.wait("one real Undo after blur"){editor.project.slides[0].focalX==0.25}
        try NativeApplicationProof.require(editor.journal.past.count==initial+1,"Enter followed by blur did not duplicate its edit")
        try step("edit-undo-enter")
        try await NativeApplicationProof.wait("real Undo of Enter"){editor.project.slides[0].focalX==original.slides[0].focalX}
        try NativeApplicationProof.require(try editor.project.contentIdentity()==original.contentIdentity(),"two numeric Undos restore all authored content")

        editor.change("Acceptance playback loop"){$0.direction.mode = .loop}
        let base=editor.project,baseIdentity=try base.contentIdentity(),history=editor.journal.past.count
        guard let world=editor.catalog.worlds.first(where:{$0.pressure==base.worldPressure && $0.scene==base.worldScene && $0.worldID != base.worldID}) else{throw NativeFailure.message("A second authored World is required.")}
        transport.seek(0);transport.play()
        try step("look-start",["world":world.label])
        try await NativeApplicationProof.wait("real World audition pauses playback"){editor.lookAudition != nil && !transport.playing}
        try NativeApplicationProof.require(try editor.project.contentIdentity()==baseIdentity,"audition leaves accepted content untouched")
        try NativeApplicationProof.require(editor.journal.past.count==history,"audition adds no undo entry")
        try step("look-original")
        try await NativeApplicationProof.wait("real Original comparison"){editor.lookAudition?.showOriginal==true}
        try NativeApplicationProof.require(try editor.displaySnapshot.project.contentIdentity()==baseIdentity,"Original displays accepted content")
        try step("look-preview")
        try await NativeApplicationProof.wait("real audition comparison"){editor.lookAudition?.showOriginal==false}
        try NativeApplicationProof.require(try editor.displaySnapshot.project.contentIdentity() != baseIdentity,"comparison returns to audition")
        try step("look-cancel")
        try await NativeApplicationProof.wait("real Cancel resumes unchanged transport"){editor.lookAudition==nil && transport.playing}
        try NativeApplicationProof.require(try editor.project.contentIdentity()==baseIdentity,"Cancel keeps accepted content")
        try step("look-restart",["world":world.label])
        try await NativeApplicationProof.wait("second real World audition"){editor.lookAudition != nil && !transport.playing}
        let auditionIdentity=try editor.lookProject.contentIdentity(),seekEpoch=transport.seekEpoch
        try step("look-seek")
        try await NativeApplicationProof.wait("newer real user seek during audition"){transport.frame==7 && transport.seekEpoch>seekEpoch}
        try step("look-apply")
        try await NativeApplicationProof.wait("real Apply Look"){editor.lookAudition==nil && editor.journal.past.count==history+1}
        try NativeApplicationProof.require(try editor.project.contentIdentity()==auditionIdentity,"Apply commits the audition exactly once")
        try await Task.sleep(nanoseconds:150_000_000)
        try NativeApplicationProof.require(!transport.playing && transport.frame==7,"Apply respects the newer user seek")
        try step("look-undo")
        try await NativeApplicationProof.wait("one real Undo of Apply Look"){editor.journal.past.count==history}
        try NativeApplicationProof.require(try editor.project.contentIdentity()==baseIdentity,"one Undo restores the complete prior Look")
        try NativeApplicationProof.require(editor.issue==nil,"focused editor operations complete without an issue")
        return "Real focused Enter/blur/Escape retain selection ownership and single Undo; Look A/B, Cancel/resume and Apply/Undo preserve accepted content and newer user seeks"
    }

    static func repeatPreview(document:DriftDocument,output:URL)async throws->String{
        guard let editor=document.editor,let transport=document.transport,let window=document.windowControllers.first?.window else{throw NativeFailure.message("Repeated preview needs its native document.")}
        let original=editor.project,workspace=editor.workspace,wasDirty=editor.dirty,frame=transport.frame
        defer{transport.pause();try? editor.load(original,workspace:workspace,saved:!wasDirty);transport.seek(frame)}
        transport.pause()
        var peaks:[Int64]=[],durations:[Double]=[]
        for pass in 0..<3{
            let started=ProcessInfo.processInfo.systemUptime
            for (index,world) in editor.catalog.worlds.enumerated(){
                editor.change("Repeated World preview"){$0.applyWorld(world,catalog:editor.catalog)}
                let target=Int64(index+pass*editor.catalog.worlds.count)%transport.totalFrames
                transport.seek(target);window.contentView?.layoutSubtreeIfNeeded()
                try await NativeApplicationProof.wait("repeated native World preview"){
                    window.contentView.flatMap{NativeApplicationProof.canvas(in:$0)}?.displayedFrame==target
                }
                try NativeApplicationProof.require(editor.issue==nil,"repeated native preview remains usable")
            }
            var usage=rusage();getrusage(RUSAGE_SELF,&usage);peaks.append(Int64(usage.ru_maxrss))
            durations.append(ProcessInfo.processInfo.systemUptime-started)
        }
        let growth=max(0,peaks[2]-peaks[0])
        let metrics:[String:Any]=["worldsPerPass":editor.catalog.worlds.count,"passes":3,"peakRSSBytes":peaks,"peakGrowthAfterWarmupBytes":growth,"secondsPerPass":durations,"fixture":"same six synthetic originals; 320x256 authored canvas; real document and window preview"]
        try JSONSerialization.data(withJSONObject:metrics,options:[.prettyPrinted,.sortedKeys]).write(to:output.appendingPathComponent("Repeated-Preview-Metrics.json"),options:.atomic)
        try NativeApplicationProof.require(growth<256*1024*1024,"repeated native preview stays within 256 MiB growth after warmup")
        return "Three actual document/window preview passes across every World complete without errors and below 256 MiB peak growth after warmup"
    }
}
