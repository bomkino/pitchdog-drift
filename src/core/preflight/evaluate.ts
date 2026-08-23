import type { SlideHealthIssue } from "../media/slideHealth";
import {
  DEFAULT_EXPORT_SETTINGS,
  estimatePngZipMemoryBytes,
  validateExportSettings,
  type ExportSettings,
} from "../../lib/exportStudio";
import type {
  GuideOverlapFact,
  MediaFailureFact,
  PreflightInput,
  PreflightIssue,
  PreflightIssueId,
  PreflightReport,
  PreflightScope,
  PreflightSeverity,
} from "./types";

interface MutableIssue extends PreflightIssue {}

const SLIDE_ISSUE_MAP: Readonly<Record<SlideHealthIssue["id"], {
  readonly id: PreflightIssueId;
  readonly severity: PreflightSeverity;
  readonly scope: PreflightScope;
}>> = Object.freeze({
  missing: { id: "media-missing", severity: "blocker", scope: "media" },
  "invalid-dimensions": { id: "media-invalid-dimensions", severity: "blocker", scope: "media" },
  "low-resolution": { id: "low-resolution", severity: "warning", scope: "media" },
  "unusual-ratio": { id: "unusual-ratio", severity: "warning", scope: "media" },
  "mixed-ratio": { id: "mixed-ratio", severity: "warning", scope: "media" },
  "focal-edge": { id: "focal-edge", severity: "warning", scope: "media" },
  "pinned-only": { id: "pinned-only", severity: "note", scope: "media" },
});

const MEDIA_FAILURE_MAP: Readonly<Record<MediaFailureFact["kind"], {
  readonly id: PreflightIssueId;
  readonly fallback: string;
}>> = Object.freeze({
  missing: {
    id: "media-missing",
    fallback: "The project cannot find this required media source.",
  },
  "decode-failed": {
    id: "media-decode-failed",
    fallback: "The required media source did not decode.",
  },
  "unsupported-media": {
    id: "media-unsupported",
    fallback: "The required media source uses an unsupported format.",
  },
  "invalid-dimensions": {
    id: "media-invalid-dimensions",
    fallback: "The required media source has invalid pixel dimensions.",
  },
});

function issue(
  id: PreflightIssueId,
  severity: PreflightSeverity,
  scope: PreflightScope,
  message: string,
  subjectId?: string,
): MutableIssue {
  return Object.freeze({ id, severity, scope, message, ...(subjectId ? { subjectId } : {}) });
}

