import { expect, test, type Locator } from "@playwright/test";
import { waitForStudio } from "./studio.helpers";

async function ensureInspectorOpen(group: Locator): Promise<void> {
  if (await group.getAttribute("open") === null) await group.locator("summary").click();
}

test("V2 app restores its authored room and repairs a legacy-style pinned frame", async ({ page }) => {
  await waitForStudio(page);

  await expect(page.locator("html")).toHaveAttribute("data-drift-build-channel", "v2-dev");
  await expect(page.locator("html")).toHaveAttribute("data-drift-storage-namespace", "pitchdog-drift-v2-dev");
  await page.getByRole("button", { name: "WORLD", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose the weather." })).toBeVisible();

  const atmosphere = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Atmosphere" }),
  });
  await ensureInspectorOpen(atmosphere);
  const background = page.getByRole("combobox", { name: "Background", exact: true });
  await background.selectOption("transparent");
  await expect(background).toHaveValue("transparent");
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-transparent", "true");

  await page.getByRole("button", { name: /Editorial Drift/ }).click();
  // The authored 9:16 Reading Spine scene uses Orbiting Bloom (Aura), not the
  // older single-World slice's paper-room fallback.
  await expect(background).toHaveValue("aura");
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-transparent", "false");

  await page.getByRole("button", { name: "SLIDES", exact: true }).click();
  await page.getByRole("button", { name: "Keep Drift study 01.png still" }).click();
  const pinnedGroup = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Pinned frame" }),
  });
  await ensureInspectorOpen(pinnedGroup);

  const pinnedSwitch = page.getByRole("switch", { name: "Keep one frame still" });
  const carouselPresence = page.getByRole("group", { name: "Carousel presence", exact: true });
  const pinnedLayer = page.getByRole("group", { name: "Layer", exact: true });
  const pinnedRatio = page.getByRole("group", { name: "Ratio", exact: true });
  await expect(pinnedSwitch).toBeChecked();
  await expect(carouselPresence.getByRole("radio", { name: "Still only" })).toBeChecked();
  await expect(pinnedLayer.getByRole("radio", { name: "Protected" })).toBeChecked();
  await expect(pinnedRatio.getByRole("radio", { name: "Use source" })).toBeChecked();

  // The radio inputs are intentionally visually hidden. Click their visible,
  // associated labels so this remains a real pointer journey.
  await carouselPresence.getByText("Still + moving", { exact: true }).click();
  await pinnedLayer.getByText("In scene", { exact: true }).click();
  await pinnedRatio.getByText("Custom", { exact: true }).click();
  await expect(carouselPresence.getByRole("radio", { name: "Still + moving" })).toBeChecked();
  await expect(pinnedLayer.getByRole("radio", { name: "In scene" })).toBeChecked();
  await expect(pinnedRatio.getByRole("radio", { name: "Custom" })).toBeChecked();

  const resetNotice = page.locator(".notice[role=status]").filter({
    hasText: "Pinned frame reset to its source ratio, protected layer, and still-only track.",
  });
  await Promise.all([
    resetNotice.waitFor({ state: "visible" }),
    page.getByRole("button", { name: "Reset pinned frame" }).click(),
  ]);
  await expect(carouselPresence.getByRole("radio", { name: "Still only" })).toBeChecked();
  await expect(pinnedLayer.getByRole("radio", { name: "Protected" })).toBeChecked();
  await expect(pinnedRatio.getByRole("radio", { name: "Use source" })).toBeChecked();
  await expect(pinnedSwitch).toBeChecked();
});

test("V2 workspaces keep one live stage and preserve the selected slide", async ({ page }) => {
  await waitForStudio(page);
  const canvas = page.locator(".stage-frame canvas");
  const originalCanvas = await canvas.elementHandle();
  expect(originalCanvas).toBeTruthy();

  await page.getByRole("button", { name: "02 Drift study 02.png" }).click();
  await expect(page.getByRole("button", { name: "02 Drift study 02.png" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Build the deck." })).toBeVisible();

  for (const workspace of ["WORLD", "DIRECT", "MASTER", "SLIDES"] as const) {
    await page.getByRole("button", { name: workspace, exact: true }).click();
    const currentCanvas = await canvas.elementHandle();
    expect(await page.evaluate(([before, after]) => before === after, [originalCanvas, currentCanvas])).toBe(true);
  }

  await expect(page.getByRole("button", { name: "02 Drift study 02.png" })).toHaveAttribute("aria-pressed", "true");
});

test("Reading Pace, platform guides, preflight, and Command-K use the settled V2 workflow", async ({ page }) => {
  await waitForStudio(page);
  await page.getByRole("button", { name: "DIRECT", exact: true }).click();
  const timelineIntent = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Timeline intent" }),
  });
  await ensureInspectorOpen(timelineIntent);
  await timelineIntent.getByText("Reading pace", { exact: true }).click();
  await expect(timelineIntent.getByRole("radio", { name: "Reading pace" })).toBeChecked();
  await expect(timelineIntent.getByText(/moving/i).first()).toBeVisible();

  await page.getByRole("button", { name: "MASTER", exact: true }).click();
  const platformGuides = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Platform guides" }),
  });
  await ensureInspectorOpen(platformGuides);
  await platformGuides.getByRole("combobox", { name: "Preview overlay" }).selectOption("instagram-combined");
  await expect(page.locator(".platform-guide-overlay[data-profile='instagram-combined']")).toBeVisible();
  await expect(page.getByRole("status", { name: "Master preflight" })).toContainText(/MP4 READY|BLOCKED/);

  await page.keyboard.press("Meta+k");
  const commandSearch = page.getByRole("searchbox", { name: "Search commands" });
  await expect(commandSearch).toBeFocused();
  await commandSearch.fill("switch to world");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Choose the weather." })).toBeVisible();
});

test("Command-K traps keyboard focus, exposes active results, and restores its trigger", async ({ page }) => {
  await waitForStudio(page);
  const trigger = page.getByRole("button", { name: "Open command palette" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Drift commands" });
  const search = page.getByRole("searchbox", { name: "Search commands" });
  await expect(dialog).toBeVisible();
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute("aria-activedescendant", /studio-command-/);

  await page.keyboard.press("Shift+Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
