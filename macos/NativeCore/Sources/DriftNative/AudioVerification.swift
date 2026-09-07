@preconcurrency import AVFoundation
import AudioToolbox
import Foundation

public struct AudioVerification:Sendable,Codable {
    public let sampleFrames:Int64,peak:Double,rms:Double
}

public extension NativeExport {
    /// Decode the finished AAC stream, not just its track metadata. PCM buffers
    /// are bounded by one decoder packet and discarded after each inspection.
    static func inspectAudio(_ url:URL,duration:Double,cancellation:MediaCancellation=MediaCancellation())async throws->AudioVerification{
        let asset=AVURLAsset(url:url),tracks=try await asset.loadTracks(withMediaType:.audio)
        guard tracks.count==1,let track=tracks.first else{throw NativeFailure.message("The export must contain exactly one audio track.")}
        let reader=try AVAssetReader(asset:asset)
        let out=AVAssetReaderTrackOutput(track:track,outputSettings:[AVFormatIDKey:kAudioFormatLinearPCM,AVSampleRateKey:48000,AVNumberOfChannelsKey:2,AVLinearPCMBitDepthKey:32,AVLinearPCMIsFloatKey:true,AVLinearPCMIsBigEndianKey:false,AVLinearPCMIsNonInterleaved:false])
        out.alwaysCopiesSampleData=false
        try check(reader.canAdd(out),"The exported sound cannot be inspected.");reader.add(out)
        try check(reader.startReading(),reader.error?.localizedDescription ?? "The exported sound could not be decoded.")
        defer{reader.cancelReading()}
        var frames:Int64=0,peak=0.0,energy=0.0,previousEnd:Double?,firstTime:Double?
        while let sample=out.copyNextSampleBuffer(){
            try cancellation.check()
            let count=CMSampleBufferGetNumSamples(sample)
            guard count>0 else{continue}
            guard let format=CMSampleBufferGetFormatDescription(sample),let basic=CMAudioFormatDescriptionGetStreamBasicDescription(format)?.pointee,
                  basic.mSampleRate==48000,basic.mChannelsPerFrame==2,basic.mBitsPerChannel==32,basic.mFormatFlags&kAudioFormatFlagIsFloat != 0,
                  let block=CMSampleBufferGetDataBuffer(sample) else{throw NativeFailure.message("The exported sound has an unexpected decoded format.")}
            let pts=CMSampleBufferGetOutputPresentationTimeStamp(sample).seconds
            try check(pts.isFinite,"The exported sound contains an invalid timestamp.")
            if let previousEnd{try check(abs(pts-previousEnd)<=2.0/48000,"The exported sound has a gap or overlapping samples.")}
            if firstTime==nil{firstTime=pts}
            previousEnd=pts+Double(count)/48000
            try check(count<=1_048_576 && CMBlockBufferGetDataLength(block)==count*8,"The exported sound has an invalid sample buffer.")
            var pcm=[Float](repeating:0,count:count*2)
            let status=pcm.withUnsafeMutableBytes{CMBlockBufferCopyDataBytes(block,atOffset:0,dataLength:$0.count,destination:$0.baseAddress!)}
            try check(status==kCMBlockBufferNoErr,"The exported audio samples are unreadable.")
            for value in pcm{let v=Double(value);try check(v.isFinite,"The exported sound contains non-finite samples.");peak=max(peak,abs(v));energy+=v*v}
            frames+=Int64(count)
            if frames%48000<Int64(count){await Task.yield()}
        }
        try check(reader.status == .completed && frames>0,reader.error?.localizedDescription ?? "The exported sound is incomplete.")
        // AAC priming/padding can occupy up to two 1024-sample packets. Do not
        // confuse that codec boundary with lost authored content or long gaps.
        let tolerance=2048.0/48000
        try check(abs(firstTime ?? .infinity)<=tolerance && abs((previousEnd ?? 0)-duration)<=tolerance && abs(Double(frames)/48000-duration)<=tolerance,"The exported sound duration does not match the movie.")
        return AudioVerification(sampleFrames:frames,peak:peak,rms:sqrt(energy/Double(frames*2)))
    }
}
