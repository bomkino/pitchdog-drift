import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

// A real 4 × 4 RGBA PNG. Keep the fixture decodable so this journey tests
// Drift's native picker/import contract—not a corrupt-image rejection path.
const validPng = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR4nGN8ODvrPwMSYGJAA4QFAL7XAu0bAiZXAAAAAElFTkSuQmCC";

async function bootRealNativeBridgeQueueHarness(page: import("@playwright/test").Page): Promise<void> {
  const bridgeSource = await readFile(new URL("../macos/NativeBridge.js", import.meta.url), "utf8");
  await page.goto("about:blank");
  await page.evaluate(({ source }) => {
    const bytes = new TextEncoder().encode("queued project bytes");
    const state = {
      importCalls: 0,
      releaseCount: 0,
      settled: false,
      outcome: null as null | { status: "fulfilled" | "rejected"; value?: boolean; name?: string; message?: string },
      finishImport: null as null | (() => void),
      failImport: null as null | (() => void),
    };
    Object.defineProperty(window, "__driftQueuedImportTest", {
      configurable: false,
      writable: false,
      value: state,
    });
    Object.defineProperty(window, "webkit", {
      configurable: false,
      writable: false,
      value: {
        messageHandlers: {
          driftNative: {
            postMessage: async (request: {
              command: string;
              payload?: { offset?: number; length?: number };
            }) => {
              if (request.command === "runtime-info") {
                return {
                  ok: true,
                  value: {
                    documentAuthority: "appkit-issued-per-document",
                    sandboxed: true,
                    networkClientEntitled: true,
                    webKitOutboundPolicyInstalled: true,
                    webKitOutboundPolicyVersion: 3,
                    nativeNetworkClientSurface: "none-shipped",
                    networkBoundary: "app-entitled-webkit-blocked",
                  },
                };
              }
              if (request.command === "file-info") {
                return {
                  ok: true,
                  value: {
                    name: "queued.pitched",
                    mimeType: "application/vnd.pitchdog.pitched+zip",
                    size: bytes.byteLength,
                    lastModified: 1_700_000_000_000,
                  },
                };
              }
              if (request.command === "file-read") {
                const offset = request.payload?.offset ?? 0;
                const length = request.payload?.length ?? 0;
                const chunk = bytes.subarray(offset, offset + length);
                let binary = "";
                for (const byte of chunk) binary += String.fromCharCode(byte);
                return { ok: true, value: { data: btoa(binary), length: chunk.byteLength } };
              }
              if (request.command === "file-release") {
                state.releaseCount += 1;
                return { ok: true, value: {} };
              }
              return { ok: false, error: { name: "NotSupportedError", message: request.command } };
            },
          },
        },
      },
    });

    // Evaluate the exact packaged bridge before any React bridge exists, just
    // as Finder can deliver a document during application startup.
    (0, eval)(source);
    const nativeWindow = window as unknown as {
      __driftNativeAuthorizeDocument: (nonce: string, challenge: string) => boolean;
      __driftNativeDocumentInstanceChallenge: () => string;
      __driftNativeImportGranted: (
        nonce: string,
        descriptor: Record<string, unknown>,
        kind: "project",
      ) => Promise<boolean>;
    };
    const nonce = "11111111-1111-4111-8111-111111111111";
    nativeWindow.__driftNativeAuthorizeDocument(
      nonce,
      nativeWindow.__driftNativeDocumentInstanceChallenge(),
    );
    void nativeWindow.__driftNativeImportGranted(nonce, {
      token: "queued-grant",
      name: "queued.pitched",
      mimeType: "application/vnd.pitchdog.pitched+zip",
      size: bytes.byteLength,
      lastModified: 1_700_000_000_000,
    }, "project").then(
      (value) => {
        state.settled = true;
        state.outcome = { status: "fulfilled", value };
      },
      (error: unknown) => {
        state.settled = true;
        state.outcome = {
          status: "rejected",
          name: error instanceof Error || error instanceof DOMException ? error.name : "unknown",
          message: error instanceof Error || error instanceof DOMException ? error.message : String(error),
        };
      },
    );
  }, { source: bridgeSource });
}

