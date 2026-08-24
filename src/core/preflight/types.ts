import type { SlideHealth } from "../media/slideHealth";
import type { PlatformGuideOverlap } from "../platformGuides";
import type { DeliveryReceipt } from "../timeline/deliveryReceipt";
import type { ExportCapabilityReport } from "../../lib/exportStudio";

export type PreflightSeverity = "blocker" | "warning" | "note";

export type PreflightIssueId =
  | "media-missing"
  | "media-decode-failed"
  | "media-unsupported"
  | "media-invalid-dimensions"
  | "output-invalid-dimensions"
  | "output-invalid-fps"
  | "output-invalid-duration"
  | "output-invalid-frame-count"
  | "output-container-unsupported"
  | "output-surface-unsupported"
  | "native-aac-duration-limit"
  | "storage-insufficient"
  | "png-zip-memory-insufficient"
  | "low-resolution"
  | "unusual-ratio"
  | "mixed-ratio"
  | "focal-edge"
  | "guide-overlap"
  | "uneven-pose-holds"
  | "duration-quantization"
  | "alpha-container"
  | "heavy-workload"
  | "extreme-workload"
  | "unsupported-physical-lane"
  | "pinned-only";

export type PreflightScope = "media" | "output" | "storage" | "guide" | "evidence";

export interface PreflightIssue {
  readonly id: PreflightIssueId;
  readonly severity: PreflightSeverity;
  readonly scope: PreflightScope;
  readonly subjectId?: string;
  readonly message: string;
}

export interface MediaFailureFact {
  readonly assetId: string;
  readonly kind: "missing" | "decode-failed" | "unsupported-media" | "invalid-dimensions";
  readonly message?: string;
}

export interface GuideOverlapFact extends PlatformGuideOverlap {
  readonly subjectId?: string;
  readonly guideId?: string;
}

export interface ExportSurfaceSupportFact {
  readonly supported: boolean;
  readonly reason?: string;
}

export interface ExportBudgetFacts {
  /** The actual destination capacity available to this export, when known. */
  readonly availableStorageBytes?: number | null;
  /** A caller-owned artifact estimate. It is compared only when storage is known. */
  readonly requiredStorageBytes?: number | null;
  /** Applies only to an in-memory PNG ZIP destination. */
  readonly pngZipMemoryLimitBytes?: number | null;
}

export interface PhysicalValidationLane {
  readonly id: string;
  readonly label: string;
  readonly supported: boolean;
  readonly reason?: string;
}

export interface PreflightInput {
  readonly receipt: DeliveryReceipt;
  readonly slideHealth: readonly SlideHealth[];
  /** Runtime decode failures that metadata-only SlideHealth cannot prove. */
  readonly mediaFailures?: readonly MediaFailureFact[];
  readonly guideOverlaps?: readonly GuideOverlapFact[];
  /** Current runtime capability probe. Absence remains unknown, never a blocker. */
  readonly capabilities?: ExportCapabilityReport | null;
  readonly exportSurface?: ExportSurfaceSupportFact | null;
  readonly pngSequenceDestination?: "zip" | "directory";
  readonly budget?: ExportBudgetFacts;
  readonly physicalValidationLanes?: readonly PhysicalValidationLane[];
}

export interface PreflightReport {
  readonly canExport: boolean;
  readonly issues: readonly PreflightIssue[];
  readonly blockers: readonly PreflightIssue[];
  readonly warnings: readonly PreflightIssue[];
  readonly notes: readonly PreflightIssue[];
}
