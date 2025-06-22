import type { Scene, Shape } from "@oh-just-another/scene";
import {
  copyShapes as copyShapesHelper,
  pasteShapes as pasteShapesHelper,
} from "../../clipboard.js";
import type { HistoryProvider } from "@oh-just-another/history";
import type { ShapeId, Vec2 } from "@oh-just-another/types";
import { shapeId as castShapeId } from "@oh-just-another/types";
import * as Selection from "../../selection.js";

/**
 * Internal clipboard storage. Editor owns the array; copy / paste
 * delegators below read & write through it. Stored as deep-cloned
 * snapshots so subsequent mutations don't affect the buffer. Cross-tab
 * paste uses host-level `navigator.clipboard`.
 */

/** Copy: returns the shape array the editor stores as `clipboard`. */
export const copySelected = (
  scene: Scene,
  selection: Selection.Selection,
): readonly Shape[] => copyShapesHelper(scene, selection);

/**
 * Paste: produce the new scene + freshly-generated shape ids for
 * the newly-pasted cluster. Editor owns side effects (history
 * push happens inside pasteShapes helper which receives `history`,
 * then updates `_selection`, fires notify + announce).
 *
 * `targetWorld` lands the cluster's centroid; caller defaults to the
 * last tracked cursor world position, with a +10 px nudge fallback in
 * `paste()` when even that is unavailable.
 *
 * `nextId` is the editor's monotonic counter; passed in so the editor
 * stays the single source of truth for ids.
 */
export const pasteFromClipboard = (
  scene: Scene,
  history: HistoryProvider,
  clipboard: readonly Shape[],
  target: Vec2 | null,
  nextIdSeed: () => number,
): {
  readonly scene: Scene;
  readonly newIds: readonly ShapeId[];
} => {
  const result = pasteShapesHelper(scene, history, clipboard, target, () =>
    castShapeId(`shape-${nextIdSeed()}-${Date.now().toString(36)}`),
  );
  return { scene: result.scene, newIds: result.newIds };
};

/** Compose the next selection from a freshly-pasted id list. */
export const selectionFromPasted = (newIds: readonly ShapeId[]): Selection.Selection => {
  let next: Selection.Selection = Selection.EMPTY;
  for (const id of newIds) next = Selection.add(next, id);
  return next;
};
