import {
  evaluateCompiledSequence,
  type CompiledSequence,
} from "./sequenceCompiler";

export interface SequenceVelocityEnvelope {
  readonly minimumSlidesPerSecond: number;
  readonly peakSlidesPerSecond: number;
  readonly samples: number;
}

const VELOCITY_SAMPLES_PER_PASS = 64;

/**
 * Receipt-only pace diagnostic. This intentionally lives outside compilation:
 * preview/export frame evaluation must never pay its O(passCount × samples)
 * scan. Authored progression and every boundary remain analytical.
 */
export function measureSequenceVelocityEnvelope(
  sequence: CompiledSequence,
): SequenceVelocityEnvelope {
  if (sequence.movingSlideCount === 0) {
    return Object.freeze({
      minimumSlidesPerSecond: 0,
      peakSlidesPerSecond: 0,
      samples: 0,
    });
  }
  let minimum = Number.POSITIVE_INFINITY;
  let peak = 0;
  let samples = 0;
  for (const pass of sequence.passes) {
    for (let index = 0; index <= VELOCITY_SAMPLES_PER_PASS; index += 1) {
      const time = pass.start + pass.duration * index / VELOCITY_SAMPLES_PER_PASS;
      const velocity = evaluateCompiledSequence(sequence, time).velocitySlidesPerSecond;
      minimum = Math.min(minimum, velocity);
      peak = Math.max(peak, velocity);
      samples += 1;
    }
  }
  return Object.freeze({
    minimumSlidesPerSecond: Number.isFinite(minimum) ? minimum : 0,
    peakSlidesPerSecond: Number.isFinite(peak) ? peak : 0,
    samples,
  });
}