test("startup-queued Finder delivery stays pending through React handling and releases its grant once", async ({ page }) => {
  await bootRealNativeBridgeQueueHarness(page);

  await expect.poll(() => page.evaluate(() => {
    const state = (window as unknown as {
      __driftQueuedImportTest: { releaseCount: number };
    }).__driftQueuedImportTest;
    return state.releaseCount;
  })).toBe(1);
  expect(await page.evaluate(() => (window as unknown as {
    __driftQueuedImportTest: { settled: boolean };
  }).__driftQueuedImportTest.settled)).toBe(false);

  await page.evaluate(() => {
    const nativeWindow = window as unknown as {
      __driftNativeInstallAppBridge: (bridge: {
        command: () => boolean;
        importFile: () => Promise<void>;
      }) => void;
      __driftQueuedImportTest: {
        importCalls: number;
        finishImport: null | (() => void);
      };
    };
    nativeWindow.__driftNativeInstallAppBridge({
      command: () => true,
      importFile: () => {
        nativeWindow.__driftQueuedImportTest.importCalls += 1;
        return new Promise<void>((resolve) => {
          nativeWindow.__driftQueuedImportTest.finishImport = resolve;
        });
      },
    });
  });

  await expect.poll(() => page.evaluate(() => (window as unknown as {
    __driftQueuedImportTest: { importCalls: number };
  }).__driftQueuedImportTest.importCalls)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as {
    __driftQueuedImportTest: { settled: boolean };
  }).__driftQueuedImportTest.settled)).toBe(false);

  await page.evaluate(() => (window as unknown as {
    __driftQueuedImportTest: { finishImport: null | (() => void) };
  }).__driftQueuedImportTest.finishImport?.());
  await expect.poll(() => page.evaluate(() => (window as unknown as {
    __driftQueuedImportTest: { outcome: unknown };
  }).__driftQueuedImportTest.outcome)).toEqual({ status: "fulfilled", value: true });

  expect(await page.evaluate(() => (window as unknown as {
    __driftQueuedImportTest: { releaseCount: number };
  }).__driftQueuedImportTest.releaseCount)).toBe(1);
});

test("startup-queued Finder delivery carries React rejection back to AppKit", async ({ page }) => {
  await bootRealNativeBridgeQueueHarness(page);
  await page.evaluate(() => {
    const nativeWindow = window as unknown as {
      __driftNativeInstallAppBridge: (bridge: {
        command: () => boolean;
        importFile: () => Promise<void>;
      }) => void;
      __driftQueuedImportTest: {
        importCalls: number;
        failImport: null | (() => void);
      };
    };
    nativeWindow.__driftNativeInstallAppBridge({
      command: () => true,
      importFile: () => {
        nativeWindow.__driftQueuedImportTest.importCalls += 1;
        return new Promise<void>((_resolve, reject) => {
          nativeWindow.__driftQueuedImportTest.failImport = () => {
            reject(new DOMException("React rejected the project.", "DataError"));
          };
        });
      },
    });
  });

  await expect.poll(() => page.evaluate(() => (window as unknown as {
    __driftQueuedImportTest: { importCalls: number };
  }).__driftQueuedImportTest.importCalls)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as {
    __driftQueuedImportTest: { settled: boolean };
  }).__driftQueuedImportTest.settled)).toBe(false);
  await page.evaluate(() => (window as unknown as {
    __driftQueuedImportTest: { failImport: null | (() => void) };
  }).__driftQueuedImportTest.failImport?.());

  await expect.poll(() => page.evaluate(() => (window as unknown as {
    __driftQueuedImportTest: { outcome: unknown };
  }).__driftQueuedImportTest.outcome)).toEqual({
    status: "rejected",
    name: "DataError",
    message: "React rejected the project.",
  });
  expect(await page.evaluate(() => (window as unknown as {
    __driftQueuedImportTest: { releaseCount: number };
  }).__driftQueuedImportTest.releaseCount)).toBe(1);
});

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
      value: Object.freeze({
        bridgeVersion: 2,
        platform: "macOS",
        systemCodecsOnly: true,
        documentAuthority: "appkit-issued-per-document",
        webKitOutboundPolicyInstalled: true,
        webKitOutboundPolicyVersion: 3,
        nativeNetworkClientSurface: "none-shipped",
        networkBoundary: "app-entitled-webkit-blocked",
        networkClientEntitlementRequiredWhenSandboxed: true,
      }),
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

