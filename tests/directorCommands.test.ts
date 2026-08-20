import { describe, expect, it } from "vitest";
import { DIRECTOR_COMMANDS, normalizeCommandText, rankDirectorCommands } from "../src/lib/directorCommands";

describe("director command surface", () => {
  it("keeps command ids and titles unique", () => {
    expect(new Set(DIRECTOR_COMMANDS.map((command) => command.id)).size).toBe(DIRECTOR_COMMANDS.length);
    expect(new Set(DIRECTOR_COMMANDS.map((command) => command.title)).size).toBe(DIRECTOR_COMMANDS.length);
  });

  it("normalizes punctuation, diacritics and case", () => {
    expect(normalizeCommandText("  Cléan—Lens / BEFORE  ")).toBe("clean lens before");
  });

  it("ranks exact outcomes before incidental descriptions", () => {
    const results = rankDirectorCommands("output");
    expect(results[0]?.id).toBe("output");
  });

  it("finds commands through creator language, not only UI labels", () => {
    expect(rankDirectorCommands("variation")[0]?.id).toBe("new-take");
    expect(rankDirectorCommands("before after")[0]?.id).toBe("clean-lens");
    expect(rankDirectorCommands("social safe")[0]?.id).toBe("guides");
  });

  it("returns the authored journey when the query is empty", () => {
    expect(rankDirectorCommands("").map((command) => command.id)).toEqual(DIRECTOR_COMMANDS.map((command) => command.id));
  });
});
