import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { elementId, type ElementId } from "@oh-just-another/types";
import { renderSceneToSvg, type RenderSceneToSvgOptions } from "../src/render-scene-to-svg";
import { goldenScenes, type GoldenScene } from "../../../apps/e2e/fixtures/golden-scenes";
import {
  readTextBaseline,
  shouldUpdateGolden,
  svgGoldenDir,
  writeTextBaseline,
} from "../../../apps/e2e/fixtures/golden-io";

/**
 * Golden-scene SVG regression. The SVG output of `renderer-svg` is pure JS —
 * no GPU, no platform-specific rasteriser — so it is byte-for-byte
 * deterministic and compared with an exact string match. This is the rock-solid
 * half of the visual harness: it catches any change to geometry, path emission,
 * stroke/fill/dash serialisation, arrowheads, text layout, or z-order
 * regardless of OS.
 *
 * Baselines live in `apps/e2e/fixtures/golden/svg/<id>.svg` and are the same
 * artifacts the headless PNG test rasterises. Regenerate with `UPDATE_GOLDEN=1`.
 */

const dimOptions = (scene: GoldenScene): RenderSceneToSvgOptions => {
  if (!scene.dimElementIds || scene.dimElementIds.length === 0) return {};
  const dimElements = new Set<ElementId>(scene.dimElementIds.map((id) => elementId(id)));
  return { dimElements, dimOpacity: scene.dimOpacity ?? 0.2 };
};

describe("golden scenes → SVG", () => {
  for (const scene of goldenScenes) {
    it(`${scene.id} — ${scene.title}`, () => {
      const svg = renderSceneToSvg(scene.build(), dimOptions(scene));
      const path = join(svgGoldenDir, `${scene.id}.svg`);

      if (shouldUpdateGolden()) {
        writeTextBaseline(path, svg);
        return;
      }

      const baseline = readTextBaseline(path);
      expect(
        baseline,
        `Missing SVG baseline for "${scene.id}". Run with UPDATE_GOLDEN=1 to create it.`,
      ).not.toBeNull();
      expect(svg).toBe(baseline);
    });
  }
});
