import Foundation

/// Only inputs consumed by the shared soundtrack invalidate its event/PCM plan.
/// Appearance, selection, preview quality and export-dialog flags do not.
public struct SoundRenderIdentity:Equatable,Sendable {
    private let documentID:String,axis:String
    private let seed:Int64,rate:OutputRate,direction:Direction
    private let sign:Double,count:Int,cadence:MotionSettingsCadence
    private let performance:MotionSettingsPerformance,character:MotionSettingsCharacter
    private let cues:[ScheduledCue],frames:Int64,sound:SoundSettings
    public init(_ plan:FramePlan){
        let p=plan.project,m=p.creative.motion
        documentID=p.id;seed=p.seed;axis=m.transport.axis;sign=m.transport.direction
        count=plan.moving.count;rate=p.output.rate;direction=p.direction
        cadence=m.cadence;performance=m.performance;character=m.character
        cues=plan.schedule.cues;frames=plan.schedule.totalFrames
        var audio=p.creative.sound
        audio.previewEnabled=true;audio.exportEnabled=true;audio.interfaceLevel=0
        sound=audio
    }
}
