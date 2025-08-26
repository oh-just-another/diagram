import {
  apply,
  getShape,
  type Scene,
  type Shape,
  type Patch,
  type TextShape,
} from "@oh-just-another/scene";
import type { Bounds, ShapeId, Vec2 } from "@oh-just-another/types";
import type { HandleId } from "../../handle.js";
import { applyResizeConstraints, resizeFromHandle } from "../resize-helpers.js";
import { hasWidthHeight } from "../shape-traits.js";
import { TEXT_RESIZE_MIN_FONT_SIZE } from "../../constants.js";

/**
 * Pure: compute the patch + new scene for a single-shape resize.
 *
 * Only shapes with explicit `width` / `height` fields qualify
 * (`hasWidthHeight`) — others must ride the `scale` multiplier
 * instead (group resize). The container-aware clamp callback is
 * injected by the caller so this module doesn't depend on
 * container-ops.
 *
 * Returns `null` when the shape no longer exists or doesn't
 * qualify for in-place resize.
 */
export const computeShapeResize = (
  scene: Scene,
  id: ShapeId,
  handle: HandleId,
  delta: Vec2,
  originalBounds: Bounds,
  clampContainer: (shape: Shape, raw: Bounds, handle: HandleId) => Bounds,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  const shape = getShape(scene, id);
  if (!shape) return null;
  if (!hasWidthHeight(shape)) return null;

  const raw = resizeFromHandle(originalBounds, handle, delta);
  const intermediate = applyResizeConstraints(originalBounds, raw, handle, shape);
  const constrained = clampContainer(shape, intermediate, handle);

  // `constrained` is in world units (originalBounds was world AABB).
  // For shapes with a width/height field, persist that directly and
  // pin `scale` to 1 — otherwise a non-1 scale carried over from a
  // previous group resize would multiply the new width and the
  // shape would jump out from under the cursor on the next gesture.
  const next: Shape = {
    ...shape,
    position: { x: constrained.x, y: constrained.y },
    scale: { x: 1, y: 1 },
    width: constrained.width,
    height: constrained.height,
  } as Shape;
  const patch: Patch = { kind: "shape", id, before: shape, after: next };
  return { scene: apply(scene, patch), patch };
};

/**
 * Pure: resize a single text shape.
 *
 * `original` is the pristine shape snapshotted at the start of the
 * gesture (so font scaling is computed from a stable base, never
 * compounding tick-to-tick).
 *
 * - **Corners** (`nw/ne/se/sw`) and **top/bottom edges** (`n/s`) scale
 *   `fontSize` (and `maxWidth`, if set) uniformly — the box never
 *   distorts. There's no arbitrary height; a vertical drag scales the
 *   whole element.
 * - **Left/right edges** (`e/w`) change only the wrap width: the text
 *   reflows onto new lines (sets `maxWidth`, no font change).
 */
export const computeTextResize = (
  scene: Scene,
  original: TextShape,
  handle: HandleId,
  delta: Vec2,
  originalBounds: Bounds,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  const current = getShape(scene, original.id);
  if (!current) return null;
  const raw = resizeFromHandle(originalBounds, handle, delta);

  // Left / right edges → wrap-width only (no scale).
  if (handle === "e" || handle === "w") {
    const newMaxWidth = Math.max(original.fontSize, Math.abs(raw.width));
    const anchorX = handle === "w" ? originalBounds.x + originalBounds.width : originalBounds.x;
    const nx = handle === "w" ? anchorX - newMaxWidth : anchorX;
    const next: Shape = {
      ...original,
      position: { x: nx, y: originalBounds.y },
      scale: { x: 1, y: 1 },
      maxWidth: newMaxWidth,
    };
    const patch: Patch = { kind: "shape", id: original.id, before: current, after: next };
    return { scene: apply(scene, patch), patch };
  }

  // Corners + top/bottom edges → uniform font scale. Top/bottom take the
  // vertical ratio (only height changed); corners take the larger axis
  // so the dragged corner tracks the cursor along the diagonal.
  const horizontalEdge = handle === "n" || handle === "s";
  const sx = originalBounds.width > 0 ? Math.abs(raw.width / originalBounds.width) : 1;
  const sy = originalBounds.height > 0 ? Math.abs(raw.height / originalBounds.height) : 1;
  const s = horizontalEdge ? sy : Math.max(sx, sy);
  const newFont = Math.max(TEXT_RESIZE_MIN_FONT_SIZE, original.fontSize * s);
  const factor = newFont / original.fontSize; // applied scale (post-clamp)
  const newW = originalBounds.width * factor;
  const newH = originalBounds.height * factor;
  // Anchor = the edge/corner opposite the dragged handle stays put. For
  // n/s the horizontal position pins to the left edge.
  const ax = handle.includes("w") ? originalBounds.x + originalBounds.width : originalBounds.x;
  const ay = handle.includes("n") ? originalBounds.y + originalBounds.height : originalBounds.y;
  const nx = handle.includes("w") ? ax - newW : ax;
  const ny = handle.includes("n") ? ay - newH : ay;
  const next: Shape = {
    ...original,
    position: { x: nx, y: ny },
    scale: { x: 1, y: 1 },
    fontSize: newFont,
    ...(original.maxWidth !== undefined ? { maxWidth: original.maxWidth * factor } : {}),
  };
  const patch: Patch = { kind: "shape", id: original.id, before: current, after: next };
  return { scene: apply(scene, patch), patch };
};

