import { describe, expect, it } from "vitest";
import {
  createPerformanceLifecycle,
  createPerformanceLifecycleFromPreset,
  evaluatePerformanceLifecycle,
  PerformanceLifecycleAuthoringError,
  TRANSITION_PRESET_ORDER,
  TRANSITION_PRESETS,
  type PerformanceLifecycleAuthoring,
  type TransitionAuthoring,
} from "../src/core/timeline/performanceLifecycle";

const ENTRY: TransitionAuthoring = {
  enabled: true,
  durationSeconds: 2,
  treatment: "lift",
  curve: "linear",
  background: { lead: 0, span: 0.5 },
  slides: { lead: 0.25, span: 0.5, stagger: 0.25, order: "forward" },
};

const EXIT: TransitionAuthoring = {
  enabled: true,
  durationSeconds: 1,
  treatment: "fade",
  curve: "linear",
  background: { lead: 0.5, span: 0.5 },
  slides: { lead: 0, span: 0.5, stagger: 0.5, order: "reverse" },
};

function authoring(
  repeat: PerformanceLifecycleAuthoring["repeat"] = { mode: "off" },
  overrides: Partial<PerformanceLifecycleAuthoring> = {},
): PerformanceLifecycleAuthoring {
  return {
    entry: ENTRY,
    body: { durationSeconds: 4, tempo: { kind: "preset", preset: "even" } },
    exit: EXIT,
    repeat,
    ...overrides,
  };
}

