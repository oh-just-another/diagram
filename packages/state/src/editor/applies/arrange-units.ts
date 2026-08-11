import { bounds as B } from "@oh-just-another/math";
import {
  getDescendantsOf,
  getElement,
  getElementWorldBounds,
  isGroup,
  type Element,
  type Patch,
  type Scene,
} from "@oh-just-another/scene";
import type { Bounds, ElementId } from "@oh-just-another/types";

/**
 * One "thing" a multi-element command arranges: a selection root plus
 * everything it carries. A plain shape is a unit of itself; a selected
 * group is ONE unit — its whole subtree moves together and its footprint
 * is the union of the descendants (the group shell has no geometry).
 * Descendants whose ancestor is also selected are folded into that unit
 * instead of being arranged twice.
 */
export interface ArrangeUnit {
  readonly root: Element;
  /** The root and its descendants (group shells included, so they move too). */
  readonly members: readonly Element[];
  /** World AABB of the unit's visible members. */
  readonly bounds: Bounds;
}

/** Selection roots: selected elements with no selected ancestor. */
const roots = (scene: Scene, selection: ReadonlySet<ElementId>): Element[] => {
  const out: Element[] = [];
  for (const id of selection) {
    const shape = getElement(scene, id);
    if (!shape) continue;
    let cursor: Element | undefined = shape;
    let covered = false;
    for (let i = 0; cursor?.parentId && i < 64; i++) {
      if (selection.has(cursor.parentId)) {
        covered = true;
        break;
      }
      cursor = getElement(scene, cursor.parentId);
    }
    if (!covered) out.push(shape);
  }
  return out;
};

/** Build the arrange units of `selection` (units without geometry are dropped). */
export const arrangeUnits = (scene: Scene, selection: Iterable<ElementId>): ArrangeUnit[] => {
  const ids = selection instanceof Set ? selection : new Set(selection);
  const units: ArrangeUnit[] = [];
  for (const root of roots(scene, ids)) {
    // `getDescendantsOf` returns the root itself plus its subtree.
    const members = isGroup(root) ? getDescendantsOf(scene, root.id) : [root];
    let bounds: Bounds | null = null;
    for (const m of members) {
      if (isGroup(m)) continue;
      const b = getElementWorldBounds(m);
      bounds = bounds ? B.union(bounds, b) : b;
    }
    if (bounds) units.push({ root, members, bounds });
  }
  return units;
};

/** Translate every member of `unit` by `(dx, dy)` — one patch per member. */
export const translateUnit = (unit: ArrangeUnit, dx: number, dy: number): Patch[] => {
  if (dx === 0 && dy === 0) return [];
  return unit.members.map((el) => ({
    kind: "element",
    id: el.id,
    before: el,
    after: { ...el, position: { x: el.position.x + dx, y: el.position.y + dy } },
  }));
};

/** World AABB enclosing every unit (assumes `units` is non-empty). */
export const unitsBounds = (units: readonly ArrangeUnit[]): Bounds =>
  units.map((u) => u.bounds).reduce((acc, b) => B.union(acc, b));
