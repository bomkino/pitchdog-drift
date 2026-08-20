const MIN_STRIDE = 1e-6;
const MIN_STEP_COUNT = 8;
const MAX_STEP_COUNT = 96;
const TARGET_ACCENT_HZ = 12;
const MAX_HOLD_FRACTION = 0.22;

export interface EditorialCadenceState {
  cycle: number;
  rawPhase: number;
  progress: number;
  holdFraction: number;
  transitionProgress: number;
  transitionPulse: number;
  anticipation: number;
  landingImpact: number;
  settle: number;
  stepsPerStride: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

/** A zero-slope interpolation that cannot overshoot its endpoints. */
export function smootherstep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** A zero-at-edges envelope with a stable authored peak. */
function editorialEnvelope(value: number, start: number, peak: number, end: number): number {
  const rise = smootherstep((value - start) / Math.max(MIN_STRIDE, peak - start));
  const fall = 1 - smootherstep((value - peak) / Math.max(MIN_STRIDE, end - peak));
  return clamp(rise * fall, 0, 1);
}

/**
 * Resolves the authored cadence for one strip stride.
 *
 * The remap stays monotonic and stride-periodic. Therefore it can add holds,
 * stepped accents, and a settle pulse without reordering slides or breaking a
 * seamless whole-track export. The tactile accent is spatially quantized—not
 * tied to requestAnimationFrame—so preview, stills, frame sequences, and video
 * use the same deterministic pose for the same distance.
 */
export function evaluateEditorialCadence(
  distance: number,
  stride: number,
  speed: number,
  holdAmount: number,
  cutAmount: number,
): EditorialCadenceState {
  if (!Number.isFinite(distance) || !Number.isFinite(stride) || Math.abs(stride) < MIN_STRIDE) {
    return {
      cycle: 0,
      rawPhase: 0,
      progress: 0,
      holdFraction: 0,
      transitionProgress: 0,
      transitionPulse: 0,
      anticipation: 0,
      landingImpact: 0,
      settle: 0,
      stepsPerStride: MIN_STEP_COUNT,
    };
  }

  const safeStride = Math.abs(stride);
  const cyclePosition = distance / safeStride;
  const cycle = Math.floor(cyclePosition);
  const rawPhase = cyclePosition - cycle;
  const holdStrength = clamp(Number.isFinite(holdAmount) ? holdAmount : 0, 0, 1);
  const cutStrength = clamp(Number.isFinite(cutAmount) ? cutAmount : 0, 0, 1);
  const holdFraction = holdStrength * MAX_HOLD_FRACTION;
  const transitionSpan = Math.max(MIN_STRIDE, 1 - holdFraction * 2);
  const transitionProgress = clamp((rawPhase - holdFraction) / transitionSpan, 0, 1);

  const heldProgress = smootherstep(transitionProgress);
  // Below 45% the director is blending from continuous drift into authored
  // cadence. At and above 45%, hold amount controls plateau width—not whether
  // the frame is truly still. All shipped cuts therefore have exact rests.
  const holdAuthority = smootherstep(clamp(holdStrength / 0.45, 0, 1));
  const easedProgress = mix(rawPhase, heldProgress, holdAuthority);

  // At the common 0.5 slides/s recipe this produces roughly twelve visible
  // pose changes per second. Speed changes preserve the editorial accent while
  // keeping the strip endpoints exact and the master frame rate untouched.
  const safeSpeed = clamp(Number.isFinite(speed) ? Math.abs(speed) : 0, 0.08, 1.5);
  const stepsPerStride = Math.round(clamp(TARGET_ACCENT_HZ / safeSpeed, MIN_STEP_COUNT, MAX_STEP_COUNT));
  const stepBlend = smootherstep(cutStrength);
  const steppedProgress = Math.round(easedProgress * stepsPerStride) / stepsPerStride;
  const progress = clamp(mix(easedProgress, steppedProgress, stepBlend), 0, 1);
  const steppedTransition = Math.round(transitionProgress * stepsPerStride) / stepsPerStride;
  const poseTransition = clamp(mix(transitionProgress, steppedTransition, stepBlend), 0, 1);

  const pulse = Math.sin(Math.PI * poseTransition);
  const transitionPulse = pulse * pulse;
  // Tiny counter-motion before the carry and a separate landing accent make
  // the edit read as intention rather than a symmetric easing curve. Both
  // envelopes are exactly zero in the authored holds.
  const anticipation = editorialEnvelope(poseTransition, 0, 0.11, 0.28);
  const landingImpact = editorialEnvelope(poseTransition, 0.64, 0.82, 1);
  const settleTail = clamp((poseTransition - 0.56) / 0.44, 0, 1);
  const settle = Math.sin(settleTail * Math.PI * 2.25)
    * Math.pow(1 - settleTail, 2)
    * transitionPulse;

  return {
    cycle,
    rawPhase,
    progress,
    holdFraction,
    transitionProgress: poseTransition,
    transitionPulse,
    anticipation,
    landingImpact,
    settle,
    stepsPerStride,
  };
}

export function remapEditorialDistance(
  distance: number,
  stride: number,
  speed: number,
  holdAmount: number,
  cutAmount: number,
): number {
  const cadence = evaluateEditorialCadence(distance, stride, speed, holdAmount, cutAmount);
  return (cadence.cycle + cadence.progress) * Math.abs(stride);
}

/**
 * Finds a raw timeline distance that resolves to the requested authored pose.
 * The cadence map is monotonic but can contain plateaus and stepped jumps, so
 * the inverse selects the closest deterministic pose and centers exact holds.
 */
export function invertEditorialDistance(
  visibleDistance: number,
  stride: number,
  speed: number,
  holdAmount: number,
  cutAmount: number,
): number {
  if (!Number.isFinite(visibleDistance) || !Number.isFinite(stride) || Math.abs(stride) < MIN_STRIDE) return 0;
  const safeStride = Math.abs(stride);
  const cyclePosition = visibleDistance / safeStride;
  const cycle = Math.floor(cyclePosition);
  const targetProgress = cyclePosition - cycle;
  if (targetProgress <= 1e-12) return cycle * safeStride;
  if (targetProgress >= 1 - 1e-12) return (cycle + 1) * safeStride;

  const progressAt = (rawPhase: number): number => evaluateEditorialCadence(
    rawPhase * safeStride,
    safeStride,
    speed,
    holdAmount,
    cutAmount,
  ).progress;

  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 36; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    if (progressAt(midpoint) < targetProgress) lower = midpoint;
    else upper = midpoint;
  }

