import AudioToolbox
import Foundation

private let nativeAacSampleRate = 48_000
private let nativeAacChannelCount = 2
private let nativeAacBitRate = 192_000
private let nativeAacFramesPerPacket = 1_024
private let nativeAacMaximumFrames = 35 * nativeAacSampleRate
private let nativeAacMaximumAppendBytes = 2 * 1024 * 1024
private let nativeAacPacketsPerFill: UInt32 = 32
private let nativeAacAppleManufacturer: UInt32 = 0x6170_706C // 'appl'

private struct NativeAacPacket {
    let data: Data
    let variableFrames: UInt32
}

private struct NativeAacEncoding {
    let packets: [NativeAacPacket]
    let magicCookie: Data
    let inputFrames: Int
    let leadingFrames: Int
    let trailingFrames: Int
    let actualBitRate: UInt32
    let actualQuality: UInt32
    let actualBitRateMode: UInt32
    let maximumPacketSize: UInt32

    var representedFrames: Int {
        packets.count * nativeAacFramesPerPacket
    }

    var totalPacketBytes: Int {
        packets.reduce(0) { $0 + $1.data.count }
    }

    var audioSpecificConfig: Data {
        // AAC-LC, 48 kHz (frequency index 3), stereo.
        Data([0x11, 0x90])
    }

    func jsonValue() -> JSONDictionary {
        [
            "schemaVersion": 1,
            "codec": "aac",
            "codecString": "mp4a.40.2",
            "encoded": !packets.isEmpty,
            "sampleRate": nativeAacSampleRate,
            "numberOfChannels": nativeAacChannelCount,
            "bitRate": Int(actualBitRate),
            "bitRateMode": Int(actualBitRateMode),
            "codecQuality": Int(actualQuality),
            "packetFrames": nativeAacFramesPerPacket,
            "packetCount": packets.count,
            "totalPacketBytes": totalPacketBytes,
            "maximumPacketSize": Int(maximumPacketSize),
            "inputFrames": inputFrames,
            "leadingFrames": leadingFrames,
            "trailingFrames": trailingFrames,
            "representedFrames": representedFrames,
            "frameEquationHolds": representedFrames == leadingFrames + inputFrames + trailingFrames,
            "audioSpecificConfigBase64": audioSpecificConfig.base64EncodedString(),
            "magicCookieBase64": magicCookie.base64EncodedString(),
            "magicCookieBytes": magicCookie.count,
            "packets": packets.map { packet in
                [
                    "dataBase64": packet.data.base64EncodedString(),
                    "byteCount": packet.data.count,
                    "frameCount": nativeAacFramesPerPacket,
                    "variableFrames": Int(packet.variableFrames),
                ] as JSONDictionary
            },
        ]
    }
}

private final class NativeAacSession {
    let token: String
    let firstTimestamp: Double
    private(set) var pcm = Data()
    private(set) var frameCount = 0
    private(set) var finished: NativeAacEncoding?

    init(token: String, firstTimestamp: Double) {
        self.token = token
        self.firstTimestamp = firstTimestamp
        pcm.reserveCapacity(min(nativeAacMaximumFrames * nativeAacChannelCount * MemoryLayout<Float>.size, 2 * 1024 * 1024))
    }

    func append(bytes: Data, frames: Int) throws {
        guard finished == nil else {
            throw BridgeFailure("InvalidStateError", "This native AAC session has already been finalized.")
        }
        guard frames > 0 else {
            throw BridgeFailure("TypeError", "AAC append frameCount must be positive.")
        }
        let expectedBytes = frames * nativeAacChannelCount * MemoryLayout<Float>.size
        guard bytes.count == expectedBytes else {
            throw BridgeFailure(
                "DataError",
                "AAC append bytes do not match interleaved 32-bit float stereo frameCount."
            )
        }
        guard bytes.count <= nativeAacMaximumAppendBytes else {
            throw BridgeFailure(
                "QuotaExceededError",
                "One native AAC append exceeds the 2 MiB bridge limit."
            )
        }
        guard frameCount <= nativeAacMaximumFrames - frames else {
            throw BridgeFailure(
                "QuotaExceededError",
                "Presenter audio exceeds Drift’s 35-second native AAC safety limit."
            )
        }

        // Reject NaN and infinity before feeding a system codec. Copy into an
        // aligned Float array rather than assuming Data's byte storage alignment.
        var samples = [Float](
            repeating: 0,
            count: bytes.count / MemoryLayout<Float>.size
        )
        _ = samples.withUnsafeMutableBytes { destination in
            bytes.copyBytes(to: destination)
        }
        guard samples.allSatisfy(\.isFinite) else {
            throw BridgeFailure("DataError", "Presenter PCM contains a non-finite sample.")
        }

        pcm.append(bytes)
        frameCount += frames
    }