test("Finder-style project delivery rejects malformed archives instead of acknowledging a false open", async ({ page }) => {
  await bootSimulatedNativeRuntime(page);
  const result = await page.evaluate(async () => {
    const state = (window as unknown as {
      __driftNativeTest: {
        appBridge: { importFile: (kind: string, file: File) => void | Promise<void> };
      };
    }).__driftNativeTest;
    try {
      await state.appBridge.importFile(
        "project",
        new File(["not a project archive"], "broken.pitched", {
          type: "application/vnd.pitchdog.pitched+zip",
        }),
      );
      return { rejected: false, name: null };
    } catch (error) {
      return {
        rejected: true,
        name: error instanceof DOMException ? error.name : error instanceof Error ? error.name : "unknown",
      };
    }
  });

  expect(result.rejected).toBe(true);
  await expect(page.locator(".notice[data-kind=error]")).toContainText("Project rejected");
});

test("Finder-style project delivery rejects when an export wins the admission race", async ({ page }) => {
  await bootSimulatedNativeRuntime(page);
  await page.evaluate(() => {
    const hold = { reject: null as null | ((error: DOMException) => void) };
    Object.defineProperty(window, "__driftHeldDirectoryPicker", {
      configurable: false,
      writable: false,
      value: hold,
    });
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      writable: true,
      value: () => new Promise<never>((_resolve, reject) => {
        hold.reject = reject;
      }),
    });
  });
  await page.getByLabel("Stage width").fill("256");
  await page.getByLabel("Stage height").fill("256");
  await page.getByRole("slider", { name: "Duration" }).fill("3");
  await page.getByRole("group", { name: "Frame rate" }).getByText("24", { exact: true }).click();
  const exportButton = page.getByRole("button", { name: "Export PNG sequence" });
  await expect(exportButton).toBeEnabled({ timeout: 30_000 });
  await exportButton.click();
  await expect(page.locator(".export-overlay")).toBeVisible();

  const result = await page.evaluate(async () => {
    const state = (window as unknown as {
      __driftNativeTest: {
        appBridge: { importFile: (kind: string, file: File) => void | Promise<void> };
      };
    }).__driftNativeTest;
    try {
      await state.appBridge.importFile(
        "project",
        new File(["must not be read during export"], "racing.pitched", {
          type: "application/vnd.pitchdog.pitched+zip",
        }),
      );
      return { rejected: false, name: null, message: null };
    } catch (error) {
      return {
        rejected: true,
        name: error instanceof Error || error instanceof DOMException ? error.name : "unknown",
        message: error instanceof Error || error instanceof DOMException ? error.message : String(error),
      };
    }
  });

  expect(result).toEqual({
    rejected: true,
    name: "InvalidStateError",
    message: "Wait for the current export to finish or cancel it first.",
  });
  await expect(page.locator(".notice[data-kind=error]")).toContainText("Wait for the current export");
  await page.getByRole("button", { name: "Cancel export" }).click();
  await page.evaluate(() => (window as unknown as {
    __driftHeldDirectoryPicker: { reject: null | ((error: DOMException) => void) };
  }).__driftHeldDirectoryPicker.reject?.(new DOMException("Export canceled.", "AbortError")));
  await expect(page.locator(".export-overlay")).toBeHidden();
});
