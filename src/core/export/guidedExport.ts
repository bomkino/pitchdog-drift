import type { ExportCapabilityReport } from "../../lib/exportStudio";
import { getExportFrameCount, validateExportSettings, type ExportSettings } from "../../lib/exportContract";
import type { ExportAuthoritySnapshot } from "./exportAuthority";

export const GUIDED_EXPORT_STEPS = Object.freeze([
  "purpose-background",
  "format",
  "film-audio",
  "destination-preflight",
  "render-verify",
  "complete",
] as const);

export type GuidedExportStep = typeof GUIDED_EXPORT_STEPS[number];
export type ExportPurpose = "social" | "editing-master" | "transparent-overlay" | "frame-sequence" | "custom";
export type ExportBackground = "opaque" | "transparent";
export type ExportFormatId = "h264-mp4" | "png-frames" | "prores-4444" | "hevc-alpha";
export type ExportDestinationClass = "file" | "directory";
export type PngFramesDestination = "directory" | "zip";

export type CapabilityReasonId =
  | "not_packaged"
  | "unsupported_platform"
  | "unsupported_runtime"
  | "encoder_missing"
  | "muxer_missing"
  | "pixel_format_missing"
  | "audio_combination_unsupported"
  | "dimension_or_fps_unsupported"
  | "permission_required"
  | "resource_budget_exceeded"
  | "temporary_host_failure"
  | "policy_disabled";

export interface CapabilityReason {
  readonly id: CapabilityReasonId;
  readonly message: string;
  readonly recovery: string;
}

export interface ExportFormatCapability {
  readonly id: ExportFormatId;
  readonly state: "available" | "unavailable" | "degraded";
  readonly source: "build" | "runtime-probe" | "user-choice" | "policy";
  readonly reason?: CapabilityReason;
}

export interface CompiledTimelineIdentity {
  readonly durationSeconds: number;
  readonly frameCount: number;
  readonly fps: Readonly<{ numerator: number; denominator: 1 }>;
}

export interface ExportAudioIntent {
  readonly enabled: boolean;
  readonly presenter: boolean;
  readonly soundDesign: boolean;
}

export interface ExportIntent {
  readonly purpose: ExportPurpose;
  readonly background: ExportBackground;
  readonly dimensions: Readonly<{ width: number; height: number }>;
  readonly fps: Readonly<{ numerator: number; denominator: 1 }>;
  readonly finiteTimeline: CompiledTimelineIdentity;
  readonly audio: ExportAudioIntent;
  readonly preferredFormat: ExportFormatId;
  readonly destinationClass: ExportDestinationClass;
}

export interface GuidedExportDraft {
  readonly step: GuidedExportStep;
  readonly intent: ExportIntent;
  readonly pngDestination: PngFramesDestination;
  readonly audioConsequenceAcknowledged: boolean;
  readonly destinationSelected: boolean;
}

export type GuidedExportAction =
  | Readonly<{ type: "choose-purpose"; purpose: ExportPurpose }>
  | Readonly<{ type: "choose-background"; background: ExportBackground }>
  | Readonly<{ type: "choose-format"; format: ExportFormatId }>
  | Readonly<{ type: "choose-png-destination"; destination: PngFramesDestination }>
  | Readonly<{ type: "acknowledge-audio-consequence"; acknowledged: boolean }>
  | Readonly<{ type: "mark-destination-selected"; selected: boolean }>
  | Readonly<{ type: "next" }>
  | Readonly<{ type: "back" }>
  | Readonly<{ type: "begin-render" }>
  | Readonly<{ type: "complete" }>
  | Readonly<{ type: "edit" }>
  | Readonly<{ type: "sync-source"; intent: ExportIntent }>
  | Readonly<{ type: "replace-intent"; intent: ExportIntent }>;

export interface GuidedExportRunRequest {
  readonly intent: ExportIntent;
  readonly pngDestination: PngFramesDestination;
  readonly audioConsequenceAcknowledged: boolean;
}

