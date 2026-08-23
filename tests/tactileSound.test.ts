import { describe, expect, it } from "vitest";
import { DRIFT_V2_RENDER_CONTRACT } from "../src/core/project/schema";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import {
  SONIC_CUES,
  getSonicAssetBytes,
  getSonicAssetSpec,
  getSonicAssetVariantCount,
  type SonicPalette,
} from "../src/sonic/catalog";
import manifest from "../src/sonic/assets/manifest.json";
import { planTactileLayers } from "../src/sonic/tactileSound";

const PALETTES: readonly SonicPalette[] = ["studio", "cinematic", "paper"];

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function projectWithSound(grammar: "dry" | "editorial" | "organic") {
  const project = createDefaultDriftProjectV4(
    `sound-${grammar}`,
    "2026-08-23T00:00:00.000Z",
    42,
    DRIFT_V2_RENDER_CONTRACT,
  );
  project.media.order = ["slide-a", "slide-b", "slide-c"];
  project.sound.exportEnabled = true;
  project.sound.grammar = grammar;
  project.sound.density = 1;
  return project;
}

describe("tactile sound", () => {
  it("keeps sound opt-in and plans deterministic semantic layers", () => {
    const silent = createDefaultDriftProjectV4("silent", "2026-08-23T00:00:00.000Z", 42, DRIFT_V2_RENDER_CONTRACT);
    expect(planTactileLayers(silent)).toEqual([]);

    const organic = projectWithSound("organic");
    const first = planTactileLayers(organic);
    expect(first).toEqual(planTactileLayers(structuredClone(organic)));
    expect(new Set(first.map((layer) => layer.role))).toEqual(new Set(["body", "air", "contact", "landing"]));
    expect(first.every((layer) => layer.gain <= 0.78)).toBe(true);

    const dry = planTactileLayers(projectWithSound("dry"));
    expect(dry.some((layer) => layer.role === "air" || layer.role === "contact")).toBe(false);
  });

  it("decodes the complete pinned CC0 corpus without changing bytes", async () => {
    const expected = new Map(manifest.recordings.map((recording) => [recording.localPath.split("/").at(-1)!, recording]));
    const observed = new Set<string>();
    for (const palette of PALETTES) {
      for (const cue of SONIC_CUES) {
        for (let variant = 0; variant < getSonicAssetVariantCount(palette, cue); variant += 1) {
          const spec = getSonicAssetSpec(palette, cue, variant);
          if (observed.has(spec.name)) continue;
          observed.add(spec.name);
          const bytes = await getSonicAssetBytes(palette, cue, variant);
          const receipt = expected.get(spec.name);
          expect(receipt, spec.name).toBeDefined();
          expect(bytes.byteLength, spec.name).toBe(receipt!.bytes);
          expect(await sha256(bytes), spec.name).toBe(receipt!.sha256);
        }
      }
    }
    expect(observed.size).toBe(manifest.recordings.length);
  });
});
