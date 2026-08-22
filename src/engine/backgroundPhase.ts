export interface BackgroundPhaseOptions {
  readonly durationSeconds: number;
  readonly motion: number;
  readonly seamless: boolean;
  readonly seamlessLoops: number;
  readonly reducedMotion: boolean;
}

/**
 * Maps explicit performance time to the room's slow atmospheric phase.
 * Preview and export deliberately share this function; export mode is not an
 * input because a frame at the same master time must describe the same room.
 */
export function resolveBackgroundPhase(
  time: number,
  options: BackgroundPhaseOptions,
): number {
  if (options.reducedMotion) return 0;
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  if (options.seamless) {
    const duration = Math.max(0.001, options.durationSeconds);
    const loops = Math.max(1, Math.round(options.seamlessLoops));
    return safeTime / duration * Math.PI * 2 * loops;
  }
  return safeTime * Math.max(0, options.motion) * 0.72;
}
