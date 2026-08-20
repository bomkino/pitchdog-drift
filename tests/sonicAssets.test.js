import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function gitBlobSha1(data) {
  const header = Buffer.from(`blob ${data.length}\0`, "ascii");
  return createHash("sha1").update(header).update(data).digest("hex");
}

describe("authentic tactile asset ledger", () => {
  const manifestPath = resolve(
    process.cwd(),
    "src/sonic/assets/manifest.json",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  it("pins a local CC0 corpus with no runtime request path", () => {
    expect(manifest.upstreamRevision).toBe(
      "a7a3ee178d2ec48f4354782f244ab777a0e238df",
    );
    expect(manifest.runtimeNetworkRequests).toBe(false);
    expect(manifest.recordings.length).toBeGreaterThanOrEqual(20);
    expect(manifest.licenseFiles).toHaveLength(3);
  });

  it("verifies every WAV header, byte length and cryptographic digest", () => {
    for (const entry of manifest.recordings) {
      const data = readFileSync(resolve(process.cwd(), entry.localPath));
      expect(data.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(data.subarray(8, 12).toString("ascii")).toBe("WAVE");
      expect(data.length).toBe(entry.bytes);
      expect(gitBlobSha1(data)).toBe(entry.gitBlobSha1);
      expect(createHash("sha256").update(data).digest("hex")).toBe(
        entry.sha256,
      );
      expect(entry.upstreamRevision).toBe(manifest.upstreamRevision);
      expect(entry.license).toBe("CC0-1.0");
      expect(entry.canonicalSource).toMatch(
        /^https:\/\/kenney\.nl\/assets\//,
      );
    }
  });

  it("preserves the original CC0 notice for each source pack", () => {
    for (const entry of manifest.licenseFiles) {
      const text = readFileSync(
        resolve(process.cwd(), entry.localPath),
        "utf8",
      );
      expect(entry.license).toBe("CC0-1.0");
      expect(text.toUpperCase()).toContain("CC0");
    }
  });
});
