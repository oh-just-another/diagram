import {
  getShape,
  getShapeWorldBounds,
  updateAnnotation,
  type Scene,
  type Element,
  type Patch,
} from "@oh-just-another/scene";
import type {
  AnnotationId,
  Bounds,
  ElementId,
  Vec2,
} from "@oh-just-another/types";

/**
 * Pure: compute the patch that moves shape `id` by `delta` from
 * the press-down state captured in `originalBounds`. Returns
 * `null` when the shape no longer exists (deleted mid-drag, etc.).
 *
 * `originalBounds` is in world space at press time; `localBounds`
 * (current) compensates for parent-rooted layouts where the shape's
 * own position has already moved relative to its parent. The
 * offset is added so the cursor stays at the press anchor through
 * the drag.
 *
 * Editor's wrapper applies the patch, runs `recordGesturePatch`,
 * and fires notify.
 */
export const computeShapeMovePatch = (
  scene: Scene,
  id: ElementId,
  delta: Vec2,
  originalBounds: Bounds,
): Patch | null => {
  const shape = getShape(scene, id);
  if (!shape) return null;
  const localBounds = getShapeWorldBounds(shape);
  const offsetX = originalBounds.x - localBounds.x;
  const offsetY = originalBounds.y - localBounds.y;
  const next: Element = {
    ...shape,
    position: {
      x: shape.position.x + delta.x + offsetX,
      y: shape.position.y + delta.y + offsetY,
    },
  };
  return { kind: "shape", id, before: shape, after: next };
};

/**
 * Pure: compute one patch per shape in the active group-drag
 * snapshot. `delta` is the cumulative cursor displacement since
 * press-down, so each shape lands at `origin + delta` every frame
 * — no accumulator state inside the loop. Skips no-op moves
 * (delta after rounding lands the shape back at its current pos).
 */
export const computeGroupMovePatches = (
  scene: Scene,
  groupMoveOrigin: ReadonlyMap<ElementId, Vec2>,
  delta: Vec2,
): Patch[] => {
  const out: Patch[] = [];
  for (const [id, origin] of groupMoveOrigin) {
    const shape = getShape(scene, id);
    if (!shape) continue;
    const next: Element = {
      ...shape,
      position: { x: origin.x + delta.x, y: origin.y + delta.y },
    };
    if (next.position.x === shape.position.x && next.position.y === shape.position.y) continue;
    out.push({ kind: "shape", id, before: shape, after: next });
  }
  return out;
};

/**
 * Pure: compute the scene + patch resulting from an annotation
 * drag. For shape-anchored annotations the stored position is the
 * offset from the host shape's world position, so we translate
 * the requested world target back into local space. Returns
 * `null` when the annotation no longer exists or the move is a
 * pixel-perfect no-op.
 */
export const computeAnnotationMovePatch = (
  scene: Scene,
  id: AnnotationId,
  delta: Vec2,
  origin: Vec2,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  const ann = scene.annotations.get(id);
  if (!ann) return null;
  const targetWorld: Vec2 = { x: origin.x + delta.x, y: origin.y + delta.y };
  let storedPosition: Vec2 = targetWorld;
  if (ann.elementId) {
    const shape = getShape(scene, ann.elementId);
    if (shape) {
      storedPosition = {
        x: targetWorld.x - shape.position.x,
        y: targetWorld.y - shape.position.y,
      };
    }
  }
  if (storedPosition.x === ann.position.x && storedPosition.y === ann.position.y) return null;
  const r = updateAnnotation(scene, id, (a) => ({ ...a, position: storedPosition }));
  return { scene: r.scene, patch: r.patch };
};
