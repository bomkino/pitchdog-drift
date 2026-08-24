import { useMemo, useState, type CSSProperties } from "react";
import {
  BACKGROUND_COMPOSITIONS,
  BACKGROUND_FAMILY_LABELS,
  BACKGROUND_PALETTES,
  BACKGROUND_STUDIES,
  applyBackgroundStudy,
  backgroundCompositionIndex,
  backgroundVariation,
  matchingBackgroundPalette,
  matchingBackgroundStudy,
  withBackgroundComposition,
  withBackgroundPalette,
  withBackgroundVariation,
  type OpaqueBackgroundStyle,
} from "../backgrounds";
import type {
  DriftProjectV4,
  MotionCharacterId,
  PoseCadence,
} from "../core/project/schema";
import {
  EDITORIAL_CUTS,
  HANDCRAFTED_MOTION_PRESETS,
  MOTION_CHARACTERS,
  PERFORMANCE_RECIPES,
  applyEditorialCut,
  applyHandcraftedMotionPreset,
  applyMotionCharacter,
  applyPerformanceRecipe,
  detectEditorialCut,
  detectPerformanceRecipe,
} from "../core/recipes/motion";
import {
  FINISH_RECIPES,
  MATERIAL_RECIPES,
  applyFinishRecipe,
  applyMaterialRecipe,
  detectFinishRecipe,
  detectMaterialRecipe,
} from "../core/recipes/material";
import {
  LIGHTING_RECIPES,
  applyLightingRecipe,
  detectLightingRecipe,
} from "../core/recipes/lighting";
import {
  LENS_RECIPES,
  applyLensRecipe,
  detectLensRecipe,
} from "../core/recipes/lens";
import { PATH_RECIPES, applyPathRecipe } from "../core/spatial/spatial";
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
import {
  WORLD_RATIO_DIMENSIONS,
  worldRatioForDimensions,
  type WorldRatioId,
} from "../core/worlds";
import {
  AUTHORED_WORLDS,
  applyAuthoredWorld,
  currentAuthoredWorld,
  currentPublicVariant,
} from "../core/worlds/authoredWorlds";
import type { PublicWorldVariant, WorldId } from "../core/worlds/worldRegistry";
import type { TactileRuntimeState } from "../sonic/tactileSound";
import { THEMES } from "../themes";
import { ColorField, InspectorGroup, NumberField, RangeField, RangeNumberField, Segmented, SelectField, SwitchField } from "./controls";
import { BackgroundBrowser, BackgroundStudyPreview } from "./BackgroundBrowser";
import type { SlideHealth } from "../core/media/slideHealth";
import { resolveMovingMedia } from "../core/project/movingMedia";
import {
  applyTimingResolution,
  readTimingIntent,
  resolveProjectTiming,
  withTimingIntent,
  type TimingIntent,
  type TimingMode,
} from "../core/timeline/timingIntent";
import { buildDeliveryReceipt } from "../core/timeline/deliveryReceipt";
import { evaluateV2Frame } from "../core/timeline/evaluateV2Frame";
import {
  PLATFORM_GUIDE_PROFILE_ORDER,
  getPlatformGuideProfile,
  type NormalizedInsets,
  type PlatformGuideProfile,
  type PlatformGuideProfileId,
} from "../core/platformGuides";
import { evaluatePreflight, type GuideOverlapFact } from "../core/preflight";
import type { ExportCapabilityReport } from "../lib/exportStudio";

const MIN_OUTPUT_DURATION = 0.5;
const MAX_OUTPUT_DURATION = 300;
const MIN_BODY_DURATION = 0.25;
const MAX_TRANSITION_DURATION = 6;
const MAX_REPEAT_COUNT = 12;

type TempoSelection = TempoCurvePresetId | "custom";
export type StudioWorkspace = "slides" | "world" | "direct" | "master";

const WORKSPACE_COPY: Readonly<Record<StudioWorkspace, { kicker: string; title: string; purpose: string; guide: string }>> = Object.freeze({
  slides: { kicker: "SLIDES", title: "Build the deck.", purpose: "FRAME", guide: "Set slide shape, crop, spacing, and any frame that stays still." },
  world: { kicker: "WORLD", title: "Choose the weather.", purpose: "LOOK", guide: "Start with a complete Film World, then choose or tune its background." },
  direct: { kicker: "DIRECT", title: "Shape the feeling.", purpose: "MOTION", guide: "Set pace, path, rhythm, entry, exit, material, light, lens, and sound." },
  master: { kicker: "MASTER", title: "Finish the film.", purpose: "EXPORT", guide: "Choose format and duration, check safe areas, then export the master." },
});

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
  project: DriftProjectV4;
  v2Active: boolean;
  onSettings: (settings: StudioSettings) => void;
  onV2Project: (project: DriftProjectV4, message: string) => void;
  onUndoV2: () => void;
  onRedoV2: () => void;
  canUndoV2: boolean;
  canRedoV2: boolean;
  onToggleV2Comparison: () => void;
  canCompareV2: boolean;
  comparingV2: boolean;
  changeReceipt: string;
  onAuditionSound: () => void;
  sonicState: TactileRuntimeState;
  onTheme: (id: ThemeId) => void;
  onResetPinnedFrame: () => void;
  pinEditorRequestId: number;
  onExportStill: () => void;
  onExportVideo: () => void;
  onExportFrames: () => void;
  onExportProject: () => void;
  onImportProject: () => void;
  projectFilesEnabled: boolean;
  exporting: boolean;
  workspace: StudioWorkspace;
  onWorkspace: (workspace: StudioWorkspace) => void;
  selectedSlideId: string | null;
  selectedSlideHealth: SlideHealth | null;
  slideHealth: readonly SlideHealth[];
  platformGuideId: PlatformGuideProfileId;
  platformGuide: PlatformGuideProfile;
  guideOverlaps: readonly GuideOverlapFact[];
  customGuideInsets: NormalizedInsets;
  onPlatformGuide: (id: PlatformGuideProfileId) => void;
  onCustomGuideInsets: (insets: NormalizedInsets) => void;
  exportCapabilities: ExportCapabilityReport | null;
  exportSurfaceSupported: boolean;
}

