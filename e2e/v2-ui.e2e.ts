import { expect, test } from "@playwright/test";
import { waitForStudio } from "./studio.helpers";

test("V2 app restores its authored room and repairs a legacy-style pinned frame", async ({ page }) => {
  await waitForStudio(page);

  await expect(page.locator("html")).toHaveAttribute("data-drift-build-channel", "v2-dev");
  await expect(page.locator("html")).toHaveAttribute("data-drift-storage-namespace", "pitchdog-drift-v2-dev");
  await expect(page.getByRole("heading", { name: "Editorial Drift · V2 slice" })).toBeVisible();

  const atmosphere = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Atmosphere" }),
  });
  await atmosphere.locator("summary").click();
  const background = page.getByRole("combobox", { name: "Background", exact: true });
  await background.selectOption("transparent");
  await expect(background).toHaveValue("transparent");
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-transparent", "true");

  await page.getByRole("button", { name: /Editorial Drift/ }).click();
  await expect(background).toHaveValue("paper");
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-transparent", "false");

  await page.getByRole("button", { name: "Keep Drift study 01.png still" }).click();
  const pinnedGroup = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Pinned frame" }),
  });
  await pinnedGroup.locator("summary").click();

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

  await page.getByRole("button", { name: "Reset pinned frame" }).click();
  await expect(carouselPresence.getByRole("radio", { name: "Still only" })).toBeChecked();
  await expect(pinnedLayer.getByRole("radio", { name: "Protected" })).toBeChecked();
  await expect(pinnedRatio.getByRole("radio", { name: "Use source" })).toBeChecked();
  await expect(pinnedSwitch).toBeChecked();
  await expect(page.locator(".notice[role=status]")).toContainText(
    "Pinned frame reset to its source ratio, protected layer, and still-only track.",
  );
});
