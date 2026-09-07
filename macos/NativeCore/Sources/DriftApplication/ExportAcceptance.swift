import AppKit
import Foundation
import DriftCore
import DriftNative

@MainActor enum ExportAcceptance {
    static func run(snapshot:RenderSnapshot,output:URL)async throws->String{
        var project=snapshot.project
        project.canvas=try CanvasSize(width:320,height:256);project.output.format = .png
        let captured=try RenderSnapshot(project:project,workspace:snapshot.workspace)
        let fileA=output.appendingPathComponent("Export Owner A.pitched"),fileB=output.appendingPathComponent("Export Owner B.pitched")
        try await Task.detached{try ProjectIO.write(captured,to:fileA);try ProjectIO.write(captured,to:fileB)}.value
        var a:DriftDocument?=try await DocumentAcceptance.open(fileA)
        let b=try await DocumentAcceptance.open(fileB)
        defer{a?.close();b.close()}
        guard let ownerID=a?.editor?.id,let bEditor=b.editor,let frozen=a?.editor?.snapshot else{throw NativeFailure.message("Export acceptance documents did not initialize.")}
        try NativeApplicationProof.require(ownerID != bEditor.id && frozen.project.id==bEditor.project.id,"independent open copies have distinct live export owners")
        let other=bEditor.project,center=ExportCenter.shared,destination=output.appendingPathComponent("Owned Export.png")
        try center.start(snapshot:frozen,destination:destination,range:nil,stillFrame:0,ownerID:ownerID,ownerName:"Export Owner A")
        b.showWindows();b.windowForSheet?.makeKeyAndOrderFront(nil)
        // Edit and release A before its worker can return to the main actor.
        // Neither B nor the foreground window becomes the owner of A's job.
        a?.editor?.change("Edit while exporting"){$0.canvas=try CanvasSize(width:160,height:128)}
        a?.close();a=nil
        try await NativeApplicationProof.wait("export after its document closes"){!center.busy}
        guard let receipt=center.receipt else{throw NativeFailure.message(center.error ?? "Export returned no receipt.")}
        try NativeApplicationProof.require(center.ownerID==ownerID && !center.belongs(to:bEditor),"receipt stays with its initiating live document, including independent copies")
        try NativeApplicationProof.require(receipt.documentID==project.id && receipt.width==320 && receipt.height==256 && receipt.frameCount==1,"export uses its immutable captured canvas and project")
        try NativeApplicationProof.require(bEditor.project==other && !bEditor.dirty,"export and A's close do not change B")
        try await Task.detached{try NativeExport.verifyPNG(destination,width:320,height:256)}.value
        center.clear()
        try NativeApplicationProof.require(center.ownerID==nil && center.receipt==nil,"dismissed receipt clears its owner")
        return "Actual export retains A's snapshot after switching to independent copy B, editing and closing A; receipt is not assigned to B"
    }
}
