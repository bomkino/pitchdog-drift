@preconcurrency import AVFoundation
import Foundation
import DriftCore
import DriftNative

@MainActor enum AudioAcceptance {
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
