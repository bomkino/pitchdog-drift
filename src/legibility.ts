import type { StudioSettings } from "./model";

export type LegibilityPressure = "clear" | "watch" | "intense";

export interface LegibilityFactor {
  id: string;
  label: string;
  pressure: number;
}

export interface LegibilityAssessment {
  status: LegibilityPressure;
  score: number;
  factors: LegibilityFactor[];
  detail: string;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function assessLegibility(settings: StudioSettings): LegibilityAssessment {
  const moving = !settings.motion.reducedMotionOutput;
  const optics = settings.optics.enabled ? settings.optics : null;
  const smallFramePressure = clamp((0.62 - settings.slide.scale) / 0.38);
  const factors: LegibilityFactor[] = [
    { id: "speed", label: "track velocity", pressure: moving ? clamp(settings.motion.speed / 1.5) * 0.22 : 0 },
    { id: "motion-blur", label: "motion smear", pressure: moving && optics ? optics.motionBlur * 0.18 : 0 },
    { id: "chromatic", label: "colour separation", pressure: optics ? optics.chromaticAberration * 0.12 : 0 },
    { id: "soft-focus", label: "soft focus", pressure: optics ? optics.softFocus * 0.1 : 0 },
    { id: "edge-softness", label: "edge defocus", pressure: optics ? optics.edgeSoftness * 0.08 : 0 },
    { id: "bend", label: "moving-frame bend", pressure: moving ? settings.motion.distortion * 0.14 : 0 },
    { id: "frame-size", label: "small slide frame", pressure: smallFramePressure * 0.1 },
    { id: "barrel", label: "lens curvature", pressure: optics ? Math.abs(optics.barrelDistortion) * 0.04 : 0 },
    { id: "grain", label: "surface grain", pressure: optics ? clamp(optics.grain / 0.5) * 0.02 : 0 },
  ].filter((factor) => factor.pressure > 0.005)
    .sort((a, b) => b.pressure - a.pressure);

  const score = clamp(factors.reduce((total, factor) => total + factor.pressure, 0));
  const status: LegibilityPressure = score >= 0.48 ? "intense" : score >= 0.3 ? "watch" : "clear";
  const leading = factors.slice(0, 3).map((factor) => factor.label).join(", ");
  const detail = status === "clear"
    ? "Motion and optics are inside a restrained readability envelope. Inspect the smallest slide text before publishing."
    : status === "watch"
      ? `Readability pressure is accumulating around ${leading || "the current direction"}. Review the centre and both loop edges at full frame.`
      : `The cut is visually aggressive around ${leading || "the current direction"}. Lower speed, smear, defocus, or frame reduction unless losing legibility is intentional.`;

  return { status, score, factors, detail };
}