    func finish() throws -> NativeAacEncoding {
        if let finished { return finished }
        guard frameCount > 0, !pcm.isEmpty else {
            throw BridgeFailure("DataError", "Presenter audio produced no PCM frames.")
        }
        let encoding = try NativeAacAudioToolbox.encode(interleavedFloat32: pcm, frameCount: frameCount)
        finished = encoding
        return encoding
    }
}

final class NativeAacEncoderBroker {
    private var sessions: [String: NativeAacSession] = [:]

    func create(_ payload: JSONDictionary) throws -> JSONDictionary {
        let sampleRate = try exactInteger(payload, key: "sampleRate")
        let channelCount = try exactInteger(payload, key: "numberOfChannels")
        let bitRate = try exactInteger(payload, key: "bitRate")
        let firstTimestamp = try finiteNumber(payload, key: "firstTimestamp", minimum: 0, maximum: 86_400)

        guard sampleRate == nativeAacSampleRate,
              channelCount == nativeAacChannelCount,
              bitRate == nativeAacBitRate else {
            throw BridgeFailure(
                "NotSupportedError",
                "Native AAC requires 48 kHz stereo at 192 kbit/s."
            )
        }
        guard sessions.count < 4 else {
            throw BridgeFailure("QuotaExceededError", "Too many native AAC sessions are open.")
        }

        let token = UUID().uuidString.lowercased()
        sessions[token] = NativeAacSession(token: token, firstTimestamp: firstTimestamp)
        return [
            "token": token,
            "codec": "aac",
            "codecString": "mp4a.40.2",
            "sampleRate": nativeAacSampleRate,
            "numberOfChannels": nativeAacChannelCount,
            "bitRate": nativeAacBitRate,
            "packetFrames": nativeAacFramesPerPacket,
            "maximumFrames": nativeAacMaximumFrames,
            "maximumAppendBytes": nativeAacMaximumAppendBytes,
        ]
    }

    func append(_ payload: JSONDictionary) throws -> JSONDictionary {
        let token = try requiredString(payload, "token")
        guard let session = sessions[token] else {
            throw BridgeFailure("InvalidStateError", "Native AAC session is missing or closed.")
        }
        let frames = try exactInteger(payload, key: "frameCount")
        guard let encoded = payload["dataBase64"] as? String,
              encoded.utf8.count <= 3 * nativeAacMaximumAppendBytes,
              let bytes = Data(base64Encoded: encoded, options: []) else {
            throw BridgeFailure("DataError", "Native AAC append contains invalid base64 PCM.")
        }

        try session.append(bytes: bytes, frames: frames)
        return [
            "acceptedFrames": frames,
            "totalFrames": session.frameCount,
            "totalBytes": session.pcm.count,
        ]
    }

    func finish(_ payload: JSONDictionary) throws -> JSONDictionary {
        let token = try requiredString(payload, "token")
        guard let session = sessions[token] else {
            throw BridgeFailure("InvalidStateError", "Native AAC session is missing or closed.")
        }
        let encoding = try session.finish()
        var value = encoding.jsonValue()
        value["firstTimestamp"] = session.firstTimestamp
        return value
    }

    func close(_ payload: JSONDictionary) throws -> JSONDictionary {
        let token = try requiredString(payload, "token")
        let removed = sessions.removeValue(forKey: token) != nil
        return ["closed": true, "existed": removed]
    }

    func closeAll() {
        sessions.removeAll(keepingCapacity: false)
    }

