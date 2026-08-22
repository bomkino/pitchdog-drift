import type { Axis } from "../../model";
import type { StageSize } from "./layout";

export interface PinLaneCompositionInput {
  readonly enabled: boolean;
  readonly safeOverlay: boolean;
  readonly stage: StageSize;
  readonly axis: Axis;
  readonly pinX: number;
  readonly pinY: number;
  readonly pinWidth: number;
}

export interface PinLaneComposition {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

const NEUTRAL: PinLaneComposition = Object.freeze({ scale: 1, offsetX: 0, offsetY: 0 });

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

/**
 * Gives a protected pin an intentional cross-axis lane. The carousel yields
 * without changing its timing, deck order, or authored world path.
 */
export function resolvePinLaneComposition(input: PinLaneCompositionInput): PinLaneComposition {
  if (!input.enabled || !input.safeOverlay) return NEUTRAL;
  const portraitStage = input.stage.height / Math.max(1, input.stage.width) >= 1.2;
  const width = clamp(input.pinWidth, 0.14, 0.82);
  const scale = 1 - clamp(
    width * (portraitStage ? 0.66 : 0.35),
    portraitStage ? 0.1 : 0.055,
    portraitStage ? 0.32 : 0.15,
  );

  if (input.axis === "vertical") {
    const direction = clamp(input.pinX, 0, 1) >= 0.5 ? -1 : 1;
    const distance = input.stage.width * clamp(
      width * (portraitStage ? 0.48 : 0.28),
      portraitStage ? 0.09 : 0.045,
      portraitStage ? 0.21 : 0.1,
    );
    return Object.freeze({ scale, offsetX: direction * distance, offsetY: 0 });
  }

  const pinBelowCentre = clamp(input.pinY, 0, 1) >= 0.5;
  const distance = input.stage.height * clamp(
    width * (portraitStage ? 0.25 : 0.18),
    portraitStage ? 0.065 : 0.035,
    portraitStage ? 0.13 : 0.065,
  );
  return Object.freeze({ scale, offsetX: 0, offsetY: (pinBelowCentre ? 1 : -1) * distance });
}
