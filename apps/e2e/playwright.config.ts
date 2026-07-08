import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — boots the diagram app (`apps/playground`) as the web
 * server, then runs the suite against the dev URL. Desktop + mobile Chromium.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "list",
  // Retries only on CI: flakes get a second chance (and produce a trace via
  // `on-first-retry`); locally a failure should surface immediately.
  retries: process.env.CI ? 2 : 0,
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
    {
      // WebKit (Desktop Safari) cross-engine smoke: runs ONLY the boot /
      // keyboard-creation smoke flow, so a Safari-specific regression in the
      // core render/interaction path surfaces without paying for the full
      // suite on a second engine.
      name: "webkit-smoke",
      use: { ...devices["Desktop Safari"] },
      testMatch: /smoke\.spec\.ts/,
    },
  ],
});
