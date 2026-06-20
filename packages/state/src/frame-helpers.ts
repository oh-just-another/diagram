import type { Bounds, ElementId } from "@oh-just-another/types";
import { getElementWorldBounds, updateElement, type Scene } from "@oh-just-another/scene";
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

/**
 * Re-evaluate frame membership for EVERY non-frame element against the
 * current frames — run at the end of a move / resize gesture. An element
 * joins the top-most frame whose world bounds contain its centre, and is
 * released (`frameId` cleared) when its centre is over no frame. Idempotent:
 * pushes a patch only when an element's owning frame actually changed, so a
 * plain click / no-op drag costs nothing. Mutates `history`; returns the new
 * scene.
 */
export const reconcileFrameMembership = (scene: Scene, history: HistoryProvider): Scene => {
  // Frames top-most first — highest z-order (fractional-index string) wins
  // when frames overlap.
  const frames = [...scene.elements.values()]
    .filter((s) => s.type === "frame")
    .sort((a, b) => (a.order < b.order ? 1 : a.order > b.order ? -1 : 0))
    .map((f) => ({ id: f.id, b: getElementWorldBounds(f) }));

  let next = scene;
  for (const shape of scene.elements.values()) {
    if (shape.type === "frame") continue;
    const b = getElementWorldBounds(shape);
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    let owner: ElementId | undefined;
    for (const f of frames) {
      if (cx >= f.b.x && cx <= f.b.x + f.b.width && cy >= f.b.y && cy <= f.b.y + f.b.height) {
        owner = f.id;
        break;
      }
    }
    if (shape.frameId === owner) continue;
    const r = updateElement(next, shape.id, (s) => {
      const copy: typeof s = { ...s };
      // `exactOptionalPropertyTypes`: omit the key on release rather than
      // setting it to `undefined`.
      if (owner === undefined) delete (copy as { frameId?: ElementId }).frameId;
      else (copy as { frameId?: ElementId }).frameId = owner;
      return copy;
    });
    next = r.scene;
    history.push(r.patch);
  }
  return next;
};
