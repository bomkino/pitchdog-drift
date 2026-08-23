import type {
  LayerTransitionTiming,
  SlideTransitionOrder,
  SlideTransitionTiming,
  TransitionAuthoring,
  TransitionCurveId,
  TransitionPreset,
  TransitionPresetId,
  TransitionTreatment,
} from "./performanceLifecycle";

function timing(lead: number, span: number): LayerTransitionTiming {
  return Object.freeze({ lead, span });
}

function slideTiming(
  lead: number,
  span: number,
  stagger: number,
  order: SlideTransitionOrder,
): SlideTransitionTiming {
  return Object.freeze({ lead, span, stagger, order });
}

function transition(
  durationSeconds: number,
  treatment: TransitionTreatment,
  curve: TransitionCurveId,
  background: LayerTransitionTiming,
  slides: SlideTransitionTiming,
): TransitionAuthoring {
  return Object.freeze({
    enabled: true as const,
    durationSeconds,
    treatment,
    curve,
    background,
    slides,
    includePresenter: false,
  });
}

function preset(
  id: TransitionPresetId,
  label: string,
  description: string,
  entry: TransitionAuthoring,
  exit: TransitionAuthoring,
): TransitionPreset {
  return Object.freeze({ id, label, description, entry, exit });
}

export const TRANSITION_PRESETS: Readonly<Record<TransitionPresetId, TransitionPreset>> = Object.freeze({
  "quiet-lift": preset(
    "quiet-lift",
    "Quiet Lift",
    "Background breathes in first; slides rise with a restrained editorial stagger.",
    transition(
      0.72,
      "lift",
      "ease-out",
      timing(0, 0.72),
      slideTiming(0.12, 0.62, 0.18, "forward"),
    ),
    transition(
      0.56,
      "lift",
      "ease-in-out",
      timing(0.18, 0.82),
      slideTiming(0, 0.64, 0.18, "reverse"),
    ),
  ),
  "projector-open": preset(
    "projector-open",
    "Projector Open",
    "A field of light opens before the carousel resolves into it.",
    transition(
      0.92,
      "projector",
      "ease-out",
      timing(0, 0.62),
      slideTiming(0.24, 0.58, 0.18, "forward"),
    ),
    transition(
      0.68,
      "projector",
      "ease-in-out",
      timing(0.28, 0.72),
      slideTiming(0, 0.58, 0.24, "reverse"),
    ),
  ),
  "contact-cut": preset(
    "contact-cut",
    "Contact Cut",
    "A short, tactile exposure rather than a decorative flourish.",
    transition(
      0.28,
      "contact-cut",
      "ease-out",
      timing(0, 0.58),
      slideTiming(0.18, 0.62, 0.12, "forward"),
    ),
    transition(
      0.24,
      "contact-cut",
      "ease-out",
      timing(0.34, 0.66),
      slideTiming(0, 0.66, 0.16, "reverse"),
    ),
  ),
  "fade-through": preset(
    "fade-through",
    "Fade Through",
    "A quiet opacity-led bridge for copy-heavy slides and reduced motion.",
    transition(
      0.64,
      "fade",
      "ease-in-out",
      timing(0, 0.82),
      slideTiming(0.08, 0.76, 0.1, "forward"),
    ),
    transition(
      0.52,
      "fade",
      "ease-in-out",
      timing(0.12, 0.88),
      slideTiming(0, 0.78, 0.1, "reverse"),
    ),
  ),
});

export const TRANSITION_PRESET_ORDER: readonly TransitionPresetId[] = Object.freeze([
  "quiet-lift",
  "projector-open",
  "contact-cut",
  "fade-through",
]);
