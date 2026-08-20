import {
  ENGINE_VERSION,
  SCHEMA_VERSION,
  SHADER_VERSION,
  MAX_SLIDE_THICKNESS,
  type StudioSettings,
  DEFAULT_SETTINGS,
  type Flow,
  type DynamicsMode,
  type SurfaceMode,
} from "../model";


function legacyExtension<T>(value: unknown, fallback: T): unknown | T {
  return value === undefined ? fallback : value;
}

export const STUDIO_SETTINGS_LIMITS = Object.freeze({
  stageDimension: Object.freeze({ min: 256, max: 8_192 }),
  aspectComponent: Object.freeze({ min: 1, max: 64 }),
  outputDurationSeconds: Object.freeze({ min: 3, max: 30 }),
  videoBitrate: 16_000_000,
  audioBitrate: 192_000,
  presenterGain: 1,
  presenterTrimStart: 0,
  presenterStartAt: 0,
  presenterAssetIdLength: 512,
} as const);

export class SettingsValidationError extends Error {
  readonly code = "INVALID_STUDIO_SETTINGS" as const;
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`${path}: ${reason}`);
    this.name = "SettingsValidationError";
    this.path = path;
  }
}

type RecordValue = Record<string, unknown>;

function invalid(path: string, reason: string): never {
  throw new SettingsValidationError(path, reason);
}

function record(value: unknown, path: string): RecordValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid(path, "must be an object");
  }
  return value as RecordValue;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") return invalid(path, "must be a boolean");
  return value;
}

interface NumberRule {
  min: number;
  max: number;
  integer?: boolean;
  even?: boolean;
}

function number(value: unknown, path: string, rule: NumberRule): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return invalid(path, "must be a finite number");
  }
  if (rule.integer && !Number.isSafeInteger(value)) {
    return invalid(path, "must be a safe integer");
  }
  if (value < rule.min || value > rule.max) {
    return invalid(path, `must be between ${rule.min} and ${rule.max}`);
  }
  if (rule.even && value % 2 !== 0) {
    return invalid(path, "must be an even integer");
  }
  return value;
}

function literal<T extends string | number>(value: unknown, path: string, expected: T): T {
  if (value !== expected) return invalid(path, `must equal ${String(expected)}`);
  return expected;
}

function oneOf<const T extends readonly (string | number)[]>(
  value: unknown,
  path: string,
  choices: T,
): T[number] {
  if (!choices.some((choice) => choice === value)) {
    return invalid(path, `must be one of ${choices.join(", ")}`);
  }
  return value as T[number];
}

function hexColour(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
    return invalid(path, "must be a six-digit hexadecimal colour");
  }
  return value;
}

function assetId(value: unknown, path: string): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > STUDIO_SETTINGS_LIMITS.presenterAssetIdLength
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return invalid(path, "must be null or a non-empty asset id without control characters");
  }
  return value;
}

const AXES = ["horizontal", "vertical"] as const;
const DIRECTIONS = [-1, 1] as const;
const FLOWS: readonly Flow[] = [
  "straight",
  "arc",
  "ribbon",
  "cylinder",
  "tunnel",
  "helix",
  "orbit",
  "cascade",
  "lemniscate",
  "switchback",
];
const DYNAMICS: readonly DynamicsMode[] = ["direct", "weighted", "spring", "drift"];
const SURFACES: readonly SurfaceMode[] = ["card", "paper", "silk", "gel"];
const IMAGE_FITS = ["cover", "contain"] as const;
const BACKGROUNDS = ["transparent", "solid", "gradient", "aura", "paper", "void"] as const;
const THEMES = [
  "editorial-drift",
  "road-memory",
  "dread",
  "noir-contact",
  "tender-light",
  "chrome-dream",
] as const;
const OUTPUT_FPS = [24, 25, 30, 50, 60] as const;

/**
 * Validates the complete current settings schema and rebuilds it field by
 * field. Unknown keys never cross the trust boundary; missing or malformed
 * known keys never receive a silent default.
 */
