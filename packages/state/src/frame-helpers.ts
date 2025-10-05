import type { Bounds, ElementId } from "@oh-just-another/types";
import {
  getElementWorldBounds,
  updateElement,
  type Scene,
} from "@oh-just-another/scene";
import type { HistoryProvider } from "@oh-just-another/history";

/**
 * Frame helpers. Two distinct concerns: choosing a free auto-name
 * (`Frame N+1`) and assigning ownership when a frame is freshly drawn over
 * existing shapes. Both are bounded by scene contents; the second threads
 * scene + history mutations the same way Editor does internally.
 */

const FRAME_NAME_PATTERN = /^Frame (\d+)$/;

/**
 * Next free `Frame N` auto-name — finds the highest existing `Frame <number>`
 * in the scene and returns the increment. New frames default to this when the
 * host doesn't supply a name.
 */
export const nextFrameName = (scene: Scene): string => {
  let max = 0;
  for (const s of scene.elements.values()) {
    if (s.type !== "frame") continue;
    const m = FRAME_NAME_PATTERN.exec((s as { name?: string }).name ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Frame ${max + 1}`;
};

/**
 * Assign `frameId` to every shape (except the frame itself) whose centre
 * falls inside `frameBounds`. Already-owned shapes are left alone; the user
 * has to drag them in explicitly to reassign.
 *
 * Mutates `history` (push per change) and returns the new scene. Caller
 * decides whether to wrap in a single transaction (Editor already does for
 * the gesture).
 */
export const assignFrameMembers = (
  scene: Scene,
  history: HistoryProvider,
  frameId: ElementId,
  frameBounds: Bounds,
): Scene => {
  const left = frameBounds.x;
  const top = frameBounds.y;
  const right = frameBounds.x + frameBounds.width;
  const bottom = frameBounds.y + frameBounds.height;
  let next = scene;
  for (const shape of scene.elements.values()) {
    if (shape.id === frameId) continue;
    if (shape.type === "frame") continue;
    if (shape.frameId !== undefined) continue;
    const b = getElementWorldBounds(shape);
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    if (cx < left || cx > right || cy < top || cy > bottom) continue;
    const r = updateElement(next, shape.id, (s) => ({ ...s, frameId }));
    next = r.scene;
    history.push(r.patch);
  }
  return next;
};
