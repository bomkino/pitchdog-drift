const BUILT_IN_DEMO_ID = /^demo-(0[1-8])$/u;

/**
 * Built-in studies use a reserved id/name pair that survives Project V3 media
 * persistence. Runtime assets recover their replaceable-study status from that
 * durable identity instead of trusting filenames alone or adding UI-only state
 * to the portable project schema.
 */
export function isBuiltInDemoAssetIdentity(id: string, name: string): boolean {
  const match = BUILT_IN_DEMO_ID.exec(id);
  return match !== null && name === `Drift study ${match[1]}.png`;
}
