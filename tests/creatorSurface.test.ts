import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = join(root, "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

const files = sourceFiles(sourceRoot);
const source = new Map(
  files.map((path) => [relative(sourceRoot, path).replaceAll("\\", "/"), readFileSync(path, "utf8")]),
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
    expect(main).toMatch(/installDirectorCommands|mountDirectorCommands|initDirectorCommands/);
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
    expect(commands).toMatch(/aria-|role=/);
  });

  it("keeps temporary code-delivery machinery out of the review tree", () => {
    const workflowRoot = join(root, ".github", "workflows");
    const workflows = readdirSync(workflowRoot).sort();
    const temporary = workflows.filter((name) =>
      /snapshot|gauntlet|take-shelf|harden-director|direction-packs|diagnostics|world-audition|visual-atlas/i.test(name),
    );
    expect(temporary).toEqual([]);
  });
});
