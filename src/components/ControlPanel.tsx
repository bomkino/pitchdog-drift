import type { CSSProperties } from "react";
import {
  MAX_SLIDE_THICKNESS,
  type DynamicsMode,
  type Flow,
  type StudioSettings,
  type SurfaceMode,
  type ThemeId,
} from "../model";
import { THEMES } from "../themes";
import { ColorField, InspectorGroup, NumberField, RangeField, Segmented, SelectField, SwitchField } from "./controls";

const PATH_NOTES: Readonly<Record<Flow, string>> = Object.freeze({
  straight: "A disciplined strip with only authored depth and focus falloff.",
  arc: "A one-sided cinematic bow; useful for calm lateral travel.",
  ribbon: "A soft S-curve that keeps the centre legible while edges drift.",
  cylinder: "Frames wrap a shallow drum and reveal their physical edge.",
  tunnel: "Depth pulls outward from the focal frame without swallowing it.",
  helix: "A controlled corkscrew with tangent-led banking and real parallax.",
  orbit: "A broad elliptical pass built for close, luminous movement.",
  cascade: "Layered rises and falls, softer than a switchback.",
  lemniscate: "A figure-eight crossing with balanced lateral rhythm.",
  switchback: "Harder lateral reversals with depth carried through every turn.",
});

const DYNAMICS_NOTES: Readonly<Record<DynamicsMode, string>> = Object.freeze({
  direct: "Immediate hand response and an unwavering master cadence.",
  weighted: "Measured hand inertia; the master gathers pace through its middle.",
  spring: "Elastic hand response with a bounded two-beat pulse in the master.",
  drift: "Long hand coast; the master breathes broadly around its mean pace.",
});

const SURFACE_NOTES: Readonly<Record<SurfaceMode, string>> = Object.freeze({
  card: "Rigid stock: restrained bow, crisp torsion, dry physical edge.",
  paper: "Curled sheet: one broad buckle, matte edge, no rubber wobble.",
  silk: "Pinned cloth: diagonal folds, quiet boundaries, soft grazing light.",
  gel: "Elastic mass: impulse lags behind the hand, with restrained gloss.",
});


interface ControlPanelProps {
  settings: StudioSettings;
  onSettings: (settings: StudioSettings) => void;
  onTheme: (id: ThemeId) => void;
  onExportStill: () => void;
  onExportVideo: () => void;
  onExportFrames: () => void;
  onExportProject: () => void;
  onImportProject: () => void;
  exporting: boolean;
}

