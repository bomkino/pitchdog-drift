import { useEffect, useMemo, useState } from 'react';
import type { StudioSettings } from '../model';
import {
  DEFAULT_SOUND_SETTINGS,
  SOUND_CHARACTER_IDS,
  normalizeSoundSettings,
  type SoundCharacter,
  type SoundSettings,
} from './model';
import { tactileSoundRuntime, installTactileInteractionBridge } from './runtime';
import { renderStudioSoundtrack } from './studio';
import { soundMasterBlob } from './wav';
import './soundControls.css';

interface SoundControlsProps {
  settings: StudioSettings;
  onChange: (next: SoundSettings) => void;
}

const CHARACTER_LABELS: Record<SoundCharacter, string> = {
  paper: 'Paper / editorial',
  air: 'Air / soft focus',
  celluloid: 'Celluloid / sprocket',
  glass: 'Glass / precise',
  felt: 'Felt / muted',
  mechanism: 'Mechanism / tactile',
};

const SLIDERS: readonly {
  key: keyof Pick<
    SoundSettings,
    'level' | 'air' | 'accent' | 'texture' | 'density' | 'stereoWidth' | 'duckUnderVoice'
  >;
  label: string;
  hint: string;
}[] = [
  { key: 'level', label: 'Level', hint: 'Overall Foley level' },
  { key: 'air', label: 'Air', hint: 'Tail length and displaced air' },
  { key: 'accent', label: 'Accent', hint: 'Weight on editorial beats' },
  { key: 'texture', label: 'Texture', hint: 'Fibres, grain and mechanism detail' },
  { key: 'density', label: 'Density', hint: 'How often movement earns a cue' },
  { key: 'stereoWidth', label: 'Width', hint: 'Left–right travel' },
  { key: 'duckUnderVoice', label: 'Voice duck', hint: 'Space reserved for presenter audio' },
] as const;

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function SoundControls({ settings, onChange }: SoundControlsProps) {
  const sound = useMemo(() => normalizeSoundSettings(settings.sound), [settings.sound]);
  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    tactileSoundRuntime.setSettings(sound);
  }, [sound]);

  useEffect(() => installTactileInteractionBridge(), []);

  const patch = (next: Partial<SoundSettings>): void => {
    onChange(normalizeSoundSettings({ ...sound, ...next }));
  };

  const exportWav = (): void => {
    if (isRendering) return;
    setIsRendering(true);
    try {
      const master = renderStudioSoundtrack({ ...settings, sound });
      downloadBlob(soundMasterBlob(master), `pitchdog-foley-${sound.character}-${master.checksum}.wav`);
      void tactileSoundRuntime.audition(0.86);
    } finally {
      window.setTimeout(() => setIsRendering(false), 0);
    }
  };

  return (
    <section className="sound-room" aria-labelledby="sound-room-title">
      <div className="sound-room__head">
        <div>
          <h2 id="sound-room-title">Sound room</h2>
          <p>Original procedural Foley. No sample pack. Same seed, same master.</p>
        </div>
        <label className="sound-room__switch">
          <input
            type="checkbox"
            checked={sound.enabled}
            onChange={(event) => patch({ enabled: event.currentTarget.checked })}
            data-sound-silent="true"
          />
          <span>{sound.enabled ? 'On' : 'Off'}</span>
        </label>
      </div>

      <label className="sound-room__field">
        <span>Material character</span>
        <select
          value={sound.character}
          onChange={(event) => patch({ character: event.currentTarget.value as SoundCharacter })}
          disabled={!sound.enabled}
        >
          {SOUND_CHARACTER_IDS.map((character) => (
            <option key={character} value={character}>{CHARACTER_LABELS[character]}</option>
          ))}
        </select>
      </label>

      <div className="sound-room__toggles">
        <label>
          <input
            type="checkbox"
            checked={sound.previewEnabled}
            onChange={(event) => patch({ previewEnabled: event.currentTarget.checked })}
            disabled={!sound.enabled}
            data-sound-silent="true"
          />
          Live cues
        </label>
        <label>
          <input
            type="checkbox"
            checked={sound.includeInExport}
            onChange={(event) => patch({ includeInExport: event.currentTarget.checked })}
            disabled={!sound.enabled}
            data-sound-silent="true"
          />
          Render master
        </label>
      </div>

      <div className="sound-room__sliders">
        {SLIDERS.map(({ key, label, hint }) => (
          <label className="sound-room__slider" key={key} title={hint}>
            <span>{label}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={sound[key]}
              onChange={(event) => patch({ [key]: Number(event.currentTarget.value) })}
              disabled={!sound.enabled}
            />
            <output>{Math.round(sound[key] * 100)}</output>
          </label>
        ))}
      </div>

      <label className="sound-room__field sound-room__seed">
        <span>Seed</span>
        <input
          type="number"
          min="0"
          max="2147483647"
          step="1"
          value={sound.seed}
          onChange={(event) => patch({ seed: Number(event.currentTarget.value) })}
          disabled={!sound.enabled}
          data-sound-silent="true"
        />
      </label>

      <label className="sound-room__reduced-motion">
        <input
          type="checkbox"
          checked={sound.respectReducedMotion}
          onChange={(event) => patch({ respectReducedMotion: event.currentTarget.checked })}
          disabled={!sound.enabled}
          data-sound-silent="true"
        />
        Silence automatic cues when reduced motion is requested
      </label>

      <div className="sound-room__actions">
        <button
          type="button"
          onClick={() => void tactileSoundRuntime.audition(1)}
          disabled={!sound.enabled || !sound.previewEnabled}
          data-sound-silent="true"
        >
          Audition
        </button>
        <button
          type="button"
          onClick={exportWav}
          disabled={!sound.enabled || !sound.includeInExport || isRendering}
          data-sound-silent="true"
        >
          {isRendering ? 'Rendering…' : 'Export 24-bit WAV'}
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_SOUND_SETTINGS })}
          data-sound-silent="true"
        >
          Reset
        </button>
      </div>
    </section>
  );
}
