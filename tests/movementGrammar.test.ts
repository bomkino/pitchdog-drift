import { describe, expect, it } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { resolveMovingMedia } from "../src/core/project/movingMedia";
import {
  DRIFT_V2_RENDER_CONTRACT,
  type DriftProjectV4,
} from "../src/core/project/schema";
import { validateDriftProjectV4 } from "../src/core/project/validation";
import { buildDeliveryReceipt } from "../src/core/timeline/deliveryReceipt";
import { evaluateV2Frame } from "../src/core/timeline/evaluateV2Frame";
import {
  createMovementGrammarAuthoring,
  MOVEMENT_GRAMMAR_EXTENSION_KEY,
  parseMovementGrammarExtension,
  resolveMovementGrammar,
  withMovementGrammar,
  type MovementGrammar,
} from "../src/core/timeline/movementGrammar";
import { createPerformanceLifecycle } from "../src/core/timeline/performanceLifecycle";
import {
  withSequenceAuthoring,
  type SequenceAuthoring,
} from "../src/core/timeline/sequenceAuthoring";

const NOW = "2026-08-24T00:00:00.000Z";
const GRAMMARS: readonly MovementGrammar[] = [
  "continuous-glide",
  "editorial-holds",
  "handcrafted",
];
const SEQUENCE: SequenceAuthoring = {
  schemaVersion: 1,
  groups: [
    {
      id: "fast-open",
      label: "FAST ×2",
      passes: 2,
      pace: "fast",
      relativeSecondsPerPass: 0.25,
    },
    {
      id: "read",
      label: "READ ×1",
      passes: 1,
      pace: "read",
      relativeSecondsPerPass: 1,
    },
    {
      id: "fast-close",
      label: "FAST ×1",
      passes: 1,
      pace: "fast",
      relativeSecondsPerPass: 0.25,
    },
  ],
  repeatCount: 1,
};

function fixture(slideCount = 4, withSequence = true): DriftProjectV4 {
  const project = createDefaultDriftProjectV4(
    "movement-grammar",
    NOW,
    91,
    DRIFT_V2_RENDER_CONTRACT,
  );
  project.master.duration = 10;
  project.master.fps = 24;
  project.motion.transport.direction = 1;
  project.motion.seamless.enabled = false;
  project.motion.seamless.loops = 1;
  project.motion.cadence = {
    ...project.motion.cadence,
    read: 0.25,
    anticipation: 0.1,
    carry: 0.2,
    impact: 0.1,
    settle: 0.15,
    land: 0.2,
    poseCadence: "12fps",
  };
  project.performance = createPerformanceLifecycle({
    entry: { enabled: false },
    body: { durationSeconds: 10, tempo: { kind: "preset", preset: "even" } },
    exit: { enabled: false },
    repeat: { mode: "off" },
  }).authoring;
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
  return withSequence ? withSequenceAuthoring(project, SEQUENCE) : project;
}

function authored(project: DriftProjectV4, grammar: MovementGrammar): DriftProjectV4 {
  return withMovementGrammar(project, { schemaVersion: 1, grammar });
}

function receipt(project: DriftProjectV4) {
  const moving = resolveMovingMedia(project);
  return buildDeliveryReceipt({
    project,
    movingMediaOrder: moving.order,
    exportSettings: {
      width: project.composition.width,
      height: project.composition.height,
      fps: project.master.fps,
      duration: project.master.duration,
      container: "mp4",
    },
    eventPlan: [],
    lifecycle: createPerformanceLifecycle(project.performance),
  });
}

function signature(project: DriftProjectV4): readonly number[] {
  const moving = resolveMovingMedia(project);
  const times = [0.137, 0.619, 1.381, 2.777, 4.123, 6.731, 8.913];
  return times.flatMap((time) => {
    const frame = evaluateV2Frame(project, moving.order, time, { previousTime: null }).frame;
    return [
      frame.track.rawDistance,
      frame.track.visibleDistance,
      frame.track.velocity,
      frame.cadence.poseIndex ?? -1,
    ];
  });
}

describe("movement grammar persistence", () => {
  it("strictly accepts only three explicit grammars", () => {
    for (const grammar of GRAMMARS) {
      expect(createMovementGrammarAuthoring({ schemaVersion: 1, grammar })).toEqual({
        schemaVersion: 1,
        grammar,
      });
    }
    expect(parseMovementGrammarExtension({ schemaVersion: 2, grammar: "continuous-glide" }))
      .toBeNull();
    expect(parseMovementGrammarExtension({ schemaVersion: 1, grammar: "fluid" })).toBeNull();
    expect(parseMovementGrammarExtension({
      schemaVersion: 1,
      grammar: "continuous-glide",
      future: true,
    })).toBeNull();
  });

  it("writes only its namespace and survives canonical V4 validation", () => {
    const project = fixture();
    project.extensions["someone.else"] = { retained: true };
    const before = structuredClone(project);
    const next = authored(project, "continuous-glide");

    expect(next.extensions["someone.else"]).toEqual({ retained: true });
    expect(next.extensions[MOVEMENT_GRAMMAR_EXTENSION_KEY]).toEqual({
      schemaVersion: 1,
      grammar: "continuous-glide",
    });
    expect(project).toEqual(before);
    expect(resolveMovementGrammar(next)).toMatchObject({
      grammar: "continuous-glide",
      status: "stored",
    });
    expect(validateDriftProjectV4(next).extensions[MOVEMENT_GRAMMAR_EXTENSION_KEY])
      .toEqual(next.extensions[MOVEMENT_GRAMMAR_EXTENSION_KEY]);
  });

  it("resolves missing and malformed data to legacy without changing evaluation", () => {
    for (const sequencePresent of [false, true]) {
      const missing = fixture(4, sequencePresent);
      const malformed = structuredClone(missing);
      malformed.extensions[MOVEMENT_GRAMMAR_EXTENSION_KEY] = {
        schemaVersion: 1,
        grammar: "unknown",
      };
      expect(resolveMovementGrammar(missing)).toEqual({
        authoring: null,
        grammar: "legacy",
        status: "missing",
      });
      expect(resolveMovementGrammar(malformed)).toEqual({
        authoring: null,
        grammar: "legacy",
        status: "malformed",
      });
      for (const time of [0, 0.137, 1.75, 4.219, 9.999, 10]) {
        expect(evaluateV2Frame(malformed, malformed.media.order, time, { previousTime: null }))
          .toEqual(evaluateV2Frame(missing, missing.media.order, time, { previousTime: null }));
      }
    }
  });
});

