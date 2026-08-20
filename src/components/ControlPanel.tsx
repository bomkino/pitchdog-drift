import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  BACKGROUND_SCENES,
  activeBackgroundSceneId,
  applyBackgroundScene,
  getBackgroundScene,
  recutBackgroundSeed,
  type BackgroundSceneId,
} from "../backgrounds";
import {
  EMPTY_DIRECTOR_HISTORY,
  applyDirectorLook,
  captureDirectorLook,
  recordDirectorChange,
  redoDirectorChange,
  settingsChangeSignature,
  settingsEqual,
  undoDirectorChange,
  type DirectorHistory,
  type DirectorLook,
} from "../lib/directorSession";
import type { StudioSettings, ThemeId } from "../model";
import {
  OPTICS_PRESETS,
  activeOpticsPresetId,
  applyOpticsPreset,
  getOpticsPreset,
  type OpticsPresetId,
} from "../optics";
import { buildDeliveryReceipt } from "../preflight";
import { THEMES } from "../themes";
import {
  WORKFLOW_PRESETS,
  applyWorkflowPreset,
} from "../workflows";
import { ColorField, InspectorGroup, NumberField, RangeField, Segmented, SelectField, SwitchField } from "./controls";

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
  const historyRef = useRef<DirectorHistory>({ ...EMPTY_DIRECTOR_HISTORY });
  const previousSettingsRef = useRef(settings);
  const expectedSettingsRef = useRef<StudioSettings | null>(null);
  const expectedExternalRef = useRef(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [lookA, setLookA] = useState<DirectorLook | null>(null);
  const [lookB, setLookB] = useState<DirectorLook | null>(null);

  const bumpHistory = useCallback(() => setHistoryRevision((value) => value + 1), []);

  useEffect(() => {
    if (previousSettingsRef.current === settings) return;
    if (expectedSettingsRef.current === settings) {
      expectedSettingsRef.current = null;
    } else if (expectedExternalRef.current) {
      expectedExternalRef.current = false;
    } else {
      historyRef.current = { ...EMPTY_DIRECTOR_HISTORY };
      bumpHistory();
    }
    previousSettingsRef.current = settings;
  }, [bumpHistory, settings]);

  const commit = useCallback((next: StudioSettings, signature?: string) => {
    if (settingsEqual(settings, next)) return;
    historyRef.current = recordDirectorChange(
      historyRef.current,
      settings,
      signature ?? settingsChangeSignature(settings, next),
      performance.now(),
    );
    expectedSettingsRef.current = next;
    onSettings(next);
    bumpHistory();
  }, [bumpHistory, onSettings, settings]);

  const commitExternal = useCallback((signature: string, action: () => void) => {
    historyRef.current = recordDirectorChange(
      historyRef.current,
      settings,
      signature,
      performance.now(),
      { coalesceWindowMs: 0 },
    );
    expectedExternalRef.current = true;
    action();
    bumpHistory();
  }, [bumpHistory, settings]);

  const undo = useCallback(() => {
    const result = undoDirectorChange(historyRef.current, settings);
    if (!result.settings) return;
    historyRef.current = result.history;
    expectedSettingsRef.current = result.settings;
    onSettings(result.settings);
    bumpHistory();
  }, [bumpHistory, onSettings, settings]);

  const redo = useCallback(() => {
    const result = redoDirectorChange(historyRef.current, settings);
    if (!result.settings) return;
    historyRef.current = result.history;
    expectedSettingsRef.current = result.settings;
    onSettings(result.settings);
    bumpHistory();
  }, [bumpHistory, onSettings, settings]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (exporting || !(event.metaKey || event.ctrlKey)) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input:not([type="range"]), textarea, [contenteditable=true]')) return;
      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (key === "z") {
        event.preventDefault();
        undo();
      } else if (key === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exporting, redo, undo]);

  const patch = <K extends keyof StudioSettings>(key: K, values: Partial<StudioSettings[K]>) => {
    const next = {
      ...settings,
      [key]: { ...(settings[key] as object), ...values },
    } as StudioSettings;
    commit(next, `${String(key)}.${Object.keys(values).sort().join("+")}`);
  };

  const setStagePreset = (width: number, height: number) => {
    commit({
      ...settings,
      stage: { ...settings.stage, width, height },
      output: { ...settings.output, width, height },
    }, "stage-output.dimensions");
  };

  const stageLabel = `${settings.stage.width}:${settings.stage.height}`;
  const backgroundSceneId = activeBackgroundSceneId(settings.background);
  const backgroundScene = backgroundSceneId ? getBackgroundScene(backgroundSceneId) : null;
  const opticsPresetId = activeOpticsPresetId(settings);
  const opticsPreset = opticsPresetId ? getOpticsPreset(opticsPresetId) : null;
  const delivery = buildDeliveryReceipt(settings);
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;
  void historyRevision;

  return (
    <aside className="inspector" aria-label="Director controls" aria-busy={exporting} inert={exporting}>
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">DIRECTOR</span>
          <h2>Shape the feeling.</h2>
        </div>
        <div className="director-history" aria-label="Director history">
          <button type="button" disabled={exporting || !canUndo} onClick={undo} aria-label="Undo director change" title="Undo · ⌘Z">↶</button>
          <button type="button" disabled={exporting || !canRedo} onClick={redo} aria-label="Redo director change" title="Redo · ⇧⌘Z">↷</button>
          <span className="local-badge">LOCAL</span>
        </div>
      </div>

      <section className="workflow-section" aria-labelledby="workflows-title">
        <div className="section-heading-row">
          <h3 id="workflows-title">Start a cut</h3>
          <span>{WORKFLOW_PRESETS.length}</span>
        </div>
        <div className="workflow-grid">
          {WORKFLOW_PRESETS.map((preset) => (
            <button
              type="button"
              className="workflow-card"
              key={preset.id}
              disabled={exporting}
              onClick={() => commit(applyWorkflowPreset(settings, preset), `workflow.${preset.id}`)}
              title={preset.description}
            >
              <span>{preset.eyebrow}</span>
              <strong>{preset.name}</strong>
              <small>{preset.description}</small>
            </button>
          ))}
        </div>
        <div className="look-memory" aria-label="A B look memory">
          <div>
            <span>LOOK A</span>
            <button type="button" disabled={exporting} onClick={() => setLookA(captureDirectorLook(settings))}>{lookA ? "Update" : "Store"}</button>
            <button type="button" disabled={exporting || !lookA} onClick={() => lookA && commit(applyDirectorLook(settings, lookA), "look.A")}>Recall</button>
          </div>
          <div>
            <span>LOOK B</span>
            <button type="button" disabled={exporting} onClick={() => setLookB(captureDirectorLook(settings))}>{lookB ? "Update" : "Store"}</button>
            <button type="button" disabled={exporting || !lookB} onClick={() => lookB && commit(applyDirectorLook(settings, lookB), "look.B")}>Recall</button>
          </div>
        </div>
        <p className="workflow-note">Starting cuts are coherent defaults, not locks. Undo them, bend them, or store two competing looks before choosing.</p>
      </section>

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
              onClick={() => commitExternal(`theme.${theme.id}`, () => onTheme(theme.id))}
              aria-pressed={settings.themeId === theme.id}
              title={theme.description}
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

      <InspectorGroup
        title="Motion"
        eyebrow={settings.motion.seamless
          ? `${settings.motion.seamlessLoops}× complete loop`
          : `${settings.motion.speed.toFixed(2)} slides/s`}
        open
      >
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
        <SwitchField label="Autoplay" checked={settings.motion.autoplay} hint="Drag, wheel, arrows, and pause remain available." onChange={(autoplay) => patch("motion", { autoplay })} />
        {settings.motion.seamless ? (
          <div className="output-spec cadence-receipt" role="note">
            <span>MASTER CADENCE</span>
            <strong>Duration × source slides × loops</strong>
            <small>Preview and export now use the same derived pace. Invisible render-padding copies never count as authored slides. Switch to free-run timing to direct speed manually.</small>
          </div>
        ) : (
          <RangeField label="Speed" value={settings.motion.speed} min={0} max={1.5} step={0.01} decimals={2} unit="×" onChange={(speed) => patch("motion", { speed })} />
        )}
        <RangeField label="Curve" value={settings.motion.curvature * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("motion", { curvature: value / 100 })} />
        <RangeField label="Depth" value={settings.motion.depth * 100} min={0} max={80} step={1} unit="%" onChange={(value) => patch("motion", { depth: value / 100 })} />
        <RangeField label="Tilt" value={settings.motion.tilt} min={0} max={18} step={0.5} decimals={1} unit="°" onChange={(tilt) => patch("motion", { tilt })} />
        <RangeField label="Drag weight" value={settings.motion.dragSensitivity} min={0} max={4} step={0.05} decimals={2} unit="×" hint="Pointer and wheel response only; export timing stays deterministic." onChange={(dragSensitivity) => patch("motion", { dragSensitivity })} />
        <SwitchField label="Seamless export lock" checked={settings.motion.seamless} hint="Closes on complete source-slide cycles. Preview and master use the same cadence." onChange={(seamless) => patch("motion", { seamless })} />
        {settings.motion.seamless ? <RangeField label="Complete cycles per master" value={settings.motion.seamlessLoops} min={1} max={6} step={1} onChange={(seamlessLoops) => patch("motion", { seamlessLoops })} /> : null}
        <SwitchField label="Reduced-motion master" checked={settings.motion.reducedMotionOutput} hint="Independent from your OS preview preference." onChange={(reducedMotionOutput) => patch("motion", { reducedMotionOutput })} />
      </InspectorGroup>

      <InspectorGroup title="Optics" eyebrow={opticsPreset?.name ?? "CUSTOM"} open>
        <SelectField<string>
          label="Lens character"
          value={opticsPresetId ?? "custom"}
          options={[
            { value: "custom", label: "Custom" },
            ...OPTICS_PRESETS.map((preset) => ({ value: preset.id, label: `${preset.name} · ${preset.eyebrow}` })),
          ]}
          onChange={(value) => {
            if (value === "custom") return;
            commit(applyOpticsPreset(settings, getOpticsPreset(value as OpticsPresetId)), `optics.${value}`);
          }}
        />
        {opticsPreset ? (
          <div className="output-spec">
            <span>{opticsPreset.eyebrow}</span>
            <strong>{opticsPreset.name}</strong>
            <small>{opticsPreset.description}</small>
          </div>
        ) : null}
        <RangeField
          label="Lens energy"
          value={settings.motion.distortion * 100}
          min={0}
          max={100}
          step={1}
          unit="%"
          hint="One bounded optical system: geometric bend, velocity blur, and chromatic fringe. At rest, the focal slide returns crisp."
          onChange={(value) => patch("motion", { distortion: value / 100 })}
        />
        <RangeField
          label="Peripheral softness"
          value={settings.motion.edgeFade * 100}
          min={0}
          max={100}
          step={1}
          unit="%"
          hint="Fades and softly defocuses frames away from the visual centre."
          onChange={(value) => patch("motion", { edgeFade: value / 100 })}
        />
        <RangeField label="Focus lift" value={settings.motion.focusScale * 100} min={0} max={24} step={1} unit="%" onChange={(value) => patch("motion", { focusScale: value / 100 })} />
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
        <RangeField label="Shadow softness" value={settings.slide.shadowSoftness} min={4} max={96} step={1} unit=" px" onChange={(shadowSoftness) => patch("slide", { shadowSoftness })} />
      </InspectorGroup>

      <InspectorGroup title="Atmosphere" eyebrow={backgroundScene?.name ?? "CUSTOM"}>
        <SelectField<string>
          label="Authored scene"
          value={backgroundSceneId ?? "custom"}
          options={[
            { value: "custom", label: "Custom" },
            ...BACKGROUND_SCENES.map((scene) => ({ value: scene.id, label: `${scene.name} · ${scene.eyebrow}` })),
          ]}
          onChange={(value) => {
            if (value === "custom") return;
            commit(applyBackgroundScene(settings, getBackgroundScene(value as BackgroundSceneId)), `atmosphere.${value}`);
          }}
        />
        {backgroundScene ? (
          <div className="output-spec">
            <span>{backgroundScene.eyebrow}</span>
            <strong>{backgroundScene.name}</strong>
            <small>{backgroundScene.description}</small>
          </div>
        ) : null}
        <div className="project-actions">
          <button type="button" onClick={() => patch("background", { seed: recutBackgroundSeed(settings.background.seed) })}>
            Recut atmosphere
          </button>
        </div>
        <SelectField
          label="Background"
          value={settings.background.style}
          options={[
            { value: "transparent", label: "Transparent" },
            { value: "solid", label: "Solid chamber" },
            { value: "gradient", label: "Horizon field" },
            { value: "aura", label: "Light and fog" },
            { value: "paper", label: "Photochemical surface" },
            { value: "void", label: "Dark phenomena" },
          ]}
          onChange={(style) => commit({ ...settings, stage: { ...settings.stage, transparent: style === "transparent" }, background: { ...settings.background, style } }, "background.style")}
        />
        <ColorField label="Ground" value={settings.background.colorA} onChange={(colorA) => patch("background", { colorA })} />
        <ColorField label="Field" value={settings.background.colorB} onChange={(colorB) => patch("background", { colorB })} />
        <ColorField label="Light" value={settings.background.accent} onChange={(accent) => patch("background", { accent })} />
        <RangeField label="Intensity" value={settings.background.intensity * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("background", { intensity: value / 100 })} />
        <RangeField label="Background breath" value={settings.background.motion * 100} min={0} max={100} step={1} unit="%" hint="Slow phase only. Export loops still close exactly." onChange={(value) => patch("background", { motion: value / 100 })} />
        <RangeField label="Grain" value={settings.background.grain * 100} min={0} max={60} step={1} unit="%" hint="The slide surface keeps its own much finer, fixed-strength texture." onChange={(value) => patch("background", { grain: value / 100 })} />
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
        <div className="output-shortcuts" aria-label="Timeline closure">
          <button type="button" data-active={settings.motion.seamless && settings.motion.seamlessLoops === 1} onClick={() => patch("motion", { seamless: true, seamlessLoops: 1 })}>One complete loop</button>
          <button type="button" data-active={!settings.motion.seamless} onClick={() => patch("motion", { seamless: false })}>Free-run timing</button>
        </div>
        <div className="output-spec">
          <span>MASTER</span>
          <strong>H.264 · SDR sRGB · {delivery.frameCount} frames</strong>
          <small>{(settings.output.videoBitrate / 1_000_000).toFixed(0)} Mbit/s · AAC 48 kHz at 24–30 fps · mute presenter audio for 50/60 fps</small>
        </div>
        <div className="delivery-checks" aria-label="Delivery preflight">
          {delivery.checks.map((check) => (
            <div key={check.id} data-level={check.level}>
              <span aria-hidden="true" />
              <strong>{check.label}</strong>
              <small>{check.detail}</small>
            </div>
          ))}
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
