import type { CSSProperties } from "react";
import { driftBuildIdentity } from "../lib/buildIdentity";
import {
  fitPerformanceLifecycleToDuration,
  type StudioSettings,
  type ThemeId,
} from "../model";
import {
  createPerformanceLifecycle,
  TRANSITION_PRESET_ORDER,
  TRANSITION_PRESETS,
  type PerformanceLifecycleAuthoring,
  type TransitionPresetId,
} from "../core/timeline/performanceLifecycle";
import {
  TEMPO_CURVE_PRESET_ORDER,
  TEMPO_CURVE_PRESETS,
  type TempoCurvePresetId,
} from "../core/timeline/tempoCurve";
import { THEMES } from "../themes";
import { ColorField, InspectorGroup, NumberField, RangeField, Segmented, SelectField, SwitchField } from "./controls";

const MIN_OUTPUT_DURATION = 3;
const MAX_OUTPUT_DURATION = 30;
const MIN_BODY_DURATION = 0.25;
const MAX_TRANSITION_DURATION = 2;
const MAX_REPEAT_COUNT = 6;

type TempoSelection = TempoCurvePresetId | "custom";

const TRANSITION_OPTIONS: Array<{ value: TransitionPresetId; label: string }> =
  TRANSITION_PRESET_ORDER.map((id) => ({ value: id, label: TRANSITION_PRESETS[id].label }));

const TEMPO_OPTIONS: Array<{ value: TempoSelection; label: string }> = [
  ...TEMPO_CURVE_PRESET_ORDER.map((id) => ({ value: id, label: TEMPO_CURVE_PRESETS[id].label })),
  { value: "custom", label: "Custom" },
];

function transitionPresetFor(performance: PerformanceLifecycleAuthoring): TransitionPresetId {
  if (performance.transitionPreset) return performance.transitionPreset;
  const transition = performance.entry.enabled
    ? performance.entry
    : performance.exit.enabled
      ? performance.exit
      : null;
  if (!transition) return "quiet-lift";
  return TRANSITION_PRESET_ORDER.find((id) => {
    const candidate = TRANSITION_PRESETS[id].entry;
    return candidate.enabled && candidate.treatment === transition.treatment;
  }) ?? "quiet-lift";
}

function bodyDurationForTotal(
  performance: PerformanceLifecycleAuthoring,
  totalDuration: number,
): number {
  const entryDuration = performance.entry.enabled ? performance.entry.durationSeconds : 0;
  const exitDuration = performance.exit.enabled ? performance.exit.durationSeconds : 0;
  switch (performance.repeat.mode) {
    case "off":
      return totalDuration - entryDuration - exitDuration;
    case "body":
      return (totalDuration - entryDuration - exitDuration) / performance.repeat.count;
    case "full-scene":
      return totalDuration / performance.repeat.count - entryDuration - exitDuration;
  }
}

function minimumTotalDuration(performance: PerformanceLifecycleAuthoring): number {
  const entryDuration = performance.entry.enabled ? performance.entry.durationSeconds : 0;
  const exitDuration = performance.exit.enabled ? performance.exit.durationSeconds : 0;
  let authoredMinimum: number;
  switch (performance.repeat.mode) {
    case "off":
      authoredMinimum = entryDuration + MIN_BODY_DURATION + exitDuration;
      break;
    case "body":
      authoredMinimum = entryDuration + MIN_BODY_DURATION * performance.repeat.count + exitDuration;
      break;
    case "full-scene":
      authoredMinimum = (entryDuration + MIN_BODY_DURATION + exitDuration) * performance.repeat.count;
      break;
  }
  return Math.ceil(Math.max(MIN_OUTPUT_DURATION, authoredMinimum) * 10) / 10;
}

