import type { PerformanceLifecycleAuthoring } from "../timeline/performanceLifecycle";
import type { StudioSettings } from "../../model";
import type { Axis, DriftProjectV4 } from "./schema";

export interface StagePresentation {
  width: number;
  height: number;
  transparent: boolean;
  directionLabel: string;
  axis: Axis;
  pathLabel: string;
  pinnedAssetId: string | null;
  pinEnabled: boolean;
}

export interface AppExportPlan {
  width: number;
  height: number;
  fps: 24 | 25 | 30 | 50 | 60;
  duration: number;
  videoBitrate: number;
  audioBitrate: number;
  requireTransparentPixels: boolean;
  performance: PerformanceLifecycleAuthoring;
  presenter: {
    enabled: boolean;
    assetId: string | null;
    muted: boolean;
    includeAudio: boolean;
    gain: number;
    trimStart: number;
    startAt: number;
  };
}

function readableLabel(value: string | null | undefined, fallback: string): string {
  return (value ?? fallback).replaceAll("-", " ");
}

function readableWorldLabel(value: string | null | undefined): string {
  // Authored recuts use IDs such as editorial-drift/9:16. Ratio provenance is
  // useful internally, while Film Worlds use world/dread. App chrome and
  // assistive descriptions need the identity rather than either namespace.
  const parts = value?.split("/") ?? [];
  const identity = parts[0] === "world" ? parts[1] : parts[0];
  return readableLabel(identity, "custom direction");
}

/**
 * The V2 app chrome reads only the saved creative tree. This intentionally
 * does not pass through StudioSettings: Stage and export must describe the
 * same Project V4 frame the renderer receives.
 */
export function stagePresentationFromProject(project: DriftProjectV4): StagePresentation {
  const pinnedAssetId = project.presenter.assetId;
  return {
    width: project.composition.width,
    height: project.composition.height,
    transparent: project.composition.alphaMode === "transparent",
    directionLabel: readableWorldLabel(project.provenance.world?.id),
    axis: project.motion.transport.axis,
    pathLabel: readableLabel(project.motion.path.id, "custom path"),
    pinnedAssetId,
    pinEnabled: project.presenter.enabled && pinnedAssetId !== null,
  };
}

/** Frozen V1 adapter. It exists only at the app-shell compatibility boundary. */
export function stagePresentationFromV1Settings(settings: StudioSettings): StagePresentation {
  return {
    width: settings.stage.width,
    height: settings.stage.height,
    transparent: settings.stage.transparent || settings.background.style === "transparent",
    directionLabel: readableLabel(settings.themeId, "custom direction"),
    axis: settings.motion.axis,
    pathLabel: readableLabel(settings.motion.flow, "custom path"),
    pinnedAssetId: settings.presenter.assetId,
    pinEnabled: settings.presenter.enabled && settings.presenter.assetId !== null,
  };
}

export function exportPlanFromProject(project: DriftProjectV4): AppExportPlan {
  const presenterEnabled = project.presenter.enabled && project.presenter.assetId !== null;
  return {
    width: project.composition.width,
    height: project.composition.height,
    fps: project.master.fps,
    duration: project.master.duration,
    videoBitrate: project.master.video.bitrate,
    audioBitrate: project.master.audio.bitrate,
    requireTransparentPixels: project.composition.alphaMode === "transparent",
    performance: structuredClone(project.performance),
    presenter: {
      enabled: presenterEnabled,
      assetId: project.presenter.assetId,
      muted: project.presenter.muted,
      includeAudio: presenterEnabled && project.master.audio.enabled && !project.presenter.muted,
      gain: project.presenter.gain,
      trimStart: project.presenter.trimStart,
      startAt: project.presenter.startAt,
    },
  };
}

/** Frozen V1 adapter. It exists only at the app-shell compatibility boundary. */
export function exportPlanFromV1Settings(settings: StudioSettings): AppExportPlan {
  const presenterEnabled = settings.presenter.enabled && settings.presenter.assetId !== null;
  return {
    width: settings.output.width,
    height: settings.output.height,
    fps: settings.output.fps,
    duration: settings.output.duration,
    videoBitrate: settings.output.videoBitrate,
    audioBitrate: settings.output.audioBitrate,
    requireTransparentPixels: settings.stage.transparent || settings.background.style === "transparent",
    performance: structuredClone(settings.performance),
    presenter: {
      enabled: presenterEnabled,
      assetId: settings.presenter.assetId,
      muted: settings.presenter.muted,
      includeAudio: presenterEnabled && !settings.presenter.muted,
      gain: settings.presenter.gain,
      trimStart: settings.presenter.trimStart,
      startAt: settings.presenter.startAt,
    },
  };
}
