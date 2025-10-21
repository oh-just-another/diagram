import type { AnchorRef } from "@oh-just-another/scene";
import type { LayoutedNode } from "./layout.js";

/**
 * Walk a layouted template tree and collect every `PortNode` as a map
 * from `port.id` → `AnchorRef`, populated onto `shape.anchors` by the
 * template-instance factory. Link endpoints can then reference ports by
 * id (via `{ kind: "anchor", anchor: { kind: "named", name: <port.id> } }`);
 * the snap engine + nearest-anchor lookup picks them up automatically.
 *
 * The port's `system` field (default `"ratio"`) chooses the coordinate
 * system the ref resolves to (all three round-trip through `shape.anchors`):
 *   - `"ratio"` — bounds-relative `{x,y}` in 0..1; scales with resize.
 *   - `"absolute"` — local-px offset from the template origin; fixed.
 *   - `"edge"` — polygon edge `index` + parameter `t` (from `port.edge`);
 *     stays on the real edge. Missing `edge` → falls back to `ratio` so a
 *     malformed port still yields a usable anchor instead of being dropped.
 */
export const extractPorts = (root: LayoutedNode): Record<string, AnchorRef> => {
  const out: Record<string, AnchorRef> = {};
  const rootBounds = root.bounds;
  if (rootBounds.width === 0 || rootBounds.height === 0) return out;

  const visit = (l: LayoutedNode): void => {
    if (l.node.type === "port") {
      const port = l.node;
      // Port bounds are 0×0 — the layout pass already placed its
      // top-left at the resolved spot position. `dx`/`dy` are the
      // resolved local-px offset from the template origin.
      const dx = l.bounds.x - rootBounds.x;
      const dy = l.bounds.y - rootBounds.y;
      const system = port.system ?? "ratio";
      if (system === "edge" && port.edge) {
        out[port.id] = { kind: "edge", index: port.edge.index, t: port.edge.t };
      } else if (system === "absolute") {
        out[port.id] = { kind: "absolute", offset: { x: dx, y: dy } };
      } else {
        // "ratio" (default) and the malformed-"edge" fallback: convert
        // the resolved point into a ratio of the root bounds so it
        // resolves the same regardless of the template's final size.
        out[port.id] = {
          kind: "ratio",
          position: { x: dx / rootBounds.width, y: dy / rootBounds.height },
        };
      }
    }
    for (const child of l.children) visit(child);
  };
  visit(root);
  return out;
};
