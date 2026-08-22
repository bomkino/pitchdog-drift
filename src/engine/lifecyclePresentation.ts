import type {
  LifecycleLayerSample,
  TransitionTreatment,
} from "../core/timeline/performanceLifecycle";

export interface LifecycleLayerPresentation {
  readonly opacity: number;
  readonly translateY: number;
  readonly scale: number;
}

/**
 * Converts semantic lifecycle state into a restrained compositor transform.
 * `motionProgress` always means proximity to the resting pose: entry moves
 * 0→1 and exit moves 1→0. Reduced motion arrives pinned at 1.
 */
export function resolveLifecycleLayerPresentation(
  layer: LifecycleLayerSample,
  treatment: TransitionTreatment | null,
  travelPx: number,
): LifecycleLayerPresentation {
  const opacity = Math.min(1, Math.max(0, layer.visibility));
  const rest = Math.min(1, Math.max(0, layer.motionProgress));
  const boundedTravel = Number.isFinite(travelPx) ? Math.max(0, travelPx) : 0;

  switch (treatment) {
    case "lift":
      return { opacity, translateY: (1 - rest) * boundedTravel, scale: 0.985 + rest * 0.015 };
    case "projector":
      return { opacity, translateY: 0, scale: 0.965 + rest * 0.035 };
    case "contact-cut":
      return { opacity, translateY: 0, scale: 0.992 + rest * 0.008 };
    case "fade":
    default:
      return { opacity, translateY: 0, scale: 1 };
  }
}
