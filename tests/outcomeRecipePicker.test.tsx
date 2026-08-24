import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OutcomeRecipePicker, outcomeRecipeCardModel } from "../src/components/OutcomeRecipePicker";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import {
  OUTCOME_RECIPES,
  applyOutcomeRecipe,
  getOutcomeRecipe,
} from "../src/core/recipes/outcomeRecipes";

describe("outcome recipe picker", () => {
  it("turns complete outcomes into concise, truthful scan cards", () => {
    const smooth = outcomeRecipeCardModel(getOutcomeRecipe("smooth-carousel"), 8, 30);
    expect(smooth).toMatchObject({
      label: "Smooth Carousel",
      recommended: true,
      sequence: "READ ×1",
      behavior: "1 pass · Continuous glide",
      duration: "7.2 s for 8 slides",
    });

    const casino = outcomeRecipeCardModel(getOutcomeRecipe("casino-reveal"), 8, 30);
    expect(casino).toMatchObject({
      label: "Casino Reveal",
      sequence: "FAST ×2 → READ ×1 → FAST ×1",
      behavior: "4 passes · Continuous glide",
      duration: "12 s for 8 slides",
    });
    expect(casino.trace.map(({ label, passes, pace }) => ({ label, passes, pace }))).toEqual([
      { label: "FAST ×2", passes: 2, pace: "fast" },
      { label: "READ ×1", passes: 1, pace: "read" },
      { label: "FAST ×1", passes: 1, pace: "fast" },
    ]);
  });

  it("renders four labelled choices, one safe default, exact current state, and scoped resets", () => {
    const base = createDefaultDriftProjectV4("picker", "2026-08-24T00:00:00.000Z");
    const project = applyOutcomeRecipe(base, "casino-reveal");
    const markup = renderToStaticMarkup(
      <OutcomeRecipePicker
        project={project}
        safeDefaultReady={false}
        onApply={() => undefined}
        onRestoreSafeDefault={() => undefined}
        onResetMotion={() => undefined}
        onResetSequence={() => undefined}
      />,
    );

    expect(markup).toContain("How should the deck move?");
    expect(markup).toContain("Your slides and Look never change.");
    expect(markup).toContain("Current · <strong>Casino Reveal</strong>");
    expect(markup).toContain("Motion default");
    expect(markup).toContain("FAST ×2");
    expect(markup).toContain("READ ×1");
    expect(markup).toContain("Apply clean carousel");
    expect(markup).toContain("Safe default");
    expect(markup).toContain("Smooth continuous motion + literal source pixels");
    expect(markup).toContain("Reset motion only");
    expect(markup).toContain("Reset sequence only");
    expect((markup.match(/class="outcome-card"/gu) ?? [])).toHaveLength(OUTCOME_RECIPES.length);
    expect(markup).toContain('data-outcome="casino-reveal" aria-pressed="true"');
  });

  it("shows owned drift as Custom without treating Look or media edits as motion drift", () => {
    const base = createDefaultDriftProjectV4("picker-custom", "2026-08-24T00:00:00.000Z");
    const smooth = applyOutcomeRecipe(base, "smooth-carousel");
    const lookEdited = {
      ...smooth,
      atmosphere: { ...smooth.atmosphere, intensity: smooth.atmosphere.intensity + 0.01 },
    };
    const motionEdited = {
      ...smooth,
      motion: { ...smooth.motion, path: { ...smooth.motion.path, gap: smooth.motion.path.gap + 0.01 } },
    };

    const lookMarkup = renderToStaticMarkup(
      <OutcomeRecipePicker
        project={lookEdited}
        safeDefaultReady={false}
        onApply={() => undefined}
        onRestoreSafeDefault={() => undefined}
        onResetMotion={() => undefined}
        onResetSequence={() => undefined}
      />,
    );
    expect(lookMarkup).toContain("Current · <strong>Smooth Carousel</strong>");

    const motionMarkup = renderToStaticMarkup(
      <OutcomeRecipePicker
        project={motionEdited}
        safeDefaultReady={false}
        onApply={() => undefined}
        onRestoreSafeDefault={() => undefined}
        onResetMotion={() => undefined}
        onResetSequence={() => undefined}
      />,
    );
    expect(motionMarkup).toContain("Current · <strong>Custom</strong>");
  });
});
