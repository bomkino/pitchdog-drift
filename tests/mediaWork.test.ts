import { describe, expect, it } from "vitest";
import { mapMediaSettled } from "../src/lib/mediaWork";
import { mediaSha256 } from "../src/lib/mediaDigest";
import { formatFrameTime } from "../src/components/TimelineDock";

describe("bounded media work", () => {
  it("caps concurrent work, preserves order, and isolates a bad source", async () => {
    let active = 0; let maximum = 0;
    const result = await mapMediaSettled([0,1,2,3,4], async (i) => {
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--; if (i === 2) throw new Error("corrupt"); return i;
    }, 2);
    expect(maximum).toBe(2);
    expect(result.map((v) => v.status === "fulfilled" ? v.value : "bad")).toEqual([0,1,"bad",3,4]);
  });
  it("hashes an immutable blob only once, not all originals for each slider change", async () => {
    const blob = new Blob(["original"]);
    expect(mediaSha256(blob)).toBe(mediaSha256(blob));
    expect(await mediaSha256(blob)).toHaveLength(64);
    expect(await mediaSha256(new Blob(["changed"]))).not.toBe(await mediaSha256(blob));
  });
  it.each([24,25,30,50,60])("gives adjacent output frames distinct clocks at %i fps", (fps) => {
    expect(formatFrameTime(1 / fps, fps)).not.toBe(formatFrameTime(2 / fps, fps));
    expect(formatFrameTime(60, fps)).toBe("1:00:00");
  });
});
