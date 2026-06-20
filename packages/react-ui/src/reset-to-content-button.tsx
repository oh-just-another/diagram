import { useMemo } from "react";
import { LocateFixed } from "lucide-react";
import { bounds as B, matrix } from "@oh-just-another/math";
import type { Bounds } from "@oh-just-another/types";
import { getScreenToWorld, getElementWorldBounds } from "@oh-just-another/scene";
import { useDiagramOptional, useScene } from "./hooks.js";

/** Pill-button icon footprint — matches BottomBar density. */
const PILL_ICON_SIZE = 14;
const PILL_ICON_STROKE = 1.75;

/**
 * Pill button that runs `editor.zoomToFit()` — only renders when the
 * scene has content AND that content lies (entirely or partly) outside
 * the current viewport. Hidden otherwise.
 *
 * The visibility check projects the scene's world AABB through the
 * inverse of the viewport transform and intersects with the screen rect.
 */
export const ResetToContentButton = () => {
  const editor = useDiagramOptional();
  const scene = useScene();
  const isOff = useMemo(() => isContentOffscreen(scene), [scene]);
  if (!editor || scene.elements.size === 0 || !isOff) return null;
  return (
    <button
      type="button"
      className="du-pill-button"
      onClick={() => {
        editor.zoomToFit();
      }}
      title="Reset view to fit all content"
    >
      <LocateFixed size={PILL_ICON_SIZE} strokeWidth={PILL_ICON_STROKE} aria-hidden />
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
const isContentOffscreen = (scene: ReturnType<typeof useScene>): boolean => {
  if (scene.elements.size === 0) return false;
  const vp = scene.viewport;
  if (vp.size.width <= 0 || vp.size.height <= 0) return false;
  let combined: Bounds | null = null;
  for (const s of scene.elements.values()) {
    const b = getElementWorldBounds(s);
    combined = combined ? B.union(combined, b) : b;
  }
  if (!combined) return false;
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
