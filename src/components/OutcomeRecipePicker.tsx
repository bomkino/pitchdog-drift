import type { CSSProperties } from "react";
import { countMovingMedia } from "../core/project/movingMedia";
import type { DriftProjectV4 } from "../core/project/schema";
import {
  OUTCOME_RECIPES,
  detectOutcomeRecipe,
  getOutcomeRecipe,
  type OutcomeRecipeDefinition,
  type OutcomeRecipeId,
  type OutcomeRecipeIdentity,
} from "../core/recipes/outcomeRecipes";

export interface OutcomeRecipePickerProps {
  readonly project: DriftProjectV4;
  readonly disabled?: boolean;
  readonly onApply: (id: OutcomeRecipeId) => void;
  readonly onResetMotion: () => void;
  readonly onResetSequence: () => void;
}

export interface OutcomeRecipeCardModel {
  readonly id: OutcomeRecipeId;
  readonly label: string;
  readonly recommended: boolean;
  readonly description: string;
  readonly sequence: string;
  readonly behavior: string;
  readonly duration: string;
  readonly trace: readonly {
    readonly id: string;
    readonly label: string;
    readonly pace: "fast" | "read" | "custom";
    readonly passes: number;
    readonly weight: number;
  }[];
}

function cleanLabel(recipe: OutcomeRecipeDefinition): string {
  return recipe.label.replace(/\s+—\s+Safe Default$/u, "");
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0.5 s minimum";
  return `${seconds < 10 ? seconds.toFixed(1) : seconds.toFixed(0)} s`;
}

export function outcomeRecipeCardModel(
  recipe: OutcomeRecipeDefinition,
  movingSlideCount: number,
  masterDuration: number,
): OutcomeRecipeCardModel {
  const sequencePasses = recipe.sequence.groups.reduce(
    (total, group) => total + group.passes,
    0,
  ) * recipe.sequence.repeatCount;
  const durationSeconds = recipe.timing.mode === "content-paced"
    ? Math.max(0.5, movingSlideCount * recipe.timing.secondsPerSlide * sequencePasses)
    : masterDuration;
  const grammar = recipe.grammar === "continuous-glide"
    ? "Continuous glide"
    : recipe.grammar === "editorial-holds"
      ? "Readable stops"
      : "Handcrafted cadence";
  const passLabel = `${sequencePasses} ${sequencePasses === 1 ? "pass" : "passes"}`;
  return Object.freeze({
    id: recipe.id,
    label: cleanLabel(recipe),
    recommended: recipe.id === "smooth-carousel",
    description: recipe.description,
    sequence: recipe.sequence.groups.map(({ label }) => label).join(" → "),
    behavior: `${passLabel} · ${grammar}`,
    duration: recipe.timing.mode === "content-paced"
      ? `${formatDuration(durationSeconds)} for ${movingSlideCount} ${movingSlideCount === 1 ? "slide" : "slides"}`
      : `${formatDuration(durationSeconds)} master`,
    trace: Object.freeze(recipe.sequence.groups.map((group) => Object.freeze({
      id: group.id,
      label: group.label,
      pace: group.pace,
      passes: group.passes,
      weight: group.relativeSecondsPerPass * group.passes,
    }))),
  });
}

function currentOutcomeLabel(identity: OutcomeRecipeIdentity): string {
  return identity === "custom" ? "Custom" : cleanLabel(getOutcomeRecipe(identity));
}

function OutcomeTrace({ model }: { readonly model: OutcomeRecipeCardModel }) {
  return (
    <span className="outcome-trace" aria-hidden="true">
      {model.trace.map((segment) => (
        <span
          className="outcome-trace-segment"
          data-pace={segment.pace}
          key={segment.id}
          style={{ "--outcome-weight": segment.weight } as CSSProperties}
        >
          {Array.from({ length: segment.passes }, (_, index) => (
            <span className="outcome-trace-pass" key={`${segment.id}-${index}`} />
          ))}
          <small>{segment.label}</small>
        </span>
      ))}
    </span>
  );
}

export function OutcomeRecipePicker({
  project,
  disabled = false,
  onApply,
  onResetMotion,
  onResetSequence,
}: OutcomeRecipePickerProps) {
  const identity = detectOutcomeRecipe(project);
  const movingSlideCount = countMovingMedia(project);
  const cards = OUTCOME_RECIPES.map((recipe) => outcomeRecipeCardModel(
    recipe,
    movingSlideCount,
    project.master.duration,
  ));

  return (
    <section className="outcome-picker" aria-labelledby="outcome-picker-title">
      <header className="outcome-picker-header">
        <div>
          <span className="eyebrow">Start with an outcome</span>
          <h3 id="outcome-picker-title">How should the deck move?</h3>
          <p>Choose a complete motion direction. Your slides and Look never change.</p>
        </div>
        <output className="outcome-current" aria-live="polite">
          Current · <strong>{currentOutcomeLabel(identity)}</strong>
        </output>
      </header>

      <div className="outcome-card-grid" role="list" aria-label="Motion outcomes">
        {cards.map((card) => {
          const active = identity === card.id;
          return (
            <div role="listitem" key={card.id}>
              <button
                type="button"
                className="outcome-card"
                data-active={active}
                data-outcome={card.id}
                aria-pressed={active}
                aria-label={`${card.label}. ${card.description} ${card.sequence}. ${card.behavior}. ${card.duration}.`}
                disabled={disabled}
                onClick={() => onApply(card.id)}
              >
                <span className="outcome-card-title">
                  <strong>{card.label}</strong>
                  {card.recommended ? <em>Safe default</em> : null}
                </span>
                <span className="outcome-card-description">{card.description}</span>
                <OutcomeTrace model={card} />
                <span className="outcome-card-meta">
                  <span>{card.sequence}</span>
                  <span>{card.behavior}</span>
                  <span>{card.duration}</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <footer className="outcome-picker-actions">
        <button
          type="button"
          className="restore-default-action"
          disabled={disabled || identity === "smooth-carousel"}
          onClick={() => onApply("smooth-carousel")}
        >
          Restore Smooth Carousel
        </button>
        <span className="outcome-reset-actions" aria-label="Scoped defaults">
          <button type="button" disabled={disabled} onClick={onResetMotion}>Reset motion only</button>
          <button type="button" disabled={disabled} onClick={onResetSequence}>Reset sequence only</button>
        </span>
      </footer>
    </section>
  );
}
