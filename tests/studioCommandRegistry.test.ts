import { describe, expect, it } from "vitest";
import {
  filterStudioCommands,
  searchStudioCommands,
  STUDIO_COMMAND_REGISTRY,
  studioCommandById,
  validateStudioCommandRegistry,
  type StudioCommandDefinition,
} from "../src/core/commands/studioCommandRegistry";

describe("studio command registry", () => {
  it("maps every required command family to stable action tokens", () => {
    expect(STUDIO_COMMAND_REGISTRY).toHaveLength(20);
    expect(STUDIO_COMMAND_REGISTRY.map(({ id }) => id)).toEqual([
      "workspace.slides",
      "workspace.world",
      "workspace.direct",
      "workspace.master",
      "preview.pause.toggle",
      "preview.focus.toggle",
      "guide.toggle",
      "comparison.toggle",
      "timing.mode.fixed-master",
      "timing.mode.content-paced",
      "timing.close-at-cut",
      "media.slides.add",
      "media.presenter.add",
      "media.pin-selected",
      "media.pin-return",
      "export.still",
      "export.sequence",
      "export.mp4",
      "history.undo",
      "history.redo",
    ]);
    expect(STUDIO_COMMAND_REGISTRY.map(({ action }) => action)).toContainEqual({
      type: "timing.mode.set",
      mode: "fixed-master",
    });
    expect(STUDIO_COMMAND_REGISTRY.map(({ action }) => action)).toContainEqual({
      type: "timing.mode.set",
      mode: "content-paced",
    });
    expect(studioCommandById("workspace.master")?.action).toEqual({
      type: "workspace.switch",
      workspace: "master",
    });
    expect(studioCommandById("missing")).toBeNull();
  });

  it("never advertises a command that still needs an uncollected parameter", () => {
    expect(STUDIO_COMMAND_REGISTRY.every((entry) => !("parameter" in entry))).toBe(true);
    expect(searchStudioCommands("film world").map(({ id }) => id)).toEqual(["workspace.world"]);
  });

  it("searches and ranks deterministically with stable authored tie breaks", () => {
    const first = searchStudioCommands("export png");
    const second = searchStudioCommands("  EXPORT---PNG  ");

    expect(first).toEqual(second);
    expect(first.map(({ id }) => id)).toEqual(["export.sequence", "export.still"]);
    expect(searchStudioCommands("fixed master")[0]?.id).toBe("timing.mode.fixed-master");
    expect(searchStudioCommands("command z").map(({ id }) => id)).toEqual([
      "history.undo",
      "history.redo",
    ]);
    expect(searchStudioCommands("not present anywhere")).toEqual([]);
  });

  it("filters by workspace while retaining global commands unless explicitly excluded", () => {
    const direct = filterStudioCommands({ workspace: "direct" });
    expect(direct.some(({ id }) => id === "timing.close-at-cut")).toBe(true);
    expect(direct.some(({ id }) => id === "history.undo")).toBe(true);
    expect(direct.some(({ id }) => id === "export.mp4")).toBe(false);

    const directOnly = filterStudioCommands({ workspace: "direct", includeGlobal: false });
    expect(directOnly.map(({ id }) => id)).toEqual(["timing.close-at-cut"]);
    expect(searchStudioCommands("export", { workspace: "master", limit: 2 })).toHaveLength(2);
    expect(searchStudioCommands("", { limit: 0 })).toEqual([]);
    expect(() => searchStudioCommands("", { limit: -1 })).toThrow(/non-negative safe integer/);
  });

  it("rejects duplicate ids", () => {
    const duplicate: StudioCommandDefinition = {
      ...STUDIO_COMMAND_REGISTRY[0]!,
      label: "A duplicate identity",
    };
    expect(() => validateStudioCommandRegistry([
      STUDIO_COMMAND_REGISTRY[0]!,
      duplicate,
    ])).toThrow("Duplicate studio command id: workspace.slides");

  });

  it("exposes deeply frozen static definitions", () => {
    const entry = STUDIO_COMMAND_REGISTRY[0]!;
    expect(Object.isFrozen(STUDIO_COMMAND_REGISTRY)).toBe(true);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.keywords)).toBe(true);
    expect(Object.isFrozen(entry.action)).toBe(true);
  });
});
