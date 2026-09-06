import Foundation
import CryptoKit
import Darwin
import DriftCore

public enum NativeFailure:Error,LocalizedError,Sendable {
    case message(String)
    public var errorDescription:String?{switch self{case .message(let text):return text}}
}
func check(_ value:Bool,_ message:String)throws{if !value{throw NativeFailure.message(message)}}
func hex(_ digest:SHA256.Digest)->String {digest.map{String(format:"%02x",$0)}.joined()}

public struct FileIdentity:Equatable,Sendable {
    public let device:UInt64,inode:UInt64,size:Int64,modifiedSeconds:Int64,modifiedNanoseconds:Int64,changeSeconds:Int64,changeNanoseconds:Int64
    public static func read(_ url:URL)throws->FileIdentity?{
        var s=stat();let r=url.path.withCString{Darwin.lstat($0,&s)}
        if r != 0 {if errno==ENOENT{return nil};throw NativeFailure.message("Could not inspect \(url.lastPathComponent): \(String(cString:strerror(errno))).")}
        try check(s.st_mode&S_IFMT==S_IFREG,"\(url.lastPathComponent) is not a regular file. Links and folders are not accepted here.")
        return FileIdentity(device:UInt64(s.st_dev),inode:UInt64(s.st_ino),size:Int64(s.st_size),modifiedSeconds:Int64(s.st_mtimespec.tv_sec),modifiedNanoseconds:Int64(s.st_mtimespec.tv_nsec),changeSeconds:Int64(s.st_ctimespec.tv_sec),changeNanoseconds:Int64(s.st_ctimespec.tv_nsec))
    }
    func sameBytesAndObject(as other:FileIdentity)->Bool{device==other.device && inode==other.inode && size==other.size && modifiedSeconds==other.modifiedSeconds && modifiedNanoseconds==other.modifiedNanoseconds}
}
public enum OwnedFiles {
    public static func openRead(_ url:URL)throws->FileHandle{
        let fd=url.path.withCString{Darwin.open($0,O_RDONLY|O_NOFOLLOW|O_CLOEXEC)}
        guard fd>=0 else{throw NativeFailure.message("Cannot read \(url.lastPathComponent): \(String(cString:strerror(errno))).")}
        var info=stat()
        guard fstat(fd,&info)==0,info.st_mode&S_IFMT==S_IFREG else{close(fd);throw NativeFailure.message("The media is not a regular file.")}
        return FileHandle(fileDescriptor:fd,closeOnDealloc:true)
    }
    public static func create(_ url:URL)throws->FileHandle{
        let fd=url.path.withCString{Darwin.open($0,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,mode_t(0600))}
        guard fd>=0 else{throw NativeFailure.message("Cannot create \(url.lastPathComponent): \(String(cString:strerror(errno))).")}
        return FileHandle(fileDescriptor:fd,closeOnDealloc:true)
    }
    @discardableResult public static func fingerprint(_ url:URL,maximum:Int64=MediaLimits.maximumOriginalBytes,cancel:@Sendable ()throws->Void = {try Task.checkCancellation()})throws->String{
        guard let before=try FileIdentity.read(url) else{throw NativeFailure.message("\(url.lastPathComponent) is missing.")}
        try check(before.size>0 && before.size<=maximum,"\(url.lastPathComponent) exceeds the supported size.")
        let input=try openRead(url);defer{try? input.close()};var hash=SHA256(),read:Int64=0
        while true{try cancel();let chunk=try input.read(upToCount:1024*1024) ?? Data();if chunk.isEmpty{break};read+=Int64(chunk.count);try check(read<=maximum,"The source grew beyond its budget.");hash.update(data:chunk)}
        try check(read==before.size && (try FileIdentity.read(url))==before,"\(url.lastPathComponent) changed while it was read.")
        return hex(hash.finalize())
    }
    /// All expensive work occurs on the caller's worker. No hard links: a later
    /// edit of an original outside Drift must not alter the document's bytes.
    @discardableResult public static func copy(_ source:URL,to destination:URL,maximum:Int64=MediaLimits.maximumOriginalBytes,cancel:@Sendable ()throws->Void = {try Task.checkCancellation()})throws->(String,Int64){
        guard let before=try FileIdentity.read(source) else{throw NativeFailure.message("\(source.lastPathComponent) is missing.")}
        try check(before.size>0 && before.size<=maximum,"\(source.lastPathComponent) exceeds the per-original limit.")
        let input=try openRead(source),output=try create(destination);var success=false
        defer{try? input.close();try? output.close();if !success{try? FileManager.default.removeItem(at:destination)}}
        var hash=SHA256(),copied:Int64=0
        while true{try cancel();let chunk=try input.read(upToCount:1024*1024) ?? Data();if chunk.isEmpty{break};copied+=Int64(chunk.count);try check(copied<=maximum,"The source grew beyond its budget.");hash.update(data:chunk);try output.write(contentsOf:chunk)}
        try output.synchronize();try check(copied==before.size && (try FileIdentity.read(source))==before,"\(source.lastPathComponent) changed during import.")
        success=true;return(hex(hash.finalize()),copied)
    }
    public static func writeAtomic(_ data:Data,to url:URL)throws{
        let staged=url.deletingLastPathComponent().appendingPathComponent(".drift-\(UUID().uuidString)")
        let output=try create(staged);defer{try? output.close();try? FileManager.default.removeItem(at:staged)}
        try output.write(contentsOf:data);try output.synchronize();try output.close()
        try check(staged.path.withCString{src in url.path.withCString{dst in rename(src,dst)}}==0,"The document state could not be committed.")
        syncDirectory(url.deletingLastPathComponent())
    }
    public static func syncDirectory(_ url:URL){let fd=url.path.withCString{open($0,O_RDONLY|O_CLOEXEC)};if fd>=0{_ = fsync(fd);close(fd)}}
}

