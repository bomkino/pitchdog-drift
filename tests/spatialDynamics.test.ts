import { describe, expect, it } from "vitest";
import {
  cloneSettings,
  DEFAULT_SETTINGS,
  type DynamicsMode,
  type Flow,
  type SurfaceMode,
} from "../src/model";
import {
  deriveCarouselGeometry,
  evaluateSlide,
  getLogicalSlotCount,
} from "../src/engine/evaluate";
import {
  applyMotionImpulse,
  DYNAMICS_PROFILES,
  FABRIC_TURNS_PER_TRACK,
  integrateMotionState,
  rebaseLoopPosition,
  surfaceModeIndex,
  surfacePhaseAtDistance,
  SURFACE_PROFILES,
} from "../src/engine/spatialDynamics";

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
  it("keeps every path finite across both axes, maximum controls, and long travel", () => {
    for (const axis of ["horizontal", "vertical"] as const) {
      for (const flow of FLOWS) {
        const settings = cloneSettings(DEFAULT_SETTINGS);
        settings.motion.axis = axis;
        settings.motion.flow = flow;
        settings.motion.curvature = 1;
        settings.motion.depth = 0.8;
        settings.motion.tilt = 18;
        settings.motion.bank = 1;
        const geometry = deriveCarouselGeometry(settings, 1080, 1920);

        for (
          let distance = -geometry.stride * 120;
          distance <= geometry.stride * 120;
          distance += geometry.stride * 3.71
        ) {
          for (let index = 0; index < 12; index += 1) {
            const value = evaluateSlide(index, distance, 12, settings, geometry);
            for (const number of Object.values(value)) {
              expect(Number.isFinite(number)).toBe(true);
            }
            expect(
              Math.hypot(
                value.tangentPrimary,
                value.tangentCross,
                value.tangentZ,
              ),
            ).toBeCloseTo(1, 5);
            expect(value.opacity).toBeGreaterThanOrEqual(0);
            expect(value.opacity).toBeLessThanOrEqual(1);
            expect(value.pathBend).toBeGreaterThanOrEqual(0);
            expect(value.pathBend).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it("makes all ten paths materially distinct rather than relabelling one curve", () => {
    const signatures = FLOWS.map((flow) => {
      const settings = cloneSettings(DEFAULT_SETTINGS);
      settings.motion.flow = flow;
      settings.motion.curvature = 0.82;
      settings.motion.depth = 0.74;
      const geometry = deriveCarouselGeometry(settings, 1080, 1920);
      return [-3, -2, -1, 1, 2, 3]
        .map((index) => {
          const value = evaluateSlide(index, 0, 10, settings, geometry);
          return [
            value.cross.toFixed(2),
            value.z.toFixed(2),
            value.rotationX.toFixed(3),
            value.rotationY.toFixed(3),
            value.rotationZ.toFixed(3),
          ].join(":");
        })
        .join("|");
    });
    expect(new Set(signatures).size).toBe(FLOWS.length);
  });

  it("keeps the arc on one authored side while preserving mirrored depth", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.flow = "arc";
    settings.motion.curvature = 0.8;
    settings.motion.depth = 0.7;
    const geometry = deriveCarouselGeometry(settings, 1080, 1920);
    const left = evaluateSlide(3, geometry.stride * 4.25, 8, settings, geometry);
    const right = evaluateSlide(5, geometry.stride * 3.75, 8, settings, geometry);
    expect(Math.sign(left.cross)).toBe(Math.sign(right.cross));
    expect(Math.abs(left.z)).toBeGreaterThan(0);
    expect(Math.abs(right.z)).toBeGreaterThan(0);
  });

  it("lets banking change orientation without changing the authored path", () => {
    const flat = cloneSettings(DEFAULT_SETTINGS);
    flat.motion.flow = "helix";
    flat.motion.bank = 0;
    const banked = cloneSettings(flat);
    banked.motion.bank = 1;
    const geometry = deriveCarouselGeometry(flat, 1080, 1920);
    const a = evaluateSlide(2, 0, 8, flat, geometry);
    const b = evaluateSlide(2, 0, 8, banked, geometry);
    expect([a.primary, a.cross, a.z]).toEqual([b.primary, b.cross, b.z]);
    expect(
      Math.abs(b.rotationX) + Math.abs(b.rotationY) + Math.abs(b.rotationZ),
    ).toBeGreaterThan(
      Math.abs(a.rotationX) + Math.abs(a.rotationY) + Math.abs(a.rotationZ),
    );
  });


  it("gives curve and depth a truthful joint zero state", () => {
    for (const flow of FLOWS) {
      const settings = cloneSettings(DEFAULT_SETTINGS);
      settings.motion.flow = flow;
      settings.motion.curvature = 0;
      settings.motion.depth = 0;
      settings.motion.tilt = 0;
      settings.motion.bank = 0;
      const geometry = deriveCarouselGeometry(settings, 1080, 1920);
      const value = evaluateSlide(2, 0, 8, settings, geometry);
      expect(value.cross).toBeCloseTo(0, 10);
      expect(value.z).toBeCloseTo(0, 10);
      expect(value.rotationX).toBeCloseTo(0, 10);
      expect(value.rotationY).toBeCloseTo(0, 10);
      expect(value.rotationZ).toBeCloseTo(0, 10);
      expect(value.pathBend).toBeCloseTo(0, 10);
    }
  });

  it("keeps the virtual strip on complete asset cycles for every spatial flow", () => {
    for (const flow of FLOWS) {
      const settings = cloneSettings(DEFAULT_SETTINGS);
      settings.motion.flow = flow;
      const geometry = deriveCarouselGeometry(settings, 1080, 1920);
      for (const assetCount of [1, 2, 3, 7, 8, 13]) {
        expect(getLogicalSlotCount(assetCount, geometry) % assetCount).toBe(0);
      }
    }
  });
});

describe("bounded preview dynamics", () => {
  it("stays stable across 60, 120, and 240 Hz integration", () => {
    for (const mode of DYNAMICS) {
      const run = (hz: number) => {
        let state = { position: 0, velocity: 0, acceleration: 0 };
        for (let frame = 0; frame < hz * 2; frame += 1) {
          state = integrateMotionState(state, 240, 1 / hz, mode, 600);
        }
        return state;
      };
      const sixty = run(60);
      const oneTwenty = run(120);
      const twoForty = run(240);
      expect(sixty.position).toBeCloseTo(oneTwenty.position, 0);
      expect(oneTwenty.position).toBeCloseTo(twoForty.position, 0);
      expect(sixty.velocity).toBeCloseTo(oneTwenty.velocity, 0);
      expect(oneTwenty.velocity).toBeCloseTo(twoForty.velocity, 0);
    }
  });

  it("bounds invalid state, ten-second frame gaps, and pathological impulses", () => {
    for (const mode of DYNAMICS) {
      const profile = DYNAMICS_PROFILES[mode];
      const impulse = applyMotionImpulse(
        {
          position: Number.NaN,
          velocity: Number.POSITIVE_INFINITY,
          acceleration: Number.NEGATIVE_INFINITY,
        },
        1_000_000,
        0,
        mode,
        700,
      );
      const next = integrateMotionState(impulse, -1_000_000, 10, mode, 700);
      expect(Math.abs(next.velocity)).toBeLessThanOrEqual(
        profile.maximumVelocity * 700,
      );
      expect(Math.abs(next.acceleration)).toBeLessThanOrEqual(
        profile.maximumAcceleration * 700,
      );
      expect(Object.values(next).every(Number.isFinite)).toBe(true);
    }
  });

  it("gives every physics character a distinct hand response", () => {
    const gestureResponses = DYNAMICS.map((mode) => {
      const impulse = applyMotionImpulse(
        { position: 0, velocity: 80, acceleration: 0 },
        140,
        1 / 60,
        mode,
        600,
      );
      const settled = integrateMotionState(impulse, 0, 0.18, mode, 600);
      return [
        impulse.velocity.toFixed(4),
        impulse.acceleration.toFixed(4),
        settled.position.toFixed(4),
        settled.velocity.toFixed(4),
      ].join(":");
    });
    expect(new Set(gestureResponses).size).toBe(DYNAMICS.length);
  });

  it("rebases long sessions without changing the loop arrangement", () => {
    const loop = 8 * 640;
    const huge = loop * 1_000_000 + 123.456;
    const rebased = rebaseLoopPosition(huge, loop);
    expect(rebased).toBeCloseTo(123.456, 5);
    expect(Math.abs(rebased)).toBeLessThanOrEqual(loop / 2);
    expect(rebaseLoopPosition(Number.NaN, loop)).toBe(0);
    expect(rebaseLoopPosition(10, 0)).toBe(10);
  });
});

describe("fabric surface contract", () => {
  it("maps four explicit surfaces to four stable and distinct profiles", () => {
    expect(SURFACES.map(surfaceModeIndex)).toEqual([0, 1, 2, 3]);
    expect(new Set(SURFACES.map((surface) => JSON.stringify(SURFACE_PROFILES[surface]))).size)
      .toBe(SURFACES.length);
  });

  it("locks fabric phase to travel, closes whole tracks, and never needs wall-clock time", () => {
    const track = 8 * 640;
    const start = surfacePhaseAtDistance(0, track);
    const oneTrack = surfacePhaseAtDistance(track, track);
    const reverseTrack = surfacePhaseAtDistance(-track, track);
    expect(oneTrack).toBeCloseTo(start, 12);
    expect(reverseTrack).toBeCloseTo(start, 12);

    const quarter = surfacePhaseAtDistance(
      track / (FABRIC_TURNS_PER_TRACK * 4),
      track,
    );
    expect(quarter).toBeCloseTo(Math.PI / 2, 12);
    expect(surfacePhaseAtDistance(220, 0)).toBe(0);
  });
});