    static func probeReceipt(durationSeconds: Double = 0.125) throws -> JSONDictionary {
        let frames = max(nativeAacFramesPerPacket, Int((durationSeconds * Double(nativeAacSampleRate)).rounded()))
        var samples = [Float](repeating: 0, count: frames * nativeAacChannelCount)
        for frame in 0..<frames {
            let time = Double(frame) / Double(nativeAacSampleRate)
            let value = Float(sin(2 * Double.pi * 440 * time) * 0.12)
            samples[frame * 2] = value
            samples[frame * 2 + 1] = value * 0.91
        }
        let bytes = samples.withUnsafeBytes { Data($0) }
        let encoding = try NativeAacAudioToolbox.encode(interleavedFloat32: bytes, frameCount: frames)
        var receipt = encoding.jsonValue()
        receipt["probeDurationSeconds"] = durationSeconds
        receipt["provider"] = "AudioToolbox"
        receipt["appleSoftwareEncoder"] = true
        return receipt
    }

    static func runSelfTest() throws {
        let receipt = try probeReceipt()
        guard receipt["encoded"] as? Bool == true,
              receipt["frameEquationHolds"] as? Bool == true,
              (receipt["packetCount"] as? Int ?? 0) > 0,
              (receipt["magicCookieBytes"] as? Int ?? 0) > 0,
              receipt["audioSpecificConfigBase64"] as? String == Data([0x11, 0x90]).base64EncodedString() else {
            throw BridgeFailure("EncodingError", "Native AAC self-test receipt failed its invariants.")
        }
    }

    private func exactInteger(_ payload: JSONDictionary, key: String) throws -> Int {
        guard let number = payload[key] as? NSNumber else {
            throw BridgeFailure("TypeError", "Native AAC field ‘\(key)’ must be a number.")
        }
        let value = number.doubleValue
        guard value.isFinite,
              value.rounded(.towardZero) == value,
              value >= 0,
              value <= Double(Int.max) else {
            throw BridgeFailure("TypeError", "Native AAC field ‘\(key)’ must be a non-negative integer.")
        }
        return Int(value)
    }

    private func finiteNumber(
        _ payload: JSONDictionary,
        key: String,
        minimum: Double,
        maximum: Double
    ) throws -> Double {
        guard let number = payload[key] as? NSNumber else {
            throw BridgeFailure("TypeError", "Native AAC field ‘\(key)’ must be a number.")
        }
        let value = number.doubleValue
        guard value.isFinite, value >= minimum, value <= maximum else {
            throw BridgeFailure("TypeError", "Native AAC field ‘\(key)’ is outside its safe range.")
        }
        return value
    }
}

