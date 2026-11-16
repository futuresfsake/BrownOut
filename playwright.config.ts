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
  // A headless browser draws the 3D room in software, which is slow on a shared machine. The
  // tests wait on what the page says, not on the clock, so a long limit costs nothing when fast.
  timeout: 60_000,
  use: { baseURL: URL, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      testIgnore: /(evidence.*|measure)\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // Writes the screenshots kept under testresults/dod/. Run with `npm run e2e:evidence`.
      name: "evidence",
      testMatch: /evidence.*\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Frame-rate readings for the 3D room, drawn by the graphics card of the machine this runs
      // on. Not one of the checks, because a reading belongs to a machine. Run with
      // `npm run e2e:measure`.
      name: "measure",
      testMatch: /measure\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
        trace: "off",
        launchOptions: {
          args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"],
        },
      },
    },
  ],
  webServer: {
    command: "npm run preview",
    url: URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
