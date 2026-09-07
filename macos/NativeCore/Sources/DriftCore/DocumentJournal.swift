import Foundation

public struct EditTicket:Equatable,Sendable {
    public let projectID:String
    public let generation:UUID
    public let revision:UInt64
    public let targets:Set<String>
}
public struct JournalEntry:Sendable {
    public let label:String
    public let project:DriftProject
}
/// Value-semantic accepted state. The AppKit owner serializes access. Media is
/// retained by the union of these immutable snapshots, not by current UI rows.
public struct DocumentJournal:Sendable {
    public private(set) var project:DriftProject
    public private(set) var generation=UUID()
    public private(set) var revision:UInt64=0
    public private(set) var past:[JournalEntry]=[]
    public private(set) var future:[JournalEntry]=[]
    private var currentIdentity:Data
    private var savedIdentity:Data?
    private var gesture:JournalEntry?
    private var gestureFuture:[JournalEntry]=[]
    public let historyLimit:Int
    public init(project:DriftProject,saved:Bool=false,historyLimit:Int=100)throws{
        try project.validate();self.project=project;self.historyLimit=max(1,min(500,historyLimit))
        currentIdentity=try project.contentIdentity();savedIdentity=saved ? currentIdentity:nil
    }
    public var isDirty:Bool{currentIdentity != savedIdentity}
    public var canUndo:Bool{!past.isEmpty}
    public var canRedo:Bool{!future.isEmpty}
    public var retainedAssetIDs:Set<String>{
        var ids=Set(project.assets.keys)
        for entry in past+future{ids.formUnion(entry.project.assets.keys)}
        if let gesture{ids.formUnion(gesture.project.assets.keys)}
        return ids
    }
    public func ticket(targets:Set<String>=[])->EditTicket{EditTicket(projectID:project.id,generation:generation,revision:revision,targets:targets)}
    public func accepts(_ ticket:EditTicket,requireRevision:Bool=false)->Bool{
        ticket.projectID==project.id && ticket.generation==generation
        && (!requireRevision || ticket.revision==revision)
        && ticket.targets.isSubset(of:Set(project.slides.map(\.id)))
    }
    @discardableResult public mutating func apply(_ label:String,ticket:EditTicket?=nil,requireRevision:Bool=false,_ change:(inout DriftProject)throws->Void)throws->Bool{
        if let ticket{try require(accepts(ticket,requireRevision:requireRevision),"This edit belongs to an earlier document or selection. It was not applied.")}
        var candidate=project;try change(&candidate);try candidate.validate()
        let nextIdentity=try candidate.contentIdentity()
        guard nextIdentity != currentIdentity else{return false}
        if gesture==nil{past.append(JournalEntry(label:label,project:project));if past.count>historyLimit{past.removeFirst(past.count-historyLimit)}}
        future=[];candidate.modifiedAt=ISO8601DateFormatter().string(from:Date());project=candidate;currentIdentity=nextIdentity;revision &+= 1
        return true
    }
    public mutating func beginGesture(_ label:String)throws{
        try require(gesture==nil,"Finish the current gesture first.");gesture=JournalEntry(label:label,project:project);gestureFuture=future
    }
    public mutating func finishGesture()throws{
        guard let before=gesture else{return};gesture=nil;gestureFuture=[]
        if try before.project.contentIdentity() != currentIdentity{past.append(before);if past.count>historyLimit{past.removeFirst(past.count-historyLimit)}}
    }
    public mutating func cancelGesture()throws{
        guard let before=gesture else{return};gesture=nil;future=gestureFuture;gestureFuture=[];project=before.project;currentIdentity=try project.contentIdentity();revision &+= 1
    }
    public mutating func undo()throws{
        try finishGesture();guard let entry=past.popLast() else{return}
        future.append(JournalEntry(label:entry.label,project:project));project=entry.project;currentIdentity=try project.contentIdentity();revision &+= 1
    }
    public mutating func redo()throws{
        try finishGesture();guard let entry=future.popLast() else{return}
        past.append(JournalEntry(label:entry.label,project:project));project=entry.project;currentIdentity=try project.contentIdentity();revision &+= 1
    }
    /// A successful save of an older revision may update its checkpoint, but must
    /// not mark subsequent edits clean. Failed writes never call this method.
    public mutating func didSave(_ snapshot:DriftProject,ticket:EditTicket)throws{
        try require(ticket.projectID==project.id && ticket.generation==generation,"The save belongs to another document.")
        savedIdentity=try snapshot.contentIdentity()
    }
    public mutating func load(_ value:DriftProject,saved:Bool)throws{
        try value.validate();project=value;generation=UUID();revision=0;past=[];future=[];gesture=nil;gestureFuture=[]
        currentIdentity=try value.contentIdentity();savedIdentity=saved ? currentIdentity:nil
    }
}
