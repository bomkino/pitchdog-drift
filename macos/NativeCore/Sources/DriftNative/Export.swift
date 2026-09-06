@preconcurrency import AVFoundation
import AudioToolbox
import ImageIO
import UniformTypeIdentifiers
import AppKit
import Combine
import Foundation
import Darwin
import DriftCore

public struct ExportRange:Sendable,Codable,Equatable {
    public let start:Int64,end:Int64
    public var count:Int64{end-start}
    public init(start:Int64,end:Int64,total:Int64)throws{try check(start>=0 && end>start && end<=total,"The export range is outside the sequence.");self.start=start;self.end=end}
}
public struct ExportReceipt:Sendable,Codable {
    public let name:String,path:String,format:String,documentID:String
    public let width:Int,height:Int,frameCount:Int64,sourceStartFrame:Int64,rateNumerator:Int64,rateDenominator:Int64
    public let audio:Bool,sha256:String,sourceRevision:String
}
private final class WriterCompletion:@unchecked Sendable {
    private let lock=NSLock();private var done=false
    func finish(){lock.lock();done=true;lock.unlock()}
    var finished:Bool{lock.lock();defer{lock.unlock()};return done}
}
public enum NativeExport {
    private static func audioSample(_ data:[Float],start:Int64)throws->CMSampleBuffer{
        var asbd=AudioStreamBasicDescription(mSampleRate:48000,mFormatID:kAudioFormatLinearPCM,mFormatFlags:kAudioFormatFlagIsFloat|kAudioFormatFlagIsPacked,mBytesPerPacket:8,mFramesPerPacket:1,mBytesPerFrame:8,mChannelsPerFrame:2,mBitsPerChannel:32,mReserved:0)
        var format:CMAudioFormatDescription?
        try check(CMAudioFormatDescriptionCreate(allocator:kCFAllocatorDefault,asbd:&asbd,layoutSize:0,layout:nil,magicCookieSize:0,magicCookie:nil,extensions:nil,formatDescriptionOut:&format)==noErr,"Audio format initialization failed.")
        var block:CMBlockBuffer?
        try check(CMBlockBufferCreateWithMemoryBlock(allocator:kCFAllocatorDefault,memoryBlock:nil,blockLength:data.count*4,blockAllocator:kCFAllocatorDefault,customBlockSource:nil,offsetToData:0,dataLength:data.count*4,flags:0,blockBufferOut:&block)==kCMBlockBufferNoErr,"Audio buffer allocation failed.")
        guard let block,let format else{throw NativeFailure.message("The audio buffer is unavailable.")}
        let copied=data.withUnsafeBytes{CMBlockBufferReplaceDataBytes(with:$0.baseAddress!,blockBuffer:block,offsetIntoDestination:0,dataLength:$0.count)}
        try check(copied==kCMBlockBufferNoErr,"Audio samples could not be copied.")
        var timing=CMSampleTimingInfo(duration:CMTime(value:1,timescale:48000),presentationTimeStamp:CMTime(value:start,timescale:48000),decodeTimeStamp:.invalid),sample:CMSampleBuffer?
        var sampleSize=8
        let status=CMSampleBufferCreateReady(allocator:kCFAllocatorDefault,dataBuffer:block,formatDescription:format,sampleCount:data.count/2,sampleTimingEntryCount:1,sampleTimingArray:&timing,sampleSizeEntryCount:1,sampleSizeArray:&sampleSize,sampleBufferOut:&sample)
        guard status==noErr,let sample else{throw NativeFailure.message("Audio sample packaging failed (\(status)).")};return sample
    }
    private static func ready(_ input:AVAssetWriterInput,_ writer:AVAssetWriter,_ cancel:MediaCancellation)async throws{
        let deadline=ProcessInfo.processInfo.systemUptime+30
        while !input.isReadyForMoreMediaData{
            try cancel.check();try check(writer.status != .failed,writer.error?.localizedDescription ?? "The encoder failed.")
            try check(ProcessInfo.processInfo.systemUptime<deadline,"The encoder stopped accepting frames. The destination is unchanged.")
            try await Task.sleep(nanoseconds:2_000_000)
        }
    }
    public static func writePNG(_ image:CGImage,to url:URL)throws{
        let bytes=NSMutableData()
        guard let destination=CGImageDestinationCreateWithData(bytes,UTType.png.identifier as CFString,1,nil) else{throw NativeFailure.message("The macOS PNG encoder is unavailable.")}
        CGImageDestinationAddImage(destination,image,[kCGImagePropertyPNGDictionary:[kCGImagePropertyPNGInterlaceType:0]] as CFDictionary)
        try check(CGImageDestinationFinalize(destination),"The PNG could not be encoded.")
        let output=try OwnedFiles.create(url);defer{try? output.close()};try output.write(contentsOf:bytes as Data);try output.synchronize()
    }
    public static func verifyPNG(_ url:URL,width:Int,height:Int)throws{
        guard let source=CGImageSourceCreateWithURL(url as CFURL,nil),let image=CGImageSourceCreateImageAtIndex(source,0,nil),image.width==width,image.height==height else{throw NativeFailure.message("The output PNG did not match the requested dimensions.")}
    }
    public static func run(snapshot:RenderSnapshot,destination:URL,range:ExportRange?=nil,stillFrame:Int64=0,cancellation:MediaCancellation=MediaCancellation(),resources:URL?=nil,progress:@escaping @Sendable (Double,String)->Void={_,_ in})async throws->ExportReceipt{
        let project=snapshot.project,plan=snapshot.plan,format=project.output.format
        try check(!project.includedSlides.isEmpty,"Add an included slide before exporting.")
        try check(format != .mp4 || !project.transparent,"MP4 does not preserve alpha. Choose PNG or explicitly turn off the transparent canvas.")
        let selected=try range ?? ExportRange(start:0,end:plan.schedule.totalFrames,total:plan.schedule.totalFrames)
        try check(format == .png || selected.count<=216000,"This export exceeds 216,000 frames. Choose a shorter range.")
        try check(stillFrame>=0 && stillFrame<plan.schedule.totalFrames,"The still frame is outside the sequence.")
        let parent=destination.deletingLastPathComponent(),scoped=parent.startAccessingSecurityScopedResource();defer{if scoped{parent.stopAccessingSecurityScopedResource()}}
        let folder=format == .pngSequence,permission:SafeDestination?=folder ? nil:try SafeDestination(destination)
        if folder{try check(!FileManager.default.fileExists(atPath:destination.path),"Choose a new folder for the PNG sequence. Existing folders are not replaced.")}
        let stage=parent.appendingPathComponent(".drift-export-\(UUID().uuidString)"+(format == .mp4 ? ".mp4":format == .png ? ".png":""))
        var cleanupStage=true;defer{if cleanupStage{try? FileManager.default.removeItem(at:stage)}}
        progress(0,"Checking media")
        var verified=Set<String>()
        for slide in project.includedSlides where verified.insert(slide.assetID).inserted{try cancellation.check();try snapshot.workspace.verify(project.original(for:slide))}
        let renderer=try NativeRenderer(resources:resources,cancellation:cancellation)
        let audio=format == .mp4 && project.creative.sound.exportEnabled && !project.direction.reduceAuthoredMotion && !project.movingSlides.isEmpty
        if format == .png{
            let surface=try renderer.render(snapshot,frame:stillFrame);try writePNG(renderer.image(surface),to:stage);try verifyPNG(stage,width:project.canvas.width,height:project.canvas.height)
        }else if folder{
            try FileManager.default.createDirectory(at:stage,withIntermediateDirectories:false,attributes:[.posixPermissions:0700])
            for offset in 0..<selected.count{
                try cancellation.check()
                try autoreleasepool{let surface=try renderer.render(snapshot,frame:selected.start+offset);try writePNG(renderer.image(surface),to:stage.appendingPathComponent(String(format:"frame-%06lld.png",offset)))}
                progress(Double(offset+1)/Double(selected.count)*0.92,"Rendering \(offset+1) / \(selected.count)")
            }
            try check(try FileManager.default.contentsOfDirectory(atPath:stage.path).count==selected.count,"The PNG sequence is incomplete.")
            for frame in Set([Int64(0),selected.count/2,selected.count-1]){try verifyPNG(stage.appendingPathComponent(String(format:"frame-%06lld.png",frame)),width:project.canvas.width,height:project.canvas.height)}
            let manifest:[String:Any]=["frameCount":selected.count,"sourceStartFrame":selected.start,"firstOutputFrame":0,"frameRateNumerator":project.output.rate.numerator,"frameRateDenominator":project.output.rate.denominator,"width":project.canvas.width,"height":project.canvas.height,"colourSpace":"sRGB","alpha":"straight PNG from premultiplied linear working pixels"]
            try OwnedFiles.writeAtomic(JSONSerialization.data(withJSONObject:manifest,options:[.prettyPrinted,.sortedKeys]),to:stage.appendingPathComponent("sequence.json"))
        }else{
            let soundtrack=audio ? try SoundTrack(plan:plan,resources:resources):nil
            try await movie(snapshot,renderer:renderer,track:soundtrack,url:stage,range:selected,cancel:cancellation,progress:progress)
            progress(0.94,"Verifying output")
            try await verifyMovie(stage,project:project,frames:selected.count,audio:audio,cancellation:cancellation)
        }
        try cancellation.check();progress(0.98,"Saving export")
        let hash=try OwnedFiles.fingerprint(folder ? stage.appendingPathComponent("sequence.json"):stage,maximum:Int64.max,cancel:{try cancellation.check()})
        if folder{try cancellation.check();let moved=stage.path.withCString{src in destination.path.withCString{dst in renamex_np(src,dst,UInt32(RENAME_EXCL))}};try check(moved==0,"The sequence destination appeared during export. Choose another name.");OwnedFiles.syncDirectory(parent)}else{try permission!.publish(stage,preserveStage:{cleanupStage=false})}
        // Publication is the commit point. A subsequent cancel cannot erase a valid output.
        progress(1,"Exported")
        return ExportReceipt(name:destination.lastPathComponent,path:destination.path,format:format.rawValue,documentID:project.id,width:project.canvas.width,height:project.canvas.height,frameCount:format == .png ? 1:selected.count,sourceStartFrame:format == .png ? stillFrame:selected.start,rateNumerator:project.output.rate.numerator,rateDenominator:project.output.rate.denominator,audio:audio,sha256:hash,sourceRevision:Bundle.main.object(forInfoDictionaryKey:"DriftSourceRevision") as? String ?? "development")
    }
    private static func movie(_ snapshot:RenderSnapshot,renderer:NativeRenderer,track:SoundTrack?,url:URL,range:ExportRange,cancel:MediaCancellation,progress:@escaping @Sendable(Double,String)->Void)async throws{
        let p=snapshot.project,rate=p.output.rate,writer=try AVAssetWriter(outputURL:url,fileType:.mp4)
        let settings:[String:Any]=[AVVideoCodecKey:AVVideoCodecType.h264,AVVideoWidthKey:p.canvas.width,AVVideoHeightKey:p.canvas.height,AVVideoColorPropertiesKey:[AVVideoColorPrimariesKey:AVVideoColorPrimaries_ITU_R_709_2,AVVideoTransferFunctionKey:AVVideoTransferFunction_ITU_R_709_2,AVVideoYCbCrMatrixKey:AVVideoYCbCrMatrix_ITU_R_709_2],AVVideoCompressionPropertiesKey:[AVVideoAverageBitRateKey:p.output.bitrate,AVVideoProfileLevelKey:AVVideoProfileLevelH264HighAutoLevel,AVVideoAllowFrameReorderingKey:false]]
        try check(writer.canApply(outputSettings:settings,forMediaType:.video),"This Mac cannot encode H.264 at the exact requested size. No dimension was changed.")
        let input=AVAssetWriterInput(mediaType:.video,outputSettings:settings);input.expectsMediaDataInRealTime=false
        let adaptor=AVAssetWriterInputPixelBufferAdaptor(assetWriterInput:input,sourcePixelBufferAttributes:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA,kCVPixelBufferWidthKey as String:p.canvas.width,kCVPixelBufferHeightKey as String:p.canvas.height,kCVPixelBufferIOSurfacePropertiesKey as String:[:],kCVPixelBufferMetalCompatibilityKey as String:true])
        try check(writer.canAdd(input),"The movie writer could not accept the video.");writer.add(input)
        var audioInput:AVAssetWriterInput?
        if track != nil{let settings:[String:Any]=[AVFormatIDKey:kAudioFormatMPEG4AAC,AVSampleRateKey:48000,AVNumberOfChannelsKey:2,AVEncoderBitRateKey:192000]
            try check(writer.canApply(outputSettings:settings,forMediaType:.audio),"This Mac cannot encode the requested audio.")
            let audio=AVAssetWriterInput(mediaType:.audio,outputSettings:settings);audio.expectsMediaDataInRealTime=false
            try check(writer.canAdd(audio),"The movie writer could not accept audio.");writer.add(audio);audioInput=audio
        }
        try check(writer.startWriting(),writer.error?.localizedDescription ?? "The movie writer could not start.");writer.startSession(atSourceTime:.zero)
        let soundStart=Int64((rate.seconds(frame:range.start)*48000).rounded()),soundCount=Int64((rate.seconds(frame:range.count)*48000).rounded());var audioCursor:Int64=0
        do{
            for frame in 0..<range.count{
                try cancel.check();try await ready(input,writer,cancel)
                try autoreleasepool{
                    guard let pool=adaptor.pixelBufferPool else{throw NativeFailure.message("The output frame pool is unavailable.")};var buffer:CVPixelBuffer?
                    guard CVPixelBufferPoolCreatePixelBuffer(nil,pool,&buffer)==kCVReturnSuccess,let buffer else{throw NativeFailure.message("Not enough memory for the output frame.")}
                    let surface=try renderer.render(snapshot,frame:range.start+frame);try renderer.write(surface,into:buffer)
                    try check(adaptor.append(buffer,withPresentationTime:CMTime(value:frame*rate.denominator,timescale:Int32(rate.numerator))),writer.error?.localizedDescription ?? "The movie frame could not be written.")
                }
                if let audioInput,let track{
                    let boundary=min(soundCount,Int64((rate.seconds(frame:frame+1)*48000).rounded()))
                    while audioCursor<boundary{try cancel.check();try await ready(audioInput,writer,cancel);let n=Int(min(4096,boundary-audioCursor))
                        let sample=try audioSample(track.samples(start:soundStart+audioCursor,count:n),start:audioCursor)
                        try check(audioInput.append(sample),writer.error?.localizedDescription ?? "Audio encoding failed.");audioCursor+=Int64(n)
                    }
                }
                progress(Double(frame+1)/Double(range.count)*0.91,"Rendering \(frame+1) / \(range.count)")
            }
            input.markAsFinished();audioInput?.markAsFinished();writer.endSession(atSourceTime:CMTime(value:range.count*rate.denominator,timescale:Int32(rate.numerator)))
            let finish=WriterCompletion();writer.finishWriting{finish.finish()};let deadline=ProcessInfo.processInfo.systemUptime+60
            while !finish.finished{try cancel.check();try check(ProcessInfo.processInfo.systemUptime<deadline,"The encoder did not finalize. The destination is unchanged.");try await Task.sleep(nanoseconds:10_000_000)}
            try check(writer.status == .completed,writer.error?.localizedDescription ?? "The movie was not completed.")
        }catch{writer.cancelWriting();throw error}
    }
    public static func verifyMovie(_ url:URL,project:DriftProject,frames:Int64,audio:Bool,cancellation:MediaCancellation=MediaCancellation())async throws{
        let asset=AVURLAsset(url:url),tracks=try await asset.loadTracks(withMediaType:.video)
        guard tracks.count==1,let track=tracks.first else{throw NativeFailure.message("The output does not contain exactly one video track.")}
        let size=try await track.load(.naturalSize),duration=try await asset.load(.duration)
        try check(Int(size.width)==project.canvas.width && Int(size.height)==project.canvas.height,"The encoded size did not match the canvas.")
        try check(abs(duration.seconds-project.output.rate.seconds(frame:frames))<=max(0.003,project.output.rate.seconds(frame:1)),"The encoded duration is incorrect.")
        let reader=try AVAssetReader(asset:asset),out=AVAssetReaderTrackOutput(track:track,outputSettings:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA]);out.alwaysCopiesSampleData=false
        try check(reader.canAdd(out),"The exported movie could not be verified.");reader.add(out);try check(reader.startReading(),"The exported movie could not be decoded.");defer{reader.cancelReading()}
        var count:Int64=0
        while let sample=out.copyNextSampleBuffer(){try cancellation.check();let pts=CMSampleBufferGetPresentationTimeStamp(sample).seconds;try check(abs(pts-project.output.rate.seconds(frame:count))<0.002,"An encoded frame has the wrong timestamp.");try check(CMSampleBufferGetImageBuffer(sample) != nil,"An encoded frame has no decodable pixels.");count+=1;if count%60==0{await Task.yield()}}
        try check(reader.status == .completed && count==frames,"The encoded frame count is incomplete.")
        let sounds=try await asset.loadTracks(withMediaType:.audio);try check(sounds.count==(audio ? 1:0),"The movie audio-track count is incorrect.")
    }
}

