import type { SonicPalette } from "../model";
import {
  getSonicAssetSpec,
  getSonicAssetVariantCount,
  type SonicCue,
} from "./catalog";

export type SonicSemanticCue = Exclude<SonicCue, "air" | "contact">;
export type SonicLayerRole = "body" | "air" | "contact" | "landing";

export interface SonicFilterSpec {
  type: "highpass" | "lowpass";
  frequency: number;
  q: number;
}

export interface SonicEnvelopeSpec {
  /** Seconds from silence to the authored layer gain. */
  attack: number;
  /** Seconds reserved for the final fade to silence. */
  release: number;
}

export interface SonicVoiceLayer {
  cue: SonicCue;
  role: SonicLayerRole;
  /** Seconds after the semantic gesture. Never negative, preserving parity. */
  delay: number;
  /** Authored gain before source treatment and user family/master gain. */
  gain: number;
  playbackRate: number;
  pan: number;
  variant: number;
  filters: readonly SonicFilterSpec[];
  envelope: Readonly<SonicEnvelopeSpec>;
}

export interface SonicGesturePlanInput {
  cue: SonicSemanticCue;
  palette: SonicPalette;
  /** Layer richness. Persisted as legacy `variation` for schema compatibility. */
  texture: number;
  seed: number;
  sequence: number;
  /** Physical speed/energy. High cadence receives fewer ornaments. */
  intensity: number;
  baseGain: number;
  basePlaybackRate: number;
  basePan: number;
  baseVariant: number;
  /** False for vertical movement and non-spatial interface feedback. */
  spatial: boolean;
  /** Audition demonstrates the complete supported material grammar. */
  force?: boolean;
}

const ROLE_SALT: Readonly<Record<Exclude<SonicLayerRole, "body">, number>> = {
  air: 0x31a7,
  contact: 0x5d2b,
  landing: 0x7f4d,
};

const SUPPORTED_ROLES: Readonly<Record<
  SonicSemanticCue,
  readonly Exclude<SonicLayerRole, "body">[]
>> = {
  passage: ["air", "contact", "landing"],
  grab: ["air", "contact"],
  release: ["air", "contact", "landing"],
  settle: [],
  control: [],
  success: ["contact", "landing"],
  failure: ["contact", "landing"],
};

interface PaletteShape {
  airGain: number;
  contactGain: number;
  landingGain: number;
  airDelay: number;
  contactDelay: number;
  landingDelay: number;
  airRate: number;
  contactRate: number;
  landingRate: number;
  airPan: number;
  contactPan: number;
  landingPan: number;
  airHighpass: number;
  airLowpass: number;
  contactHighpass: number;
  contactLowpass: number;
  landingLowpass: number;
}