export interface GuidedExportCompletion {
  readonly snapshotId: string;
  readonly format: "h264-mp4" | "png-frames";
  readonly artifact: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly frameCount: number;
  readonly duration: number;
  readonly bytes: number | null;
  readonly publication: "committed" | "directory-written" | "download-requested";
  readonly verified: true;
}

export type GuidedExportIssueId =
  | "capability-unavailable"
  | "transparent-background-requires-alpha-format"
  | "audio-consequence-unacknowledged"
  | "destination-required";

export interface GuidedExportIssue {
  readonly id: GuidedExportIssueId;
  readonly severity: "blocker" | "warning";
  readonly message: string;
}

export interface GuidedExportPreflight {
  readonly canStart: boolean;
  readonly capability: ExportFormatCapability;
  readonly blockers: readonly GuidedExportIssue[];
  readonly warnings: readonly GuidedExportIssue[];
}

export interface GuidedExportSnapshot {
  readonly id: string;
  readonly createdAt: string;
  readonly documentRevision: number;
  readonly intent: ExportIntent;
  readonly projectFingerprint: string;
  readonly settingsFingerprint: string;
  readonly assetFingerprint: string;
  readonly project: ExportAuthoritySnapshot["project"];
  readonly settings: ExportAuthoritySnapshot["settings"];
  readonly assets: Readonly<ExportAuthoritySnapshot["assets"]>;
  readonly presenter: ExportAuthoritySnapshot["presenter"];
}

export interface GuidedExportPlanFacts extends ExportSettings {
  readonly presenterAudio: boolean;
  readonly soundDesignAudio: boolean;
}

export const EXPORT_FORMATS = Object.freeze([
  Object.freeze({
    id: "h264-mp4" as const,
    label: "H.264 MP4",
    summary: "Ordinary opaque delivery",
    alpha: false,
    embedsAudio: true,
    destinationClass: "file" as const,
  }),
  Object.freeze({
    id: "png-frames" as const,
    label: "PNG Frames",
    summary: "Universal alpha sequence",
    alpha: true,
    embedsAudio: false,
    destinationClass: "directory" as const,
  }),
  Object.freeze({
    id: "prores-4444" as const,
    label: "ProRes 4444 MOV",
    summary: "Transparent editing master",
    alpha: true,
    embedsAudio: true,
    destinationClass: "file" as const,
  }),
  Object.freeze({
    id: "hevc-alpha" as const,
    label: "HEVC with Alpha MOV",
    summary: "Compact Apple delivery",
    alpha: true,
    embedsAudio: true,
    destinationClass: "file" as const,
  }),
] as const);

function formatDescriptor(id: ExportFormatId): typeof EXPORT_FORMATS[number] {
  const descriptor = EXPORT_FORMATS.find((candidate) => candidate.id === id);
  if (!descriptor) throw new TypeError(`Unknown guided Export format: ${String(id)}.`);
  return descriptor;
}

function freezeIntent(intent: ExportIntent): ExportIntent {
  return Object.freeze({
    ...intent,
    dimensions: Object.freeze({ ...intent.dimensions }),
    fps: Object.freeze({ ...intent.fps }),
    finiteTimeline: Object.freeze({
      ...intent.finiteTimeline,
      fps: Object.freeze({ ...intent.finiteTimeline.fps }),
    }),
    audio: Object.freeze({ ...intent.audio }),
  });
}

export function createExportIntent(input: Readonly<{
  purpose?: ExportPurpose;
  background: ExportBackground;
  settings: ExportSettings;
  presenterAudio: boolean;
  soundDesignAudio: boolean;
  preferredFormat?: ExportFormatId;
  destinationClass?: ExportDestinationClass;
}>): ExportIntent {
  const settings = validateExportSettings(input.settings);
  const purpose = input.purpose ?? "social";
  const preferredFormat = input.preferredFormat
    ?? (purpose === "frame-sequence" || purpose === "transparent-overlay" ? "png-frames" : "h264-mp4");
  const descriptor = formatDescriptor(preferredFormat);
  const fps = Object.freeze({ numerator: settings.fps, denominator: 1 as const });
  return freezeIntent({
    purpose,
    background: input.background,
    dimensions: Object.freeze({ width: settings.width, height: settings.height }),
    fps,
    finiteTimeline: Object.freeze({
      durationSeconds: settings.duration,
      frameCount: getExportFrameCount(settings),
      fps,
    }),
    audio: Object.freeze({
      enabled: input.presenterAudio || input.soundDesignAudio,
      presenter: input.presenterAudio,
      soundDesign: input.soundDesignAudio,
    }),
    preferredFormat,
    destinationClass: input.destinationClass ?? descriptor.destinationClass,
  });
}