export function ControlPanel({
  settings,
  project,
  v2Active,
  onSettings,
  onV2Project,
  onUndoV2,
  onRedoV2,
  canUndoV2,
  canRedoV2,
  onToggleV2Comparison,
  canCompareV2,
  comparingV2,
  changeReceipt,
  onAuditionSound,
  sonicState,
  onTheme,
  onResetPinnedFrame,
  pinEditorRequestId,
  onExportStill,
  onExportVideo,
  onExportFrames,
  onExportProject,
  onImportProject,
  projectFilesEnabled,
  exporting,
  workspace,
  onWorkspace,
  selectedSlideId,
  selectedSlideHealth,
  slideHealth,
  platformGuideId,
  platformGuide,
  guideOverlaps,
  customGuideInsets,
  onPlatformGuide,
  onCustomGuideInsets,
  exportCapabilities,
  exportSurfaceSupported,
}: ControlPanelProps) {
  const [backgroundQuery, setBackgroundQuery] = useState("");
  const [backgroundFamily, setBackgroundFamily] = useState<"all" | OpaqueBackgroundStyle>("all");
  const [worldLibraryOpen, setWorldLibraryOpen] = useState(false);
  const patch = <K extends keyof StudioSettings>(key: K, values: Partial<StudioSettings[K]>) => {
    onSettings({
      ...settings,
      [key]: { ...(settings[key] as object), ...values },
    } as StudioSettings);
  };
  const directProject = (message: string, mutate: (next: DriftProjectV4) => void) => {
    const next = structuredClone(project);
    mutate(next);
    onV2Project(next, message);
  };
  const commitResolvedTiming = (
    message: string,
    mutate: (next: DriftProjectV4) => void,
    intent?: TimingIntent,
  ) => {
    const next = structuredClone(project);
    mutate(next);
    const nextIntent = intent ?? readTimingIntent(next).intent;
    const resolved = resolveProjectTiming(next, resolveMovingMedia(next).count, nextIntent);
    onV2Project(applyTimingResolution(next, resolved), message);
  };
  const commitPerformance = (
    candidate: PerformanceLifecycleAuthoring,
    requestedTotal?: number,
    reducedMotionOutput = settings.motion.reducedMotionOutput,
  ) => {
    if (v2Active && readTimingIntent(project).intent.mode === "content-paced") {
      commitResolvedTiming("Performance timing changed.", (next) => {
        next.performance = { ...structuredClone(candidate), reducedMotion: reducedMotionOutput };
        next.master.reducedMotion = reducedMotionOutput;
      });
      return;
    }
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
  const stageRatio = worldRatioForDimensions(settings.stage.width, settings.stage.height);
  const normalizedBackgroundQuery = backgroundQuery.trim().toLowerCase();
  const filteredBackgroundStudies = BACKGROUND_STUDIES.filter((study) => (
    (backgroundFamily === "all" || study.family === backgroundFamily)
    && (!normalizedBackgroundQuery || `${study.name} ${study.genre} ${study.description}`.toLowerCase().includes(normalizedBackgroundQuery))
  ));
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
  const opaqueBackground = settings.background.style === "transparent"
    ? null
    : settings.background.style as OpaqueBackgroundStyle;
  const backgroundStudy = opaqueBackground ? matchingBackgroundStudy(settings.background) : null;
  const backgroundPalette = opaqueBackground ? matchingBackgroundPalette(settings.background) : null;
  const backgroundComposition = backgroundCompositionIndex(settings.background.seed);
  const editorialCut = detectEditorialCut(project);
  const performanceRecipe = detectPerformanceRecipe(project);
  const materialRecipe = detectMaterialRecipe(project);
  const finishRecipe = detectFinishRecipe(project);
  const lightingRecipe = detectLightingRecipe(project);
  const lensRecipe = detectLensRecipe(project);
  const handcraftedMotion = HANDCRAFTED_MOTION_PRESETS.find((preset) => (
    preset.cutId === project.motion.cadence.cutId
    && preset.performanceId === project.motion.performance.id
    && preset.characterId === project.motion.character.id
    && preset.poseCadence === project.motion.cadence.poseCadence
  )) ?? null;
  const authoredWorld = currentAuthoredWorld(project);
  const worldVariant = currentPublicVariant(project);
  const worldSceneExtension = project.extensions["dog.pitch.drift.world-scene"];
  const worldSceneId = typeof worldSceneExtension === "object"
    && worldSceneExtension !== null
    && !Array.isArray(worldSceneExtension)
    && typeof worldSceneExtension.sceneId === "string"
    ? worldSceneExtension.sceneId
    : null;
  const worldRecut = typeof worldSceneExtension === "object"
    && worldSceneExtension !== null
    && !Array.isArray(worldSceneExtension)
    && typeof worldSceneExtension.recut === "number"
    ? worldSceneExtension.recut
    : 0;
  const portraitSceneIndex = authoredWorld
    ? Math.max(0, authoredWorld.portraitScenes.findIndex((scene) => scene.id === worldSceneId))
    : 0;
  const workspaceCopy = WORKSPACE_COPY[workspace];
  const selectedSlide = selectedSlideId ? project.media.assets[selectedSlideId] ?? null : null;
  const selectedDirective = selectedSlideId ? project.slides[selectedSlideId] ?? null : null;
  const selectedSlideKey = selectedSlide && selectedDirective ? selectedSlideId : null;
  const movingMedia = useMemo(() => resolveMovingMedia(project), [project]);
  const timingRead = useMemo(() => readTimingIntent(project), [project]);
  const timingResolution = useMemo(
    () => resolveProjectTiming(project, movingMedia.count, timingRead.intent),
    [movingMedia.count, project, timingRead.intent],
  );
  const deliveryReceipt = useMemo(() => {
    const lifecycle = createPerformanceLifecycle(project.performance);
    const eventPlan = evaluateV2Frame(
      project,
      movingMedia.order,
      project.master.duration,
      { previousTime: 0 },
    ).frame.events;
    return buildDeliveryReceipt({
      project,
      movingMediaOrder: movingMedia.order,
      exportSettings: {
        width: project.composition.width,
        height: project.composition.height,
        fps: project.master.fps,
        duration: project.master.duration,
        container: "mp4",
      },
      eventPlan,
      lifecycle,
    });
  }, [movingMedia.order, project]);
  const preflight = useMemo(() => evaluatePreflight({
    receipt: deliveryReceipt,
    slideHealth,
    guideOverlaps,
    capabilities: exportCapabilities,
    exportSurface: exportSurfaceSupported
      ? { supported: true }
      : { supported: false, reason: "The cinematic renderer is not available for this master." },
  }), [deliveryReceipt, exportCapabilities, exportSurfaceSupported, guideOverlaps, slideHealth]);

  return (
    <aside className="inspector" data-workspace={workspace} aria-label={`${workspaceCopy.title} controls`} aria-busy={exporting} inert={exporting}>
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">{workspaceCopy.kicker}</span>
          <h2>{workspaceCopy.title}</h2>
          <p className="workspace-guide">{workspaceCopy.guide}</p>
        </div>
        <span className="local-badge">LOCAL</span>
      </div>

      <nav className="workspace-switcher" aria-label="Director workspaces">
        {(Object.keys(WORKSPACE_COPY) as StudioWorkspace[]).map((id) => (
          <button type="button" key={id} data-purpose={WORKSPACE_COPY[id].purpose} aria-label={WORKSPACE_COPY[id].kicker} aria-current={workspace === id ? "page" : undefined} onClick={() => onWorkspace(id)}>
            {WORKSPACE_COPY[id].kicker}
          </button>
        ))}
      </nav>

      <section className="theme-section" data-workspaces="world" aria-labelledby="themes-title">
        <details className="world-browser" open={worldLibraryOpen} onToggle={(event) => setWorldLibraryOpen(event.currentTarget.open)}>
          <summary id="themes-title">
            <span>
              <strong>{v2Active ? "Film Worlds" : "V1 looks · compatibility"}</strong>
              <small>{v2Active ? "Complete look + motion systems" : "Original Drift looks"}</small>
            </span>
            <em>{authoredWorld?.name ?? (v2Active ? "Browse 8" : "Browse 6")}</em>
          </summary>
          <div className="world-browser-body">
            <div className="theme-grid">
          {v2Active ? AUTHORED_WORLDS.map((world) => {
            const study = BACKGROUND_STUDIES.find((entry) => entry.id === world.backgroundStudyId);
            return (
              <button
                type="button"
                className="theme-card theme-card-world"
                data-active={authoredWorld?.id === world.id}
                key={world.id}
                onClick={() => directProject(`${world.name} · ${worldVariant} applied.`, (next) => {
                  applyAuthoredWorld(
                    next,
                    world.id,
                    worldVariant,
                    stageRatio ?? (settings.stage.width < settings.stage.height ? "9:16" : "16:9"),
                    0,
                    0,
                  );
                })}
                aria-label={`Film World: ${world.name}. ${world.eyebrow}. ${world.portraitScenes[0].description}`}
                aria-pressed={authoredWorld?.id === world.id}
                style={{ "--theme-a": study?.background.colorA ?? "#080808", "--theme-b": study?.background.accent ?? "#dddddd" } as CSSProperties}
              >
                {study ? <BackgroundStudyPreview study={study} className="theme-world-preview" /> : <span className="theme-swatch" aria-hidden="true" />}
                <span>
                  <strong>{world.name}</strong>
                  <small>{world.eyebrow}</small>
                  <em>{world.portraitScenes[0].description}</em>
                </span>
              </button>
            );
          }) : THEMES.map((theme) => (
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
            {v2Active ? (
          <div className="direction-history" aria-label="Direction history and comparison">
            <button type="button" onClick={onUndoV2} disabled={!canUndoV2} aria-label="Undo direction">Undo</button>
            <button type="button" onClick={onRedoV2} disabled={!canRedoV2} aria-label="Redo direction">Redo</button>
            <button
              type="button"
              data-active={comparingV2}
              onClick={onToggleV2Comparison}
              disabled={!canCompareV2}
              aria-pressed={comparingV2}
            >{comparingV2 ? "Before" : "A/B"}</button>
            <small>{comparingV2 ? "Previewing the prior direction; saved state is untouched." : changeReceipt}</small>
          </div>
            ) : null}
            {v2Active && authoredWorld ? (
          <div className="world-director-strip">
            <Segmented
              label="Pressure"
              value={worldVariant}
              options={[
                { value: "restrained" as PublicWorldVariant, label: "Restrained" },
                { value: "directed" as PublicWorldVariant, label: "Directed" },
                { value: "fever" as PublicWorldVariant, label: "Fever" },
              ]}
              onChange={(variant) => directProject(`${authoredWorld.name} pressure set to ${variant}.`, (next) => {
                applyAuthoredWorld(
                  next,
                  authoredWorld.id as WorldId,
                  variant,
                  stageRatio ?? (settings.stage.width < settings.stage.height ? "9:16" : "16:9"),
                  portraitSceneIndex,
                  worldRecut,
                );
              })}
            />
            {stageRatio === "9:16" || stageRatio === "4:5" ? (
              <SelectField
                label="Portrait scene"
                value={authoredWorld.portraitScenes[portraitSceneIndex]!.id}
                options={authoredWorld.portraitScenes.map((scene) => ({ value: scene.id, label: scene.name }))}
                onChange={(sceneId) => {
                  const sceneIndex = authoredWorld.portraitScenes.findIndex((scene) => scene.id === sceneId);
                  directProject(`${authoredWorld.portraitScenes[sceneIndex]?.name ?? "Portrait scene"} applied.`, (next) => {
                    applyAuthoredWorld(next, authoredWorld.id, worldVariant, stageRatio, sceneIndex, worldRecut);
                  });
                }}
              />
            ) : null}
            <div className="pin-reset-control">
              <button type="button" onClick={() => directProject(`${authoredWorld.name} recut.`, (next) => {
                applyAuthoredWorld(
                  next,
                  authoredWorld.id,
                  worldVariant,
                  stageRatio ?? (settings.stage.width < settings.stage.height ? "9:16" : "16:9"),
                  portraitSceneIndex,
                  worldRecut + 1,
                );
              })}>Recut World</button>
              <small>Take {worldRecut + 1} · deterministic atmosphere and material imperfection.</small>
            </div>
          </div>
            ) : null}
          </div>
        </details>
      </section>

      <InspectorGroup title="Master frame" eyebrow={stageLabel} description="Choose the finished canvas shape. Slide shape can stay different." workspaces="master" open>
        <Segmented<WorldRatioId | "custom">
          label="Stage ratio"
          value={stageRatio ?? "custom"}
          options={[
            { value: "9:16" as const, label: "9:16" },
            { value: "4:5" as const, label: "4:5" },
            { value: "1:1" as const, label: "1:1" },
            { value: "16:9" as const, label: "16:9" },
          ]}
          onChange={(ratio) => {
            if (ratio === "custom") return;
            const { width, height } = WORLD_RATIO_DIMENSIONS[ratio];
            setStagePreset(width, height);
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
      </InspectorGroup>

      <InspectorGroup title="Platform guides" eyebrow={platformGuide.label} description="Preview Story and Reel obstructions. Guides never enter exported pixels." workspaces="master" open>
        <SelectField
          label="Preview overlay"
          value={platformGuideId}
          options={PLATFORM_GUIDE_PROFILE_ORDER.map((id) => ({ value: id, label: getPlatformGuideProfile(id).label }))}
          onChange={onPlatformGuide}
        />
        {platformGuideId === "custom" ? (
          <>
            {(["top", "right", "bottom", "left"] as const).map((edge) => (
              <RangeField
                key={edge}
                label={`${edge[0]!.toUpperCase()}${edge.slice(1)} obstruction`}
                value={customGuideInsets[edge] * 100}
                min={0}
                max={45}
                step={1}
                unit="%"
                onChange={(value) => {
                  const next = { ...customGuideInsets, [edge]: value / 100 };
                  if (next.top + next.bottom > 1 || next.left + next.right > 1) return;
                  onCustomGuideInsets(next);
                }}
              />
            ))}
          </>
        ) : null}
        {platformGuideId !== "none" ? (
          <div className="guide-source-note" data-status={platformGuide.status}>
            <span>{platformGuide.status.replace("-", " ")} · checked {platformGuide.lastVerified}</span>
            <small>{platformGuide.aspect !== null && Math.abs(settings.stage.width / settings.stage.height - platformGuide.aspect) > 0.01 ? "This guide is authored for 9:16; the current master uses a different ratio." : "Preview only. Guides never enter rendered pixels."}</small>
          </div>
        ) : <p className="performance-note">Off by default. Turn on Story, Reel, combined, or custom safe-area chrome when mastering.</p>}
      </InspectorGroup>

      <InspectorGroup title="Slide frame" eyebrow={`${settings.slide.aspectWidth}:${settings.slide.aspectHeight}`} description="Sets shape, size, and spacing shared by every slide." workspaces="slides" open>
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
        <RangeNumberField label="Slide size" value={settings.slide.scale * 100} softMin={10} softMax={160} hardMin={10} hardMax={160} step={1} unit="%" onChange={(value) => patch("slide", { scale: value / 100 })} />
        <RangeNumberField label="Spacing" value={settings.motion.gap * 100} softMin={0} softMax={250} hardMin={0} hardMax={250} step={1} unit="%" onChange={(value) => patch("motion", { gap: value / 100 })} />
      </InspectorGroup>

      {v2Active ? (
        <InspectorGroup title="Selected slide" eyebrow={selectedSlide?.name ?? "Choose in Media"} description="Override crop and scale for this source only." workspaces="slides" open>
          {selectedSlide && selectedDirective && selectedSlideKey ? (
            <>
              <div className="slide-health" data-severity={selectedSlideHealth?.severity ?? "healthy"} role="status">
                <span>{selectedSlideHealth?.severity === "healthy" ? "SOURCE READY" : selectedSlideHealth?.severity.toUpperCase()}</span>
                <strong>{selectedSlide.width} × {selectedSlide.height} px</strong>
                {selectedSlideHealth?.issues.length ? (
                  <ul>{selectedSlideHealth.issues.map((issue) => <li key={issue.id}>{issue.message}</li>)}</ul>
                ) : <small>No metadata warnings. Content quality remains your judgment.</small>}
              </div>
              <Segmented
                label="Fit"
                value={selectedDirective.fit}
                options={[{ value: "cover", label: "Cover" }, { value: "contain", label: "Contain" }]}
                onChange={(fit) => directProject("Selected slide fit changed.", (next) => { next.slides[selectedSlideKey]!.fit = fit; })}
              />
              {selectedDirective.fit === "cover" ? (
                <>
                  <RangeField label="Focal X" value={selectedDirective.focalX * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Selected slide focal point changed.", (next) => { next.slides[selectedSlideKey]!.focalX = value / 100; })} />
                  <RangeField label="Focal Y" value={selectedDirective.focalY * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Selected slide focal point changed.", (next) => { next.slides[selectedSlideKey]!.focalY = value / 100; })} />
                </>
              ) : null}
              <RangeField label="Scale offset" value={selectedDirective.scaleOffset * 100} min={-75} max={75} step={1} unit="%" onChange={(value) => directProject("Selected slide scale changed.", (next) => { next.slides[selectedSlideKey]!.scaleOffset = value / 100; })} />
              <div className="pin-reset-control">
                <button type="button" onClick={() => directProject("Selected slide direction reset.", (next) => {
                  next.slides[selectedSlideKey] = {
                    assetId: selectedSlideKey,
                    fit: next.card.defaultFit,
                    focalX: 0.5,
                    focalY: 0.5,
                    scaleOffset: 0,
                  };
                })}>Reset selected slide</button>
                <small>Returns this slide to the global fit, centred crop, and original scale.</small>
              </div>
            </>
          ) : <p className="empty-inspector-state">Choose a slide in Media to direct its crop and scale.</p>}
        </InspectorGroup>
      ) : null}

      {v2Active ? (
        <InspectorGroup title="Editorial rhythm" eyebrow={performanceRecipe?.name ?? "Custom"} description="Start with a complete movement direction, then tune individual beats." workspaces="direct" open>
          <SelectField
            label="Handcrafted direction"
            value={handcraftedMotion?.id ?? "custom"}
            options={[
              { value: "custom", label: "Custom stack" },
              ...HANDCRAFTED_MOTION_PRESETS.map((preset) => ({ value: preset.id, label: preset.name })),
            ]}
            onChange={(presetId) => {
              if (presetId === "custom") return;
              directProject(
                `${HANDCRAFTED_MOTION_PRESETS.find((entry) => entry.id === presetId)?.name ?? "Motion direction"} applied.`,
                (next) => { applyHandcraftedMotionPreset(next, presetId); },
              );
            }}
          />
          <SelectField
            label="Editorial cut"
            value={editorialCut?.id ?? "custom"}
            options={[
              { value: "custom", label: "Custom cadence" },
              ...EDITORIAL_CUTS.map((cut) => ({ value: cut.id, label: cut.name })),
            ]}
            onChange={(cutId) => {
              if (cutId === "custom") return;
              const cut = EDITORIAL_CUTS.find((entry) => entry.id === cutId);
              directProject(`${cut?.name ?? "Editorial cut"} applied.`, (next) => { applyEditorialCut(next, cutId); });
            }}
          />
          <SelectField
            label="Performance"
            value={performanceRecipe?.id ?? "custom"}
            options={[
              { value: "custom", label: "Custom performance" },
              ...PERFORMANCE_RECIPES.map((recipe) => ({ value: recipe.id, label: recipe.name })),
            ]}
            onChange={(performanceId) => {
              if (performanceId === "custom") return;
              const recipe = PERFORMANCE_RECIPES.find((entry) => entry.id === performanceId);
              directProject(`${recipe?.name ?? "Performance"} applied.`, (next) => { applyPerformanceRecipe(next, performanceId); });
            }}
          />
          <Segmented
            label="Motion character"
            value={project.motion.character.id}
            options={MOTION_CHARACTERS.map((character) => ({ value: character.id, label: character.name }))}
            onChange={(characterId: MotionCharacterId) => {
              const character = MOTION_CHARACTERS.find((entry) => entry.id === characterId);
              directProject(`${character?.name ?? "Motion character"} applied.`, (next) => { applyMotionCharacter(next, characterId); });
            }}
          />
          <Segmented
            label="Pose cadence"
            value={project.motion.cadence.poseCadence}
            options={[
              { value: "continuous" as PoseCadence, label: "Fluid" },
              { value: "24fps" as PoseCadence, label: "24" },
              { value: "18fps" as PoseCadence, label: "18" },
              { value: "12fps" as PoseCadence, label: "12" },
            ]}
            onChange={(poseCadence) => directProject(
              `Pose cadence set to ${poseCadence === "continuous" ? "fluid" : poseCadence}.`,
              (next) => { next.motion.cadence.poseCadence = poseCadence; },
            )}
          />
          <RangeField label="Read" value={project.motion.cadence.read * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Read beat directed.", (next) => { next.motion.cadence.read = value / 100; next.motion.cadence.cutId = "custom"; })} />
          <RangeField label="Anticipate" value={project.motion.cadence.anticipation * 100} min={0} max={50} step={1} unit="%" onChange={(value) => directProject("Anticipation directed.", (next) => { next.motion.cadence.anticipation = value / 100; next.motion.cadence.cutId = "custom"; })} />
          <RangeField label="Carry" value={project.motion.cadence.carry * 100} min={1} max={100} step={1} unit="%" onChange={(value) => directProject("Carry beat directed.", (next) => { next.motion.cadence.carry = value / 100; next.motion.cadence.cutId = "custom"; })} />
          <RangeField label="Impact" value={project.motion.cadence.impact * 100} min={0} max={50} step={1} unit="%" onChange={(value) => directProject("Impact directed.", (next) => { next.motion.cadence.impact = value / 100; next.motion.cadence.cutId = "custom"; })} />
          <RangeField label="Settle" value={project.motion.cadence.settle * 100} min={0} max={50} step={1} unit="%" onChange={(value) => directProject("Settle directed.", (next) => { next.motion.cadence.settle = value / 100; next.motion.cadence.cutId = "custom"; })} />
          <RangeField label="Land" value={project.motion.cadence.land * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Landing beat directed.", (next) => { next.motion.cadence.land = value / 100; next.motion.cadence.cutId = "custom"; })} />
        </InspectorGroup>
      ) : null}

      {v2Active ? (
        <InspectorGroup
          title="Timeline intent"
          eyebrow={timingRead.intent.mode === "fixed-master" ? `${timingResolution.masterSeconds.toFixed(2)} s exact` : `${timingRead.intent.secondsPerSlide.toFixed(2)} s / slide`}
          description="Choose what owns timing: an exact runtime or reading time per slide."
          workspaces="direct"
          open
        >
          <Segmented<TimingMode>
            label="Timing authority"
            value={timingRead.intent.mode}
            options={[
              { value: "fixed-master", label: "Exact length" },
              { value: "content-paced", label: "Reading pace" },
            ]}
            onChange={(mode) => {
              const intent: TimingIntent = { ...timingRead.intent, mode };
              commitResolvedTiming(
                mode === "fixed-master" ? "Exact master length now owns timing." : "Reading pace now owns timing.",
                (next) => { Object.assign(next, withTimingIntent(next, intent)); },
                intent,
              );
            }}
          />
          {timingRead.intent.mode === "content-paced" ? (
            <RangeNumberField
              label="Reading pace"
              value={timingRead.intent.secondsPerSlide}
              softMin={0.2}
              softMax={3}
              hardMin={0.05}
              hardMax={10}
              step={0.05}
              decimals={2}
              unit=" s/slide"
              hint="Drift counts moving slides and deck passes, then derives a finite master length."
              onChange={(secondsPerSlide) => {
                const intent: TimingIntent = { ...timingRead.intent, secondsPerSlide };
                commitResolvedTiming("Reading pace changed.", (next) => { Object.assign(next, withTimingIntent(next, intent)); }, intent);
              }}
            />
          ) : null}
          <RangeNumberField
            label="Deck passes"
            value={project.motion.seamless.loops}
            softMin={1}
            softMax={12}
            hardMin={1}
            hardMax={100}
            step={1}
            hint="One pass shows every moving slide once. Export remains finite."
            onChange={(loops) => commitResolvedTiming("Deck-pass count changed.", (next) => {
              next.motion.seamless.enabled = true;
              next.motion.seamless.loops = loops;
            })}
          />
          <div className="timing-summary" role="status">
            <span>{movingMedia.count} MOVING · {deliveryReceipt.passes.totalDeckPasses} PASS{deliveryReceipt.passes.totalDeckPasses === 1 ? "" : "ES"}</span>
            <strong>{timingResolution.masterSeconds.toFixed(2)} s master</strong>
            <small>{timingResolution.averageSlidesPerSecond.toFixed(2)} slides/s average · {deliveryReceipt.pace.approximateAverageReadWindowSeconds?.toFixed(2) ?? "—"} s mechanical read window</small>
            {deliveryReceipt.passes.boundaries.length ? (
              <ol>
                {deliveryReceipt.passes.boundaries.slice(0, 6).map((boundary) => (
                  <li key={boundary.index}>Pass {boundary.index + 1}<span>{boundary.start.toFixed(2)}–{boundary.end.toFixed(2)} s · {boundary.duration.toFixed(2)} s</span></li>
                ))}
                {deliveryReceipt.passes.boundaries.length > 6 ? <li>+ {deliveryReceipt.passes.boundaries.length - 6} more passes</li> : null}
              </ol>
            ) : null}
          </div>
          {timingResolution.repair ? (
            <div className="timing-repair">
              <p>{timingResolution.repair.reason === "no-moving-media" ? "Add at least one moving slide." : `Opening and ending need at least ${timingResolution.minimumMasterSeconds.toFixed(2)} s.`}</p>
              {timingResolution.repair.reason === "master-too-short" ? <button type="button" onClick={() => onV2Project(applyTimingResolution(project, timingResolution), "Master repaired to the minimum legal length.")}>Use {timingResolution.minimumMasterSeconds.toFixed(2)} s minimum</button> : null}
            </div>
          ) : null}
          {!project.motion.seamless.enabled && movingMedia.count > 0 ? (
            <div className="pin-reset-control">
              <button type="button" onClick={() => commitResolvedTiming("Timeline closed at a complete deck pass.", (next) => {
                const bodySeconds = createPerformanceLifecycle(next.performance).bodyCycles.reduce((total, body) => total + body.duration, 0);
                const nearestPasses = Math.max(1, Math.min(100, Math.round(next.motion.transport.slidesPerSecond * bodySeconds / movingMedia.count)));
                next.motion.seamless.enabled = true;
                next.motion.seamless.loops = nearestPasses;
              })}>Close at Cut Tempo</button>
              <small>Preserves the timing authority and ends on a complete deck pass.</small>
            </div>
          ) : <small className="closure-status">Closes cleanly on complete deck passes.</small>}
        </InspectorGroup>
      ) : null}

      <InspectorGroup title="Motion" eyebrow={`${settings.motion.speed.toFixed(2)} slides/s`} description="Controls travel direction, path, curvature, depth, and banking." workspaces="direct" open>
        <Segmented label="Flow axis" value={settings.motion.axis} options={[{ value: "horizontal", label: "Horizontal" }, { value: "vertical", label: "Vertical" }]} onChange={(axis) => patch("motion", { axis })} />
        <Segmented label="Direction" value={settings.motion.direction} options={[{ value: -1 as const, label: "Reverse" }, { value: 1 as const, label: "Forward" }]} onChange={(direction) => patch("motion", { direction })} />
        {v2Active ? (
          <SelectField
            label="Path · all 10"
            value={project.motion.path.id}
            options={PATH_RECIPES.map((path) => ({ value: path.id, label: path.name }))}
            onChange={(pathId) => directProject(
              `${PATH_RECIPES.find((entry) => entry.id === pathId)?.name ?? "Path"} applied.`,
              (next) => { applyPathRecipe(next, pathId); },
            )}
          />
        ) : (
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
        )}
        <RangeNumberField label="Free-run speed" value={settings.motion.speed} softMin={0.02} softMax={4} hardMin={0} hardMax={8} step={0.01} decimals={2} unit=" slides/s" hint="Used only when exact deck-pass lock is off." onChange={(speed) => patch("motion", { speed })} />
        <RangeField label="Curve" value={settings.motion.curvature * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("motion", { curvature: value / 100 })} />
        <RangeField label="Depth" value={settings.motion.depth * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("motion", { depth: value / 100 })} />
        <RangeNumberField label="Banking" value={settings.motion.tilt} softMin={-45} softMax={45} hardMin={-45} hardMax={45} step={0.5} decimals={1} unit="°" onChange={(tilt) => patch("motion", { tilt })} />
        <RangeField label="Optical bend" value={settings.motion.distortion * 100} min={0} max={100} step={1} unit="%" hint="Velocity drives shader deformation; still frames return crisp." onChange={(value) => patch("motion", { distortion: value / 100 })} />
        <RangeField label="Focus lift" value={settings.motion.focusScale * 100} min={0} max={50} step={1} unit="%" onChange={(value) => patch("motion", { focusScale: value / 100 })} />
        <SwitchField label="Seamless export lock" checked={settings.motion.seamless} hint="Forces whole loops across master duration." onChange={(seamless) => patch("motion", { seamless })} />
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

      <InspectorGroup title="Surface" eyebrow={`${Math.round(settings.slide.smoothing * 100)}% smoothing`} description="Shared slide crop, corners, borders, and shadows." workspaces="slides">
        <Segmented label="Image fit" value={settings.slide.fit} options={[{ value: "cover", label: "Cover" }, { value: "contain", label: "Contain" }]} onChange={(fit) => patch("slide", { fit })} />
        <RangeField label="Focal point X" value={settings.slide.focalX * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("slide", { focalX: value / 100 })} />
        <RangeField label="Focal point Y" value={settings.slide.focalY * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("slide", { focalY: value / 100 })} />
        <p className="performance-note">Image fit and focal point apply to every slide in this deck.</p>
        <RangeNumberField label="Corner radius" value={settings.slide.radius} softMin={0} softMax={256} hardMin={0} hardMax={512} step={1} unit=" px" onChange={(radius) => patch("slide", { radius })} />
        <RangeField label="Corner smoothing" value={settings.slide.smoothing * 100} min={0} max={100} step={1} unit="%" hint="60% is the familiar iOS-style continuous corner." onChange={(value) => patch("slide", { smoothing: value / 100 })} />
        <RangeNumberField label="Border" value={settings.slide.borderWidth} softMin={0} softMax={24} hardMin={0} hardMax={32} step={0.5} decimals={1} unit=" px" onChange={(borderWidth) => patch("slide", { borderWidth })} />
        <ColorField label="Border colour" value={settings.slide.borderColor} onChange={(borderColor) => patch("slide", { borderColor })} />
        <RangeField label="Border presence" value={settings.slide.borderOpacity * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("slide", { borderOpacity: value / 100 })} />
        <RangeField label="Shadow" value={settings.slide.shadowOpacity * 100} min={0} max={80} step={1} unit="%" onChange={(value) => patch("slide", { shadowOpacity: value / 100 })} />
        <RangeNumberField label="Shadow softness" value={settings.slide.shadowSoftness} softMin={0} softMax={192} hardMin={0} hardMax={256} step={1} unit=" px" onChange={(shadowSoftness) => patch("slide", { shadowSoftness })} />
      </InspectorGroup>

      {v2Active ? (
        <InspectorGroup title="Material" eyebrow={materialRecipe?.name ?? project.material.surface} description="Choose how cards feel and react to movement." workspaces="direct">
          <SelectField
            label="Surface"
            value={materialRecipe?.id ?? project.material.surface}
            options={MATERIAL_RECIPES.map((recipe) => ({ value: recipe.id, label: recipe.name }))}
            onChange={(surfaceId) => directProject(
              `${MATERIAL_RECIPES.find((entry) => entry.id === surfaceId)?.name ?? "Material"} applied.`,
              (next) => { applyMaterialRecipe(next, surfaceId); },
            )}
          />
          <SelectField
            label="Local finish"
            value={finishRecipe?.id ?? "custom"}
            options={[
              { value: "custom", label: "Custom finish" },
              ...FINISH_RECIPES.map((recipe) => ({ value: recipe.id, label: recipe.name })),
            ]}
            onChange={(finishId) => {
              if (finishId === "custom") return;
              directProject(
                `${FINISH_RECIPES.find((entry) => entry.id === finishId)?.name ?? "Finish"} applied.`,
                (next) => { applyFinishRecipe(next, finishId); },
              );
            }}
          />
          <RangeField label="Flex" value={project.material.flex * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Material flex directed.", (next) => { next.material.flex = value / 100; })} />
          <RangeNumberField label="Thickness" value={project.material.thickness * 100} softMin={0} softMax={40} hardMin={0} hardMax={100} step={0.5} decimals={1} unit="%" onChange={(value) => directProject("Material thickness directed.", (next) => { next.material.thickness = value / 100; })} />
          <RangeField label="Roughness" value={project.material.roughness * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Material roughness directed.", (next) => { next.material.roughness = value / 100; })} />
          <RangeField label="Sheen" value={project.material.sheen * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Material sheen directed.", (next) => { next.material.sheen = value / 100; })} />
          <RangeField label="Microtexture" value={project.material.finish.microtexture * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Material texture directed.", (next) => { next.material.finish.microtexture = value / 100; next.material.finish.id = "custom"; })} />
        </InspectorGroup>
      ) : null}

      {v2Active ? (
        <InspectorGroup title="Light" eyebrow={project.lighting.enabled ? lightingRecipe?.name ?? "Custom" : "Off"} description="Light the cards without muddying their artwork." workspaces="direct">
          <SwitchField label="Light the scene" checked={project.lighting.enabled} onChange={(enabled) => directProject(enabled ? "Scene light on." : "Scene light bypassed.", (next) => { next.lighting.enabled = enabled; })} />
          <SelectField
            label="Rig · all 12"
            value={lightingRecipe?.id ?? "custom"}
            options={[
              { value: "custom", label: "Custom rig" },
              ...LIGHTING_RECIPES.map((recipe) => ({ value: recipe.id, label: recipe.name })),
            ]}
            onChange={(rigId) => {
              if (rigId === "custom") return;
              directProject(
                `${LIGHTING_RECIPES.find((entry) => entry.id === rigId)?.name ?? "Lighting rig"} applied.`,
                (next) => { applyLightingRecipe(next, rigId); next.lighting.enabled = true; },
              );
            }}
          />
          <Segmented label="Light space" value={project.lighting.space} options={[{ value: "stage", label: "Stage" }, { value: "card", label: "Card" }]} onChange={(space) => directProject("Light attachment changed.", (next) => { next.lighting.space = space; next.lighting.presetId = "custom"; })} />
          <ColorField label="Key colour" value={project.lighting.keyColor} onChange={(keyColor) => directProject("Key colour directed.", (next) => { next.lighting.keyColor = keyColor; next.lighting.presetId = "custom"; })} />
          <ColorField label="Fill colour" value={project.lighting.fillColor} onChange={(fillColor) => directProject("Fill colour directed.", (next) => { next.lighting.fillColor = fillColor; next.lighting.presetId = "custom"; })} />
          <ColorField label="Shadow colour" value={project.lighting.shadowColor} onChange={(shadowColor) => directProject("Shadow colour directed.", (next) => { next.lighting.shadowColor = shadowColor; next.lighting.presetId = "custom"; })} />
          <RangeField label="Key" value={project.lighting.keyIntensity * 100} min={0} max={200} step={1} unit="%" onChange={(value) => directProject("Key level directed.", (next) => { next.lighting.keyIntensity = value / 100; next.lighting.presetId = "custom"; })} />
          <RangeField label="Fill" value={project.lighting.fillIntensity * 100} min={0} max={200} step={1} unit="%" onChange={(value) => directProject("Fill level directed.", (next) => { next.lighting.fillIntensity = value / 100; next.lighting.presetId = "custom"; })} />
          <RangeField label="Rim" value={project.lighting.rimIntensity * 100} min={0} max={200} step={1} unit="%" onChange={(value) => directProject("Rim level directed.", (next) => { next.lighting.rimIntensity = value / 100; next.lighting.presetId = "custom"; })} />
          <RangeField label="Artwork protection" value={project.lighting.artworkProtection * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Artwork protection directed.", (next) => { next.lighting.artworkProtection = value / 100; next.lighting.presetId = "custom"; })} />
          <RangeNumberField label="Shadow reach" value={project.lighting.shadowDistance} softMin={0} softMax={320} hardMin={0} hardMax={512} step={1} unit=" px" onChange={(shadowDistance) => directProject("Shadow reach directed.", (next) => { next.lighting.shadowDistance = shadowDistance; next.lighting.presetId = "custom"; })} />
          <RangeField label="Contact" value={project.lighting.contactStrength * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Contact shadow directed.", (next) => { next.lighting.contactStrength = value / 100; next.lighting.presetId = "custom"; })} />
          <RangeField label="Stage spill" value={project.lighting.backgroundSpill * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Stage spill directed.", (next) => { next.lighting.backgroundSpill = value / 100; next.lighting.presetId = "custom"; })} />
        </InspectorGroup>
      ) : null}

      <InspectorGroup title="Background" eyebrow={settings.background.style} description="Choose visually first. Fine controls below remain fully editable." workspaces="world" open>
        <BackgroundBrowser
          background={settings.background}
          activeStudy={backgroundStudy}
          studies={filteredBackgroundStudies}
          query={backgroundQuery}
          family={backgroundFamily}
          onQuery={setBackgroundQuery}
          onFamily={setBackgroundFamily}
          onSelect={(study) => onSettings(applyBackgroundStudy(settings, study))}
          onTransparent={() => onSettings({
            ...settings,
            stage: { ...settings.stage, transparent: true },
            background: { ...settings.background, style: "transparent" },
          })}
        />
        <SelectField
          label="Background"
          value={settings.background.style}
          options={[
            { value: "transparent" as const, label: "Transparent" },
            ...Object.entries(BACKGROUND_FAMILY_LABELS).map(([value, label]) => ({
              value: value as OpaqueBackgroundStyle,
              label,
            })),
          ]}
          onChange={(style) => onSettings({ ...settings, stage: { ...settings.stage, transparent: style === "transparent" }, background: { ...settings.background, style } })}
        />
        {opaqueBackground ? (
          <>
            <SelectField
              label="Composition"
              value={backgroundComposition}
              options={BACKGROUND_COMPOSITIONS[opaqueBackground].map((composition, index) => ({
                value: index,
                label: composition.name,
              }))}
              onChange={(composition) => patch("background", withBackgroundComposition(settings.background, composition))}
            />
            <SelectField
              label="Palette"
              value={backgroundPalette?.id ?? "custom"}
              options={[
                { value: "custom", label: "Custom colours" },
                ...BACKGROUND_PALETTES.map((palette) => ({ value: palette.id, label: palette.name })),
              ]}
              onChange={(paletteId) => {
                const palette = BACKGROUND_PALETTES.find((entry) => entry.id === paletteId);
                if (palette) patch("background", withBackgroundPalette(settings.background, palette));
              }}
            />
            <div className="pin-reset-control atmosphere-recut">
              <button
                type="button"
                onClick={() => patch("background", withBackgroundVariation(
                  settings.background,
                  (backgroundVariation(settings.background.seed) + 1) % 100,
                ))}
              >
                Recut composition
              </button>
              <small>Take {String(backgroundVariation(settings.background.seed) + 1).padStart(2, "0")} · same structure, new deterministic weather.</small>
            </div>
          </>
        ) : null}
        <ColorField label="Ground" value={settings.background.colorA} onChange={(colorA) => patch("background", { colorA })} />
        <ColorField label="Field" value={settings.background.colorB} onChange={(colorB) => patch("background", { colorB })} />
        <ColorField label="Light" value={settings.background.accent} onChange={(accent) => patch("background", { accent })} />
        <RangeField label="Intensity" value={settings.background.intensity * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("background", { intensity: value / 100 })} />
        <RangeField label="Background breath" value={settings.background.motion * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("background", { motion: value / 100 })} />
        <RangeField label="Grain" value={settings.background.grain * 100} min={0} max={60} step={1} unit="%" onChange={(value) => patch("background", { grain: value / 100 })} />
        <RangeField label="Vignette" value={settings.background.vignette * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("background", { vignette: value / 100 })} />
      </InspectorGroup>

      {v2Active ? (
        <InspectorGroup title="Lens" eyebrow={project.lens.enabled ? lensRecipe?.name ?? "Custom" : "Off"} description="Apply optical character after motion, material, and light feel right." workspaces="direct">
          <SwitchField label="Optical finish" checked={project.lens.enabled} onChange={(enabled) => directProject(enabled ? "Lens on." : "Lens bypassed.", (next) => { next.lens.enabled = enabled; })} />
          <SelectField
            label="Lens"
            value={lensRecipe?.id ?? "custom"}
            options={[
              { value: "custom", label: "Custom lens" },
              ...LENS_RECIPES.map((recipe) => ({ value: recipe.id, label: recipe.name })),
            ]}
            onChange={(lensId) => {
              if (lensId === "custom") return;
              directProject(
                `${LENS_RECIPES.find((entry) => entry.id === lensId)?.name ?? "Lens"} applied.`,
                (next) => { applyLensRecipe(next, lensId); },
              );
            }}
          />
          <Segmented label="Pinned frame" value={project.lens.presenterTreatment} options={[{ value: "protected", label: "Protected" }, { value: "through-lens", label: "Through lens" }]} onChange={(presenterTreatment) => directProject("Pinned optical treatment changed.", (next) => { next.lens.presenterTreatment = presenterTreatment; })} />
          <RangeField label="Presence" value={project.lens.presence * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Lens presence directed.", (next) => { next.lens.presence = value / 100; next.lens.characterId = "custom"; })} />
          <RangeField label="Focus" value={project.lens.focus * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Focus directed.", (next) => { next.lens.focus = value / 100; next.lens.characterId = "custom"; })} />
          <RangeField label="Motion smear" value={project.lens.directionalSmear * 100} min={0} max={100} step={1} unit="%" hint="Velocity-linked; exact zero at rest." onChange={(value) => directProject("Motion smear directed.", (next) => { next.lens.directionalSmear = value / 100; next.lens.characterId = "custom"; })} />
          <RangeField label="Colour separation" value={project.lens.chromaticSeparation * 100} min={0} max={100} step={1} unit="%" hint="Radial; exact zero at the optical centre." onChange={(value) => directProject("Colour separation directed.", (next) => { next.lens.chromaticSeparation = value / 100; next.lens.characterId = "custom"; })} />
          <RangeField label="Bloom" value={project.lens.bloom * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Bloom directed.", (next) => { next.lens.bloom = value / 100; next.lens.characterId = "custom"; })} />
          <RangeField label="Halation" value={project.lens.halation * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Halation directed.", (next) => { next.lens.halation = value / 100; next.lens.characterId = "custom"; })} />
          <RangeField label="Flare" value={project.lens.flare * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Flare directed.", (next) => { next.lens.flare = value / 100; next.lens.characterId = "custom"; })} />
          <RangeField label="Gate weave" value={project.lens.gateWeave * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Gate weave directed.", (next) => { next.lens.gateWeave = value / 100; next.lens.characterId = "custom"; })} />
          <RangeField label="Camera grain" value={project.lens.cameraGrain * 100} min={0} max={60} step={1} unit="%" onChange={(value) => directProject("Camera grain directed.", (next) => { next.lens.cameraGrain = value / 100; next.lens.characterId = "custom"; })} />
          <RangeField label="Lens vignette" value={project.lens.vignette * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Lens vignette directed.", (next) => { next.lens.vignette = value / 100; next.lens.characterId = "custom"; })} />
        </InspectorGroup>
      ) : null}

      {v2Active ? (
        <InspectorGroup title="Sound" eyebrow={project.sound.previewEnabled || project.sound.exportEnabled ? project.sound.grammar : "OFF"} description="Add tactile accents to preview, export, or both." workspaces="direct">
          <SwitchField
            label="Hear tactile motion"
            hint="Recorded CC0 paper, card, cloth, leather, wood and metal. Off by default."
            checked={project.sound.previewEnabled}
            onChange={(previewEnabled) => directProject(previewEnabled ? "Tactile preview enabled." : "Tactile preview muted.", (next) => { next.sound.previewEnabled = previewEnabled; })}
          />
          <SwitchField
            label="Include sound in MP4"
            hint="Renders one deterministic 48 kHz stereo effects master, then AAC."
            checked={project.sound.exportEnabled}
            onChange={(exportEnabled) => directProject(exportEnabled ? "Tactile export enabled." : "Tactile export muted.", (next) => {
              next.sound.exportEnabled = exportEnabled;
              next.master.audio.enabled = exportEnabled || (next.presenter.enabled && !next.presenter.muted);
            })}
          />
          <Segmented
            label="Material palette"
            value={project.sound.material === "cinematic" || project.sound.material === "paper" ? project.sound.material : "studio"}
            options={[
              { value: "studio", label: "Studio" },
              { value: "cinematic", label: "Cinema" },
              { value: "paper", label: "Paper" },
            ]}
            onChange={(material) => directProject("Tactile material changed.", (next) => { next.sound.material = material; next.sound.source = "recorded"; })}
          />
          <Segmented
            label="Grammar"
            value={project.sound.grammar}
            options={[
              { value: "dry", label: "Dry" },
              { value: "editorial", label: "Editorial" },
              { value: "organic", label: "Organic" },
            ]}
            onChange={(grammar) => directProject("Tactile grammar changed.", (next) => { next.sound.grammar = grammar; })}
          />
          <RangeField label="Density" value={project.sound.density * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Tactile density directed.", (next) => { next.sound.density = value / 100; })} />
          <RangeField label="Texture" value={project.sound.texture * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Tactile texture directed.", (next) => { next.sound.texture = value / 100; })} />
          <NumberField label="Take" value={project.sound.take} min={1} max={999} step={1} onChange={(take) => directProject("Tactile take changed.", (next) => { next.sound.take = take; })} />
          <RangeField label="Master" value={project.sound.masterLevel * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Tactile master level directed.", (next) => { next.sound.masterLevel = value / 100; })} />
          <RangeField label="Motion" value={project.sound.motionLevel * 100} min={0} max={100} step={1} unit="%" onChange={(value) => directProject("Tactile motion level directed.", (next) => { next.sound.motionLevel = value / 100; })} />
          <RangeField label="Under voice" value={project.sound.underVoice * 100} min={0} max={100} step={1} unit="%" hint="Applied only when presenter speech shares the MP4." onChange={(value) => directProject("Under-voice level directed.", (next) => { next.sound.underVoice = value / 100; })} />
          <div className="sound-audition-control">
            <button type="button" onClick={onAuditionSound} disabled={!project.sound.previewEnabled || sonicState === "unavailable"}>Audition passage</button>
            <small>{sonicState === "loading" ? "Loading local recordings…" : sonicState === "ready" ? "Recorded palette ready." : sonicState === "unavailable" ? "Web Audio unavailable." : "Sound stays silent until enabled."}</small>
          </div>
        </InspectorGroup>
      ) : null}

      <InspectorGroup title="Pinned frame" eyebrow={settings.presenter.enabled ? "ON" : "OFF"} description="Keep one image or presenter video still while the deck moves." openRequestId={pinEditorRequestId} workspaces="slides">
        <SwitchField
          label="Keep one frame still"
          checked={settings.presenter.enabled}
          disabled={!settings.presenter.assetId}
          hint={settings.presenter.assetId ? "Turning this off remembers the frame, so you can bring it back without choosing it again." : "Choose an image or presenter video in Media first."}
          onChange={(enabled) => patch("presenter", { enabled })}
        />
        {settings.presenter.assetId ? (
          <div className="pin-reset-control">
            <button type="button" onClick={onResetPinnedFrame}>Reset pinned frame</button>
            <small>Source ratio · protected layer · still only. Crop, corners, and border stay yours.</small>
          </div>
        ) : null}
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
        <RangeNumberField label="Width" value={settings.presenter.width * 100} softMin={5} softMax={100} hardMin={5} hardMax={100} step={1} unit="%" onChange={(value) => patch("presenter", { width: value / 100 })} />
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
        <RangeNumberField label="Pinned radius" value={settings.presenter.radius} softMin={0} softMax={256} hardMin={0} hardMax={512} step={1} unit=" px" onChange={(radius) => patch("presenter", { radius })} />
        <RangeField label="Pinned smoothing" value={settings.presenter.smoothing * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("presenter", { smoothing: value / 100 })} />
        <RangeNumberField label="Pinned border" value={settings.presenter.borderWidth} softMin={0} softMax={24} hardMin={0} hardMax={32} step={0.5} decimals={1} unit=" px" onChange={(borderWidth) => patch("presenter", { borderWidth })} />
        {settings.presenter.borderWidth > 0 ? (
          <>
            <ColorField label="Pinned border colour" value={settings.presenter.borderColor} onChange={(borderColor) => patch("presenter", { borderColor })} />
            <RangeField label="Pinned border presence" value={settings.presenter.borderOpacity * 100} min={0} max={100} step={1} unit="%" onChange={(value) => patch("presenter", { borderOpacity: value / 100 })} />
          </>
        ) : null}
        <RangeField label="Pinned shadow" value={settings.presenter.shadowOpacity * 100} min={0} max={80} step={1} unit="%" onChange={(value) => patch("presenter", { shadowOpacity: value / 100 })} />
        {settings.presenter.shadowOpacity > 0 ? (
          <>
            <RangeNumberField label="Pinned shadow softness" value={settings.presenter.shadowSoftness} softMin={0} softMax={192} hardMin={0} hardMax={256} step={1} unit=" px" onChange={(shadowSoftness) => patch("presenter", { shadowSoftness })} />
            <RangeNumberField label="Pinned shadow X" value={settings.presenter.shadowOffsetX} softMin={-128} softMax={128} hardMin={-512} hardMax={512} step={1} unit=" px" onChange={(shadowOffsetX) => patch("presenter", { shadowOffsetX })} />
            <RangeNumberField label="Pinned shadow Y" value={settings.presenter.shadowOffsetY} softMin={-128} softMax={128} hardMin={-512} hardMax={512} step={1} unit=" px" onChange={(shadowOffsetY) => patch("presenter", { shadowOffsetY })} />
          </>
        ) : null}
        <SwitchField label="Mute presenter in export" checked={settings.presenter.muted} onChange={(muted) => patch("presenter", { muted })} />
        {!settings.presenter.muted ? (
          <>
            <RangeField label="Presenter level" value={settings.presenter.gain * 100} min={0} max={200} step={1} unit="%" onChange={(value) => patch("presenter", { gain: value / 100 })} />
            <RangeField label="Source trim" value={settings.presenter.trimStart} min={0} max={settings.output.duration} step={0.05} decimals={2} unit=" s" onChange={(trimStart) => patch("presenter", { trimStart })} />
            <RangeField label="Enters at" value={settings.presenter.startAt} min={0} max={settings.output.duration} step={0.05} decimals={2} unit=" s" onChange={(startAt) => patch("presenter", { startAt })} />
          </>
        ) : null}
      </InspectorGroup>

      <InspectorGroup title="Performance" eyebrow={`${performanceTimeline.totalDuration.toFixed(2)} s total`} description="Direct the opening, pace changes, loops, and ending." workspaces="direct" open>
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
        {timingRead.intent.mode === "fixed-master" ? (
          <RangeField
            label="Body duration"
            value={performance.body.durationSeconds}
            min={bodyDurationMinimum}
            max={bodyDurationMaximum}
            step={0.01}
            decimals={2}
            unit=" s"
            hint="Length of one carousel body cycle. Advanced repeats extend the master around it."
            onChange={(durationSeconds) => commitPerformance({
              ...performance,
              body: { ...performance.body, durationSeconds },
            })}
          />
        ) : <p className="performance-note">Body duration is derived from moving slides × deck passes × reading pace.</p>}
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

      <InspectorGroup title="Output" eyebrow={`${settings.output.width} × ${settings.output.height}`} description="Confirm runtime, frame rate, readiness, and export format." workspaces="master" open>
        {timingRead.intent.mode === "fixed-master" ? (
          <RangeNumberField
            label="Exact duration"
            value={performanceTimeline.totalDuration}
            softMin={outputDurationMinimum}
            softMax={Math.max(60, outputDurationMinimum)}
            hardMin={outputDurationMinimum}
            hardMax={MAX_OUTPUT_DURATION}
            step={0.01}
            decimals={2}
            unit=" s"
            hint={outputDurationMinimum > MIN_OUTPUT_DURATION
              ? `This repeat pattern needs at least ${outputDurationMinimum.toFixed(1)} seconds.`
              : "The master stays exact while Drift fits complete deck passes inside it."}
            onChange={(duration) => commitPerformance(performance, duration)}
          />
        ) : (
          <div className="resolved-duration">
            <span>DERIVED LENGTH</span>
            <strong>{project.master.duration.toFixed(2)} s</strong>
            <small>{movingMedia.count} moving slides × {project.motion.seamless.loops} passes × {timingRead.intent.secondsPerSlide.toFixed(2)} s, plus authored transitions.</small>
          </div>
        )}
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
        {v2Active ? (
          <div className="delivery-receipt" role="status" aria-label="Delivery receipt">
            <div><span>DELIVERY RECEIPT</span><strong>{deliveryReceipt.output.frameCount.toLocaleString()} frames</strong></div>
            <dl>
              <div><dt>Encoded</dt><dd>{deliveryReceipt.output.encodedDurationSeconds.toFixed(3)} s · {deliveryReceipt.output.aspectLabel} · {deliveryReceipt.output.fps} fps</dd></div>
              <div><dt>Pace</dt><dd>{deliveryReceipt.pace.minimumSlidesPerSecond.toFixed(2)}–{deliveryReceipt.pace.peakSlidesPerSecond.toFixed(2)} slides/s</dd></div>
              <div><dt>Cadence</dt><dd>{deliveryReceipt.cadence.compatibility.replace("-", " ")}{deliveryReceipt.cadence.endpointMismatch ? " · endpoint warning" : " · exact endpoint"}</dd></div>
              <div><dt>Closure</dt><dd>{deliveryReceipt.seamlessClosure.status.replace("-", " ")}</dd></div>
              <div><dt>Sound</dt><dd>{deliveryReceipt.sound.exportEnabled ? `${deliveryReceipt.sound.deterministicEventCount} deterministic events` : "off"}</dd></div>
              <div><dt>Alpha</dt><dd>{deliveryReceipt.transparency.requested ? deliveryReceipt.transparency.compatible ? "compatible" : "MP4 cannot carry transparency" : "opaque"}</dd></div>
              <div><dt>Workload</dt><dd>{deliveryReceipt.workload.class} · {(deliveryReceipt.workload.pixelFrames / 1_000_000_000).toFixed(2)} Gpx-frames</dd></div>
            </dl>
          </div>
        ) : null}
        {v2Active ? (
          <div className="master-preflight" data-ready={preflight.canExport} role="status" aria-label="Master preflight">
            <div>
              <span>MASTER PREFLIGHT</span>
              <strong>{preflight.canExport
                ? `MP4 READY${preflight.warnings.length ? ` · ${preflight.warnings.length} WARN` : ""}`
                : `${preflight.blockers.length} BLOCKED`}</strong>
            </div>
            {preflight.blockers.length || preflight.warnings.length ? (
              <ul>
                {[...preflight.blockers, ...preflight.warnings].slice(0, 5).map((entry) => (
                  <li key={`${entry.id}-${entry.subjectId ?? "master"}`} data-severity={entry.severity}>{entry.message}</li>
                ))}
              </ul>
            ) : <p>Media, timing, cadence, renderer, and H.264 capability hold.</p>}
            {preflight.blockers.length + preflight.warnings.length > 5 ? (
              <small>+ {preflight.blockers.length + preflight.warnings.length - 5} more objective checks</small>
            ) : null}
          </div>
        ) : null}
        <div className="action-stack">
          <button type="button" className="primary-action" onClick={onExportVideo} disabled={exporting || !preflight.canExport}>Export MP4 master</button>
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
