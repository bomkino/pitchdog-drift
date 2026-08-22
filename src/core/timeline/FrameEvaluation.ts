import type { SemanticEvent } from "../events/SemanticEvent";

export type EditorialBeat = "read" | "anticipate" | "carry" | "impact" | "settle" | "land";

export interface EvaluatedFrameSlide {
  logicalIndex: number;
  sourceIndex: number;
  primary: number;
  cross: number;
  z: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
  opacity: number;
  pathBend: number;
  focusWeight: number;
}

export interface FrameEvaluation {
  time: number;
  frameIndex: number | null;
  master: {
    phase: number;
    loopIndex: number;
    reducedMotion: boolean;
  };
  track: {
    rawDistance: number;
    visibleDistance: number;
    velocity: number;
    acceleration: number;
    direction: 1 | -1;
    resting: boolean;
  };
  cadence: {
    beat: EditorialBeat;
    poseIndex: number | null;
    holdProgress: number;
    focusHandoff: number;
  };
  focus: {
    logicalSlot: number;
    sourceIndex: number;
    previousSourceIndex: number;
  };
  slides: EvaluatedFrameSlide[];
  phases: {
    material: number;
    lighting: number;
    atmosphere: number;
    lens: number;
  };
  events: SemanticEvent[];
}
