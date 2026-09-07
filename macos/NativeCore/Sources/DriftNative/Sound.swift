@preconcurrency import AVFoundation
import Foundation
import DriftCore

private struct SoundAsset:Decodable,Sendable {let name:String,trimStart:Double,trimEnd:Double,gain:Double}
private struct SoundCatalog:Decodable {let palettes:[String:[String:[SoundAsset]]]}
private struct RecordedPCM:Sendable {let samples:[Float],channels:Int,rate:Double;var frames:Int{samples.count/channels};var duration:Double{Double(frames)/rate}}
private struct SoundVoice:Sendable {let start:Double,end:Double,asset:RecordedPCM,offset:Double,rate:Double,gain:Double,pan:Double}
private func soundHash(_ seed:Double)->Double {var n=UInt32(truncatingIfNeeded:Int64(seed));n=(n^(n>>16)) &* 0x45d9f3b;n=(n^(n>>16)) &* 0x45d9f3b;n ^= n>>16;return Double(n)/4_294_967_295}
/// Immutable, bounded recorded sounds. The same event list and sample mixer
/// serve native preview and output. Media-file audio is deliberately not mixed.
public final class SoundTrack:Sendable {
    public static let rate=48000
    private let voices:[SoundVoice]
    private let master:Double
    public let duration:Double
    public init(plan:FramePlan,resources:URL?=nil)throws{
        duration=plan.duration;let p=plan.project,s=p.creative.sound
        master=bounded(s.masterLevel*s.motionLevel,0,1)
        if p.direction.reduceAuthoredMotion || plan.moving.isEmpty || master==0 {voices=[];return}
        let root=(resources ?? Bundle.main.resourceURL!).appendingPathComponent("Sound",isDirectory:true)
        let catalog=try JSONDecoder().decode(SoundCatalog.self,from:Data(contentsOf:root.appendingPathComponent("SoundCatalog.json")))
        let palette=s.material=="paper" || s.material=="cinematic" ? s.material:"studio"
        guard let library=catalog.palettes[palette] else{throw NativeFailure.message("The recorded-sound catalog is incomplete.")}
        let c=p.creative.motion.cadence,linger=bounded(p.creative.motion.performance.linger,0,1)
        let weights=[max(0,c.read)*(0.72+linger*0.72),max(0,c.anticipation),max(0.001,c.carry),max(0,c.impact),max(0,c.settle),max(0,c.land)*(0.72+linger*0.72)]
        let total=weights.reduce(0,+),departure=(weights[0]+weights[1])/total,impact=departure+weights[2]/total
        let thresholds:[(String,Double,Double,Double)]=[("air",departure,0.42,0.2),("passage",departure+weights[2]/total*0.5,0.72,0.64),("contact",impact,1,0.34),("settle",impact+weights[3]/total,0.48,0.4)]
        let finalDistance=abs(plan.base.sample(seconds:plan.base.duration).travel.distance)
        try check(finalDistance<100_000,"This motion soundtrack contains too many events. Reduce passes or turn off export sound.")
        var result:[SoundVoice]=[],decoded:[String:RecordedPCM]=[:]
        func pcm(_ name:String)throws->RecordedPCM {
            if let cached=decoded[name]{return cached}
            let file=try AVAudioFile(forReading:root.appendingPathComponent(name),commonFormat:.pcmFormatFloat32,interleaved:false)
            try check(file.length>0 && file.length<=1_000_000 && file.processingFormat.channelCount<=2,"A recorded sound exceeds its decoding budget.")
            guard let buffer=AVAudioPCMBuffer(pcmFormat:file.processingFormat,frameCapacity:AVAudioFrameCount(file.length)) else{throw NativeFailure.message("The recorded sound could not be loaded.")}
            try file.read(into:buffer);guard let channels=buffer.floatChannelData else{throw NativeFailure.message("The sound has no PCM samples.")}
            let count=Int(buffer.frameLength),n=Int(buffer.format.channelCount)
            var samples=[Float](repeating:0,count:count*n)
            for i in 0..<count{for channel in 0..<n{samples[i*n+channel]=channels[channel][i]}}
            let value=RecordedPCM(samples:samples,channels:n,rate:buffer.format.sampleRate);decoded[name]=value;return value
        }
        for cycle in 0..<Int(ceil(finalDistance)) {
            try Task.checkCancellation()
            for (cue,phase,intensity,roleGain) in thresholds{
                if cue=="air" && s.grammar != "organic"{continue};if cue=="contact" && s.grammar=="dry"{continue}
                let target=Double(cycle)+phase,sequence=Double(cycle+1);if target>finalDistance{continue}
                let seed=Double(p.seed),chance=soundHash(seed+s.take*911+sequence*977+Double(cue.count)*37)
                if cue != "passage" && chance>bounded(s.density,0,1){continue}
                var lo=0.0,hi=plan.base.duration
                for _ in 0..<48{let mid=(lo+hi)/2;if abs(plan.base.sample(seconds:mid).travel.distance)<target{lo=mid}else{hi=mid}}
                let sourceFrame=min(plan.base.baseFrames-1,Int64(ceil(hi*Double(p.output.rate.numerator)/Double(p.output.rate.denominator)-1e-9)))
                let insertion=plan.schedule.cues.filter{!$0.closing && $0.baseFrame<=sourceFrame}.reduce(Int64(0)){$0+$1.endFrame-$1.startFrame}
                var start=p.output.rate.seconds(frame:sourceFrame+insertion)
                start=max(0,start+(cue=="air" ? -0.035:cue=="contact" ? 0.012:0))
                guard let options=library[cue],!options.isEmpty else{throw NativeFailure.message("A recorded sound cue is missing.")}
                let variant=min(options.count-1,Int(floor(soundHash(seed+s.take*101+sequence*313)*Double(options.count)))),spec=options[variant],asset=try pcm(spec.name)
                let texture=(soundHash(seed+sequence*1229)*2-1)*bounded(s.texture,0,1),rate=bounded(1+texture*0.075,0.86,1.14)
                let span=max(0,asset.duration-spec.trimStart-spec.trimEnd)/rate
                let pan=p.creative.motion.transport.axis=="horizontal" ? bounded(p.creative.motion.transport.direction*texture*0.24,-0.42,0.42):0
                if span>0 && start<duration{result.append(SoundVoice(start:start,end:start+span,asset:asset,offset:spec.trimStart,rate:rate,gain:min(0.82,bounded(roleGain*(0.72+intensity*0.28),0,0.78)*spec.gain),pan:pan))}
            }
        }
        voices=result.sorted{$0.start<$1.start}
    }
    public func samples(start:Int64,count:Int)->[Float]{
        var result=[Float](repeating:0,count:max(0,count)*2);guard count>0 else{return result}
        let from=Double(start)/Double(Self.rate),until=Double(start+Int64(count))/Double(Self.rate)
        // Sounds are short; binary search avoids scanning the whole sequence on every block.
        var lo=0,hi=voices.count
        while lo<hi{let m=(lo+hi)/2;if voices[m].start<from-30{lo=m+1}else{hi=m}}
        for voice in voices.dropFirst(lo){
            if voice.start>=until{break};if voice.end<=from{continue}
            let first=max(0,Int(ceil((voice.start-from)*Double(Self.rate)))),last=min(count,Int(ceil((voice.end-from)*Double(Self.rate))))
            if first>=last{continue}
            let duration=voice.end-voice.start,attack=min(0.012,duration*0.2),release=min(0.06,duration*0.3)
            for i in first..<last{
                let local=from+Double(i)/Double(Self.rate)-voice.start,pos=(voice.offset+local*voice.rate)*voice.asset.rate,base=Int(floor(pos)),blend=Float(pos-Double(base))
                if base<0 || base>=voice.asset.frames{continue}
                let envelope=min(1,local/max(0.000001,attack),(duration-local)/max(0.000001,release)),gain=Float(max(0,envelope)*voice.gain*master)
                func sample(_ channel:Int)->Float{let c=min(channel,voice.asset.channels-1),a=voice.asset.samples[base*voice.asset.channels+c],b=voice.asset.samples[min(voice.asset.frames-1,base+1)*voice.asset.channels+c];return a+(b-a)*blend}
                let left=sample(0),right=sample(1)
                if voice.asset.channels==1{let theta=(voice.pan+1)*Double.pi/4;result[i*2]+=left*Float(cos(theta))*gain;result[i*2+1]+=left*Float(sin(theta))*gain}
                else if voice.pan<=0{let angle=(voice.pan+1)*Double.pi/2;result[i*2]+=(left+right*Float(cos(angle)))*gain;result[i*2+1]+=right*Float(sin(angle))*gain}
                else{let angle=voice.pan*Double.pi/2;result[i*2]+=left*Float(cos(angle))*gain;result[i*2+1]+=(right+left*Float(sin(angle)))*gain}
            }
        }
        // A deterministic soft knee keeps the recorded body rather than clipping.
        // It is shared by preview/export; finite values and <=1 peak are enforced.
        for i in result.indices{let x=Double(result[i]),db=20*log10(max(1e-12,abs(x))),over=db+8,reduced:Double
            if over<=(-4){reduced=0}else if over>=4{reduced=over*(1-1/5)}else{reduced=(1-1/5)*pow(over+4,2)/16}
            result[i]=Float(bounded(x*pow(10,-reduced/20),-1,1))
        }
        return result
    }
}

