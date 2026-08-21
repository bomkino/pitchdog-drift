import type { SonicPalette } from "../model";
import type { SonicCue } from "./catalog";

export type SonicLayerRole = "body" | "fibre" | "contact";

export interface SonicRecipeInput {
  palette: SonicPalette;
  cue: SonicCue;
  /** Stable composition seed. */
  seed: number;
  /** Stable semantic event sequence. */
  sequence: number;
  /** Primary take decision from the shared passage/control planner. */
  variant: number;
  /** Primary authored level before source treatment and bus gain. */
  gain: number;
  /** Primary playback rate before per-layer material treatment. */
  playbackRate: number;
  /** Primary stereo position. */
  pan: number;
}

export interface SonicRecipeLayer {
  role: SonicLayerRole;
  cue: SonicCue;
  variant: number;
  /** Seconds after the semantic event onset. */
  delay: number;
  gain: number;
  playbackRate: number;
  pan: number;
}

export const MAX_SONIC_RECIPE_LAYERS = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function hashUnit(value: number): number {
  let seed = value | 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  seed ^= seed >>> 16;
  return (seed >>> 0) / 4_294_967_295;
}

function normalizeSequence(sequence: number): number {
  if (!Number.isFinite(sequence)) return 1;
  return Math.max(0, Math.abs(Math.trunc(sequence)));
}

function layer(
  input: SonicRecipeInput,
  role: SonicLayerRole,
  cue: SonicCue,
  variantOffset: number,
  delay: number,
  gainMultiplier: number,
  rateMultiplier: number,
  panOffset: number,
): SonicRecipeLayer {
  return Object.freeze({
    role,
    cue,
    variant: Math.trunc(finite(input.variant, 0)) + variantOffset,
    delay: clamp(finite(delay, 0), 0, 0.12),
    gain: clamp(finite(input.gain, 0) * gainMultiplier, 0, 1),
    playbackRate: clamp(
      finite(input.playbackRate, 1) * rateMultiplier,
      0.72,
      1.28,
    ),
    pan: clamp(finite(input.pan, 0) + panOffset, -0.82, 0.82),
  });
}

/**
 * Builds one deterministic micro-Foley recipe for both live preview and export.
 *
 * Existing directions remain one event / one recording. Editorial is richer,
 * but never arbitrary: a literal movement body receives a quieter, millisecond-
 * offset fibre layer, then selected semantic beats receive one restrained
 * contact. The three-beat accent phase prevents continuous punctuation and
 * guarantees at least two unaccented passages between matching contact beats.
 */
export function buildSonicRecipe(
  rawInput: SonicRecipeInput,
): readonly SonicRecipeLayer[] {
  const input: SonicRecipeInput = {
    ...rawInput,
    seed: Math.trunc(finite(rawInput.seed, 0)),
    sequence: normalizeSequence(rawInput.sequence),
    variant: Math.trunc(finite(rawInput.variant, 0)),
    gain: clamp(finite(rawInput.gain, 0), 0, 1),
    playbackRate: clamp(finite(rawInput.playbackRate, 1), 0.72, 1.28),
    pan: clamp(finite(rawInput.pan, 0), -0.82, 0.82),
  };

  if (input.palette !== "editorial") {
    return Object.freeze([
      layer(input, "body", input.cue, 0, 0, 1, 1, 0),
    ]);
  }

  const eventSeed = (
    input.seed
    ^ Math.imul(input.sequence + 1, 0x45d9f3b)
    ^ Math.imul(input.cue.length + 7, 0x27d4eb2d)
  ) | 0;
  const detailUnit = hashUnit(eventSeed ^ 0x37a4c15d);
  const contactUnit = hashUnit(eventSeed ^ 0x6d2b79f5);
  const side = hashUnit(eventSeed ^ 0x14b6a3c1) < 0.5 ? -1 : 1;
  const phase = Math.floor(hashUnit(input.seed ^ 0x51f15e) * 3);
  const contactBeat = (input.sequence + phase) % 3 === 0;

  switch (input.cue) {
    case "passage": {
      const layers: SonicRecipeLayer[] = [
        layer(input, "body", "passage", 0, 0, 0.72, 1, 0),
        layer(
          input,
          "fibre",
          "passage",
          1 + Math.floor(detailUnit * 3),
          0.014 + detailUnit * 0.014,
          0.15 + detailUnit * 0.04,
          0.96 + detailUnit * 0.06,
          side * (0.045 + detailUnit * 0.035),
        ),
      ];
      if (contactBeat) {
        layers.push(layer(
          input,
          "contact",
          "settle",
          1 + Math.floor(contactUnit * 2),
          0.054 + contactUnit * 0.022,
          0.10 + contactUnit * 0.035,
          1.04 + contactUnit * 0.08,
          -side * (0.018 + contactUnit * 0.025),
        ));
      }
      return Object.freeze(layers);
    }

    case "grab":
      return Object.freeze([
        layer(input, "body", "grab", 0, 0, 0.82, 1, 0),
        layer(
          input,
          "fibre",
          "passage",
          1 + Math.floor(detailUnit * 2),
          0.01 + detailUnit * 0.012,
          0.10 + detailUnit * 0.025,
          0.94 + detailUnit * 0.05,
          side * 0.035,
        ),
      ]);

    case "release":
      return Object.freeze([
        layer(input, "body", "release", 0, 0, 0.84, 1, 0),
        layer(
          input,
          "contact",
          "settle",
          1 + Math.floor(contactUnit * 2),
          0.028 + contactUnit * 0.018,
          0.11 + contactUnit * 0.025,
          1.03 + contactUnit * 0.06,
          -side * 0.025,
        ),
      ]);

    case "success":
      return Object.freeze([
        layer(input, "body", "success", 0, 0, 0.82, 1, 0),
        layer(
          input,
          "contact",
          "control",
          1 + Math.floor(contactUnit * 2),
          0.038 + contactUnit * 0.016,
          0.12 + contactUnit * 0.03,
          1.02 + contactUnit * 0.05,
          side * 0.02,
        ),
      ]);

    case "settle":
    case "control":
    case "failure":
    default:
      return Object.freeze([
        layer(input, "body", input.cue, 0, 0, 0.92, 1, 0),
      ]);
  }
}

export function getSonicRecipeCues(
  input: SonicRecipeInput,
): readonly SonicCue[] {
  return Object.freeze([
    ...new Set(buildSonicRecipe(input).map((item) => item.cue)),
  ]);
}
