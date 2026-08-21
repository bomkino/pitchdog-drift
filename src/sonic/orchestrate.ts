import type { StudioSettings } from "../model";
import {
  buildSonicGestureLayers,
  type SonicEnvelopeSpec,
  type SonicFilterSpec,
  type SonicLayerRole,
} from "./grammar";
import type { SonicCue } from "./catalog";
import type { SonicTimelineEvent } from "./plan";

export interface SonicLayerTimelineEvent {
  cue: SonicCue;
  role: SonicLayerRole;
  /** Semantic passage or terminal settle sequence that owns this layer. */
  sequence: number;
  time: number;
  gain: number;
  playbackRate: number;
  pan: number;
  variant: number;
  filters: readonly SonicFilterSpec[];
  envelope: Readonly<SonicEnvelopeSpec>;
}

/**
 * Expands semantic picture events into restrained physical Foley. Preview and
 * export call the same pure grammar; this adapter only places layers on the
 * deterministic export clock.
 */
export function buildSonicLayerTimeline(
  settings: StudioSettings,
  semanticEvents: readonly SonicTimelineEvent[],
  duration = settings.output.duration,
): SonicLayerTimelineEvent[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const horizontal = settings.motion.axis === "horizontal";
  const layers: SonicLayerTimelineEvent[] = [];

  for (const event of semanticEvents) {
    const plan = buildSonicGestureLayers({
      cue: event.cue,
      palette: settings.sound.palette,
      texture: settings.sound.variation,
      seed: settings.background.seed,
      sequence: event.sequence,
      intensity: event.intensity,
      baseGain: event.gain,
      basePlaybackRate: event.playbackRate,
      basePan: event.pan,
      baseVariant: event.variant,
      spatial: event.cue === "passage" && horizontal,
    });
    const ceiling = event.cue === "passage" ? duration - 0.045 : duration;
    for (const layer of plan) {
      const time = event.time + layer.delay;
      if (time < 0 || time >= ceiling) continue;
      layers.push({
        cue: layer.cue,
        role: layer.role,
        sequence: event.sequence,
        time,
        gain: layer.gain,
        playbackRate: layer.playbackRate,
        pan: layer.pan,
        variant: layer.variant,
        filters: layer.filters,
        envelope: layer.envelope,
      });
    }
  }

  return layers.sort((left, right) => (
    left.time - right.time
    || left.sequence - right.sequence
    || left.role.localeCompare(right.role)
  ));
}
