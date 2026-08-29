import { expect, test } from "@playwright/test";

/**
 * Persistence: a shape created in the demo should survive a hard reload
 * because the autosave path writes the scene JSON into `localStorage`
 * after every mutation.
 *
 * The test opens the demo with fresh storage, creates a rectangle via
 * R + Enter, reloads with a full document reload, and asserts the scene is
 * non-empty after restore.
 *
 * It does not read `editor.scene` directly (that requires app-side hooks
 * the kernel doesn't expose to Playwright). Instead it verifies visible
 * survival: after reload, navigating with Tab focuses a non-empty
 * selection cycle.
 */

// The playground autosaves the scene JSON into IndexedDB (database
// `oh-just-another-diagram`, store `scene`, key `current` — see
// apps/playground/src/idb-files.ts); localStorage only seeds a scene.
const readStoredScene = (): Promise<string | null> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open("oh-just-another-diagram");
    req.onerror = () => {
      reject(req.error ?? new Error("open failed"));
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("scene")) {
        db.close();
        resolve(null);
        return;
      }
      const get = db.transaction("scene", "readonly").objectStore("scene").get("current");
      get.onsuccess = () => {
        db.close();
        resolve(typeof get.result === "string" ? get.result : null);
      };
      get.onerror = () => {
        db.close();
        reject(get.error ?? new Error("read failed"));
      };
    };
  });

test("persistence: created shape survives a hard reload", async ({ page }) => {
  // Fresh storage for this test — cleared once, NOT via addInitScript
  // (an init script re-runs on every navigation and would wipe the
  // autosave during the reload this test is about).
  await page.goto("/");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.localStorage.clear();
        const req = indexedDB.deleteDatabase("oh-just-another-diagram");
        req.onsuccess =
          req.onerror =
          req.onblocked =
            () => {
              resolve();
            };
      }),
  );
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Create one rectangle: R, then Enter on the focused surface. Target the
  // role="application" host, not a raw canvas (non-overlay layers are
  // pointer-events:none), at a point clear of the UI chrome.
  await page.getByRole("application").click({ position: { x: 300, y: 300 } });
  await page.keyboard.press("r");
  await page.keyboard.press("Enter");
  // The autosave is debounced — poll for the write instead of a fixed sleep.
  await expect.poll(() => page.evaluate(readStoredScene), { timeout: 10_000 }).not.toBeNull();

  const stored = await page.evaluate(readStoredScene);
  expect(stored, "autosave should have written a scene").toBeTruthy();
  expect(stored!.length).toBeGreaterThan(20);

  await page.reload();
  await page.waitForLoadState("networkidle");

  // Storage should still be there after reload, and the scene restored.
  const afterReload = await page.evaluate(readStoredScene);
  expect(afterReload).toBe(stored);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __editor?: { scene: { elements: { size: number } } } }).__editor
            ?.scene.elements.size ?? 0,
      ),
    )
    .toBe(1);
});

test("renderer-mode persistence: query string survives reload via dropdown", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await page.goto("/?renderer=canvas2d");
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[data-effective-backend="canvas2d"]')).toBeVisible();

  await page.reload();
  await page.waitForLoadState("networkidle");
  // After reload the query string is still on the URL, so the backend
  // stays canvas2d.
  await expect(page.locator('[data-effective-backend="canvas2d"]')).toBeVisible();
  await expect(page).toHaveURL(/renderer=canvas2d/);
});
