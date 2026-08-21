import type { SonicPalette, SonicSettings } from "../model";
import {
  getSonicAssetBytes,
  getSonicAssetSpec,
  getSonicAssetVariantCount,
  type SonicAssetSpec,
  type SonicCue,
} from "./catalog";
import {
  buildSonicGestureLayers,
  getBalancedSonicVariant,
  getSonicGestureDependencies,
  type SonicSemanticCue,
} from "./grammar";
import {
  configureSonicCompressor,
  SONIC_OUTPUT_HEADROOM,
} from "./dynamics";
import {
  createSonicFilters,
  getSonicEnvelopePoints,
} from "./graph";
import { getSonicPassageDecision } from "./plan";

export type SonicRuntimeState =
  | "idle"
  | "loading"
  | "auditioning"
  | "ready"
  | "muted"
  | "unavailable";

export interface SonicGesture {
  intensity?: number;
  pan?: number;
  /** Absolute carousel crossing when available; makes preview match export. */
  sequence?: number;
  /** Composition seed used by deterministic density and texture decisions. */
  seed?: number;
  /** Horizontal passages receive the same restrained pan variation as export. */
  panVariation?: boolean;
  /** Audition can demonstrate the complete palette even at zero density. */
  force?: boolean;
}

interface DecodedSonicAsset {
  buffer: AudioBuffer;
  spec: SonicAssetSpec;
}

