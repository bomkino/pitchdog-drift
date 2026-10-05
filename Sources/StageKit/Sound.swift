import AVFoundation
import Foundation
import RenderCore

// Tactile sound: recorded foley placed on the moments a scene's cards actually
// move. The mix is rendered once per loop and wraps at the loop point, so the
// sound loops as seamlessly as the picture, and the same mix plays in the
// preview and goes into the export.
//
// Recordings: Kenney's Casino Audio, Impact Sounds and RPG Audio packs (CC0),
// pinned by hash in Resources/Sound/manifest.json. Trims and levels come from
// Resources/Sound/treatments.json, measured for Drift 1.

/// The character of the sound, each a small set of materials.
public enum SoundPalette: String, Codable, CaseIterable, Identifiable, Sendable {
    case editorial
    case cinema
    case paper

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .editorial: return "Editorial"
        case .cinema: return "Cinema"
        case .paper: return "Paper"
        }
    }

    public var summary: String {
        switch self {
        case .editorial: return "Cards, cloth and paper grain, close and dry."
        case .cinema: return "Card shoves, wood and metal, with weight."
        case .paper: return "Page turns, cloth and books; the quietest."
        }
    }
}

/// What happens at a moment in the loop.
public enum SoundCue: String, Sendable, CaseIterable {
    /// A card sweeps past.
    case passage
    /// A card lifts or leaves.
    case air
    /// A card lands in its place.
    case contact
    /// Everything comes to rest.
    case settle

    /// Relative level, before intensity (from Drift 1's mix).
    var weight: Float {
        switch self {
        case .passage: return 0.64
        case .air: return 0.22
        case .contact: return 0.36
        case .settle: return 0.42
        }
    }
}

/// One sound at a time in the loop.
public struct SoundEvent: Sendable, Hashable {
    /// Seconds into the loop.
    public var time: Double
    public var cue: SoundCue
    /// 0…1.
    public var intensity: Float
    /// −1 (left) … 1 (right).
    public var pan: Float

    public init(time: Double, cue: SoundCue, intensity: Float = 0.6, pan: Float = 0) {
        self.time = time
        self.cue = cue
        self.intensity = intensity
        self.pan = pan
    }
}

/// A project's sound. A project without one is silent.
public struct ReelSound: Codable, Hashable, Sendable {
    public var palette: SoundPalette
    /// 0…1.
    public var level: Float

    public init(palette: SoundPalette = .editorial, level: Float = 0.7) {
        self.palette = palette
        self.level = level
    }
}

enum SoundCatalog {
    /// Recordings for each palette and cue, after Drift 1's catalogue.
    static func recordings(_ palette: SoundPalette, _ cue: SoundCue) -> [String] {
        switch (palette, cue) {
        case (.editorial, .passage): return ["card-slide-1", "card-slide-2", "book-flip-1"]
        case (.editorial, .air): return ["cloth-2", "cloth-4", "leather-handle-1"]
        case (.editorial, .contact): return ["card-place-2", "card-place-3", "book-close"]
        case (.editorial, .settle): return ["soft-impact-1", "soft-impact-2"]
        case (.cinema, .passage): return ["card-shove-1", "card-shove-2"]
        case (.cinema, .air): return ["cloth-2", "leather-handle-2", "card-slide-1"]
        case (.cinema, .contact): return ["wood-impact-1", "metal-latch", "metal-click"]
        case (.cinema, .settle): return ["generic-impact-1", "soft-impact-2"]
        case (.paper, .passage): return ["book-flip-1", "card-slide-2", "cloth-2"]
        case (.paper, .air): return ["cloth-2", "cloth-4", "book-flip-1"]
        case (.paper, .contact): return ["book-close", "card-place-2", "book-place-3"]
        case (.paper, .settle): return ["book-place-1", "soft-impact-1"]
        }
    }
}

/// Decoded recordings, trimmed and levelled, at 48 kHz stereo.
public final class SoundLibrary: @unchecked Sendable {
    public static let shared = SoundLibrary(directory: Bundle.main.resourceURL?.appendingPathComponent("Sound"))

