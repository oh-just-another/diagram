import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Golden-scene VISUAL regression — the browser half of the harness.
 *
 * Loads each committed reference scene (`fixtures/scenes/<id>.json`) into the
 * playground by pre-seeding its autosave localStorage slot, forces a renderer
 * backend via the `?renderer=` URL override the playground already supports,
 * and screenshots the interactive surface. Two projects' worth of coverage in
 * one spec:
 *
 *   • WebGL2 and Canvas2D per-scene screenshots (`toHaveScreenshot`) — the
 *     scalable replacement for the two-shot mobile-shell baseline; this is what
 *     finally exercises the WebGL2 stroke / MSDF-text / compositor path under
 *     regression.
 *   • A cross-backend divergence check for a few non-text scenes: renders the
 *     SAME scene through both backends and pixel-diffs the two live captures,
 *     so a WebGL2-vs-Canvas2D drift surfaces without a stored baseline.
 *
 * No playground source is touched: scene loading rides the existing
 * localStorage autosave + `?renderer=` override. Screenshot baselines are
 * platform-dependent — generate them on the CI Linux runner with
 * `--update-snapshots` (same policy as `screenshots.spec.ts`).
 */

// Autosave slot the playground restores from on boot (see apps/playground App.tsx).
const STORAGE_KEY = "oh-just-another-diagram-scene-v2";
// Renderer surface — the layered backend's canvases sit under role=application.
const SURFACE = "[role=application]";

const here = dirname(fileURLToPath(import.meta.url));
const scenesDir = join(here, "..", "fixtures", "scenes");

interface SceneEntry {
  readonly id: string;
  readonly title: string;
}

const sceneIndex = JSON.parse(readFileSync(join(scenesDir, "index.json"), "utf8")) as SceneEntry[];
const readSceneJson = (id: string): string => readFileSync(join(scenesDir, `${id}.json`), "utf8");

type Backend = "webgl2" | "canvas2d";

/** Load one scene under one backend and settle the first paint. */
const openScene = async (page: Page, id: string, backend: Backend): Promise<void> => {
  const sceneJson = readSceneJson(id);
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [STORAGE_KEY, sceneJson] as const,
  );
  await page.goto(`/?renderer=${backend}`);
  await page.waitForLoadState("networkidle");
  await page.locator(SURFACE).waitFor({ state: "visible" });
  // Let the initial render (and React StrictMode double-mount) settle.
  await page.waitForTimeout(400);
};

// Per-scene screenshot under each backend. Baselines are created on first run
// (`--update-snapshots`) and compared after; the 1% budget absorbs sub-pixel AA.
for (const backend of ["webgl2", "canvas2d"] as const) {
  test.describe(`golden visual — ${backend}`, () => {
    for (const { id, title } of sceneIndex) {
      test(`${id} — ${title}`, async ({ page }) => {
        await openScene(page, id, backend);
        await expect(page.locator(SURFACE)).toHaveScreenshot(`${id}-${backend}.png`, {
          animations: "disabled",
          caret: "hide",
          maxDiffPixelRatio: 0.01,
        });
      });
    }
  });
}

// Cross-backend divergence: same scene, both backends, live pixel diff. Text /
// MSDF glyphs legitimately differ between the two rasterisers, so restrict this
// to shape-only scenes and allow a looser budget than the per-backend check.
const CROSS_BACKEND_SCENES = ["rect-sharp", "diamond", "edges-straight-ortho", "block-arrow-brush"];
const CROSS_BACKEND_MAX_RATIO = 0.06;

test.describe("golden visual — cross-backend divergence", () => {
  for (const id of CROSS_BACKEND_SCENES) {
    test(`${id}: webgl2 vs canvas2d`, async ({ page }) => {
      await openScene(page, id, "webgl2");
      const gl = PNG.sync.read(await page.locator(SURFACE).screenshot({ animations: "disabled" }));
      await openScene(page, id, "canvas2d");
      const c2d = PNG.sync.read(await page.locator(SURFACE).screenshot({ animations: "disabled" }));

      expect({ w: gl.width, h: gl.height }, `backend capture size mismatch for "${id}"`).toEqual({
        w: c2d.width,
        h: c2d.height,
      });

      const diff = pixelmatch(gl.data, c2d.data, null, gl.width, gl.height, { threshold: 0.15 });
      const ratio = diff / (gl.width * gl.height);
      expect(
        ratio,
        `WebGL2 vs Canvas2D diverge by ${ratio.toFixed(4)} for "${id}"`,
      ).toBeLessThanOrEqual(CROSS_BACKEND_MAX_RATIO);
    });
  }
});
