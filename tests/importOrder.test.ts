import { describe, expect, it } from "vitest";
import { orderImportedImageFiles } from "../src/lib/importOrder";

function file(name: string, type = "image/png", webkitRelativePath = "") {
  return { name, type, webkitRelativePath };
}

describe("deck import order", () => {
  it("sorts numeric filenames as people read them", () => {
    const ordered = orderImportedImageFiles([
      file("slide-10.png"),
      file("slide-2.png"),
      file("slide-1.png"),
      file("slide-11.png"),
      file("slide-3.png"),
    ]);
    expect(ordered.map((entry) => entry.name)).toEqual([
      "slide-1.png",
      "slide-2.png",
      "slide-3.png",
      "slide-10.png",
      "slide-11.png",
    ]);
  });

  it("uses relative paths when a dropped folder carries them", () => {
    const ordered = orderImportedImageFiles([
      file("1.png", "image/png", "chapter-10/1.png"),
      file("2.png", "image/png", "chapter-2/2.png"),
      file("1.png", "image/png", "chapter-2/1.png"),
    ]);
    expect(ordered.map((entry) => entry.webkitRelativePath)).toEqual([
      "chapter-2/1.png",
      "chapter-2/2.png",
      "chapter-10/1.png",
    ]);
  });

  it("filters non-image files before they enter the decode queue", () => {
    const ordered = orderImportedImageFiles([
      file("notes.txt", "text/plain"),
      file("2.png"),
      file("1.jpg", "image/jpeg"),
    ]);
    expect(ordered.map((entry) => entry.name)).toEqual(["1.jpg", "2.png"]);
  });

  it("remains stable when two entries compare identically", () => {
    const first = file("slide.png");
    const second = file("slide.png");
    expect(orderImportedImageFiles([first, second])).toEqual([first, second]);
  });
});
