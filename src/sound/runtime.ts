import type { SoundSettings } from './model';
import { normalizeSoundSettings } from './model';
import { renderAuditionCue } from './render';

interface AudioContextConstructor {
  new (contextOptions?: AudioContextOptions): AudioContext;
}

const AudioContextClass = (): AudioContextConstructor | undefined => {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
};

class TactileSoundRuntime {
  private settings: SoundSettings = normalizeSoundSettings(undefined);
  private context?: AudioContext;
  private output?: GainNode;
  private lastCueAt = 0;
  private activeSources = new Set<AudioBufferSourceNode>();

  setSettings(value: unknown): void {
    this.settings = normalizeSoundSettings(value);
    if (this.output && this.context) {
      const gain = this.settings.enabled && this.settings.previewEnabled ? 0.88 : 0;
      this.output.gain.setTargetAtTime(gain, this.context.currentTime, 0.018);
    }
  }

  async unlock(): Promise<void> {
    if (!this.settings.enabled || !this.settings.previewEnabled) return;
    const Constructor = AudioContextClass();
    if (!Constructor) return;
    if (!this.context) {
      this.context = new Constructor({ latencyHint: 'interactive', sampleRate: 48_000 });
      this.output = this.context.createGain();
      this.output.gain.value = 0.88;
      this.output.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  async audition(strength = 1): Promise<void> {
    if (!this.settings.enabled || !this.settings.previewEnabled) return;
    await this.unlock();
    if (!this.context || !this.output) return;
    const now = performance.now();
    if (now - this.lastCueAt < 34) return;
    this.lastCueAt = now;
    const rendered = renderAuditionCue({
      ...this.settings,
      level: Math.min(1, this.settings.level * Math.max(0.36, strength)),
    }, this.context.sampleRate);
    const buffer = this.context.createBuffer(2, rendered.channelData[0].length, rendered.sampleRate);
    buffer.copyToChannel(rendered.channelData[0], 0);
    buffer.copyToChannel(rendered.channelData[1], 1);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.output);
    this.activeSources.add(source);
    source.addEventListener('ended', () => {
      source.disconnect();
      this.activeSources.delete(source);
    }, { once: true });
    source.start();
    while (this.activeSources.size > 8) {
      const oldest = this.activeSources.values().next().value as AudioBufferSourceNode | undefined;
      if (!oldest) break;
      oldest.stop();
      this.activeSources.delete(oldest);
    }
  }

  dispose(): void {
    for (const source of this.activeSources) source.stop();
    this.activeSources.clear();
    void this.context?.close();
    this.context = undefined;
    this.output = undefined;
  }
}

export const tactileSoundRuntime = new TactileSoundRuntime();

export function installTactileInteractionBridge(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  let dragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let lastMoveAt = 0;
  let lastWheelAt = 0;

  const isInteractiveControl = (target: EventTarget | null): target is Element =>
    target instanceof Element
    && Boolean(target.closest('button, input, select, [role="button"], [data-sound-cue]'));

  const isStage = (target: EventTarget | null): boolean =>
    target instanceof Element && Boolean(target.closest('canvas, [data-stage], .stage'));

  const onPointerDown = (event: PointerEvent): void => {
    void tactileSoundRuntime.unlock();
    if (isStage(event.target)) {
      dragging = true;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      lastMoveAt = performance.now();
      void tactileSoundRuntime.audition(0.46);
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragging) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - lastMoveAt);
    const distance = Math.hypot(event.clientX - lastPointerX, event.clientY - lastPointerY);
    if (distance > 12 && now - lastMoveAt > 58) {
      const velocity = Math.min(1.28, distance / elapsed / 0.72);
      void tactileSoundRuntime.audition(0.36 + velocity * 0.48);
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      lastMoveAt = now;
    }
  };

  const onPointerUp = (): void => {
    if (!dragging) return;
    dragging = false;
    void tactileSoundRuntime.audition(0.72);
  };

  const onWheel = (event: WheelEvent): void => {
    if (!isStage(event.target)) return;
    const now = performance.now();
    if (now - lastWheelAt < 64) return;
    lastWheelAt = now;
    const strength = Math.min(1.12, 0.42 + Math.abs(event.deltaX + event.deltaY) / 580);
    void tactileSoundRuntime.audition(strength);
  };

  const onControl = (event: Event): void => {
    if (!isInteractiveControl(event.target)) return;
    const target = event.target as Element;
    if (target.closest('[data-sound-silent="true"]')) return;
    void tactileSoundRuntime.unlock();
    void tactileSoundRuntime.audition(target.matches('input[type="range"]') ? 0.38 : 0.58);
  };

  window.addEventListener('pointerdown', onPointerDown, { capture: true });
  window.addEventListener('pointermove', onPointerMove, { capture: true });
  window.addEventListener('pointerup', onPointerUp, { capture: true });
  window.addEventListener('pointercancel', onPointerUp, { capture: true });
  window.addEventListener('wheel', onWheel, { capture: true, passive: true });
  window.addEventListener('change', onControl, { capture: true });
  window.addEventListener('click', onControl, { capture: true });

  return () => {
    window.removeEventListener('pointerdown', onPointerDown, { capture: true });
    window.removeEventListener('pointermove', onPointerMove, { capture: true });
    window.removeEventListener('pointerup', onPointerUp, { capture: true });
    window.removeEventListener('pointercancel', onPointerUp, { capture: true });
    window.removeEventListener('wheel', onWheel, { capture: true });
    window.removeEventListener('change', onControl, { capture: true });
    window.removeEventListener('click', onControl, { capture: true });
  };
}
