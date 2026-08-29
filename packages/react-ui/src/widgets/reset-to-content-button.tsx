import { useMemo } from "react";
import { LocateFixed } from "lucide-react";
import { bounds as B, matrix } from "@oh-just-another/math";
import type { Bounds } from "@oh-just-another/types";
import { getScreenToWorld, getElementWorldBounds } from "@oh-just-another/scene";
import { useDiagramOptional, useScene } from "../core/hooks.js";
import { ROW_ICON } from "../core/constants.js";

/**
 * Pill button that runs `editor.revealNearestContent()` — jumps to the
 * element nearest the camera at the current zoom (never zooms in; zooms
 * out only if that element doesn't fit). Only renders when the scene has
 * content AND all of it lies outside the current viewport.
 *
 * The visibility check projects the scene's world AABB through the
 * inverse of the viewport transform and intersects with the screen rect.
 */
export const ResetToContentButton = () => {
  const editor = useDiagramOptional();
  const scene = useScene();
  // The content AABB is O(elements); a pan / zoom frame produces a new
  // `scene` with the same `elements` map, so key the walk on the map — on a
  // 20 k scene walking it per frame was ~10 % of the main thread.
  const content = useMemo(() => contentBounds(scene.elements), [scene.elements]);
  const isOff = useMemo(() => isContentOffscreen(scene, content), [scene, content]);
  if (!editor || scene.elements.size === 0 || !isOff) return null;
  return (
    <button
      type="button"
      className="du-pill-button"
      onClick={() => {
        editor.revealNearestContent();
      }}
      title="Jump to the nearest content"
    >
      <LocateFixed {...ROW_ICON} aria-hidden />
      <span>Back to content</span>
    </button>
  );
};

/**
 * Returns `true` if the union AABB of every scene shape lies fully
 * outside the current viewport rectangle. Partially-visible content
 * counts as visible — only fully-off-screen content triggers the
 * prompt. Empty scene → `false`.
 */
/** Union AABB of every element, or `null` for an empty scene. */
const contentBounds = (elements: ReturnType<typeof useScene>["elements"]): Bounds | null => {
  let combined: Bounds | null = null;
  for (const s of elements.values()) {
    const b = getElementWorldBounds(s);
    combined = combined ? B.union(combined, b) : b;
  }
  return combined;
};

const isContentOffscreen = (
  scene: ReturnType<typeof useScene>,
  combined: Bounds | null,
): boolean => {
  if (!combined) return false;
  const vp = scene.viewport;
  if (vp.size.width <= 0 || vp.size.height <= 0) return false;
  // Project the viewport rect into world coords; check intersection.
  const s2w = getScreenToWorld(vp);
  const tl = matrix.applyToPoint(s2w, { x: 0, y: 0 });
  const br = matrix.applyToPoint(s2w, { x: vp.size.width, y: vp.size.height });
  const viewportWorld: Bounds = {
    x: Math.min(tl.x, br.x),
    y: Math.min(tl.y, br.y),
    width: Math.abs(br.x - tl.x),
    height: Math.abs(br.y - tl.y),
  };
  // Off-screen = no overlap between content AABB and viewport AABB.
  const overlapX =
    combined.x < viewportWorld.x + viewportWorld.width &&
    viewportWorld.x < combined.x + combined.width;
  const overlapY =
    combined.y < viewportWorld.y + viewportWorld.height &&
    viewportWorld.y < combined.y + combined.height;
  return !(overlapX && overlapY);
};
