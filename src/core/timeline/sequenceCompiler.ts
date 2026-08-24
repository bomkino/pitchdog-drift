import {
  createSequenceAuthoring,
  sequenceRelativePassWeight,
  type SequenceAuthoring,
  type SequencePace,
} from "./sequenceAuthoring";

export interface SequenceCompilationOptions {
  readonly bodyDurationSeconds: number;
  readonly movingSlideCount: number;
}

export interface CompiledSequencePass {
  readonly index: number;
  readonly indexInGroup: number;
  readonly groupIndex: number;
  readonly sourceGroupIndex: number;
  readonly repeatIndex: number;
  readonly groupId: string;
  readonly groupLabel: string;
  readonly pace: SequencePace;
  readonly relativeSecondsPerPass: number;
  readonly startPass: number;
  readonly endPass: number;
  readonly startDistanceSlides: number;
  readonly endDistanceSlides: number;
  readonly start: number;
  readonly end: number;
  readonly duration: number;
  readonly startVelocityPassesPerSecond: number;
  readonly endVelocityPassesPerSecond: number;
}

export interface CompiledSequenceGroup {
  readonly index: number;
  readonly sourceGroupIndex: number;
  readonly repeatIndex: number;
  readonly id: string;
  readonly label: string;
  readonly pace: SequencePace;
  readonly passes: number;
  readonly relativeSecondsPerPass: number;
  readonly startPass: number;
  readonly endPass: number;
  readonly startDistanceSlides: number;
  readonly endDistanceSlides: number;
  readonly start: number;
  readonly end: number;
  readonly duration: number;
}

export interface CompiledSequence {
  readonly authoring: SequenceAuthoring;
  readonly movingSlideCount: number;
  readonly bodyDurationSeconds: number;
  readonly totalPasses: number;
  readonly totalDistanceSlides: number;
  readonly totalRelativePassWeight: number;
  readonly groups: readonly CompiledSequenceGroup[];
  readonly passes: readonly CompiledSequencePass[];
}

export interface SequenceSample {
  readonly requestedTime: number;
  readonly time: number;
  readonly atEnd: boolean;
  readonly passIndex: number;
  readonly groupIndex: number;
  readonly repeatIndex: number;
  readonly passProgress: number;
  readonly normalizedProgress: number;
  readonly distanceSlides: number;
  readonly velocitySlidesPerSecond: number;
  readonly accelerationSlidesPerSecondSquared: number;
}

export class SequenceCompilationError extends TypeError {
  readonly path: string;

  constructor(path: string, detail: string) {
    super(`${path} ${detail}`);
    this.name = "SequenceCompilationError";
    this.path = path;
  }
}

interface MutablePass {
  index: number;
  indexInGroup: number;
  groupIndex: number;
  sourceGroupIndex: number;
  repeatIndex: number;
  groupId: string;
  groupLabel: string;
  pace: SequencePace;
  relativeSecondsPerPass: number;
  startPass: number;
  endPass: number;
  startDistanceSlides: number;
  endDistanceSlides: number;
  start: number;
  end: number;
  duration: number;
  startVelocityPassesPerSecond: number;
  endVelocityPassesPerSecond: number;
}

function positiveFinite(value: number, path: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new SequenceCompilationError(path, "must be a finite number above zero.");
  }
  return value;
}

function movingCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SequenceCompilationError(
      "movingSlideCount",
      "must be a non-negative safe integer.",
    );
  }
  return value;
}

/**
 * Content-paced authority derives one readable pass from deck size times
 * seconds-per-slide. Every group then scales that pass by its explicit weight.
 */
export function sequenceContentPacedBodySeconds(
  authoringInput: SequenceAuthoring,
  movingSlideCountInput: number,
  secondsPerSlideInput: number,
): number {
  const authoring = createSequenceAuthoring(authoringInput);
  const count = movingCount(movingSlideCountInput);
  const secondsPerSlide = positiveFinite(secondsPerSlideInput, "secondsPerSlide");
  return count * secondsPerSlide * sequenceRelativePassWeight(authoring);
}

function freezePass(pass: MutablePass): CompiledSequencePass {
  return Object.freeze({ ...pass });
}

function clampTime(value: number, duration: number): number {
  if (Number.isNaN(value) || value === -Infinity) return 0;
  if (value === Infinity) return duration;
  return Math.max(0, Math.min(duration, value));
}

function locatePass(passes: readonly CompiledSequencePass[], time: number): CompiledSequencePass {
  let low = 0;
  let high = passes.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    // Exact internal boundaries belong to the next pass.
    if (time < passes[middle]!.end) high = middle;
    else low = middle + 1;
  }
  return passes[low]!;
}

