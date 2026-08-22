import type { DriftProjectV4 } from "../core/project/schema";
import type { StudioSettings } from "../model";
import type { DrawGraphState } from "./renderGraphState";

export type V1RendererSettings = StudioSettings;

export interface V1CompatibilityAuthority {
  kind: "v1-compat";
  settings: V1RendererSettings;
}

export interface ProjectV4Authority {
  kind: "project-v4";
  project: DriftProjectV4;
}

export type EngineInitialAuthority = V1CompatibilityAuthority | ProjectV4Authority;

/** Frozen compatibility adapter; never used by the V2 Project V4 lane. */
export function drawGraphStateFromV1Settings(settings: V1RendererSettings): DrawGraphState {
  return {
    stage: { ...settings.stage },
    motion: { ...settings.motion },
    slide: { ...settings.slide },
    background: { ...settings.background },
    presenter: { ...settings.presenter },
    performance: structuredClone(settings.performance),
    output: { ...settings.output },
  };
}
