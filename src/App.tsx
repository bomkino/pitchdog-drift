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
import { CinematicCarousel, type CarouselSonicEvent } from "./engine/CinematicCarousel";
import { SonicEngine, type SonicRuntimeState } from "./sonic/SonicEngine";
import { disposeAsset, imageFileToAsset, sanitizeFilename, videoFileToAsset } from "./lib/assets";
import { createDemoSlides } from "./lib/demoSlides";
import type { ExportProgress as EncoderProgress } from "./lib/exportStudio";
import {
  createProjectBundle,
  exportProject,
  importProject,
  loadProject,
  saveProject,
  type ProjectSnapshot,
} from "./lib/projectStore";
import { validateStudioSettings } from "./lib/settingsValidation";
import {
  DEFAULT_SETTINGS,
  ENGINE_VERSION,
  THEME_VERSION,
  clearPinnedAssetIfRemoved,
  cloneSettings,
  type ExportProgress,
  type StoredAssetDescriptor,
  type StudioAsset,
  type StudioSettings,
  type ThemeId,
} from "./model";
import { applyTheme, getTheme } from "./themes";

const MAX_SLIDES = 200;
const AUTOSAVE_DELAY_MS = 1_200;

interface StudioProjectPayload {
  settings: StudioSettings;
  slideAssetIds: string[];
  presenterAssetId: string | null;
  descriptors: StoredAssetDescriptor[];
}

interface ProjectIdentity {
  projectId: string;
  createdAt: string;
}

type NoticeKind = "quiet" | "good" | "error";

interface ExportOutcome {
  message: string;
  kind: NoticeKind;
}

function exportOutcomeFromError(
  error: unknown,
  signal: AbortSignal | undefined,
  canceledMessage: string,
  fallbackMessage: string,
): ExportOutcome {
  const canceled = signal?.aborted
    || (error instanceof DOMException && error.name === "AbortError");
  return canceled
    ? { message: canceledMessage, kind: "quiet" }
    : {
        message: error instanceof Error ? error.message : fallbackMessage,
        kind: "error",
      };
}

