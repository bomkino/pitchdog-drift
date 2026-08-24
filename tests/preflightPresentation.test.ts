import { describe, expect, it } from "vitest";
import type { DeliveryReceipt } from "../src/core/timeline/deliveryReceipt";
import {
  describeDeliveryCadence,
  describeDurationRounding,
  describeUnevenPoseHolds,
} from "../src/core/preflight/presentation";

const CONTINUOUS: DeliveryReceipt["cadence"] = {
  authored: "continuous",
  poseFps: null,
  compatibility: "continuous",
  frameHolds: [],
  endpointMismatch: true,
};

const TWELVE_IN_TWENTY_FIVE: DeliveryReceipt["cadence"] = {
  authored: "12fps",
  poseFps: 12,
  compatibility: "mixed-holds",
  frameHolds: [2, 3],
  endpointMismatch: true,
};

const TWELVE_IN_TWENTY_FOUR: DeliveryReceipt["cadence"] = {
  authored: "12fps",
  poseFps: 12,
  compatibility: "exact-holds",
  frameHolds: [2],
  endpointMismatch: true,
};

function output(overrides: Partial<DeliveryReceipt["output"]> = {}): DeliveryReceipt["output"] {
  return {
    width: 1080,
    height: 1920,
    aspectRatio: 9 / 16,
    aspectLabel: "9:16",
    fps: 25,
    frameCount: 251,
    encodedDurationSeconds: 10.04,
    durationQuantizationDeltaSeconds: 0.01,
    container: "mp4",
    ...overrides,
  };
}

describe("preflight presentation language", () => {
  it("states harmless frame rounding as exact plain information", () => {
    expect(describeDurationRounding(output())).toBe(
      "251 frames · 10.040 s · +0.010 s. The file is 0.010 s longer than the authored duration; motion timing is unchanged.",
    );
  });

  it("describes a shorter endpoint honestly and omits exact endpoints", () => {
    expect(describeDurationRounding(output({
      frameCount: 249,
      encodedDurationSeconds: 9.96,
      durationQuantizationDeltaSeconds: -0.04,
    }))).toContain("-0.040 s. The file is 0.040 s shorter");
    expect(describeDurationRounding(output({
      frameCount: 250,
      encodedDurationSeconds: 10,
      durationQuantizationDeltaSeconds: 0,
    }))).toBeNull();
  });

  it("warns on 12 fps poses inside 25 fps and gives a direct remedy", () => {
    expect(describeUnevenPoseHolds(TWELVE_IN_TWENTY_FIVE, 25)).toBe(
      "12 fps pose timing inside 25 fps output uses uneven 2/3-frame holds. Some poses stay on screen longer than others, so motion may look slightly uneven. Choose 24 or 60 fps for even holds, or choose Continuous motion.",
    );
    expect(describeDeliveryCadence(TWELVE_IN_TWENTY_FIVE, 25))
      .toBe("12 fps poses · uneven 2/3-frame holds");
  });

  it("keeps 12 fps poses inside 24 fps plainly green", () => {
    expect(describeUnevenPoseHolds(TWELVE_IN_TWENTY_FOUR, 24)).toBeNull();
    expect(describeDeliveryCadence(TWELVE_IN_TWENTY_FOUR, 24))
      .toBe("12 fps poses · even 2-frame holds");
  });

  it("never turns continuous endpoint rounding into a cadence warning", () => {
    expect(describeUnevenPoseHolds(CONTINUOUS, 25)).toBeNull();
    expect(describeDeliveryCadence(CONTINUOUS, 25)).toBe("Continuous motion · 25 fps output");
  });

  it("fails malformed rounding facts closed instead of showing NaN", () => {
    expect(describeDurationRounding(output({ frameCount: 0 }))).toBeNull();
    expect(describeDurationRounding(output({ encodedDurationSeconds: Number.NaN }))).toBeNull();
  });
});
