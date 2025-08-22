import type { ShapeId, Vec2 } from "@oh-just-another/types";
import {
  addShape,
  batch,
  getShape,
  orderForTop,
  type Patch,
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
 * Clone a shape for the clipboard buffer / paste output. Deep-clones the
 * plain data (so later edits don't bleed into the buffer) but carries
 * live runtime handles by reference instead of cloning them:
 *
 *   - `metadata.image` — a decoded `HTMLImageElement`; `structuredClone`
 *     throws `DataCloneError` on DOM nodes.
 *   - `animationData` — the raw GIF/video buffer; large and re-derivable
 *     from `fileId`, so sharing the reference avoids copying megabytes.
 *
 * The live `<img>` / buffer is shared, so the pasted shape draws
 * immediately (same as the original) and still references its `fileId`.
 */
export const cloneShapeForClipboard = (shape: Shape): Shape => {
  const meta = (shape as { metadata?: Record<string, unknown> }).metadata;
  const liveImage = meta && "image" in meta ? meta.image : undefined;
  const liveAnim = (shape as { animationData?: unknown }).animationData;

  // Strip the live handles, deep-clone the rest, then re-attach by ref.
  const stripped: Record<string, unknown> = { ...(shape as unknown as Record<string, unknown>) };
  if (liveAnim !== undefined) delete stripped.animationData;
  if (meta) {
    const m = { ...meta };
    delete m.image;
    stripped.metadata = m;
  }
  const cloned = structuredClone(stripped) as Record<string, unknown>;
  if (liveImage !== undefined) {
    cloned.metadata = { ...(cloned.metadata as Record<string, unknown> | undefined), image: liveImage };
  }
  if (liveAnim !== undefined) cloned.animationData = liveAnim;
  return cloned as unknown as Shape;
};

/**
 * Snapshot every selected shape into a fresh array. Uses
 * {@link cloneShapeForClipboard} so live runtime handles (decoded
 * image element, animation buffer) survive — a plain `structuredClone`
 * throws on the DOM `<img>` an image shape carries in `metadata.image`.
 */
export const copyShapes = (
  scene: Scene,
  selection: Iterable<ShapeId>,
): Shape[] => {
  const out: Shape[] = [];
  for (const id of selection) {
    const s = getShape(scene, id);
    if (s) out.push(cloneShapeForClipboard(s));
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

  // Build the patch list first, push as one batch. `history.transaction()`
  // is intentionally avoided: an Editor with an open gesture-transaction
  // (drag/resize in flight) would make `transaction()` throw "A transaction
  // is already open". The batch-push path doesn't nest, so paste is always
  // safe to call.
  const patches: Patch[] = [];
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
      ...cloneShapeForClipboard(tmpl),
      id: newId,
      position: { x: tmpl.position.x + delta.x, y: tmpl.position.y + delta.y },
      order,
    } as Shape;
    const r = addShape(next, clone);
    next = r.scene;
    patches.push(r.patch);
    newIds.push(newId);
  }
  if (patches.length > 0) {
    history.push(patches.length === 1 ? patches[0]! : batch(patches));
  }
  return { scene: next, newIds };
};
