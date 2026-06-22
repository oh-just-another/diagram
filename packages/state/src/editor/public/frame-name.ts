import {
  getElement,
  updateElement,
  isFrame,
  FRAME_HEADER_HEIGHT,
  type Scene,
  type Patch,
} from "@oh-just-another/scene";
import type { ElementId, Vec2 } from "@oh-just-another/types";

/**
 * Frame whose header strip (the label bar ABOVE the body) contains the world
 * point — top-most by z-order. Used to route a double-click on the header to a
 * name edit, since the header sits outside the frame's hit-test bounds. Assumes
 * unrotated frames (the common case).
 */
export const frameHeaderAt = (scene: Scene, p: Vec2): ElementId | null => {
  let bestId: ElementId | null = null;
  let bestOrder = "";
  for (const s of scene.elements.values()) {
    if (!isFrame(s)) continue;
    const hx = s.position.x;
    // The header strip can extend up to the frame's full width (it hugs the
    // label but is capped there), so the rename hit zone spans it.
    const hw = s.width * s.scale.x;
    const hh = FRAME_HEADER_HEIGHT * s.scale.y;
    const hyTop = s.position.y - hh;
    if (p.x >= hx && p.x <= hx + hw && p.y >= hyTop && p.y <= hyTop + hh) {
      if (bestId === null || s.order > bestOrder) {
        bestId = s.id;
        bestOrder = s.order;
      }
    }
  }
  return bestId;
};

/**
 * Compute the patch committing an edited frame name. Empty / whitespace-only
 * clears the stored name (the renderer falls back to "Frame"). Returns `null`
 * when the shape isn't a frame or the name is unchanged — the caller still
 * clears the editing state and notifies.
 */
export const computeFrameNameCommit = (
  scene: Scene,
  id: ElementId,
  name: string,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  const shape = getElement(scene, id);
  if (shape?.type !== "frame") return null;
  const trimmed = name.trim();
  const current = (shape as { name?: string }).name ?? "";
  if (trimmed === current) return null;
  const r = updateElement(scene, id, (s) => {
    const copy = { ...s } as typeof s & { name?: string };
    // `exactOptionalPropertyTypes`: drop the key when cleared.
    if (trimmed === "") delete copy.name;
    else copy.name = trimmed;
    return copy;
  });
  return { scene: r.scene, patch: r.patch };
};
