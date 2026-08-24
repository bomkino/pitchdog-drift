import { describe, expect, it } from "vitest";
import type { SlideHealth } from "../src/core/media/slideHealth";
import { evaluateSlideGuideOverlap, getPlatformGuideProfile } from "../src/core/platformGuides";
import { evaluatePreflight, type PreflightInput } from "../src/core/preflight";
import type { DeliveryReceipt } from "../src/core/timeline/deliveryReceipt";
import type { ExportCapabilityReport } from "../src/lib/exportStudio";

const CAPABILITIES: ExportCapabilityReport = Object.freeze({
  mp4: Object.freeze({
    supported: true,
    avc: true,
    aac: true,
    presenterAudioFpsSupported: true,
    maximumPresenterAudioFps: 30,
    nativeAacMaximumDurationSeconds: null,
    reasons: Object.freeze([]),
  }),
  png: Object.freeze({ still: true, sequenceZip: true, sequenceDirectory: true }),
  presenter: Object.freeze({ videoDecoderApi: true, audioDecoderApi: true }),
  futureStreamTarget: true,
});

function receipt(
  overrides: {
    output?: Partial<DeliveryReceipt["output"]>;
    cadence?: Partial<DeliveryReceipt["cadence"]>;
    transparency?: Partial<DeliveryReceipt["transparency"]>;
    workload?: Partial<DeliveryReceipt["workload"]>;
    presenter?: Partial<DeliveryReceipt["presenter"]>;
  } = {},
): DeliveryReceipt {
  return {
    timing: {
      mode: "fixed-master",
      protectedInput: "master-duration",
      intentStatus: "stored",
      secondsPerSlide: 0.75,
    },
    media: {
      movingSlideCount: 1,
      movingMediaOrder: ["slide-a"],
      pinnedOnlyAssetExcluded: false,
      excludedPinnedOnlyAssetId: null,
    },
    passes: {
      deckPassesPerBody: 1,
      totalDeckPasses: 1,
      sceneRepeatMode: "off",
      sceneRepeatCount: 1,
      legacyBodyRepeatCount: 0,
      boundaries: [{
        index: 0,
        indexInBody: 0,
        bodyCycleIndex: 0,
        sceneIndex: 0,
        start: 0,
        end: 10,
        duration: 10,
      }],
    },
    segments: { entrySeconds: 0, bodySeconds: 10, exitSeconds: 0, masterSeconds: 10 },
    pace: {
      averageSlidesPerSecond: 0.1,
      minimumSlidesPerSecond: 0.1,
      peakSlidesPerSecond: 0.1,
      approximateAverageReadWindowSeconds: 10,
    },
    output: {
      width: 1080,
      height: 1920,
      aspectRatio: 9 / 16,
      aspectLabel: "9:16",
      fps: 24,
      frameCount: 240,
      encodedDurationSeconds: 10,
      durationQuantizationDeltaSeconds: 0,
      container: "mp4",
      ...overrides.output,
    },
    cadence: {
      authored: "continuous",
      poseFps: null,
      compatibility: "continuous",
      frameHolds: [],
      endpointMismatch: false,
      ...overrides.cadence,
    },
    seamlessClosure: { closes: true, status: "clean" },
    sound: { exportEnabled: false, masterAudioEnabled: false, deterministicEventCount: 0 },
    presenter: {
      enabled: false,
      audioEnabled: false,
      assetId: null,
      assetKind: null,
      trackMode: "moving-and-pinned",
      participatesInMovingTrack: false,
      participatesInEntry: false,
      participatesInExit: false,
      ...overrides.presenter,
    },
    transparency: {
      requested: false,
      containerSupportsTransparency: false,
      compatible: true,
      ...overrides.transparency,
    },
    workload: {
      pixelCount: 2_073_600,
      pixelFrames: 497_664_000,
      class: "light",
      ...overrides.workload,
    },
  };
}

function input(overrides: Partial<PreflightInput> = {}): PreflightInput {
  return {
    receipt: receipt(),
    slideHealth: [],
    capabilities: CAPABILITIES,
    exportSurface: { supported: true },
    ...overrides,
  };
}

function health(issues: SlideHealth["issues"]): SlideHealth {
  return {
    assetId: "slide-a",
    severity: issues.some(({ severity }) => severity === "blocker")
      ? "blocker"
      : issues.some(({ severity }) => severity === "warning")
        ? "warning"
        : issues.length > 0 ? "note" : "healthy",
    issues,
    requiredWidth: 1080,
    requiredHeight: 1920,
  };
}

