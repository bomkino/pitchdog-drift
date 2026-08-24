const FIXED_STEP_SECONDS = 1 / 240;
const SETTLING_ANGULAR_FREQUENCY = 14;
const POSITION_EPSILON = 0.001;
const VELOCITY_EPSILON = 0.01;
const MAX_ADVANCE_SECONDS = 0.25;

export interface CarouselInteractionSnapshot {
  readonly position: number;
  readonly target: number;
  readonly velocity: number;
  readonly directManipulation: boolean;
  readonly settled: boolean;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function euclideanModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/**
 * Preview-only spatial authority for wheel, keyboard, and direct manipulation.
 *
 * Authored playback never enters this controller. The renderer adds the
 * controller's presentation state to authored travel only while painting the
 * interactive preview; fixed-time export continues to evaluate authored travel
 * directly.
 */
export class CarouselInteractionController {
  private presentationPosition = 0;
  private presentationTarget = 0;
  private presentationVelocity = 0;
  private accumulatedSeconds = 0;
  private manipulatingDirectly = false;

  snapshot(): CarouselInteractionSnapshot {
    const settled = !this.manipulatingDirectly
      && this.presentationPosition === this.presentationTarget
      && this.presentationVelocity === 0;
    return {
      position: this.presentationPosition,
      target: this.presentationTarget,
      velocity: this.presentationVelocity,
      directManipulation: this.manipulatingDirectly,
      settled,
    };
  }

  /** Retarget without resetting presentation position or velocity. */
  nudgeTarget(distance: number): void {
    if (!Number.isFinite(distance) || distance === 0 || this.manipulatingDirectly) return;
    this.presentationTarget += distance;
    if (!Number.isFinite(this.presentationTarget)) this.holdAt(0);
  }

  addWheelDistance(distance: number): void {
    this.nudgeTarget(distance);
  }

  stepSlides(stride: number, amount: number, direction: number): void {
    if (!Number.isFinite(stride) || stride <= 0
      || !Number.isFinite(amount) || !Number.isFinite(direction)) return;
    this.nudgeTarget(stride * amount * direction);
  }

  beginDirectManipulation(): void {
    this.manipulatingDirectly = true;
    this.presentationTarget = this.presentationPosition;
    this.presentationVelocity = 0;
    this.accumulatedSeconds = 0;
  }

  /** Move the presentation exactly with the pointer and retain its release velocity. */
  dragBy(distance: number, elapsedSeconds: number): void {
    if (!this.manipulatingDirectly || !Number.isFinite(distance) || distance === 0) return;
    const safeElapsed = Math.max(
      FIXED_STEP_SECONDS,
      Number.isFinite(elapsedSeconds) ? elapsedSeconds : FIXED_STEP_SECONDS,
    );
    this.presentationPosition += distance;
    this.presentationTarget = this.presentationPosition;
    this.presentationVelocity = distance / safeElapsed;
    this.accumulatedSeconds = 0;
    if (!this.hasFiniteState()) this.holdAt(0);
  }

  /**
   * Hand direct motion to the same critical response with no position or
   * velocity discontinuity. v / omega is the monotone stopping distance for a
   * critically damped system, so an ordinary release cannot shoot past its
   * resting point.
   */
  endDirectManipulation(): void {
    if (!this.manipulatingDirectly) return;
    this.manipulatingDirectly = false;
    this.presentationTarget = this.presentationPosition
      + this.presentationVelocity / SETTLING_ANGULAR_FREQUENCY;
    this.accumulatedSeconds = 0;
    if (!this.hasFiniteState()) this.holdAt(0);
  }

  /** Stop interaction motion without changing the presented frame. */
  hold(): void {
    this.holdAt(this.presentationPosition);
  }

  /**
   * Advance a critical response in deterministic 1/240 s quanta. The closed
   * form transition inside each quantum avoids Euler instability while the
   * fixed clock keeps 60, 120, and 240 Hz callers on the same state path.
   */
  advance(elapsedSeconds: number): CarouselInteractionSnapshot {
    if (this.manipulatingDirectly || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
      return this.snapshot();
    }
    this.accumulatedSeconds += Math.min(elapsedSeconds, MAX_ADVANCE_SECONDS);
    const stepCount = Math.floor((this.accumulatedSeconds + Number.EPSILON) / FIXED_STEP_SECONDS);
    if (stepCount <= 0) return this.snapshot();
    this.accumulatedSeconds -= stepCount * FIXED_STEP_SECONDS;
    if (this.accumulatedSeconds < 0 && this.accumulatedSeconds > -1e-12) this.accumulatedSeconds = 0;

    for (let index = 0; index < stepCount; index += 1) this.advanceFixedStep();
    return this.snapshot();
  }

  /** Shift presentation and target by the same loop multiple. */
  normalize(loopLength: number): CarouselInteractionSnapshot {
    if (!Number.isFinite(loopLength) || loopLength <= 0 || !this.hasFiniteState()) {
      this.holdAt(0);
      return this.snapshot();
    }
    const normalizedPosition = euclideanModulo(
      this.presentationPosition + loopLength / 2,
      loopLength,
    ) - loopLength / 2;
    const shift = normalizedPosition - this.presentationPosition;
    this.presentationPosition = normalizedPosition;
    this.presentationTarget += shift;
    if (!this.hasFiniteState()) this.holdAt(0);
    return this.snapshot();
  }

  private advanceFixedStep(): void {
    const priorError = this.presentationPosition - this.presentationTarget;
    if (Math.abs(priorError) <= POSITION_EPSILON
      && Math.abs(this.presentationVelocity) <= VELOCITY_EPSILON) {
      this.holdAt(this.presentationTarget);
      return;
    }

    const omega = SETTLING_ANGULAR_FREQUENCY;
    const duration = FIXED_STEP_SECONDS;
    const coefficient = this.presentationVelocity + omega * priorError;
    const decay = Math.exp(-omega * duration);
    const nextError = (priorError + coefficient * duration) * decay;
    const nextVelocity = (
      this.presentationVelocity - omega * coefficient * duration
    ) * decay;

    // A critical response can cross once after an aggressive reversal. Land on
    // the target at that crossing instead of exposing an uncontrolled rebound.
    if (priorError !== 0 && nextError !== 0 && Math.sign(priorError) !== Math.sign(nextError)) {
      this.holdAt(this.presentationTarget);
      return;
    }

    this.presentationPosition = this.presentationTarget + nextError;
    this.presentationVelocity = nextVelocity;
    if (!this.hasFiniteState()) this.holdAt(0);
  }

  private holdAt(position: number): void {
    const safePosition = finiteOrZero(position);
    this.presentationPosition = safePosition;
    this.presentationTarget = safePosition;
    this.presentationVelocity = 0;
    this.accumulatedSeconds = 0;
    this.manipulatingDirectly = false;
  }

  private hasFiniteState(): boolean {
    return Number.isFinite(this.presentationPosition)
      && Number.isFinite(this.presentationTarget)
      && Number.isFinite(this.presentationVelocity)
      && Number.isFinite(this.accumulatedSeconds);
  }
}

export const CAROUSEL_INTERACTION_FIXED_STEP_SECONDS = FIXED_STEP_SECONDS;
export const CAROUSEL_INTERACTION_SETTLING_ANGULAR_FREQUENCY = SETTLING_ANGULAR_FREQUENCY;
