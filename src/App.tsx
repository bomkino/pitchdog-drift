import { videoSlideBudget } from "./core/media/videoPlayback";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import { ControlPanel, type StudioWorkspace } from "./components/ControlPanel";
import { MediaLibrary } from "./components/MediaLibrary";
import { Stage } from "./components/Stage";
import { CommandPalette } from "./components/CommandPalette";
import { InterfaceScaleMenu } from "./components/InterfaceScaleMenu";
import { AutomationAccessView } from "./components/AutomationAccessView";
import { CaretRightIcon, CheckCircleIcon, InfoIcon, WarningCircleIcon, XIcon } from "./components/icons";
import { createDriftSelfDescription } from "./core/automation/selfDescription";
import { createProductAutomationService } from "./core/automation/productAutomationService";
import {
  DRIFT_AUTOMATION_WRITE_SCOPE,
  createProductAutomationMutationService,
  type AutomationMutationAuthority,
  type AutomationMutationCommit,
  type ProductAutomationMutationService,
} from "./core/automation/productAutomationMutation";
import {
  DRIFT_AUTOMATION_PREVIEW_SCOPE,
  createProductAutomationPreviewService,
  type AutomationPreviewAuthority,
  type AutomationPreviewRenderInput,
  type ProductAutomationPreviewService,
} from "./core/automation/productAutomationPreview";
import {
  createProductAutomationExportService,
  type AutomationExportAuthority,
  type AutomationExportChoice,
  type AutomationExportReservationHooks,
  type ProductAutomationExportService,
} from "./core/automation/productAutomationExport";
import { createInitialDriftProjectV4 } from "./core/project/initialProject";
import {
  applyOutcomeRecipeCommand,
  reconcileOutcomeRecipeTiming,
  type OutcomeRecipeId,
} from "./core/recipes/outcomeRecipes";
import { evaluateDeckSlideHealth } from "./core/media/slideHealth";
import { resolveMovingMedia } from "./core/project/movingMedia";
import type { StudioCommandDefinition } from "./core/commands/studioCommandRegistry";
import {
  createCustomPlatformGuide,
  evaluatePresenterGuideOverlap,
  getPlatformGuideProfile,
  type NormalizedInsets,
  type PlatformGuideProfileId,
} from "./core/platformGuides";
import { resolvePresenterOverlayLayout } from "./core/presenter/layout";
import {
  assertExportAuthorityUnchanged,
  captureExportAuthority,
  type ExportAuthoritySnapshot,
} from "./core/export/exportAuthority";
import {
  assertGuidedExportIntentMatchesPlan,
  captureGuidedExportSnapshot,
  createGuidedExportDraft,
  createExportIntent,
  deriveExportFormatCapabilities,
  preflightGuidedExport,
  type ExportIntent,
  type GuidedExportCompletion,
  type GuidedExportRunRequest,
  type GuidedExportSnapshot,
} from "./core/export/guidedExport";
import {
  createExportJobController,
  type ExportJobController,
  type ExportJobStatus,
} from "./core/export/exportJobController";
import {
  exportPlanFromProject,
  exportPlanFromV1Settings,
  stagePresentationFromProject,
  stagePresentationFromV1Settings,
} from "./core/project/appPresentation";
import {
  reconcileStudioProject,
  studioSettingsFromDriftProject,
} from "./core/project/studioProjection";
import {
  DRIFT_V2_RENDER_CONTRACT,
  type AssetDescriptor,
  type DriftProjectV4,
} from "./core/project/schema";
import {
  applyProjectV4Command,
  projectV4ChangePaths,
} from "./core/commands/projectCommand";
import { installPreviewAuthority } from "./core/render/previewAuthority";
import {
  createProjectRevisionState,
  projectDocumentIsDirty,
  recordProjectMutation,
  type ProjectRevisionState,
} from "./core/project/revisions";
import { captureDocumentHistory, trimDocumentHistory, type DocumentHistory, type DocumentHistoryEntry } from "./core/project/documentHistory";
import { commitProjectReplacement, documentContentIdentity } from "./core/project/documentContent";
import { validateDriftProjectV4 } from "./core/project/validation";
import {
  applyEditorialDriftFoundation,
  canRecutEditorialDrift,
  detachEditorialDriftRatioProvenance,
  nearestWorldRatioForDimensions,
  worldRatioForDimensions,
} from "./core/worlds";
import { createPerformanceLifecycle } from "./core/timeline/performanceLifecycle";
import { defaultPerformanceStillTime } from "./core/timeline/renderTravel";
import { buildVisualTimelineModel } from "./core/timeline/visualTimelineModel";
import {
  applyTimingResolution,
  readTimingIntent,
  resolveProjectTiming,
  withTimingIntent,
} from "./core/timeline/timingIntent";
import {
  CinematicCarousel,
  clampPreviewSeekTime,
  getShadowSupportMargin,
} from "./engine/CinematicCarousel";
import { mapMediaSettled } from "./lib/mediaWork";
import { disposeAsset, imageFileToAsset, slideFileToAsset, sanitizeFilename, videoFileToAsset } from "./lib/assets";
import { driftBuildIdentity } from "./lib/buildIdentity";
import { createDemoSlides } from "./lib/demoSlides";
import {
  TactileSoundEngine,
  renderTactileSoundtrack,
  type TactileRuntimeState,
} from "./sonic/tactileSound";
import type {
  ExportCapabilityReport,
  ExportProgress as EncoderProgress,
  RenderAtContext,
} from "./lib/exportStudio";
import {
  createExportProgressClock,
  projectExportProgress,
  tickExportProgress,
  type ExportProgressClock,
} from "./lib/exportProgress";
import {
  installNativeMacAppBridge,
  commitNativeMacDocumentOpen,
  isNativeMacRuntime,
  nativeMacDocumentClientState,
  reportNativeMacClientState,
  saveNativeMacBlob,
  type NativeMacCommand,
  type NativeMacImportKind,
} from "./lib/nativeMac";
import {
  createDesktopPlatform,
  DesktopPlatformDocumentError,
  type DesktopDocumentOpenReceipt,
  requireDesktopPlatformCompletion,
} from "./lib/desktopPlatform";
import {
  interfaceScaleSinglePanelMaximum,
  interfaceScaleUsesSinglePanel,
  type InterfaceScaleCommand,
} from "./lib/interfaceScale";
import {
  createDevelopmentMcpAdapter,
  type DevelopmentMcpAdapter,
} from "./lib/developmentMcpAdapter";
import {
  PROJECT_MEDIA_LIMITS,
  formatProjectMiB,
  projectAssetBytes,
  projectMediaViolation,
  selectProjectMediaWithinBudget,
} from "./lib/projectMediaBudget";
import {
  createProjectBundle,
  projectStore,
  exportProject,
  importProject,
  loadProject,
  saveProject,
  type ProjectSnapshot,
} from "./lib/projectStore";
import {
  advanceLocalSaveRevision,
  createLocalSaveRevisionAuthority,
  matchesDirectPersistenceSnapshot,
  ownsLocalSaveRevision,
} from "./lib/localSaveAuthority";
import {
  createDriftProjectPayload,
  parseStudioProjectPayload,
  type DriftProjectPayloadV3,
  type DriftProjectPayloadV4,
  type LegacyStudioProjectPayload,
} from "./lib/studioProjectPayload";
import {
  DEFAULT_SETTINGS,
  ENGINE_VERSION,
  THEME_VERSION,
  clearPinnedAssetIfRemoved,
  cloneSettings,
  type ExportProgress,
  type StudioAsset,
  type StudioSettings,
  type ThemeId,
} from "./model";
import { applyTheme, getTheme } from "./themes";
import {
  resetPinnedFrameComposition,
  resolveFirstPinComposition,
} from "./core/presenter/activation";

const MAX_SLIDES = 200;
const AUTOSAVE_DELAY_MS = 1_200;

type StudioProjectPayload = LegacyStudioProjectPayload | DriftProjectPayloadV3 | DriftProjectPayloadV4;

interface ProjectIdentity {
  projectId: string;
  createdAt: string;
}

interface PreparedProjectState {
  project: DriftProjectV4;
  settings: StudioSettings;
  slides: StudioAsset[];
  presenter: StudioAsset | null;
}

const MAX_V2_HISTORY = 50;
const V2_GESTURE_COALESCE_MS = 480;