@MainActor public final class ExportCenter:ObservableObject {
    public static let shared=ExportCenter()
    @Published public private(set) var busy=false
    @Published public private(set) var progress=0.0
    @Published public private(set) var status=""
    @Published public private(set) var receipt:ExportReceipt?
    @Published public private(set) var error:String?
    private var task:Task<Void,Never>?,cancellation:MediaCancellation?,generation=UUID()
    public init(){}
    public func start(snapshot:RenderSnapshot,destination:URL,range:ExportRange?,stillFrame:Int64){
        guard !busy else{error="An export is already running.";return}
        let token=MediaCancellation(),id=UUID();generation=id;cancellation=token;busy=true;progress=0;status="Preparing export";error=nil;receipt=nil
        task=Task.detached(priority:.userInitiated){[weak self] in
            do{let result=try await NativeExport.run(snapshot:snapshot,destination:destination,range:range,stillFrame:stillFrame,cancellation:token){v,s in Task{@MainActor [weak self] in guard let self,self.generation==id,self.busy else{return};self.progress=v;self.status=s}}
                await self?.finish(result:result,error:nil,id:id)
            }catch{await self?.finish(result:nil,error:error is CancellationError ? "Cancelled. The previous destination is unchanged.":error.localizedDescription,id:id)}
        }
    }
    private func finish(result:ExportReceipt?,error:String?,id:UUID){guard generation==id else{return};busy=false;receipt=result;self.error=error;task=nil;cancellation=nil;status=result==nil ? (error ?? "Export failed"):"Exported";if result != nil{progress=1}}
    public func cancel(){guard busy,progress<0.98 else{return};status="Cancelling";cancellation?.cancel();task?.cancel()}
    public func reveal(){if let receipt{NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath:receipt.path)])}}
    public func clear(){guard !busy else{return};receipt=nil;error=nil;status=""}
}