/**
 * Pure: compute one patch per shape in the group-resize snapshot.
 *
 * Each member's *position offset* inside the original combined box
 * scales by the same factor; each member's `scale.{x,y}` is
 * multiplied so the visible size tracks the gesture. Mirroring
 * (flip) is allowed when the user drags past the opposite edge.
 *
 * `originSnapshot` is a per-shape press-down snapshot: position,
 * scale, bounds. Caller (Editor) collects it at press time and
 * threads it back every frame.
 */
export interface GroupResizeOrigin {
  readonly shapes: ReadonlyMap<
    ShapeId,
    {
      readonly position: Vec2;
      readonly scale: Vec2;
      readonly bounds: Bounds;
    }
  >;
}

export const computeGroupResizePatches = (
  scene: Scene,
  origin: GroupResizeOrigin,
  handle: HandleId,
  delta: Vec2,
  originalBounds: Bounds,
  isAspectLocked: boolean,
): { scene: Scene; patches: Patch[] } => {
  const next = resizeFromHandle(originalBounds, handle, delta);
  const minDim = 1;
  let sx = originalBounds.width > 0 ? next.width / originalBounds.width : 1;
  let sy = originalBounds.height > 0 ? next.height / originalBounds.height : 1;
  // Aspect-lock: groups can only scale uniformly. Use the larger
  // magnitude so the dragged corner moves along the diagonal toward
  // the cursor; sign is preserved per-axis so a drag past the anchor
  // still mirrors the group uniformly.
  if (isAspectLocked) {
    const locked = Math.max(Math.abs(sx), Math.abs(sy));
    sx = locked * (sx >= 0 ? 1 : -1);
    sy = locked * (sy >= 0 ? 1 : -1);
  }
  // Uniform factor for aspect-locked members (images) inside a mixed
  // selection: an image must only *scale*, never distort, even while
  // its neighbours follow the box's independent sx/sy (images are
  // SCALE-only). Use the dominant drag axis (larger relative change) so
  // dragging the width edge scales the image by the width ratio, the
  // height edge by the height ratio, and a corner by the dominant of the
  // two. Position still tracks the box via (sx, sy) below, so the image
  // stays put in the group's layout — only its size stays proportional.
  const imgScale = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;

  // Anchor for the scale = the unchanging corner / edge midpoint
  // of the original bounds (opposite to the dragged handle).
  const ax = handle.includes("w") ? originalBounds.x + originalBounds.width : originalBounds.x;
  const ay = handle.includes("n") ? originalBounds.y + originalBounds.height : originalBounds.y;

  let runningScene = scene;
  const patches: Patch[] = [];

  for (const [id, snap] of origin.shapes) {
    const shape = getShape(runningScene, id);
    if (!shape) continue;
    const newPx = ax + (snap.position.x - ax) * sx;
    const newPy = ay + (snap.position.y - ay) * sy;

    if (hasWidthHeight(shape)) {
      // Images scale uniformly (aspect-locked); everything else follows
      // the box's per-axis scale.
      const isImage = shape.type === "image";
      const wScale = isImage ? imgScale : sx;
      const hScale = isImage ? imgScale : sy;
      const newWidth = snap.bounds.width * wScale;
      const newHeight = snap.bounds.height * hScale;
      if (Math.abs(newWidth) < minDim || Math.abs(newHeight) < minDim) continue;
      const nextShape: Shape = {
        ...shape,
        position: { x: newPx, y: newPy },
        scale: {
          x: newWidth >= 0 ? 1 : -1,
          y: newHeight >= 0 ? 1 : -1,
        },
        width: Math.abs(newWidth),
        height: Math.abs(newHeight),
      } as Shape;
      const patch: Patch = { kind: "shape", id, before: shape, after: nextShape };
      runningScene = apply(runningScene, patch);
      patches.push(patch);
      continue;
    }

    const newScaleX = snap.scale.x * sx;
    const newScaleY = snap.scale.y * sy;
    if (Math.abs(newScaleX) < minDim / Math.max(1, snap.bounds.width)) continue;
    if (Math.abs(newScaleY) < minDim / Math.max(1, snap.bounds.height)) continue;
    const nextShape: Shape = {
      ...shape,
      position: { x: newPx, y: newPy },
      scale: { x: newScaleX, y: newScaleY },
    };
    const patch: Patch = { kind: "shape", id, before: shape, after: nextShape };
    runningScene = apply(runningScene, patch);
    patches.push(patch);
  }

  return { scene: runningScene, patches };
};