describe("objective preflight", () => {
  it("returns one immutable clear report when every known fact holds", () => {
    const report = evaluatePreflight(input());
    expect(report).toEqual({ canExport: true, issues: [], blockers: [], warnings: [], notes: [] });
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.issues)).toBe(true);
  });

  it("blocks only missing, failed, unsupported, and invalid media facts", () => {
    const report = evaluatePreflight(input({
      slideHealth: [health([
        { id: "missing", severity: "blocker", message: "Manifest source missing." },
        { id: "invalid-dimensions", severity: "blocker", message: "Dimensions invalid." },
      ])],
      mediaFailures: [
        { assetId: "presenter", kind: "decode-failed" },
        { assetId: "audio-bed", kind: "unsupported-media" },
      ],
    }));

    expect(report.canExport).toBe(false);
    expect(report.blockers.map(({ id }) => id)).toEqual([
      "media-missing",
      "media-invalid-dimensions",
      "media-decode-failed",
      "media-unsupported",
    ]);
    expect(report.warnings).toEqual([]);
  });

  it("promotes metadata risks to warnings without inventing pixel taste claims", () => {
    const report = evaluatePreflight(input({
      slideHealth: [health([
        { id: "low-resolution", severity: "warning", message: "Projected upscale." },
        { id: "unusual-ratio", severity: "note", message: "Unusual ratio." },
        { id: "mixed-ratio", severity: "note", message: "Mixed deck ratio." },
        { id: "focal-edge", severity: "warning", message: "Focal point at crop edge." },
        { id: "pinned-only", severity: "note", message: "Excluded from timing." },
      ])],
    }));

    expect(report.canExport).toBe(true);
    expect(report.warnings.map(({ id }) => id)).toEqual([
      "low-resolution",
      "unusual-ratio",
      "mixed-ratio",
      "focal-edge",
    ]);
    expect(report.notes.map(({ id }) => id)).toEqual(["pinned-only"]);
    expect(report.issues.some(({ message }) => /ugly|readable|text-heavy/i.test(message))).toBe(false);
  });

  it("blocks malformed output and genuinely unsupported container or surface facts", () => {
    const unsupported: ExportCapabilityReport = {
      ...CAPABILITIES,
      mp4: { ...CAPABILITIES.mp4, supported: false, avc: false, reasons: ["No AVC encoder."] },
    };
    const report = evaluatePreflight(input({
      receipt: receipt({
        output: {
          width: 1079,
          height: 1920,
          fps: 0,
          frameCount: 0,
          encodedDurationSeconds: Number.NaN,
        },
      }),
      capabilities: unsupported,
      exportSurface: { supported: false, reason: "GPU surface limit exceeded." },
    }));

    expect(report.blockers.map(({ id }) => id)).toEqual([
      "output-invalid-fps",
      "output-invalid-duration",
      "output-invalid-frame-count",
      "output-container-unsupported",
      "output-surface-unsupported",
    ]);
    expect(report.blockers.find(({ id }) => id === "output-container-unsupported")?.message)
      .toMatch(/even pixel dimensions/);

    const outsideExportContract = evaluatePreflight(input({
      receipt: receipt({
        output: { width: 8_193, fps: 60.5 },
      }),
    }));
    expect(outsideExportContract.blockers.map(({ id }) => id)).toEqual([
      "output-invalid-dimensions",
      "output-invalid-fps",
    ]);
  });

  it("blocks only audio-bearing native masters above the real 35-second AAC ceiling", () => {
    const nativeCapabilities: ExportCapabilityReport = {
      ...CAPABILITIES,
      mp4: {
        ...CAPABILITIES.mp4,
        nativeAacMaximumDurationSeconds: 35,
      },
    };
    const tooLong = evaluatePreflight(input({
      capabilities: nativeCapabilities,
      receipt: receipt({
        output: { encodedDurationSeconds: 60, frameCount: 1_440 },
        presenter: { enabled: true, audioEnabled: true, assetKind: "video", assetId: "presenter" },
      }),
    }));
    expect(tooLong.blockers.map(({ id }) => id)).toContain("native-aac-duration-limit");

    const exactLimit = evaluatePreflight(input({
      capabilities: nativeCapabilities,
      receipt: receipt({
        output: { encodedDurationSeconds: 35, frameCount: 840 },
        presenter: { enabled: true, audioEnabled: true, assetKind: "video", assetId: "presenter" },
      }),
    }));
    expect(exactLimit.blockers.map(({ id }) => id)).not.toContain("native-aac-duration-limit");

    const muted = evaluatePreflight(input({
      capabilities: nativeCapabilities,
      receipt: receipt({
        output: { encodedDurationSeconds: 60, frameCount: 1_440 },
        presenter: { enabled: true, audioEnabled: false, assetKind: "video", assetId: "presenter" },
      }),
    }));
    expect(muted.blockers.map(({ id }) => id)).not.toContain("native-aac-duration-limit");
  });

  it("uses actual storage facts and the existing PNG ZIP memory estimator as blockers", () => {
    const report = evaluatePreflight(input({
      receipt: receipt({ output: { container: "png-sequence" } }),
      pngSequenceDestination: "zip",
      budget: {
        availableStorageBytes: 999,
        requiredStorageBytes: 1_000,
        pngZipMemoryLimitBytes: 64 * 1024 * 1024,
      },
    }));

    expect(report.blockers.map(({ id }) => id)).toEqual([
      "storage-insufficient",
      "png-zip-memory-insufficient",
    ]);
    expect(report.blockers[1]?.message).toMatch(/approximately \d+ bytes/);

    const directory = evaluatePreflight(input({
      receipt: receipt({ output: { container: "png-sequence" } }),
      pngSequenceDestination: "directory",
      budget: { pngZipMemoryLimitBytes: 1 },
    }));
    expect(directory.blockers).toEqual([]);
  });

  it("warns only on uneven pose holds and reports ordinary duration rounding as a note", () => {
    const overlap = evaluateSlideGuideOverlap(
      { left: 0.76, top: 0.3, right: 0.92, bottom: 0.6 },
      getPlatformGuideProfile("instagram-reel"),
    );
    const report = evaluatePreflight(input({
      receipt: receipt({
        output: {
          fps: 25,
          frameCount: 251,
          encodedDurationSeconds: 10.04,
          durationQuantizationDeltaSeconds: 0.01,
        },
        cadence: {
          authored: "12fps",
          poseFps: 12,
          compatibility: "mixed-holds",
          frameHolds: [2, 3],
          endpointMismatch: true,
        },
        transparency: { requested: true, compatible: false },
        workload: { class: "extreme", pixelFrames: 9_000_000_000 },
      }),
      guideOverlaps: [{ ...overlap, subjectId: "slide-a", guideId: "instagram-reel" }],
      physicalValidationLanes: [
        { id: "apple-silicon", label: "Apple Silicon", supported: true },
        { id: "intel", label: "Intel Mac", supported: false },
      ],
    }));

    expect(report.canExport).toBe(true);
    expect(report.warnings.map(({ id }) => id)).toEqual([
      "guide-overlap",
      "uneven-pose-holds",
      "alpha-container",
      "extreme-workload",
      "unsupported-physical-lane",
    ]);
    expect(report.warnings.find(({ id }) => id === "guide-overlap")?.message).toContain("62.5%");
    expect(report.warnings.find(({ id }) => id === "uneven-pose-holds")?.message)
      .toBe("12 fps pose timing inside 25 fps output uses uneven 2/3-frame holds. Some poses stay on screen longer than others, so motion may look slightly uneven. Choose 24 or 60 fps for even holds, or choose Continuous motion.");
    expect(report.notes).toEqual([expect.objectContaining({
      id: "duration-quantization",
      message: "251 frames · 10.040 s · +0.010 s. The file is 0.010 s longer than the authored duration; motion timing is unchanged.",
    })]);
  });

  it("keeps continuous and evenly divisible pose cadence green despite frame-duration rounding", () => {
    const continuous = evaluatePreflight(input({
      receipt: receipt({
        output: {
          fps: 25,
          frameCount: 251,
          encodedDurationSeconds: 10.04,
          durationQuantizationDeltaSeconds: 0.01,
        },
        cadence: { endpointMismatch: true },
      }),
    }));
    expect(continuous.warnings).toEqual([]);
    expect(continuous.notes.map(({ id }) => id)).toEqual(["duration-quantization"]);

    const exactHolds = evaluatePreflight(input({
      receipt: receipt({
        output: {
          fps: 24,
          frameCount: 241,
          encodedDurationSeconds: 241 / 24,
          durationQuantizationDeltaSeconds: 241 / 24 - 10,
        },
        cadence: {
          authored: "12fps",
          poseFps: 12,
          compatibility: "exact-holds",
          frameHolds: [2],
          endpointMismatch: true,
        },
      }),
    }));
    expect(exactHolds.warnings).toEqual([]);
    expect(exactHolds.notes.map(({ id }) => id)).toEqual(["duration-quantization"]);
  });

  it("fails loudly on malformed budget evidence instead of manufacturing a blocker", () => {
    expect(() => evaluatePreflight(input({
      budget: { availableStorageBytes: Number.NaN, requiredStorageBytes: 10 },
    }))).toThrow(/non-negative safe integer/);
  });
});