private enum NativeAacAudioToolbox {
    static func encode(interleavedFloat32 pcm: Data, frameCount: Int) throws -> NativeAacEncoding {
        guard frameCount > 0,
              pcm.count == frameCount * nativeAacChannelCount * MemoryLayout<Float>.size else {
            throw BridgeFailure("DataError", "Native AAC PCM buffer and frame count disagree.")
        }

        var input = inputDescription()
        var output = try outputDescription()
        var converter: AudioConverterRef?
        var encoder = try appleSoftwareEncoder()
        let creationStatus = AudioConverterNewSpecific(&input, &output, 1, &encoder, &converter)
        try requireNoErr(creationStatus, operation: "AudioConverterNewSpecific")
        guard let converter else {
            throw BridgeFailure("EncodingError", "AudioToolbox returned no AAC converter.")
        }
        defer { AudioConverterDispose(converter) }

        try configure(converter)
        let actualOutput = try streamDescription(
            converter,
            property: kAudioConverterCurrentOutputStreamDescription,
            label: "current output stream description"
        )
        guard Int(actualOutput.mSampleRate.rounded()) == nativeAacSampleRate,
              actualOutput.mFormatID == kAudioFormatMPEG4AAC,
              Int(actualOutput.mChannelsPerFrame) == nativeAacChannelCount,
              Int(actualOutput.mFramesPerPacket) == nativeAacFramesPerPacket else {
            throw BridgeFailure("EncodingError", "AudioToolbox changed the requested AAC-LC stream format.")
        }

        let bitRate = try uint32Property(
            converter,
            property: kAudioConverterEncodeBitRate,
            label: "AAC bit rate"
        )
        let quality = try uint32Property(
            converter,
            property: kAudioConverterCodecQuality,
            label: "AAC codec quality"
        )
        let bitRateMode = try uint32Property(
            converter,
            property: kAudioCodecPropertyBitRateControlMode,
            label: "AAC bit-rate mode"
        )
        guard bitRate == UInt32(nativeAacBitRate),
              quality == UInt32(kAudioConverterQuality_High),
              bitRateMode == UInt32(kAudioCodecBitRateControlMode_LongTermAverage) else {
            throw BridgeFailure("EncodingError", "AudioToolbox did not retain Drift’s AAC quality contract.")
        }

        let maximumPacketSize = try uint32Property(
            converter,
            property: kAudioConverterPropertyMaximumOutputPacketSize,
            label: "maximum AAC packet size"
        )
        guard maximumPacketSize > 0 else {
            throw BridgeFailure("EncodingError", "AudioToolbox reported a zero AAC packet size.")
        }

        let packets = try drain(
            converter,
            pcm: pcm,
            frameCount: frameCount,
            maximumPacketSize: maximumPacketSize
        )
        guard !packets.isEmpty else {
            throw BridgeFailure("EncodingError", "AudioToolbox produced no AAC access units.")
        }

        let prime = try primeInfo(converter)
        let paddedZeros = try uint32Property(
            converter,
            property: kAudioCodecPropertyPaddedZeros,
            label: "AAC padded zeros"
        )
        guard prime.trailingFrames == paddedZeros,
              prime.trailingFrames < UInt32(nativeAacFramesPerPacket) else {
            throw BridgeFailure("EncodingError", "AudioToolbox AAC padding metadata is inconsistent.")
        }

        let represented = packets.count * nativeAacFramesPerPacket
        let expected = Int(prime.leadingFrames) + frameCount + Int(prime.trailingFrames)
        guard represented == expected else {
            throw BridgeFailure(
                "EncodingError",
                "AAC frame accounting failed: \(represented) encoded versus \(expected) priming + input + padding frames."
            )
        }

        let cookie = try compressionMagicCookie(converter)
        guard !cookie.isEmpty else {
            throw BridgeFailure("EncodingError", "AudioToolbox returned an empty AAC magic cookie.")
        }

        return NativeAacEncoding(
            packets: packets,
            magicCookie: cookie,
            inputFrames: frameCount,
            leadingFrames: Int(prime.leadingFrames),
            trailingFrames: Int(prime.trailingFrames),
            actualBitRate: bitRate,
            actualQuality: quality,
            actualBitRateMode: bitRateMode,
            maximumPacketSize: maximumPacketSize
        )
    }

    private static func inputDescription() -> AudioStreamBasicDescription {
        AudioStreamBasicDescription(
            mSampleRate: Double(nativeAacSampleRate),
            mFormatID: kAudioFormatLinearPCM,
            mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked | kAudioFormatFlagsNativeEndian,
            mBytesPerPacket: UInt32(nativeAacChannelCount * MemoryLayout<Float>.size),
            mFramesPerPacket: 1,
            mBytesPerFrame: UInt32(nativeAacChannelCount * MemoryLayout<Float>.size),
            mChannelsPerFrame: UInt32(nativeAacChannelCount),
            mBitsPerChannel: UInt32(MemoryLayout<Float>.size * 8),
            mReserved: 0
        )
    }

    private static func outputDescription() throws -> AudioStreamBasicDescription {
        var description = AudioStreamBasicDescription(
            mSampleRate: Double(nativeAacSampleRate),
            mFormatID: kAudioFormatMPEG4AAC,
            mFormatFlags: 0,
            mBytesPerPacket: 0,
            mFramesPerPacket: 0,
            mBytesPerFrame: 0,
            mChannelsPerFrame: UInt32(nativeAacChannelCount),
            mBitsPerChannel: 0,
            mReserved: 0
        )
        var byteCount = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        let status = AudioFormatGetProperty(
            kAudioFormatProperty_FormatInfo,
            0,
            nil,
            &byteCount,
            &description
        )
        try requireNoErr(status, operation: "AudioFormatGetProperty(kAudioFormatProperty_FormatInfo)")
        return description
    }

