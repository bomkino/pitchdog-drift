import SwiftUI
import AppKit
@preconcurrency import CoreImage
import DriftCore
import DriftNative

private struct PosterPixels:@unchecked Sendable{let image:CGImage}
private actor PosterWorker {
    static let shared=PosterWorker()
    private let frames=MediaFrames()
    private let context=CIContext(options:[.cacheIntermediates:false])
    private var cached:[String:PosterPixels]=[:],order:[String]=[],cost=0
    func image(_ original:Original,_ workspace:MediaWorkspace,seconds:Double=0,playback:SourcePlayback?=nil,last:Bool=false,size:Int=160,cache:Bool=true)throws->PosterPixels{
        try Task.checkCancellation();try workspace.verify(original)
        var settings=playback ?? SourcePlayback()
        if playback==nil{settings.plays=false;settings.trimInNanoseconds=Int64((max(0,seconds)*1e9).rounded())}
        let request:SourceRequest=last ? .lastBefore(settings.trimOutNanoseconds ?? original.durationNanoseconds):try settings.request(outputSeconds:seconds,original:original)
        let key="\(workspace.root.path)/\(original.id)/\(request)/\(size)"
        if cache,let found=cached[key]{order.removeAll{$0==key};order.append(key);return found}
        let image=try frames.image(original:original,workspace:workspace,playback:settings,request:request,maximumDimension:size)
        guard let result=context.createCGImage(image,from:image.extent,format:.RGBA8,colorSpace:CGColorSpace(name:CGColorSpace.sRGB)!) else{throw NativeFailure.message("Source preview is unavailable.")}
        let pixels=PosterPixels(image:result),bytes=result.bytesPerRow*result.height
        if cache,bytes<=16*1024*1024{
            while cost+bytes>16*1024*1024 || order.count>=128{
                guard !order.isEmpty else{break}
                if let old=cached.removeValue(forKey:order.removeFirst()){cost-=old.image.bytesPerRow*old.image.height}
            }
            cached[key]=pixels;order.append(key);cost+=bytes
        }
        return pixels
    }
}

/// One decode in flight and one replaceable pending request. A scrub or source
/// change invalidates publication, not the decoder's ownership. In particular,
/// an old cancelled completion cannot clear a newer task after reopening.
@MainActor final class SourceClipPreview:ObservableObject {
    @Published private(set) var image:NSImage?
    @Published private(set) var error:String?
    private(set) var publishedSeconds:Double?
    private(set) var publishedOriginalID:String?
    private(set) var publishedLast=false
    private struct Request:Sendable {
        let epoch:UUID,original:Original,workspace:MediaWorkspace,playback:SourcePlayback,seconds:Double,last:Bool
    }
    private var epoch=UUID(),pending:Request?,task:Task<Void,Never>?
    func request(_ original:Original,_ workspace:MediaWorkspace,playback:SourcePlayback,seconds:Double,last:Bool=false,discontinuity:Bool=false){
        if discontinuity{epoch=UUID()}
        pending=Request(epoch:epoch,original:original,workspace:workspace,playback:playback,seconds:seconds,last:last)
        startNext()
    }
    func stop(){epoch=UUID();pending=nil;task?.cancel();image=nil;error=nil;publishedSeconds=nil;publishedOriginalID=nil;publishedLast=false}
    private func startNext(){
        guard task==nil,let request=pending else{return};pending=nil
        task=Task{[weak self] in
            do{
                let value=try await PosterWorker.shared.image(request.original,request.workspace,seconds:request.seconds,playback:request.playback,last:request.last,size:640,cache:false)
                try Task.checkCancellation()
                if let self,self.epoch==request.epoch{
                    self.image=NSImage(cgImage:value.image,size:.zero);self.error=nil
                    self.publishedSeconds=request.seconds;self.publishedOriginalID=request.original.id;self.publishedLast=request.last
                }
            }catch is CancellationError{}catch{if let self,self.epoch==request.epoch{self.error=error.localizedDescription}}
            guard let self else{return};self.task=nil;self.startNext()
        }
    }
}

