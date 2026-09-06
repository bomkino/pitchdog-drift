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
    private var cached:[String:PosterPixels]=[:],order:[String]=[]
    func image(_ original:Original,_ workspace:MediaWorkspace,seconds:Double=0,playback:SourcePlayback?=nil,size:Int=160)throws->PosterPixels{
        try Task.checkCancellation()
        let key="\(original.id)/\(seconds)/\(size)"
        if playback==nil,let found=cached[key]{return found}
        var settings=playback ?? SourcePlayback()
        if playback==nil{settings.plays=false;settings.trimInNanoseconds=Int64((max(0,seconds)*1e9).rounded())}
        let image=try frames.image(original:original,workspace:workspace,playback:settings,seconds:seconds,maximumDimension:size)
        guard let result=context.createCGImage(image,from:image.extent,format:.RGBA8,colorSpace:CGColorSpace(name:CGColorSpace.sRGB)!) else{throw NativeFailure.message("Source preview is unavailable.")}
        let pixels=PosterPixels(image:result)
        if playback==nil{if order.count>=128{cached.removeValue(forKey:order.removeFirst())};cached[key]=pixels;order.append(key)}
        return pixels
    }
}
struct Poster:View {
    let original:Original,workspace:MediaWorkspace
    var seconds=0.0
    @State private var image:NSImage?
    @State private var error:String?
    var body:some View{
        ZStack{
            Color(nsColor:.controlBackgroundColor)
            if let image{Image(nsImage:image).resizable().scaledToFit()}
            else if let error{Image(systemName:"exclamationmark.triangle").help(error)}
            else{ProgressView().controlSize(.mini)}
        }.clipShape(RoundedRectangle(cornerRadius:3)).task(id:"\(original.id)/\(seconds)"){
            do{let value=try await PosterWorker.shared.image(original,workspace,seconds:seconds);try Task.checkCancellation();image=NSImage(cgImage:value.image,size:.zero);error=nil}catch is CancellationError{}catch{self.error=error.localizedDescription}
        }
    }
}
struct SourceClipView:View {
    let original:Original,workspace:MediaWorkspace,playback:SourcePlayback
    @ObservedObject var transport:Transport
    @State private var expanded=false
    @State private var playing=false
    @State private var elapsed=0.0
    @State private var anchor=0.0
    @State private var image:NSImage?
    @State private var error:String?
    @State private var task:Task<Void,Never>?
    @State private var remembered:(Int64,Bool,UInt64)?
    private let clock=Timer.publish(every:1/30,on:.main,in:.common).autoconnect()
    private var fullDuration:Double{Double(original.durationNanoseconds)/1e9}
    private var clipDuration:Double{Double((playback.trimOutNanoseconds ?? original.durationNanoseconds)-playback.trimInNanoseconds)/1e9/playback.rate}
    var body:some View{
        DisclosureGroup("Preview source clip",isExpanded:$expanded){
            VStack(spacing:8){
                if let image{Image(nsImage:image).resizable().scaledToFit().frame(maxHeight:180)}else{ProgressView().frame(height:90)}
                HStack{
                    Button(playing ? "Pause":"Play"){if playing{playing=false}else{transport.pause();if elapsed>=clipDuration{elapsed=0};anchor=ProcessInfo.processInfo.systemUptime-elapsed;playing=true};request()}
                    Slider(value:$elapsed,in:0...max(0.001,clipDuration),onEditingChanged:{editing in playing=false;if !editing{request()}})
                    Text(String(format:"%.2f s",elapsed)).font(.caption.monospacedDigit())
                }
                HStack(spacing:3){ForEach(0..<5,id:\.self){i in
                    Button{playing=false;elapsed=clipDuration*Double(i)/4;if elapsed>=clipDuration{elapsed=max(0,clipDuration-1/120)};request()}label:{Poster(original:original,workspace:workspace,seconds:min(max(0,fullDuration-0.001),Double(playback.trimInNanoseconds)/1e9+clipDuration*playback.rate*Double(i)/4)).frame(height:35)}.buttonStyle(.plain).help("Preview source position \(i+1)")
                }}
                if let error{Text(error).foregroundStyle(.red).font(.caption)}
            }.padding(.vertical,8)
        }.onChange(of:expanded){open in if open{remembered=(transport.frame,transport.playing,transport.seekEpoch);transport.pause();request()}else{finish()}}
        .onChange(of:playback){_ in playing=false;elapsed=0;request()}
        .onReceive(clock){now in guard expanded,playing else{return};elapsed=ProcessInfo.processInfo.systemUptime-anchor
            if elapsed>=clipDuration{if playback.loop{elapsed=positiveModulo(elapsed,clipDuration);anchor=ProcessInfo.processInfo.systemUptime-elapsed}else{elapsed=clipDuration;playing=false}}
            request()
        }.onDisappear(perform:finish)
    }
    private func request(){
        guard expanded,task==nil else{return};let time=elapsed,original=original,workspace=workspace
        var settings=playback;settings.plays=true
        task=Task{do{let value=try await PosterWorker.shared.image(original,workspace,seconds:time,playback:settings,size:640);try Task.checkCancellation();image=NSImage(cgImage:value.image,size:.zero);error=nil}catch is CancellationError{}catch{self.error=error.localizedDescription;playing=false};task=nil}
    }
    private func finish(){playing=false;task?.cancel();task=nil
        if let remembered,transport.frame==remembered.0,transport.seekEpoch==remembered.2,remembered.1{transport.toggle()};remembered=nil
    }
}
