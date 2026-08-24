import type { DeliveryReceipt } from "../timeline/deliveryReceipt";

const SUPPORTED_OUTPUT_FPS = [24, 25, 30, 50, 60] as const;
const QUANTIZATION_EPSILON_SECONDS = 1e-9;

function holdPattern(cadence: DeliveryReceipt["cadence"]): string {
  return cadence.frameHolds.length > 0 ? `${cadence.frameHolds.join("/")}-frame holds` : "frame holds";
}

function naturalList(values: readonly number[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return String(values[0]);
  return `${values.slice(0, -1).join(", ")} or ${values.at(-1)}`;
}

/** Short, neutral delivery-receipt language. Endpoint rounding is not cadence failure. */
export function describeDeliveryCadence(
  cadence: DeliveryReceipt["cadence"],
  outputFps: number,
): string {
  if (cadence.compatibility === "continuous") return `Continuous motion · ${outputFps} fps output`;
  const poseLabel = cadence.poseFps === null ? "Authored poses" : `${cadence.poseFps} fps poses`;
  if (cadence.compatibility === "exact-holds") {
    const holds = cadence.frameHolds.length > 0 ? `${cadence.frameHolds.join("/")}-frame holds` : "frame holds";
    return `${poseLabel} · even ${holds}`;
  }
  return `${poseLabel} · uneven ${holdPattern(cadence)}`;
}

/**
 * Describes requested sound without pretending the presenter's source track
 * has already been decoded. Presenter audio is proven during export; tactile
 * accents are known in advance because their event plan is deterministic.
 */
export function describeDeliverySound(
  presenter: DeliveryReceipt["presenter"],
  sound: DeliveryReceipt["sound"],
): string {
  const accentCount = sound.exportEnabled ? sound.deterministicEventCount : 0;
  const accentLabel = `${accentCount} tactile accent${accentCount === 1 ? "" : "s"}`;
  if (presenter.audioEnabled && accentCount > 0) {
    return `Presenter + ${accentLabel} · source checked at export`;
  }
  if (presenter.audioEnabled) return "Presenter on · source checked at export";
  if (accentCount > 0) return accentLabel;
  return "Off";
}

/** A warning exists only when authored poses receive visibly uneven output holds. */
export function describeUnevenPoseHolds(
  cadence: DeliveryReceipt["cadence"],
  outputFps: number,
): string | null {
  if (cadence.compatibility !== "mixed-holds") return null;
  const poseLabel = cadence.poseFps === null ? "Authored pose timing" : `${cadence.poseFps} fps pose timing`;
  const holds = holdPattern(cadence);
  const poseFps = cadence.poseFps;
  const exactOutputRates = poseFps === null
    ? []
    : SUPPORTED_OUTPUT_FPS.filter((fps) => fps % poseFps === 0);
  const nextAction = exactOutputRates.length > 0
    ? `Choose ${naturalList(exactOutputRates)} fps for even holds, or choose Continuous motion.`
    : `Choose an output frame rate divisible by ${cadence.poseFps ?? "the pose rate"}, or choose Continuous motion.`;
  return `${poseLabel} inside ${outputFps} fps output uses uneven ${holds}. Some poses stay on screen longer than others, so motion may look slightly uneven. ${nextAction}`;
}

/** Plain information about the encoded endpoint; authored motion remains untouched. */
export function describeDurationRounding(
  output: DeliveryReceipt["output"],
): string | null {
  const delta = output.durationQuantizationDeltaSeconds;
  if (!Number.isSafeInteger(output.frameCount)
    || output.frameCount < 1
    || !Number.isFinite(output.encodedDurationSeconds)
    || !Number.isFinite(delta)
    || Math.abs(delta) <= QUANTIZATION_EPSILON_SECONDS) return null;
  const signedDelta = `${delta >= 0 ? "+" : ""}${delta.toFixed(3)} s`;
  const direction = delta >= 0 ? "longer" : "shorter";
  return `${output.frameCount} frames · ${output.encodedDurationSeconds.toFixed(3)} s · ${signedDelta}. The file is ${Math.abs(delta).toFixed(3)} s ${direction} than the authored duration; motion timing is unchanged.`;
}
