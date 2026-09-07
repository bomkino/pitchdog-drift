import Foundation
import DriftCore
import DriftNative

/// Immutable document snapshots cross the worker boundary; the journal remains
/// main-actor owned. Closing or starting a newer read invalidates old work.
final class DocumentStorage:@unchecked Sendable {
    struct Read:Sendable {let token:UUID,expected:EditTicket?}
    private let lock=NSLock()
    private var snapshot:RenderSnapshot?,ticket:EditTicket?,writing:(RenderSnapshot,EditTicket)?
    private var closed=false,dirty=false
    var isDirty:Bool{lock.lock();defer{lock.unlock()};return dirty && !closed}
    private var readToken:UUID?
    func set(_ snapshot:RenderSnapshot,_ ticket:EditTicket,dirty:Bool){lock.lock();defer{lock.unlock()};guard !closed else{return};self.snapshot=snapshot;self.ticket=ticket;self.dirty=dirty}
    func get()throws->(RenderSnapshot,EditTicket){lock.lock();defer{lock.unlock()};guard !closed,let snapshot,let ticket else{throw NativeFailure.message("The document is not loaded.")};return(snapshot,ticket)}
    func begin()throws{lock.lock();defer{lock.unlock()};guard !closed,writing==nil,let snapshot,let ticket else{throw NativeFailure.message("A save is already in progress or the document is closed.")};writing=(snapshot,ticket)}
    func writeSnapshot()throws->(RenderSnapshot,EditTicket){lock.lock();defer{lock.unlock()};guard !closed else{throw NativeFailure.message("The document is closed.")};if let writing{return writing};guard let snapshot,let ticket else{throw NativeFailure.message("The document is not loaded.")};return(snapshot,ticket)}
    func accepts(_ ticket:EditTicket)throws{
        lock.lock();let accepted = !closed && self.ticket?.generation==ticket.generation && self.ticket?.projectID==ticket.projectID;lock.unlock()
        if !accepted{throw NativeFailure.message("The document closed or changed identity during Save; the old write was not published.")}
    }
    func finish()->(RenderSnapshot,EditTicket)?{lock.lock();defer{lock.unlock()};let result=writing;writing=nil;return result}
    func beginRead()throws->Read{
        lock.lock();defer{lock.unlock()};guard !closed else{throw NativeFailure.message("The document is closed.")}
        let read=Read(token:UUID(),expected:ticket);readToken=read.token;return read
    }
    func finishRead(_ read:Read)throws{
        lock.lock();defer{lock.unlock()}
        guard !closed,readToken==read.token,ticket==read.expected else{throw NativeFailure.message("The document changed while it was being opened. The newer work was kept.")}
        readToken=nil
    }
    func close(){lock.lock();closed=true;readToken=nil;snapshot=nil;ticket=nil;lock.unlock()}
}

/// A per-document observation seam at the real, fully verified publication
/// boundary. It is inactive outside the explicit packaged acceptance command.
final class NativeWriteProbe:@unchecked Sendable {
    private let lock=NSLock()
    private var action:(@Sendable ()throws->Void)?
    func set(_ action:(@Sendable ()throws->Void)?){
        guard CommandLine.arguments.contains("--native-self-test") else{return}
        lock.lock();self.action=action;lock.unlock()
    }
    func inspect()throws{lock.lock();let action=action;lock.unlock();try action?()}
}
