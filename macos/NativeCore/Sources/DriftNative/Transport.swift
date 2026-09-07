import Foundation
import Combine
import DriftCore

@MainActor public final class Transport:ObservableObject {
    @Published public private(set) var frame:Int64=0
    @Published public private(set) var playing=false
    @Published public private(set) var seekEpoch:UInt64=0
    @Published public var zoom=0.0
    @Published public var quality=0.75
    private var plan:FramePlan,timer:Timer?,anchorTime=0.0,anchorFrame:Int64=0
    private struct Audition {let frame:Int64,playing:Bool,end:Int64,epoch:UInt64}
    private var audition:Audition?
    public var didTick:((Int64,Bool)->Void)?
    public init(plan:FramePlan){self.plan=plan}
    public var totalFrames:Int64{plan.schedule.totalFrames}
    public var seconds:Double{plan.schedule.rate.seconds(frame:frame)}
    public var duration:Double{plan.schedule.rate.seconds(frame:totalFrames)}
    public var fps:Double{Double(plan.schedule.rate.numerator)/Double(plan.schedule.rate.denominator)}
    public var label:String{let f=max(0,frame),whole=Int(plan.schedule.rate.seconds(frame:f));return String(format:"%02d:%02d:%02d:%02d",whole/3600,(whole/60)%60,whole%60,Int(floor((plan.schedule.rate.seconds(frame:f)-Double(whole))*fps+1e-7)))}
    public func update(_ value:FramePlan){
        let now=ProcessInfo.processInfo.systemUptime
        let oldSeconds=playing ? max(seconds,plan.schedule.rate.seconds(frame:anchorFrame)+max(0,now-anchorTime)):seconds
        let identityChanged=value.project.id != plan.project.id
        let timelineChanged=identityChanged || value.schedule.rate != plan.schedule.rate || value.schedule.baseFrameCount != plan.schedule.baseFrameCount || value.schedule.totalFrames != plan.schedule.totalFrames || value.schedule.cues != plan.schedule.cues
        if identityChanged{pause()}
        plan=value
        if timelineChanged{
            audition=nil;frame=identityChanged ? 0:min(totalFrames-1,max(0,Int64(floor(oldSeconds*fps+1e-9))))
            anchorFrame=frame;anchorTime=now;seekEpoch &+= 1
        }
        // Appearance edits replace the render plan, not the playback clock.
        // In particular, do not reset a fractional frame during slider drags.
        didTick?(frame,playing)
    }
    public func seek(_ value:Int64){pause();audition=nil;frame=min(totalFrames-1,max(0,value));seekEpoch &+= 1;didTick?(frame,false)}
    public func step(_ delta:Int64){seek(frame+delta)}
    public func toggle(){playing ? pause():play()}
    public func play(){if frame>=totalFrames-1{frame=0;seekEpoch &+= 1};anchorFrame=frame;anchorTime=ProcessInfo.processInfo.systemUptime;playing=true;timer?.invalidate()
        let t=Timer(timeInterval:1/60,repeats:true){[weak self] _ in MainActor.assumeIsolated{self?.tick()}};timer=t;RunLoop.main.add(t,forMode:.common)
    }
    public func pause(){timer?.invalidate();timer=nil;playing=false;didTick?(frame,false)}
    private func tick(){
        var next=anchorFrame+Int64(floor(max(0,ProcessInfo.processInfo.systemUptime-anchorTime)*fps))
        if let audition,next>=audition.end{self.audition=nil;pause();frame=audition.frame;seekEpoch &+= 1;if audition.playing{play()};return}
        if next>=totalFrames{if plan.project.direction.mode == .loop{next%=totalFrames;anchorFrame=next;anchorTime=ProcessInfo.processInfo.systemUptime;seekEpoch &+= 1}else{next=totalFrames-1;pause()}}
        if next != frame{frame=next;didTick?(frame,playing)}
    }
    public func previewCue(_ id:String){guard let cue=plan.schedule.cues.first(where:{$0.id==id}) else{return};let previous=frame,wasPlaying=playing;pause();frame=cue.startFrame;seekEpoch &+= 1;audition=Audition(frame:previous,playing:wasPlaying,end:cue.endFrame,epoch:seekEpoch);play()}
    public func cancelAudition(){guard let old=audition else{return};audition=nil;pause();frame=old.frame;seekEpoch &+= 1;if old.playing{play()}}
    public func nextCue(_ backwards:Bool){let times=plan.schedule.cues.map(\.holdStartFrame);guard !times.isEmpty else{return};seek(backwards ? times.last(where:{$0<frame}) ?? times.last!:times.first(where:{$0>frame}) ?? times.first!)}
}