interface PickerWindow extends Window {
  showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  showSaveFilePicker?: (options?: {
    id?: string;
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeAssetId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 512
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function isPositiveDimension(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= 131_072;
}

function parsePayload(value: unknown): StudioProjectPayload {
  if (!isRecord(value) || !isRecord(value.settings)) throw new Error("Project has no readable studio settings.");
  if (
    !Array.isArray(value.slideAssetIds)
    || value.slideAssetIds.length > MAX_SLIDES
    || !value.slideAssetIds.every(isSafeAssetId)
    || new Set(value.slideAssetIds).size !== value.slideAssetIds.length
  ) {
    throw new Error("Project slide order is invalid.");
  }
  if (value.presenterAssetId !== null && !isSafeAssetId(value.presenterAssetId)) {
    throw new Error("Project presenter reference is invalid.");
  }
  if (!Array.isArray(value.descriptors) || value.descriptors.length > MAX_SLIDES + 1) {
    throw new Error("Project media descriptors are missing or exceed this version's limit.");
  }
  const descriptors = value.descriptors.filter((entry): entry is StoredAssetDescriptor => (
    isRecord(entry)
    && isSafeAssetId(entry.id)
    && typeof entry.name === "string"
    && entry.name.length > 0
    && entry.name.length <= 512
    && (entry.kind === "image" || entry.kind === "video")
    && typeof entry.mimeType === "string"
    && entry.mimeType.length > 0
    && entry.mimeType.length <= 256
    && entry.mimeType.startsWith(`${entry.kind}/`)
    && isPositiveDimension(entry.width)
    && isPositiveDimension(entry.height)
    && (entry.duration === undefined || (typeof entry.duration === "number" && Number.isFinite(entry.duration) && entry.duration > 0 && entry.duration <= 86_400))
    && typeof entry.hash === "string"
    && /^[a-f0-9]{64}$/.test(entry.hash)
    && (entry.demo === undefined || typeof entry.demo === "boolean")
  ));
  if (
    descriptors.length !== value.descriptors.length
    || new Set(descriptors.map((descriptor) => descriptor.id)).size !== descriptors.length
  ) throw new Error("Project contains an invalid or duplicate media descriptor.");
  return {
    settings: validateStudioSettings(value.settings),
    slideAssetIds: [...value.slideAssetIds],
    presenterAssetId: value.presenterAssetId,
    descriptors,
  };
}

function describeAsset(asset: StudioAsset): StoredAssetDescriptor {
  const descriptor: StoredAssetDescriptor = {
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    hash: asset.hash ?? "",
  };
  if (asset.duration !== undefined) descriptor.duration = asset.duration;
  if (asset.demo) descriptor.demo = true;
  return descriptor;
}

function makePayload(
  settings: StudioSettings,
  assets: StudioAsset[],
  presenter: StudioAsset | null,
): StudioProjectPayload {
  const allAssets = presenter ? [...assets, presenter] : assets;
  return {
    settings: cloneSettings(settings),
    slideAssetIds: assets.map((asset) => asset.id),
    presenterAssetId: presenter?.id ?? null,
    descriptors: allAssets.map(describeAsset),
  };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sanitizeFilename(filename);
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
    audio: "Mixing and verifying audio",
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
  descriptor: StoredAssetDescriptor,
): Promise<StudioAsset> {
  const file = new File([entry.blob], descriptor.name, { type: descriptor.mimeType || entry.type });
  const asset = descriptor.kind === "video"
    ? await videoFileToAsset(file, descriptor.id)
    : await imageFileToAsset(file, descriptor.id);
  return { ...asset, hash: entry.sha256, demo: descriptor.demo === true };
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CinematicCarousel | null>(null);
  const sonicRef = useRef<SonicEngine | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const identityRef = useRef<ProjectIdentity | null>(null);
  const recoverySnapshotRef = useRef<ProjectSnapshot<StudioProjectPayload> | null>(null);
  const hydratedRef = useRef(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRevisionRef = useRef(0);
  const projectQueueRef = useRef<Promise<void>>(Promise.resolve());
  const projectPendingRef = useRef(0);
  const assetsRef = useRef<StudioAsset[]>([]);
  const presenterRef = useRef<StudioAsset | null>(null);
  const settingsRef = useRef<StudioSettings>(cloneSettings(DEFAULT_SETTINGS));

  const [settings, setSettings] = useState<StudioSettings>(() => cloneSettings(DEFAULT_SETTINGS));
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [presenter, setPresenter] = useState<StudioAsset | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [contextState, setContextState] = useState<"ready" | "lost" | "restored">("ready");
  const [fps, setFps] = useState(0);
  const [paused, setPaused] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [activePanel, setActivePanel] = useState<"media" | "stage" | "director">("stage");
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [notice, setNotice] = useState<string | null>("Loading local studio…");
  const [noticeKind, setNoticeKind] = useState<"quiet" | "good" | "error">("quiet");
  const [saveState, setSaveState] = useState<"loading" | "saving" | "saved" | "failed" | "recovery">("loading");
  const [projectBusy, setProjectBusy] = useState(false);
  const [mp4Supported, setMp4Supported] = useState<boolean | null>(null);
  const [sonicState, setSonicState] = useState<SonicRuntimeState>("idle");

  settingsRef.current = settings;
  assetsRef.current = assets;
  presenterRef.current = presenter;

  const allAssets = useMemo(() => presenter ? [...assets, presenter] : assets, [assets, presenter]);
  const pinnedAsset = useMemo(
    () => allAssets.find((asset) => asset.id === settings.presenter.assetId) ?? null,
    [allAssets, settings.presenter.assetId],
  );

  const announce = useCallback((message: string, kind: NoticeKind = "quiet") => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    setNotice(message);
    setNoticeKind(kind);
    if (kind === "good") sonicRef.current?.play("success", { intensity: 0.55 });
    else if (kind === "error") sonicRef.current?.play("failure", { intensity: 0.62 });
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, kind === "error" ? 9_000 : 4_800);
  }, []);

  const enqueueProjectOperation = useCallback((operation: () => Promise<void>) => {
    if (abortRef.current) {
      announce("Wait for the current export to finish or cancel it first.", "error");
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

  const replaceProjectState = useCallback(async (snapshot: ProjectSnapshot<StudioProjectPayload>) => {
    if (snapshot.manifest.engineVersion !== ENGINE_VERSION) {
      throw new Error(`Project engine ${snapshot.manifest.engineVersion} is not supported by ${ENGINE_VERSION}.`);
    }
    if (snapshot.manifest.themeVersion !== THEME_VERSION) {
      throw new Error(`Project theme library ${snapshot.manifest.themeVersion} is not supported by ${THEME_VERSION}.`);
    }
    const payload = parsePayload(snapshot.payload);
    const descriptorById = new Map(payload.descriptors.map((descriptor) => [descriptor.id, descriptor]));
    const entryById = new Map(snapshot.assets.map((entry) => [entry.id, entry]));
    if (
      descriptorById.size !== snapshot.assets.length
      || entryById.size !== snapshot.assets.length
      || payload.descriptors.some((descriptor) => {
        const entry = entryById.get(descriptor.id);
        return !entry
          || entry.name !== descriptor.name
          || entry.type !== descriptor.mimeType
          || entry.sha256 !== descriptor.hash;
      })
    ) {
      throw new Error("Project media metadata does not match its verified asset manifest.");
    }
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
    const slides = payload.slideAssetIds.map((id) => restoredById.get(id)).filter((asset): asset is StudioAsset => Boolean(asset));
    if (
      slides.length !== payload.slideAssetIds.length
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
    const nextPresenter = payload.presenterAssetId ? restoredById.get(payload.presenterAssetId) ?? null : null;
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
    const consumedIds = new Set([...payload.slideAssetIds, ...(payload.presenterAssetId ? [payload.presenterAssetId] : [])]);
    if (consumedIds.size !== restored.length) {
      restored.forEach(disposeAsset);
      throw new Error("Project contains unreferenced or conflicting media.");
    }
    if (payload.settings.presenter.assetId && !restoredById.has(payload.settings.presenter.assetId)) {
      restored.forEach(disposeAsset);
      throw new Error("Project pinned-frame settings reference missing media.");
    }
    const previousAssets = assetsRef.current;
    const previousPresenter = presenterRef.current;
    previousAssets.forEach(disposeAsset);
    if (previousPresenter) disposeAsset(previousPresenter);
    settingsRef.current = payload.settings;
    assetsRef.current = slides;
    presenterRef.current = nextPresenter;
    setSettings(payload.settings);
    setAssets(slides);
    setPresenter(nextPresenter);
    identityRef.current = {
      projectId: snapshot.manifest.projectId,
      createdAt: snapshot.manifest.createdAt,
    };
  }, []);

  const persist = useCallback((
    nextSettings = settingsRef.current,
    nextAssets = assetsRef.current,
    nextPresenter = presenterRef.current,
    reservedRevision?: number,
  ) => {
    const revision = reservedRevision ?? ++saveRevisionRef.current;
    setSaveState("saving");
    // Freeze the requested revision now. Blob references remain valid even if
    // their object URLs are later revoked during a project swap.
    const payload = makePayload(nextSettings, nextAssets, nextPresenter);
    const projectAssets = [...nextAssets, ...(nextPresenter ? [nextPresenter] : [])].map((asset) => ({
        id: asset.id,
        name: asset.name,
        blob: asset.blob,
      }));
    const updatedAt = new Date().toISOString();

    const task = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const identity = identityRef.current;
        const snapshot = await saveProject({
          payload,
          assets: projectAssets,
          engineVersion: ENGINE_VERSION,
          themeVersion: THEME_VERSION,
          projectId: identity?.projectId,
          createdAt: identity?.createdAt,
          updatedAt,
        });
        // Tasks execute in invocation order, so the next queued save inherits
        // the correct project identity even when hashing times differ wildly.
        identityRef.current = {
          projectId: snapshot.manifest.projectId,
          createdAt: snapshot.manifest.createdAt,
        };
        if (revision === saveRevisionRef.current) setSaveState("saved");
        return snapshot;
      });

    saveQueueRef.current = task.then(
      () => undefined,
      () => {
        if (revision === saveRevisionRef.current) setSaveState("failed");
      },
    );
    return task;
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
          if (!cancelled) announce("Local project reopened with verified media.", "good");
        } else {
          const demo = await createDemoSlides();
          if (cancelled) {
            demo.forEach(disposeAsset);
            return;
          }
          assetsRef.current = demo;
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
          setAssets(demo);
        }
      } finally {
        if (!cancelled) {
          // A failed saved project may become readable after an app upgrade.
          // Never overwrite it with fallback demos unless the user explicitly
          // saves or successfully opens a replacement project.
          hydratedRef.current = hydrationSucceeded;
          setSaveState(hydrationSucceeded ? "saved" : "recovery");
        }
      }
    });
    return () => { cancelled = true; };
  }, [announce, enqueueProjectOperation, replaceProjectState]);