export function validateStudioSettings(value: unknown): StudioSettings {
  const source = record(value, "settings");
  literal(source.schemaVersion, "settings.schemaVersion", SCHEMA_VERSION);
  literal(source.engineVersion, "settings.engineVersion", ENGINE_VERSION);
  literal(source.shaderVersion, "settings.shaderVersion", SHADER_VERSION);

  const stage = record(source.stage, "settings.stage");
  const motion = record(source.motion, "settings.motion");
  const slide = record(source.slide, "settings.slide");
  const background = record(source.background, "settings.background");
  const presenter = record(source.presenter, "settings.presenter");
  const output = record(source.output, "settings.output");

  const stageWidth = number(stage.width, "settings.stage.width", {
    ...STUDIO_SETTINGS_LIMITS.stageDimension,
    integer: true,
    even: true,
  });
  const stageHeight = number(stage.height, "settings.stage.height", {
    ...STUDIO_SETTINGS_LIMITS.stageDimension,
    integer: true,
    even: true,
  });
  const outputWidth = number(output.width, "settings.output.width", {
    ...STUDIO_SETTINGS_LIMITS.stageDimension,
    integer: true,
    even: true,
  });
  const outputHeight = number(output.height, "settings.output.height", {
    ...STUDIO_SETTINGS_LIMITS.stageDimension,
    integer: true,
    even: true,
  });
  if (outputWidth !== stageWidth || outputHeight !== stageHeight) {
    invalid("settings.output", "dimensions must match the stage dimensions");
  }
  const stageTransparent = boolean(stage.transparent, "settings.stage.transparent");
  const backgroundStyle = oneOf(background.style, "settings.background.style", BACKGROUNDS);
  if (stageTransparent !== (backgroundStyle === "transparent")) {
    invalid("settings.stage.transparent", "must agree with the selected background style");
  }
  const presenterEnabled = boolean(presenter.enabled, "settings.presenter.enabled");
  const presenterAssetId = assetId(presenter.assetId, "settings.presenter.assetId");
  if (presenterEnabled !== (presenterAssetId !== null)) {
    invalid("settings.presenter.enabled", "must agree with whether pinned media is selected");
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    shaderVersion: SHADER_VERSION,
    themeId: oneOf(source.themeId, "settings.themeId", THEMES),
    stage: {
      width: stageWidth,
      height: stageHeight,
      transparent: stageTransparent,
    },
    motion: {
      axis: oneOf(motion.axis, "settings.motion.axis", AXES),
      direction: oneOf(motion.direction, "settings.motion.direction", DIRECTIONS),
      autoplay: boolean(motion.autoplay, "settings.motion.autoplay"),
      speed: number(motion.speed, "settings.motion.speed", { min: 0, max: 1.5 }),
      flow: oneOf(motion.flow, "settings.motion.flow", FLOWS),
      dynamics: oneOf(legacyExtension(motion.dynamics, DEFAULT_SETTINGS.motion.dynamics), "settings.motion.dynamics", DYNAMICS),
      gap: number(motion.gap, "settings.motion.gap", { min: 0, max: 1.2 }),
      curvature: number(motion.curvature, "settings.motion.curvature", { min: 0, max: 1 }),
      depth: number(motion.depth, "settings.motion.depth", { min: 0, max: 0.8 }),
      tilt: number(motion.tilt, "settings.motion.tilt", { min: 0, max: 18 }),
      bank: number(legacyExtension(motion.bank, DEFAULT_SETTINGS.motion.bank), "settings.motion.bank", { min: 0, max: 1 }),
      distortion: number(motion.distortion, "settings.motion.distortion", { min: 0, max: 1 }),
      focusScale: number(motion.focusScale, "settings.motion.focusScale", { min: 0, max: 0.24 }),
      edgeFade: number(motion.edgeFade, "settings.motion.edgeFade", { min: 0, max: 1 }),
      dragSensitivity: number(motion.dragSensitivity, "settings.motion.dragSensitivity", { min: 0, max: 4 }),
      seamless: boolean(motion.seamless, "settings.motion.seamless"),
      seamlessLoops: number(motion.seamlessLoops, "settings.motion.seamlessLoops", {
        min: 1,
        max: 6,
        integer: true,
      }),
      reducedMotionOutput: boolean(motion.reducedMotionOutput, "settings.motion.reducedMotionOutput"),
    },
    slide: {
      aspectWidth: number(slide.aspectWidth, "settings.slide.aspectWidth", STUDIO_SETTINGS_LIMITS.aspectComponent),
      aspectHeight: number(slide.aspectHeight, "settings.slide.aspectHeight", STUDIO_SETTINGS_LIMITS.aspectComponent),
      scale: number(slide.scale, "settings.slide.scale", { min: 0.24, max: 1.1 }),
      fit: oneOf(slide.fit, "settings.slide.fit", IMAGE_FITS),
      focalX: number(slide.focalX, "settings.slide.focalX", { min: 0, max: 1 }),
      focalY: number(slide.focalY, "settings.slide.focalY", { min: 0, max: 1 }),
      radius: number(slide.radius, "settings.slide.radius", { min: 0, max: 180 }),
      smoothing: number(slide.smoothing, "settings.slide.smoothing", { min: 0, max: 1 }),
      surface: oneOf(legacyExtension(slide.surface, DEFAULT_SETTINGS.slide.surface), "settings.slide.surface", SURFACES),
      thickness: number(legacyExtension(slide.thickness, DEFAULT_SETTINGS.slide.thickness), "settings.slide.thickness", { min: 0, max: MAX_SLIDE_THICKNESS }),
      borderWidth: number(slide.borderWidth, "settings.slide.borderWidth", { min: 0, max: 16 }),
      borderColor: hexColour(slide.borderColor, "settings.slide.borderColor"),
      borderOpacity: number(slide.borderOpacity, "settings.slide.borderOpacity", { min: 0, max: 1 }),
      shadowOpacity: number(slide.shadowOpacity, "settings.slide.shadowOpacity", { min: 0, max: 0.8 }),
      shadowSoftness: number(slide.shadowSoftness, "settings.slide.shadowSoftness", { min: 4, max: 96 }),
    },
    background: {
      style: backgroundStyle,
      colorA: hexColour(background.colorA, "settings.background.colorA"),
      colorB: hexColour(background.colorB, "settings.background.colorB"),
      accent: hexColour(background.accent, "settings.background.accent"),
      intensity: number(background.intensity, "settings.background.intensity", { min: 0, max: 1 }),
      motion: number(background.motion, "settings.background.motion", { min: 0, max: 1 }),
      grain: number(background.grain, "settings.background.grain", { min: 0, max: 0.6 }),
      vignette: number(background.vignette, "settings.background.vignette", { min: 0, max: 1 }),
      seed: number(background.seed, "settings.background.seed", { min: 0, max: 1_000_000, integer: true }),
    },
    presenter: {
      enabled: presenterEnabled,
      assetId: presenterAssetId,
      x: number(presenter.x, "settings.presenter.x", { min: 0, max: 1 }),
      y: number(presenter.y, "settings.presenter.y", { min: 0, max: 1 }),
      width: number(presenter.width, "settings.presenter.width", { min: 0.14, max: 0.82 }),
      aspectWidth: number(presenter.aspectWidth, "settings.presenter.aspectWidth", STUDIO_SETTINGS_LIMITS.aspectComponent),
      aspectHeight: number(presenter.aspectHeight, "settings.presenter.aspectHeight", STUDIO_SETTINGS_LIMITS.aspectComponent),
      fit: oneOf(presenter.fit, "settings.presenter.fit", IMAGE_FITS),
      radius: number(presenter.radius, "settings.presenter.radius", { min: 0, max: 180 }),
      smoothing: number(presenter.smoothing, "settings.presenter.smoothing", { min: 0, max: 1 }),
      borderWidth: number(presenter.borderWidth, "settings.presenter.borderWidth", { min: 0, max: 16 }),
      borderColor: hexColour(presenter.borderColor, "settings.presenter.borderColor"),
      borderOpacity: number(presenter.borderOpacity, "settings.presenter.borderOpacity", { min: 0, max: 1 }),
      shadowOpacity: number(presenter.shadowOpacity, "settings.presenter.shadowOpacity", { min: 0, max: 0.8 }),
      muted: boolean(presenter.muted, "settings.presenter.muted"),
      gain: literal(presenter.gain, "settings.presenter.gain", STUDIO_SETTINGS_LIMITS.presenterGain),
      trimStart: literal(
        presenter.trimStart,
        "settings.presenter.trimStart",
        STUDIO_SETTINGS_LIMITS.presenterTrimStart,
      ),
      startAt: literal(
        presenter.startAt,
        "settings.presenter.startAt",
        STUDIO_SETTINGS_LIMITS.presenterStartAt,
      ),
    },
    output: {
      width: outputWidth,
      height: outputHeight,
      fps: oneOf(output.fps, "settings.output.fps", OUTPUT_FPS),
      duration: number(output.duration, "settings.output.duration", STUDIO_SETTINGS_LIMITS.outputDurationSeconds),
      videoBitrate: literal(
        output.videoBitrate,
        "settings.output.videoBitrate",
        STUDIO_SETTINGS_LIMITS.videoBitrate,
      ),
      audioBitrate: literal(
        output.audioBitrate,
        "settings.output.audioBitrate",
        STUDIO_SETTINGS_LIMITS.audioBitrate,
      ),
    },
  };
}
