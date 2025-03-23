import { expect, test } from "@playwright/test";

/**
 * Visual regression baseline for the mobile UI. Captures full-page
 * screenshots at the bottom-sheet breakpoint (≤ 640px) so panel-layout
 * changes that break the mobile shell get caught.
 *
 * Snapshots are written on first run (`pnpm e2e --update-snapshots`) and
 * compared on subsequent runs. Per-platform variance is contained — the
 * config only runs touch/screenshot specs on the `mobile-chromium`
 * project, which pins viewport + DPR.
 *
 * Tests wait for `networkidle` plus a small extra settle so React's
 * StrictMode double-mount and the initial autosave microtask don't leak
 * into the screenshot.
 */

test.describe("mobile UI screenshots", () => {
  test("home screen — initial render", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot("mobile-home.png", {
      // Don't bake in the live cursor / blinking caret.
      animations: "disabled",
      caret: "hide",
      // 1% pixel-diff budget covers sub-pixel rounding across runs.
      maxDiffPixelRatio: 0.01,
      fullPage: true,
    });
  });

  test("home screen — dark theme via localStorage", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("diagram-demo-theme", "dark");
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot("mobile-home-dark.png", {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.01,
      fullPage: true,
    });
  });
});