describe("performance lifecycle", () => {
  it("derives exact entry/body/exit boundaries without cramming duration", () => {
    const timeline = createPerformanceLifecycle(authoring({ mode: "body", count: 3 }));

    expect(timeline).toMatchObject({
      repeatMode: "body",
      repeatCount: 3,
      sceneCount: 1,
      bodyCycleCount: 3,
      sceneDuration: 15,
      totalDuration: 15,
    });
    expect(timeline.scenes[0]).toMatchObject({
      start: 0,
      end: 15,
      entry: { start: 0, end: 2, duration: 2 },
      exit: { start: 14, end: 15, duration: 1 },
    });
    expect(timeline.bodyCycles).toEqual([
      { start: 2, end: 6, duration: 4, index: 0, indexInScene: 0, sceneIndex: 0 },
      { start: 6, end: 10, duration: 4, index: 1, indexInScene: 1, sceneIndex: 0 },
      { start: 10, end: 14, duration: 4, index: 2, indexInScene: 2, sceneIndex: 0 },
    ]);
  });

  it("maps every exact boundary to the next segment and preserves the final endpoint", () => {
    const timeline = createPerformanceLifecycle(authoring({ mode: "body", count: 2 }));

    expect(evaluatePerformanceLifecycle(timeline, 0)).toMatchObject({
      phase: "entry",
      segment: { progress: 0 },
      body: { cycleIndex: 0, clockProgress: 0, travelProgress: 0 },
    });
    expect(evaluatePerformanceLifecycle(timeline, 2)).toMatchObject({
      phase: "body",
      segment: { start: 2, progress: 0 },
      body: { cycleIndex: 0, clockProgress: 0, travelProgress: 0 },
    });
    expect(evaluatePerformanceLifecycle(timeline, 6)).toMatchObject({
      phase: "body",
      segment: { start: 6, progress: 0 },
      body: { cycleIndex: 1, clockProgress: 0, cumulativeTravel: 1 },
    });
    expect(evaluatePerformanceLifecycle(timeline, 10)).toMatchObject({
      phase: "exit",
      segment: { start: 10, progress: 0 },
      body: { cycleIndex: 1, clockProgress: 1, travelProgress: 1, cumulativeTravel: 2 },
    });
    expect(evaluatePerformanceLifecycle(timeline, 11)).toMatchObject({
      phase: "complete",
      atEnd: true,
      time: 11,
      segment: { start: 11, end: 11, duration: 0, progress: 1 },
      body: { cycleIndex: 1, clockProgress: 1, travelProgress: 1, cumulativeTravel: 2 },
    });
    expect(evaluatePerformanceLifecycle(timeline, 11, 2).layers.slides).toEqual([
      { visibility: 0, progress: 1, motionProgress: 0, active: false },
      { visibility: 0, progress: 1, motionProgress: 0, active: false },
    ]);
  });

  it("runs entry once, body N times, and exit once for body repeats", () => {
    const timeline = createPerformanceLifecycle(authoring({ mode: "body", count: 3 }));
    expect(timeline.scenes).toHaveLength(1);
    expect(timeline.scenes[0]!.bodies).toHaveLength(3);

    const phases = [0, 2, 6, 10, 14, 15]
      .map((time) => evaluatePerformanceLifecycle(timeline, time).phase);
    expect(phases).toEqual(["entry", "body", "body", "body", "exit", "complete"]);
  });

  it("repeats complete entry/body/exit scenes for full-scene mode", () => {
    const timeline = createPerformanceLifecycle(authoring({ mode: "full-scene", count: 3 }));

    expect(timeline.sceneDuration).toBe(7);
    expect(timeline.totalDuration).toBe(21);
    expect(timeline.scenes).toHaveLength(3);
    expect(timeline.bodyCycles).toHaveLength(3);
    expect(timeline.scenes.map(({ start, end }) => [start, end])).toEqual([[0, 7], [7, 14], [14, 21]]);

    expect(evaluatePerformanceLifecycle(timeline, 6.999)).toMatchObject({ phase: "exit", scene: { index: 0 } });
    expect(evaluatePerformanceLifecycle(timeline, 7)).toMatchObject({
      phase: "entry",
      scene: { index: 1, time: 0, progress: 0 },
      body: { cycleIndex: 1, clockProgress: 0, cumulativeTravel: 1 },
    });
    expect(evaluatePerformanceLifecycle(timeline, 14)).toMatchObject({
      phase: "entry",
      scene: { index: 2 },
      body: { cycleIndex: 2 },
    });
    expect(evaluatePerformanceLifecycle(timeline, 21)).toMatchObject({
      phase: "complete",
      scene: { index: 2, progress: 1 },
      body: { cycleIndex: 2, cumulativeTravel: 3 },
    });
  });

  it("treats repeat off as exactly one scene and one body regardless of duration", () => {
    const timeline = createPerformanceLifecycle(authoring());
    expect(timeline).toMatchObject({
      repeatMode: "off",
      repeatCount: 1,
      sceneCount: 1,
      bodyCycleCount: 1,
      totalDuration: 7,
    });
  });

  it("applies body tempo independently from entry and exit timing", () => {
    const timeline = createPerformanceLifecycle(authoring(
      { mode: "off" },
      { body: { durationSeconds: 4, tempo: { kind: "preset", preset: "fast-slow-fast" } } },
    ));

    const entry = evaluatePerformanceLifecycle(timeline, 1);
    const bodyStart = evaluatePerformanceLifecycle(timeline, 2);
    const bodyQuarter = evaluatePerformanceLifecycle(timeline, 3);
    const bodyMiddle = evaluatePerformanceLifecycle(timeline, 4);
    const exit = evaluatePerformanceLifecycle(timeline, 6.5);

    expect(entry.body).toMatchObject({ clockProgress: 0, travelProgress: 0, velocityPerSecond: 0 });
    expect(bodyStart.body.travelProgress).toBe(0);
    expect(bodyQuarter.body.travelProgress).toBeGreaterThan(0.25);
    expect(bodyMiddle.body.travelProgress).toBeCloseTo(0.5, 14);
    expect(exit.body).toMatchObject({ clockProgress: 1, travelProgress: 1, velocityPerSecond: 0 });
  });

  it("gives background and each slide independent lead and stagger progress", () => {
    const timeline = createPerformanceLifecycle(authoring());
    const early = evaluatePerformanceLifecycle(timeline, 0.5, 3);
    const middle = evaluatePerformanceLifecycle(timeline, 1, 3);
    const end = evaluatePerformanceLifecycle(timeline, 2, 3);

    expect(early.layers.background).toMatchObject({ progress: 0.5, visibility: 0.5 });
    expect(early.layers.slides.map(({ progress }) => progress)).toEqual([0, 0, 0]);
    expect(middle.layers.background).toMatchObject({ progress: 1, visibility: 1 });
    expect(middle.layers.slides.map(({ progress }) => progress)).toEqual([0.5, 0.25, 0]);
    expect(end.layers.slides.map(({ progress }) => progress)).toEqual([1, 1, 1]);

    const exitMiddle = evaluatePerformanceLifecycle(timeline, 6.5, 3);
    expect(exitMiddle.layers.background).toMatchObject({ progress: 0, visibility: 1 });
    expect(exitMiddle.layers.slides.map(({ progress }) => progress)).toEqual([0, 0.5, 1]);
    expect(exitMiddle.layers.slides.map(({ visibility }) => visibility)).toEqual([1, 0.5, 0]);
  });

  it("keeps presenter protected unless each transition explicitly includes it", () => {
    const protectedTimeline = createPerformanceLifecycle(authoring());
    for (const time of [0, 1, 2, 6.5, 7]) {
      expect(evaluatePerformanceLifecycle(protectedTimeline, time).layers.presenter).toMatchObject({
        participates: false,
        visibility: 1,
        motionProgress: 1,
      });
    }

    const includedEntry: TransitionAuthoring = {
      ...ENTRY,
      includePresenter: true,
      presenter: { lead: 0.5, span: 0.5 },
    };
    const includedExit: TransitionAuthoring = {
      ...EXIT,
      includePresenter: true,
      presenter: { lead: 0, span: 1 },
    };
    const included = createPerformanceLifecycle(authoring(
      { mode: "off" },
      { entry: includedEntry, exit: includedExit },
    ));
    expect(evaluatePerformanceLifecycle(included, 0.5).layers.presenter).toMatchObject({
      participates: true,
      visibility: 0,
    });
    expect(evaluatePerformanceLifecycle(included, 1.5).layers.presenter).toMatchObject({
      participates: true,
      visibility: 0.5,
    });
    expect(evaluatePerformanceLifecycle(included, 6.5).layers.presenter).toMatchObject({
      participates: true,
      visibility: 0.5,
    });
    expect(evaluatePerformanceLifecycle(included, 7).layers.presenter).toMatchObject({
      participates: true,
      visibility: 0,
    });
  });

  it("supports entry and exit independently disabled with exact endpoints", () => {
    const noEntry = createPerformanceLifecycle(authoring(
      { mode: "off" },
      { entry: { enabled: false } },
    ));
    expect(noEntry.totalDuration).toBe(5);
    expect(noEntry.scenes[0]!.entry).toBeNull();
    expect(evaluatePerformanceLifecycle(noEntry, 0, 2)).toMatchObject({ phase: "body" });
    expect(evaluatePerformanceLifecycle(noEntry, 0, 2).layers.slides.map(({ visibility }) => visibility))
      .toEqual([1, 1]);

    const noExit = createPerformanceLifecycle(authoring(
      { mode: "off" },
      { exit: { enabled: false } },
    ));
    expect(noExit.totalDuration).toBe(6);
    expect(noExit.scenes[0]!.exit).toBeNull();
    expect(evaluatePerformanceLifecycle(noExit, 6, 2)).toMatchObject({ phase: "complete" });
    expect(evaluatePerformanceLifecycle(noExit, 6, 2).layers.slides.map(({ visibility }) => visibility))
      .toEqual([1, 1]);

    const neither = createPerformanceLifecycle(authoring(
      { mode: "body", count: 2 },
      { entry: { enabled: false }, exit: { enabled: false } },
    ));
    expect(neither.totalDuration).toBe(8);
    expect(evaluatePerformanceLifecycle(neither, 4)).toMatchObject({
      phase: "body",
      body: { cycleIndex: 1, clockProgress: 0 },
    });
  });

  it("keeps every repeat/count/transition boundary contiguous and addressable", () => {
    const repeats = [
      { mode: "off" } as const,
      { mode: "body", count: 1 } as const,
      { mode: "body", count: 4 } as const,
      { mode: "full-scene", count: 1 } as const,
      { mode: "full-scene", count: 4 } as const,
    ];
    for (const repeat of repeats) {
      for (const entryEnabled of [false, true]) {
        for (const exitEnabled of [false, true]) {
          const timeline = createPerformanceLifecycle(authoring(repeat, {
            entry: entryEnabled ? ENTRY : { enabled: false },
            exit: exitEnabled ? EXIT : { enabled: false },
          }));
          expect(timeline.scenes[0]!.start).toBe(0);
          expect(timeline.scenes.at(-1)!.end).toBe(timeline.totalDuration);

          for (const scene of timeline.scenes) {
            const segments = [
              ...(scene.entry ? [scene.entry] : []),
              ...scene.bodies,
              ...(scene.exit ? [scene.exit] : []),
            ];
            expect(segments[0]!.start).toBe(scene.start);
            expect(segments.at(-1)!.end).toBe(scene.end);
            for (let index = 1; index < segments.length; index += 1) {
              expect(segments[index]!.start).toBe(segments[index - 1]!.end);
            }
            for (const body of scene.bodies) {
              expect(evaluatePerformanceLifecycle(timeline, body.start)).toMatchObject({
                phase: "body",
                scene: { index: scene.index },
                body: { cycleIndex: body.index, clockProgress: 0 },
              });
            }
          }
        }
      }
    }
  });

  it("clamps scrub time deterministically while retaining requested time", () => {
    const timeline = createPerformanceLifecycle(authoring());
    expect(evaluatePerformanceLifecycle(timeline, -20)).toMatchObject({ requestedTime: -20, time: 0, phase: "entry" });
    expect(evaluatePerformanceLifecycle(timeline, Number.NaN)).toMatchObject({ requestedTime: 0, time: 0, phase: "entry" });
    expect(evaluatePerformanceLifecycle(timeline, Infinity)).toMatchObject({ requestedTime: 7, time: 7, phase: "complete" });
    expect(evaluatePerformanceLifecycle(timeline, -Infinity)).toMatchObject({ requestedTime: 0, time: 0 });
    for (const hostile of [Number.NaN, Infinity, -Infinity, Number.MAX_VALUE, -Number.MAX_VALUE]) {
      const sample = evaluatePerformanceLifecycle(timeline, hostile);
      expect(Number.isFinite(sample.requestedTime)).toBe(true);
      expect(Number.isFinite(sample.time)).toBe(true);
    }
  });

  it("makes reduced motion retain fades and duration while removing travel and stagger", () => {
    const normal = createPerformanceLifecycle(authoring());
    const reduced = createPerformanceLifecycle(authoring(
      { mode: "off" },
      { reducedMotion: true },
    ));
    expect(reduced.totalDuration).toBe(normal.totalDuration);

    const entry = evaluatePerformanceLifecycle(reduced, 1, 3);
    expect(entry.layers.slides.map(({ progress }) => progress)).toEqual([0.5, 0.5, 0.5]);
    expect(entry.layers.slides.map(({ motionProgress }) => motionProgress)).toEqual([1, 1, 1]);
    expect(entry.layers.slides.map(({ visibility }) => visibility)).toEqual([0.5, 0.5, 0.5]);

    const body = evaluatePerformanceLifecycle(reduced, 4, 3);
    expect(body.body).toMatchObject({
      clockProgress: 0.5,
      travelProgress: 0,
      cumulativeTravel: 0,
      velocityPerSecond: 0,
      accelerationPerSecondSquared: 0,
    });

    const repeated = createPerformanceLifecycle(authoring(
      { mode: "body", count: 2 },
      { reducedMotion: true },
    ));
    expect(evaluatePerformanceLifecycle(repeated, 6).body).toMatchObject({
      cycleIndex: 1,
      travelProgress: 0,
      cumulativeTravel: 0,
    });

    const exit = evaluatePerformanceLifecycle(reduced, 6.5, 3);
    expect(exit.layers.slides.map(({ progress }) => progress)).toEqual([1, 1, 1]);
    expect(exit.layers.slides.map(({ motionProgress }) => motionProgress)).toEqual([1, 1, 1]);
    expect(exit.layers.slides.map(({ visibility }) => visibility)).toEqual([0, 0, 0]);
    expect(evaluatePerformanceLifecycle(reduced, reduced.totalDuration, 1).layers.slides[0]).toEqual({
      visibility: 0,
      progress: 1,
      motionProgress: 1,
      active: false,
    });
  });

  it("preserves authored opacity easing under reduced motion", () => {
    const easedEntry: TransitionAuthoring = {
      ...ENTRY,
      curve: "ease-out",
      background: { lead: 0, span: 1 },
      slides: { lead: 0, span: 0.75, stagger: 0.25, order: "forward" },
      includePresenter: true,
      presenter: { lead: 0, span: 1 },
    };
    const normal = createPerformanceLifecycle(authoring(
      { mode: "off" },
      { entry: easedEntry },
    ));
    const reduced = createPerformanceLifecycle(authoring(
      { mode: "off" },
      { entry: easedEntry, reducedMotion: true },
    ));
    const normalSample = evaluatePerformanceLifecycle(normal, 0.5, 3);
    const reducedSample = evaluatePerformanceLifecycle(reduced, 0.5, 3);

    expect(reducedSample.layers.background.progress).toBe(normalSample.layers.background.progress);
    expect(reducedSample.layers.background.visibility).toBe(normalSample.layers.background.visibility);
    expect(reducedSample.layers.presenter.progress).toBe(normalSample.layers.presenter.progress);
    expect(reducedSample.layers.presenter.visibility).toBe(normalSample.layers.presenter.visibility);
    expect(reducedSample.layers.slides.map(({ progress }) => progress)).toEqual([
      normalSample.layers.slides[0]!.progress,
      normalSample.layers.slides[0]!.progress,
      normalSample.layers.slides[0]!.progress,
    ]);
    expect(reducedSample.layers.slides.map(({ motionProgress }) => motionProgress)).toEqual([1, 1, 1]);
  });

  it("uses stored decimal boundaries for every repeated segment", () => {
    const decimalTransition: TransitionAuthoring = {
      enabled: true,
      durationSeconds: 0.01,
      treatment: "fade",
      curve: "linear",
      background: { lead: 0, span: 1 },
      slides: { lead: 0, span: 1, stagger: 0, order: "forward" },
    };
    for (const repeat of [
      { mode: "body", count: 37 } as const,
      { mode: "full-scene", count: 37 } as const,
    ]) {
      const timeline = createPerformanceLifecycle({
        entry: decimalTransition,
        body: { durationSeconds: 0.01, tempo: { kind: "preset", preset: "even" } },
        exit: decimalTransition,
        repeat,
      });

      let cursor = 0;
      for (const scene of timeline.scenes) {
        expect(scene.start).toBe(cursor);
        expect(evaluatePerformanceLifecycle(timeline, scene.start)).toMatchObject({
          phase: "entry",
          scene: { index: scene.index, time: 0 },
        });
        expect(scene.entry!.start).toBe(scene.start);
        expect(evaluatePerformanceLifecycle(timeline, scene.entry!.end)).toMatchObject({
          phase: "body",
          body: { cycleIndex: scene.bodies[0]!.index, clockProgress: 0 },
        });

        for (let index = 0; index < scene.bodies.length - 1; index += 1) {
          const current = scene.bodies[index]!;
          const next = scene.bodies[index + 1]!;
          expect(next.start).toBe(current.end);
          expect(evaluatePerformanceLifecycle(timeline, current.end)).toMatchObject({
            phase: "body",
            body: { cycleIndex: next.index, clockProgress: 0 },
            segment: { start: next.start, time: 0 },
          });
        }

        expect(scene.exit!.start).toBe(scene.bodies.at(-1)!.end);
        expect(evaluatePerformanceLifecycle(timeline, scene.exit!.start)).toMatchObject({
          phase: "exit",
          segment: { start: scene.exit!.start, time: 0, progress: 0 },
        });
        cursor = scene.end;
      }
      expect(timeline.totalDuration).toBe(cursor);
      expect(evaluatePerformanceLifecycle(timeline, timeline.totalDuration)).toMatchObject({
        phase: "complete",
        atEnd: true,
      });
    }
  });

  it("keeps every authored transition preset valid, frozen, distinct, and presenter-safe", () => {
    const signatures = TRANSITION_PRESET_ORDER.map((id) => {
      const preset = TRANSITION_PRESETS[id];
      expect(Object.isFrozen(preset)).toBe(true);
      const timeline = createPerformanceLifecycleFromPreset(
        id,
        { durationSeconds: 4, tempo: { kind: "preset", preset: "even" } },
      );
      expect(evaluatePerformanceLifecycle(timeline, 0).layers.presenter.participates).toBe(false);
      return JSON.stringify({ entry: preset.entry, exit: preset.exit });
    });
    expect(new Set(signatures).size).toBe(TRANSITION_PRESET_ORDER.length);
  });

  it("retains a chosen transition style while both transition toggles are off", () => {
    const timeline = createPerformanceLifecycle({
      transitionPreset: "projector-open",
      entry: { enabled: false },
      body: { durationSeconds: 4, tempo: { kind: "preset", preset: "even" } },
      exit: { enabled: false },
      repeat: { mode: "off" },
    });
    expect(timeline.authoring.transitionPreset).toBe("projector-open");
    expect(() => createPerformanceLifecycle({
      ...timeline.authoring,
      transitionPreset: "future-style" as never,
    })).toThrow(/transitionPreset.*unknown/u);
  });

  it("is identical for repeated preview/export samples at the same explicit time", () => {
    const timeline = createPerformanceLifecycle(authoring({ mode: "full-scene", count: 4 }));
    for (const time of [0, 0.137, 2, 6.999, 7, 12.345, timeline.totalDuration]) {
      const preview = evaluatePerformanceLifecycle(timeline, time, 17);
      const exported = evaluatePerformanceLifecycle(timeline, time, 17);
      expect(exported).toEqual(preview);
    }
  });

  it("rejects malformed duration, repeat, timing, tempo, flags, and slide count authoring", () => {
    const invalidCases: Array<[string, PerformanceLifecycleAuthoring]> = [
      ["body.durationSeconds", authoring({ mode: "off" }, {
        body: { durationSeconds: 0, tempo: { kind: "preset", preset: "even" } },
      })],
      ["entry.durationSeconds", authoring({ mode: "off" }, {
        entry: { ...ENTRY, durationSeconds: Infinity },
      })],
      ["repeat.count", authoring({ mode: "body", count: 1.5 })],
      ["repeat.count", authoring({ mode: "full-scene", count: 0 })],
      ["entry.background", authoring({ mode: "off" }, {
        entry: { ...ENTRY, background: { lead: 0.75, span: 0.5 } },
      })],
      ["exit.slides", authoring({ mode: "off" }, {
        exit: { ...EXIT, slides: { lead: 0.2, span: 0.5, stagger: 0.4, order: "forward" } },
      })],
      ["body.tempo", authoring({ mode: "off" }, {
        body: { durationSeconds: 4, tempo: { kind: "custom", envelope: { start: 1, middle: -1, finish: 1 } } },
      })],
      ["reducedMotion", { ...authoring(), reducedMotion: "yes" as unknown as boolean }],
    ];

    for (const [path, invalid] of invalidCases) {
      expect(() => createPerformanceLifecycle(invalid), path).toThrow();
    }

    const timeline = createPerformanceLifecycle(authoring());
    for (const invalidCount of [-1, 1.5, 10_001, NaN]) {
      expect(() => evaluatePerformanceLifecycle(timeline, 0, invalidCount)).toThrow(PerformanceLifecycleAuthoringError);
    }
  });

  it("rejects unknown tempo discriminants and presets with typed lifecycle errors", () => {
    for (const tempo of [
      { kind: "elastic", preset: "even" },
      { kind: "preset", preset: "not-real" },
    ]) {
      try {
        createPerformanceLifecycle(authoring(
          { mode: "off" },
          { body: { durationSeconds: 4, tempo: tempo as PerformanceLifecycleAuthoring["body"]["tempo"] } },
        ));
        throw new Error("Expected hostile tempo authoring to fail.");
      } catch (error) {
        expect(error).toBeInstanceOf(PerformanceLifecycleAuthoringError);
        expect((error as PerformanceLifecycleAuthoringError).path).toMatch(/^body\.tempo/);
      }
    }
  });
});
