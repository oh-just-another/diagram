import type { ShapeId, Vec2 } from "@oh-just-another/types";
import {
  addShape,
  getShape,
  orderForTop,
  type Scene,
  type Shape,
} from "@oh-just-another/scene";
import type { HistoryProvider } from "@oh-just-another/history";

/**
 * Clipboard helpers.
 *
 * The Editor's internal clipboard buffer is an array of deep-cloned
 * shapes — it survives across calls within one editor session;
 * cross-tab paste is a host concern (`navigator.clipboard`).
 *
 *   • `copyShapes` — collect selection into a fresh buffer.
 *   • `pasteShapes` — paste a buffer into the scene at a target
 *     centroid, returning the new selection.
 */

export interface PasteResult {
  readonly scene: Scene;
  readonly newIds: readonly ShapeId[];
}

/**
 * Snapshot every selected shape into a fresh array (deep clones via
 * `structuredClone`, so subsequent edits don't bleed into the
 * buffer). Returns the new buffer; caller assigns it to the
 * editor's internal field.
 */
export const copyShapes = (
  scene: Scene,
  selection: Iterable<ShapeId>,
): Shape[] => {
  const out: Shape[] = [];
  for (const id of selection) {
    const s = getShape(scene, id);
    if (s) out.push(structuredClone(s));
  }
  return out;
};

/**
 * Paste the clipboard into `scene` so that its centroid lands at
 * `target` (when supplied) or `+10` from each shape's stored
 * position (so duplicates stay visible). Relative offsets between
 * clipboard items are preserved.
 *
 * Allocates new shape ids via the `genId` callback (so the Editor
 * keeps owning the counter) and pushes patches into `history`.
 * Returns the new scene + ids the caller should select.
 */
export const pasteShapes = (
  scene: Scene,
  history: HistoryProvider,
  clipboard: readonly Shape[],
  target: Vec2 | null,
  genId: () => ShapeId,
): PasteResult => {
  if (clipboard.length === 0) return { scene, newIds: [] };

  let cx = 0;
  let cy = 0;
  for (const s of clipboard) {
    cx += s.position.x;
    cy += s.position.y;
  }
  cx /= clipboard.length;
  cy /= clipboard.length;
  const delta = target
    ? { x: target.x - cx, y: target.y - cy }
    : { x: 10, y: 10 };

  const tx = history.transaction();
  const newIds: ShapeId[] = [];
  let next = scene;
  for (const tmpl of clipboard) {
    const newId = genId();
    const order = orderForTop(
      [...next.shapes.values()]
        .filter((s) => s.layerId === tmpl.layerId)
        .map((s) => s.order),
    );
    const clone = {
      ...structuredClone(tmpl),
      id: newId,
      position: { x: tmpl.position.x + delta.x, y: tmpl.position.y + delta.y },
      order,
    } as Shape;
    const r = addShape(next, clone);
    next = r.scene;
    tx.add(r.patch);
    newIds.push(newId);
  }
  tx.commit();
  return { scene: next, newIds };
};
