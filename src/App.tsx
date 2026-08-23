import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { ControlPanel } from "./components/ControlPanel";
import { MediaLibrary } from "./components/MediaLibrary";
import { Stage } from "./components/Stage";
import { createDefaultDriftProjectV4 } from "./core/project/defaults";
import {
  assertExportAuthorityUnchanged,
  captureExportAuthority,
  type ExportAuthoritySnapshot,
} from "./core/export/exportAuthority";
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
import { projectV4ChangePaths } from "./core/commands/projectCommand";
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
import { CinematicCarousel } from "./engine/CinematicCarousel";
import { disposeAsset, imageFileToAsset, sanitizeFilename, videoFileToAsset } from "./lib/assets";
import { driftBuildIdentity } from "./lib/buildIdentity";
import { createDemoSlides } from "./lib/demoSlides";
import {
  TactileSoundEngine,
  renderTactileSoundtrack,
  type TactileRuntimeState,
} from "./sonic/tactileSound";
import type {
  ExportProgress as EncoderProgress,
  RenderAtContext,
} from "./lib/exportStudio";
import {
  installNativeMacAppBridge,
  isNativeMacRuntime,
  reportNativeMacClientState,
  saveNativeMacBlob,
  type NativeMacCommand,
  type NativeMacImportKind,
} from "./lib/nativeMac";
import {
  PROJECT_MEDIA_LIMITS,
  formatProjectMiB,
  projectAssetBytes,
  projectMediaViolation,
  selectProjectMediaWithinBudget,
} from "./lib/projectMediaBudget";
import {
  createProjectBundle,
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

interface V2HistoryState {
  past: DriftProjectV4[];
  future: DriftProjectV4[];
  lastGesture: { message: string; at: number } | null;
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
  return error instanceof DOMException && error.name === "AbortError";
}

function makeLocalProjectId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function createInitialProject(projectId: string, now: string): DriftProjectV4 {
  const project = createDefaultDriftProjectV4(projectId, now);
  return driftBuildIdentity.isDevelopment
    ? applyEditorialDriftFoundation(project, "9:16", now)
    : project;
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

function encoderProgress(progress: EncoderProgress): ExportProgress {
  const phase: ExportProgress["phase"] = progress.phase === "rendering" || progress.phase === "writing"
    ? "frames"
    : progress.phase === "preparing"
      ? "preparing"
      : progress.phase === "audio"
        ? "audio"
        : progress.phase === "complete"
          ? "complete"
          : progress.phase === "finalizing"
            ? "finalizing"
            : "video";
  const label = {
    preparing: "Preparing deterministic timeline",
    video: "Encoding fixed-step video",
    audio: "Aligning presenter audio",
    rendering: "Rendering exact frames",
    writing: "Writing frames to disk",
    finalizing: "Closing and verifying output",
    complete: "Master complete",
  }[progress.phase];
  return {
    phase,
    completed: Math.round(progress.ratio * 1_000),
    total: 1_000,
    message: label,
  };
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
  const noticeTimerRef = useRef<number | null>(null);
  const projectRef = useRef<DriftProjectV4 | null>(null);
  if (projectRef.current === null) {
    const now = new Date().toISOString();
    projectRef.current = createInitialProject(makeLocalProjectId(), now);
  }
  // V1/release startup must retain the exact frozen studio defaults. The raw
  // Project V4 compatibility scaffold deliberately contains dormant richer
  // domains whose projection is not pixel-equivalent to V1. V2 Dev alone
  // starts from its explicitly applied Editorial Drift V2 recipe.
  const initialSettings = driftBuildIdentity.isDevelopment
    ? studioSettingsFromDriftProject(projectRef.current)
    : cloneSettings(DEFAULT_SETTINGS);
  const identityRef = useRef<ProjectIdentity | null>(null);
  const recoverySnapshotRef = useRef<ProjectSnapshot<StudioProjectPayload> | null>(null);
  const hydratedRef = useRef(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRevisionAuthorityRef = useRef(createLocalSaveRevisionAuthority());
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
  const v2HistoryRef = useRef<V2HistoryState>({ past: [], future: [], lastGesture: null });
  const nativeCommandRef = useRef<(command: NativeMacCommand) => boolean | void | Promise<boolean | void>>(() => false);
  const nativeImportRef = useRef<(
    kind: NativeMacImportKind,
    files: readonly File[],
  ) => void | Promise<void>>(() => undefined);

  const [settings, setSettings] = useState<StudioSettings>(() => cloneSettings(initialSettings));
  const [liveProject, setLiveProject] = useState<DriftProjectV4>(() => structuredClone(projectRef.current!));
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [presenter, setPresenter] = useState<StudioAsset | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [contextState, setContextState] = useState<"ready" | "lost" | "restored">("ready");
  const [fps, setFps] = useState(0);
  const [paused, setPaused] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [activeSlideIndex, setActiveSlideIndex] = useState(-1);
  const [activePanel, setActivePanel] = useState<"media" | "stage" | "director">("stage");
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [notice, setNotice] = useState<string | null>("Loading local studio…");
  const [noticeKind, setNoticeKind] = useState<"quiet" | "good" | "error">("quiet");
  const [saveState, setSaveState] = useState<"loading" | "saving" | "saved" | "failed" | "recovery">("loading");
  const [projectBusy, setProjectBusy] = useState(false);
  const [mp4Supported, setMp4Supported] = useState<boolean | null>(null);
  const [sonicState, setSonicState] = useState<TactileRuntimeState>("off");
  const [, setV2HistoryVersion] = useState(0);
  const [comparisonProject, setComparisonProject] = useState<DriftProjectV4 | null>(null);
  const [comparisonActive, setComparisonActive] = useState(false);
  const [changeReceipt, setChangeReceipt] = useState("No V2 direction changed yet.");
  const nativeMac = isNativeMacRuntime();
  const nativeSelfTestDatabase = (globalThis as typeof globalThis & {
    __DRIFT_NATIVE_SELF_TEST_DB__?: unknown;
  }).__DRIFT_NATIVE_SELF_TEST_DB__;
  const portableProjectFilesEnabled = !driftBuildIdentity.isDevelopment
    || (typeof nativeSelfTestDatabase === "string"
      && /^drift-project-self-test-[a-f0-9-]{36}$/.test(nativeSelfTestDatabase));

  settingsRef.current = settings;
  assetsRef.current = assets;
  presenterRef.current = presenter;

  const v2Active = liveProject.renderContract === DRIFT_V2_RENDER_CONTRACT;
  const displayedProject = comparisonActive && comparisonProject ? comparisonProject : liveProject;
  const stagePresentation = useMemo(
    () => v2Active
      ? stagePresentationFromProject(displayedProject)
      : stagePresentationFromV1Settings(settings),
    [displayedProject, settings, v2Active],
  );
  const liveExportPlan = useMemo(
    () => v2Active
      ? exportPlanFromProject(liveProject)
      : exportPlanFromV1Settings(settings),
    [liveProject, settings, v2Active],
  );
  const allAssets = useMemo(() => presenter ? [...assets, presenter] : assets, [assets, presenter]);
  const pinnedAsset = useMemo(
    () => allAssets.find((asset) => asset.id === stagePresentation.pinnedAssetId) ?? null,
    [allAssets, stagePresentation.pinnedAssetId],
  );
  const activePinnedAsset = stagePresentation.pinEnabled ? pinnedAsset : null;

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
    setLiveProject(project);
  }, []);

  const reconcileLiveProject = useCallback((
    nextSettings: StudioSettings,
    nextAssets: readonly StudioAsset[],
    nextPresenter: StudioAsset | null,
    baseProject = projectRef.current,
  ): DriftProjectV4 => {
    if (!baseProject) throw new Error("Project V4 creative authority is unavailable.");
    const project = reconcileStudioProject({
      project: baseProject,
      settings: nextSettings,
      slideAssets: nextAssets.map(describeProjectAsset),
      presenterAsset: nextPresenter ? describeProjectAsset(nextPresenter) : null,
      // Live creative edits do not impersonate persistence revisions.
      updatedAt: baseProject.updatedAt,
    });
    publishLiveProject(project);
    return project;
  }, [publishLiveProject]);

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
    if (abortRef.current) {
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
        return asset.kind !== "image"
          || !descriptor
          || asset.width !== descriptor.width
          || asset.height !== descriptor.height;
      })
    ) {
      restored.forEach(disposeAsset);
      throw new Error("Project slide order references missing or non-image media.");
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
    const nextProject = reconcileStudioProject({
      project: baseProject,
      settings: nextSettings,
      slideAssets: nextAssets.map(describeProjectAsset),
      presenterAsset: nextPresenter ? describeProjectAsset(nextPresenter) : null,
      updatedAt,
    });
    publishLiveProject(nextProject);
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
  }, [publishLiveProject, settingsForCurrentAuthority]);

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

  const markProjectDirty = useCallback(() => {
    if (!hydratedRef.current) return;
    advanceLocalSaveRevision(saveRevisionAuthorityRef.current);
    setSaveState("saving");
  }, []);

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
    const applyMotion = () => engine.setReducedMotionPreview(motion.matches);
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
      .then((report) => live && setMp4Supported(report.mp4.supported))
      .catch(() => live && setMp4Supported(false));
    return () => { live = false; };
  }, [liveExportPlan.duration, liveExportPlan.fps, liveExportPlan.height, liveExportPlan.width]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && focusMode) {
        event.preventDefault();
        setFocusMode(false);
        return;
      }
      if (exportProgress || projectBusy || abortRef.current || projectPendingRef.current > 0 || saveState === "loading") return;
      const target = event.target as HTMLElement | null;
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
  }, [exportProgress, focusMode, paused, projectBusy, saveState]);

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    assetsRef.current.forEach(disposeAsset);
    if (presenterRef.current) disposeAsset(presenterRef.current);
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

    const supportedImages = files.filter((file) => file.type.startsWith("image/"));
    if (!supportedImages.length) {
      rejectImport("No supported images were selected.");
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

    const decoded = await Promise.allSettled(candidates.map((file) => imageFileToAsset(file)));
    const decodedAssets = decoded.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    if (!decodedAssets.length) {
      rejectImport("None of those images could be decoded.");
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
    if (replacingDemos) current.forEach(disposeAsset);
    const next = [...retained, ...accepted];
    const nextSettings = settingsForCurrentAuthority();
    const nextPresenter = presenterRef.current;
    if (options.persistBeforeReply) {
      directPersistenceSnapshotRef.current = {
        settings: nextSettings,
        assets: next,
        presenter: nextPresenter,
      };
    }
    markProjectDirty();
    assetsRef.current = next;
    reconcileLiveProject(nextSettings, next, nextPresenter);
    setAssets(next);
    const usedBytes = projectAssetBytes([
      ...next,
      ...(presenterRef.current ? [presenterRef.current] : []),
    ]);
    announce(
      `${accepted.length} slide${accepted.length === 1 ? "" : "s"} added${rejected ? `; ${rejected} rejected by format, count, decode, or project-media budget` : ""}. ${formatProjectMiB(usedBytes)} of ${formatProjectMiB(PROJECT_MEDIA_LIMITS.maxTotalBytes)} project media used.`,
      rejected ? "quiet" : "good",
    );
    if (options.persistBeforeReply) {
      try {
        await persist(nextSettings, next, nextPresenter);
      } catch (error) {
        const message = error instanceof Error ? `Local save failed: ${error.message}` : "Local save failed.";
        announce(message, "error");
        if (options.propagateFailure) throw error;
      }
    }
  }, [announce, markProjectDirty, persist, reconcileLiveProject, settingsForCurrentAuthority]);

  const addImages = useCallback((files: File[]) => {
    void enqueueProjectOperation(() => addImagesNow(files));
  }, [addImagesNow, enqueueProjectOperation]);

  const addPresenterNow = useCallback(async (
    file: File,
    options: { persistBeforeReply?: boolean; propagateFailure?: boolean } = {},
  ) => {
    try {
      if (!hydratedRef.current) {
        throw new Error("Recovery is locked. Open a verified project before adding a presenter; the preserved project will not be overwritten by fallback media.");
      }
      const existingSlideBytes = projectAssetBytes(assetsRef.current);
      const violation = projectMediaViolation(file.size, existingSlideBytes);
      if (violation) throw new Error(`Presenter video was not added. ${violation}`);

      const next = await videoFileToAsset(file);
      const previous = presenterRef.current;
      if (previous) disposeAsset(previous);
      presenterRef.current = next;
      setPresenter(next);

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
        directPersistenceSnapshotRef.current = {
          settings: nextSettings,
          assets: assetsRef.current,
          presenter: next,
        };
      }
      markProjectDirty();
      settingsRef.current = nextSettings;
      reconcileLiveProject(nextSettings, assetsRef.current, next);
      setSettings(nextSettings);
      announce(
        `${selectedSlideStillExists ? "Presenter video added; the selected still image was kept." : "Presenter video added and kept still."} Audio will be checked—not silently dropped—at export. ${formatProjectMiB(existingSlideBytes + next.blob.size)} of ${formatProjectMiB(PROJECT_MEDIA_LIMITS.maxTotalBytes)} project media used.`,
        "good",
      );
      if (options.persistBeforeReply) {
        await persist(nextSettings, assetsRef.current, next);
      }
    } catch (error) {
      announce(error instanceof Error ? error.message : "Presenter video could not be opened.", "error");
      if (options.propagateFailure) throw error;
    }
  }, [announce, markProjectDirty, persist, reconcileLiveProject, settingsForCurrentAuthority]);

  const addPresenter = useCallback((file: File) => {
    void enqueueProjectOperation(() => addPresenterNow(file));
  }, [addPresenterNow, enqueueProjectOperation]);

  const removeAsset = useCallback((id: string) => {
    const current = assetsRef.current;
    const removed = current.find((asset) => asset.id === id);
    if (removed) disposeAsset(removed);
    const nextAssets = current.filter((asset) => asset.id !== id);
    markProjectDirty();
    assetsRef.current = nextAssets;
    const nextSettings = clearPinnedAssetIfRemoved(settingsForCurrentAuthority(), id);
    settingsRef.current = nextSettings;
    reconcileLiveProject(nextSettings, nextAssets, presenterRef.current);
    setAssets(nextAssets);
    setSettings(nextSettings);
  }, [markProjectDirty, reconcileLiveProject, settingsForCurrentAuthority]);

  const reorder = useCallback((fromId: string, toId: string) => {
    const current = assetsRef.current;
    const from = current.findIndex((asset) => asset.id === fromId);
    const to = current.findIndex((asset) => asset.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    markProjectDirty();
    assetsRef.current = next;
    reconcileLiveProject(settingsForCurrentAuthority(), next, presenterRef.current);
    setAssets(next);
  }, [markProjectDirty, reconcileLiveProject, settingsForCurrentAuthority]);

  const pin = useCallback((asset: StudioAsset | null) => {
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
    settingsRef.current = nextSettings;
    reconcileLiveProject(nextSettings, assetsRef.current, presenterRef.current);
    setSettings(nextSettings);
  }, [markProjectDirty, reconcileLiveProject, settingsForCurrentAuthority]);

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
    const nextSettings = resetPinnedFrameComposition(current, asset);
    markProjectDirty();
    settingsRef.current = nextSettings;
    reconcileLiveProject(nextSettings, assetsRef.current, presenterRef.current);
    setSettings(nextSettings);
    announce("Pinned frame reset to its source ratio, protected layer, and still-only track.", "good");
  }, [announce, markProjectDirty, reconcileLiveProject, settingsForCurrentAuthority]);

  const removePresenter = useCallback(() => {
    const removedPresenter = presenterRef.current;
    const removedPresenterId = removedPresenter?.id ?? null;
    if (removedPresenter) disposeAsset(removedPresenter);
    presenterRef.current = null;
    setPresenter(null);

    const nextSettings = clearPinnedAssetIfRemoved(settingsForCurrentAuthority(), removedPresenterId);
    markProjectDirty();
    settingsRef.current = nextSettings;
    reconcileLiveProject(nextSettings, assetsRef.current, null);
    setSettings(nextSettings);
  }, [markProjectDirty, reconcileLiveProject, settingsForCurrentAuthority]);

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
    );
  }, []);

  const reserveExport = useCallback((): {
    controller: AbortController;
    authority: ExportAuthoritySnapshot;
  } => {
    if (abortRef.current) {
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
    abortRef.current = controller;
    setExportProgress({
      phase: "preparing",
      completed: 0,
      total: 1_000,
      message: "Preparing one locked creative snapshot",
    });
    return { controller, authority };
  }, []);

  const beginExport = useCallback(async (reservation: {
    controller: AbortController;
    authority: ExportAuthoritySnapshot;
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

  const endExport = useCallback((
    reservation: { controller: AbortController },
    surface?: { restore: () => void },
  ) => {
    surface?.restore();
    if (abortRef.current === reservation.controller) abortRef.current = null;
    setExportProgress(null);
  }, []);

  const exportVideo = useCallback(async () => {
    if (!engineRef.current) {
      announce("Cinematic renderer is unavailable; export is blocked.", "error");
      return;
    }
    if (mp4Supported === false) {
      announce(
        nativeMac
          ? "This Mac’s system WebKit cannot encode the requested H.264 master. Export PNG frames, or try a supported macOS update."
          : "This browser cannot encode the requested H.264 master. Use current desktop Chromium or Brave, or export PNG frames.",
        "error",
      );
      return;
    }
    let reservation: ReturnType<typeof reserveExport>;
    try {
      reservation = reserveExport();
    } catch (error) {
      announce(error instanceof Error ? error.message : "Could not start MP4 export.", "error");
      return;
    }
    let fileHandle: FileSystemFileHandle | null = null;
    let session: Awaited<ReturnType<typeof beginExport>> | null = null;
    try {
      const savePicker = (window as PickerWindow).showSaveFilePicker;
      if (savePicker) {
        fileHandle = await savePicker({
          id: "pitchdog-drift-master",
          suggestedName: `drift-master-${timestampSlug()}.mp4`,
          types: [{ description: "H.264 MP4 master", accept: { "video/mp4": [".mp4"] } }],
        });
      }
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
        includePresenterAudio: session.plan.presenter.includeAudio,
        soundtrack: soundtrack ?? undefined,
        soundtrackGainWhenMixed: reservation.authority.project.sound.underVoice,
        signal: session.controller.signal,
        onProgress: (progress) => setExportProgress(encoderProgress(progress)),
        target,
      });
      if (result.blob) await downloadBlob(result.blob, `drift-master-${timestampSlug()}.mp4`);
      announce(`${result.width} × ${result.height} H.264 master verified: ${result.verification.frameCount} frames at ${result.fps} fps${result.audio ? ` · ${result.audio.source} AAC` : ""}.`, "good");
    } catch (error) {
      announce(
        isAbortError(error) ? "MP4 export canceled." : error instanceof Error ? error.message : "MP4 export failed.",
        isAbortError(error) ? "quiet" : "error",
      );
    } finally {
      endExport(reservation, session?.surface);
    }
  }, [announce, beginExport, endExport, mp4Supported, nativeMac, renderForExport, reserveExport]);

  const exportStill = useCallback(async () => {
    let reservation: ReturnType<typeof reserveExport> | null = null;
    let session: Awaited<ReturnType<typeof beginExport>> | null = null;
    try {
      reservation = reserveExport();
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
        time: stillTime,
        signal: session.controller.signal,
        requireAlpha: true,
        requireTransparentPixels: session.plan.requireTransparentPixels,
        onProgress: (progress) => setExportProgress(encoderProgress(progress)),
      });
      await downloadBlob(result.blob, `drift-still-${timestampSlug()}.png`);
      announce(`${result.width} × ${result.height} PNG saved with an alpha-capable channel.`, "good");
    } catch (error) {
      announce(isAbortError(error) ? "PNG save canceled." : error instanceof Error ? error.message : "PNG capture failed.", isAbortError(error) ? "quiet" : "error");
    } finally {
      if (reservation) endExport(reservation, session?.surface);
    }
  }, [announce, beginExport, endExport, renderForExport, reserveExport]);

  const exportFrames = useCallback(async () => {
    let reservation: ReturnType<typeof reserveExport> | null = null;
    let session: Awaited<ReturnType<typeof beginExport>> | null = null;
    try {
      reservation = reserveExport();
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
        signal: session.controller.signal,
        requireAlpha: true,
        requireTransparentPixels: session.plan.requireTransparentPixels,
        onProgress: (progress: EncoderProgress) => setExportProgress(encoderProgress(progress)),
      };
      const picker = (window as PickerWindow).showDirectoryPicker;
      if (picker) {
        const directory = await picker({ id: "pitchdog-drift-frames", mode: "readwrite" });
        const result = await exportPngSequence({ ...common, destination: "directory", directory, framePrefix: "drift" });
        announce(`${result.frameCount} numbered PNG frames written and verified.`, "good");
      } else {
        const result = await exportPngSequence({ ...common, destination: "zip", framePrefix: "drift" });
        if (!result.blob) throw new Error("PNG ZIP completed without bytes.");
        await downloadBlob(result.blob, `drift-frames-${timestampSlug()}.zip`);
        announce(`${result.frameCount} numbered PNG frames saved in a verified ZIP.`, "good");
      }
    } catch (error) {
      announce(isAbortError(error) ? "PNG sequence export canceled." : error instanceof Error ? error.message : "PNG sequence export failed.", isAbortError(error) ? "quiet" : "error");
    } finally {
      if (reservation) endExport(reservation, session?.surface);
    }
  }, [announce, beginExport, endExport, renderForExport, reserveExport]);

  const savePortableProjectNow = useCallback(async () => {
    try {
      if (!hydratedRef.current) {
        const recovery = recoverySnapshotRef.current;
        if (!recovery) {
          throw new Error("The locked saved project could not be read safely. Open a verified project to replace it; fallback demos will not overwrite it.");
        }
        const recoveryBlob = await exportProject(recovery);
        await downloadBlob(recoveryBlob, `drift-recovery-${timestampSlug()}.pitched`);
        announce("Locked saved project re-verified and saved with its preserved manifest and media. Fallback demos were not written over it.", "good");
        return;
      }
      const snapshot = await persist();
      const blob = await exportProject(snapshot);
      await downloadBlob(blob, `drift-project-${timestampSlug()}.pitched`);
      announce("Portable Project V4 saved with original media and SHA-256 manifest.", "good");
    } catch (error) {
      announce(isAbortError(error) ? "Portable project save canceled." : error instanceof Error ? error.message : "Portable project could not be saved.", isAbortError(error) ? "quiet" : "error");
    }
  }, [announce, persist]);

  const savePortableProject = useCallback(() => {
    void enqueueProjectOperation(savePortableProjectNow);
  }, [enqueueProjectOperation, savePortableProjectNow]);

  const openPortableProjectFile = useCallback(async (file: File, propagateFailure = false) => {
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
              const project = reconcileStudioProject({
                project: baseProject,
                settings: settingsForCurrentAuthority(),
                slideAssets: assetsRef.current.map(describeProjectAsset),
                presenterAsset: presenterRef.current ? describeProjectAsset(presenterRef.current) : null,
                updatedAt,
              });
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
          installPreparedProjectState(prepared);
          preparedInstalled = true;
          const saved = await persistExactProject(
            prepared.project,
            prepared.slides,
            prepared.presenter,
          );
          identityRef.current = { projectId: saved.manifest.projectId, createdAt: saved.manifest.createdAt };
          hydratedRef.current = true;
          recoverySnapshotRef.current = null;
        } catch (error) {
          if (preparedInstalled) {
            try {
              await replaceProjectState(previous);
              setSaveState(wasHydrated ? "saved" : "recovery");
            } catch (rollbackError) {
              throw new Error(
                `Imported project could not be stored, and the open project could not be restored: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
                { cause: error },
              );
            }
          }
          throw error;
        }
      } finally {
        if (!preparedInstalled) disposePreparedProjectState(prepared);
      }
      announce("Portable project verified, migrated when necessary, and copied into local Project V4 storage.", "good");
    } catch (error) {
      announce(error instanceof Error ? `Project rejected: ${error.message}` : "Project was rejected.", "error");
      if (propagateFailure) throw error;
    }
  }, [announce, installPreparedProjectState, persist, persistExactProject, prepareProjectState, publishLiveProject, replaceProjectState, settingsForCurrentAuthority]);

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

  const onTheme = useCallback((id: ThemeId) => {
    const currentProject = projectRef.current;
    if (driftBuildIdentity.isDevelopment && id === "editorial-drift" && currentProject) {
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
    settingsRef.current = nextSettings;
    reconcileLiveProject(nextSettings, assetsRef.current, presenterRef.current);
    setSettings(nextSettings);
    announce(`${theme.name} is now directing the scene.`);
  }, [announce, markProjectDirty, publishLiveProject, reconcileLiveProject, settingsForCurrentAuthority]);

  const recordV2History = useCallback((
    current: DriftProjectV4,
    next: DriftProjectV4,
    message: string,
  ): string[] => {
    const changedPaths = projectV4ChangePaths(current, next);
    if (changedPaths.length === 0 || current.renderContract !== DRIFT_V2_RENDER_CONTRACT) return changedPaths;
    const now = performance.now();
    const history = v2HistoryRef.current;
    const coalesced = history.lastGesture?.message === message
      && now - history.lastGesture.at <= V2_GESTURE_COALESCE_MS;
    if (!coalesced) {
      history.past = [...history.past.slice(-(MAX_V2_HISTORY - 1)), structuredClone(current)];
      setComparisonProject(structuredClone(current));
    }
    history.future = [];
    history.lastGesture = { message, at: now };
    setComparisonActive(false);
    setV2HistoryVersion((version) => version + 1);
    const domains = [...new Set(changedPaths.map((path) => path.split(/[.[]/, 1)[0]))];
    setChangeReceipt(`${message} ${changedPaths.length} value${changedPaths.length === 1 ? "" : "s"} · ${domains.join(", ")}.`);
    return changedPaths;
  }, []);

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
    settingsRef.current = nextSettings;
    const nextProject = reconcileLiveProject(nextSettings, assetsRef.current, presenterRef.current);
    if (currentProject) recordV2History(currentProject, nextProject, "Director control changed.");
    setSettings(nextSettings);
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

  const restoreV2HistoryProject = useCallback((project: DriftProjectV4, message: string) => {
    const next = validateDriftProjectV4(structuredClone(project));
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

  const undoV2Project = useCallback(() => {
    const current = projectRef.current;
    const history = v2HistoryRef.current;
    const previous = history.past.at(-1);
    if (!current || !previous) return;
    history.past = history.past.slice(0, -1);
    history.future = [structuredClone(current), ...history.future].slice(0, MAX_V2_HISTORY);
    history.lastGesture = null;
    restoreV2HistoryProject(previous, "Undid the last directing gesture.");
  }, [restoreV2HistoryProject]);

  const redoV2Project = useCallback(() => {
    const current = projectRef.current;
    const history = v2HistoryRef.current;
    const next = history.future[0];
    if (!current || !next) return;
    history.future = history.future.slice(1);
    history.past = [...history.past.slice(-(MAX_V2_HISTORY - 1)), structuredClone(current)];
    history.lastGesture = null;
    restoreV2HistoryProject(next, "Redid the directing gesture.");
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
      if (!v2Active || !event.metaKey || event.altKey || event.key.toLowerCase() !== "z") return;
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

  nativeCommandRef.current = (command: NativeMacCommand) => {
    if (command === "cancel-export") {
      if (!abortRef.current) return false;
      abortRef.current.abort("Canceled from the macOS menu");
      return true;
    }

    const blocked = Boolean(abortRef.current) || exportInProgress || projectBusy || saveState === "loading";
    if (blocked) return false;

    switch (command) {
    case "open-project":
      if (!portableProjectFilesEnabled) return false;
      importInputRef.current?.click();
      return Boolean(importInputRef.current);
    case "add-slides":
      imageInputRef.current?.click();
      return Boolean(imageInputRef.current);
    case "add-presenter":
      presenterInputRef.current?.click();
      return Boolean(presenterInputRef.current);
    case "save-project":
      if (!portableProjectFilesEnabled) return false;
      savePortableProject();
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
        "Drift V2 Dev uses copied fixtures only. Open real .pitched work in Drift.",
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
    });
  }, [exportInProgress, notice, projectBusy, saveState]);

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

  return (
    <main className="app" data-focus={focusMode} data-active-panel={activePanel} data-build-channel={driftBuildIdentity.channel} aria-busy={interactionBusy}>
      <header className="app-header">
        <a className="wordmark" href="#studio" aria-label="Drift studio home">
          <span>pitch.dog</span>
          <strong>DRIFT</strong>
          {driftBuildIdentity.isDevelopment ? <em className="dev-build-badge">V2 DEV</em> : null}
        </a>
        <p>Decks should move like they mean it.</p>
        <div className="header-status">
          <span className="capability-dot" data-ready={!webglError} />
          <span>{capabilityLabel}</span>
          <span className="header-divider" />
          <span>{localSaveStatusLabel}</span>
        </div>
      </header>

      <nav className="mobile-tabs" aria-label="Studio panels">
        {(["media", "stage", "director"] as const).map((panel) => (
          <button type="button" key={panel} onClick={() => setActivePanel(panel)} aria-pressed={activePanel === panel}>
            {panel}
          </button>
        ))}
      </nav>

      <div id="studio" className="studio-shell">
        <MediaLibrary
          assets={assets}
          presenter={presenter}
          pinnedAssetId={stagePresentation.pinEnabled ? stagePresentation.pinnedAssetId : null}
          imageInputRef={imageInputRef}
          presenterInputRef={presenterInputRef}
          onAddImages={addImages}
          onPresenter={addPresenter}
          onRemove={removeAsset}
          onReorder={reorder}
          onPin={pin}
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
          paused={paused}
          focusMode={focusMode}
          activeSlideIndex={activeSlideIndex}
          exportProgress={exportProgress}
          onTogglePause={togglePause}
          onStep={(amount) => engineRef.current?.stepSlides(amount)}
          onToggleFocus={() => setFocusMode((value) => !value)}
          onDropImages={addImages}
          onCancelExport={() => abortRef.current?.abort("Canceled by user")}
          busy={interactionBusy}
        />
        <ControlPanel
          settings={settings}
          project={liveProject}
          v2Active={v2Active}
          onSettings={updateSettings}
          onV2Project={updateV2Project}
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
          onExportVideo={exportVideo}
          onExportFrames={exportFrames}
          onExportProject={savePortableProject}
          onImportProject={() => importInputRef.current?.click()}
          projectFilesEnabled={portableProjectFilesEnabled}
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

      {notice ? (
        <div className="notice" data-kind={noticeKind} role={noticeKind === "error" ? "alert" : "status"} aria-live="polite">
          <span aria-hidden="true">{noticeKind === "error" ? "!" : noticeKind === "good" ? "✓" : "·"}</span>
          <p>{notice}</p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">×</button>
        </div>
      ) : null}

      <footer className="app-footer">
        <span>LOCAL FIRST · NO CLOUD · NO TRACKING</span>
        <details className="legal-notice">
          <summary>SOURCE · AGPL</summary>
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