  const candidates = [lower, upper, (lower + upper) / 2];
  let bestRaw = candidates[0]!;
  let bestError = Math.abs(progressAt(bestRaw) - targetProgress);
  for (const candidate of candidates.slice(1)) {
    const error = Math.abs(progressAt(candidate) - targetProgress);
    if (error < bestError - 1e-12 || (Math.abs(error - bestError) <= 1e-12 && candidate < bestRaw)) {
      bestRaw = candidate;
      bestError = error;
    }
  }

  // If the target is an exact plateau, find both plateau edges and return the
  // middle. This prevents direct manipulation from parking on a fragile edge.
  const bestProgress = progressAt(bestRaw);
  if (Math.abs(bestProgress - targetProgress) <= 1e-10) {
    let leftLow = 0;
    let leftHigh = bestRaw;
    for (let iteration = 0; iteration < 28; iteration += 1) {
      const midpoint = (leftLow + leftHigh) / 2;
      if (progressAt(midpoint) < targetProgress - 1e-10) leftLow = midpoint;
      else leftHigh = midpoint;
    }
    let rightLow = bestRaw;
    let rightHigh = 1;
    for (let iteration = 0; iteration < 28; iteration += 1) {
      const midpoint = (rightLow + rightHigh) / 2;
      if (progressAt(midpoint) <= targetProgress + 1e-10) rightLow = midpoint;
      else rightHigh = midpoint;
    }
    bestRaw = (leftHigh + rightLow) / 2;
  }

  return (cycle + bestRaw) * safeStride;
}

/** Stable, slide-owned registration. Never changes from frame to frame. */
export function editorialRegistration(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return fract(Math.sin((index + 1) * 12.9898) * 43_758.5453) * 2 - 1;
}
