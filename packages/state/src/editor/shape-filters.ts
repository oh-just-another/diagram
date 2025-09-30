import type { ElementId } from "@oh-just-another/types";
import { isElementHidden, type Scene } from "@oh-just-another/scene";

/**
 * Collect every shape that should be hidden this frame due to its own
 * `hidden` flag or that of any ancestor via `parentId`. Returns `undefined`
 * when nothing is hidden, keeping the `RenderSceneOptions` payload empty in
 * the common case so the renderer's hot loop can skip the `has()` check
 * entirely.
 */
export const computeHiddenElements = (scene: Scene): ReadonlySet<ElementId> | undefined => {
  let out: Set<ElementId> | null = null;
  for (const s of scene.shapes.values()) {
    if (isElementHidden(scene, s)) {
      if (!out) out = new Set();
      out.add(s.id);
    }
  }
  return out ?? undefined;
};
