import type { LinkId } from "@oh-just-another/types";

/**
 * Set of currently selected link (connector) ids. A parallel set to the
 * element selection, kept separate so the element-selection code is untouched
 * while links become first-class members of the overall selection (Cmd+A,
 * marquee, multi-select, delete).
 *
 * Immutable — operations return new sets. Sets (not arrays) give O(1)
 * membership checks during overlay rendering and hit-testing.
 */
export type LinkSelection = ReadonlySet<LinkId>;

export const EMPTY: LinkSelection = Object.freeze(new Set<LinkId>());

export const single = (id: LinkId): LinkSelection => new Set([id]);

export const has = (sel: LinkSelection, id: LinkId): boolean => sel.has(id);

export const add = (sel: LinkSelection, id: LinkId): LinkSelection => {
  if (sel.has(id)) return sel;
  const next = new Set(sel);
  next.add(id);
  return next;
};

export const remove = (sel: LinkSelection, id: LinkId): LinkSelection => {
  if (!sel.has(id)) return sel;
  const next = new Set(sel);
  next.delete(id);
  return next;
};

export const toggle = (sel: LinkSelection, id: LinkId): LinkSelection =>
  sel.has(id) ? remove(sel, id) : add(sel, id);

export const equals = (a: LinkSelection, b: LinkSelection): boolean => {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
};

/** The sole selected link, or null unless exactly one is selected. */
export const sole = (sel: LinkSelection): LinkId | null => {
  if (sel.size !== 1) return null;
  for (const id of sel) return id;
  return null;
};