export function createGuidedExportDraft(intent: ExportIntent): GuidedExportDraft {
  return Object.freeze({
    step: "purpose-background",
    intent: freezeIntent(intent),
    pngDestination: "directory",
    audioConsequenceAcknowledged: false,
    destinationSelected: false,
  });
}

function withIntent(draft: GuidedExportDraft, patch: Partial<ExportIntent>): GuidedExportDraft {
  return Object.freeze({
    ...draft,
    intent: freezeIntent({ ...draft.intent, ...patch }),
    destinationSelected: false,
  });
}

function purposeDefaults(purpose: ExportPurpose): Pick<ExportIntent, "purpose" | "background" | "preferredFormat" | "destinationClass"> {
  switch (purpose) {
    case "transparent-overlay":
    case "frame-sequence":
      return { purpose, background: "transparent", preferredFormat: "png-frames", destinationClass: "directory" };
    case "social":
    case "editing-master":
      return { purpose, background: "opaque", preferredFormat: "h264-mp4", destinationClass: "file" };
    case "custom":
      return { purpose, background: "opaque", preferredFormat: "h264-mp4", destinationClass: "file" };
  }
}

function adjacentStep(step: GuidedExportStep, delta: -1 | 1): GuidedExportStep {
  const index = GUIDED_EXPORT_STEPS.indexOf(step);
  const next = Math.max(0, Math.min(GUIDED_EXPORT_STEPS.length - 1, index + delta));
  return GUIDED_EXPORT_STEPS[next]!;
}

export function reduceGuidedExport(
  draft: GuidedExportDraft,
  action: GuidedExportAction,
): GuidedExportDraft {
  switch (action.type) {
    case "choose-purpose":
      return withIntent(draft, purposeDefaults(action.purpose));
    case "choose-background":
      return withIntent(draft, { background: action.background });
    case "choose-format": {
      const descriptor = formatDescriptor(action.format);
      return withIntent(draft, {
        preferredFormat: action.format,
        destinationClass: descriptor.destinationClass,
      });
    }
    case "choose-png-destination":
      return Object.freeze({
        ...draft,
        pngDestination: action.destination,
        destinationSelected: false,
      });
    case "acknowledge-audio-consequence":
      return Object.freeze({ ...draft, audioConsequenceAcknowledged: action.acknowledged });
    case "mark-destination-selected":
      return Object.freeze({ ...draft, destinationSelected: action.selected });
    case "next":
      return Object.freeze({ ...draft, step: adjacentStep(draft.step, 1) });
    case "back":
      return Object.freeze({ ...draft, step: adjacentStep(draft.step, -1) });
    case "begin-render":
      return Object.freeze({ ...draft, step: "render-verify" });
    case "complete":
      return Object.freeze({ ...draft, step: "complete" });
    case "edit":
      return Object.freeze({ ...draft, step: "purpose-background", destinationSelected: false });
    case "sync-source":
      return withIntent(draft, {
        dimensions: action.intent.dimensions,
        fps: action.intent.fps,
        finiteTimeline: action.intent.finiteTimeline,
        audio: action.intent.audio,
      });
    case "replace-intent":
      return Object.freeze({ ...draft, intent: freezeIntent(action.intent), destinationSelected: false });
  }
}

function reason(
  id: CapabilityReasonId,
  message: string,
  recovery: string,
): CapabilityReason {
  return Object.freeze({ id, message, recovery });
}

