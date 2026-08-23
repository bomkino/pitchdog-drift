import { defineConfig, devices } from "@playwright/test";

/**
 * Opt-in local acceptance lane for long exports. This deliberately uses the
 * installed, headed Chrome encoder: headless SwiftShader reports SMPTE 170M
 * even when the same strict export reads back as Rec.709 here.
 *
 * Smoke: node scripts/qa-long-export.mjs
 * Full:  node scripts/qa-long-export.mjs --full
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "v2-long-export-qa.e2e.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 20 * 60_000,
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