export function ControlPanel({
  settings,
  onSettings,
  onTheme,
  onExportStill,
  onExportVideo,
  onExportFrames,
  onExportProject,
  onImportProject,
  exporting,
}: ControlPanelProps) {
  const patch = <K extends keyof StudioSettings>(key: K, values: Partial<StudioSettings[K]>) => {
    onSettings({
      ...settings,
      [key]: { ...(settings[key] as object), ...values },
    } as StudioSettings);
  };
  const setStagePreset = (width: number, height: number) => {
    onSettings({
      ...settings,
      stage: { ...settings.stage, width, height },
      output: { ...settings.output, width, height },
    });
  };
  const stageLabel = `${settings.stage.width}:${settings.stage.height}`;

  return (
    <aside className="inspector" aria-label="Director controls" aria-busy={exporting} inert={exporting}>
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">DIRECTOR</span>
          <h2>Shape the feeling.</h2>
        </div>
        <span className="local-badge">LOCAL</span>
      </div>

      <section className="theme-section" aria-labelledby="themes-title">
        <div className="section-heading-row">
          <h3 id="themes-title">Film worlds</h3>
          <span>{THEMES.length}</span>
        </div>
        <div className="theme-grid">
          {THEMES.map((theme) => (
            <button
              type="button"
              className="theme-card"
              data-active={settings.themeId === theme.id}
              key={theme.id}
              onClick={() => onTheme(theme.id)}
              aria-pressed={settings.themeId === theme.id}
              style={{ "--theme-a": theme.settings.background.colorA, "--theme-b": theme.settings.background.accent } as CSSProperties}
            >
              <span className="theme-swatch" aria-hidden="true" />
              <span>
                <strong>{theme.name}</strong>
                <small>{theme.eyebrow}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <InspectorGroup title="Composition" eyebrow={stageLabel} open>
        <Segmented
          label="Stage ratio"
          value={`${settings.stage.width}x${settings.stage.height}`}
          options={[
            { value: "1080x1920", label: "9:16" },
            { value: "1080x1350", label: "4:5" },
            { value: "1080x1080", label: "1:1" },
            { value: "1920x1080", label: "16:9" },
          ]}
          onChange={(value) => {
            const [width, height] = value.split("x").map(Number);
            setStagePreset(width!, height!);
          }}
        />
        <div className="number-pair" aria-label="Custom stage dimensions">
          <NumberField
            label="Stage width"
            value={settings.stage.width}
            min={256}
            max={8192}
            step={2}
            unit="px"
            onChange={(width) => setStagePreset(width, settings.stage.height)}
          />
          <NumberField
            label="Stage height"
            value={settings.stage.height}
            min={256}
            max={8192}
            step={2}
            unit="px"
            onChange={(height) => setStagePreset(settings.stage.width, height)}
          />
        </div>
        <SelectField
          label="Slide ratio"
          value={`${settings.slide.aspectWidth}:${settings.slide.aspectHeight}`}
          options={[
            { value: "16:9", label: "Deck · 16:9" },
            { value: "4:3", label: "Classic · 4:3" },
            { value: "1:1", label: "Square · 1:1" },
            { value: "4:5", label: "Portrait · 4:5" },
            { value: "9:16", label: "Story · 9:16" },
          ]}
          onChange={(value) => {
            const [aspectWidth, aspectHeight] = value.split(":").map(Number);
            patch("slide", { aspectWidth, aspectHeight });
          }}
        />
        <div className="number-pair" aria-label="Custom slide ratio">
          <NumberField label="Slide ratio width" value={settings.slide.aspectWidth} min={1} max={64} onChange={(aspectWidth) => patch("slide", { aspectWidth })} />
          <NumberField label="Slide ratio height" value={settings.slide.aspectHeight} min={1} max={64} onChange={(aspectHeight) => patch("slide", { aspectHeight })} />
        </div>
        <RangeField label="Slide size" value={settings.slide.scale * 100} min={24} max={110} step={1} unit="%" onChange={(value) => patch("slide", { scale: value / 100 })} />
        <RangeField label="Spacing" value={settings.motion.gap * 100} min={0} max={120} step={1} unit="%" onChange={(value) => patch("motion", { gap: value / 100 })} />
      </InspectorGroup>

      <InspectorGroup title="Motion" eyebrow={`${settings.motion.flow} · ${settings.motion.dynamics}`} open>
        <Segmented label="Flow axis" value={settings.motion.axis} options={[{ value: "horizontal", label: "Horizontal" }, { value: "vertical", label: "Vertical" }]} onChange={(axis) => patch("motion", { axis })} />
        <Segmented label="Direction" value={settings.motion.direction} options={[{ value: -1 as const, label: "Reverse" }, { value: 1 as const, label: "Forward" }]} onChange={(direction) => patch("motion", { direction })} />
        <SelectField
          label="Path"
          value={settings.motion.flow}
          options={[
            { value: "straight", label: "Straight" },
            { value: "arc", label: "Arc" },
            { value: "ribbon", label: "Ribbon" },
            { value: "cylinder", label: "Cylinder" },
            { value: "tunnel", label: "Tunnel" },
            { value: "helix", label: "Helix" },
            { value: "orbit", label: "Orbit" },
            { value: "cascade", label: "Cascade" },
            { value: "lemniscate", label: "Figure eight" },
            { value: "switchback", label: "Switchback" },
          ]}
          hint={PATH_NOTES[settings.motion.flow]}
          onChange={(flow) => patch("motion", { flow })}
        />
        <SelectField
          label="Motion character"
          value={settings.motion.dynamics}
          options={[
            { value: "direct", label: "Direct" },
            { value: "weighted", label: "Weighted" },
            { value: "spring", label: "Spring" },
            { value: "drift", label: "Drift" },
          ]}
          hint={DYNAMICS_NOTES[settings.motion.dynamics]}
          onChange={(dynamics) => patch("motion", { dynamics })}
        />
        <RangeField label="Hand response" value={settings.motion.dragSensitivity * 100} min={0} max={400} step={5} unit="%" hint="Zero locks direct manipulation; higher values move farther under the same hand gesture." onChange={(value) => patch("motion", { dragSensitivity: value / 100 })} />
        <RangeField label="Speed" value={settings.motion.speed} min={0} max={1.5} step={0.01} decimals={2} unit="×" onChange={(speed) => patch("motion", { speed })} />
        <RangeField label="Curve" value={settings.motion.curvature * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("motion", { curvature: value / 100 })} />
        <RangeField label="Depth" value={settings.motion.depth * 100} min={0} max={80} step={1} unit="%" onChange={(value) => patch("motion", { depth: value / 100 })} />
        <RangeField label="Tilt" value={settings.motion.tilt} min={0} max={18} step={0.5} decimals={1} unit="°" onChange={(tilt) => patch("motion", { tilt })} />
        <RangeField label="Path banking" value={settings.motion.bank * 100} min={0} max={100} step={1} unit="%" hint="How strongly each slide follows the path tangent." onChange={(value) => patch("motion", { bank: value / 100 })} />
        <RangeField label="Fabric flex" value={settings.motion.distortion * 100} min={0} max={100} step={1} unit="%" hint="Motion and material drive bounded deformation; zero returns the slide crisp." onChange={(value) => patch("motion", { distortion: value / 100 })} />
        <RangeField label="Focus lift" value={settings.motion.focusScale * 100} min={0} max={24} step={1} unit="%" onChange={(value) => patch("motion", { focusScale: value / 100 })} />
        <SwitchField label="Seamless export lock" checked={settings.motion.seamless} hint="Forces whole loops across master duration." onChange={(seamless) => patch("motion", { seamless })} />
        {settings.motion.seamless ? <RangeField label="Loops per master" value={settings.motion.seamlessLoops} min={1} max={6} step={1} onChange={(seamlessLoops) => patch("motion", { seamlessLoops })} /> : null}
        <SwitchField label="Reduced-motion master" checked={settings.motion.reducedMotionOutput} hint="Independent from your OS preview preference." onChange={(reducedMotionOutput) => patch("motion", { reducedMotionOutput })} />
      </InspectorGroup>

      <InspectorGroup title="Surface" eyebrow={`${settings.slide.surface} · ${settings.slide.thickness.toFixed(1)} px`}>
        <Segmented label="Image fit" value={settings.slide.fit} options={[{ value: "cover", label: "Cover" }, { value: "contain", label: "Contain" }]} onChange={(fit) => patch("slide", { fit })} />
        <SelectField
          label="Material"
          value={settings.slide.surface}
          options={[
            { value: "card", label: "Card · rigid" },
            { value: "paper", label: "Paper · curled" },
            { value: "silk", label: "Silk · folded" },
            { value: "gel", label: "Gel · elastic" },
          ]}
          hint={SURFACE_NOTES[settings.slide.surface]}
          onChange={(surface) => patch("slide", { surface })}
        />
        <RangeField label="Focal point X" value={settings.slide.focalX * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("slide", { focalX: value / 100 })} />
        <RangeField label="Focal point Y" value={settings.slide.focalY * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("slide", { focalY: value / 100 })} />
        <RangeField label="Corner radius" value={settings.slide.radius} min={0} max={180} step={1} unit=" px" onChange={(radius) => patch("slide", { radius })} />
        <RangeField label="Corner smoothing" value={settings.slide.smoothing * 100} min={0} max={100} step={1} unit="%" hint="60% is the familiar iOS-style continuous corner." onChange={(value) => patch("slide", { smoothing: value / 100 })} />

        <RangeField label="3D thickness" value={settings.slide.thickness} min={0} max={MAX_SLIDE_THICKNESS} step={0.5} decimals={1} unit=" px" hint="Scene-space edge depth; zero keeps the slide perfectly flat." onChange={(thickness) => patch("slide", { thickness })} />
        <RangeField label="Border" value={settings.slide.borderWidth} min={0} max={16} step={0.5} decimals={1} unit=" px" onChange={(borderWidth) => patch("slide", { borderWidth })} />
        <ColorField label="Border colour" value={settings.slide.borderColor} onChange={(borderColor) => patch("slide", { borderColor })} />
        <RangeField label="Border presence" value={settings.slide.borderOpacity * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("slide", { borderOpacity: value / 100 })} />
        <RangeField label="Shadow" value={settings.slide.shadowOpacity * 100} min={0} max={80} step={1} unit="%" onChange={(value) => patch("slide", { shadowOpacity: value / 100 })} />
        <RangeField label="Shadow softness" value={settings.slide.shadowSoftness} min={4} max={96} step={1} unit=" px" onChange={(shadowSoftness) => patch("slide", { shadowSoftness })} />
      </InspectorGroup>

      <InspectorGroup title="Atmosphere" eyebrow={settings.background.style}>
        <SelectField
          label="Background"
          value={settings.background.style}
          options={[
            { value: "transparent", label: "Transparent" },
            { value: "solid", label: "Solid" },
            { value: "gradient", label: "Gradient" },
            { value: "aura", label: "Soft aura" },
            { value: "paper", label: "Paper field" },
            { value: "void", label: "Breathing void" },
          ]}
          onChange={(style) => onSettings({ ...settings, stage: { ...settings.stage, transparent: style === "transparent" }, background: { ...settings.background, style } })}
        />
        <ColorField label="Ground" value={settings.background.colorA} onChange={(colorA) => patch("background", { colorA })} />
        <ColorField label="Field" value={settings.background.colorB} onChange={(colorB) => patch("background", { colorB })} />
        <ColorField label="Light" value={settings.background.accent} onChange={(accent) => patch("background", { accent })} />
        <RangeField label="Intensity" value={settings.background.intensity * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("background", { intensity: value / 100 })} />
        <RangeField label="Background breath" value={settings.background.motion * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("background", { motion: value / 100 })} />
        <RangeField label="Grain" value={settings.background.grain * 100} min={0} max={60} step={1} unit="%" onChange={(value) => patch("background", { grain: value / 100 })} />
        <RangeField label="Vignette" value={settings.background.vignette * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("background", { vignette: value / 100 })} />
      </InspectorGroup>

      <InspectorGroup title="Pinned frame" eyebrow={settings.presenter.enabled ? "ON" : "OFF"}>
        <SwitchField
          label="Keep one frame still"
          checked={settings.presenter.enabled}
          disabled={!settings.presenter.assetId}
          hint={settings.presenter.assetId ? "Turn it off here, or choose another frame in Media." : "Choose an image or presenter video in Media first."}
          onChange={(enabled) => patch("presenter", { enabled, assetId: enabled ? settings.presenter.assetId : null })}
        />
        <RangeField label="Width" value={settings.presenter.width * 100} min={14} max={82} step={1} unit="%" onChange={(value) => patch("presenter", { width: value / 100 })} />
        <RangeField label="Horizontal position" value={settings.presenter.x * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("presenter", { x: value / 100 })} />
        <RangeField label="Vertical position" value={settings.presenter.y * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("presenter", { y: value / 100 })} />
        <Segmented
          label="Pinned ratio"
          value={`${settings.presenter.aspectWidth}:${settings.presenter.aspectHeight}`}
          options={[{ value: "9:16", label: "9:16" }, { value: "4:5", label: "4:5" }, { value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }]}
          onChange={(value) => {
            const [aspectWidth, aspectHeight] = value.split(":").map(Number);
            patch("presenter", { aspectWidth, aspectHeight });
          }}
        />
        <div className="number-pair" aria-label="Custom pinned ratio">
          <NumberField label="Pinned ratio width" value={settings.presenter.aspectWidth} min={1} max={64} onChange={(aspectWidth) => patch("presenter", { aspectWidth })} />
          <NumberField label="Pinned ratio height" value={settings.presenter.aspectHeight} min={1} max={64} onChange={(aspectHeight) => patch("presenter", { aspectHeight })} />
        </div>
        <Segmented label="Pinned fit" value={settings.presenter.fit} options={[{ value: "cover", label: "Cover" }, { value: "contain", label: "Contain" }]} onChange={(fit) => patch("presenter", { fit })} />
        <RangeField label="Pinned radius" value={settings.presenter.radius} min={0} max={180} step={1} unit=" px" onChange={(radius) => patch("presenter", { radius })} />
        <RangeField label="Pinned smoothing" value={settings.presenter.smoothing * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("presenter", { smoothing: value / 100 })} />
        <RangeField label="Pinned border" value={settings.presenter.borderWidth} min={0} max={16} step={0.5} decimals={1} unit=" px" onChange={(borderWidth) => patch("presenter", { borderWidth })} />
        <ColorField label="Pinned border colour" value={settings.presenter.borderColor} onChange={(borderColor) => patch("presenter", { borderColor })} />
        <RangeField label="Pinned border presence" value={settings.presenter.borderOpacity * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("presenter", { borderOpacity: value / 100 })} />
        <RangeField label="Pinned shadow" value={settings.presenter.shadowOpacity * 100} min={0} max={80} step={1} unit="%" onChange={(value) => patch("presenter", { shadowOpacity: value / 100 })} />
        <SwitchField label="Mute presenter in export" checked={settings.presenter.muted} onChange={(muted) => patch("presenter", { muted })} />
      </InspectorGroup>

      <InspectorGroup title="Output" eyebrow={`${settings.output.width} × ${settings.output.height}`} open>
        <RangeField label="Duration" value={settings.output.duration} min={3} max={30} step={1} unit=" s" onChange={(duration) => patch("output", { duration })} />
        <Segmented
          label="Frame rate"
          value={settings.output.fps}
          options={[
            { value: 24 as const, label: "24" },
            { value: 25 as const, label: "25" },
            { value: 30 as const, label: "30" },
            { value: 50 as const, label: "50" },
            { value: 60 as const, label: "60" },
          ]}
          onChange={(fps) => patch("output", { fps })}
        />
        <div className="output-spec">
          <span>MASTER</span>
          <strong>H.264 · SDR sRGB</strong>
          <small>{(settings.output.videoBitrate / 1_000_000).toFixed(0)} Mbit/s · AAC 48 kHz at 24–30 fps · mute presenter audio for 50/60 fps</small>
        </div>
        <div className="action-stack">
          <button type="button" className="primary-action" onClick={onExportVideo} disabled={exporting}>Export MP4 master</button>
          <button type="button" onClick={onExportStill} disabled={exporting}>Save transparent-safe PNG</button>
          <button type="button" onClick={onExportFrames} disabled={exporting}>Export PNG sequence</button>
        </div>
        <div className="project-actions">
          <button type="button" onClick={onExportProject} disabled={exporting}>Save portable project</button>
          <button type="button" onClick={onImportProject} disabled={exporting}>Open project</button>
        </div>
      </InspectorGroup>
    </aside>
  );
}
