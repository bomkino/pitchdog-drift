import AppKit
import Foundation
import DriftCore
import DriftNative

/// Synthetic checks call the actual NSDocument save/open path. The barrier is
/// inside its completed-file publication boundary, not an unrelated mock save.
private final class HeldWrite:@unchecked Sendable {
    private let lock=NSLock()
    private let gate=DispatchSemaphore(value:0)
    private var reached=false
    var entered:Bool{lock.lock();defer{lock.unlock()};return reached}
    func inspect()throws{
        guard !Thread.isMainThread else{throw NativeFailure.message("Save performed its filesystem publication on the main thread.")}
        lock.lock();reached=true;lock.unlock()
        guard gate.wait(timeout:.now()+12) == .success else{throw NativeFailure.message("Held Save exceeded its acceptance deadline.")}
    }
    func release(){gate.signal()}
}
@MainActor private final class CloseDecision:NSObject {
    var result:Bool?
    @objc func document(_ document:NSDocument,shouldClose:Bool,contextInfo:UnsafeMutableRawPointer?){result=shouldClose}
}
@MainActor enum DocumentAcceptance {
    private static func mark(_ step:String){
        try? FileHandle.standardOutput.write(contentsOf:Data("DRIFT_DOCUMENT_CHECK \(step)\n".utf8))
    }
    private static func require(_ value:Bool,_ message:String)throws{try NativeApplicationProof.require(value,message)}
    private static func save(_ document:DriftDocument,to url:URL,operation:NSDocument.SaveOperationType = .saveOperation)async throws{
        try await withCheckedThrowingContinuation{(c:CheckedContinuation<Void,Error>) in
            document.save(to:url,ofType:DriftDocument.typeName,for:operation){error in
                if let error{c.resume(throwing:error)}else{c.resume()}
            }
        }
    }
    private static func open(_ url:URL)async throws->DriftDocument{
        try await withCheckedThrowingContinuation{(c:CheckedContinuation<DriftDocument,Error>) in
            NSDocumentController.shared.openDocument(withContentsOf:url,display:true){document,_,error in
                if let error{c.resume(throwing:error)}else if let document=document as? DriftDocument{c.resume(returning:document)}
                else{c.resume(throwing:NativeFailure.message("The current-format document did not open as DriftDocument."))}
            }
        }
    }
    private static func button(in view:NSView?,matching predicate:(NSButton)->Bool)->NSButton?{
        guard let view else{return nil}
        if let button=view as? NSButton,predicate(button){return button}
        for child in view.subviews{if let found=button(in:child,matching:predicate){return found}}
        return nil
    }
    private static func closeDecision(_ document:DriftDocument,cancel:Bool)async throws->Bool{
        let decision=CloseDecision()
        document.canClose(withDelegate:decision,shouldClose:#selector(CloseDecision.document(_:shouldClose:contextInfo:)),contextInfo:nil)
        func choice()->NSButton?{
            button(in:document.windowControllers.first?.window?.attachedSheet?.contentView){button in
                let title=button.title.lowercased().replacingOccurrences(of:"’",with:"'")
                // Untitled AppKit documents label discard as Delete on some
                // macOS versions. This is only the synthetic recovered document.
                return cancel ? title=="cancel":["don't save","delete","discard","discard changes"].contains(title)
            }
        }
        try await NativeApplicationProof.wait("real dirty-document close choice",seconds:8){choice() != nil || decision.result != nil}
        guard let chosen=choice() else{throw NativeFailure.message("The real close sheet did not expose the requested save decision (callback: \(String(describing:decision.result))).")}
        mark("close-choice-"+chosen.title)
        chosen.performClick(nil)
        try await NativeApplicationProof.wait("real close decision callback",seconds:8){decision.result != nil}
        return decision.result!
    }
    static func run(snapshot:RenderSnapshot,output:URL)async throws->[String]{
        let file=output.appendingPathComponent("Document-Acceptance.pitched")
        try await Task.detached{try ProjectIO.write(snapshot,to:file)}.value
        mark("opening-with-document-controller")
        let document=try await open(file)
        defer{document.writeProbe.set(nil);document.close()}
        guard let editor=document.editor else{throw NativeFailure.message("Opened document has no editor.")}
        try require(editor.project==snapshot.project && !editor.dirty,"actual NSDocument open preserves saved state")
        mark("immutable-save-during-edit")
        editor.change("Captured edit"){$0.seed += 1}
        let captured=editor.project,held=HeldWrite()
        document.writeProbe.set{try held.inspect()};defer{held.release()}
        let writing=Task{try await save(document,to:file)}
        try await NativeApplicationProof.wait("held real document Save",seconds:8){held.entered}
        editor.change("Edit during Save"){$0.seed += 1}
        let newer=editor.project
        held.release();try await writing.value;document.writeProbe.set(nil)
        let saved=try await Task.detached{try ProjectIO.read(file).0}.value
        try require(saved==captured && editor.project==newer && editor.dirty,"in-flight Save writes its immutable snapshot and leaves later edits dirty")
        editor.undo();try require(!editor.dirty,"Undo to the concurrently saved checkpoint is clean")
        editor.redo();try require(editor.dirty,"Redo of the later edit is dirty")
        mark("failed-save-preserves-accepted-bytes")
        let before=try Data(contentsOf:file)
        document.writeProbe.set{throw NativeFailure.message("Injected publication failure")}
        var rejected=false
        do{try await save(document,to:file)}catch{rejected=true}
        document.writeProbe.set(nil)
        try require(rejected && editor.dirty && (try Data(contentsOf:file))==before,"failed real Save preserves destination and dirty state")
        mark("save-as")
        let copy=output.appendingPathComponent("Document-Save-As.pitched")
        try await save(document,to:copy,operation:.saveAsOperation)
        try require(!editor.dirty && document.fileURL?.standardizedFileURL==copy.standardizedFileURL,"real Save As changes the bound file and saved checkpoint")
        try require(try Data(contentsOf:file)==before,"Save As does not replace the old project")
        try require(try ProjectIO.read(copy).0==editor.project,"Save As portable content matches current document")
        let named=try Data(contentsOf:copy)
        mark("private-recovery")
        editor.change("Recoverable edit"){$0.seed += 1};let recoveryValue=editor.project
        let recovery=editor.workspace.root.appendingPathComponent("recovery.json")
        try await NativeApplicationProof.wait("private recovery snapshot",seconds:8){
            guard let data=try? Data(contentsOf:recovery),let p=try? DriftProject.decode(data) else{return false};return p==recoveryValue
        }
        try require(try Data(contentsOf:copy)==named,"private recovery does not replace the named project")
        // Simulate a previous process's workspace without granting a second
        // owner deletion authority over this still-open document's directory.
        let recoveryRoot=output.appendingPathComponent("Interrupted-workspace",isDirectory:true),source=editor.workspace
        try await Task.detached{
            let copy=try MediaWorkspace(root:recoveryRoot,temporary:false)
            for original in recoveryValue.assets.values{_=try copy.adopt(original,from:source)}
            try OwnedFiles.writeAtomic(recoveryValue.encoded(),to:copy.root.appendingPathComponent("recovery.json"))
        }.value
        let recovered=try DriftDocument(recoveryRoot:recoveryRoot);NSDocumentController.shared.addDocument(recovered);recovered.makeWindowControllers();recovered.showWindows()
        try require(recovered.editor?.project==recoveryValue && recovered.editor?.dirty==true && recovered.fileURL==nil,"recovery is dirty and untitled, never rebound to the saved original")
        mark("recovered-dont-save")
        let discard=try await closeDecision(recovered,cancel:false)
        try require(discard,"Don't Save permits the recovered untitled document to close")
        recovered.close()
        try require(try Data(contentsOf:copy)==named,"closing recovered document cannot change the named original")
        mark("cancel-close")
        let cancelled=try await closeDecision(document,cancel:true)
        try require(!cancelled && editor.dirty && NSDocumentController.shared.documents.contains(where:{$0 === document}),"Cancel Close retains the live dirty document")
        mark("revert-to-saved")
        try document.revert(toContentsOf:copy,ofType:DriftDocument.typeName)
        try require(!editor.dirty && editor.project==newer && document.fileURL?.standardizedFileURL==copy.standardizedFileURL,"real Revert restores named content, binding and clean checkpoint")
        mark("close-invalidates-held-save")
        editor.change("Close-race edit"){$0.seed += 1}
        let closing=HeldWrite();document.writeProbe.set{try closing.inspect()};defer{closing.release()}
        let lateSave=Task{try await save(document,to:copy)}
        try await NativeApplicationProof.wait("close during real Save",seconds:8){closing.entered}
        document.close();closing.release();rejected=false
        do{try await lateSave.value}catch{rejected=true}
        try require(rejected && (try Data(contentsOf:copy))==named,"closing invalidates a held write before publication")
        return ["Real NSDocument open, immutable in-flight Save with later edits, Undo/Redo saved checkpoint", "Real Save failure and Save As preserve prior bytes; private recovery opens dirty and untitled", "Actual Cancel Close, Don't Save and Revert retain correct document ownership; close invalidates held publication"]
    }
}
