import * as THREE from "three";
import { evaluateProjectFrame, type ProjectFrameEvaluation } from "../core/render/projectFrameAdapter";
import { DRIFT_V2_RENDER_CONTRACT, type DriftProjectV4, type SlideDirective } from "../core/project/schema";
import { studioSettingsFromDriftProject } from "../core/project/studioProjection";
import { validateDriftProjectV4 } from "../core/project/validation";
import { resolvePresenterOverlayLayout, type PresenterOverlayLayout } from "../core/presenter/layout";
import { resolvePinLaneComposition, resolveProtectedPinLaneComposition } from "../core/presenter/lane";
import {
  createPerformanceLifecycle,
  type LifecycleLayerSample,
  type PerformanceLifecycleSample,
  type PerformanceLifecycleTimeline,
  type TransitionTreatment,
} from "../core/timeline/performanceLifecycle";
import {
  evaluatePerformanceTravel,
  loopPerformanceTime,
} from "../core/timeline/renderTravel";
import type { StudioAsset, StudioSettings } from "../model";
import {
  evaluateSlide,
  getLogicalSlotCount,
  getSlideGeometry,
  isPotentiallyVisible,
  type EvaluatedSlide,
} from "./evaluate";
import { resolveBackgroundPhase } from "./backgroundPhase";
import { resolveLifecycleLayerPresentation } from "./lifecyclePresentation";
import {
  backgroundFragmentShader,
  backgroundVertexShader,
  shadowFragmentShader,
  shadowVertexShader,
  slideFragmentShader,
  slideVertexShader,
} from "./shaders";

const MAX_POOL_SIZE = 24;
const TEXTURE_CACHE_LIMIT = 24;
const PREVIEW_TEXTURE_EDGE = 2048;
const CAMERA_FOV = 35;
const SHADOW_ALPHA_CUTOFF = 0.001;
const GRAIN_SEED_MODULUS = 4093;
const GRAIN_CADENCE_FPS = 12;
const PRESENTER_EXACT_SEEK_EPSILON_SECONDS = 0.001;
const PRESENTER_MIN_RUNNING_DRIFT_SECONDS = 0.025;

/**
 * Give the Gaussian enough geometry to reach the shader's discard threshold.
 * The result is a per-side margin; opacity matters because a faint shadow can
 * terminate sooner without exposing a hard plane edge.
 */
export function getShadowSupportMargin(softnessPx: number, opacity: number): number {
  const boundedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
  if (boundedOpacity <= SHADOW_ALPHA_CUTOFF) return 0;
  const sigma = Math.max(1, Math.max(0, softnessPx) * 0.34);
  return Math.ceil(sigma * Math.sqrt(2 * Math.log(boundedOpacity / SHADOW_ALPHA_CUTOFF)));
}

/**
 * WebGL uniforms are float32. Fold large Project V3 seeds into an exactly
 * representable prime range before the shader uses them as a coordinate shift.
 */
export function normalizeGrainSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 0;
  const integer = Math.trunc(seed);
  return ((integer % GRAIN_SEED_MODULUS) + GRAIN_SEED_MODULUS) % GRAIN_SEED_MODULUS;
}

/**
 * Export frame identity is discrete authority, not a value to recover from a
 * floating-point timestamp. Keep the nullable form for preview and legacy
 * callers while rejecting ambiguous export identities at the engine boundary.
 */
export function resolveExportFrameIndex(frameIndex: number | null | undefined): number | null {
  if (frameIndex === null || frameIndex === undefined) return null;
  if (!Number.isSafeInteger(frameIndex) || frameIndex < 0) {
    throw new Error(`Export frame index must be a non-negative safe integer; received ${frameIndex}.`);
  }
  return frameIndex;
}

/**
 * Film grain is the first legacy-renderer input governed by discrete frame
 * identity. Existing callers retain the time-derived fallback until every
 * render path supplies an explicit export frame index.
 */
export function resolveGrainFrame(
  time: number,
  fps: number,
  exportMode: boolean,
  reducedMotion: boolean,
  exportFrameIndex: number | null = null,
): number {
  if (reducedMotion) return 0;
  const explicitFrameIndex = resolveExportFrameIndex(exportFrameIndex);
  const cadence = Math.min(GRAIN_CADENCE_FPS, fps);
  if (exportMode && explicitFrameIndex !== null) {
    return Math.floor(explicitFrameIndex * cadence / fps);
  }
  return Math.floor(Math.max(0, time) * cadence);
}

export interface PresenterPreviewClockInput {
  masterTime: number;
  previousMasterTime: number | null;
  videoTime: number;
  videoDuration: number;
  masterFps: number;
  exact: boolean;
}

export interface PresenterPreviewClockDecision {
  targetTime: number | null;
  shouldSeek: boolean;
  wrapped: boolean;
}

/**
 * Maps the authored preview clock onto one presenter source pass. Running
 * playback may coast within one delivery frame; a master wrap and every frozen
 * state seek to the canonical source time. A short source holds its last
 * decodable frame because export rejects under-length presenter media rather
 * than silently looping it. Export itself never uses this path; it continues
 * to provide an explicitly decoded presenter frame.
 */
export function resolvePresenterPreviewClock(
  input: PresenterPreviewClockInput,
): PresenterPreviewClockDecision {
  if (!Number.isFinite(input.videoDuration) || input.videoDuration <= 0) {
    return { targetTime: null, shouldSeek: false, wrapped: false };
  }
  const masterTime = Math.max(0, Number.isFinite(input.masterTime) ? input.masterTime : 0);
  const fps = Number.isFinite(input.masterFps) && input.masterFps > 0 ? input.masterFps : 30;
  const lastDecodableTime = Math.max(0, input.videoDuration - 1 / fps);
  const targetTime = Math.min(masterTime, lastDecodableTime);
  const videoTime = Math.max(0, Number.isFinite(input.videoTime) ? input.videoTime : 0);
  const exactEpsilon = PRESENTER_EXACT_SEEK_EPSILON_SECONDS;
  const masterWrapped = input.previousMasterTime !== null
    && masterTime + exactEpsilon < input.previousMasterTime;
  const tolerance = input.exact
    ? exactEpsilon
    : Math.max(PRESENTER_MIN_RUNNING_DRIFT_SECONDS, 1 / fps);
  return {
    targetTime,
    shouldSeek: masterWrapped || Math.abs(videoTime - targetTime) > tolerance,
    wrapped: masterWrapped,
  };
}

function waitForPresenterVideoState(
  video: HTMLVideoElement,
  eventName: "loadedmetadata" | "loadeddata" | "seeked",
  ready: () => boolean,
  timeoutMs = 5_000,
): Promise<void> {
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      globalThis.clearTimeout(timeout);
      video.removeEventListener(eventName, onReady);
      video.removeEventListener("error", onError);
    };
    const onReady = () => {
      if (!ready()) return;
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Presenter video could not prepare a canonical preview frame."));
    };
    const timeout = globalThis.setTimeout(() => {
      cleanup();
      reject(new Error("Presenter video preview preparation timed out."));
    }, timeoutMs);
    video.addEventListener(eventName, onReady);
    video.addEventListener("error", onError, { once: true });
  });
}

async function preparePresenterPreviewFrame(
  video: HTMLVideoElement,
  readMasterTime: () => number,
  masterFps: number,
): Promise<number> {
  await waitForPresenterVideoState(
    video,
    "loadedmetadata",
    () => video.readyState >= HTMLMediaElement.HAVE_METADATA
      && Number.isFinite(video.duration)
      && video.duration > 0,
  );
  video.pause();
  const frameDuration = 1 / (Number.isFinite(masterFps) && masterFps > 0 ? masterFps : 30);
  let alignedMasterTime = readMasterTime();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    alignedMasterTime = readMasterTime();
    const decision = resolvePresenterPreviewClock({
      masterTime: alignedMasterTime,
      previousMasterTime: null,
      videoTime: video.currentTime,
      videoDuration: video.duration,
      masterFps,
      exact: true,
    });
    const targetTime = decision.targetTime ?? 0;
    if (Math.abs(video.currentTime - targetTime) > PRESENTER_EXACT_SEEK_EPSILON_SECONDS) {
      video.currentTime = targetTime;
      await waitForPresenterVideoState(
        video,
        "seeked",
        () => !video.seeking
          && Math.abs(video.currentTime - targetTime) <= PRESENTER_EXACT_SEEK_EPSILON_SECONDS,
      );
    }
    if (Math.abs(readMasterTime() - alignedMasterTime) <= frameDuration) break;
  }
  await waitForPresenterVideoState(
    video,
    "loadeddata",
    () => video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
  );
  return alignedMasterTime;
}

/**
 * V2's composition alpha mode is an output invariant, including lifecycle
 * transitions. An opaque composition therefore clears to an opaque black
 * matte so faded RGB layers cannot punch transient holes into the canvas.
 * Compatibility rendering keeps its established transparent clear and lets
 * the legacy background pass establish opacity.
 */
export function resolveCanvasClearAlpha(
  project: Pick<DriftProjectV4, "renderContract" | "composition"> | null,
): 0 | 1 {
  return project?.renderContract === DRIFT_V2_RENDER_CONTRACT
    && project.composition.alphaMode === "opaque"
    ? 1
    : 0;
}

interface EngineCallbacks {
  onError?: (message: string) => void;
  onContextState?: (state: "ready" | "lost" | "restored") => void;
  onFrame?: (fps: number) => void;
  onActiveSlide?: (index: number) => void;
}

