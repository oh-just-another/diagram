import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — boots the demo (`apps/demo`) and the optional
 * collab relay (`apps/relay`) as web servers, then runs the suite
 * against the demo URL. Chromium-only by default; CI matrix flips on
 * firefox / webkit via `--project=...`.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    actionTimeout: 5_000,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "pnpm --filter @oh-just-another/demo dev --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
      testMatch: /(touch|screenshots)\.spec\.ts/,
    },
  ],
});
