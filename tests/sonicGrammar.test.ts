import { describe, expect, it } from "vitest";
import type { SonicPalette } from "../src/model";
import {
  buildSonicGestureLayers,
  getBalancedSonicVariant,
  getSonicGestureDependencies,
  type SonicGesturePlanInput,
  type SonicSemanticCue,
} from "../src/sonic/grammar";
import {
  getSonicAssetSpec,
  getSonicAssetVariantCount,
} from "../src/sonic/catalog";
import { getSonicEnvelopePoints } from "../src/sonic/graph";

const PALETTES: readonly SonicPalette[] = ["studio", "cinematic", "paper"];
const SEMANTIC_CUES: readonly SonicSemanticCue[] = [
  "passage",
  "grab",
  "release",
  "settle",
  "control",
  "success",
  "failure",
];

function passageInput(
  patch: Partial<SonicGesturePlanInput> = {},
): SonicGesturePlanInput {
  return {
    cue: "passage",
    palette: "studio",
    texture: 0.68,
    seed: 37,
    sequence: 9,
    intensity: 0.62,
    baseGain: 0.76,
    basePlaybackRate: 1.03,
    basePan: -0.44,
    baseVariant: 1,
    spatial: true,
    ...patch,
  };
}

function secondaryGain(input: SonicGesturePlanInput): number {
  return buildSonicGestureLayers(input)
    .slice(1)
    .reduce((sum, layer) => sum + layer.gain, 0);
}

