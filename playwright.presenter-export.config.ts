import { defineConfig, devices } from "@playwright/test";

const physicalEncoderTimeout = Number(process.env.DRIFT_PHYSICAL_ENCODER_TIMEOUT_MS ?? 120_000);

if (!Number.isSafeInteger(physicalEncoderTimeout) || physicalEncoderTimeout < 120_000) {
  throw new TypeError("DRIFT_PHYSICAL_ENCODER_TIMEOUT_MS must be an integer of at least 120000.");
}

/**
 * Physical acceptance lane for WebCodecs presenter exports. The ordinary UI
 * suite forces SwiftShader for reproducible WebGL screenshots; SwiftShader's
 * H.264 flush and colour metadata are not equivalent to the installed Chrome
 * encoder. This lane deliberately uses installed, headed Chrome with no GPU
 * override and requires verified downloads at both diagnostic and delivery
 * size.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "studio-export.e2e.ts",
  grep: /@physical-encoder/,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: physicalEncoderTimeout,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5187",
    channel: "chrome",
    headless: false,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev:v1 -- --port 5187",
    url: "http://127.0.0.1:5187",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
