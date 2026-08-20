import type { MotionSettings } from "./model";

export const LOOK_MOTION_KEYS = [
  "axis",
  "direction",
  "speed",
  "flow",
  "gap",
  "curvature",
  "depth",
  "tilt",
  "distortion",
  "focusScale",
  "edgeFade",
] as const satisfies readonly (keyof MotionSettings)[];

export const SESSION_MOTION_KEYS = [
  "autoplay",
  "dragSensitivity",
  "seamless",
  "seamlessLoops",
  "reducedMotionOutput",
] as const satisfies readonly (keyof MotionSettings)[];

export type MotionLook = Pick<MotionSettings, (typeof LOOK_MOTION_KEYS)[number]>;
export type MotionSession = Pick<MotionSettings, (typeof SESSION_MOTION_KEYS)[number]>;

export function captureMotionLook(motion: MotionSettings): MotionLook {
  return {
    axis: motion.axis,
    direction: motion.direction,
    speed: motion.speed,
    flow: motion.flow,
    gap: motion.gap,
    curvature: motion.curvature,
    depth: motion.depth,
    tilt: motion.tilt,
    distortion: motion.distortion,
    focusScale: motion.focusScale,
    edgeFade: motion.edgeFade,
  };
}

export function captureMotionSession(motion: MotionSettings): MotionSession {
  return {
    autoplay: motion.autoplay,
    dragSensitivity: motion.dragSensitivity,
    seamless: motion.seamless,
    seamlessLoops: motion.seamlessLoops,
    reducedMotionOutput: motion.reducedMotionOutput,
  };
}

export function applyMotionLook(current: MotionSettings, look: MotionLook): MotionSettings {
  return { ...current, ...structuredClone(look) };
}

export function applyMotionSession(current: MotionSettings, session: MotionSession): MotionSettings {
  return { ...current, ...structuredClone(session) };
}

export function motionLookEqual(a: MotionLook, b: MotionLook): boolean {
  return LOOK_MOTION_KEYS.every((key) => Object.is(a[key], b[key]));
}