/** Quintic Hermite basis with shared knot velocity and zero knot acceleration. */
function evaluatePassProgress(pass: CompiledSequencePass, time: number): {
  progress: number;
  velocity: number;
  acceleration: number;
} {
  if (time <= pass.start) {
    return {
      progress: pass.startPass,
      velocity: pass.startVelocityPassesPerSecond,
      acceleration: 0,
    };
  }
  if (time >= pass.end) {
    return {
      progress: pass.endPass,
      velocity: pass.endVelocityPassesPerSecond,
      acceleration: 0,
    };
  }

  const duration = pass.duration;
  const u = (time - pass.start) / duration;
  const u2 = u * u;
  const u3 = u2 * u;
  const u4 = u3 * u;
  const u5 = u4 * u;
  const y0 = pass.startPass;
  const y1 = pass.endPass;
  const tangent0 = pass.startVelocityPassesPerSecond * duration;
  const tangent1 = pass.endVelocityPassesPerSecond * duration;

  const h00 = 1 - 10 * u3 + 15 * u4 - 6 * u5;
  const h10 = u - 6 * u3 + 8 * u4 - 3 * u5;
  const h01 = 10 * u3 - 15 * u4 + 6 * u5;
  const h11 = -4 * u3 + 7 * u4 - 3 * u5;
  const rawProgress = h00 * y0 + h10 * tangent0 + h01 * y1 + h11 * tangent1;

  const h00d = -30 * u2 + 60 * u3 - 30 * u4;
  const h10d = 1 - 18 * u2 + 32 * u3 - 15 * u4;
  const h01d = 30 * u2 - 60 * u3 + 30 * u4;
  const h11d = -12 * u2 + 28 * u3 - 15 * u4;
  const derivativeU = h00d * y0 + h10d * tangent0 + h01d * y1 + h11d * tangent1;

  const h00dd = -60 * u + 180 * u2 - 120 * u3;
  const h10dd = -36 * u + 96 * u2 - 60 * u3;
  const h01dd = 60 * u - 180 * u2 + 120 * u3;
  const h11dd = -24 * u + 84 * u2 - 60 * u3;
  const secondDerivativeU = h00dd * y0 + h10dd * tangent0 + h01dd * y1 + h11dd * tangent1;

  return {
    progress: Math.max(pass.startPass, Math.min(pass.endPass, rawProgress)),
    velocity: Math.max(0, derivativeU / duration),
    acceleration: secondDerivativeU / (duration * duration),
  };
}

/**
 * Compiles ordered group authoring into exact pass/time knots. Fixed-master
 * callers provide the available body duration. Content-paced callers first
 * derive that duration with `sequenceContentPacedBodySeconds` and compile the
 * same authority; therefore preview, receipts, events, and export share one
 * evaluator.
 *
 * Knot velocities use the slower adjacent secant and knot accelerations are
 * zero. The resulting quintic segments are monotonic, C2 at every pass/group
 * join, preserve every authored boundary, and never integrate wall-clock time.
 */
