import { expect, test } from "@playwright/test";

/**
 * Collab session smoke (no relay server).
 *
 * The playground joins a room via the URL fragment `#room=<roomId>,<key>`
 * (the AES key never reaches the server) and mints credentials through the
 * header "Start session" button. A relay is not available in CI, so these
 * tests cover the session lifecycle around the transport — credential
 * minting, URL-fragment credentials, and reload persistence — not peer
 * presence exchange (that needs a live relay).
 */

test("collab: start session mints a shareable room URL", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Start session" }).click();

  // The popover with the shareable URL opens and the URL fragment now
  // carries the credentials (roomId + AES key).
  await expect(page.getByRole("dialog", { name: "Live collaboration session" })).toBeVisible();
  await expect(page).toHaveURL(/#room=[^,]+,.+/);
  await expect(page.getByRole("button", { name: "Active session" })).toBeVisible();
});

test("collab: reload preserves the room credentials (reconnect smoke)", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/#room=[^,]+,.+/);
  const joinedUrl = page.url();

  await page.reload();
  await page.waitForLoadState("networkidle");

  // The fragment survives the reload and the app re-enters collab mode.
  expect(page.url()).toBe(joinedUrl);
  await expect(page.getByRole("button", { name: "Active session" })).toBeVisible();
});
