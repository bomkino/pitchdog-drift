import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const verifier = join(root, "scripts/verify-macos-user-guide.mjs");
const releaseGuide = join(root, "docs/MACOS_USER_GUIDE.md");
const v2Guide = join(root, "docs/v2/MACOS_V2_DEV_USER_GUIDE.md");
const temporaryDirectories = [];

function verify(channel, guide) {
  return spawnSync(process.execPath, [verifier, channel, guide], { encoding: "utf8" });
}

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "drift-guide-verifier-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  while (temporaryDirectories.length) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe("packaged macOS user-guide profiles", () => {
  it("accepts the production and V2 development guides only under their matching profiles", () => {
    expect(verify("release", releaseGuide).status).toBe(0);
    expect(verify("v2-dev", v2Guide).status).toBe(0);
    expect(verify("v2-dev", releaseGuide).status).not.toBe(0);
    expect(verify("release", v2Guide).status).not.toBe(0);
  });

  it("rejects a V2 guide that reintroduces portable-project ownership instructions", () => {
    const directory = temporaryDirectory();
    const guide = join(directory, "MACOS_USER_GUIDE.md");
    writeFileSync(
      guide,
      `${readFileSync(v2Guide, "utf8")}\nUse **File → Save Portable Project…** for your deck.\n`,
      "utf8",
    );

    const result = verify("v2-dev", guide);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("guide contains forbidden");
  });

  it("rejects a symlinked bundled guide", () => {
    const directory = temporaryDirectory();
    const guide = join(directory, "MACOS_USER_GUIDE.md");
    symlinkSync(v2Guide, guide);

    const result = verify("v2-dev", guide);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("guide must be one non-empty regular file");
  });
});
