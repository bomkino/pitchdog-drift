/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";

const sourceModules = import.meta.glob("../src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const workflowModules = import.meta.glob("../.github/workflows/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const source = new Map(
  Object.entries(sourceModules).map(([path, content]) => [path.replace(/^\.\.\/src\//, ""), content]),
);
const completeSource = Array.from(source.entries(), ([path, content]) => `// ${path}\n${content}`).join("\n");

function expectModuleConsumed(moduleName: string): void {
  const importPattern = new RegExp(`from\\s+["'][^"']*${moduleName}["']`);
  expect(completeSource, `${moduleName}.ts must be imported by the live product`).toMatch(importPattern);
}

describe("creator-surface truth", () => {
  it("mounts Director Commands from the application entry point", () => {
    const main = source.get("main.tsx") ?? "";
    expect(main).toMatch(/directorCommands/);
    expect(main).toMatch(/\b(?:install|mount|init|initialize|setup|start)[A-Za-z]*DirectorCommands\b/);
  });

  it("does not leave journey architecture as dead helper files", () => {
    for (const moduleName of ["direction", "deckHealth", "guides", "legibility", "outputPresets"]) {
      expectModuleConsumed(moduleName);
    }
  });

  it("keeps creator-language commands discoverable", () => {
    const commands = source.get("lib/directorCommands.ts") ?? "";
    for (const phrase of ["variation", "before after", "social safe", "output", "undo"]) {
      expect(commands.toLowerCase()).toContain(phrase);
    }
    expect(commands).toMatch(/metaKey|ctrlKey/);
    expect(commands).toMatch(/aria-|setAttribute\(["']role|role\s*[:=]/);
  });

  it("keeps temporary code-delivery machinery out of the review tree", () => {
    const workflows = Object.keys(workflowModules)
      .map((path) => path.split("/").at(-1) ?? path)
      .sort();
    const temporary = workflows.filter((name) =>
      /snapshot|gauntlet|take-shelf|harden-director|direction-packs|diagnostics|world-audition|visual-atlas/i.test(name),
    );
    expect(temporary).toEqual([]);
  });
});
