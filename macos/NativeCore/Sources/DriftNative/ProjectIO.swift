import Foundation
import CryptoKit
import CDriftArchive
import DriftCore

private final class Archive {
    let pointer:OpaquePointer
    var error=[CChar](repeating:0,count:1024)
    init(_ url:URL,writing:Bool)throws{
        var message=[CChar](repeating:0,count:1024)
        guard let p=url.path.withCString({path in writing ? drift_archive_writer(path,&message,message.count):drift_archive_reader(path,&message,message.count)}) else {throw NativeFailure.message(String(cString:message))}
        pointer=p
    }
    deinit{drift_archive_free(pointer)}
    func next()throws->(String,Int64)?{
        var name=[CChar](repeating:0,count:1024),size:Int64=0
        let result=drift_archive_next(pointer,&name,name.count,&size,&error,error.count)
        if result==0{return nil};try check(result==1,String(cString:error));return(String(cString:name),size)
    }
    func read(maximum:Int)throws->Data{
        var bytes=[UInt8](repeating:0,count:maximum)
        let count=drift_archive_read(pointer,&bytes,maximum,&error,error.count)
        try check(count>=0 && count<=maximum,String(cString:error));return Data(bytes.prefix(Int(count)))
    }
    func begin(_ name:String,size:Int64)throws{let result=name.withCString{drift_archive_begin(pointer,$0,size,&error,error.count)};try check(result==0,String(cString:error))}
    func write(_ data:Data)throws{
        let count=data.withUnsafeBytes{drift_archive_write(pointer,$0.baseAddress,data.count,&error,error.count)}
        try check(count==data.count,String(cString:error))
    }
    func finish()throws{try check(drift_archive_finish(pointer,&error,error.count)==0,String(cString:error))}
}
public enum ProjectIO {
    public static let maximumArchiveBytes=MediaLimits.maximumProjectBytes+Int64(MediaLimits.maximumManifestBytes)+2*1024*1024
    private static func manifest(_ archive:Archive)throws->DriftProject{
        guard let first=try archive.next(),first.0=="project.json",first.1>0,first.1<=MediaLimits.maximumManifestBytes else{throw NativeFailure.message("This is not the current Drift project format. No file was changed.")}
        var data=Data()
        while true{try Task.checkCancellation();let part=try archive.read(maximum:64*1024);if part.isEmpty{break};try check(data.count+part.count<=MediaLimits.maximumManifestBytes,"The manifest is too large.");data.append(part)}
        try check(data.count==first.1,"The project manifest is truncated.");return try DriftProject.decode(data)
    }
    /// An allowlist derived from the already validated manifest, regular-file
    /// entries only, bounded streaming reads and independent digest checks.
    @discardableResult private static func inspect(_ url:URL,extract workspace:MediaWorkspace?)throws->DriftProject{
        guard let before=try FileIdentity.read(url) else{throw NativeFailure.message("The project is missing.")}
        try check(before.size>0 && before.size<=maximumArchiveBytes,"The project exceeds the supported portable size.")
        let archive=try Archive(url,writing:false),project=try manifest(archive)
        let paths=Dictionary(uniqueKeysWithValues:project.assets.values.map{($0.path,$0)});var seen=Set<String>(),total:Int64=0
        while let (name,size)=try archive.next(){
            try Task.checkCancellation()
            guard let original=paths[name],seen.insert(name).inserted,size==original.byteLength else{throw NativeFailure.message("The archive contains duplicate, unexpected or invalid media: \(name.prefix(120)).")}
            total += size;try check(total<=MediaLimits.maximumProjectBytes,"The archive exceeds the original-media budget.")
            let output=try workspace.map{try OwnedFiles.create($0.url(original))}
            defer{try? output?.close()}
            var read:Int64=0,hash=SHA256()
            while true{try Task.checkCancellation();let chunk=try archive.read(maximum:1024*1024);if chunk.isEmpty{break};read+=Int64(chunk.count);try check(read<=size,"An archive entry expanded beyond its declared size.");hash.update(data:chunk);try output?.write(contentsOf:chunk)}
            try check(read==size && hex(hash.finalize())==original.sha256,"\(original.name) failed original-media verification.")
            try output?.synchronize();try output?.close()
        }
        try archive.finish();try check(seen==Set(paths.keys),"The project does not contain every original.")
        try check(try FileIdentity.read(url)==before,"The project changed while it was opened.");return project
    }
    public static func read(_ url:URL)throws->(DriftProject,MediaWorkspace){let workspace=try MediaWorkspace();let project=try inspect(url,extract:workspace);return(project,workspace)}
    public static func verify(_ url:URL,expected:DriftProject)throws{try check(try inspect(url,extract:nil)==expected,"The saved project did not match its immutable snapshot.")}
    public static func write(_ snapshot:RenderSnapshot,to url:URL)throws{
        let destination=try SafeDestination(url),parent=url.deletingLastPathComponent()
        let scoped=parent.startAccessingSecurityScopedResource();defer{if scoped{parent.stopAccessingSecurityScopedResource()}}
        let stage=parent.appendingPathComponent(".drift-save-\(UUID().uuidString).pitched")
        let reserved=try OwnedFiles.create(stage);try reserved.close();defer{try? FileManager.default.removeItem(at:stage)}
        let writer=try Archive(stage,writing:true),manifest=try snapshot.project.encoded()
        try writer.begin("project.json",size:Int64(manifest.count));try writer.write(manifest)
        for original in snapshot.project.assets.values.sorted(by:{$0.path<$1.path}){
            try Task.checkCancellation();try snapshot.workspace.verify(original)
            let source=try snapshot.workspace.url(original),before=try FileIdentity.read(source),input=try OwnedFiles.openRead(source)
            defer{try? input.close()};try writer.begin(original.path,size:original.byteLength)
            var total:Int64=0,hash=SHA256()
            while true{try Task.checkCancellation();let chunk=try input.read(upToCount:1024*1024) ?? Data();if chunk.isEmpty{break};total+=Int64(chunk.count);try check(total<=original.byteLength,"An original changed during Save.");hash.update(data:chunk);try writer.write(chunk)}
            try check(total==original.byteLength && hex(hash.finalize())==original.sha256 && (try FileIdentity.read(source))==before,"An original changed during Save. The previous project is intact.")
        }
        try writer.finish()
        let file=try FileHandle(forWritingTo:stage);try file.synchronize();try file.close()
        try verify(stage,expected:snapshot.project);try destination.publish(stage)
    }
}
