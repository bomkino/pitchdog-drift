import { describe, expect, it } from "vitest";
import {
  assertLinuxSandboxMetadata,
  linuxSandboxSetupInstructions,
} from "../scripts/linux-sandbox-contract.mjs";

describe("Linux Chromium sandbox metadata contract", () => {
  it("rejects a setuid helper that is not owned by root", () => {
    expect(() => assertLinuxSandboxMetadata({ uid: 1000, gid: 1000, mode: 0o104755 }))
      .toThrowError(/UID 0 and GID 0.*uid=1000, gid=1000, mode=04755/iu);
  });

  it("rejects root ownership without the exact setuid mode", () => {
    expect(() => assertLinuxSandboxMetadata({ uid: 0, gid: 0, mode: 0o100755 }))
      .toThrowError(/exact mode 04755.*mode=00755/iu);
  });

  it("accepts only root-owned exact mode 04755", () => {
    expect(assertLinuxSandboxMetadata({ uid: 0, gid: 0, mode: 0o104755 }))
      .toEqual({ uid: 0, gid: 0, mode: 0o4755 });
  });

  it("orders administrator setup safely before desktop-user verification", () => {
    const instructions = linuxSandboxSetupInstructions(
      "/tmp/drift candidate",
      "/tmp/drift candidate/chrome-sandbox",
    ).split("\n");

    expect(instructions[1]).toBe("sudo chown root:root -- '/tmp/drift candidate/chrome-sandbox'");
    expect(instructions[2]).toBe("sudo chmod 4755 -- '/tmp/drift candidate/chrome-sandbox'");
    expect(instructions[3]).toBe("DRIFT_LINUX_TRACER_DIR='/tmp/drift candidate' npm run verify:linux:tracer");
  });
});
