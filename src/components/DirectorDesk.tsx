import {
  DIRECTION_PROFILES,
  type DirectionLevel,
  type DirectionState,
} from "../direction";
import { getCompositionGuide, type CompositionGuideMode } from "../guides";
import type { LegibilityAssessment } from "../legibility";
import { formatBytes, type OutputReadiness } from "../outputPresets";

interface DirectorDeskProps {
  slideCount: number;
  worldName: string;
  worldDescription: string;
  directionState: DirectionState;
  onDirection: (level: DirectionLevel) => void;
  onNewTake: () => void;
  cleanComparison: boolean;
  onToggleCleanComparison: () => void;
  guideMode: CompositionGuideMode;
  onCycleGuide: () => void;
  legibility: LegibilityAssessment;
  outputReadiness: OutputReadiness;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  disabled: boolean;
}

function directionLabel(state: DirectionState): string {
  if (state === "custom") return "Custom cut";
  return DIRECTION_PROFILES.find((profile) => profile.id === state)?.name ?? state;
}

function statusLabel(status: OutputReadiness["status"]): string {
  if (status === "ready") return "Ready";
  if (status === "warning") return "Review";
  if (status === "checking") return "Checking";
  return "Blocked";
}

export function DirectorDesk({
  slideCount,
  worldName,
  worldDescription,
  directionState,
  onDirection,
  onNewTake,
  cleanComparison,
  onToggleCleanComparison,
  guideMode,
  onCycleGuide,
  legibility,
  outputReadiness,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  disabled,
}: DirectorDeskProps) {
  const selectedProfile = DIRECTION_PROFILES.find((profile) => profile.id === directionState) ?? null;
  const guide = getCompositionGuide(guideMode);

  return (
    <section className="director-desk" aria-labelledby="director-desk-title">
      <div className="director-desk-heading">
        <div>
          <span>THE CUT</span>
          <h3 id="director-desk-title">Four decisions. Then the knobs.</h3>
        </div>
        <small>Slides → World → Direct → Master</small>
      </div>

      <ol className="journey-rail" aria-label="Creator journey">
        <li data-status={slideCount > 0 ? "ready" : "blocked"}>
          <span>01</span>
          <strong>Slides</strong>
          <small>{slideCount > 0 ? `${slideCount} frame${slideCount === 1 ? "" : "s"}` : "Add a deck"}</small>
        </li>
        <li data-status="ready">
          <span>02</span>
          <strong>World</strong>
          <small>{worldName}</small>
        </li>
        <li data-status={directionState === "custom" ? "review" : "ready"}>
          <span>03</span>
          <strong>Direct</strong>
          <small>{directionLabel(directionState)}</small>
        </li>
        <li data-status={outputReadiness.status}>
          <span>04</span>
          <strong>Master</strong>
          <small>{statusLabel(outputReadiness.status)}</small>
        </li>
      </ol>

      <div className="active-world-note">
        <span>{worldName}</span>
        <p>{worldDescription}</p>
      </div>

      <fieldset className="direction-pressure">
        <legend>Direction pressure</legend>
        <div>
          {DIRECTION_PROFILES.map((profile) => (
            <label key={profile.id} data-active={directionState === profile.id}>
              <input
                type="radio"
                name="Direction pressure"
                value={profile.id}
                checked={directionState === profile.id}
                disabled={disabled}
                onChange={() => onDirection(profile.id)}
              />
              <span>
                <strong>{profile.name}</strong>
                <small>{profile.eyebrow}</small>
              </span>
            </label>
          ))}
        </div>
        <p>{selectedProfile?.description ?? "This cut has manual changes. Choose a pressure level to rebuild cleanly from the selected world."}</p>
      </fieldset>

      <div className="director-primary-actions">
        <button
          type="button"
          className="new-take-action"
          data-director-command="new-take"
          disabled={disabled}
          onClick={onNewTake}
        >
          <span>New take</span>
          <small>Same world. Fresh cut.</small>
        </button>
        <button
          type="button"
          className="clean-lens-action"
          data-active={cleanComparison}
          data-director-command="clean-lens"
          disabled={disabled}
          aria-pressed={cleanComparison}
          onClick={onToggleCleanComparison}
        >
          <span>{cleanComparison ? "Restore directed lens" : "Clean lens"}</span>
          <small>{cleanComparison ? "Return to the authored glass." : "Hold one frame. Judge the treatment."}</small>
        </button>
      </div>

      <div className="director-utility-row">
        <button type="button" data-director-command="undo" disabled={disabled || !canUndo} onClick={onUndo}>Undo</button>
        <button type="button" data-director-command="redo" disabled={disabled || !canRedo} onClick={onRedo}>Redo</button>
        <button
          type="button"
          className="guide-cycle-action"
          data-director-command="guides"
          disabled={disabled}
          onClick={onCycleGuide}
          aria-label={`Cycle composition guides. Current guide: ${guide.name}`}
        >
          Guides · {guide.name.replace("Guides ", "")}
        </button>
      </div>

      <div className="director-diagnostics">
        <article data-status={legibility.status}>
          <span>READABILITY</span>
          <strong>{legibility.status === "clear" ? "Clear" : legibility.status === "watch" ? "Watch the edges" : "Intense"}</strong>
          <p>{legibility.detail}</p>
        </article>
        <article data-status={outputReadiness.status}>
          <span>MP4 MASTER PREFLIGHT</span>
          <strong>{statusLabel(outputReadiness.status)} · about {formatBytes(outputReadiness.estimatedBytes)}</strong>
          <p>{outputReadiness.blockingReason ?? outputReadiness.checks.find((check) => check.status === "warning")?.detail ?? "The current master has no known blockers."}</p>
        </article>
      </div>
    </section>
  );
}
