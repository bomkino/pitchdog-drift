import { describe, expect, it } from "vitest";
import {
  applyProjectV4Command,
  undoProjectV4Command,
} from "../src/core/commands/projectCommand";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { resolveMovingMedia } from "../src/core/project/movingMedia";
import {
  DRIFT_V2_RENDER_CONTRACT,
  type DriftProjectV4,
} from "../src/core/project/schema";
import { validateDriftProjectV4 } from "../src/core/project/validation";
import { createProjectRevisionState } from "../src/core/project/revisions";
import {
  OUTCOME_RECIPES,
  OUTCOME_RECIPE_EXTENSION_KEY,
  OUTCOME_RECIPE_IDS,
  applyOutcomeRecipe,
  applyOutcomeRecipeCommand,
  applySafeStartOutcome,
  detectOutcomeRecipe,
  resetMotion,
  resetMotionCommand,
  resetSequence,
  resetSequenceCommand,
} from "../src/core/recipes/outcomeRecipes";
import { evaluateV2Frame } from "../src/core/timeline/evaluateV2Frame";
import { resolveMovementGrammar } from "../src/core/timeline/movementGrammar";
import { compileSequence } from "../src/core/timeline/sequenceCompiler";
import { readSequenceAuthoring } from "../src/core/timeline/sequenceAuthoring";
import { readTimingIntent } from "../src/core/timeline/timingIntent";

const NOW = "2026-08-24T00:00:00.000Z";
const LATER = "2026-08-24T00:01:00.000Z";

function fixture(slideCount = 6): DriftProjectV4 {
  const project = createDefaultDriftProjectV4(
    "outcome-recipes",
    NOW,
    73,
    DRIFT_V2_RENDER_CONTRACT,
  );
  project.motion.transport.axis = "horizontal";
  project.motion.transport.direction = 1;
  project.motion.transport.slidesPerSecond = 0.47;
  project.motion.seamless = { enabled: true, loops: 3 };
  project.extensions["someone.else"] = { retained: ["exactly", 17] };
  for (let index = 0; index < slideCount; index += 1) {
    const id = `slide-${index}`;
    project.media.order.push(id);
    project.media.assets[id] = {
      id,
      name: `${id}.png`,
      kind: "image",
      mimeType: "image/png",
      hash: (index + 1).toString(16).padStart(64, "0"),
      byteLength: index + 1,
      width: 1920,
      height: 1080,
    };
    project.slides[id] = {
      assetId: id,
      fit: "cover",
      focalX: 0.5,
      focalY: 0.5,
      scaleOffset: 0,
    };
  }
  if (slideCount > 0) {
    project.presenter = {
      ...project.presenter,
      enabled: true,
      assetId: "slide-0",
      trackMode: "pinned-only",
      x: 0.78,
      y: 0.22,
      width: 0.29,
    };
  }
  return validateDriftProjectV4(project);
}

function protectedState(project: DriftProjectV4) {
  return structuredClone({
    composition: project.composition,
    media: project.media,
    slides: project.slides,
    card: project.card,
    material: project.material,
    lighting: project.lighting,
    atmosphere: project.atmosphere,
    lens: project.lens,
    sound: project.sound,
    presenter: project.presenter,
    provenance: project.provenance,
    masterDelivery: {
      fps: project.master.fps,
      reducedMotion: project.master.reducedMotion,
      video: project.master.video,
      audio: project.master.audio,
    },
    axis: project.motion.transport.axis,
    direction: project.motion.transport.direction,
    slidesPerSecond: project.motion.transport.slidesPerSecond,
    seamless: project.motion.seamless,
    take: project.motion.performance.take,
    reducedMotion: project.performance.reducedMotion,
  });
}

function evaluatedSamples(project: DriftProjectV4) {
  const moving = resolveMovingMedia(project);
  return [0.13, 0.31, 0.57, 0.83].map((fraction) => {
    const frame = evaluateV2Frame(
      project,
      moving.order,
      project.master.duration * fraction,
      { previousTime: null },
    ).frame;
    return [
      frame.track.rawDistance,
      frame.track.visibleDistance,
      frame.track.velocity,
      frame.track.acceleration,
      frame.cadence.beat,
      ...frame.slides.slice(0, 3).flatMap((slide) => [
        slide.primary,
        slide.cross,
        slide.z,
        slide.rotationX,
        slide.rotationY,
        slide.rotationZ,
        slide.scale,
        slide.opacity,
      ]),
    ];
  });
}