    private static func appleSoftwareEncoder() throws -> AudioClassDescription {
        var formatID = kAudioFormatMPEG4AAC
        var byteCount: UInt32 = 0
        let infoStatus = AudioFormatGetPropertyInfo(
            kAudioFormatProperty_Encoders,
            UInt32(MemoryLayout.size(ofValue: formatID)),
            &formatID,
            &byteCount
        )
        try requireNoErr(infoStatus, operation: "AudioFormatGetPropertyInfo(kAudioFormatProperty_Encoders)")

        let stride = MemoryLayout<AudioClassDescription>.stride
        guard byteCount > 0, Int(byteCount).isMultiple(of: stride) else {
            throw BridgeFailure("EncodingError", "AudioToolbox returned a malformed AAC encoder inventory.")
        }

        var descriptions = Array(
            repeating: AudioClassDescription(mType: 0, mSubType: 0, mManufacturer: 0),
            count: Int(byteCount) / stride
        )
        let getStatus = descriptions.withUnsafeMutableBytes { bytes in
            AudioFormatGetProperty(
                kAudioFormatProperty_Encoders,
                UInt32(MemoryLayout.size(ofValue: formatID)),
                &formatID,
                &byteCount,
                bytes.baseAddress!
            )
        }
        try requireNoErr(getStatus, operation: "AudioFormatGetProperty(kAudioFormatProperty_Encoders)")

        guard let encoder = descriptions.first(where: {
            $0.mType == kAudioEncoderComponentType
                && $0.mSubType == kAudioFormatMPEG4AAC
                && $0.mManufacturer == nativeAacAppleManufacturer
        }) else {
            throw BridgeFailure("NotSupportedError", "Apple’s software AAC-LC encoder is unavailable on this Mac.")
        }
        return encoder
    }

    private static func configure(_ converter: AudioConverterRef) throws {
        var mode = UInt32(kAudioCodecBitRateControlMode_LongTermAverage)
        try requireNoErr(
            AudioConverterSetProperty(
                converter,
                kAudioCodecPropertyBitRateControlMode,
                UInt32(MemoryLayout.size(ofValue: mode)),
                &mode
            ),
            operation: "set AAC long-term-average bit-rate mode"
        )

        var bitRate = UInt32(nativeAacBitRate)
        try requireNoErr(
            AudioConverterSetProperty(
                converter,
                kAudioConverterEncodeBitRate,
                UInt32(MemoryLayout.size(ofValue: bitRate)),
                &bitRate
            ),
            operation: "set AAC 192 kbit/s bit rate"
        )

        var quality = UInt32(kAudioConverterQuality_High)
        try requireNoErr(
            AudioConverterSetProperty(
                converter,
                kAudioConverterCodecQuality,
                UInt32(MemoryLayout.size(ofValue: quality)),
                &quality
            ),
            operation: "set AAC high codec quality"
        )
    }

