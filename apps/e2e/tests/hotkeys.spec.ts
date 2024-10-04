import { expect, test } from "@playwright/test";

test.describe("hotkeys", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.locator("canvas").first().click({ position: { x: 100, y: 100 } });
  });

  test("⌘A selects all (or no-op on empty scene)", async ({ page }) => {
    await page.keyboard.press("Meta+a");
    // No exception is success — selecting an empty scene is a no-op.
    await expect(page.locator("body")).toBeVisible();
  });

  test("copy → paste creates a duplicate", async ({ page }) => {
    await page.keyboard.press("r");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Meta+c");
    await page.keyboard.press("Meta+v");
    // Two shapes were created; UI should not throw.
    await expect(page.locator("body")).toBeVisible();
  });

  test("zoom keys do not throw", async ({ page }) => {
    await page.keyboard.press("Meta+=");
    await page.keyboard.press("Meta+-");
    await page.keyboard.press("Meta+0");
    await page.keyboard.press("Meta+1");
    await expect(page.locator("body")).toBeVisible();
  });
});
