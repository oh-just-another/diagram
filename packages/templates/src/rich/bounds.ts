import type { Bounds } from "@oh-just-another/types";
import { layoutTree, type MeasureText } from "./layout.js";
import type { TemplateNode } from "./node.js";
import { resolveBindings } from "./binding.js";

/**
 * Local AABB of a rich-template instance — the bounds of the root after
 * layout. Use this from a `ElementBounder` registered on `"template"` to feed
 * the scene's spatial index.
 */
export const getTemplateLocalBounds = (
  root: TemplateNode,
  data: Readonly<Record<string, unknown>> = {},
  options: { measureText?: MeasureText; available?: { width: number; height: number } } = {},
): Bounds => {
  const resolved = resolveBindings(root, data);
  const layouted = layoutTree(resolved, options);
  return layouted.bounds;
};
