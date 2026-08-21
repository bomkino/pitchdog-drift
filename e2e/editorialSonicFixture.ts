import {
  ALL_FORMATS,
  AudioSampleSink,
  BlobSource,
  Input,
} from "mediabunny";

function rms(squareSum: number, frameCount: number): number {
  if (frameCount <= 0) return 0;
  return Math.sqrt(squareSum / frameCount);
}

function frameAt(
  time: number,
  sampleStart: number,
  sampleRate: number,
  mode: "floor" | "ceil",
): number {
  const raw = (time - sampleStart) * sampleRate;
  return mode === "floor"
    ? Math.floor(raw + 1e-7)
    : Math.ceil(raw - 1e-7);
}

/**
 * Decodes a precise window from the finished MP4/AAC track. Statistics are
 * calculated from decoded samples rather than the pre-encode AudioBuffer, so
 * the browser test can detect missing layers, mono collapse, clipping, packet
 * gaps, and silent export regressions inside the actual delivered container.
 */
export async function inspectAudioWindow(
  blob: Blob,
  start: number,
  duration: number,
): Promise<{
  trackCount: number;
  channels: number;
  sampleRate: number;
  trackDuration: number;
  frameCount: number;
  finite: boolean;
  peak: number;
  leftRms: number;
  rightRms: number;
  combinedRms: number;
  midRms: number;
  sideRms: number;
}> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(blob),
  });

  try {
    const tracks = await input.getAudioTracks();
    const track = await input.getPrimaryAudioTrack();
    if (!track) {
      return {
        trackCount: tracks.length,
        channels: 0,
        sampleRate: 0,
        trackDuration: 0,
        frameCount: 0,
        finite: true,
        peak: 0,
        leftRms: 0,
        rightRms: 0,
        combinedRms: 0,
        midRms: 0,
        sideRms: 0,
      };
    }

    const [channels, sampleRate, trackDuration] = await Promise.all([
      track.getNumberOfChannels(),
      track.getSampleRate(),
      track.computeDuration(),
    ]);
    const windowStart = Math.max(0, start);
    const windowEnd = Math.min(
      trackDuration,
      windowStart + Math.max(0, duration),
    );

    let frameCount = 0;
    let finite = true;
    let peak = 0;
    let leftSquare = 0;
    let rightSquare = 0;
    let midSquare = 0;
    let sideSquare = 0;
    const sink = new AudioSampleSink(track);

    for await (const sample of sink.samples(windowStart, windowEnd)) {
      try {
        const sampleStart = sample.timestamp;
        const sampleEnd = sample.timestamp + sample.duration;
        const overlapStart = Math.max(windowStart, sampleStart);
        const overlapEnd = Math.min(windowEnd, sampleEnd);
        if (overlapEnd <= overlapStart) continue;

        const startFrame = Math.max(
          0,
          Math.min(
            sample.numberOfFrames,
            frameAt(overlapStart, sampleStart, sample.sampleRate, "floor"),
          ),
        );
        const endFrame = Math.max(
          startFrame,
          Math.min(
            sample.numberOfFrames,
            frameAt(overlapEnd, sampleStart, sample.sampleRate, "ceil"),
          ),
        );
        if (endFrame <= startFrame) continue;

        const planes = Array.from(
          { length: sample.numberOfChannels },
          (_, channel) => {
            const values = new Float32Array(sample.numberOfFrames);
            sample.copyTo(values, {
              planeIndex: channel,
              format: "f32-planar",
            });
            return values;
          },
        );
        const left = planes[0] ?? new Float32Array(sample.numberOfFrames);
        const right = planes[1] ?? left;

        for (let frame = startFrame; frame < endFrame; frame += 1) {
          const leftValue = left[frame] ?? 0;
          const rightValue = right[frame] ?? leftValue;
          if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
            finite = false;
            continue;
          }
          const mid = (leftValue + rightValue) * 0.5;
          const side = (leftValue - rightValue) * 0.5;
          peak = Math.max(peak, Math.abs(leftValue), Math.abs(rightValue));
          leftSquare += leftValue * leftValue;
          rightSquare += rightValue * rightValue;
          midSquare += mid * mid;
          sideSquare += side * side;
          frameCount += 1;
        }
      } finally {
        sample.close();
      }
    }

    return {
      trackCount: tracks.length,
      channels,
      sampleRate,
      trackDuration,
      frameCount,
      finite,
      peak,
      leftRms: rms(leftSquare, frameCount),
      rightRms: rms(rightSquare, frameCount),
      combinedRms: rms((leftSquare + rightSquare) * 0.5, frameCount),
      midRms: rms(midSquare, frameCount),
      sideRms: rms(sideSquare, frameCount),
    };
  } finally {
    input.dispose();
  }
}
