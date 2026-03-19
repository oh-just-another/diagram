import {
  addElement,
  apply,
  getElement,
  getElementAccessibleName,
  gridLayout,
  orderForTop,
  removeElement,
  stackLayout,
  updateElement,
  type Scene,
  type Element,
  type Patch,
} from "@oh-just-another/scene";
import type { Bounds, ElementId } from "@oh-just-another/types";
import { elementId as castElementId } from "@oh-just-another/types";
import type * as Selection from "../../selection.js";

/**
 * Arrange selected shapes on a regular grid. Returns the next scene +
 * the patch when something changed, `null` for a no-op (< 2 shapes or
 * layout collapsed to identity).
 */
export const computeArrangeAsGrid = (
  scene: Scene,
  selection: Selection.Selection,
  opts: { cols?: number; gap?: number },
  origin: Bounds | { x: number; y: number },
): {
  readonly scene: Scene;
  readonly patch: Patch;
  readonly count: number;
  readonly cols: number;
} | null => {
  const ids = [...selection];
  if (ids.length < 2) return null;
  const cols = Math.max(1, opts.cols ?? Math.ceil(Math.sqrt(ids.length)));
  const gap = opts.gap ?? 16;
  const patch = gridLayout(scene, { shapeIds: ids, origin, cols, gap });
  if (!patch) return null;
  return {
    scene: apply(scene, patch),
    patch,
    count: ids.length,
    cols,
  };
};

/** Stack selected shapes horizontally or vertically. */
export const computeArrangeAsStack = (
  scene: Scene,
  selection: Selection.Selection,
  opts: { direction?: "horizontal" | "vertical"; gap?: number },
  origin: Bounds | { x: number; y: number },
): {
  readonly scene: Scene;
  readonly patch: Patch;
  readonly count: number;
  readonly direction: "horizontal" | "vertical";
} | null => {
  const ids = [...selection];
  if (ids.length < 2) return null;
  const direction = opts.direction ?? "horizontal";
  const gap = opts.gap ?? 16;
  const patch = stackLayout(scene, { shapeIds: ids, origin, direction, gap });
  if (!patch) return null;
  return { scene: apply(scene, patch), patch, count: ids.length, direction };
};

/**
 * Top-level shapes among `selection`. Descendants whose group root is
 * also selected are elided so caller commands operate at the group
 * level instead of double-processing children.
 */
export const selectionRoots = (
  scene: Scene,
  selection: Selection.Selection,
): readonly Element[] => {
  const out: Element[] = [];
  const seen = new Set<ElementId>();
  for (const id of selection) {
    const shape = getElement(scene, id);
    if (!shape) continue;
    let cursor: Element | undefined = shape;
    let hidden = false;
    for (let i = 0; cursor?.parentId && i < 64; i++) {
      if (selection.has(cursor.parentId)) {
        hidden = true;
        break;
      }
      cursor = getElement(scene, cursor.parentId);
    }
    if (hidden) continue;
    if (seen.has(shape.id)) continue;
    seen.add(shape.id);
    out.push(shape);
  }
  return out;
};

/**
 * Every shape that should be translated alongside the current
 * selection: each selected shape plus all descendants (groups carry
 * their children).
 */
export const expandSelectionWithDescendants = (
  scene: Scene,
  selection: Selection.Selection,
): ReadonlySet<ElementId> => {
  const out = new Set<ElementId>();
  const visit = (id: ElementId): void => {
    if (out.has(id)) return;
    const shape = getElement(scene, id);
    if (!shape) return;
    out.add(id);
    for (const child of scene.elements.values()) {
      if (child.parentId === id) visit(child.id);
    }
  };
  for (const id of selection) visit(id);
  return out;
};

/**
 * Wrap the current selection roots into a new group shape. The first
 * root's layer becomes the group's layer; existing parent links on
 * roots are replaced by the new group id.
 *
 * Returns the next scene + every patch and the new group id; `null`
 * when fewer than 2 roots exist.
 */
