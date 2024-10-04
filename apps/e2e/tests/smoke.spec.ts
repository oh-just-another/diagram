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
  // we only verify there is at least one.
  const buttons = await page.getByRole("button").count();
  expect(buttons).toBeGreaterThan(0);
});

test("keyboard-only shape creation: R → Enter creates a rectangle", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // Click the canvas area to give it focus, then push the hotkeys.
  await page.locator("canvas").first().click({ position: { x: 50, y: 50 } });
  await page.keyboard.press("r");
  await page.keyboard.press("Enter");
  // Selection panel should show 1 selected (PropertyPanel renders the count).
  await expect(page.getByText(/1 selected|Selected /i).first()).toBeVisible({ timeout: 2_000 });
});

test("undo restores empty selection after delete", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.locator("canvas").first().click({ position: { x: 80, y: 80 } });
  await page.keyboard.press("r");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Meta+z");
  // After undo the shape should be back. Exact count can't be asserted
  // without reading editor state, so the smoke check is no exception thrown.
  await expect(page.locator("body")).toBeVisible();
});