export function deriveExportFormatCapabilities(input: Readonly<{
  runtime: ExportCapabilityReport | null;
  pngDestination: PngFramesDestination;
  exportSurfaceSupported: boolean;
  intent: ExportIntent;
}>): readonly ExportFormatCapability[] {
  const runtime = input.runtime;
  const surfaceReason = reason(
    "unsupported_runtime",
    "The cinematic render surface is unavailable.",
    "Restore the renderer before exporting.",
  );
  const pendingReason = reason(
    "temporary_host_failure",
    "Drift has not completed the runtime capability probe.",
    "Wait for preflight to finish, then try again.",
  );
  const mp4Reason = runtime === null
    ? pendingReason
    : !runtime.mp4.avc
      ? reason("encoder_missing", "This runtime has no compatible H.264 encoder.", "Use PNG Frames or a runtime with H.264 support.")
      : input.intent.audio.enabled && !runtime.mp4.aac
        ? reason("audio_combination_unsupported", "Requested sound cannot be encoded safely in this runtime.", "Keep audio enabled and choose another proven target; do not drop it silently.")
        : input.intent.audio.enabled && !runtime.mp4.presenterAudioFpsSupported
          ? reason("dimension_or_fps_unsupported", "Requested sound is not supported at this frame rate.", `Choose ${runtime.mp4.maximumPresenterAudioFps} fps or lower.`)
          : input.intent.audio.enabled
            && runtime.mp4.nativeAacMaximumDurationSeconds !== null
            && input.intent.finiteTimeline.durationSeconds > runtime.mp4.nativeAacMaximumDurationSeconds
            ? reason(
                "dimension_or_fps_unsupported",
                `This runtime supports audio-bearing masters up to ${runtime.mp4.nativeAacMaximumDurationSeconds.toFixed(2)} seconds.`,
                "Shorten the master; Drift will not remove requested audio.",
              )
      : undefined;
  const pngSupported = runtime !== null && (
    input.pngDestination === "directory"
      ? runtime.png.sequenceDirectory
      : runtime.png.sequenceZip
  );
  const pngReason = runtime === null
    ? pendingReason
    : !pngSupported
      ? reason(
          input.pngDestination === "directory" ? "permission_required" : "resource_budget_exceeded",
          input.pngDestination === "directory"
            ? "This runtime cannot grant a writable frame directory."
            : "This runtime cannot create a bounded in-memory frame archive.",
          input.pngDestination === "directory" ? "Choose ZIP or a directory-capable target." : "Choose a writable directory.",
        )
      : undefined;

  return Object.freeze([
    Object.freeze({
      id: "h264-mp4" as const,
      state: input.exportSurfaceSupported && runtime?.mp4.supported && !mp4Reason ? "available" as const : "unavailable" as const,
      source: "runtime-probe" as const,
      ...(!input.exportSurfaceSupported ? { reason: surfaceReason } : mp4Reason ? { reason: mp4Reason } : {}),
    }),
    Object.freeze({
      id: "png-frames" as const,
      state: input.exportSurfaceSupported && pngSupported ? "available" as const : "unavailable" as const,
      source: "runtime-probe" as const,
      ...(!input.exportSurfaceSupported ? { reason: surfaceReason } : pngReason ? { reason: pngReason } : {}),
    }),
    Object.freeze({
      id: "prores-4444" as const,
      state: "unavailable" as const,
      source: "build" as const,
      reason: reason(
        "not_packaged",
        "Native ProRes 4444 is not part of this build.",
        "Use PNG Frames; the native Mac adapter lands in D06.",
      ),
    }),
    Object.freeze({
      id: "hevc-alpha" as const,
      state: "unavailable" as const,
      source: "build" as const,
      reason: reason(
        "not_packaged",
        "HEVC with Alpha is not part of this build.",
        "Use PNG Frames; the exact native Mac probe and adapter land in D06.",
      ),
    }),
  ]);
}

