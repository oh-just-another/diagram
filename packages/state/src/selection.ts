import type { ElementId } from "@oh-just-another/types";

/**
 * Set of currently selected shape ids. Immutable — operations return new sets.
 *
 * Sets are used (not arrays) so membership checks are O(1) during overlay
 * rendering and hit-testing.
 */
export type Selection = ReadonlySet<ElementId>;

export const EMPTY: Selection = Object.freeze(new Set<ElementId>());

export const single = (id: ElementId): Selection => new Set([id]);

export const has = (sel: Selection, id: ElementId): boolean => sel.has(id);

export const add = (sel: Selection, id: ElementId): Selection => {
  if (sel.has(id)) return sel;
  const next = new Set(sel);
  next.add(id);
  return next;
};

export const remove = (sel: Selection, id: ElementId): Selection => {
  if (!sel.has(id)) return sel;
  const next = new Set(sel);
  next.delete(id);
  return next;
};

export const toggle = (sel: Selection, id: ElementId): Selection =>
  sel.has(id) ? remove(sel, id) : add(sel, id);

export const replace = (id: ElementId): Selection => single(id);

export const clear = (): Selection => EMPTY;

export const equals = (a: Selection, b: Selection): boolean => {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
};
