import type { ElementId } from "@oh-just-another/types";
import type { Scene } from "./scene.js";

/**
 * Element-level diff between two scenes. Categorises every shape id
 * present in either scene as:
 *
 * - `added`: in `next` only.
 * - `removed`: in `prev` only.
 * - `modified`: in both, but the shape reference differs (immutable
 *   patches replace the object).
 *
 * Reference equality is sufficient — scene mutations always go
 * through `apply(scene, patch)` which produces fresh shape objects
 * for every change. Pure read paths don't allocate.
 */
export interface SceneElementDiff {
  readonly added: readonly ElementId[];
  readonly removed: readonly ElementId[];
  readonly modified: readonly ElementId[];
}

export const diffSceneElements = (prev: Scene, next: Scene): SceneElementDiff => {
  const added: ElementId[] = [];
  const removed: ElementId[] = [];
  const modified: ElementId[] = [];
  for (const [id, shape] of next.elements) {
    const before = prev.elements.get(id);
    if (before === undefined) added.push(id);
    else if (before !== shape) modified.push(id);
  }
  for (const id of prev.elements.keys()) {
    if (!next.elements.has(id)) removed.push(id);
  }
  return { added, removed, modified };
};
