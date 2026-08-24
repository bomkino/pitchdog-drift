import { describe, expect, it } from "vitest";
import { createPerformanceLifecycle } from "../src/core/timeline/performanceLifecycle";
import { evaluatePerformanceTravel } from "../src/core/timeline/renderTravel";
import {
  CAROUSEL_INTERACTION_FIXED_STEP_SECONDS,
  CAROUSEL_INTERACTION_SETTLING_ANGULAR_FREQUENCY,
  CarouselInteractionController,
} from "../src/engine/carouselInteraction";

function advanceFrames(
  controller: CarouselInteractionController,
  rate: 60 | 120 | 240,
  seconds: number,
): void {
  const frameCount = Math.round(rate * seconds);
  for (let frame = 0; frame < frameCount; frame += 1) controller.advance(1 / rate);
}

describe("carousel preview interaction authority", () => {
  it("converges on the same fixed-clock state at 60, 120, and 240 Hz", () => {
    const states = ([60, 120, 240] as const).map((rate) => {
      const controller = new CarouselInteractionController();
      controller.addWheelDistance(480);
      advanceFrames(controller, rate, 0.75);
      return controller.snapshot();
    });

    for (const state of states.slice(1)) {
      expect(state.position).toBeCloseTo(states[0]!.position, 12);
      expect(state.target).toBe(states[0]!.target);
      expect(state.velocity).toBeCloseTo(states[0]!.velocity, 12);
    }
  });

  it("retargets and reverses without teleporting presentation state", () => {
    const controller = new CarouselInteractionController();
    controller.addWheelDistance(500);
    advanceFrames(controller, 120, 0.2);
    const beforeReversal = controller.snapshot();

    controller.addWheelDistance(-900);
    const retargeted = controller.snapshot();
    expect(retargeted.position).toBe(beforeReversal.position);
    expect(retargeted.velocity).toBe(beforeReversal.velocity);
    expect(retargeted.target).toBe(-400);

    controller.advance(CAROUSEL_INTERACTION_FIXED_STEP_SECONDS);
    const firstReversalFrame = controller.snapshot();
    expect(Math.abs(firstReversalFrame.position - beforeReversal.position)).toBeLessThan(10);

    let minimum = firstReversalFrame.position;
    for (let frame = 0; frame < 720; frame += 1) {
      controller.advance(CAROUSEL_INTERACTION_FIXED_STEP_SECONDS);
      minimum = Math.min(minimum, controller.snapshot().position);
    }
    expect(minimum).toBeGreaterThanOrEqual(-400);
    expect(controller.snapshot()).toMatchObject({ position: -400, target: -400, velocity: 0, settled: true });
  });

  it("normalizes position and target by one identical loop shift", () => {
    const controller = new CarouselInteractionController();
    controller.beginDirectManipulation();
    controller.dragBy(2_800, 0.2);
    controller.endDirectManipulation();
    const before = controller.snapshot();
    const targetDelta = before.target - before.position;

    const after = controller.normalize(1_000);
    expect(after.position).toBe(-200);
    expect(after.target - after.position).toBeCloseTo(targetDelta, 12);
    expect(after.velocity).toBe(before.velocity);
  });

  it("moves the arrow target by exactly one signed slide stride", () => {
    const controller = new CarouselInteractionController();
    controller.stepSlides(425, 1, -1);
    expect(controller.snapshot()).toMatchObject({ position: 0, target: -425 });
    controller.stepSlides(425, -2, -1);
    expect(controller.snapshot()).toMatchObject({ position: 0, target: 425 });
  });

  it("accumulates wheel distance at the target while presentation remains continuous", () => {
    const controller = new CarouselInteractionController();
    controller.addWheelDistance(25);
    controller.addWheelDistance(-10);
    controller.addWheelDistance(30);
    expect(controller.snapshot()).toMatchObject({ position: 0, target: 45, velocity: 0 });
    controller.advance(1 / 60);
    expect(controller.snapshot().position).toBeGreaterThan(0);
    expect(controller.snapshot().position).toBeLessThan(45);
  });

  it("tracks a drag 1:1 and hands its exact release velocity into settling", () => {
    const controller = new CarouselInteractionController();
    controller.beginDirectManipulation();
    controller.dragBy(120, 0.1);
    const direct = controller.snapshot();
    expect(direct).toMatchObject({ position: 120, target: 120, velocity: 1_200, directManipulation: true });

    controller.endDirectManipulation();
    const released = controller.snapshot();
    expect(released.position).toBe(direct.position);
    expect(released.velocity).toBe(direct.velocity);
    expect(released.target).toBeCloseTo(
      direct.position + direct.velocity / CAROUSEL_INTERACTION_SETTLING_ANGULAR_FREQUENCY,
      12,
    );
    controller.advance(CAROUSEL_INTERACTION_FIXED_STEP_SECONDS);
    expect(controller.snapshot().position).toBeGreaterThan(direct.position);
  });

  it("captures a moving presentation without a pointer-down jump and ends finite", () => {
    const controller = new CarouselInteractionController();
    controller.addWheelDistance(320);
    advanceFrames(controller, 120, 0.15);
    const moving = controller.snapshot();

    controller.beginDirectManipulation();
    const captured = controller.snapshot();
    expect(captured.position).toBe(moving.position);
    expect(captured.target).toBe(moving.position);
    expect(captured.velocity).toBe(0);
    controller.dragBy(-37, 0.016);
    controller.endDirectManipulation();
    const ended = controller.snapshot();
    expect(ended.position).toBeCloseTo(moving.position - 37, 12);
    expect(Number.isFinite(ended.position)).toBe(true);
    expect(Number.isFinite(ended.target)).toBe(true);
    expect(Number.isFinite(ended.velocity)).toBe(true);
  });

  it("settles interaction while a separate authored clock is paused", () => {
    const controller = new CarouselInteractionController();
    controller.addWheelDistance(300);
    let authoredTime = 2.5;
    const authoredPaused = true;
    for (let frame = 0; frame < 240; frame += 1) {
      if (!authoredPaused) authoredTime += 1 / 240;
      controller.advance(1 / 240);
    }
    expect(authoredTime).toBe(2.5);
    expect(controller.snapshot().position).toBeGreaterThan(299.9);
  });

  it("keeps legacy authored travel byte-equivalent while preview interaction evolves", () => {
    const timeline = createPerformanceLifecycle({
      entry: { enabled: false },
      body: { durationSeconds: 4, tempo: { kind: "preset", preset: "even" } },
      exit: { enabled: false },
      repeat: { mode: "off" },
    });
    const options = {
      direction: -1 as const,
      slidesPerSecond: 0.5,
      stride: 100,
      slotCount: 8,
      slideLayerCount: 8,
      seamless: false,
      seamlessLoops: 1,
    };
    const authoredBefore = JSON.stringify(evaluatePerformanceTravel(timeline, 2, options));
    const controller = new CarouselInteractionController();
    controller.addWheelDistance(450);
    advanceFrames(controller, 60, 0.5);
    const authoredAfter = JSON.stringify(evaluatePerformanceTravel(timeline, 2, options));
    expect(authoredAfter).toBe(authoredBefore);
  });

  it("fails closed to a finite held frame for invalid normalisation", () => {
    const controller = new CarouselInteractionController();
    controller.addWheelDistance(100);
    controller.advance(1 / 60);
    expect(controller.normalize(Number.NaN)).toMatchObject({
      position: 0,
      target: 0,
      velocity: 0,
      settled: true,
    });
  });

  it("keeps active controller work far below a frame budget", () => {
    const controller = new CarouselInteractionController();
    const frameCount = 50_000;
    const started = performance.now();
    for (let frame = 0; frame < frameCount; frame += 1) {
      if (frame % 120 === 0) controller.addWheelDistance(frame % 240 === 0 ? 80 : -80);
      controller.advance(1 / 60);
    }
    const millisecondsPerFrame = (performance.now() - started) / frameCount;
    expect(millisecondsPerFrame).toBeLessThan(0.05);
  });
});
