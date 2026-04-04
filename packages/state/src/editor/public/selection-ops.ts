import {
  addElement,
  getElement,
  orderForTop,
  removeLink,
  removeElement,
  updateElement,
  type Scene,
  type Element,
  type Patch,
  type TextStyle,
} from "@oh-just-another/scene";
import type { LinkId, LayerId, ElementId, Vec2 } from "@oh-just-another/types";
import { elementId as castElementId } from "@oh-just-another/types";
import * as Selection from "../../selection.js";

/**
 * Nudge every selected shape (plus descendants) by `delta`, skipping
 * shapes on locked layers. Returns the next scene + patches + count of
 * actually-moved shapes; `null` when nothing qualifies.
 */
export const computeMoveSelectionBy = (
  scene: Scene,
  targets: ReadonlySet<ElementId>,
  delta: Vec2,
  isLayerLocked: (id: LayerId) => boolean,
): { readonly scene: Scene; readonly patches: Patch[]; readonly moved: number } | null => {
  if (delta.x === 0 && delta.y === 0) return null;
  let s = scene;
  const patches: Patch[] = [];
  let moved = 0;
  for (const id of targets) {
    const shape = getElement(s, id);
    if (!shape) continue;
    if (isLayerLocked(shape.layerId)) continue;
    const r = updateElement(s, id, (sh) => ({
      ...sh,
      position: { x: sh.position.x + delta.x, y: sh.position.y + delta.y },
    }));
    s = r.scene;
    patches.push(r.patch);
    moved++;
  }
  if (moved === 0) return null;
  return { scene: s, patches, moved };
};

/**
 * Delete selected shapes + a selected edge, dropping any edges
 * attached to selected shapes first so endpoint refs don't dangle.
 * Returns the next scene + patches; `null` when nothing is selected.
 */
export const computeDeleteSelection = (
  scene: Scene,
  selection: Selection.Selection,
  selectedLinks: ReadonlySet<LinkId>,
): { readonly scene: Scene; readonly patches: Patch[] } | null => {
  if (selection.size === 0 && selectedLinks.size === 0) return null;
  let s = scene;
  const patches: Patch[] = [];
  // Track removed links so an explicitly-selected link that's also
  // attached to a deleted element isn't removed twice (removeLink throws).
  const removed = new Set<LinkId>();
  const dropLink = (id: LinkId) => {
    if (removed.has(id) || !s.links.has(id)) return;
    const r = removeLink(s, id);
    s = r.scene;
    patches.push(r.patch);
    removed.add(id);
  };
  for (const id of selection) {
    for (const edge of [...s.links.values()]) {
      if (
        (edge.from.kind !== "point" && edge.from.elementId === id) ||
        (edge.to.kind !== "point" && edge.to.elementId === id)
      ) {
        dropLink(edge.id);
      }
    }
    const r = removeElement(s, id);
    s = r.scene;
    patches.push(r.patch);
  }
  for (const id of selectedLinks) dropLink(id);
  return { scene: s, patches };
};

/**
 * Duplicate selected shapes 10 px down-right of the originals. Returns
 * the next scene + patches + new ids; `null` for an empty selection.
 * `nextIdSeed` is the editor's monotonic counter (bumped per new
 * shape).
 */
export const computeDuplicateSelection = (
  scene: Scene,
  selection: Selection.Selection,
  nextIdSeed: () => number,
): {
  readonly scene: Scene;
  readonly patches: Patch[];
  readonly newIds: readonly ElementId[];
} | null => {
  const targets = [...selection];
  if (targets.length === 0) return null;
  let s = scene;
  const patches: Patch[] = [];
  const newIds: ElementId[] = [];
  for (const id of targets) {
    const shape = getElement(s, id);
    if (!shape) continue;
    const newId = castElementId(`shape-${nextIdSeed()}-${Date.now().toString(36)}`);
    const order = orderForTop(
      [...s.elements.values()].filter((sh) => sh.layerId === shape.layerId).map((sh) => sh.order),
    );
    const clone = {
      ...shape,
      id: newId,
      position: { x: shape.position.x + 10, y: shape.position.y + 10 },
      order,
    } as Element;
    const r = addElement(s, clone);
    s = r.scene;
    patches.push(r.patch);
    newIds.push(newId);
  }
  return { scene: s, patches, newIds };
};

/**
 * Replace the selection with `ids`, dropping any id that doesn't
 * resolve. Returns the next selection, or `null` when it would equal
 * `current`.
 */
