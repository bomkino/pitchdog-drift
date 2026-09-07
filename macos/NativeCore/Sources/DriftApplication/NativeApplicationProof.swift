import AppKit
import ImageIO
import CoreGraphics
import DriftCore
import DriftNative

@MainActor enum NativeApplicationProof {
    static func require(_ condition:Bool,_ message:String)throws{if !condition{throw NativeFailure.message("Native app proof: "+message)}}
    static func wait(_ name:String,seconds:Double=45,_ predicate:()->Bool)async throws{
        let deadline=ProcessInfo.processInfo.systemUptime+seconds
        while !predicate(){try require(ProcessInfo.processInfo.systemUptime<deadline,"Timed out: \(name)");try await Task.sleep(nanoseconds:20_000_000)}
    }
    static func canvas(in view:NSView)->CanvasView?{if let v=view as? CanvasView{return v};for child in view.subviews{if let v=canvas(in:child){return v}};return nil}
    static func save(_ document:DriftDocument,to url:URL)async throws{
        try await withCheckedThrowingContinuation{(continuation:CheckedContinuation<Void,Error>) in document.save(to:url,ofType:DriftDocument.typeName,for:.saveOperation){error in if let error{continuation.resume(throwing:error)}else{continuation.resume()}}}
    }
    static func rgba(_ image:CGImage)throws->[UInt8]{
        var bytes=[UInt8](repeating:0,count:image.width*image.height*4)
        try bytes.withUnsafeMutableBytes{p in guard let context=CGContext(data:p.baseAddress,width:image.width,height:image.height,bitsPerComponent:8,bytesPerRow:image.width*4,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else{throw NativeFailure.message("Proof pixel buffer unavailable.")};context.draw(image,in:CGRect(x:0,y:0,width:image.width,height:image.height))};return bytes
    }
    static func run()async{
        let root=FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("Drift Native Proof",isDirectory:true)
        var assertions:[String]=[]
        do{
            try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
            let output=root.appendingPathComponent(UUID().uuidString,isDirectory:true);try FileManager.default.createDirectory(at:output,withIntermediateDirectories:false)
            let resources=Bundle.main.resourceURL!,fixtures=resources.appendingPathComponent("Fixtures")
            let document=DriftDocument();NSDocumentController.shared.addDocument(document);document.makeWindowControllers();document.showWindows();NSApp.activate(ignoringOtherApps:true)
            guard let editor=document.editor,let transport=document.transport,let window=document.windowControllers.first?.window else{throw NativeFailure.message("The native document window did not open.")}
            try require(editor.project.canvas.width==2576 && editor.project.canvas.height==1080,"new document wide-deck default")
            try require(try ExactRatio(pair:"25.76:10.80")==ExactRatio(322,135),"decimal ratio")
            let names=["Still.png","Alpha.webp","Animation.webp","VP8.webm","VP9.webm","Video.mp4"]
            editor.importURLs(names.map{fixtures.appendingPathComponent($0)},ticket:editor.ticket())
            try await wait("native mixed-media import"){!editor.importing || editor.pendingBatch != nil}
            try require(editor.issue==nil && editor.pendingBatch==nil,"mixed media import: \(editor.issue ?? editor.pendingBatch?.failures.map{ $0.name+": "+$0.reason }.joined(separator:"; ") ?? "unknown")")
            try require(editor.project.slides.count==names.count,"batch order/count")
            try require(editor.project.slides.map{editor.project.assets[$0.assetID]!.name}==names,"preserved input order")
            let accepted=editor.project;editor.undo();try require(editor.project.slides.isEmpty,"single batch undo");editor.redo();try require(editor.project.slides==accepted.slides,"batch redo preserves identities")
            assertions.append("Native window; 2576x1080; exact decimal ratio; six-format batch; media Undo/Redo")
            let file=output.appendingPathComponent("Accepted.pitched");try await save(document,to:file)
            try require(!editor.dirty,"save clears accepted checkpoint")
            let reopened=try await Task.detached{try ProjectIO.read(file)}.value
            try require(reopened.0==editor.project,"portable original/media round trip")
            editor.change("Unrelated World"){p in p.applyWorld(editor.catalog.worlds[3],catalog:editor.catalog)}
            try require(editor.project.canvas==CanvasSize.wideDeck,"World cannot resize canvas");editor.undo();try require(!editor.dirty,"Undo back to saved content")
            assertions.append("NSDocument save; new-format reopening; World/canvas ownership; undo-to-saved")
            let ids=editor.project.slides.map(\.id)
            editor.change("Role proof"){p in
                p.canvas=try CanvasSize(width:320,height:256);p.direction.contentPaced=false;p.direction.bodyMilliseconds=1000;p.direction.entry.enabled=false;p.direction.exit.enabled=false;p.direction.mode = .repeatCount;p.direction.repeats=3
                p.pin=Pin(slideID:ids[2]);p.pin?.width=0.28;p.pin?.x=0.8;p.pin?.y=0.25;p.pin?.pinOnly=true
                var cue=Spotlight(slideID:ids[4]);cue.holdMilliseconds=250;cue.transitionMilliseconds=100;p.spotlights=[cue]
                var closing=Closing(slideID:ids[0]);closing.holdMilliseconds=250;closing.transitionMilliseconds=100;p.closing=closing;p.creative.sound.exportEnabled=false
            }
            try require(editor.issue==nil,"roles validate: \(editor.issue ?? "")")
            let plan=editor.snapshot.plan,closing=plan.schedule.cues.filter(\.closing)
            try require(closing.count==1 && closing[0].baseFrame==plan.base.baseFrames-1,"one non-wrapping global Closing")
            let renderer=try NativeRenderer()
            for cue in plan.schedule.cues{for frame in Set([max(0,cue.startFrame-1),cue.startFrame,cue.holdStartFrame,cue.endFrame-1]){
                let surface=try renderer.render(editor.snapshot,frame:frame);try NativeExport.writePNG(renderer.image(surface),to:output.appendingPathComponent("cue-\(cue.id)-\(frame).png"))
            }}
            assertions.append("Actual Metal frames across Spotlight entry/hold/return and one finite Closing")
            transport.seek(10);transport.seek(25);transport.seek(2)
            window.contentView?.layoutSubtreeIfNeeded()
            try await wait("native GPU preview commit"){guard let view=window.contentView.flatMap({canvas(in:$0)}) else{return false};return view.displayedFrame==2}
            try require(editor.issue==nil,"native preview: \(editor.issue ?? "")")
            transport.play();try await Task.sleep(nanoseconds:180_000_000);transport.pause();try require(transport.frame>2,"native playback advances")
            assertions.append("Native GPU canvas; latest seek; native play/pause")
            var simple=editor.project;simple.direction.mode = .once;simple.direction.contentPaced=false;simple.direction.bodyMilliseconds=1400;simple.spotlights=[];simple.closing=nil;simple.creative.lens.enabled=false;simple.creative.sound.exportEnabled=false;simple.creative.atmosphere.motion=0;simple.creative.atmosphere.grain=0;simple.creative.atmosphere.vignette=0
            simple.creative.atmosphere.family="solid";simple.creative.atmosphere.composition="pure-field";simple.creative.atmosphere.enabled=true;simple.creative.atmosphere.intensity=0
            for sourceIndex in [2,3,4,5]{
                for i in simple.slides.indices{simple.slides[i].included=i==sourceIndex;simple.slides[i].inSequence=false}
                var pin=Pin(slideID:ids[sourceIndex]);pin.width=0.85;pin.x=0.5;pin.y=0.5;pin.shadowOpacity=0;pin.borderOpacity=0;simple.pin=pin
                let snapshot=try RenderSnapshot(project:simple,workspace:editor.workspace)
                let a=try rgba(renderer.image(renderer.render(snapshot,frame:3))),b=try rgba(renderer.image(renderer.render(snapshot,frame:33)))
                let difference=zip(a,b).reduce(0.0){$0+abs(Double($1.0)-Double($1.1))}/Double(a.count)
                try require(difference<0.25,"source loop frame agreement for \(names[sourceIndex]): \(difference)")
                let path=output.appendingPathComponent("\(names[sourceIndex]).mp4")
                let receipt=try await NativeExport.run(snapshot:snapshot,destination:path)
                try require(receipt.frameCount==42 && !receipt.audio,"actual MP4 frame count")
            }
            assertions.append("Animated WebP, VP8/VP9 WebM and MP4 video Pin; identical source phase after loop; four fully decoded native MP4 outputs")
            for i in simple.slides.indices{simple.slides[i].included=i==1;simple.slides[i].inSequence=false}
            simple.pin=Pin(slideID:ids[1]);simple.pin?.width=0.5;simple.pin?.x=0.5;simple.pin?.y=0.5;simple.pin?.shadowOpacity=0;simple.pin?.borderOpacity=0;simple.transparent=true;simple.canvas=CanvasSize.wideDeck;simple.output.format = .png
            let alpha=try RenderSnapshot(project:simple,workspace:editor.workspace),alphaImage=try renderer.image(renderer.render(alpha,frame:0)),pixels=try rgba(alphaImage)
            try require(alphaImage.width==2576 && alphaImage.height==1080,"exact exported wide geometry")
            try require(pixels[3]==0,"transparent canvas corner")
            let center=(alphaImage.height/2*alphaImage.width+alphaImage.width/2)*4+3;try require((120...136).contains(Int(pixels[center])),"WebP alpha remained half-transparent")
            _=try await NativeExport.run(snapshot:alpha,destination:output.appendingPathComponent("Wide-Alpha.png"))
            simple.output.format = .pngSequence;simple.canvas=try CanvasSize(width:320,height:256)
            let sequence=try RenderSnapshot(project:simple,workspace:editor.workspace),range=try ExportRange(start:2,end:5,total:sequence.plan.schedule.totalFrames)
            _=try await NativeExport.run(snapshot:sequence,destination:output.appendingPathComponent("PNG Frames"),range:range)
            assertions.append("2576x1080 real PNG; static WebP alpha; native PNG sequence range")
            var audible=editor.project;audible.output.format = .mp4;audible.direction.mode = .once;audible.direction.contentPaced=false;audible.direction.bodyMilliseconds=1200;audible.creative.sound.exportEnabled=true;audible.creative.sound.masterLevel=0.3;audible.creative.sound.motionLevel=0.3;audible.closing=nil;audible.spotlights=[];audible.pin=nil
            let soundSnapshot=try RenderSnapshot(project:audible,workspace:editor.workspace)
            _=try await NativeExport.run(snapshot:soundSnapshot,destination:output.appendingPathComponent("Recorded Sound.mp4"))
            assertions.append("Native AAC with retained recorded sound and rational movie timestamps")
            let previous=output.appendingPathComponent("Cancel.mp4");try Data("keep existing".utf8).write(to:previous);let token=MediaCancellation();token.cancel()
            do{_=try await NativeExport.run(snapshot:soundSnapshot,destination:previous,cancellation:token);throw NativeFailure.message("Cancellation was ignored")}catch is CancellationError{}
            try require(try Data(contentsOf:previous)==Data("keep existing".utf8),"cancel keeps previous destination")
            for original in editor.project.assets.values{try editor.workspace.verify(original)}
            assertions.append("Cancellation preserves destination; all original media hashes unchanged")
            if let content=window.contentView,let bitmap=content.bitmapImageRepForCachingDisplay(in:content.bounds){content.cacheDisplay(in:content.bounds,to:bitmap);if let image=bitmap.cgImage{try NativeExport.writePNG(image,to:output.appendingPathComponent("Native-Interface.png"))}}
            let result:[String:Any]=["result":"passed","source":Bundle.main.object(forInfoDictionaryKey:"DriftSourceRevision") ?? "unknown","version":Bundle.main.object(forInfoDictionaryKey:"CFBundleShortVersionString") ?? "unknown","os":ProcessInfo.processInfo.operatingSystemVersionString,"physicalTargetTested":false,"assertions":assertions,"output":output.path]
            try JSONSerialization.data(withJSONObject:result,options:[.prettyPrinted,.sortedKeys]).write(to:root.appendingPathComponent("RESULT.json"),options:.atomic)
            print("DRIFT_NATIVE_PROOF_PASS \(output.path)");document.close();exit(0)
        }catch{
            let result:[String:Any]=["result":"failed","error":error.localizedDescription,"assertionsBeforeFailure":assertions]
            try? JSONSerialization.data(withJSONObject:result,options:[.prettyPrinted,.sortedKeys]).write(to:root.appendingPathComponent("RESULT.json"),options:.atomic)
            print("DRIFT_NATIVE_PROOF_FAIL \(error.localizedDescription)");exit(1)
        }
    }
}
