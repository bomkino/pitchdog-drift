import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
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
      use: { baseURL: "http://127.0.0.1:5187" },
    },
    {
      name: "v2-dev",
      testMatch: "**/v2-ui.e2e.ts",
      use: { baseURL: "http://127.0.0.1:5188" },
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
      command: "npm run dev:v1 -- --port 5187",
      url: "http://127.0.0.1:5187",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // V2 app-path assertions run against the authored development build,
      // never against V1 with a feature flag implied by the test name.
      command: "npm run dev -- --port 5188",
      url: "http://127.0.0.1:5188",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