interface TextureRecord {
  texture: THREE.Texture;
  source: ImageBitmap | HTMLImageElement;
  aspect: number;
  lastUsed: number;
}

interface SlidePoolItem {
  group: THREE.Group;
  slide: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  material: THREE.ShaderMaterial;
  shadowMaterial: THREE.ShaderMaterial;
  assetKey: string | null;
}

interface VisibleItem {
  logicalIndex: number;
  sourceIndex: number;
  layerIndex: number;
  asset: StudioAsset;
  evaluated: EvaluatedSlide;
  directive?: SlideDirective;
}

export interface MovingTrackAsset {
  asset: StudioAsset;
  sourceIndex: number;
}

export function resolveMovingTrackAssets(
  assets: readonly StudioAsset[],
  presenterAsset: StudioAsset | null,
  presenter: Pick<StudioSettings["presenter"], "enabled" | "trackMode">,
): MovingTrackAsset[] {
  const excludedId = presenter.enabled
    && presenter.trackMode === "pinned-only"
    && presenterAsset?.kind === "image"
    ? presenterAsset.id
    : null;
  return assets.flatMap((asset, sourceIndex) => (
    asset.id === excludedId ? [] : [{ asset, sourceIndex }]
  ));
}

class StaleTextureRequestError extends Error {
  constructor() {
    super("Texture request was superseded by newer media.");
    this.name = "StaleTextureRequestError";
  }
}

/**
 * A bounded mesh pool must preserve the composition's focal neighborhood.
 * Select by distance from the playhead first, then restore far-to-near order
 * for correct transparent blending. This keeps extreme custom ratios from
 * filling the pool with distant slides and dropping the centered frame.
 */
export function selectRenderableItems<T extends { evaluated: Pick<EvaluatedSlide, "primary" | "z"> }>(
  items: readonly T[],
  limit: number,
): T[] {
  if (!Number.isSafeInteger(limit) || limit <= 0) return [];
  const selected = items.length <= limit
    ? [...items]
    : [...items]
        .sort((a, b) => Math.abs(a.evaluated.primary) - Math.abs(b.evaluated.primary))
        .slice(0, limit);
  return selected.sort((a, b) => a.evaluated.z - b.evaluated.z);
}

export interface EngineCapabilitySnapshot {
  webgl2: boolean;
  maxTextureSize: number;
  maxRenderbufferSize: number;
  maxViewportWidth: number;
  maxViewportHeight: number;
  maxAnisotropy: number;
  dpr: number;
}

export interface ExportSurfaceReceipt {
  width: number;
  height: number;
  restore: () => void;
}

export interface ExportSurfaceLimits {
  maxTextureSize: number;
  maxRenderbufferSize: number;
  maxViewportWidth: number;
  maxViewportHeight: number;
}

/**
 * Reject impossible drawing buffers before WebGL silently clamps or loses its
 * context. The most conservative independent width/height limit wins.
 */
export function assertExportSurfaceSupported(
  width: number,
  height: number,
  limits: ExportSurfaceLimits,
): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Export surface must use positive whole pixels; received ${width} × ${height}.`);
  }
  const maxWidth = Math.min(limits.maxTextureSize, limits.maxRenderbufferSize, limits.maxViewportWidth);
  const maxHeight = Math.min(limits.maxTextureSize, limits.maxRenderbufferSize, limits.maxViewportHeight);
  if (width > maxWidth || height > maxHeight) {
    throw new Error(
      `Export surface ${width} × ${height} exceeds this GPU's safe WebGL limit of ${maxWidth} × ${maxHeight}.`,
    );
  }
}

function backgroundMode(style: StudioSettings["background"]["style"]): number {
  switch (style) {
    case "solid": return 0;
    case "gradient": return 1;
    case "aura": return 2;
    case "paper": return 3;
    case "void": return 4;
    default: return 0;
  }
}

function createSlideMaterial(placeholder: THREE.Texture, depthTest = true): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: slideVertexShader,
    fragmentShader: slideFragmentShader,
    transparent: true,
    depthTest,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uMap: { value: placeholder },
      uTextureAspect: { value: 16 / 9 },
      uPlaneAspect: { value: 16 / 9 },
      uFit: { value: 0 },
      uFocal: { value: new THREE.Vector2(0.5, 0.5) },
      uSizePx: { value: new THREE.Vector2(800, 450) },
      uRadiusPx: { value: 24 },
      uSmoothing: { value: 0.6 },
      uBorderPx: { value: 1 },
      uBorderColor: { value: new THREE.Color("#ffffff") },
      uBorderOpacity: { value: 0.5 },
      uLegacyContainMatte: { value: 1 },
      uMatteColor: { value: new THREE.Color("#000000") },
      uMatteOpacity: { value: 1 },
      uOpacity: { value: 1 },
      uVelocity: { value: 0 },
      uDistortion: { value: 0 },
      uAxis: { value: 0 },
      uPhase: { value: 0 },
    },
  });
}

function createShadowMaterial(depthTest = true): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: shadowVertexShader,
    fragmentShader: shadowFragmentShader,
    transparent: true,
    depthTest,
    depthWrite: false,
    uniforms: {
      uCanvasSizePx: { value: new THREE.Vector2(900, 550) },
      uCardSizePx: { value: new THREE.Vector2(800, 450) },
      uRadiusPx: { value: 24 },
      uSmoothing: { value: 0.6 },
      uSoftnessPx: { value: 32 },
      uOpacity: { value: 0.35 },
    },
  });
}

export class CinematicCarousel {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;

  private readonly scene = new THREE.Scene();
  private readonly presenterScene = new THREE.Scene();
  private readonly backgroundScene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(CAMERA_FOV, 9 / 16, 1, 50_000);
  private readonly presenterCamera = new THREE.OrthographicCamera(-540, 540, 960, -960, 0.1, 100);
  private readonly backgroundCamera = new THREE.Camera();
  private readonly track = new THREE.Group();
  private readonly geometry = new THREE.PlaneGeometry(1, 1, 32, 18);
  private readonly backgroundGeometry = new THREE.PlaneGeometry(2, 2);
  private readonly backgroundMaterial: THREE.ShaderMaterial;
  private readonly backgroundMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly placeholderTexture: THREE.DataTexture;
  private readonly pool: SlidePoolItem[] = [];
  private readonly textureCache = new Map<string, TextureRecord>();
  private readonly texturePromises = new Map<string, Promise<TextureRecord>>();
  private readonly blobTextureKeys = new WeakMap<Blob, string>();
  private readonly callbacks: EngineCallbacks;

  private settings: StudioSettings;
  private project: DriftProjectV4 | null = null;
  private performanceTimeline: PerformanceLifecycleTimeline;
  private reducedPerformanceTimeline: PerformanceLifecycleTimeline;
  private assets: StudioAsset[] = [];
  private presenterAsset: StudioAsset | null = null;
  private presenterGroup: THREE.Group;
  private presenterSlide: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private presenterShadow: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private presenterMaterial: THREE.ShaderMaterial;
  private presenterShadowMaterial: THREE.ShaderMaterial;
  private presenterVideo: HTMLVideoElement | null = null;
  private presenterPreviewTexture: THREE.Texture | null = null;
  private presenterExportTexture: THREE.CanvasTexture<HTMLCanvasElement | OffscreenCanvas> | null = null;
  private presenterExportCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private presenterPreviewMasterTime: number | null = null;
  private presenterReducedMotionMasterTime: number | null = null;
  private presenterPendingSeekTarget: number | null = null;
  private presenterPlayPending = false;
  private presenterShouldPlay = false;

  private animationFrame = 0;
  private lastFrameTime = 0;
  private elapsed = 0;
  private motionPosition = 0;
  private motionVelocity = 0;
  private paused = false;
  private dragging = false;
  private dragPointerId: number | null = null;
  private lastPointerCoordinate = 0;
  private lastPointerTime = 0;
  private reducedMotionPreview = false;
  private contextLost = false;
  private disposed = false;
  private renderCounter = 0;
  private fpsFrameCounter = 0;
  private fpsSampleStarted = performance.now();
  private exportActive = false;
  private blobTextureKeyCounter = 0;
  private presenterRequestGeneration = 0;
  private projectStateGeneration = 0;
  private activeSlideIndex = -2;
  private readonly backgroundResolution = new THREE.Vector2();

  private readonly onPointerDownBound = (event: PointerEvent) => this.onPointerDown(event);
  private readonly onPointerMoveBound = (event: PointerEvent) => this.onPointerMove(event);
  private readonly onPointerUpBound = (event: PointerEvent) => this.onPointerUp(event);
  private readonly onWheelBound = (event: WheelEvent) => this.onWheel(event);
  private readonly onVisibilityBound = () => this.onVisibilityChange();
  private readonly onContextLostBound = (event: Event) => this.onContextLost(event);
  private readonly onContextRestoredBound = () => this.onContextRestored();