export const computeSetSelection = (
  scene: Scene,
  ids: Iterable<ElementId>,
  current: Selection.Selection,
): Selection.Selection | null => {
  let next: Selection.Selection = Selection.EMPTY;
  for (const id of ids) {
    if (!scene.elements.has(id)) continue;
    next = Selection.add(next, id);
  }
  if (Selection.equals(next, current)) return null;
  return next;
};

/**
 * Select every shape on a visible / unlocked layer. Returns the next
 * selection, or `null` when it would equal `current`.
 */
export const computeSelectAll = (
  scene: Scene,
  current: Selection.Selection,
): Selection.Selection | null => {
  let next: Selection.Selection = Selection.EMPTY;
  for (const shape of scene.elements.values()) {
    const layer = scene.layers.get(shape.layerId);
    if (!layer || !layer.visible || layer.locked) continue;
    next = Selection.add(next, shape.id);
  }
  if (Selection.equals(next, current)) return null;
  return next;
};

/**
 * Every link on a visible / unlocked layer — the link half of Cmd+A.
 * Returns the full set (caller diffs against the current link
 * selection to decide whether anything changed).
 */
export const computeSelectAllLinks = (scene: Scene): Set<LinkId> => {
  const next = new Set<LinkId>();
  for (const edge of scene.links.values()) {
    const layer = scene.layers.get(edge.layerId);
    if (!layer || !layer.visible || layer.locked) continue;
    next.add(edge.id);
  }
  return next;
};

/**
 * Merge `partial` into the `style` of every shape in `ids`. Returns
 * the next scene + a single (or `batch`) patch ready to push as one
 * undo step; `null` when nothing applies.
 */
export const computeUpdateStyle = (
  scene: Scene,
  ids: Iterable<ElementId>,
  partial: Partial<TextStyle>,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  const targetIds: ElementId[] = [];
  for (const id of ids) {
    if (scene.elements.has(id)) targetIds.push(id);
  }
  if (targetIds.length === 0) return null;
  let s = scene;
  const patches: Patch[] = [];
  for (const id of targetIds) {
    const r = updateElement(s, id, (sh) => ({ ...sh, style: { ...sh.style, ...partial } }));
    s = r.scene;
    patches.push(r.patch);
  }
  const firstPatch = patches[0];
  return {
    scene: s,
    patch:
      patches.length === 1 && firstPatch !== undefined
        ? firstPatch
        : { kind: "batch", patches },
  };
};

/**
 * Merge non-style text properties (`fontSize`, `fontFamily`,
 * `maxWidth`) into every selected text shape. Non-text shapes in `ids`
 * are skipped. Returns the next scene + a single (or batched) patch,
 * or `null` when no text shape applied.
 */
export const computeUpdateTextProps = (
  scene: Scene,
  ids: Iterable<ElementId>,
  partial: { readonly fontSize?: number; readonly fontFamily?: string; readonly maxWidth?: number },
): { readonly scene: Scene; readonly patch: Patch } | null => {
  const targetIds: ElementId[] = [];
  for (const id of ids) {
    if (getElement(scene, id)?.type === "text") targetIds.push(id);
  }
  if (targetIds.length === 0) return null;
  let s = scene;
  const patches: Patch[] = [];
  for (const id of targetIds) {
    const r = updateElement(s, id, (sh) => ({ ...sh, ...partial }));
    s = r.scene;
    patches.push(r.patch);
  }
  const firstPatch = patches[0];
  return {
    scene: s,
    patch:
      patches.length === 1 && firstPatch !== undefined
        ? firstPatch
        : { kind: "batch", patches },
  };
};

/** Human-readable description for the live-region announce after a nudge. */
export const describeNudge = (delta: Vec2, count: number): string => {
  const parts: string[] = [];
  if (delta.x > 0) parts.push(`${delta.x} px right`);
  else if (delta.x < 0) parts.push(`${-delta.x} px left`);
  if (delta.y > 0) parts.push(`${delta.y} px down`);
  else if (delta.y < 0) parts.push(`${-delta.y} px up`);
  const subject = count === 1 ? "shape" : `${count} shapes`;
  return `Moved ${subject} ${parts.join(" and ")}`;
};

/** Compose a selection from a freshly-created id list. */
export const selectionFromNewIds = (ids: readonly ElementId[]): Selection.Selection => {
  let next: Selection.Selection = Selection.EMPTY;
  for (const id of ids) next = Selection.add(next, id);
  return next;
};
