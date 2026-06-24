import {
  apply,
  getAutoLayoutSpec,
  getElement,
  getLink,
  type Scene,
  type Element,
  type Link,
  type Patch,
  type TextElement,
} from "@oh-just-another/scene";
import type { Bounds, ElementId, LinkId, Vec2 } from "@oh-just-another/types";
import type { HandleId } from "../../handle.js";
import {
  applyResizeConstraints,
  lockAspectRatio,
  resizeFromCenter,
  resizeFromHandle,
} from "../resize-helpers.js";
import { hasWidthHeight } from "../shape-traits.js";
import { scaleLinkAround } from "./link-move.js";
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
export const computeElementResize = (
  scene: Scene,
  id: ElementId,
  handle: HandleId,
  delta: Vec2,
  originalBounds: Bounds,
  clampContainer: (shape: Element, raw: Bounds, handle: HandleId) => Bounds,
  lockAspect = false,
  fromCenter = false,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  const shape = getElement(scene, id);
  if (!shape) return null;
  if (!hasWidthHeight(shape)) return null;

  const free = resizeFromHandle(originalBounds, handle, delta);
  const shaped = lockAspect ? lockAspectRatio(originalBounds, free) : free;
  const raw = fromCenter ? resizeFromCenter(originalBounds, shaped) : shaped;
  // An auto-layout container (a box holding laid-out children) must NEVER
  // mirror through its own body: dragging an edge inward past the opposite
  // edge would otherwise hand control to that opposite edge ("flip through
  // the face"). Force `noFlip` regardless of the element's stored flag so
  // instances that lack it behave the same.
  const noFlip = shape.noFlip === true || getAutoLayoutSpec(shape) !== null;
  const constraints: Element = noFlip ? { ...shape, noFlip: true } : shape;
  const intermediate = applyResizeConstraints(originalBounds, raw, handle, constraints, fromCenter);
  const constrained = clampContainer(shape, intermediate, handle);

  // `constrained` is in world units (originalBounds was world AABB).
  // For shapes with a width/height field, persist that directly and
  // pin `scale` to 1 — otherwise a non-1 scale carried over from a
  // previous group resize would multiply the new width and the
  // shape would jump out from under the cursor on the next gesture.
  const next: Element = {
    ...shape,
    position: { x: constrained.x, y: constrained.y },
    scale: { x: 1, y: 1 },
    width: constrained.width,
    height: constrained.height,
  } as Element;
  const patch: Patch = { kind: "element", id, before: shape, after: next };
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
  original: TextElement,
  handle: HandleId,
  delta: Vec2,
  originalBounds: Bounds,
  fromCenter = false,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  const current = getElement(scene, original.id);
  if (!current) return null;
  const raw = resizeFromHandle(originalBounds, handle, delta);
  const cx = originalBounds.x + originalBounds.width / 2;
  const cy = originalBounds.y + originalBounds.height / 2;

  // Left / right edges → wrap-width only (no scale).
  if (handle === "e" || handle === "w") {
    const newMaxWidth = Math.max(original.fontSize, Math.abs(raw.width));
    const anchorX = handle === "w" ? originalBounds.x + originalBounds.width : originalBounds.x;
    const nx = fromCenter ? cx - newMaxWidth / 2 : handle === "w" ? anchorX - newMaxWidth : anchorX;
    const next: Element = {
      ...original,
      position: { x: nx, y: originalBounds.y },
      scale: { x: 1, y: 1 },
      maxWidth: newMaxWidth,
    };
    const patch: Patch = { kind: "element", id: original.id, before: current, after: next };
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
  const nx = fromCenter ? cx - newW / 2 : handle.includes("w") ? ax - newW : ax;
  const ny = fromCenter ? cy - newH / 2 : handle.includes("n") ? ay - newH : ay;
  const next: Element = {
    ...original,
    position: { x: nx, y: ny },
    scale: { x: 1, y: 1 },
    fontSize: newFont,
    ...(original.maxWidth !== undefined ? { maxWidth: original.maxWidth * factor } : {}),
  };
  const patch: Patch = { kind: "element", id: original.id, before: current, after: next };
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
  readonly elements: ReadonlyMap<
    ElementId,
    {
      readonly position: Vec2;
      readonly scale: Vec2;
      readonly bounds: Bounds;
    }
  >;
  /**
   * Press-time snapshot of links that scale with the box: selected links
   * (whole, incl. free endpoints) ∪ connectors bound on both ends to resized
   * elements (geometry follows). Optional: omitted by callers that
   * don't resize links.
   */
  readonly links?: ReadonlyMap<LinkId, Link>;
}

export const computeGroupResizePatches = (
  scene: Scene,
  origin: GroupResizeOrigin,
  handle: HandleId,
  delta: Vec2,
  originalBounds: Bounds,
  isAspectLocked: boolean,
  fromCenter = false,
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
  // Centre-anchored resize: the dragged side moves while the opposite side
  // mirrors, so the scale deviation from 1 doubles about the centre.
  if (fromCenter) {
    sx = 1 + 2 * (sx - 1);
    sy = 1 + 2 * (sy - 1);
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

  // Anchor for the scale: the original centre when resizing from centre,
  // otherwise the unchanging corner / edge midpoint opposite the dragged handle.
  const ax = fromCenter
    ? originalBounds.x + originalBounds.width / 2
    : handle.includes("w")
      ? originalBounds.x + originalBounds.width
      : originalBounds.x;
  const ay = fromCenter
    ? originalBounds.y + originalBounds.height / 2
    : handle.includes("n")
      ? originalBounds.y + originalBounds.height
      : originalBounds.y;

  let runningScene = scene;
  const patches: Patch[] = [];

  for (const [id, snap] of origin.elements) {
    const shape = getElement(runningScene, id);
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
      const nextElement: Element = {
        ...shape,
        position: { x: newPx, y: newPy },
        scale: {
          x: newWidth >= 0 ? 1 : -1,
          y: newHeight >= 0 ? 1 : -1,
        },
        width: Math.abs(newWidth),
        height: Math.abs(newHeight),
      } as Element;
      const patch: Patch = { kind: "element", id, before: shape, after: nextElement };
      runningScene = apply(runningScene, patch);
      patches.push(patch);
      continue;
    }

    const newScaleX = snap.scale.x * sx;
    const newScaleY = snap.scale.y * sy;
    if (Math.abs(newScaleX) < minDim / Math.max(1, snap.bounds.width)) continue;
    if (Math.abs(newScaleY) < minDim / Math.max(1, snap.bounds.height)) continue;
    const nextElement: Element = {
      ...shape,
      position: { x: newPx, y: newPy },
      scale: { x: newScaleX, y: newScaleY },
    };
    const patch: Patch = { kind: "element", id, before: shape, after: nextElement };
    runningScene = apply(runningScene, patch);
    patches.push(patch);
  }

  // Scale the links that ride with the box (selected ∪ bound-both) about the
  // same anchor by the same (sx, sy) — geometry + free point endpoints.
  for (const [id, linkOrigin] of origin.links ?? []) {
    const current = getLink(runningScene, id);
    if (!current) continue;
    const scaled = scaleLinkAround(linkOrigin, ax, ay, sx, sy);
    if (!scaled) continue;
    const patch: Patch = { kind: "link", id, before: current, after: { ...current, ...scaled } };
    runningScene = apply(runningScene, patch);
    patches.push(patch);
  }

  return { scene: runningScene, patches };
};