export function compileSequence(
  authoringInput: SequenceAuthoring,
  options: SequenceCompilationOptions,
): CompiledSequence {
  const authoring = createSequenceAuthoring(authoringInput);
  const duration = positiveFinite(options.bodyDurationSeconds, "bodyDurationSeconds");
  const count = movingCount(options.movingSlideCount);
  const totalRelativePassWeight = sequenceRelativePassWeight(authoring);
  const totalPasses = authoring.groups.reduce((sum, group) => sum + group.passes, 0)
    * authoring.repeatCount;
  const passes: MutablePass[] = [];
  const groupSpecs: Array<Omit<CompiledSequenceGroup, "start" | "end" | "duration"> & {
    firstPassIndex: number;
    lastPassIndex: number;
  }> = [];
  let progressWeight = 0;

  for (let repeatIndex = 0; repeatIndex < authoring.repeatCount; repeatIndex += 1) {
    for (let sourceGroupIndex = 0; sourceGroupIndex < authoring.groups.length; sourceGroupIndex += 1) {
      const group = authoring.groups[sourceGroupIndex]!;
      const groupIndex = groupSpecs.length;
      const firstPassIndex = passes.length;
      for (let indexInGroup = 0; indexInGroup < group.passes; indexInGroup += 1) {
        const index = passes.length;
        const start = duration * progressWeight / totalRelativePassWeight;
        progressWeight += group.relativeSecondsPerPass;
        const end = index + 1 === totalPasses
          ? duration
          : duration * progressWeight / totalRelativePassWeight;
        const passDuration = end - start;
        if (!Number.isFinite(passDuration) || passDuration <= 0) {
          throw new SequenceCompilationError(
            "bodyDurationSeconds",
            "is too short to represent every authored pass with finite precision.",
          );
        }
        passes.push({
          index,
          indexInGroup,
          groupIndex,
          sourceGroupIndex,
          repeatIndex,
          groupId: group.id,
          groupLabel: group.label,
          pace: group.pace,
          relativeSecondsPerPass: group.relativeSecondsPerPass,
          startPass: index,
          endPass: index + 1,
          startDistanceSlides: index * count,
          endDistanceSlides: (index + 1) * count,
          start,
          end,
          duration: passDuration,
          startVelocityPassesPerSecond: 0,
          endVelocityPassesPerSecond: 0,
        });
      }
      groupSpecs.push({
        index: groupIndex,
        sourceGroupIndex,
        repeatIndex,
        id: group.id,
        label: group.label,
        pace: group.pace,
        passes: group.passes,
        relativeSecondsPerPass: group.relativeSecondsPerPass,
        startPass: firstPassIndex,
        endPass: passes.length,
        startDistanceSlides: firstPassIndex * count,
        endDistanceSlides: passes.length * count,
        firstPassIndex,
        lastPassIndex: passes.length - 1,
      });
    }
  }

  const slopes = passes.map((pass) => 1 / pass.duration);
  const knotVelocities = Array.from({ length: passes.length + 1 }, (_, knotIndex) => {
    if (knotIndex === 0 || knotIndex === passes.length) {
      // A repeated body closes without a speed discontinuity.
      return Math.min(slopes[0]!, slopes[slopes.length - 1]!);
    }
    return Math.min(slopes[knotIndex - 1]!, slopes[knotIndex]!);
  });
  for (const pass of passes) {
    pass.startVelocityPassesPerSecond = knotVelocities[pass.index]!;
    pass.endVelocityPassesPerSecond = knotVelocities[pass.index + 1]!;
  }

  const frozenPasses = Object.freeze(passes.map(freezePass));
  const groups = Object.freeze(groupSpecs.map((group): CompiledSequenceGroup => {
    const start = frozenPasses[group.firstPassIndex]!.start;
    const end = frozenPasses[group.lastPassIndex]!.end;
    return Object.freeze({
      index: group.index,
      sourceGroupIndex: group.sourceGroupIndex,
      repeatIndex: group.repeatIndex,
      id: group.id,
      label: group.label,
      pace: group.pace,
      passes: group.passes,
      relativeSecondsPerPass: group.relativeSecondsPerPass,
      startPass: group.startPass,
      endPass: group.endPass,
      startDistanceSlides: group.startDistanceSlides,
      endDistanceSlides: group.endDistanceSlides,
      start,
      end,
      duration: end - start,
    });
  }));
  return Object.freeze({
    authoring,
    movingSlideCount: count,
    bodyDurationSeconds: duration,
    totalPasses: frozenPasses.length,
    totalDistanceSlides: frozenPasses.length * count,
    totalRelativePassWeight,
    groups,
    passes: frozenPasses,
  });
}

export function evaluateCompiledSequence(
  sequence: CompiledSequence,
  bodyTime: number,
): SequenceSample {
  const time = clampTime(bodyTime, sequence.bodyDurationSeconds);
  const requestedTime = Number.isFinite(bodyTime) ? bodyTime : time;
  const atEnd = time === sequence.bodyDurationSeconds;
  const pass = atEnd ? sequence.passes[sequence.passes.length - 1]! : locatePass(sequence.passes, time);
  const evaluated = evaluatePassProgress(pass, time);
  const passProgress = atEnd ? sequence.totalPasses : evaluated.progress;
  const distanceSlides = passProgress * sequence.movingSlideCount;
  const velocitySlidesPerSecond = evaluated.velocity * sequence.movingSlideCount;
  const accelerationSlidesPerSecondSquared = evaluated.acceleration * sequence.movingSlideCount;
  return Object.freeze({
    requestedTime,
    time,
    atEnd,
    passIndex: pass.index,
    groupIndex: pass.groupIndex,
    repeatIndex: pass.repeatIndex,
    passProgress,
    normalizedProgress: passProgress / sequence.totalPasses,
    distanceSlides: distanceSlides === 0 ? 0 : distanceSlides,
    velocitySlidesPerSecond: velocitySlidesPerSecond === 0 ? 0 : velocitySlidesPerSecond,
    accelerationSlidesPerSecondSquared: accelerationSlidesPerSecondSquared === 0
      ? 0
      : accelerationSlidesPerSecondSquared,
  });
}
