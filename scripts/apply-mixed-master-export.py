#!/usr/bin/env python3
"""One-shot source patch for exact-duration presenter + foley export."""

from pathlib import Path

PATH = Path("src/lib/exportStudio.ts")
source = PATH.read_text(encoding="utf-8")

old_import = 'import { mixSoundtrackIntoPlanar } from "../sonic/mix";'
new_import = 'import { renderMixedPresenterMaster } from "../sonic/renderMixedMaster";'
if source.count(old_import) != 1:
    raise RuntimeError("Expected exactly one legacy soundtrack mixer import.")
source = source.replace(old_import, new_import)

start_marker = "async function encodePresenterAudio("
end_marker = "\nasync function encodeSoundtrackAudio("
start = source.find(start_marker)
end = source.find(end_marker, start)
if start < 0 or end < 0 or source.find(start_marker, start + 1) >= 0:
    raise RuntimeError("Could not isolate the presenter audio encoder exactly once.")

replacement = r'''async function encodePresenterAudio(
  presenter: PreparedPresenter,
  source: AudioSampleSource,
  duration: number,
  soundtrack: AudioBuffer | null,
  soundtrackGain: number,
  signal?: AbortSignal,
  onProgress?: ExportProgressHandler,
): Promise<number> {
  const track = presenter.audioTrack;
  if (!track) return 0;

  if (soundtrack) {
    try {
      const master = await renderMixedPresenterMaster({
        track,
        timelineStart: presenter.timelineStart,
        duration,
        soundtrack,
        soundtrackGain,
        signal,
        onPresenterCoverage(coveredSeconds) {
          report(
            onProgress,
            "audio",
            coveredSeconds,
            duration,
            0.78 + 0.08 * Math.min(coveredSeconds / duration, 1),
          );
        },
      });
      throwIfAborted(signal);
      return await encodeSoundtrackAudio(
        master,
        source,
        duration,
        signal,
        onProgress,
      );
    } catch (error) {
      if (signal?.aborted) throw cancelledError(signal);
      throw wrapError(
        error,
        "PRESENTER_DECODE_FAILED",
        "Presenter audio and tactile sound could not be rendered as one continuous stereo master.",
      );
    }
  }

  const sink = new AudioSampleSink(track);
  const rangeStart = presenter.timelineStart;
  const rangeEnd = rangeStart + duration;
  let encodedSamples = 0;
  let lastEnd = 0;

  try {
    for await (const decoded of sink.samples(rangeStart, rangeEnd)) {
      throwIfAborted(signal);
      let trimmedSample: AudioSample = decoded;
      try {
        const trim = getAudioTrimWindow(
          decoded.timestamp,
          decoded.numberOfFrames,
          decoded.sampleRate,
          rangeStart,
          rangeEnd,
        );
        if (!trim) continue;
        if (trim.startFrame !== 0 || trim.endFrame !== decoded.numberOfFrames) {
          trimmedSample = decoded.trim(trim.startFrame, trim.endFrame);
        }
        trimmedSample.setTimestamp(trim.outputTimestamp);

        await source.add(trimmedSample);
        encodedSamples += trimmedSample.numberOfFrames;
        lastEnd = Math.max(
          lastEnd,
          trimmedSample.timestamp + trimmedSample.duration,
        );
        report(
          onProgress,
          "audio",
          Math.min(lastEnd, duration),
          duration,
          0.78 + 0.17 * Math.min(lastEnd / duration, 1),
        );
      } finally {
        if (trimmedSample !== decoded) trimmedSample.close();
        decoded.close();
      }
    }
  } catch (error) {
    if (signal?.aborted) throw cancelledError(signal);
    throw wrapError(
      error,
      "PRESENTER_DECODE_FAILED",
      "Presenter audio could not be decoded and encoded without loss.",
    );
  }

  if (encodedSamples === 0) {
    throw new ExportStudioError(
      "PRESENTER_DECODE_FAILED",
      "Presenter declares an audio track, but no audio samples were available for this export.",
    );
  }

  return Math.min(lastEnd, duration);
}
'''

source = source[:start] + replacement + source[end:]
PATH.write_text(source, encoding="utf-8")
