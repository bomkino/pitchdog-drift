import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("App export job controller contract", () => {
  it("uses one Guided Export status, cancellation, and receipt settlement seam", () => {
    expect(appSource.match(/createExportJobController\(\)/gu)).toHaveLength(1);
    expect(appSource).toContain("exportJobController.begin(snapshot, controller, initialProgress)");
    expect(appSource.match(/exportJobController\.complete\(reservation\.snapshot\.id, completion\)/gu)).toHaveLength(3);
    expect(appSource).toContain("exportJobController.cancel(active.id)");
    expect(appSource).toContain("reserveExport(guidedExportIntent, false)");
    expect(appSource).not.toContain('abort("Canceled by user")');
    expect(appSource).not.toContain('abort("Canceled from the macOS menu")');
  });
});