const PALETTE_SHAPE: Readonly<Record<SonicPalette, Readonly<PaletteShape>>> = {
  studio: {
    airGain: 1,
    contactGain: 0.92,
    landingGain: 0.82,
    airDelay: 0,
    contactDelay: 0,
    landingDelay: 0,
    airRate: 1,
    contactRate: 1,
    landingRate: 1,
    airPan: 0.74,
    contactPan: 0.34,
    landingPan: 0.16,
    airHighpass: 720,
    airLowpass: 11_000,
    contactHighpass: 620,
    contactLowpass: 7_400,
    landingLowpass: 2_600,
  },
  cinematic: {
    airGain: 0.72,
    contactGain: 1.08,
    landingGain: 1.16,
    airDelay: 0.002,
    contactDelay: 0,
    landingDelay: 0,
    airRate: 0.94,
    contactRate: 0.92,
    landingRate: 0.9,
    airPan: 0.58,
    contactPan: 0.28,
    landingPan: 0.14,
    airHighpass: 520,
    airLowpass: 8_400,
    contactHighpass: 180,
    contactLowpass: 5_200,
    landingLowpass: 1_900,
  },
  paper: {
    airGain: 1.18,
    contactGain: 0.66,
    landingGain: 0.74,
    airDelay: 0.003,
    contactDelay: 0.003,
    landingDelay: 0.01,
    airRate: 1.02,
    contactRate: 1.03,
    landingRate: 1.01,
    airPan: 0.8,
    contactPan: 0.3,
    landingPan: 0.12,
    airHighpass: 860,
    airLowpass: 12_500,
    contactHighpass: 540,
    contactLowpass: 6_600,
    landingLowpass: 3_100,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashUnit(seed: number): number {
  let value = seed | 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 4_294_967_295;
}

function textSeed(value: string): number {
  let seed = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    seed ^= value.charCodeAt(index);
    seed = Math.imul(seed, 0x01000193);
  }
  return seed | 0;
}

function normalizeSequence(sequence: number): number {
  if (!Number.isFinite(sequence)) return 1;
  return Math.max(1, Math.abs(Math.trunc(sequence)));
}

function gcd(left: number, right: number): number {
  let a = Math.abs(Math.trunc(left));
  let b = Math.abs(Math.trunc(right));
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function coprimeStep(count: number, unit: number): number {
  if (count <= 2) return 1;
  const candidates = Array.from(
    { length: count - 1 },
    (_, index) => index + 1,
  ).filter((step) => gcd(step, count) === 1);
  return candidates[Math.min(
    candidates.length - 1,
    Math.floor(unit * candidates.length),
  )] ?? 1;
}

function cycleParameters(
  palette: SonicPalette,
  cue: SonicCue,
  seed: number,
  cycle: number,
  count: number,
  salt: number,
): Readonly<{ offset: number; step: number }> {
  const identity = textSeed(`${palette}:${cue}`);
  const baseSeed = (
    (Number.isFinite(seed) ? Math.trunc(seed) : 0)
    ^ identity
    ^ salt
  ) | 0;
  const step = coprimeStep(count, hashUnit(baseSeed ^ 0x2c1b3c6d));
  const baseOffset = Math.min(
    count - 1,
    Math.floor(hashUnit(baseSeed ^ 0x6d2b79f5) * count),
  );
  const forbiddenShift = (count - step) % count;
  const shifts = Array.from(
    { length: count },
    (_, index) => index,
  ).filter((shift) => shift !== forbiddenShift);
  const shift = shifts[Math.min(
    shifts.length - 1,
    Math.floor(hashUnit(baseSeed ^ 0x165667b1) * shifts.length),
  )] ?? 0;
  return {
    offset: (baseOffset + (cycle % count) * shift) % count,
    step,
  };
}

/**
 * Deterministic fatigue-resistant take rotation. Every real recording is used
 * once before a cycle repeats, and adjacent cycle boundaries cannot repeat.
 */
export function getBalancedSonicVariant(
  palette: SonicPalette,
  cue: SonicCue,
  seed: number,
  sequence: number,
  salt = 0,
): number {
  const count = getSonicAssetVariantCount(palette, cue);
  if (count <= 1) return 0;
  const normalizedSequence = normalizeSequence(sequence);
  const cycle = Math.floor((normalizedSequence - 1) / count);
  const position = (normalizedSequence - 1) % count;
  const { offset, step } = cycleParameters(
    palette,
    cue,
    seed,
    cycle,
    count,
    salt,
  );
  return (offset + position * step) % count;
}

/**
 * Keeps one micro-gesture from stacking the exact same physical recording on
 * itself through two differently filtered roles. When a cue family has an
 * alternative take, advance deterministically until the source name is new.
 */
function getDistinctSonicVariant(
  palette: SonicPalette,
  cue: SonicCue,
  seed: number,
  sequence: number,
  salt: number,
  usedSourceNames: ReadonlySet<string>,
): number {
  const count = getSonicAssetVariantCount(palette, cue);
  const first = getBalancedSonicVariant(palette, cue, seed, sequence, salt);
  for (let offset = 0; offset < count; offset += 1) {
    const candidate = (first + offset) % count;
    if (!usedSourceNames.has(getSonicAssetSpec(palette, cue, candidate).name)) {
      return candidate;
    }
  }
  return first;
}

function inclusionGate(seed: number, sequence: number, salt: number): number {
  return hashUnit(
    (Number.isFinite(seed) ? Math.trunc(seed) : 0)
    ^ Math.imul(normalizeSequence(sequence), 0x27d4eb2d)
    ^ salt,
  );
}

function roleMinimumTexture(
  cue: SonicSemanticCue,
  role: Exclude<SonicLayerRole, "body">,
): number {
  switch (cue) {
    case "passage": return role === "air" ? 0.08 : role === "contact" ? 0.34 : 0.68;
    case "grab": return role === "air" ? 0.2 : 0.56;
    case "release": return role === "air" ? 0.18 : role === "contact" ? 0.44 : 0.5;
    case "success": return role === "contact" ? 0.32 : 0.54;
    case "failure": return role === "contact" ? 0.24 : 0.4;
    case "settle":
    case "control":
    default: return 1;
  }
}

function highCadence(intensity: number): number {
  return clamp((intensity - 0.7) / 0.3, 0, 1);
}

function roleThreshold(
  cue: SonicSemanticCue,
  role: Exclude<SonicLayerRole, "body">,
  texture: number,
  intensity: number,
): number {
  if (!SUPPORTED_ROLES[cue].includes(role)) return 0;
  const t = clamp(Number.isFinite(texture) ? texture : 0, 0, 1);
  const i = clamp(Number.isFinite(intensity) ? intensity : 0.5, 0, 1);
  if (t + Number.EPSILON < roleMinimumTexture(cue, role)) return 0;
  const fast = highCadence(i);

  switch (cue) {
    case "passage":
      if (role === "air") {
        return clamp((t - 0.08) / 0.72, 0, 1) * (1 - fast * 0.2);
      }
      if (role === "contact") {
        return clamp((t - 0.34) / 0.72 + (i - 0.58) * 0.18, 0, 0.82)
          * (1 - fast * 0.68);
      }
      return clamp((t - 0.68) / 0.74 + (i - 0.72) * 0.12, 0, 0.38)
        * (1 - fast * 0.9);
    case "grab":
      if (role === "air") return clamp((t - 0.2) / 0.86, 0, 0.72);
      return clamp((t - 0.56) / 0.76 + (i - 0.7) * 0.18, 0, 0.4);
    case "release":
      if (role === "air") return clamp((t - 0.18) / 0.84, 0, 0.78);
      if (role === "contact") return clamp((t - 0.44) / 0.74, 0, 0.58);
      return clamp((t - 0.5) / 0.82 + (i - 0.58) * 0.22, 0, 0.5);
    case "success":
      if (role === "contact") return clamp((t - 0.32) / 0.82, 0, 0.62);
      return clamp((t - 0.54) / 0.88, 0, 0.42);
    case "failure":
      if (role === "contact") return clamp((t - 0.24) / 0.78, 0, 0.72);
      return clamp((t - 0.4) / 0.82 + (i - 0.54) * 0.2, 0, 0.58);
    case "settle":
    case "control":
    default:
      return 0;
  }
}

function deterministicUnit(
  palette: SonicPalette,
  role: Exclude<SonicLayerRole, "body">,
  seed: number,
  sequence: number,
  salt: number,
): number {
  return hashUnit(
    (Number.isFinite(seed) ? Math.trunc(seed) : 0)
    ^ textSeed(`${palette}:${role}`)
    ^ Math.imul(normalizeSequence(sequence), 0x165667b1)
    ^ ROLE_SALT[role]
    ^ salt,
  );
}

function signedLayerVariation(
  palette: SonicPalette,
  role: Exclude<SonicLayerRole, "body">,
  seed: number,
  sequence: number,
): number {
  return (
    deterministicUnit(palette, role, seed, sequence, 0x4431) * 2 - 1
  ) * 0.18;
}

function includeLayer(
  input: SonicGesturePlanInput,
  role: Exclude<SonicLayerRole, "body">,
): boolean {
  if (!SUPPORTED_ROLES[input.cue].includes(role)) return false;
  if (input.force) return true;
  const threshold = roleThreshold(
    input.cue,
    role,
    input.texture,
    input.intensity,
  );
  return threshold > 0
    && inclusionGate(input.seed, input.sequence, ROLE_SALT[role]) < threshold;
}

function layerPan(
  palette: SonicPalette,
  basePan: number,
  spatial: boolean,
  role: Exclude<SonicLayerRole, "body">,
  seed: number,
  sequence: number,
): number {
  if (!spatial) return 0;
  const shape = PALETTE_SHAPE[palette];
  const jitter = (
    deterministicUnit(palette, role, seed, sequence, 0x9e37) * 2 - 1
  ) * 0.025;
  switch (role) {
    case "air": return clamp(basePan * shape.airPan + jitter, -0.82, 0.82);
    case "contact": return clamp(basePan * shape.contactPan + jitter * 0.45, -0.82, 0.82);
    case "landing": return clamp(basePan * shape.landingPan + jitter * 0.25, -0.82, 0.82);
  }
}

function bodyRateScale(
  cue: SonicSemanticCue,
  intensity: number,
): number {
  const normalizedIntensity = clamp(intensity, 0, 1);
  if (cue === "passage") return 0.94 + normalizedIntensity * 0.1;
  if (cue === "grab" || cue === "release") {
    return 0.97 + normalizedIntensity * 0.06;
  }
  return 1;
}

function layerGain(
  palette: SonicPalette,
  cue: SonicSemanticCue,
  role: Exclude<SonicLayerRole, "body">,
  baseGain: number,
  intensity: number,
): number {
  const normalizedIntensity = clamp(intensity, 0, 1);
  const shape = PALETTE_SHAPE[palette];
  const fast = cue === "passage" ? highCadence(normalizedIntensity) : 0;
  switch (role) {
    case "air":
      return baseGain * (
        cue === "passage"
          ? 0.13 + normalizedIntensity * 0.06
          : 0.105 + normalizedIntensity * 0.055
      ) * shape.airGain * (1 - fast * 0.12);
    case "contact":
      return baseGain * (0.08 + normalizedIntensity * 0.055)
        * shape.contactGain * (1 - fast * 0.62);
    case "landing":
      return baseGain * (
        cue === "failure"
          ? 0.1 + normalizedIntensity * 0.035
          : 0.067 + normalizedIntensity * 0.04
      ) * shape.landingGain * (1 - fast * 0.8);
  }
}

function layerDelay(
  palette: SonicPalette,
  cue: SonicSemanticCue,
  role: Exclude<SonicLayerRole, "body">,
  seed: number,
  sequence: number,
): number {
  const shape = PALETTE_SHAPE[palette];
  const base = role === "air"
    ? (cue === "grab" ? 0.006 : 0.002) + shape.airDelay
    : role === "contact"
      ? 0.014 + shape.contactDelay
      : cue === "failure"
        ? 0.067 + shape.landingDelay
        : cue === "success"
          ? 0.052 + shape.landingDelay
          : cue === "release"
            ? 0.042 + shape.landingDelay
            : 0.058 + shape.landingDelay;
  const range = role === "air" ? 0.003 : role === "contact" ? 0.0025 : 0.005;
  const jitter = (
    deterministicUnit(palette, role, seed, sequence, 0x7f4a) * 2 - 1
  ) * range;
  return clamp(base + jitter, 0, 0.095);
}

function roleCue(role: Exclude<SonicLayerRole, "body">): SonicCue {
  if (role === "air") return "air";
  if (role === "contact") return "contact";
  return "settle";
}

function layerFilters(
  palette: SonicPalette,
  role: SonicLayerRole,
): readonly SonicFilterSpec[] {
  const shape = PALETTE_SHAPE[palette];
  if (role === "air") {
    return Object.freeze([
      Object.freeze({ type: "highpass" as const, frequency: shape.airHighpass, q: 0.55 }),
      Object.freeze({ type: "lowpass" as const, frequency: shape.airLowpass, q: 0.45 }),
    ]);
  }
  if (role === "contact") {
    return Object.freeze([
      Object.freeze({ type: "highpass" as const, frequency: shape.contactHighpass, q: 0.5 }),
      Object.freeze({ type: "lowpass" as const, frequency: shape.contactLowpass, q: 0.5 }),
    ]);
  }
  if (role === "landing") {
    return Object.freeze([
      Object.freeze({ type: "lowpass" as const, frequency: shape.landingLowpass, q: 0.5 }),
    ]);
  }
  return Object.freeze([]);
}

function layerEnvelope(
  palette: SonicPalette,
  cue: SonicSemanticCue,
  role: SonicLayerRole,
  intensity: number,
): Readonly<SonicEnvelopeSpec> {
  const paletteStretch = palette === "cinematic"
    ? 1.12
    : palette === "paper"
      ? 1.08
      : 1;
  const pace = cue === "passage"
    ? 1.16 - clamp(intensity, 0, 1) * 0.36
    : 1;
  if (role === "air") {
    return Object.freeze({
      attack: 0.018 * paletteStretch * pace,
      release: 0.06 * paletteStretch * pace,
    });
  }
  if (role === "contact") {
    return Object.freeze({ attack: 0.002, release: 0.018 });
  }
  if (role === "landing") {
    return Object.freeze({
      attack: 0.008 * paletteStretch,
      release: 0.075 * paletteStretch * pace,
    });
  }
  return Object.freeze({
    attack: cue === "passage" ? 0.007 * pace : 0.005,
    release: cue === "passage" ? 0.038 * pace : 0.03,
  });
}

/**
 * Complete local cue-family superset one gesture may need. Preview loads this
 * atomically so a material body never fires while its intended texture is
 * still missing.
 */
export function getSonicGestureDependencies(
  palette: SonicPalette,
  cue: SonicSemanticCue,
  texture: number,
  intensity: number,
  force = false,
): readonly SonicCue[] {
  void palette;
  const dependencies: SonicCue[] = [cue];
  for (const role of SUPPORTED_ROLES[cue]) {
    if (force || roleThreshold(cue, role, texture, intensity) > 0) {
      dependencies.push(roleCue(role));
    }
  }
  return Object.freeze([...new Set(dependencies)]);
}

/**
 * Creates a restrained editorial gesture from untouched real recordings.
 * Body carries identity; air describes motion; contact punctuates the edit;
 * a selective landing gives energetic gestures physical consequence. Texture
 * only adds detail: it never rewrites the primary take, time, pitch or pan.
 */
export function buildSonicGestureLayers(
  input: SonicGesturePlanInput,
): readonly SonicVoiceLayer[] {
  const baseGain = clamp(
    Number.isFinite(input.baseGain) ? input.baseGain : 0,
    0,
    1,
  );
  const basePlaybackRate = clamp(
    Number.isFinite(input.basePlaybackRate) ? input.basePlaybackRate : 1,
    0.72,
    1.28,
  );
  const basePan = input.spatial
    ? clamp(Number.isFinite(input.basePan) ? input.basePan : 0, -0.82, 0.82)
    : 0;
  const sequence = normalizeSequence(input.sequence);
  const intensity = clamp(
    Number.isFinite(input.intensity) ? input.intensity : 0.5,
    0,
    1,
  );
  const bodyPlaybackRate = clamp(
    basePlaybackRate * bodyRateScale(input.cue, intensity),
    0.72,
    1.28,
  );
  const body: SonicVoiceLayer = Object.freeze({
    cue: input.cue,
    role: "body",
    delay: 0,
    gain: baseGain,
    playbackRate: bodyPlaybackRate,
    pan: basePan,
    variant: Math.max(0, Math.trunc(input.baseVariant)),
    filters: layerFilters(input.palette, "body"),
    envelope: layerEnvelope(input.palette, input.cue, "body", intensity),
  });
  const layers: SonicVoiceLayer[] = [body];
  const secondary: SonicVoiceLayer[] = [];
  const usedSourceNames = new Set<string>([
    getSonicAssetSpec(input.palette, input.cue, body.variant).name,
  ]);

  for (const role of SUPPORTED_ROLES[input.cue]) {
    if (!includeLayer(input, role)) continue;
    const cue = roleCue(role);
    const signedVariation = signedLayerVariation(
      input.palette,
      role,
      input.seed,
      sequence,
    );
    let playbackRate = basePlaybackRate;
    if (role === "air") {
      playbackRate = clamp(
        bodyPlaybackRate * PALETTE_SHAPE[input.palette].airRate
          * (1.025 + signedVariation * 0.02),
        0.8,
        1.26,
      );
    } else if (role === "contact") {
      playbackRate = clamp(
        PALETTE_SHAPE[input.palette].contactRate
          * (1 + signedVariation * 0.035),
        0.82,
        1.18,
      );
    } else {
      playbackRate = clamp(
        bodyPlaybackRate * PALETTE_SHAPE[input.palette].landingRate
          * (0.96 + signedVariation * 0.02),
        0.78,
        1.16,
      );
    }
    const variant = getDistinctSonicVariant(
      input.palette,
      cue,
      input.seed,
      sequence,
      ROLE_SALT[role],
      usedSourceNames,
    );
    usedSourceNames.add(getSonicAssetSpec(input.palette, cue, variant).name);
    secondary.push(Object.freeze({
      cue,
      role,
      delay: layerDelay(input.palette, input.cue, role, input.seed, sequence),
      gain: layerGain(input.palette, input.cue, role, baseGain, intensity),
      playbackRate,
      pan: layerPan(
        input.palette,
        basePan,
        input.spatial,
        role,
        input.seed,
        sequence,
      ),
      variant,
      filters: layerFilters(input.palette, role),
      envelope: layerEnvelope(input.palette, input.cue, role, intensity),
    }));
  }

  // Texture should add grain and physical consequence, never double loudness.
  const fast = input.cue === "passage" ? highCadence(intensity) : 0;
  const secondaryLimit = baseGain * (
    input.cue === "passage" ? 0.3 * (1 - fast * 0.32) : 0.24
  );
  const secondaryTotal = secondary.reduce((sum, layer) => sum + layer.gain, 0);
  const secondaryScale = secondaryTotal > secondaryLimit && secondaryTotal > 0
    ? secondaryLimit / secondaryTotal
    : 1;
  for (const layer of secondary) {
    layers.push(Object.freeze({ ...layer, gain: layer.gain * secondaryScale }));
  }

  return Object.freeze(layers);
}
