export type SemanticEventType =
  | "master-start"
  | "slide-approach"
  | "focus-handoff"
  | "focus-impact"
  | "slide-departure"
  | "grab"
  | "release"
  | "settle"
  | "loop-boundary"
  | "master-finish";

export interface SemanticEvent {
  id: string;
  type: SemanticEventType;
  time: number;
  sequence: number;
  sourceIndex: number | null;
  previousSourceIndex: number | null;
  direction: 1 | -1;
  intensity: number;
}