    struct Recording {
        var left: [Float]
        var right: [Float]
        var gain: Float
    }

    struct Treatment: Decodable {
        var name: String
        var trimStart: Double
        var trimEnd: Double
        var gainDb: Double
    }

    public let directory: URL?
    private var cache: [String: Recording] = [:]
    private var treatments: [String: Treatment]?
    private let lock = NSLock()

    public init(directory: URL?) {
        self.directory = directory
    }

    /// Whether the recordings are present (they ship inside Drift and Galileo).
    public var isAvailable: Bool {
        guard let directory else { return false }
        return FileManager.default.fileExists(atPath: directory.appendingPathComponent("treatments.json").path)
    }

    func recording(_ name: String) -> Recording? {
        lock.lock()
        defer { lock.unlock() }
        if let r = cache[name] { return r }
        guard let directory, let r = Self.decode(directory.appendingPathComponent(name + ".wav"), treatment: treatment(name)) else { return nil }
        cache[name] = r
        return r
    }

    private func treatment(_ name: String) -> Treatment? {
        if treatments == nil, let directory,
           let data = try? Data(contentsOf: directory.appendingPathComponent("treatments.json")) {
            struct Ledger: Decodable { var assets: [Treatment] }
            let ledger = try? JSONDecoder().decode(Ledger.self, from: data)
            treatments = Dictionary((ledger?.assets ?? []).map { ($0.name, $0) }, uniquingKeysWith: { a, _ in a })
        }
        return treatments?[name + ".wav"]
    }

    private static func decode(_ url: URL, treatment: Treatment?) -> Recording? {
        guard let file = try? AVAudioFile(forReading: url) else { return nil }
        let source = file.processingFormat
        guard let input = AVAudioPCMBuffer(pcmFormat: source, frameCapacity: AVAudioFrameCount(file.length)),
              (try? file.read(into: input)) != nil,
              let target = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: Double(AudioTrack.sampleRate),
                                         channels: 2, interleaved: false),
              let converter = AVAudioConverter(from: source, to: target) else { return nil }
        let capacity = AVAudioFrameCount(Double(input.frameLength) * target.sampleRate / source.sampleRate) + 64
        guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return nil }
        var fed = false
        var error: NSError?
        converter.convert(to: output, error: &error) { _, status in
            if fed { status.pointee = .endOfStream; return nil }
            fed = true
            status.pointee = .haveData
            return input
        }
        guard error == nil, let channels = output.floatChannelData else { return nil }
        let n = Int(output.frameLength)
        let rate = target.sampleRate
        let start = min(n, Int((treatment?.trimStart ?? 0) * rate))
        let end = max(start, n - Int((treatment?.trimEnd ?? 0) * rate))
        let left = Array(UnsafeBufferPointer(start: channels[0] + start, count: end - start))
        let right = Array(UnsafeBufferPointer(start: channels[output.format.channelCount > 1 ? 1 : 0] + start, count: end - start))
        let gain = Float(pow(10, (treatment?.gainDb ?? 0) / 20))
        return Recording(left: left, right: right, gain: gain)
    }
}

