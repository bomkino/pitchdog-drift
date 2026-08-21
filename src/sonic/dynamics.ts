/**
 * Web Audio's DynamicsCompressorNode is not a brick-wall limiter. Leaving a
 * small final safety margin keeps layered physical transients inside PCM full
 * scale without flattening the attacks that make paper, cloth and contact read.
 */
export const SONIC_OUTPUT_HEADROOM = 0.8;

/** One restrained dynamics contract for live monitoring and offline export. */
export function configureSonicCompressor(
  compressor: DynamicsCompressorNode,
): void {
  compressor.threshold.value = -17;
  compressor.knee.value = 20;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.18;
}
