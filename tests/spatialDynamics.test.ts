import { describe, expect, it } from "vitest";
import { cloneSettings, DEFAULT_SETTINGS, type DynamicsMode, type Flow, type SurfaceMode } from "../src/model";
import { deriveCarouselGeometry, evaluateSlide } from "../src/engine/evaluate";
import {
  applyMotionImpulse,
  DYNAMICS_PROFILES,
  integrateMotionState,
  surfaceModeIndex,
  surfacePhaseAtTime,
} from "../src/engine/spatialDynamics";
import { slideFragmentShader, slideVertexShader } from "../src/engine/shaders";

const FLOWS: Flow[] = [
  "straight",
  "arc",
  "ribbon",
  "cylinder",
  "tunnel",
  "helix",
  "orbit",
  "cascade",
  "lemniscate",
  "switchback",
];
const DYNAMICS: DynamicsMode[] = ["direct", "weighted", "spring", "drift"];
const SURFACES: SurfaceMode[] = ["card", "paper", "silk", "gel"];

describe("spatial path evaluator", () => {
  it("keeps every path finite across both axes and extreme authored controls", () => {
    for (const axis of ["horizontal", "vertical"] as const) {
      for (const flow of FLOWS) {
        const settings = cloneSettings(DEFAULT_SETTINGS);
        settings.motion.axis = axis;
        settings.motion.flow = flow;
        settings.motion.curvature = 1;
        settings.motion.depth = 1;
        settings.motion.tilt = 18;
        settings.motion.bank = 1;
        const geometry = deriveCarouselGeometry(settings, 1080, 1920);
        for (let distance = -geometry.stride * 10; distance <= geometry.stride * 10; distance += geometry.stride * 0.37) {
          for (let index = 0; index < 12; index += 1) {
            const value = evaluateSlide(index, distance, 12, settings, geometry);
            for (const number of Object.values(value)) expect(Number.isFinite(number)).toBe(true);
            expect(Math.hypot(value.tangentPrimary, value.tangentCross, value.tangentZ)).toBeCloseTo(1, 5);
            expect(value.opacity).toBeGreaterThanOrEqual(0);
            expect(value.opacity).toBeLessThanOrEqual(1);
            expect(value.pathBend).toBeGreaterThanOrEqual(0);
            expect(value.pathBend).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it("makes the authored paths materially distinct instead of renaming one curve", () => {
    const signatures = FLOWS.map((flow) => {
      const settings = cloneSettings(DEFAULT_SETTINGS);
      settings.motion.flow = flow;
      settings.motion.curvature = 0.82;
      settings.motion.depth = 0.74;
      const geometry = deriveCarouselGeometry(settings, 1080, 1920);
      return [-2, -1, 1, 2]
        .map((index) => {
          const value = evaluateSlide(index, 0, 8, settings, geometry);
          return `${value.cross.toFixed(2)}:${value.z.toFixed(2)}:${value.rotationZ.toFixed(3)}`;
        })
        .join("|");
    });
    expect(new Set(signatures).size).toBe(FLOWS.length);
  });
});

describe("bounded preview dynamics", () => {
  it("stays close across 60 Hz and 120 Hz integration", () => {
    for (const mode of DYNAMICS) {
      let sixty = { position: 0, velocity: 0, acceleration: 0 };
      let oneTwenty = { position: 0, velocity: 0, acceleration: 0 };
      for (let frame = 0; frame < 60; frame += 1) {
        sixty = integrateMotionState(sixty, 240, 1 / 60, mode, 600);
      }
      for (let frame = 0; frame < 120; frame += 1) {
        oneTwenty = integrateMotionState(oneTwenty, 240, 1 / 120, mode, 600);
      }
      expect(sixty.position).toBeCloseTo(oneTwenty.position, 0);
      expect(sixty.velocity).toBeCloseTo(oneTwenty.velocity, 0);
      expect(Number.isFinite(sixty.acceleration)).toBe(true);
    }
  });

  it("bounds pathological frame gaps and pointer impulses", () => {
    for (const mode of DYNAMICS) {
      const profile = DYNAMICS_PROFILES[mode];
      const impulse = applyMotionImpulse(
        { position: 0, velocity: Number.POSITIVE_INFINITY, acceleration: Number.NaN },
        1_000_000,
        0,
        mode,
        700,
      );
      const next = integrateMotionState(impulse, -1_000_000, 10, mode, 700);
      expect(Math.abs(next.velocity)).toBeLessThanOrEqual(profile.maximumVelocity * 700);
      expect(Math.abs(next.acceleration)).toBeLessThanOrEqual(profile.maximumAcceleration * 700);
      expect(Object.values(next).every(Number.isFinite)).toBe(true);
    }
  });

  it("gives each physics character a distinct response", () => {
    const responses = DYNAMICS.map((mode) => integrateMotionState(
      { position: 0, velocity: 0, acceleration: 0 },
      300,
      1 / 20,
      mode,
      600,
    ).velocity.toFixed(5));
    expect(new Set(responses).size).toBe(DYNAMICS.length);
  });
});

describe("fabric surface contract", () => {
  it("maps four explicit surfaces to four stable shader branches", () => {
    expect(SURFACES.map(surfaceModeIndex)).toEqual([0, 1, 2, 3]);
    expect(slideVertexShader).toContain("Card: mostly rigid");
    expect(slideVertexShader).toContain("Paper: cylindrical curl");
    expect(slideVertexShader).toContain("Silk: broad travelling folds");
    expect(slideVertexShader).toContain("Gel: one coherent elastic mass");
  });

  it("uses stable slide-space grain instead of frame-shimmering grain", () => {
    expect(slideFragmentShader).toContain("Slide-locked grain");
    expect(slideFragmentShader).not.toContain("fract(uTime)");
  });

  it("closes surface motion exactly for seamless export and freezes reduced motion", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 3;
    settings.output.duration = 8;
    const start = surfacePhaseAtTime(settings, 0, true, false);
    const end = surfacePhaseAtTime(settings, settings.output.duration, true, false);
    expect((end - start) / (Math.PI * 2)).toBeCloseTo(3, 10);
    settings.motion.reducedMotionOutput = true;
    expect(surfacePhaseAtTime(settings, 7.25, true, false)).toBe(0);
    expect(surfacePhaseAtTime(settings, 7.25, false, true)).toBe(0);
  });
});
