import type { SonicPalette, SonicSettings } from "../model";
import { SONIC_PALETTE_LABELS } from "../sonic/catalog";
import type { SonicRuntimeState } from "../sonic/SonicEngine";

interface SonicDockProps {
  settings: SonicSettings;
  state: SonicRuntimeState;
  disabled: boolean;
  onSettings: (patch: Partial<SonicSettings>) => void;
  onAudition: () => void;
}

interface RangeRowProps {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

const PALETTES: readonly SonicPalette[] = ["studio", "cinematic", "paper"];

function RangeRow({ label, value, disabled = false, onChange }: RangeRowProps) {
  const percentage = Math.round(value * 100);
  return (
    <label className="sonic-range">
      <span>{label}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <output>{percentage}</output>
    </label>
  );
}

function stateLabel(state: SonicRuntimeState): string {
  switch (state) {
    case "ready": return "armed";
    case "muted": return "muted";
    case "unavailable": return "unavailable";
    case "idle":
    default: return "tap to arm";
  }
}

export function SonicDock({ settings, state, disabled, onSettings, onAudition }: SonicDockProps) {
  return (
    <div className="sonic-dock" data-state={state}>
      <button
        type="button"
        className="sonic-mute"
        disabled={disabled || state === "unavailable"}
        aria-label={settings.previewEnabled ? "Mute tactile preview sound" : "Enable tactile preview sound"}
        aria-pressed={!settings.previewEnabled}
        onClick={() => onSettings({ previewEnabled: !settings.previewEnabled })}
      >
        {settings.previewEnabled ? "SOUND" : "MUTED"}
      </button>
      <details>
        <summary aria-label="Open sound direction controls">
          <span>{stateLabel(state)}</span>
          <i aria-hidden="true" />
        </summary>
        <div className="sonic-popover" role="group" aria-label="Sound direction">
          <header>
            <span>TACTILE SOUND</span>
            <strong>Motion you can almost touch.</strong>
            <p>Short, physical cues. No music. No runtime network.</p>
          </header>

          <fieldset className="sonic-palettes" disabled={disabled || state === "unavailable"}>
            <legend>Material</legend>
            <div>
              {PALETTES.map((palette) => (
                <label key={palette} title={SONIC_PALETTE_LABELS[palette].description}>
                  <input
                    type="radio"
                    name="sonic-palette"
                    value={palette}
                    checked={settings.palette === palette}
                    onChange={() => onSettings({ palette })}
                  />
                  <span style={{ pointerEvents: "none" }}>{SONIC_PALETTE_LABELS[palette].name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="sonic-ranges">
            <RangeRow label="Master" value={settings.masterGain} disabled={disabled} onChange={(masterGain) => onSettings({ masterGain })} />
            <RangeRow label="Passages" value={settings.motionGain} disabled={disabled} onChange={(motionGain) => onSettings({ motionGain })} />
            <RangeRow label="Controls" value={settings.interfaceGain} disabled={disabled} onChange={(interfaceGain) => onSettings({ interfaceGain })} />
            <RangeRow label="Density" value={settings.density} disabled={disabled} onChange={(density) => onSettings({ density })} />
            <RangeRow label="Variation" value={settings.variation} disabled={disabled} onChange={(variation) => onSettings({ variation })} />
            <RangeRow
              label="Under voice"
              value={settings.duckUnderPresenter}
              disabled={disabled || !settings.exportEnabled}
              onChange={(duckUnderPresenter) => onSettings({ duckUnderPresenter })}
            />
          </div>

          <label className="sonic-switch">
            <span>
              <strong>Include in MP4</strong>
              <small>One mixed AAC track; presenter speech stays primary.</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.exportEnabled}
              disabled={disabled}
              onChange={(event) => onSettings({ exportEnabled: event.currentTarget.checked })}
            />
          </label>

          <button type="button" className="sonic-audition" disabled={disabled || state === "unavailable"} onClick={onAudition}>
            Audition gesture
          </button>
          <footer>
            <span>CC0 source audio · bundled locally</span>
            <span>Audio master · 24 / 25 / 30 fps</span>
          </footer>
        </div>
      </details>
    </div>
  );
}
