import type { SonicPalette, SonicSettings } from "../model";
import {
  getSonicAssetBytes,
  getSonicAssetVariantCount,
  SONIC_CUES,
  type SonicCue,
} from "./catalog";
import { getSonicDensityStep } from "./plan";

export type SonicRuntimeState = "idle" | "ready" | "muted" | "unavailable";

export interface SonicGesture {
  intensity?: number;
  pan?: number;
}

const MAX_VOICES = 8;
const MOTION_CUES = new Set<SonicCue>(["passage", "grab", "release", "settle"]);
const COOLDOWN_MS: Readonly<Record<SonicCue, number>> = {
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
  const sine = Math.sin(value * 12.9898 + 78.233) * 43_758.5453;
  return sine - Math.floor(sine);
}

export class SonicEngine {
  private settings: SonicSettings;
  private readonly onState: (state: SonicRuntimeState) => void;
  private readonly onError?: (message: string) => void;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private readonly decoded = new Map<
    SonicPalette,
    Map<SonicCue, readonly AudioBuffer[]>
  >();
  private readonly loads = new Map<
    SonicPalette,
    Promise<Map<SonicCue, readonly AudioBuffer[]>>
  >();
  private readonly voices = new Set<AudioBufferSourceNode>();
  private readonly lastPlayed = new Map<SonicCue, number>();
  private readonly timers = new Set<number>();
  private sequence = 0;
  private motionSequence = 0;
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
    if (!this.settings.previewEnabled) return "muted";
    if (this.context && this.decoded.has(this.settings.palette)) return "ready";
    return "idle";
  }

  setSettings(settings: SonicSettings): void {
    const paletteChanged = settings.palette !== this.settings.palette;
    this.settings = { ...settings };
    this.updateMasterGain();
    if (
      paletteChanged
      && this.context
      && !this.unavailable
      && this.settings.previewEnabled
    ) {
      void this.loadPalette(settings.palette)
        .then(() => this.publishState())
        .catch((error: unknown) => this.fail(error));
    }
    this.publishState();
  }

  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
    this.updateMasterGain();
  }

  async unlock(): Promise<void> {
    if (this.disposed || this.unavailable || !this.settings.previewEnabled) return;
    try {
      if (!this.context) {
        if (typeof AudioContext === "undefined") {
          this.unavailable = true;
          this.publishState();
          return;
        }
        const context = new AudioContext({ latencyHint: "interactive" });
        const master = context.createGain();
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -17;
        compressor.knee.value = 20;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.18;
        master.connect(compressor);
        compressor.connect(context.destination);
        this.context = context;
        this.master = master;
        this.compressor = compressor;
      }
      if (this.context.state === "suspended") await this.context.resume();
      await this.loadPalette(this.settings.palette);
      this.updateMasterGain();
      this.publishState();
    } catch (error) {
      this.fail(error);
    }
  }

  play(cue: SonicCue, gesture: SonicGesture = {}): boolean {
    const context = this.context;
    const master = this.master;
    const buffers = this.decoded.get(this.settings.palette);
    if (
      this.disposed
      || this.unavailable
      || this.suppressed
      || !this.settings.previewEnabled
      || !context
      || context.state !== "running"
      || !master
      || !buffers
    ) return false;

    if (cue === "passage") {
      const densityStep = getSonicDensityStep(this.settings.density);
      this.motionSequence += 1;
      if (
        !Number.isFinite(densityStep)
        || (this.motionSequence - 1) % densityStep !== 0
      ) return false;
    }

    const nowMs = performance.now();
    const previous = this.lastPlayed.get(cue) ?? Number.NEGATIVE_INFINITY;
    if (nowMs - previous < COOLDOWN_MS[cue]) return false;
    this.lastPlayed.set(cue, nowMs);

    const variants = buffers.get(cue);
    if (!variants?.length) return false;

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

    this.sequence += 1;
    const pitchUnit = hashUnit(this.sequence + cue.length * 17);
    const sampleUnit = hashUnit(this.sequence * 131 + cue.length * 47);
    const signedVariation = (pitchUnit * 2 - 1) * this.settings.variation;
    const variantIndex = this.settings.variation <= 0.01
      ? 0
      : Math.min(variants.length - 1, Math.floor(sampleUnit * variants.length));
    const buffer = variants[variantIndex]!;
    const intensity = clamp(gesture.intensity ?? 0.7, 0.08, 1);
    const familyGain = MOTION_CUES.has(cue)
      ? this.settings.motionGain
      : this.settings.interfaceGain;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const panner = context.createStereoPanner();

    source.buffer = buffer;
    source.playbackRate.value = clamp(
      1 + signedVariation * 0.085,
      0.8,
      1.2,
    );
    panner.pan.value = clamp(gesture.pan ?? 0, -0.82, 0.82);

    const voiceGain = clamp(familyGain * (0.4 + intensity * 0.6), 0, 1);
    const start = context.currentTime + 0.003;
    const end = start + buffer.duration / source.playbackRate.value;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(
      voiceGain,
      start + Math.min(0.012, buffer.duration * 0.2),
    );
    gain.gain.setValueAtTime(
      voiceGain,
      Math.max(start + 0.012, end - 0.024),
    );
    gain.gain.linearRampToValueAtTime(0, end);

    source.connect(gain);
    gain.connect(panner);
    panner.connect(master);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
    this.voices.add(source);
    source.start(start);
    return true;
  }

  async audition(): Promise<void> {
    await this.unlock();
    if (!this.play("passage", { intensity: 0.72, pan: -0.34 })) return;
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      this.play("settle", { intensity: 0.58, pan: 0.18 });
    }, 210);
    this.timers.add(timer);
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
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.master = null;
    this.compressor = null;
  }

  private async loadPalette(
    palette: SonicPalette,
  ): Promise<Map<SonicCue, readonly AudioBuffer[]>> {
    const cached = this.decoded.get(palette);
    if (cached) return cached;
    const existing = this.loads.get(palette);
    if (existing) return existing;
    const context = this.context;
    if (!context) throw new Error("Sound engine has not been unlocked.");

    const load = Promise.all(SONIC_CUES.map(async (cue) => {
      const variantCount = getSonicAssetVariantCount(palette, cue);
      const variants = await Promise.all(
        Array.from({ length: variantCount }, async (_, variant) => {
          const bytes = await getSonicAssetBytes(palette, cue, variant);
          return await context.decodeAudioData(bytes);
        }),
      );
      return [cue, variants] as const;
    })).then((entries) => {
      const buffers = new Map<SonicCue, readonly AudioBuffer[]>(entries);
      this.decoded.set(palette, buffers);
      return buffers;
    }).finally(() => {
      this.loads.delete(palette);
    });

    this.loads.set(palette, load);
    return load;
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

  private fail(error: unknown): void {
    this.unavailable = true;
    this.onError?.(
      error instanceof Error
        ? error.message
        : "Tactile sound could not start in this browser.",
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
