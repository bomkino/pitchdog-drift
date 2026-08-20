from pathlib import Path


def replace_once(path_string: str, before: str, after: str) -> None:
    path = Path(path_string)
    source = path.read_text()
    count = source.count(before)
    if count != 1:
        raise RuntimeError(f"{path_string}: expected one generated fix target, found {count}.")
    path.write_text(source.replace(before, after))


replace_once(
    "src/App.tsx",
    '''      const encodedDuration = getExportFrameCount({
        width: session.output.width,
        height: session.output.height,
        fps: session.output.fps,
        duration: session.output.duration,
      }) / session.output.fps;''',
    '''      const encodedDuration = getExportFrameCount({
        fps: session.output.fps,
        duration: session.output.duration,
      }) / session.output.fps;''',
)

replace_once(
    "src/lib/exportStudio.ts",
    '''          const planes = Array.from(
            { length: trimmedSample.numberOfChannels },
            () => new Float32Array(trimmedSample.numberOfFrames),
          );
          for (let channel = 0; channel < planes.length; channel += 1) {
            trimmedSample.copyTo(planes[channel]!, { planeIndex: channel, format: "f32-planar" });
          }
          mixSoundtrackIntoPlanar(
            planes,
            trimmedSample.timestamp,
            trimmedSample.sampleRate,
            soundtrack,
            soundtrackGain,
          );
          mixedSample = new AudioSample({
            format: "f32-planar",
            data: planes,
            numberOfChannels: trimmedSample.numberOfChannels,
            sampleRate: trimmedSample.sampleRate,
            timestamp: trimmedSample.timestamp,
          });''',
    '''          const mixedData = new Float32Array(
            trimmedSample.numberOfFrames * trimmedSample.numberOfChannels,
          );
          const planes = Array.from(
            { length: trimmedSample.numberOfChannels },
            (_, channel) => mixedData.subarray(
              channel * trimmedSample.numberOfFrames,
              (channel + 1) * trimmedSample.numberOfFrames,
            ),
          );
          for (let channel = 0; channel < planes.length; channel += 1) {
            trimmedSample.copyTo(planes[channel]!, { planeIndex: channel, format: "f32-planar" });
          }
          mixSoundtrackIntoPlanar(
            planes,
            trimmedSample.timestamp,
            trimmedSample.sampleRate,
            soundtrack,
            soundtrackGain,
          );
          mixedSample = new AudioSample({
            format: "f32-planar",
            data: mixedData,
            numberOfChannels: trimmedSample.numberOfChannels,
            sampleRate: trimmedSample.sampleRate,
            timestamp: trimmedSample.timestamp,
          });''',
)

replace_once(
    "src/lib/exportStudio.ts",
    '''  const sample = AudioSample.fromAudioBuffer(soundtrack, 0);
  try {
    await source.add(sample);
    report(onProgress, "audio", duration, duration, 0.95);
    return duration;
  } catch (error) {
    if (signal?.aborted) throw cancelledError(signal);
    throw wrapError(error, "ENCODE_FAILED", "Tactile sound track could not be encoded without loss.");
  } finally {
    sample.close();
  }''',
    '''  const samples = AudioSample.fromAudioBuffer(soundtrack, 0);
  try {
    for (const sample of samples) {
      throwIfAborted(signal);
      await source.add(sample);
    }
    report(onProgress, "audio", duration, duration, 0.95);
    return duration;
  } catch (error) {
    if (signal?.aborted) throw cancelledError(signal);
    throw wrapError(error, "ENCODE_FAILED", "Tactile sound track could not be encoded without loss.");
  } finally {
    for (const sample of samples) sample.close();
  }''',
)
