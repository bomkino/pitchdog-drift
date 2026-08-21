import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function gitBlobSha1(data) {
  const header = Buffer.from(`blob ${data.length}\0`, "ascii");
  return createHash("sha1").update(header).update(data).digest("hex");
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

describe("authentic tactile asset ledger", () => {
  const manifestPath = resolve(
    process.cwd(),
    "src/sonic/assets/manifest.json",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  it("pins one exact local CC0 corpus with no third-party runtime path", () => {
    expect(manifest.upstreamRevision).toBe(
      "a7a3ee178d2ec48f4354782f244ab777a0e238df",
    );
    expect(manifest.runtimeNetworkRequests).toBe(false);
    expect(manifest.recordings).toHaveLength(23);
    expect(manifest.licenseFiles).toHaveLength(3);
    expect(new Set(manifest.recordings.map((entry) => entry.localPath)).size).toBe(23);
    expect(new Set(manifest.recordings.map((entry) => entry.upstreamPath)).size).toBe(23);
    expect(new Set(manifest.licenseFiles.map((entry) => entry.localPath)).size).toBe(3);
  });

  it("verifies every WAV header, byte length and cryptographic digest", () => {
    for (const entry of manifest.recordings) {
      const data = readFileSync(resolve(process.cwd(), entry.localPath));
      expect(data.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(data.subarray(8, 12).toString("ascii")).toBe("WAVE");
      expect(data.length).toBe(entry.bytes);
      expect(gitBlobSha1(data)).toBe(entry.gitBlobSha1);
      expect(sha256(data)).toBe(entry.sha256);
      expect(entry.upstreamRevision).toBe(manifest.upstreamRevision);
      expect(entry.license).toBe("CC0-1.0");
      expect(entry.canonicalSource).toMatch(
        /^https:\/\/kenney\.nl\/assets\//,
      );
    }
  });

  it("preserves and hashes the original CC0 notice for each source pack", () => {
    const packs = new Set();
    for (const entry of manifest.licenseFiles) {
      const data = readFileSync(resolve(process.cwd(), entry.localPath));
      const text = data.toString("utf8");
      expect(entry.license).toBe("CC0-1.0");
      expect(entry.bytes).toBe(data.length);
      expect(entry.sha256).toBe(sha256(data));
      expect(entry.canonicalSource).toMatch(
        /^https:\/\/kenney\.nl\/assets\//,
      );
      expect(text.toUpperCase()).toContain("CC0");
      packs.add(entry.pack);
    }
    expect(packs).toEqual(new Set([
      "casino-audio",
      "rpg-audio",
      "impact-sounds",
    ]));
  });
});
