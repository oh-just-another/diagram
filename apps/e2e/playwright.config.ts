import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — boots the diagram app (`apps/playground`) as the web
 * server, then runs the suite against the dev URL. Chromium-only by
 * default; the CI matrix enables firefox / webkit via `--project=...`.
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
      command: "pnpm --filter @oh-just-another/playground dev --port 5173 --strictPort",
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
