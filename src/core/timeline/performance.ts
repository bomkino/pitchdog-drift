import type { MotionCharacterId } from "../project/schema";
import { clamp, finite, TAU } from "./math";

export interface PerformanceSample {
  progress: number;
  velocityPerSecond: number;
  accelerationPerSecondSquared: number;
  offset: number;
}

interface CharacterCurve {
  offset: number;
  derivative: number;
  secondDerivative: number;
}

function characterCurve(id: MotionCharacterId, progress: number): CharacterCurve {
  const p = clamp(finite(progress), 0, 1);
  switch (id) {
    case "weighted": {
      const amplitude = 0.18;
      const angle = TAU * p;
      return {
        offset: -(amplitude / TAU) * Math.sin(angle),
        derivative: -amplitude * Math.cos(angle),
        secondDerivative: amplitude * TAU * Math.sin(angle),
      };
    }
    case "spring": {
      const amplitude = 0.24;
      const frequency = TAU * 2;
      const angle = frequency * p;
      return {
        offset: (amplitude / frequency) * (1 - Math.cos(angle)),
        derivative: amplitude * Math.sin(angle),
        secondDerivative: amplitude * frequency * Math.cos(angle),
      };
    }
    case "drift": {
      const amplitude = 0.28;
      const angle = TAU * p;
      return {
        offset: (amplitude / TAU) * Math.sin(angle),
        derivative: amplitude * Math.cos(angle),
        secondDerivative: -amplitude * TAU * Math.sin(angle),
      };
    }
    case "direct":
    default:
      return { offset: 0, derivative: 0, secondDerivative: 0 };
  }
}

export function evaluatePerformance(
  progress: number,
  velocityPerSecond: number,
  accelerationPerSecondSquared: number,
  id: MotionCharacterId,
  amount: number,
): PerformanceSample {
  const p = clamp(finite(progress), 0, 1);
  const velocity = finite(velocityPerSecond);
  const acceleration = finite(accelerationPerSecondSquared);
  const strength = clamp(finite(amount), 0, 1);
  const curve = characterCurve(id, p);
  const derivative = 1 + curve.derivative * strength;
  const directedProgress = clamp(p + curve.offset * strength, 0, 1);
  return {
    progress: directedProgress,
    velocityPerSecond: velocity * derivative,
    accelerationPerSecondSquared: acceleration * derivative
      + velocity * velocity * curve.secondDerivative * strength,
    offset: curve.offset * strength,
  };
}
