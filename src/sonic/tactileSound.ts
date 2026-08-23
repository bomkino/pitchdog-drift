import type { SemanticEventType } from "../core/events/SemanticEvent";
import type { DriftProjectV4, SoundSettings } from "../core/project/schema";
import { planSemanticEvents } from "../core/timeline/eventPlanner";
import {
  getSonicAssetBytes,
  getSonicAssetSpec,
  getSonicAssetVariantCount,
  type SonicCue,
  type SonicPalette,
} from "./catalog";

export const TACTILE_SAMPLE_RATE = 48_000;
export const TACTILE_CHANNELS = 2;

export type TactileRuntimeState = "off" | "idle" | "loading" | "ready" | "unavailable";

interface TactileLayer {
  cue: SonicCue;
  time: number;
  gain: number;
  playbackRate: number;
  pan: number;
  variant: number;
  role: "body" | "air" | "contact" | "landing";
}

interface DecodedAsset {
  buffer: AudioBuffer;
  trimStart: number;
  trimEnd: number;
  gain: number;
}

const layerCues: Readonly<Partial<Record<SemanticEventType, SonicCue>>> = {
  "slide-departure": "air",
  "focus-handoff": "passage",
  "focus-impact": "contact",
  settle: "settle",
  "master-finish": "success",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashUnit(seed: number): number {
  let value = seed | 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 4_294_967_295;
}

export function sonicPaletteFor(settings: SoundSettings): SonicPalette {
  return settings.material === "cinematic" || settings.material === "paper"
    ? settings.material
    : "studio";
}

function includeEvent(type: SemanticEventType, grammar: SoundSettings["grammar"]): boolean {
  if (type === "focus-handoff" || type === "settle") return true;
  if (type === "focus-impact") return grammar !== "dry";
  if (type === "slide-departure" || type === "master-finish") return grammar === "organic";
  return false;
}

function layerRole(type: SemanticEventType): TactileLayer["role"] {
  if (type === "slide-departure") return "air";
  if (type === "focus-impact") return "contact";
  if (type === "settle" || type === "master-finish") return "landing";
  return "body";
}

/** Pure semantic plan shared by preview selection and the exact offline master. */
export function planTactileLayers(project: DriftProjectV4): TactileLayer[] {
  if (!project.sound.exportEnabled && !project.sound.previewEnabled) return [];
  const palette = sonicPaletteFor(project.sound);
  const events = planSemanticEvents(project, 0, project.master.duration);
  const density = clamp(project.sound.density, 0, 1);
  const texture = clamp(project.sound.texture, 0, 1);
  return events.flatMap((event) => {
    const cue = layerCues[event.type];
    if (!cue || !includeEvent(event.type, project.sound.grammar)) return [];
    const chance = hashUnit(project.projectSeed + project.sound.take * 911 + event.sequence * 977 + cue.length * 37);
    if (event.type !== "focus-handoff" && chance > density) return [];
    const role = layerRole(event.type);
    const variantCount = getSonicAssetVariantCount(palette, cue);
    const variant = Math.floor(hashUnit(project.projectSeed + project.sound.take * 101 + event.sequence * 313) * variantCount);
    const roleGain = role === "body" ? 0.64 : role === "air" ? 0.2 : role === "contact" ? 0.34 : 0.4;
    const signedTexture = (hashUnit(project.projectSeed + event.sequence * 1_229) * 2 - 1) * texture;
    return [{
      cue,
      time: clamp(event.time + (role === "air" ? -0.035 : role === "contact" ? 0.012 : 0), 0, project.master.duration),
      gain: clamp(roleGain * (0.72 + event.intensity * 0.28), 0, 0.78),
      playbackRate: clamp(1 + signedTexture * 0.075, 0.86, 1.14),
      pan: project.motion.transport.axis === "horizontal"
        ? clamp(project.motion.transport.direction * signedTexture * 0.24, -0.42, 0.42)
        : 0,
      variant,
      role,
    } satisfies TactileLayer];
  });
}

async function decodeAsset(
  context: BaseAudioContext,
  palette: SonicPalette,
  cue: SonicCue,
  variant: number,
  signal?: AbortSignal,
): Promise<DecodedAsset> {
  if (signal?.aborted) throw signal.reason;
  const spec = getSonicAssetSpec(palette, cue, variant);
  const bytes = await getSonicAssetBytes(palette, cue, variant, signal);
  const buffer = await context.decodeAudioData(bytes);
  return { buffer, trimStart: spec.trimStart, trimEnd: spec.trimEnd, gain: spec.gain };
}

function scheduleLayer(
  context: BaseAudioContext,
  destination: AudioNode,
  asset: DecodedAsset,
  layer: TactileLayer,
  timelineOffset = 0,
): AudioBufferSourceNode {
  const source = context.createBufferSource();
  const gain = context.createGain();
  const panner = context.createStereoPanner();
  source.buffer = asset.buffer;
  source.playbackRate.value = layer.playbackRate;
  panner.pan.value = layer.pan;
  const start = Math.max(context.currentTime, timelineOffset + layer.time);
  const offset = clamp(asset.trimStart, 0, asset.buffer.duration);
  const sourceDuration = Math.max(0, asset.buffer.duration - offset - asset.trimEnd);
  const audibleDuration = sourceDuration / layer.playbackRate;
  const attack = Math.min(0.012, audibleDuration * 0.2);
  const release = Math.min(0.06, audibleDuration * 0.3);
  const level = clamp(layer.gain * asset.gain, 0, 0.82);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(level, start + attack);
  gain.gain.setValueAtTime(level, Math.max(start + attack, start + audibleDuration - release));
  gain.gain.linearRampToValueAtTime(0, start + audibleDuration);
  source.connect(gain);
  gain.connect(panner);
  panner.connect(destination);
  source.start(start, offset, sourceDuration);
  return source;
}

export class TactileSoundEngine {
  private project: DriftProjectV4;
  private readonly onState: (state: TactileRuntimeState) => void;
  private readonly onError: (message: string) => void;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly decoded = new Map<string, Promise<DecodedAsset>>();
  private readonly voices = new Set<AudioBufferSourceNode>();
  private unavailable = false;

  constructor(project: DriftProjectV4, onState: (state: TactileRuntimeState) => void, onError: (message: string) => void) {
    this.project = project;
    this.onState = onState;
    this.onError = onError;
    this.publishState();
  }

  setProject(project: DriftProjectV4): void {
    this.project = project;
    if (this.master) this.master.gain.value = project.sound.previewEnabled ? project.sound.masterLevel * project.sound.motionLevel : 0;
    this.publishState();
  }

  async unlock(): Promise<void> {
    if (this.unavailable) return;
    try {
      if (!this.context) {
        this.context = new AudioContext({ latencyHint: "interactive" });
        this.master = this.context.createGain();
        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = -8;
        compressor.knee.value = 8;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.1;
        this.master.connect(compressor);
        compressor.connect(this.context.destination);
      }
      if (this.context.state === "suspended") await this.context.resume();
      this.setProject(this.project);
      this.publishState();
    } catch (error) {
      this.unavailable = true;
      this.publishState();
      this.onError(error instanceof Error ? error.message : "Tactile sound is unavailable.");
    }
  }

  async playPassage(sequence: number): Promise<void> {
    if (!this.project.sound.previewEnabled || this.unavailable) return;
    await this.unlock();
    if (!this.context || !this.master) return;
    const palette = sonicPaletteFor(this.project.sound);
    const cue: SonicCue = "passage";
    const variant = Math.abs(this.project.projectSeed + this.project.sound.take + sequence) % getSonicAssetVariantCount(palette, cue);
    const key = `${palette}:${cue}:${variant}`;
    let asset = this.decoded.get(key);
    if (!asset) {
      this.onState("loading");
      asset = decodeAsset(this.context, palette, cue, variant);
      this.decoded.set(key, asset);
    }
    try {
      const decoded = await asset;
      const source = scheduleLayer(this.context, this.master, decoded, {
        cue,
        time: 0,
        gain: 0.62,
        playbackRate: 1,
        pan: this.project.motion.transport.axis === "horizontal" ? this.project.motion.transport.direction * 0.14 : 0,
        variant,
        role: "body",
      }, this.context.currentTime + 0.008);
      this.voices.add(source);
      source.addEventListener("ended", () => this.voices.delete(source), { once: true });
      this.publishState();
    } catch (error) {
      this.decoded.delete(key);
      this.onError(error instanceof Error ? `Tactile sound failed: ${error.message}` : "Tactile sound failed.");
    }
  }

  dispose(): void {
    this.voices.forEach((voice) => { try { voice.stop(); } catch { /* already stopped */ } });
    this.voices.clear();
    void this.context?.close();
    this.context = null;
    this.master = null;
  }

  private publishState(): void {
    this.onState(this.unavailable ? "unavailable" : !this.project.sound.previewEnabled ? "off" : this.context ? "ready" : "idle");
  }
}

export async function renderTactileSoundtrack(
  project: DriftProjectV4,
  signal?: AbortSignal,
): Promise<AudioBuffer | null> {
  if (!project.sound.exportEnabled || project.master.reducedMotion || project.media.order.length === 0) return null;
  if (typeof OfflineAudioContext === "undefined") throw new Error("This browser cannot render tactile sound offline.");
  const layers = planTactileLayers(project);
  if (layers.length === 0) return null;
  const frameCount = Math.max(1, Math.round(project.master.duration * TACTILE_SAMPLE_RATE));
  const context = new OfflineAudioContext(TACTILE_CHANNELS, frameCount, TACTILE_SAMPLE_RATE);
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  master.gain.value = clamp(project.sound.masterLevel * project.sound.motionLevel, 0, 1);
  compressor.threshold.value = -8;
  compressor.knee.value = 8;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.1;
  master.connect(compressor);
  compressor.connect(context.destination);
  const palette = sonicPaletteFor(project.sound);
  const decoded = new Map<string, Promise<DecodedAsset>>();
  for (const layer of layers) {
    if (signal?.aborted) throw signal.reason;
    const key = `${layer.cue}:${layer.variant}`;
    let asset = decoded.get(key);
    if (!asset) {
      asset = decodeAsset(context, palette, layer.cue, layer.variant, signal);
      decoded.set(key, asset);
    }
    scheduleLayer(context, master, await asset, layer);
  }
  if (signal?.aborted) throw signal.reason;
  const rendered = await context.startRendering();
  if (signal?.aborted) throw signal.reason;
  if (rendered.sampleRate !== TACTILE_SAMPLE_RATE || rendered.numberOfChannels !== TACTILE_CHANNELS || rendered.length !== frameCount) {
    throw new Error("Tactile master did not match the exact 48 kHz stereo export timeline.");
  }
  return rendered;
}
