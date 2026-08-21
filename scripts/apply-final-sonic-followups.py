#!/usr/bin/env python3
"""Apply final semantic and browser-contract follow-ups after core hardening."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def write(relative: str, content: str) -> None:
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")


def replace_once(relative: str, before: str, after: str) -> None:
    source = read(relative)
    count = source.count(before)
    if count != 1:
        raise RuntimeError(
            f"{relative}: expected one follow-up target, found {count}: {before[:100]!r}"
        )
    write(relative, source.replace(before, after, 1))


replace_once(
    "src/lib/exportStudio.ts",
    "const presenterAudioFpsSupported = settings.fps <= 30;",
    "const presenterAudioFpsSupported = !includeAudio || settings.fps <= 30;",
)
replace_once(
    "docs/SONIC_DESIGN.md",
    """- the under-voice control scales effects only when speech coexists;
- 50/60 fps audio-bearing output fails visibly under the existing codec gate;""",
    """- decoded PCM is analysed in 20 ms windows so zero-filled packet gaps do
  not masquerade as dialogue;
- the under-voice control follows measured presenter activity, bridges brief
  consonant gaps, and releases smoothly through meaningful narration pauses;
- 50/60 fps authored sound fails before a destination picker opens, while an
  enabled switch with no actual sound event does not block silent output;""",
)

write(
    "e2e/sonic-preflight.e2e.ts",
    '''import { expect, test } from "@playwright/test";

async function installPickerProbe(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    const tracked = window as Window & {
      __driftPickerCalls?: number;
      showSaveFilePicker?: () => Promise<FileSystemFileHandle>;
    };
    tracked.__driftPickerCalls = 0;
    tracked.showSaveFilePicker = async () => {
      tracked.__driftPickerCalls = (tracked.__driftPickerCalls ?? 0) + 1;
      throw new DOMException("fixture picker closed", "AbortError");
    };
  });
}

async function waitForStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".stage-frame")).toHaveAttribute(
    "data-context",
    /ready|restored/,
  );
}

async function directSixtyFpsSound(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.getByLabel("Open sound direction controls").click();
  await page.getByRole("switch", { name: /Include in MP4/ }).check();
  await page.getByRole("group", { name: "Frame rate" })
    .getByRole("radio", { name: "60", exact: true })
    .check();
}

async function pickerCalls(page: import("@playwright/test").Page): Promise<number> {
  return await page.evaluate(() => (
    window as Window & { __driftPickerCalls?: number }
  ).__driftPickerCalls ?? 0);
}

test("50/60 fps authored sound fails before opening a destination picker", async ({ page }) => {
  await installPickerProbe(page);
  await waitForStudio(page);
  await directSixtyFpsSound(page);
  await page.getByRole("button", { name: "Export MP4 master" }).click();

  await expect(page.getByRole("alert")).toContainText(
    /24, 25, or 30 fps/i,
  );
  expect(await pickerCalls(page)).toBe(0);
});

test("an enabled sound switch does not block a genuinely silent 60 fps master", async ({ page }) => {
  await installPickerProbe(page);
  await waitForStudio(page);
  await directSixtyFpsSound(page);
  await page.getByRole("slider", { name: "Density" }).fill("0");
  await page.getByRole("button", { name: "Export MP4 master" }).click();

  await expect.poll(() => pickerCalls(page)).toBe(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
''',
)

print("Final sonic follow-up patches applied.")
