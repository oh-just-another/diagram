import { join } from "node:path";
import { describe, expect, it } from "vitest";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { elementId, type ElementId } from "@oh-just-another/types";
import { renderToPng, renderToSvg, type RenderToPngOptions } from "../src/index";
import { goldenScenes, type GoldenScene } from "../../../apps/e2e/fixtures/golden-scenes";
import {
  pngGoldenDir,
  readBinaryBaseline,
  readTextBaseline,
  shouldRunPngGolden,
  shouldUpdateGolden,
  svgGoldenDir,
  writeBinaryBaseline,
  writeTextBaseline,
} from "../../../apps/e2e/fixtures/golden-io";

/**
 * Golden-scene Node harness. Two layers:
 *
 *   • SVG (pure JS, deterministic) — same output the `renderer-svg` golden test
 *     asserts; re-checked here through the `headless` public API so a regression
 *     in the wrapper is caught too.
 *   • PNG (resvg raster + pixelmatch) — the real per-pixel diff the coverage
 *     assessment previously *claimed* existed but didn't. Rasterisation is
 *     platform-sensitive (AA / font hinting differ per resvg native binary), so
 *     PNG baselines are pinned to the environment that generated them and
 *     compared with a small diff-ratio budget; SVG remains the cross-OS guard.
 *
 * Regenerate every baseline with `UPDATE_GOLDEN=1`. PNG rendering needs the
 * optional peer dep `@resvg/resvg-js`; without it the PNG cases skip gracefully.
 */

// Per-pixel diff budget: pixelmatch counts mismatched pixels; we allow up to
// this fraction of the frame to differ (sub-pixel AA jitter between resvg runs).
const MAX_DIFF_PIXEL_RATIO = 0.01;
// pixelmatch per-pixel colour-distance threshold (0 strict … 1 loose).
const PIXELMATCH_THRESHOLD = 0.1;

const dimOptions = (scene: GoldenScene): RenderToPngOptions => {
  if (!scene.dimElementIds || scene.dimElementIds.length === 0) return {};
  const dimElements = new Set<ElementId>(scene.dimElementIds.map((id) => elementId(id)));
  return { dimElements, dimOpacity: scene.dimOpacity ?? 0.2 };
};

const resvgAvailable = async (): Promise<boolean> => {
  try {
    await import("@resvg/resvg-js");
    return true;
  } catch {
    return false;
  }
};

describe("golden scenes → SVG (via headless)", () => {
  for (const scene of goldenScenes) {
    it(`${scene.id} — ${scene.title}`, () => {
      const svg = renderToSvg(scene.build(), dimOptions(scene));
      const path = join(svgGoldenDir, `${scene.id}.svg`);
      if (shouldUpdateGolden()) {
        writeTextBaseline(path, svg);
        return;
      }
      const baseline = readTextBaseline(path);
      expect(
        baseline,
        `Missing SVG baseline for "${scene.id}". Run with UPDATE_GOLDEN=1.`,
      ).not.toBeNull();
      expect(svg).toBe(baseline);
    });
  }
});

describe("golden scenes → PNG (resvg + pixelmatch)", () => {
  for (const scene of goldenScenes) {
    it(`${scene.id} — ${scene.title}`, async (ctx) => {
      // Opt-in: skip the platform-sensitive raster diff in the default test
      // gate (committed baselines are platform-pinned; SVG golden is the
      // always-on guard). Run with GOLDEN_PNG=1 on the baseline's platform.
      if (!shouldRunPngGolden()) {
        ctx.skip();
        return;
      }
      if (!(await resvgAvailable())) {
        ctx.skip();
        return;
      }
      const png = Buffer.from(await renderToPng(scene.build(), dimOptions(scene)));
      const path = join(pngGoldenDir, `${scene.id}.png`);

      if (shouldUpdateGolden()) {
        writeBinaryBaseline(path, png);
        return;
      }

      const baselineBuf = readBinaryBaseline(path);
      expect(
        baselineBuf,
        `Missing PNG baseline for "${scene.id}". Run with UPDATE_GOLDEN=1.`,
      ).not.toBeNull();

      const actual = PNG.sync.read(png);
      const expected = PNG.sync.read(baselineBuf as Buffer);
      expect(
        { w: actual.width, h: actual.height },
        `PNG dimension mismatch for "${scene.id}".`,
      ).toEqual({ w: expected.width, h: expected.height });

      const { width, height } = expected;
      const diff = pixelmatch(actual.data, expected.data, null, width, height, {
        threshold: PIXELMATCH_THRESHOLD,
      });
      const ratio = diff / (width * height);
      expect(
        ratio,
        `PNG diff ratio ${ratio.toFixed(4)} exceeds budget for "${scene.id}".`,
      ).toBeLessThanOrEqual(MAX_DIFF_PIXEL_RATIO);
    });
  }
});