  useEffect(() => {
    const sonic = new SonicEngine(
      settingsRef.current.sound,
      setSonicState,
      (message) => announce(message, "error"),
    );
    sonicRef.current = sonic;
    let armed = false;
    const arm = () => {
      if (armed || !settingsRef.current.sound.previewEnabled) return;
      armed = true;
      void sonic.unlock();
      window.removeEventListener("pointerdown", arm, true);
      window.removeEventListener("keydown", arm, true);
    };
    const onVisibility = () => void sonic.suspendForVisibility(document.hidden);
    window.addEventListener("pointerdown", arm, true);
    window.addEventListener("keydown", arm, true);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointerdown", arm, true);
      window.removeEventListener("keydown", arm, true);
      document.removeEventListener("visibilitychange", onVisibility);
      sonic.dispose();
      if (sonicRef.current === sonic) sonicRef.current = null;
    };
  }, [announce]);

  useEffect(() => {
    sonicRef.current?.setSettings(settings.sound);
  }, [settings.sound]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;
    let engine: CinematicCarousel;
    try {
      engine = new CinematicCarousel(canvas, settingsRef.current, {
        onError: (message) => announce(message, "error"),
        onContextState: setContextState,
        onFrame: setFps,
        onSonicEvent: (event: CarouselSonicEvent) => {
          sonicRef.current?.play(event.type, {
            intensity: event.intensity,
            pan: event.pan,
            sequence: event.sequence,
            seed: event.seed,
            panVariation: event.panVariation,
          });
        },
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

  useEffect(() => { engineRef.current?.setSettings(settings); }, [settings]);
  useEffect(() => { void engineRef.current?.setAssets(assets); }, [assets]);
  useEffect(() => { void engineRef.current?.setPresenterAsset(pinnedAsset); }, [pinnedAsset]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    // Reserve the revision and expose the dirty state before the debounce.
    // An older in-flight hash can no longer relabel newer unsaved edits as saved.
    const revision = ++saveRevisionRef.current;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      if (revision !== saveRevisionRef.current) return;
      void persist(settings, assets, presenter, revision).catch((error: unknown) => {
        if (revision !== saveRevisionRef.current) return;
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
        width: settings.output.width,
        height: settings.output.height,
        fps: settings.output.fps,
        duration: settings.output.duration,
      }))
      .then((report) => live && setMp4Supported(report.mp4.supported))
      .catch(() => live && setMp4Supported(false));
    return () => { live = false; };
  }, [settings.output.duration, settings.output.fps, settings.output.height, settings.output.width]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (exportProgress || projectBusy || abortRef.current || projectPendingRef.current > 0 || saveState === "loading") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, button, [contenteditable=true]")) return;
      if (event.code === "Space") {
        event.preventDefault();
        const isPaused = engineRef.current?.togglePaused() ?? paused;
        setPaused(isPaused);
        sonicRef.current?.play("control", { intensity: 0.32 });
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        engineRef.current?.stepSlides(-1);
      } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        engineRef.current?.stepSlides(1);
      } else if (event.key.toLowerCase() === "f") {
        setFocusMode((value) => !value);
        sonicRef.current?.play("control", { intensity: 0.28 });
      } else if (event.key === "Escape") {
        setFocusMode(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exportProgress, paused, projectBusy, saveState]);

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    assetsRef.current.forEach(disposeAsset);
    if (presenterRef.current) disposeAsset(presenterRef.current);
  }, []);

  const addImagesNow = useCallback(async (files: File[]) => {
    const startingAssets = assetsRef.current;
    const replacingStartingDemos = startingAssets.length > 0 && startingAssets.every((asset) => asset.demo);
    const startingRoom = Math.max(0, MAX_SLIDES - (replacingStartingDemos ? 0 : startingAssets.length));
    if (startingRoom === 0) {
      announce(`This version supports up to ${MAX_SLIDES} moving slides.`, "error");
      return;
    }
    const candidates = files.filter((file) => file.type.startsWith("image/")).slice(0, startingRoom);
    if (!candidates.length) {
      announce("No supported images were selected.", "error");
      return;
    }
    const decoded = await Promise.allSettled(candidates.map((file) => imageFileToAsset(file)));
    const decodedAssets = decoded.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    if (!decodedAssets.length) {
      announce("None of those images could be decoded.", "error");
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
      announce(`This version supports up to ${MAX_SLIDES} moving slides; ${rejected} selected file${rejected === 1 ? " was" : "s were"} rejected.`, "error");
      return;
    }
    if (replacingDemos) current.forEach(disposeAsset);
    const next = [...retained, ...accepted];
    // Commit the ref and React state as one logical mutation. A later queued
    // batch therefore measures real capacity, not the render that began its decode.
    assetsRef.current = next;
    setAssets(next);
    announce(`${accepted.length} slide${accepted.length === 1 ? "" : "s"} added${rejected ? `; ${rejected} rejected` : ""}.`, rejected ? "quiet" : "good");
  }, [announce]);

  const addImages = useCallback((files: File[]) => {
    void enqueueProjectOperation(() => addImagesNow(files));
  }, [addImagesNow, enqueueProjectOperation]);

  const addPresenterNow = useCallback(async (file: File) => {
    try {
      const next = await videoFileToAsset(file);
      setPresenter((current) => {
        if (current) disposeAsset(current);
        return next;
      });
      setSettings((current) => ({
        ...current,
        presenter: { ...current.presenter, enabled: true, assetId: next.id },
      }));
      announce("Presenter video pinned. Audio will be checked—not silently dropped—at export.", "good");
    } catch (error) {
      announce(error instanceof Error ? error.message : "Presenter video could not be opened.", "error");
    }
  }, [announce]);

  const addPresenter = useCallback((file: File) => {
    void enqueueProjectOperation(() => addPresenterNow(file));
  }, [addPresenterNow, enqueueProjectOperation]);

  const removeAsset = useCallback((id: string) => {
    setAssets((current) => {
      const removed = current.find((asset) => asset.id === id);
      if (removed) disposeAsset(removed);
      return current.filter((asset) => asset.id !== id);
    });
    setSettings((current) => clearPinnedAssetIfRemoved(current, id));
  }, []);

  const reorder = useCallback((fromId: string, toId: string) => {
    setAssets((current) => {
      const from = current.findIndex((asset) => asset.id === fromId);
      const to = current.findIndex((asset) => asset.id === toId);
      if (from < 0 || to < 0 || from === to) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });
  }, []);

  const pin = useCallback((asset: StudioAsset | null) => {
    setSettings((current) => ({
      ...current,
      presenter: { ...current.presenter, enabled: Boolean(asset), assetId: asset?.id ?? null },
    }));
  }, []);

  const removePresenter = useCallback(() => {
    const removedPresenterId = presenterRef.current?.id ?? null;
    setPresenter((current) => {
      if (current) disposeAsset(current);
      return null;
    });
    setSettings((current) => clearPinnedAssetIfRemoved(current, removedPresenterId));
  }, []);

  const renderForExport = useCallback(async (time: number, frame?: { image: HTMLCanvasElement | OffscreenCanvas }) => {
    const engine = engineRef.current;
    if (!engine) throw new Error("Cinematic renderer is unavailable.");
    engine.setPresenterExportFrame(frame?.image ?? null);
    await engine.renderAtAsync(time);
  }, []);

  const beginExport = useCallback(() => {
    if (projectPendingRef.current > 0) throw new Error("A project or media operation is still in progress.");
    const engine = engineRef.current;
    if (!engine) throw new Error("Cinematic renderer is unavailable; export is blocked.");
    const output = settingsRef.current.output;
    const surface = engine.beginExport(output.width, output.height);
    const controller = new AbortController();
    abortRef.current = controller;
    sonicRef.current?.setSuppressed(true);
    setExportProgress({ phase: "preparing", completed: 0, total: 1_000, message: "Preparing deterministic timeline" });
    return { engine, controller, surface, output };
  }, []);

  const endExport = useCallback((surface: { restore: () => void }): Error | null => {
    let restoreError: Error | null = null;
    try {
      surface.restore();
    } catch (error) {
      restoreError = error instanceof Error
        ? error
        : new Error("Preview could not be restored after export.");
    } finally {
      sonicRef.current?.setSuppressed(false);
      abortRef.current = null;
      window.setTimeout(() => setExportProgress(null), 650);
    }
    return restoreError;
  }, []);

  const exportVideo = useCallback(async () => {
    if (!engineRef.current) {
      announce("Cinematic renderer is unavailable; export is blocked.", "error");
      return;
    }
    if (mp4Supported === false) {
      announce("This browser cannot encode the requested H.264 master. Use current desktop Chromium or Brave, or export PNG frames.", "error");
      return;
    }
    let fileHandle: FileSystemFileHandle | null = null;
    const savePicker = (window as PickerWindow).showSaveFilePicker;
    if (savePicker) {
      try {
        fileHandle = await savePicker({
          id: "pitchdog-drift-master",
          suggestedName: `drift-master-${timestampSlug()}.mp4`,
          types: [{ description: "H.264 MP4 master", accept: { "video/mp4": [".mp4"] } }],
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          announce("MP4 export canceled before rendering.");
          return;
        }
        announce(error instanceof Error ? error.message : "Could not choose an MP4 destination.", "error");
        return;
      }
    }
    let session: ReturnType<typeof beginExport> | null = null;
    let outcome: ExportOutcome | null = null;
    try {
      session = beginExport();
      const pinnedVideo = settingsRef.current.presenter.enabled && pinnedAsset?.kind === "video" ? pinnedAsset : null;
      const [
        { createFileSystemMp4Target, exportMp4, getExportFrameCount },
        { renderSonicSoundtrack },
      ] = await Promise.all([
        import("./lib/exportStudio"),
        import("./sonic/renderSoundtrack"),
      ]);
      const encodedDuration = getExportFrameCount({
        fps: session.output.fps,
        duration: session.output.duration,
      }) / session.output.fps;
      const exportProjectSettings: StudioSettings = {
        ...settingsRef.current,
        output: { ...settingsRef.current.output, duration: encodedDuration },
      };
      const soundtrack = await renderSonicSoundtrack(
        exportProjectSettings,
        assetsRef.current.length,
        encodedDuration,
        session.controller.signal,
      );
      const target = fileHandle ? await createFileSystemMp4Target(fileHandle, session.controller.signal) : undefined;
      const result = await exportMp4({
        canvas: session.engine.canvas,
        renderAt: renderForExport,
        settings: {
          width: session.output.width,
          height: session.output.height,
          fps: session.output.fps,
          duration: session.output.duration,
        },
        presenter: pinnedVideo?.blob,
        includePresenterAudio: !settingsRef.current.presenter.muted,
        soundtrack: soundtrack ?? undefined,
        soundtrackGainWhenMixed: settingsRef.current.sound.duckUnderPresenter,
        signal: session.controller.signal,
        onProgress: (progress) => setExportProgress(encoderProgress(progress)),
        target,
      });
      if (result.blob) downloadBlob(result.blob, `drift-master-${timestampSlug()}.mp4`);
      outcome = {
        message: `${result.width} × ${result.height} H.264 master verified: ${result.verification.frameCount} frames at ${result.fps} fps.`,
        kind: "good",
      };
    } catch (error) {
      outcome = exportOutcomeFromError(
        error,
        session?.controller.signal,
        "MP4 export canceled.",
        "MP4 export failed.",
      );
    } finally {
      const restoreError = session ? endExport(session.surface) : null;
      if (restoreError) {
        outcome = {
          message: `Export completed, but preview recovery failed: ${restoreError.message}`,
          kind: "error",
        };
      }
      if (outcome) announce(outcome.message, outcome.kind);
    }
  }, [announce, beginExport, endExport, mp4Supported, pinnedAsset, renderForExport]);

  const exportStill = useCallback(async () => {
    let session: ReturnType<typeof beginExport> | null = null;
    let outcome: ExportOutcome | null = null;
    try {
      session = beginExport();
      const pinnedVideo = settingsRef.current.presenter.enabled && pinnedAsset?.kind === "video" ? pinnedAsset : null;
      const { exportPngStill } = await import("./lib/exportStudio");
      const result = await exportPngStill({
        canvas: session.engine.canvas,
        renderAt: renderForExport,
        settings: {
          width: session.output.width,
          height: session.output.height,
          fps: session.output.fps,
          duration: session.output.duration,
        },
        presenter: pinnedVideo?.blob,
        signal: session.controller.signal,
        requireAlpha: true,
        requireTransparentPixels: settingsRef.current.stage.transparent || settingsRef.current.background.style === "transparent",
        onProgress: (progress) => setExportProgress(encoderProgress(progress)),
      });
      downloadBlob(result.blob, `drift-still-${timestampSlug()}.png`);
      outcome = {
        message: `${result.width} × ${result.height} PNG captured with an alpha-capable channel.`,
        kind: "good",
      };
    } catch (error) {
      outcome = exportOutcomeFromError(
        error,
        session?.controller.signal,
        "PNG capture canceled.",
        "PNG capture failed.",
      );
    } finally {
      const restoreError = session ? endExport(session.surface) : null;
      if (restoreError) {
        outcome = {
          message: `PNG capture completed, but preview recovery failed: ${restoreError.message}`,
          kind: "error",
        };
      }
      if (outcome) announce(outcome.message, outcome.kind);
    }
  }, [announce, beginExport, endExport, pinnedAsset, renderForExport]);

  const exportFrames = useCallback(async () => {
    let session: ReturnType<typeof beginExport> | null = null;
    let outcome: ExportOutcome | null = null;
    try {
      session = beginExport();
      const pinnedVideo = settingsRef.current.presenter.enabled && pinnedAsset?.kind === "video" ? pinnedAsset : null;
      const { exportPngSequence } = await import("./lib/exportStudio");
      const common = {
        canvas: session.engine.canvas,
        renderAt: renderForExport,
        settings: {
          width: session.output.width,
          height: session.output.height,
          fps: session.output.fps,
          duration: session.output.duration,
        },
        presenter: pinnedVideo?.blob,
        signal: session.controller.signal,
        requireAlpha: true,
        requireTransparentPixels: settingsRef.current.stage.transparent || settingsRef.current.background.style === "transparent",
        onProgress: (progress: EncoderProgress) => setExportProgress(encoderProgress(progress)),
      };
      const picker = (window as PickerWindow).showDirectoryPicker;
      if (picker) {
        const directory = await picker({ id: "pitchdog-drift-frames", mode: "readwrite" });
        const result = await exportPngSequence({ ...common, destination: "directory", directory, framePrefix: "drift" });
        outcome = {
          message: `${result.frameCount} numbered PNG frames written and verified.`,
          kind: "good",
        };
      } else {
        const result = await exportPngSequence({ ...common, destination: "zip", framePrefix: "drift" });
        if (!result.blob) throw new Error("PNG ZIP completed without bytes.");
        downloadBlob(result.blob, `drift-frames-${timestampSlug()}.zip`);
        outcome = {
          message: `${result.frameCount} numbered PNG frames rendered into a verified ZIP.`,
          kind: "good",
        };
      }
    } catch (error) {
      outcome = exportOutcomeFromError(
        error,
        session?.controller.signal,
        "PNG sequence export canceled.",
        "PNG sequence export failed.",
      );
    } finally {
      const restoreError = session ? endExport(session.surface) : null;
      if (restoreError) {
        outcome = {
          message: `PNG sequence completed, but preview recovery failed: ${restoreError.message}`,
          kind: "error",
        };
      }
      if (outcome) announce(outcome.message, outcome.kind);
    }
  }, [announce, beginExport, endExport, pinnedAsset, renderForExport]);

  const savePortableProjectNow = useCallback(async () => {
    try {
      if (!hydratedRef.current) {
        const recovery = recoverySnapshotRef.current;
        if (!recovery) {
          throw new Error("The locked saved project could not be read safely. Open a verified project to replace it; fallback demos will not overwrite it.");
        }
        const recoveryBlob = await exportProject(recovery);
        downloadBlob(recoveryBlob, `drift-recovery-${timestampSlug()}.pitched`);
        announce("Locked saved project re-verified and repackaged with its preserved manifest and media. Fallback demos were not written over it.", "good");
        return;
      }
      const snapshot = await persist();
      const blob = await exportProject(snapshot);
      downloadBlob(blob, `drift-project-${timestampSlug()}.pitched`);
      announce("Portable project saved with original media and SHA-256 manifest.", "good");
    } catch (error) {
      announce(error instanceof Error ? error.message : "Portable project could not be saved.", "error");
    }
  }, [announce, persist]);

  const savePortableProject = useCallback(() => {
    void enqueueProjectOperation(savePortableProjectNow);
  }, [enqueueProjectOperation, savePortableProjectNow]);

  const openPortableProjectFile = useCallback(async (file: File) => {
    try {
      const verified = await importProject<StudioProjectPayload>(file);
      const payload = parsePayload(verified.payload);
      const wasHydrated = hydratedRef.current;
      const previous = wasHydrated
        ? await persist()
        : await createProjectBundle({
            payload: makePayload(settingsRef.current, assetsRef.current, presenterRef.current),
            assets: [...assetsRef.current, ...(presenterRef.current ? [presenterRef.current] : [])].map((asset) => ({
              id: asset.id,
              name: asset.name,
              blob: asset.blob,
            })),
            engineVersion: ENGINE_VERSION,
            themeVersion: THEME_VERSION,
          });
      let replaced = false;
      try {
        await replaceProjectState({ ...verified, payload, manifest: { ...verified.manifest, payload } });
        replaced = true;
        const saved = await persist(payload.settings, assetsRef.current, presenterRef.current);
        identityRef.current = { projectId: saved.manifest.projectId, createdAt: saved.manifest.createdAt };
        hydratedRef.current = true;
        recoverySnapshotRef.current = null;
      } catch (error) {
        if (replaced) {
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
      announce("Portable project verified, opened, and copied into local storage.", "good");
    } catch (error) {
      announce(error instanceof Error ? `Project rejected: ${error.message}` : "Project was rejected.", "error");
    }
  }, [announce, persist, replaceProjectState]);

  const openPortableProject = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    void enqueueProjectOperation(() => openPortableProjectFile(file));
  }, [enqueueProjectOperation, openPortableProjectFile]);

  const togglePause = useCallback(() => {
    const next = engineRef.current?.togglePaused() ?? !paused;
    setPaused(next);
    sonicRef.current?.play("control", { intensity: 0.32 });
  }, [paused]);

  const onTheme = useCallback((id: ThemeId) => {
    setSettings((current) => applyTheme(current, getTheme(id)));
    sonicRef.current?.play("control", { intensity: 0.38 });
    announce(`${getTheme(id).name} is now directing the scene.`);
  }, [announce]);

  const directSound = useCallback((patch: Partial<StudioSettings["sound"]>) => {
    const sonic = sonicRef.current;
    const immediateSound = { ...settingsRef.current.sound, ...patch };
    // Sync the audio engine inside the trusted gesture. Waiting for React's
    // effect would make a migrated muted project require a second click.
    sonic?.setSettings(immediateSound);
    if (patch.previewEnabled === true) void sonic?.unlock();
    setSettings((current) => ({
      ...current,
      sound: { ...current.sound, ...patch },
    }));
  }, []);

  const auditionSound = useCallback(() => {
    void sonicRef.current?.audition();
  }, []);

  const capabilityLabel = webglError
    ? "DOM fallback"
    : mp4Supported === null
      ? "checking encoder"
      : mp4Supported
        ? "WebGL2 · H.264 ready"
        : "WebGL2 · PNG output";
  const interactionBusy = Boolean(exportProgress) || projectBusy || saveState === "loading";

  return (
    <main className="app" data-focus={focusMode} data-active-panel={activePanel}>
      <header className="app-header">
        <a className="wordmark" href="#studio" aria-label="Drift studio home">
          <span>pitch.dog</span>
          <strong>DRIFT</strong>
        </a>
        <p>Decks should move like they mean it.</p>
        <div className="header-status">
          <span className="capability-dot" data-ready={!webglError} />
          <span>{capabilityLabel}</span>
          <span className="header-divider" />
          <span>{saveState === "loading" ? "loading local project…" : saveState === "saving" ? "saving locally…" : saveState === "failed" ? "local save failed" : saveState === "recovery" ? "recovery locked" : "saved locally"}</span>
        </div>
      </header>

      <nav className="mobile-tabs" aria-label="Studio panels">
        {(["media", "stage", "director"] as const).map((panel) => (
          <button type="button" key={panel} onClick={() => {
            setActivePanel(panel);
            sonicRef.current?.play("control", { intensity: 0.24 });
          }} aria-pressed={activePanel === panel}>
            {panel}
          </button>
        ))}
      </nav>

      <div id="studio" className="studio-shell">
        <MediaLibrary
          assets={assets}
          presenter={presenter}
          pinnedAssetId={settings.presenter.assetId}
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
          settings={settings}
          assets={assets}
          webglError={webglError}
          contextState={contextState}
          fps={fps}
          paused={paused}
          focusMode={focusMode}
          exportProgress={exportProgress}
          onTogglePause={togglePause}
          onStep={(amount) => engineRef.current?.stepSlides(amount)}
          onToggleFocus={() => {
            setFocusMode((value) => !value);
            sonicRef.current?.play("control", { intensity: 0.28 });
          }}
          onDropImages={addImages}
          onCancelExport={() => abortRef.current?.abort("Canceled by user")}
          sound={settings.sound}
          sonicState={sonicState}
          onSound={directSound}
          onAuditionSound={auditionSound}
          busy={interactionBusy}
        />
        <ControlPanel
          settings={settings}
          onSettings={setSettings}
          onTheme={onTheme}
          onExportStill={exportStill}
          onExportVideo={exportVideo}
          onExportFrames={exportFrames}
          onExportProject={savePortableProject}
          onImportProject={() => importInputRef.current?.click()}
          exporting={interactionBusy}
        />
      </div>

      <input
        ref={importInputRef}
        hidden
        tabIndex={-1}
        type="file"
        disabled={interactionBusy}
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
            <p>The software AAC path uses FFmpeg libraries under LGPL-2.1-or-later.</p>
            <span>
              <a href="https://github.com/bomkino/pitchdog-drift" target="_blank" rel="noreferrer">Complete source</a>
              <a href="https://github.com/bomkino/pitchdog-drift/blob/main/LICENSE" target="_blank" rel="noreferrer">Read the licence</a>
              <a href="https://github.com/bomkino/pitchdog-drift/blob/main/THIRD_PARTY_NOTICES.md" target="_blank" rel="noreferrer">Notices</a>
            </span>
          </div>
        </details>
        <span>THREE.JS / RAW GLSL / FIXED-STEP PICTURE + SOUND</span>
      </footer>
    </main>
  );
}
