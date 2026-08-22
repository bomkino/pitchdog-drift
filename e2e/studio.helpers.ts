import { expect, type Page } from "@playwright/test";
import path from "node:path";

export const fixturePath = path.resolve("e2e/fixtures/slide.png");
export const audioOnlyFixturePath = path.resolve("e2e/fixtures/audio-only.mp4");
export const presenterFixturePath = path.resolve("e2e/fixtures/presenter.mp4");
export const halfAlphaGreyPng = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAG0lEQVR4AYTIoQ0AAADCMLLLOR0/Q2WpEPkxAAAA//99eYBQAAAABklEQVQDAN2nCAkPbnNjAAAAAElFTkSuQmCC";
export const LOCAL_REOPENED_NOTICE = "Local project reopened with verified Project V4 media.";
export const PORTABLE_OPENED_NOTICE = "Portable project verified, migrated when necessary, and copied into local Project V4 storage.";
export const PORTABLE_SAVED_NOTICE = "Portable Project V4 saved with original media and SHA-256 manifest.";

export async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}
