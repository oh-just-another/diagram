import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { startMiniRelay, type MiniRelay } from "../relay/mini-relay";

/**
 * Collab over a LIVE relay — full loop, including a relay restart.
 *
 * The suite runs its own in-process relay (see `relay/mini-relay.ts`),
 * which the playground dials DIRECTLY via `VITE_RELAY_URL` (set on the
 * Playwright web server) — so no external `diagram-collab` checkout is
 * needed and the scenario runs on CI.
 *
 * Serial: the relay port is a shared resource and the test kills and
 * restarts the relay mid-flight.
 *
 * Observables (autosave is intentionally OFF in collab mode, so
 * localStorage can't be used here):
 *   - connection badge text ("connected" / "reconnecting…"),
 *   - peer chips in the header (awareness round-trip),
 *   - the stats panel's live "Elements" scene counter on the peer
 *     (doc updates round-trip). Peers live in separate browser
 *     contexts, so the count can only grow via the relay.
 */
test.describe.configure({ mode: "serial" });

/** Creates a shape via keyboard at a chrome-free spot on the canvas. */
const createShape = async (page: Page, key: "r" | "o", at = 300): Promise<void> => {
  // Click an EMPTY canvas spot: landing on an existing shape would select
  // it and reroute Enter into inline text editing instead of placement.
  await page.getByRole("application").click({ position: { x: at, y: at } });
  await page.keyboard.press(key);
  await page.keyboard.press("Enter");
};

/** The stats panel's scene "Elements" row at an exact count. */
const elementsCount = (page: Page, count: number): Locator =>
  page.getByRole("status", { name: "Selection stats" }).getByText(`Elements${String(count)}`);

const openPeer = async (browser: Browser, url: string): Promise<Page> => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  return page;
};

test("collab: peers sync through the relay and resync after a relay restart", async ({
  page,
  browser,
  baseURL,
}) => {
  let relay: MiniRelay | null = await startMiniRelay();
  let peer: Page | null = null;
  try {
    // --- host starts a session ---
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Start session" }).click();
    await expect(page).toHaveURL(/#room=[^,]+,.+/);
    await expect(page.getByText("connected", { exact: true })).toBeVisible();

    // --- peer joins via the shared URL (separate context = separate user) ---
    const roomUrl = new URL(new URL(page.url()).hash, baseURL).href;
    peer = await openPeer(browser, roomUrl);
    await expect(peer.getByRole("button", { name: "Active session" })).toBeVisible();
    await expect(peer.getByText("connected", { exact: true })).toBeVisible();

    // Awareness round-trip: the host's header now lists both peers.
    await expect(page.getByText(/^Peer /)).toHaveCount(2);

    // --- doc sync host → peer, observed via the live stats counter ---
    await peer.getByRole("application").click({ position: { x: 300, y: 300 } });
    await peer.keyboard.press("Alt+/");
    await expect(elementsCount(peer, 0)).toBeVisible();
    await createShape(page, "r");
    await expect(elementsCount(peer, 1)).toBeVisible({ timeout: 10_000 });

    // --- relay dies: both sides notice the drop ---
    await relay.close();
    relay = null;
    await expect(page.getByText(/reconnecting…|connecting…/)).toBeVisible({ timeout: 15_000 });
    await expect(peer.getByText(/reconnecting…|connecting…/)).toBeVisible({ timeout: 15_000 });

    // --- relay returns: transports reconnect on their own (backoff) ---
    relay = await startMiniRelay();
    await expect(page.getByText("connected", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(peer.getByText("connected", { exact: true })).toBeVisible({ timeout: 20_000 });

    // --- updates flow again after the restart ---
    await createShape(page, "o", 520);
    // Split the assertion: host-local count proves the shape was created;
    // the peer count then isolates transport failures from UI failures.
    await page.keyboard.press("Alt+/");
    await expect(elementsCount(page, 2)).toBeVisible({ timeout: 10_000 });
    await expect(elementsCount(peer, 2)).toBeVisible({ timeout: 10_000 });
  } finally {
    await peer?.context().close();
    await relay?.close();
  }
});
