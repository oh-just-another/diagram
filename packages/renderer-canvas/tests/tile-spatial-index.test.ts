import { describe, expect, it } from "vitest";
import { layerId, elementId } from "@oh-just-another/types";
import {
  addElement,
  addLayer,
  buildSpatialIndex,
  emptyScene,
  orderBetween,
  type Layer,
  type RectangleElement,
  type Scene,
} from "@oh-just-another/scene";
import {
  buildDrawOrderIndex,
  elementsIntersectingTile,
  elementsIntersectingTileIndexed,
} from "../src/surface/tile-compositor";

/**
 * B11 — spatial index for tile element queries.
 *
 * `elementsIntersectingTileIndexed` (index-backed) must return the exact
 * same elements, in the same global draw order, as the linear
 * `elementsIntersectingTile` full scan — for every tile — so switching a
 * host to the index changes nothing but the cost.
 */

let layerSeq = 0;
const makeLayer = (visible: boolean): Layer => ({
  id: layerId(`L${layerSeq++}`),
  name: "layer",
  visible,
  locked: false,
  order: orderBetween(null, null),
});

let elemSeq = 0;
const makeRect = (layer: Layer, x: number, y: number, w = 60, h = 40): RectangleElement => ({
  id: elementId(`e${elemSeq++}`),
  type: "rectangle",
  layerId: layer.id,
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#f00" },
  width: w,
  height: h,
});

/** Build a scene: two visible layers + one hidden, shapes scattered on a grid. */
const buildScene = (): Scene => {
  let scene = emptyScene();
  const layers = [makeLayer(true), makeLayer(false), makeLayer(true)];
  for (const layer of layers) scene = addLayer(scene, layer).scene;
  for (const layer of layers) {
    for (let gx = 0; gx < 20; gx++) {
      for (let gy = 0; gy < 20; gy++) {
        // Spread across several TILE_SIZE (2048) buckets, incl. negatives.
        const rect = makeRect(layer, gx * 500 - 2000, gy * 500 - 1000);
        scene = addElement(scene, rect).scene;
      }
    }
  }
  return scene;
};

describe("elementsIntersectingTileIndexed (B11)", () => {
  it("matches the full scan (same ids, same order) across many tiles", () => {
    const scene = buildScene();
    const index = buildSpatialIndex(scene);
    const drawOrder = buildDrawOrderIndex(scene);
    const TILE = 2048;

    let checkedNonEmpty = 0;
    for (let col = -2; col <= 3; col++) {
      for (let row = -2; row <= 3; row++) {
        const tileBounds = {
          x: col * TILE,
          y: row * TILE,
          width: TILE,
          height: TILE,
        };
        const scan = elementsIntersectingTile(scene, tileBounds).map((s) => s.id);
        const indexed = elementsIntersectingTileIndexed(index, drawOrder, tileBounds).map(
          (s) => s.id,
        );
        expect(indexed).toEqual(scan);
        if (scan.length > 0) checkedNonEmpty++;
      }
    }
    // Guard against a vacuous pass — the fixture must produce populated tiles.
    expect(checkedNonEmpty).toBeGreaterThan(0);
  });

  it("excludes shapes in hidden layers (drawOrder omits them)", () => {
    const scene = buildScene();
    const index = buildSpatialIndex(scene);
    const drawOrder = buildDrawOrderIndex(scene);
    // A wide tile covering everything.
    const all = {
      x: -3000,
      y: -2000,
      width: 20000,
      height: 20000,
    };
    const scan = new Set(elementsIntersectingTile(scene, all).map((s) => s.id));
    const indexed = new Set(
      elementsIntersectingTileIndexed(index, drawOrder, all).map((s) => s.id),
    );
    expect(indexed).toEqual(scan);
    // Sanity: hidden middle layer's shapes are absent (2 visible layers × 400).
    expect(scan.size).toBe(800);
  });
});