interface ControlPanelProps {
  settings: StudioSettings;
  onSettings: (settings: StudioSettings) => void;
  onTheme: (id: ThemeId) => void;
  onExportStill: () => void;
  onExportVideo: () => void;
  onExportFrames: () => void;
  onExportProject: () => void;
  onImportProject: () => void;
  projectFilesEnabled: boolean;
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
  projectFilesEnabled,
  exporting,
}: ControlPanelProps) {
  const patch = <K extends keyof StudioSettings>(key: K, values: Partial<StudioSettings[K]>) => {
    onSettings({
      ...settings,
      [key]: { ...(settings[key] as object), ...values },
    } as StudioSettings);
  };
  const commitPerformance = (
    candidate: PerformanceLifecycleAuthoring,
    requestedTotal?: number,
    reducedMotionOutput = settings.motion.reducedMotionOutput,
  ) => {
    let timeline = createPerformanceLifecycle({
      ...candidate,
      reducedMotion: reducedMotionOutput,
    });
    const minimum = Math.min(MAX_OUTPUT_DURATION, minimumTotalDuration(timeline.authoring));
    const targetTotal = Math.min(
      MAX_OUTPUT_DURATION,
      Math.max(minimum, requestedTotal ?? timeline.totalDuration),
    );
    if (Math.abs(targetTotal - timeline.totalDuration) > 1e-9) {
      const fitted = fitPerformanceLifecycleToDuration(
        timeline.authoring,
        targetTotal,
        reducedMotionOutput,
      );
      timeline = createPerformanceLifecycle(fitted);
    }
    onSettings({
      ...settings,
      motion: settings.motion.reducedMotionOutput === reducedMotionOutput
        ? settings.motion
        : { ...settings.motion, reducedMotionOutput },
      performance: timeline.authoring,
      output: { ...settings.output, duration: timeline.totalDuration },
    });
  };
  const setStagePreset = (width: number, height: number) => {
    onSettings({
      ...settings,
      stage: { ...settings.stage, width, height },
      output: { ...settings.output, width, height },
    });
  };
  const stageLabel = `${settings.stage.width}:${settings.stage.height}`;
  const performanceTimeline = createPerformanceLifecycle(settings.performance);
  const performance = performanceTimeline.authoring;
  const entryTransition = performance.entry;
  const exitTransition = performance.exit;
  const bodyTempo = performance.body.tempo;
  const customTempo = bodyTempo.kind === "custom" ? bodyTempo : null;
  const customTempoFallsBackToEven = customTempo !== null
    && customTempo.envelope.start === 0
    && customTempo.envelope.middle === 0
    && customTempo.envelope.finish === 0;
  const repeat = performance.repeat;
  const transitionPresetId = transitionPresetFor(performance);
  const tempoSelection: TempoSelection = bodyTempo.kind === "custom"
    ? "custom"
    : bodyTempo.preset;
  const bodyDurationMinimum = Math.max(
    MIN_BODY_DURATION,
    bodyDurationForTotal(performance, MIN_OUTPUT_DURATION),
  );
  const bodyDurationMaximum = Math.max(
    bodyDurationMinimum,
    bodyDurationForTotal(performance, MAX_OUTPUT_DURATION),
  );
  const outputDurationMinimum = Math.min(
    MAX_OUTPUT_DURATION,
    minimumTotalDuration(performance),
  );

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
          <h3 id="themes-title">{driftBuildIdentity.isDevelopment ? "V1 looks · compatibility" : "Film worlds"}</h3>
          <span>6</span>
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

      <InspectorGroup title="Motion" eyebrow={`${settings.motion.speed.toFixed(2)} slides/s`} open>
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
          ]}
          onChange={(flow) => patch("motion", { flow })}
        />
        <RangeField label="Speed" value={settings.motion.speed} min={0} max={1.5} step={0.01} decimals={2} unit="×" onChange={(speed) => patch("motion", { speed })} />
        <RangeField label="Curve" value={settings.motion.curvature * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("motion", { curvature: value / 100 })} />
        <RangeField label="Depth" value={settings.motion.depth * 100} min={0} max={80} step={1} unit="%" onChange={(value) => patch("motion", { depth: value / 100 })} />
        <RangeField label="Tilt" value={settings.motion.tilt} min={0} max={18} step={0.5} decimals={1} unit="°" onChange={(tilt) => patch("motion", { tilt })} />
        <RangeField label="Optical bend" value={settings.motion.distortion * 100} min={0} max={100} step={1} unit="%" hint="Velocity drives shader deformation; still frames return crisp." onChange={(value) => patch("motion", { distortion: value / 100 })} />
        <RangeField label="Focus lift" value={settings.motion.focusScale * 100} min={0} max={24} step={1} unit="%" onChange={(value) => patch("motion", { focusScale: value / 100 })} />
        <SwitchField label="Seamless export lock" checked={settings.motion.seamless} hint="Forces whole loops across master duration." onChange={(seamless) => patch("motion", { seamless })} />
        {settings.motion.seamless ? <RangeField label="Loops per master" value={settings.motion.seamlessLoops} min={1} max={6} step={1} onChange={(seamlessLoops) => patch("motion", { seamlessLoops })} /> : null}
        <SwitchField
          label="Reduced-motion master"
          checked={settings.motion.reducedMotionOutput}
          hint="Independent from your OS preview preference. Keeps transition timing, but removes spatial travel and stagger."
          onChange={(reducedMotionOutput) => commitPerformance(
            { ...performanceTimeline.authoring, reducedMotion: reducedMotionOutput },
            performanceTimeline.totalDuration,
            reducedMotionOutput,
          )}
        />
      </InspectorGroup>

      <InspectorGroup title="Surface" eyebrow={`${Math.round(settings.slide.smoothing * 100)}% smoothing`}>
        <Segmented label="Image fit" value={settings.slide.fit} options={[{ value: "cover", label: "Cover" }, { value: "contain", label: "Contain" }]} onChange={(fit) => patch("slide", { fit })} />
        <RangeField label="Focal point X" value={settings.slide.focalX * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("slide", { focalX: value / 100 })} />
        <RangeField label="Focal point Y" value={settings.slide.focalY * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("slide", { focalY: value / 100 })} />
        <RangeField label="Corner radius" value={settings.slide.radius} min={0} max={180} step={1} unit=" px" onChange={(radius) => patch("slide", { radius })} />
        <RangeField label="Corner smoothing" value={settings.slide.smoothing * 100} min={0} max={100} step={1} unit="%" hint="60% is the familiar iOS-style continuous corner." onChange={(value) => patch("slide", { smoothing: value / 100 })} />
        <RangeField label="Border" value={settings.slide.borderWidth} min={0} max={16} step={0.5} decimals={1} unit=" px" onChange={(borderWidth) => patch("slide", { borderWidth })} />
        <ColorField label="Border colour" value={settings.slide.borderColor} onChange={(borderColor) => patch("slide", { borderColor })} />
        <RangeField label="Border presence" value={settings.slide.borderOpacity * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("slide", { borderOpacity: value / 100 })} />
        <RangeField label="Shadow" value={settings.slide.shadowOpacity * 100} min={0} max={80} step={1} unit="%" onChange={(value) => patch("slide", { shadowOpacity: value / 100 })} />
        <RangeField label="Shadow softness" value={settings.slide.shadowSoftness} min={4} max={160} step={1} unit=" px" onChange={(shadowSoftness) => patch("slide", { shadowSoftness })} />
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
          hint={settings.presenter.assetId ? "Turning this off remembers the frame, so you can bring it back without choosing it again." : "Choose an image or presenter video in Media first."}
          onChange={(enabled) => patch("presenter", { enabled })}
        />
        <Segmented
          label="Carousel presence"
          value={settings.presenter.trackMode}
          options={[
            { value: "pinned-only", label: "Still only" },
            { value: "moving-and-pinned", label: "Still + moving" },
          ]}
          onChange={(trackMode) => patch("presenter", { trackMode })}
        />
        <Segmented
          label="Layer"
          value={settings.presenter.layoutMode}
          options={[
            { value: "safe-overlay", label: "Protected" },
            { value: "legacy-perspective", label: "In scene" },
          ]}
          onChange={(layoutMode) => patch("presenter", { layoutMode })}
        />
        <RangeField label="Width" value={settings.presenter.width * 100} min={14} max={82} step={1} unit="%" onChange={(value) => patch("presenter", { width: value / 100 })} />
        <RangeField label="Horizontal position" value={settings.presenter.x * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("presenter", { x: value / 100 })} />
        <RangeField label="Vertical position" value={settings.presenter.y * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("presenter", { y: value / 100 })} />
        {settings.presenter.layoutMode === "safe-overlay" ? (
          <RangeField label="Safe inset" value={settings.presenter.safeInset * 100} min={0} max={25} step={0.5} decimals={1} unit="%" onChange={(value) => patch("presenter", { safeInset: value / 100 })} />
        ) : null}
        <Segmented label="Ratio" value={settings.presenter.aspectMode} options={[{ value: "source", label: "Use source" }, { value: "custom", label: "Custom" }]} onChange={(aspectMode) => patch("presenter", { aspectMode })} />
        {settings.presenter.aspectMode === "custom" ? (
          <>
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
          </>
        ) : null}
        <Segmented label="Pinned fit" value={settings.presenter.fit} options={[{ value: "cover", label: "Cover" }, { value: "contain", label: "Contain" }]} onChange={(fit) => patch("presenter", { fit })} />
        {settings.presenter.fit === "cover" ? (
          <>
            <RangeField label="Pinned focal X" value={settings.presenter.focalX * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("presenter", { focalX: value / 100 })} />
            <RangeField label="Pinned focal Y" value={settings.presenter.focalY * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("presenter", { focalY: value / 100 })} />
          </>
        ) : (
          <>
            <RangeField label="Matte" value={settings.presenter.matteOpacity * 100} min={0} max={100} step={1} unit="%" hint="Zero keeps unused Contain space truly transparent." onChange={(value) => patch("presenter", { matteOpacity: value / 100 })} />
            {settings.presenter.matteOpacity > 0 ? <ColorField label="Matte colour" value={settings.presenter.matteColor} onChange={(matteColor) => patch("presenter", { matteColor })} /> : null}
          </>
        )}
        <RangeField label="Pinned radius" value={settings.presenter.radius} min={0} max={180} step={1} unit=" px" onChange={(radius) => patch("presenter", { radius })} />
        <RangeField label="Pinned smoothing" value={settings.presenter.smoothing * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("presenter", { smoothing: value / 100 })} />
        <RangeField label="Pinned border" value={settings.presenter.borderWidth} min={0} max={16} step={0.5} decimals={1} unit=" px" onChange={(borderWidth) => patch("presenter", { borderWidth })} />
        {settings.presenter.borderWidth > 0 ? (
          <>
            <ColorField label="Pinned border colour" value={settings.presenter.borderColor} onChange={(borderColor) => patch("presenter", { borderColor })} />
            <RangeField label="Pinned border presence" value={settings.presenter.borderOpacity * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("presenter", { borderOpacity: value / 100 })} />
          </>
        ) : null}
        <RangeField label="Pinned shadow" value={settings.presenter.shadowOpacity * 100} min={0} max={80} step={1} unit="%" onChange={(value) => patch("presenter", { shadowOpacity: value / 100 })} />
        {settings.presenter.shadowOpacity > 0 ? (
          <>
            <RangeField label="Pinned shadow softness" value={settings.presenter.shadowSoftness} min={0} max={160} step={1} unit=" px" onChange={(shadowSoftness) => patch("presenter", { shadowSoftness })} />
            <RangeField label="Pinned shadow X" value={settings.presenter.shadowOffsetX} min={-96} max={96} step={1} unit=" px" onChange={(shadowOffsetX) => patch("presenter", { shadowOffsetX })} />
            <RangeField label="Pinned shadow Y" value={settings.presenter.shadowOffsetY} min={-96} max={96} step={1} unit=" px" onChange={(shadowOffsetY) => patch("presenter", { shadowOffsetY })} />
          </>
        ) : null}
        <SwitchField label="Mute presenter in export" checked={settings.presenter.muted} onChange={(muted) => patch("presenter", { muted })} />
      </InspectorGroup>

      <InspectorGroup title="Performance" eyebrow={`${performanceTimeline.totalDuration.toFixed(2)} s total`} open>
        <SelectField
          label="Transition style"
          value={transitionPresetId}
          options={TRANSITION_OPTIONS}
          onChange={(presetId) => {
            const preset = TRANSITION_PRESETS[presetId];
            const current = performanceTimeline.authoring;
            commitPerformance({
              ...current,
              transitionPreset: presetId,
              entry: current.entry.enabled && preset.entry.enabled
                ? { ...preset.entry, includePresenter: current.entry.includePresenter === true }
                : { enabled: false },
              exit: current.exit.enabled && preset.exit.enabled
                ? { ...preset.exit, includePresenter: current.exit.includePresenter === true }
                : { enabled: false },
            });
          }}
        />
        <SwitchField
          label="Opening animation"
          checked={entryTransition.enabled}
          hint="Brings the background and slides in before the carousel begins."
          onChange={(enabled) => {
            const preset = TRANSITION_PRESETS[transitionPresetId];
            commitPerformance({
              ...performanceTimeline.authoring,
              entry: enabled && preset.entry.enabled
                ? { ...preset.entry, includePresenter: false }
                : { enabled: false },
            });
          }}
        />
        {entryTransition.enabled ? (
          <>
            <RangeField
              label="Opening duration"
              value={entryTransition.durationSeconds}
              min={0.12}
              max={MAX_TRANSITION_DURATION}
              step={0.04}
              decimals={2}
              unit=" s"
              onChange={(durationSeconds) => commitPerformance({
                ...performance,
                entry: { ...entryTransition, durationSeconds },
              })}
            />
            <SwitchField
              label="Pinned frame joins opening"
              checked={entryTransition.includePresenter === true}
              hint="Off keeps the pinned frame protected at its resting pose."
              onChange={(includePresenter) => commitPerformance({
                ...performance,
                entry: { ...entryTransition, includePresenter },
              })}
            />
          </>
        ) : null}
        <SwitchField
          label="Ending animation"
          checked={exitTransition.enabled}
          hint="Closes the background and slides after the final carousel pass."
          onChange={(enabled) => {
            const preset = TRANSITION_PRESETS[transitionPresetId];
            commitPerformance({
              ...performanceTimeline.authoring,
              exit: enabled && preset.exit.enabled
                ? { ...preset.exit, includePresenter: false }
                : { enabled: false },
            });
          }}
        />
        {exitTransition.enabled ? (
          <>
            <RangeField
              label="Ending duration"
              value={exitTransition.durationSeconds}
              min={0.12}
              max={MAX_TRANSITION_DURATION}
              step={0.04}
              decimals={2}
              unit=" s"
              onChange={(durationSeconds) => commitPerformance({
                ...performance,
                exit: { ...exitTransition, durationSeconds },
              })}
            />
            <SwitchField
              label="Pinned frame joins ending"
              checked={exitTransition.includePresenter === true}
              hint="Off keeps the pinned frame protected until the scene is gone."
              onChange={(includePresenter) => commitPerformance({
                ...performance,
                exit: { ...exitTransition, includePresenter },
              })}
            />
          </>
        ) : null}
        <RangeField
          label="Body duration"
          value={performance.body.durationSeconds}
          min={bodyDurationMinimum}
          max={bodyDurationMaximum}
          step={0.01}
          decimals={2}
          unit=" s"
          hint="Length of one carousel pass. Repeats extend the master around it."
          onChange={(durationSeconds) => commitPerformance({
            ...performance,
            body: { ...performance.body, durationSeconds },
          })}
        />
        <SelectField
          label="Tempo"
          value={tempoSelection}
          options={TEMPO_OPTIONS}
          onChange={(tempo) => commitPerformance({
            ...performance,
            body: {
              ...performance.body,
              tempo: tempo === "custom"
                ? {
                    kind: "custom",
                    envelope: { ...performanceTimeline.tempoCurve.authoredEnvelope },
                  }
                : { kind: "preset", preset: tempo },
            },
          })}
        />
        {customTempo ? (
          <>
            <RangeField
              label="Start speed"
              value={customTempo.envelope.start}
              min={0}
              max={3}
              step={0.05}
              decimals={2}
              unit="×"
              hint="Relative pace. Drift normalizes the complete pass, so it still lands exactly."
              onChange={(start) => commitPerformance({
                ...performance,
                body: {
                  ...performance.body,
                  tempo: {
                    kind: "custom",
                    envelope: { ...customTempo.envelope, start },
                  },
                },
              })}
            />
            <RangeField
              label="Middle speed"
              value={customTempo.envelope.middle}
              min={0}
              max={3}
              step={0.05}
              decimals={2}
              unit="×"
              onChange={(middle) => commitPerformance({
                ...performance,
                body: {
                  ...performance.body,
                  tempo: {
                    kind: "custom",
                    envelope: { ...customTempo.envelope, middle },
                  },
                },
              })}
            />
            <RangeField
              label="Finish speed"
              value={customTempo.envelope.finish}
              min={0}
              max={3}
              step={0.05}
              decimals={2}
              unit="×"
              onChange={(finish) => commitPerformance({
                ...performance,
                body: {
                  ...performance.body,
                  tempo: {
                    kind: "custom",
                    envelope: { ...customTempo.envelope, finish },
                  },
                },
              })}
            />
            {customTempoFallsBackToEven ? (
              <div className="performance-note" role="status">
                All three speeds are zero. Drift uses an even pace so the pass remains playable.
              </div>
            ) : null}
          </>
        ) : null}
        <Segmented
          label="Loop"
          value={repeat.mode}
          options={[
            { value: "off", label: "Off" },
            { value: "body", label: "Body" },
            { value: "full-scene", label: "Full scene" },
          ]}
          onChange={(mode) => commitPerformance({
            ...performance,
            repeat: mode === "off"
              ? { mode: "off" }
              : {
                  mode,
                  count: repeat.mode === "off"
                    ? 2
                    : repeat.count,
                },
          })}
        />
        {repeat.mode !== "off" ? (
          <RangeField
            label={repeat.mode === "body" ? "Body plays" : "Scene plays"}
            value={repeat.count}
            min={2}
            max={MAX_REPEAT_COUNT}
            step={1}
            hint={repeat.mode === "body"
              ? "Opening and ending play once; only the carousel body repeats."
              : "Opening, carousel, and ending repeat together as one complete scene."}
            onChange={(count) => commitPerformance({
              ...performance,
              repeat: { ...repeat, count },
            })}
          />
        ) : null}
      </InspectorGroup>

      <InspectorGroup title="Output" eyebrow={`${settings.output.width} × ${settings.output.height}`} open>
        <RangeField
          label="Duration"
          value={performanceTimeline.totalDuration}
          min={outputDurationMinimum}
          max={MAX_OUTPUT_DURATION}
          step={0.01}
          decimals={2}
          unit=" s"
          hint={outputDurationMinimum > MIN_OUTPUT_DURATION
            ? `This repeat pattern needs at least ${outputDurationMinimum.toFixed(1)} seconds.`
            : "Adjusts the carousel body while preserving your opening, ending, and loop pattern."}
          onChange={(duration) => commitPerformance(performance, duration)}
        />
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
          <button type="button" onClick={onExportProject} disabled={exporting || !projectFilesEnabled}>Save portable project</button>
          <button type="button" onClick={onImportProject} disabled={exporting || !projectFilesEnabled}>Open project</button>
          {!projectFilesEnabled ? <p className="development-boundary">V2 Dev keeps real .pitched projects in Drift.</p> : null}
        </div>
      </InspectorGroup>
    </aside>
  );
}
