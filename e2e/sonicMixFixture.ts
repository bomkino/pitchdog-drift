import { registerAacEncoder } from "@mediabunny/aac-encoder";
import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";

const SAMPLE_RATE = 48_000;
const FPS = 24;
const DURATION = 3;

export async function createGappedMonoPresenter(): Promise<Blob> {
  registerAacEncoder();
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create presenter fixture canvas.");

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: false }),
    target,
  });
  const videoSource = new CanvasSource(canvas, {
    codec: "avc",
    quality: new Quality({ bitrate: 500_000, bitrateMode: "variable" }),
    keyFrameInterval: 1,
    sizeChangeBehavior: "deny",
    alpha: "discard",
    latencyMode: "quality",
  });
  const audioSource = new AudioSampleSource({
    codec: "aac",
    quality: new Quality({ bitrate: 96_000, bitrateMode: "variable" }),
    transform: {
      numberOfChannels: 1,
      sampleRate: SAMPLE_RATE,
    },
  });
  output.addVideoTrack(videoSource, {
    frameRate: FPS,
    maximumPacketCount: FPS * DURATION,
    name: "gapped presenter fixture",
  });
  output.addAudioTrack(audioSource, { name: "gapped mono narration" });

  await output.start();
  for (let frame = 0; frame < FPS * DURATION; frame += 1) {
    const time = frame / FPS;
    context.fillStyle = frame % 2 === 0 ? "#241f1b" : "#2d2721";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#f0e9dd";
    context.fillRect(8 + (frame % 20), 18, 20, 20);
    await videoSource.add(time, 1 / FPS, {
      keyFrame: frame % FPS === 0,
    });
  }
  videoSource.close();

  const segmentFrames = SAMPLE_RATE / 2;
  for (const timestamp of [0, 2.5]) {
    const data = new Float32Array(segmentFrames);
    for (let frame = 0; frame < data.length; frame += 1) {
      const time = frame / SAMPLE_RATE;
      data[frame] = Math.sin(time * Math.PI * 2 * 180) * 0.055;
    }
    const sample = new AudioSample({
      format: "f32-planar",
      data,
      numberOfChannels: 1,
      sampleRate: SAMPLE_RATE,
      timestamp,
    });
    try {
      await audioSource.add(sample);
    } finally {
      sample.close();
    }
  }
  audioSource.close();

  await output.finalize();
  if (!target.buffer) throw new Error("Presenter fixture produced no MP4 bytes.");
  return new Blob([target.buffer], { type: await output.getMimeType() });
}

function rms(values: Float32Array): number {
  if (values.length === 0) return 0;
  let squareSum = 0;
  for (const value of values) squareSum += value * value;
  return Math.sqrt(squareSum / values.length);
}

export async function inspectAudioAt(blob: Blob, timestamp: number): Promise<{
  trackCount: number;
  channels: number;
  sampleRate: number;
  duration: number;
  sampleStart: number | null;
  sampleEnd: number | null;
  coversTimestamp: boolean;
  leftRms: number;
  rightRms: number;
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
        duration: 0,
        sampleStart: null,
        sampleEnd: null,
        coversTimestamp: false,
        leftRms: 0,
        rightRms: 0,
      };
    }

    const [channels, sampleRate, duration] = await Promise.all([
      track.getNumberOfChannels(),
      track.getSampleRate(),
      track.computeDuration(),
    ]);
    const sample = await new AudioSampleSink(track).getSample(timestamp);
    if (!sample) {
      return {
        trackCount: tracks.length,
        channels,
        sampleRate,
        duration,
        sampleStart: null,
        sampleEnd: null,
        coversTimestamp: false,
        leftRms: 0,
        rightRms: 0,
      };
    }

    try {
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
      const sampleEnd = sample.timestamp + sample.duration;
      return {
        trackCount: tracks.length,
        channels,
        sampleRate,
        duration,
        sampleStart: sample.timestamp,
        sampleEnd,
        coversTimestamp:
          sample.timestamp <= timestamp
          && timestamp < sampleEnd - Number.EPSILON,
        leftRms: rms(planes[0] ?? new Float32Array()),
        rightRms: rms(planes[1] ?? planes[0] ?? new Float32Array()),
      };
    } finally {
      sample.close();
    }
  } finally {
    input.dispose();
  }
}