/// Renders a loop's events into one seamless stereo mix.
public enum SoundMixer {
    public static func render(_ events: [SoundEvent], sound: ReelSound, loop: Double, seed: UInt32,
                              library: SoundLibrary = .shared) -> AudioTrack {
        let rate = Double(AudioTrack.sampleRate)
        let frames = max(1, Int((loop * rate).rounded()))
        var left = [Float](repeating: 0, count: frames)
        var right = [Float](repeating: 0, count: frames)
        for (i, event) in events.enumerated() {
            let names = SoundCatalog.recordings(sound.palette, event.cue)
            let pick = Hash.unit(i &* 7 &+ 1, seed &+ 911)
            let name = names[min(names.count - 1, Int(pick * Float(names.count)))]
            guard let rec = library.recording(name), !rec.left.isEmpty else { continue }
            // A take never sounds twice the same: a little pitch and level variation.
            let speed = Double(1 + (Hash.unit(i &* 13 &+ 5, seed &+ 313) - 0.5) * 0.12)
            let level = event.cue.weight * (0.72 + 0.28 * min(max(event.intensity, 0), 1)) * rec.gain
            let pan = min(max(event.pan, -1), 1)
            let gl = level * min(1, 1 - pan), gr = level * min(1, 1 + pan)
            let length = Int(Double(rec.left.count - 1) / speed)
            guard length > 2 else { continue }
            let attack = max(1, min(Int(0.012 * rate), length / 5))
            let release = max(1, min(Int(0.06 * rate), length * 3 / 10))
            let start = Int((wrap(event.time, loop) * rate).rounded())
            rec.left.withUnsafeBufferPointer { l in
                rec.right.withUnsafeBufferPointer { r in
                    for j in 0..<length {
                        let x = Double(j) * speed
                        let k = Int(x)
                        let f = Float(x - Double(k))
                        let env = Float(min(1, Double(j) / Double(attack), Double(length - j) / Double(release)))
                        let o = (start + j) % frames
                        left[o] += cubic(l, k, f) * gl * env
                        right[o] += cubic(r, k, f) * gr * env
                    }
                }
            }
        }
        // A gentle compressor lifts the soft body of each sound under its sharp
        // attack, then level, then a limiter so crowded moments never clip.
        let gain = compressorGain(left, right, rate: rate)
        let master = min(max(sound.level, 0), 1) * 1.4
        var out = [Float](repeating: 0, count: frames * 2)
        for k in 0..<frames {
            out[2 * k] = limit(left[k] * gain[k] * master)
            out[2 * k + 1] = limit(right[k] * gain[k] * master)
        }
        return AudioTrack(samples: out)
    }

    /// Stereo-linked gain for 3:1 compression above −20 dBFS with 6 dB of make-up.
    /// It runs twice around the loop and keeps the second lap, so its state where
    /// the loop joins is the same on both sides and the seam stays silent.
    private static func compressorGain(_ left: [Float], _ right: [Float], rate: Double) -> [Float] {
        let n = left.count
        let attack = Float(exp(-1 / (0.003 * rate))), release = Float(exp(-1 / (0.08 * rate)))
        let threshold: Float = -20, ratio: Float = 3, makeUp: Float = 6
        let thresholdLinear = powf(10, threshold / 20), makeUpLinear = powf(10, makeUp / 20)
        var gain = [Float](repeating: makeUpLinear, count: n)
        var env: Float = 0
        for lap in 0..<2 {
            for k in 0..<n {
                let x = max(abs(left[k]), abs(right[k]))
                env = x > env ? attack * env + (1 - attack) * x : release * env + (1 - release) * x
                // Below the threshold the gain is just the make-up; most of a loop is quiet.
                guard lap == 1, env > thresholdLinear else { continue }
                let over = 20 * log10f(env) - threshold
                gain[k] = powf(10, (makeUp - over * (1 - 1 / ratio)) / 20)
            }
        }
        return gain
    }

    /// Catmull-Rom interpolation between samples k and k+1.
    private static func cubic(_ s: UnsafeBufferPointer<Float>, _ k: Int, _ f: Float) -> Float {
        let n = s.count
        let p0 = s[max(k - 1, 0)], p1 = s[min(k, n - 1)], p2 = s[min(k + 1, n - 1)], p3 = s[min(k + 2, n - 1)]
        return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)))
    }

    /// Soft knee from −6 dBFS to a −3 dBFS ceiling: headroom for AAC, whose
    /// decoded peaks overshoot sharp clicks by up to 2 dB.
    private static func limit(_ x: Float) -> Float {
        let a = abs(x)
        let knee: Float = 0.5, room: Float = 0.2
        guard a > knee else { return x }
        return (x < 0 ? -1 : 1) * (knee + room * tanhf((a - knee) / room))
    }
}