@MainActor public final class PreviewSound {
    private var engine:AVAudioEngine?,player:AVAudioPlayerNode?,track:SoundTrack?
    private var preparation:Task<SoundTrack,Error>?,completion:Task<Void,Never>?
    private var buildToken=UUID(),queueToken=UUID(),playing=false,nextSample:Int64=0
    private var identity:SoundRenderIdentity?,revision:UInt64?,epoch:UInt64=0
    private var documentID:String?,previewEnabled=false
    public private(set) var buildCount=0,playbackStarts=0
    public var onError:((String)->Void)?
    public init(){}
    public func update(snapshot:RenderSnapshot,revision:UInt64,transport:Transport){
        previewEnabled=snapshot.project.creative.sound.previewEnabled
        if self.revision != revision || documentID != snapshot.project.id || identity==nil {
            documentID=snapshot.project.id
            let next=SoundRenderIdentity(snapshot.plan);self.revision=revision
            if identity != next {
                stopPlayback();buildToken=UUID();preparation?.cancel();completion?.cancel()
                preparation=nil;completion=nil;track=nil;identity=next
            }
        }
        guard previewEnabled else{stopPlayback();return}
        guard transport.playing else{stopPlayback();return}
        if track==nil {
            guard preparation==nil else{return}
            let token=buildToken,work=Task.detached(priority:.utility){try SoundTrack(plan:snapshot.plan)}
            preparation=work;buildCount+=1
            completion=Task{[weak self,weak transport] in
                do{
                    let value=try await work.value
                    guard let self,self.buildToken==token,!Task.isCancelled,let transport else{return}
                    self.track=value;self.preparation=nil;self.completion=nil
                    self.startPreparedPlayback(transport)
                }catch{
                    guard let self,self.buildToken==token,!Task.isCancelled else{return}
                    self.preparation=nil;self.completion=nil
                    if !(error is CancellationError){self.onError?(error.localizedDescription)}
                }
            }
            return
        }
        startPreparedPlayback(transport)
    }
    private func startPreparedPlayback(_ transport:Transport){
        guard previewEnabled,transport.playing,let track else{return}
        if !playing || epoch != transport.seekEpoch {
            do{
                stopPlayback()
                if engine==nil{
                    let e=AVAudioEngine(),p=AVAudioPlayerNode();e.attach(p)
                    e.connect(p,to:e.mainMixerNode,format:AVAudioFormat(standardFormatWithSampleRate:48000,channels:2)!)
                    try e.start();engine=e;player=p
                }
                epoch=transport.seekEpoch;nextSample=Int64((transport.seconds*48000).rounded())
                playing=true;playbackStarts+=1;let token=queueToken
                for _ in 0..<3{enqueue(track:track,token:token)};player?.play()
            }catch{stopPlayback();onError?(error.localizedDescription)}
        }
    }
    private func enqueue(track:SoundTrack,token:UUID){
        guard playing,token==queueToken,let player,let format=AVAudioFormat(standardFormatWithSampleRate:48000,channels:2),let buffer=AVAudioPCMBuffer(pcmFormat:format,frameCapacity:2048) else{return}
        let values=track.samples(start:nextSample,count:2048);nextSample+=2048;buffer.frameLength=2048
        for i in 0..<2048{buffer.floatChannelData![0][i]=values[i*2];buffer.floatChannelData![1][i]=values[i*2+1]}
        player.scheduleBuffer(buffer,completionCallbackType:.dataConsumed){[weak self] _ in
            Task{@MainActor in self?.enqueue(track:track,token:token)}
        }
    }
    private func stopPlayback(){
        // AVAudioPlayerNode.stop can complete old buffers after a subsequent
        // Play. Rotate authority before stopping; those callbacks cannot enqueue.
        if playing{queueToken=UUID();playing=false;player?.stop()}
    }
    public func stop(){
        buildToken=UUID();queueToken=UUID();preparation?.cancel();completion?.cancel()
        preparation=nil;completion=nil;playing=false;player?.stop();engine?.stop()
        player=nil;engine=nil;track=nil;identity=nil;revision=nil;documentID=nil;previewEnabled=false
    }
}
