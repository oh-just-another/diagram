import type { Scene, Element, BinaryFile } from "@oh-just-another/scene";
import {
  copiedFiles as copiedFilesHelper,
  copyElements as copyElementsHelper,
  pasteElements as pasteElementsHelper,
} from "../../features/clipboard.js";
import type { HistoryProvider } from "@oh-just-another/history";
import type { ElementId, FileId, Vec2 } from "@oh-just-another/types";
import { elementId as castElementId } from "@oh-just-another/types";
import * as Selection from "../../selection/selection.js";

/**
 * Copy / paste delegators over the editor-owned clipboard buffer. Copies are
 * deep-cloned snapshots so later mutations don't affect the buffer.
 */

/** Copy: returns the shape array the editor stores as `clipboard`. */
export const copySelected = (scene: Scene, selection: Selection.Selection): readonly Element[] =>
  copyElementsHelper(scene, selection);

/** The binary entries a copy has to keep alive for its shapes (see `copiedFiles`). */
export const copiedFiles = (scene: Scene, clipboard: readonly Element[]): Map<FileId, BinaryFile> =>
  copiedFilesHelper(scene, clipboard);

/**
 * Paste: produce the new scene + freshly-generated shape ids for the
 * newly-pasted cluster. Editor owns side effects (history push happens
 * inside the pasteElements helper, then `_selection` is updated).
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
  clipboard: readonly Element[],
  target: Vec2 | null,
  nextIdSeed: () => number,
  files: ReadonlyMap<FileId, BinaryFile> = new Map(),
): {
  readonly scene: Scene;
  readonly newIds: readonly ElementId[];
} => {
  const result = pasteElementsHelper(
    scene,
    history,
    clipboard,
    target,
    () => castElementId(`shape-${nextIdSeed()}-${Date.now().toString(36)}`),
    files,
  );
  return { scene: result.scene, newIds: result.newIds };
};

/** Compose the next selection from a freshly-pasted id list. */
export const selectionFromPasted = (newIds: readonly ElementId[]): Selection.Selection => {
  let next: Selection.Selection = Selection.EMPTY;
  for (const id of newIds) next = Selection.add(next, id);
  return next;
};