  constructor(canvas: HTMLCanvasElement, settings: StudioSettings, callbacks: EngineCallbacks = {}) {
    this.canvas = canvas;
    this.settings = settings;
    this.performanceTimeline = createPerformanceLifecycle({
      ...settings.performance,
      reducedMotion: settings.motion.reducedMotionOutput,
    });
    this.reducedPerformanceTimeline = createPerformanceLifecycle({
      ...settings.performance,
      reducedMotion: true,
    });
    this.callbacks = callbacks;

    const context = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      depth: true,
      // Normal alpha blending accumulates premultiplied RGB in the drawing
      // buffer. Declare that truth to the browser so canvas PNG capture
      // unpremultiplies once instead of storing darkened straight-alpha RGB.
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!context) throw new Error("WebGL2 is unavailable. Cinematic preview and export cannot run in this browser.");

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x000000, 0);

    this.placeholderTexture = new THREE.DataTexture(new Uint8Array([34, 31, 28, 255]), 1, 1, THREE.RGBAFormat);
    this.placeholderTexture.colorSpace = THREE.SRGBColorSpace;
    this.placeholderTexture.needsUpdate = true;

    this.backgroundMaterial = new THREE.ShaderMaterial({
      vertexShader: backgroundVertexShader,
      fragmentShader: backgroundFragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uResolution: { value: new THREE.Vector2(settings.stage.width, settings.stage.height) },
        uColorA: { value: new THREE.Color(settings.background.colorA) },
        uColorB: { value: new THREE.Color(settings.background.colorB) },
        uAccent: { value: new THREE.Color(settings.background.accent) },
        uMode: { value: backgroundMode(settings.background.style) },
        uIntensity: { value: settings.background.intensity },
        uMotion: { value: settings.background.motion },
        uGrain: { value: settings.background.grain },
        uGrainFrame: { value: 0 },
        uVignette: { value: settings.background.vignette },
        uPhase: { value: 0 },
        uSeed: { value: normalizeGrainSeed(settings.background.seed) },
        uOpacity: { value: 1 },
      },
    });
    this.backgroundMesh = new THREE.Mesh(this.backgroundGeometry, this.backgroundMaterial);
    this.backgroundMesh.frustumCulled = false;
    this.backgroundScene.add(this.backgroundMesh);
    this.scene.add(this.track);

    for (let index = 0; index < MAX_POOL_SIZE; index += 1) this.pool.push(this.createPoolItem(index));
    ({ group: this.presenterGroup, slide: this.presenterSlide, shadow: this.presenterShadow, material: this.presenterMaterial, shadowMaterial: this.presenterShadowMaterial } = this.createPoolItem(1000, true));
    this.presenterGroup.renderOrder = 1000;
    this.presenterSlide.renderOrder = 1001;
    this.presenterShadow.renderOrder = 999;
    this.presenterGroup.visible = false;
    this.presenterScene.add(this.presenterGroup);
    this.presenterCamera.position.z = 10;

    canvas.addEventListener("pointerdown", this.onPointerDownBound);
    canvas.addEventListener("pointermove", this.onPointerMoveBound);
    canvas.addEventListener("pointerup", this.onPointerUpBound);
    canvas.addEventListener("pointercancel", this.onPointerUpBound);
    canvas.addEventListener("wheel", this.onWheelBound, { passive: false });
    canvas.addEventListener("webglcontextlost", this.onContextLostBound);
    canvas.addEventListener("webglcontextrestored", this.onContextRestoredBound);
    document.addEventListener("visibilitychange", this.onVisibilityBound);

    this.updateCamera();
    this.updateSettingsUniforms();
    this.callbacks.onContextState?.("ready");
    this.start();
  }

  private createPoolItem(index: number, protectedOverlay = false): SlidePoolItem {
    const group = new THREE.Group();
    const material = createSlideMaterial(this.placeholderTexture, !protectedOverlay);
    const shadowMaterial = createShadowMaterial(!protectedOverlay);
    const slide = new THREE.Mesh(this.geometry, material);
    const shadow = new THREE.Mesh(this.geometry, shadowMaterial);
    slide.renderOrder = index * 2 + 2;
    shadow.renderOrder = index * 2 + 1;
    shadow.position.set(10, -14, -8);
    group.add(shadow, slide);
    group.visible = false;
    if (index < MAX_POOL_SIZE) this.track.add(group);
    return { group, slide, shadow, material, shadowMaterial, assetKey: null };
  }

  get capabilities(): EngineCapabilitySnapshot {
    const context = this.renderer.getContext();
    const viewport = context.getParameter(context.MAX_VIEWPORT_DIMS) as Int32Array | number[];
    return {
      webgl2: this.renderer.capabilities.isWebGL2,
      maxTextureSize: this.renderer.capabilities.maxTextureSize,
      maxRenderbufferSize: context.getParameter(context.MAX_RENDERBUFFER_SIZE) as number,
      maxViewportWidth: viewport[0] ?? 0,
      maxViewportHeight: viewport[1] ?? 0,
      maxAnisotropy: this.renderer.capabilities.getMaxAnisotropy(),
      dpr: this.renderer.getPixelRatio(),
    };
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isContextLost(): boolean {
    return this.contextLost;
  }

  private applySettings(settings: StudioSettings, render: boolean): void {
    this.settings = settings;
    this.performanceTimeline = createPerformanceLifecycle({
      ...settings.performance,
      reducedMotion: settings.motion.reducedMotionOutput,
    });
    this.reducedPerformanceTimeline = createPerformanceLifecycle({
      ...settings.performance,
      reducedMotion: true,
    });
    this.updateCamera();
    this.updateSettingsUniforms();
    this.updatePresenterGeometry();
    if (render && !this.exportActive) this.renderPreview();
  }

  setSettings(settings: StudioSettings): void {
    // StudioSettings remains the V1 compatibility input. A drift-v2/1 project
    // derives this draw-graph projection from Project V4 instead.
    if (this.project?.renderContract === DRIFT_V2_RENDER_CONTRACT) return;
    this.applySettings(settings, true);
  }

  setProject(projectInput: DriftProjectV4 | null): void {
    this.project = projectInput ? validateDriftProjectV4(projectInput) : null;
    if (this.project) {
      this.applySettings(studioSettingsFromDriftProject(this.project), false);
    }
    if (!this.exportActive) this.renderPreview();
  }

  async setProjectState(projectInput: DriftProjectV4, assets: StudioAsset[]): Promise<void> {
    const project = validateDriftProjectV4(projectInput);
    const generation = ++this.projectStateGeneration;
    this.project = project;
    // Project V4 is live state authority for both render contracts. V2 reads
    // it directly in the canonical evaluator; compatibility rendering still
    // needs the exact projected settings or its controls freeze on stale state.
    this.applySettings(studioSettingsFromDriftProject(project), false);
    await this.applyAssets(assets, false);
    if (generation !== this.projectStateGeneration || this.disposed) return;
    if (!this.exportActive) this.renderPreview();
  }

  async setAssets(assets: StudioAsset[]): Promise<void> {
    this.projectStateGeneration += 1;
    await this.applyAssets(assets, true);
  }

  private async applyAssets(assets: StudioAsset[], render: boolean): Promise<void> {
    const previousKeys = new Set(this.assets.map((asset) => this.textureKey(asset)));
    this.assets = assets.filter((asset) => asset.kind === "image");
    this.pruneInactiveTextures();
    const activeKeys = new Set(this.assets.map((asset) => this.textureKey(asset)));
    for (const item of this.pool) {
      if (item.assetKey && !activeKeys.has(item.assetKey)) {
        item.assetKey = null;
        item.group.visible = false;
        item.material.uniforms.uMap!.value = this.placeholderTexture;
      }
    }
    const additions = this.assets.filter((asset) => !previousKeys.has(this.textureKey(asset)));
    if (additions.length > 0) {
      await Promise.all(additions.slice(0, 8).map((asset) => this.ensureTexture(asset).catch(() => null)));
    }
    if (render) this.renderPreview();
  }

  private movingTrackAssets(): MovingTrackAsset[] {
    return resolveMovingTrackAssets(this.assets, this.presenterAsset, this.settings.presenter);
  }

  async setPresenterAsset(asset: StudioAsset | null): Promise<void> {
    const requestGeneration = ++this.presenterRequestGeneration;
    this.disposePresenterPreview();
    this.presenterAsset = asset;
    this.pruneInactiveTextures();
    if (!asset) {
      this.resolvePresenterTexture();
      return;
    }

    try {
      if (asset.kind === "video") {
        const video = document.createElement("video");
        video.preload = "auto";
        // Export consumes one source pass and rejects under-length video. Keep
        // preview honest by holding the tail rather than inventing a loop.
        video.loop = false;
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = "anonymous";
        video.src = asset.objectUrl;
        video.load();
        const alignedMasterTime = await preparePresenterPreviewFrame(
          video,
          () => this.previewMasterTime(),
          this.settings.output.fps,
        );
        if (requestGeneration !== this.presenterRequestGeneration || this.presenterAsset !== asset || this.disposed) {
          video.pause();
          video.removeAttribute("src");
          video.load();
          return;
        }
        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        this.presenterVideo = video;
        this.presenterPreviewTexture = texture;
        this.presenterPreviewMasterTime = alignedMasterTime;
        this.syncPresenterPlayback();
      } else {
        const record = await this.ensureTexture(asset);
        if (requestGeneration !== this.presenterRequestGeneration || this.presenterAsset !== asset || this.disposed) return;
        this.presenterPreviewTexture = record.texture;
      }
      if (requestGeneration !== this.presenterRequestGeneration || this.presenterAsset !== asset || this.disposed) return;
      // Async completion only stores the preview. The resolver preserves the
      // strict export-frame > fixed image > live preview precedence.
      this.resolvePresenterTexture();
    } catch (error) {
      if (requestGeneration !== this.presenterRequestGeneration || error instanceof StaleTextureRequestError) return;
      this.callbacks.onError?.(error instanceof Error ? error.message : "Presenter media failed to load.");
      this.presenterGroup.visible = false;
    }
  }

  setPresenterExportFrame(canvas: HTMLCanvasElement | OffscreenCanvas | null): void {
    if (!canvas) {
      this.presenterExportCanvas = null;
      if (this.presenterExportTexture) {
        this.presenterExportTexture.dispose();
        this.presenterExportTexture = null;
      }
      this.resolvePresenterTexture();
      return;
    }
    if (this.presenterExportCanvas !== canvas || !this.presenterExportTexture) {
      this.presenterExportTexture?.dispose();
      this.presenterExportCanvas = canvas;
      const exportTexture = new THREE.CanvasTexture<HTMLCanvasElement | OffscreenCanvas>(canvas);
      exportTexture.colorSpace = THREE.SRGBColorSpace;
      exportTexture.minFilter = THREE.LinearFilter;
      exportTexture.magFilter = THREE.LinearFilter;
      exportTexture.generateMipmaps = false;
      this.presenterExportTexture = exportTexture;
    }
    const exportTexture = this.presenterExportTexture;
    exportTexture.needsUpdate = true;
    this.resolvePresenterTexture();
  }

  private applyPresenterTexture(texture: THREE.Texture, aspect: number): void {
    this.presenterMaterial.uniforms.uMap!.value = texture;
    this.presenterMaterial.uniforms.uTextureAspect!.value = aspect;
  }

  private resolvePresenterTexture(fixedImage?: { asset: StudioAsset; record: TextureRecord }): void {
    if (!this.presenterAsset || !this.settings.presenter.enabled) {
      this.presenterMaterial.uniforms.uMap!.value = null;
      this.presenterGroup.visible = false;
      return;
    }

    if (this.exportActive) {
      if (this.presenterExportTexture && this.presenterExportCanvas) {
        this.applyPresenterTexture(
          this.presenterExportTexture,
          this.presenterExportCanvas.width / Math.max(1, this.presenterExportCanvas.height),
        );
        this.updatePresenterGeometry();
        return;
      }
      if (fixedImage && fixedImage.asset === this.presenterAsset && fixedImage.asset.kind === "image") {
        this.applyPresenterTexture(fixedImage.record.texture, fixedImage.record.aspect);
        this.updatePresenterGeometry();
        return;
      }
      // A video export without a decoded frame must never fall back to the
      // wall-clock VideoTexture or a previous frame.
      this.presenterMaterial.uniforms.uMap!.value = null;
      this.presenterGroup.visible = false;
      return;
    }

    if (this.presenterPreviewTexture) {
      this.applyPresenterTexture(
        this.presenterPreviewTexture,
        this.presenterAsset.width / Math.max(1, this.presenterAsset.height),
      );
      this.updatePresenterGeometry();
      return;
    }

    this.presenterMaterial.uniforms.uMap!.value = null;
    this.presenterGroup.visible = false;
  }

  private disposePresenterPreview(): void {
    if (this.presenterVideo) {
      this.presenterVideo.pause();
      this.presenterVideo.removeAttribute("src");
      this.presenterVideo.load();
      this.presenterVideo = null;
    }
    const presenterKey = this.presenterAsset ? this.textureKey(this.presenterAsset) : null;
    if (this.presenterPreviewTexture && this.presenterPreviewTexture !== (presenterKey ? this.textureCache.get(presenterKey)?.texture : undefined)) {
      this.presenterPreviewTexture.dispose();
    }
    this.presenterPreviewTexture = null;
    this.presenterPreviewMasterTime = null;
    this.presenterReducedMotionMasterTime = null;
    this.presenterPendingSeekTarget = null;
    this.presenterPlayPending = false;
    this.presenterShouldPlay = false;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.motionVelocity = 0;
    this.syncPresenterPlayback();
  }

  togglePaused(): boolean {
    this.setPaused(!this.paused);
    return this.paused;
  }

  setReducedMotionPreview(reduced: boolean): void {
    if (reduced && !this.reducedMotionPreview) {
      this.presenterReducedMotionMasterTime = this.previewMasterTime();
    } else if (!reduced) {
      this.presenterReducedMotionMasterTime = null;
    }
    this.reducedMotionPreview = reduced;
    if (reduced) this.motionVelocity = 0;
    this.syncPresenterPlayback();
  }

  stepSlides(amount: number): void {
    const geometry = getSlideGeometry(this.settings);
    this.motionPosition += geometry.stride * amount * this.settings.motion.direction;
    this.motionVelocity = 0;
    this.renderPreview();
  }

  resize(width: number, height: number): void {
    if (this.exportActive || width <= 0 || height <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    this.updateCamera();
    this.renderPreview();
  }

  beginExport(width: number, height: number): ExportSurfaceReceipt {
    if (this.exportActive) throw new Error("Export surface is already active.");
    assertExportSurfaceSupported(width, height, this.capabilities);
    const previousSize = new THREE.Vector2();
    this.renderer.getSize(previousSize);
    const previousPixelRatio = this.renderer.getPixelRatio();
    const previousPaused = this.paused;
    this.exportActive = true;
    this.paused = true;
    this.syncPresenterPlayback();
    this.resolvePresenterTexture();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.backgroundMaterial.uniforms.uResolution!.value.set(width, height);
    return {
      width,
      height,
      restore: () => {
        if (!this.exportActive) return;
        this.exportActive = false;
        this.paused = previousPaused;
        this.syncPresenterPlayback();
        this.renderer.setPixelRatio(previousPixelRatio);
        this.renderer.setSize(previousSize.x, previousSize.y, false);
        this.updateCamera();
        this.setPresenterExportFrame(null);
        this.renderPreview();
      },
    };
  }

  renderAt(time: number, frameIndex: number | null = null): void {
    const exportFrameIndex = resolveExportFrameIndex(frameIndex);
    if (this.project?.renderContract === DRIFT_V2_RENDER_CONTRACT) {
      const evaluation = evaluateProjectFrame({
        project: this.project,
        time,
        frameIndex: exportFrameIndex,
        assets: this.assets,
      });
      this.renderProjectFrame(evaluation, true);
      return;
    }
    const geometry = getSlideGeometry(this.settings);
    const movingAssets = this.movingTrackAssets();
    const slotCount = getLogicalSlotCount(movingAssets.length, geometry);
    const travel = evaluatePerformanceTravel(this.performanceTimeline, time, {
      direction: this.settings.motion.direction,
      slidesPerSecond: this.settings.motion.speed,
      stride: geometry.stride,
      slotCount,
      slideLayerCount: this.assets.length,
      seamless: this.settings.motion.seamless,
      seamlessLoops: Math.max(1, Math.round(this.settings.motion.seamlessLoops)),
    });
    this.renderInternal(time, travel.distance, travel.velocity, true, exportFrameIndex, travel.lifecycle);
  }

  async renderAtAsync(time: number, frameIndex: number | null = null): Promise<void> {
    const exportFrameIndex = resolveExportFrameIndex(frameIndex);
    if (this.project?.renderContract === DRIFT_V2_RENDER_CONTRACT) {
      const evaluation = evaluateProjectFrame({
        project: this.project,
        time,
        frameIndex: exportFrameIndex,
        assets: this.assets,
      });
      const needed = new Map<string, StudioAsset>();
      for (const item of evaluation.renderables) needed.set(this.textureKey(item.asset), item.asset);
      const pinnedImage = this.settings.presenter.enabled && this.presenterAsset?.kind === "image"
        ? this.presenterAsset
        : null;
      const presenterGeneration = this.presenterRequestGeneration;
      const [, pinnedRecord] = await Promise.all([
        Promise.all(Array.from(needed.values(), (asset) => this.ensureTexture(asset))),
        pinnedImage ? this.ensureTexture(pinnedImage) : Promise.resolve(null),
      ]);
      if (this.disposed || this.contextLost) {
        throw new Error("WebGL renderer became unavailable while preparing an export frame.");
      }
      const currentPinnedRecord = pinnedImage
        && pinnedRecord
        && presenterGeneration === this.presenterRequestGeneration
        && this.presenterAsset === pinnedImage
        && this.settings.presenter.enabled
        ? pinnedRecord
        : null;
      if (currentPinnedRecord) this.presenterPreviewTexture = currentPinnedRecord.texture;
      this.resolvePresenterTexture(
        currentPinnedRecord && pinnedImage ? { asset: pinnedImage, record: currentPinnedRecord } : undefined,
      );
      this.renderProjectFrame(evaluation, true);
      return;
    }
    const geometry = getSlideGeometry(this.settings);
    const movingAssets = this.movingTrackAssets();
    const slotCount = getLogicalSlotCount(movingAssets.length, geometry);
    const travel = evaluatePerformanceTravel(this.performanceTimeline, time, {
      direction: this.settings.motion.direction,
      slidesPerSecond: this.settings.motion.speed,
      stride: geometry.stride,
      slotCount,
      slideLayerCount: this.assets.length,
      seamless: this.settings.motion.seamless,
      seamlessLoops: Math.max(1, Math.round(this.settings.motion.seamlessLoops)),
    });
    const distance = travel.distance;
    const visible: VisibleItem[] = [];
    for (let logicalIndex = 0; logicalIndex < slotCount; logicalIndex += 1) {
      const moving = movingAssets[logicalIndex % Math.max(1, movingAssets.length)];
      if (!moving) continue;
      const evaluated = evaluateSlide(logicalIndex, slotCount, distance, this.settings, geometry);
      if (isPotentiallyVisible(evaluated, geometry)) visible.push({
        logicalIndex,
        sourceIndex: moving.sourceIndex,
        layerIndex: moving.sourceIndex,
        asset: moving.asset,
        evaluated,
      });
    }
    const needed = new Map<string, StudioAsset>();
    for (const item of selectRenderableItems(visible, this.pool.length)) needed.set(this.textureKey(item.asset), item.asset);
    const pinnedImage = this.settings.presenter.enabled && this.presenterAsset?.kind === "image"
      ? this.presenterAsset
      : null;
    const presenterGeneration = this.presenterRequestGeneration;
    const [, pinnedRecord] = await Promise.all([
      Promise.all(Array.from(needed.values(), (asset) => this.ensureTexture(asset))),
      pinnedImage ? this.ensureTexture(pinnedImage) : Promise.resolve(null),
    ]);
    if (this.disposed || this.contextLost) throw new Error("WebGL renderer became unavailable while preparing an export frame.");
    const currentPinnedRecord = pinnedImage
      && pinnedRecord
      && presenterGeneration === this.presenterRequestGeneration
      && this.presenterAsset === pinnedImage
      && this.settings.presenter.enabled
      ? pinnedRecord
      : null;
    if (currentPinnedRecord) this.presenterPreviewTexture = currentPinnedRecord.texture;
    this.resolvePresenterTexture(
      currentPinnedRecord && pinnedImage ? { asset: pinnedImage, record: currentPinnedRecord } : undefined,
    );
    this.renderAt(time, exportFrameIndex);
  }

  async captureStill(width: number, height: number, time = 0): Promise<Blob> {
    const receipt = this.beginExport(width, height);
    try {
      await this.renderAtAsync(time);
      return await new Promise<Blob>((resolve, reject) => {
        this.canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Browser could not encode PNG still."))), "image/png");
      });
    } finally {
      receipt.restore();
    }
  }

  start(): void {
    if (this.animationFrame || this.disposed) return;
    this.lastFrameTime = performance.now();
    const tick = (now: number) => {
      this.animationFrame = requestAnimationFrame(tick);
      const wallDelta = Math.max(0, (now - this.lastFrameTime) / 1000);
      this.lastFrameTime = now;
      if (this.exportActive || this.contextLost || document.hidden) return;
      // The authored show clock follows real active time; otherwise a slow
      // paint loop makes decoder-driven presenter video outrun the slides.
      // Only inertial interaction physics is capped after a long frame.
      if (!this.paused) this.elapsed += wallDelta;
      this.advanceMotion(Math.min(0.05, wallDelta));
      this.renderPreview();
      this.sampleFps(now);
    };
    this.animationFrame = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
  }

  private advanceMotion(delta: number): void {
    if (this.paused) {
      this.motionVelocity = 0;
      return;
    }
    if (!this.dragging) {
      this.motionPosition += this.motionVelocity * delta;
      this.motionVelocity *= Math.exp(-delta * 7.5);
      if (Math.abs(this.motionVelocity) < 0.01) this.motionVelocity = 0;
    }
  }

  private normalizeV2InteractionPosition(): void {
    const project = this.project;
    if (project?.renderContract !== DRIFT_V2_RENDER_CONTRACT) return;
    const pinnedOnlyId = project.presenter.enabled
      && project.presenter.trackMode === "pinned-only"
      && project.presenter.assetId !== null
      && project.media.assets[project.presenter.assetId]?.kind === "image"
      ? project.presenter.assetId
      : null;
    const sourceCount = project.media.order.length - (pinnedOnlyId === null ? 0 : 1);
    const geometry = getSlideGeometry(this.settings);
    const slotCount = getLogicalSlotCount(sourceCount, geometry);
    const loopLength = slotCount * geometry.stride;
    if (!Number.isFinite(this.motionPosition) || !Number.isFinite(loopLength) || loopLength <= 0) {
      this.motionPosition = 0;
      return;
    }
    this.motionPosition = THREE.MathUtils.euclideanModulo(
      this.motionPosition + loopLength / 2,
      loopLength,
    ) - loopLength / 2;
  }

  private renderPreview(): void {
    if (this.contextLost || this.disposed || this.exportActive) return;
    if (this.project?.renderContract === DRIFT_V2_RENDER_CONTRACT) {
      this.normalizeV2InteractionPosition();
      const previewTime = loopPerformanceTime(this.elapsed, this.performanceTimeline.totalDuration);
      this.syncPresenterPlayback(previewTime);
      try {
        const evaluation = evaluateProjectFrame({
          project: this.project,
          time: previewTime,
          frameIndex: null,
          assets: this.assets,
          reducedMotion: this.reducedMotionPreview,
          interactionDistancePx: this.motionPosition,
        });
        this.renderProjectFrame(evaluation, false);
      } catch (error) {
        this.callbacks.onError?.(error instanceof Error ? error.message : "Project V4 frame evaluation failed.");
      }
      return;
    }
    const timeline = this.reducedMotionPreview
      ? this.reducedPerformanceTimeline
      : this.performanceTimeline;
    const performanceTime = loopPerformanceTime(this.elapsed, timeline.totalDuration);
    this.syncPresenterPlayback(performanceTime);
    const geometry = getSlideGeometry(this.settings);
    const movingAssets = this.movingTrackAssets();
    const slotCount = getLogicalSlotCount(movingAssets.length, geometry);
    const travel = evaluatePerformanceTravel(timeline, performanceTime, {
      direction: this.settings.motion.direction,
      slidesPerSecond: this.settings.motion.autoplay ? this.settings.motion.speed : 0,
      stride: geometry.stride,
      slotCount,
      slideLayerCount: this.assets.length,
      seamless: this.settings.motion.seamless,
      seamlessLoops: Math.max(1, Math.round(this.settings.motion.seamlessLoops)),
    });
    this.renderInternal(
      performanceTime,
      travel.distance + this.motionPosition,
      travel.velocity + this.motionVelocity,
      false,
      null,
      travel.lifecycle,
    );
  }

  private renderInternal(
    time: number,
    distance: number,
    velocity: number,
    exportMode: boolean,
    exportFrameIndex: number | null = null,
    lifecycle?: PerformanceLifecycleSample,
  ): void {
    const geometry = getSlideGeometry(this.settings);
    const movingAssets = this.movingTrackAssets();
    const slotCount = getLogicalSlotCount(movingAssets.length, geometry);
    const normalizedVelocity = this.reducedMotionPreview && !exportMode ? 0 : THREE.MathUtils.clamp(velocity / Math.max(1, geometry.stride), -1, 1);
    const visible: VisibleItem[] = [];

    for (let logicalIndex = 0; logicalIndex < slotCount; logicalIndex += 1) {
      const moving = movingAssets[logicalIndex % Math.max(1, movingAssets.length)];
      if (!moving) continue;
      const evaluated = evaluateSlide(logicalIndex, slotCount, distance, this.settings, geometry);
      if (isPotentiallyVisible(evaluated, geometry)) visible.push({
        logicalIndex,
        sourceIndex: moving.sourceIndex,
        layerIndex: moving.sourceIndex,
        asset: moving.asset,
        evaluated,
      });
    }
    const renderable = selectRenderableItems(visible, this.pool.length);

    this.renderVisibleItems({
      time,
      exportMode,
      exportFrameIndex,
      lifecycle,
      visible,
      renderable,
      width: geometry.width,
      height: geometry.height,
      normalizedVelocity,
    });
  }

  private renderProjectFrame(
    evaluation: ProjectFrameEvaluation,
    exportMode: boolean,
  ): void {
    const visible: VisibleItem[] = evaluation.renderables.map((item) => {
      const primary = item.evaluated.primary;
      return {
        logicalIndex: item.evaluated.logicalIndex,
        sourceIndex: item.sourceIndex,
        layerIndex: item.evaluated.sourceIndex,
        asset: item.asset,
        directive: item.directive,
        evaluated: {
          primary,
          cross: item.evaluated.cross,
          z: item.evaluated.z,
          rotationX: item.evaluated.rotationX,
          rotationY: item.evaluated.rotationY,
          rotationZ: item.evaluated.rotationZ,
          scale: item.evaluated.scale,
          opacity: item.evaluated.opacity,
          normalized: primary / Math.max(1, evaluation.geometry.visibleRadius),
        },
      };
    });
    const interactionVelocity = exportMode
      ? 0
      : this.motionVelocity / Math.max(1, evaluation.geometry.stride);
    const normalizedVelocity = this.reducedMotionPreview && !exportMode
      ? 0
      : THREE.MathUtils.clamp(evaluation.frame.track.velocity + interactionVelocity, -1, 1);
    const renderable = selectRenderableItems(visible, this.pool.length);
    this.renderVisibleItems({
      time: evaluation.frame.time,
      exportMode,
      exportFrameIndex: evaluation.frame.frameIndex,
      lifecycle: evaluation.lifecycle ?? undefined,
      visible,
      renderable,
      width: evaluation.geometry.width,
      height: evaluation.geometry.height,
      normalizedVelocity,
    });
  }

  private renderVisibleItems(input: {
    time: number;
    exportMode: boolean;
    exportFrameIndex: number | null;
    lifecycle?: PerformanceLifecycleSample;
    visible: VisibleItem[];
    renderable: VisibleItem[];
    width: number;
    height: number;
    normalizedVelocity: number;
  }): void {
    const {
      time,
      exportMode,
      exportFrameIndex,
      lifecycle,
      visible,
      renderable,
      width,
      height,
      normalizedVelocity,
    } = input;

    if (!exportMode) {
      let centered: VisibleItem | null = null;
      for (const item of visible) {
        if (!centered || Math.abs(item.evaluated.primary) < Math.abs(centered.evaluated.primary)) centered = item;
      }
      const nextActiveSlide = centered
        ? centered.sourceIndex
        : -1;
      if (nextActiveSlide !== this.activeSlideIndex) {
        this.activeSlideIndex = nextActiveSlide;
        this.callbacks.onActiveSlide?.(nextActiveSlide);
      }
    }

    const keepTextureKeys = new Set<string>();
    const presenterLayout = this.resolveSafePresenterLayout();
    for (let poolIndex = 0; poolIndex < this.pool.length; poolIndex += 1) {
      const item = this.pool[poolIndex]!;
      const visibleItem = renderable[poolIndex];
      if (!visibleItem) {
        item.group.visible = false;
        continue;
      }
      keepTextureKeys.add(this.textureKey(visibleItem.asset));
      this.updatePoolItem(
        item,
        visibleItem,
        width,
        height,
        normalizedVelocity,
        lifecycle?.layers.slides[visibleItem.layerIndex],
        this.lifecycleTreatment(lifecycle),
        presenterLayout,
      );
    }

    this.updatePresenterGeometry(lifecycle?.layers.presenter, this.lifecycleTreatment(lifecycle), presenterLayout);
    this.backgroundMaterial.uniforms.uOpacity!.value = lifecycle?.layers.background.visibility ?? 1;
    this.updateBackground(time, exportMode, exportFrameIndex);
    if (this.renderCounter % 90 === 0) this.evictTextures(keepTextureKeys);
    this.renderCounter += 1;

    this.renderer.setClearColor(0x000000, resolveCanvasClearAlpha(this.project));
    this.renderer.clear(true, true, true);
    const transparent = this.settings.stage.transparent || this.settings.background.style === "transparent";
    if (!transparent) {
      this.renderer.render(this.backgroundScene, this.backgroundCamera);
      this.renderer.clearDepth();
    }
    this.renderer.render(this.scene, this.camera);
    if (this.presenterGroup.visible && this.presenterGroup.parent === this.presenterScene) {
      this.renderer.clearDepth();
      this.renderer.render(this.presenterScene, this.presenterCamera);
    }
  }

  private updatePoolItem(
    item: SlidePoolItem,
    visible: VisibleItem,
    width: number,
    height: number,
    velocity: number,
    lifecycleLayer?: LifecycleLayerSample,
    treatment: TransitionTreatment | null = null,
    presenterLayout: PresenterOverlayLayout | null = null,
  ): void {
    const { evaluated, asset, logicalIndex } = visible;
    item.group.visible = true;
    const transition = resolveLifecycleLayerPresentation(
      lifecycleLayer ?? { visibility: 1, progress: 1, motionProgress: 1, active: false },
      treatment,
      Math.min(48, Math.min(this.settings.stage.width, this.settings.stage.height) * 0.035),
    );
    const vertical = this.settings.motion.axis === "vertical";
    const movingCenter = vertical
      ? { x: evaluated.cross, y: -evaluated.primary - transition.translateY }
      : { x: evaluated.primary, y: evaluated.cross - transition.translateY };
    const baseScale = evaluated.scale * transition.scale;
    const pinLane = this.project?.renderContract === DRIFT_V2_RENDER_CONTRACT && presenterLayout
      ? resolveProtectedPinLaneComposition({
          enabled: this.settings.presenter.enabled,
          safeOverlay: this.settings.presenter.layoutMode === "safe-overlay",
          stage: this.settings.stage,
          axis: this.settings.motion.axis,
          presenterBounds: presenterLayout.frameBoundsStage,
          movingCenter,
          movingSize: { width, height },
          movingScale: baseScale,
          movingRotationZ: evaluated.rotationZ,
          edgeInset: Math.min(this.settings.stage.width, this.settings.stage.height)
            * this.settings.presenter.safeInset,
        })
      : resolvePinLaneComposition({
          enabled: this.settings.presenter.enabled,
          safeOverlay: this.settings.presenter.layoutMode === "safe-overlay",
          stage: this.settings.stage,
          axis: this.settings.motion.axis,
          pinX: this.settings.presenter.x,
          pinY: this.settings.presenter.y,
          pinWidth: this.settings.presenter.width,
        });
    if (this.settings.motion.axis === "horizontal") {
      item.group.position.set(
        evaluated.primary + pinLane.offsetX,
        evaluated.cross + pinLane.offsetY - transition.translateY,
        evaluated.z,
      );
    } else {
      item.group.position.set(
        evaluated.cross + pinLane.offsetX,
        -evaluated.primary + pinLane.offsetY - transition.translateY,
        evaluated.z,
      );
    }
    item.group.rotation.set(evaluated.rotationX, evaluated.rotationY, evaluated.rotationZ);
    item.group.scale.setScalar(baseScale * pinLane.scale);
    item.slide.scale.set(width, height, 1);
    const renderedOpacity = evaluated.opacity * transition.opacity;
    const shadowOpacity = this.settings.slide.shadowOpacity * renderedOpacity;
    const shadowMargin = getShadowSupportMargin(this.settings.slide.shadowSoftness, shadowOpacity);
    item.shadow.scale.set(width + shadowMargin * 2, height + shadowMargin * 2, 1);
    item.shadow.position.set(10, -14, -8);

    const uniforms = item.material.uniforms;
    const fit = visible.directive?.fit ?? this.settings.slide.fit;
    const focalX = visible.directive?.focalX ?? this.settings.slide.focalX;
    const focalY = visible.directive?.focalY ?? this.settings.slide.focalY;
    uniforms.uPlaneAspect!.value = width / height;
    uniforms.uFit!.value = fit === "cover" ? 0 : 1;
    uniforms.uFocal!.value.set(focalX, focalY);
    uniforms.uSizePx!.value.set(width, height);
    uniforms.uRadiusPx!.value = Math.min(this.settings.slide.radius, Math.min(width, height) / 2);
    uniforms.uSmoothing!.value = this.settings.slide.smoothing;
    uniforms.uBorderPx!.value = this.settings.slide.borderWidth;
    uniforms.uBorderColor!.value.set(this.settings.slide.borderColor);
    uniforms.uBorderOpacity!.value = this.settings.slide.borderOpacity;
    uniforms.uOpacity!.value = renderedOpacity;
    uniforms.uVelocity!.value = velocity;
    uniforms.uDistortion!.value = this.settings.motion.distortion;
    uniforms.uAxis!.value = this.settings.motion.axis === "horizontal" ? 0 : 1;
    uniforms.uPhase!.value = logicalIndex;

    const shadowUniforms = item.shadowMaterial.uniforms;
    shadowUniforms.uCanvasSizePx!.value.set(width + shadowMargin * 2, height + shadowMargin * 2);
    shadowUniforms.uCardSizePx!.value.set(width, height);
    shadowUniforms.uRadiusPx!.value = this.settings.slide.radius;
    shadowUniforms.uSmoothing!.value = this.settings.slide.smoothing;
    shadowUniforms.uSoftnessPx!.value = this.settings.slide.shadowSoftness;
    shadowUniforms.uOpacity!.value = shadowOpacity;

    const assetKey = this.textureKey(asset);
    if (item.assetKey !== assetKey) {
      item.assetKey = assetKey;
      item.material.uniforms.uMap!.value = this.placeholderTexture;
      item.material.uniforms.uTextureAspect!.value = asset.width / Math.max(1, asset.height);
    }
    const record = this.textureCache.get(assetKey);
    if (record) {
      record.lastUsed = performance.now();
      if (item.material.uniforms.uMap!.value !== record.texture) {
        item.material.uniforms.uMap!.value = record.texture;
        item.material.uniforms.uTextureAspect!.value = record.aspect;
        item.material.uniformsNeedUpdate = true;
      }
    } else {
      item.material.uniforms.uMap!.value = this.placeholderTexture;
      void this.ensureTexture(asset)
        .then((loaded) => {
          if (item.assetKey !== assetKey || this.disposed) return;
          item.material.uniforms.uMap!.value = loaded.texture;
          item.material.uniforms.uTextureAspect!.value = loaded.aspect;
          item.material.uniformsNeedUpdate = true;
        })
        .catch((error: unknown) => {
          if (error instanceof StaleTextureRequestError || item.assetKey !== assetKey || this.disposed) return;
          this.callbacks.onError?.(error instanceof Error ? error.message : `Could not load ${asset.name}.`);
        });
    }
  }

  private resolveSafePresenterLayout(): PresenterOverlayLayout | null {
    const settings = this.settings.presenter;
    if (!settings.enabled || settings.layoutMode !== "safe-overlay" || !this.presenterAsset) return null;
    const stage = this.settings.stage;
    const requestedShadowMargin = getShadowSupportMargin(settings.shadowSoftness, settings.shadowOpacity);
    return resolvePresenterOverlayLayout({
      stage,
      source: { width: this.presenterAsset.width, height: this.presenterAsset.height },
      customAspect: settings.aspectMode === "custom"
        ? { width: settings.aspectWidth, height: settings.aspectHeight }
        : null,
      anchor: { x: settings.x, y: settings.y },
      scale: THREE.MathUtils.clamp(settings.width, 0.12, 0.9),
      safeInset: Math.min(stage.width, stage.height) * settings.safeInset,
      shadowExtents: {
        top: Math.max(0, requestedShadowMargin - settings.shadowOffsetY),
        right: Math.max(0, requestedShadowMargin + settings.shadowOffsetX),
        bottom: Math.max(0, requestedShadowMargin + settings.shadowOffsetY),
        left: Math.max(0, requestedShadowMargin - settings.shadowOffsetX),
      },
    });
  }

  private updatePresenterGeometry(
    lifecycleLayer?: LifecycleLayerSample,
    treatment: TransitionTreatment | null = null,
    safeLayout: PresenterOverlayLayout | null = this.resolveSafePresenterLayout(),
  ): void {
    const settings = this.settings.presenter;
    const shouldShow = settings.enabled && Boolean(this.presenterAsset) && Boolean(this.presenterMaterial.uniforms.uMap!.value);
    const transition = resolveLifecycleLayerPresentation(
      lifecycleLayer ?? { visibility: 1, progress: 1, motionProgress: 1, active: false },
      treatment,
      Math.min(48, Math.min(this.settings.stage.width, this.settings.stage.height) * 0.035),
    );
    this.presenterGroup.visible = shouldShow && transition.opacity > 0.001;
    if (!shouldShow) return;
    const safeOverlay = settings.layoutMode === "safe-overlay";
    const desiredParent = safeOverlay ? this.presenterScene : this.scene;
    if (this.presenterGroup.parent !== desiredParent) desiredParent.add(this.presenterGroup);
    this.presenterMaterial.depthTest = !safeOverlay;
    this.presenterShadowMaterial.depthTest = !safeOverlay;

    const stage = this.settings.stage;
    const shadowSoftness = settings.shadowSoftness;
    const requestedShadowMargin = getShadowSupportMargin(shadowSoftness, settings.shadowOpacity);
    let width: number;
    let height: number;
    let shadowMargin = requestedShadowMargin;
    let shadowOffsetX = settings.shadowOffsetX;
    let shadowOffsetY = settings.shadowOffsetY;

    if (safeOverlay && safeLayout) {
      const layout = safeLayout;
      width = layout.frameSizePx.width;
      height = layout.frameSizePx.height;
      shadowMargin *= layout.fitScale;
      shadowOffsetX *= layout.fitScale;
      shadowOffsetY *= layout.fitScale;
      this.presenterGroup.position.set(layout.centerStage.x, layout.centerStage.y - transition.translateY, 0);
    } else {
      width = stage.width * THREE.MathUtils.clamp(settings.width, 0.12, 0.9);
      height = width / (settings.aspectWidth / Math.max(0.01, settings.aspectHeight));
      const x = (settings.x - 0.5) * stage.width;
      const y = (0.5 - settings.y) * stage.height;
      this.presenterGroup.position.set(x, y - transition.translateY, 180);
    }
    this.presenterGroup.rotation.set(0, 0, 0);
    this.presenterGroup.scale.setScalar(transition.scale);
    this.presenterSlide.scale.set(width, height, 1);
    this.presenterShadow.scale.set(width + shadowMargin * 2, height + shadowMargin * 2, 1);
    this.presenterShadow.position.set(shadowOffsetX, -shadowOffsetY, safeOverlay ? -1 : -10);

    const uniforms = this.presenterMaterial.uniforms;
    uniforms.uPlaneAspect!.value = width / height;
    uniforms.uFit!.value = settings.fit === "cover" ? 0 : 1;
    uniforms.uFocal!.value.set(settings.focalX, settings.focalY);
    uniforms.uSizePx!.value.set(width, height);
    uniforms.uRadiusPx!.value = Math.min(settings.radius, Math.min(width, height) / 2);
    uniforms.uSmoothing!.value = settings.smoothing;
    uniforms.uBorderPx!.value = settings.borderWidth;
    uniforms.uBorderColor!.value.set(settings.borderColor);
    uniforms.uBorderOpacity!.value = settings.borderOpacity;
    uniforms.uLegacyContainMatte!.value = safeOverlay ? 0 : 1;
    uniforms.uMatteColor!.value.set(settings.matteColor);
    uniforms.uMatteOpacity!.value = settings.matteOpacity;
    uniforms.uOpacity!.value = transition.opacity;
    uniforms.uVelocity!.value = 0;
    uniforms.uDistortion!.value = 0;
    uniforms.uAxis!.value = 0;

    const shadowUniforms = this.presenterShadowMaterial.uniforms;
    shadowUniforms.uCanvasSizePx!.value.set(width + shadowMargin * 2, height + shadowMargin * 2);
    shadowUniforms.uCardSizePx!.value.set(width, height);
    shadowUniforms.uRadiusPx!.value = settings.radius;
    shadowUniforms.uSmoothing!.value = settings.smoothing;
    shadowUniforms.uSoftnessPx!.value = shadowSoftness;
    shadowUniforms.uOpacity!.value = settings.shadowOpacity * transition.opacity;
  }

  private lifecycleTreatment(sample?: PerformanceLifecycleSample): TransitionTreatment | null {
    if (!sample) return null;
    if (sample.phase === "entry" && this.performanceTimeline.authoring.entry.enabled) {
      return this.performanceTimeline.authoring.entry.treatment;
    }
    if (sample.phase === "exit" && this.performanceTimeline.authoring.exit.enabled) {
      return this.performanceTimeline.authoring.exit.treatment;
    }
    return null;
  }

  private updateSettingsUniforms(): void {
    const background = this.settings.background;
    this.backgroundMaterial.uniforms.uColorA!.value.set(background.colorA);
    this.backgroundMaterial.uniforms.uColorB!.value.set(background.colorB);
    this.backgroundMaterial.uniforms.uAccent!.value.set(background.accent);
    this.backgroundMaterial.uniforms.uMode!.value = backgroundMode(background.style);
    this.backgroundMaterial.uniforms.uIntensity!.value = background.intensity;
    this.backgroundMaterial.uniforms.uMotion!.value = background.motion;
    this.backgroundMaterial.uniforms.uGrain!.value = background.grain;
    this.backgroundMaterial.uniforms.uVignette!.value = background.vignette;
    this.backgroundMaterial.uniforms.uSeed!.value = normalizeGrainSeed(background.seed);
  }

  private updateBackground(time: number, exportMode: boolean, exportFrameIndex: number | null = null): void {
    const reduced = exportMode ? this.settings.motion.reducedMotionOutput : this.reducedMotionPreview;
    this.backgroundMaterial.uniforms.uPhase!.value = resolveBackgroundPhase(time, {
      durationSeconds: this.settings.output.duration,
      motion: this.settings.background.motion,
      seamless: this.settings.motion.seamless,
      seamlessLoops: this.settings.motion.seamlessLoops,
      reducedMotion: reduced,
    });
    // Grain cadence is deliberately independent from the room's slow breath.
    // Exact output-frame identity selects a held 12 fps grain plate. The lower
    // cadence reads as handled film rather than high-frequency television snow,
    // and freezes with Pause or reduced motion.
    this.backgroundMaterial.uniforms.uGrainFrame!.value = resolveGrainFrame(
      time,
      this.settings.output.fps,
      exportMode,
      reduced,
      exportFrameIndex,
    );
    this.renderer.getDrawingBufferSize(this.backgroundResolution);
    this.backgroundMaterial.uniforms.uResolution!.value.copy(this.backgroundResolution);
  }

  private updateCamera(): void {
    const stage = this.settings.stage;
    const cameraZ = stage.height / (2 * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)));
    this.camera.aspect = stage.width / stage.height;
    this.camera.position.set(0, 0, cameraZ);
    this.camera.near = 1;
    this.camera.far = cameraZ + 50_000;
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.presenterCamera.left = -stage.width / 2;
    this.presenterCamera.right = stage.width / 2;
    this.presenterCamera.top = stage.height / 2;
    this.presenterCamera.bottom = -stage.height / 2;
    this.presenterCamera.updateProjectionMatrix();
    this.backgroundMaterial.uniforms.uResolution!.value.set(stage.width, stage.height);
  }

  private async ensureTexture(asset: StudioAsset): Promise<TextureRecord> {
    const key = this.textureKey(asset);
    const cached = this.textureCache.get(key);
    if (cached) {
      cached.lastUsed = performance.now();
      return cached;
    }
    const existing = this.texturePromises.get(key);
    if (existing) return existing;

    const promise = this.decodeTexture(asset)
      .then((record) => {
        if (this.disposed || !this.isTextureKeyActive(key)) {
          this.disposeTextureRecord(record);
          throw new StaleTextureRequestError();
        }
        this.textureCache.set(key, record);
        return record;
      })
      .finally(() => {
        if (this.texturePromises.get(key) === promise) this.texturePromises.delete(key);
      });
    this.texturePromises.set(key, promise);
    return promise;
  }

  private textureKey(asset: StudioAsset): string {
    const digest = asset.hash?.trim();
    if (digest) return `${asset.id}\u0000sha256:${digest}`;
    let blobKey = this.blobTextureKeys.get(asset.blob);
    if (!blobKey) {
      blobKey = `blob:${++this.blobTextureKeyCounter}`;
      this.blobTextureKeys.set(asset.blob, blobKey);
    }
    return `${asset.id}\u0000${blobKey}`;
  }

  private isTextureKeyActive(key: string): boolean {
    return this.assets.some((asset) => this.textureKey(asset) === key)
      || Boolean(this.presenterAsset?.kind === "image" && this.textureKey(this.presenterAsset) === key);
  }

  private disposeTextureRecord(record: TextureRecord): void {
    record.texture.dispose();
    if (record.source instanceof ImageBitmap) record.source.close();
  }

  private pruneInactiveTextures(): void {
    for (const [key, record] of this.textureCache) {
      if (this.isTextureKeyActive(key)) continue;
      this.disposeTextureRecord(record);
      this.textureCache.delete(key);
    }
  }

  private async decodeTexture(asset: StudioAsset): Promise<TextureRecord> {
    const maximum = Math.min(PREVIEW_TEXTURE_EDGE, this.renderer.capabilities.maxTextureSize);
    const scale = Math.min(1, maximum / Math.max(asset.width, asset.height));
    const options: ImageBitmapOptions = {
      // Texture.flipY is ignored for ImageBitmap sources. Flip during decode so
      // authored slide text remains upright in WebGL's bottom-left UV space.
      imageOrientation: "flipY",
      premultiplyAlpha: "none",
      colorSpaceConversion: "default",
      resizeWidth: Math.max(1, Math.round(asset.width * scale)),
      resizeHeight: Math.max(1, Math.round(asset.height * scale)),
      resizeQuality: "high",
    };
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(asset.blob, options);
    } catch {
      throw new Error(`Could not decode ${asset.name}. File may be corrupt or unsupported.`);
    }
    const texture = new THREE.CanvasTexture(bitmap);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    const record: TextureRecord = {
      texture,
      source: bitmap,
      aspect: asset.width / Math.max(1, asset.height),
      lastUsed: performance.now(),
    };
    return record;
  }

  private evictTextures(keepKeys: Set<string>): void {
    if (this.textureCache.size <= TEXTURE_CACHE_LIMIT) return;
    const presenterKey = this.presenterAsset ? this.textureKey(this.presenterAsset) : null;
    const candidates = Array.from(this.textureCache.entries())
      .filter(([key]) => !keepKeys.has(key) && key !== presenterKey)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    while (this.textureCache.size > TEXTURE_CACHE_LIMIT && candidates.length) {
      const [key, record] = candidates.shift()!;
      this.disposeTextureRecord(record);
      this.textureCache.delete(key);
    }
  }

  private onPointerDown(event: PointerEvent): void {
    if (this.exportActive || event.button !== 0) return;
    this.dragging = true;
    this.dragPointerId = event.pointerId;
    this.lastPointerCoordinate = this.settings.motion.axis === "horizontal" ? event.clientX : event.clientY;
    this.lastPointerTime = performance.now();
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.dataset.dragging = "true";
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.dragging || event.pointerId !== this.dragPointerId) return;
    const coordinate = this.settings.motion.axis === "horizontal" ? event.clientX : event.clientY;
    const now = performance.now();
    const deltaCss = coordinate - this.lastPointerCoordinate;
    const deltaTime = Math.max(8, now - this.lastPointerTime) / 1000;
    const rect = this.canvas.getBoundingClientRect();
    const cssExtent = this.settings.motion.axis === "horizontal" ? rect.width : rect.height;
    const worldExtent = this.settings.motion.axis === "horizontal" ? this.settings.stage.width : this.settings.stage.height;
    const deltaWorld = (-deltaCss / Math.max(1, cssExtent)) * worldExtent * this.settings.motion.dragSensitivity;
    this.motionPosition += deltaWorld;
    this.motionVelocity = deltaWorld / deltaTime;
    this.lastPointerCoordinate = coordinate;
    this.lastPointerTime = now;
    this.renderPreview();
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.dragging || event.pointerId !== this.dragPointerId) return;
    this.dragging = false;
    this.dragPointerId = null;
    this.canvas.dataset.dragging = "false";
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  }

  private onWheel(event: WheelEvent): void {
    if (this.exportActive) return;
    event.preventDefault();
    const modeScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 18 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 240 : 1;
    const raw = this.settings.motion.axis === "horizontal" && Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const impulse = THREE.MathUtils.clamp(raw * modeScale, -180, 180) * this.settings.motion.dragSensitivity;
    this.motionPosition += impulse;
    this.motionVelocity += impulse * 5.5;
    this.renderPreview();
  }

  private onVisibilityChange(): void {
    this.lastFrameTime = performance.now();
    this.syncPresenterPlayback();
  }

  private previewMasterTime(): number {
    return loopPerformanceTime(this.elapsed, this.performanceTimeline.totalDuration);
  }

  private requestPresenterPreviewSeek(video: HTMLVideoElement, targetTime: number): void {
    if (this.presenterPendingSeekTarget !== null || video.seeking) return;
    const requestGeneration = this.presenterRequestGeneration;
    this.presenterPendingSeekTarget = targetTime;
    const settle = () => {
      video.removeEventListener("seeked", settle);
      video.removeEventListener("error", settle);
      if (
        requestGeneration !== this.presenterRequestGeneration
        || this.presenterVideo !== video
        || this.disposed
      ) return;
      this.presenterPendingSeekTarget = null;
      if (this.presenterPreviewTexture) this.presenterPreviewTexture.needsUpdate = true;
      // The authored clock may have advanced while decoding this frame. One
      // follow-up paint schedules the next exact frame without superseding the
      // seek that just completed.
      this.renderPreview();
    };
    video.addEventListener("seeked", settle, { once: true });
    video.addEventListener("error", settle, { once: true });
    try {
      video.currentTime = targetTime;
      if (!video.seeking) settle();
    } catch {
      settle();
    }
  }

  private requestPresenterPreviewPlay(video: HTMLVideoElement): void {
    if (this.presenterPlayPending || !video.paused || video.seeking) return;
    this.presenterPlayPending = true;
    void video.play()
      .catch(() => undefined)
      .finally(() => {
        this.presenterPlayPending = false;
        if (
          !this.presenterShouldPlay
          || this.presenterVideo !== video
          || this.disposed
        ) {
          video.pause();
        }
      });
  }

  private syncPresenterPlayback(masterTime = this.previewMasterTime()): void {
    const video = this.presenterVideo;
    if (!video) return;
    const effectiveMasterTime = this.reducedMotionPreview
      ? this.presenterReducedMotionMasterTime ?? masterTime
      : masterTime;
    const frozen = this.paused
      || this.reducedMotionPreview
      || this.exportActive
      || this.contextLost
      || document.hidden
      || this.disposed;
    const fps = Number.isFinite(this.settings.output.fps) && this.settings.output.fps > 0
      ? this.settings.output.fps
      : 30;
    const lastDecodableTime = Number.isFinite(video.duration) && video.duration > 0
      ? Math.max(0, video.duration - 1 / fps)
      : Number.POSITIVE_INFINITY;
    const sourceExhausted = effectiveMasterTime > lastDecodableTime + PRESENTER_EXACT_SEEK_EPSILON_SECONDS;
    const shouldFreezeVideo = frozen || sourceExhausted;
    const decision = resolvePresenterPreviewClock({
      masterTime: effectiveMasterTime,
      previousMasterTime: this.presenterPreviewMasterTime,
      videoTime: video.currentTime,
      videoDuration: video.duration,
      masterFps: fps,
      exact: shouldFreezeVideo,
    });
    this.presenterShouldPlay = !shouldFreezeVideo && !decision.shouldSeek;
    if (shouldFreezeVideo || decision.shouldSeek) video.pause();
    if (decision.targetTime !== null && decision.shouldSeek) {
      // Seeking is an exception: initial alignment, master-loop wrap, a real
      // delivery drift, or an exact frozen-state landing. Ordinary playback
      // remains decoder-driven so long-GOP and 4K media stay smooth.
      this.requestPresenterPreviewSeek(video, decision.targetTime);
    } else if (this.presenterShouldPlay) {
      this.requestPresenterPreviewPlay(video);
    }
    this.presenterPreviewMasterTime = effectiveMasterTime;
  }

  private onContextLost(event: Event): void {
    event.preventDefault();
    this.contextLost = true;
    this.syncPresenterPlayback();
    this.callbacks.onContextState?.("lost");
    this.callbacks.onError?.("WebGL context was lost. Preview paused; project data remains safe.");
  }

  private onContextRestored(): void {
    this.contextLost = false;
    this.syncPresenterPlayback();
    this.placeholderTexture.needsUpdate = true;
    this.backgroundMaterial.needsUpdate = true;
    for (const record of this.textureCache.values()) record.texture.needsUpdate = true;
    this.presenterPreviewTexture && (this.presenterPreviewTexture.needsUpdate = true);
    this.callbacks.onContextState?.("restored");
    this.renderPreview();
  }

  private sampleFps(now: number): void {
    if (!this.callbacks.onFrame) return;
    this.fpsFrameCounter += 1;
    const elapsed = now - this.fpsSampleStarted;
    if (elapsed >= 1000) {
      this.callbacks.onFrame(Math.round((this.fpsFrameCounter * 1000) / elapsed));
      this.fpsFrameCounter = 0;
      this.fpsSampleStarted = now;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.disposePresenterPreview();
    this.presenterExportTexture?.dispose();
    this.canvas.removeEventListener("pointerdown", this.onPointerDownBound);
    this.canvas.removeEventListener("pointermove", this.onPointerMoveBound);
    this.canvas.removeEventListener("pointerup", this.onPointerUpBound);
    this.canvas.removeEventListener("pointercancel", this.onPointerUpBound);
    this.canvas.removeEventListener("wheel", this.onWheelBound);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLostBound);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestoredBound);
    document.removeEventListener("visibilitychange", this.onVisibilityBound);
    for (const record of this.textureCache.values()) {
      record.texture.dispose();
      if (record.source instanceof ImageBitmap) record.source.close();
    }
    this.textureCache.clear();
    this.placeholderTexture.dispose();
    this.pool.forEach((item) => {
      item.material.dispose();
      item.shadowMaterial.dispose();
    });
    this.presenterMaterial.dispose();
    this.presenterShadowMaterial.dispose();
    this.geometry.dispose();
    this.backgroundGeometry.dispose();
    this.backgroundMaterial.dispose();
    this.renderer.dispose();
  }
}