const MAX_VOICES = 12;
const CORE_CUES: readonly SonicCue[] = ["passage", "settle"];
const INTERACTIVE_PRIME_CUES: readonly SonicSemanticCue[] = [
  "grab",
  "release",
  "control",
  "success",
  "failure",
];
const MOTION_CUES = new Set<SonicSemanticCue>([
  "passage",
  "grab",
  "release",
  "settle",
]);
const COOLDOWN_MS: Readonly<Record<SonicSemanticCue, number>> = {
  passage: 85,
  grab: 110,
  release: 110,
  settle: 150,
  control: 70,
  success: 220,
  failure: 220,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashUnit(value: number): number {
  let seed = value | 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  seed ^= seed >>> 16;
  return (seed >>> 0) / 4_294_967_295;
}

function assetKey(palette: SonicPalette, cue: SonicCue): string {
  return `${palette}:${cue}`;
}

function playbackWindow(asset: DecodedSonicAsset): Readonly<{
  offset: number;
  duration: number;
}> {
  const offset = clamp(asset.spec.trimStart, 0, asset.buffer.duration);
  const remaining = Math.max(0, asset.buffer.duration - offset);
  const tail = clamp(asset.spec.trimEnd, 0, remaining);
  return {
    offset,
    duration: Math.max(0, remaining - tail),
  };
}

export class SonicEngine {
  private settings: SonicSettings;
  private readonly onState: (state: SonicRuntimeState) => void;
  private readonly onError?: (message: string) => void;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private output: GainNode | null = null;
  private readonly decoded = new Map<
    SonicPalette,
    Map<SonicCue, readonly DecodedSonicAsset[]>
  >();
  private readonly cueLoads = new Map<
    string,
    Promise<readonly DecodedSonicAsset[]>
  >();
  private readonly coreLoads = new Map<SonicPalette, Promise<void>>();
  private readonly assetDecodes = new Map<string, Promise<AudioBuffer>>();
  private readonly voices = new Set<AudioBufferSourceNode>();
  private readonly lastPlayed = new Map<SonicSemanticCue, number>();
  private readonly timers = new Set<number>();
  private readonly reportedLoadErrors = new Set<string>();
  private sequence = 0;
  private motionSequence = 0;
  private settingsRevision = 0;
  private auditionToken = 0;
  private auditioning = false;
  private suppressed = false;
  private unavailable = false;
  private disposed = false;
  private publishedState: SonicRuntimeState | null = null;

  constructor(
    settings: SonicSettings,
    onState: (state: SonicRuntimeState) => void,
    onError?: (message: string) => void,
  ) {
    this.settings = { ...settings };
    this.onState = onState;
    this.onError = onError;
    this.publishState();
  }

  get runtimeState(): SonicRuntimeState {
    if (this.unavailable) return "unavailable";
    if (this.auditioning) return "auditioning";
    if (!this.settings.previewEnabled) return "muted";
    if (this.coreLoads.has(this.settings.palette)) return "loading";
    if (this.context && this.hasCore(this.settings.palette)) return "ready";
    return "idle";
  }

  setSettings(settings: SonicSettings): void {
    if (this.auditioning) {
      this.auditioning = false;
      this.auditionToken += 1;
    }
    this.settingsRevision += 1;
    const paletteChanged = settings.palette !== this.settings.palette;
    const textureChanged = settings.variation !== this.settings.variation;
    const previewEnabled = !this.settings.previewEnabled && settings.previewEnabled;
    this.settings = { ...settings };
    this.updateMasterGain();
    if (
      (paletteChanged || textureChanged || previewEnabled)
      && this.context
      && !this.unavailable
      && this.settings.previewEnabled
    ) {
      void this.ensureCore(settings.palette)
        .then(async () => {
          await this.ensureGestureDependencies(
            settings.palette,
            "passage",
            settings.variation,
            1,
          );
          this.primeInteractiveCues(settings.palette);
        })
        .catch((error: unknown) => this.reportRecoverable(error, "core"));
    }
    this.publishState();
  }

  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
    this.updateMasterGain();
  }

  async unlock(): Promise<void> {
    // The explicit enable button updates this engine before React commits the
    // project state, so a single trusted gesture is sufficient.
    if (this.disposed || this.unavailable) return;
    try {
      if (!this.context) {
        if (typeof AudioContext === "undefined") {
          this.markUnavailable("This browser does not expose Web Audio.");
          return;
        }
        const context = new AudioContext({ latencyHint: "interactive" });
        const master = context.createGain();
        const compressor = context.createDynamicsCompressor();
        const output = context.createGain();
        configureSonicCompressor(compressor);
        output.gain.value = SONIC_OUTPUT_HEADROOM;
        master.connect(compressor);
        compressor.connect(output);
        output.connect(context.destination);
        this.context = context;
        this.master = master;
        this.compressor = compressor;
        this.output = output;
      }
      if (this.context.state === "suspended") await this.context.resume();
      await this.ensureCore(this.settings.palette);
      await this.ensureGestureDependencies(
        this.settings.palette,
        "passage",
        this.settings.variation,
        1,
      );
      this.primeInteractiveCues(this.settings.palette);
      this.updateMasterGain();
      this.publishState();
    } catch (error) {
      if (!this.context) this.markUnavailable(error);
      else this.reportRecoverable(error, "core");
    }
  }

  play(cue: SonicSemanticCue, gesture: SonicGesture = {}): boolean {
    const context = this.context;
    const master = this.master;
    const palette = this.settings.palette;
    if (
      this.disposed
      || this.unavailable
      || this.suppressed
      || !this.settings.previewEnabled
      || !context
      || context.state !== "running"
      || !master
    ) return false;

    const intensity = clamp(gesture.intensity ?? 0.7, 0.08, 1);
    let passageDecision: ReturnType<typeof getSonicPassageDecision> | null = null;
    let semanticSequence = gesture.sequence;
    if (cue === "passage") {
      if (typeof semanticSequence !== "number" || !Number.isFinite(semanticSequence)) {
        this.motionSequence += 1;
        semanticSequence = this.motionSequence;
      } else {
        semanticSequence = Math.max(1, Math.abs(Math.trunc(semanticSequence)));
        this.motionSequence = Math.max(this.motionSequence, semanticSequence);
      }
      passageDecision = getSonicPassageDecision(
        palette,
        this.settings.density,
        this.settings.variation,
        gesture.seed ?? 0,
        semanticSequence,
      );
      if (!gesture.force && !passageDecision.included) return false;
    }

    this.sequence += 1;
    if (typeof semanticSequence !== "number" || !Number.isFinite(semanticSequence)) {
      semanticSequence = this.sequence;
    }

    const dependencies = getSonicGestureDependencies(
      palette,
      cue,
      this.settings.variation,
      intensity,
      Boolean(gesture.force),
    );
    const missing = dependencies.filter(
      (dependency) => !this.decoded.get(palette)?.get(dependency)?.length,
    );
    if (missing.length > 0) {
      void Promise.all(missing.map(async (dependency) => {
        await this.loadCue(palette, dependency);
      })).then(() => this.publishState()).catch((error: unknown) => {
        this.reportRecoverable(error, `${palette}:${cue}:gesture`);
      });
      return false;
    }

    const nowMs = performance.now();
    const previous = this.lastPlayed.get(cue) ?? Number.NEGATIVE_INFINITY;
    if (nowMs - previous < COOLDOWN_MS[cue]) return false;
    this.lastPlayed.set(cue, nowMs);

    const pitchUnit = hashUnit(this.sequence + cue.length * 17);
    const signedVariation = passageDecision?.signedVariation
      ?? (pitchUnit * 2 - 1) * 0.18;
    const baseVariant = passageDecision?.variant ?? getBalancedSonicVariant(
      palette,
      cue,
      gesture.seed ?? 0,
      semanticSequence,
    );
    const basePlaybackRate = passageDecision?.playbackRate ?? clamp(
      1 + signedVariation * 0.085,
      0.8,
      1.2,
    );
    const basePan = clamp(
      (gesture.pan ?? 0)
      + (
        cue === "passage" && gesture.panVariation
          ? signedVariation * 0.09
          : 0
      ),
      -0.82,
      0.82,
    );
    const authoredGain = cue === "passage"
      ? clamp(
        0.42 + intensity * 0.43 + signedVariation * 0.05,
        0.26,
        0.92,
      )
      : 0.4 + intensity * 0.6;
    const familyGain = MOTION_CUES.has(cue)
      ? this.settings.motionGain
      : this.settings.interfaceGain;
    const layers = buildSonicGestureLayers({
      palette,
      cue,
      sequence: semanticSequence,
      seed: gesture.seed ?? 0,
      texture: this.settings.variation,
      intensity,
      baseVariant,
      basePlaybackRate,
      baseGain: authoredGain,
      basePan,
      spatial: MOTION_CUES.has(cue) && Math.abs(basePan) > 1e-6,
      force: gesture.force,
    });

    let played = false;
    const gestureStart = context.currentTime + 0.003;
    for (const layer of layers) {
      const variants = this.decoded.get(palette)?.get(layer.cue);
      if (!variants?.length) continue;
      const variantIndex = (
        (Math.trunc(layer.variant) % variants.length) + variants.length
      ) % variants.length;
      const asset = variants[variantIndex]!;
      const window = playbackWindow(asset);
      if (window.duration <= 0) continue;

      while (this.voices.size >= MAX_VOICES) {
        const oldest = this.voices.values().next().value as
          | AudioBufferSourceNode
          | undefined;
        if (!oldest) break;
        try {
          oldest.stop();
        } catch {
          // Already ended.
        }
        this.voices.delete(oldest);
      }

      const source = context.createBufferSource();
      const gain = context.createGain();
      const panner = context.createStereoPanner();
      const filters = createSonicFilters(context, layer.filters);
      source.buffer = asset.buffer;
      source.playbackRate.value = layer.playbackRate;
      panner.pan.value = layer.pan;

      const voiceGain = clamp(
        familyGain * layer.gain * asset.spec.gain,
        0,
        4,
      );
      const start = gestureStart + layer.delay;
      const audibleDuration = window.duration / source.playbackRate.value;
      const end = start + audibleDuration;
      const { attackEnd, releaseStart } = getSonicEnvelopePoints(
        start,
        end,
        layer.envelope,
      );
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(voiceGain, attackEnd);
      gain.gain.setValueAtTime(voiceGain, releaseStart);
      gain.gain.linearRampToValueAtTime(0, end);

      let tail: AudioNode = source;
      for (const filter of filters) {
        tail.connect(filter);
        tail = filter;
      }
      tail.connect(gain);
      gain.connect(panner);
      panner.connect(master);
      source.onended = () => {
        this.voices.delete(source);
        source.disconnect();
        for (const filter of filters) filter.disconnect();
        gain.disconnect();
        panner.disconnect();
      };
      this.voices.add(source);
      source.start(start, window.offset, window.duration);
      played = true;
    }
    return played;
  }

  async audition(): Promise<void> {
    if (this.auditioning) return;
    const token = ++this.auditionToken;
    const revision = this.settingsRevision;
    const temporaryPreview = !this.settings.previewEnabled;
    if (temporaryPreview) {
      this.auditioning = true;
      this.settings = { ...this.settings, previewEnabled: true };
      this.updateMasterGain();
      this.publishState();
    }

    const restoreTemporaryPreview = () => {
      if (
        !temporaryPreview
        || token !== this.auditionToken
        || revision !== this.settingsRevision
      ) return;
      this.auditioning = false;
      this.settings = { ...this.settings, previewEnabled: false };
      this.updateMasterGain();
      this.publishState();
    };

    try {
      await this.unlock();
      await this.ensureGestureDependencies(
        this.settings.palette,
        "passage",
        1,
        0.72,
        true,
      );
      if (!this.play("passage", {
        intensity: 0.72,
        pan: -0.34,
        panVariation: true,
        sequence: 1,
        seed: 0,
        force: true,
      })) {
        restoreTemporaryPreview();
        return;
      }
      const settleTimer = window.setTimeout(() => {
        this.timers.delete(settleTimer);
        this.play("settle", { intensity: 0.58, pan: 0.18 });
      }, 240);
      this.timers.add(settleTimer);

      if (temporaryPreview) {
        const restoreTimer = window.setTimeout(() => {
          this.timers.delete(restoreTimer);
          restoreTemporaryPreview();
        }, 1_050);
        this.timers.add(restoreTimer);
      }
    } catch (error) {
      restoreTemporaryPreview();
      throw error;
    }
  }

  async suspendForVisibility(hidden: boolean): Promise<void> {
    const context = this.context;
    if (!context || context.state === "closed") return;
    if (hidden && context.state === "running") {
      await context.suspend().catch(() => undefined);
    } else if (
      !hidden
      && context.state === "suspended"
      && this.settings.previewEnabled
    ) {
      await context.resume().catch(() => undefined);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {
        // Already ended.
      }
    }
    this.voices.clear();
    this.master?.disconnect();
    this.compressor?.disconnect();
    this.output?.disconnect();
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.output = null;
    this.coreLoads.clear();
    this.cueLoads.clear();
    this.assetDecodes.clear();
  }

  private hasCore(palette: SonicPalette): boolean {
    const paletteBuffers = this.decoded.get(palette);
    return CORE_CUES.every((cue) => Boolean(paletteBuffers?.get(cue)?.length));
  }

  private async ensureCore(palette: SonicPalette): Promise<void> {
    if (this.hasCore(palette)) return;
    const existing = this.coreLoads.get(palette);
    if (existing) return await existing;

    const load = Promise.all(
      CORE_CUES.map(async (cue) => await this.loadCue(palette, cue)),
    ).then(() => undefined).finally(() => {
      this.coreLoads.delete(palette);
      this.publishState();
    });
    this.coreLoads.set(palette, load);
    this.publishState();
    return await load;
  }

  private async ensureGestureDependencies(
    palette: SonicPalette,
    cue: SonicSemanticCue,
    texture: number,
    intensity: number,
    force = false,
  ): Promise<void> {
    const dependencies = getSonicGestureDependencies(
      palette,
      cue,
      texture,
      intensity,
      force,
    );
    await Promise.all(dependencies.map(async (dependency) => {
      await this.loadCue(palette, dependency);
    }));
  }

  private primeInteractiveCues(palette: SonicPalette): void {
    for (const cue of INTERACTIVE_PRIME_CUES) {
      const intensity = cue === "failure" ? 0.82 : cue === "success" ? 0.64 : 0.72;
      void this.ensureGestureDependencies(
        palette,
        cue,
        this.settings.variation,
        intensity,
      ).catch((error: unknown) => {
        this.reportRecoverable(error, assetKey(palette, cue));
      });
    }
  }

  private async loadCue(
    palette: SonicPalette,
    cue: SonicCue,
  ): Promise<readonly DecodedSonicAsset[]> {
    const cached = this.decoded.get(palette)?.get(cue);
    if (cached) return cached;
    const key = assetKey(palette, cue);
    const existing = this.cueLoads.get(key);
    if (existing) return await existing;
    const context = this.context;
    if (!context) throw new Error("Sound engine has not been unlocked.");

    const load = Promise.all(
      Array.from(
        { length: getSonicAssetVariantCount(palette, cue) },
        async (_, variant): Promise<DecodedSonicAsset> => {
          const spec = getSonicAssetSpec(palette, cue, variant);
          return {
            buffer: await this.decodeAsset(context, spec, async () => (
              await getSonicAssetBytes(palette, cue, variant)
            )),
            spec,
          };
        },
      ),
    ).then((assets) => {
      if (this.disposed || this.context !== context) return assets;
      let paletteBuffers = this.decoded.get(palette);
      if (!paletteBuffers) {
        paletteBuffers = new Map<SonicCue, readonly DecodedSonicAsset[]>();
        this.decoded.set(palette, paletteBuffers);
      }
      paletteBuffers.set(cue, assets);
      this.reportedLoadErrors.delete(key);
      return assets;
    }).finally(() => {
      this.cueLoads.delete(key);
    });

    this.cueLoads.set(key, load);
    return await load;
  }

  private async decodeAsset(
    context: AudioContext,
    spec: SonicAssetSpec,
    loadBytes: () => Promise<ArrayBuffer>,
  ): Promise<AudioBuffer> {
    let decode = this.assetDecodes.get(spec.uri);
    if (!decode) {
      decode = loadBytes().then(async (bytes) => (
        await context.decodeAudioData(bytes)
      ));
      this.assetDecodes.set(spec.uri, decode);
      void decode.catch(() => {
        if (this.assetDecodes.get(spec.uri) === decode) {
          this.assetDecodes.delete(spec.uri);
        }
      });
    }
    return await decode;
  }

  private updateMasterGain(): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const target = this.settings.previewEnabled && !this.suppressed
      ? this.settings.masterGain
      : 0;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(target, context.currentTime, 0.012);
  }

  private markUnavailable(error: unknown): void {
    this.unavailable = true;
    this.onError?.(
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Tactile sound could not start in this browser.",
    );
    this.publishState();
  }

  private reportRecoverable(error: unknown, key: string): void {
    if (this.reportedLoadErrors.has(key)) return;
    this.reportedLoadErrors.add(key);
    this.onError?.(
      error instanceof Error
        ? `${error.message} Sound remains retryable.`
        : "A local tactile recording could not be prepared. Sound remains retryable.",
    );
    this.publishState();
  }

  private publishState(): void {
    const state = this.runtimeState;
    if (state === this.publishedState) return;
    this.publishedState = state;
    this.onState(state);
  }
}