describe("movement grammar evaluation", () => {
  it("gives every public grammar a causal evaluated-motion consequence", () => {
    const base = fixture();
    const signatures = new Map(GRAMMARS.map((grammar) => [
      grammar,
      signature(authored(base, grammar)),
    ]));

    expect(signatures.get("continuous-glide")).not.toEqual(signatures.get("editorial-holds"));
    expect(signatures.get("editorial-holds")).not.toEqual(signatures.get("handcrafted"));
    expect(signatures.get("continuous-glide")).not.toEqual(signatures.get("handcrafted"));
  });

  it("contains no zero-velocity body interval in Continuous Glide", () => {
    const project = authored(fixture(), "continuous-glide");
    const moving = resolveMovingMedia(project);
    for (let frame = 1; frame < project.master.duration * 240; frame += 1) {
      const time = frame / 240;
      const evaluation = evaluateV2Frame(project, moving.order, time, { previousTime: null });
      expect(evaluation.frame.track.velocity).toBeGreaterThan(1e-9);
      expect(evaluation.frame.track.resting).toBe(false);
      expect(evaluation.frame.cadence.poseIndex).toBeNull();
    }
  });

  it("keeps horizontal/vertical and 9:16/16:9 motion finite", () => {
    const cases = [
      { axis: "vertical" as const, width: 1080, height: 1920 },
      { axis: "horizontal" as const, width: 1920, height: 1080 },
    ];
    for (const grammar of GRAMMARS) {
      for (const sample of cases) {
        const project = authored(fixture(), grammar);
        project.motion.transport.axis = sample.axis;
        project.composition = {
          ...project.composition,
          width: sample.width,
          height: sample.height,
        };
        const moving = resolveMovingMedia(project);
        const frame = evaluateV2Frame(project, moving.order, 4.321, { previousTime: null }).frame;
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
        expect(numbers.length).toBeGreaterThan(8);
        expect(numbers.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it("keeps sequence pass/group timing invariant while pose exposure changes samples", () => {
    const continuousPose = authored(fixture(), "handcrafted");
    continuousPose.motion.cadence.poseCadence = "continuous";
    const twelvePose = structuredClone(continuousPose);
    twelvePose.motion.cadence.poseCadence = "12fps";

    const continuousReceipt = receipt(continuousPose);
    const twelveReceipt = receipt(twelvePose);
    expect(twelveReceipt.passes.boundaries).toEqual(continuousReceipt.passes.boundaries);
    expect(twelveReceipt.passes.groups).toEqual(continuousReceipt.passes.groups);
    expect(twelveReceipt.segments).toEqual(continuousReceipt.segments);

    const moving = resolveMovingMedia(continuousPose);
    const time = 2.137;
    const continuousFrame = evaluateV2Frame(
      continuousPose,
      moving.order,
      time,
      { previousTime: null },
    ).frame;
    const twelveFrame = evaluateV2Frame(
      twelvePose,
      moving.order,
      time,
      { previousTime: null },
    ).frame;
    expect(twelveFrame.track.rawDistance).not.toBe(continuousFrame.track.rawDistance);
    expect(twelveFrame.cadence.poseIndex).toBe(Math.floor(time * 12));
    expect(continuousFrame.cadence.poseIndex).toBeNull();
  });

  it("lets grammar—not sequence presence—decide cadence remapping", () => {
    const sequenceProject = fixture();
    const noSequenceProject = fixture(4, false);
    const time = 0.2;
    for (const source of [sequenceProject, noSequenceProject]) {
      const glide = authored(source, "continuous-glide");
      const holds = authored(source, "editorial-holds");
      const glideFrame = evaluateV2Frame(glide, glide.media.order, time, { previousTime: null }).frame;
      const holdsFrame = evaluateV2Frame(holds, holds.media.order, time, { previousTime: null }).frame;
      expect(glideFrame.track.visibleDistance).toBe(glideFrame.track.rawDistance);
      expect(holdsFrame.track.visibleDistance).not.toBe(holdsFrame.track.rawDistance);
    }
  });
});