export const computeGroupSelected = (
  scene: Scene,
  selection: Selection.Selection,
  newGroupId: ElementId,
): {
  readonly scene: Scene;
  readonly patches: Patch[];
  readonly groupId: ElementId;
} | null => {
  const roots = selectionRoots(scene, selection);
  const firstRoot = roots[0];
  if (roots.length < 2 || firstRoot === undefined) return null;
  const layerId = firstRoot.layerId;
  const order = orderForTop(
    [...scene.elements.values()].filter((s) => s.layerId === layerId).map((s) => s.order),
  );
  const groupElement: Element = {
    id: newGroupId,
    layerId,
    type: "group",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order,
    style: {},
  };
  let s = scene;
  const patches: Patch[] = [];
  const addRes = addElement(s, groupElement);
  s = addRes.scene;
  patches.push(addRes.patch);
  for (const child of roots) {
    const r = updateElement(s, child.id, (sh) => ({ ...sh, parentId: newGroupId }));
    s = r.scene;
    patches.push(r.patch);
  }
  return { scene: s, patches, groupId: newGroupId };
};

/**
 * Inverse of `computeGroupSelected`. For every selected group, strip
 * the parent link from each direct child and remove the group shape.
 * Returns the next scene, patches, and the next selection (union of
 * former children). `null` when no groups are selected.
 */
export const computeUngroup = (
  scene: Scene,
  selection: Selection.Selection,
): {
  readonly scene: Scene;
  readonly patches: Patch[];
  readonly nextSelection: ReadonlySet<ElementId>;
} | null => {
  const targets = [...selection]
    .map((id) => getElement(scene, id))
    .filter((s): s is Element => s?.type === "group");
  if (targets.length === 0) return null;
  let s = scene;
  const patches: Patch[] = [];
  const nextSelection = new Set<ElementId>();
  for (const group of targets) {
    const children = [...s.elements.values()].filter((sh) => sh.parentId === group.id);
    for (const child of children) {
      const r = updateElement(s, child.id, (sh) => {
        const next: Element = { ...sh };
        delete (next as { parentId?: ElementId }).parentId;
        return next;
      });
      s = r.scene;
      patches.push(r.patch);
      nextSelection.add(child.id);
    }
    const rm = removeElement(s, group.id);
    s = rm.scene;
    patches.push(rm.patch);
  }
  return { scene: s, patches, nextSelection };
};

/**
 * Pick the next focused shape in z-order (forward or backward through
 * every visible / unlocked layer). Returns the id, or `null` when the
 * scene is empty / all layers hidden.
 */
export const pickFocusCycle = (
  scene: Scene,
  current: ElementId | undefined,
  direction: "next" | "prev",
): { readonly id: ElementId; readonly name: string } | null => {
  const layers = [...scene.layers.values()]
    .filter((l) => l.visible && !l.locked)
    .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  const ordered: ElementId[] = [];
  for (const layer of layers) {
    const inLayer = [...scene.elements.values()]
      .filter((s) => s.layerId === layer.id)
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
    for (const s of inLayer) ordered.push(s.id);
  }
  if (ordered.length === 0) return null;
  let idx = current ? ordered.indexOf(current) : -1;
  if (direction === "next") {
    idx = idx === -1 ? 0 : (idx + 1) % ordered.length;
  } else {
    idx = idx === -1 ? ordered.length - 1 : (idx - 1 + ordered.length) % ordered.length;
  }
  const nextId = ordered[idx];
  if (!nextId) return null;
  const shape = getElement(scene, nextId);
  return { id: nextId, name: shape ? getElementAccessibleName(shape) : nextId };
};

/** Generate a fresh group shape id with the editor's nextId counter. */
export const newGroupElementId = (next: number): ElementId =>
  castElementId(`group-${next}-${Date.now().toString(36)}`);
