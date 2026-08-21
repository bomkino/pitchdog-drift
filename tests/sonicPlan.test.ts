import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";
import { mixSoundtrackIntoPlanar, type ReadableAudioBuffer } from "../src/sonic/mix";
import {
  buildSonicTimeline,
  getSonicPassageDecision,
  getSonicPassageDistance,
  getSonicPassageStep,
  shouldIncludeSonicPassage,
} from "../src/sonic/plan";

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
      expect(event.intensity).toBeGreaterThanOrEqual(0.34);
      expect(event.intensity).toBeLessThanOrEqual(1);
      expect(event.playbackRate).toBeGreaterThan(0);
      expect(Math.abs(event.pan)).toBeLessThanOrEqual(0.78);
      expect(Number.isInteger(event.variant)).toBe(true);
      expect(event.variant).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(event.sequence)).toBe(true);
      expect(event.sequence).toBeGreaterThanOrEqual(0);
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

  it("makes density continuous, monotonic, and compositionally stable", () => {
    const densities = [0, 0.12, 0.28, 0.5, 0.74, 1];
    const selections = densities.map((density) => new Set(
      Array.from({ length: 512 }, (_, index) => index + 1)
        .filter((sequence) => shouldIncludeSonicPassage(sequence, density, 17)),
    ));

    expect(selections[0]!.size).toBe(0);
    expect(selections.at(-1)!.size).toBe(512);
    for (let index = 1; index < selections.length; index += 1) {
      const previous = selections[index - 1]!;
      const current = selections[index]!;
      expect(current.size).toBeGreaterThan(previous.size);
      expect([...previous].every((sequence) => current.has(sequence))).toBe(true);
    }

    // Material changes timbre, not the placement rhythm the user directed.
    const studio = Array.from({ length: 96 }, (_, index) => index + 1)
      .filter((sequence) => getSonicPassageDecision(
        "studio",
        0.46,
        0.7,
        17,
        sequence,
      ).included);
    const paper = Array.from({ length: 96 }, (_, index) => index + 1)
      .filter((sequence) => getSonicPassageDecision(
        "paper",
        0.46,
        0.7,
        17,
        sequence,
      ).included);
    expect(paper).toEqual(studio);
  });

  it("uses one direction-symmetric visual focus hand-off", () => {
    const stride = 640;
    expect(getSonicPassageStep(0.499 * stride, stride)).toBe(0);
    expect(getSonicPassageStep(0.5 * stride, stride)).toBe(1);
    expect(getSonicPassageStep(-0.499 * stride, stride)).toBe(0);
    expect(getSonicPassageStep(-0.5 * stride, stride)).toBe(-1);
    expect(getSonicPassageDistance(1, stride)).toBe(0.5 * stride);
    expect(getSonicPassageDistance(4, stride)).toBe(3.5 * stride);
  });

  it("keeps primary takes and pitch stable while texture changes", () => {
    for (let sequence = 1; sequence <= 96; sequence += 1) {
      const dry = getSonicPassageDecision("studio", 0.72, 0, 17, sequence);
      const rich = getSonicPassageDecision("studio", 0.72, 1, 17, sequence);
      expect(rich).toEqual(dry);
    }
  });

  it("shares passage inclusion, take, and pitch decisions with live preview", () => {
    const settings = audibleSettings();
    settings.sound.density = 0.61;
    settings.sound.variation = 0.78;
    settings.output.duration = 24;
    const passages = buildSonicTimeline(settings, 8, 24)
      .filter((event) => event.cue === "passage");

    expect(passages.length).toBeGreaterThan(3);
    for (const event of passages) {
      const decision = getSonicPassageDecision(
        settings.sound.palette,
        settings.sound.density,
        settings.sound.variation,
        settings.background.seed,
        event.sequence,
      );
      expect(decision.included).toBe(true);
      expect(event.variant).toBe(decision.variant);
      expect(event.playbackRate).toBe(decision.playbackRate);
    }
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
