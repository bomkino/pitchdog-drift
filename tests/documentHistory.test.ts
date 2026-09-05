import { describe, expect, it } from "vitest";
import { captureDocumentHistory, trimDocumentHistory, type DocumentHistory } from "../src/core/project/documentHistory";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import type { StudioAsset } from "../src/model";

describe("media history ownership", () => {
  it("retains original media and order without retaining live URLs", () => {
    const p = createDefaultDriftProjectV4("history", "2026-09-05T00:00:00.000Z");
    const blob = new Blob(["original video bytes"], { type: "video/mp4" });
    const a: StudioAsset = { id: "clip", name: "clip.mp4", kind: "video", blob, mimeType: blob.type, width: 100, height: 100, duration: 2, objectUrl: "blob:retired" };
    const entry = captureDocumentHistory(p, [a], null);
    expect(entry.assets[0]!.blob).toBe(blob);
    expect(entry.assets[0]!.objectUrl).toBe("");
    p.card.scale = 0.91;
    expect(entry.project.card.scale).not.toBe(p.card.scale);
  });
  it("bounds undo depth without copying immutable media", () => {
    const p = createDefaultDriftProjectV4("history", "2026-09-05T00:00:00.000Z");
    const h: DocumentHistory = { past: Array.from({ length: 70 }, () => captureDocumentHistory(p, [], null)), future: [], lastGesture: null };
    trimDocumentHistory(h, [], null);
    expect(h.past).toHaveLength(50);
  });
});