    private static func drain(
        _ converter: AudioConverterRef,
        pcm: Data,
        frameCount: Int,
        maximumPacketSize: UInt32
    ) throws -> [NativeAacPacket] {
        let capacity = Int(maximumPacketSize) * Int(nativeAacPacketsPerFill)
        guard capacity > 0, capacity <= Int(UInt32.max) else {
            throw BridgeFailure("EncodingError", "AAC output buffer capacity overflowed.")
        }

        var outputStorage = [UInt8](repeating: 0, count: capacity)
        var packetDescriptions = Array(
            repeating: AudioStreamPacketDescription(
                mStartOffset: 0,
                mVariableFramesInPacket: 0,
                mDataByteSize: 0
            ),
            count: Int(nativeAacPacketsPerFill)
        )
        var packets: [NativeAacPacket] = []

        return try pcm.withUnsafeBytes { inputBuffer in
            guard let baseAddress = inputBuffer.baseAddress else {
                throw BridgeFailure("DataError", "Presenter PCM buffer is empty.")
            }
            var state = NativeAacInputState(
                baseAddress: baseAddress,
                byteCount: inputBuffer.count,
                totalFrames: frameCount,
                nextFrame: 0
            )

            return try withUnsafeMutablePointer(to: &state) { statePointer in
                var fillCount = 0
                while true {
                    fillCount += 1
                    guard fillCount <= frameCount / nativeAacFramesPerPacket + 64 else {
                        throw BridgeFailure("EncodingError", "AudioToolbox AAC drain did not terminate.")
                    }

                    var requestedPackets = nativeAacPacketsPerFill
                    var outputList = AudioBufferList(
                        mNumberBuffers: 1,
                        mBuffers: AudioBuffer(
                            mNumberChannels: UInt32(nativeAacChannelCount),
                            mDataByteSize: UInt32(outputStorage.count),
                            mData: nil
                        )
                    )

                    let status = outputStorage.withUnsafeMutableBytes { outputBuffer in
                        outputList.mBuffers.mData = outputBuffer.baseAddress
                        return packetDescriptions.withUnsafeMutableBufferPointer { descriptions in
                            AudioConverterFillComplexBuffer(
                                converter,
                                nativeAacInputDataProc,
                                UnsafeMutableRawPointer(statePointer),
                                &requestedPackets,
                                &outputList,
                                descriptions.baseAddress
                            )
                        }
                    }
                    try requireNoErr(status, operation: "AudioConverterFillComplexBuffer")

                    guard requestedPackets <= nativeAacPacketsPerFill else {
                        throw BridgeFailure("EncodingError", "AudioToolbox exceeded the requested AAC packet capacity.")
                    }
                    if requestedPackets == 0 {
                        guard statePointer.pointee.nextFrame == frameCount else {
                            throw BridgeFailure("EncodingError", "AudioToolbox stopped before consuming all presenter PCM.")
                        }
                        return packets
                    }

                    let producedBytes = Int(outputList.mBuffers.mDataByteSize)
                    guard producedBytes >= 0, producedBytes <= outputStorage.count else {
                        throw BridgeFailure("EncodingError", "AudioToolbox exceeded the AAC output byte capacity.")
                    }

                    var expectedOffset = 0
                    for packetIndex in 0..<Int(requestedPackets) {
                        let description = packetDescriptions[packetIndex]
                        guard description.mStartOffset >= 0,
                              let startOffset = Int(exactly: description.mStartOffset) else {
                            throw BridgeFailure("EncodingError", "AAC packet has an invalid byte offset.")
                        }
                        let byteSize = Int(description.mDataByteSize)
                        guard startOffset == expectedOffset,
                              byteSize > 0,
                              byteSize <= Int(maximumPacketSize),
                              startOffset <= producedBytes - byteSize else {
                            throw BridgeFailure("EncodingError", "AAC packet descriptions do not exactly cover output bytes.")
                        }
                        guard description.mVariableFramesInPacket == 0
                                || description.mVariableFramesInPacket == UInt32(nativeAacFramesPerPacket) else {
                            throw BridgeFailure("EncodingError", "AAC packet does not represent 1,024 frames.")
                        }

                        packets.append(
                            NativeAacPacket(
                                data: Data(outputStorage[startOffset..<(startOffset + byteSize)]),
                                variableFrames: description.mVariableFramesInPacket
                            )
                        )
                        expectedOffset += byteSize
                    }
                    guard expectedOffset == producedBytes else {
                        throw BridgeFailure("EncodingError", "AAC packet descriptions left unaccounted output bytes.")
                    }
                }
            }
        }
    }

    private static func streamDescription(
        _ converter: AudioConverterRef,
        property: AudioConverterPropertyID,
        label: String
    ) throws -> AudioStreamBasicDescription {
        var value = AudioStreamBasicDescription()
        var byteCount = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        let status = AudioConverterGetProperty(converter, property, &byteCount, &value)
        try requireNoErr(status, operation: "get \(label)")
        guard byteCount == UInt32(MemoryLayout<AudioStreamBasicDescription>.size) else {
            throw BridgeFailure("EncodingError", "AudioToolbox returned an invalid \(label) size.")
        }
        return value
    }

    private static func primeInfo(_ converter: AudioConverterRef) throws -> AudioConverterPrimeInfo {
        var value = AudioConverterPrimeInfo(leadingFrames: 0, trailingFrames: 0)
        var byteCount = UInt32(MemoryLayout<AudioConverterPrimeInfo>.size)
        let status = AudioConverterGetProperty(
            converter,
            kAudioConverterPrimeInfo,
            &byteCount,
            &value
        )
        try requireNoErr(status, operation: "get AAC prime info")
        guard byteCount == UInt32(MemoryLayout<AudioConverterPrimeInfo>.size) else {
            throw BridgeFailure("EncodingError", "AudioToolbox returned an invalid AAC prime-info size.")
        }
        return value
    }

    private static func uint32Property(
        _ converter: AudioConverterRef,
        property: AudioConverterPropertyID,
        label: String
    ) throws -> UInt32 {
        var value: UInt32 = 0
        var byteCount = UInt32(MemoryLayout<UInt32>.size)
        let status = AudioConverterGetProperty(converter, property, &byteCount, &value)
        try requireNoErr(status, operation: "get \(label)")
        guard byteCount == UInt32(MemoryLayout<UInt32>.size) else {
            throw BridgeFailure("EncodingError", "AudioToolbox returned an invalid \(label) size.")
        }
        return value
    }