describe("organic editorial Foley grammar", () => {
  it("is deterministic and never rewrites the material body", () => {
    const clean = buildSonicGestureLayers(passageInput({ texture: 0 }));
    const textured = buildSonicGestureLayers(passageInput({ texture: 0.92 }));
    const repeated = buildSonicGestureLayers(passageInput({ texture: 0.92 }));

    expect(textured).toEqual(repeated);
    expect(textured.length).toBeGreaterThan(clean.length);
    expect(textured[0]).toEqual(clean[0]);
    expect(textured[0]).toMatchObject({
      cue: "passage",
      role: "body",
      delay: 0,
      gain: 0.76,
      playbackRate: 1.03206,
      pan: -0.44,
      variant: 1,
      filters: [],
    });
    expect(Object.isFrozen(textured)).toBe(true);
    expect(textured.every(Object.isFrozen)).toBe(true);
  });

  it("auditions the complete body, air, contact, and landing grammar", () => {
    for (const palette of PALETTES) {
      const layers = buildSonicGestureLayers(passageInput({
        palette,
        force: true,
      }));
      expect(layers.map((layer) => layer.role)).toEqual([
        "body",
        "air",
        "contact",
        "landing",
      ]);
      expect(layers.map((layer) => layer.cue)).toEqual([
        "passage",
        "air",
        "contact",
        "settle",
      ]);
      expect(layers[1]!.delay).toBeLessThan(layers[2]!.delay);
      expect(layers[2]!.delay).toBeLessThan(layers[3]!.delay);
    }
  });

  it("only adds supported layers as texture rises", () => {
    const textures = [0, 0.12, 0.32, 0.55, 0.78, 1];
    for (const palette of PALETTES) {
      for (let sequence = 1; sequence <= 64; sequence += 1) {
        const plans = textures.map((texture) => buildSonicGestureLayers(
          passageInput({ palette, texture, sequence }),
        ));
        for (let index = 1; index < plans.length; index += 1) {
          const previous = plans[index - 1]!;
          const current = plans[index]!;
          expect(previous.every((layer) => current.some((candidate) => (
            candidate.role === layer.role
            && candidate.cue === layer.cue
            && candidate.variant === layer.variant
            && candidate.playbackRate === layer.playbackRate
            && candidate.pan === layer.pan
            && candidate.delay === layer.delay
          )))).toBe(true);
          expect(current[0]).toEqual(plans[0]![0]);
        }
      }
    }
  });

  it("keeps the default texture sparse instead of becoming a soundboard", () => {
    for (const palette of PALETTES) {
      for (let sequence = 1; sequence <= 96; sequence += 1) {
        const layers = buildSonicGestureLayers(passageInput({
          palette,
          texture: 0.24,
          sequence,
          intensity: 0.62,
        }));
        expect(layers.length).toBeLessThanOrEqual(2);
        expect(layers.map((layer) => layer.role)).not.toContain("contact");
        expect(layers.map((layer) => layer.role)).not.toContain("landing");
      }
    }
  });

  it("subtracts ornament as passage cadence becomes fast", () => {
    for (const palette of PALETTES) {
      let calmLayers = 0;
      let fastLayers = 0;
      let calmGain = 0;
      let fastGain = 0;
      for (let sequence = 1; sequence <= 256; sequence += 1) {
        const calm = passageInput({
          palette,
          texture: 1,
          sequence,
          intensity: 0.58,
        });
        const fast = { ...calm, intensity: 1 };
        calmLayers += buildSonicGestureLayers(calm).length - 1;
        fastLayers += buildSonicGestureLayers(fast).length - 1;
        calmGain += secondaryGain(calm);
        fastGain += secondaryGain(fast);
      }
      expect(fastLayers).toBeLessThan(calmLayers);
      expect(fastGain).toBeLessThan(calmGain * 0.62);
    }
  });

  it("assigns distinct frequency and envelope jobs to each role", () => {
    for (const palette of PALETTES) {
      const layers = buildSonicGestureLayers(passageInput({
        palette,
        force: true,
      }));
      const body = layers.find((layer) => layer.role === "body")!;
      const air = layers.find((layer) => layer.role === "air")!;
      const contact = layers.find((layer) => layer.role === "contact")!;
      const landing = layers.find((layer) => layer.role === "landing")!;

      expect(body.filters).toEqual([]);
      expect(air.filters.map((filter) => filter.type)).toEqual([
        "highpass",
        "lowpass",
      ]);
      expect(contact.filters.map((filter) => filter.type)).toEqual([
        "highpass",
        "lowpass",
      ]);
      expect(landing.filters.map((filter) => filter.type)).toEqual([
        "lowpass",
      ]);
      expect(air.envelope.attack).toBeGreaterThan(body.envelope.attack);
      expect(contact.envelope.attack).toBeLessThan(body.envelope.attack);
      expect(landing.envelope.release).toBeGreaterThan(body.envelope.release);
      for (const layer of layers) {
        for (const filter of layer.filters) {
          expect(filter.frequency).toBeGreaterThan(100);
          expect(filter.frequency).toBeLessThan(20_000);
          expect(filter.q).toBeGreaterThan(0);
        }
        expect(layer.envelope.attack).toBeGreaterThanOrEqual(0);
        expect(layer.envelope.release).toBeGreaterThan(0);
      }
    }
  });

  it("keeps secondary texture quiet, finite, and spatially bounded", () => {
    for (const palette of PALETTES) {
      for (const cue of SEMANTIC_CUES) {
        const layers = buildSonicGestureLayers(passageInput({
          palette,
          cue,
          texture: 1,
          sequence: 99,
          intensity: 0.62,
          baseGain: 0.92,
          basePlaybackRate: 1.2,
          basePan: 0.78,
          spatial: true,
          force: true,
        }));
        const body = layers[0]!;
        const secondary = layers.slice(1);
        expect(layers.length).toBeLessThanOrEqual(4);
        expect(secondary.reduce((sum, layer) => sum + layer.gain, 0))
          .toBeLessThanOrEqual(
            body.gain * (cue === "passage" ? 0.3 : 0.24) + Number.EPSILON,
          );
        for (const layer of layers) {
          expect(Number.isFinite(layer.delay)).toBe(true);
          expect(layer.delay).toBeGreaterThanOrEqual(0);
          expect(layer.delay).toBeLessThan(0.1);
          expect(layer.gain).toBeGreaterThan(0);
          expect(layer.playbackRate).toBeGreaterThanOrEqual(0.72);
          expect(layer.playbackRate).toBeLessThanOrEqual(1.28);
          expect(Math.abs(layer.pan)).toBeLessThanOrEqual(0.82);
        }
      }
    }
  });

  it("keeps vertical and non-spatial gestures centred", () => {
    const layers = buildSonicGestureLayers(passageInput({
      spatial: false,
      basePan: 0.72,
      force: true,
    }));
    expect(layers.every((layer) => layer.pan === 0)).toBe(true);
  });

  it("declares every local dependency before a gesture begins", () => {
    for (const palette of PALETTES) {
      expect(getSonicGestureDependencies(palette, "passage", 0, 0.6)).toEqual([
        "passage",
      ]);
      expect(getSonicGestureDependencies(palette, "passage", 0.24, 0.6)).toEqual([
        "passage",
        "air",
      ]);
      expect(getSonicGestureDependencies(
        palette,
        "passage",
        0.8,
        0.6,
        true,
      )).toEqual([
        "passage",
        "air",
        "contact",
        "settle",
      ]);

      for (const cue of SEMANTIC_CUES) {
        for (const texture of [0, 0.24, 0.5, 0.8, 1]) {
          const dependencies = new Set(getSonicGestureDependencies(
            palette,
            cue,
            texture,
            0.62,
          ));
          for (let sequence = 1; sequence <= 24; sequence += 1) {
            const layers = buildSonicGestureLayers(passageInput({
              palette,
              cue,
              texture,
              sequence,
              intensity: 0.62,
            }));
            for (const layer of layers) expect(dependencies.has(layer.cue)).toBe(true);
          }
        }
      }
    }
  });

  it("rotates every real take before repeating and avoids cycle-boundary repeats", () => {
    for (const palette of PALETTES) {
      for (const cue of ["passage", "air", "contact", "settle"] as const) {
        const count = getSonicAssetVariantCount(palette, cue);
        const variants = Array.from(
          { length: count * 8 },
          (_, index) => getBalancedSonicVariant(
            palette,
            cue,
            91,
            index + 1,
          ),
        );
        for (let start = 0; start < variants.length; start += count) {
          expect(new Set(variants.slice(start, start + count)).size).toBe(count);
        }
        if (count > 1) {
          for (let index = 1; index < variants.length; index += 1) {
            expect(variants[index]).not.toBe(variants[index - 1]);
          }
        }
      }
    }
  });

  it("handles very large deterministic sequences without recursive work", () => {
    expect(() => getBalancedSonicVariant(
      "studio",
      "passage",
      17,
      2_000_000_000,
    )).not.toThrow();
  });

  it("changes material character without rewriting layer rhythm", () => {
    const roleRhythms = PALETTES.map((palette) => Array.from(
      { length: 64 },
      (_, index) => buildSonicGestureLayers(passageInput({
        palette,
        sequence: index + 1,
      })).map((layer) => layer.role),
    ));
    expect(roleRhythms[1]).toEqual(roleRhythms[0]);
    expect(roleRhythms[2]).toEqual(roleRhythms[0]);

    const full = PALETTES.map((palette) => buildSonicGestureLayers(
      passageInput({ palette, force: true }),
    ));
    const air = full.map((plan) => plan.find((layer) => layer.role === "air")!);
    const contact = full.map((plan) => plan.find((layer) => layer.role === "contact")!);
    const landing = full.map((plan) => plan.find((layer) => layer.role === "landing")!);
    expect(new Set(air.map((layer) => layer.filters[0]!.frequency)).size).toBe(3);
    expect(new Set(contact.map((layer) => layer.playbackRate.toFixed(8))).size).toBe(3);
    expect(new Set(landing.map((layer) => layer.filters[0]!.frequency)).size).toBe(3);
  });

  it("uses bounded deterministic micro-timing instead of rigid layer stacks", () => {
    for (const palette of PALETTES) {
      const delays = Array.from({ length: 48 }, (_, index) => (
        buildSonicGestureLayers(passageInput({
          palette,
          sequence: index + 1,
          force: true,
        })).slice(1).map((layer) => layer.delay)
      ));
      expect(new Set(delays.flat().map((delay) => delay.toFixed(5))).size)
        .toBeGreaterThan(5);
      for (const plan of delays) {
        expect(plan[0]).toBeLessThan(plan[1]!);
        expect(plan[1]).toBeLessThan(plan[2]!);
      }
    }
  });
  it("fits role envelopes safely inside short source windows", () => {
    expect(getSonicEnvelopePoints(1, 1.01, { attack: 0.05, release: 0.08 })).toEqual({
      attackEnd: 1.004,
      releaseStart: 1.004,
    });
    expect(getSonicEnvelopePoints(2, 1, { attack: -1, release: -1 })).toEqual({
      attackEnd: 2,
      releaseStart: 2,
    });
  });

  it("does not phase-stack the same physical take when alternatives exist", () => {
    for (const palette of PALETTES) {
      for (const cue of SEMANTIC_CUES) {
        for (let sequence = 1; sequence <= 64; sequence += 1) {
          const input = passageInput({ palette, cue, sequence, force: true });
          const layers = buildSonicGestureLayers(input);
          const names = layers.map((layer) => getSonicAssetSpec(
            input.palette,
            layer.cue,
            layer.variant,
          ).name);
          const availableNames = new Set(layers.flatMap((layer) => (
            Array.from(
              { length: getSonicAssetVariantCount(input.palette, layer.cue) },
              (_, variant) => getSonicAssetSpec(
                input.palette,
                layer.cue,
                variant,
              ).name,
            )
          )));
          if (availableNames.size >= names.length) {
            expect(new Set(names).size).toBe(names.length);
          }
        }
      }
    }
  });

  it("ties material duration to physical passage speed without changing takes", () => {
    for (const palette of PALETTES) {
      const slow = buildSonicGestureLayers(passageInput({
        palette,
        intensity: 0.34,
        force: true,
      }));
      const fast = buildSonicGestureLayers(passageInput({
        palette,
        intensity: 1,
        force: true,
      }));
      expect(fast[0]!.variant).toBe(slow[0]!.variant);
      expect(fast[0]!.playbackRate).toBeGreaterThan(slow[0]!.playbackRate);
      expect(fast[0]!.envelope.release).toBeLessThan(slow[0]!.envelope.release);
      expect(fast.find((layer) => layer.role === "air")!.envelope.release)
        .toBeLessThan(slow.find((layer) => layer.role === "air")!.envelope.release);
    }
  });
});
