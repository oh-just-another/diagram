import type { Bounds } from "@oh-just-another/types";
import type { LayoutedNode } from "./layout.js";

/**
 * Walk a layouted template tree and find the first `drop-zone` node.
 * Returns its bounds in **local** coordinates — relative to the
 * template root's top-left (so it can be stored as
 * `shape.metadata.container.dropZone` without further translation).
 *
 * Templates with multiple drop-zone nodes are unusual; this helper
 * returns the **largest** one (by area) so that the container
 * protocol picks the meaningful body region instead of a tiny
 * decoration. Returns `null` when the tree has no drop-zone.
 */
export const extractDropZone = (root: LayoutedNode): Bounds | null => {
  const rootBounds = root.bounds;
  let best: Bounds | null = null;
  let bestArea = 0;

  const visit = (l: LayoutedNode): void => {
    if (l.node.type === "drop-zone") {
      const local: Bounds = {
        x: l.bounds.x - rootBounds.x,
        y: l.bounds.y - rootBounds.y,
        width: l.bounds.width,
        height: l.bounds.height,
      };
      const area = local.width * local.height;
      if (area > bestArea) {
        best = local;
        bestArea = area;
      }
    }
    for (const child of l.children) visit(child);
  };
  visit(root);
  return best;
};

/**
 * Walk a layouted template tree and return **every** `drop-zone` node's bounds
 * in **local** coordinates (relative to the root top-left), in tree order.
 *
 * Unlike `extractDropZone` (which collapses to the single largest zone for the
 * container-attach protocol), this keeps all zones — e.g. each lane of a
 * multi-lane swim-lane. Used by the debug hit-zone overlay to highlight every
 * drop region; returns `[]` when the tree has no drop-zone.
 */
export const extractAllDropZones = (root: LayoutedNode): Bounds[] => {
  const rootBounds = root.bounds;
  const zones: Bounds[] = [];
  const visit = (l: LayoutedNode): void => {
    if (l.node.type === "drop-zone") {
      zones.push({
        x: l.bounds.x - rootBounds.x,
        y: l.bounds.y - rootBounds.y,
        width: l.bounds.width,
        height: l.bounds.height,
      });
    }
    for (const child of l.children) visit(child);
  };
  visit(root);
  return zones;
};