    private static func compressionMagicCookie(_ converter: AudioConverterRef) throws -> Data {
        var byteCount: UInt32 = 0
        var writable = DarwinBoolean(false)
        let infoStatus = AudioConverterGetPropertyInfo(
            converter,
            kAudioConverterCompressionMagicCookie,
            &byteCount,
            &writable
        )
        try requireNoErr(infoStatus, operation: "get AAC magic-cookie size")
        guard byteCount > 0, byteCount <= 64 * 1024 else {
            throw BridgeFailure("EncodingError", "AudioToolbox returned an invalid AAC magic-cookie size.")
        }

        var data = Data(count: Int(byteCount))
        let status = data.withUnsafeMutableBytes { bytes in
            AudioConverterGetProperty(
                converter,
                kAudioConverterCompressionMagicCookie,
                &byteCount,
                bytes.baseAddress!
            )
        }
        try requireNoErr(status, operation: "get AAC magic cookie")
        guard byteCount > 0, Int(byteCount) <= data.count else {
            throw BridgeFailure("EncodingError", "AudioToolbox returned an unreadable AAC magic cookie.")
        }
        if Int(byteCount) < data.count {
            data.removeSubrange(Int(byteCount)..<data.count)
        }
        return data
    }

    private static func requireNoErr(_ status: OSStatus, operation: String) throws {
        guard status == noErr else {
            throw BridgeFailure(
                "EncodingError",
                "\(operation) failed with AudioToolbox status \(status) (\(fourCC(status)))."
            )
        }
    }

    private static func fourCC(_ status: OSStatus) -> String {
        let value = UInt32(bitPattern: status)
        let bytes = [
            UInt8((value >> 24) & 0xff),
            UInt8((value >> 16) & 0xff),
            UInt8((value >> 8) & 0xff),
            UInt8(value & 0xff),
        ]
        guard bytes.allSatisfy({ $0 >= 32 && $0 <= 126 }) else {
            return "non-printable"
        }
        return String(bytes: bytes, encoding: .ascii) ?? "non-printable"
    }
}

private struct NativeAacInputState {
    let baseAddress: UnsafeRawPointer
    let byteCount: Int
    let totalFrames: Int
    var nextFrame: Int
}

private let nativeAacInputDataProc: AudioConverterComplexInputDataProc = {
    _, ioNumberDataPackets, ioData, outPacketDescriptions, userData in

    guard let userData else {
        ioNumberDataPackets.pointee = 0
        return OSStatus(kAudio_ParamError)
    }

    let state = userData.assumingMemoryBound(to: NativeAacInputState.self)
    let requestedFrames = Int(ioNumberDataPackets.pointee)
    let remainingFrames = state.pointee.totalFrames - state.pointee.nextFrame
    guard requestedFrames >= 0, remainingFrames >= 0 else {
        ioNumberDataPackets.pointee = 0
        return OSStatus(kAudio_ParamError)
    }

    let bytesPerFrame = nativeAacChannelCount * MemoryLayout<Float>.size
    let frames = min(requestedFrames, remainingFrames, Int(UInt32.max) / bytesPerFrame)
    let byteOffset = state.pointee.nextFrame * bytesPerFrame
    let byteCount = frames * bytesPerFrame
    guard byteOffset >= 0,
          byteCount >= 0,
          byteOffset <= state.pointee.byteCount - byteCount else {
        ioNumberDataPackets.pointee = 0
        return OSStatus(kAudio_ParamError)
    }

    ioData.pointee.mNumberBuffers = 1
    ioData.pointee.mBuffers.mNumberChannels = UInt32(nativeAacChannelCount)
    ioData.pointee.mBuffers.mDataByteSize = UInt32(byteCount)
    ioData.pointee.mBuffers.mData = frames == 0
        ? nil
        : UnsafeMutableRawPointer(mutating: state.pointee.baseAddress.advanced(by: byteOffset))
    outPacketDescriptions?.pointee = nil
    ioNumberDataPackets.pointee = UInt32(frames)
    state.pointee.nextFrame += frames
    return noErr
}