export function preflightGuidedExport(
  draft: GuidedExportDraft,
  capabilities: readonly ExportFormatCapability[],
): GuidedExportPreflight {
  const capability = capabilities.find(({ id }) => id === draft.intent.preferredFormat);
  if (!capability) throw new TypeError(`Missing capability for ${draft.intent.preferredFormat}.`);
  const blockers: GuidedExportIssue[] = [];
  const warnings: GuidedExportIssue[] = [];

  if (capability.state === "unavailable") {
    blockers.push(Object.freeze({
      id: "capability-unavailable",
      severity: "blocker",
      message: capability.reason?.message ?? "This format is unavailable in the current runtime.",
    }));
  } else if (capability.state === "degraded" && capability.reason) {
    warnings.push(Object.freeze({
      id: "capability-unavailable",
      severity: "warning",
      message: capability.reason.message,
    }));
  }

  if (draft.intent.preferredFormat === "h264-mp4" && draft.intent.background === "transparent") {
    blockers.push(Object.freeze({
      id: "transparent-background-requires-alpha-format",
      severity: "blocker",
      message: "H.264 is opaque. Choose an opaque background or PNG Frames.",
    }));
  }

  if (
    draft.intent.preferredFormat === "png-frames"
    && draft.intent.audio.enabled
    && !draft.audioConsequenceAcknowledged
  ) {
    blockers.push(Object.freeze({
      id: "audio-consequence-unacknowledged",
      severity: "blocker",
      message: "PNG Frames contain no embedded audio. Confirm this consequence before rendering.",
    }));
  }

  if (!draft.destinationSelected) {
    blockers.push(Object.freeze({
      id: "destination-required",
      severity: "blocker",
      message: "Choose a scoped destination before rendering.",
    }));
  }

  return Object.freeze({
    canStart: blockers.length === 0,
    capability,
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
  });
}

export function captureGuidedExportSnapshot(input: Readonly<{
  id: string;
  createdAt: string;
  documentRevision: number;
  intent: ExportIntent;
  authority: ExportAuthoritySnapshot;
}>): GuidedExportSnapshot {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(input.id)) {
    throw new TypeError("Guided Export snapshot ID must be a bounded machine identifier.");
  }
  if (!Number.isSafeInteger(input.documentRevision) || input.documentRevision < 0) {
    throw new TypeError("Guided Export document revision must be a non-negative safe integer.");
  }
  if (!Number.isFinite(Date.parse(input.createdAt))) {
    throw new TypeError("Guided Export snapshot time must be an ISO date.");
  }

  return Object.freeze({
    id: input.id,
    createdAt: new Date(input.createdAt).toISOString(),
    documentRevision: input.documentRevision,
    intent: freezeIntent(input.intent),
    projectFingerprint: input.authority.projectFingerprint,
    settingsFingerprint: input.authority.settingsFingerprint,
    assetFingerprint: input.authority.assetFingerprint,
    project: structuredClone(input.authority.project),
    settings: structuredClone(input.authority.settings),
    assets: Object.freeze(structuredClone(input.authority.assets)),
    presenter: structuredClone(input.authority.presenter),
  });
}

export function assertGuidedExportIntentMatchesPlan(
  intent: ExportIntent,
  facts: GuidedExportPlanFacts,
): void {
  const settings = validateExportSettings(facts);
  const matches = intent.dimensions.width === settings.width
    && intent.dimensions.height === settings.height
    && intent.fps.numerator === settings.fps
    && intent.fps.denominator === 1
    && intent.finiteTimeline.durationSeconds === settings.duration
    && intent.finiteTimeline.frameCount === getExportFrameCount(settings)
    && intent.finiteTimeline.fps.numerator === settings.fps
    && intent.finiteTimeline.fps.denominator === 1
    && intent.audio.presenter === facts.presenterAudio
    && intent.audio.soundDesign === facts.soundDesignAudio
    && intent.audio.enabled === (facts.presenterAudio || facts.soundDesignAudio);
  if (!matches) {
    throw new DOMException(
      "Export choices no longer match the locked project snapshot. Nothing was rendered; review Export again.",
      "InvalidStateError",
    );
  }
}
