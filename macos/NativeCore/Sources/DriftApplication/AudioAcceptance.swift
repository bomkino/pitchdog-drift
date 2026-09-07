@preconcurrency import AVFoundation
import Foundation
import DriftCore
import DriftNative

@MainActor enum AudioAcceptance {
    static func previewLifecycle(snapshot:RenderSnapshot,output:URL)async throws->String{
        func phase(_ name:String)throws{
            try JSONSerialization.data(withJSONObject:["phase":name]).write(to:output.appendingPathComponent("Preview-Audio-Progress.json"),options:.atomic)
        }
        var project=snapshot.project;project.creative.sound.previewEnabled=true
        var current=try RenderSnapshot(project:project,workspace:snapshot.workspace),revision:UInt64=0
        let transport=Transport(plan:current.plan),preview=PreviewSound()
        var issue:String?
        preview.onError={issue=$0}
        transport.didTick={_,_ in preview.update(snapshot:current,revision:revision,transport:transport)}
        defer{transport.pause();preview.stop();transport.didTick=nil}
        try phase("initial playback");transport.seek(3);transport.play()
        try await NativeApplicationProof.wait("actual recorded-sound preview starts"){preview.playbackStarts==1 || issue != nil}
        try NativeApplicationProof.require(issue==nil,"preview audio: \(issue ?? "")")
        try NativeApplicationProof.require(preview.buildCount==1,"one initial soundtrack build")
        try phase("Look edits during playback");let inspected=transport.frame
        for step in 0..<8{
            project.creative.atmosphere.grain=Double(step)/20
            current=try RenderSnapshot(project:project,workspace:snapshot.workspace);revision+=1
            transport.update(current.plan)
            try await Task.sleep(nanoseconds:20_000_000)
        }
        try NativeApplicationProof.require(transport.playing && transport.frame>inspected && preview.buildCount==1 && preview.playbackStarts==1,"Look edits preserve the running soundtrack and clock")
        try phase("pause");transport.pause();try await Task.sleep(nanoseconds:150_000_000)
        try NativeApplicationProof.require(preview.playbackStarts==1,"late audio callbacks cannot restart paused playback")
        try phase("resume");transport.play()
        try await NativeApplicationProof.wait("resume uses prepared recorded sound"){preview.playbackStarts==2 || issue != nil}
        try phase("seek");transport.seek(12);transport.play()
        try await NativeApplicationProof.wait("seek starts one current sound queue"){preview.playbackStarts==3 || issue != nil}
        try phase("stop");transport.pause();preview.stop();let starts=preview.playbackStarts
        try await Task.sleep(nanoseconds:150_000_000)
        try NativeApplicationProof.require(issue==nil && preview.playbackStarts==starts && preview.buildCount==1,"closed preview cannot publish or rebuild stale sound")
        let metrics:[String:Any]=["soundtrackBuilds":preview.buildCount,"playbackStarts":starts,"lookEdits":8,"result":"passed"]
        try JSONSerialization.data(withJSONObject:metrics,options:[.prettyPrinted,.sortedKeys]).write(to:output.appendingPathComponent("Preview-Audio-Metrics.json"))
        return "Actual AVAudioEngine preview: one soundtrack across Look edits, pause/resume/seek, and no stale restart after stop"
    }
    static func run(snapshot:RenderSnapshot,url:URL,output:URL)async throws->String{
        let measured=try await NativeExport.inspectAudio(url,duration:snapshot.plan.duration)
        try NativeApplicationProof.require(measured.rms>0.000001 && measured.peak<1,"recorded AAC must be audible, finite and unclipped")
        let expectedFrames=Int((snapshot.plan.duration*48000).rounded())
        try NativeApplicationProof.require(expectedFrames>0 && expectedFrames<=480000,"bounded sound acceptance fixture")
        let reference=try SoundTrack(plan:snapshot.plan).samples(start:0,count:expectedFrames)
        let asset=AVURLAsset(url:url),tracks=try await asset.loadTracks(withMediaType:.audio),reader=try AVAssetReader(asset:asset)
        guard let track=tracks.first else{throw NativeFailure.message("Recorded AAC track is missing.")}
        let source=AVAssetReaderTrackOutput(track:track,outputSettings:[AVFormatIDKey:kAudioFormatLinearPCM,AVSampleRateKey:48000,AVNumberOfChannelsKey:2,AVLinearPCMBitDepthKey:32,AVLinearPCMIsFloatKey:true,AVLinearPCMIsBigEndianKey:false,AVLinearPCMIsNonInterleaved:false])
        source.alwaysCopiesSampleData=false;reader.add(source)
        try NativeApplicationProof.require(reader.startReading(),"recorded AAC comparison decode starts");defer{reader.cancelReading()}
        var dot=0.0,expectedEnergy=0.0,actualEnergy=0.0,errorEnergy=0.0,compared=0
        while let sample=source.copyNextSampleBuffer(){
            let n=CMSampleBufferGetNumSamples(sample);if n==0{continue}
            guard let block=CMSampleBufferGetDataBuffer(sample) else{throw NativeFailure.message("Recorded AAC comparison samples unavailable.")}
            var pcm=[Float](repeating:0,count:n*2)
            let status=pcm.withUnsafeMutableBytes{CMBlockBufferCopyDataBytes(block,atOffset:0,dataLength:$0.count,destination:$0.baseAddress!)}
            try NativeApplicationProof.require(status==kCMBlockBufferNoErr,"recorded AAC comparison samples readable")
            let start=Int((CMSampleBufferGetOutputPresentationTimeStamp(sample).seconds*48000).rounded())
            for i in 0..<n where start+i>=0 && start+i<expectedFrames{
                for channel in 0..<2{
                    let a=Double(reference[(start+i)*2+channel]),b=Double(pcm[i*2+channel])
                    dot+=a*b;expectedEnergy+=a*a;actualEnergy+=b*b;errorEnergy+=(a-b)*(a-b);compared+=1
                }
            }
        }
        let correlation=dot/sqrt(max(1e-30,expectedEnergy*actualEnergy)),relativeError=sqrt(errorEnergy/max(1e-30,expectedEnergy))
        try NativeApplicationProof.require(reader.status == .completed && compared>=expectedFrames*2-4096,"recorded AAC covers the authored event schedule")
        try NativeApplicationProof.require(expectedEnergy>1e-8 && correlation>0.90 && relativeError<0.45,"recorded AAC matches preview mixer at its actual timestamps: correlation \(correlation), relative error \(relativeError)")
        let metrics:[String:Any]=["sampleFrames":measured.sampleFrames,"peak":measured.peak,"rms":measured.rms,"correlationWithPreviewPCM":correlation,"relativePCMError":relativeError,"comparedStereoSamples":compared,"source":Bundle.main.object(forInfoDictionaryKey:"DriftSourceRevision") ?? "unknown"]
        try JSONSerialization.data(withJSONObject:metrics,options:[.prettyPrinted,.sortedKeys]).write(to:output.appendingPathComponent("Audio-Metrics.json"))
        return "Decoded licensed AAC is non-silent, finite, unclipped and aligned with the shared preview mixer/event schedule"
    }
}
