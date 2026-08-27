import { expect, type Page } from "@playwright/test";
import path from "node:path";

export const fixturePath = path.resolve("e2e/fixtures/slide.png");
export const audioOnlyFixturePath = path.resolve("e2e/fixtures/audio-only.mp4");
export const presenterFixturePath = path.resolve("e2e/fixtures/presenter.mp4");
export const presenterAvFixturePath = path.resolve("e2e/fixtures/presenter-av.mp4");
export const halfAlphaGreyPng = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAG0lEQVR4AYTIoQ0AAADCMLLLOR0/Q2WpEPkxAAAA//99eYBQAAAABklEQVQDAN2nCAkPbnNjAAAAAElFTkSuQmCC";
export const LOCAL_REOPENED_NOTICE = "Local project reopened with verified Project V4 media.";
export const PORTABLE_OPENED_NOTICE = "Portable project verified, migrated when necessary, and copied into local Project V4 storage.";
export const PORTABLE_SAVED_NOTICE = "Portable Project V4 download started with original media and SHA-256 manifest.";

export async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}

export async function switchWorkspace(
  page: Page,
  name: "SLIDES" | "LOOK" | "MOTION" | "EXPORT",
): Promise<void> {
  const button = page.getByRole("button", { name, exact: true });
  if (await button.getAttribute("aria-current") !== "page") await button.click();
}

export async function prepareGuidedExport(
  page: Page,
  format: "H.264 MP4" | "PNG Frames",
  pngDestination: "Numbered directory" | "Bounded ZIP" = "Bounded ZIP",
): Promise<void> {
  const wizard = page.getByRole("region", { name: "Guided Export" });
  await expect(wizard).toHaveAttribute("data-step", "purpose-background");
  await wizard.getByRole("button", { name: "Choose format" }).click();
  await expect(wizard).toHaveAttribute("data-step", "format");
  const formatChoice = wizard.getByRole("radio", {
    name: format === "H.264 MP4" ? /^DELIVERY H\.264 MP4/u : /^UNIVERSAL ALPHA PNG Frames/u,
  });
  if (await formatChoice.getAttribute("aria-checked") !== "true") await formatChoice.click();
  if (format === "PNG Frames") {
    await wizard.getByText(pngDestination, { exact: true }).click();
  }
  await wizard.getByRole("button", { name: "Review film + audio" }).click();
  await expect(wizard).toHaveAttribute("data-step", "film-audio");
  const acknowledgement = wizard.getByRole("checkbox");
  if (await acknowledgement.count()) await acknowledgement.check();
  await wizard.getByRole("button", { name: "Preflight destination" }).click();
  await expect(wizard).toHaveAttribute("data-step", "destination-preflight");
}

export async function startGuidedExport(page: Page): Promise<void> {
  await page.getByRole("region", { name: "Guided Export" })
    .getByRole("button", { name: "Choose destination + render" })
    .click();
}
