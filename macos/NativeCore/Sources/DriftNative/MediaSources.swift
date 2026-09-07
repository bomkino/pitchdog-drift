@preconcurrency import AVFoundation
@preconcurrency import CoreImage
import ImageIO
import UniformTypeIdentifiers
import CDriftCodecs
import Foundation
import DriftCore

/// Cross-thread cancellation is the only shared mutable decoder operation.
public final class MediaCancellation:@unchecked Sendable {
    private let lock=NSLock();private var stopped=false
    let pointer:OpaquePointer
    public init(){pointer=drift_cancellation_create()!}
    deinit{drift_cancellation_destroy(pointer)}
    public func cancel(){lock.lock();stopped=true;drift_cancellation_cancel(pointer);lock.unlock()}
    public func check()throws{lock.lock();let value=stopped;lock.unlock();if value{throw CancellationError()};try Task.checkCancellation()}
}
struct MovieSample:Sendable {let start:Double,end:Double,key:Bool}
final class MovieIndex {
    let asset:AVURLAsset,track:AVAssetTrack,transform:CGAffineTransform,samples:[MovieSample]
    let origin:Double,duration:Double,width:Int,height:Int
    init(url:URL,cancel:MediaCancellation)throws{
        asset=AVURLAsset(url:url)
        guard let selected=asset.tracks(withMediaType:.video).first else{throw NativeFailure.message("No readable video track was found.")}
        track=selected;transform=selected.preferredTransform
        let rect=CGRect(origin:.zero,size:selected.naturalSize).applying(transform).standardized
        width=Int(abs(rect.width).rounded());height=Int(abs(rect.height).rounded())
        try check(width>0 && height>0 && Int64(width)*Int64(height)<=MediaLimits.maximumTimedPixels,"The source video dimensions exceed the decode budget.")
        let reader=try AVAssetReader(asset:asset),output=AVAssetReaderTrackOutput(track:selected,outputSettings:nil)
        output.alwaysCopiesSampleData=false;try check(reader.canAdd(output),"The video timing index could not be read.");reader.add(output)
        try check(reader.startReading(),reader.error?.localizedDescription ?? "Video indexing could not start.")
        defer{reader.cancelReading()}
        var entries:[(Double,Double,Bool)]=[],buffers=0
        while let buffer=output.copyNextSampleBuffer(){
            try cancel.check();buffers+=1
            try check(buffers<=500_000,"The video contains too many sample buffers.")
            // AVAssetReader can emit marker buffers with no media samples. They
            // are not frames and may have invalid PTS. Decode-only preroll is
            // likewise not an authored presentation frame.
            guard CMSampleBufferGetNumSamples(buffer)>0 else{continue}
            let attachments=CMSampleBufferGetSampleAttachmentsArray(buffer,createIfNecessary:false) as? [[CFString:Any]]
            if (attachments?.first?[kCMSampleAttachmentKey_DoNotDisplay] as? Bool)==true{continue}
            // Output timing incorporates container edits, trim and speed. Raw
            // sample PTS may still include the encoder's B-frame preroll.
            let time=CMSampleBufferGetOutputPresentationTimeStamp(buffer).seconds,span=CMSampleBufferGetOutputDuration(buffer).seconds
            if ProcessInfo.processInfo.environment["DRIFT_TIMING_DIAGNOSTICS"]=="1",buffers<=8 {
                NSLog("Drift timing index sample=%d count=%ld raw=%g output=%g duration=%g trackStart=%g trackEnd=%g",buffers,CMSampleBufferGetNumSamples(buffer),CMSampleBufferGetPresentationTimeStamp(buffer).seconds,time,span,selected.timeRange.start.seconds,CMTimeRangeGetEnd(selected.timeRange).seconds)
            }
            let key=(attachments?.first?[kCMSampleAttachmentKey_NotSync] as? Bool) != true
            try check(time.isFinite,"Video contains an invalid presentation timestamp (sample count: \(CMSampleBufferGetNumSamples(buffer)); output time: \(CMSampleBufferGetOutputPresentationTimeStamp(buffer).seconds)).")
            entries.append((time,span.isFinite && span>0 ? span:0,key));try check(entries.count<=250_000,"The video contains too many indexed frames.")
        }
        try check(reader.status == .completed,reader.error?.localizedDescription ?? "Video timing is incomplete (reader status: \(reader.status.rawValue), buffers: \(buffers), displayed frames: \(entries.count)).")
        entries.sort{$0.0<$1.0};try check(!entries.isEmpty,"The video has no frames.")
        let first=entries[0].0,last=entries.last!,trackEnd=CMTimeRangeGetEnd(selected.timeRange).seconds
        let lastDuration=last.1>0 ? last.1:entries.count>1 ? max(0.000001,last.0-entries[entries.count-2].0):max(0,trackEnd-last.0)
        let end=max(last.0+lastDuration,trackEnd.isFinite ? min(trackEnd,last.0+max(lastDuration,1)):last.0+lastDuration)
        try check(end>first && end-first<=86400,"The video has no reliable finite duration.")
        origin=first;duration=end-first
        var result:[MovieSample]=[]
        for index in entries.indices{
            let start=entries[index].0,finish=index+1<entries.count ? entries[index+1].0:end
            try check(finish>start,"The video has duplicate or non-increasing presentation timestamps.")
            result.append(MovieSample(start:start,end:finish,key:entries[index].2))
        }
        samples=result
    }
    func index(at seconds:Double,final:Bool=false)->Int{
        var lo=0,hi=samples.count
        while lo<hi{let mid=(lo+hi)/2;if samples[mid].start<seconds || (!final && samples[mid].start==seconds){lo=mid+1}else{hi=mid}}
        return max(0,lo-1)
    }
}
final class NativeMovieSource {
    let index:MovieIndex,cancel:MediaCancellation
    private var reader:AVAssetReader?,output:AVAssetReaderTrackOutput?,current:CMSampleBuffer?
    private var cachedImage:CIImage?
    var currentTime = -Double.infinity,lastRequested = -Double.infinity
    init(url:URL,cancel:MediaCancellation)throws{self.cancel=cancel;index=try MovieIndex(url:url,cancel:cancel)}
    deinit{reader?.cancelReading()}
    private func start(at target:Int)throws{
        reader?.cancelReading();reader=nil;output=nil;current=nil;cachedImage=nil;currentTime = -Double.infinity
        var key=target
        while key>0 && !index.samples[key].key{key-=1}
        let read=try AVAssetReader(asset:index.asset),out=AVAssetReaderTrackOutput(track:index.track,outputSettings:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA,kCVPixelBufferIOSurfacePropertiesKey as String:[:]])
        out.alwaysCopiesSampleData=false;try check(read.canAdd(out),"This video cannot be decoded.");read.add(out)
        let begin=index.samples[key].start,end=index.samples.last!.end
        read.timeRange=CMTimeRange(start:CMTime(seconds:begin,preferredTimescale:1_000_000_000),end:CMTime(seconds:end,preferredTimescale:1_000_000_000))
        try check(read.startReading(),read.error?.localizedDescription ?? "Video decoding could not start.");reader=read;output=out
    }
    func image(request:SourceRequest)throws->CIImage{
        try cancel.check()
        let time:Double,final:Bool
        switch request{case .time(let ns):time=index.origin+Double(ns)/1e9;final=false;case .lastBefore(let ns):time=index.origin+Double(ns)/1e9;final=true}
        let target=index.index(at:time,final:final),stamp=index.samples[target].start
        if output==nil || stamp<currentTime-1e-7 || stamp>lastRequested+1{try start(at:target)}
        lastRequested=stamp
        while current==nil || currentTime<stamp-1e-7{
            try cancel.check()
            guard let sample=output?.copyNextSampleBuffer() else{throw reader?.error ?? NativeFailure.message("Video ended before the requested frame (requested: \(stamp), last: \(currentTime), reader status: \(reader?.status.rawValue ?? -1)).")}
            guard CMSampleBufferGetNumSamples(sample)>0 else{continue}
            let attachments=CMSampleBufferGetSampleAttachmentsArray(sample,createIfNecessary:false) as? [[CFString:Any]]
            if (attachments?.first?[kCMSampleAttachmentKey_DoNotDisplay] as? Bool)==true{continue}
            let pts=CMSampleBufferGetOutputPresentationTimeStamp(sample).seconds
            try check(pts.isFinite && pts>=currentTime,"Video decoder returned invalid frame order.")
            current=sample;currentTime=pts;cachedImage=nil
        }
        try check(abs(currentTime-stamp)<0.002,"The decoder did not return the requested source frame.")
        if let cachedImage{return cachedImage}
        guard let pixel=CMSampleBufferGetImageBuffer(current!) else{throw NativeFailure.message("The decoded video frame has no pixels.")}
        let image=CIImage(cvPixelBuffer:pixel).transformed(by:index.transform),r=image.extent
        let normalized=image.transformed(by:CGAffineTransform(translationX:-r.minX,y:-r.minY));cachedImage=normalized;return normalized
    }
}
final class WebSource {
    let pointer:OpaquePointer,cancel:MediaCancellation
    let info:DriftCodecInfo
    let colour:CGColorSpace
    private(set) var timestamp=0.0
    private var cachedImage:CIImage?,cachedTimestamp:Double?,cachedDuration=0.0
    private(set) var pixelCopies=0
    init(url:URL,cancel:MediaCancellation)throws{
        self.cancel=cancel;var error=[CChar](repeating:0,count:1024)
        guard let p=url.path.withCString({drift_codec_open_cancellable($0,cancel.pointer,&error,error.count)}) else{try cancel.check();throw NativeFailure.message(String(cString:error))}
        pointer=p;var info=DriftCodecInfo()
        guard drift_codec_info(p,&info)==1 else{drift_codec_close(p);throw NativeFailure.message("Web media metadata is unavailable.")}
        self.info=info
        if let icc=info.icc,info.icc_size>0,let space=CGColorSpace(iccData:Data(bytes:icc,count:info.icc_size) as CFData){colour=space}
        else{colour=CGColorSpace(name:CGColorSpace.sRGB)!}
    }
    deinit{drift_codec_close(pointer)}
    func image(request:SourceRequest,playback:SourcePlayback)throws->CIImage{
        try cancel.check();var error=[CChar](repeating:0,count:1024),frame=DriftCodecFrame()
        let origin=info.first_timestamp,time:Double,final:Int32
        switch request{case .time(let ns):time=origin+Double(ns)/1e9;final=0;case .lastBefore(let ns):time=origin+Double(ns)/1e9;final=1}
        let start=origin+Double(playback.trimInNanoseconds)/1e9,end=playback.trimOutNanoseconds.map{origin+Double($0)/1e9} ?? info.duration
        guard drift_codec_read(pointer,time,final,start,end,&frame,&error,error.count)==1 else{try cancel.check();throw NativeFailure.message(String(cString:error))}
        timestamp=frame.timestamp
        // The codec owns a mutable compositing buffer. Keep one immutable copy
        // per returned frame interval, not one full-source copy per output tick.
        if cachedTimestamp==frame.timestamp,cachedDuration==frame.duration,let cachedImage{return cachedImage}
        guard let rgba=frame.rgba else{throw NativeFailure.message("Web media returned an empty frame.")}
        let data=Data(bytes:rgba,count:Int(frame.stride)*Int(frame.height))
        guard let provider=CGDataProvider(data:data as CFData),let image=CGImage(width:Int(frame.width),height:Int(frame.height),bitsPerComponent:8,bitsPerPixel:32,bytesPerRow:Int(frame.stride),space:colour,bitmapInfo:CGBitmapInfo(rawValue:CGImageAlphaInfo.last.rawValue),provider:provider,decode:nil,shouldInterpolate:true,intent:.relativeColorimetric) else{throw NativeFailure.message("The Web media frame could not be represented.")}
        let result=CIImage(cgImage:image);cachedImage=result;cachedTimestamp=frame.timestamp;cachedDuration=frame.duration;pixelCopies+=1
        return result
    }
}

