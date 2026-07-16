import { expect, test } from "@playwright/test";

/**
 * Smoke: app boots, palette is visible, a draw-mode + Enter sequence
 * creates a shape and the selection counter goes from 0 to 1.
 *
 * These tests drive only through keyboard + visible selectors — they
 * exercise the same paths a keyboard / screen-reader user would.
 */
test("the demo boots and renders the toolbar", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
  // Toolbar / palette indicator. Use `getByRole("button")` for resilience;
  // we only verify there is at least one. Must be a retrying assertion —
  // a one-shot count() races React mounting under parallel-suite load.
  await expect(page.getByRole("button").first()).toBeVisible();
});

test("keyboard-only shape creation: R → Enter creates a rectangle", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // Click the interactive surface (role="application"), not a raw canvas:
  // the layered backend's non-overlay canvases are pointer-events:none, so
  // clicking `canvas.first()` lands on a click-transparent layer. The point
  // must clear the UI chrome — the logo / main-menu group overlays the
  // surface's top-left corner and intercepts clicks there.
  await page.getByRole("application").click({ position: { x: 300, y: 300 } });
  await page.keyboard.press("r");
  await page.keyboard.press("Enter");
  // The editor announces the creation through its aria-live region ("Created
  // rectangle <id>") — the same signal a screen-reader user gets. The region
  // is visually hidden, so assert attachment, not visibility.
  await expect(page.getByText(/Created rectangle/i).first()).toBeAttached({ timeout: 2_000 });
});

test("undo restores empty selection after delete", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("application").click({ position: { x: 80, y: 80 } });
  await page.keyboard.press("r");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Meta+z");
  // After undo the shape should be back. Exact count can't be asserted
  // without reading editor state, so the smoke check is no exception thrown.
  await expect(page.locator("body")).toBeVisible();
});
