import { describe, expect, it } from "vitest";
import { deckStem, exportFileName, framePrefixForAssets, timestampSlug } from "../src/lib/naming";

function asset(name: string, demo = false) {
  return { name, demo };
}

describe("artifact naming", () => {
  it("derives a repeated project stem from numbered deck exports", () => {
    const assets = [
      asset("A Very Motherly Christmas - Slide 01.png"),
      asset("A Very Motherly Christmas - Slide 02.png"),
      asset("A Very Motherly Christmas - Slide 10.png"),
    ];
    expect(deckStem(assets)).toBe("a-very-motherly-christmas");
    expect(framePrefixForAssets(assets)).toBe("a-very-motherly-christmas-frame");
  });

  it("ignores the replaceable study when naming real work", () => {
    expect(deckStem([
      asset("Drift study 01.png", true),
      asset("My Film_001.png"),
    ])).toBe("my-film");
  });

  it("falls back rather than emitting generic slide names", () => {
    expect(deckStem([asset("Slide 001.png"), asset("Slide 002.png")])).toBe("drift");
    expect(deckStem([])).toBe("drift");
  });

  it("normalizes unsafe punctuation and diacritics", () => {
    expect(deckStem([asset("L’été / FINAL!!! 01.png")])).toBe("lete-final");
  });

  it("creates stable, timestamped filenames without milliseconds", () => {
    const date = new Date("2026-08-20T04:05:06.789Z");
    expect(timestampSlug(date)).toBe("2026-08-20T04-05-06Z");
    expect(exportFileName("master", ".MP4", [asset("Night Film 01.png")], date)).toBe(
      "night-film-master-2026-08-20T04-05-06Z.mp4",
    );
  });
});
