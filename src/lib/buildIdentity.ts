export const DRIFT_RELEASE_DATABASE_NAME = "pitchdog-drift" as const;
export const DRIFT_V2_DEV_DATABASE_NAME = "pitchdog-drift-v2-dev" as const;

export type DriftBuildChannel = "release" | "v2-dev";

export interface DriftBuildIdentity {
  channel: DriftBuildChannel;
  databaseName: typeof DRIFT_RELEASE_DATABASE_NAME | typeof DRIFT_V2_DEV_DATABASE_NAME;
  displayName: "Drift" | "Drift V2 Dev";
  isDevelopment: boolean;
}

const BUILD_IDENTITIES: Readonly<Record<DriftBuildChannel, DriftBuildIdentity>> = Object.freeze({
  release: Object.freeze({
    channel: "release",
    databaseName: DRIFT_RELEASE_DATABASE_NAME,
    displayName: "Drift",
    isDevelopment: false,
  }),
  "v2-dev": Object.freeze({
    channel: "v2-dev",
    databaseName: DRIFT_V2_DEV_DATABASE_NAME,
    displayName: "Drift V2 Dev",
    isDevelopment: true,
  }),
});

export function resolveDriftBuildIdentity(value: unknown): DriftBuildIdentity {
  if (value === "release" || value === "v2-dev") return BUILD_IDENTITIES[value];
  throw new Error(`Unsupported Drift build channel: ${String(value)}`);
}

declare const __DRIFT_BUILD_CHANNEL__: unknown;

function compiledBuildChannel(): unknown {
  return typeof __DRIFT_BUILD_CHANNEL__ === "undefined" ? "release" : __DRIFT_BUILD_CHANNEL__;
}

export const driftBuildIdentity = resolveDriftBuildIdentity(compiledBuildChannel());