function nonNegativeSafeInteger(value: number | null | undefined, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer when provided.`);
  }
  return value;
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function exportFieldIsValid(patch: Partial<ExportSettings>): boolean {
  try {
    validateExportSettings({ ...DEFAULT_EXPORT_SETTINGS, ...patch });
    return true;
  } catch {
    return false;
  }
}

function mediaIssues(input: PreflightInput): MutableIssue[] {
  const issues: MutableIssue[] = [];
  for (const health of input.slideHealth) {
    for (const healthIssue of health.issues) {
      const mapped = SLIDE_ISSUE_MAP[healthIssue.id];
      issues.push(issue(mapped.id, mapped.severity, mapped.scope, healthIssue.message, health.assetId));
    }
  }
  for (const failure of input.mediaFailures ?? []) {
    const mapped = MEDIA_FAILURE_MAP[failure.kind];
    issues.push(issue(
      mapped.id,
      "blocker",
      "media",
      failure.message?.trim() || mapped.fallback,
      failure.assetId,
    ));
  }
  return issues;
}

function outputIssues(input: PreflightInput): MutableIssue[] {
  const { output } = input.receipt;
  const issues: MutableIssue[] = [];
  const widthValid = exportFieldIsValid({ width: output.width });
  const heightValid = exportFieldIsValid({ height: output.height });
  const dimensionsValid = widthValid && heightValid;
  if (!dimensionsValid) {
    issues.push(issue(
      "output-invalid-dimensions",
      "blocker",
      "output",
      `Export dimensions are outside the supported whole-pixel range; received ${output.width} × ${output.height}.`,
    ));
  }
  if (!exportFieldIsValid({ fps: output.fps })) {
    issues.push(issue(
      "output-invalid-fps",
      "blocker",
      "output",
      `Export FPS is outside the supported whole-number range; received ${output.fps}.`,
    ));
  }
  if (
    !exportFieldIsValid({ duration: input.receipt.segments.masterSeconds })
    || !finitePositive(output.encodedDurationSeconds)
  ) {
    issues.push(issue(
      "output-invalid-duration",
      "blocker",
      "output",
      `Export duration is outside the supported range; received ${input.receipt.segments.masterSeconds} authored seconds and ${output.encodedDurationSeconds} encoded seconds.`,
    ));
  }
  if (!Number.isSafeInteger(output.frameCount) || output.frameCount < 1) {
    issues.push(issue(
      "output-invalid-frame-count",
      "blocker",
      "output",
      `Export frame count must be a positive safe integer; received ${output.frameCount}.`,
    ));
  }

  let containerSupported = true;
  let containerReason = "";
  const capabilities = input.capabilities;
  switch (output.container) {
    case "mp4":
      if (dimensionsValid && (output.width % 2 !== 0 || output.height % 2 !== 0)) {
        containerSupported = false;
        containerReason = "H.264 export requires even pixel dimensions.";
      } else if (capabilities && !capabilities.mp4.supported) {
        containerSupported = false;
        containerReason = capabilities.mp4.reasons.join(" ")
          || "The current runtime has no compatible H.264/AVC encoder.";
      }
      break;
    case "png-still":
      if (capabilities && !capabilities.png.still) {
        containerSupported = false;
        containerReason = "The current runtime cannot encode PNG stills.";
      }
      break;
    case "png-sequence": {
      const destination = input.pngSequenceDestination ?? "zip";
      const supported = destination === "directory"
        ? capabilities?.png.sequenceDirectory
        : capabilities?.png.sequenceZip;
      if (supported === false) {
        containerSupported = false;
        containerReason = destination === "directory"
          ? "The current runtime cannot write a PNG sequence directory."
          : "The current runtime cannot encode an in-memory PNG sequence ZIP.";
      }
      break;
    }
    default:
      containerSupported = false;
      containerReason = `Unknown export container: ${String(output.container)}.`;
  }
  if (!containerSupported) {
    issues.push(issue(
      "output-container-unsupported",
      "blocker",
      "output",
      containerReason,
      output.container,
    ));
  }
  if (input.exportSurface?.supported === false) {
    issues.push(issue(
      "output-surface-unsupported",
      "blocker",
      "output",
      input.exportSurface.reason?.trim()
        || `The current renderer cannot allocate ${output.width} × ${output.height}.`,
    ));
  }
  if (
    input.receipt.presenter.enabled
    && input.receipt.presenter.assetKind === "video"
    && capabilities?.presenter.videoDecoderApi === false
  ) {
    issues.push(issue(
      "media-decode-failed",
      "blocker",
      "media",
      "The current runtime has no presenter-video decoder.",
      input.receipt.presenter.assetId ?? undefined,
    ));
  }
  return issues;
}

function budgetIssues(input: PreflightInput): MutableIssue[] {
  if (!input.budget) return [];
  const availableStorageBytes = nonNegativeSafeInteger(
    input.budget.availableStorageBytes,
    "budget.availableStorageBytes",
  );
  const requiredStorageBytes = nonNegativeSafeInteger(
    input.budget.requiredStorageBytes,
    "budget.requiredStorageBytes",
  );
  const pngZipMemoryLimitBytes = nonNegativeSafeInteger(
    input.budget.pngZipMemoryLimitBytes,
    "budget.pngZipMemoryLimitBytes",
  );
  const issues: MutableIssue[] = [];
  if (
    availableStorageBytes !== null
    && requiredStorageBytes !== null
    && requiredStorageBytes > availableStorageBytes
  ) {
    issues.push(issue(
      "storage-insufficient",
      "blocker",
      "storage",
      `Export requires ${requiredStorageBytes} bytes, but the selected destination has ${availableStorageBytes} bytes available.`,
    ));
  }
  if (
    input.receipt.output.container === "png-sequence"
    && (input.pngSequenceDestination ?? "zip") === "zip"
    && pngZipMemoryLimitBytes !== null
    && exportFieldIsValid({ width: input.receipt.output.width })
    && exportFieldIsValid({ height: input.receipt.output.height })
    && exportFieldIsValid({ fps: input.receipt.output.fps })
    && exportFieldIsValid({ duration: input.receipt.segments.masterSeconds })
  ) {
    const estimatedBytes = estimatePngZipMemoryBytes({
      width: input.receipt.output.width,
      height: input.receipt.output.height,
      fps: input.receipt.output.fps,
      duration: input.receipt.segments.masterSeconds,
    });
    if (estimatedBytes > pngZipMemoryLimitBytes) {
      issues.push(issue(
        "png-zip-memory-insufficient",
        "blocker",
        "storage",
        `The in-memory PNG ZIP needs approximately ${estimatedBytes} bytes, above the ${pngZipMemoryLimitBytes}-byte memory cap.`,
      ));
    }
  }
  return issues;
}

function guideIssue(overlap: GuideOverlapFact): MutableIssue | null {
  if (!overlap.overlaps || overlap.overlapArea <= 0) return null;
  const subjectLabel = overlap.subject === "presenter" ? "Presenter" : "Selected slide";
  const guideLabel = overlap.guideId ? ` the ${overlap.guideId} guide` : " the active guide";
  const percentage = Math.min(100, Math.max(0, overlap.overlapRatio * 100));
  return issue(
    "guide-overlap",
    "warning",
    "guide",
    `${subjectLabel} overlaps${guideLabel} across ${percentage.toFixed(1)}% of its visible bounds.`,
    overlap.subjectId,
  );
}

function warningAndNoteIssues(input: PreflightInput): MutableIssue[] {
  const issues: MutableIssue[] = [];
  for (const overlap of input.guideOverlaps ?? []) {
    const overlapIssue = guideIssue(overlap);
    if (overlapIssue) issues.push(overlapIssue);
  }
  if (input.receipt.cadence.endpointMismatch) {
    issues.push(issue(
      "cadence-endpoint",
      "warning",
      "output",
      "Frame quantization does not land on the authored cadence endpoint.",
    ));
  }
  if (!input.receipt.transparency.compatible) {
    issues.push(issue(
      "alpha-container",
      "warning",
      "output",
      `${input.receipt.output.container} cannot preserve the requested transparent output.`,
      input.receipt.output.container,
    ));
  }
  if (input.receipt.workload.class === "heavy") {
    issues.push(issue(
      "heavy-workload",
      "warning",
      "output",
      `This export contains ${input.receipt.workload.pixelFrames} pixel-frames and is classified as heavy.`,
    ));
  } else if (input.receipt.workload.class === "extreme") {
    issues.push(issue(
      "extreme-workload",
      "warning",
      "output",
      `This export contains ${input.receipt.workload.pixelFrames} pixel-frames and is classified as extreme.`,
    ));
  }
  for (const lane of input.physicalValidationLanes ?? []) {
    if (lane.supported) continue;
    issues.push(issue(
      "unsupported-physical-lane",
      "warning",
      "evidence",
      lane.reason?.trim() || `${lane.label} has not been physically validated.`,
      lane.id,
    ));
  }
  return issues;
}

function deduplicate(issues: readonly MutableIssue[]): readonly PreflightIssue[] {
  const seen = new Set<string>();
  return Object.freeze(issues.filter((entry) => {
    const key = `${entry.id}\u0000${entry.subjectId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }));
}

/** Pure objective preflight. It consumes facts and never mutates or repairs creative work. */
export function evaluatePreflight(input: PreflightInput): PreflightReport {
  const all = deduplicate([
    ...mediaIssues(input),
    ...outputIssues(input),
    ...budgetIssues(input),
    ...warningAndNoteIssues(input),
  ]);
  const blockers = Object.freeze(all.filter((entry) => entry.severity === "blocker"));
  const warnings = Object.freeze(all.filter((entry) => entry.severity === "warning"));
  const notes = Object.freeze(all.filter((entry) => entry.severity === "note"));
  return Object.freeze({
    canExport: blockers.length === 0,
    issues: Object.freeze([...blockers, ...warnings, ...notes]),
    blockers,
    warnings,
    notes,
  });
}
