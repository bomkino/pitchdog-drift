import { defineConfig, devices } from "@playwright/test";

const productionPort = Number(process.env.DRIFT_E2E_PRODUCTION_PORT ?? 5187);
const developmentPort = Number(process.env.DRIFT_E2E_DEVELOPMENT_PORT ?? 5188);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  grepInvert: /@physical-encoder/,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  // Retries preserve the first failure's trace, but CI must never turn a
  // flaky journey into a green conclusion merely because attempt two passed.
  failOnFlakyTests: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : "list",
  projects: [
    {
      name: "production",
      testIgnore: "**/v2-long-export-qa.e2e.ts",
      use: { baseURL: `http://127.0.0.1:${productionPort}` },
    },
    {
      name: "v2-dev",
      testMatch: "**/v2-ui.e2e.ts",
      use: { baseURL: `http://127.0.0.1:${developmentPort}` },
    },
  ],
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    channel: process.env.CI ? undefined : "chrome",
    headless: true,
    launchOptions: {
      args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      // The shipping identity must exercise the current V2 product. Individual
      // journeys still import explicit V1 projects to prove compatibility.
      command: `npm run dev:v1 -- --port ${productionPort}`,
      url: `http://127.0.0.1:${productionPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // V2 app-path assertions run against the authored development build,
      // never against V1 with a feature flag implied by the test name.
      command: `npm run dev -- --port ${developmentPort}`,
      url: `http://127.0.0.1:${developmentPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
