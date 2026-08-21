import type { SonicEnvelopeSpec, SonicFilterSpec } from "./grammar";

/** Build one deterministic filter chain from the pure layer recipe. */
export function createSonicFilters(
  context: BaseAudioContext,
  specs: readonly SonicFilterSpec[],
): readonly BiquadFilterNode[] {
  return specs.map((spec) => {
    const filter = context.createBiquadFilter();
    filter.type = spec.type;
    filter.frequency.value = spec.frequency;
    filter.Q.value = spec.q;
    return filter;
  });
}

/**
 * Fits authored attack and release times inside even the shortest source
 * window. Keeping this pure guarantees live preview and offline export shape
 * the same physical recording in the same way.
 */
export function getSonicEnvelopePoints(
  start: number,
  end: number,
  envelope: Readonly<SonicEnvelopeSpec>,
): Readonly<{ attackEnd: number; releaseStart: number }> {
  const safeStart = Number.isFinite(start) ? start : 0;
  const safeEnd = Number.isFinite(end) ? Math.max(safeStart, end) : safeStart;
  const duration = safeEnd - safeStart;
  const attack = Math.min(Math.max(0, envelope.attack), duration * 0.4);
  const release = Math.min(Math.max(0, envelope.release), duration * 0.68);
  const attackEnd = Math.min(safeEnd, safeStart + attack);
  return Object.freeze({
    attackEnd,
    releaseStart: Math.max(attackEnd, safeEnd - release),
  });
}
