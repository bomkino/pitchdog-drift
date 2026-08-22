import { describe, expect, it } from "vitest";
import { nativeImportKindForInput } from "../src/components/NativeFileInputBridge";

function input(accept: string): HTMLInputElement {
  return { accept } as HTMLInputElement;
}

describe("native file-input classification", () => {
  it("routes portable projects to the project panel", () => {
    expect(nativeImportKindForInput(input(".pitched,application/vnd.pitchdog.pitched+zip"))).toBe("project");
  });

  it("routes every supported presenter spelling to the presenter panel", () => {
    expect(nativeImportKindForInput(input("video/mp4,video/webm,video/quicktime"))).toBe("presenter");
    expect(nativeImportKindForInput(input(".MP4,.MOV,.WEBM"))).toBe("presenter");
  });

  it("routes image and unknown file contracts to the slide panel", () => {
    expect(nativeImportKindForInput(input("image/png,image/jpeg,image/webp,image/avif"))).toBe("slides");
    expect(nativeImportKindForInput(input(""))).toBe("slides");
  });
});
