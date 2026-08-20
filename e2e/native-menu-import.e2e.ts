import { expect, test } from "@playwright/test";

// A real 4 × 4 RGBA PNG. Keep the fixture decodable so this journey tests
// Drift's native picker/import contract—not a corrupt-image rejection path.
const validPng = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR4nGN8ODvrPwMSYGJAA4QFAL7XAu0bAiZXAAAAAElFTkSuQmCC";

async function bootSimulatedNativeRuntime(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(({ pngBase64 }) => {
    const state = {
      appBridge: null as null | {
        command: (command: string) => boolean | void | Promise<boolean | void>;
        importFile: (kind: string, file: File) => void | Promise<void>;
      },
      pickerCalls: [] as unknown[],
      releaseCount: 0,
      rejectMessage: null as string | null,
    };

    Object.defineProperty(window, "__driftNativeTest", {
      configurable: false,
      writable: false,
      value: state,
    });
    Object.defineProperty(window, "__DRIFT_NATIVE_MAC__", {
      configurable: false,
      writable: false,
      value: Object.freeze({ bridgeVersion: 2, platform: "macOS", systemCodecsOnly: true }),
    });
    Object.defineProperty(window, "__driftNativeInstallAppBridge", {
      configurable: false,
      writable: false,
      value: (bridge: typeof state.appBridge) => {
        state.appBridge = bridge;
        return () => {
          if (state.appBridge === bridge) state.appBridge = null;
        };
      },
    });
    Object.defineProperty(window, "__driftNativeReportClientState", {
      configurable: false,
      writable: false,
      value: () => undefined,
    });
    Object.defineProperty(window, "__driftNativeSaveBlob", {
      configurable: false,
      writable: false,
      value: async () => undefined,
    });
    Object.defineProperty(window, "showOpenFilePicker", {
      configurable: true,
      writable: true,
      value: async (options: unknown) => {
        state.pickerCalls.push(options);
        if (state.rejectMessage) throw new Error(state.rejectMessage);
        const bytes = Uint8Array.from(atob(pngBase64), (character) => character.charCodeAt(0));
        const file = new File([bytes], "menu-import.png", { type: "image/png", lastModified: 1_700_000_000_000 });
        return [{
          kind: "file",
          name: file.name,
          getFile: async () => file,
          _release: async () => { state.releaseCount += 1; },
        }];
      },
    });
  }, { pngBase64: validPng });

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-drift-native-file-input-bridge", "ready");
  await page.waitForFunction(() => Boolean((window as unknown as { __driftNativeTest?: { appBridge?: unknown } }).__driftNativeTest?.appBridge));
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
}

test("File-menu Add Slides replaces the demo slate through one native picker and releases its grant", async ({ page }) => {
  await bootSimulatedNativeRuntime(page);
  const initialCount = await page.locator(".asset-list li").count();
  expect(initialCount).toBeGreaterThan(1);

  await page.evaluate(async () => {
    const state = (window as unknown as {
      __driftNativeTest: { appBridge: { command: (command: string) => boolean | void | Promise<boolean | void> } };
    }).__driftNativeTest;
    await state.appBridge.command("add-slides");
  });

  // The authored study is a first-launch placeholder, not user media. The
  // first real deck must replace those eight demos rather than becoming slide 9.
  await expect(page.locator(".asset-list li")).toHaveCount(1);
  await expect(page.locator(".asset-list li").first()).toContainText("menu-import.png");
  await expect(page.getByRole("alert")).toHaveCount(0);

  const receipt = await page.evaluate(() => {
    const state = (window as unknown as {
      __driftNativeTest: { pickerCalls: Array<{ multiple?: boolean; types?: unknown[] }>; releaseCount: number };
    }).__driftNativeTest;
    return {
      callCount: state.pickerCalls.length,
      multiple: state.pickerCalls[0]?.multiple,
      typeCount: state.pickerCalls[0]?.types?.length,
      releaseCount: state.releaseCount,
    };
  });
  expect(receipt).toEqual({ callCount: 1, multiple: true, typeCount: 1, releaseCount: 1 });
});

test("File-menu picker failure remains visible and operable", async ({ page }) => {
  await bootSimulatedNativeRuntime(page);
  await page.evaluate(() => {
    const state = (window as unknown as {
      __driftNativeTest: {
        appBridge: { command: (command: string) => boolean | void | Promise<boolean | void> };
        rejectMessage: string | null;
      };
    }).__driftNativeTest;
    state.rejectMessage = "Native chooser failed safely.";
    void state.appBridge.command("add-slides");
  });

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Native chooser failed safely.");
  await expect(alert.getByRole("button", { name: "Dismiss native file error" })).toBeVisible();
  await alert.getByRole("button", { name: "Dismiss native file error" }).click();
  await expect(alert).toHaveCount(0);
});
