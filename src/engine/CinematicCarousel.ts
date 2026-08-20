import * as THREE from "three";
import type { StudioAsset, StudioSettings } from "../model";
import {
  deliverySlidesPerSecond,
  distanceAtTime,
  editorialDeckPhase,
  evaluateSlide,
  getLogicalSlotCount,
  getLoopStrideCount,
  getSlideGeometry,
  isPotentiallyVisible,
  velocityAtTime,
  type EvaluatedSlide,
} from "./evaluate";
import { invertEditorialDistance, remapEditorialDistance } from "./editorialCadence";
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

interface EngineCallbacks {
  onError?: (message: string) => void;
  onContextState?: (state: "ready" | "lost" | "restored") => void;
  onFrame?: (fps: number) => void;
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
  asset: StudioAsset;
  evaluated: EvaluatedSlide;
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

function createSlideMaterial(placeholder: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: slideVertexShader,
    fragmentShader: slideFragmentShader,
    transparent: true,
    depthTest: true,
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
      uOpacity: { value: 1 },
      uVelocity: { value: 0 },
      uDistortion: { value: 0 },
      uAxis: { value: 0 },
      uPhase: { value: 0 },
      uTactile: { value: 0 },
    },
  });
}

function createShadowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: shadowVertexShader,
    fragmentShader: shadowFragmentShader,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    uniforms: {
      uSizePx: { value: new THREE.Vector2(800, 450) },
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
  private readonly backgroundScene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(CAMERA_FOV, 9 / 16, 1, 50_000);
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
        uVignette: { value: settings.background.vignette },
        uPhase: { value: 0 },
        uSeed: { value: settings.background.seed },
      },
    });
    this.backgroundMesh = new THREE.Mesh(this.backgroundGeometry, this.backgroundMaterial);
    this.backgroundMesh.frustumCulled = false;
    this.backgroundScene.add(this.backgroundMesh);
    this.scene.add(this.track);

    for (let index = 0; index < MAX_POOL_SIZE; index += 1) this.pool.push(this.createPoolItem(index));
    ({ group: this.presenterGroup, slide: this.presenterSlide, shadow: this.presenterShadow, material: this.presenterMaterial, shadowMaterial: this.presenterShadowMaterial } = this.createPoolItem(1000));
    this.presenterGroup.renderOrder = 1000;
    this.presenterSlide.renderOrder = 1001;
    this.presenterShadow.renderOrder = 999;
    this.presenterGroup.visible = false;
    this.scene.add(this.presenterGroup);

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

  private createPoolItem(index: number): SlidePoolItem {
    const group = new THREE.Group();
    const material = createSlideMaterial(this.placeholderTexture);
    const shadowMaterial = createShadowMaterial();
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

  setSettings(settings: StudioSettings): void {
    this.settings = settings;
    this.updateCamera();
    this.updateSettingsUniforms();
    this.updatePresenterGeometry();
    if (!this.exportActive) this.renderPreview();
  }

  /**
   * Changes a complete motion recipe without losing the evidence currently in
   * focus. Axis and spacing may change, but the nearest source slide remains
   * the subject of the composition.
   */
  setSettingsAnchored(settings: StudioSettings): void {
    const currentGeometry = getSlideGeometry(this.settings);
    const currentVisible = this.visibleMotionPosition(currentGeometry, this.settings);
    const focusedStep = currentGeometry.stride > 0
      ? Math.round(currentVisible / currentGeometry.stride)
      : 0;
    this.settings = settings;
    const nextGeometry = getSlideGeometry(settings);
    this.motionPosition = this.rawMotionPosition(
      focusedStep * nextGeometry.stride,
      nextGeometry,
      settings,
    );
    this.motionVelocity = 0;
    this.updateCamera();
    this.updateSettingsUniforms();
    this.updatePresenterGeometry();
    if (!this.exportActive) this.renderPreview();
  }

  async setAssets(assets: StudioAsset[]): Promise<void> {
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
    this.renderPreview();
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
        video.src = asset.objectUrl;
        video.preload = "auto";
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = "anonymous";
        await video.play().catch(() => undefined);
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

  private resolvePresenterTexture(
    fixedImage?: { asset: StudioAsset; record: TextureRecord },
  ): void {
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
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.motionVelocity = 0;
    this.syncPresenterPlayback();
    if (!this.exportActive) this.renderPreview();
  }

  togglePaused(): boolean {
    this.setPaused(!this.paused);
    return this.paused;
  }

  setReducedMotionPreview(reduced: boolean): void {
    this.reducedMotionPreview = reduced;
    if (reduced) this.motionVelocity = 0;
  }

  stepSlides(amount: number): void {
    const geometry = getSlideGeometry(this.settings);
    const visible = this.visibleMotionPosition(geometry, this.settings);
    this.motionPosition = this.rawMotionPosition(
      visible + geometry.stride * amount * this.settings.motion.direction,
      geometry,
      this.settings,
    );
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

  renderAt(time: number): void {
    const geometry = getSlideGeometry(this.settings);
    const slotCount = getLogicalSlotCount(this.assets.length, geometry);
    const loopStrideCount = getLoopStrideCount(this.settings, this.assets.length, slotCount);
    const distance = distanceAtTime(this.settings, time, loopStrideCount, geometry.stride, true);
    const velocity = velocityAtTime(this.settings, loopStrideCount, geometry.stride, true);
    this.renderInternal(time, distance, velocity, true);
  }

  async renderAtAsync(time: number): Promise<void> {
    const geometry = getSlideGeometry(this.settings);
    const slotCount = getLogicalSlotCount(this.assets.length, geometry);
    const loopStrideCount = getLoopStrideCount(this.settings, this.assets.length, slotCount);
    const distance = distanceAtTime(this.settings, time, loopStrideCount, geometry.stride, true);
    const visible: VisibleItem[] = [];
    for (let logicalIndex = 0; logicalIndex < slotCount; logicalIndex += 1) {
      const sourceIndex = logicalIndex % Math.max(1, this.assets.length);
      const asset = this.assets[sourceIndex];
      if (!asset) continue;
      const evaluated = evaluateSlide(logicalIndex, slotCount, distance, this.settings, geometry, sourceIndex);
      if (isPotentiallyVisible(evaluated, geometry)) visible.push({ logicalIndex, sourceIndex, asset, evaluated });
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
    this.renderAt(time);
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
      if (this.exportActive || this.contextLost || document.hidden) return;
      const delta = Math.min(0.05, Math.max(0, (now - this.lastFrameTime) / 1000));
      this.lastFrameTime = now;
      if (!this.paused) this.elapsed += delta;
      this.advanceMotion(delta);
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
    if (this.dragging) return;
    if (this.paused || this.reducedMotionPreview) {
      this.motionVelocity = 0;
      return;
    }
    const geometry = getSlideGeometry(this.settings);
    const slotCount = getLogicalSlotCount(this.assets.length, geometry);
    const loopStrideCount = getLoopStrideCount(this.settings, this.assets.length, slotCount);
    const autoplay = this.settings.motion.autoplay;
    const deliverySpeed = deliverySlidesPerSecond(this.settings, loopStrideCount, false);
    const desiredVelocity = autoplay
      ? this.settings.motion.direction * deliverySpeed * geometry.stride
      : 0;
    const response = 1 - Math.exp(-delta * (autoplay ? 4.8 : 7.5));
    this.motionVelocity += (desiredVelocity - this.motionVelocity) * response;
    this.motionPosition += this.motionVelocity * delta;
  }

  private renderPreview(): void {
    if (this.contextLost || this.disposed || this.exportActive) return;
    this.renderInternal(this.elapsed, this.motionPosition, this.motionVelocity, false);
  }

  private renderInternal(time: number, distance: number, velocity: number, exportMode: boolean): void {
    const geometry = getSlideGeometry(this.settings);
    const slotCount = getLogicalSlotCount(this.assets.length, geometry);
    const normalizedVelocity = this.reducedMotionPreview && !exportMode ? 0 : THREE.MathUtils.clamp(velocity / Math.max(1, geometry.stride), -1, 1);
    const visible: VisibleItem[] = [];

    for (let logicalIndex = 0; logicalIndex < slotCount; logicalIndex += 1) {
      const sourceIndex = logicalIndex % Math.max(1, this.assets.length);
      const asset = this.assets[sourceIndex];
      if (!asset) continue;
      const evaluated = evaluateSlide(logicalIndex, slotCount, distance, this.settings, geometry, sourceIndex);
      if (isPotentiallyVisible(evaluated, geometry)) visible.push({ logicalIndex, sourceIndex, asset, evaluated });
    }
    const renderable = selectRenderableItems(visible, this.pool.length);

    const keepTextureKeys = new Set<string>();
    for (let poolIndex = 0; poolIndex < this.pool.length; poolIndex += 1) {
      const item = this.pool[poolIndex]!;
      const visibleItem = renderable[poolIndex];
      if (!visibleItem) {
        item.group.visible = false;
        continue;
      }
      keepTextureKeys.add(this.textureKey(visibleItem.asset));
      this.updatePoolItem(item, visibleItem, geometry.width, geometry.height, normalizedVelocity);
    }

    this.updatePresenterGeometry();
    this.updateBackground(time, distance, geometry, exportMode);
    if (this.renderCounter % 90 === 0) this.evictTextures(keepTextureKeys);
    this.renderCounter += 1;

    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear(true, true, true);
    const transparent = this.settings.stage.transparent || this.settings.background.style === "transparent";
    if (!transparent) {
      this.renderer.render(this.backgroundScene, this.backgroundCamera);
      this.renderer.clearDepth();
    }
    this.renderer.render(this.scene, this.camera);
  }

  private updatePoolItem(
    item: SlidePoolItem,
    visible: VisibleItem,
    width: number,
    height: number,
    velocity: number,
  ): void {
    const { evaluated, asset, sourceIndex } = visible;
    item.group.visible = true;
    if (this.settings.motion.axis === "horizontal") item.group.position.set(evaluated.primary, evaluated.cross, evaluated.z);
    else item.group.position.set(evaluated.cross, -evaluated.primary, evaluated.z);
    item.group.rotation.set(evaluated.rotationX, evaluated.rotationY, evaluated.rotationZ);
    item.group.scale.setScalar(evaluated.scale);
    item.slide.scale.set(width, height, 1);
    const shadowMargin = Math.min(84, this.settings.slide.shadowSoftness * 1.35);
    const paperEnergy = this.settings.motion.flow === "editorial"
      ? THREE.MathUtils.clamp(this.settings.motion.tilt / 9, 0, 1)
      : 0;
    const shadowLag = THREE.MathUtils.clamp(
      (evaluated.transitionPulse * 0.82 + evaluated.landingImpact * 0.18) * paperEnergy,
      0,
      1,
    );
    const anticipationLag = evaluated.anticipation * paperEnergy;
    const settleLag = evaluated.settle * paperEnergy;
    const travel = this.settings.motion.direction;
    const lagX = this.settings.motion.axis === "horizontal"
      ? -travel * shadowLag * 11 + travel * anticipationLag * 2.5
      : settleLag * 3;
    const lagY = this.settings.motion.axis === "vertical"
      ? travel * shadowLag * 11 - travel * anticipationLag * 2.5
      : -shadowLag * 3;
    const shadowWidth = width + shadowMargin * 2 + shadowLag * 5;
    const shadowHeight = height + shadowMargin * 2 + shadowLag * 5;
    item.shadow.scale.set(shadowWidth, shadowHeight, 1);
    item.shadow.position.set(10 + lagX, -14 + lagY, -8);

    const uniforms = item.material.uniforms;
    uniforms.uPlaneAspect!.value = width / height;
    uniforms.uFit!.value = this.settings.slide.fit === "cover" ? 0 : 1;
    uniforms.uFocal!.value.set(this.settings.slide.focalX, this.settings.slide.focalY);
    uniforms.uSizePx!.value.set(width, height);
    uniforms.uRadiusPx!.value = Math.min(this.settings.slide.radius, Math.min(width, height) / 2);
    uniforms.uSmoothing!.value = this.settings.slide.smoothing;
    uniforms.uBorderPx!.value = this.settings.slide.borderWidth;
    uniforms.uBorderColor!.value.set(this.settings.slide.borderColor);
    uniforms.uBorderOpacity!.value = this.settings.slide.borderOpacity;
    uniforms.uOpacity!.value = evaluated.opacity;
    // Editorial holds are actual rest states. Raw timeline velocity may keep
    // advancing under a hold, but optical bend exists only during the carry.
    uniforms.uVelocity!.value = this.settings.motion.flow === "editorial"
      ? velocity * evaluated.transitionPulse
      : velocity;
    uniforms.uDistortion!.value = this.settings.motion.distortion;
    uniforms.uAxis!.value = this.settings.motion.axis === "horizontal" ? 0 : 1;
    uniforms.uPhase!.value = sourceIndex;
    uniforms.uTactile!.value = this.settings.motion.flow === "editorial" ? paperEnergy : 0.5;

    const shadowUniforms = item.shadowMaterial.uniforms;
    shadowUniforms.uSizePx!.value.set(shadowWidth, shadowHeight);
    shadowUniforms.uRadiusPx!.value = this.settings.slide.radius + shadowMargin * 0.35;
    shadowUniforms.uSmoothing!.value = this.settings.slide.smoothing;
    shadowUniforms.uSoftnessPx!.value = this.settings.slide.shadowSoftness * (1 - shadowLag * 0.16);
    shadowUniforms.uOpacity!.value = this.settings.slide.shadowOpacity * evaluated.opacity;

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

  private updatePresenterGeometry(): void {
    const settings = this.settings.presenter;
    const shouldShow = settings.enabled && Boolean(this.presenterAsset) && Boolean(this.presenterMaterial.uniforms.uMap!.value);
    this.presenterGroup.visible = shouldShow;
    if (!shouldShow) return;
    const width = this.settings.stage.width * THREE.MathUtils.clamp(settings.width, 0.12, 0.9);
    const height = width / (settings.aspectWidth / Math.max(0.01, settings.aspectHeight));
    const x = (settings.x - 0.5) * this.settings.stage.width;
    const y = (0.5 - settings.y) * this.settings.stage.height;
    this.presenterGroup.position.set(x, y, 180);
    this.presenterGroup.rotation.set(0, 0, 0);
    this.presenterGroup.scale.setScalar(1);
    this.presenterSlide.scale.set(width, height, 1);
    const margin = 54;
    this.presenterShadow.scale.set(width + margin * 2, height + margin * 2, 1);
    this.presenterShadow.position.set(12, -18, -10);

    const uniforms = this.presenterMaterial.uniforms;
    uniforms.uPlaneAspect!.value = width / height;
    uniforms.uFit!.value = settings.fit === "cover" ? 0 : 1;
    uniforms.uFocal!.value.set(0.5, 0.5);
    uniforms.uSizePx!.value.set(width, height);
    uniforms.uRadiusPx!.value = Math.min(settings.radius, Math.min(width, height) / 2);
    uniforms.uSmoothing!.value = settings.smoothing;
    uniforms.uBorderPx!.value = settings.borderWidth;
    uniforms.uBorderColor!.value.set(settings.borderColor);
    uniforms.uBorderOpacity!.value = settings.borderOpacity;
    uniforms.uOpacity!.value = 1;
    uniforms.uVelocity!.value = 0;
    uniforms.uDistortion!.value = 0;
    uniforms.uAxis!.value = 0;
    uniforms.uTactile!.value = 0;

    const shadowUniforms = this.presenterShadowMaterial.uniforms;
    shadowUniforms.uSizePx!.value.set(width + margin * 2, height + margin * 2);
    shadowUniforms.uRadiusPx!.value = settings.radius + margin * 0.3;
    shadowUniforms.uSmoothing!.value = settings.smoothing;
    shadowUniforms.uSoftnessPx!.value = 48;
    shadowUniforms.uOpacity!.value = settings.shadowOpacity;
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
    this.backgroundMaterial.uniforms.uSeed!.value = background.seed;
  }

  private updateBackground(
    time: number,
    distance: number,
    geometry: ReturnType<typeof getSlideGeometry>,
    exportMode: boolean,
  ): void {
    const reduced = exportMode ? this.settings.motion.reducedMotionOutput : this.reducedMotionPreview;
    let phase = 0;
    if (!reduced && this.settings.background.motion > 1e-6) {
      if (this.settings.motion.flow === "editorial") {
        phase = editorialDeckPhase(this.settings, distance, geometry.stride, this.assets.length);
      } else if (exportMode && this.settings.motion.seamless) {
        phase = (time / Math.max(0.001, this.settings.output.duration))
          * Math.PI
          * 2
          * Math.max(1, Math.round(this.settings.motion.seamlessLoops));
      } else {
        phase = time * this.settings.background.motion * 0.72;
      }
    }
    this.backgroundMaterial.uniforms.uPhase!.value = phase;
    this.backgroundMaterial.uniforms.uResolution!.value.set(
      this.exportActive ? this.settings.output.width : this.settings.stage.width,
      this.exportActive ? this.settings.output.height : this.settings.stage.height,
    );
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

  private visibleMotionPosition(
    geometry = getSlideGeometry(this.settings),
    settings = this.settings,
  ): number {
    if (settings.motion.flow !== "editorial") return this.motionPosition;
    return remapEditorialDistance(
      this.motionPosition,
      geometry.stride,
      settings.motion.speed,
      settings.motion.curvature,
      settings.motion.edgeFade,
    );
  }

  private rawMotionPosition(
    visibleDistance: number,
    geometry = getSlideGeometry(this.settings),
    settings = this.settings,
  ): number {
    if (settings.motion.flow !== "editorial") return visibleDistance;
    return invertEditorialDistance(
      visibleDistance,
      geometry.stride,
      settings.motion.speed,
      settings.motion.curvature,
      settings.motion.edgeFade,
    );
  }

  private onPointerDown(event: PointerEvent): void {
    if (this.exportActive || event.button !== 0) return;
    this.dragging = true;
    this.dragPointerId = event.pointerId;
    this.lastPointerCoordinate = this.settings.motion.axis === "horizontal" ? event.clientX : event.clientY;
    this.lastPointerTime = performance.now();
    this.motionVelocity = 0;
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
    const geometry = getSlideGeometry(this.settings);
    const visible = this.visibleMotionPosition(geometry, this.settings);
    this.motionPosition = this.rawMotionPosition(visible + deltaWorld, geometry, this.settings);
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
    if (this.paused || this.reducedMotionPreview) this.motionVelocity = 0;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  }

  private onWheel(event: WheelEvent): void {
    if (this.exportActive) return;
    event.preventDefault();
    const modeScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 18 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 240 : 1;
    const raw = this.settings.motion.axis === "horizontal" && Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const impulse = THREE.MathUtils.clamp(raw * modeScale, -180, 180) * this.settings.motion.dragSensitivity;
    const geometry = getSlideGeometry(this.settings);
    const visible = this.visibleMotionPosition(geometry, this.settings);
    this.motionPosition = this.rawMotionPosition(visible + impulse, geometry, this.settings);
    this.motionVelocity = this.paused || this.reducedMotionPreview
      ? 0
      : this.motionVelocity + impulse * 5.5;
    this.renderPreview();
  }

  private onVisibilityChange(): void {
    this.lastFrameTime = performance.now();
    this.syncPresenterPlayback();
  }

  private syncPresenterPlayback(): void {
    const video = this.presenterVideo;
    if (!video) return;
    if (this.paused || this.exportActive || this.contextLost || document.hidden || this.disposed) {
      video.pause();
      return;
    }
    void video.play().catch(() => undefined);
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
