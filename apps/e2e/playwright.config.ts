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
    // 127.0.0.1 (not localhost): the readiness probe must hit the vite server
    // even when an unrelated process holds [::1]:5173 on the developer machine.
    baseURL: "http://127.0.0.1:5173",
    actionTimeout: 5_000,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "pnpm --filter @oh-just-another/playground dev --port 5173 --strictPort",
      url: "http://127.0.0.1:5173",
      // Collab specs dial the (test-spawned) relay DIRECTLY, matching
      // production. Vite's `/relay` ws proxy is dev-only sugar and leaves
      // half-open tunnels when its upstream is down — the client sees
      // `open` on a socket whose relay leg is dead, which breaks the
      // relay-restart scenario with a false "connected".
      env: { VITE_RELAY_URL: "ws://127.0.0.1:1234" },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // The golden-scene visual regression runs in its own project below with
      // a software-GL launch arg so WebGL2 works headless; keep it out of the
      // default project so it isn't run twice with the wrong GL backend.
      // Touch sims run only in mobile-chromium — Desktop Chrome has
      // hasTouch: false, so `locator.tap` throws there.
      testIgnore: /(golden-visual|touch)\.spec\.ts/,
    },
    {
      // Golden-scene visual regression: renders the reference scenes through
      // both the WebGL2 and Canvas2D backends and screenshots the canvas
      // region. `--use-angle=swiftshader` forces a deterministic software
      // GL implementation so WebGL2 is available (and stable) on headless CI
      // runners that have no real GPU. `--use-gl=angle` picks the ANGLE path.
      name: "golden-visual",
      testMatch: /golden-visual\.spec\.ts/,
      // Software GL is CPU-bound: with every worker rasterizing through
      // SwiftShader, screenshot stabilization can exceed the default 5s
      // expect timeout under full parallel load. The wider timeout only
      // delays failure reporting; it never hides a real pixel diff.
      expect: { timeout: 15_000 },
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        },
      },
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
