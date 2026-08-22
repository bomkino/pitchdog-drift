import { describe, expect, it } from "vitest";
import {
  DRIFT_RELEASE_DATABASE_NAME,
  DRIFT_V2_DEV_DATABASE_NAME,
  resolveDriftBuildIdentity,
} from "../src/lib/buildIdentity";

describe("Drift build identity", () => {
  it("gives V2 development a database namespace that cannot collide with release", () => {
    const release = resolveDriftBuildIdentity("release");
    const development = resolveDriftBuildIdentity("v2-dev");

    expect(release.databaseName).toBe(DRIFT_RELEASE_DATABASE_NAME);
    expect(development.databaseName).toBe(DRIFT_V2_DEV_DATABASE_NAME);
    expect(development.databaseName).not.toBe(release.databaseName);
    expect(development.displayName).toBe("Drift V2 Dev");
    expect(development.isDevelopment).toBe(true);
  });

  it("fails closed instead of silently falling back for an unknown channel", () => {
    expect(() => resolveDriftBuildIdentity("preview-ish")).toThrow(/Unsupported Drift build channel/);
    expect(() => resolveDriftBuildIdentity(undefined)).toThrow(/Unsupported Drift build channel/);
  });
});