interface PickerWindow extends Window {
  showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  showSaveFilePicker?: (options?: {
    id?: string;
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
}

function isAbortError(error: unknown): boolean {
  return (error instanceof DOMException && error.name === "AbortError")
    || (!!error && typeof error === "object" && "code" in error && error.code === "CANCELLED");
}

function makeLocalProjectId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function createInitialProject(projectId: string, now: string): DriftProjectV4 {
  return createInitialDriftProjectV4(projectId, now);
}

function describeProjectAsset(asset: StudioAsset): AssetDescriptor {
  if (!asset.hash || !/^[a-f0-9]{64}$/u.test(asset.hash)) {
    throw new Error(`${asset.name} has no verified SHA-256 identity.`);
  }
  const descriptor: AssetDescriptor = {
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mimeType,
    hash: asset.hash,
    byteLength: asset.blob.size,
    width: asset.width,
    height: asset.height,
  };
  if (asset.duration !== undefined) descriptor.duration = asset.duration;
  return descriptor;
}

async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const safeName = sanitizeFilename(filename);
  if (await saveNativeMacBlob(blob, safeName)) return;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function assetFromSnapshot(
  entry: ProjectSnapshot<StudioProjectPayload>["assets"][number],
  descriptor: AssetDescriptor,
): Promise<StudioAsset> {
  const file = new File([entry.blob], descriptor.name, { type: descriptor.mimeType || entry.type });
  const asset = descriptor.kind === "video"
    ? await videoFileToAsset(file, descriptor.id)
    : await imageFileToAsset(file, descriptor.id);
  return { ...asset, hash: entry.sha256 };
}

function disposePreparedProjectState(prepared: PreparedProjectState): void {
  prepared.slides.forEach(disposeAsset);
  if (prepared.presenter) disposeAsset(prepared.presenter);
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CinematicCarousel | null>(null);
  const sonicEngineRef = useRef<TactileSoundEngine | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const presenterInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const exportDestinationPendingRef = useRef(false);
  const exportJobControllerRef = useRef<ExportJobController | null>(null);
  if (exportJobControllerRef.current === null) {
    exportJobControllerRef.current = createExportJobController();
  }
  const exportJobController = exportJobControllerRef.current;
  const exportProgressClockRef = useRef<ExportProgressClock | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const projectRef = useRef<DriftProjectV4 | null>(null);
  if (projectRef.current === null) {
    const now = new Date().toISOString();
    projectRef.current = createInitialProject(makeLocalProjectId(), now);
  }
  // New documents in every shipping identity begin from the same authored V2
  // foundation. Imported and previously saved V1 documents keep their frozen
  // compatibility renderer until the user explicitly applies a V2 World.
  const initialSettings = studioSettingsFromDriftProject(projectRef.current);
  const identityRef = useRef<ProjectIdentity | null>(null);
  const recoverySnapshotRef = useRef<ProjectSnapshot<StudioProjectPayload> | null>(null);
  const hydratedRef = useRef(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRevisionAuthorityRef = useRef(createLocalSaveRevisionAuthority());
  const documentRevisionRef = useRef<ProjectRevisionState>(createProjectRevisionState());
  const documentSha256Ref = useRef<string | null>(null);
  const directPersistenceSnapshotRef = useRef<{
    settings: StudioSettings;
    assets: StudioAsset[];
    presenter: StudioAsset | null;
  } | null>(null);
  const projectQueueRef = useRef<Promise<void>>(Promise.resolve());
  const projectPendingRef = useRef(0);
  const assetsRef = useRef<StudioAsset[]>([]);
  const presenterRef = useRef<StudioAsset | null>(null);
  const settingsRef = useRef<StudioSettings>(cloneSettings(initialSettings));
  const v2HistoryRef = useRef<DocumentHistory>({ past: [], future: [], lastGesture: null });
  const nativeCommandRef = useRef<(command: NativeMacCommand) => boolean | void | Promise<boolean | void>>(() => false);
  const nativeImportRef = useRef<(
    kind: NativeMacImportKind,
    files: readonly File[],
  ) => void | Promise<void>>(() => undefined);
  const automationWriteEnabledRef = useRef(false);
  const automationPreviewEnabledRef = useRef(false);
  const automationExportEnabledRef = useRef(false);
  const automationCommitRef = useRef<(change: AutomationMutationCommit) => void>(() => {
    throw new Error("Automation mutation authority is not ready.");
  });
  const automationMutationAuthorityRef = useRef<AutomationMutationAuthority | null>(null);
  const automationPreviewRenderRef = useRef<(input: AutomationPreviewRenderInput) => Promise<{
    mimeType: "image/png";
    bytes: Uint8Array;
  }>>(async () => {
    throw new Error("Automation preview renderer is not ready.");
  });
  const automationPreviewAuthorityRef = useRef<AutomationPreviewAuthority | null>(null);
  const automationExportPreflightRef = useRef<AutomationExportAuthority["preflight"]>(() => {
    throw new Error("Automation export preflight is not ready.");
  });
  const automationExportRunRef = useRef<AutomationExportAuthority["run"]>(async () => {
    throw new Error("Automation export runner is not ready.");
  });
  const automationExportAuthorityRef = useRef<AutomationExportAuthority | null>(null);
  if (automationMutationAuthorityRef.current === null) {
    automationMutationAuthorityRef.current = {
      read: () => {
        const project = projectRef.current;
        if (!project) throw new Error("Project V4 creative authority is unavailable.");
        return {
          project: structuredClone(project),
          revisions: structuredClone(documentRevisionRef.current),
          documentId: project.projectId,
          scopes: automationWriteEnabledRef.current ? [DRIFT_AUTOMATION_WRITE_SCOPE] : [],
        };
      },
      commit: (change) => automationCommitRef.current(change),
    };
  }
  if (automationPreviewAuthorityRef.current === null) {
    automationPreviewAuthorityRef.current = {
      read: () => {
        const project = projectRef.current;
        if (!project) throw new Error("Project V4 creative authority is unavailable.");
        return {
          project: structuredClone(project),
          revisions: structuredClone(documentRevisionRef.current),
          documentId: project.projectId,
          scopes: automationPreviewEnabledRef.current ? [DRIFT_AUTOMATION_PREVIEW_SCOPE] : [],
        };
      },
      render: (input) => automationPreviewRenderRef.current(input),
    };
  }
  if (automationExportAuthorityRef.current === null) {
    automationExportAuthorityRef.current = {
      jobs: exportJobController,
      preflight: (choice) => automationExportPreflightRef.current(choice),
      run: (request, hooks) => automationExportRunRef.current(request, hooks),
    };
  }

  const [settings, setSettings] = useState<StudioSettings>(() => cloneSettings(initialSettings));
  const [liveProject, setLiveProject] = useState<DriftProjectV4>(() => structuredClone(projectRef.current!));
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [presenter, setPresenter] = useState<StudioAsset | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [contextState, setContextState] = useState<"ready" | "lost" | "restored">("ready");
  const [fps, setFps] = useState(0);
  const [previewTime, setPreviewTime] = useState(0);
  const [paused, setPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [activeSlideIndex, setActiveSlideIndex] = useState(-1);
  const [activePanel, setActivePanel] = useState<"media" | "stage" | "director">("stage");
  const nativeMac = isNativeMacRuntime();
  const desktopPlatform = useMemo(() => createDesktopPlatform(), []);
  const packagedDesktop = nativeMac || desktopPlatform.target === "linux-electron";
  const [interfaceScale, setInterfaceScale] = useState(
    () => desktopPlatform.presentation.interfaceScale.getSnapshot(),
  );
  const [constrainedViewport, setConstrainedViewport] = useState(
    () => interfaceScaleUsesSinglePanel(interfaceScale.value, window.innerWidth),
  );
  const [activeWorkspace, setActiveWorkspace] = useState<StudioWorkspace>("slides");
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [platformGuideId, setPlatformGuideId] = useState<PlatformGuideProfileId>("none");
  const [customGuideInsets, setCustomGuideInsets] = useState<NormalizedInsets>({ top: 0.1, right: 0.08, bottom: 0.16, left: 0.08 });
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportJobStatus, setExportJobStatus] = useState<ExportJobStatus | null>(null);
  const [notice, setNotice] = useState<string | null>("Loading local studio…");
  const [noticeKind, setNoticeKind] = useState<"quiet" | "good" | "error">("quiet");
  const [saveState, setSaveState] = useState<"loading" | "saving" | "saved" | "failed" | "recovery">("loading");
  const [projectBusy, setProjectBusy] = useState(false);
  const [documentBound, setDocumentBound] = useState(false);
  const [documentConflict, setDocumentConflict] = useState(false);
  const [documentRevisionVersion, setDocumentRevisionVersion] = useState(0);
  const [mp4Supported, setMp4Supported] = useState<boolean | null>(null);
  const [exportCapabilities, setExportCapabilities] = useState<ExportCapabilityReport | null>(null);
  const [sonicState, setSonicState] = useState<TactileRuntimeState>("off");
  const [, setV2HistoryVersion] = useState(0);
  const [comparisonProject, setComparisonProject] = useState<DriftProjectV4 | null>(null);
  const [comparisonActive, setComparisonActive] = useState(false);
  const [changeReceipt, setChangeReceipt] = useState("No V2 direction changed yet.");
  const effectiveInterfaceLayout = interfaceScale.layout === "single-panel" || constrainedViewport
    ? "single-panel"
    : "three-panel";
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [automationWriteEnabled, setAutomationWriteEnabled] = useState(false);
  const [automationPreviewEnabled, setAutomationPreviewEnabled] = useState(false);
  const [automationExportEnabled, setAutomationExportEnabled] = useState(false);
  const [automationConnectionState, setAutomationConnectionState] = useState<"disconnected" | "connected">("disconnected");
  const nativeSelfTestDatabase = (globalThis as typeof globalThis & {
    __DRIFT_NATIVE_SELF_TEST_DB__?: unknown;
  }).__DRIFT_NATIVE_SELF_TEST_DB__;
  useEffect(() => {
    if (!nativeMac || typeof nativeSelfTestDatabase !== "string" || !/^drift-project-self-test-[a-f0-9-]{36}$/.test(nativeSelfTestDatabase)) return;
    const target = globalThis as typeof globalThis & { __driftVerifyVideoOutput?: () => Promise<Record<string, unknown>> };
    target.__driftVerifyVideoOutput = async () => (await import("./lib/videoSlideProof")).verifyVideoSlideOutput();
    return () => { delete target.__driftVerifyVideoOutput; };
  }, [nativeMac, nativeSelfTestDatabase]);
  const portableProjectFilesEnabled = !driftBuildIdentity.isDevelopment || nativeMac
    || (typeof nativeSelfTestDatabase === "string"
      && /^drift-project-self-test-[a-f0-9-]{36}$/.test(nativeSelfTestDatabase));

  settingsRef.current = settings;
  assetsRef.current = assets;
  presenterRef.current = presenter;
  automationWriteEnabledRef.current = automationWriteEnabled;
  automationPreviewEnabledRef.current = automationPreviewEnabled;
  automationExportEnabledRef.current = automationExportEnabled;

  const changeInterfaceScale = useCallback((command: InterfaceScaleCommand) => {
    try {
      setInterfaceScale(desktopPlatform.presentation.interfaceScale.dispatch(command));
    } catch (error) {
      setNoticeKind("error");
      setNotice(error instanceof Error
        ? `Interface Scale could not be saved: ${error.message}`
        : "Interface Scale could not be saved.");
    }
  }, [desktopPlatform]);

  useEffect(
    () => desktopPlatform.presentation.interfaceScale.subscribe(setInterfaceScale),
    [desktopPlatform],
  );

  useLayoutEffect(() => {
    const threePanelMinimum = interfaceScaleSinglePanelMaximum(interfaceScale.value);
    const query = window.matchMedia(`(max-width: ${threePanelMinimum}px)`);
    const update = () => setConstrainedViewport((current) => (
      current === query.matches ? current : query.matches
    ));
    query.addEventListener("change", update);
    update();
    return () => query.removeEventListener("change", update);
  }, [interfaceScale.value]);

  useEffect(() => exportJobController.subscribe(() => {
    setExportJobStatus(exportJobController.getActiveStatus());
  }), [exportJobController]);

  const acceptEncoderProgress = useCallback((progress: EncoderProgress) => {
    const clock = exportProgressClockRef.current;
    if (!clock) return;
    const projected = projectExportProgress(progress, clock, performance.now());
    setExportProgress(projected);
    const active = exportJobController.getActiveStatus();
    if (active) exportJobController.report(active.id, projected);
  }, [exportJobController]);

  useEffect(() => {
    if (!exportProgress) return;
    const timer = window.setInterval(() => {
      const clock = exportProgressClockRef.current;
      if (!clock) return;
      const now = performance.now();
      setExportProgress((current) => current
        ? tickExportProgress(current, clock, now)
        : null);
    }, 500);
    return () => window.clearInterval(timer);
  }, [exportProgress !== null]);

  const v2Active = liveProject.renderContract === DRIFT_V2_RENDER_CONTRACT;
  const nativeDocumentState = useMemo(
    () => nativeMacDocumentClientState(
      documentRevisionRef.current,
      documentBound,
      documentConflict,
    ),
    [documentBound, documentConflict, documentRevisionVersion],
  );
  const displayedProject = comparisonActive && comparisonProject ? comparisonProject : liveProject;
  const visualTimeline = useMemo(() => buildVisualTimelineModel(
    displayedProject,
    resolveMovingMedia(displayedProject).order,
  ), [displayedProject]);
  const slideHealth = useMemo(() => evaluateDeckSlideHealth(liveProject), [liveProject]);
  const platformGuide = useMemo(
    () => platformGuideId === "custom"
      ? createCustomPlatformGuide(customGuideInsets)
      : getPlatformGuideProfile(platformGuideId),
    [customGuideInsets, platformGuideId],
  );
  const stagePresentation = useMemo(
    () => v2Active
      ? stagePresentationFromProject(displayedProject)
      : stagePresentationFromV1Settings(settings),
    [displayedProject, settings, v2Active],
  );
  const automationPlayheadSeconds = Math.round(previewTime * 4) / 4;
  const automationManifests = useMemo(() => createDriftSelfDescription({
      project: liveProject,
      documentRevision: documentRevisionRef.current.currentRevision,
      savedDocumentRevision: documentRevisionRef.current.savedRevision,
      documentBound,
      documentConflict,
      selectedAssetId: selectedSlideId,
      presentation: {
        interfaceScale: interfaceScale.value,
        workspace: activeWorkspace,
        panel: activePanel,
        focusMode,
        playheadSeconds: automationPlayheadSeconds,
      },
      platform: {
        target: desktopPlatform.target,
        buildChannel: driftBuildIdentity.channel,
        packaged: packagedDesktop,
      },
      exportCapabilities,
      mutationAccess: automationWriteEnabled,
      previewAccess: automationPreviewEnabled,
      exportAccess: automationExportEnabled,
      jobs: exportJobStatus ? [{
        id: exportJobStatus.id,
        kind: "export",
        state: "running",
        progress: exportJobStatus.progress.ratio,
      }] : [],
    }), [
    activePanel,
    activeWorkspace,
    desktopPlatform.target,
    documentRevisionVersion,
    documentBound,
    documentConflict,
    exportCapabilities,
    exportProgress,
    exportJobStatus,
    focusMode,
    interfaceScale.value,
    liveProject,
    nativeMac,
    packagedDesktop,
    automationPlayheadSeconds,
    automationWriteEnabled,
    automationPreviewEnabled,
    automationExportEnabled,
    selectedSlideId,
  ]);
  const automationMutationServiceRef = useRef<ProductAutomationMutationService | null>(null);
  if (automationMutationServiceRef.current === null) {
    automationMutationServiceRef.current = createProductAutomationMutationService(
      automationManifests,
      { authority: automationMutationAuthorityRef.current },
    );
  } else {
    automationMutationServiceRef.current.replaceManifests(automationManifests);
  }
  const automationMutationService = automationMutationServiceRef.current;
  const automationPreviewServiceRef = useRef<ProductAutomationPreviewService | null>(null);
  if (automationPreviewServiceRef.current === null) {
    automationPreviewServiceRef.current = createProductAutomationPreviewService(
      automationPreviewAuthorityRef.current,
    );
  }
  const automationPreviewService = automationPreviewServiceRef.current;
  const automationExportServiceRef = useRef<ProductAutomationExportService | null>(null);
  if (automationExportServiceRef.current === null) {
    automationExportServiceRef.current = createProductAutomationExportService(
      automationExportAuthorityRef.current,
    );
  }
  const automationExportService = automationExportServiceRef.current;
  const automationService = useMemo(() => createProductAutomationService(
    automationManifests,
    automationMutationService,
    automationPreviewService,
    automationExportService,
  ), [automationExportService, automationManifests, automationMutationService, automationPreviewService]);
  const automationAdapterRef = useRef<DevelopmentMcpAdapter | null>(null);
  if (automationAdapterRef.current === null) {
    automationAdapterRef.current = createDevelopmentMcpAdapter(automationService);
  }
  const automationAdapter = automationAdapterRef.current;

  useEffect(() => {
    automationAdapter.replaceService(automationService);
  }, [automationAdapter, automationService]);

  useEffect(() => automationAdapter.subscribe(setAutomationConnectionState), [automationAdapter]);

  useEffect(() => {
    const developmentEnabled = driftBuildIdentity.isDevelopment && automationEnabled;
    automationAdapter.setEnabled(developmentEnabled);
    automationAdapter.setWriteScopeEnabled(developmentEnabled && automationWriteEnabled);
    automationAdapter.setPreviewScopeEnabled(developmentEnabled && automationPreviewEnabled);
    automationAdapter.setExportScopeEnabled(developmentEnabled && automationExportEnabled);
    const host = globalThis as typeof globalThis & {
      __DRIFT_DEVELOPMENT_MCP__?: Readonly<Pick<
        DevelopmentMcpAdapter,
        "connect" | "request" | "disconnect"
      >>;
    };
    const clientSurface = Object.freeze({
      connect: automationAdapter.connect,
      request: automationAdapter.request,
      disconnect: automationAdapter.disconnect,
    });
    if (developmentEnabled) host.__DRIFT_DEVELOPMENT_MCP__ = clientSurface;
    return () => {
      if (host.__DRIFT_DEVELOPMENT_MCP__ === clientSurface) {
        delete host.__DRIFT_DEVELOPMENT_MCP__;
      }
      automationAdapter.setEnabled(false);
    };
  }, [automationAdapter, automationEnabled, automationExportEnabled, automationPreviewEnabled, automationWriteEnabled]);

  useEffect(() => {
    trimDocumentHistory(v2HistoryRef.current, assets, presenter);
  }, [assets, presenter]);

  useEffect(() => {
    if (selectedSlideId && assets.some((asset) => asset.id === selectedSlideId)) return;
    setSelectedSlideId(assets[0]?.id ?? null);
  }, [assets, selectedSlideId]);
  const liveExportPlan = useMemo(
    () => v2Active
      ? exportPlanFromProject(liveProject)
      : exportPlanFromV1Settings(settings),
    [liveProject, settings, v2Active],
  );
  const guidedExportIntent = useMemo(() => createExportIntent({
    background: stagePresentation.transparent ? "transparent" : "opaque",
    settings: {
      width: liveExportPlan.width,
      height: liveExportPlan.height,
      fps: liveExportPlan.fps,
      duration: liveExportPlan.duration,
    },
    presenterAudio: liveExportPlan.presenter.includeAudio,
    soundDesignAudio: liveProject.sound.exportEnabled,
  }), [
    liveExportPlan.duration,
    liveExportPlan.fps,
    liveExportPlan.height,
    liveExportPlan.presenter.includeAudio,
    liveExportPlan.width,
    liveProject.sound.exportEnabled,
    stagePresentation.transparent,
  ]);
  automationExportPreflightRef.current = (choice: AutomationExportChoice) => {
    if (!automationExportEnabledRef.current) throw new Error("Automation export-jobs scope is not enabled.");
    const intent: ExportIntent = Object.freeze({
      ...guidedExportIntent,
      preferredFormat: choice.format,
      destinationClass: choice.format === "h264-mp4" ? "file" : "directory",
      purpose: choice.format === "h264-mp4" ? "social" : "frame-sequence",
    });
    const draft = Object.freeze({
      ...createGuidedExportDraft(intent),
      pngDestination: choice.pngDestination,
      audioConsequenceAcknowledged: choice.audioConsequenceAcknowledged,
      destinationSelected: true,
    });
    const capabilities = deriveExportFormatCapabilities({
      runtime: exportCapabilities,
      pngDestination: choice.pngDestination,
      exportSurfaceSupported: !webglError && contextState !== "lost",
      intent,
    });
    return { request: { intent, pngDestination: choice.pngDestination, audioConsequenceAcknowledged: choice.audioConsequenceAcknowledged }, preflight: preflightGuidedExport(draft, capabilities) };
  };
  const allAssets = useMemo(() => presenter ? [...assets, presenter] : assets, [assets, presenter]);
  const pinnedAsset = useMemo(
    () => allAssets.find((asset) => asset.id === stagePresentation.pinnedAssetId) ?? null,
    [allAssets, stagePresentation.pinnedAssetId],
  );
  const activePinnedAsset = stagePresentation.pinEnabled ? pinnedAsset : null;
  const guideOverlaps = useMemo(() => {
    if (
      platformGuide.id === "none"
      || !activePinnedAsset
      || !settings.presenter.enabled
      || settings.presenter.layoutMode !== "safe-overlay"
    ) return [];
    try {
      const requestedShadowMargin = getShadowSupportMargin(
        settings.presenter.shadowSoftness,
        settings.presenter.shadowOpacity,
      );
      const layout = resolvePresenterOverlayLayout({
        stage: { width: settings.stage.width, height: settings.stage.height },
        source: { width: activePinnedAsset.width, height: activePinnedAsset.height },
        customAspect: settings.presenter.aspectMode === "custom"
          ? { width: settings.presenter.aspectWidth, height: settings.presenter.aspectHeight }
          : null,
        anchor: { x: settings.presenter.x, y: settings.presenter.y },
        scale: Math.min(0.9, Math.max(0.12, settings.presenter.width)),
        safeInset: Math.min(settings.stage.width, settings.stage.height) * settings.presenter.safeInset,
        shadowExtents: {
          top: Math.max(0, requestedShadowMargin - settings.presenter.shadowOffsetY),
          right: Math.max(0, requestedShadowMargin + settings.presenter.shadowOffsetX),
          bottom: Math.max(0, requestedShadowMargin + settings.presenter.shadowOffsetY),
          left: Math.max(0, requestedShadowMargin - settings.presenter.shadowOffsetX),
        },
      });
      const bounds = layout.frameBoundsPx;
      return [{
        ...evaluatePresenterGuideOverlap({
          left: bounds.left / settings.stage.width,
          top: bounds.top / settings.stage.height,
          right: bounds.right / settings.stage.width,
          bottom: bounds.bottom / settings.stage.height,
        }, platformGuide),
        subjectId: activePinnedAsset.id,
        guideId: platformGuide.id,
      }];
    } catch {
      return [];
    }
  }, [activePinnedAsset, platformGuide, settings.presenter, settings.stage.height, settings.stage.width]);

  const announce = useCallback((message: string, kind: "quiet" | "good" | "error" = "quiet") => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    setNotice(message);
    setNoticeKind(kind);
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, kind === "error" ? 9_000 : 4_800);
  }, []);

  const publishLiveProject = useCallback((project: DriftProjectV4) => {
    projectRef.current = project;
    documentRevisionRef.current = { ...documentRevisionRef.current, currentContentIdentity: documentContentIdentity(project) };
    setDocumentRevisionVersion((version) => version + 1);
    setLiveProject(project);
  }, []);

  const synchronizeProjectedSettings = useCallback((project: DriftProjectV4): StudioSettings => {
    const projected = studioSettingsFromDriftProject(project);
    if (JSON.stringify(projected) !== JSON.stringify(settingsRef.current)) {
      settingsRef.current = projected;
      setSettings(projected);
    }
    return projected;
  }, []);

  const reconcileLiveProject = useCallback((
    nextSettings: StudioSettings,
    nextAssets: readonly StudioAsset[],
    nextPresenter: StudioAsset | null,
    baseProject = projectRef.current,
  ): DriftProjectV4 => {
    if (!baseProject) throw new Error("Project V4 creative authority is unavailable.");
    const project = reconcileOutcomeRecipeTiming(reconcileStudioProject({
      project: baseProject,
      settings: nextSettings,
      slideAssets: nextAssets.map(describeProjectAsset),
      presenterAsset: nextPresenter ? describeProjectAsset(nextPresenter) : null,
      // Live creative edits do not impersonate persistence revisions.
      updatedAt: baseProject.updatedAt,
    }));
    publishLiveProject(project);
    synchronizeProjectedSettings(project);
    return project;
  }, [publishLiveProject, synchronizeProjectedSettings]);

  const settingsForCurrentAuthority = useCallback((): StudioSettings => {
    const project = projectRef.current;
    return project?.renderContract === DRIFT_V2_RENDER_CONTRACT
      ? studioSettingsFromDriftProject(project)
      : settingsRef.current;
  }, []);

  const enqueueProjectOperation = useCallback((
    operation: () => Promise<void>,
    rejectWhenExportBlocks = false,
  ) => {
    if (abortRef.current || exportDestinationPendingRef.current) {
      const error = new DOMException(
        "Wait for the current export to finish or cancel it first.",
        "InvalidStateError",
      );
      announce(error.message, "error");
      if (rejectWhenExportBlocks) return Promise.reject(error);
      return Promise.resolve();
    }
    projectPendingRef.current += 1;
    setProjectBusy(true);
    const task = projectQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await operation();
        } finally {
          projectPendingRef.current -= 1;
          if (projectPendingRef.current === 0) setProjectBusy(false);
        }
      });
    projectQueueRef.current = task.then(() => undefined, () => undefined);
    return task;
  }, [announce]);

  const prepareProjectState = useCallback(async (
    snapshot: ProjectSnapshot<StudioProjectPayload>,
  ): Promise<PreparedProjectState> => {
    const parsed = parseStudioProjectPayload(snapshot.payload, {
      projectId: snapshot.manifest.projectId,
      createdAt: snapshot.manifest.createdAt,
      updatedAt: snapshot.manifest.updatedAt,
      engineVersion: snapshot.manifest.engineVersion,
      themeVersion: snapshot.manifest.themeVersion,
      assets: snapshot.assets.map((entry) => ({
        id: entry.id,
        name: entry.name,
        type: entry.type,
        size: entry.size,
        sha256: entry.sha256,
      })),
    });

    const project = parsed.project;
    const projectedSettings = studioSettingsFromDriftProject(project);
    const descriptorById = new Map(Object.entries(project.media.assets));
    const restored: StudioAsset[] = [];
    try {
      for (const entry of snapshot.assets) {
        const descriptor = descriptorById.get(entry.id);
        if (!descriptor) throw new Error(`Project is missing media metadata for ${entry.name}.`);
        restored.push(await assetFromSnapshot(entry, descriptor));
      }
    } catch (error) {
      restored.forEach(disposeAsset);
      throw error;
    }

    const restoredById = new Map(restored.map((asset) => [asset.id, asset]));
    const slides = project.media.order.map((id) => restoredById.get(id)).filter((asset): asset is StudioAsset => Boolean(asset));
    if (
      slides.length !== project.media.order.length
      || slides.some((asset) => {
        const descriptor = descriptorById.get(asset.id);
        return (asset.kind !== "image" && asset.kind !== "video")
          || !descriptor
          || asset.width !== descriptor.width
          || asset.height !== descriptor.height;
      })
    ) {
      restored.forEach(disposeAsset);
      throw new Error("Project slide order references missing or unsupported media.");
    }
    const presenterId = project.media.presenterAssetId;
    const nextPresenter = presenterId ? restoredById.get(presenterId) ?? null : null;
    if (nextPresenter) {
      const descriptor = descriptorById.get(nextPresenter.id);
      if (
        nextPresenter.kind !== "video"
        || !descriptor
        || nextPresenter.width !== descriptor.width
        || nextPresenter.height !== descriptor.height
      ) {
        restored.forEach(disposeAsset);
        throw new Error("Project presenter slot references invalid video media.");
      }
    }

    return {
      project,
      settings: projectedSettings,
      slides,
      presenter: nextPresenter,
    };
  }, []);

  const installPreparedProjectState = useCallback((prepared: PreparedProjectState) => {
    assetsRef.current.forEach(disposeAsset);
    if (presenterRef.current) disposeAsset(presenterRef.current);
    publishLiveProject(prepared.project);
    settingsRef.current = prepared.settings;
    assetsRef.current = prepared.slides;
    presenterRef.current = prepared.presenter;
    // This exact tuple came from a verified snapshot. Loading it must not look
    // like a fresh edit to the dependency-driven autosave effect that follows.
    directPersistenceSnapshotRef.current = {
      settings: prepared.settings,
      assets: prepared.slides,
      presenter: prepared.presenter,
    };
    setSettings(prepared.settings);
    setAssets(prepared.slides);
    setPresenter(prepared.presenter);
    identityRef.current = {
      projectId: prepared.project.projectId,
      createdAt: prepared.project.createdAt,
    };
    v2HistoryRef.current = { past: [], future: [], lastGesture: null };
    setV2HistoryVersion((version) => version + 1);
    setComparisonProject(null);
    setComparisonActive(false);
    setChangeReceipt("Opened project · history starts here.");
  }, [publishLiveProject]);

  const replaceProjectState = useCallback(async (snapshot: ProjectSnapshot<StudioProjectPayload>) => {
    const prepared = await prepareProjectState(snapshot);
    try {
      installPreparedProjectState(prepared);
    } catch (error) {
      disposePreparedProjectState(prepared);
      throw error;
    }
  }, [installPreparedProjectState, prepareProjectState]);

  const persist = useCallback((
    nextSettings = settingsForCurrentAuthority(),
    nextAssets = assetsRef.current,
    nextPresenter = presenterRef.current,
    reservedRevision?: number,
  ) => {
    const revision = reservedRevision ?? advanceLocalSaveRevision(saveRevisionAuthorityRef.current);
    setSaveState("saving");
    const updatedAt = new Date().toISOString();
    const baseProject = projectRef.current ?? createInitialProject(makeLocalProjectId(), updatedAt);
    const nextProject = reconcileOutcomeRecipeTiming(reconcileStudioProject({
      project: baseProject,
      settings: nextSettings,
      slideAssets: nextAssets.map(describeProjectAsset),
      presenterAsset: nextPresenter ? describeProjectAsset(nextPresenter) : null,
      updatedAt,
    }));
    publishLiveProject(nextProject);
    synchronizeProjectedSettings(nextProject);
    const payload = createDriftProjectPayload(nextProject);
    const projectAssets = [...nextAssets, ...(nextPresenter ? [nextPresenter] : [])].map((asset) => ({
      id: asset.id,
      name: asset.name,
      blob: asset.blob,
    }));

    const task = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const snapshot = await saveProject({
          payload,
          assets: projectAssets,
          engineVersion: ENGINE_VERSION,
          themeVersion: THEME_VERSION,
          projectId: nextProject.projectId,
          createdAt: nextProject.createdAt,
          updatedAt: nextProject.updatedAt,
        });
        identityRef.current = {
          projectId: snapshot.manifest.projectId,
          createdAt: snapshot.manifest.createdAt,
        };
        if (ownsLocalSaveRevision(saveRevisionAuthorityRef.current, revision)) setSaveState("saved");
        return snapshot;
      });

    saveQueueRef.current = task.then(
      () => undefined,
      () => {
        if (ownsLocalSaveRevision(saveRevisionAuthorityRef.current, revision)) setSaveState("failed");
      },
    );
    return task;
  }, [publishLiveProject, settingsForCurrentAuthority, synchronizeProjectedSettings]);

  const persistExactProject = useCallback((
    project: DriftProjectV4,
    exactAssets: readonly StudioAsset[],
    exactPresenter: StudioAsset | null,
  ) => {
    const revision = advanceLocalSaveRevision(saveRevisionAuthorityRef.current);
    setSaveState("saving");
    const payload = createDriftProjectPayload(project);
    const projectAssets = [...exactAssets, ...(exactPresenter ? [exactPresenter] : [])].map((asset) => ({
      id: asset.id,
      name: asset.name,
      blob: asset.blob,
    }));
    const task = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const snapshot = await saveProject({
          payload,
          assets: projectAssets,
          engineVersion: ENGINE_VERSION,
          themeVersion: THEME_VERSION,
          projectId: project.projectId,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        });
        identityRef.current = {
          projectId: snapshot.manifest.projectId,
          createdAt: snapshot.manifest.createdAt,
        };
        if (ownsLocalSaveRevision(saveRevisionAuthorityRef.current, revision)) setSaveState("saved");
        return snapshot;
      });
    saveQueueRef.current = task.then(
      () => undefined,
      () => {
        if (ownsLocalSaveRevision(saveRevisionAuthorityRef.current, revision)) setSaveState("failed");
      },
    );
    return task;
  }, []);

  const recordDocumentMutation = useCallback(() => {
    documentRevisionRef.current = recordProjectMutation(documentRevisionRef.current);
    setDocumentRevisionVersion((version) => version + 1);
  }, []);

  const scheduleProjectPersistence = useCallback(() => {
    if (!hydratedRef.current) return;
    advanceLocalSaveRevision(saveRevisionAuthorityRef.current);
    setSaveState("saving");
  }, []);

  const markProjectDirty = useCallback(() => {
    if (!hydratedRef.current) return;
    recordDocumentMutation();
    scheduleProjectPersistence();
  }, [recordDocumentMutation, scheduleProjectPersistence]);

  useEffect(() => {
    let cancelled = false;
    void enqueueProjectOperation(async () => {
      let hydrationSucceeded = false;
      let savedSnapshot: ProjectSnapshot<StudioProjectPayload> | null = null;
      try {
        const saved = await loadProject<StudioProjectPayload>();
        savedSnapshot = saved;
        if (cancelled) return;
        if (saved) {
          await replaceProjectState(saved);
          if (!cancelled) announce("Local project reopened with verified Project V4 media.", "good");
        } else {
          const demo = await createDemoSlides();
          if (cancelled) {
            demo.forEach(disposeAsset);
            return;
          }
          assetsRef.current = demo;
          reconcileLiveProject(settingsForCurrentAuthority(), demo, presenterRef.current);
          setAssets(demo);
          announce("A live study is loaded. Replace it with your own deck whenever you’re ready.");
        }
        hydrationSucceeded = true;
        recoverySnapshotRef.current = null;
      } catch (error) {
        if (cancelled) return;
        recoverySnapshotRef.current = savedSnapshot;
        announce(error instanceof Error ? `Saved project could not reopen: ${error.message}` : "Saved project could not reopen.", "error");
        const demo = await createDemoSlides();
        if (cancelled) demo.forEach(disposeAsset);
        else {
          assetsRef.current = demo;
          reconcileLiveProject(settingsForCurrentAuthority(), demo, presenterRef.current);
          setAssets(demo);
        }
      } finally {
        if (!cancelled) {
          hydratedRef.current = hydrationSucceeded;
          setSaveState(hydrationSucceeded ? "saved" : "recovery");
        }
      }
    });
    return () => { cancelled = true; };
  }, [announce, enqueueProjectOperation, reconcileLiveProject, replaceProjectState, settingsForCurrentAuthority]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;
    let engine: CinematicCarousel;
    try {
      const project = projectRef.current;
      if (!project) throw new Error("Project V4 creative authority is unavailable.");
      const authority = project.renderContract === DRIFT_V2_RENDER_CONTRACT
        ? { kind: "project-v4" as const, project }
        : { kind: "v1-compat" as const, settings: settingsRef.current };
      engine = new CinematicCarousel(canvas, authority, {
        onError: (message) => announce(message, "error"),
        onContextState: setContextState,
        onFrame: setFps,
        onActiveSlide: setActiveSlideIndex,
        onPreviewTime: setPreviewTime,
      });
      engineRef.current = engine;
      setWebglError(null);
    } catch (error) {
      setWebglError(error instanceof Error ? error.message : "WebGL2 renderer could not start.");
      return;
    }
    const resize = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) engine.resize(box.width, box.height);
    });
    resize.observe(frame);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyMotion = () => {
      setPrefersReducedMotion(motion.matches);
      engine.setReducedMotionPreview(motion.matches);
    };
    applyMotion();
    motion.addEventListener("change", applyMotion);
    return () => {
      motion.removeEventListener("change", applyMotion);
      resize.disconnect();
      engine.dispose();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [announce]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (displayedProject.renderContract === DRIFT_V2_RENDER_CONTRACT) {
      void engine.setV2ProjectState(displayedProject, assets);
      return;
    }
    void engine.setV1CompatibilityState(settings, displayedProject, assets);
  }, [assets, displayedProject, settings]);
  useEffect(() => { void engineRef.current?.setPresenterAsset(activePinnedAsset); }, [activePinnedAsset]);

  useEffect(() => {
    const project = projectRef.current;
    if (!project) return;
    const sonic = new TactileSoundEngine(project, setSonicState, (message) => announce(message, "error"));
    sonicEngineRef.current = sonic;
    return () => {
      sonic.dispose();
      if (sonicEngineRef.current === sonic) sonicEngineRef.current = null;
    };
  }, [announce]);

  useEffect(() => {
    sonicEngineRef.current?.setProject(liveProject);
  }, [liveProject]);

  useEffect(() => {
    if (activeSlideIndex < 0 || !liveProject.sound.previewEnabled || comparisonActive || paused) return;
    void sonicEngineRef.current?.playPassage(activeSlideIndex + 1);
  }, [activeSlideIndex, comparisonActive, liveProject.sound.previewEnabled, paused]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const directSnapshot = directPersistenceSnapshotRef.current;
    if (directSnapshot) {
      directPersistenceSnapshotRef.current = null;
      if (matchesDirectPersistenceSnapshot(directSnapshot, settings, assets, presenter)) return;
    }
    const revision = advanceLocalSaveRevision(saveRevisionAuthorityRef.current);
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      if (!ownsLocalSaveRevision(saveRevisionAuthorityRef.current, revision)) return;
      void persist(settings, assets, presenter, revision).catch((error: unknown) => {
        if (!ownsLocalSaveRevision(saveRevisionAuthorityRef.current, revision)) return;
        setSaveState("failed");
        announce(error instanceof Error ? `Local save failed: ${error.message}` : "Local save failed.", "error");
      });
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [announce, assets, persist, presenter, settings]);

  useEffect(() => {
    if (saveState !== "saving" && saveState !== "failed") return;
    const protectUnsavedWork = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectUnsavedWork);
    return () => window.removeEventListener("beforeunload", protectUnsavedWork);
  }, [saveState]);

  useEffect(() => {
    let live = true;
    void import("./lib/exportStudio").then(({ probeExportCapabilities }) => probeExportCapabilities({
      width: liveExportPlan.width,
      height: liveExportPlan.height,
      fps: liveExportPlan.fps,
      duration: liveExportPlan.duration,
    }))
      .then((report) => {
        if (!live) return;
        setExportCapabilities(report);
        setMp4Supported(report.mp4.supported);
      })
      .catch(() => {
        if (!live) return;
        setExportCapabilities(null);
        setMp4Supported(false);
      });
    return () => { live = false; };
  }, [liveExportPlan.duration, liveExportPlan.fps, liveExportPlan.height, liveExportPlan.width]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = Boolean(target?.closest("input, select, textarea, [contenteditable=true]"));
      if ((event.metaKey || event.ctrlKey) && !editing) {
        if (event.key === "-" || event.code === "NumpadSubtract") {
          event.preventDefault();
          changeInterfaceScale({ type: "smaller" });
          return;
        }
        if (event.key === "+" || event.key === "=" || event.code === "NumpadAdd") {
          event.preventDefault();
          changeInterfaceScale({ type: "larger" });
          return;
        }
        if (event.key === "0" || event.code === "Numpad0") {
          event.preventDefault();
          changeInterfaceScale({ type: "reset" });
          return;
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!exportProgress && !projectBusy && !abortRef.current && saveState !== "loading") {
          setCommandPaletteOpen((open) => !open);
        }
        return;
      }
      if (event.key === "Escape" && focusMode) {
        event.preventDefault();
        setFocusMode(false);
        return;
      }
      if (exportProgress || projectBusy || abortRef.current || projectPendingRef.current > 0 || saveState === "loading") return;
      if (target?.closest("[data-timeline-dock]")) return;
      if (target?.closest("input, select, textarea, button, [contenteditable=true]")) return;
      if (event.code === "Space") {
        event.preventDefault();
        const isPaused = engineRef.current?.togglePaused() ?? paused;
        setPaused(isPaused);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        engineRef.current?.stepSlides(-1);
      } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        engineRef.current?.stepSlides(1);
      } else if (event.key.toLowerCase() === "f") {
        setFocusMode((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeInterfaceScale, exportProgress, focusMode, paused, projectBusy, saveState]);

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    assetsRef.current.forEach(disposeAsset);
    if (presenterRef.current) disposeAsset(presenterRef.current);
  }, []);

  const recordV2History = useCallback((
    current: DriftProjectV4,
    next: DriftProjectV4,
    message: string,
  ): string[] => {
    const changedPaths = projectV4ChangePaths(current, next);
    if (changedPaths.length === 0) return changedPaths;
    const now = performance.now();
    const history = v2HistoryRef.current;
    const coalesced = history.lastGesture?.message === `${message}:${changedPaths.join(",")}`
      && now - history.lastGesture.at <= V2_GESTURE_COALESCE_MS;
    if (!coalesced) {
      history.past = [...history.past.slice(-(MAX_V2_HISTORY - 1)), captureDocumentHistory(current, assetsRef.current, presenterRef.current)];
      setComparisonProject(structuredClone(current));
    }
    history.future = [];
    history.lastGesture = { message: `${message}:${changedPaths.join(",")}`, at: now };
    trimDocumentHistory(history, assetsRef.current, presenterRef.current);
    setComparisonActive(false);
    setV2HistoryVersion((version) => version + 1);
    const domains = [...new Set(changedPaths.map((path) => path.split(/[.[]/, 1)[0]))];
    setChangeReceipt(`${message} ${changedPaths.length} value${changedPaths.length === 1 ? "" : "s"} · ${domains.join(", ")}.`);
    return changedPaths;
  }, []);

  const recordMediaHistory = useCallback((message: string) => {
    const current = projectRef.current;
    if (!current) return;
    const history = v2HistoryRef.current;
    history.past.push(captureDocumentHistory(current, assetsRef.current, presenterRef.current));
    history.future = [];
    history.lastGesture = null;
    trimDocumentHistory(history, assetsRef.current, presenterRef.current);
    // A different media tuple cannot audition against the live renderer's sources.
    setComparisonProject(null);
    setComparisonActive(false);
    setChangeReceipt(message);
    setV2HistoryVersion((version) => version + 1);
  }, []);

  const addImagesNow = useCallback(async (
    files: File[],
    options: { persistBeforeReply?: boolean; propagateFailure?: boolean } = {},
  ) => {
    const rejectImport = (message: string) => {
      announce(message, "error");
      if (options.propagateFailure) throw new Error(message);
    };
    if (!hydratedRef.current) {
      rejectImport("Recovery is locked. Open a verified project before adding slides; the preserved project will not be overwritten by fallback media.");
      return;
    }
    const startingAssets = assetsRef.current;
    const replacingStartingDemos = startingAssets.length > 0 && startingAssets.every((asset) => asset.demo);
    const retainedStartingAssets = replacingStartingDemos ? [] : startingAssets;
    const startingRoom = Math.max(0, MAX_SLIDES - retainedStartingAssets.length);
    if (startingRoom === 0) {
      rejectImport(`This version supports up to ${MAX_SLIDES} moving slides.`);
      return;
    }

    const supportedImages = files.filter((file) => /^(image|video)\//.test(file.type));
    if (!supportedImages.length) {
      rejectImport("No supported images or videos were selected.");
      return;
    }
    const existingMedia = [
      ...retainedStartingAssets,
      ...(presenterRef.current ? [presenterRef.current] : []),
    ];
    const selection = selectProjectMediaWithinBudget(
      supportedImages,
      projectAssetBytes(existingMedia),
      startingRoom,
    );
    const candidates = selection.accepted;
    if (!candidates.length) {
      const message = selection.rejectedTooLarge.length
        ? `Each slide must be ${formatProjectMiB(PROJECT_MEDIA_LIMITS.maxAssetBytes)} or smaller so the project can save and reopen.`
        : selection.rejectedForBudget.length
          ? `Those slides exceed the ${formatProjectMiB(PROJECT_MEDIA_LIMITS.maxTotalBytes)} portable-project media budget. Remove or compress existing media first.`
          : `This version supports up to ${MAX_SLIDES} moving slides.`;
      rejectImport(message);
      return;
    }

    const decoded = await mapMediaSettled(candidates, (file) => slideFileToAsset(file));
    const decodedAssets = decoded.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    if (!decodedAssets.length) {
      rejectImport("None of those media files could be decoded.");
      return;
    }
    const current = assetsRef.current;
    const replacingDemos = current.length > 0 && current.every((asset) => asset.demo);
    const retained = replacingDemos ? [] : current;
    const room = Math.max(0, MAX_SLIDES - retained.length);
    const accepted = decodedAssets.slice(0, room);
    const overflow = decodedAssets.slice(room);
    overflow.forEach(disposeAsset);
    const rejected = files.length - accepted.length;
    if (!accepted.length) {
      rejectImport(`This version supports up to ${MAX_SLIDES} moving slides; ${rejected} selected file${rejected === 1 ? " was" : "s were"} rejected.`);
      return;
    }
    const next = [...retained, ...accepted];
    const videoBudget = videoSlideBudget(next);
    if (videoBudget) {
      accepted.forEach(disposeAsset);
      rejectImport(videoBudget);
      return;
    }
    const nextSettings = settingsForCurrentAuthority();
    const nextPresenter = presenterRef.current;
    if (options.persistBeforeReply) {
      const baseProject = projectRef.current;
      if (!baseProject) {
        accepted.forEach(disposeAsset);
        rejectImport("Project V4 creative authority is unavailable.");
        return;
      }
      const nextProject = reconcileOutcomeRecipeTiming(reconcileStudioProject({
        project: baseProject,
        settings: nextSettings,
        slideAssets: next.map(describeProjectAsset),
        presenterAsset: nextPresenter ? describeProjectAsset(nextPresenter) : null,
        updatedAt: new Date().toISOString(),
      }));
      const reconciledSettings = studioSettingsFromDriftProject(nextProject);
      try {
        await persistExactProject(nextProject, next, nextPresenter);
      } catch (error) {
        accepted.forEach(disposeAsset);
        const message = error instanceof Error ? `Local save failed: ${error.message}` : "Local save failed.";
        announce(message, "error");
        if (options.propagateFailure) throw error;
        return;
      }
      recordMediaHistory("Added slides.");
      directPersistenceSnapshotRef.current = {
        settings: reconciledSettings,
        assets: next,
        presenter: nextPresenter,
      };
      recordDocumentMutation();
      assetsRef.current = next;
      publishLiveProject(nextProject);
      synchronizeProjectedSettings(nextProject);
      setAssets(next);
      if (replacingDemos) current.forEach(disposeAsset);
    } else {
      recordMediaHistory("Added slides.");
      if (replacingDemos) current.forEach(disposeAsset);
      markProjectDirty();
      assetsRef.current = next;
      reconcileLiveProject(nextSettings, next, nextPresenter);
      setAssets(next);
    }
    const usedBytes = projectAssetBytes([
      ...next,
      ...(presenterRef.current ? [presenterRef.current] : []),
    ]);
    announce(
      `${accepted.length} slide${accepted.length === 1 ? "" : "s"} added${rejected ? `; ${rejected} rejected by format, count, decode, or project-media budget` : ""}. ${formatProjectMiB(usedBytes)} of ${formatProjectMiB(PROJECT_MEDIA_LIMITS.maxTotalBytes)} project media used.`,
      rejected ? "quiet" : "good",
    );
  }, [recordMediaHistory, announce, markProjectDirty, persistExactProject, publishLiveProject, reconcileLiveProject, recordDocumentMutation, settingsForCurrentAuthority, synchronizeProjectedSettings]);

  const addImages = useCallback((files: File[]) => {
    void enqueueProjectOperation(() => addImagesNow(files));
  }, [addImagesNow, enqueueProjectOperation]);

  const addPresenterNow = useCallback(async (
    file: File,
    options: { persistBeforeReply?: boolean; propagateFailure?: boolean } = {},
  ) => {
    let decodedPresenter: StudioAsset | null = null;
    try {
      if (!hydratedRef.current) {
        throw new Error("Recovery is locked. Open a verified project before adding a presenter; the preserved project will not be overwritten by fallback media.");
      }
      const existingSlideBytes = projectAssetBytes(assetsRef.current);
      const violation = projectMediaViolation(file.size, existingSlideBytes);
      if (violation) throw new Error(`Presenter video was not added. ${violation}`);

      const next = await videoFileToAsset(file);
      decodedPresenter = next;
      const previous = presenterRef.current;

      const currentSettings = settingsForCurrentAuthority();
      const currentPin = currentSettings.presenter;
      const selectedSlideStillExists = currentPin.assetId !== null
        && assetsRef.current.some((asset) => asset.id === currentPin.assetId);
      const nextSettings: StudioSettings = {
        ...currentSettings,
        presenter: selectedSlideStillExists
          ? currentPin
          : {
              ...currentPin,
              ...(currentPin.assetId === null
                ? resolveFirstPinComposition(currentSettings.stage, next)
                : {}),
              enabled: true,
              assetId: next.id,
            },
      };
      if (options.persistBeforeReply) {
        const baseProject = projectRef.current;
        if (!baseProject) throw new Error("Project V4 creative authority is unavailable.");
        const nextProject = reconcileOutcomeRecipeTiming(reconcileStudioProject({
          project: baseProject,
          settings: nextSettings,
          slideAssets: assetsRef.current.map(describeProjectAsset),
          presenterAsset: describeProjectAsset(next),
          updatedAt: new Date().toISOString(),
        }));
        const reconciledSettings = studioSettingsFromDriftProject(nextProject);
        await persistExactProject(nextProject, assetsRef.current, next);
        recordMediaHistory("Replaced presenter.");
        directPersistenceSnapshotRef.current = {
          settings: reconciledSettings,
          assets: assetsRef.current,
          presenter: next,
        };
        recordDocumentMutation();
        presenterRef.current = next;
        publishLiveProject(nextProject);
        synchronizeProjectedSettings(nextProject);
        setPresenter(next);
        if (previous) disposeAsset(previous);
      } else {
        recordMediaHistory("Replaced presenter.");
        if (previous) disposeAsset(previous);
        presenterRef.current = next;
        setPresenter(next);
        markProjectDirty();
        reconcileLiveProject(nextSettings, assetsRef.current, next);
      }
      decodedPresenter = null;
      announce(
        `${selectedSlideStillExists ? "Presenter video added; the selected still image was kept." : "Presenter video added and kept still."} Audio will be checked—not silently dropped—at export. ${formatProjectMiB(existingSlideBytes + next.blob.size)} of ${formatProjectMiB(PROJECT_MEDIA_LIMITS.maxTotalBytes)} project media used.`,
        "good",
      );
    } catch (error) {
      if (decodedPresenter) disposeAsset(decodedPresenter);
      announce(error instanceof Error ? error.message : "Presenter video could not be opened.", "error");
      if (options.propagateFailure) throw error;
    }
  }, [recordMediaHistory, announce, markProjectDirty, persistExactProject, publishLiveProject, reconcileLiveProject, recordDocumentMutation, settingsForCurrentAuthority, synchronizeProjectedSettings]);

  const addPresenter = useCallback((file: File) => {
    void enqueueProjectOperation(() => addPresenterNow(file));
  }, [addPresenterNow, enqueueProjectOperation]);

  const removeAsset = useCallback((id: string) => {
    const current = assetsRef.current;
    const removed = current.find((asset) => asset.id === id);
    if (!removed) return;
    recordMediaHistory("Removed slide.");
    disposeAsset(removed);
    const nextAssets = current.filter((asset) => asset.id !== id);
    markProjectDirty();
    assetsRef.current = nextAssets;
    const nextSettings = clearPinnedAssetIfRemoved(settingsForCurrentAuthority(), id);
    reconcileLiveProject(nextSettings, nextAssets, presenterRef.current);
    setAssets(nextAssets);
  }, [recordMediaHistory, markProjectDirty, reconcileLiveProject, settingsForCurrentAuthority]);

  const reorder = useCallback((fromId: string, toId: string) => {
    const current = assetsRef.current;
    const from = current.findIndex((asset) => asset.id === fromId);
    const to = current.findIndex((asset) => asset.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    recordMediaHistory("Reordered slides.");
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    markProjectDirty();
    assetsRef.current = next;
    reconcileLiveProject(settingsForCurrentAuthority(), next, presenterRef.current);
    setAssets(next);
  }, [recordMediaHistory, markProjectDirty, reconcileLiveProject, settingsForCurrentAuthority]);

  const pin = useCallback((asset: StudioAsset | null) => {
    if (asset?.kind === "video" && asset.id !== presenterRef.current?.id) {
      announce("Moving video slides loop independently. Add the clip as Presenter to pin it.", "quiet");
      return;
    }
    recordMediaHistory("Changed pinned frame.");
    const current = settingsForCurrentAuthority();
    const nextSettings: StudioSettings = {
      ...current,
      presenter: {
        ...current.presenter,
        ...(asset && current.presenter.assetId === null
          ? resolveFirstPinComposition(current.stage, asset)
          : {}),
        enabled: Boolean(asset),
        assetId: asset?.id ?? current.presenter.assetId,
      },
    };
    markProjectDirty();
    reconcileLiveProject(nextSettings, assetsRef.current, presenterRef.current);
    if (asset) {
      if (asset.kind === "image") setSelectedSlideId(asset.id);
      announce(`${asset.name} will stay still. Pinned-frame controls remain in Slides.`);
    } else {
      announce("Pinned media returned to its moving track.");
    }
  }, [recordMediaHistory, announce, markProjectDirty, reconcileLiveProject, settingsForCurrentAuthority]);

  const resetPinnedFrame = useCallback(() => {
    const current = settingsForCurrentAuthority();
    const assetId = current.presenter.assetId;
    const asset = assetId === null
      ? null
      : [...assetsRef.current, ...(presenterRef.current ? [presenterRef.current] : [])]
        .find((candidate) => candidate.id === assetId) ?? null;
    if (!asset) {
      announce("Choose a still image or presenter video before resetting the pinned frame.", "error");
      return;
    }
    recordMediaHistory("Reset pinned frame.");
    const nextSettings = resetPinnedFrameComposition(current, asset);
    markProjectDirty();
    reconcileLiveProject(nextSettings, assetsRef.current, presenterRef.current);
    announce("Pinned frame reset to its source ratio, protected layer, and still-only track.", "good");
  }, [recordMediaHistory, announce, markProjectDirty, reconcileLiveProject, settingsForCurrentAuthority]);

  const removePresenter = useCallback(() => {
    const removedPresenter = presenterRef.current;
    const removedPresenterId = removedPresenter?.id ?? null;
    if (!removedPresenter) return;
    recordMediaHistory("Removed presenter.");
    disposeAsset(removedPresenter);
    presenterRef.current = null;
    setPresenter(null);

    const nextSettings = clearPinnedAssetIfRemoved(settingsForCurrentAuthority(), removedPresenterId);
    markProjectDirty();
    reconcileLiveProject(nextSettings, assetsRef.current, null);
  }, [recordMediaHistory, markProjectDirty, reconcileLiveProject, settingsForCurrentAuthority]);

  const renderForExport = useCallback(async (
    time: number,
    frame?: { image: HTMLCanvasElement | OffscreenCanvas },
    context?: RenderAtContext,
  ) => {
    const engine = engineRef.current;
    if (!engine) throw new Error("Cinematic renderer is unavailable.");
    engine.setPresenterExportFrame(frame?.image ?? null);
    await engine.renderAtAsync(
      time,
      context?.sampleKind === "sequence" ? context.frameIndex : null,
      context?.signal,
    );
    if (
      context?.sampleKind === "sequence"
      && context.frameIndex === context.frameCount - 1
    ) {
      // The last frame is already in the WebGL framebuffer. Release the
      // decoded-presenter CanvasTexture before the H.264 encoder flushes so a
      // lingering GPU-backed video surface cannot hold finalization open.
      engine.setPresenterExportFrame(null);
      engine.releaseVideoSlideDecoders();
    }
  }, []);

  automationPreviewRenderRef.current = async (input) => {
    if (abortRef.current || exportDestinationPendingRef.current || projectPendingRef.current > 0) {
      throw new Error("Renderer is busy with another bounded operation.");
    }
    const engine = engineRef.current;
    if (!engine) throw new Error("Cinematic renderer is unavailable.");
    const previewAssets = [...assetsRef.current, ...(presenterRef.current ? [presenterRef.current] : [])];
    const previewPresentation = stagePresentationFromProject(input.project);
    const previewPinned = previewPresentation.pinnedAssetId === null
      ? null
      : previewAssets.find((asset) => asset.id === previewPresentation.pinnedAssetId) ?? null;
    const abort = () => {
      if (input.signal.aborted) throw new DOMException("Automation preview cancelled.", "AbortError");
    };
    abort();
    await installPreviewAuthority(engine, {
      project: input.project,
      settings: studioSettingsFromDriftProject(input.project),
      assets: assetsRef.current.filter((asset) => input.project.media.order.includes(asset.id)),
      pinnedAsset: previewPinned,
    });
    try {
      abort();
      const blob = await engine.captureStill(input.width, input.height, input.timeSeconds);
      abort();
      return { mimeType: "image/png", bytes: new Uint8Array(await blob.arrayBuffer()) };
    } finally {
      const current = projectRef.current;
      if (current) {
        const currentAssets = [...assetsRef.current, ...(presenterRef.current ? [presenterRef.current] : [])];
        const currentPresentation = stagePresentationFromProject(current);
        const currentPinned = currentPresentation.pinnedAssetId === null
          ? null
          : currentAssets.find((asset) => asset.id === currentPresentation.pinnedAssetId) ?? null;
        await installPreviewAuthority(engine, {
          project: current,
          settings: studioSettingsFromDriftProject(current),
          assets: assetsRef.current.filter((asset) => current.media.order.includes(asset.id)),
          pinnedAsset: currentPinned,
        });
      }
    }
  };

  const reserveExport = useCallback((intent: ExportIntent = guidedExportIntent, trackGuidedJob = true): {
    controller: AbortController;
    authority: ExportAuthoritySnapshot;
    snapshot: GuidedExportSnapshot;
  } => {
    if (abortRef.current || exportDestinationPendingRef.current) {
      throw new DOMException("An export is already preparing or running.", "InvalidStateError");
    }
    if (projectPendingRef.current > 0) {
      throw new DOMException("A project or media operation is still in progress.", "InvalidStateError");
    }
    const project = projectRef.current;
    if (!project) throw new Error("Project V4 creative authority is unavailable.");
    const controller = new AbortController();
    const authority = captureExportAuthority({
      project,
      settings: settingsRef.current,
      assets: assetsRef.current,
      presenter: presenterRef.current,
    });
    const snapshot = captureGuidedExportSnapshot({
      id: `export-${globalThis.crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      documentRevision: documentRevisionRef.current.currentRevision,
      intent,
      authority,
    });
    const initialProgress: ExportProgress = {
      phase: "preparing",
      ratio: 0,
      completed: 0,
      total: 1,
      frameIndex: null,
      message: "Preparing one locked creative snapshot",
      unit: "steps",
      determinate: false,
      elapsedSeconds: 0,
      etaSeconds: null,
      ratePerSecond: null,
      stallKind: null,
    };
    if (trackGuidedJob) exportJobController.begin(snapshot, controller, initialProgress);
    abortRef.current = controller;
    const now = performance.now();
    exportProgressClockRef.current = createExportProgressClock(now);
    setExportProgress(initialProgress);
    return { controller, authority, snapshot };
  }, [exportJobController, guidedExportIntent]);

  const beginExport = useCallback(async (reservation: {
    controller: AbortController;
    authority: ExportAuthoritySnapshot;
    snapshot: GuidedExportSnapshot;
  }) => {
    if (abortRef.current !== reservation.controller) {
      throw new DOMException("Export reservation is no longer active.", "InvalidStateError");
    }
    const engine = engineRef.current;
    if (!engine) throw new Error("Cinematic renderer is unavailable; export is blocked.");
    const { authority, controller } = reservation;
    const assertCurrent = () => {
      if (controller.signal.aborted) {
        throw new DOMException("Export canceled.", "AbortError");
      }
      const project = projectRef.current;
      if (!project) throw new Error("Project V4 creative authority is unavailable.");
      assertExportAuthorityUnchanged(authority, {
        project,
        settings: settingsRef.current,
        assets: assetsRef.current,
        presenter: presenterRef.current,
      });
    };
    assertCurrent();
    const { project, settings, assets, presenter } = authority;
    const plan = project.renderContract === DRIFT_V2_RENDER_CONTRACT
      ? exportPlanFromProject(project)
      : exportPlanFromV1Settings(settings);
    assertGuidedExportIntentMatchesPlan(reservation.snapshot.intent, {
      width: plan.width,
      height: plan.height,
      fps: plan.fps,
      duration: plan.duration,
      presenterAudio: plan.presenter.includeAudio,
      soundDesignAudio: project.sound.exportEnabled,
    });
    if (project.renderContract === DRIFT_V2_RENDER_CONTRACT) {
      await engine.setV2ProjectState(project, assets);
    } else {
      await engine.setV1CompatibilityState(settings, project, assets);
    }
    assertCurrent();
    const availableAssets = [
      ...assets,
      ...(presenter ? [presenter] : []),
    ];
    const pinned = plan.presenter.assetId === null
      ? null
      : availableAssets.find((asset) => asset.id === plan.presenter.assetId) ?? null;
    await engine.setPresenterAsset(plan.presenter.enabled ? pinned : null);
    assertCurrent();
    const surface = engine.beginExport(plan.width, plan.height);
    return { engine, controller, surface, plan, pinnedAsset: pinned };
  }, []);

  const endExport = useCallback(async (
    reservation: { controller: AbortController; snapshot: GuidedExportSnapshot },
    surface?: { restore: () => void },
  ) => {
    exportProgressClockRef.current = null;
    setExportProgress(null);
    try {
      surface?.restore();
      const engine = engineRef.current;
      if (engine) {
        await installPreviewAuthority(engine, {
          project: displayedProject,
          settings,
          assets,
          pinnedAsset: activePinnedAsset,
        });
      }
    } catch {
      announce("Export finished, but the live preview could not be restored. Reload Drift before directing further.", "error");
    } finally {
      if (abortRef.current === reservation.controller) abortRef.current = null;
    }
  }, [activePinnedAsset, announce, assets, displayedProject, settings]);

  const exportVideo = useCallback(async (
    request?: GuidedExportRunRequest,
    automationHooks?: AutomationExportReservationHooks,
  ): Promise<GuidedExportCompletion | null> => {
    const intent = request?.intent ?? guidedExportIntent;
    if (intent.preferredFormat !== "h264-mp4" || intent.background !== "opaque") {
      announce("H.264 is opaque. Choose an opaque background or PNG Frames before rendering.", "error");
      return null;
    }
    if (!engineRef.current) {
      announce("Cinematic renderer is unavailable; export is blocked.", "error");
      return null;
    }
    if (mp4Supported === false) {
      announce(
        nativeMac
          ? "This Mac’s system WebKit cannot encode the requested H.264 master. Export PNG frames, or try a supported macOS update."
          : "This browser cannot encode the requested H.264 master. Use current desktop Chromium or Brave, or export PNG frames.",
        "error",
      );
      return null;
    }
    let fileHandle: FileSystemFileHandle | null = null;
    const savePicker = (window as PickerWindow).showSaveFilePicker;
    if (savePicker) {
      try {
        if (exportDestinationPendingRef.current) {
          throw new DOMException("An export destination is already being selected.", "InvalidStateError");
        }
        exportDestinationPendingRef.current = true;
        fileHandle = await savePicker({
          id: "pitchdog-drift-master",
          suggestedName: `drift-master-${timestampSlug()}.mp4`,
          types: [{ description: "H.264 MP4 master", accept: { "video/mp4": [".mp4"] } }],
        });
      } catch (error) {
        announce(isAbortError(error) ? "MP4 destination canceled." : error instanceof Error ? error.message : "Could not choose an MP4 destination.", isAbortError(error) ? "quiet" : "error");
        return null;
      } finally {
        exportDestinationPendingRef.current = false;
      }
    }
    let reservation: ReturnType<typeof reserveExport>;
    try {
      automationHooks?.beforeReservation();
      reservation = reserveExport(intent);
      automationHooks?.onReserved(reservation.snapshot.id);
    } catch (error) {
      announce(error instanceof Error ? error.message : "Could not start MP4 export.", "error");
      return null;
    }
    let session: Awaited<ReturnType<typeof beginExport>> | null = null;
    try {
      session = await beginExport(reservation);
      const pinnedVideo = session.pinnedAsset?.kind === "video" ? session.pinnedAsset : null;
      const { createFileSystemMp4Target, exportMp4 } = await import("./lib/exportStudio");
      const soundtrack = reservation.authority.project.sound.exportEnabled
        ? await renderTactileSoundtrack(reservation.authority.project, session.controller.signal)
        : null;
      const target = fileHandle ? await createFileSystemMp4Target(fileHandle, session.controller.signal) : undefined;
      const result = await exportMp4({
        canvas: session.engine.canvas,
        renderAt: renderForExport,
        settings: {
          width: session.plan.width,
          height: session.plan.height,
          fps: session.plan.fps,
          duration: session.plan.duration,
        },
        presenter: pinnedVideo?.blob,
        presenterTiming: pinnedVideo ? {
          trimStart: session.plan.presenter.trimStart,
          startAt: session.plan.presenter.startAt,
          endAt: session.plan.presenter.endAt,
        } : undefined,
        includePresenterAudio: session.plan.presenter.includeAudio,
        soundtrack: soundtrack ?? undefined,
        soundtrackGainWhenMixed: reservation.authority.project.sound.underVoice,
        signal: session.controller.signal,
        onProgress: acceptEncoderProgress,
        target,
      });
      if (result.blob) await downloadBlob(result.blob, `drift-master-${timestampSlug()}.mp4`);
      const completion: GuidedExportCompletion = {
        snapshotId: reservation.snapshot.id,
        format: "h264-mp4",
        artifact: "H.264 MP4 master",
        width: result.width,
        height: result.height,
        fps: result.fps,
        frameCount: result.frameCount,
        duration: result.duration,
        bytes: result.blob?.size ?? null,
        publication: fileHandle ? "committed" : "download-requested",
        verified: true,
      };
      exportJobController.complete(reservation.snapshot.id, completion);
      announce(`${result.width} × ${result.height} H.264 master verified: ${result.verification.frameCount} frames at ${result.fps} fps${result.audio ? ` · ${result.audio.source} AAC` : ""}.`, "good");
      return completion;
    } catch (error) {
      const status = exportJobController.getStatus(reservation.snapshot.id);
      if (status?.state === "running" || status?.state === "canceling") {
        exportJobController.fail(reservation.snapshot.id, error);
      }
      announce(
        isAbortError(error) ? "MP4 export canceled." : error instanceof Error ? error.message : "MP4 export failed.",
        isAbortError(error) ? "quiet" : "error",
      );
      return null;
    } finally {
      await endExport(reservation, session?.surface);
    }
  }, [acceptEncoderProgress, announce, beginExport, endExport, exportJobController, guidedExportIntent, mp4Supported, nativeMac, renderForExport, reserveExport]);

  const exportStill = useCallback(async (background?: "opaque" | "transparent") => {
    let reservation: ReturnType<typeof reserveExport> | null = null;
    let session: Awaited<ReturnType<typeof beginExport>> | null = null;
    try {
      reservation = reserveExport(background ? { ...guidedExportIntent, background } : guidedExportIntent, false);
      session = await beginExport(reservation);
      const pinnedVideo = session.pinnedAsset?.kind === "video" ? session.pinnedAsset : null;
      const { exportPngStill } = await import("./lib/exportStudio");
      const stillTime = defaultPerformanceStillTime(
        createPerformanceLifecycle(session.plan.performance),
      );
      const result = await exportPngStill({
        canvas: session.engine.canvas,
        renderAt: renderForExport,
        settings: {
          width: session.plan.width,
          height: session.plan.height,
          fps: session.plan.fps,
          duration: session.plan.duration,
        },
        presenter: pinnedVideo?.blob,
        presenterTiming: pinnedVideo ? {
          trimStart: session.plan.presenter.trimStart,
          startAt: session.plan.presenter.startAt,
          endAt: session.plan.presenter.endAt,
        } : undefined,
        time: stillTime,
        signal: session.controller.signal,
        requireAlpha: true,
        requireTransparentPixels: session.plan.requireTransparentPixels,
        onProgress: acceptEncoderProgress,
      });
      await downloadBlob(result.blob, `drift-still-${timestampSlug()}.png`);
      announce(`${result.width} × ${result.height} PNG saved with an alpha-capable channel.`, "good");
    } catch (error) {
      announce(isAbortError(error) ? "PNG save canceled." : error instanceof Error ? error.message : "PNG capture failed.", isAbortError(error) ? "quiet" : "error");
    } finally {
      if (reservation) await endExport(reservation, session?.surface);
    }
  }, [acceptEncoderProgress, announce, beginExport, endExport, guidedExportIntent, renderForExport, reserveExport]);

  const exportFrames = useCallback(async (
    request?: GuidedExportRunRequest,
    automationHooks?: AutomationExportReservationHooks,
  ): Promise<GuidedExportCompletion | null> => {
    const intent = request?.intent ?? {
      ...guidedExportIntent,
      purpose: "frame-sequence",
      preferredFormat: "png-frames",
      destinationClass: "directory",
    };
    if (intent.preferredFormat !== "png-frames") {
      announce("Choose PNG Frames before starting a frame-sequence export.", "error");
      return null;
    }
    if (intent.audio.enabled && !request?.audioConsequenceAcknowledged) {
      announce("PNG Frames contain no embedded audio. Review and confirm that consequence in Guided Export.", "error");
      return null;
    }
    const picker = (window as PickerWindow).showDirectoryPicker;
    const requestedDestination = request?.pngDestination ?? (picker ? "directory" : "zip");
    let directory: FileSystemDirectoryHandle | null = null;
    if (requestedDestination === "directory") {
      if (!picker) {
        announce("This runtime cannot grant a frame directory. Choose a bounded ZIP instead.", "error");
        return null;
      }
      try {
        if (exportDestinationPendingRef.current) {
          throw new DOMException("An export destination is already being selected.", "InvalidStateError");
        }
        exportDestinationPendingRef.current = true;
        directory = await picker({ id: "pitchdog-drift-frames", mode: "readwrite" });
      } catch (error) {
        announce(isAbortError(error) ? "PNG sequence destination canceled." : error instanceof Error ? error.message : "Could not choose a PNG sequence destination.", isAbortError(error) ? "quiet" : "error");
        return null;
      } finally {
        exportDestinationPendingRef.current = false;
      }
    }
    let reservation: ReturnType<typeof reserveExport> | null = null;
    let session: Awaited<ReturnType<typeof beginExport>> | null = null;
    try {
      automationHooks?.beforeReservation();
      reservation = reserveExport(intent);
      automationHooks?.onReserved(reservation.snapshot.id);
      session = await beginExport(reservation);
      const pinnedVideo = session.pinnedAsset?.kind === "video" ? session.pinnedAsset : null;
      const { exportPngSequence } = await import("./lib/exportStudio");
      const common = {
        canvas: session.engine.canvas,
        renderAt: renderForExport,
        settings: {
          width: session.plan.width,
          height: session.plan.height,
          fps: session.plan.fps,
          duration: session.plan.duration,
        },
        presenter: pinnedVideo?.blob,
        presenterTiming: pinnedVideo ? {
          trimStart: session.plan.presenter.trimStart,
          startAt: session.plan.presenter.startAt,
          endAt: session.plan.presenter.endAt,
        } : undefined,
        signal: session.controller.signal,
        requireAlpha: true,
        requireTransparentPixels: session.plan.requireTransparentPixels,
        onProgress: acceptEncoderProgress,
      };
      if (directory) {
        const result = await exportPngSequence({ ...common, destination: "directory", directory, framePrefix: "drift" });
        const completion: GuidedExportCompletion = {
          snapshotId: reservation.snapshot.id,
          format: "png-frames",
          artifact: "Numbered PNG frame directory",
          width: result.width,
          height: result.height,
          fps: result.fps,
          frameCount: result.frameCount,
          duration: result.duration,
          bytes: result.bytesWritten,
          publication: "directory-written",
          verified: true,
        };
        exportJobController.complete(reservation.snapshot.id, completion);
        announce(`${result.frameCount} numbered PNG frames written and verified.`, "good");
        return completion;
      } else {
        const result = await exportPngSequence({ ...common, destination: "zip", framePrefix: "drift" });
        if (!result.blob) throw new Error("PNG ZIP completed without bytes.");
        await downloadBlob(result.blob, `drift-frames-${timestampSlug()}.zip`);
        const completion: GuidedExportCompletion = {
          snapshotId: reservation.snapshot.id,
          format: "png-frames",
          artifact: "Verified PNG frame ZIP",
          width: result.width,
          height: result.height,
          fps: result.fps,
          frameCount: result.frameCount,
          duration: result.duration,
          bytes: result.bytesWritten,
          publication: "download-requested",
          verified: true,
        };
        exportJobController.complete(reservation.snapshot.id, completion);
        announce(`${result.frameCount} numbered PNG frames saved in a verified ZIP.`, "good");
        return completion;
      }
    } catch (error) {
      if (reservation) {
        const status = exportJobController.getStatus(reservation.snapshot.id);
        if (status?.state === "running" || status?.state === "canceling") {
          exportJobController.fail(reservation.snapshot.id, error);
        }
      }
      announce(isAbortError(error) ? "PNG sequence export canceled." : error instanceof Error ? error.message : "PNG sequence export failed.", isAbortError(error) ? "quiet" : "error");
      return null;
    } finally {
      if (reservation) await endExport(reservation, session?.surface);
    }
  }, [acceptEncoderProgress, announce, beginExport, endExport, exportJobController, guidedExportIntent, renderForExport, reserveExport]);

  const runGuidedExport = useCallback((request: GuidedExportRunRequest, automationHooks?: AutomationExportReservationHooks) => {
    if (request.intent.preferredFormat === "h264-mp4") return exportVideo(request, automationHooks);
    if (request.intent.preferredFormat === "png-frames") return exportFrames(request, automationHooks);
    announce("That format is visible for planning, but this build cannot render it.", "error");
    return Promise.resolve(null);
  }, [announce, exportFrames, exportVideo]);
  automationExportRunRef.current = (request, hooks) => runGuidedExport(request, hooks);

  const savePortableProjectNow = useCallback(async (operation: "save" | "save-as" = "save") => {
    try {
      const recovery = !hydratedRef.current ? recoverySnapshotRef.current : null;
      if (!hydratedRef.current && !recovery) {
        throw new Error("The recovery project is locked. Open a verified project or save the recovery copy before continuing.");
      }
      // persist() captures and reconciles synchronously. Bind the ticket before
      // hashing/archiving awaits, so a subsequent edit cannot become falsely saved.
      const snapshotPromise = recovery ? Promise.resolve(recovery) : persist();
      const prepared = desktopPlatform.documents.preparePortableProjectSave(documentRevisionRef.current);
      documentRevisionRef.current = prepared.revisions;
      if (prepared.ticket) setDocumentRevisionVersion((version) => version + 1);
      const snapshot = await snapshotPromise;
      const blob = await exportProject(snapshot);
      const receipt = requireDesktopPlatformCompletion(
        await desktopPlatform.documents.savePortableProject({
          operation,
          transactionId: `project-${globalThis.crypto.randomUUID()}`,
          ticket: prepared.ticket,
          blob,
          suggestedName: `drift-project-${timestampSlug()}.pitched`,
        }),
      );
      documentRevisionRef.current = desktopPlatform.documents.completePortableProjectSave(
        documentRevisionRef.current,
        prepared.ticket,
        receipt,
      );
      if (receipt.bound) {
        documentSha256Ref.current = receipt.sha256;
        setDocumentBound(true);
        setDocumentConflict(false);
        setDocumentRevisionVersion((version) => version + 1);
      }
      announce(
        receipt.bound && receipt.readbackVerified
          ? hydratedRef.current
            ? `Portable Project V4 ${operation === "save-as" ? "saved as a new document" : "saved"} with exact native readback.`
            : "Locked saved project re-verified and saved without replacing fallback media."
          : hydratedRef.current
            ? "Portable Project V4 download started with original media and SHA-256 manifest."
            : "Locked saved project was packaged for download without replacing fallback media.",
        "good",
      );
    } catch (error) {
      if (error instanceof DesktopPlatformDocumentError && error.code === "conflict") {
        setDocumentConflict(true);
      }
      announce(isAbortError(error) ? "Portable project save canceled." : error instanceof Error ? error.message : "Portable project could not be saved.", isAbortError(error) ? "quiet" : "error");
      throw error;
    }
  }, [announce, desktopPlatform, persist]);

  const savePortableProject = useCallback(() => {
    void enqueueProjectOperation(savePortableProjectNow).catch(() => undefined);
  }, [enqueueProjectOperation, savePortableProjectNow]);

  const savePortableProjectAs = useCallback(() => {
    void enqueueProjectOperation(() => savePortableProjectNow("save-as")).catch(() => undefined);
  }, [enqueueProjectOperation, savePortableProjectNow]);

  const openPortableProjectFile = useCallback(async (
    file: File,
    propagateFailure = false,
    finalizeDesktopDocument = true,
  ) => {
    try {
      const verified = await importProject<StudioProjectPayload>(file);
      // Parse, validate, hash-match, and decode the complete candidate before
      // the open project is saved, replaced, or otherwise mutated.
      const prepared = await prepareProjectState(verified);
      let preparedInstalled = false;
      try {
        const wasHydrated = hydratedRef.current;
        const previous = wasHydrated
          ? await persist()
          : await (() => {
              const updatedAt = new Date().toISOString();
              const baseProject = projectRef.current ?? createInitialProject(makeLocalProjectId(), updatedAt);
              const project = reconcileOutcomeRecipeTiming(reconcileStudioProject({
                project: baseProject,
                settings: settingsForCurrentAuthority(),
                slideAssets: assetsRef.current.map(describeProjectAsset),
                presenterAsset: presenterRef.current ? describeProjectAsset(presenterRef.current) : null,
                updatedAt,
              }));
              publishLiveProject(project);
              return createProjectBundle({
                payload: createDriftProjectPayload(project),
                assets: [...assetsRef.current, ...(presenterRef.current ? [presenterRef.current] : [])].map((asset) => ({
                  id: asset.id,
                  name: asset.name,
                  blob: asset.blob,
                })),
                engineVersion: ENGINE_VERSION,
                themeVersion: THEME_VERSION,
                projectId: project.projectId,
                createdAt: project.createdAt,
                updatedAt: project.updatedAt,
              });
            })();
        try {
          let stagedToken: string | null = null;
          const transaction = { receipt: null as DesktopDocumentOpenReceipt | null };
          await commitProjectReplacement({
            persistCandidate: async () => {
              // Never replace the recovery document before native acceptance.
              stagedToken = await projectStore.stageReplacement({
                payload: createDriftProjectPayload(prepared.project),
                assets: [...prepared.slides, ...(prepared.presenter ? [prepared.presenter] : [])].map(({ id, name, blob }) => ({ id, name, blob })),
                engineVersion: ENGINE_VERSION, themeVersion: THEME_VERSION,
                projectId: prepared.project.projectId, createdAt: prepared.project.createdAt, updatedAt: prepared.project.updatedAt,
              });
            },
            bindCandidate: async () => {
              if (finalizeDesktopDocument) {
                transaction.receipt = requireDesktopPlatformCompletion(await desktopPlatform.documents.finalizePortableProjectOpen(file));
              }
              await projectStore.commitReplacement(stagedToken!);
            },
            restorePrevious: async () => {
              // The failed transaction left A intact; roll back the transient
              // Finder binding as well, then remove only B's staging records.
              await desktopPlatform.documents.abandonPortableProjectOpen();
              await projectStore.abandonReplacement(stagedToken!);
              setSaveState(wasHydrated ? "saved" : "recovery");
            },
          });
          installPreparedProjectState(prepared);
          preparedInstalled = true;
          if (transaction.receipt) {
            const receipt = transaction.receipt;
            if (receipt.bound) {
              const contentIdentity = documentContentIdentity(prepared.project);
              documentRevisionRef.current = { ...createProjectRevisionState(), currentContentIdentity: contentIdentity, savedContentIdentity: contentIdentity };
              documentSha256Ref.current = receipt.sha256;
              setDocumentBound(true);
              setDocumentConflict(false);
              setDocumentRevisionVersion(version => version + 1);
            }
          }
          commitNativeMacDocumentOpen();
          setSaveState("saved");
          hydratedRef.current = true;
          recoverySnapshotRef.current = null;
        } catch (error) {
          if (error instanceof AggregateError) {
            hydratedRef.current = false;
            recoverySnapshotRef.current = previous;
            setSaveState("recovery");
          }
          throw error;
        }
      } finally {
        if (!preparedInstalled) disposePreparedProjectState(prepared);
      }
      announce("Portable project verified, migrated when necessary, and copied into local Project V4 storage.", "good");
    } catch (error) {
      if (finalizeDesktopDocument) await desktopPlatform.documents.abandonPortableProjectOpen();
      announce(error instanceof Error ? `Project rejected: ${error.message}` : "Project was rejected.", "error");
      if (propagateFailure) throw error;
    }
  }, [announce, desktopPlatform, installPreparedProjectState, persist, persistExactProject, prepareProjectState, publishLiveProject, replaceProjectState, settingsForCurrentAuthority]);

  const requestPortableProject = useCallback(() => {
    void desktopPlatform.documents.choosePortableProject()
      .then((result) => {
        if (result.status === "cancelled") return;
        const { file } = requireDesktopPlatformCompletion(result);
        void enqueueProjectOperation(() => openPortableProjectFile(file, true), true).catch(() => undefined);
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) announce(error instanceof Error ? error.message : "Project could not be opened.", "error");
      });
  }, [announce, desktopPlatform, enqueueProjectOperation, openPortableProjectFile]);

  const revertPortableProject = useCallback(() => {
    void enqueueProjectOperation(async () => {
      const expectedSha256 = documentSha256Ref.current;
      if (!documentBound || !expectedSha256 || !nativeDocumentState.revertible) {
        throw new DOMException("This project has no conflict-free saved document to revert to.", "InvalidStateError");
      }
      try {
        const result = requireDesktopPlatformCompletion(
          await desktopPlatform.documents.revertPortableProject({
            transactionId: `revert-${globalThis.crypto.randomUUID()}`,
            expectedSha256,
          }),
        );
        const file = new File([result.blob], "Reverted Project.pitched", {
          type: "application/vnd.pitchdog.pitched+zip",
        });
        await openPortableProjectFile(file, true, false);
        const identity = documentContentIdentity(projectRef.current!);
        documentRevisionRef.current = { ...createProjectRevisionState(), currentContentIdentity: identity, savedContentIdentity: identity };
        documentSha256Ref.current = result.receipt.sha256;
        setDocumentConflict(false);
        setDocumentRevisionVersion((version) => version + 1);
        announce("Reverted to the last native-verified .pitched bytes.", "good");
      } catch (error) {
        if (error instanceof DesktopPlatformDocumentError && error.code === "conflict") {
          setDocumentConflict(true);
        }
        throw error;
      }
    }, true).catch((error: unknown) => {
      announce(error instanceof Error ? error.message : "Project could not be reverted.", "error");
    });
  }, [announce, desktopPlatform, documentBound, enqueueProjectOperation, nativeDocumentState.revertible, openPortableProjectFile]);

  const openPortableProject = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    void enqueueProjectOperation(() => openPortableProjectFile(file));
  }, [enqueueProjectOperation, openPortableProjectFile]);

  const togglePause = useCallback(() => {
    const next = engineRef.current?.togglePaused() ?? !paused;
    setPaused(next);
  }, [paused]);

  const setPreviewPaused = useCallback((next: boolean) => {
    engineRef.current?.setPaused(next);
    setPaused(next);
  }, []);

  const seekPreview = useCallback((time: number) => {
    const engine = engineRef.current;
    if (engine) {
      engine.seekPreview(time);
      return;
    }
    setPreviewTime(clampPreviewSeekTime(time, visualTimeline.totalDuration));
  }, [visualTimeline.totalDuration]);

  const onTheme = useCallback((id: ThemeId) => {
    const currentProject = projectRef.current;
    if (id === "editorial-drift" && currentProject) {
      const { width, height } = stagePresentationFromProject(currentProject);
      const authoredRatio = worldRatioForDimensions(width, height);
      const ratio = authoredRatio ?? nearestWorldRatioForDimensions(width, height);
      const source = structuredClone(currentProject);
      // Selecting an authored opaque World is an explicit scene reset. Match
      // the existing V1 theme contract: transparent output remains available,
      // but must be chosen again after the paper room is restored.
      source.composition = { ...source.composition, width, height, alphaMode: "opaque" };
      let applied = applyEditorialDriftFoundation(source, ratio, new Date().toISOString());
      if (!authoredRatio) {
        applied = detachEditorialDriftRatioProvenance(applied, applied.updatedAt);
      }
      const nextSettings = studioSettingsFromDriftProject(applied);
      publishLiveProject(applied);
      markProjectDirty();
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      announce(authoredRatio
        ? `Editorial Drift · ${ratio} restored from its authored V2 recipe.`
        : `Editorial Drift direction applied at ${width} × ${height}; output size preserved as Custom.`);
      return;
    }
    const theme = getTheme(id);
    const nextSettings = applyTheme(settingsForCurrentAuthority(), theme);
    markProjectDirty();
    reconcileLiveProject(nextSettings, assetsRef.current, presenterRef.current);
    announce(`${theme.name} is now directing the scene.`);
  }, [announce, markProjectDirty, publishLiveProject, reconcileLiveProject, settingsForCurrentAuthority]);

  const updateSettings = useCallback((nextSettings: StudioSettings) => {
    const currentProject = projectRef.current;
    const currentSettings = settingsForCurrentAuthority();
    const ratio = worldRatioForDimensions(nextSettings.stage.width, nextSettings.stage.height);
    const stageChanged = nextSettings.stage.width !== currentSettings.stage.width
      || nextSettings.stage.height !== currentSettings.stage.height;
    if (
      stageChanged
      && currentProject
      && canRecutEditorialDrift(currentProject)
    ) {
      if (ratio) {
        const source = structuredClone(currentProject);
        source.composition = {
          ...source.composition,
          width: nextSettings.stage.width,
          height: nextSettings.stage.height,
        };
        const applied = applyEditorialDriftFoundation(source, ratio, new Date().toISOString());
        const projected = studioSettingsFromDriftProject(applied);
        recordV2History(currentProject, applied, "Stage ratio recut.");
        publishLiveProject(applied);
        markProjectDirty();
        settingsRef.current = projected;
        setSettings(projected);
        announce(`Editorial Drift recut for ${ratio}; the frame was recomposed, not cropped.`);
        return;
      }
      publishLiveProject(detachEditorialDriftRatioProvenance(
        currentProject,
        new Date().toISOString(),
      ));
      announce("Custom stage size kept your direction and released the authored ratio recut.");
    }
    markProjectDirty();
    const nextProject = reconcileLiveProject(nextSettings, assetsRef.current, presenterRef.current);
    if (currentProject) recordV2History(currentProject, nextProject, "Director control changed.");
  }, [announce, markProjectDirty, publishLiveProject, reconcileLiveProject, recordV2History, settingsForCurrentAuthority]);

  const updateV2Project = useCallback((candidate: DriftProjectV4, message: string) => {
    const current = projectRef.current;
    if (!current) throw new Error("Project V4 creative authority is unavailable.");
    const next = validateDriftProjectV4(candidate);
    const changedPaths = recordV2History(current, next, message);
    if (changedPaths.length === 0) {
      announce(`${message} No saved values changed.`);
      return;
    }
    if (next.sound.previewEnabled && !current.sound.previewEnabled) {
      sonicEngineRef.current?.setProject(next);
      void sonicEngineRef.current?.unlock();
    }
    const projected = studioSettingsFromDriftProject(next);
    publishLiveProject(next);
    markProjectDirty();
    settingsRef.current = projected;
    setSettings(projected);
    announce(message);
  }, [announce, markProjectDirty, publishLiveProject, recordV2History]);

  const restoreV2HistoryProject = useCallback((entry: DocumentHistoryEntry, message: string) => {
    const next = validateDriftProjectV4(structuredClone(entry.project));
    const restore = (asset: StudioAsset): StudioAsset => ({ ...asset, objectUrl: URL.createObjectURL(asset.blob) });
    const restoredAssets = entry.assets.map(restore);
    const restoredPresenter = entry.presenter ? restore(entry.presenter) : null;
    assetsRef.current.forEach(disposeAsset);
    if (presenterRef.current) disposeAsset(presenterRef.current);
    assetsRef.current = restoredAssets;
    presenterRef.current = restoredPresenter;
    setAssets(restoredAssets);
    setPresenter(restoredPresenter);
    const projected = studioSettingsFromDriftProject(next);
    publishLiveProject(next);
    markProjectDirty();
    settingsRef.current = projected;
    setSettings(projected);
    setComparisonActive(false);
    setComparisonProject(null);
    setV2HistoryVersion((version) => version + 1);
    setChangeReceipt(message);
    announce(message);
  }, [announce, markProjectDirty, publishLiveProject]);

  const commitProjectCommandResult = useCallback((
    project: DriftProjectV4,
    revisions: ProjectRevisionState,
    message: string,
  ) => {
    const current = projectRef.current;
    if (!current) throw new Error("Project V4 creative authority is unavailable.");
    recordV2History(current, project, message);
    const projected = studioSettingsFromDriftProject(project);
    publishLiveProject(project);
    settingsRef.current = projected;
    setSettings(projected);
    documentRevisionRef.current = structuredClone(revisions);
    setDocumentRevisionVersion((version) => version + 1);
    scheduleProjectPersistence();
    setChangeReceipt(message);
    announce(message, "good");
  }, [announce, publishLiveProject, recordV2History, scheduleProjectPersistence]);

  automationCommitRef.current = (change) => {
    commitProjectCommandResult(change.project, change.revisions, change.message);
  };

  const applyOutcomeRecipeFromUi = useCallback((id: OutcomeRecipeId, message: string) => {
    const current = projectRef.current;
    if (!current) throw new Error("Project V4 creative authority is unavailable.");
    const applied = applyProjectV4Command(
      current,
      documentRevisionRef.current,
      applyOutcomeRecipeCommand(id),
      new Date().toISOString(),
    );
    commitProjectCommandResult(applied.project, applied.revision, message);
  }, [commitProjectCommandResult]);

  const undoV2Project = useCallback(() => {
    const current = projectRef.current;
    const history = v2HistoryRef.current;
    const previous = history.past.at(-1);
    if (!current || !previous) return;
    history.past = history.past.slice(0, -1);
    history.future = [captureDocumentHistory(current, assetsRef.current, presenterRef.current), ...history.future].slice(0, MAX_V2_HISTORY);
    history.lastGesture = null;
    restoreV2HistoryProject(previous, "Undid the last edit.");
  }, [restoreV2HistoryProject]);

  const redoV2Project = useCallback(() => {
    const current = projectRef.current;
    const history = v2HistoryRef.current;
    const next = history.future[0];
    if (!current || !next) return;
    history.future = history.future.slice(1);
    history.past = [...history.past.slice(-(MAX_V2_HISTORY - 1)), captureDocumentHistory(current, assetsRef.current, presenterRef.current)];
    history.lastGesture = null;
    restoreV2HistoryProject(next, "Redid the last edit.");
  }, [restoreV2HistoryProject]);

  const toggleV2Comparison = useCallback(() => {
    if (!comparisonProject) return;
    setComparisonActive((active) => !active);
  }, [comparisonProject]);

  const auditionTactileSound = useCallback(() => {
    const project = projectRef.current;
    if (!project?.sound.previewEnabled) return;
    sonicEngineRef.current?.setProject(project);
    void sonicEngineRef.current?.playPassage(Math.max(1, activeSlideIndex + 1));
  }, [activeSlideIndex]);

  useEffect(() => {
    const onHistoryKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "z") return;
      if (exportProgress || projectBusy || abortRef.current || projectPendingRef.current > 0 || saveState === "loading") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input[type=text], input[type=number], textarea, [contenteditable=true]")) return;
      event.preventDefault();
      if (event.shiftKey) redoV2Project();
      else undoV2Project();
    };
    window.addEventListener("keydown", onHistoryKeyDown);
    return () => window.removeEventListener("keydown", onHistoryKeyDown);
  }, [exportProgress, projectBusy, redoV2Project, saveState, undoV2Project, v2Active]);

  const exportInProgress = Boolean(exportProgress);

  const cancelActiveExport = useCallback(() => {
    const active = exportJobController.getActiveStatus();
    if (active && exportJobController.cancel(active.id)) return true;
    if (!abortRef.current) return false;
    abortRef.current.abort(new DOMException("Export canceled.", "AbortError"));
    return true;
  }, [exportJobController]);

  nativeCommandRef.current = (command: NativeMacCommand) => {
    if (command === "cancel-export") {
      return cancelActiveExport();
    }

    const blocked = Boolean(abortRef.current) || exportDestinationPendingRef.current || exportInProgress || projectBusy || saveState === "loading";
    if (blocked) return false;

    switch (command) {
    case "open-project":
      if (!portableProjectFilesEnabled) return false;
      requestPortableProject();
      return true;
    case "add-slides":
      imageInputRef.current?.click();
      return Boolean(imageInputRef.current);
    case "add-presenter":
      presenterInputRef.current?.click();
      return Boolean(presenterInputRef.current);
    case "save-project":
      if (!portableProjectFilesEnabled) return false;
      return enqueueProjectOperation(() => savePortableProjectNow("save"), true)
        .then(() => !projectDocumentIsDirty(documentRevisionRef.current, true));
    case "save-project-as":
      if (!portableProjectFilesEnabled) return false;
      return enqueueProjectOperation(() => savePortableProjectNow("save-as"), true)
        .then(() => !projectDocumentIsDirty(documentRevisionRef.current, true));
    case "undo-edit":
    case "redo-edit": {
      const target = document.activeElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) {
        return document.execCommand(command === "undo-edit" ? "undo" : "redo");
      }
      if (command === "undo-edit") undoV2Project(); else redoV2Project();
      return true;
    }
    case "revert-project":
      if (!portableProjectFilesEnabled || !nativeDocumentState.revertible) return false;
      revertPortableProject();
      return true;
    case "export-mp4":
      void exportVideo();
      return true;
    case "export-still":
      void exportStill();
      return true;
    case "export-frames":
      void exportFrames();
      return true;
    case "toggle-playback":
      togglePause();
      return true;
    case "previous-slide":
      engineRef.current?.stepSlides(-1);
      return Boolean(engineRef.current);
    case "next-slide":
      engineRef.current?.stepSlides(1);
      return Boolean(engineRef.current);
    case "toggle-focus":
      setFocusMode((value) => !value);
      return true;
    }
  };

  nativeImportRef.current = (kind: NativeMacImportKind, files: readonly File[]) => {
    if (kind === "slides") {
      return enqueueProjectOperation(
        () => addImagesNow([...files], { persistBeforeReply: true, propagateFailure: true }),
        true,
      );
    }
    if (files.length !== 1 || !files[0]) {
      throw new DOMException(
        kind === "presenter" ? "Choose exactly one presenter video." : "Choose exactly one Drift project.",
        "TypeMismatchError",
      );
    }
    if (kind === "project" && !portableProjectFilesEnabled) {
      throw new DOMException(
        "Portable project documents are unavailable in this build.",
        "NotAllowedError",
      );
    }
    const file = files[0];
    if (kind === "presenter") {
      return enqueueProjectOperation(
        () => addPresenterNow(file, { persistBeforeReply: true, propagateFailure: true }),
        true,
      );
    }
    // Finder must not receive a success reply merely because React displayed
    // an error. Propagate native-open failures through the awaited bridge;
    // browser input keeps its existing visible, non-throwing journey.
    return enqueueProjectOperation(() => openPortableProjectFile(file, true), true);
  };

  useEffect(() => installNativeMacAppBridge({
    command: (command) => nativeCommandRef.current(command),
    importFile: (kind, file) => nativeImportRef.current(kind, [file]),
    importFiles: (kind, files) => nativeImportRef.current(kind, files),
  }), []);

  useEffect(() => {
    reportNativeMacClientState({
      exportInProgress,
      projectBusy: projectBusy || saveState === "loading",
      saveState,
      lastNotice: notice,
      document: nativeDocumentState,
    });
  }, [exportInProgress, nativeDocumentState, notice, projectBusy, saveState]);

  const capabilityLabel = webglError
    ? "DOM fallback"
    : mp4Supported === null
      ? "checking encoder"
      : mp4Supported
        ? nativeMac ? "WebGL2 · system H.264 ready" : "WebGL2 · H.264 ready"
        : "WebGL2 · PNG output";
  const localSaveStatusLabel = driftBuildIdentity.isDevelopment
    ? saveState === "loading"
      ? "loading V2 sandbox…"
      : saveState === "saving"
        ? "saving to V2 sandbox…"
        : saveState === "failed"
          ? "V2 sandbox save failed"
          : saveState === "recovery"
            ? "V2 sandbox recovery locked"
            : "saved to V2 sandbox"
    : saveState === "loading"
      ? "loading local project…"
      : saveState === "saving"
        ? "saving locally…"
        : saveState === "failed"
          ? "local save failed"
          : saveState === "recovery"
            ? "recovery locked"
            : "saved locally";
  const interactionBusy = Boolean(abortRef.current) || exportInProgress || projectBusy || saveState === "loading";

  const runStudioCommand = (command: StudioCommandDefinition) => {
    const { action } = command;
    switch (action.type) {
      case "workspace.switch":
        setActiveWorkspace(action.workspace);
        setActivePanel("director");
        return;
      case "preview.pause.toggle":
        togglePause();
        return;
      case "preview.focus.toggle":
        setFocusMode((value) => !value);
        return;
      case "guide.toggle":
        setPlatformGuideId((id) => id === "none" ? "instagram-combined" : "none");
        setActiveWorkspace("export");
        setActivePanel("director");
        return;
      case "comparison.toggle":
        toggleV2Comparison();
        return;
      case "timing.mode.set": {
        const current = projectRef.current;
        if (!current) return;
        const intent = { ...readTimingIntent(current).intent, mode: action.mode };
        const withIntent = withTimingIntent(structuredClone(current), intent);
        const resolution = resolveProjectTiming(withIntent, resolveMovingMedia(withIntent).count, intent);
        updateV2Project(applyTimingResolution(withIntent, resolution), action.mode === "fixed-master" ? "Exact master length now owns timing." : "Reading pace now owns timing.");
        return;
      }
      case "timing.close-at-cut": {
        const current = projectRef.current;
        if (!current) return;
        const next = structuredClone(current);
        const moving = resolveMovingMedia(next);
        if (moving.count === 0) return;
        const bodySeconds = createPerformanceLifecycle(next.performance).bodyCycles.reduce((total, body) => total + body.duration, 0);
        next.motion.seamless.enabled = true;
        next.motion.seamless.loops = Math.max(1, Math.min(100, Math.round(next.motion.transport.slidesPerSecond * bodySeconds / moving.count)));
        const resolution = resolveProjectTiming(next, moving.count);
        updateV2Project(applyTimingResolution(next, resolution), "Timeline closed at a complete deck pass.");
        return;
      }
      case "media.slides.add":
        imageInputRef.current?.click();
        return;
      case "media.presenter.add":
        presenterInputRef.current?.click();
        return;
      case "media.pin-selected": {
        const selected = assetsRef.current.find((asset) => asset.id === selectedSlideId) ?? null;
        if (selected) pin(selected);
        return;
      }
      case "media.pin-return":
        pin(null);
        return;
      case "export.still":
        void exportStill();
        return;
      case "export.sequence":
        void exportFrames();
        return;
      case "export.mp4":
        void exportVideo();
        return;
      case "presentation.interface-scale.smaller":
        changeInterfaceScale({ type: "smaller" });
        return;
      case "presentation.interface-scale.larger":
        changeInterfaceScale({ type: "larger" });
        return;
      case "presentation.interface-scale.reset":
        changeInterfaceScale({ type: "reset" });
        return;
      case "history.undo":
        undoV2Project();
        return;
      case "history.redo":
        redoV2Project();
        return;
    }
  };

  return (
    <main
      className="app"
      data-focus={focusMode}
      data-active-panel={activePanel}
      data-build-channel={driftBuildIdentity.channel}
      data-interface-scale={interfaceScale.value}
      data-interface-layout={effectiveInterfaceLayout}
      style={{ "--interface-scale": interfaceScale.value / 100 } as CSSProperties}
      aria-busy={interactionBusy}
    >
      <header className="app-header">
        <a className="wordmark" href="#studio" aria-label="Drift studio home">
          <span>pitch.dog</span>
          <strong>DRIFT</strong>
          {driftBuildIdentity.isDevelopment ? <em className="dev-build-badge">V2 DEV</em> : null}
        </a>
        <p>Decks should move like they mean it.</p>
        <div className="header-actions">
          <div className="header-status">
            <span className="capability-dot" data-ready={!webglError} />
            <span>{capabilityLabel}</span>
            <span className="header-divider" />
            <span>{localSaveStatusLabel}</span>
          </div>
          <InterfaceScaleMenu
            snapshot={interfaceScale}
            disabled={interactionBusy}
            onCommand={changeInterfaceScale}
          />
          <button type="button" className="command-trigger" aria-label="Open command palette" onClick={() => setCommandPaletteOpen(true)} disabled={interactionBusy}>⌘K</button>
        </div>
      </header>

      <nav className="mobile-tabs" aria-label="Studio panels">
        {(["media", "stage", "director"] as const).map((panel) => (
          <button type="button" key={panel} onClick={() => setActivePanel(panel)} aria-pressed={activePanel === panel}>
            {panel}
          </button>
        ))}
      </nav>

      <div id="studio" className="studio-shell" data-workspace={activeWorkspace}>
        <MediaLibrary
          assets={assets}
          presenter={presenter}
          pinnedAssetId={stagePresentation.pinEnabled ? stagePresentation.pinnedAssetId : null}
          selectedAssetId={selectedSlideId}
          slideHealth={slideHealth}
          imageInputRef={imageInputRef}
          presenterInputRef={presenterInputRef}
          onAddImages={addImages}
          onPresenter={addPresenter}
          onRemove={removeAsset}
          onReorder={reorder}
          onPin={pin}
          onSelect={(assetId) => {
            setSelectedSlideId(assetId);
          }}
          onRemovePresenter={removePresenter}
          busy={interactionBusy}
        />
        <Stage
          canvasRef={canvasRef}
          frameRef={frameRef}
          presentation={stagePresentation}
          assets={assets}
          pinnedAsset={activePinnedAsset}
          webglError={webglError}
          contextState={contextState}
          fps={fps}
          outputFps={displayedProject.master.fps}
          paused={paused}
          reducedMotionPreview={prefersReducedMotion}
          reducedMotionMaster={displayedProject.master.reducedMotion || displayedProject.performance.reducedMotion === true}
          focusMode={focusMode}
          activeSlideIndex={activeSlideIndex}
          platformGuide={platformGuide}
          exportProgress={exportProgress}
          timeline={visualTimeline}
          previewTime={previewTime}
          onPausedChange={setPreviewPaused}
          onSeekPreview={seekPreview}
          onToggleFocus={() => setFocusMode((value) => !value)}
          onDropImages={addImages}
          onCancelExport={cancelActiveExport}
          busy={interactionBusy}
        />
        <ControlPanel
          workspace={activeWorkspace}
          onWorkspace={(nextWorkspace) => {
            setActiveWorkspace(nextWorkspace);
            setActivePanel("director");
          }}
          selectedSlideId={selectedSlideId}
          selectedSlideHealth={selectedSlideId ? slideHealth[selectedSlideId] ?? null : null}
          slideHealth={Object.values(slideHealth)}
          platformGuideId={platformGuideId}
          platformGuide={platformGuide}
          guideOverlaps={guideOverlaps}
          customGuideInsets={customGuideInsets}
          onPlatformGuide={setPlatformGuideId}
          onCustomGuideInsets={setCustomGuideInsets}
          settings={settings}
          project={liveProject}
          documentRevision={documentRevisionRef.current.currentRevision}
          selectedSlideAsset={assets.find(asset => asset.id === selectedSlideId)}
          onSourceAudition={() => setPreviewPaused(true)}
          v2Active={v2Active}
          onSettings={updateSettings}
          onV2Project={updateV2Project}
          onOutcomeRecipe={applyOutcomeRecipeFromUi}
          onUndoV2={undoV2Project}
          onRedoV2={redoV2Project}
          canUndoV2={v2HistoryRef.current.past.length > 0}
          canRedoV2={v2HistoryRef.current.future.length > 0}
          onToggleV2Comparison={toggleV2Comparison}
          canCompareV2={Boolean(comparisonProject)}
          comparingV2={comparisonActive}
          changeReceipt={changeReceipt}
          onAuditionSound={auditionTactileSound}
          sonicState={sonicState}
          onTheme={onTheme}
          onResetPinnedFrame={resetPinnedFrame}
          onExportStill={exportStill}
          onRunGuidedExport={runGuidedExport}
          onExportProject={savePortableProject}
          onImportProject={requestPortableProject}
          projectFilesEnabled={portableProjectFilesEnabled}
          panelActive={
            (interfaceScale.layout !== "single-panel" && !constrainedViewport)
            || activePanel === "director"
          }
          exportCapabilities={exportCapabilities}
          guidedExportIntent={guidedExportIntent}
          exportProgress={exportProgress}
          exportSurfaceSupported={!webglError && contextState !== "lost"}
          exporting={interactionBusy}
        />
      </div>

      <input
        ref={importInputRef}
        hidden
        tabIndex={-1}
        type="file"
        disabled={interactionBusy || !portableProjectFilesEnabled}
        accept=".pitched,application/vnd.pitchdog.pitched+zip,application/zip"
        onChange={openPortableProject}
      />

      <CommandPalette
        open={commandPaletteOpen}
        workspace={activeWorkspace}
        disabled={interactionBusy}
        onClose={() => setCommandPaletteOpen(false)}
        onRun={runStudioCommand}
      />

      {notice ? (
        <div className="notice" data-kind={noticeKind} role={noticeKind === "error" ? "alert" : "status"} aria-live="polite">
          {noticeKind === "error"
            ? <WarningCircleIcon className="notice-icon" />
            : noticeKind === "good"
              ? <CheckCircleIcon className="notice-icon" />
              : <InfoIcon className="notice-icon" />}
          <p>{notice}</p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message"><XIcon /></button>
        </div>
      ) : null}

      <footer className="app-footer">
        <span>LOCAL FIRST · NO CLOUD · NO TRACKING</span>
        {driftBuildIdentity.isDevelopment ? (
          <AutomationAccessView
            enabled={automationEnabled}
            writeEnabled={automationWriteEnabled}
            previewEnabled={automationPreviewEnabled}
            exportEnabled={automationExportEnabled}
            connectionState={automationConnectionState}
            service={automationService}
            onEnabledChange={(enabled) => {
              setAutomationEnabled(enabled);
              if (!enabled) setAutomationWriteEnabled(false);
              if (!enabled) setAutomationPreviewEnabled(false);
              if (!enabled) setAutomationExportEnabled(false);
            }}
            onWriteEnabledChange={setAutomationWriteEnabled}
            onPreviewEnabledChange={setAutomationPreviewEnabled}
            onExportEnabledChange={setAutomationExportEnabled}
            onUndoReceipt={(receiptId) => {
              try {
                automationService.mutation?.undo(receiptId);
              } catch (error) {
                announce(error instanceof Error ? error.message : "Automation change could not be undone.", "error");
              }
            }}
            onDisconnect={() => automationAdapter.revokeAll()}
          />
        ) : null}
        <details className="legal-notice">
          <summary><span>SOURCE · AGPL</span><CaretRightIcon className="footer-disclosure-caret" /></summary>
          <div role="note" aria-label="Free software notice">
            <strong>Drift © 2026 pitch.dog and contributors.</strong>
            <p>Free software: you may copy, modify, and convey it under GNU AGPL v3 or later. It comes with absolutely no warranty.</p>
            <p>{nativeMac ? "This Mac build uses system media codecs and contains no FFmpeg WebAssembly." : "The software AAC path uses FFmpeg libraries under LGPL-2.1-or-later."}</p>
            <span>
              <a href="https://github.com/bomkino/pitchdog-drift" target="_blank" rel="noreferrer">Complete source</a>
              <a href="https://github.com/bomkino/pitchdog-drift/blob/main/LICENSE" target="_blank" rel="noreferrer">Read the licence</a>
              <a href="https://github.com/bomkino/pitchdog-drift/blob/main/THIRD_PARTY_NOTICES.md" target="_blank" rel="noreferrer">Notices</a>
            </span>
          </div>
        </details>
        <span>THREE.JS / RAW GLSL / FIXED-STEP OUTPUT</span>
      </footer>
    </main>
  );
}
