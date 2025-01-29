import type { ShapeId } from "@oh-just-another/types";
import { getShape, type Scene, type Shape } from "@oh-just-another/scene";

/**
 * Group / isolation helpers extracted from editor.ts (* P0c chunk 4). Pure functions over Scene + ShapeId — no Editor
 * back-reference, so the test suite can drive them directly.
 *
 * The semantics mirror the previous private methods one-to-one;
 * Editor keeps wrapper methods that forward to these for back
 * compat with any external caller.
 */

const MAX_PARENT_DEPTH = 64;

/**
 * Topmost group ancestor of `shape` — walks the `parentId` chain and
 * remembers the last parent typed `"group"`. Returns `null` when no ancestor
 * is a group.
 */
export const topGroupAncestor = (scene: Scene, shape: Shape): Shape | null => {
 let topGroup: Shape | null = null;
 let cursor: Shape | undefined = shape;
 let depth = 0;
 while (cursor?.parentId && depth < MAX_PARENT_DEPTH) {
  const parent = getShape(scene, cursor.parentId);
  if (!parent) break;
  if (parent.type === "group") topGroup = parent;
  cursor = parent;
  depth++;
 }
 return topGroup;
};

/**
 * `true` when `shapeId`'s parent chain contains `groupId` (or
 * `shapeId === groupId`). Bounded walk so a corrupted scene with
 * a parentId cycle returns false instead of looping forever.
 */
export const isDescendantOfGroup = (
 scene: Scene,
 shapeId: ShapeId,
 groupId: ShapeId,
): boolean => {
 let cursor = getShape(scene, shapeId);
 let depth = 0;
 while (cursor && depth < MAX_PARENT_DEPTH) {
  if (cursor.id === groupId) return true;
  if (!cursor.parentId) return false;
  cursor = getShape(scene, cursor.parentId);
  depth++;
 }
 return false;
};

/**
 * Walk the parent chain of `shape` upward, promoting through groups until
 * either:
 *  • the next parent is the editor's currently-entered group (drill-in mode
 *   lets the user pick the group's children);
 *  • the parent is no longer a group (containers / templates intentionally
 *   let click hits land on their children).
 */
export const promoteToGroupRoot = (
 scene: Scene,
 shape: Shape,
 enteredGroup: ShapeId | null,
): Shape => {
 let current: Shape = shape;
 let depth = 0;
 while (current.parentId && depth < MAX_PARENT_DEPTH) {
  if (enteredGroup === current.parentId) break;
  const parent = getShape(scene, current.parentId);
  if (!parent) break;
  if (parent.type !== "group") break;
  current = parent;
  depth++;
 }
 return current;
};

/**
 * Compute the dim set for isolation rendering — every shape whose parent chain
 * does NOT pass through `enteredGroupId`. Selection always stays opaque even
 * when somehow not in the descendant set.
 */
export const computeDimShapes = (
 scene: Scene,
 selection: Iterable<ShapeId>,
 enteredGroupId: ShapeId,
): ReadonlySet<ShapeId> => {
 const dim = new Set<ShapeId>();
 const selectionSet = new Set(selection);
 for (const s of scene.shapes.values()) {
  if (selectionSet.has(s.id)) continue;
  if (!isDescendantOfGroup(scene, s.id, enteredGroupId)) {
   dim.add(s.id);
  }
 }
 return dim;
};

/**
 * Decide which group `raw` should drill into on a double-click.
 *
 *  • No group ancestor → null (drill doesn't apply).
 *  • Top group not yet entered → enter top.
 *  • Top group already entered → walk down the chain and pick the next inner
 *   group (drill one level deeper).
 */
export const pickDrillTarget = (
 scene: Scene,
 raw: Shape,
 top: Shape | null,
 enteredGroup: ShapeId | null,
): Shape | null => {
 if (!top) return null;
 if (enteredGroup !== top.id) return top;
 let cursor: Shape | undefined = raw;
 let next: Shape | null = null;
 let depth = 0;
 while (cursor?.parentId && depth < MAX_PARENT_DEPTH) {
  const parent = getShape(scene, cursor.parentId);
  if (!parent) break;
  if (parent.id === top.id) break;
  if (parent.type === "group") next = parent;
  cursor = parent;
  depth++;
 }
 return next;
};
