import type { ShapeId } from "@oh-just-another/types";
import { isShapeHidden, type Scene } from "@oh-just-another/scene";

/**
 * Collect every shape that should be hidden this frame due to its
 * own `hidden` flag or that of any ancestor via `parentId`.
 * Returns `undefined` when nothing is hidden — keeps the
 * `RenderSceneOptions` payload empty in the common case so the
 * renderer's hot loop can skip the `has()` check entirely.
 *
 * Pure. `computeDimShapes` (group-isolation dimming) already lives
 * in `overlay.ts` — kept there because it co-owns the rendering
 * helpers; here we only cover the visibility filter that any
 * render pass needs.
 */
export const computeHiddenShapes = (scene: Scene): ReadonlySet<ShapeId> | undefined => {
  let out: Set<ShapeId> | null = null;
  for (const s of scene.shapes.values()) {
    if (isShapeHidden(scene, s)) {
      if (!out) out = new Set();
      out.add(s.id);
    }
  }
  return out ?? undefined;
};