public enum MediaInspector {
    /// Classify the bytes, not a MIME supplied by a file picker. The final file
    /// extension is a canonical container identity, never an acceptance bypass.
    private static func format(_ url:URL)throws->String{
        let file=try OwnedFiles.openRead(url);defer{try? file.close()};let d=try file.read(upToCount:64) ?? Data(),b=Array(d)
        if b.count>=12 && Array(b[0..<4])==Array("RIFF".utf8) && Array(b[8..<12])==Array("WEBP".utf8){return "webp"}
        if b.starts(with:[0x1a,0x45,0xdf,0xa3]){return "webm"}
        if b.starts(with:[137,80,78,71,13,10,26,10]){return "png"}
        if b.starts(with:[0xff,0xd8,0xff]){return "jpg"}
        if b.starts(with:[0x49,0x49,0x2a,0]) || b.starts(with:[0x4d,0x4d,0,0x2a]){return "tiff"}
        if b.count>=12,Array(b[4..<8])==Array("ftyp".utf8){
            let brands=String(decoding:b.dropFirst(8),as:UTF8.self)
            if brands.contains("avif") || brands.contains("avis"){return "avif"}
            if ["heic","heix","heif","mif1"].contains(where:brands.contains){return "heic"}
            return brands.contains("qt  ") ? "mov":"mp4"
        }
        if ["mov","mp4","m4v"].contains(url.pathExtension.lowercased()){return "mov"} // AVFoundation must still validate tracks and actual frames.
        throw NativeFailure.message("Unsupported or malformed media container.")
    }
    public static func stage(_ url:URL,in workspace:MediaWorkspace,cancel:MediaCancellation)throws->Original{
        let scoped=url.startAccessingSecurityScopedResource();defer{if scoped{url.stopAccessingSecurityScopedResource()}}
        try cancel.check();let subtype=try format(url),temporary=workspace.root.appendingPathComponent("import-\(UUID().uuidString).\(subtype)")
        let (hash,size)=try OwnedFiles.copy(url,to:temporary,cancel:{try cancel.check()});defer{try? FileManager.default.removeItem(at:temporary)}
        let width:Int,height:Int,duration:Int64,alpha:Bool,kind:MediaKind
        if subtype=="webp" || subtype=="webm" {
            let source=try WebSource(url:temporary,cancel:cancel),info=source.info
            width=Int(info.width);height=Int(info.height);alpha=info.alpha != 0
            kind=info.codec==1 ? (info.animated != 0 ? .animatedImage:.image):.video
            duration=kind == .image ? 0:Int64(((info.duration-info.first_timestamp)*1e9).rounded())
            _=try source.image(request:.time(0),playback:SourcePlayback())
        }else if ["mov","mp4","m4v"].contains(subtype){
            let source=try NativeMovieSource(url:temporary,cancel:cancel)
            width=source.index.width;height=source.index.height;duration=Int64((source.index.duration*1e9).rounded());alpha=false;kind = .video
            _=try source.image(request:.time(0))
        }else{
            guard let source=CGImageSourceCreateWithURL(temporary as CFURL,[kCGImageSourceShouldCache:false] as CFDictionary),CGImageSourceGetCount(source)==1,
                  let props=CGImageSourceCopyPropertiesAtIndex(source,0,nil) as? [CFString:Any],let w=props[kCGImagePropertyPixelWidth] as? Int,let h=props[kCGImagePropertyPixelHeight] as? Int else{throw NativeFailure.message("The still image is unreadable or is an unsupported animated format.")}
            try check(w>0 && h>0 && w<=32768 && h<=32768 && Int64(w)*Int64(h)<=MediaLimits.maximumSourcePixels,"The source image exceeds the decoded-pixel limit.")
            let orientation=props[kCGImagePropertyOrientation] as? Int ?? 1,swap=(5...8).contains(orientation)
            width=swap ? h:w;height=swap ? w:h;alpha=props[kCGImagePropertyHasAlpha] as? Bool ?? false;duration=0;kind = .image
            guard CGImageSourceCreateThumbnailAtIndex(source,0,[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceCreateThumbnailWithTransform:true,kCGImageSourceThumbnailMaxPixelSize:160,kCGImageSourceShouldCacheImmediately:true] as CFDictionary) != nil else{throw NativeFailure.message("The still image could not be decoded.")}
        }
        let original=try Original(name:url.lastPathComponent,sha256:hash,byteLength:size,kind:kind,subtype:subtype,width:width,height:height,durationNanoseconds:duration,hasAlpha:alpha)
        let final=try workspace.url(original)
        if FileManager.default.fileExists(atPath:final.path){try workspace.verify(original)}else{try FileManager.default.moveItem(at:temporary,to:final)}
        return original
    }
}