describe("outcome recipe contract", () => {
  it("declares four complete, typed outcomes with exact ownership summaries", () => {
    expect(OUTCOME_RECIPES.map(({ id }) => id)).toEqual(OUTCOME_RECIPE_IDS);
    for (const recipe of OUTCOME_RECIPES) {
      expect(recipe.ownedDomains).toEqual(["motion", "performance", "timing", "sequence"]);
      expect(recipe.ownedPaths).toContain("master.duration");
      expect(recipe.ownedPaths).toContain("motion.path");
      expect(recipe.ownedPaths).toContain("performance.entry");
      expect(recipe.ownedPaths).toContain("extensions.dog.pitch.drift.sequence");
      expect(recipe.changesSummary).toMatch(/Changes Motion, Performance, Timing, and Sequence/u);
      expect(recipe.axisCompatibility).toBe("horizontal-and-vertical");
    }
  });

  it("applies every outcome without touching appearance, source media, pin, sound, or axis", () => {
    for (const id of OUTCOME_RECIPE_IDS) {
      const source = fixture();
      const before = structuredClone(source);
      const protectedBefore = protectedState(source);
      const applied = applyOutcomeRecipe(source, id);

      expect(source).toEqual(before);
      expect(protectedState(applied)).toEqual(protectedBefore);
      expect(applied.extensions["someone.else"]).toEqual({ retained: ["exactly", 17] });
      expect(applied.performance.entry).toEqual({ enabled: false });
      expect(applied.performance.exit).toEqual({ enabled: false });
      expect(applied.performance.repeat).toEqual({ mode: "off" });
      expect(detectOutcomeRecipe(applied)).toBe(id);
    }
  });

  it("makes every recipe perceptually distinct at multiple evaluated samples", () => {
    const samples = new Map(OUTCOME_RECIPE_IDS.map((id) => [
      id,
      evaluatedSamples(applyOutcomeRecipe(fixture(), id)),
    ]));
    for (let left = 0; left < OUTCOME_RECIPE_IDS.length; left += 1) {
      for (let right = left + 1; right < OUTCOME_RECIPE_IDS.length; right += 1) {
        const first = samples.get(OUTCOME_RECIPE_IDS[left]!)!;
        const second = samples.get(OUTCOME_RECIPE_IDS[right]!)!;
        const changedSampleCount = first.filter((sample, index) => (
          JSON.stringify(sample) !== JSON.stringify(second[index])
        )).length;
        expect(changedSampleCount).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("makes Smooth Carousel one complete uninterrupted readable pass", () => {
    const source = fixture();
    const appearance = protectedState(source);
    const project = applyOutcomeRecipe(source, "smooth-carousel");
    const moving = resolveMovingMedia(project);

    expect(resolveMovementGrammar(project).grammar).toBe("continuous-glide");
    expect(readSequenceAuthoring(project).authoring).toMatchObject({
      repeatCount: 1,
      groups: [{ passes: 1, pace: "read", relativeSecondsPerPass: 1 }],
    });
    expect(project.master.duration).toBeCloseTo(moving.count * 0.9, 12);
    expect(protectedState(project)).toEqual(appearance);
    for (let index = 1; index < Math.floor(project.master.duration * 240); index += 1) {
      const frame = evaluateV2Frame(project, moving.order, index / 240, {
        previousTime: null,
      }).frame;
      expect(frame.track.velocity).toBeGreaterThan(1e-9);
      expect(frame.track.resting).toBe(false);
      expect(frame.cadence.poseIndex).toBeNull();
    }
    const end = evaluateV2Frame(project, moving.order, project.master.duration, {
      previousTime: null,
    }).frame;
    expect(end.track.rawDistance).toBeCloseTo(moving.count, 10);
  });

  it("authors Casino Reveal as exact FAST ×2, READ ×1, FAST ×1 groups", () => {
    const project = applyOutcomeRecipe(fixture(), "casino-reveal");
    const authoring = readSequenceAuthoring(project).authoring!;
    expect(authoring.groups).toEqual([
      expect.objectContaining({ id: "fast-open", label: "FAST ×2", passes: 2, pace: "fast" }),
      expect.objectContaining({ id: "read-reveal", label: "READ ×1", passes: 1, pace: "read" }),
      expect.objectContaining({ id: "fast-close", label: "FAST ×1", passes: 1, pace: "fast" }),
    ]);
    const compiled = compileSequence(authoring, {
      bodyDurationSeconds: project.performance.body.durationSeconds,
      movingSlideCount: resolveMovingMedia(project).count,
    });
    expect(compiled.passes.map(({ pace }) => pace)).toEqual(["fast", "fast", "read", "fast"]);
    expect(compiled.totalPasses).toBe(4);
  });

  it("applies and undoes every recipe through real project commands byte-equivalently", () => {
    for (const id of OUTCOME_RECIPE_IDS) {
      const source = fixture();
      const beforeBytes = JSON.stringify(source);
      const command = applyOutcomeRecipeCommand(id);
      const applied = applyProjectV4Command(
        source,
        createProjectRevisionState(),
        command,
        LATER,
      );
      expect(applied.receipt.ownedDomains).toEqual([
        "motion",
        "performance",
        "master",
        "compatibility",
      ]);
      expect(applied.receipt.changedPaths.some((path) => path.startsWith("performance.entry")))
        .toBe(true);
      const undone = undoProjectV4Command(
        applied.project,
        applied.revision,
        source,
        command,
      );
      expect(JSON.stringify(undone.project)).toBe(beforeBytes);
      expect(undone.receipt.commandId).toBe(`history.undo.outcome-recipe.${id}`);
    }
  });

  it("derives Custom only from recipe-owned drift", () => {
    const applied = applyOutcomeRecipe(fixture(), "smooth-carousel");
    const unowned = structuredClone(applied);
    unowned.atmosphere.intensity = 0.13;
    unowned.lighting.enabled = false;
    unowned.presenter.x = 0.18;
    unowned.motion.transport.axis = "vertical";
    unowned.motion.transport.direction = -1;
    unowned.motion.transport.slidesPerSecond = 7.5;
    unowned.motion.seamless.loops = 17;
    unowned.motion.performance.take = 991;
    unowned.performance = { ...unowned.performance, reducedMotion: true };
    unowned.master.fps = 60;
    const newId = "slide-added-later";
    unowned.media.order.push(newId);
    unowned.media.assets[newId] = {
      id: newId,
      name: "Later.png",
      kind: "image",
      mimeType: "image/png",
      hash: "f".repeat(64),
      byteLength: 33,
      width: 1080,
      height: 1920,
    };
    unowned.slides[newId] = {
      assetId: newId,
      fit: "contain",
      focalX: 0.4,
      focalY: 0.6,
      scaleOffset: 0,
    };
    expect(detectOutcomeRecipe(unowned)).toBe("smooth-carousel");

    const owned = structuredClone(unowned);
    owned.motion.path.curvature += 0.01;
    expect(detectOutcomeRecipe(owned)).toBe("custom");

    const malformed = structuredClone(applied);
    malformed.extensions[OUTCOME_RECIPE_EXTENSION_KEY] = {
      schemaVersion: 1,
      id: "smooth-carousel",
      ownedFingerprint: "forged",
    };
    expect(detectOutcomeRecipe(malformed)).toBe("custom");
  });

  it("keeps Reset Motion and Reset Sequence scopes exact and command-owned", () => {
    const casino = applyOutcomeRecipe(fixture(), "casino-reveal");
    const casinoBefore = structuredClone(casino);
    const motionReset = resetMotion(casino);
    expect(casino).toEqual(casinoBefore);
    expect(motionReset.master).toEqual(casino.master);
    expect(motionReset.media).toEqual(casino.media);
    expect(motionReset.slides).toEqual(casino.slides);
    expect(motionReset.presenter).toEqual(casino.presenter);
    expect(motionReset.atmosphere).toEqual(casino.atmosphere);
    expect(motionReset.sound).toEqual(casino.sound);
    expect(readSequenceAuthoring(motionReset)).toEqual(readSequenceAuthoring(casino));
    expect(readTimingIntent(motionReset)).toEqual(readTimingIntent(casino));
    expect(resolveMovementGrammar(motionReset).grammar).toBe("continuous-glide");
    expect(detectOutcomeRecipe(motionReset)).toBe("custom");

    const editorial = applyOutcomeRecipe(fixture(), "editorial-holds");
    const sequenceReset = resetSequence(editorial);
    expect(sequenceReset.motion).toEqual(editorial.motion);
    expect(sequenceReset.performance).toEqual(editorial.performance);
    expect(sequenceReset.master).toEqual(editorial.master);
    expect(sequenceReset.media).toEqual(editorial.media);
    expect(sequenceReset.presenter).toEqual(editorial.presenter);
    expect(resolveMovementGrammar(sequenceReset)).toEqual(resolveMovementGrammar(editorial));
    expect(readSequenceAuthoring(sequenceReset).authoring).toMatchObject({
      repeatCount: 1,
      groups: [{ id: "reset-read", passes: 1, pace: "read" }],
    });
    expect(readTimingIntent(sequenceReset).intent).toEqual({
      schemaVersion: 1,
      mode: "fixed-master",
      secondsPerSlide: 0.75,
    });
    expect(detectOutcomeRecipe(sequenceReset)).toBe("custom");

    const motionCommand = resetMotionCommand();
    const sequenceCommand = resetSequenceCommand();
    expect(motionCommand.ownedDomains).toEqual(["motion", "performance", "compatibility"]);
    expect(sequenceCommand.ownedDomains).toEqual(["compatibility"]);
    expect(applyProjectV4Command(
      casino,
      createProjectRevisionState(),
      motionCommand,
      LATER,
    ).receipt.changed).toBe(true);
    expect(applyProjectV4Command(
      editorial,
      createProjectRevisionState(),
      sequenceCommand,
      LATER,
    ).receipt.changed).toBe(true);
  });

  it("keeps every recipe finite in horizontal 16:9 and vertical 9:16", () => {
    const cases = [
      { axis: "horizontal" as const, width: 1920, height: 1080 },
      { axis: "vertical" as const, width: 1080, height: 1920 },
    ];
    for (const id of OUTCOME_RECIPE_IDS) {
      for (const sample of cases) {
        const source = fixture();
        source.motion.transport.axis = sample.axis;
        source.composition = { ...source.composition, width: sample.width, height: sample.height };
        const project = applyOutcomeRecipe(source, id);
        const moving = resolveMovingMedia(project);
        expect(project.motion.transport.axis).toBe(sample.axis);
        for (const fraction of [0, 0.19, 0.5, 0.81, 1]) {
          const frame = evaluateV2Frame(
            project,
            moving.order,
            project.master.duration * fraction,
            { previousTime: null },
          ).frame;
          const numbers = [
            frame.track.rawDistance,
            frame.track.visibleDistance,
            frame.track.velocity,
            frame.track.acceleration,
            ...frame.slides.flatMap((slide) => [
              slide.primary,
              slide.cross,
              slide.z,
              slide.rotationX,
              slide.rotationY,
              slide.rotationZ,
              slide.scale,
              slide.opacity,
            ]),
          ];
          expect(numbers.every(Number.isFinite)).toBe(true);
        }
      }
    }
  });

  it("keeps empty and pinned-only safe starts valid without inventing moving media", () => {
    for (const source of [fixture(0), fixture(1)]) {
      const movingBefore = resolveMovingMedia(source).count;
      expect(movingBefore).toBe(0);
      for (const id of OUTCOME_RECIPE_IDS) {
        const applied = applyOutcomeRecipe(source, id);
        expect(resolveMovingMedia(applied).count).toBe(0);
        expect(applied.master.duration).toBe(source.master.duration);
        expect(validateDriftProjectV4(applied)).toEqual(applied);
      }
    }
  });

  it("exposes Smooth as an opt-in safe start without migrating legacy defaults", () => {
    const source = fixture();
    const before = structuredClone(source);
    expect(detectOutcomeRecipe(source)).toBe("custom");
    const safe = applySafeStartOutcome(source);
    expect(source).toEqual(before);
    expect(detectOutcomeRecipe(safe)).toBe("smooth-carousel");
  });
});
