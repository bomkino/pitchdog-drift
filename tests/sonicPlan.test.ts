import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";
import { mixSoundtrackIntoPlanar, type ReadableAudioBuffer } from "../src/sonic/mix";
import { buildSonicTimeline, getSonicDensityStep } from "../src/sonic/plan";

function audibleSettings() {
  const settings = cloneSettings(DEFAULT_SETTINGS);
  settings.sound.exportEnabled = true;
  return settings;
}

function stereoBuffer(
  left: readonly number[],
  right: readonly number[],
  sampleRate: number,
): ReadableAudioBuffer {
  const channels = [Float32Array.from(left), Float32Array.from(right)];
  return {
    sampleRate,
    length: channels[0]!.length,
    numberOfChannels: channels.length,
    getChannelData(channel) {
      return channels[channel]!;
    },
  };
}

describe("sonic timeline", () => {
  it("is deterministic and remains inside the export timeline", () => {
    const settings = audibleSettings();
    const first = buildSonicTimeline(settings, 8);
    const second = buildSonicTimeline(settings, 8);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    for (const event of first) {
      expect(event.time).toBeGreaterThanOrEqual(0);
      expect(event.time).toBeLessThan(settings.output.duration);
      expect(event.gain).toBeGreaterThan(0);
      expect(event.gain).toBeLessThanOrEqual(1);
      expect(event.playbackRate).toBeGreaterThan(0);
      expect(Math.abs(event.pan)).toBeLessThanOrEqual(0.78);
      expect(Number.isInteger(event.variant)).toBe(true);
      expect(event.variant).toBeGreaterThanOrEqual(0);
    }
  });

  it("stays silent when authored sound or meaningful motion is absent", () => {
    const noAssets = audibleSettings();
    expect(buildSonicTimeline(noAssets, 0)).toEqual([]);

    const disabled = audibleSettings();
    disabled.sound.exportEnabled = false;
    expect(buildSonicTimeline(disabled, 8)).toEqual([]);

    const still = audibleSettings();
    still.motion.speed = 0;
    expect(buildSonicTimeline(still, 8)).toEqual([]);

    const reduced = audibleSettings();
    reduced.motion.reducedMotionOutput = true;
    expect(buildSonicTimeline(reduced, 8)).toEqual([]);
  });

  it("increases cue frequency monotonically with density", () => {
    const counts = [0.18, 0.5, 0.9].map((density) => {
      const settings = audibleSettings();
      settings.sound.density = density;
      settings.output.duration = 20;
      return buildSonicTimeline(settings, 8, 20).filter((event) => event.cue === "passage").length;
    });

    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[0]).toBeLessThan(counts[1]!);
    expect(counts[1]).toBeLessThan(counts[2]!);
    expect(getSonicDensityStep(0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("keeps seamless repeats free of a doubled seam cue", () => {
    const settings = audibleSettings();
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 3;
    settings.sound.density = 1;
    const events = buildSonicTimeline(settings, 8);

    expect(events.length).toBeGreaterThan(8);
    expect(events.some((event) => event.cue === "settle")).toBe(false);
    expect(Math.max(...events.map((event) => event.time))).toBeLessThan(settings.output.duration - 0.045);
  });

  it("follows lateral direction while vertical passages stay centred", () => {
    const horizontal = audibleSettings();
    horizontal.motion.axis = "horizontal";
    horizontal.motion.direction = -1;
    const rightward = buildSonicTimeline(horizontal, 8).find((event) => event.cue === "passage");
    expect(rightward?.pan).toBeGreaterThan(0);

    horizontal.motion.direction = 1;
    const leftward = buildSonicTimeline(horizontal, 8).find((event) => event.cue === "passage");
    expect(leftward?.pan).toBeLessThan(0);

    const vertical = audibleSettings();
    vertical.motion.axis = "vertical";
    expect(buildSonicTimeline(vertical, 8).filter((event) => event.cue === "passage").every((event) => event.pan === 0)).toBe(true);
  });
});

describe("soundtrack PCM mixer", () => {
  it("adds stereo samples at exact matching timestamps", () => {
    const destination = [new Float32Array(4), new Float32Array(4)];
    mixSoundtrackIntoPlanar(destination, 0, 4, stereoBuffer([0, 0.25, 0.5, 1], [1, 0.5, 0.25, 0], 4), 1);
    expect(Array.from(destination[0]!)).toEqual([0, 0.25, 0.5, 1]);
    expect(Array.from(destination[1]!)).toEqual([1, 0.5, 0.25, 0]);
  });

  it("resamples linearly, folds to mono, and clips safely", () => {
    const resampled = [new Float32Array(4)];
    mixSoundtrackIntoPlanar(resampled, 0, 4, stereoBuffer([0, 1], [0, 1], 2), 1);
    expect(Array.from(resampled[0]!)).toEqual([0, 0.5, 1, 1]);

    const mono = [new Float32Array([0.8])];
    mixSoundtrackIntoPlanar(mono, 0, 1, stereoBuffer([1], [-0.5], 1), 1);
    expect(mono[0]![0]).toBe(1);
  });

  it("honours absolute timestamps and rejects malformed PCM", () => {
    const destination = [new Float32Array(2), new Float32Array(2)];
    mixSoundtrackIntoPlanar(destination, 0.5, 4, stereoBuffer([0, 0.2, 0.4, 0.6], [0, 0.1, 0.2, 0.3], 4), 1);
    expect(destination[0]![0]).toBeCloseTo(0.4, 6);
    expect(destination[0]![1]).toBeCloseTo(0.6, 6);
    expect(destination[1]![0]).toBeCloseTo(0.2, 6);
    expect(destination[1]![1]).toBeCloseTo(0.3, 6);

    expect(() => mixSoundtrackIntoPlanar([], 0, 48_000, stereoBuffer([0], [0], 48_000), 1)).toThrow(TypeError);
    expect(() => mixSoundtrackIntoPlanar([new Float32Array(1)], 0, 0, stereoBuffer([0], [0], 48_000), 1)).toThrow(TypeError);
    expect(() => mixSoundtrackIntoPlanar([new Float32Array(1)], 0, 48_000, stereoBuffer([0], [0], 48_000), 2)).toThrow(TypeError);
  });
});
