import {
  getElementWorldBounds,
  getElementsInLayer,
  getLayersInOrder,
  type Link,
  type Scene,
} from "@oh-just-another/scene";
import type { Bounds, ElementId } from "@oh-just-another/types";
import { EXPORT_PADDING_WORLD } from "./constants.js";

/**
 * The scene reduced to `ids` (plus the links bound on both ends to them),
 * for selection-scoped exports. Layers / files / viewport are kept.
 */
export const subsetScene = (scene: Scene, ids: ReadonlySet<ElementId>): Scene => {
  const elements = new Map([...scene.elements].filter(([id]) => ids.has(id)));
  const bound = (end: Link["from"]): ElementId | null =>
    end.kind === "point" ? null : end.elementId;
  const inside = (end: Link["from"]): boolean => {
    const id = bound(end);
    return id === null || ids.has(id);
  };
  const links = new Map(
    [...scene.links].filter(([, link]) => inside(link.from) && inside(link.to)),
  );
  return { ...scene, elements, links };
};

/** World AABB of every element on a visible layer, or `null` when empty. */
export const sceneBounds = (scene: Scene): Bounds | null => {
  let acc: Bounds | null = null;
  for (const layer of getLayersInOrder(scene)) {
    if (!layer.visible) continue;
    for (const shape of getElementsInLayer(scene, layer.id)) {
      const b = getElementWorldBounds(shape);
      acc = acc ? unionBounds(acc, b) : b;
    }
  }
  return acc;
};

/**
 * Camera that maps `bbox` (padded by `EXPORT_PADDING_WORLD`) onto a
 * `scale`-times backbuffer: `pan` = padded origin, `zoom` = scale, `size`
 * = padded size × scale. Grid settings carry over from the source scene.
 */
export const fitViewportTo = (
  scene: Scene,
  bbox: Bounds,
  scale: number,
): { readonly scene: Scene; readonly width: number; readonly height: number } => {
  const padded: Bounds = {
    x: bbox.x - EXPORT_PADDING_WORLD,
    y: bbox.y - EXPORT_PADDING_WORLD,
    width: bbox.width + 2 * EXPORT_PADDING_WORLD,
    height: bbox.height + 2 * EXPORT_PADDING_WORLD,
  };
  const width = Math.max(1, Math.ceil(padded.width * scale));
  const height = Math.max(1, Math.ceil(padded.height * scale));
  return {
    width,
    height,
    scene: {
      ...scene,
      viewport: {
        pan: { x: padded.x, y: padded.y },
        zoom: scale,
        rotation: 0,
        size: { width, height },
        gridEnabled: scene.viewport.gridEnabled,
        ...(scene.viewport.gridStyle !== undefined ? { gridStyle: scene.viewport.gridStyle } : {}),
      },
    },
  };
};

/** Inlined AABB union — avoids pulling `@math` into the host package. */
const unionBounds = (a: Bounds, b: Bounds): Bounds => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
};