/// Captures replacement authority before rendering. Atomic swap validates the
/// displaced file too, so an intervening replacement is not silently destroyed.
public struct SafeDestination:Sendable {
    public let url:URL
    public let identity:FileIdentity?
    public init(_ url:URL)throws{
        try check(url.isFileURL,"Choose a local destination.");self.url=url
        identity=try FileIdentity.read(url)
    }
    public func publish(_ stage:URL,preserveStage:()->Void = {})throws{
        try Task.checkCancellation()
        try check(try FileIdentity.read(url)==identity,"The destination changed. Choose another name; its current file was not replaced.")
        if let identity {
            let swapped=stage.path.withCString{src in url.path.withCString{dst in renamex_np(src,dst,UInt32(RENAME_SWAP))}}
            try check(swapped==0,"The completed output could not replace the destination.")
            guard let displaced=try FileIdentity.read(stage),identity.sameBytesAndObject(as:displaced) else{
                let restored=stage.path.withCString{src in url.path.withCString{dst in renamex_np(src,dst,UInt32(RENAME_SWAP))}}
                if restored != 0 {
                    preserveStage()
                    throw NativeFailure.message("The destination changed during replacement. Its displaced file is preserved at \(stage.path); automatic rollback failed. Neither file was deleted.")
                }
                throw NativeFailure.message("The destination changed during replacement. The prior file was restored.")
            }
            // Replacement is committed. A cleanup failure must not be reported as
            // a failed export or erase an unrelated subsequent destination change.
            do{try FileManager.default.removeItem(at:stage)}catch{preserveStage();NSLog("Drift retained replaced-file backup at %@: %@",stage.path,error.localizedDescription)}
        }else{
            let moved=stage.path.withCString{src in url.path.withCString{dst in renamex_np(src,dst,UInt32(RENAME_EXCL))}}
            try check(moved==0,"The destination now exists or could not be written. Choose a new name.")
        }
        OwnedFiles.syncDirectory(url.deletingLastPathComponent())
    }
}

/// One workspace is retained by every document/history/export snapshot using it.
/// Individual originals stay until a successful explicit reachability sweep;
/// retaining extra originals is safer than deleting a source still used by Undo.
public final class MediaWorkspace:@unchecked Sendable {
    public let root:URL,assets:URL
    private let lock=NSLock()
    private var verified:[String:(FileIdentity,String)]=[:]
    private let temporary:Bool
    public init(root:URL?=nil,temporary:Bool=true)throws{
        self.root=root ?? FileManager.default.temporaryDirectory.appendingPathComponent("Drift-\(UUID().uuidString)",isDirectory:true)
        self.temporary=temporary;assets=self.root.appendingPathComponent("assets",isDirectory:true)
        try FileManager.default.createDirectory(at:assets,withIntermediateDirectories:true,attributes:[.posixPermissions:0700])
    }
    deinit{if temporary{try? FileManager.default.removeItem(at:root)}}
    public func url(_ original:Original)throws->URL{try original.validate();return root.appendingPathComponent(original.path)}
    public func verify(_ original:Original)throws{
        let file=try url(original)
        guard let id=try FileIdentity.read(file) else{throw NativeFailure.message("\(original.name) is missing. Locate or replace it.")}
        try check(id.size==original.byteLength,"\(original.name) changed size.")
        lock.lock();let cached=verified[original.id];lock.unlock()
        if let cached,cached.0==id,cached.1==original.sha256{return}
        let hash=try OwnedFiles.fingerprint(file);try check(hash==original.sha256,"\(original.name) changed. Locate the original or replace this source.")
        lock.lock();verified[original.id]=(id,hash);lock.unlock()
    }
    public func adopt(_ original:Original,from workspace:MediaWorkspace)throws->Bool{
        let destination=try url(original)
        if FileManager.default.fileExists(atPath:destination.path){try verify(original);return false}
        let result=try OwnedFiles.copy(try workspace.url(original),to:destination)
        guard result.0==original.sha256,result.1==original.byteLength else{try? FileManager.default.removeItem(at:destination);throw NativeFailure.message("Media adoption did not preserve the original.")}
        return true
    }
}
public struct RenderSnapshot:Sendable {
    public let project:DriftProject,plan:FramePlan,workspace:MediaWorkspace
    public init(project:DriftProject,workspace:MediaWorkspace)throws{self.project=project;plan=try FramePlan(project:project);self.workspace=workspace}
}
