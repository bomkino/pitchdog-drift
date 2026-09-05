import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { createStoredZip, readStoredZip } from "../src/lib/storedZip";
import { DEFAULT_PROJECT_BUNDLE_LIMITS } from "../src/lib/projectStore";

class SlicedOriginal extends Blob {
  override arrayBuffer(): Promise<ArrayBuffer> { throw new Error("Whole original must not be copied."); }
}

describe("portable stored ZIP streaming", () => {
  it("writes and reads chunk-boundary originals without whole-original arrayBuffer", async () => {
    const data = Uint8Array.from({ length: 512 * 1024 + 7 }, (_, index) => index % 251);
    const original = new SlicedOriginal([data]);
    const zip = await createStoredZip([{ path: "manifest.json", blob: new Blob(["{}"] ) }, { path: "assets/a.bin", blob: original }], 2 * 1024 * 1024);
    const entries = await readStoredZip(zip, DEFAULT_PROJECT_BUNDLE_LIMITS);
    expect(new Uint8Array(await entries!.get("assets/a.bin")!.arrayBuffer())).toEqual(data);
    expect(await entries!.get("manifest.json")!.text()).toBe("{}");
  });
  it("keeps deterministic archive bytes and empty entries", async () => {
    const files = [{ path: "manifest.json", blob: new Blob(["{}"]) }, { path: "assets/empty", blob: new Blob([]) }];
    const a = await createStoredZip(files, 10000), b = await createStoredZip(files, 10000);
    expect(await a.arrayBuffer()).toEqual(await b.arrayBuffer());
    expect((await readStoredZip(a, DEFAULT_PROJECT_BUNDLE_LIMITS))!.get("assets/empty")!.size).toBe(0);
  });
  it("hands valid deflated legacy archives back to the bounded compatibility reader", async () => {
    const bytes = zipSync({ "manifest.json": strToU8("{}"), "assets/a": strToU8("a".repeat(1000)) }, { level: 6 });
    expect(await readStoredZip(new Blob([bytes as Uint8Array<ArrayBuffer>]), DEFAULT_PROJECT_BUNDLE_LIMITS)).toBeNull();
  });
  it("stops oversized output rather than returning a partial archive", async () => {
    await expect(createStoredZip([{ path: "a", blob: new Blob(["x".repeat(1000)]) }], 100)).rejects.toThrow("size limit");
  });
});
