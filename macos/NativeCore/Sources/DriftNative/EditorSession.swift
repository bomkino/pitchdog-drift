import Foundation
import Combine
import DriftCore

public struct ImportFailure:Identifiable,Sendable {public let id=UUID();public let name:String,reason:String}
public struct StagedBatch:Identifiable,Sendable {
    public let id:UUID
    public let workspace:MediaWorkspace
    public let originals:[Original]
    public let failures:[ImportFailure]
    public let ticket:EditTicket
    public let replacementID:String?
    public let expectedFingerprint:String?

    public init(workspace:MediaWorkspace,originals:[Original],failures:[ImportFailure],ticket:EditTicket,replacementID:String?,expectedFingerprint:String?){
        id=UUID();self.workspace=workspace;self.originals=originals;self.failures=failures
        self.ticket=ticket;self.replacementID=replacementID;self.expectedFingerprint=expectedFingerprint
    }
}
public struct LookAudition:Identifiable,Sendable {
    public let id:UUID,name:String,snapshot:RenderSnapshot,ticket:EditTicket
    public var showOriginal:Bool
    init(id:UUID,name:String,snapshot:RenderSnapshot,ticket:EditTicket){
        self.id=id;self.name=name;self.snapshot=snapshot;self.ticket=ticket;showOriginal=false
    }
}
private struct ImportPrepared:Sendable {let workspace:MediaWorkspace,originals:[Original],failures:[ImportFailure]}
public actor RecoveryWriter {
    private var newest:[URL:UInt64]=[:]
    private var disabled=Set<URL>()
    public func finish(_ workspace:MediaWorkspace)throws{disabled.insert(workspace.root);let path=workspace.root.appendingPathComponent("recovery.json");if FileManager.default.fileExists(atPath:path.path){try FileManager.default.removeItem(at:path)}}
    public func write(project:DriftProject,workspace:MediaWorkspace,revision:UInt64,dirty:Bool)throws{
        if disabled.contains(workspace.root){return};if let saved=newest[workspace.root],saved>revision{return};newest[workspace.root]=revision
        let url=workspace.root.appendingPathComponent("recovery.json")
        if dirty{try OwnedFiles.writeAtomic(project.encoded(),to:url)}else if FileManager.default.fileExists(atPath:url.path){try FileManager.default.removeItem(at:url)}
    }
}
@MainActor public final class EditorSession:ObservableObject {
    /// Identity of this open document, not its portable project or file copy.
    public let id=UUID()
    @Published public private(set) var revision:UInt64=0
    @Published public private(set) var presentationRevision:UInt64=0
    @Published public private(set) var lookAudition:LookAudition?
    public var lookProject:DriftProject{lookAudition?.snapshot.project ?? project}
    public var displaySnapshot:RenderSnapshot{
        guard let lookAudition,!lookAudition.showOriginal else{return snapshot}
        return lookAudition.snapshot
    }
    @Published public var selection=Set<String>()
    @Published public var issue:String?
    @Published public private(set) var importing=false
    @Published public private(set) var importStatus=""
    @Published public var pendingBatch:StagedBatch?
    public private(set) var journal:DocumentJournal,workspace:MediaWorkspace,snapshot:RenderSnapshot
    public let catalog:CreativeCatalog
    public var didEdit:(()->Void)?
    private var importTask:Task<Void,Never>?,cancellation:MediaCancellation?,recoveryTask:Task<Void,Never>?
    private let recovery=RecoveryWriter()
    private var closed=false
    private var jsonRevision:UInt64?
    private var jsonSnapshot:Any?
    public var project:DriftProject{journal.project}
    public var dirty:Bool{journal.isDirty}
    public init(project:DriftProject,workspace:MediaWorkspace,saved:Bool=false)throws{
        catalog=try CreativeCatalog.load();journal=try DocumentJournal(project:project,saved:saved);self.workspace=workspace;snapshot=try RenderSnapshot(project:project,workspace:workspace)
    }
    public func ticket(targets:Set<String>=[])->EditTicket{journal.ticket(targets:targets)}
    public func accepts(_ ticket:EditTicket)->Bool{!closed && journal.accepts(ticket)}
    public func auditionLook(_ name:String,_ edit:(inout DriftProject)throws->Void){
        guard !closed else{return}
        do{
            var next=lookProject;try edit(&next)
            let value=try RenderSnapshot(project:next,workspace:workspace)
            lookAudition=LookAudition(id:lookAudition?.id ?? UUID(),name:name,snapshot:value,ticket:lookAudition?.ticket ?? ticket())
            presentationRevision &+= 1
        }catch{issue=error.localizedDescription}
    }
    public func compareLookOriginal(_ show:Bool){guard lookAudition != nil else{return};lookAudition?.showOriginal=show;presentationRevision &+= 1}
    public func cancelLookAudition(){guard lookAudition != nil else{return};lookAudition=nil;presentationRevision &+= 1}
    public func acceptLookAudition(){
        guard let audition=lookAudition else{return}
        guard accepts(audition.ticket),audition.ticket.revision==journal.revision else{cancelLookAudition();issue="The document changed during the Look audition. Newer work was kept.";return}
        cancelLookAudition();change("Apply Look",ticket:audition.ticket){$0=audition.snapshot.project}
    }
    private func refresh()throws{
        cancelLookAudition();presentationRevision &+= 1
        snapshot=try RenderSnapshot(project:journal.project,workspace:workspace);revision=journal.revision;jsonRevision=nil;jsonSnapshot=nil;selection.formIntersection(Set(project.slides.map(\.id)));didEdit?();scheduleRecovery()
    }
    public func change(_ name:String,ticket:EditTicket?=nil,_ edit:(inout DriftProject)throws->Void){
        guard !closed else{return}
        cancelLookAudition()
        do{let before=journal
            if try journal.apply(name,ticket:ticket,edit){do{try refresh()}catch{journal=before;throw error}}
        }catch{issue=error.localizedDescription}
    }
    public func beginGesture(_ name:String){do{try journal.beginGesture(name)}catch{issue=error.localizedDescription}}
    public func endGesture(){do{try journal.finishGesture();try refresh()}catch{issue=error.localizedDescription}}
    public func cancelGesture(){do{try journal.cancelGesture();try refresh()}catch{issue=error.localizedDescription}}
    public func undo(){do{try journal.undo();try refresh()}catch{issue=error.localizedDescription}}
    public func redo(){do{try journal.redo();try refresh()}catch{issue=error.localizedDescription}}
    public func saved(_ project:DriftProject,ticket:EditTicket){guard accepts(ticket) else{return};do{try journal.didSave(project,ticket:ticket);revision=journal.revision;didEdit?();scheduleRecovery()}catch{issue=error.localizedDescription}}
    public func load(_ value:DriftProject,workspace:MediaWorkspace,saved:Bool)throws{
        cancelLookAudition();presentationRevision &+= 1;cancelImport();recoveryTask?.cancel();let next=try RenderSnapshot(project:value,workspace:workspace)
        try journal.load(value,saved:saved);self.workspace=workspace;snapshot=next;jsonRevision=nil;jsonSnapshot=nil;selection=[];revision=journal.revision;didEdit?();scheduleRecovery()
    }
    private func scheduleRecovery(){
        recoveryTask?.cancel();let value=project,ws=workspace,revision=journal.revision,dirty=journal.isDirty,writer=recovery
        recoveryTask=Task { [weak self] in
            do{try await Task.sleep(nanoseconds:350_000_000);try Task.checkCancellation();try await writer.write(project:value,workspace:ws,revision:revision,dirty:dirty)}
            catch is CancellationError{}catch{guard let self,!self.closed else{return};self.issue="Recovery could not be saved: \(error.localizedDescription)"}
        }
    }
    public func importURLs(_ urls:[URL],ticket:EditTicket,replacing:String?=nil,expectedFingerprint:String?=nil){
        guard accepts(ticket),!importing,!urls.isEmpty else{return}
        guard urls.count<=MediaLimits.maximumSlides else{issue="A batch supports at most \(MediaLimits.maximumSlides) media items.";return}
        importing=true;issue=nil;importStatus="Reading \(urls.count) media files";let cancel=MediaCancellation();cancellation=cancel
        importTask=Task { [weak self] in
            do{
                let prepared=try await Task.detached(priority:.userInitiated){
                    let staging=try MediaWorkspace();var originals:[Original]=[],failures:[ImportFailure]=[]
                    for url in urls{
                        try cancel.check()
                        do{originals.append(try MediaInspector.stage(url,in:staging,cancel:cancel))}
                        catch is CancellationError{throw CancellationError()}
                        catch{failures.append(ImportFailure(name:url.lastPathComponent,reason:error.localizedDescription))}
                    }
                    try cancel.check();return ImportPrepared(workspace:staging,originals:originals,failures:failures)
                }.value
                guard let self,self.accepts(ticket),self.cancellation === cancel else{return};try cancel.check()
                let batch=StagedBatch(workspace:prepared.workspace,originals:prepared.originals,failures:prepared.failures,ticket:ticket,replacementID:replacing,expectedFingerprint:expectedFingerprint)
                if batch.failures.isEmpty{self.adopt(batch)}else{self.pendingBatch=batch;self.importStatus="Review \(batch.failures.count) file errors"}
            }catch{guard let self,self.accepts(ticket),self.cancellation === cancel else{return};self.importing=false;self.importTask=nil;self.cancellation=nil;if !(error is CancellationError){self.issue=error.localizedDescription}}
        }
    }
    public func acceptBatch(){guard let batch=pendingBatch else{return};pendingBatch=nil;adopt(batch)}
    private func candidate(_ batch:StagedBatch)throws->DriftProject{
        try check(!batch.originals.isEmpty,"No valid media was found.")
        var next=project
        if let replacing=batch.replacementID{
            try check(batch.originals.count==1,"Replace one slide with exactly one source.")
            guard let index=next.slides.firstIndex(where:{$0.id==replacing}) else{throw NativeFailure.message("The replacement slide no longer exists.")}
            let source=batch.originals[0]
            if let expected=batch.expectedFingerprint{try check(source.sha256==expected,"This is not the missing original. Use Replace to choose different artwork.")}
            next.assets[source.id]=source;next.slides[index].assetID=source.id
            if source.kind == .image{next.slides[index].playback=SourcePlayback()}
            else{
                let duration=source.durationNanoseconds
                next.slides[index].playback.trimInNanoseconds=min(next.slides[index].playback.trimInNanoseconds,max(0,duration-1))
                if let end=next.slides[index].playback.trimOutNanoseconds{next.slides[index].playback.trimOutNanoseconds=max(next.slides[index].playback.trimInNanoseconds+1,min(end,duration))}
            }
            let used=Set(next.slides.map(\.assetID));next.assets=next.assets.filter{used.contains($0.key)}
        }else{
            for original in batch.originals{if next.assets[original.id]==nil{next.assets[original.id]=original};var slide=Slide(assetID:original.id);slide.fit=Fit(rawValue:next.creative.card.defaultFit) ?? .fit;next.slides.append(slide)}
        }
        try next.validate();_=try FramePlan(project:next);return next
    }
    private func adopt(_ batch:StagedBatch){
        guard accepts(batch.ticket),let cancel=cancellation else{return}
        do{_=try candidate(batch)}catch{issue=error.localizedDescription;cancelImport();return}
        importStatus="Adding \(batch.originals.count) media files";let workspace=self.workspace
        importTask=Task { [weak self] in
            var newFiles:[Original]=[]
            do{
                newFiles=try await Task.detached(priority:.userInitiated){
                    var adopted:[Original]=[];var success=false
                    defer{if !success{for original in adopted{try? FileManager.default.removeItem(at:workspace.url(original))}}}
                    var done=Set<String>()
                    for original in batch.originals where done.insert(original.id).inserted{try cancel.check();if try workspace.adopt(original,from:batch.workspace){adopted.append(original)}}
                    try cancel.check();success=true;return adopted
                }.value
                try cancel.check();guard let self,self.accepts(batch.ticket),self.cancellation === cancel else{throw CancellationError()}
                let next=try self.candidate(batch),old=Set(self.project.slides.map(\.id)),name=batch.replacementID==nil ? "Add \(batch.originals.count) slides":"Replace media"
                try self.journal.apply(name,ticket:batch.ticket){$0=next};try self.refresh()
                self.selection=batch.replacementID.map{[$0]} ?? Set(next.slides.map(\.id)).subtracting(old)
                self.importing=false;self.importStatus="";self.importTask=nil;self.cancellation=nil
            }catch{
                if let self{
                    let retained=self.journal.retainedAssetIDs
                    for original in newFiles where !retained.contains(original.id){try? FileManager.default.removeItem(at:workspace.url(original))}
                    if self.accepts(batch.ticket),self.cancellation === cancel{self.importing=false;self.importStatus="";self.importTask=nil;self.cancellation=nil;if !(error is CancellationError){self.issue=error.localizedDescription}}
                }
            }
        }
    }
    public func cancelImport(){cancellation?.cancel();importTask?.cancel();importTask=nil;cancellation=nil;pendingBatch=nil;importing=false;importStatus=""}
    public func removeSelection(){let ids=selection;change("Remove slides"){$0.removeSlides(ids)}}
    public func duplicateSelection(){let selected=selection;change("Duplicate slides"){p in
        var result:[Slide]=[]
        for slide in p.slides{result.append(slide);if selected.contains(slide.id){var copy=slide;copy.id=UUID().uuidString;result.append(copy)}}
        p.slides=result
    }}
    public func reorder(_ from:IndexSet,to destination:Int){change("Reorder slides"){p in
        let moving=from.sorted().map{p.slides[$0]},remaining=p.slides.enumerated().filter{!from.contains($0.offset)}.map(\.element)
        var next=remaining;let index=max(0,min(remaining.count,destination-from.filter{$0<destination}.count));next.insert(contentsOf:moving,at:index);p.slides=next
    }}
    public func setPin(_ id:String?){change("Pin"){p in
        p.spotlights.removeAll{$0.target == .pin};if let id{p.pin=Pin(slideID:id)}else{p.pin=nil}
    }}
    public func setSpotlight(_ ids:Set<String>,enabled:Bool){change("Spotlight"){p in
        for id in ids{p.spotlights.removeAll{$0.slideID==id};if enabled{var cue=Spotlight(slideID:id);if p.pin?.slideID==id && p.pin?.pinOnly==true{cue.target = .pin};p.spotlights.append(cue)}}
    }}
    public func setClosing(_ id:String?){change("Closing"){$0.closing=id.map{Closing(slideID:$0)}}}
    public func close(discardRecovery:Bool){cancelLookAudition();closed=true;cancelImport();recoveryTask?.cancel();didEdit=nil
        if discardRecovery{let writer=recovery,workspace=workspace;Task{try? await writer.finish(workspace)}}
    }
}

