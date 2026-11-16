import { defineConfig, devices } from "@playwright/test";

const URL = "http://localhost:4173/";

// The browser tests drive the built site, not the development server, so they test what ships.
// Run them with `npm run e2e`, which builds first.
export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL: URL, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      testIgnore: /evidence\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // Writes the screenshots kept under testresults/dod/. Run with `npm run e2e:evidence`.
      name: "evidence",
      testMatch: /evidence\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run preview",
    url: URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
