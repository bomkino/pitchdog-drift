import { describe, expect, it } from "vitest";
import { cloneSettings, DEFAULT_SETTINGS, type DynamicsMode } from "../src/model";
import { evaluateExportMotion } from "../src/engine/exportMotion";
import { getLogicalSlotCount, getSlideGeometry } from "../src/engine/evaluate";

const MODES: DynamicsMode[] = ["direct", "weighted", "spring", "drift"];

function setup() {
  const settings = cloneSettings(DEFAULT_SETTINGS);
  settings.output.duration = 8;
  settings.motion.speed = 0.42;
  const geometry = getSlideGeometry(settings);
  const slotCount = getLogicalSlotCount(8, geometry);
  return { settings, geometry, slotCount };
}

describe("deterministic export motion character", () => {
  it("keeps Direct exactly constant-speed", () => {
    const { settings, geometry, slotCount } = setup();
    settings.motion.dynamics = "direct";
    const frame = evaluateExportMotion(settings, 2.5, slotCount, geometry.stride);
    const expectedVelocity = settings.motion.direction * settings.motion.speed * geometry.stride;
    expect(frame.distance).toBeCloseTo(expectedVelocity * 2.5, 10);
    expect(frame.velocity).toBeCloseTo(expectedVelocity, 10);
    expect(frame.acceleration).toBe(0);
  });

  it("gives all four characters distinct intermediate motion", () => {
    const { settings, geometry, slotCount } = setup();
    const signatures = new Set<string>();
    for (const mode of MODES) {
      settings.motion.dynamics = mode;
      const frame = evaluateExportMotion(
        settings,
        settings.output.duration * 0.1875,
        slotCount,
        geometry.stride,
      );
      signatures.add([
        frame.distance.toFixed(6),
        frame.velocity.toFixed(6),
        frame.acceleration.toFixed(6),
      ].join(":"));
    }
    expect(signatures.size).toBe(MODES.length);
  });

  it("preserves exact ordinary-export end distance for every character", () => {
    const { settings, geometry, slotCount } = setup();
    const expected = settings.motion.direction
      * settings.motion.speed
      * geometry.stride
      * settings.output.duration;
    for (const mode of MODES) {
      settings.motion.dynamics = mode;
      const end = evaluateExportMotion(
        settings,
        settings.output.duration,
        slotCount,
        geometry.stride,
      );
      expect(end.distance).toBeCloseTo(expected, 9);
    }
  });

  it("closes seamless distance, velocity, and acceleration together", () => {
    const { settings, geometry, slotCount } = setup();
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 3;
    const expectedDistance = settings.motion.direction
      * slotCount
      * geometry.stride
      * settings.motion.seamlessLoops;

    for (const mode of MODES) {
      settings.motion.dynamics = mode;
      const start = evaluateExportMotion(settings, 0, slotCount, geometry.stride);
      const end = evaluateExportMotion(
        settings,
        settings.output.duration,
        slotCount,
        geometry.stride,
      );
      expect(end.distance - start.distance).toBeCloseTo(expectedDistance, 8);
      expect(end.velocity).toBeCloseTo(start.velocity, 8);
      expect(end.acceleration).toBeCloseTo(start.acceleration, 8);
    }
  });

  it("never reverses authored travel while adding character", () => {
    const { settings, geometry, slotCount } = setup();
    for (const direction of [-1, 1] as const) {
      settings.motion.direction = direction;
      for (const mode of MODES) {
        settings.motion.dynamics = mode;
        for (let index = 0; index <= 120; index += 1) {
          const frame = evaluateExportMotion(
            settings,
            settings.output.duration * (index / 120),
            slotCount,
            geometry.stride,
          );
          expect(Math.sign(frame.velocity)).toBe(direction);
          expect(Number.isFinite(frame.distance)).toBe(true);
          expect(Number.isFinite(frame.acceleration)).toBe(true);
        }
      }
    }
  });

  it("is a pure repeated-timestamp evaluation", () => {
    const { settings, geometry, slotCount } = setup();
    settings.motion.dynamics = "spring";
    settings.motion.seamless = true;
    const first = evaluateExportMotion(settings, 3.375, slotCount, geometry.stride);
    const second = evaluateExportMotion(settings, 3.375, slotCount, geometry.stride);
    expect(second).toEqual(first);
  });

  it("stays finite at maximum authored settings and hostile timestamps", () => {
    const { settings, geometry, slotCount } = setup();
    settings.motion.speed = 1.5;
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 6;
    settings.output.duration = 3;
    for (const mode of MODES) {
      settings.motion.dynamics = mode;
      for (const time of [Number.NaN, Number.NEGATIVE_INFINITY, -100, 0, 1.5, 3, 30_000]) {
        const frame = evaluateExportMotion(settings, time, slotCount, geometry.stride);
        expect(Object.values(frame).every(Number.isFinite)).toBe(true);
      }
    }
  });

  it("returns a complete hard zero for reduced-motion output", () => {
    const { settings, geometry, slotCount } = setup();
    settings.motion.reducedMotionOutput = true;
    settings.motion.dynamics = "spring";
    expect(evaluateExportMotion(settings, 4.25, slotCount, geometry.stride)).toEqual({
      distance: 0,
      velocity: 0,
      acceleration: 0,
    });
  });
});