public extension EditorSession {
    func jsonValue(_ path:[String],slideID:String?=nil)->Any?{
        if jsonRevision != journal.revision {
            jsonSnapshot=(try? project.encoded()).flatMap{try? JSONSerialization.jsonObject(with:$0)}
            jsonRevision=journal.revision
        }
        guard var object=jsonSnapshot else{return nil}
        if let slideID{guard let root=object as? [String:Any],let slides=root["slides"] as? [[String:Any]],let slide=slides.first(where:{$0["id"] as? String==slideID}) else{return nil};object=slide}
        for key in path{guard let dictionary=object as? [String:Any],let value=dictionary[key] else{return nil};object=value};return object
    }
    func changeJSON(_ label:String,path:[String],value:Any,ticket:EditTicket,slideIDs:Set<String>?=nil){
        func assigning(_ object:inout [String:Any],_ keys:ArraySlice<String>){guard let key=keys.first else{return};if keys.count==1{object[key]=value}else{var child=object[key] as? [String:Any] ?? [:];assigning(&child,keys.dropFirst());object[key]=child}}
        change(label,ticket:ticket){p in
            guard var root=try JSONSerialization.jsonObject(with:p.encoded()) as? [String:Any] else{throw NativeFailure.message("The edit could not be represented.")}
            if let ids=slideIDs{
                var slides=root["slides"] as! [[String:Any]]
                for i in slides.indices where ids.contains(slides[i]["id"] as? String ?? ""){assigning(&slides[i],path[...])};root["slides"]=slides
            }else{assigning(&root,path[...])}
            p=try DriftProject.decode(JSONSerialization.data(withJSONObject:root,options:.sortedKeys))
            if slideIDs==nil,path.starts(with:["creative","lighting"]),path.last != "presetId"{p.creative.lighting.presetId="custom"}
        }
    }
}