struct Poster:View {
    let original:Original,workspace:MediaWorkspace
    var seconds=0.0
    var playback:SourcePlayback?=nil
    var last=false
    @State private var image:NSImage?
    @State private var error:String?
    private var identity:String{"\(workspace.root.path)/\(original.id)/\(seconds)/\(String(describing:playback))/\(last)"}
    var body:some View{
        ZStack{
            Color(nsColor:.controlBackgroundColor)
            if let image{Image(nsImage:image).resizable().scaledToFit()}
            else if let error{Image(systemName:"exclamationmark.triangle").help(error)}
            else{ProgressView().controlSize(.mini)}
        }.clipShape(RoundedRectangle(cornerRadius:3)).task(id:identity){
            image=nil;error=nil
            do{let value=try await PosterWorker.shared.image(original,workspace,seconds:seconds,playback:playback,last:last);try Task.checkCancellation();image=NSImage(cgImage:value.image,size:.zero)}catch is CancellationError{}catch{if !Task.isCancelled{self.error=error.localizedDescription}}
        }
    }
}
struct SourceClipView:View {
    let original:Original,workspace:MediaWorkspace,playback:SourcePlayback
    @ObservedObject var transport:Transport
    @StateObject private var preview=SourceClipPreview()
    @State private var expanded=false
    @State private var playing=false
    @State private var elapsed=0.0
    @State private var anchor=0.0
    @State private var remembered:(Int64,Bool,UInt64)?
    private var clipDuration:Double{Double((playback.trimOutNanoseconds ?? original.durationNanoseconds)-playback.trimInNanoseconds)/1e9/playback.rate}
    private var identity:String{"\(workspace.root.path)/\(original.id)"}
    private var inspection:SourcePlayback{var value=playback;value.plays=true;value.loop=false;return value}
    var body:some View{
        DisclosureGroup("Preview source clip",isExpanded:$expanded){
            VStack(spacing:8){
                if let image=preview.image{Image(nsImage:image).resizable().scaledToFit().frame(maxHeight:180)}else{ProgressView().frame(height:90)}
                HStack{
                    Button(playing ? "Pause":"Play"){
                        if playing{playing=false}else{if elapsed>=clipDuration{elapsed=0};anchor=ProcessInfo.processInfo.systemUptime-elapsed;playing=true}
                        request(discontinuity:true)
                    }
                    Slider(value:Binding(get:{elapsed},set:{playing=false;elapsed=$0;request(discontinuity:true)}),in:0...max(0.001,clipDuration))
                    Text(String(format:"%.2f s",elapsed)).driftType(.data)
                }
                HStack(spacing:3){ForEach(0..<5,id:\.self){i in
                    Button{playing=false;elapsed=clipDuration*Double(i)/4;request(discontinuity:true)}label:{
                        Poster(original:original,workspace:workspace,seconds:clipDuration*Double(i)/4,playback:inspection,last:i==4).frame(height:35)
                    }.buttonStyle(.plain).help("Preview source position \(i+1)")
                }}
                if let error=preview.error{Text(error).foregroundStyle(.red).driftType(.caption)}
            }.padding(.vertical,8)
        }.onChange(of:expanded){open in if open{begin()}else{finish()}}
        .onChange(of:playback){_ in playing=false;elapsed=0;preview.stop();request(discontinuity:true)}
        .onChange(of:identity){_ in finish();elapsed=0;expanded=false}
        .onChange(of:preview.error){value in if value != nil{playing=false}}
        .task(id:expanded && playing){
            guard expanded,playing else{return}
            do{while !Task.isCancelled{
                try await Task.sleep(nanoseconds:33_333_333)
                guard expanded,playing else{return}
                elapsed=ProcessInfo.processInfo.systemUptime-anchor
                if elapsed>=clipDuration{if playback.loop{elapsed=positiveModulo(elapsed,clipDuration);anchor=ProcessInfo.processInfo.systemUptime-elapsed}else{elapsed=clipDuration;playing=false}}
                request()
            }}catch is CancellationError{}catch{}
        }.onDisappear(perform:finish)
        .onAppear{if expanded{begin()}}
    }
    private func begin(){remembered=(transport.frame,transport.playing,transport.seekEpoch);transport.pause();request(discontinuity:true)}
    private func request(discontinuity:Bool=false){
        guard expanded else{return}
        var settings=playback;settings.plays=true
        preview.request(original,workspace,playback:settings,seconds:elapsed,last:!playing && elapsed>=clipDuration,discontinuity:discontinuity)
    }
    private func finish(){playing=false;preview.stop()
        if let remembered,transport.frame==remembered.0,transport.seekEpoch==remembered.2,remembered.1,!transport.playing{transport.play()};remembered=nil
    }
}
