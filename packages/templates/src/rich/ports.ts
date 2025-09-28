import type { AnchorRef } from "@oh-just-another/scene";
import type { LayoutedNode } from "./layout.js";

/**
 * Walk a layouted template tree and collect every `PortNode` as a map
 * from `port.id` → `AnchorRef`. Refs are expressed as `ratio` against the
 * template's *root bounds*, so they round-trip through `shape.anchors`
 * and stay correct under resize.
 *
 * Called once by the template-instance factory to populate
 * `shape.anchors` on the resulting scene shape. Link endpoints can then
 * reference ports by id (via `{ kind: "anchor", anchor: { kind: "named",
 * name: <port.id> } }`); the snap engine + nearest-anchor lookup picks
 * them up automatically.
 */
export const extractPorts = (root: LayoutedNode): Record<string, AnchorRef> => {
  const out: Record<string, AnchorRef> = {};
  const rootBounds = root.bounds;
  if (rootBounds.width === 0 || rootBounds.height === 0) return out;

  const visit = (l: LayoutedNode): void => {
    if (l.node.type === "port") {
      const port = l.node;
      // Port bounds are 0×0 — the layout pass already placed its
      // top-left at the resolved spot position. Convert that point into
      // a ratio of the root bounds and store as a named-ratio anchor
      // refusal that resolves the same regardless of the template's
      // final size.
      const ratioX = (l.bounds.x - rootBounds.x) / rootBounds.width;
      const ratioY = (l.bounds.y - rootBounds.y) / rootBounds.height;
      out[port.id] = { kind: "ratio", position: { x: ratioX, y: ratioY } };
    }
    for (const child of l.children) visit(child);
  };
  visit(root);
  return out;
};
