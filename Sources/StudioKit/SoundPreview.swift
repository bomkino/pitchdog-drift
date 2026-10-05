import AVFoundation
import Foundation

/// Plays a loop's sound mix beside the live stage. While it plays, its position
/// is the clock, so the picture follows the sound and the two never drift.
@MainActor
final class SoundPreview {
    private var engine: AVAudioEngine?
    private var player: AVAudioPlayerNode?
    private var format: AVAudioFormat?
    private(set) var signature: Int?
    private var loop: Double = 1
    private var startTime: Double = 0

    var isPlaying: Bool { player?.isPlaying ?? false }

    /// Starts the mix at `time` within the loop and repeats it.
    func play(_ track: AudioTrack, signature: Int, loop: Double, from time: Double) {
        guard track.frames > 0, loop > 0 else { return }
        if engine == nil {
            let engine = AVAudioEngine()
            let player = AVAudioPlayerNode()
            guard let format = AVAudioFormat(standardFormatWithSampleRate: Double(AudioTrack.sampleRate), channels: 2) else { return }
            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: format)
            self.engine = engine
            self.player = player
            self.format = format
        }
        guard let engine, let player, let format else { return }
        player.stop()
        // The loop, rotated to begin where the playhead is.
        let frames = track.frames
        let offset = Int((wrap(time, loop) * Double(AudioTrack.sampleRate)).rounded()) % frames
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)),
              let channels = buffer.floatChannelData else { return }
        buffer.frameLength = AVAudioFrameCount(frames)
        let left = channels[0], right = channels[1]
        track.samples.withUnsafeBufferPointer { s in
            for i in 0..<frames {
                let j = (i + offset) % frames
                left[i] = s[2 * j]
                right[i] = s[2 * j + 1]
            }
        }
        if !engine.isRunning {
            do { try engine.start() } catch { return }
        }
        player.scheduleBuffer(buffer, at: nil, options: .loops)
        player.play()
        self.signature = signature
        self.loop = loop
        self.startTime = wrap(time, loop)
    }

    /// Where in the loop the sound now playing is.
    func position() -> Double? {
        guard let player, player.isPlaying, let node = player.lastRenderTime,
              let t = player.playerTime(forNodeTime: node), t.sampleRate > 0 else { return nil }
        return wrap(startTime + Double(t.sampleTime) / t.sampleRate, loop)
    }

    func stop() {
        player?.stop()
        signature = nil
    }
}