/// Renderer-confined sources, at most four mutable video readers and a bounded
/// still representation cache. Originals and undo snapshots never occupy these caches.
public final class MediaFrames {
    private enum Source{case web(WebSource),movie(NativeMovieSource)}
    private var sources:[String:Source]=[:],lru:[String]=[],stills:[String:(image:CIImage,cost:Int)]=[:],stillOrder:[String]=[],stillCost=0
    public let cancellation:MediaCancellation
    public private(set) var frameToken=""
    public init(cancellation:MediaCancellation=MediaCancellation()){self.cancellation=cancellation}
    public func clear(){sources.removeAll();lru=[];stills.removeAll();stillOrder=[];stillCost=0}
    public func image(original:Original,workspace:MediaWorkspace,playback:SourcePlayback,seconds:Double,maximumDimension:Int)throws->CIImage{
        try image(original:original,workspace:workspace,playback:playback,request:playback.request(outputSeconds:seconds,original:original),maximumDimension:maximumDimension)
    }
    /// Explicit interval-end requests are used by the source filmstrip. Never
    /// approximate the last readable frame by subtracting a guessed frame rate.
    public func image(original:Original,workspace:MediaWorkspace,playback:SourcePlayback,request:SourceRequest,maximumDimension:Int)throws->CIImage{
        try cancellation.check();try playback.validate(original:original)
        if original.kind != .image{
            let end=playback.trimOutNanoseconds ?? original.durationNanoseconds
            switch request{
            case .time(let ns):guard ns>=playback.trimInNanoseconds,ns<end else{throw NativeFailure.message("Source preview time is outside its trim.")}
            case .lastBefore(let ns):guard ns>playback.trimInNanoseconds,ns<=end else{throw NativeFailure.message("Source preview end is outside its trim.")}
            }
        }
        let maxDimension=max(64,min(8192,maximumDimension)),key=original.id
        // Identity verification is cached by inode/size/mtime/ctime. A pixel
        // cache hit must not hide a missing or changed owned original.
        try workspace.verify(original)
        if !["webm","webp"].contains(original.subtype) && original.kind == .image {
            let cacheKey="\(key)/\(maxDimension)"
            frameToken=cacheKey
            if let result=stills[cacheKey]{stillOrder.removeAll{$0==cacheKey};stillOrder.append(cacheKey);return result.image}
            guard let source=CGImageSourceCreateWithURL(try workspace.url(original) as CFURL,[kCGImageSourceShouldCache:false] as CFDictionary),let thumb=CGImageSourceCreateThumbnailAtIndex(source,0,[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceCreateThumbnailWithTransform:true,kCGImageSourceThumbnailMaxPixelSize:maxDimension,kCGImageSourceShouldCacheImmediately:true] as CFDictionary) else{throw NativeFailure.message("\(original.name) could not be decoded.")}
            let image=CIImage(cgImage:thumb),cost=thumb.bytesPerRow*thumb.height
            while stillCost+cost>96*1024*1024,let oldest=stillOrder.first{stillOrder.removeFirst();if let evicted=stills.removeValue(forKey:oldest){stillCost-=evicted.cost}}
            if cost<=96*1024*1024{stills[cacheKey]=(image,cost);stillOrder.append(cacheKey);stillCost+=cost};return image
        }
        var source=sources[key]
        if source==nil{
            while lru.count>=4{sources.removeValue(forKey:lru.removeFirst())}
            let url=try workspace.url(original)
            source=["webm","webp"].contains(original.subtype) ? .web(try WebSource(url:url,cancel:cancellation)):.movie(try NativeMovieSource(url:url,cancel:cancellation))
            sources[key]=source
        }
        lru.removeAll{$0==key};lru.append(key)
        let raw:CIImage
        switch source!{case .web(let web):raw=try web.image(request:request,playback:playback);frameToken="\(key)/\(web.timestamp)/\(maxDimension)";case .movie(let movie):raw=try movie.image(request:request);frameToken="\(key)/\(movie.currentTime)/\(maxDimension)"}
        let size=max(raw.extent.width,raw.extent.height),scale=min(1,Double(maxDimension)/size)
        return scale<1 ? raw.transformed(by:CGAffineTransform(scaleX:scale,y:scale)):raw
    }
}
