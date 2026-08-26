import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InterfaceScaleMenu } from "../src/components/InterfaceScaleMenu";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { exportPlanFromProject } from "../src/core/project/appPresentation";
import { createProjectRevisionState } from "../src/core/project/revisions";
import { evaluateProjectFrame } from "../src/core/render/projectFrameAdapter";
import {
  applyInterfaceScaleCommand,
  createInterfaceScalePreferenceStore,
  interfaceScaleLayout,
  normalizeInterfaceScale,
} from "../src/lib/interfaceScale";
import { createBrowserDesktopPlatform } from "../src/lib/desktopPlatform";
import type { StudioAsset } from "../src/model";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

/*
 * Promise: Interface Scale is bounded local presentation state.
 * Failure: malformed persistence escapes range/step or relaunch loses a valid choice.
 * Public seam: InterfaceScalePreferenceStore and scale commands.
 * Cheapest loop: pure model plus injected storage contract.
 */
describe("Interface Scale preference", () => {
  it("clamps persisted values to 75–200 in five-point steps", () => {
    expect(normalizeInterfaceScale(undefined)).toBe(100);
    expect(normalizeInterfaceScale("nope")).toBe(100);
    expect(normalizeInterfaceScale(71)).toBe(75);
    expect(normalizeInterfaceScale(112)).toBe(110);
    expect(normalizeInterfaceScale(203)).toBe(200);
  });

  it("supports set, smaller, larger, reset, and stable responsive modes", () => {
    expect(applyInterfaceScaleCommand(100, { type: "set", value: 125 })).toBe(125);
    expect(applyInterfaceScaleCommand(125, { type: "smaller" })).toBe(120);
    expect(applyInterfaceScaleCommand(120, { type: "larger" })).toBe(125);
    expect(applyInterfaceScaleCommand(125, { type: "reset" })).toBe(100);
    expect(interfaceScaleLayout(125)).toBe("three-panel");
    expect(interfaceScaleLayout(150)).toBe("single-panel");
    expect(applyInterfaceScaleCommand(200, { type: "larger" })).toBe(200);
  });

  it("persists before a second store reads its initial snapshot", () => {
    const storage = new MemoryStorage();
    const first = createInterfaceScalePreferenceStore(storage);
    const observed: number[] = [];
    const unsubscribe = first.subscribe((snapshot) => observed.push(snapshot.value));

    expect(first.dispatch({ type: "set", value: 150 })).toMatchObject({
      value: 150,
      revision: 1,
      layout: "single-panel",
    });
    expect(observed).toEqual([150]);
    unsubscribe();

    expect(createInterfaceScalePreferenceStore(storage).getSnapshot()).toMatchObject({
      value: 150,
      revision: 0,
      layout: "single-panel",
    });
  });

  it("crosses DesktopPlatform presentation and exposes named reachable controls", () => {
    const storage = new MemoryStorage();
    const store = createInterfaceScalePreferenceStore(storage);
    const platform = createBrowserDesktopPlatform({
      choosePortableProject: async () => null,
      publishPortableProject: async () => undefined,
    }, store);
    const markup = renderToStaticMarkup(createElement(InterfaceScaleMenu, {
      snapshot: platform.presentation.interfaceScale.getSnapshot(),
      disabled: false,
      onCommand: () => undefined,
    }));

    expect(platform.presentation.interfaceScale).toBe(store);
    expect(markup).toContain("Interface Scale 100%");
    expect(markup).toContain("Smaller Interface Scale");
    expect(markup).toContain("Larger Interface Scale");
    expect(markup).toContain("Reset Interface Scale");
    for (const value of [75, 100, 125, 150, 200]) expect(markup).toContain(`${value}%`);
  });
});

/*
 * Promise: scale-only commands never change Project, evaluator, export, or dirty truth.
 * Failure: a presentation command mutates or enters any creative/output input.
 * Public seam: Project serialization, evaluateProjectFrame, exportPlanFromProject.
 * Cheapest loop: canonical state/evaluator/output equality around one scale dispatch.
 */
describe("Interface Scale creative invariants", () => {
  it("leaves Project bytes, revision state, evaluator, and export plan equal", () => {
    const project = createDefaultDriftProjectV4(
      "interface-scale-invariant",
      "2026-08-27T00:00:00.000Z",
      27,
    );
    const asset: StudioAsset = {
      id: "scale-slide",
      name: "scale-slide.png",
      kind: "image",
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      mimeType: "image/png",
      width: 1600,
      height: 900,
      hash: "a".repeat(64),
      objectUrl: "blob:scale-slide",
    };
    project.media.order = [asset.id];
    project.media.assets[asset.id] = {
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      mimeType: asset.mimeType,
      hash: asset.hash!,
      byteLength: asset.blob.size,
      width: asset.width,
      height: asset.height,
    };
    project.slides[asset.id] = {
      assetId: asset.id,
      fit: "contain",
      focalX: 0.3,
      focalY: 0.7,
      scaleOffset: 0,
    };
    const revisions = createProjectRevisionState(4);
    const projectBytes = JSON.stringify(project);
    const frame = evaluateProjectFrame({ project, assets: [asset], time: 1.25, frameIndex: 30 });
    const exportPlan = exportPlanFromProject(project);

    const storage = new MemoryStorage();
    createInterfaceScalePreferenceStore(storage).dispatch({ type: "set", value: 200 });

    expect(JSON.stringify(project)).toBe(projectBytes);
    expect(revisions).toEqual(createProjectRevisionState(4));
    expect(evaluateProjectFrame({ project, assets: [asset], time: 1.25, frameIndex: 30 })).toEqual(frame);
    expect(exportPlanFromProject(project)).toEqual(exportPlan);
  });
});
